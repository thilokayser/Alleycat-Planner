<?php
/* Alleycat Dispatch — Admin-Auth-API
   ------------------------------------------------------------------
   Dritter Endpunkt neben api.php und rider.php. Verwaltet personalisierte
   Organizer-Konten (Admin/Editor/Betrachter) obendrauf auf den einen
   geteilten API-Key aus install.php — der Key bleibt gültig und ist der
   einzige Weg, das allererste Konto anzulegen (?a=bootstrap).

   Aktionen:
     POST ?a=bootstrap   API-Key + gewünschtes Konto -> erstes admin-Konto
                         (nur solange noch kein Benutzer existiert)
     POST ?a=login       Username/Passwort -> Sessiontoken
     POST ?a=logout      Sessiontoken (X-Admin-Token) löschen
     GET  ?a=whoami       eigene Rolle/Anzeigename
     GET  ?a=users        Benutzerliste (nur admin)
     POST ?a=users/create  neues Konto (nur admin)
     POST ?a=users/update  Rolle/Anzeigename/Aktiv-Status/Passwort ändern (nur admin)
     POST ?a=users/delete  Konto löschen (nur admin)
     GET  ?a=checkpointstaff  Checkpoint-Zuweisungen eines Events (nur admin)
     POST ?a=checkpointstaff/set  Zuweisungen für einen Benutzer ersetzen (nur admin)
     POST ?a=invite-create  Einladungscode(s) erzeugen (nur admin)
     GET  ?a=invite-list    Liste aller Codes, ohne Klartext (nur admin)
     POST ?a=invite-revoke  offenen Code vorzeitig entwerten (nur admin)
     POST ?a=register       Selbstregistrierung mit Einladungscode (kein Token)
     POST ?a=users/reset-code-create  Passwort-Reset-Code für einen Benutzer (nur admin)
     POST ?a=reset-password  Passwort mit Reset-Code setzen (kein Token)
     POST ?a=users/logout-all  alle Sessions eines Benutzers invalidieren (nur admin)
     GET  ?a=audit-log      jüngste Audit-Log-Einträge (nur admin)
   ------------------------------------------------------------------ */

require __DIR__ . '/bootstrap.php';

apiLoadConfig();
apiSendCorsHeaders();

if($_SERVER['REQUEST_METHOD'] === 'OPTIONS'){
  http_response_code(204);
  exit;
}

header('Content-Type: application/json');

function authJsonBody(){
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if(!is_array($data)) apiSendJsonError(400, 'invalid_body');
  return $data;
}
function authOut($data){ echo json_encode($data); exit; }
function authRequirePost(){
  if($_SERVER['REQUEST_METHOD'] !== 'POST') apiSendJsonError(405, 'method_not_allowed');
}
function authRequireGet(){
  if($_SERVER['REQUEST_METHOD'] !== 'GET') apiSendJsonError(405, 'method_not_allowed');
}
function authValidRole($role){
  return in_array($role, ['admin', 'editor', 'viewer', 'checkpoint_staff'], true);
}
/* Eine Policy für jeden Passwort-Eingabepunkt (Bootstrap, Registrierung,
   Admin-Benutzerverwaltung) statt mehrerer divergierender Regeln.
   Mindestlänge statt Zeichenklassen-Zwang (NIST SP 800-63B statt
   veralteter Komplexitätsregeln) — Nutzer weichen bei erzwungenem
   Sonderzeichen-/Großbuchstaben-Mix erfahrungsgemäß auf vorhersehbare
   Muster aus. Spiegelt validatePasswordStrength() in src/core/auth.js;
   die Client-Prüfung ist nur Komfort, hier ist die einzige echte Instanz. */
function authPasswordValid($password){
  return strlen((string)$password) >= 12;
}
function inviteHashCode($code){
  return hash('sha256', (string)$code);
}
/* 10 Zeichen aus demselben verwechslungsarmen Alphabet wie der
   Checkpoint-Zugangscode (kein O/0/I/1) — wird oft abgetippt, wenn der
   QR-Scan auf der Visitenkarte mal nicht greift. */
