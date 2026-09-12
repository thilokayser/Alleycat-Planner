<?php
/* Alleycat Dispatch — Installer
   ------------------------------------------------------------------
   Einmalig aufrufen, um die MySQL-Datenbank für den PHP-Backend
   einzurichten. Läuft zuerst einen Pre-Flight-Check (preflight.php,
   siehe dort — lokale PHP-Umgebungswerte sofort, DB-spezifische Werte
   sobald eine Verbindung zustande kam), wendet dann die Schema-
   Migrationen an (migrations.php), generiert einen API-Key (nur
   gehasht dauerhaft gespeichert) und schreibt config.php. Versucht
   sich danach selbst zu löschen (Selbstsperre) — falls das aus
   Rechte-Gründen fehlschlägt, bleibt der Warnhinweis unten als
   Fallback, install.php manuell zu entfernen.
   ------------------------------------------------------------------ */

require __DIR__ . '/preflight.php';
require __DIR__ . '/migrations.php';

function installWriteHtaccessBlock($dir){
  $marker = '# BEGIN alleycat-pretty-urls';
  $endMarker = '# END alleycat-pretty-urls';
  /* Die beiden zusätzlichen Bedingungen halten das Backend-Verzeichnis und
     alle .php-Aufrufe aus dem Rewrite heraus: fehlende Backend-Dateien
     (z. B. install.php nach der Selbstsperre) müssen einen echten 404
     liefern statt der kompletten Organizer-App mit HTTP 200. */
  $backendDir = str_replace(['\\', '.', '+', '*', '?', '[', ']', '^', '$', '(', ')', '{', '}', '|'], ['\\\\', '\\.', '\\+', '\\*', '\\?', '\\[', '\\]', '\\^', '\\$', '\\(', '\\)', '\\{', '\\}', '\\|'], basename(__DIR__));
  $block = "{$marker}\n<IfModule mod_rewrite.c>\nRewriteEngine On\nRewriteCond %{REQUEST_URI} !/{$backendDir}/\nRewriteCond %{REQUEST_URI} !\\.php$\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteRule ^([a-z0-9-]+)/(.*)$ alleycat-dispatch-server.html [L]\n</IfModule>\n{$endMarker}\n";
  $path = rtrim($dir, '/') . '/.htaccess';
  $existing = file_exists($path) ? file_get_contents($path) : '';
  if(strpos($existing, $marker) !== false){
    $existing = preg_replace('/' . preg_quote($marker, '/') . '.*?' . preg_quote($endMarker, '/') . "\n?/s", $block, $existing);
  } else {
    $existing = rtrim($existing) . "\n\n" . $block;
  }
  $ok = @file_put_contents($path, ltrim($existing));
  return $ok !== false;
}

$configPath = __DIR__ . '/config.php';
$alreadyInstalled = file_exists($configPath);

$error = '';
$success = null;
$dbChecks = [];
$localChecks = runPreflightChecks(__DIR__);
$localOverall = preflightOverallLevel($localChecks);
$override = isset($_POST['preflight_override']);
$selfDeleteFailed = false;

