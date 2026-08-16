<?php
/* Alleycat Dispatch — Storage-API
   ------------------------------------------------------------------
   Schlanker Key-Value-Endpunkt über der von install.php angelegten
   Tabelle. Spiegelt genau die drei Operationen, die die App über
   storageGet/storageSet/storageDelete schon kennt:

     GET    api.php?key=xyz     -> {"value": "..."} oder 404
     POST   api.php?key=xyz     (Body = Rohwert)     -> {"ok": true}
     DELETE api.php?key=xyz                          -> {"ok": true}

   Auth: Header "X-Api-Key: <key aus config.php>" auf jeder Anfrage.
   ------------------------------------------------------------------ */

$configPath = __DIR__ . '/config.php';
if(!file_exists($configPath)){
  http_response_code(500);
  header('Content-Type: application/json');
  echo json_encode(['error' => 'not_configured', 'message' => 'config.php fehlt — zuerst install.php ausführen.']);
  exit;
}
require $configPath;

header('Access-Control-Allow-Origin: ' . ALLEYCAT_ALLOWED_ORIGIN);
header('Access-Control-Allow-Headers: X-Api-Key, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');

if($_SERVER['REQUEST_METHOD'] === 'OPTIONS'){
  http_response_code(204);
  exit;
}

header('Content-Type: application/json');

$providedKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if(!hash_equals(ALLEYCAT_API_KEY, $providedKey)){
  http_response_code(401);
  echo json_encode(['error' => 'unauthorized']);
  exit;
}

$key = $_GET['key'] ?? '';
if($key === '' || strlen($key) > 191){
  http_response_code(400);
  echo json_encode(['error' => 'invalid_key']);
  exit;
}

try {
  $pdo = new PDO(
    'mysql:host=' . ALLEYCAT_DB_HOST . ';dbname=' . ALLEYCAT_DB_NAME . ';charset=utf8mb4',
    ALLEYCAT_DB_USER, ALLEYCAT_DB_PASS,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
  );
} catch (Exception $e) {
  http_response_code(500);
  echo json_encode(['error' => 'db_connection_failed']);
  exit;
}

$table = ALLEYCAT_TABLE;
$method = $_SERVER['REQUEST_METHOD'];

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
