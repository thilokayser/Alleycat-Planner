<?php
/* Alleycat Dispatch — Admin-Auth-API
   ------------------------------------------------------------------
   Dritter Endpunkt neben api.php und rider.php. Verwaltet personalisierte
   Organizer-Konten (Admin/Editor/Betrachter) obendrauf auf den einen
   geteilten API-Key aus install.php — der Key bleibt gültig und ist der
   einzige Weg, das allererste Konto anzulegen (?a=bootstrap).

   Aktionen:
     GET  ?a=discover    Endpunkt-Erkennung ohne Auth (API-URL, Fahrer-App-URL,
                         ob schon Konten existieren)
     POST ?a=bootstrap   API-Key + gewünschtes Konto -> erstes admin-Konto
                         (nur solange noch kein Benutzer existiert)
     POST ?a=login       Username/Passwort -> Sessiontoken
     POST ?a=logout      Sessiontoken (X-Admin-Token) löschen
     GET  ?a=whoami       eigene Rolle/Anzeigename (ohne Org-Kontext möglich)
     GET  ?a=my-orgs      eigene Org-Mitgliedschaften (ohne Org-Kontext möglich)
     GET  ?a=users        Benutzerliste (nur SysAdmin)
     POST ?a=users/create  neues Konto (nur SysAdmin)
     POST ?a=users/update  Rolle/Anzeigename/Aktiv-Status/Passwort ändern (nur SysAdmin)
     POST ?a=users/delete  Konto löschen (nur SysAdmin)
     GET  ?a=checkpointstaff  Checkpoint-Zuweisungen eines Events (Captain der besitzenden Org)
     POST ?a=checkpointstaff/set  Zuweisungen für einen Benutzer ersetzen (Captain der besitzenden Org)
     POST ?a=invite-create  Einladungscode(s) erzeugen (nur SysAdmin)
     GET  ?a=invite-list    Liste aller Codes, ohne Klartext (nur SysAdmin)
     POST ?a=invite-revoke  offenen Code vorzeitig entwerten (nur SysAdmin)
     POST ?a=register       Selbstregistrierung mit Einladungscode (kein Token)
     POST ?a=users/reset-code-create  Passwort-Reset-Code für einen Benutzer (nur SysAdmin)
     POST ?a=reset-password  Passwort mit Reset-Code setzen (kein Token)
     POST ?a=users/logout-all  alle Sessions eines Benutzers invalidieren (nur SysAdmin)
     GET  ?a=audit-log      jüngste Audit-Log-Einträge (nur SysAdmin)

   Instanzweit vs. org-weit: alles unter ?a=users*, ?a=invite* und
   ?a=audit-log betrifft die GESAMTE Instanz und verlangt deshalb
   zusätzlich zur Rolle 'captain' den SysAdmin-Status
   (authRequireSysAdmin). Ein Captain ist nur INNERHALB seiner Org
   mächtig — ohne diese zweite Prüfung könnte er das Passwort des
   SysAdmins zurücksetzen und die Instanz übernehmen.
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
  return in_array($role, ['captain', 'editor', 'viewer', 'checkpoint_staff'], true);
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
/* Der letzte aktive SysAdmin darf weder deaktiviert noch gelöscht werden.
   Früher zählte diese Sperre `role='admin'` — seit Migration 7 schreibt
   nichts mehr diesen Wert, die Prüfung war also immer 0 und damit tot.
   is_sysadmin ist die knappe Ressource: ohne einen davon kann niemand
   mehr Orgs anlegen oder Konten verwalten, auch nicht mit dem Master-Key
   (der lebt nur in config.php, nicht im Kopf des Betreibers). */
function authRequireNotLastSysAdmin(PDO $pdo, $userTable, $targetId){
  $target = $pdo->prepare("SELECT `is_sysadmin` FROM `{$userTable}` WHERE `id` = ?");
  $target->execute([$targetId]);
  if((int)$target->fetchColumn() !== 1) return;
  $count = (int)$pdo->query("SELECT COUNT(*) FROM `{$userTable}` WHERE `is_sysadmin` = 1 AND `active` = 1")->fetchColumn();
  if($count <= 1) apiSendJsonError(409, 'last_admin');
}

function authUserRow($row){
  return [
    'id' => (int)$row['id'],
    'username' => $row['username'],
    'isSysAdmin' => (bool)(int)$row['is_sysadmin'],
    'displayName' => $row['display_name'],
    'active' => (bool)(int)$row['active'],
    'lastSeenAt' => $row['last_seen_at']
  ];
}