function inviteGenerateCode(){
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  $code = '';
  for($i = 0; $i < 10; $i++){
    $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
  }
  return $code;
}
function inviteStatus($row){
  if($row['used_at'] !== null) return 'used';
  if(strtotime($row['expires_at']) <= time()) return 'expired';
  return 'open';
}
function inviteRow($row){
  return [
    'id' => (int)$row['id'],
    'role' => $row['role'],
    'note' => $row['note'],
    'expiresAt' => $row['expires_at'],
    'usedAt' => $row['used_at'],
    'usedByUsername' => $row['used_by_username'] ?? null,
    'status' => inviteStatus($row)
  ];
}
/* Reset-Codes sind kurzlebig und vom Admin ausgelöst (nicht vom Nutzer
   selbst angefordert, es gibt keine E-Mail-Infrastruktur) — 24h reicht,
   um den Code weiterzugeben, ohne ein versehentlich liegen gelassenes
   Fenster lange offen zu halten. */
const RESET_CODE_TTL_HOURS = 24;
function resetHashCode($code){
  return hash('sha256', (string)$code);
}
function resetGenerateCode(){
  return inviteGenerateCode(); // gleiches Alphabet/Länge, gleiche Abtipp-Anforderung
}
/* Reine Anhängeliste (siehe Migration 6) — Fehler beim Loggen dürfen die
   eigentliche Aktion nie verhindern, deshalb schluckt der Aufrufer keine
   Exception von hier, sondern diese Funktion wirft nie selbst. */
