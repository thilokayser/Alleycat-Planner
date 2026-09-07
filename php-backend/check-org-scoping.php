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
$allowLookbehind = 8;      // Freigabekommentar darf über dem Statement stehen

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

function scopingHasAllowMarker(array $lines, $start, $lookbehind, $marker, $statementText){
  if(strpos($statementText, $marker) !== false) return true;
  for($i = max(0, $start - $lookbehind); $i < $start; $i++){
    if(strpos($lines[$i], $marker) !== false) return true;
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

  /* Inline geschriebene Tabellennamen — stehen direkt in der Query-Zeile. */
  $inlineTokens = [];
  foreach($adminOrgBoundSuffixes as $s){ $inlineTokens[] = "adminTableName('{$s}')"; }
  foreach($riderOrgBoundSuffixes as $s){ $inlineTokens[] = "riderTableName('{$s}')"; }
  $inlineTokens[] = 'ALLEYCAT_TABLE';   // inline verwendet, z. B. in ?a=discover

  /* Aliase werden beim Durchlauf mitgeführt statt einmal für die ganze
     Datei gesammelt: Kurznamen wie $t werden hier in fast jeder Funktion
     neu belegt (mal checkpoint_staff, mal rate_limit, mal rider_log).
     Eine dateiweite Sammlung hätte jedes $t als org-gebunden gewertet und
     den Guard mit False Positives unbrauchbar gemacht. Maßgeblich ist
     deshalb immer die NÄCHSTGELEGENE vorangehende Zuweisung. */
  $alias = [];

  foreach($lines as $i => $line){
    if(preg_match('/\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(admin|rider)TableName\(\s*\'([a-z_]+)\'\s*\)/', $line, $a)){
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
    foreach($inlineTokens as $tok){
      if(strpos($line, $tok) !== false){ $touched = $tok; break; }
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

    if(scopingHasAllowMarker($lines, $i, $allowLookbehind, $allowMarker, $stmtText)) continue;
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
