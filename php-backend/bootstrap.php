<?php
/* Alleycat Dispatch — gemeinsames Bootstrap für alle API-Endpunkte
   ------------------------------------------------------------------
   Lädt config.php, prüft den API-Key (Header X-Api-Key) und öffnet
   eine PDO-Verbindung mit dem beim Setup ermittelten Zeichensatz.
   Wird von api.php, backup.php und migrate.php gleichermaßen genutzt,
   damit die sicherheitsrelevante Prüfung nur an einer Stelle
   existiert statt dreifach kopiert zu sein.

   Produktions-Fehlerbehandlung: display_errors aus, jeder Fehler
   landet nur im Server-Error-Log (error_log()), niemals im
   Response-Body — anders als install.php, das als einmalig
   ausgeführtes, danach selbst gelöschtes Admin-Tool detaillierte
   Fehlermeldungen bewusst weiter direkt anzeigt (siehe dort, das
   hilft beim Debuggen falscher DB-Zugangsdaten während des Setups).
   ------------------------------------------------------------------ */

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

function apiSendJsonError($httpStatus, $errorCode, $logDetail = null){
  if($logDetail !== null){
    error_log('[alleycat api] ' . $errorCode . ': ' . $logDetail);
  }
  http_response_code($httpStatus);
  header('Content-Type: application/json');
  echo json_encode(['error' => $errorCode]);
  exit;
}

set_exception_handler(function($e){
  apiSendJsonError(500, 'internal_error', get_class($e) . ': ' . $e->getMessage());
});

function apiLoadConfig(){
  $configPath = __DIR__ . '/config.php';
  if(!file_exists($configPath)){
    apiSendJsonError(500, 'not_configured', 'config.php fehlt — zuerst install.php ausführen.');
  }
  require $configPath;
}

function apiSendCorsHeaders(){
  header('Access-Control-Allow-Origin: ' . ALLEYCAT_ALLOWED_ORIGIN);
  header('Access-Control-Allow-Headers: X-Api-Key, X-Rider-Token, X-Rider-Code, X-Admin-Token, X-Checkpoint-Token, Content-Type');
  header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
}

/* Unterstützt sowohl den neuen gehashten Key (ALLEYCAT_API_KEY_HASH,
   password_verify) als auch, für bereits vor dieser Härtung
   installierte Backends, den alten Klartext-Key (ALLEYCAT_API_KEY,
   hash_equals) — so bricht ein api.php-Update bestehende
   Installationen nicht, ohne dass sie install.php erneut ausführen
   müssen. */
function apiVerifyKey(){
  $provided = $_SERVER['HTTP_X_API_KEY'] ?? '';
  if($provided !== ''){
    if(defined('ALLEYCAT_API_KEY_HASH') && password_verify($provided, ALLEYCAT_API_KEY_HASH)) return;
    if(defined('ALLEYCAT_API_KEY') && hash_equals(ALLEYCAT_API_KEY, $provided)) return;
  }
  apiSendJsonError(401, 'unauthorized');
}