function authLogAudit(PDO $pdo, $actorUserId, $actorUsername, $action, $targetUsername, $detail){
  try{
    $pdo->prepare("INSERT INTO `" . adminTableName('admin_audit_log') . "`
                   (`actor_user_id`,`actor_username`,`action`,`target_username`,`detail`)
                   VALUES (?,?,?,?,?)")
        ->execute([$actorUserId, $actorUsername, $action, $targetUsername, $detail]);
  }catch(Exception $e){
    error_log('[alleycat audit] insert failed: ' . $e->getMessage());
  }
}
function authUserRow($row){
  return [
    'id' => (int)$row['id'],
    'username' => $row['username'],
    'role' => $row['role'],
    'displayName' => $row['display_name'],
    'active' => (bool)(int)$row['active'],
    'lastSeenAt' => $row['last_seen_at']
  ];
}

$action = $_GET['a'] ?? '';
$pdo = apiConnectDb();
$userTable = adminTableName('admin_user');
$sessionTable = adminTableName('admin_session');

if($action === 'bootstrap'){
  authRequirePost();
  $body = authJsonBody();

  $count = (int)$pdo->query("SELECT COUNT(*) FROM `{$userTable}`")->fetchColumn();
  if($count > 0) apiSendJsonError(409, 'already_bootstrapped');

  /* Der Master-Key beweist, dass der Aufrufer die Installation gerade
     selbst durchgeführt hat (er stand nur einmal auf install.php's
     Erfolgsseite) — das ist die einzige Berechtigung, die hier zählt,
     kein admin_user existiert ja noch. */
  $apiKey = (string)($body['apiKey'] ?? '');
  $ok = ($apiKey !== '') && (
    (defined('ALLEYCAT_API_KEY_HASH') && password_verify($apiKey, ALLEYCAT_API_KEY_HASH)) ||
    (defined('ALLEYCAT_API_KEY') && hash_equals(ALLEYCAT_API_KEY, $apiKey))
  );
  if(!$ok) apiSendJsonError(401, 'invalid_api_key');

  $username = trim((string)($body['username'] ?? ''));
  $password = (string)($body['password'] ?? '');
  $displayName = trim((string)($body['displayName'] ?? ''));
  if($username === '' || !authPasswordValid($password)) apiSendJsonError(400, 'invalid_input');

  $pdo->prepare("INSERT INTO `{$userTable}` (`username`,`password_hash`,`role`,`display_name`)
                 VALUES (?,?,'admin',?)")
      ->execute([$username, password_hash($password, PASSWORD_DEFAULT), $displayName ?: $username]);

  authOut(['ok' => true]);
}

if($action === 'login'){
  authRequirePost();
  $body = authJsonBody();
  $username = trim((string)($body['username'] ?? ''));
  $password = (string)($body['password'] ?? '');

  riderCheckRateLimit($pdo); // gleiche IP-Bremse wie die Fahrer-App — ein Login-Formular ist ebenso ein Angriffsziel

  $stmt = $pdo->prepare("SELECT * FROM `{$userTable}` WHERE `username` = ? AND `active` = 1");
  $stmt->execute([$username]);
  $user = $stmt->fetch(PDO::FETCH_ASSOC);

  if(!$user || !password_verify($password, $user['password_hash'])){
    riderRejectAuth($pdo, 'invalid_credentials');
  }
  riderClearFailures($pdo);

  $token = adminGenerateToken();
  $pdo->prepare("INSERT INTO `{$sessionTable}` (`token_hash`,`user_id`,`last_seen_at`) VALUES (?,?,UTC_TIMESTAMP())")
      ->execute([adminHashToken($token), $user['id']]);
  $pdo->prepare("UPDATE `{$userTable}` SET `last_seen_at` = UTC_TIMESTAMP() WHERE `id` = ?")->execute([$user['id']]);
  authLogAudit($pdo, (int)$user['id'], $user['username'], 'login', null, null);

  authOut(['ok' => true, 'token' => $token, 'role' => $user['role'], 'username' => $user['username'], 'displayName' => $user['display_name']]);
}

if($action === 'logout'){
  authRequirePost();
  $token = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
  if($token !== ''){
    $pdo->prepare("DELETE FROM `{$sessionTable}` WHERE `token_hash` = ?")->execute([adminHashToken($token)]);
  }
  authOut(['ok' => true]);
}

if($action === 'whoami'){
  authRequireGet();
  $access = apiVerifyAccess($pdo, 'viewer');
  authOut(['ok' => true, 'role' => $access['role'], 'username' => $access['username']]);
}

if($action === 'users'){
  authRequireGet();
  apiVerifyAccess($pdo, 'admin');
  $rows = $pdo->query("SELECT * FROM `{$userTable}` ORDER BY `username` ASC")->fetchAll(PDO::FETCH_ASSOC);
  authOut(['ok' => true, 'users' => array_map('authUserRow', $rows)]);
}

if($action === 'users/create'){
  authRequirePost();
  apiVerifyAccess($pdo, 'admin');
  $body = authJsonBody();
  $username = trim((string)($body['username'] ?? ''));
  $password = (string)($body['password'] ?? '');
  $role = (string)($body['role'] ?? 'viewer');
  $displayName = trim((string)($body['displayName'] ?? ''));
  if($username === '' || !authPasswordValid($password) || !authValidRole($role)) apiSendJsonError(400, 'invalid_input');

  try{
    $pdo->prepare("INSERT INTO `{$userTable}` (`username`,`password_hash`,`role`,`display_name`) VALUES (?,?,?,?)")
        ->execute([$username, password_hash($password, PASSWORD_DEFAULT), $role, $displayName ?: $username]);
  }catch(PDOException $e){
    if($e->getCode() === '23000') apiSendJsonError(409, 'username_taken');
    throw $e;
  }
  authOut(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
}

if($action === 'users/update'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'admin');
  $body = authJsonBody();
  $id = (int)($body['id'] ?? 0);
  if($id <= 0) apiSendJsonError(400, 'invalid_input');

  $targetUsernameStmt = $pdo->prepare("SELECT `username` FROM `{$userTable}` WHERE `id` = ?");
  $targetUsernameStmt->execute([$id]);
  $targetUsername = $targetUsernameStmt->fetchColumn() ?: null;

  $sets = [];
  $params = [];
  if(isset($body['role'])){
    if(!authValidRole($body['role'])) apiSendJsonError(400, 'invalid_role');
    /* Der letzte Admin darf sich nicht selbst degradieren — sonst könnte
       eine Installation ohne jeden Admin dastehen und niemand käme mehr in
       die Benutzerverwaltung, nicht einmal mit dem Master-Key (der Key
       lebt nur in config.php, nicht mehr im Kopf des Betreibers). */
    if($body['role'] !== 'admin'){
      $adminCount = (int)$pdo->query("SELECT COUNT(*) FROM `{$userTable}` WHERE `role`='admin' AND `active`=1")->fetchColumn();
      $target = $pdo->prepare("SELECT `role` FROM `{$userTable}` WHERE `id` = ?");
      $target->execute([$id]);
      $targetRole = $target->fetchColumn();
      if($targetRole === 'admin' && $adminCount <= 1) apiSendJsonError(409, 'last_admin');
    }
    $sets[] = '`role` = ?'; $params[] = $body['role'];
  }
  if(isset($body['displayName'])){ $sets[] = '`display_name` = ?'; $params[] = (string)$body['displayName']; }
  if(isset($body['active'])){
    if(!$body['active']){
      $adminCount = (int)$pdo->query("SELECT COUNT(*) FROM `{$userTable}` WHERE `role`='admin' AND `active`=1")->fetchColumn();
      $target = $pdo->prepare("SELECT `role` FROM `{$userTable}` WHERE `id` = ?");
      $target->execute([$id]);
      if($target->fetchColumn() === 'admin' && $adminCount <= 1) apiSendJsonError(409, 'last_admin');
    }
    $sets[] = '`active` = ?'; $params[] = $body['active'] ? 1 : 0;
  }
  if(isset($body['password'])){
    if(!authPasswordValid($body['password'])) apiSendJsonError(400, 'invalid_input');
    $sets[] = '`password_hash` = ?'; $params[] = password_hash((string)$body['password'], PASSWORD_DEFAULT);
  }
  if(!$sets) authOut(['ok' => true]);

  $params[] = $id;
  $pdo->prepare("UPDATE `{$userTable}` SET " . implode(', ', $sets) . " WHERE `id` = ?")->execute($params);
  if(isset($body['role'])) authLogAudit($pdo, $access['userId'], $access['username'], 'role_change', $targetUsername, 'neue Rolle: ' . $body['role']);
  if(isset($body['active'])) authLogAudit($pdo, $access['userId'], $access['username'], $body['active'] ? 'activate' : 'deactivate', $targetUsername, null);
  if(isset($body['password'])) authLogAudit($pdo, $access['userId'], $access['username'], 'password_reset_by_admin', $targetUsername, null);
  authOut(['ok' => true]);
}

if($action === 'users/delete'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'admin');
  $body = authJsonBody();
  $id = (int)($body['id'] ?? 0);
  if($id <= 0) apiSendJsonError(400, 'invalid_input');

  $target = $pdo->prepare("SELECT `role`,`username` FROM `{$userTable}` WHERE `id` = ?");
  $target->execute([$id]);
  $targetRow = $target->fetch(PDO::FETCH_ASSOC);
  if($targetRow && $targetRow['role'] === 'admin'){
    $adminCount = (int)$pdo->query("SELECT COUNT(*) FROM `{$userTable}` WHERE `role`='admin' AND `active`=1")->fetchColumn();
    if($adminCount <= 1) apiSendJsonError(409, 'last_admin');
  }

  $pdo->prepare("DELETE FROM `{$sessionTable}` WHERE `user_id` = ?")->execute([$id]);
  $pdo->prepare("DELETE FROM `" . adminTableName('checkpoint_staff') . "` WHERE `user_id` = ?")->execute([$id]);
  $pdo->prepare("DELETE FROM `{$userTable}` WHERE `id` = ?")->execute([$id]);
  if($targetRow) authLogAudit($pdo, $access['userId'], $access['username'], 'delete_user', $targetRow['username'], null);
  authOut(['ok' => true]);
}

if($action === 'checkpointstaff'){
  authRequireGet();
  apiVerifyAccess($pdo, 'admin');
  $publicId = (string)($_GET['public_id'] ?? '');
  $stmt = $pdo->prepare("SELECT `user_id`,`cp_id` FROM `" . adminTableName('checkpoint_staff') . "` WHERE `public_id` = ?");
  $stmt->execute([$publicId]);
  authOut(['ok' => true, 'assignments' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

if($action === 'checkpointstaff/set'){
  authRequirePost();
  apiVerifyAccess($pdo, 'admin');
  $body = authJsonBody();
  $userId = (int)($body['userId'] ?? 0);
  $publicId = (string)($body['publicId'] ?? '');
  $cpIds = is_array($body['cpIds'] ?? null) ? $body['cpIds'] : [];
  if($userId <= 0 || $publicId === '') apiSendJsonError(400, 'invalid_input');

  $t = adminTableName('checkpoint_staff');
  $pdo->prepare("DELETE FROM `{$t}` WHERE `user_id` = ? AND `public_id` = ?")->execute([$userId, $publicId]);
  $ins = $pdo->prepare("INSERT INTO `{$t}` (`user_id`,`public_id`,`cp_id`) VALUES (?,?,?)");
  foreach($cpIds as $cpId){
    if($cpId === '' || $cpId === null) continue;
    $ins->execute([$userId, $publicId, (string)$cpId]);
  }
  authOut(['ok' => true]);
}

$inviteTable = adminTableName('invite_code');

if($action === 'invite-create'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'admin');
  $body = authJsonBody();
  $role = (string)($body['role'] ?? '');
  $expiresAt = (string)($body['expiresAt'] ?? '');
  $note = trim((string)($body['note'] ?? ''));
  $count = max(1, min(50, (int)($body['count'] ?? 1)));
  if(!authValidRole($role) || $expiresAt === '' || strtotime($expiresAt) === false || strtotime($expiresAt) <= time()){
    apiSendJsonError(400, 'invalid_input');
  }
  $expiresAtSql = date('Y-m-d H:i:s', strtotime($expiresAt));

  $ins = $pdo->prepare("INSERT INTO `{$inviteTable}` (`code_hash`,`role`,`note`,`expires_at`,`created_by_user_id`)
                        VALUES (?,?,?,?,?)");
  $codes = [];
  for($i = 0; $i < $count; $i++){
    /* Kollision ist bei 33^10 möglichen Codes praktisch ausgeschlossen,
       aber der UNIQUE-Index auf code_hash macht einen erneuten Versuch
       sicher statt eine Zeile stillschweigend zu überschreiben. */
    for($attempt = 0; $attempt < 5; $attempt++){
      $code = inviteGenerateCode();
      try{
        $ins->execute([inviteHashCode($code), $role, $note !== '' ? $note : null, $expiresAtSql, $access['userId']]);
        $codes[] = $code;
        break;
      }catch(PDOException $e){
        if($e->getCode() !== '23000' || $attempt === 4) throw $e;
      }
    }
  }
  authOut(['ok' => true, 'codes' => $codes]);
}

if($action === 'invite-list'){
  authRequireGet();
  apiVerifyAccess($pdo, 'admin');
  $rows = $pdo->query("SELECT i.*, u.username AS used_by_username FROM `{$inviteTable}` i
                        LEFT JOIN `{$userTable}` u ON u.id = i.used_by_user_id
                        ORDER BY i.created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
  authOut(['ok' => true, 'invites' => array_map('inviteRow', $rows)]);
}

if($action === 'invite-revoke'){
  authRequirePost();
  apiVerifyAccess($pdo, 'admin');
  $body = authJsonBody();
  $id = (int)($body['id'] ?? 0);
  if($id <= 0) apiSendJsonError(400, 'invalid_input');
  /* Nur offene Codes lassen sich entwerten — ein bereits eingelöster
     Code entfernt sonst rückwirkend die Nachvollziehbarkeit, wer sich
     womit registriert hat. */
  $pdo->prepare("DELETE FROM `{$inviteTable}` WHERE `id` = ? AND `used_at` IS NULL")->execute([$id]);
  authOut(['ok' => true]);
}

if($action === 'register'){
  authRequirePost();
  $body = authJsonBody();
  $code = (string)($body['code'] ?? '');
  $username = trim((string)($body['username'] ?? ''));
  $password = (string)($body['password'] ?? '');

  riderCheckRateLimit($pdo); // dieselbe IP-Bremse wie Login — Code-Bruteforcing bleibt so unattraktiv trotz Hash

  if($code === '' || $username === '' || !authPasswordValid($password)){
    riderRejectAuth($pdo, 'invalid_input');
  }

  $stmt = $pdo->prepare("SELECT * FROM `{$inviteTable}` WHERE `code_hash` = ?");
  $stmt->execute([inviteHashCode($code)]);
  $invite = $stmt->fetch(PDO::FETCH_ASSOC);

  /* Generische Fehlermeldung für jeden Grund (existiert nicht/abgelaufen/
     benutzt) — verhindert Code-Enumeration. Username-Kollision weiter
     unten bekommt bewusst eine eigene, konkrete Meldung: das ist kein
     Sicherheitsrisiko am Code selbst. */
  if(!$invite || $invite['used_at'] !== null || strtotime($invite['expires_at']) <= time()){
    riderRejectAuth($pdo, 'invite_invalid');
  }
  riderClearFailures($pdo);

  try{
    $pdo->prepare("INSERT INTO `{$userTable}` (`username`,`password_hash`,`role`,`display_name`) VALUES (?,?,?,?)")
        ->execute([$username, password_hash($password, PASSWORD_DEFAULT), $invite['role'], $username]);
  }catch(PDOException $e){
    if($e->getCode() === '23000') apiSendJsonError(409, 'username_taken');
    throw $e;
  }
  $newUserId = (int)$pdo->lastInsertId();

  $pdo->prepare("UPDATE `{$inviteTable}` SET `used_at` = UTC_TIMESTAMP(), `used_by_user_id` = ? WHERE `id` = ?")
      ->execute([$newUserId, $invite['id']]);

  $token = adminGenerateToken();
  $pdo->prepare("INSERT INTO `{$sessionTable}` (`token_hash`,`user_id`,`last_seen_at`) VALUES (?,?,UTC_TIMESTAMP())")
      ->execute([adminHashToken($token), $newUserId]);
  $pdo->prepare("UPDATE `{$userTable}` SET `last_seen_at` = UTC_TIMESTAMP() WHERE `id` = ?")->execute([$newUserId]);
  authLogAudit($pdo, $newUserId, $username, 'register_via_invite', null, 'Rolle: ' . $invite['role']);

  authOut(['ok' => true, 'token' => $token, 'role' => $invite['role'], 'username' => $username, 'displayName' => $username]);
}

$resetTable = adminTableName('admin_reset_code');

if($action === 'users/reset-code-create'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'admin');
  $body = authJsonBody();
  $userId = (int)($body['id'] ?? 0);
  if($userId <= 0) apiSendJsonError(400, 'invalid_input');
  $targetStmt = $pdo->prepare("SELECT `username` FROM `{$userTable}` WHERE `id` = ?");
  $targetStmt->execute([$userId]);
  $targetUsername = $targetStmt->fetchColumn();
  if(!$targetUsername) apiSendJsonError(404, 'not_found');

  $expiresAtSql = date('Y-m-d H:i:s', time() + RESET_CODE_TTL_HOURS * 3600);
  $code = null;
  for($attempt = 0; $attempt < 5; $attempt++){
    $candidate = resetGenerateCode();
    try{
      $pdo->prepare("INSERT INTO `{$resetTable}` (`code_hash`,`target_user_id`,`expires_at`,`created_by_user_id`)
                     VALUES (?,?,?,?)")
          ->execute([resetHashCode($candidate), $userId, $expiresAtSql, $access['userId']]);
      $code = $candidate;
      break;
    }catch(PDOException $e){
      if($e->getCode() !== '23000' || $attempt === 4) throw $e;
    }
  }
  authLogAudit($pdo, $access['userId'], $access['username'], 'reset_code_created', $targetUsername, null);
  authOut(['ok' => true, 'code' => $code, 'expiresAt' => $expiresAtSql]);
}

if($action === 'reset-password'){
  authRequirePost();
  $body = authJsonBody();
  $code = (string)($body['code'] ?? '');
  $password = (string)($body['password'] ?? '');

  riderCheckRateLimit($pdo); // dieselbe IP-Bremse wie Login/Register

  if($code === '' || !authPasswordValid($password)){
    riderRejectAuth($pdo, 'invalid_input');
  }

  $stmt = $pdo->prepare("SELECT * FROM `{$resetTable}` WHERE `code_hash` = ?");
  $stmt->execute([resetHashCode($code)]);
  $reset = $stmt->fetch(PDO::FETCH_ASSOC);

  /* Generische Fehlermeldung wie bei ?a=register — kein Unterschied
     zwischen existiert nicht/abgelaufen/benutzt. */
  if(!$reset || $reset['used_at'] !== null || strtotime($reset['expires_at']) <= time()){
    riderRejectAuth($pdo, 'reset_invalid');
  }
  riderClearFailures($pdo);

  $targetStmt = $pdo->prepare("SELECT `username` FROM `{$userTable}` WHERE `id` = ?");
  $targetStmt->execute([$reset['target_user_id']]);
  $targetUsername = $targetStmt->fetchColumn();
  if(!$targetUsername) apiSendJsonError(404, 'not_found');

  $pdo->prepare("UPDATE `{$userTable}` SET `password_hash` = ? WHERE `id` = ?")
      ->execute([password_hash($password, PASSWORD_DEFAULT), $reset['target_user_id']]);
  $pdo->prepare("UPDATE `{$resetTable}` SET `used_at` = UTC_TIMESTAMP() WHERE `id` = ?")->execute([$reset['id']]);
  /* Bestehende Sessions dieses Benutzers invalidieren — ein Passwort-
     Reset soll ein womöglich kompromittiertes Konto auch dort abmelden,
     wo noch ein alter Token gültig war. */
  $pdo->prepare("DELETE FROM `{$sessionTable}` WHERE `user_id` = ?")->execute([$reset['target_user_id']]);
  authLogAudit($pdo, (int)$reset['target_user_id'], $targetUsername, 'password_reset', null, null);

  authOut(['ok' => true]);
}

if($action === 'users/logout-all'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'admin');
  $body = authJsonBody();
  $userId = (int)($body['id'] ?? 0);
  if($userId <= 0) apiSendJsonError(400, 'invalid_input');
  $targetStmt = $pdo->prepare("SELECT `username` FROM `{$userTable}` WHERE `id` = ?");
  $targetStmt->execute([$userId]);
  $targetUsername = $targetStmt->fetchColumn();

  $pdo->prepare("DELETE FROM `{$sessionTable}` WHERE `user_id` = ?")->execute([$userId]);
  authLogAudit($pdo, $access['userId'], $access['username'], 'logout_all_sessions', $targetUsername ?: null, null);
  authOut(['ok' => true]);
}

if($action === 'audit-log'){
  authRequireGet();
  apiVerifyAccess($pdo, 'admin');
  $limit = max(1, min(500, (int)($_GET['limit'] ?? 200)));
  $rows = $pdo->prepare("SELECT * FROM `" . adminTableName('admin_audit_log') . "` ORDER BY `id` DESC LIMIT " . $limit);
  $rows->execute();
  authOut(['ok' => true, 'entries' => array_map(function($r){
    return [
      'id' => (int)$r['id'],
      'at' => $r['created_at'],
      'actorUsername' => $r['actor_username'],
      'action' => $r['action'],
      'targetUsername' => $r['target_username'],
      'detail' => $r['detail']
    ];
  }, $rows->fetchAll(PDO::FETCH_ASSOC))]);
}

apiSendJsonError(400, 'unknown_action');
