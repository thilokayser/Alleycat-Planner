<?php
/* Alleycat Dispatch — Storage-API
   ------------------------------------------------------------------
   Schlanker Key-Value-Endpunkt über der von install.php/migrations.php
   angelegten Tabelle. Spiegelt genau die drei Operationen, die die App
   über storageGet/storageSet/storageDelete schon kennt:

     GET    api.php?key=xyz     -> {"value": "..."} oder 404
     POST   api.php?key=xyz     (Body = Rohwert)     -> {"ok": true}
     DELETE api.php?key=xyz                          -> {"ok": true}

   Auth: Header "X-Api-Key: <key aus config.php>" auf jeder Anfrage,
   siehe bootstrap.php für die eigentliche Prüfung (dort auch die
   Produktions-Fehlerbehandlung: nie eine rohe Exception-Message im
   Response-Body, immer nur ins Server-Error-Log).
   ------------------------------------------------------------------ */

require __DIR__ . '/bootstrap.php';

apiLoadConfig();
apiSendCorsHeaders();

if($_SERVER['REQUEST_METHOD'] === 'OPTIONS'){
  http_response_code(204);
  exit;
}

header('Content-Type: application/json');

$key = $_GET['key'] ?? '';
$action = $_GET['a'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$pdo = apiConnectDb();
$table = ALLEYCAT_TABLE;
$eventTable = adminTableName('event');

/* Dashboard-Liste: ersetzt das alte events:index-Muster für die
   Servervariante — die event-Tabelle ist direkt abfragbar. */
if($action === 'events' && $method === 'GET'){
  $access = apiVerifyAccess($pdo, 'viewer');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $stmt = $pdo->prepare("SELECT `id`,`slug`,`status`,`start_date`,`payload` FROM `{$eventTable}` WHERE `org_id` = ? ORDER BY `updated_at` DESC");
  $stmt->execute([$access['orgId']]);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
  $events = array_map(function($r){
    $payload = json_decode($r['payload'], true) ?: [];
    return ['id' => $r['id'], 'name' => $payload['name'] ?? '', 'date' => $payload['date'] ?? $r['start_date']];
  }, $rows);
  echo json_encode(['ok' => true, 'events' => $events]);
  exit;
}

if($key === '' || strlen($key) > 191){
  apiSendJsonError(400, 'invalid_key');
}

$isEventKey = (strpos($key, 'event:') === 0);
$eventId = $isEventKey ? substr($key, strlen('event:')) : null;

/* GET braucht nur 'viewer', POST/DELETE mindestens 'editor'. Bei
   Event-Keys zählt zusätzlich eine org_event_admin-Delegation für
   genau dieses Event (siehe apiVerifyAccess()). */
$access = apiVerifyAccess($pdo, $method === 'GET' ? 'viewer' : 'editor', $eventId);
if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
$orgId = $access['orgId'];

if($isEventKey){
  if($method === 'GET'){
    $stmt = $pdo->prepare("SELECT `payload` FROM `{$eventTable}` WHERE `org_id` = ? AND `id` = ?");
    $stmt->execute([$orgId, $eventId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if(!$row){ http_response_code(404); echo json_encode(['error' => 'not_found']); exit; }
    echo json_encode(['value' => $row['payload']]);
  } elseif($method === 'POST'){
    $value = file_get_contents('php://input');
    $decoded = json_decode($value, true) ?: [];
    $slug = (string)($decoded['id'] ?? $eventId);
    $status = (string)($decoded['status'] ?? 'planning');
    $startDate = !empty($decoded['date']) ? substr((string)$decoded['date'], 0, 10) : null;
    $pdo->prepare("INSERT INTO `{$eventTable}` (`id`,`org_id`,`slug`,`status`,`start_date`,`payload`)
                   VALUES (?,?,?,?,?,?)
                   ON DUPLICATE KEY UPDATE `status` = VALUES(`status`), `start_date` = VALUES(`start_date`), `payload` = VALUES(`payload`)")
        ->execute([$eventId, $orgId, $slug, $status, $startDate, $value]);
    echo json_encode(['ok' => true]);
  } elseif($method === 'DELETE'){
    $pdo->prepare("DELETE FROM `{$eventTable}` WHERE `org_id` = ? AND `id` = ?")->execute([$orgId, $eventId]);
    echo json_encode(['ok' => true]);
  } else {
    http_response_code(405); echo json_encode(['error' => 'method_not_allowed']);
  }
  exit;
}

/* Nicht-Event-Keys: weiterhin generischer KV-Store, jetzt org-gescoped.
   Instanzweite Keys (config:riderAppUrl, i18n:customPacks) liegen mit
   org_id=0 (der reservierte Sentinel-Wert, siehe Migration 7 — die
   Spalte ist NOT NULL, es gibt kein echtes NULL mehr) und werden hier
   bewusst NICHT über den Org-Filter erreicht -> eigener Zweig. */
$instanceWideKeys = ['config:riderAppUrl', 'i18n:customPacks'];
$isInstanceWide = in_array($key, $instanceWideKeys, true);

if($method === 'GET'){
  $stmt = $isInstanceWide
    ? $pdo->prepare("SELECT `value` FROM `{$table}` WHERE `key` = ? AND `org_id` = 0")
    : $pdo->prepare("SELECT `value` FROM `{$table}` WHERE `key` = ? AND `org_id` = ?");
  $isInstanceWide ? $stmt->execute([$key]) : $stmt->execute([$key, $orgId]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if(!$row){ http_response_code(404); echo json_encode(['error' => 'not_found']); exit; }
  echo json_encode(['value' => $row['value']]);

} elseif($method === 'POST'){
  $value = file_get_contents('php://input');
  if($isInstanceWide){
    $pdo->prepare("INSERT INTO `{$table}` (`key`,`org_id`,`value`) VALUES (?,0,?)
      ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")->execute([$key, $value]);
  } else {
    $pdo->prepare("INSERT INTO `{$table}` (`key`,`org_id`,`value`) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")->execute([$key, $orgId, $value]);
  }
  echo json_encode(['ok' => true]);

} elseif($method === 'DELETE'){
  $stmt = $isInstanceWide
    ? $pdo->prepare("DELETE FROM `{$table}` WHERE `key` = ? AND `org_id` = 0")
    : $pdo->prepare("DELETE FROM `{$table}` WHERE `key` = ? AND `org_id` = ?");
  $isInstanceWide ? $stmt->execute([$key]) : $stmt->execute([$key, $orgId]);
  echo json_encode(['ok' => true]);

} else {
  http_response_code(405);
  echo json_encode(['error' => 'method_not_allowed']);
}