function apiConnectDb(){
  $charset = defined('ALLEYCAT_CHARSET') ? ALLEYCAT_CHARSET : 'utf8mb4';
  try {
    return new PDO(
      'mysql:host=' . ALLEYCAT_DB_HOST . ';dbname=' . ALLEYCAT_DB_NAME . ';charset=' . $charset,
      ALLEYCAT_DB_USER, ALLEYCAT_DB_PASS,
      [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
  } catch (Exception $e) {
    apiSendJsonError(500, 'db_connection_failed', $e->getMessage());
  }
}

/* ================= Rider-App-Helfer =================
   rider.php ist der einzige Endpunkt, der ohne Admin-Key erreichbar
   ist — Fahrer dürfen den Key nicht besitzen, er gäbe Vollzugriff auf
   den gesamten Speicher. Authentifiziert wird stattdessen gegen die
   Token von der Spokecard bzw. vom Checkpoint-Aufsteller.

   Die Helfer stehen hier statt in rider.php, damit die Token-Auflösung
   und die Bremse an einer Stelle existieren und nicht pro Aktion
   nachgebaut werden.                                                 */

function riderTableName($suffix){
  return ALLEYCAT_TABLE . '_rider_' . $suffix;
}

/* Tokens sind 32 zufällige Zeichen aus einem kryptografischen
   Generator. Deshalb reicht ein schneller, indexierbarer Hash: es gibt
   kein schwaches Geheimnis zu strecken, und ein Salt pro Zeile machte
   den Lookup unmöglich. Bewusst anders als beim API-Key, wo
   password_hash richtig ist, weil der Mensch dort die Quelle ist. */
function riderHashToken($token){
  return hash('sha256', (string)$token);
}

function riderResolveSlot(PDO $pdo, $publicId, $token){
  $t = riderTableName('slot');
  $stmt = $pdo->prepare("SELECT * FROM `{$t}` WHERE `public_id` = ? AND `token_hash` = ?");
  $stmt->execute([$publicId, riderHashToken($token)]);
  return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function riderResolveSlotByCode(PDO $pdo, $publicId, $code){
  $t = riderTableName('slot');
  /* Der gedruckte Code wird abgetippt, wenn die Kamera streikt —
     Großschreibung erzwingen, sonst scheitert eine korrekte Eingabe
     an der Tastatur. */
  $stmt = $pdo->prepare("SELECT * FROM `{$t}` WHERE `public_id` = ? AND `code_hash` = ?");
  $stmt->execute([$publicId, riderHashToken(strtoupper(trim((string)$code)))]);
  return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function riderClientIpHash(){
  $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
  /* Gehasht statt im Klartext: die Tabelle ist eine Bremse, kein
     Besucherprotokoll. Zum Wiedererkennen innerhalb eines Fensters
     reicht der Hash. */
  return hash('sha256', $ip);
}

/* Bricht mit 429 ab, wenn diese IP gerade gesperrt ist. Ansonsten
   Rückkehr ohne Nebenwirkung — gezählt wird erst beim Fehlschlag. */
function riderCheckRateLimit(PDO $pdo){
  $t = riderTableName('ratelimit');
  $stmt = $pdo->prepare("SELECT `block_until` FROM `{$t}` WHERE `ip_hash` = ?");
  $stmt->execute([riderClientIpHash()]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if($row && $row['block_until'] !== null && strtotime($row['block_until']) > time()){
    header('Retry-After: ' . max(1, strtotime($row['block_until']) - time()));
    apiSendJsonError(429, 'rate_limited');
  }
}

/* Zählt einen fehlgeschlagenen Authentifizierungsversuch. Ab dem
   zehnten Fehlversuch innerhalb einer Minute wird gesperrt, die
   Sperrdauer verdoppelt sich bei weiteren Fehlversuchen (60s, 120s,
   240s …, gedeckelt bei einer Stunde).

   Nur Fehlversuche zählen: ein Fahrer, der an zwanzig Checkpoints
   gültig eincheckt, darf sich nicht selbst aussperren. */
function riderRecordFailure(PDO $pdo){
  $t = riderTableName('ratelimit');
  $ip = riderClientIpHash();
  $stmt = $pdo->prepare("SELECT * FROM `{$t}` WHERE `ip_hash` = ?");
  $stmt->execute([$ip]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);

  $now = time();
  $windowOpen = $row && (strtotime($row['window_start']) > $now - 60);
  $count = $windowOpen ? ((int)$row['fail_count'] + 1) : 1;

  $blockUntil = null;
  if($count >= 10){
    $previous = ($row && $row['block_until'] !== null) ? max(60, strtotime($row['block_until']) - strtotime($row['window_start'])) : 30;
    $blockUntil = date('Y-m-d H:i:s', $now + min(3600, $previous * 2));
  }
  $windowStart = $windowOpen ? $row['window_start'] : date('Y-m-d H:i:s', $now);

  $pdo->prepare("INSERT INTO `{$t}` (`ip_hash`,`window_start`,`fail_count`,`block_until`)
                 VALUES (?,?,?,?)
                 ON DUPLICATE KEY UPDATE `window_start`=VALUES(`window_start`),
                                         `fail_count`=VALUES(`fail_count`),
                                         `block_until`=VALUES(`block_until`)")
      ->execute([$ip, $windowStart, $count, $blockUntil]);
}

function riderClearFailures(PDO $pdo){
  $pdo->prepare("DELETE FROM `" . riderTableName('ratelimit') . "` WHERE `ip_hash` = ?")
      ->execute([riderClientIpHash()]);
}

/* Fehlgeschlagene Authentifizierung: zählen, dann abbrechen. Ein
   einziger Aufruf, damit kein Pfad das Zählen vergisst. */
function riderRejectAuth(PDO $pdo, $errorCode){
  riderRecordFailure($pdo);
  apiSendJsonError(403, $errorCode);
}

/* Meter zwischen zwei WGS84-Punkten (Haversine). Dient nur der
   Plausibilitätsmarkierung und blockiert nie einen Check-in — GPS ist
   in Stadtschluchten zu ungenau, um jemanden auszusperren. */
function riderDistanceMeters($lat1, $lon1, $lat2, $lon2){
  $R = 6371000;
  $dLat = deg2rad($lat2 - $lat1);
  $dLon = deg2rad($lon2 - $lon1);
  $a = sin($dLat/2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon/2) ** 2;
  return (int)round($R * 2 * atan2(sqrt($a), sqrt(1 - $a)));
}

/* ================= Admin-Benutzer/Rollen =================
   Zweite Ebene über dem einen geteilten API-Key: der Key bleibt gültig
   (Rückwärtskompatibilität, Ersteinrichtung, jetzt SysAdmin-Äquivalent —
   siehe apiVerifyAccess()), zusätzlich kann sich ein Browser als
   benannter Benutzer mit Rolle anmelden. Bearer-Token statt
   PHP-Session-Cookie — Begründung siehe Migration 4 in migrations.php.

   Rollen liegen NICHT mehr auf admin_user (instanzweit), sondern auf
   org_member (pro Org) — siehe apiOrgMemberRole(). admin_user.is_sysadmin
   ist die einzige instanzweite Sonderrolle, besteht jede Org-Prüfung
   implizit. admin_user.role bleibt als Spalte stehen (nicht idempotent
   entfernbar, siehe Migration 7), wird aber von keiner Abfrage mehr
   gelesen — Rollenwahrheit ist ausschließlich org_member/is_sysadmin.

   checkpoint_staff hat KEINEN Zugriff auf api.php/auth.php-Verwaltung —
   die Rolle wird ausschließlich in rider.php für die Checkpoint-App
   aufgelöst (siehe dort), nie über apiVerifyAccess(). */

function adminTableName($suffix){
  return ALLEYCAT_TABLE . '_' . $suffix;
}

function adminHashToken($token){
  return hash('sha256', (string)$token);
}

function adminGenerateToken(){
  return bin2hex(random_bytes(32));
}

const ADMIN_ROLE_RANK = ['viewer' => 1, 'checkpoint_staff' => 1, 'editor' => 2, 'captain' => 3];

function adminRoleAtLeast($role, $min){
  return ($role !== null) && (ADMIN_ROLE_RANK[$role] ?? 0) >= (ADMIN_ROLE_RANK[$min] ?? 99);
}

function apiResolveOrgId(PDO $pdo, $slug){
  if($slug === '' || $slug === null) return null;
  $stmt = $pdo->prepare("SELECT `id` FROM `" . adminTableName('organization') . "` WHERE `slug` = ?");
  $stmt->execute([$slug]);
  $id = $stmt->fetchColumn();
  return $id === false ? null : (int)$id;
}

function apiRequestOrgSlug(){
  return trim((string)($_SERVER['HTTP_X_ORG_SLUG'] ?? ''));
}

/* Rolle einer Person innerhalb einer bestimmten Org, live nachgeschlagen
   (nie im Token gebacken — siehe checkpointResolveScope() für dasselbe
   Prinzip bei Checkpoints). null = kein Mitglied dieser Org. */
function apiOrgMemberRole(PDO $pdo, $userId, $orgId){
  if($orgId === null) return null;
  $stmt = $pdo->prepare("SELECT `role` FROM `" . adminTableName('org_member') . "` WHERE `org_id` = ? AND `user_id` = ?");
  $stmt->execute([$orgId, $userId]);
  $role = $stmt->fetchColumn();
  return $role === false ? null : $role;
}

/* true, wenn $userId für genau $eventId als Event-Admin delegiert wurde
   (org_event_admin) — gilt als 'editor'-Äquivalent, aber ausschließlich
   für dieses eine Event. */
function apiHasEventDelegation(PDO $pdo, $userId, $eventId){
  if($eventId === null) return false;
  $stmt = $pdo->prepare("SELECT COUNT(*) FROM `" . adminTableName('org_event_admin') . "` WHERE `event_id` = ? AND `user_id` = ?");
  $stmt->execute([$eventId, $userId]);
  return ((int)$stmt->fetchColumn()) > 0;
}

function adminResolveSessionUser(PDO $pdo, $token){
  if($token === '') return null;
  $t = adminTableName('admin_session');
  $u = adminTableName('admin_user');
  $stmt = $pdo->prepare("SELECT u.* FROM `{$t}` s
                         JOIN `{$u}` u ON u.id = s.user_id
                         WHERE s.token_hash = ? AND u.active = 1");
  $stmt->execute([adminHashToken($token)]);
  $user = $stmt->fetch(PDO::FETCH_ASSOC);
  if(!$user) return null;
  $pdo->prepare("UPDATE `{$t}` SET last_seen_at = UTC_TIMESTAMP() WHERE token_hash = ?")
      ->execute([adminHashToken($token)]);
  return $user;
}

/* ================= Checkpoint-App-Helfer =================
   Zwei getrennte Zugangswege für dieselbe Aktion (?a=checkpoint-checkin
   in rider.php), beide über den öffentlich erreichbaren Endpunkt:
     Konten-Modus     X-Admin-Token, Rolle 'checkpoint_staff' — dieselbe
                      Session-Tabelle wie das Admin-Panel, der Umfang
                      (welche Checkpoints) wird live aus
                      checkpoint_staff nachgeschlagen statt im Token
                      eingefroren, damit eine Umzuweisung sofort greift.
     Code-Modus       X-Checkpoint-Token, eigene checkpoint_session-
                      Tabelle, fest auf genau einen Checkpoint begrenzt. */

function checkpointStaffScope(PDO $pdo, $userId, $publicId){
  $t = adminTableName('checkpoint_staff');
  $stmt = $pdo->prepare("SELECT `cp_id` FROM `{$t}` WHERE `user_id` = ? AND `public_id` = ?");
  $stmt->execute([$userId, $publicId]);
  return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

function checkpointResolveCodeSession(PDO $pdo, $token){
  if($token === '') return null;
  $t = adminTableName('checkpoint_session');
  $stmt = $pdo->prepare("SELECT * FROM `{$t}` WHERE `token_hash` = ?");
  $stmt->execute([adminHashToken($token)]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if($row) $pdo->prepare("UPDATE `{$t}` SET last_seen_at = UTC_TIMESTAMP() WHERE token_hash = ?")->execute([adminHashToken($token)]);
  return $row ?: null;
}

/* Löst die aktuelle Anfrage auf einen Geltungsbereich auf: eine Liste
   erlaubter cp_id für die angegebene publicId, plus eine Anzeigekennung
   fürs Log (`staffRef`). Bricht mit 401 ab, wenn keiner der beiden
   Header eine gültige Berechtigung ergibt — bewusst ohne
   riderRejectAuth()/Zähler: das ist die Bremse der Fahrer-Token, ein
   falsch getipptes Checkpoint-Passwort verdient dieselbe Vorsicht nicht
   weniger, aber diese Funktion wird von mehreren Aktionen mit je eigener
   Bremse aufgerufen (siehe rider.php). */
function checkpointResolveScope(PDO $pdo, $publicId){
  $adminToken = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
  if($adminToken !== ''){
    $user = adminResolveSessionUser($pdo, $adminToken);
    if($user && $user['role'] === 'checkpoint_staff'){
      $cpIds = checkpointStaffScope($pdo, (int)$user['id'], $publicId);
      if($cpIds) return ['cpIds' => $cpIds, 'staffRef' => $user['username']];
    }
    return null;
  }
  $cpToken = $_SERVER['HTTP_X_CHECKPOINT_TOKEN'] ?? '';
  if($cpToken !== ''){
    $session = checkpointResolveCodeSession($pdo, $cpToken);
    if($session && $session['public_id'] === $publicId){
      return ['cpIds' => [$session['cp_id']], 'staffRef' => 'code:' . $session['cp_id']];
    }
  }
  return null;
}

/* Prüft Zugriff für die aktuelle Anfrage und bricht mit 401/403 ab, wenn
   nicht ausreichend. $minRole ist die für DIESE Anfrage nötige
   Mindestrolle INNERHALB DER AKTIVEN ORG (aus dem X-Org-Slug-Header).
   $eventId ist optional — wenn gesetzt, zählt zusätzlich zur Org-Rolle
   eine passende org_event_admin-Delegation als 'editor'-Äquivalent.

   Zugangswege, alle vollwertig:
     - X-Api-Key: Master-Key -> SysAdmin-Äquivalent, besteht jede Prüfung
       ohne org_member-Zeile (Top-Down-Vererbung, siehe Spec §4/§6).
     - X-Admin-Token: personalisierte Session -> user.is_sysadmin ODER
       org_member.role für die im Header genannte Org ODER (bei gesetztem
       $eventId) org_event_admin-Delegation.

   Gibt die aufgelöste Rolle inkl. orgId zurück (Aufrufer brauchen die
   Org-ID für jede weitere Query in dieser Anfrage). */
function apiVerifyAccess(PDO $pdo, $minRole = 'viewer', $eventId = null){
  $orgSlug = apiRequestOrgSlug();
  $orgId = apiResolveOrgId($pdo, $orgSlug);

  $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
  if($apiKey !== ''){
    if((defined('ALLEYCAT_API_KEY_HASH') && password_verify($apiKey, ALLEYCAT_API_KEY_HASH))
       || (defined('ALLEYCAT_API_KEY') && hash_equals(ALLEYCAT_API_KEY, $apiKey))){
      return ['role' => 'captain', 'username' => null, 'userId' => null, 'orgId' => $orgId, 'isSysAdmin' => true];
    }
  }

  $adminToken = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
  if($adminToken !== ''){
    $user = adminResolveSessionUser($pdo, $adminToken);
    if($user){
      if((int)$user['is_sysadmin'] === 1){
        return ['role' => 'captain', 'username' => $user['username'], 'userId' => (int)$user['id'], 'orgId' => $orgId, 'isSysAdmin' => true];
      }
      $orgRole = apiOrgMemberRole($pdo, (int)$user['id'], $orgId);
      if($orgRole !== null && adminRoleAtLeast($orgRole, $minRole)){
        return ['role' => $orgRole, 'username' => $user['username'], 'userId' => (int)$user['id'], 'orgId' => $orgId, 'isSysAdmin' => false];
      }
      if(adminRoleAtLeast('editor', $minRole) && apiHasEventDelegation($pdo, (int)$user['id'], $eventId)){
        return ['role' => 'editor', 'username' => $user['username'], 'userId' => (int)$user['id'], 'orgId' => $orgId, 'isSysAdmin' => false];
      }
      apiSendJsonError(403, 'insufficient_role');
    }
  }

  apiSendJsonError(401, 'unauthorized');
}