$action = $_GET['a'] ?? '';
$pdo = apiConnectDb();
$userTable = adminTableName('admin_user');
$sessionTable = adminTableName('admin_session');

/* Unauthentifizierte Erkennung: eine App, die auf derselben Domain liegt,
   probiert ein paar Kandidatenpfade durch (discoverPhpBackend() in
   src/storage/storage-server.js) und richtet sich damit selbst ein, statt
   den Betreiber den API-Endpunkt in jedem neuen Browser eintippen zu
   lassen. Bewusst ohne Token/Key: die Antwort enthält nichts Geheimes —
   den Endpunkt kennt ohnehin jeder, der diese Datei aufrufen kann, und
   'hasUsers' steuert nur, ob der Client Login oder Bootstrap zeigt. */
if($action === 'discover'){
  authRequireGet();
  riderCheckRateLimit($pdo); // gleiche IP-Bremse wie login: unauthentifizierter Endpunkt

  $hasUsers = ((int)$pdo->query("SELECT COUNT(*) FROM `{$userTable}`")->fetchColumn()) > 0;

  $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
  $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  $apiUrl = $scheme . '://' . $_SERVER['HTTP_HOST'] . $scriptDir . '/api.php';

  $riderAppUrl = '';
  try{
    /* org_id = 0 ist der instanzweite Sentinel (Migration 7) — ohne den
       Filter träfe die Abfrage auch die org-eigene Zeile einer beliebigen
       Org, die zufällig denselben Key benutzt. */
    $stmt = $pdo->prepare("SELECT `value` FROM `" . ALLEYCAT_TABLE . "` WHERE `key` = ? AND `org_id` = 0");
    $stmt->execute(['config:riderAppUrl']);
    $riderAppUrl = (string)($stmt->fetchColumn() ?: '');
  }catch(Exception $e){
    error_log('[alleycat discover] riderAppUrl lookup failed: ' . $e->getMessage());
  }

  authOut([
    'ok' => true,
    'product' => 'alleycat-dispatch',
    'apiUrl' => $apiUrl,
    'riderAppUrl' => $riderAppUrl,
    'hasUsers' => $hasUsers
  ]);
}

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

  /* Das Bootstrap-Konto ist der instanzweite SysAdmin — dieselbe Regel
     wie im Bootstrap-Pfad von install.php. Ohne is_sysadmin=1 stünde die
     Installation nach dem Setup ganz ohne SysAdmin da: niemand könnte
     eine Org anlegen, und die Sperre "letzter SysAdmin" hätte nichts zu
     schützen. `role` ist nur noch ein historisches Feld (siehe
     Migration 7), wird aber konsistent auf 'captain' gesetzt. */
  $pdo->prepare("INSERT INTO `{$userTable}` (`username`,`password_hash`,`role`,`is_sysadmin`,`display_name`)
                 VALUES (?,?,'captain',1,?)")
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

  authOut(['ok' => true, 'token' => $token, 'isSysAdmin' => (bool)(int)$user['is_sysadmin'], 'username' => $user['username'], 'displayName' => $user['display_name']]);
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
  /* $requireOrg = false: Diese Aktion (und ?a=my-orgs) läuft beim
     allerersten Login, wenn der Client noch gar keinen X-Org-Slug kennt.
     Mit der normalen Prüfung gäbe es dort ein 403, der Client bekäme nie
     eine Org-Liste, könnte nie eine Org wählen — eine Sackgasse, aus der
     nur ein manuelles Leeren des localStorage herausführt. */
  $access = apiVerifyAccess($pdo, 'viewer', null, false);
  authOut(['ok' => true, 'role' => $access['role'], 'username' => $access['username'], 'isSysAdmin' => $access['isSysAdmin'], 'orgId' => $access['orgId']]);
}

