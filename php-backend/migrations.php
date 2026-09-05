<?php
/* Alleycat Dispatch — Schema-Migrationen
   ------------------------------------------------------------------
   Kleiner, nummerierter Migrations-Runner für den kv-Tabellen-Storage.
   Der Schema-Stand wird in einer eigenen <prefix>db_meta-Tabelle
   festgehalten (eine einzige Zeile mit `schema_version`). Jede
   Migration ist idempotent formuliert (CREATE TABLE IF NOT EXISTS /
   nur additive ALTERs), damit sowohl eine frische Installation als
   auch eine bereits vor Einführung dieses Mechanismus bestehende
   kv-Tabelle (Schema-Version faktisch 0, aber Daten vorhanden) sauber
   auf den aktuellen Stand kommen, ohne Datenverlust. Die Testläufe
   dazu sind Wegwerf-Skripte und liegen nicht im Repo — ihre Ergebnisse
   stehen in COMPATIBILITY.md.

   MySQL/MariaDB committen DDL-Statements (CREATE TABLE/ALTER) immer
   implizit — es gibt dafür keine echte Transaktionssicherheit wie bei
   DML. Migrationen sind deshalb bewusst als wiederholbar/idempotent
   formuliert statt sich auf Rollback bei einem Teilfehler zu
   verlassen: bricht Migration N mitten drin ab, holt ein erneuter
   Aufruf sie beim nächsten Versuch einfach nach (CREATE TABLE IF NOT
   EXISTS überspringt bereits vorhandene Teile automatisch). */

