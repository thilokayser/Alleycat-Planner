#!/bin/sh
set -e
# php-backend/ liegt read-only unter /srv/php-backend. install.php loescht sich
# nach erfolgreicher Installation selbst und schreibt config.php daneben --
# deshalb hier eine Arbeitskopie statt eines Bind-Mounts, sonst wuerde der
# Installer die getrackte Repo-Datei loeschen.
# ALLEYCAT_KEEP_CONFIG=1 behaelt eine bereits installierte Arbeitskopie, damit
# ein Container-Neustart die Installation nicht wegwirft.
if [ "$ALLEYCAT_KEEP_CONFIG" = "1" ] && [ -f /var/www/html/php-backend/config.php ]; then
  echo "entrypoint: bestehende Installation behalten"
else
  mkdir -p /var/www/html/php-backend
  # Inhalt loeschen statt des Verzeichnisses: das ist ein Volume-Mountpoint.
  find /var/www/html/php-backend -mindepth 1 -delete
  cp -a /srv/php-backend/. /var/www/html/php-backend/
  rm -f /var/www/html/php-backend/config.php
fi
chown -R www-data:www-data /var/www/html/php-backend

# dist/*.html werden kopiert, nicht verlinkt: Apache 2.4.68 (PHP-8.3-Image)
# verweigert Symlinks aus dem Doc-Root heraus mit AH00037, selbst mit
# FollowSymLinks auf Quell- und Zielverzeichnis.
# Nach `node build.js` auf dem Host also `docker compose restart web83 web74`.
for f in /srv/dist/*.html; do
  [ -e "$f" ] || continue
  rm -f "/var/www/html/$(basename "$f")"
  cp -f "$f" "/var/www/html/$(basename "$f")"
done

exec "$@"
