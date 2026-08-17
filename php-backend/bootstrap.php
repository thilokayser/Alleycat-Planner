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
  header('Access-Control-Allow-Headers: X-Api-Key, Content-Type');
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
