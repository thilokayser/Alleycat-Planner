# Spokecard-Claiming-Flow (Persistente Fahrer-Konten) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fahrer bekommen ein instanzweites, persistentes Konto (E-Mail+Passwort), mit dem sie eine Spokecard/Startnummer vor oder nach dem Rennen an ihr Konto "claimen" können, um eine Teilnahme-Historie über mehrere Events/Orgs hinweg zu sammeln — inklusive Passwort-Reset per E-Mail.

**Architecture:** Neue Tabellen (`rider_user`/`rider_session`/`rider_claim`/`rider_password_reset`) neben den bestehenden Fahrer-Tabellen, alle instanzweit (kein `org_id`). Neue Actions in `rider.php` (Konto-Auth, Claim, Historie) authentifizieren mit einem neuen Bearer-Header (`X-Rider-Auth-Token`) UND — beim Claim — zusätzlich mit dem bereits bestehenden Slot-Token/Code-Nachweis. Passwort-Reset läuft über einen neuen, minimalen SMTP-Client ohne Vendor-Library, Konfiguration liegt instanzweit im bestehenden generischen KV-Store. Die Fahrer-App (`dist/alleycat-rider.html`) bekommt neue Screens (Login/Register/Passwort-vergessen/Reset/Profil-Historie) und einen Claim-Button auf dem Home-Screen.

**Tech Stack:** Plain PHP+PDO/MySQL (`php-backend/`), Plain JS ohne Framework (`src/rider/*.js`, `src/core/rider-qr.js`), gebaut über `build.js` (RIDER_FILES).

**Spec:** [docs/superpowers/specs/2026-09-08-spokecard-claiming-design.md](../specs/2026-09-08-spokecard-claiming-design.md)

## Global Constraints

- **Nur Servervariante.** Kein Berührungspunkt mit der lokalen Variante, kein Seam-Update dort nötig.
- **Alle vier neuen Tabellen sind instanzweit** — keine `org_id`-Spalte, keine Org-Filterung. Ein Fahrer-Konto gehört keiner Org.
- **Claim braucht IMMER den bestehenden Slot-Nachweis** (`X-Rider-Token`/`X-Rider-Code`, wie bei `?a=me`) zusätzlich zur Session — bloßes Eingeloggtsein reicht nie, um eine Startnummer zu beanspruchen.
- **Erneutes Claimen überschreibt** (`ON DUPLICATE KEY UPDATE`) statt abzulehnen — wer den Token/Code kennt, hat dieselbe Autorität wie der vorherige Claimer.
- **Reset invalidiert alle Sessions** des betroffenen Kontos.
- **Enumeration-Schutz:** `rider-forgot` antwortet immer identisch, unabhängig davon, ob die E-Mail existiert. `rider-login` gibt bei falscher E-Mail und falschem Passwort dieselbe Fehlermeldung.
- **SMTP-Client ist eigener, minimaler Code** (`stream_socket_client`, kein Composer/Vendor-Library) — passt zum bestehenden Projekt-Prinzip ohne PHP-Abhängigkeiten.
- **Bestehender anonymer `?a=claim`-Flow (Selbstregistrierung ohne Konto) bleibt unverändert.**
- **Passwort-Policy:** identisch zur bestehenden Regel in `auth.php` (`authPasswordValid()`, mind. 12 Zeichen, NIST SP 800-63B statt Zeichenklassen-Zwang).
- **Token-Hashing:** SHA-256 ohne Salt für alle kryptografisch zufälligen Token (Session-Token, Reset-Token) — gleiche Begründung wie bei bestehenden Fahrer-/Admin-Tokens (kein schwaches Geheimnis zu strecken). Passwörter selbst weiterhin mit `password_hash()`/bcrypt.
- **Rider-Session-Tabelle folgt dem Muster von `admin_session`/`checkpoint_session`: kein `expires_at`** — Sessions laufen nicht automatisch ab, nur Logout/Reset löscht sie. (Ruling: der Spec-Entwurf nannte `expires_at`, aber beide bestehenden Bearer-Session-Tabellen im Projekt haben keine Ablaufzeit — dieses Muster wird hier bewusst fortgesetzt statt eine dritte, abweichende Variante einzuführen.)

---

### Task 1: Migration 11 — Datenbank-Schema

**Files:**
- Modify: `php-backend/migrations.php` (in `migrationsList()`, neuer Eintrag `11 => function(...)`)

**Interfaces:**
- Produces: Tabellen `{prefix}_rider_user`, `{prefix}_rider_session`, `{prefix}_rider_claim`, `{prefix}_rider_password_reset` — Spaltennamen und Typen wie unten, verbindlich für alle folgenden Tasks.

- [ ] **Step 1: Migration ergänzen**

Füge am Ende von `migrationsList()` (nach Eintrag `10 =>`, vor der schließenden `];`) diesen Eintrag ein:

