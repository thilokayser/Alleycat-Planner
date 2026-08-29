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
   (Rückwärtskompatibilität, Ersteinrichtung), zusätzlich kann sich ein
   Browser als benannter Benutzer mit Rolle anmelden. Bearer-Token statt
   PHP-Session-Cookie — Begründung siehe Migration 4 in migrations.php.

   Rollen, aufsteigend:
     viewer   nur GET
     editor   GET/POST/DELETE, aber keine Benutzerverwaltung
     admin    alles, inkl. Benutzerverwaltung
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

const ADMIN_ROLE_RANK = ['viewer' => 1, 'editor' => 2, 'admin' => 3];

function adminRoleAtLeast($role, $min){
  return ($role !== null) && (ADMIN_ROLE_RANK[$role] ?? 0) >= (ADMIN_ROLE_RANK[$min] ?? 99);
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
  $pdo->prepare("UPDATE `{$t}` SET last_seen_at = NOW() WHERE token_hash = ?")
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
  if($row) $pdo->prepare("UPDATE `{$t}` SET last_seen_at = NOW() WHERE token_hash = ?")->execute([adminHashToken($token)]);
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
   nicht ausreichend. Zwei Zugangswege, beide vollwertig:
     - X-Api-Key: bestehender Vollzugriffs-Key -> zählt immer als 'admin'.
     - X-Admin-Token: personalisierte Session -> Rolle aus admin_user.
   $minRole ist die für DIESE Anfrage nötige Mindestrolle (z. B. 'editor'
   für einen schreibenden api.php-Aufruf, 'admin' für Benutzerverwaltung).
   Gibt die aufgelöste Rolle zurück (für Aufrufer, die z. B. den
   Benutzernamen fürs Log brauchen). */
function apiVerifyAccess(PDO $pdo, $minRole = 'viewer'){
  $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
  if($apiKey !== ''){
    if(defined('ALLEYCAT_API_KEY_HASH') && password_verify($apiKey, ALLEYCAT_API_KEY_HASH)){
      return ['role' => 'admin', 'username' => null, 'userId' => null];
    }
    if(defined('ALLEYCAT_API_KEY') && hash_equals(ALLEYCAT_API_KEY, $apiKey)){
      return ['role' => 'admin', 'username' => null, 'userId' => null];
    }
  }

  $adminToken = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
  if($adminToken !== ''){
    $user = adminResolveSessionUser($pdo, $adminToken);
    if($user && adminRoleAtLeast($user['role'], $minRole)){
      return ['role' => $user['role'], 'username' => $user['username'], 'userId' => (int)$user['id']];
    }
    if($user){
      apiSendJsonError(403, 'insufficient_role');
    }
  }

  apiSendJsonError(401, 'unauthorized');
}