if($_SERVER['REQUEST_METHOD'] === 'POST' && !$alreadyInstalled){
  $host = trim($_POST['db_host'] ?? '');
  $name = trim($_POST['db_name'] ?? '');
  $user = trim($_POST['db_user'] ?? '');
  $pass = (string)($_POST['db_pass'] ?? '');
  $prefix = trim($_POST['table_prefix'] ?? 'alleycat_');
  $prefix = preg_replace('/[^a-zA-Z0-9_]/', '', $prefix);

  $adminUser = trim($_POST['admin_user'] ?? '');
  $adminPass = (string)($_POST['admin_pass'] ?? '');
  $adminPass2 = (string)($_POST['admin_pass2'] ?? '');
  $adminDisplay = trim($_POST['admin_display'] ?? '');

  if($host === '' || $name === '' || $user === ''){
    $error = 'Bitte Host, Datenbankname und Benutzer ausfüllen.';
  } elseif($adminUser === ''){
    $error = 'Bitte einen Benutzernamen für das erste Admin-Konto angeben.';
  } elseif(strlen($adminPass) < 12){
    /* Dieselbe Regel wie authPasswordValid() in auth.php und
       validatePasswordStrength() in src/core/auth.js — hier bewusst
       dupliziert statt auth.php einzubinden: das würde bootstrap.php und
       damit die config.php voraussetzen, die es an dieser Stelle noch
       nicht gibt. */
    $error = 'Das Admin-Passwort muss mindestens 12 Zeichen lang sein.';
  } elseif($adminPass !== $adminPass2){
    $error = 'Die beiden Admin-Passwörter stimmen nicht überein.';
  } elseif($localOverall === 'error' && !$override){
    $error = 'Der Pre-Flight-Check zeigt kritische Fehler (siehe unten) — Installation abgebrochen. Entweder die Probleme beheben oder "Trotzdem installieren" aktivieren.';
  } else {
    try {
      // Verbindung zunächst ohne festen Charset — welcher Charset (utf8mb4
      // oder Fallback utf8) tatsächlich verwendet wird, entscheidet gleich
      // die Feature-Detection in detectUtf8mb4Support(), nicht eine
      // Versionsannahme.
      $pdo = new PDO("mysql:host={$host};dbname={$name}", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      ]);

      $dbChecks = runDatabasePreflightChecks($pdo);
      $overallLevel = preflightOverallLevel(array_merge($localChecks, $dbChecks));

      if($overallLevel === 'error' && !$override){
        $error = 'Der Pre-Flight-Check zeigt kritische Fehler (siehe unten) — Installation abgebrochen. Entweder die Probleme beheben oder "Trotzdem installieren" aktivieren.';
      } else {
        $charset = detectUtf8mb4Support($pdo) ? 'utf8mb4' : 'utf8';
        $pdo->exec("SET NAMES {$charset}");

        $table = $prefix . 'kv';
        $metaTable = $prefix . 'db_meta';
        runMigrations($pdo, $table, $metaTable, $charset);

        /* Erstes Admin-Konto direkt hier anlegen, statt den Betreiber auf
           den separaten Bootstrap-Schritt (auth.php?a=bootstrap) zu
           schicken: sonst ist der Master-Key nach der Installation der
           einzige Zugang, und wer die App auf einem zweiten Gerät öffnet,
           müsste ihn dort eintragen — also Vollzugriff weiterreichen.
           Insert wortgleich zum Bootstrap-Zweig in auth.php. */
        $userTable = $table . '_admin_user'; // adminTableName() in bootstrap.php, hier ohne config.php nachgebildet
        $existingUsers = (int)$pdo->query("SELECT COUNT(*) FROM `{$userTable}`")->fetchColumn();
        $adminCreated = false;
        if($existingUsers === 0){
          $pdo->prepare("INSERT INTO `{$userTable}` (`username`,`password_hash`,`role`,`display_name`,`is_sysadmin`)
                         VALUES (?,?,'captain',?,1)")
              ->execute([$adminUser, password_hash($adminPass, PASSWORD_DEFAULT), $adminDisplay !== '' ? $adminDisplay : $adminUser]);
          $adminCreated = true;
        }

        $apiKey = bin2hex(random_bytes(32));
        $apiKeyHash = password_hash($apiKey, PASSWORD_DEFAULT);

        $configContent = "<?php\n"
          . "// Automatisch von install.php erzeugt am " . date('Y-m-d H:i:s') . "\n"
          . "// Diese Datei NICHT öffentlich zugänglich machen (siehe .htaccess).\n"
          . "// Enthält bewusst NICHT den API-Key selbst, nur seinen Hash — der\n"
          . "// Klartext-Key wurde nur einmal auf der Erfolgsseite angezeigt.\n"
          . "define('ALLEYCAT_DB_HOST', " . var_export($host, true) . ");\n"
          . "define('ALLEYCAT_DB_NAME', " . var_export($name, true) . ");\n"
          . "define('ALLEYCAT_DB_USER', " . var_export($user, true) . ");\n"
          . "define('ALLEYCAT_DB_PASS', " . var_export($pass, true) . ");\n"
          . "define('ALLEYCAT_TABLE', " . var_export($table, true) . ");\n"
          . "define('ALLEYCAT_META_TABLE', " . var_export($metaTable, true) . ");\n"
          . "define('ALLEYCAT_CHARSET', " . var_export($charset, true) . ");\n"
          . "define('ALLEYCAT_API_KEY_HASH', " . var_export($apiKeyHash, true) . ");\n"
          . "define('ALLEYCAT_ALLOWED_ORIGIN', '*'); // bei Bedarf auf deine Domain einschränken\n";

        if(file_put_contents($configPath, $configContent) === false){
          throw new Exception('config.php konnte nicht geschrieben werden — Schreibrechte im Ordner prüfen.');
        }
        @chmod($configPath, 0600);

        $htaccessOk = installWriteHtaccessBlock(__DIR__ . '/..');

        $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $apiUrl = $scheme . '://' . $_SERVER['HTTP_HOST'] . $scriptDir . '/api.php';

        $success = ['apiKey' => $apiKey, 'apiUrl' => $apiUrl, 'table' => $table, 'charset' => $charset,
                    'adminUser' => $adminUser, 'adminCreated' => $adminCreated, 'htaccessOk' => $htaccessOk];

        // Selbstsperre: bestmöglicher Versuch, sich selbst vom Server zu
        // löschen. Schlägt das aus Rechte-Gründen fehl (nicht unüblich bei
        // Shared Hosting), bleibt der Warnhinweis unten als Fallback.
        $selfDeleteFailed = !@unlink(__FILE__);
      }
    } catch (Exception $e) {
      $error = 'Verbindung/Setup fehlgeschlagen: ' . htmlspecialchars($e->getMessage());
    }
  }
}

