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

  /* Härtung gegen SMTP-/Header-Injection: $toEmail und $subject landen
     roh in RCPT TO:/To:/Subject:. Ein eingebettetes CR/LF könnte
     zusätzliche Befehle oder Header einschleusen. */
  if(preg_match('/[\r\n]/', $toEmail) || preg_match('/[\r\n]/', $subject)){
    throw new Exception('SMTP: ungültige Zeichen in Empfänger oder Betreff');
  }

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
  /* RFC 5321 §2.3.7 verlangt CRLF auf der Leitung. Aufrufer übergeben hier
     typischerweise \n-only PHP-Strings — erst auf \n normalisieren (falls
     schon \r\n oder einzelne \r drinstecken), dann Dot-Stuffing auf den
     \n-getrennten Zeilen durchführen (^. matcht sonst nicht zuverlässig
     hinter \r), und erst danach zu \r\n expandieren. */
  $normalizedBody = str_replace(["\r\n", "\r"], "\n", $bodyText);
  /* Führende Punkte in Zeilen müssen verdoppelt werden (SMTP-Dot-Stuffing),
     sonst interpretiert der Server eine Zeile als Nachrichtenende. */
  $escapedBody = preg_replace('/^\./m', '..', $normalizedBody);
  $message = $headers . "\r\n" . $escapedBody . "\r\n.\r\n";
  $message = str_replace(["\r\n", "\r"], "\n", $message);
  $message = str_replace("\n", "\r\n", $message);
  fwrite($sock, $message);
  $code = smtpReadResponse($sock);
  if($code !== 250) throw new Exception("SMTP: Zustellung abgelehnt (Code {$code})");

  fwrite($sock, "QUIT\r\n");
  fclose($sock);
  return true;
}
