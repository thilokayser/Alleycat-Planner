<?php
/* Alleycat Dispatch — Rider-API
   ------------------------------------------------------------------
   Zweiter Endpunkt neben api.php, mit einem grundlegend anderen
   Zugriffsmodell: api.php ist ein Key-Value-Store hinter dem
   Admin-Key, der Vollzugriff auf alles gibt. Diese Datei ist
   öffentlich erreichbar, weil Fahrer-Handys sie aufrufen — und
   Fahrer dürfen den Admin-Key niemals besitzen.

   Daraus folgen drei Regeln, die dieses Modul durchhält:

   1. Fahrer-Aktionen authentifizieren gegen Token (Spokecard bzw.
      Checkpoint-Aufsteller), nie gegen den Admin-Key.
   2. Keine Fahrer-Antwort enthält Namen, Notfallkontakte,
      Rätsellösungen oder Personalplanung. Was Fahrer sehen dürfen,
      wurde vom Organizer per ?a=sync ausdrücklich veröffentlicht.
   3. Jede fehlgeschlagene Authentifizierung wird gezählt und
      irgendwann gebremst (siehe riderRecordFailure in bootstrap.php).

   Aktionen:
     Admin-Key (Organizer, Beamer)
       POST ?a=sync        Konfiguration veröffentlichen
       GET  ?a=log         Log-Zeilen ab Cursor
       POST ?a=slotstatus  Anmeldung bestätigen oder zurücksetzen
     Token (Fahrer-Handy)
       GET  ?a=me          eigene Sicht: Event, Checkpoints, Fortschritt
                           Token per Header X-Rider-Token bzw.
                           X-Rider-Code — NICHT in der Query, sonst
                           stünde es im Zugriffsprotokoll des Servers
       GET  ?a=freebibs    freie Startnummern (nur bei Selbstregistrierung)
       POST ?a=checkin     Check-in eintragen
       POST ?a=register    Wildcard-Slot belegen
     Kein Token (Online-Vorab-Registrierung, nur bei Selbstregistrierung)
       POST ?a=claim       Freie Startnummer ohne bekannten Token belegen
   ------------------------------------------------------------------ */

require __DIR__ . '/bootstrap.php';

apiLoadConfig();
apiSendCorsHeaders();

if($_SERVER['REQUEST_METHOD'] === 'OPTIONS'){
  http_response_code(204);
  exit;
}

header('Content-Type: application/json');

