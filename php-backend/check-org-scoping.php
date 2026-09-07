<?php
/* Alleycat Dispatch — Org-Scoping-Guard
   ------------------------------------------------------------------
   Scannt die PHP-Endpunkte nach Queries gegen org-gebundene Tabellen
   (organization, org_member, org_event_admin, event, checkpoint_staff,
   checkpoint_session, rider_event und die Basis-KV-Tabelle) und schlägt
   fehl, wenn eine solche Query kein `org_id`-PRÄDIKAT enthält.

   Warum nicht einfach nach `_event\`` & Co. im Quelltext suchen: dieser
   Code baut Tabellennamen nie literal, sondern über adminTableName() /
   riderTableName() / ALLEYCAT_TABLE — meistens sogar einmal in eine
   Variable ($eventTable, $evtT, $table) und danach nur noch per
   Interpolation. Eine Suche nach Backtick-Literalen traf deshalb exakt
   null Zeilen und war immer grün. Der Scanner löst darum zuerst die
   Tabellen-Aliase je Datei auf und sucht dann nach diesen Aliassen.

   Zweite Lehre aus C4: „org_id kommt irgendwo in der Zeile vor" reicht
   nicht. Der verwundbare Upsert in api.php hatte `org_id` in der
   Spaltenliste des INSERT, aber kein Filterprädikat — genau das war der
   Bug. Gezählt wird deshalb nur org_id in WHERE-/AND-/OR-/SET-Position.

   Grobes Textmuster, kein echter SQL-Parser — bewusst so einfach wie
   assertCoreIsBackendAgnostic() in build.js: lieber ein False Positive,
   das man mit einem `org-scoping-guard: ok`-Kommentar samt Begründung
   freigibt, als eine stille Lücke.
   ------------------------------------------------------------------ */

/* Tabellen-Suffixe, deren Zeilen genau einer Org gehören. admin_user /
   admin_session / invite_code / admin_audit_log stehen bewusst NICHT
   hier: die sind instanzweit und werden über den SysAdmin-Status
   geschützt, nicht über org_id. */
$adminOrgBoundSuffixes = ['organization', 'org_member', 'org_event_admin', 'event', 'checkpoint_staff', 'checkpoint_session'];
$riderOrgBoundSuffixes = ['event'];

$files = ['api.php', 'rider.php', 'auth.php', 'bootstrap.php'];
$allowMarker = 'org-scoping-guard: ok';
$maxStatementLines = 10;   // längster Upsert im Bestand sind 9 Zeilen
/* Kein fester Zeilenabstand mehr für den Freigabekommentar — siehe
   scopingHasAllowMarker(): der Kommentar deckt nur das Statement direkt
   darunter, egal wie lang er selbst ist, kann aber nie über eine andere
   Query hinweg „durchsickern". Jedes freigegebene Statement bekommt
   deshalb seinen eigenen Kommentar, auch wenn zwei Statements direkt
   hintereinander stehen (siehe checkpointstaff/set: DELETE+INSERT, je
   ein eigener Marker). */

/* Statement = Zeile mit Query-Schlüsselwort + Folgezeilen, bis die
   SQL-Zeichenkette erkennbar endet. Ohne dieses Fenster hätte jeder
   mehrzeilige Upsert (api.php, rider.php) ein WHERE in einer Folgezeile
   nicht mitgezählt. */
function scopingStatementText(array $lines, $start, $maxLines){
  $text = '';
  $end = min(count($lines), $start + $maxLines);
  for($i = $start; $i < $end; $i++){
    $text .= $lines[$i];
    /* Ende der eingebetteten SQL-Zeichenkette: schließendes " gefolgt
       von ) oder ; — trifft sowohl ->prepare("…") als auch query("…"). */
    if(preg_match('/"\s*\)/', $lines[$i]) || preg_match('/";/', $lines[$i])) break;
  }
  return $text;
}

/* org_id als Filter/Zuweisung, nicht als bloße Spaltennennung. */
function scopingHasOrgPredicate($text){
  /* Der optionale `alias.`-Präfix ist nicht kosmetisch: die JOIN-Queries in
     auth.php filtern als `WHERE m.org_id = ?` bzw. `WHERE a.org_id = ?`. */
  return (bool)preg_match('/\b(?:WHERE|AND|OR|SET)\s+(?:[A-Za-z_][A-Za-z0-9_]*\.)?`?org_id`?\s*(?:=|<>|!=|\bIN\b|\bIS\b)/i', $text);
}

/* Läuft von der Statement-Zeile rückwärts, bis sie entweder auf den
   Freigabekommentar trifft (-> true) oder auf eine ANDERE
   Query-auslösende Zeile (-> false, der Kommentar gehört dann zu jenem
   fremden Statement, nicht zu diesem). Kein fester Zeilenabstand mehr:
   ein Kommentar direkt über seinem Statement gilt unabhängig von seiner
   eigenen Länge (mehrzeilige Begründungen sind hier Standard), aber er
   kann nie über eine fremde Query hinweg „durchsickern" — genau das war
   das Risiko am festen 8-Zeilen-Fenster. $hardCap ist nur ein
   Sicherheitsnetz gegen eine kaputte Datei ohne jede Statement-Grenze. */
