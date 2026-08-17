<?php
/* Alleycat Dispatch — Pre-Flight-Check
   ------------------------------------------------------------------
   Automatisierter Umgebungscheck, der install.php vorschaltet und bei
   jeder Installation auf jedem Hoster läuft (nicht nur einmalig gegen
   ein Testsystem) — Ziel ist breite Hosting-Kompatibilität statt
   Einzel-Host-Verifikation. Zwei Gruppen von Checks:

     runPreflightChecks($dir)        — rein lokale PHP-Umgebungswerte,
                                        ohne DB-Verbindung. Läuft schon
                                        beim ersten GET auf install.php.
     runDatabasePreflightChecks($pdo) — DB-spezifische Werte, erst
                                        möglich sobald eine Verbindung
                                        zustande kam. Läuft NACH dem
                                        Verbinden, aber VOR jedem
                                        Schema-Schreibvorgang (CREATE
                                        TABLE etc.).

   Jeder Check liefert ein Array {id, label, level: 'ok'|'warn'|'error',
   detail}. Bewusst Feature-Detection statt Versions-Parsing bei allem,
   was mit der DB zu tun hat (14.3 im Planungsdokument) — MySQL- und
   MariaDB-Versionsnummern bedeuten nicht dasselbe, daher testet
   detectUtf8mb4Support() z. B. per echtem SET NAMES statt eines
   Versionsvergleichs.
   ------------------------------------------------------------------ */

function preflightCheckPhpVersion(){
  $version = PHP_VERSION;
  $ok = version_compare($version, '7.4.0', '>=');
  return [
    'id' => 'php_version',
    'label' => "PHP-Version: {$version} (min. 7.4 erforderlich)",
    'level' => $ok ? 'ok' : 'error',
    'detail' => $ok ? '' : 'Diese PHP-Version wird nicht unterstützt. Beim Hoster auf mindestens PHP 7.4 wechseln (Control-Panel meist unter "PHP-Version auswählen").'
  ];
}

function preflightCheckExtension($ext, $label){
  $ok = extension_loaded($ext);
  return [
    'id' => 'ext_' . $ext,
    'label' => $ok ? "{$label} vorhanden" : "{$label} fehlt",
    'level' => $ok ? 'ok' : 'error',
    'detail' => $ok ? '' : "Die PHP-Extension \"{$ext}\" wird für den Datenbankzugriff benötigt — beim Hoster aktivieren oder Support kontaktieren."
  ];
}

function preflightCheckWritable($dir){
  $ok = is_writable($dir);
  return [
    'id' => 'writable',
    'label' => $ok ? 'Schreibrechte im Zielverzeichnis vorhanden' : 'Keine Schreibrechte im Zielverzeichnis',
    'level' => $ok ? 'ok' : 'error',
    'detail' => $ok ? '' : "\"{$dir}\" ist nicht beschreibbar — config.php kann nicht angelegt werden. Verzeichnisrechte prüfen (meist 755, per FTP/Dateimanager änderbar)."
  ];
}

function preflightParseSizeToBytes($val){
  $val = trim((string)$val);
  if($val === '' || $val === '-1') return -1;
  $unit = strtolower(substr($val, -1));
  $num = (int)$val;
  switch($unit){
    case 'g': $num *= 1024 * 1024 * 1024; break;
    case 'm': $num *= 1024 * 1024; break;
    case 'k': $num *= 1024; break;
  }
  return $num;
}

function preflightCheckMaxExecutionTime(){
  $raw = (string)ini_get('max_execution_time');
  $seconds = (int)$raw;
  $ok = $seconds === 0 || $seconds >= 30;
  return [
    'id' => 'max_execution_time',
    'label' => 'max_execution_time: ' . ($seconds === 0 ? 'unbegrenzt' : "{$seconds}s"),
    'level' => $ok ? 'ok' : 'warn',
    'detail' => $ok ? '' : 'Empfohlen: mindestens 30s, sonst können Backups/Exporte bei großen Events fehlschlagen. In php.ini oder per .htaccess/php_value erhöhbar, sofern der Hoster das erlaubt.'
  ];
}