```php
    /* Persistente Fahrer-Konten (Spokecard-Claiming-Flow). Vier neue
       Tabellen, alle instanzweit — ein Fahrer-Konto gehört keiner Org,
       anders als admin_user/checkpoint_staff. rider_claim macht eine
       bereits gedruckte Spokecard (public_id,bib, siehe rider_slot aus
       Migration 2) einem Konto zugehörig; die unclaimte rider_slot-Zeile
       selbst ist bereits das "Ghost-Profil" — kein zusätzliches Feld
       dafür nötig.

       rider_session hat bewusst kein expires_at, genau wie admin_session/
       checkpoint_session: Sessions laufen nicht automatisch ab, nur
       Logout oder ein Passwort-Reset (siehe rider_password_reset) löschen
       sie. */
    11 => function(PDO $pdo) use ($table, $charset){
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_rider_user` (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `email` VARCHAR(191) NOT NULL,
        `password_hash` VARCHAR(255) NOT NULL,
        `display_name` VARCHAR(191) NOT NULL DEFAULT '',
        `status` VARCHAR(16) NOT NULL DEFAULT 'active',
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_email` (`email`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_rider_session` (
        `token_hash` CHAR(64) NOT NULL PRIMARY KEY,
        `rider_user_id` INT UNSIGNED NOT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `last_seen_at` DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      /* PK (public_id,bib) statt eigener id-Spalte: ein Slot claimt sich
         zu genau einem Konto, wie bei rider_slot selbst. Erneutes
         Claimen (ON DUPLICATE KEY UPDATE, siehe rider.php) überschreibt
         den vorherigen Owner — wer Token/Code kennt, hat die Autorität. */
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_rider_claim` (
        `public_id` VARCHAR(16) NOT NULL,
        `bib` INT UNSIGNED NOT NULL,
        `rider_user_id` INT UNSIGNED NOT NULL,
        `claimed_at` DATETIME NOT NULL,
        PRIMARY KEY (`public_id`, `bib`),
        KEY `idx_rider_user` (`rider_user_id`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_rider_password_reset` (
        `token_hash` CHAR(64) NOT NULL PRIMARY KEY,
        `rider_user_id` INT UNSIGNED NOT NULL,
        `expires_at` DATETIME NOT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");
    },
```

- [ ] **Step 2: Von Hand gegen Scratch-DB verifizieren**

Kein automatischer Test für Migrationen im Projekt (siehe `php-backend/COMPATIBILITY.md`-Konvention). Von Hand:

```bash
mysql -u root -e "CREATE DATABASE alleycat_scratch_t1; CREATE USER IF NOT EXISTS 'alleycat_scratch'@'localhost' IDENTIFIED BY 'scratch'; GRANT ALL ON alleycat_scratch_t1.* TO 'alleycat_scratch'@'localhost';"
```

Dann `install.php` gegen diese Scratch-DB laufen lassen (Setup-Formular, `php -S localhost:8000 -t php-backend`), danach:

```bash
mysql -u alleycat_scratch -pscratch alleycat_scratch_t1 -e "SHOW TABLES LIKE '%rider_user%'; SHOW TABLES LIKE '%rider_session%'; SHOW TABLES LIKE '%rider_claim%'; SHOW TABLES LIKE '%rider_password_reset%'; DESCRIBE alleycat_kv_rider_claim;"
```

Erwartet: alle vier Tabellen existieren, `rider_claim` hat den zusammengesetzten Primärschlüssel `(public_id,bib)`.

- [ ] **Step 3: Commit**

```bash
git add php-backend/migrations.php
git commit -m "feat: add rider account tables (migration 11)"
```

---

### Task 2: bootstrap.php — Konto-Session-Helfer + CORS-Header

**Files:**
- Modify: `php-backend/bootstrap.php` (neue Helfer-Sektion nach den bestehenden Fahrer-Helfern, ca. Zeile 200; CORS-Header-Zeile 46)

**Interfaces:**
- Consumes: `riderTableName()`, `riderHashToken()` (bestehend, Zeilen 88-99)
- Produces: `riderUserGenerateToken()`, `riderUserResolveSession(PDO $pdo)` — Rückgabe `['id','email','displayName']` oder `null`; `riderEmailValid($email)` — bool

- [ ] **Step 1: CORS-Allow-List erweitern**

In `apiSendCorsHeaders()` (Zeile 46), ersetze:

```php
  header('Access-Control-Allow-Headers: X-Api-Key, X-Rider-Token, X-Rider-Code, X-Admin-Token, X-Checkpoint-Token, X-Org-Slug, Content-Type');
```

durch:

```php
  header('Access-Control-Allow-Headers: X-Api-Key, X-Rider-Token, X-Rider-Code, X-Rider-Auth-Token, X-Admin-Token, X-Checkpoint-Token, X-Org-Slug, Content-Type');
```

- [ ] **Step 2: Helfer-Funktionen ergänzen**

Nach `riderClearFailures()` (Zeile 190-193), vor der `/* Meter zwischen zwei WGS84-Punkten */`-Sektion, einfügen:

```php
/* ================= Fahrer-Konten (Spokecard-Claiming) =================
   Eigener Bearer-Header (X-Rider-Auth-Token), getrennt von X-Rider-Token
   (Slot-Nachweis) und X-Admin-Token (Organizer-Rolle) — ein Fahrer-Konto
   ist keins von beidem: instanzweit, ohne Org-Bezug, ohne Rolle. */

function riderUserGenerateToken(){
  return bin2hex(random_bytes(32));
}

function riderEmailValid($email){
  return is_string($email) && strlen($email) <= 191
      && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/* Löst die eingeloggte Session auf, oder null. Kein riderRejectAuth()
   hier drin — die Aufrufer entscheiden selbst, ob eine fehlende Session
   ein 401 oder (bei ?a=rider-claim) einen anderen Fehlercode auslöst. */
function riderUserResolveSession(PDO $pdo){
  $token = (string)($_SERVER['HTTP_X_RIDER_AUTH_TOKEN'] ?? '');
  if($token === '') return null;
  $stmt = $pdo->prepare(
    "SELECT u.`id`, u.`email`, u.`display_name`, u.`status`
     FROM `" . riderTableName('session') . "` s
     JOIN `" . riderTableName('user') . "` u ON u.`id` = s.`rider_user_id`
     WHERE s.`token_hash` = ?"
  );
  $stmt->execute([riderHashToken($token)]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if(!$row || $row['status'] !== 'active') return null;
  $pdo->prepare("UPDATE `" . riderTableName('session') . "` SET `last_seen_at` = UTC_TIMESTAMP() WHERE `token_hash` = ?")
      ->execute([riderHashToken($token)]);
  return ['id' => (int)$row['id'], 'email' => $row['email'], 'displayName' => $row['display_name']];
}

/* Bricht mit 401 ab, wenn keine gültige Session vorliegt. Eigener Helfer
   analog zu riderRejectAuth(), aber ohne die Fehlversuch-Bremse: ein
   fehlendes/abgelaufenes Session-Token ist kein Rateraten-Versuch auf ein
   Geheimnis, sondern der Normalfall bei jedem Neustart der App ohne
   gespeicherte Session. */
function riderUserRequireSession(PDO $pdo){
  $session = riderUserResolveSession($pdo);
  if(!$session) apiSendJsonError(401, 'not_logged_in');
  return $session;
}
```

- [ ] **Step 2: Manuell verifizieren**

Kein Unit-Test-Runner im PHP-Backend (Projektkonvention: Verifikation über `curl` gegen die Scratch-DB, siehe Task 4/5). Hier nur PHP-Syntaxprüfung:

```bash
php -l php-backend/bootstrap.php
```

Erwartet: `No syntax errors detected`.

- [ ] **Step 3: Commit**

```bash
git add php-backend/bootstrap.php
git commit -m "feat: add rider account session helpers"
```

---

### Task 3: Minimaler SMTP-Client

**Files:**
- Create: `php-backend/smtp.php`

**Interfaces:**
- Consumes: `ALLEYCAT_TABLE` (Konstante, in `config.php` per `install.php` gesetzt), `apiConnectDb()` (bestehend, `bootstrap.php`)
- Produces: `smtpLoadSettings(PDO $pdo)` → Array `['host','port','username','password','fromAddress','fromName']` oder `null`, wenn nicht konfiguriert; `smtpSendMail(PDO $pdo, $toEmail, $subject, $bodyText)` → `true`/`throws Exception` mit Klartext-Fehlermeldung

- [ ] **Step 1: Datei anlegen**

```php
<?php
/* Alleycat Dispatch — minimaler SMTP-Client
   ------------------------------------------------------------------
   Kein Composer, keine Vendor-Library (Projektprinzip: PHP+PDO ohne
   Framework/Abhängigkeiten) — ein roher Socket reicht für den einen
   Anwendungsfall (Passwort-Reset-Mails, niedriges Volumen). Bewusst
   KEIN mail(): ohne SPF/DKIM/Reverse-DNS-Setup des Hosters landet damit
   praktisch jede Mail im Spam oder wird gar nicht zugestellt — für einen
   Passwort-Reset ist das faktisch ein fehlendes Feature. Ein
   authentifizierter SMTP-Relay über den Hoster-Account ist zuverlässiger.

   Unterstützt STARTTLS auf Port 587 und implizites TLS auf Port 465
   (die beiden auf Shared-Hosting üblichen Konfigurationen). Kein
   Connection-Pooling, keine Warteschlange — jeder Aufruf öffnet und
   schließt seine eigene Verbindung, das Volumen rechtfertigt keine
   Komplexität.
   ------------------------------------------------------------------ */

function smtpLoadSettings(PDO $pdo){
  /* Instanzweite Config liegt in der Basis-KV-Tabelle (org_id=0-
     Sentinel), gleiches Muster wie config:riderAppUrl — siehe api.php
     $instanceWideKeys. Direkter SQL-Zugriff hier statt über api.php,
     weil dieser Code serverseitig läuft, nicht als HTTP-Client. */
  $stmt = $pdo->prepare("SELECT `value` FROM `" . ALLEYCAT_TABLE . "` WHERE `key` = 'config:smtpSettings' AND `org_id` = 0");
  $stmt->execute();
  $raw = $stmt->fetchColumn();
  if($raw === false) return null;
  $cfg = json_decode($raw, true);
  if(!is_array($cfg) || empty($cfg['host']) || empty($cfg['fromAddress'])) return null;
  return [
    'host' => (string)$cfg['host'],
    'port' => (int)($cfg['port'] ?? 587),
    'username' => (string)($cfg['username'] ?? ''),
    'password' => (string)($cfg['password'] ?? ''),
    'fromAddress' => (string)$cfg['fromAddress'],
    'fromName' => (string)($cfg['fromName'] ?? 'Alleycat Dispatch')
  ];
}

/* Liest eine oder mehrere SMTP-Antwortzeilen ("250-..." Fortsetzung,
   "250 " Ende) und gibt den letzten Code als int zurück. */
function smtpReadResponse($sock){
  $code = 0;
  while(!feof($sock)){
    $line = fgets($sock, 512);
    if($line === false) break;
    $code = (int)substr($line, 0, 3);
    if(substr($line, 3, 1) !== '-') break; // Leerzeichen statt Bindestrich = letzte Zeile
  }
  return $code;
}

function smtpSendCommand($sock, $cmd, $expectCode){
  fwrite($sock, $cmd . "\r\n");
  $code = smtpReadResponse($sock);
  if($code !== $expectCode){
    throw new Exception("SMTP: unerwarteter Code {$code} auf '" . trim($cmd) . "'");
  }
}

function smtpSendMail(PDO $pdo, $toEmail, $subject, $bodyText){
  $cfg = smtpLoadSettings($pdo);
  if(!$cfg) throw new Exception('SMTP nicht konfiguriert (config:smtpSettings fehlt)');

  $useImplicitTls = $cfg['port'] === 465;
  $transport = $useImplicitTls ? 'ssl://' : 'tcp://';
  $sock = @stream_socket_client($transport . $cfg['host'] . ':' . $cfg['port'], $errno, $errstr, 10);
  if(!$sock) throw new Exception("Verbindung zu {$cfg['host']}:{$cfg['port']} fehlgeschlagen: {$errstr}");

  stream_set_timeout($sock, 10);
  $greeting = smtpReadResponse($sock); // Server-Banner, kein Befehl
  if($greeting !== 220) throw new Exception("SMTP: kein gültiges Banner (Code {$greeting})");

  $localHost = parse_url($cfg['fromAddress'], PHP_URL_HOST) ?: 'localhost';
  smtpSendCommand($sock, "EHLO {$localHost}", 250);

  if(!$useImplicitTls){
    smtpSendCommand($sock, "STARTTLS", 220);
    if(!stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)){
      throw new Exception('STARTTLS: TLS-Handshake fehlgeschlagen');
    }
    smtpSendCommand($sock, "EHLO {$localHost}", 250); // nach STARTTLS erneut nötig
  }

  if($cfg['username'] !== ''){
    smtpSendCommand($sock, "AUTH LOGIN", 334);
    smtpSendCommand($sock, base64_encode($cfg['username']), 334);
    smtpSendCommand($sock, base64_encode($cfg['password']), 235);
  }

  smtpSendCommand($sock, "MAIL FROM:<{$cfg['fromAddress']}>", 250);
  smtpSendCommand($sock, "RCPT TO:<{$toEmail}>", 250);
  smtpSendCommand($sock, "DATA", 354);

  $fromHeader = $cfg['fromName'] !== ''
    ? "{$cfg['fromName']} <{$cfg['fromAddress']}>"
    : $cfg['fromAddress'];
  $headers = "From: {$fromHeader}\r\nTo: {$toEmail}\r\nSubject: {$subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n";
  /* Führende Punkte in Zeilen müssen verdoppelt werden (SMTP-Dot-Stuffing),
     sonst interpretiert der Server eine Zeile als Nachrichtenende. */
  $escapedBody = preg_replace('/^\./m', '..', $bodyText);
  fwrite($sock, $headers . "\r\n" . $escapedBody . "\r\n.\r\n");
  $code = smtpReadResponse($sock);
  if($code !== 250) throw new Exception("SMTP: Zustellung abgelehnt (Code {$code})");

  fwrite($sock, "QUIT\r\n");
  fclose($sock);
  return true;
}
```

- [ ] **Step 2: Syntaxprüfung**

```bash
php -l php-backend/smtp.php
```

Erwartet: `No syntax errors detected`.

- [ ] **Step 3: Von Hand gegen echten SMTP-Testaccount verifizieren**

Kein automatischer Test möglich (braucht echten SMTP-Zugang). Scratch-Skript:

```php
<?php
require 'php-backend/bootstrap.php';
require 'php-backend/smtp.php';
// config.php muss ALLEYCAT_TABLE/DB-Zugang enthalten, siehe Task 1 Scratch-Setup
$pdo = apiConnectDb();
// KV-Zeile von Hand einfügen mit echten SMTP-Zugangsdaten (Mailtrap/Mailhog o.ä. zum Testen empfohlen):
$pdo->prepare("INSERT INTO `" . ALLEYCAT_TABLE . "` (`org_id`,`key`,`value`) VALUES (0,'config:smtpSettings',?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)")
    ->execute([json_encode(['host'=>'sandbox.smtp.mailtrap.io','port'=>587,'username'=>'...','password'=>'...','fromAddress'=>'test@example.com','fromName'=>'Test'])]);
smtpSendMail($pdo, 'empfaenger@example.com', 'Testmail', 'Hallo Welt.');
echo "OK\n";
```

Erwartet: `OK`, Mail kommt im Test-Postfach (z.B. Mailtrap-Inbox) an.

- [ ] **Step 4: Commit**

```bash
git add php-backend/smtp.php
git commit -m "feat: add minimal SMTP client for password reset mails"
```

---

### Task 4: rider.php — Konto-Auth (Register/Login/Forgot/Reset)

**Files:**
- Modify: `php-backend/rider.php` (neue Actions, eingefügt vor der bestehenden `?a=claim`-Sektion — siehe Datei-Kommentarkopf für Actions-Liste, dort ebenfalls ergänzen)

**Interfaces:**
- Consumes: `riderUserGenerateToken()`, `riderEmailValid()` (Task 2), `smtpSendMail()`/`smtpLoadSettings()` (Task 3), `riderCheckRateLimit()`/`riderRecordFailure()`/`riderRejectAuth()`/`riderClearFailures()` (bestehend)
- Produces: Actions `rider-register`, `rider-login`, `rider-forgot`, `rider-reset` — Response-Form `{ok:true, authToken, displayName}` bzw. `{ok:true}`

- [ ] **Step 1: Actions-Liste im Datei-Kommentarkopf ergänzen**

Am Ende der Aktionsliste im Kopfkommentar von `rider.php` (nach `POST ?a=claim`) ergänzen:

```
     Kein Token, Fahrer-Konto (Spokecard-Claiming)
       POST ?a=rider-register  neues Fahrer-Konto (E-Mail+Passwort)
       POST ?a=rider-login     Login -> Session-Bearer
       POST ?a=rider-forgot    Passwort-Reset-Mail anfordern
       POST ?a=rider-reset     Passwort mit Reset-Token setzen
     Session-Bearer (X-Rider-Auth-Token)
       POST ?a=rider-claim     Startnummer dem eigenen Konto zuordnen
                               (zusätzlich X-Rider-Token/X-Rider-Code nötig)
       GET  ?a=rider-history   eigene Teilnahmehistorie über alle Events
```

- [ ] **Step 2: Passwort-Policy + Actions einfügen**

Vor der Zeile mit `if($action === 'claim')` (bestehende Selbstregistrierungs-Action) einfügen:

```php
/* Gleiche Policy wie authPasswordValid() in auth.php — dort nicht
   importierbar, ohne rider.php an auth.php zu koppeln (die beiden
   Endpunkte bleiben bewusst unabhängig ladbar). Bei Änderung an einer
   Stelle: die andere mitziehen. */
function riderUserPasswordValid($password){
  return strlen((string)$password) >= 12;
}

require __DIR__ . '/smtp.php';

if($action === 'rider-register'){
  riderRequirePost();
  riderCheckRateLimit($pdo);
  $body = riderJsonBody();
  $email = strtolower(trim((string)($body['email'] ?? '')));
  $password = (string)($body['password'] ?? '');
  $displayName = trim((string)($body['displayName'] ?? ''));

  if(!riderEmailValid($email) || !riderUserPasswordValid($password)){
    riderRejectAuth($pdo, 'invalid_input');
  }

  $userTable = riderTableName('user');
  try{
    $pdo->prepare("INSERT INTO `{$userTable}` (`email`,`password_hash`,`display_name`) VALUES (?,?,?)")
        ->execute([$email, password_hash($password, PASSWORD_DEFAULT), $displayName]);
  }catch(PDOException $e){
    if($e->getCode() === '23000') riderRejectAuth($pdo, 'email_taken');
    throw $e;
  }
  $userId = (int)$pdo->lastInsertId();

  $token = riderUserGenerateToken();
  $pdo->prepare("INSERT INTO `" . riderTableName('session') . "` (`token_hash`,`rider_user_id`) VALUES (?,?)")
      ->execute([riderHashToken($token), $userId]);

  riderClearFailures($pdo);
  riderOut(['ok' => true, 'authToken' => $token, 'displayName' => $displayName]);
}

if($action === 'rider-login'){
  riderRequirePost();
  riderCheckRateLimit($pdo);
  $body = riderJsonBody();
  $email = strtolower(trim((string)($body['email'] ?? '')));
  $password = (string)($body['password'] ?? '');

  $userTable = riderTableName('user');
  $stmt = $pdo->prepare("SELECT * FROM `{$userTable}` WHERE `email` = ?");
  $stmt->execute([$email]);
  $user = $stmt->fetch(PDO::FETCH_ASSOC);

  /* Generische Fehlermeldung: kein Unterschied zwischen "E-Mail
     unbekannt" und "Passwort falsch" (Enumeration-Schutz). */
  if(!$user || $user['status'] !== 'active' || !password_verify($password, $user['password_hash'])){
    riderRejectAuth($pdo, 'invalid_credentials');
  }
  riderClearFailures($pdo);

  $token = riderUserGenerateToken();
  $pdo->prepare("INSERT INTO `" . riderTableName('session') . "` (`token_hash`,`rider_user_id`) VALUES (?,?)")
      ->execute([riderHashToken($token), (int)$user['id']]);

  riderOut(['ok' => true, 'authToken' => $token, 'displayName' => $user['display_name']]);
}

if($action === 'rider-forgot'){
  riderRequirePost();
  riderCheckRateLimit($pdo);
  $body = riderJsonBody();
  $email = strtolower(trim((string)($body['email'] ?? '')));

  if(riderEmailValid($email)){
    $userTable = riderTableName('user');
    $stmt = $pdo->prepare("SELECT `id` FROM `{$userTable}` WHERE `email` = ? AND `status` = 'active'");
    $stmt->execute([$email]);
    $userId = $stmt->fetchColumn();

    if($userId){
      $token = riderUserGenerateToken();
      $pdo->prepare("INSERT INTO `" . riderTableName('password_reset') . "` (`token_hash`,`rider_user_id`,`expires_at`) VALUES (?,?,?)")
          ->execute([riderHashToken($token), (int)$userId, date('Y-m-d H:i:s', time() + 30 * 60)]);

      $resetUrl = riderAppResetUrl($token);
      /* Versandfehler dürfen die Antwort nicht verändern (sonst wäre
         "Mailserver down" von außen von "E-Mail existiert nicht" zu
         unterscheiden) — geloggt, nicht durchgereicht. Siehe Spec §5. */
      try{
        smtpSendMail($pdo, $email, 'Alleycat Dispatch — Passwort zurücksetzen',
          "Klicke auf den folgenden Link, um dein Passwort zurückzusetzen (30 Minuten gültig):\n\n{$resetUrl}\n\nWenn du das nicht warst, ignoriere diese E-Mail.");
      }catch(Exception $e){
        error_log('[alleycat smtp] rider-forgot: ' . $e->getMessage());
      }
    }
  }
  /* IMMER dieselbe Antwort, ob E-Mail existiert/gültig war oder nicht. */
  riderOut(['ok' => true]);
}

/* Baut die Reset-URL aus derselben riderAppUrl-Konfiguration, die auch
   ?a=discover in auth.php kennt — direkter KV-Zugriff, weil rider.php
   kein Storage-Seam-Objekt hat wie das JS-Frontend. */
function riderAppResetUrl($token){
  global $pdo;
  $stmt = $pdo->prepare("SELECT `value` FROM `" . ALLEYCAT_TABLE . "` WHERE `key` = 'config:riderAppUrl' AND `org_id` = 0");
  $stmt->execute();
  $baseUrl = rtrim((string)$stmt->fetchColumn(), '/');
  return $baseUrl . '/#pw.' . $token;
}

if($action === 'rider-reset'){
  riderRequirePost();
  riderCheckRateLimit($pdo);
  $body = riderJsonBody();
  $token = (string)($body['token'] ?? '');
  $newPassword = (string)($body['newPassword'] ?? '');

  if($token === '' || !riderUserPasswordValid($newPassword)){
    riderRejectAuth($pdo, 'invalid_input');
  }

  $resetTable = riderTableName('password_reset');
  $stmt = $pdo->prepare("SELECT * FROM `{$resetTable}` WHERE `token_hash` = ?");
  $stmt->execute([riderHashToken($token)]);
  $reset = $stmt->fetch(PDO::FETCH_ASSOC);

  if(!$reset || strtotime($reset['expires_at']) <= time()){
    riderRejectAuth($pdo, 'reset_invalid');
  }
  riderClearFailures($pdo);

  $pdo->prepare("UPDATE `" . riderTableName('user') . "` SET `password_hash` = ? WHERE `id` = ?")
      ->execute([password_hash($newPassword, PASSWORD_DEFAULT), (int)$reset['rider_user_id']]);
  /* Einmal verwendet, sofort löschen statt used_at zu setzen — anders als
     beim Admin-Reset-Code gibt es hier keinen Grund, verbrauchte Zeilen
     aufzuheben (kein Audit-Log für Fahrer-Konten). */
  $pdo->prepare("DELETE FROM `{$resetTable}` WHERE `token_hash` = ?")->execute([riderHashToken($token)]);
  $pdo->prepare("DELETE FROM `" . riderTableName('session') . "` WHERE `rider_user_id` = ?")
      ->execute([(int)$reset['rider_user_id']]);

  riderOut(['ok' => true]);
}
```

- [ ] **Step 3: Syntaxprüfung**

```bash
php -l php-backend/rider.php
```

- [ ] **Step 4: Manuell gegen Scratch-DB verifizieren**

```bash
# php -S localhost:8000 -t php-backend liegt bereits (Task 1 Setup)
curl -s -X POST 'http://localhost:8000/rider.php?a=rider-register' \
  -d '{"email":"fahrer@example.com","password":"correcthorsebattery","displayName":"Test Fahrer"}' | jq .
# erwartet: {"ok":true,"authToken":"...","displayName":"Test Fahrer"}

curl -s -X POST 'http://localhost:8000/rider.php?a=rider-login' \
  -d '{"email":"fahrer@example.com","password":"correcthorsebattery"}' | jq .
# erwartet: {"ok":true,"authToken":"...", ...}

curl -s -X POST 'http://localhost:8000/rider.php?a=rider-login' \
  -d '{"email":"fahrer@example.com","password":"falsch"}' | jq .
# erwartet: {"error":"invalid_credentials"} (403)

curl -s -X POST 'http://localhost:8000/rider.php?a=rider-forgot' \
  -d '{"email":"nichtvorhanden@example.com"}' | jq .
# erwartet: {"ok":true} — gleiche Antwort wie bei existierender E-Mail
```

- [ ] **Step 5: Commit**

```bash
git add php-backend/rider.php
git commit -m "feat: add rider account register/login/forgot/reset"
```

---

### Task 5: rider.php — Claim + Historie

**Files:**
- Modify: `php-backend/rider.php` (neue Actions, nach der bestehenden `?a=claim`-Sektion)

**Interfaces:**
- Consumes: `riderUserRequireSession()` (Task 2), `riderResolveSlot()`/`riderResolveSlotByCode()` (bestehend)
- Produces: Actions `rider-claim`, `rider-history`

- [ ] **Step 1: Actions einfügen**

Nach der bestehenden `?a=claim`-Sektion (Selbstregistrierung ohne Konto) einfügen:

```php
if($action === 'rider-claim'){
  riderRequirePost();
  riderCheckRateLimit($pdo);
  $session = riderUserRequireSession($pdo);
  $body = riderJsonBody();
  $publicId = (string)($body['publicId'] ?? '');
  $token = (string)($body['riderToken'] ?? '');
  $code = (string)($body['riderCode'] ?? '');

  /* Derselbe Nachweis wie ?a=me: bloßes Eingeloggtsein reicht nie, um
     eine fremde Startnummer zu beanspruchen. */
  $slot = $token !== '' ? riderResolveSlot($pdo, $publicId, $token) : null;
  if(!$slot && $code !== '') $slot = riderResolveSlotByCode($pdo, $publicId, $code);
  if(!$slot) riderRejectAuth($pdo, 'invalid_rider');
  riderClearFailures($pdo);

  /* Überschreiben statt ablehnen: wer den Token/Code kennt, hat dieselbe
     Autorität wie ein vorheriger Claimer (z. B. Startnummer weitergegeben). */
  $pdo->prepare("INSERT INTO `" . riderTableName('claim') . "` (`public_id`,`bib`,`rider_user_id`,`claimed_at`)
                 VALUES (?,?,?,UTC_TIMESTAMP())
                 ON DUPLICATE KEY UPDATE `rider_user_id` = VALUES(`rider_user_id`), `claimed_at` = VALUES(`claimed_at`)")
      ->execute([$publicId, (int)$slot['bib'], $session['id']]);

  riderOut(['ok' => true]);
}

if($action === 'rider-history'){
  riderRequireGet();
  $session = riderUserRequireSession($pdo);

  /* Gleiche Sichtbarkeitsregel wie ?a=me: nur was der Organizer bereits
     per ?a=sync veröffentlicht hat (rider_event/rider_log), nichts
     Organizer-Internes. Historie ist bewusst Org-übergreifend (siehe
     Spec §7) — das ist die eigene, selbst-geclaimte Info des Fahrers. */
  $stmt = $pdo->prepare(
    "SELECT c.`public_id`, c.`bib`, c.`claimed_at`, e.`name`, e.`status`
     FROM `" . riderTableName('claim') . "` c
     JOIN `" . riderTableName('event') . "` e ON e.`public_id` = c.`public_id`
     WHERE c.`rider_user_id` = ?
     ORDER BY c.`claimed_at` DESC"
  );
  $stmt->execute([$session['id']]);
  $claims = $stmt->fetchAll(PDO::FETCH_ASSOC);

  $entries = [];
  foreach($claims as $claim){
    $pStmt = $pdo->prepare(
      "SELECT COUNT(*) FROM `" . riderTableName('log') . "`
       WHERE `public_id` = ? AND `bib` = ? AND `type` = 'checkin' AND `cp_id` IS NOT NULL"
    );
    $pStmt->execute([$claim['public_id'], $claim['bib']]);
    $entries[] = [
      'publicId' => $claim['public_id'],
      'bib' => (int)$claim['bib'],
      'eventName' => $claim['name'],
      'eventStatus' => $claim['status'],
      'claimedAt' => $claim['claimed_at'],
      'checkpointsDone' => (int)$pStmt->fetchColumn()
    ];
  }

  riderOut(['ok' => true, 'displayName' => $session['displayName'], 'entries' => $entries]);
}
```

- [ ] **Step 2: Syntaxprüfung**

```bash
php -l php-backend/rider.php
```

- [ ] **Step 3: Manuell gegen Scratch-DB verifizieren**

Setup braucht ein veröffentlichtes Event mit mindestens einem Slot (per bestehendem `?a=sync`, siehe `php-backend/COMPATIBILITY.md` für ein vollständiges Vorgehen). Danach:

```bash
AUTH=$(curl -s -X POST 'http://localhost:8000/rider.php?a=rider-login' -d '{"email":"fahrer@example.com","password":"correcthorsebattery"}' | jq -r .authToken)

curl -s -X POST 'http://localhost:8000/rider.php?a=rider-claim' \
  -H "X-Rider-Auth-Token: $AUTH" \
  -d '{"publicId":"<publicId aus Sync>","riderCode":"<Code aus Sync>"}' | jq .
# erwartet: {"ok":true}

curl -s 'http://localhost:8000/rider.php?a=rider-history' -H "X-Rider-Auth-Token: $AUTH" | jq .
# erwartet: {"ok":true,"entries":[{"publicId":"...","bib":..., ...}]}

# Ohne Session:
curl -s 'http://localhost:8000/rider.php?a=rider-history' | jq .
# erwartet: {"error":"not_logged_in"} (401)

# Claim ohne gültigen Token/Code:
curl -s -X POST 'http://localhost:8000/rider.php?a=rider-claim' \
  -H "X-Rider-Auth-Token: $AUTH" \
  -d '{"publicId":"<publicId>","riderCode":"FALSCHFALSCH"}' | jq .
# erwartet: {"error":"invalid_rider"} (403)
```

- [ ] **Step 4: Commit**

```bash
git add php-backend/rider.php
git commit -m "feat: add rider slot claim and cross-event history"
```

---

### Task 6: auth.php — SMTP-Testversand (SysAdmin)

**Files:**
- Modify: `php-backend/auth.php` (Actions-Liste im Kopfkommentar + neue Action)

**Interfaces:**
- Consumes: `smtpSendMail()` (Task 3), `apiVerifyAccess()`/`authRequireSysAdmin()` (bestehend)
- Produces: Action `smtp-test`

- [ ] **Step 1: Actions-Liste ergänzen**

Im Kopfkommentar von `auth.php`, nach `GET ?a=audit-log`:

```
     POST ?a=smtp-test      Testmail über die gespeicherte SMTP-Konfiguration
                            verschicken (nur SysAdmin)
```

- [ ] **Step 2: Action einfügen**

Vor der abschließenden Fehlerbehandlung (letzter `apiSendJsonError(404, 'unknown_action')`-Fallback, sofern vorhanden — sonst am Dateiende vor `?>`), einfügen:

```php
require __DIR__ . '/smtp.php';

if($action === 'smtp-test'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
  $body = authJsonBody();
  $toEmail = (string)($body['toEmail'] ?? '');
  if(!riderEmailValid($toEmail)) apiSendJsonError(400, 'invalid_input');

  try{
    smtpSendMail($pdo, $toEmail, 'Alleycat Dispatch — SMTP-Test', 'Wenn du das liest, funktioniert der SMTP-Versand.');
    authOut(['ok' => true]);
  }catch(Exception $e){
    /* Anders als rider-forgot: hier DARF der echte Fehler durch, das
       ist genau der Zweck des Buttons (siehe Spec §5) — nur SysAdmin
       sieht diese Antwort, kein Enumeration-Risiko. */
    apiSendJsonError(502, 'smtp_failed', $e->getMessage());
  }
}
```

- [ ] **Step 3: Syntaxprüfung**

```bash
php -l php-backend/auth.php
```

- [ ] **Step 4: Manuell verifizieren**

```bash
# ohne gültige SMTP-Config (aus Task 3 wieder entfernt/kaputt gemacht):
curl -s -X POST 'http://localhost:8000/auth.php?a=smtp-test' \
  -H "X-Admin-Token: <SysAdmin-Session-Token>" \
  -d '{"toEmail":"test@example.com"}' | jq .
# erwartet: {"error":"smtp_failed"} (502)

# mit gültiger Config (siehe Task 3 Step 3):
curl -s -X POST 'http://localhost:8000/auth.php?a=smtp-test' \
  -H "X-Admin-Token: <SysAdmin-Session-Token>" \
  -d '{"toEmail":"test@example.com"}' | jq .
# erwartet: {"ok":true}, Mail kommt an

# als Nicht-SysAdmin (Editor-Rolle):
curl -s -X POST 'http://localhost:8000/auth.php?a=smtp-test' \
  -H "X-Admin-Token: <Editor-Session-Token>" \
  -d '{"toEmail":"test@example.com"}' | jq .
# erwartet: {"error":"sysadmin_required"} (403)
```

- [ ] **Step 5: Commit**

```bash
git add php-backend/auth.php
git commit -m "feat: add SysAdmin SMTP test-send endpoint"
```

---

### Task 7: rider-qr.js — Passwort-Reset-Fragment

**Files:**
- Modify: `src/core/rider-qr.js`

**Interfaces:**
- Consumes: nichts Neues
- Produces: `parseRiderQrPayload()` erkennt zusätzlich `{kind:'resetPassword', resetToken}`; neue Funktion `buildResetPasswordUrl(baseUrl, token)`

- [ ] **Step 1: Regex + Parser-Zweig ergänzen**

Nach `const RIDER_TOKEN_RE = /^[a-z0-9]{32}$/;` ergänzen:

```javascript
const RIDER_RESET_TOKEN_RE = /^[a-f0-9]{64}$/; // bin2hex(random_bytes(32)), siehe riderUserGenerateToken()
```

In `parseRiderQrPayload()`, nach dem `if(parts[0] === 'g' && parts.length === 2){...}`-Block ergänzen:

```javascript
  if(parts[0] === 'pw' && parts.length === 2){
    const [, resetToken] = parts;
    if(!RIDER_RESET_TOKEN_RE.test(resetToken)) return null;
    return {kind: 'resetPassword', resetToken};
  }
```

Am Dateiende, nach `buildSelfRegisterQrPayload()`, ergänzen:

```javascript
function buildResetPasswordUrl(baseUrl, token){
  return `${baseUrl}#pw.${token}`;
}
```

- [ ] **Step 2: Test ergänzen (test-suite.js, Organizer-Suite — dieselbe Datei prüft rider-qr.js bereits)**

Suche in `test-suite.js` nach bestehenden `parseRiderQrPayload`-Prüfungen (Muster: `checkEqual('...', parseRiderQrPayload(...).kind, ...)`) und ergänze direkt danach:

```javascript
checkEqual('parseRiderQrPayload erkennt Reset-Fragment', parseRiderQrPayload('https://x.tld/app.html#pw.' + 'a'.repeat(64)).kind, 'resetPassword');
checkEqual('parseRiderQrPayload lehnt zu kurzes Reset-Token ab', parseRiderQrPayload('#pw.abc'), null);
```

- [ ] **Step 3: Bauen und im Browser laufen lassen**

```bash
node build.js
```

Test-Suite (`test-suite.js`) gemäß Projekt-Workflow im **sichtbaren** Browser-Pane gegen `dist/alleycat-dispatch-local.html` einfügen und `runAlleycatTestSuite()` aufrufen. Erwartet: beide neuen Checks ✅, keine Regression bei den bestehenden `parseRiderQrPayload`-Checks.

- [ ] **Step 4: Commit**

```bash
git add src/core/rider-qr.js test-suite.js
git commit -m "feat: recognize password-reset fragment in rider QR parser"
```

---

### Task 8: Fahrer-App — Zustand + Serverzugriff

**Files:**
- Modify: `src/rider/state.js`
- Modify: `src/rider/api.js`

**Interfaces:**
- Consumes: `riderRequest()` (bestehend, `api.js`)
- Produces: `riderState.account` (`{authToken, displayName} | null`), `riderLoadAccount()`/`riderSaveAccount()`/`riderClearAccount()`; `riderApiRegister()`, `riderApiLogin()`, `riderApiForgot()`, `riderApiReset()`, `riderApiClaim()`, `riderApiHistory()`

- [ ] **Step 1: `riderRequest()` um Bearer-Auth erweitern**

In `src/rider/api.js`, in `riderRequest()`, nach der Zeile `if(auth && auth.code) headers['X-Rider-Code'] = auth.code;` ergänzen:

```javascript
  if(auth && auth.authToken) headers['X-Rider-Auth-Token'] = auth.authToken;
```

- [ ] **Step 2: Neue API-Funktionen ergänzen**

Am Ende von `src/rider/api.js` ergänzen:

```javascript
/* ---------------- Fahrer-Konten (Spokecard-Claiming) ----------------
   Eigener Header (X-Rider-Auth-Token), getrennt vom Slot-Token/Code —
   ein Konto beweist nur "ich bin eingeloggt", nie "diese Startnummer
   gehört mir". Claim braucht deshalb IMMER beide. */

function riderApiRegister(email, password, displayName){
  return riderRequest('POST', 'rider-register', {}, {email, password, displayName}, null);
}
function riderApiLogin(email, password){
  return riderRequest('POST', 'rider-login', {}, {email, password}, null);
}
function riderApiForgot(email){
  return riderRequest('POST', 'rider-forgot', {}, {email}, null);
}
function riderApiReset(token, newPassword){
  return riderRequest('POST', 'rider-reset', {}, {token, newPassword}, null);
}
function riderApiClaim(authToken, publicId, riderToken, riderCode){
  return riderRequest('POST', 'rider-claim', {}, {publicId, riderToken, riderCode}, {authToken});
}
function riderApiHistory(authToken){
  return riderRequest('GET', 'rider-history', {}, null, {authToken});
}
```

- [ ] **Step 3: Zustand ergänzen**

In `src/rider/state.js`, nach `const RIDER_LS_CACHE = 'alleycat-rider:cache';` ergänzen:

```javascript
const RIDER_LS_ACCOUNT = 'alleycat-rider:account';
```

In `riderState`, nach `selfRegisterBib: null` (letztes Feld vor der schließenden `};`) ergänzen:

```javascript
  ,
  /* Fahrer-Konto, unabhängig von riderState.session (Slot). Ein Fahrer
     kann eingeloggt sein, ohne gerade eine Startnummer aktiv zu haben,
     und umgekehrt — beide Zustände sind unabhängig persistiert. */
  account: null,          // {authToken, displayName} | null
  history: [],            // ?a=rider-history Antwort-Einträge
  accountForm: {email: '', password: '', displayName: ''},
  resetToken: null        // aus #pw.<token>, für die Reset-Ansicht zwischengeparkt
```

Nach `function riderClearSession(){...}` ergänzen:

```javascript
function riderLoadAccount(){ return riderLoadJson(RIDER_LS_ACCOUNT); }
function riderSaveAccount(a){ riderSaveJson(RIDER_LS_ACCOUNT, a); }
function riderClearAccount(){
  try{ localStorage.removeItem(RIDER_LS_ACCOUNT); }catch(e){}
}
```

- [ ] **Step 4: Test ergänzen (test-suite-rider.js)**

Nach den bestehenden Queue-Persistenz-Checks (Suche nach `'Queue überlebt einen Reload'`) einen neuen Abschnitt ergänzen:

```javascript
  // --- Fahrer-Konto: Persistenz ---
  {
    riderClearAccount();
    checkEqual('Ohne gespeichertes Konto: riderLoadAccount() liefert null', riderLoadAccount(), null);
    riderSaveAccount({authToken: 'tok123', displayName: 'Test Fahrer'});
    const loaded = riderLoadAccount();
    checkEqual('Gespeichertes Konto: authToken', loaded.authToken, 'tok123');
    checkEqual('Gespeichertes Konto: displayName', loaded.displayName, 'Test Fahrer');
    riderClearAccount();
    checkEqual('Nach riderClearAccount(): wieder null', riderLoadAccount(), null);
  }

  // --- Fahrer-Konto: riderApiClaim() sendet beide Nachweise ---
  {
    stubFetch();
    plan.push({status: 200, body: {ok: true}});
    await riderApiClaim('authtok', PID, TOK, '');
    checkEqual('rider-claim: Action in der Query', calls[0].url.includes('a=rider-claim'), true);
    checkEqual('rider-claim: Auth-Header gesetzt', calls[0].headers['X-Rider-Auth-Token'], 'authtok');
    const sentBody = JSON.parse(calls[0].body);
    checkEqual('rider-claim: publicId im Body', sentBody.publicId, PID);
    checkEqual('rider-claim: riderToken im Body', sentBody.riderToken, TOK);
  }
```

Prüfe die bestehende `stubFetch()`-Attrappe (Dateikopf) — sie protokolliert bereits `url`/`headers`/`body` in `calls` (siehe bestehende Checks wie `calls[0].url`). Falls die Attrappe Header nicht separat aufzeichnet, ergänze das dort minimal (ein Feld `headers: opts.headers || {}` im `calls.push(...)`).

- [ ] **Step 5: Bauen und Test-Suite laufen lassen**

```bash
node build.js
```

`test-suite-rider.js` im **sichtbaren** Browser-Pane gegen `dist/alleycat-rider.html` einfügen, `runRiderTestSuite()` aufrufen. Erwartet: alle neuen Checks ✅, keine Regression.

- [ ] **Step 6: Commit**

```bash
git add src/rider/state.js src/rider/api.js test-suite-rider.js
git commit -m "feat: add rider account state and API calls"
```

---

### Task 9: Fahrer-App — Login/Register/Reset/Profil-Ansichten + Claim-Button

**Files:**
- Modify: `src/rider/views.js`
- Modify: `src/rider/init.js`
- Modify: `src/core/i18n.js` (neue `riderScan`-Strings, siehe Task 10 — hier bereits referenziert)

**Interfaces:**
- Consumes: `riderApiRegister()`/`riderApiLogin()`/`riderApiForgot()`/`riderApiReset()`/`riderApiClaim()`/`riderApiHistory()` (Task 8), `riderLoadAccount()`/`riderSaveAccount()`/`riderClearAccount()` (Task 8), `parseRiderQrPayload()` inkl. `resetPassword`-Kind (Task 7)
- Produces: Views `accountLogin`, `accountRegister`, `accountForgot`, `accountReset`, `profile`; Routing-Funktionen `riderGoAccountLogin()`, `riderGoProfile()`, `riderSubmitClaim()`

- [ ] **Step 1: Views registrieren**

In `src/rider/views.js`, in `renderRider()`, nach `case 'selfRegisterForm': ...` ergänzen:

```javascript
    case 'accountLogin':    el.innerHTML = riderViewAccountLogin(); break;
    case 'accountRegister': el.innerHTML = riderViewAccountRegister(); break;
    case 'accountForgot':   el.innerHTML = riderViewAccountForgot(); break;
    case 'accountReset':    el.innerHTML = riderViewAccountReset(); break;
    case 'profile':         el.innerHTML = riderViewProfile(); break;
```

- [ ] **Step 2: Login/Register/Forgot-Views ergänzen**

Am Dateiende von `src/rider/views.js` ergänzen:

```javascript
function riderViewAccountLogin(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.acctLoginTitle')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field"><label>${t('riderScan.acctEmailLabel')}</label>
        <input type="email" id="rider-acct-email" value="${escapeHtml(riderState.accountForm.email)}"></div>
      <div class="rider-field"><label>${t('riderScan.acctPasswordLabel')}</label>
        <input type="password" id="rider-acct-password"></div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderSubmitAccountLogin()">${t('riderScan.acctLoginSubmit')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoAccountRegister()">${t('riderScan.acctGoRegister')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoAccountForgot()">${t('riderScan.acctGoForgot')}</button>
    </div>
  `;
}

function riderViewAccountRegister(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.acctRegisterTitle')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field"><label>${t('riderScan.acctDisplayNameLabel')}</label>
        <input type="text" id="rider-acct-displayname" value="${escapeHtml(riderState.accountForm.displayName)}"></div>
      <div class="rider-field"><label>${t('riderScan.acctEmailLabel')}</label>
        <input type="email" id="rider-acct-email" value="${escapeHtml(riderState.accountForm.email)}"></div>
      <div class="rider-field"><label>${t('riderScan.acctPasswordLabel')}</label>
        <input type="password" id="rider-acct-password"></div>
      <div class="rider-note">${t('riderScan.acctPasswordHint')}</div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderSubmitAccountRegister()">${t('riderScan.acctRegisterSubmit')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoAccountLogin()">${t('riderScan.acctGoLogin')}</button>
    </div>
  `;
}

function riderViewAccountForgot(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.acctForgotTitle')}</div>
      <div class="rider-lead">${t('riderScan.acctForgotLead')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field"><label>${t('riderScan.acctEmailLabel')}</label>
        <input type="email" id="rider-acct-email" value="${escapeHtml(riderState.accountForm.email)}"></div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderSubmitAccountForgot()">${t('riderScan.acctForgotSubmit')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoAccountLogin()">${t('riderScan.acctGoLogin')}</button>
    </div>
  `;
}

function riderViewAccountReset(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.acctResetTitle')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field"><label>${t('riderScan.acctResetPasswordLabel')}</label>
        <input type="password" id="rider-acct-newpassword"></div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderSubmitAccountReset()">${t('riderScan.acctResetSubmit')}</button>
    </div>
  `;
}

function riderViewProfile(){
  const rows = riderState.history.map(h => `
    <div class="rider-cp done">
      <div class="rider-cp-main">
        <div class="rider-cp-name">${escapeHtml(h.eventName)}</div>
        <div class="rider-cp-hint">${escapeHtml(t('riderScan.profileBib', {bib: h.bib}))} · ${escapeHtml(t('riderScan.profileCheckpointsDone', {count: h.checkpointsDone}))}</div>
      </div>
    </div>
  `).join('');
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.profileTitle', {name: riderState.account ? riderState.account.displayName : ''})}</div>
      ${riderState.history.length ? `<div class="rider-cp-list">${rows}</div>` : `<div class="rider-lead">${t('riderScan.profileEmpty')}</div>`}
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderLogoutAccount()">${t('riderScan.acctLogout')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoHome()">${t('riderScan.profileBack')}</button>
    </div>
  `;
}
```

- [ ] **Step 3: Claim-Button auf Home-Screen ergänzen**

In `riderViewHome()` (bestehende Funktion), im `<div class="rider-actions">`-Block, nach dem bestehenden Scan-Button ergänzen:

```javascript
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderStartClaim()">${riderState.account ? t('riderScan.claimButton') : t('riderScan.claimButtonLoggedOut')}</button>
```

- [ ] **Step 4: Routing- und Submit-Funktionen in init.js ergänzen**

Am Dateiende von `src/rider/init.js` ergänzen:

```javascript
/* ---------------- Fahrer-Konten: Routing + Submit-Handler ---------------- */

function riderGoAccountLogin(){ riderState.error = ''; riderState.view = 'accountLogin'; renderRider(); }
function riderGoAccountRegister(){ riderState.error = ''; riderState.view = 'accountRegister'; renderRider(); }
function riderGoAccountForgot(){ riderState.error = ''; riderState.view = 'accountForgot'; renderRider(); }
function riderGoProfile(){
  riderState.error = '';
  riderState.view = 'profile';
  renderRider();
  riderLoadHistory();
}

async function riderLoadHistory(){
  if(!riderState.account) return;
  const res = await riderApiHistory(riderState.account.authToken);
  if(res.ok){
    riderState.history = res.data.entries || [];
    renderRider();
  }
}

function riderReadField(id){
  const el = document.getElementById(id);
  return el ? el.value : '';
}

async function riderSubmitAccountLogin(){
  const email = riderReadField('rider-acct-email');
  const password = riderReadField('rider-acct-password');
  riderState.busy = true; renderRider();
  const res = await riderApiLogin(email, password);
  riderState.busy = false;
  if(!res.ok){
    riderState.error = t('riderScan.errAcctLoginFailed');
    renderRider();
    return;
  }
  riderState.account = {authToken: res.data.authToken, displayName: res.data.displayName};
  riderSaveAccount(riderState.account);
  riderGoHome();
}

async function riderSubmitAccountRegister(){
  const displayName = riderReadField('rider-acct-displayname');
  const email = riderReadField('rider-acct-email');
  const password = riderReadField('rider-acct-password');
  riderState.busy = true; renderRider();
  const res = await riderApiRegister(email, password, displayName);
  riderState.busy = false;
  if(!res.ok){
    riderState.error = res.data && res.data.error === 'email_taken'
      ? t('riderScan.errAcctEmailTaken') : t('riderScan.errAcctRegisterFailed');
    renderRider();
    return;
  }
  riderState.account = {authToken: res.data.authToken, displayName: res.data.displayName};
  riderSaveAccount(riderState.account);
  riderGoHome();
}

async function riderSubmitAccountForgot(){
  const email = riderReadField('rider-acct-email');
  riderState.busy = true; renderRider();
  await riderApiForgot(email); // immer ok:true, siehe Backend-Kommentar
  riderState.busy = false;
  riderState.error = '';
  riderState.view = 'login';
  showRiderToast(t('riderScan.acctForgotSent'));
  renderRider();
}

async function riderSubmitAccountReset(){
  const newPassword = riderReadField('rider-acct-newpassword');
  riderState.busy = true; renderRider();
  const res = await riderApiReset(riderState.resetToken, newPassword);
  riderState.busy = false;
  if(!res.ok){
    riderState.error = t('riderScan.errAcctResetFailed');
    renderRider();
    return;
  }
  riderState.resetToken = null;
  riderState.view = 'accountLogin';
  showRiderToast(t('riderScan.acctResetDone'));
  renderRider();
}

function riderLogoutAccount(){
  riderState.account = null;
  riderState.history = [];
  riderClearAccount();
  riderGoHome();
}

/* Claim-Button auf dem Home-Screen: eingeloggt -> sofort claimen mit der
   aktiven Slot-Session; ausgeloggt -> erst zum Login, danach automatisch
   claimen (dieselbe Funktion wird nach erfolgreichem Login erneut
   aufgerufen, siehe riderState.pendingClaimAfterLogin). */
function riderStartClaim(){
  if(!riderState.session){
    riderState.error = t('riderScan.errClaimNoSlot');
    renderRider();
    return;
  }
  if(!riderState.account){
    riderState.pendingClaimAfterLogin = true;
    riderGoAccountLogin();
    return;
  }
  riderSubmitClaim();
}

async function riderSubmitClaim(){
  riderState.busy = true; renderRider();
  const res = await riderApiClaim(
    riderState.account.authToken,
    riderState.session.publicId,
    riderState.session.riderToken,
    riderState.session.code
  );
  riderState.busy = false;
  if(!res.ok){
    riderState.error = t('riderScan.errClaimFailed');
    renderRider();
    return;
  }
  showRiderToast(t('riderScan.claimDone'));
  riderGoHome();
}
```

In derselben Datei, in `riderSubmitAccountLogin()` und `riderSubmitAccountRegister()` (oben definiert): nach dem erfolgreichen `riderSaveAccount(...)`-Aufruf, vor `riderGoHome();`, den offenen Claim nachholen — ersetze in beiden Funktionen die Zeile `riderGoHome();` durch:

```javascript
  if(riderState.pendingClaimAfterLogin){
    riderState.pendingClaimAfterLogin = false;
    await riderSubmitClaim();
  } else {
    riderGoHome();
  }
```

Ergänze `pendingClaimAfterLogin: false` im `riderState`-Objekt (`src/rider/state.js`, gleicher Block wie `resetToken`).

**Hinweis für den Implementierer:** `showRiderToast()` existiert vermutlich noch nicht in der Fahrer-App (anders als im Organizer-`showToast()`). Prüfe `src/rider/views.js`/`init.js` auf eine bestehende Toast-/Hinweis-Funktion; falls keine existiert, genügt ein minimaler Ersatz (`riderState.error` kurz für eine Erfolgsmeldung zweckentfremden reicht NICHT — stattdessen ein neues `riderState.notice`-Feld analog zu `error`, mit eigenem grünen `rider-note-success`-Rendering in den betroffenen Views). Diese Entscheidung ist bewusst dem Implementierer überlassen, da sie vom tatsächlichen Ist-Zustand der Datei abhängt.

- [ ] **Step 5: `#pw.<token>`-Fragment beim Start erkennen**

In `src/rider/init.js`, in der Start-Routine (Funktion, die `parseRiderQrPayload(location.hash)` auswertet — Zeilen 20/30 laut Suche), nach der bestehenden Behandlung von `kind === 'selfRegister'` (bzw. an der Stelle, wo die anderen `kind`-Werte unterschieden werden) ergänzen:

```javascript
  if(fromUrl && fromUrl.kind === 'resetPassword'){
    riderState.resetToken = fromUrl.resetToken;
    riderState.view = 'accountReset';
    renderRider();
    return;
  }
```

Platziere diesen Block vor der bestehenden Fallback-Logik, die sonst z. B. auf `login` routet, damit `#pw.<token>` nicht von einer anderen Bedingung verschluckt wird.

- [ ] **Step 6: Login-Screen um Profil-Link ergänzen**

In `riderViewHome()`, im `<div class="rider-actions">`-Block, nach dem in Step 3 ergänzten Claim-Button:

```javascript
      ${riderState.account ? `<button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoProfile()">${t('riderScan.profileLink')}</button>` : ''}
```

- [ ] **Step 7: Test ergänzen (test-suite-rider.js)**

Nach den in Task 8 ergänzten Konto-Checks:

```javascript
  // --- Claim-Button-Routing ---
  {
    riderState.session = {publicId: PID, riderToken: TOK, bib: 7};
    riderState.account = null;
    riderState.pendingClaimAfterLogin = false;
    riderStartClaim();
    checkEqual('Claim ohne Login führt zu Login-Screen', riderState.view, 'accountLogin');
    checkEqual('Claim-Wunsch wird gemerkt', riderState.pendingClaimAfterLogin, true);
  }
```

- [ ] **Step 8: Bauen und Test-Suite laufen lassen**

```bash
node build.js
```

`test-suite-rider.js` im sichtbaren Browser-Pane gegen `dist/alleycat-rider.html` laufen lassen. Erwartet: alle Checks ✅.

Von Hand zusätzlich: `dist/alleycat-rider.html` öffnen, mit einer Test-Spokecard einloggen, Konto registrieren, Claim-Button drücken, Profil-Ansicht öffnen — Historie muss den geclaimten Event-Eintrag zeigen.

- [ ] **Step 9: Commit**

```bash
git add src/rider/views.js src/rider/init.js src/rider/state.js
git commit -m "feat: add rider account UI (login/register/reset/profile/claim)"
```

---

### Task 10: i18n-Strings, Organizer-SMTP-Settings, Doku

**Files:**
- Modify: `src/core/i18n.js` (nur `de`, siehe Projektkonvention — `en.json` wird vom Nutzer separat synchronisiert)
- Modify: `src/core/ui-headquarter.js`
- Modify: `docs/alleycat-dispatch-roadmap-14-23.md`
- Modify: `php-backend/COMPATIBILITY.md`

**Interfaces:**
- Consumes: `hasAdminRoles()`, `currentUserIsSysAdmin()` (bestehend, `src/core/auth.js`), `storageGet()`/`storageSet()` (bestehender generischer KV-Seam)
- Produces: neue `t()`-Keys unter `riderScan.acct*`/`riderScan.claim*`/`riderScan.profile*`; neue Settings-Sektion `renderSmtpSettingsSection()`

- [ ] **Step 1: i18n-Strings ergänzen**

In `src/core/i18n.js`, im `riderScan`-Objekt (ab Zeile 1165), nach `registerNameRequired: '...'` ergänzen:

```javascript
      acctLoginTitle: 'Anmelden',
      acctRegisterTitle: 'Konto anlegen',
      acctForgotTitle: 'Passwort vergessen',
      acctForgotLead: 'Gib deine E-Mail-Adresse ein, wir schicken dir einen Link zum Zurücksetzen.',
      acctForgotSubmit: 'Link anfordern',
      acctForgotSent: 'Wenn diese E-Mail-Adresse bei uns bekannt ist, kommt gleich eine Mail an.',
      acctResetTitle: 'Neues Passwort setzen',
      acctResetPasswordLabel: 'Neues Passwort',
      acctResetSubmit: 'Passwort setzen',
      acctResetDone: 'Passwort geändert. Du kannst dich jetzt anmelden.',
      acctEmailLabel: 'E-Mail',
      acctPasswordLabel: 'Passwort',
      acctPasswordHint: 'Mindestens 12 Zeichen.',
      acctDisplayNameLabel: 'Name (öffentlich sichtbar in deiner Historie)',
      acctLoginSubmit: 'Anmelden',
      acctRegisterSubmit: 'Konto anlegen',
      acctGoRegister: 'Noch kein Konto? Registrieren',
      acctGoLogin: 'Schon ein Konto? Anmelden',
      acctGoForgot: 'Passwort vergessen?',
      acctLogout: 'Abmelden',
      errAcctLoginFailed: 'E-Mail oder Passwort falsch.',
      errAcctRegisterFailed: 'Registrierung fehlgeschlagen. Prüfe deine Eingaben.',
      errAcctEmailTaken: 'Für diese E-Mail-Adresse existiert bereits ein Konto.',
      errAcctResetFailed: 'Der Link ist ungültig oder abgelaufen. Fordere einen neuen an.',
      errClaimNoSlot: 'Melde dich zuerst mit deiner Spokecard an, bevor du sie deinem Konto zuordnest.',
      errClaimFailed: 'Zuordnung fehlgeschlagen. Versuch es erneut.',
      claimButton: 'Startnummer meinem Konto zuordnen',
      claimButtonLoggedOut: 'Startnummer einem Konto zuordnen',
      claimDone: 'Startnummer deinem Konto zugeordnet.',
      profileLink: 'Mein Profil',
      profileBack: 'Zurück',
      profileTitle: 'Hallo {name}',
      profileEmpty: 'Noch keine Teilnahmen zugeordnet.',
      profileBib: 'Startnummer {bib}',
      profileCheckpointsDone: '{count} Checkpoints erledigt',
```

- [ ] **Step 2: Organizer-Settings-Sektion für SMTP ergänzen**

In `src/core/ui-headquarter.js`, direkt nach `renderRiderAppUrlSection()`/`submitRiderAppUrl()` (ca. Zeile 1270-1290) ergänzen:

```javascript
/* SMTP-Konfiguration für Fahrer-Passwort-Reset-Mails. Instanzweit wie
   config:riderAppUrl (siehe api.php $instanceWideKeys), deshalb SysAdmin-
   only — ein Editor einer einzigen Org dürfte sonst instanzweit fremde
   SMTP-Zugangsdaten verändern. */
async function renderSmtpSettingsSection(){
  if(!hasAdminRoles() || !currentUserIsSysAdmin()) return '';
  const raw = await storageGet('config:smtpSettings');
  const cfg = raw ? (JSON.parse(raw.value || raw) || {}) : {};
  return `
    <div class="settings-section">
      <h3>${t('auth.smtpHeading')}</h3>
      <div class="settings-section-desc">${t('auth.smtpDesc')}</div>
      <div class="rider-field"><label>${t('auth.smtpHostLabel')}</label>
        <input type="text" id="smtp-host" value="${escapeHtml(cfg.host || '')}"></div>
      <div class="rider-field"><label>${t('auth.smtpPortLabel')}</label>
        <input type="number" id="smtp-port" value="${escapeHtml(String(cfg.port || 587))}"></div>
      <div class="rider-field"><label>${t('auth.smtpUsernameLabel')}</label>
        <input type="text" id="smtp-username" value="${escapeHtml(cfg.username || '')}"></div>
      <div class="rider-field"><label>${t('auth.smtpPasswordLabel')}</label>
        <input type="password" id="smtp-password" value="${escapeHtml(cfg.password || '')}"></div>
      <div class="rider-field"><label>${t('auth.smtpFromAddressLabel')}</label>
        <input type="email" id="smtp-from-address" value="${escapeHtml(cfg.fromAddress || '')}"></div>
      <div class="rider-field"><label>${t('auth.smtpFromNameLabel')}</label>
        <input type="text" id="smtp-from-name" value="${escapeHtml(cfg.fromName || '')}"></div>
      <button class="btn btn-primary" onclick="submitSmtpSettings()">${t('auth.usersSaveButton')}</button>
      <div class="rider-field" style="margin-top:12px;"><label>${t('auth.smtpTestEmailLabel')}</label>
        <input type="email" id="smtp-test-email"></div>
      <button class="btn btn-ghost" onclick="submitSmtpTest()">${t('auth.smtpTestButton')}</button>
    </div>
  `;
}
async function submitSmtpSettings(){
  const cfg = {
    host: document.getElementById('smtp-host').value.trim(),
    port: parseInt(document.getElementById('smtp-port').value, 10) || 587,
    username: document.getElementById('smtp-username').value.trim(),
    password: document.getElementById('smtp-password').value,
    fromAddress: document.getElementById('smtp-from-address').value.trim(),
    fromName: document.getElementById('smtp-from-name').value.trim()
  };
  const ok = await storageSet('config:smtpSettings', JSON.stringify(cfg));
  showToast({message: ok ? t('auth.smtpSaved') : t('auth.smtpSaveFailed')});
}
async function submitSmtpTest(){
  const toEmail = document.getElementById('smtp-test-email').value.trim();
  const res = await authRequest('POST', 'smtp-test', {toEmail});
  showToast({message: res.ok ? t('auth.smtpTestOk') : t('auth.smtpTestFailed', {error: (res.data && res.data.error) || ''})});
}
```

**Hinweis für den Implementierer:** `renderSmtpSettingsSection()` ist async (wegen `storageGet()`); prüfe, wie `renderRiderAppUrlSection()` in den umgebenden Settings-Render-Aufruf eingebunden ist (synchron oder bereits Teil eines async-Renderpfads) und binde die neue Sektion nach demselben Muster ein — falls der umgebende Aufruf synchron ist, siehe bestehenden Umgang mit `hasAdminRoles()`-Sektionen für das etablierte Async-Handling in dieser Datei (z. B. ein Platzhalter-Render gefolgt von Re-Render nach `await`).

Ergänze passende `t()`-Keys im `auth`-Namespace von `src/core/i18n.js` (`smtpHeading`, `smtpDesc`, `smtpHostLabel`, `smtpPortLabel`, `smtpUsernameLabel`, `smtpPasswordLabel`, `smtpFromAddressLabel`, `smtpFromNameLabel`, `smtpTestEmailLabel`, `smtpTestButton`, `smtpSaved`, `smtpSaveFailed`, `smtpTestOk`, `smtpTestFailed`) mit sinnvollen deutschen Texten, analog zum bestehenden Stil in diesem Namespace.

- [ ] **Step 3: Roadmap-Dokument aktualisieren**

In `docs/alleycat-dispatch-roadmap-14-23.md`, in der Status-Tabelle, neue Zeile für dieses Paket ergänzen (Format wie bestehende Zeilen, z. B. Paket 15/Fahrer-App):

```
| **24** | Spokecard-Claiming-Flow | Persistente, instanzweite Fahrer-Konten (E-Mail+Passwort), Claim per Slot-Token-Nachweis (vor/nach dem Rennen), Cross-Event-Historie, SMTP-Passwort-Reset | ✅ <Datum der Fertigstellung> |
```

- [ ] **Step 4: COMPATIBILITY.md ergänzen**

In `php-backend/COMPATIBILITY.md`, neuer Abschnitt (analog zu bestehenden Einträgen):

```markdown
## Spokecard-Claiming-Flow (Fahrer-Konten)

Migration 11 (rider_user/rider_session/rider_claim/rider_password_reset),
rider-register/login/forgot/reset/claim/history in rider.php, SMTP-Client
(smtp.php), smtp-test in auth.php: <Status nach Verifikation aus Task 1-6
eintragen, z. B. "verifiziert gegen lokale MySQL + PHP-Dev-Server +
Mailtrap-Sandbox am <Datum>">. Echter SMTP-Versand über einen Produktions-
Mailserver (Shared-Hosting SMTP-Relay) noch nicht getestet — nur gegen
eine Test-Sandbox (Mailtrap/Mailhog).
```

- [ ] **Step 5: Bauen, vollständige Verifikation**

```bash
node build.js
```

Erwartet: `Org-Scoping-Guard: OK`, alle vier Dist-Dateien gebaut ohne Fehler. `test-suite.js` (Organizer) UND `test-suite-rider.js` (Fahrer-App) im sichtbaren Browser-Pane laufen lassen, beide grün (bis auf bekannte, dokumentierte Flakes).

- [ ] **Step 6: Commit**

```bash
git add src/core/i18n.js src/core/ui-headquarter.js docs/alleycat-dispatch-roadmap-14-23.md php-backend/COMPATIBILITY.md
git commit -m "feat: add SMTP settings UI, i18n strings, and docs for rider accounts"
```

---

## Self-Review-Notizen (für den Ersteller dieses Plans, bereits geprüft)

- **Spec-Abdeckung:** §3 Datenmodell → Task 1. §4 Claim-Flow → Task 4/5/8/9. §5 SMTP-Reset → Task 3/4/6/9/10. §6 Rider-App-UI → Task 8/9. §7 Security → durchgängig (Enumeration-Schutz in Task 4, Token-Nachweis in Task 5, Session-Invalidierung in Task 4 `rider-reset`, SysAdmin-Gate in Task 6/10). §8 Abgrenzung → keine eigene Task nötig, rein informativ.
- **Abweichung von der Spec (dokumentiert):** `rider_session` ohne `expires_at`, siehe Global Constraints — Ruling zugunsten von Konsistenz mit `admin_session`/`checkpoint_session`.
- **Zwei Stellen bewusst dem Implementierer überlassen** (Task 9 Step 4, Task 10 Step 2), weil sie vom tatsächlichen, zum Ausführungszeitpunkt aktuellen Code abhängen (Toast-Funktion in der Fahrer-App, Async-Einbindung in Settings) — beide sind klar umrissen, keine vagen "add error handling"-Platzhalter.
