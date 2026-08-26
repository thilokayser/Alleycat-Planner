/* ---------------- Fahrer-App: Ansichten ----------------
   Platzhalter (Paket 3). Inhalt folgt in Paket 4.                      */
function renderRider(){
  document.getElementById('rider-app').innerHTML = `
    <div class="rider-head">
      <div class="rider-head-bib">#—</div>
      <div class="rider-head-meta">
        <div class="rider-head-event">${escapeHtml(t('riderScan.appTitle'))}</div>
        <div class="rider-head-status">${escapeHtml(t('riderScan.placeholder'))}</div>
      </div>
    </div>
    <div class="rider-body">
      <div class="rider-title">${escapeHtml(t('riderScan.placeholder'))}</div>
      <div class="rider-lead">${escapeHtml(t('riderScan.placeholderLead'))}</div>
      <div class="rider-note rider-note-info">
        jsQR: ${typeof jsQR === 'function' ? 'geladen' : 'FEHLT'} ·
        Checkpoint-Typen: ${getCheckpointTypes().length} ·
        Endpunkt: ${escapeHtml(riderEndpoint())}
      </div>
    </div>
  `;
}
