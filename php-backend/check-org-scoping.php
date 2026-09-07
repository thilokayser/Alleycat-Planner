<?php
/* Alleycat Dispatch — Org-Scoping-Guard
   ------------------------------------------------------------------
   Scannt api.php/rider.php/auth.php nach Queries gegen org-gebundene
   Tabellen (organization, org_member, org_event_admin, event,
   checkpoint_staff, checkpoint_session, die Basis-KV-Tabelle) und
   schlägt fehl, wenn eine solche Query kein `org_id`-Token im selben
   Statement enthält. Grobes Textmuster, kein echter SQL-Parser — bewusst
   so einfach wie assertCoreIsBackendAgnostic() in build.js: lieber ein
   False Positive, das man von Hand freigibt, als eine stille Lücke.
   ------------------------------------------------------------------ */

$orgBoundTablePatterns = ['_organization`', '_org_member`', '_org_event_admin`', '_event`', '_checkpoint_staff`', '_checkpoint_session`'];
$files = ['api.php', 'rider.php', 'auth.php'];
$violations = [];

foreach($files as $file){
  $path = __DIR__ . '/' . $file;
  $lines = file($path);
  foreach($lines as $i => $line){
    $isQuery = (stripos($line, 'SELECT') !== false || stripos($line, 'INSERT') !== false
             || stripos($line, 'UPDATE') !== false || stripos($line, 'DELETE FROM') !== false);
    if(!$isQuery) continue;
    $touchesOrgBound = false;
    foreach($orgBoundTablePatterns as $p){
      if(strpos($line, $p) !== false){ $touchesOrgBound = true; break; }
    }
    if(!$touchesOrgBound) continue;
    if(strpos($line, 'org_id') === false){
      $violations[] = "{$file}:" . ($i + 1) . ': ' . trim($line);
    }
  }
}

if($violations){
  fwrite(STDERR, "Org-Scoping-Guard: " . count($violations) . " Query(s) ohne erkennbares org_id-Prädikat:\n");
  foreach($violations as $v){ fwrite(STDERR, "  {$v}\n"); }
  exit(1);
}
echo "Org-Scoping-Guard: OK, keine Verstöße gefunden.\n";
exit(0);
