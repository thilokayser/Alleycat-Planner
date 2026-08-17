<?php
/* Alleycat Dispatch — Migrations-Endpoint
   ------------------------------------------------------------------
   Für bereits installierte Backends: holt neu hinzugekommene Schema-
   Migrationen (migrations.php) nach, ohne dass install.php erneut
   ausgeführt werden muss (der bei der Erstinstallation ohnehin nicht
   mehr existiert, siehe dessen Selbstsperre). API-Key-geschützt,
   POST-only (verändert Zustand).

     POST migrate.php   -> {"ok": true, "applied": [2, 3], "currentVersion": 3}
   ------------------------------------------------------------------ */

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/migrations.php';

apiLoadConfig();
apiSendCorsHeaders();

if($_SERVER['REQUEST_METHOD'] === 'OPTIONS'){
  http_response_code(204);
  exit;
}

header('Content-Type: application/json');

if($_SERVER['REQUEST_METHOD'] !== 'POST'){
  http_response_code(405);
  echo json_encode(['error' => 'method_not_allowed']);
  exit;
}

apiVerifyKey();

if(!defined('ALLEYCAT_META_TABLE')){
  http_response_code(501);
  echo json_encode([
    'error' => 'meta_table_not_configured',
    'message' => 'config.php stammt von vor der Migrations-Funktion. install.php erneut ausführen (neue config.php) oder ALLEYCAT_META_TABLE/ALLEYCAT_CHARSET manuell in config.php ergänzen.'
  ]);
  exit;
}

$charset = defined('ALLEYCAT_CHARSET') ? ALLEYCAT_CHARSET : 'utf8mb4';
$pdo = apiConnectDb();

$applied = runMigrations($pdo, ALLEYCAT_TABLE, ALLEYCAT_META_TABLE, $charset);
echo json_encode([
  'ok' => true,
  'applied' => $applied,
  'currentVersion' => getSchemaVersion($pdo, ALLEYCAT_META_TABLE)
]);
