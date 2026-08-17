/* ---------------- social share cards ----------------
   Canvas-Rendering, rein clientseitig, kein Server-Call (16.4). Trigger ist ausschließlich
   ein manueller Button (Dashboard bei Status "Abgeschlossen") — kein automatisches Auslösen.
   Nutzt die aktuell aktive Theme-Palette (CSS-Variablen) statt eines eigenen Karten-Designs,
   und das Logo des ersten aktivierten Sponsoren-PDF-Blocks (pdf-blocks.js), falls vorhanden. */
let socialShareCanvas = null;
function computeSocialShareTopRiders(evt){
  const finished = (evt.riders || []).filter(r => r.finishTime && r.raceStatus !== 'dnf' && r.raceStatus !== 'dns' && r.raceStatus !== 'eliminated');
  const sorted = evt.scoringMode === 'points' ? sortRidersByPoints(finished, evt) : sortRidersForOverview(finished);
  return sorted.slice(0, 3);
}
function socialShareThemeColors(){
  const cs = getComputedStyle(document.documentElement);
  const read = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  return {
    bg: read('--asphalt', '#1c1c1c'),
    ink: read('--chalk', '#f4f1ea'),
    accent: read('--hivis', '#ff5f1f'),
    steel: read('--steel', '#8a8a8a')
  };
}
function firstSponsorLogoDataUrl(evt){
  const block = (evt.pdfBlocks || []).find(b => b.type === 'sponsors' && b.enabled && (b.config.logos || []).length);
  return block ? block.config.logos[0].dataUrl : null;
}
function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight){
  const words = String(text).split(' ');
  let line = '', lines = [];
  words.forEach(w => {
    const test = line ? line + ' ' + w : w;
    if(ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = w; } else { line = test; }
  });
  if(line) lines.push(line);
  const startY = y - (lines.length - 1) * lineHeight / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}
async function renderSocialShareCanvas(evt){
  const W = 1080, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const c = socialShareThemeColors();
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.accent;
  ctx.fillRect(0, 0, W, 14);

  ctx.textAlign = 'center';
  ctx.fillStyle = c.ink;
  ctx.font = '700 54px Oswald, sans-serif';
  wrapCanvasText(ctx, evt.name || t('common.unnamedEvent'), W / 2, 150, W - 160, 60);

  ctx.font = '400 26px "JetBrains Mono", monospace';
  ctx.fillStyle = c.steel;
  ctx.fillText(formatDateOnly(evt.date) || '', W / 2, 210);

  ctx.font = '700 34px "JetBrains Mono", monospace';
  ctx.fillStyle = c.accent;
  ctx.fillText(t('socialShare.podiumHeading'), W / 2, 300);

  const top = computeSocialShareTopRiders(evt);
  const medals = ['🥇', '🥈', '🥉'];
  if(!top.length){
    ctx.font = '400 28px "JetBrains Mono", monospace';
    ctx.fillStyle = c.steel;
    ctx.fillText(t('socialShare.noFinishersYet'), W / 2, 420);
  } else {
    top.forEach((r, i) => {
      const rowY = 420 + i * 130;
      ctx.textAlign = 'left';
      ctx.font = '600 46px sans-serif';
      ctx.fillStyle = c.ink;
      ctx.fillText(`${medals[i]}  #${r.bib}  ${r.name || ''}`, 90, rowY);
      ctx.font = '400 26px "JetBrains Mono", monospace';
      ctx.fillStyle = c.steel;
      ctx.fillText(formatTimeOnly(r.finishTime) || '', 90, rowY + 40);
    });
  }

  const logoUrl = firstSponsorLogoDataUrl(evt);
  if(logoUrl){
    await new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const maxW = 260, maxH = 130;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (W - w) / 2, H - h - 60, w, h);
        resolve();
      };
      img.onerror = resolve;
      img.src = logoUrl;
    });
  }
  return canvas;
}
async function openSocialShareCard(){
  const evt = state.currentEvent;
  if(!evt || !isFeatureEnabled('social_share_cards', evt)) return;
  socialShareCanvas = await renderSocialShareCanvas(evt);
  state.socialShareOpen = true;
  renderSocialShareCard();
}
function closeSocialShareCard(){
  state.socialShareOpen = false;
  socialShareCanvas = null;
  const root = document.getElementById('social-share-root');
  if(root) root.innerHTML = '';
}
function downloadSocialShareCard(){
  if(!socialShareCanvas) return;
  const evt = state.currentEvent;
  const a = document.createElement('a');
  a.download = `${(evt.name || 'alleycat').replace(/[^a-z0-9]+/gi, '-')}-ergebnis.png`;
  a.href = socialShareCanvas.toDataURL('image/png');
  a.click();
}
async function shareSocialShareCard(){
  if(!socialShareCanvas || !navigator.share) return;
  const evt = state.currentEvent;
  socialShareCanvas.toBlob(async (blob) => {
    if(!blob) return;
    const file = new File([blob], 'alleycat-ergebnis.png', {type: 'image/png'});
    try{
      if(navigator.canShare && !navigator.canShare({files: [file]})){ downloadSocialShareCard(); return; }
      await navigator.share({files: [file], title: evt.name || t('common.unnamedEvent')});
    }catch(e){ /* Nutzer hat Share-Sheet abgebrochen — kein Fehlerzustand */ }
  }, 'image/png');
}
function renderSocialShareCard(){
  const root = document.getElementById('social-share-root');
  if(!root) return;
  if(!state.socialShareOpen || !socialShareCanvas){ root.innerHTML = ''; return; }
  const canShareFiles = !!navigator.share;
  root.innerHTML = `
    <div class="socialshare-overlay">
      <div class="socialshare-box">
        <div class="socialshare-head">
          <span>${t('socialShare.previewTitle')}</span>
          <span class="socialshare-spacer"></span>
          ${canShareFiles ? `<button type="button" class="btn btn-sm btn-primary" onclick="shareSocialShareCard()">${t('socialShare.shareButton')}</button>` : ''}
          <button type="button" class="btn btn-sm ${canShareFiles ? '' : 'btn-primary'}" onclick="downloadSocialShareCard()">${t('socialShare.downloadButton')}</button>
          <button type="button" class="btn btn-sm btn-ghost" onclick="closeSocialShareCard()">${t('pdfPreview.close')}</button>
        </div>
        <img class="socialshare-image" src="${socialShareCanvas.toDataURL('image/png')}" alt="${t('socialShare.previewTitle')}">
      </div>
    </div>
  `;
}
