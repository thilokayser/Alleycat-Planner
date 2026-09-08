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

/* RFC 2047 "B"-Encoded-Word, mit Zeilenfaltung: ein Encoded-Word darf laut
   RFC 2047 §2 höchstens 75 Zeichen lang sein (inkl. "=?UTF-8?B?"/"?=") und
   dabei nie ein Mehrbyte-Zeichen mittendrin zerschneiden — reines
   Abschneiden des fertigen Base64-Strings würde beides verletzen. Deshalb
   zeichenweise (nicht byteweise) in Häppchen packen, jedes einzeln
   base64-kodieren, mehrere Encoded-Words per CRLF+Space (Folding-
   Whitespace, RFC 5322 §2.2.3) verbinden. Aktuell sendet dieses Feature
   nur zwei kurze, einwortige Betreffe (beide unter dem Limit) — die
   Faltung greift erst, falls das je nicht mehr stimmt. */
function smtpEncodeHeaderWord($text){
  if(mb_check_encoding($text, 'ASCII')) return $text;
  $words = [];
  $chunk = '';
  foreach(mb_str_split($text) as $char){
    $candidate = $chunk . $char;
    // 60 Base64-Zeichen + "=?UTF-8?B?" (10) + "?=" (2) = 72, sicher unter 75.
    if($chunk !== '' && strlen(base64_encode($candidate)) > 60){
      $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
      $chunk = $char;
    } else {
      $chunk = $candidate;
    }
  }
  if($chunk !== '') $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
  return implode("\r\n ", $words);
}

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
   "250 " Ende) und gibt den letzten Code als int zurück. 4096 statt der
   RFC-Mindestlänge, damit eine ungewöhnlich lange EHLO-Fähigkeitenzeile
   (viele Extensions in einer Zeile) nicht fehlgeschnitten geparst wird. */
function smtpReadResponse($sock){
  $code = 0;
  while(!feof($sock)){
    $line = fgets($sock, 4096);
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

  /* try/finally statt PHPs Refcounting-Cleanup zu vertrauen: schließt den
     Socket auch dann garantiert, wenn irgendein smtpSendCommand() dazwischen
     wirft (abgelehnte Auth, abgelehnter Empfänger, Timeout) — nicht nur im
     Erfolgsfall am Ende der Funktion. */
  try{
    smtpSendMailOverSocket($sock, $cfg, $toEmail, $subject, $bodyText, $useImplicitTls);
  }finally{
    fclose($sock);
  }
  return true;
}

function smtpSendMailOverSocket($sock, $cfg, $toEmail, $subject, $bodyText, $useImplicitTls){
  stream_set_timeout($sock, 10);
  $greeting = smtpReadResponse($sock); // Server-Banner, kein Befehl
  if($greeting !== 220) throw new Exception("SMTP: kein gültiges Banner (Code {$greeting})");

  /* parse_url() erwartet eine URL, keine bloße E-Mail-Adresse — auf
     "noreply@example.com" liefert PHP_URL_HOST immer null, der Fallback
     'localhost' würde also IMMER greifen. Host stattdessen direkt hinter
     dem letzten '@' abschneiden. */
  $atPos = strrpos($cfg['fromAddress'], '@');
  $localHost = $atPos !== false ? substr($cfg['fromAddress'], $atPos + 1) : 'localhost';
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
  /* RFC 2047 encoded-word: rohes UTF-8 (z. B. das Em-Dash "—" in jedem
     Betreff dieses Features) in einem unkodierten Subject:-Header kann
     von strikten/älteren Mailservern/-clients abgelehnt oder falsch
     dargestellt werden — dieser Client verhandelt kein SMTPUTF8.
     smtpEncodeHeaderWord() faltet außerdem lange Betreffe korrekt. */
  $encodedSubject = smtpEncodeHeaderWord($subject);
  $headers = "From: {$fromHeader}\r\nTo: {$toEmail}\r\nSubject: {$encodedSubject}\r\nContent-Type: text/plain; charset=UTF-8\r\n";
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
}
