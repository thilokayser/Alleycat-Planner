/* ---------------- Paket 6: Spezielle Rennformate (Phase 21) ----------------
   Cargo-Alleycat-Modul + Trackbike-Attribute + Clue-Sheet-PDF-Block. Beide
   Sub-Features hängen als reine Sichtbarkeits-Flags an der bestehenden
   Feature-Registry (cargo_module/trackbike_attributes, siehe
   feature-registry.js) statt eigener evt.isCargoEvent-artiger Felder zu
   erfinden — Ausschalten blendet nur UI aus, evt.checkpoints[].cargoItem /
   rider.gearRatio etc. bleiben unangetastet, exakt das bestehende Prinzip
   von categories/game_modes (siehe CLAUDE.md). Cargo-Bonuspunkte docken
   direkt an den bestehenden Punkte-Ledger aus Phase 11 an (awardPoints()/
   removeLedgerEntries() in rules-engine.js) statt ein eigenes Punktesystem
   zu bauen — unabhängig davon, ob irgendein Spielmodus aktiv ist. */

/* ---------------- Cargo: cp.cargoItem CRUD ---------------- */
function withCargoItemDefaults(item){
  return Object.assign({name: '', weightKg: 0, volumeUnits: 0, bonusPoints: 0}, item);
}
function setCpCargoItem(cpId, enabled){
  const evt = state.currentEvent;
  const cp = (evt.checkpoints || []).find(c => c.id === cpId);
  if(!cp) return;
  cp.cargoItem = enabled ? withCargoItemDefaults({}) : null;
  debouncedSave();
  renderSidebar();
}
function onCpCargoItemFieldChange(cpId, key, value){
  const evt = state.currentEvent;
  const cp = (evt.checkpoints || []).find(c => c.id === cpId);
  if(!cp || !cp.cargoItem) return;
  if(key === 'name') cp.cargoItem.name = value;
  else cp.cargoItem[key] = Math.max(0, parseFloat(value) || 0);
  debouncedSave();
}

/* ---------------- Cargo: Ziel-Check-in — Lieferung prüfen + Bonuspunkte ----------------
   Ein Fahrer "hat" ein Frachtstück, sobald der zugehörige Checkpoint
   abgeschlossen ist (kein separater "Aufnehmen"-Schritt) — cargoDelivered
   defaultet auf "geliefert" (niedrigste Reibung im Normalfall, der Marshal
   hakt nur Ausnahmen ab statt jedes Stück einzeln zu bestätigen). */
function riderCargoCheckpoints(evt, rider){
  return (evt.checkpoints || []).filter(cp => cp.cargoItem && (rider.completed || []).includes(cp.id));
}
function computeCargoDeliverySummary(evt, rider){
  const items = riderCargoCheckpoints(evt, rider).map(cp => ({
    cpId: cp.id, cpName: cp.name, item: cp.cargoItem,
    delivered: !rider.cargoDelivered || rider.cargoDelivered[cp.id] !== false
  }));
  const delivered = items.filter(i => i.delivered);
  const totalWeightKg = delivered.reduce((s, i) => s + (i.item.weightKg || 0), 0);
  return {
    items,
    totalWeightKg,
    totalVolumeUnits: delivered.reduce((s, i) => s + (i.item.volumeUnits || 0), 0),
    totalBonusPoints: delivered.reduce((s, i) => s + (i.item.bonusPoints || 0), 0),
    overCapacity: !!rider.cargoCapacityKg && totalWeightKg > rider.cargoCapacityKg
  };
}
function onCargoDeliveryToggle(bib, cpId, delivered){
  const r = (state.currentEvent.riders || []).find(x => x.bib === bib);
  if(!r) return;
  r.cargoDelivered = r.cargoDelivered || {};
  r.cargoDelivered[cpId] = delivered;
  debouncedSave();
  renderCheckin();
}
function applyCargoBonusPoints(evt, rider){
  removeLedgerEntries(evt, p => p.riderBib === rider.bib && p.source === 'cargo');
  const summary = computeCargoDeliverySummary(evt, rider);
  summary.items.filter(i => i.delivered && i.item.bonusPoints).forEach(i => {
    awardPoints(evt, rider.bib, i.cpId, i.item.bonusPoints, t('raceFormats.cargoLedgerReason', {name: i.item.name || i.cpName || t('checkpoint.noName')}), 'cargo');
  });
}

/* ---------------- Trackbike: Fahrer-Attribute + Leaderboard-Rekorde ----------------
   "Schnellster" = niedrigste finishTime unter den Finishern — die App
   startet alle Fahrer gemeinsam (kein individueller Startzeitstempel pro
   Fahrer), daher ist die reine finishTime-Sortierung bereits eine
   Elapsed-Time-Rangliste (sortRidersForOverview() in leaderboard.js nutzt
   dasselbe Prinzip). */
function computeTrackbikeRecords(evt){
  const finishers = (evt.riders || []).filter(r => r.finishTime && r.raceStatus !== 'dnf' && r.raceStatus !== 'dns' && r.raceStatus !== 'eliminated');
  const fastest = (predicate) => finishers.filter(predicate).sort((a, b) => new Date(a.finishTime) - new Date(b.finishTime))[0] || null;
  return {
    fastestBrakeless: fastest(r => r.isBrakeless),
    bestWorkbike: fastest(r => r.isWorkbike)
  };
}
function raceFormatsBadgeHtml(evt, rider){
  if(!isFeatureEnabled('trackbike_attributes', evt)) return '';
  const records = computeTrackbikeRecords(evt);
  let badges = '';
  if(records.fastestBrakeless && records.fastestBrakeless.bib === rider.bib) badges += `<span class="race-format-badge" title="${t('raceFormats.fastestBrakelessTitle')}">${t('raceFormats.fastestBrakelessBadge')}</span>`;
  if(records.bestWorkbike && records.bestWorkbike.bib === rider.bib) badges += `<span class="race-format-badge" title="${t('raceFormats.bestWorkbikeTitle')}">${t('raceFormats.bestWorkbikeBadge')}</span>`;
  return badges;
}

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
