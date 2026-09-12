# Alleycat Dispatch — Testcontainer fuer das PHP-Backend.
# Bewusst Apache + mod_php statt `php -S`: die offenen Fragen aus CLAUDE.md
# (Header-Durchreichung von X-Admin-Token, .htaccess-Schutz fuer config.php)
# lassen sich nur auf einem echten Webserver beantworten.
ARG PHP_VERSION=8.3
FROM php:${PHP_VERSION}-apache

# libonig-dev wird fuer mbstring gebraucht (preflight.php prueft die Extension).
# Check-Valid-Until=false: das PHP-7.4-Image steht auf Debian bullseye, dessen
# Security-Release-File inzwischen abgelaufen ist. Ohne den Schalter bricht
# apt-get update dort ab. Betrifft nur diese Testumgebung.
RUN apt-get -o Acquire::Check-Valid-Until=false update \
  && apt-get install -y --no-install-recommends libonig-dev \
  && docker-php-ext-install pdo_mysql mbstring \
  && rm -rf /var/lib/apt/lists/*

# AllowOverride All -> .htaccess greift. FollowSymLinks -> die dist-Symlinks.
# Der /srv-Block ist noetig, weil die dist-Symlinks aus dem Doc-Root
# hinausfuehren: Apache 2.4.68 verweigert sie sonst mit AH00037
# ("Symbolic link not allowed or link target not accessible").
RUN a2enmod rewrite && printf '%s\n' \
  '<Directory /var/www/html>' \
  '  Options +FollowSymLinks' \
  '  AllowOverride All' \
  '  Require all granted' \
  '</Directory>' \
  '<Directory /srv>' \
  '  Options +FollowSymLinks' \
  '  Require all granted' \
  '</Directory>' > /etc/apache2/conf-available/alleycat.conf \
  && a2enconf alleycat

COPY php.ini /usr/local/etc/php/conf.d/alleycat.ini
COPY entrypoint.sh /usr/local/bin/alleycat-entrypoint
RUN chmod +x /usr/local/bin/alleycat-entrypoint

ENTRYPOINT ["/usr/local/bin/alleycat-entrypoint"]
CMD ["apache2-foreground"]
