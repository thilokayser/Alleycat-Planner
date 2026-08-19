/* ---------------- Paket 6: Spezielle Rennformate (Phase 21) ----------------
   Clue-Sheet-PDF-Block. (Cargo-Modul und Trackbike-Attribute wurden nach
   ursprünglicher Umsetzung wieder entfernt — siehe Roadmap-Doku.) */

/* ---------------- Clue-Sheet: Ziffern-Chiffre für Koordinaten ----------------
   Bewusst keine echte Kryptographie — ein von Hand entschlüsselbares
   Rätselelement für analoge Papier-Navigation (21.3), kein Sicherheits-
   Feature. Jede Ziffer wird um `shift` erhöht (mod 10), Nicht-Ziffern
   bleiben unverändert; die Schlüsselzahl wird auf demselben Sheet als
   Legende gedruckt, damit Fahrer:innen von Hand zurückrechnen können. */
function clueSheetCipherDigits(text, shift){
  const s = ((shift % 10) + 10) % 10;
  return String(text).replace(/[0-9]/g, d => String((parseInt(d, 10) + s) % 10));
}
function clueSheetEncryptedCoords(cp, shift){
  return clueSheetCipherDigits(`${cp.lat.toFixed(5)}, ${cp.lng.toFixed(5)}`, shift);
}
