/* ---------------- Fahrer-App: Serverzugriff ----------------
   Platzhalter (Paket 3). Inhalt folgt in Paket 4.

   Merkposten für dann: rider.php liegt relativ zu dieser HTML-Datei.
   Das ist die einzige Annahme der Fahrer-App über Pfade — sie gehört
   dokumentiert, damit ein späteres Verschieben nicht rätselhaft
   scheitert.                                                           */
function riderEndpoint(){
  return location.href.replace(/[^\/]*(\?.*)?(#.*)?$/, 'rider.php');
}
