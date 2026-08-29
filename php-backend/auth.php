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
  if($username === '' || strlen($password) < 8) apiSendJsonError(400, 'invalid_input');

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
  $pdo->prepare("INSERT INTO `{$sessionTable}` (`token_hash`,`user_id`,`last_seen_at`) VALUES (?,?,NOW())")
      ->execute([adminHashToken($token), $user['id']]);
  $pdo->prepare("UPDATE `{$userTable}` SET `last_seen_at` = NOW() WHERE `id` = ?")->execute([$user['id']]);

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
  if($username === '' || strlen($password) < 8 || !authValidRole($role)) apiSendJsonError(400, 'invalid_input');

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
    if(strlen((string)$body['password']) < 8) apiSendJsonError(400, 'invalid_input');
    $sets[] = '`password_hash` = ?'; $params[] = password_hash((string)$body['password'], PASSWORD_DEFAULT);
  }
  if(!$sets) authOut(['ok' => true]);

  $params[] = $id;
  $pdo->prepare("UPDATE `{$userTable}` SET " . implode(', ', $sets) . " WHERE `id` = ?")->execute($params);
  authOut(['ok' => true]);
}

if($action === 'users/delete'){
  authRequirePost();
  apiVerifyAccess($pdo, 'admin');
  $body = authJsonBody();
  $id = (int)($body['id'] ?? 0);
  if($id <= 0) apiSendJsonError(400, 'invalid_input');

  $target = $pdo->prepare("SELECT `role` FROM `{$userTable}` WHERE `id` = ?");
  $target->execute([$id]);
  $role = $target->fetchColumn();
  if($role === 'admin'){
    $adminCount = (int)$pdo->query("SELECT COUNT(*) FROM `{$userTable}` WHERE `role`='admin' AND `active`=1")->fetchColumn();
    if($adminCount <= 1) apiSendJsonError(409, 'last_admin');
  }

  $pdo->prepare("DELETE FROM `{$sessionTable}` WHERE `user_id` = ?")->execute([$id]);
  $pdo->prepare("DELETE FROM `" . adminTableName('checkpoint_staff') . "` WHERE `user_id` = ?")->execute([$id]);
  $pdo->prepare("DELETE FROM `{$userTable}` WHERE `id` = ?")->execute([$id]);
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

apiSendJsonError(400, 'unknown_action');
