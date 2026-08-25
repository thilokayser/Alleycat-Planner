function exportRouteGPX(){
  const evt = state.currentEvent;
  if(!evt || !evt.checkpoints.length){ alert(t('exportGpx.noCheckpoints')); return; }
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cps = evt.checkpoints.slice().sort((a, b) => a.order - b.order);
  const wpts = cps.map(cp => `  <wpt lat="${cp.lat}" lon="${cp.lng}">
    <name>${esc(String(cp.order).padStart(2, '0') + ' ' + (cp.name || typeFullLabel(cp.type)))}</name>
    <desc>${esc((cp.mandatory ? t('common.mandatory') : t('common.bonus')) + (cp.clue ? ' — ' + cp.clue : ''))}</desc>
    <sym>Flag</sym>
  </wpt>`).join('\n');
  const rtepts = cps.map(cp => `    <rtept lat="${cp.lat}" lon="${cp.lng}"><name>${esc(cp.name || String(cp.order))}</name></rtept>`).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Alleycat Dispatch" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(evt.name || 'Alleycat')}</name></metadata>
${wpts}
  <rte>
    <name>${esc(evt.name || 'Alleycat')} — ${esc(t('exportGpx.routeSuffix'))}</name>
${rtepts}
  </rte>
</gpx>`;
  const blob = new Blob([gpx], {type: 'application/gpx+xml'});
  downloadBlob(blob, (evt.name || 'route').replace(/\s+/g, '_').toLowerCase() + '.gpx');
}

