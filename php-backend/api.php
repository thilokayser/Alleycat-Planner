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
if($key === '' || strlen($key) > 191){
  apiSendJsonError(400, 'invalid_key');
}

$pdo = apiConnectDb();
$table = ALLEYCAT_TABLE;
$method = $_SERVER['REQUEST_METHOD'];

/* GET braucht nur 'viewer', POST/DELETE mindestens 'editor' —
   apiVerifyAccess() bricht selbst mit 401/403 ab, wenn nicht genug. */
apiVerifyAccess($pdo, $method === 'GET' ? 'viewer' : 'editor');

if($method === 'GET'){
  $stmt = $pdo->prepare("SELECT `value` FROM `{$table}` WHERE `key` = ?");
  $stmt->execute([$key]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if(!$row){
    http_response_code(404);
    echo json_encode(['error' => 'not_found']);
    exit;
  }
  echo json_encode(['value' => $row['value']]);

} elseif($method === 'POST'){
  $value = file_get_contents('php://input');
  $stmt = $pdo->prepare("INSERT INTO `{$table}` (`key`, `value`) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
  $stmt->execute([$key, $value]);
  echo json_encode(['ok' => true]);

} elseif($method === 'DELETE'){
  $stmt = $pdo->prepare("DELETE FROM `{$table}` WHERE `key` = ?");
  $stmt->execute([$key]);
  echo json_encode(['ok' => true]);

} else {
  http_response_code(405);
  echo json_encode(['error' => 'method_not_allowed']);
}