function preflightCheckMemoryLimit(){
  $raw = (string)ini_get('memory_limit');
  $bytes = preflightParseSizeToBytes($raw);
  $ok = $bytes === -1 || $bytes >= 64 * 1024 * 1024;
  return [
    'id' => 'memory_limit',
    'label' => "memory_limit: {$raw}",
    'level' => $ok ? 'ok' : 'warn',
    'detail' => $ok ? '' : 'Empfohlen: mindestens 64M für komfortablen Betrieb bei größeren Events.'
  ];
}

function runPreflightChecks($dir){
  return [
    preflightCheckPhpVersion(),
    preflightCheckExtension('pdo_mysql', 'PDO MySQL Extension'),
    preflightCheckExtension('json', 'JSON Extension'),
    preflightCheckWritable($dir),
    preflightCheckMaxExecutionTime(),
    preflightCheckMemoryLimit(),
  ];
}

/* Feature-Detection statt Versionsvergleich: ein echter SET-NAMES-Versuch
   sagt zuverlässig, ob der Server (und die Verbindung/der Nutzer) utf8mb4
   kann — robuster als jede Versionsheuristik über MySQL/MariaDB-Forks
   hinweg. */
function detectUtf8mb4Support(PDO $pdo){
  try {
    $pdo->exec('SET NAMES utf8mb4');
    return true;
  } catch (Exception $e) {
    return false;
  }
}

function preflightCheckUtf8mb4(PDO $pdo){
  $supported = detectUtf8mb4Support($pdo);
  return [
    'id' => 'utf8mb4',
    'label' => $supported ? 'utf8mb4 verfügbar' : 'utf8mb4 nicht verfügbar — Fallback auf utf8',
    'level' => $supported ? 'ok' : 'warn',
    'detail' => $supported ? '' : 'Emoji-Icons (Icon-Pack "Emoji" in den App-Einstellungen) könnten dann eingeschränkt/verstümmelt dargestellt werden — Font-Awesome- oder Material-Icon-Pack als Alternative.'
  ];
}

function preflightCheckMysqlVersion(PDO $pdo){
  try {
    $version = $pdo->query('SELECT VERSION()')->fetchColumn();
  } catch (Exception $e) {
    $version = null;
  }
  return [
    'id' => 'mysql_version',
    'label' => $version ? "MySQL/MariaDB-Version: {$version}" : 'MySQL/MariaDB-Version konnte nicht ermittelt werden',
    'level' => $version ? 'ok' : 'warn',
    'detail' => ''
  ];
}

function runDatabasePreflightChecks(PDO $pdo){
  return [
    preflightCheckMysqlVersion($pdo),
    preflightCheckUtf8mb4($pdo),
  ];
}

function preflightOverallLevel(array $checks){
  $hasError = false;
  $hasWarn = false;
  foreach($checks as $c){
    if($c['level'] === 'error') $hasError = true;
    if($c['level'] === 'warn') $hasWarn = true;
  }
  if($hasError) return 'error';
  if($hasWarn) return 'warn';
  return 'ok';
}

function renderPreflightChecklistHtml(array $checks){
  $icons = ['ok' => '✅', 'warn' => '⚠️', 'error' => '❌'];
  $html = '<div class="preflight-list">';
  foreach($checks as $c){
    $icon = $icons[$c['level']];
    $html .= '<div class="preflight-row preflight-' . htmlspecialchars($c['level']) . '">';
    $html .= '<span class="preflight-icon">' . $icon . '</span>';
    $html .= '<span class="preflight-label">' . htmlspecialchars($c['label']) . '</span>';
    if($c['detail'] !== ''){
      $html .= '<div class="preflight-detail">' . htmlspecialchars($c['detail']) . '</div>';
    }
    $html .= '</div>';
  }
  $html .= '</div>';
  return $html;
}
