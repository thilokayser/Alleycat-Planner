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
   auf den aktuellen Stand kommen, ohne Datenverlust — siehe
   runMigrations()'s zweiter Testfall in test-race-and-load.php.

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