function riderJsonBody(){
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if(!is_array($data)) apiSendJsonError(400, 'invalid_body');
  return $data;
}
function riderOut($data){
  echo json_encode($data);
  exit;
}
function riderRequirePost(){
  if($_SERVER['REQUEST_METHOD'] !== 'POST') apiSendJsonError(405, 'method_not_allowed');
}
function riderRequireGet(){
  if($_SERVER['REQUEST_METHOD'] !== 'GET') apiSendJsonError(405, 'method_not_allowed');
}
function riderLoadEvent(PDO $pdo, $publicId){
  $t = riderTableName('event');
  $stmt = $pdo->prepare("SELECT * FROM `{$t}` WHERE `public_id` = ?");
  $stmt->execute([$publicId]);
  return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

$action = $_GET['a'] ?? '';
$pdo = apiConnectDb();

/* ================= Admin-Aktionen ================= */

if($action === 'sync'){
  riderRequirePost();
  apiVerifyKey();
  $body = riderJsonBody();

  $publicId = (string)($body['publicId'] ?? '');
  if(!preg_match('/^[a-z0-9]{12}$/', $publicId)) apiSendJsonError(400, 'invalid_public_id');

  $evtT  = riderTableName('event');
  $slotT = riderTableName('slot');
  $cpT   = riderTableName('checkpoint');

  $pdo->beginTransaction();
  try {
    $pdo->prepare("INSERT INTO `{$evtT}` (`public_id`,`storage_key`,`name`,`status`,`settings`)
                   VALUES (?,?,?,?,?)
                   ON DUPLICATE KEY UPDATE `storage_key`=VALUES(`storage_key`),
                                           `name`=VALUES(`name`),
                                           `status`=VALUES(`status`),
                                           `settings`=VALUES(`settings`)")
        ->execute([
          $publicId,
          (string)($body['storageKey'] ?? ''),
          (string)($body['name'] ?? ''),
          (string)($body['status'] ?? 'planning'),
          json_encode($body['settings'] ?? new stdClass())
        ]);

    /* Slots: Upsert, aber `status` NICHT blind überschreiben. Ein Slot,
       der seit dem letzten Publish auf 'pending' gewandert ist (der
       Fahrer hat gerade sein Formular abgeschickt), würde sonst
       stillschweigend auf 'free' zurückfallen und die Anmeldung wäre
       weg. Der Organizer erfährt von 'pending' erst über ?a=log —
       bis dahin ist die Datenbank die Wahrheit für diese Spalte. */
    $keptBibs = [];
    $slotStmt = $pdo->prepare("INSERT INTO `{$slotT}` (`public_id`,`bib`,`token_hash`,`code_hash`,`status`)
                               VALUES (?,?,?,?,?)
                               ON DUPLICATE KEY UPDATE `token_hash`=VALUES(`token_hash`),
                                                       `code_hash`=VALUES(`code_hash`),
                                                       `status`=IF(`status`='pending','pending',VALUES(`status`))");
    foreach(($body['slots'] ?? []) as $slot){
      $bib = (int)($slot['bib'] ?? 0);
      if($bib <= 0) continue;
      $keptBibs[] = $bib;
      $slotStmt->execute([
        $publicId, $bib,
        (string)($slot['tokenHash'] ?? ''),
        (string)($slot['codeHash'] ?? ''),
        (string)($slot['status'] ?? 'free')
      ]);
    }

    /* Entfernte Slots und Checkpoints werden gelöscht — außer es hängen
       Log-Zeilen daran. Ein Fahrer, der nachweislich an einem Punkt war,
       darf nicht durch eine Konfigurationsänderung spurlos verschwinden;
       der Organizer sieht solche Zeilen stattdessen als verwaist. */
    $keepList = $keptBibs ? implode(',', array_map('intval', $keptBibs)) : '-1';
    $pdo->prepare("DELETE FROM `{$slotT}`
                   WHERE `public_id` = ?
                     AND `bib` NOT IN ({$keepList})
                     AND `bib` NOT IN (SELECT `bib` FROM `" . riderTableName('log') . "` WHERE `public_id` = ?)")
        ->execute([$publicId, $publicId]);

    $keptCps = [];
    $cpStmt = $pdo->prepare("INSERT INTO `{$cpT}` (`public_id`,`cp_id`,`label`,`cp_type`,`qr_token_hash`,`qr_enabled`,`sort_index`,`lat`,`lon`)
                             VALUES (?,?,?,?,?,?,?,?,?)
                             ON DUPLICATE KEY UPDATE `label`=VALUES(`label`),
                                                     `cp_type`=VALUES(`cp_type`),
                                                     `qr_token_hash`=VALUES(`qr_token_hash`),
                                                     `qr_enabled`=VALUES(`qr_enabled`),
                                                     `sort_index`=VALUES(`sort_index`),
                                                     `lat`=VALUES(`lat`),
                                                     `lon`=VALUES(`lon`)");
    foreach(($body['checkpoints'] ?? []) as $cp){
      $cpId = (string)($cp['cpId'] ?? '');
      if($cpId === '') continue;
      $keptCps[] = $cpId;
      $cpStmt->execute([
        $publicId, $cpId,
        (string)($cp['label'] ?? ''),
        (string)($cp['cpType'] ?? ''),
        (string)($cp['qrTokenHash'] ?? ''),
        !empty($cp['qrEnabled']) ? 1 : 0,
        (int)($cp['sortIndex'] ?? 0),
        isset($cp['lat']) && $cp['lat'] !== null ? (float)$cp['lat'] : null,
        isset($cp['lon']) && $cp['lon'] !== null ? (float)$cp['lon'] : null
      ]);
    }

    if($keptCps){
      $ph = implode(',', array_fill(0, count($keptCps), '?'));
      $pdo->prepare("DELETE FROM `{$cpT}` WHERE `public_id` = ? AND `cp_id` NOT IN ({$ph})")
          ->execute(array_merge([$publicId], $keptCps));
    } else {
      $pdo->prepare("DELETE FROM `{$cpT}` WHERE `public_id` = ?")->execute([$publicId]);
    }

    $pdo->commit();
  } catch (Exception $e) {
    $pdo->rollBack();
    apiSendJsonError(500, 'sync_failed', $e->getMessage());
  }

  riderOut(['ok' => true, 'slots' => count($keptBibs), 'checkpoints' => count($keptCps)]);
}

if($action === 'log'){
  riderRequireGet();
  apiVerifyKey();
  $publicId = (string)($_GET['public_id'] ?? '');
  $since = max(0, (int)($_GET['since'] ?? 0));
  $limit = (int)($_GET['limit'] ?? 200);
  $limit = max(1, min(500, $limit));

  $t = riderTableName('log');
  /* limit+1 abfragen, um `more` zu bestimmen, ohne zweite Zählabfrage. */
  $stmt = $pdo->prepare("SELECT * FROM `{$t}` WHERE `public_id` = ? AND `id` > ? ORDER BY `id` ASC LIMIT " . ($limit + 1));
  $stmt->execute([$publicId, $since]);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

  $more = count($rows) > $limit;
  if($more) array_pop($rows);

  $rows = array_map(function($r){
    $r['id'] = (int)$r['id'];
    $r['bib'] = (int)$r['bib'];
    $r['gps_distance_m'] = $r['gps_distance_m'] === null ? null : (int)$r['gps_distance_m'];
    return $r;
  }, $rows);

  riderOut([
    'rows' => $rows,
    'lastId' => $rows ? $rows[count($rows) - 1]['id'] : $since,
    'more' => $more
  ]);
}

if($action === 'slotstatus'){
  riderRequirePost();
  apiVerifyKey();
  $body = riderJsonBody();
  $publicId = (string)($body['publicId'] ?? '');
  $bib = (int)($body['bib'] ?? 0);
  $status = (string)($body['status'] ?? '');
  if(!in_array($status, ['free', 'pending', 'confirmed'], true)) apiSendJsonError(400, 'invalid_status');

  $pdo->prepare("UPDATE `" . riderTableName('slot') . "` SET `status` = ? WHERE `public_id` = ? AND `bib` = ?")
      ->execute([$status, $publicId, $bib]);
  riderOut(['ok' => true]);
}

/* ================= Fahrer-Aktionen ================= */

riderCheckRateLimit($pdo);

if($action === 'me'){
  riderRequireGet();
  $publicId = (string)($_GET['public_id'] ?? '');
  /* Token und Code kommen aus HEADERN, nicht aus der Query. Alles, was
     in der URL steht, landet im Zugriffsprotokoll des Webservers — im
     Klartext und dauerhaft, lesbar für jeden mit Zugang zu den Logs
     (beim Shared Hosting also auch für den Anbieter). Ein Token ist eine
     vollständige Zugangsberechtigung und hat da nichts zu suchen.
     `checkin` und `register` senden es ohnehin im POST-Body, der nicht
     protokolliert wird; `me` war die letzte Stelle mit diesem Problem.

     Bewusst KEIN Rückfall auf die Query: den zu behalten hieße, die
     Lücke offen zu lassen. Die Fahrer-App und der Endpunkt gehören
     ohnehin zusammen und werden gemeinsam ausgerollt. */
  $token = (string)($_SERVER['HTTP_X_RIDER_TOKEN'] ?? '');
  $code = (string)($_SERVER['HTTP_X_RIDER_CODE'] ?? '');

  $evt = riderLoadEvent($pdo, $publicId);
  if(!$evt) riderRejectAuth($pdo, 'unknown_event');

  $slot = $token !== '' ? riderResolveSlot($pdo, $publicId, $token) : null;
  if(!$slot && $code !== '') $slot = riderResolveSlotByCode($pdo, $publicId, $code);
  if(!$slot) riderRejectAuth($pdo, 'invalid_rider');

  riderClearFailures($pdo);

  $settings = json_decode($evt['settings'], true) ?: [];

  $cpStmt = $pdo->prepare("SELECT `cp_id`,`label`,`cp_type`,`qr_enabled`,`sort_index`,`lat`,`lon`
                           FROM `" . riderTableName('checkpoint') . "`
                           WHERE `public_id` = ? ORDER BY `sort_index` ASC");
  $cpStmt->execute([$publicId]);
  $checkpoints = array_map(function($c){
    return [
      'cpId' => $c['cp_id'],
      'label' => $c['label'],
      'cpType' => $c['cp_type'],
      'qrEnabled' => (bool)(int)$c['qr_enabled'],
      'lat' => $c['lat'] === null ? null : (float)$c['lat'],
      'lon' => $c['lon'] === null ? null : (float)$c['lon']
    ];
  }, $cpStmt->fetchAll(PDO::FETCH_ASSOC));

  /* Eigener Fortschritt, ausschließlich der eigene: die Abfrage ist auf
     die eigene bib eingegrenzt, es gibt hier keine Sicht auf andere
     Fahrer. */
  $progress = [];
  if(!empty($settings['progress'])){
    $pStmt = $pdo->prepare("SELECT `cp_id`,`created_at` FROM `" . riderTableName('log') . "`
                            WHERE `public_id` = ? AND `bib` = ? AND `type` = 'checkin' AND `cp_id` IS NOT NULL");
    $pStmt->execute([$publicId, (int)$slot['bib']]);
    foreach($pStmt->fetchAll(PDO::FETCH_ASSOC) as $row){
      $progress[$row['cp_id']] = $row['created_at'];
    }
  }

  riderOut([
    'ok' => true,
    'event' => ['name' => $evt['name'], 'status' => $evt['status']],
    'settings' => $settings,
    'bib' => (int)$slot['bib'],
    'slotStatus' => $slot['status'],
    'checkpoints' => $checkpoints,
    'progress' => $progress
  ]);
}

if($action === 'freebibs'){
  riderRequireGet();
  $publicId = (string)($_GET['public_id'] ?? '');
  $evt = riderLoadEvent($pdo, $publicId);
  if(!$evt) riderRejectAuth($pdo, 'unknown_event');

  /* Ohne freigeschaltete Selbstregistrierung gibt es hier nichts zu
     holen — sonst wäre die Startnummernbelegung jedes Events offen
     abfragbar, auch wo das gar nicht vorgesehen ist. */
  $settings = json_decode($evt['settings'], true) ?: [];
  if(empty($settings['selfRegister'])) apiSendJsonError(403, 'self_register_disabled');

  $stmt = $pdo->prepare("SELECT `bib`,`status` FROM `" . riderTableName('slot') . "`
                         WHERE `public_id` = ? ORDER BY `bib` ASC");
  $stmt->execute([$publicId]);
  $free = [];
  foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row){
    if($row['status'] === 'free') $free[] = (int)$row['bib'];
  }
  /* Nur Nummern, keine Namen — auch nicht für belegte Slots. */
  riderOut(['ok' => true, 'free' => $free]);
}

if($action === 'claim'){
  riderRequirePost();
  $body = riderJsonBody();
  $publicId = (string)($body['publicId'] ?? '');
  $bib = (int)($body['bib'] ?? 0);
  $clientUuid = (string)($body['clientUuid'] ?? '');
  if($clientUuid === '') apiSendJsonError(400, 'missing_client_uuid');
  if($bib <= 0) apiSendJsonError(400, 'invalid_bib');

  $evt = riderLoadEvent($pdo, $publicId);
  if(!$evt) riderRejectAuth($pdo, 'unknown_event');

  /* Gleiche Schranke wie ?a=freebibs — ohne freigeschaltete
     Selbstregistrierung darf niemand ohne bekannten Token einen Slot
     belegen können, sonst wäre der Wildcard-Weg aus ?a=register für
     jedes Event offen, auch wo das nicht vorgesehen ist. */
  $settings = json_decode($evt['settings'], true) ?: [];
  if(empty($settings['selfRegister'])) apiSendJsonError(403, 'self_register_disabled');

  /* Anders als bei ?a=register/?a=checkin gibt es hier keinen Token zu
     prüfen — das ist der ganze Zweck dieser Aktion. Ein unbekanntes
     Event zählt oben trotzdem als Fehlschlag (riderRejectAuth), ein
     unbekannter/fremder Bib einfach als 404 ohne Zählung: das ist kein
     Authentifizierungsversuch, sondern ein normaler Nutzerfehler (z. B.
     zwei offene Tabs mit veralteter Freiplatz-Liste). */
  $slotStmt = $pdo->prepare("SELECT `bib` FROM `" . riderTableName('slot') . "`
                             WHERE `public_id` = ? AND `bib` = ?");
  $slotStmt->execute([$publicId, $bib]);
  if(!$slotStmt->fetch(PDO::FETCH_ASSOC)) apiSendJsonError(404, 'bib_not_found');

  /* Ein frischer Token, denn den ursprünglich beim Anlegen des Slots
     generierten Klartext-Token kennt der Server nie — nur seinen Hash
     (riderHashToken-Kommentar oben). 16 Byte roh = 32 Hex-Zeichen,
     Teilmenge von RIDER_TOKEN_RE ([a-z0-9]{32}) im Client, also mit dem
     bestehenden Fragment-/Validierungsformat kompatibel. */
  $newToken = bin2hex(random_bytes(16));
  $tokenHash = riderHashToken($newToken);

  /* Atomar wie bei ?a=register: die Bedingung `status='free'` gehört in
     die WHERE-Klausel, nicht in eine vorherige Prüfung, sonst könnten
     zwei gleichzeitige Anmeldungen denselben Slot doppelt belegen. */
  $upd = $pdo->prepare("UPDATE `" . riderTableName('slot') . "`
                        SET `status`='pending', `token_hash`=?
                        WHERE `public_id` = ? AND `bib` = ? AND `status`='free'");
  $upd->execute([$tokenHash, $publicId, $bib]);
  if($upd->rowCount() !== 1) apiSendJsonError(409, 'slot_taken');

  /* riderToken reist im Log-Payload mit, obwohl das Fahrer-Log sonst nie
     Geheimnisse transportiert — hier gibt es keine Alternative: der
     Organizer-Client kennt den neuen Token noch nicht (er hat ihn nicht
     erzeugt) und würde ihn beim nächsten ?a=sync sonst mit dem alten,
     jetzt ungültigen Token überschreiben. mergeRiderLogRows() auf der
     Organizer-Seite übernimmt ihn aus genau diesem Feld in
     rider.riderToken, bevor der nächste Publish-Zyklus läuft. Dieses
     Log ist ausschließlich per Admin-Key abrufbar (?a=log), nie von
     einem Fahrer-Gerät. */
  $payload = json_encode([
    'name' => (string)($body['name'] ?? ''),
    'contact' => (string)($body['contact'] ?? ''),
    'emergencyContact' => '',
    'categories' => new stdClass(),
    'riderToken' => $newToken
  ]);

  try {
    $pdo->prepare("INSERT INTO `" . riderTableName('log') . "`
                   (`public_id`,`type`,`bib`,`cp_id`,`client_uuid`,`payload`,`created_at`)
                   VALUES (?,'register',?,NULL,?,?,?)")
        ->execute([$publicId, $bib, $clientUuid, $payload, date('Y-m-d H:i:s')]);
  } catch (PDOException $e) {
    if($e->getCode() !== '23000') throw $e;
    /* uq_client — gleiche Absicherung wie in ?a=register (dort
       unkommentiert): fängt einen Absturz zwischen UPDATE und INSERT ab,
       ohne den Client mit einem 500 hängen zu lassen. Die UPDATE oben ist
       zu diesem Zeitpunkt bereits erfolgreich gelaufen (sonst wäre schon
       die 409-Zeile davor gegriffen), $newToken ist also so oder so der
       gültige — die Antwort unten stimmt in jedem Fall. */
  }

  riderOut(['ok' => true, 'bib' => $bib, 'riderToken' => $newToken]);
}

if($action === 'checkin'){
  riderRequirePost();
  $body = riderJsonBody();
  $publicId = (string)($body['publicId'] ?? '');
  $clientUuid = (string)($body['clientUuid'] ?? '');
  if($clientUuid === '') apiSendJsonError(400, 'missing_client_uuid');

  $evt = riderLoadEvent($pdo, $publicId);
  if(!$evt) riderRejectAuth($pdo, 'unknown_event');

  /* Reihenfolge der Prüfungen ist bewusst: erst wer, dann ob
     startberechtigt, dann wo, dann ob dort Selbst-Check-in erlaubt ist,
     zuletzt ob das Rennen überhaupt läuft. */
  $slot = riderResolveSlot($pdo, $publicId, (string)($body['riderToken'] ?? ''));
  if(!$slot) riderRejectAuth($pdo, 'invalid_rider');
  if($slot['status'] !== 'confirmed') riderRejectAuth($pdo, 'slot_not_confirmed');

  $cpStmt = $pdo->prepare("SELECT * FROM `" . riderTableName('checkpoint') . "`
                           WHERE `public_id` = ? AND `qr_token_hash` = ?");
  $cpStmt->execute([$publicId, riderHashToken((string)($body['qrToken'] ?? ''))]);
  $cp = $cpStmt->fetch(PDO::FETCH_ASSOC);
  if(!$cp) riderRejectAuth($pdo, 'invalid_checkpoint');
  if((string)$cp['cp_id'] !== (string)($body['cpId'] ?? '')) riderRejectAuth($pdo, 'invalid_checkpoint');
  if(!(int)$cp['qr_enabled']) riderRejectAuth($pdo, 'qr_checkin_disabled');

  riderClearFailures($pdo);

  if($evt['status'] !== 'running'){
    apiSendJsonError(409, 'race_not_running');
  }

  /* Scan-Zeitpunkt vom Gerät, wenn plausibel. Ein Check-in aus der
     Offline-Queue kann Stunden nach dem Scan hochgeladen werden — für
     die Wertung zählt der Scan, nicht der Upload. Unplausible Werte
     (Zukunft, älter als 24h, kaputtes Format) fallen auf die Serverzeit
     zurück, statt die Wertung zu verfälschen. */
  $now = time();
  $scannedAt = strtotime((string)($body['scannedAt'] ?? ''));
  $createdAt = ($scannedAt && $scannedAt <= $now + 120 && $scannedAt > $now - 86400)
    ? date('Y-m-d H:i:s', $scannedAt)
    : date('Y-m-d H:i:s', $now);

  $lat = isset($body['lat']) && $body['lat'] !== null ? (float)$body['lat'] : null;
  $lon = isset($body['lon']) && $body['lon'] !== null ? (float)$body['lon'] : null;
  $distance = null;
  if($lat !== null && $lon !== null && $cp['lat'] !== null && $cp['lon'] !== null){
    $distance = riderDistanceMeters($lat, $lon, (float)$cp['lat'], (float)$cp['lon']);
  }

  $t = riderTableName('log');
  try {
    $pdo->prepare("INSERT INTO `{$t}` (`public_id`,`type`,`bib`,`cp_id`,`client_uuid`,`gps_lat`,`gps_lon`,`gps_distance_m`,`created_at`)
                   VALUES (?,'checkin',?,?,?,?,?,?,?)")
        ->execute([$publicId, (int)$slot['bib'], $cp['cp_id'], $clientUuid, $lat, $lon, $distance, $createdAt]);
  } catch (PDOException $e) {
    if($e->getCode() !== '23000') throw $e;
    /* Beide Duplikatfälle antworten mit 200, nicht 4xx: die
       Offline-Queue muss den Eintrag als erledigt streichen können.
       Ein Fehlercode führte zu endlosen Wiederholungen. */
    $dupStmt = $pdo->prepare("SELECT `created_at`,`client_uuid` FROM `{$t}`
                              WHERE `public_id` = ? AND `bib` = ? AND `cp_id` = ?");
    $dupStmt->execute([$publicId, (int)$slot['bib'], $cp['cp_id']]);
    $existing = $dupStmt->fetch(PDO::FETCH_ASSOC);
    riderOut([
      'ok' => true,
      'duplicate' => $existing && $existing['client_uuid'] === $clientUuid,
      'already' => $existing ? $existing['created_at'] : null,
      'label' => $cp['label']
    ]);
  }

  riderOut(['ok' => true, 'label' => $cp['label'], 'at' => $createdAt]);
}

if($action === 'register'){
  riderRequirePost();
  $body = riderJsonBody();
  $publicId = (string)($body['publicId'] ?? '');
  $clientUuid = (string)($body['clientUuid'] ?? '');
  if($clientUuid === '') apiSendJsonError(400, 'missing_client_uuid');

  $evt = riderLoadEvent($pdo, $publicId);
  if(!$evt) riderRejectAuth($pdo, 'unknown_event');

  $slot = riderResolveSlot($pdo, $publicId, (string)($body['riderToken'] ?? ''));
  if(!$slot) riderRejectAuth($pdo, 'invalid_rider');
  riderClearFailures($pdo);

  if($slot['status'] !== 'free') apiSendJsonError(409, 'slot_taken');

  /* Die Bedingung `status='free'` gehört in die WHERE-Klausel, nicht in
     eine vorherige Prüfung: nur so ist das Belegen atomar. Wählen zwei
     Fahrer gleichzeitig dieselbe Startnummer, ändert genau ein UPDATE
     eine Zeile, das andere ändert null und bekommt 409. */
  $upd = $pdo->prepare("UPDATE `" . riderTableName('slot') . "`
                        SET `status`='pending'
                        WHERE `public_id` = ? AND `bib` = ? AND `status`='free'");
  $upd->execute([$publicId, (int)$slot['bib']]);
  if($upd->rowCount() !== 1) apiSendJsonError(409, 'slot_taken');

  $payload = json_encode([
    'name' => (string)($body['name'] ?? ''),
    'contact' => (string)($body['contact'] ?? ''),
    'emergencyContact' => (string)($body['emergencyContact'] ?? ''),
    'categories' => $body['categories'] ?? new stdClass()
  ]);

  try {
    $pdo->prepare("INSERT INTO `" . riderTableName('log') . "`
                   (`public_id`,`type`,`bib`,`cp_id`,`client_uuid`,`payload`,`created_at`)
                   VALUES (?,'register',?,NULL,?,?,?)")
        ->execute([$publicId, (int)$slot['bib'], $clientUuid, $payload, date('Y-m-d H:i:s')]);
  } catch (PDOException $e) {
    if($e->getCode() !== '23000') throw $e;
    riderOut(['ok' => true, 'duplicate' => true, 'bib' => (int)$slot['bib']]);
  }

  riderOut(['ok' => true, 'bib' => (int)$slot['bib']]);
}

apiSendJsonError(400, 'unknown_action');