function migrationsList($table, $charset){
  return [
    1 => function(PDO $pdo) use ($table, $charset){
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}` (
        `key` VARCHAR(191) NOT NULL PRIMARY KEY,
        `value` LONGTEXT NOT NULL,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");
    },

    /* Rider-App-Fundament. Fünf Tabellen neben der kv-Tabelle, nicht
       darin: Fahrer-Check-ins sind reine INSERTs und dürfen nicht mit
       dem Read-Modify-Write des Organizers auf den Event-Blob
       konkurrieren. Namen der Tabellen leiten sich per Suffix vom
       kv-Tabellennamen ab, damit eine Installation mit eigenem Präfix
       zusammenhängend bleibt. */
    2 => function(PDO $pdo) use ($table, $charset){
      /* Das öffentliche Gegenstück zu einem Event-Blob. `storage_key`
         zeigt zurück auf die kv-Zeile, aus der es veröffentlicht
         wurde. */
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_rider_event` (
        `public_id` VARCHAR(16) NOT NULL PRIMARY KEY,
        `storage_key` VARCHAR(191) NOT NULL,
        `name` VARCHAR(191) NOT NULL DEFAULT '',
        `status` VARCHAR(16) NOT NULL DEFAULT 'planning',
        `settings` TEXT NOT NULL,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      /* Eine Zeile pro gedruckter Spokecard. Token und Code liegen nur
         als SHA-256 vor: sie werden per Lookup gefunden, ein Salt pro
         Zeile machte den Index unbrauchbar — und bei 32 Zeichen aus
         einem kryptografischen Zufallsgenerator gibt es nichts zu
         erraten. `uq_bib` macht das Belegen einer Startnummer atomar,
         auch wenn zwei Fahrer gleichzeitig dieselbe wählen. */
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_rider_slot` (
        `public_id` VARCHAR(16) NOT NULL,
        `bib` INT UNSIGNED NOT NULL,
        `token_hash` CHAR(64) NOT NULL,
        `code_hash` CHAR(64) NOT NULL,
        `status` VARCHAR(16) NOT NULL DEFAULT 'free',
        PRIMARY KEY (`public_id`, `bib`),
        UNIQUE KEY `uq_token` (`token_hash`),
        UNIQUE KEY `uq_code` (`public_id`, `code_hash`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      /* Koordinaten sind nullbar: sie werden nur veröffentlicht, wenn
         die Kartenansicht für Fahrer freigeschaltet ist. */
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_rider_checkpoint` (
        `public_id` VARCHAR(16) NOT NULL,
        `cp_id` VARCHAR(64) NOT NULL,
        `label` VARCHAR(191) NOT NULL DEFAULT '',
        `qr_token_hash` CHAR(64) NOT NULL,
        `qr_enabled` TINYINT(1) NOT NULL DEFAULT 0,
        `sort_index` INT NOT NULL DEFAULT 0,
        `lat` DOUBLE NULL,
        `lon` DOUBLE NULL,
        PRIMARY KEY (`public_id`, `cp_id`),
        KEY `idx_qr` (`qr_token_hash`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      /* Append-only. Die monoton steigende `id` ist der Cursor, mit dem
         Organizer und Beamer unabhängig voneinander nachlesen.

         Zwei UNIQUE-Indizes ersetzen Prüfungen im Anwendungscode:
         `uq_client` macht den Retry der Offline-Queue idempotent,
         `uq_scan` verhindert den doppelten Scan desselben Checkpoints.
         `uq_scan` funktioniert trotz nullbarer `cp_id`, weil MySQL
         NULL-Werte in einem UNIQUE-Index als jeweils verschieden
         behandelt — Registrierungszeilen (cp_id NULL) kollidieren
         deshalb nie miteinander.

         `created_at` ist bewusst kein TIMESTAMP mit Default: der Wert
         ist der Scan-Zeitpunkt auf dem Gerät, nicht der Upload-
         Zeitpunkt. Ein Check-in aus der Offline-Queue kann Stunden
         später ankommen, für die Wertung zählt der Scan. */
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_rider_log` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `public_id` VARCHAR(16) NOT NULL,
        `type` VARCHAR(16) NOT NULL,
        `bib` INT UNSIGNED NOT NULL,
        `cp_id` VARCHAR(64) NULL,
        `client_uuid` CHAR(36) NOT NULL,
        `payload` TEXT NULL,
        `gps_lat` DOUBLE NULL,
        `gps_lon` DOUBLE NULL,
        `gps_distance_m` INT NULL,
        `created_at` DATETIME NOT NULL,
        UNIQUE KEY `uq_client` (`client_uuid`),
        UNIQUE KEY `uq_scan` (`public_id`, `bib`, `cp_id`),
        KEY `idx_feed` (`public_id`, `id`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      /* rider.php ist ohne Admin-Key erreichbar, also öffentlich. Der
         8-Zeichen-Klartextcode von der Spokecard ist das schwächste
         Geheimnis im System und wird nicht durch Länge geschützt,
         sondern durch Bremsen. Gezählt werden nur fehlgeschlagene
         Authentifizierungen — ein Fahrer mit vielen gültigen Scans darf
         sich nicht selbst aussperren. */
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_rider_ratelimit` (
        `ip_hash` CHAR(64) NOT NULL PRIMARY KEY,
        `window_start` DATETIME NOT NULL,
        `fail_count` INT UNSIGNED NOT NULL DEFAULT 0,
        `block_until` DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");
    },

    /* Checkpoint-Typ für die Fahrer-App. Sie zeigt pro Checkpoint, was
       dort zu tun ist ("Foto machen" statt nur "offen"), und braucht
       dafür den Typ. Kein Geheimnis: er steht ohnehin auf dem gedruckten
       Manifest in der Hand des Fahrers.

       Additiv mit Default, also unkritisch für bestehende Installationen —
       vorhandene Zeilen bekommen den leeren String und werden beim
       nächsten Publish des Organizers gefüllt. */
    3 => function(PDO $pdo) use ($table, $charset){
      /* `ADD COLUMN IF NOT EXISTS` gibt es in MariaDB, in MySQL nicht.
         Die Idempotenz-Zusage des Runners (siehe Kopf dieser Datei) muss
         aber auf beiden gelten, deshalb die Abfrage statt der Kurzform. */
      $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'cp_type'"
      );
      $stmt->execute(["{$table}_rider_checkpoint"]);
      if((int)$stmt->fetchColumn() === 0){
        $pdo->exec("ALTER TABLE `{$table}_rider_checkpoint`
                    ADD COLUMN `cp_type` VARCHAR(32) NOT NULL DEFAULT ''");
      }
    },

    /* Admin-Benutzer/Rollen (Checkpoint-App-Grundlage). Vier neue Tabellen,
       analog zur Rider-App-Migration (2) additiv und ohne Berührung der
       bestehenden Tabellen — eine Installation ohne diese Migration bleibt
       mit dem einen geteilten API-Key voll funktionsfähig (apiVerifyKey()
       in bootstrap.php prüft weiterhin zuerst den Key, die Rollenprüfung
       kommt nur bei X-Admin-Token zum Tragen). */
    4 => function(PDO $pdo) use ($table, $charset){
      /* Passwort bewusst mit password_hash (bcrypt), nicht sha256 wie bei
         Fahrer-Token: hier ist der Mensch die Quelle des Geheimnisses
         (wählt ein womöglich schwaches Passwort), nicht ein
         kryptografischer Zufallsgenerator — dieselbe Unterscheidung wie
         beim API-Key in install.php. */
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_admin_user` (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `username` VARCHAR(64) NOT NULL,
        `password_hash` VARCHAR(255) NOT NULL,
        `role` VARCHAR(20) NOT NULL DEFAULT 'viewer',
        `display_name` VARCHAR(191) NOT NULL DEFAULT '',
        `active` TINYINT(1) NOT NULL DEFAULT 1,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `last_seen_at` DATETIME NULL,
        UNIQUE KEY `uq_username` (`username`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      /* Bearer-Session statt PHP-$_SESSION-Cookie: die API antwortet mit
         Access-Control-Allow-Origin: * (siehe apiSendCorsHeaders()), und
         Cookies funktionieren mit einem Wildcard-Origin nicht zusammen mit
         credentials — das ganze Backend ist ohnehin durchgehend
         Header-Auth (X-Api-Key, X-Rider-Token). Der Sessiontoken reiht sich
         da ein, nur eben personalisiert und mit Rolle statt Vollzugriff.
         Gleiches Hash-Verfahren wie bei Fahrer-Token: hochentropischer
         Zufallswert, kein schwaches Geheimnis zu strecken. */
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_admin_session` (
        `token_hash` CHAR(64) NOT NULL PRIMARY KEY,
        `user_id` INT UNSIGNED NOT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `last_seen_at` DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      /* Checkpoint-App, Konten-Modus: welchem Benutzer welcher Checkpoint
         (innerhalb welchen Events) zugewiesen ist. Zusammengesetzter
         Primärschlüssel statt eigener id-Spalte, weil eine Zuweisung nie
         für sich allein referenziert wird. */
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_checkpoint_staff` (
        `user_id` INT UNSIGNED NOT NULL,
        `public_id` VARCHAR(16) NOT NULL,
        `cp_id` VARCHAR(64) NOT NULL,
        PRIMARY KEY (`user_id`, `public_id`, `cp_id`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      /* Checkpoint-App, Code-Modus: ein kurzer, am Gerät eingetippter
         Zugangscode pro Checkpoint statt eines Benutzerkontos — für kleine
         Rennen, bei denen ein Konto pro Helfer Overhead wäre. Eigene
         Session-Tabelle statt admin_session: dieser Token ist auf genau
         einen Checkpoint beschränkt und trägt keine admin_user-Rolle. */
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_checkpoint_session` (
        `token_hash` CHAR(64) NOT NULL PRIMARY KEY,
        `public_id` VARCHAR(16) NOT NULL,
        `cp_id` VARCHAR(64) NOT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `last_seen_at` DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'staff_code_hash'"
      );
      $stmt->execute(["{$table}_rider_checkpoint"]);
      if((int)$stmt->fetchColumn() === 0){
        $pdo->exec("ALTER TABLE `{$table}_rider_checkpoint`
                    ADD COLUMN `staff_code_hash` CHAR(64) NULL");
      }

      /* Herkunft eines Check-ins: 'rider' (Fahrer scannt selbst, Status
         quo) oder 'staff' (Checkpoint-App). `staff_ref` ist ein
         Anzeigename fürs Log (Username im Konten-Modus, sonst 'code') —
         kein Fremdschlüssel, damit ein gelöschtes Benutzerkonto die
         historischen Log-Zeilen nicht verwaist zurücklässt. */
      foreach([
        ['via', "VARCHAR(16) NOT NULL DEFAULT 'rider'"],
        ['staff_ref', "VARCHAR(64) NULL"]
      ] as $col){
        $stmt = $pdo->prepare(
          "SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?"
        );
        $stmt->execute(["{$table}_rider_log", $col[0]]);
        if((int)$stmt->fetchColumn() === 0){
          $pdo->exec("ALTER TABLE `{$table}_rider_log` ADD COLUMN `{$col[0]}` {$col[1]}");
        }
      }
    },

    /* Einladungscodes für Selbstregistrierung (auth.php ?a=invite-create/
       -list/-revoke, ?a=register). Additiv, eigene Tabelle, berührt
       admin_user/admin_session aus Migration 4 nicht — eine Installation
       ohne diese Migration bleibt mit der bestehenden manuellen
       Benutzerverwaltung voll funktionsfähig. */
    5 => function(PDO $pdo) use ($table, $charset){
      /* code_hash wie staff_code_hash gehasht: der Code ist ein
         kryptografischer Zufallswert, kein vom Menschen gewähltes
         Geheimnis — anders als das Passwort, das dieselbe Registrierung
         im selben Zug anlegt (dort password_hash, siehe admin_user). */
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_invite_code` (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `code_hash` CHAR(64) NOT NULL,
        `role` VARCHAR(20) NOT NULL,
        `note` VARCHAR(191) NULL,
        `expires_at` DATETIME NOT NULL,
        `used_at` DATETIME NULL,
        `used_by_user_id` INT UNSIGNED NULL,
        `created_by_user_id` INT UNSIGNED NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_code_hash` (`code_hash`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");
    },
  ];
}

function ensureMetaTable(PDO $pdo, $metaTable, $charset){
  $pdo->exec("CREATE TABLE IF NOT EXISTS `{$metaTable}` (
    `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
    `schema_version` INT UNSIGNED NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");
  $pdo->exec("INSERT IGNORE INTO `{$metaTable}` (`id`, `schema_version`) VALUES (1, 0)");
}

function getSchemaVersion(PDO $pdo, $metaTable){
  $stmt = $pdo->query("SELECT `schema_version` FROM `{$metaTable}` WHERE `id` = 1");
  $val = $stmt->fetchColumn();
  return $val === false ? 0 : (int)$val;
}

function setSchemaVersion(PDO $pdo, $metaTable, $version){
  $stmt = $pdo->prepare("UPDATE `{$metaTable}` SET `schema_version` = ? WHERE `id` = 1");
  $stmt->execute([$version]);
}

/* Führt alle noch ausstehenden Migrationen in Reihenfolge aus. Gibt
   die Liste der tatsächlich ausgeführten Versionsnummern zurück (leer
   = Schema war bereits aktuell). Wirft bei einem Fehler eine
   Exception mit der betroffenen Versionsnummer — der Aufrufer
   entscheidet, wie er das meldet (install.php zeigt es dem Admin,
   migrate.php gibt es als JSON zurück). */
function runMigrations(PDO $pdo, $table, $metaTable, $charset){
  ensureMetaTable($pdo, $metaTable, $charset);
  $current = getSchemaVersion($pdo, $metaTable);
  $migrations = migrationsList($table, $charset);
  ksort($migrations);
  $applied = [];
  foreach($migrations as $version => $fn){
    if($version <= $current) continue;
    try {
      $fn($pdo);
      setSchemaVersion($pdo, $metaTable, $version);
      $applied[] = $version;
    } catch (Exception $e) {
      throw new Exception("Migration {$version} fehlgeschlagen: " . $e->getMessage());
    }
  }
  return $applied;
}
