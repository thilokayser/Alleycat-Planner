-- Zweite Datenbank fuer den PHP-7.4-Container: getrennte Installation,
-- damit sich die beiden config.php/Schemata nicht gegenseitig ueberschreiben.
CREATE DATABASE IF NOT EXISTS alleycat74 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON alleycat74.* TO 'alleycat'@'%';
FLUSH PRIVILEGES;
