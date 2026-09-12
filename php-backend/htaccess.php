<?php
/* Alleycat Dispatch — Pretty-URL-.htaccess
   ------------------------------------------------------------------
   Schreibt (bzw. aktualisiert) den Rewrite-Block im Web-Root, der
   /<org-slug>/... auf die Organizer-HTML umleitet. Eigene Datei statt
   einer Funktion in install.php, weil zwei Aufrufer sie brauchen:

     install.php  — bei der Erstinstallation
     migrate.php  — für bereits installierte Backends, bei denen
                    install.php längst selbst gelöscht ist und eine
                    korrigierte Regel sonst nie ankäme

   Der Block ist durch Marker abgegrenzt und wird bei erneutem Lauf
   ersetzt, nicht angehängt — sonst sammelten sich mit jeder Migration
   weitere Kopien an. Alles außerhalb der Marker bleibt unangetastet.
   ------------------------------------------------------------------ */

function writePrettyUrlHtaccess($dir){
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