$showPreflightError = ($localOverall === 'error') || ($dbChecks && preflightOverallLevel($dbChecks) === 'error');
$showPreflightWarn = !$showPreflightError && (($localOverall === 'warn') || ($dbChecks && preflightOverallLevel($dbChecks) === 'warn'));
?>
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Alleycat Dispatch — Installer</title>
<style>
  :root{ --asphalt:#17191a; --asphalt-2:#212425; --asphalt-3:#2b2f31; --chalk:#f3f1e8; --hivis:#ff5f1f; --hivis-2:#ff8a3d; --steel:#7c8388; --stamp:#b23a2e; --ok:#5c8a5c; }
  *{box-sizing:border-box;}
  body{margin:0; background:var(--asphalt); color:var(--chalk); font-family:-apple-system,'Segoe UI',Inter,sans-serif; padding:40px 20px;}
  .card{max-width:560px; margin:0 auto; background:var(--asphalt-2); border:1px solid var(--asphalt-3); border-top:3px solid var(--hivis); border-radius:6px; padding:32px;}
  h1{font-size:22px; margin:0 0 4px;}
  .sub{color:var(--steel); font-size:13px; margin-bottom:24px; font-family:monospace;}
  label{display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin:14px 0 4px;}
  input[type=text], input[type=password]{
    width:100%; padding:9px 10px; border-radius:3px; border:1px solid var(--asphalt-3);
    background:var(--asphalt); color:var(--chalk); font-size:14px; font-family:monospace;
  }
  button{margin-top:22px; width:100%; padding:12px; border-radius:3px; border:1px solid var(--hivis);
    background:var(--hivis); color:#1a1400; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;
    font-size:14px; cursor:pointer;}
  button:hover{background:var(--hivis-2);}
  .error{background:rgba(178,58,46,0.15); border:1px solid var(--stamp); color:#ff9a8f; padding:12px 14px; border-radius:4px; font-size:13px; margin-bottom:10px;}
  .ok-box{background:rgba(92,138,92,0.15); border:1px solid var(--ok); border-radius:4px; padding:16px; margin-bottom:16px;}
  .ok-box h2{margin:0 0 8px; font-size:15px; color:var(--ok);}
  .kv{font-family:monospace; font-size:12.5px; background:var(--asphalt); border:1px solid var(--asphalt-3); border-radius:3px; padding:10px 12px; word-break:break-all; margin-bottom:8px;}
  .kv b{display:block; font-size:10px; text-transform:uppercase; color:var(--steel); margin-bottom:3px; letter-spacing:0.06em;}
  .warn{background:rgba(255,138,61,0.12); border:1px solid var(--hivis); color:var(--hivis-2); padding:12px 14px; border-radius:4px; font-size:13px; margin-top:16px;}
  .hint{color:var(--steel); font-size:12px; margin-top:6px; line-height:1.5;}
  a{color:var(--hivis-2);}
  .preflight-heading{font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin:0 0 8px;}
  .preflight-list{margin-bottom:6px;}
  .preflight-row{padding:7px 0; border-bottom:1px solid var(--asphalt-3); font-size:13px;}
  .preflight-row:last-child{border-bottom:none;}
  .preflight-icon{margin-right:8px;}
  .preflight-error .preflight-label{color:#ff9a8f;}
  .preflight-warn .preflight-label{color:var(--hivis-2);}
  .preflight-detail{font-size:11.5px; color:var(--steel); margin:3px 0 0 22px; line-height:1.4;}
  .override-row{display:flex; align-items:flex-start; gap:8px; margin-top:14px; font-size:12.5px; color:var(--steel);}
  .override-row input{margin-top:2px;}
</style>
</head>
<body>
  <div class="card">
    <h1>Alleycat Dispatch</h1>
    <div class="sub">Backend-Installer</div>

    <?php if($alreadyInstalled && !$success): ?>
      <div class="error">
        Es existiert bereits eine <code>config.php</code> in diesem Ordner — die Installation wurde schon durchgeführt.
        Um neu zu installieren (z. B. mit anderer Datenbank), lösche zuerst <code>config.php</code> manuell per FTP/Dateimanager und lade diese Seite neu.
      </div>
    <?php elseif($success): ?>
      <div class="ok-box">
        <h2>Installation erfolgreich</h2>
        <div class="hint">Tabelle <code><?= htmlspecialchars($success['table']) ?></code> wurde angelegt (falls sie nicht schon existierte), Zeichensatz <code><?= htmlspecialchars($success['charset']) ?></code>.</div>
      </div>
      <div class="kv"><b>Anmeldung</b><?php if($success['adminCreated']): ?>Admin-Konto <code><?= htmlspecialchars($success['adminUser']) ?></code> wurde angelegt — App aufrufen und damit anmelden.<?php else: ?>Es existierten bereits Benutzerkonten in dieser Datenbank — es wurde kein neues Konto angelegt. Melde dich mit einem bestehenden Konto an.<?php endif; ?></div>
      <div class="kv"><b>API-Endpunkt</b><?= htmlspecialchars($success['apiUrl']) ?></div>
      <div class="kv"><b>API-Key — nur aufbewahren, nicht in die App eintragen (jetzt kopieren, wird nicht erneut angezeigt, nur ein Hash bleibt gespeichert)</b><?= htmlspecialchars($success['apiKey']) ?></div>
      <div class="hint">Der API-Key ist der Notfall-/Wartungszugang (<code>backup.php</code>, <code>migrate.php</code>) und gibt Vollzugriff. Für den Alltag reicht das Admin-Konto oben.</div>
      <div class="hint">Nach der Anmeldung wird die App auf das Instance-Panel (<code>#/instance</code>) weiterleiten — dort muss die erste Organisation angelegt werden, bevor Veranstaltungen erstellt werden können.</div>
      <?php if($success['htaccessOk']): ?>
        <p>Hübsche URLs (<code>/<wbr>&lt;org-slug&gt;/...</code>) wurden versuchsweise eingerichtet — falls dein Hosting kein Apache/mod_rewrite nutzt, funktioniert die App trotzdem unverändert über die Hash-URL.</p>
      <?php else: ?>
        <p>Konnte keine .htaccess schreiben (Berechtigungen?) — kein Problem, die App funktioniert vollständig über die Hash-URL (<code>#/org/<wbr>&lt;slug&gt;/...</code>).</p>
      <?php endif; ?>
      <?php if($selfDeleteFailed): ?>
        <div class="warn">
          Wichtig: <code>install.php</code> konnte sich nicht selbst löschen (fehlende Schreibrechte) — bitte jetzt manuell per FTP/Dateimanager vom Server entfernen. Danach die App aufrufen und mit dem Admin-Konto anmelden.
        </div>
      <?php else: ?>
        <div class="warn">
          <code>install.php</code> hat sich selbst vom Server gelöscht. Ruf jetzt die App auf und melde dich mit dem Admin-Konto an — liegt sie auf derselben Domain, findet sie den API-Endpunkt selbst.
        </div>
      <?php endif; ?>
    <?php else: ?>
      <div class="preflight-heading">Umgebungscheck</div>
      <?= renderPreflightChecklistHtml($localChecks) ?>
      <?php if($dbChecks): ?><?= renderPreflightChecklistHtml($dbChecks) ?><?php endif; ?>

      <?php if($error): ?><div class="error"><?= $error /* bereits escaped zusammengesetzt */ ?></div><?php endif; ?>
      <form method="post">
        <label>Datenbank-Host</label>
        <input type="text" name="db_host" value="<?= htmlspecialchars($_POST['db_host'] ?? 'localhost') ?>" required>

        <label>Datenbank-Name</label>
        <input type="text" name="db_name" value="<?= htmlspecialchars($_POST['db_name'] ?? '') ?>" required>

        <label>Datenbank-Benutzer</label>
        <input type="text" name="db_user" value="<?= htmlspecialchars($_POST['db_user'] ?? '') ?>" required>

        <label>Datenbank-Passwort</label>
        <input type="password" name="db_pass" value="">

        <label>Tabellen-Prefix (optional)</label>
        <input type="text" name="table_prefix" value="<?= htmlspecialchars($_POST['table_prefix'] ?? 'alleycat_') ?>">
        <div class="hint">Datenbank und Benutzer müssen bereits existieren (z. B. über das Hosting-Control-Panel angelegt) — der Installer erstellt nur die Tabellen darin.</div>

        <div class="preflight-heading" style="margin-top:26px;">Erstes Admin-Konto</div>
        <div class="hint">Mit diesem Konto meldest du dich später in der App an — auf jedem Gerät, ohne den API-Key weiterzugeben.</div>

        <label>Benutzername</label>
        <input type="text" name="admin_user" value="<?= htmlspecialchars($_POST['admin_user'] ?? '') ?>" required>

        <label>Passwort (mindestens 12 Zeichen)</label>
        <input type="password" name="admin_pass" value="" required>

        <label>Passwort wiederholen</label>
        <input type="password" name="admin_pass2" value="" required>

        <label>Anzeigename (optional)</label>
        <input type="text" name="admin_display" value="<?= htmlspecialchars($_POST['admin_display'] ?? '') ?>">

        <?php if($showPreflightError || $showPreflightWarn): ?>
          <label class="override-row">
            <input type="checkbox" name="preflight_override" value="1" <?= $override ? 'checked' : '' ?>>
            <span>Trotzdem installieren, auch wenn der Umgebungscheck oben Probleme zeigt (<?= $showPreflightError ? 'inkl. kritischer Fehler' : 'nur Warnungen' ?>).</span>
          </label>
        <?php endif; ?>

        <button type="submit">Datenbank einrichten</button>
      </form>
    <?php endif; ?>
  </div>
</body>
</html>