if($action === 'my-orgs'){
  authRequireGet();
  $access = apiVerifyAccess($pdo, 'viewer', null, false); // siehe ?a=whoami: darf ohne aufgelöste Org laufen
  $orgTable = adminTableName('organization');
  if($access['isSysAdmin']){
    /* org-scoping-guard: ok — SysAdmins sehen die Orgs der ganzen Instanz;
       ein org_id-Filter wäre hier genau das Gegenteil der Absicht. */
    $rows = $pdo->query("SELECT `id`,`slug`,`name` FROM `{$orgTable}` ORDER BY `name` ASC")->fetchAll(PDO::FETCH_ASSOC);
  } else {
    /* org-scoping-guard: ok — diese Query BESTIMMT erst, welche Orgs der
       Aufrufer sehen darf; gefiltert wird deshalb über m.user_id. */
    $stmt = $pdo->prepare(
      "SELECT o.`id`, o.`slug`, o.`name`, m.`role` FROM `{$orgTable}` o
       JOIN `" . adminTableName('org_member') . "` m ON m.org_id = o.id
       WHERE m.user_id = ? ORDER BY o.name ASC"
    );
    $stmt->execute([$access['userId']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
  }
  authOut(['ok' => true, 'orgs' => array_map(function($r){
    return ['id' => (int)$r['id'], 'slug' => $r['slug'], 'name' => $r['name'], 'role' => $r['role'] ?? 'captain'];
  }, $rows)]);
}

$orgTable = adminTableName('organization');

function authRequireSysAdmin($access){
  apiRequireSysAdmin($access);
}

/* Anders als die Benutzerverwaltung sind die beiden checkpointstaff-
   Aktionen echt org-gebunden: ein Captain SOLL die Checkpoints seiner
   eigenen Events besetzen dürfen. Nur eben nicht die einer fremden Org —
   und genau das wäre möglich, weil die Aktionen eine halböffentliche
   public_id entgegennehmen (siehe rider.php). Besitz steht in
   rider_event.org_id (Migration 8). SysAdmins dürfen wie überall
   durchgreifen. */
function authRequireOwnEventPublicId(PDO $pdo, $publicId, $access){
  if($access['isSysAdmin']) return;
  if($publicId === '' || $access['orgId'] === null) apiSendJsonError(400, 'invalid_input');
  $owner = riderEventOrgId($pdo, $publicId);
  /* null = unbekannte public_id, 0 = Bestandszeile vor Migration 8.
     Beides ist kein Besitznachweis für eine fremde Org, aber auch kein
     Leck: es gibt dann nichts zu sehen. 404 statt 403, damit die Antwort
     die Existenz fremder public_ids nicht bestätigt. */
  if($owner === null || $owner === 0) return;
  if($owner !== (int)$access['orgId']) apiSendJsonError(404, 'not_found');
}

if($action === 'org/create'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
  $body = authJsonBody();
  $slug = trim((string)($body['slug'] ?? ''));
  $name = trim((string)($body['name'] ?? ''));
  if($slug === '' || $name === '' || !preg_match('/^[a-z0-9-]{2,64}$/', $slug)) apiSendJsonError(400, 'invalid_input');
  try{
    /* org-scoping-guard: ok — legt die Org erst an; die org_id entsteht hier
       (lastInsertId), es gibt noch nichts, wogegen zu filtern wäre.
       Absicherung: authRequireSysAdmin() direkt oben. */
    $pdo->prepare("INSERT INTO `{$orgTable}` (`slug`,`name`) VALUES (?,?)")->execute([$slug, $name]);
  }catch(PDOException $e){
    if($e->getCode() === '23000') apiSendJsonError(409, 'slug_taken');
    throw $e;
  }
  authOut(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
}

if($action === 'org/list'){
  authRequireGet();
  $access = apiVerifyAccess($pdo, 'viewer');
  authRequireSysAdmin($access);
  /* org-scoping-guard: ok — instanzweite Org-Liste fürs SysAdmin-Panel,
     bewusst ungefiltert; abgesichert durch authRequireSysAdmin() darüber. */
  $rows = $pdo->query("SELECT `id`,`slug`,`name`,`created_at` FROM `{$orgTable}` ORDER BY `created_at` DESC")->fetchAll(PDO::FETCH_ASSOC);
  authOut(['ok' => true, 'orgs' => $rows]);
}

if($action === 'org/deactivate'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
  $body = authJsonBody();
  $orgId = (int)($body['orgId'] ?? 0);
  if($orgId <= 0) apiSendJsonError(400, 'invalid_input');
  /* Kein DELETE — Events/Mitglieder sollen nicht mitgerissen werden.
     "Deaktivieren" heißt: alle Sessions der Org-Mitglieder invalidieren,
     Slug für Neuvergabe sperren bleibt der Org selbst überlassen (sie
     existiert weiter, nur keine aktiven Logins mehr). */
  $memberIds = $pdo->prepare("SELECT `user_id` FROM `" . adminTableName('org_member') . "` WHERE `org_id` = ?");
  $memberIds->execute([$orgId]);
  $ids = $memberIds->fetchAll(PDO::FETCH_COLUMN);
  if($ids){
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("DELETE FROM `" . adminTableName('admin_session') . "` WHERE `user_id` IN ({$placeholders})")->execute($ids);
  }
  authOut(['ok' => true]);
}

$orgMemberTable = adminTableName('org_member');

if($action === 'org/members'){
  authRequireGet();
  $access = apiVerifyAccess($pdo, 'viewer');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $stmt = $pdo->prepare(
    "SELECT m.`user_id`, m.`role`, u.`username`, u.`display_name` FROM `{$orgMemberTable}` m
     JOIN `{$userTable}` u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY u.username ASC"
  );
  $stmt->execute([$access['orgId']]);
  authOut(['ok' => true, 'members' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

if($action === 'org/members/set-role'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $body = authJsonBody();
  $userId = (int)($body['userId'] ?? 0);
  $role = (string)($body['role'] ?? '');
  if($userId <= 0 || !in_array($role, ['captain','editor','viewer','checkpoint_staff'], true)) apiSendJsonError(400, 'invalid_input');
  /* Letzter Captain der Org darf sich nicht selbst degradieren — analog
     zur bestehenden last_admin-Regel in users/update. */
  if($role !== 'captain'){
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM `{$orgMemberTable}` WHERE `org_id` = ? AND `role` = 'captain'");
    $stmt->execute([$access['orgId']]);
    $captainCount = (int)$stmt->fetchColumn();
    $target = $pdo->prepare("SELECT `role` FROM `{$orgMemberTable}` WHERE `org_id` = ? AND `user_id` = ?");
    $target->execute([$access['orgId'], $userId]);
    if($target->fetchColumn() === 'captain' && $captainCount <= 1) apiSendJsonError(409, 'last_captain');
  }
  /* org-scoping-guard: ok — Upsert auf dem PK (org_id,user_id); die org_id
     stammt aus $access (X-Org-Slug + Captain-Prüfung), nicht aus dem Body,
     kann also keine fremde Zeile treffen. */
  $pdo->prepare("INSERT INTO `{$orgMemberTable}` (`org_id`,`user_id`,`role`) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE `role` = VALUES(`role`)")
      ->execute([$access['orgId'], $userId, $role]);
  authOut(['ok' => true]);
}

if($action === 'org/members/remove'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $body = authJsonBody();
  $userId = (int)($body['userId'] ?? 0);
  if($userId <= 0) apiSendJsonError(400, 'invalid_input');
  $target = $pdo->prepare("SELECT `role` FROM `{$orgMemberTable}` WHERE `org_id` = ? AND `user_id` = ?");
  $target->execute([$access['orgId'], $userId]);
  if($target->fetchColumn() === 'captain'){
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM `{$orgMemberTable}` WHERE `org_id` = ? AND `role` = 'captain'");
    $stmt->execute([$access['orgId']]);
    if((int)$stmt->fetchColumn() <= 1) apiSendJsonError(409, 'last_captain');
  }
  $pdo->prepare("DELETE FROM `{$orgMemberTable}` WHERE `org_id` = ? AND `user_id` = ?")->execute([$access['orgId'], $userId]);
  authOut(['ok' => true]);
}

$eventAdminTable = adminTableName('org_event_admin');

if($action === 'org/event-admins'){
  authRequireGet();
  $access = apiVerifyAccess($pdo, 'viewer');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $eventId = (string)($_GET['eventId'] ?? '');
  if($eventId === '') apiSendJsonError(400, 'invalid_input');
  $stmt = $pdo->prepare(
    "SELECT a.`user_id`, u.`username` FROM `{$eventAdminTable}` a
     JOIN `{$userTable}` u ON u.id = a.user_id WHERE a.org_id = ? AND a.event_id = ?"
  );
  $stmt->execute([$access['orgId'], $eventId]);
  authOut(['ok' => true, 'admins' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

if($action === 'org/event-admins/grant'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $body = authJsonBody();
  $userId = (int)($body['userId'] ?? 0);
  $eventId = (string)($body['eventId'] ?? '');
  if($userId <= 0 || $eventId === '') apiSendJsonError(400, 'invalid_input');
  /* org-scoping-guard: ok — Upsert auf dem PK (org_id,event_id,user_id);
     die org_id stammt aus $access, nicht aus dem Body. */
  $pdo->prepare("INSERT INTO `{$eventAdminTable}` (`org_id`,`event_id`,`user_id`) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE `granted_at` = CURRENT_TIMESTAMP")
      ->execute([$access['orgId'], $eventId, $userId]);
  authOut(['ok' => true]);
}

if($action === 'org/event-admins/revoke'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $body = authJsonBody();
  $userId = (int)($body['userId'] ?? 0);
  $eventId = (string)($body['eventId'] ?? '');
  if($userId <= 0 || $eventId === '') apiSendJsonError(400, 'invalid_input');
  $pdo->prepare("DELETE FROM `{$eventAdminTable}` WHERE `org_id` = ? AND `event_id` = ? AND `user_id` = ?")
      ->execute([$access['orgId'], $eventId, $userId]);
  authOut(['ok' => true]);
}

if($action === 'users'){
  authRequireGet();
  /* Instanzweit, nicht org-weit: diese Aktion sieht/ändert Konten der
     GESAMTEN Instanz. Ein Captain ist nur innerhalb SEINER Org mächtig —
     ohne diese zweite Prüfung könnte er jedes fremde Konto (auch das des
     SysAdmins) zurücksetzen und die Instanz übernehmen. */
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
  $rows = $pdo->query("SELECT * FROM `{$userTable}` ORDER BY `username` ASC")->fetchAll(PDO::FETCH_ASSOC);
  authOut(['ok' => true, 'users' => array_map('authUserRow', $rows)]);
}

if($action === 'users/create'){
  authRequirePost();
  /* Instanzweit, nicht org-weit: diese Aktion sieht/ändert Konten der
     GESAMTEN Instanz. Ein Captain ist nur innerhalb SEINER Org mächtig —
     ohne diese zweite Prüfung könnte er jedes fremde Konto (auch das des
     SysAdmins) zurücksetzen und die Instanz übernehmen. */
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
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
  /* Instanzweit, nicht org-weit: diese Aktion sieht/ändert Konten der
     GESAMTEN Instanz. Ein Captain ist nur innerhalb SEINER Org mächtig —
     ohne diese zweite Prüfung könnte er jedes fremde Konto (auch das des
     SysAdmins) zurücksetzen und die Instanz übernehmen. */
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
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
    /* Hier steht bewusst KEINE "letzter Admin"-Sperre mehr: admin_user.role
       wird seit Migration 7 von keiner Berechtigungsprüfung mehr gelesen
       (Rollenwahrheit = org_member + is_sysadmin), eine Änderung an dieser
       Spalte kann also niemanden aussperren. Was geschützt werden muss,
       ist der letzte instanzweite SysAdmin — das erledigt
       authRequireNotLastSysAdmin() beim Deaktivieren und beim Löschen.
       Die Org-Ebene hat ihre eigene Sperre in org/members/set-role. */
    $sets[] = '`role` = ?'; $params[] = $body['role'];
  }
  if(isset($body['displayName'])){ $sets[] = '`display_name` = ?'; $params[] = (string)$body['displayName']; }
  if(isset($body['active'])){
    if(!$body['active']) authRequireNotLastSysAdmin($pdo, $userTable, $id);
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
  /* Instanzweit, nicht org-weit: diese Aktion sieht/ändert Konten der
     GESAMTEN Instanz. Ein Captain ist nur innerhalb SEINER Org mächtig —
     ohne diese zweite Prüfung könnte er jedes fremde Konto (auch das des
     SysAdmins) zurücksetzen und die Instanz übernehmen. */
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
  $body = authJsonBody();
  $id = (int)($body['id'] ?? 0);
  if($id <= 0) apiSendJsonError(400, 'invalid_input');

  $target = $pdo->prepare("SELECT `is_sysadmin`,`username` FROM `{$userTable}` WHERE `id` = ?");
  $target->execute([$id]);
  $targetRow = $target->fetch(PDO::FETCH_ASSOC);
  authRequireNotLastSysAdmin($pdo, $userTable, $id);

  $pdo->prepare("DELETE FROM `{$sessionTable}` WHERE `user_id` = ?")->execute([$id]);
  /* org-scoping-guard: ok — beim Löschen eines Kontos müssen ALLE seine
     Checkpoint-Zuweisungen mit, org-übergreifend; das ist eine instanzweite
     Aktion (authRequireSysAdmin() oben). */
  $pdo->prepare("DELETE FROM `" . adminTableName('checkpoint_staff') . "` WHERE `user_id` = ?")->execute([$id]);
  $pdo->prepare("DELETE FROM `{$userTable}` WHERE `id` = ?")->execute([$id]);
  if($targetRow) authLogAudit($pdo, $access['userId'], $access['username'], 'delete_user', $targetRow['username'], null);
  authOut(['ok' => true]);
}

if($action === 'checkpointstaff'){
  authRequireGet();
  $access = apiVerifyAccess($pdo, 'captain');
  $publicId = (string)($_GET['public_id'] ?? '');
  authRequireOwnEventPublicId($pdo, $publicId, $access);
  /* org-scoping-guard: ok — checkpoint_staff hat keine org_id-Spalte; der
     Org-Besitz der public_id ist eine Zeile darüber geprüft. */
  $stmt = $pdo->prepare("SELECT `user_id`,`cp_id` FROM `" . adminTableName('checkpoint_staff') . "` WHERE `public_id` = ?");
  $stmt->execute([$publicId]);
  authOut(['ok' => true, 'assignments' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

if($action === 'checkpointstaff/set'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  $body = authJsonBody();
  $userId = (int)($body['userId'] ?? 0);
  $publicId = (string)($body['publicId'] ?? '');
  $cpIds = is_array($body['cpIds'] ?? null) ? $body['cpIds'] : [];
  if($userId <= 0 || $publicId === '') apiSendJsonError(400, 'invalid_input');
  authRequireOwnEventPublicId($pdo, $publicId, $access);

  $t = adminTableName('checkpoint_staff');
  /* org-scoping-guard: ok — checkpoint_staff hat keine org_id-Spalte; der
     Org-Besitz der public_id ist über authRequireOwnEventPublicId() oben
     geprüft, beide Statements arbeiten nur innerhalb dieser public_id. */
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
  /* Instanzweit, nicht org-weit: diese Aktion sieht/ändert Konten der
     GESAMTEN Instanz. Ein Captain ist nur innerhalb SEINER Org mächtig —
     ohne diese zweite Prüfung könnte er jedes fremde Konto (auch das des
     SysAdmins) zurücksetzen und die Instanz übernehmen. */
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
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
  /* Instanzweit, nicht org-weit: diese Aktion sieht/ändert Konten der
     GESAMTEN Instanz. Ein Captain ist nur innerhalb SEINER Org mächtig —
     ohne diese zweite Prüfung könnte er jedes fremde Konto (auch das des
     SysAdmins) zurücksetzen und die Instanz übernehmen. */
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
  $rows = $pdo->query("SELECT i.*, u.username AS used_by_username FROM `{$inviteTable}` i
                        LEFT JOIN `{$userTable}` u ON u.id = i.used_by_user_id
                        ORDER BY i.created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
  authOut(['ok' => true, 'invites' => array_map('inviteRow', $rows)]);
}

if($action === 'invite-revoke'){
  authRequirePost();
  /* Instanzweit, nicht org-weit: diese Aktion sieht/ändert Konten der
     GESAMTEN Instanz. Ein Captain ist nur innerhalb SEINER Org mächtig —
     ohne diese zweite Prüfung könnte er jedes fremde Konto (auch das des
     SysAdmins) zurücksetzen und die Instanz übernehmen. */
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
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
  /* Instanzweit, nicht org-weit: diese Aktion sieht/ändert Konten der
     GESAMTEN Instanz. Ein Captain ist nur innerhalb SEINER Org mächtig —
     ohne diese zweite Prüfung könnte er jedes fremde Konto (auch das des
     SysAdmins) zurücksetzen und die Instanz übernehmen. */
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
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
  /* Instanzweit, nicht org-weit: diese Aktion sieht/ändert Konten der
     GESAMTEN Instanz. Ein Captain ist nur innerhalb SEINER Org mächtig —
     ohne diese zweite Prüfung könnte er jedes fremde Konto (auch das des
     SysAdmins) zurücksetzen und die Instanz übernehmen. */
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
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
  /* Instanzweit, nicht org-weit: diese Aktion sieht/ändert Konten der
     GESAMTEN Instanz. Ein Captain ist nur innerhalb SEINER Org mächtig —
     ohne diese zweite Prüfung könnte er jedes fremde Konto (auch das des
     SysAdmins) zurücksetzen und die Instanz übernehmen. */
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
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
