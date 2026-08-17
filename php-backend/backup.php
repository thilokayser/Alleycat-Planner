<?php
/* Alleycat Dispatch — Server-seitiger Backup-Export
   ------------------------------------------------------------------
   Analog zum .sqlite-Export der lokalen Variante: lädt den gesamten
   Inhalt der kv-Tabelle als JSON-Datei herunter, ohne dass CLI-/
   phpMyAdmin-Zugriff auf den Server nötig ist. API-Key-geschützt wie
   api.php, GET-only.

     GET backup.php   -> Datei-Download (Content-Disposition: attachment)
   ------------------------------------------------------------------ */

require __DIR__ . '/bootstrap.php';

apiLoadConfig();
apiSendCorsHeaders();

if($_SERVER['REQUEST_METHOD'] === 'OPTIONS'){
  http_response_code(204);
  exit;
}
if($_SERVER['REQUEST_METHOD'] !== 'GET'){
  header('Content-Type: application/json');
  http_response_code(405);
  echo json_encode(['error' => 'method_not_allowed']);
  exit;
}

apiVerifyKey();

$pdo = apiConnectDb();
$table = ALLEYCAT_TABLE;
$stmt = $pdo->query("SELECT `key`, `value`, `updated_at` FROM `{$table}` ORDER BY `key`");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$dump = [
  'exportedAt' => date('c'),
  'table' => $table,
  'rowCount' => count($rows),
  'rows' => $rows,
];

$filename = 'alleycat-backup-' . date('Y-m-d-His') . '.json';
header('Content-Type: application/json');
header('Content-Disposition: attachment; filename="' . $filename . '"');
echo json_encode($dump, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