function scopingHasAllowMarker(array $lines, $start, $marker, $statementText, $hardCap = 30){
  if(strpos($statementText, $marker) !== false) return true;
  $limit = max(0, $start - $hardCap);
  for($i = $start - 1; $i >= $limit; $i--){
    if(strpos($lines[$i], $marker) !== false) return true;
    if(preg_match('/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i', $lines[$i])) return false;
  }
  return false;
}

$violations = [];
$scanned = 0;
$checked = [];

foreach($files as $file){
  $path = __DIR__ . '/' . $file;
  if(!is_file($path)){
    fwrite(STDERR, "Org-Scoping-Guard: Datei fehlt: {$file}\n");
    exit(1);
  }
  $lines = file($path);

  /* Inline geschriebene Tabellennamen — stehen direkt in der Query-Zeile.
     Als Regex statt als Literal-String, damit sowohl 'event' als auch
     "event" erkannt werden — PHP-Code in diesem Repo nutzt beide
     Anführungszeichen-Stile, ein reiner strpos()-Literalvergleich hätte
     die doppelt zitierte Variante lautlos übersehen. */
  $inlinePatterns = [];
  foreach($adminOrgBoundSuffixes as $s){ $inlinePatterns["adminTableName('{$s}')"] = '/adminTableName\(\s*[\'"]' . preg_quote($s, '/') . '[\'"]\s*\)/'; }
  foreach($riderOrgBoundSuffixes as $s){ $inlinePatterns["riderTableName('{$s}')"] = '/riderTableName\(\s*[\'"]' . preg_quote($s, '/') . '[\'"]\s*\)/'; }
  $inlinePatterns['ALLEYCAT_TABLE'] = '/\bALLEYCAT_TABLE\b/';   // inline verwendet, z. B. in ?a=discover

  /* Aliase werden beim Durchlauf mitgeführt statt einmal für die ganze
     Datei gesammelt: Kurznamen wie $t werden hier in fast jeder Funktion
     neu belegt (mal checkpoint_staff, mal rate_limit, mal rider_log).
     Eine dateiweite Sammlung hätte jedes $t als org-gebunden gewertet und
     den Guard mit False Positives unbrauchbar gemacht. Maßgeblich ist
     deshalb immer die NÄCHSTGELEGENE vorangehende Zuweisung. */
  $alias = [];

  foreach($lines as $i => $line){
    if(preg_match('/\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(admin|rider)TableName\(\s*[\'"]([a-z_]+)[\'"]\s*\)/', $line, $a)){
      $suffixes = $a[2] === 'admin' ? $adminOrgBoundSuffixes : $riderOrgBoundSuffixes;
      $alias['{$' . $a[1] . '}'] = in_array($a[3], $suffixes, true) ? "{$a[2]}TableName('{$a[3]}')" : null;
    } elseif(preg_match('/\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*ALLEYCAT_TABLE\s*;/', $line, $a)){
      /* Die Basis-KV-Tabelle hat seit Migration 7 den zusammengesetzten
         PK (org_id,key) und ist damit org-gebunden. */
      $alias['{$' . $a[1] . '}'] = 'ALLEYCAT_TABLE';
    } elseif(preg_match('/\$([A-Za-z_][A-Za-z0-9_]*)\s*=[^=]/', $line, $a)){
      /* Andere Zuweisung an denselben Namen: Alias verfällt. */
      unset($alias['{$' . $a[1] . '}']);
    }

    if(!preg_match('/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i', $line)) continue;

    $touched = null;
    foreach($inlinePatterns as $label => $pattern){
      if(preg_match($pattern, $line)){ $touched = $label; break; }
    }
    if($touched === null){
      foreach($alias as $var => $kind){
        if($kind !== null && strpos($line, $var) !== false){ $touched = "{$var} = {$kind}"; break; }
      }
    }
    if($touched === null) continue;

    $scanned++;
    $stmtText = scopingStatementText($lines, $i, $maxStatementLines);
    $checked[] = "{$file}:" . ($i + 1) . "  [{$touched}]";

    if(scopingHasAllowMarker($lines, $i, $allowMarker, $stmtText)) continue;
    if(scopingHasOrgPredicate($stmtText)) continue;

    $violations[] = "{$file}:" . ($i + 1) . ': ' . trim($line);
  }
}

if($scanned === 0){
  fwrite(STDERR, "Org-Scoping-Guard: 0 Query-Zeilen gefunden — der Scanner erkennt die\n"
               . "Tabellennamen dieser Codebasis nicht mehr (Alias-Muster geändert?).\n"
               . "Ein Guard, der nichts findet, ist immer gruen und damit wertlos.\n");
  exit(1);
}

if($violations){
  fwrite(STDERR, "Org-Scoping-Guard: " . count($violations) . " von {$scanned} org-gebundenen Query(s) ohne org_id-Prädikat:\n");
  foreach($violations as $v){ fwrite(STDERR, "  {$v}\n"); }
  fwrite(STDERR, "\nEntweder ein org_id-Prädikat ergänzen, oder — wenn die Query aus einem\n"
               . "nachvollziehbaren Grund ohne auskommt — direkt darüber einen Kommentar\n"
               . "mit '{$allowMarker}' samt Begründung setzen.\n");
  exit(1);
}

echo "Org-Scoping-Guard: OK — {$scanned} org-gebundene Query(s) geprüft, keine Verstöße.\n";
if(in_array('-v', $argv ?? [], true)){
  foreach($checked as $c){ echo "  {$c}\n"; }
}
exit(0);
