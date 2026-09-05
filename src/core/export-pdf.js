/* ---------------- PDF-Baukasten: block-append rendering ----------------
   Margins/line-heights are computed as fractions of the doc's own page
   size rather than fixed pt values, so this same function works whether
   the caller's jsPDF instance uses 'pt' units (manifest) or 'mm' units
   (spokecards) — only font sizes stay in fixed pt, since jsPDF's
   setFontSize() is always in points regardless of the document unit. */
/* ---------------- in-page PDF preview ----------------
   Manifest/Personal-Briefing generation opens this modal instead of an
   immediate download, so layout tweaks (PDF-Baukasten, manifest column
   toggles) can be checked without piling up downloaded files each time.
   Rendered into #pdf-preview-root, a template sibling of #app (same
   pattern as #command-palette-root) so it overlays regardless of view. */
let pdfPreviewBlobUrl = null;
function showPdfPreview(doc, filename){
  if(pdfPreviewBlobUrl){ URL.revokeObjectURL(pdfPreviewBlobUrl); pdfPreviewBlobUrl = null; }
  pdfPreviewDoc = doc;
  pdfPreviewBlobUrl = doc.output('bloburl');
  state.pdfPreviewFilename = filename;
  state.pdfPreviewOpen = true;
  renderPdfPreview();
}
function closePdfPreview(){
  state.pdfPreviewOpen = false;
  pdfPreviewDoc = null;
  if(pdfPreviewBlobUrl){ URL.revokeObjectURL(pdfPreviewBlobUrl); pdfPreviewBlobUrl = null; }
  const root = document.getElementById('pdf-preview-root');
  if(root) root.innerHTML = '';
}
function downloadPdfPreview(){
  if(!pdfPreviewDoc) return;
  pdfPreviewDoc.save(state.pdfPreviewFilename);
}
function renderPdfPreview(){
  const root = document.getElementById('pdf-preview-root');
  if(!root) return;
  if(!state.pdfPreviewOpen || !pdfPreviewBlobUrl){ root.innerHTML = ''; return; }
  root.innerHTML = `
    <div class="pdfprev-overlay">
      <div class="pdfprev-box">
        <div class="pdfprev-head">
          <span class="pdfprev-filename">${escapeHtml(state.pdfPreviewFilename)}</span>
          <span class="pdfprev-spacer"></span>
          <button type="button" class="btn btn-sm btn-primary" onclick="downloadPdfPreview()">${t('pdfPreview.download')}</button>
          <button type="button" class="btn btn-sm btn-ghost" onclick="closePdfPreview()">${t('pdfPreview.close')}</button>
        </div>
        <iframe class="pdfprev-frame" src="${pdfPreviewBlobUrl}" title="${escapeHtml(state.pdfPreviewFilename)}"></iframe>
      </div>
    </div>
  `;
}
/* ---------------- PDF-Baukasten 2.0: auto-flow row layout (Paket 5 Teil B) ----------------
   appendPdfBlocks() groups enabled blocks via layoutBlocks() (pdf-blocks.js)
   into rows, then renders row-by-row instead of the old one-block-per-page
   loop. Every ROW still starts on a fresh page (doc.addPage() unconditional
   per row, not per page-that-still-has-room) — deliberately, so a
   pre-Teil-B event (every block defaults to width:'full', which always
   lands alone in its own row, see layoutBlocks()) renders byte-for-byte
   like before: one page per block, nothing packed onto a shared page. Only
   genuinely NEW same-row blocks (half/third width) share a page, since
   that packing has no prior behavior to regress — pageBreakBefore stays
   meaningful regardless (it decides ROW membership in layoutBlocks(), and
   a block that's forced into its own row also always gets its own fresh
   page as a consequence of the per-row addPage()). Single-block rows fall
   back to the old internal-addPage()-on-overflow pagination via the
   `pagination` param so long content still spans
   multiple pages exactly as before; multi-column rows do not (splitting a
   *row* of side-by-side columns across a page boundary while keeping them
   aligned is exactly the 2D-grid-editor complexity 17.2 explicitly opts
   out of — acceptable given half/third blocks are meant for compact
   content like logos/small text/images, not sprawling checkpoint lists). */
/* "Vorschau"-Button (17.3/17.8 step 5): reuses the existing in-page iframe
   preview from Paket 1 (showPdfPreview()) instead of adding a PDF-to-image
   rasterization step — the project's own "no new dependencies" rule
   (PROJEKT-UEBERSICHT.md §9) rules out a pdf.js-style library, and an
   iframe of the real PDF is a strictly better preview than a static image
   of it anyway. Builds a standalone doc containing only this document
   type's block layout (not the full manifest/spokecards content) so it
   stays fast and doesn't require riders/checkpoints to already be
   PDF-ready — deliberately NOT wired to re-render on every keystroke
   (17.3's explicit non-goal), only when the button is clicked. */
function previewPdfBlocksLayout(docType){
  const evt = state.currentEvent;
  if(!evt || !window.jspdf) return;
  const hasBlocks = (evt.pdfBlocks || []).some(b => b.enabled && (b.targetDocuments || []).includes(docType));
  if(!hasBlocks){ alert(t('pdfBlocks.previewEmpty')); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF(docType === 'spokecards' ? {unit: 'mm', format: 'a4'} : {unit: 'pt', format: 'a4'});
  appendPdfBlocks(doc, evt, docType);
  doc.deletePage(1);
  const docLabel = docType === 'manifest' ? t('pdfBlocks.targetManifest') : t('pdfBlocks.targetSpokecards');
  showPdfPreview(doc, t('pdfBlocks.previewFilename', {doc: docLabel}));
}
function appendPdfBlocks(doc, evt, targetDocType){
  const blocks = ((evt.pdfBlocks || [])).filter(b => b.enabled && (b.targetDocuments || []).includes(targetDocType)).sort((a, b) => a.sortOrder - b.sortOrder);
  if(!blocks.length) return;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = pageW * 0.08;
  const pageRight = pageW - marginX;
  const contentW = pageRight - marginX;
  const topY = pageH * 0.09;
  const bottomLimit = pageH * 0.92;
  const lineH = pageH * 0.018;
  const colGap = contentW * 0.04;

  const rows = layoutBlocks(blocks);
  rows.forEach(row => {
    doc.addPage();
    const y = topY;
    if(row.length === 1){
      renderPdfBlockColumn(doc, row[0], evt, marginX, pageRight, y, lineH, pageH, {bottomLimit, topY});
    }else{
      let x = marginX;
      row.forEach(b => {
        const w = contentW * (PDF_BLOCK_WIDTH_VALUES[b.width] || 1);
        renderPdfBlockColumn(doc, b, evt, x, x + w - colGap, y, lineH, pageH, null);
        x += w;
      });
    }
  });
}
/* Renders one block's title + rule + content inside the column bounds
   [x, colRight]. `pagination` (only ever passed for lone full-row blocks)
   re-enables the old per-line addPage()-on-overflow behavior; multi-column
   rows pass null and just draw past the bottom margin in the rare case
   their content is too tall (see appendPdfBlocks' comment above). */
function renderPdfBlockColumn(doc, b, evt, x, colRight, y, lineH, pageH, pagination){
  const colW = colRight - x;
  const INK = '#241f18', HIVIS = '#ff5f1f', STEEL = '#5b5340';
  const maybeBreak = () => {
    if(pagination && y > pagination.bottomLimit){ doc.addPage(); y = pagination.topY; }
  };
  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(pdfBlockTitle(b), x, y);
  y += pageH * 0.012;
  doc.setDrawColor(HIVIS); doc.setLineWidth(1);
  doc.line(x, y, colRight, y);
  y += pageH * 0.03;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.setTextColor(INK);

  if(b.type === 'sponsors'){
    const logos = b.config.logos || [];
    if(!logos.length){
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(STEEL);
      doc.text(t('pdfBlocks.sponsorsEmpty'), x, y);
    }else{
      const perRow = pdfBlockLogosPerRow(b.width);
      const gap = colW * 0.04;
      const logoW = (colW - gap * (perRow - 1)) / perRow;
      const logoH = logoW * 0.5;
      let cx = x, col = 0;
      logos.forEach(l => {
        if(pagination && y + logoH > pagination.bottomLimit){ doc.addPage(); y = pagination.topY; cx = x; col = 0; }
        try{ doc.addImage(l.dataUrl, cx, y, logoW, logoH, undefined, 'FAST'); }catch(e){ /* unsupported image format — skip tile */ }
        col++;
        if(col >= perRow){ col = 0; cx = x; y += logoH + lineH; }
        else cx += logoW + gap;
      });
    }
  }else if(b.type === 'checkpoint_list'){
    const checkpoints = evt.checkpoints.slice().sort((a, c) => a.order - c.order);
    checkpoints.forEach(cp => {
      maybeBreak();
      doc.setFont('courier', 'bold'); doc.setFontSize(9); doc.setTextColor(INK);
      doc.text(String(cp.order).padStart(2, '0'), x, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(cp.name || '—', x + colW * 0.06, y);
      y += lineH;
    });
  }else if(b.type === 'event_locations'){
    const rows = [
      {label: t('eventLocations.hqLabel'), loc: getEventLocation(evt, 'headquarters')},
      {label: t('eventLocations.afterpartyLabel'), loc: getEventLocation(evt, 'afterparty')}
    ].filter(r => eventLocationHasPosition(r.loc));
    if(!rows.length){
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(STEEL);
      doc.text(t('pdfBlocks.eventLocationsEmpty'), x, y);
    }else{
      rows.forEach(r => {
        maybeBreak();
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(INK);
        doc.text(`${r.label}: ${r.loc.name || '—'}`, x, y);
        y += lineH;
        [r.loc.address, r.loc.notes].filter(Boolean).forEach(text => {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(STEEL);
          doc.splitTextToSize(text, colW).forEach(line => {
            maybeBreak();
            doc.text(line, x, y);
            y += lineH * 0.85;
          });
        });
        y += lineH * 0.6;
      });
    }
  }else if(b.type === 'image'){
    if(!b.config.dataUrl){
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(STEEL);
      doc.text(t('pdfBlocks.imageEmpty'), x, y);
    }else{
      const dims = b.config.imageDims || {w: 4, h: 3};
      const h = colW * (dims.h / dims.w);
      try{ doc.addImage(b.config.dataUrl, x, y, colW, h, undefined, 'FAST'); }catch(e){ /* unsupported image format */ }
      y += h;
      if(b.config.caption){
        y += lineH * 0.6;
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(STEEL);
        const align = b.config.alignment || 'center';
        const capX = align === 'left' ? x : align === 'right' ? colRight : x + colW / 2;
        doc.text(b.config.caption, capX, y, {align});
      }
    }
  }else if(b.type === 'table'){
    const {headers, rows: tableRows} = pdfBlockTableData(b, evt);
    const colCount = headers.length;
    const colWidths = headers.map((h, i) => i === 0 ? colW * 0.4 : colW * 0.6 / (colCount - 1));
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(INK);
    let cx = x;
    headers.forEach((h, i) => { doc.text(h, cx, y); cx += colWidths[i]; });
    y += lineH * 0.3;
    doc.setDrawColor(STEEL); doc.setLineWidth(0.4);
    doc.line(x, y, colRight, y);
    y += lineH * 0.9;
    if(!tableRows.length){
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(STEEL);
      doc.text(t('pdfBlocks.tableEmpty'), x, y);
    }else{
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(INK);
      tableRows.forEach(row => {
        maybeBreak();
        cx = x;
        row.forEach((cell, i) => {
          const lines = doc.splitTextToSize(String(cell), colWidths[i] - 2);
          doc.text(lines[0] || '', cx, y);
          cx += colWidths[i];
        });
        y += lineH * 0.95;
      });
    }
  }else{
    const content = interpolatePdfBlockVariables(b.content || '', evt);
    if(!content.trim()){
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(STEEL);
      doc.text(t('pdfBlocks.emptyContent'), x, y);
    }else{
      content.split(/\n{2,}/).forEach(paragraph => {
        doc.splitTextToSize(paragraph, colW).forEach(line => {
          maybeBreak();
          doc.text(line, x, y);
          y += lineH;
        });
        y += lineH * 0.5;
      });
    }
    if(b.type === 'waiver' && (b.config.showSignatureLine || b.config.showDateField)){
      y += lineH;
      maybeBreak();
      doc.setDrawColor(STEEL); doc.setLineWidth(0.6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(STEEL);
      if(b.config.showDateField){
        const w = colW * 0.28;
        doc.line(x, y, x + w, y);
        doc.text(t('pdfBlocks.dateFieldLabel'), x, y + lineH * 0.8);
      }
      if(b.config.showSignatureLine){
        const sigX = x + colW * 0.4;
        doc.line(sigX, y, colRight, y);
        doc.text(t('pdfBlocks.signatureFieldLabel'), sigX, y + lineH * 0.8);
      }
    }
  }
  return y;
}

/* ---------------- manifest + PDF export ---------------- */
function withManifestSettingsDefaults(ms){
  return Object.assign({
    showNr: true,
    showCheckpoint: true,
    showTyp: true,
    showClue: true,
    showKoordinaten: true,
    showPunch: true,
    headerImage: '',
    headerImageWidth: 0,
    headerImageHeight: 0
  }, ms);
}

function onSpokeCardImageUpload(fileInput){
  const file = fileInput.files && fileInput.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const targetAspect = 63.5 / 88.9;
      const srcAspect = img.width / img.height;
      let sx, sy, sw, sh;
      if(srcAspect > targetAspect){
        sh = img.height; sw = sh * targetAspect; sx = (img.width - sw) / 2; sy = 0;
      } else {
        sw = img.width; sh = sw / targetAspect; sx = 0; sy = (img.height - sh) / 2;
      }
      const outW = 750, outH = Math.round(outW / targetAspect);
      const canvas = document.createElement('canvas');
      canvas.width = outW; canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      state.currentEvent.spokeCardImage = canvas.toDataURL('image/jpeg', 0.88);
      debouncedSave();
      renderRiders();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  fileInput.value = '';
}
function clearSpokeCardImage(){
  state.currentEvent.spokeCardImage = '';
  debouncedSave();
  renderRiders();
}
function drawSpokeCardFront(doc, x, y, w, h, evt, rider){
  if(evt.spokeCardImage){
    doc.addImage(evt.spokeCardImage, 'JPEG', x, y, w, h, undefined, 'FAST');
    doc.setFillColor('#17191a');
    doc.roundedRect(x + w - 19, y + h - 10, 16, 8, 1.5, 1.5, 'F');
    doc.setTextColor('#f3f1e8');
    doc.setFont('courier', 'bold'); doc.setFontSize(7.5);
    doc.text('#' + rider.bib, x + w - 11, y + h - 4.7, {align: 'center'});
    return;
  }
  doc.setFillColor('#eee5cd');
  doc.roundedRect(x, y, w, h, 3, 3, 'F');
  doc.setDrawColor('#241f18');
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 3, 3, 'S');

  doc.setFillColor('#b23a2e');
  doc.circle(x + w / 2, y + 20, 9, 'F');
  doc.setTextColor('#f3f1e8');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('AC', x + w / 2, y + 22.2, {align: 'center'});

  doc.setTextColor('#241f18');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
  doc.text(truncateText((evt.name || t('exportPdf.defaultEventNameCaps')).toUpperCase(), 24), x + w / 2, y + 42, {align: 'center', maxWidth: w - 10});

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.setTextColor('#5b5340');
  doc.text(formatDateOnly(evt.date) || t('exportPdf.dateComingSoon'), x + w / 2, y + 49, {align: 'center'});

  doc.setDrawColor('#c9bc95');
  doc.setLineWidth(0.3);
  doc.line(x + 8, y + h - 16, x + w - 8, y + h - 16);

  doc.setFont('courier', 'bold'); doc.setFontSize(7.5);
  doc.setTextColor('#5b5340');
  doc.text(t('exportPdf.spokeCardLabel'), x + w / 2, y + h - 10, {align: 'center'});
  doc.setFont('courier', 'bold'); doc.setFontSize(11);
  doc.setTextColor('#241f18');
  doc.text('#' + rider.bib, x + w / 2, y + h - 5, {align: 'center'});
}
/* Was tatsächlich auf eine gedruckte Spokecard kommt. Hängt am Seam:
   ohne Fahrer-App gibt es keine Adresse, auf die ein Link zeigen könnte,
   also bleibt es bei der nackten Startnummer wie bisher — die lokale
   Variante druckt damit unverändert weiter.

   Eine Funktion für beide Erzeugungsstellen (Spokecards und Bib-Blätter),
   damit der Inhalt nicht an zwei Orten auseinander läuft.

   Liegt hier und NICHT in rider-qr.js: die Fahrer-App druckt keine
   Spokecards, und sie hätte auch keinen riderAppBaseUrl() — der Seam
   lebt in src/storage/, das im Rider-Bundle fehlt. Maßstab aus Paket 1:
   nur was das Fahrer-Bundle braucht, gehört nach rider-qr.js. */
function spokecardQrPayload(evt, rider){
  const base = riderAppBaseUrl();
  return base ? buildRiderQrPayload(base, evt, rider) : String(rider.bib);
}

function drawSpokeCardBack(doc, x, y, w, h, evt, rider, qrDataUrl){
  doc.setFillColor('#eee5cd');
  doc.roundedRect(x, y, w, h, 3, 3, 'F');
  doc.setDrawColor('#241f18');
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 3, 3, 'S');

  if(qrDataUrl){
    const qrSize = w - 22;
    doc.addImage(qrDataUrl, 'PNG', x + (w - qrSize) / 2, y + 12, qrSize, qrSize);
  }

  doc.setFont('courier', 'bold'); doc.setFontSize(18);
  doc.setTextColor('#241f18');
  doc.text('#' + rider.bib, x + w / 2, y + h - 20, {align: 'center'});

  /* KEIN Fahrername auf der Karte. Karten werden vorgedruckt, bevor
     feststeht, wer sie bekommt — ein Name darauf machte den Stapel
     unbrauchbar und verriete außerdem, wem eine gefundene Karte gehört.
     Ausdrückliche Nutzerentscheidung vom 25.08.2026, unabhängig von der
     Fahrer-App, und deshalb in BEIDEN Varianten so. */

  /* Der abtippbare Rückfallcode, wenn die Kamera streikt. Nur wo es eine
     Fahrer-App gibt — sonst führte er ins Leere. Monospace und gesperrt,
     damit sich Zeichen beim Eintippen einzeln abzählen lassen. */
  if(riderAppBaseUrl() && rider.riderCode){
    doc.setFont('courier', 'bold'); doc.setFontSize(9);
    doc.setTextColor('#5b5340');
    doc.text(rider.riderCode.split('').join(' '), x + w / 2, y + h - 14, {align: 'center'});
  }

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.setTextColor('#5b5340');
  doc.text(truncateText(evt.name || '', 30), x + w / 2, y + h - 8, {align: 'center'});
}
function computeCardGrid(pageW, pageH, cardW, cardH, marginX, marginY, gapX, gapY){
  const cols = Math.max(1, Math.floor((pageW - marginX * 2 + gapX) / (cardW + gapX)));
  const rows = Math.max(1, Math.floor((pageH - marginY * 2 + gapY) / (cardH + gapY)));
  const perPage = cols * rows;
  const gridW = cols * cardW + (cols - 1) * gapX;
  const offsetX = marginX + Math.max(0, (pageW - marginX * 2 - gridW) / 2);
  const pos = (i) => {
    const idx = i % perPage;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return {x: offsetX + col * (cardW + gapX), y: marginY + row * (cardH + gapY)};
  };
  return {cols, rows, perPage, pos};
}
async function buildSpokeCardsDoc(evt){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const cardW = 63.5, cardH = 88.9;
  const {perPage, pos} = computeCardGrid(210, 297, cardW, cardH, 10, 8, 6, 5);

  const riders = evt.riders;
  riders.forEach((r, i) => {
    if(i > 0 && i % perPage === 0) doc.addPage();
    const {x, y} = pos(i);
    drawSpokeCardFront(doc, x, y, cardW, cardH, evt, r);
  });

  const qrCodes = await Promise.all(riders.map(r => renderQrDataUrl(spokecardQrPayload(evt, r), 300)));
  doc.addPage();
  for(let i = 0; i < riders.length; i++){
    if(i > 0 && i % perPage === 0) doc.addPage();
    const {x, y} = pos(i);
    drawSpokeCardBack(doc, x, y, cardW, cardH, evt, riders[i], qrCodes[i]);
  }
  appendPdfBlocks(doc, evt, 'spokecards');
  return doc;
}
async function exportSpokeCardsPDF(){
  const evt = state.currentEvent;
  if(!evt || !window.jspdf || !evt.riders || !evt.riders.length || state.spokeCardsGenerating) return;
  state.spokeCardsGenerating = true;
  renderRiders();
  const doc = await buildSpokeCardsDoc(evt);
  doc.save((evt.name || 'spokecards').replace(/\s+/g, '_').toLowerCase() + '-spokecards.pdf');
  evt.spokecardsPrinted = true;
  debouncedSave();
  state.spokeCardsGenerating = false;
  renderRiders();
}
async function printSpokeCardsPDF(){
  const evt = state.currentEvent;
  if(!evt || !window.jspdf || !evt.riders || !evt.riders.length || state.spokeCardsGenerating) return;
  const printTab = window.open('', '_blank');
  state.spokeCardsGenerating = true;
  state.printPopupBlocked = false;
  renderRiders();
  const doc = await buildSpokeCardsDoc(evt);
  const blobUrl = doc.output('bloburl');
  if(printTab){
    printTab.location.href = blobUrl;
  } else if(!window.open(blobUrl, '_blank')){
    state.printPopupBlocked = true;
  }
  evt.spokecardsPrinted = true;
  debouncedSave();
  state.spokeCardsGenerating = false;
  renderRiders();
}
/* ---------------- Einladungscodes: Visitenkarten ----------------
   Gedruckte Karten zum Verteilen an Tester, kein Netzwerk beim Verteilen
   nötig — nur das spätere Einlösen selbst braucht eine Serververbindung.
   Muss im selben Request-Zyklus wie invite-create passieren (siehe
   submitCreateInviteCode() in ui-headquarter.js): der Klartext-Code ist
   danach nirgendwo mehr abrufbar, auth.php speichert nur den Hash.

   Kreditkarten-Format (ISO/IEC 7810 ID-1, 85,60 × 53,98mm), nicht das
   gängige Business-Card-Maß — dieselbe Kraftpapier-Optik wie die
   Spokecards (drawSpokeCardFront/-Back), damit gedrucktes Material aus
   diesem Projekt durchgehend gleich aussieht. */
function inviteQrPayload(code){
  /* Kein separates Bundle wie bei der Rider-App: die Registrierung ist
     Teil derselben dist/alleycat-dispatch-server.html, die gerade offen
     ist — Basis-URL deshalb zur Laufzeit aus dem eigenen Ursprung, keine
     neue Einstellung nötig. Setzt voraus, dass die Karten auf der
     tatsächlichen Live-Domain erzeugt werden. */
  return `${location.origin}${location.pathname}?invite=${encodeURIComponent(code)}`;
}
function drawInviteCard(doc, x, y, w, h, code, expiresAt, qrDataUrl){
  doc.setFillColor('#eee5cd');
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'F');
  doc.setDrawColor('#241f18');
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'S');

  doc.setFillColor('#b23a2e');
  doc.circle(x + 11, y + 11, 6, 'F');
  doc.setTextColor('#f3f1e8');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('AC', x + 11, y + 12.7, {align: 'center'});

  doc.setTextColor('#241f18');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(t('auth.inviteCardTitle').toUpperCase(), x + w - 6, y + 12.5, {align: 'right'});

  if(qrDataUrl){
    const qrSize = h - 24;
    doc.addImage(qrDataUrl, 'PNG', x + (w - qrSize) / 2, y + 19, qrSize, qrSize);
  }

  doc.setFont('courier', 'bold'); doc.setFontSize(10);
  doc.setTextColor('#241f18');
  doc.text(code.split('').join(' '), x + w / 2, y + h - 10, {align: 'center'});

  const expiresDate = expiresAt ? new Date(expiresAt) : null;
  const expiresLabel = (expiresDate && !isNaN(expiresDate.getTime())) ? expiresDate.toLocaleDateString('de-DE') : (expiresAt || '');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
  doc.setTextColor('#5b5340');
  doc.text(t('auth.inviteCardExpiresLabel', {date: expiresLabel}), x + w / 2, y + h - 4.5, {align: 'center'});
}
async function buildInviteCardsDoc(codes){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const cardW = 85.6, cardH = 53.98;
  const {perPage, pos} = computeCardGrid(210, 297, cardW, cardH, 12, 12, 8, 8);

  const qrCodes = await Promise.all(codes.map(c => renderQrDataUrl(inviteQrPayload(c.code), 300)));
  codes.forEach((c, i) => {
    if(i > 0 && i % perPage === 0) doc.addPage();
    const {x, y} = pos(i);
    drawInviteCard(doc, x, y, cardW, cardH, c.code, c.expiresAt, qrCodes[i]);
  });
  return doc;
}
/* codes: [{code, expiresAt}] — siehe state.inviteJustCreated in
   ui-headquarter.js, direkt nach submitCreateInviteCode() befüllt. */
async function exportInviteCardsPDF(codes){
  if(!window.jspdf || !codes || !codes.length) return;
  const doc = await buildInviteCardsDoc(codes);
  doc.save('alleycat-einladungscodes.pdf');
}

/* ---------------- Checkpoint-QR-Blätter ----------------
   Eine Seite je Checkpoint mit aktivem QR-Check-In, zum Laminieren und
   Aufstellen. Nichts wird nebeneinander gesetzt: der Code wird aus
   Sattelhöhe, bei schlechtem Licht, mit einer Hand am Lenker gescannt —
   dafür zählt Größe mehr als Papiersparen.

   Checkpoints ohne QR-Check-In erscheinen nicht. Gibt es keinen
   einzigen, wird gar kein PDF erzeugt; der Knopf sagt das vorher. */
async function buildCheckpointQrDoc(evt){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const pageW = 210, pageH = 297;
  const base = riderAppBaseUrl();

  const cps = (evt.checkpoints || [])
    .filter(cp => cp.qrCheckinEnabled)
    .slice()
    .sort((a, b) => a.order - b.order);

  const codes = await Promise.all(cps.map(cp => renderQrDataUrl(buildCheckpointQrPayload(base, evt, cp), 900)));

  cps.forEach((cp, i) => {
    if(i > 0) doc.addPage();

    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor('#5b5340');
    doc.text(truncateText(evt.name || '', 60), pageW / 2, 20, {align: 'center'});

    doc.setFont('helvetica', 'bold'); doc.setFontSize(30);
    doc.setTextColor('#241f18');
    doc.text(truncateText(cp.name || '', 28), pageW / 2, 36, {align: 'center', maxWidth: pageW - 30});

    /* 130 mm Kantenlänge — deutlich über den 90 mm aus der Spec. Der
       Platz ist auf A4 ohnehin da, und jeder Millimeter mehr hilft beim
       Scannen aus Entfernung. */
    const qrSize = 130;
    if(codes[i]) doc.addImage(codes[i], 'PNG', (pageW - qrSize) / 2, 52, qrSize, qrSize);

    doc.setFont('courier', 'bold'); doc.setFontSize(16);
    doc.setTextColor('#241f18');
    doc.text(getCheckpointType(cp.type).shortLabel, pageW / 2, 200, {align: 'center'});

    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.setTextColor('#5b5340');
    doc.text(t('exportPdf.cpQrFooter'), pageW / 2, pageH - 24, {align: 'center', maxWidth: pageW - 30});

    /* Kennung klein am Fuß: wenn ein Aufsteller vertauscht wird, lässt
       sich am Papier nachvollziehen, wohin er gehört. */
    doc.setFont('courier', 'normal'); doc.setFontSize(7);
    doc.setTextColor('#8a8069');
    doc.text(cp.id, pageW / 2, pageH - 12, {align: 'center'});
  });

  return doc;
}

async function exportCheckpointQrPDF(){
  const evt = state.currentEvent;
  if(!evt || !riderAppBaseUrl()) return;
  const cps = (evt.checkpoints || []).filter(cp => cp.qrCheckinEnabled);
  if(!cps.length){ alert(t('exportPdf.cpQrNone')); return; }

  const doc = await buildCheckpointQrDoc(evt);
  const slug = (evt.name || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
  showPdfPreview(doc, `${slug}-checkpoint-qr.pdf`);
}

async function buildRiderSheetDoc(evt){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const cardW = 63.5, cardH = 88.9;
  const {perPage, pos} = computeCardGrid(210, 297, cardW, cardH, 10, 8, 6, 5);

  const riders = evt.riders;
  const qrCodes = await Promise.all(riders.map(r => renderQrDataUrl(spokecardQrPayload(evt, r), 300)));
  for(let i = 0; i < riders.length; i++){
    if(i > 0 && i % perPage === 0) doc.addPage();
    const {x, y} = pos(i);
    drawSpokeCardBack(doc, x, y, cardW, cardH, evt, riders[i], qrCodes[i]);
  }
  return doc;
}
async function exportRidersPDF(){
  const evt = state.currentEvent;
  if(!evt || !window.jspdf || !evt.riders || !evt.riders.length || state.riderSheetGenerating) return;
  state.riderSheetGenerating = true;
  renderRiders();
  const doc = await buildRiderSheetDoc(evt);
  doc.save((evt.name || 'startnummern').replace(/\s+/g, '_').toLowerCase() + '-startnummern.pdf');
  evt.bibsPrinted = true;
  debouncedSave();
  state.riderSheetGenerating = false;
  renderRiders();
}


/* ---------------- personal-briefing export (organizer-only, never rider-facing) ---------------- */
async function buildStaffBriefingDoc(evt){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit: 'pt', format: 'a4'});
  const marginX = 48;
  const pageRight = 548;
  let y = 56;
  const INK = '#241f18', HIVIS = '#ff5f1f', STEEL = '#5b5340';

  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(t('exportPdf.staffBriefingTitle'), marginX, y);
  y += 6;
  doc.setDrawColor(HIVIS); doc.setLineWidth(1.4);
  doc.line(marginX, y, pageRight, y);
  y += 16;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5);
  doc.setTextColor(STEEL);
  doc.text(t('exportPdf.staffBriefingInternalNote'), marginX, y);
  y += 22;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.setTextColor(INK);
  doc.text(evt.name || t('common.unnamedEvent'), marginX, y);
  y += 24;

  const checkpoints = evt.checkpoints.slice().sort((a, b) => a.order - b.order);
  checkpoints.forEach(cp => {
    const staff = cp.staff || [];
    const blockHeight = 16 + staff.length * 26 + (staff.length ? 0 : 14) + 8;
    if(y + blockHeight > 780){ doc.addPage(); y = 56; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.setTextColor(INK);
    doc.text(String(cp.order).padStart(2, '0') + '  ' + (cp.name || t('checkpoint.noName')), marginX, y);
    y += 15;
    if(!staff.length){
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
      doc.setTextColor(STEEL);
      doc.text(t('exportPdf.staffBriefingNoneAssigned'), marginX + 12, y);
      y += 14;
    } else {
      staff.forEach(s => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        doc.setTextColor(INK);
        const parts = [s.name || t('checkpoint.staffUnnamed')];
        if(s.role) parts.push(s.role);
        if(s.phone) parts.push(s.phone);
        doc.text('• ' + parts.join(' · '), marginX + 12, y);
        if(s.shiftNote){
          doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
          doc.setTextColor(STEEL);
          doc.text(s.shiftNote, marginX + 300, y, {maxWidth: pageRight - marginX - 300});
        }
        y += 13;
        if(s.notes){
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
          doc.setTextColor(STEEL);
          doc.text(s.notes, marginX + 20, y, {maxWidth: pageRight - marginX - 20});
          y += 13;
        }
      });
    }
    y += 8;
  });

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.setTextColor(STEEL);
  doc.text(t('exportPdf.productFooter'), marginX, 806);
  doc.text(t('exportPdf.staffBriefingFooter'), pageRight, 806, {align: 'right'});
  return doc;
}
async function exportStaffBriefingPDF(){
  const evt = state.currentEvent;
  if(!evt || !window.jspdf || !evt.checkpoints || !evt.checkpoints.length) return;
  const doc = await buildStaffBriefingDoc(evt);
  showPdfPreview(doc, (evt.name || 'personal-briefing').replace(/\s+/g, '_').toLowerCase() + '-personal-briefing.pdf');
}

/* ---------------- manifest export ---------------- */
function printManifest(){
  if(state.currentEvent){
    state.currentEvent.manifestGenerated = true;
    debouncedSave();
  }
  window.print();
}
function onManifestSettingToggle(key, checked){
  state.currentEvent.manifestSettings[key] = checked;
  debouncedSave();
  renderManifest();
}
function onManifestImageUpload(fileInput){
  const file = fileInput.files && fileInput.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 900;
      const scale = Math.min(1, maxW / img.width);
      const outW = Math.round(img.width * scale);
      const outH = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = outW; canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, outW, outH);
      const ms = state.currentEvent.manifestSettings;
      ms.headerImage = canvas.toDataURL('image/jpeg', 0.85);
      ms.headerImageWidth = outW;
      ms.headerImageHeight = outH;
      debouncedSave();
      renderManifest();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  fileInput.value = '';
}
function clearManifestImage(){
  const ms = state.currentEvent.manifestSettings;
  ms.headerImage = '';
  ms.headerImageWidth = 0;
  ms.headerImageHeight = 0;
  debouncedSave();
  renderManifest();
}
async function exportManifestPDF(){
  const evt = state.currentEvent;
  if(!evt || !window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt', format:'a4'});
  const marginX = 48;
  const pageRight = 548;
  let y = 56;
  const ms = evt.manifestSettings;
  const INK = '#241f18', HIVIS = '#ff5f1f', STAMP = '#b23a2e', STEEL = '#5b5340', LINE = '#c9bc95';

  /* Stempel-Badge oben rechts */
  doc.setDrawColor(STAMP); doc.setLineWidth(1);
  const stampCx = pageRight - 26, stampCy = 32, stampR = 22;
  doc.circle(stampCx, stampCy, stampR, 'S');
  doc.circle(stampCx, stampCy, stampR - 4, 'S');
  doc.setTextColor(STAMP);
  doc.setFont('helvetica','bold'); doc.setFontSize(7.5);
  doc.text(t('exportPdf.manifestStampTitle'), stampCx, stampCy - 3, {align: 'center', angle: -8});
  doc.setFontSize(6.5);
  doc.text(t('exportPdf.cpCountShort', {count: evt.checkpoints.length}), stampCx, stampCy + 7, {align: 'center', angle: -8});

  doc.setTextColor(INK);
  doc.setFont('helvetica','bold'); doc.setFontSize(20);
  doc.text(t('exportPdf.manifestStampTitle'), marginX, y);
  y += 6;
  doc.setDrawColor(HIVIS); doc.setLineWidth(1.4);
  doc.line(marginX, y, pageRight, y);
  y += 26;

  doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.setTextColor(INK);
  doc.text(evt.name || t('common.unnamedEvent'), marginX, y);
  y += 16;
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.setTextColor(STEEL);
  doc.text(t('exportPdf.dateLabel') + (evt.date || '\u2014'), marginX, y);
  doc.text(t('exportPdf.checkpointsLabel') + evt.checkpoints.length, marginX + 200, y);
  y += 14;
  const startTxt = evt.startMode === 'scheduled' ? formatDateTime(evt.startTime) : t('exportPdf.manualStartButton');
  const curfewTxt = t('exportPdf.curfewLabelPdf') + formatDateTime(evt.curfewTime) + (evt.curfewMode === 'soft' ? t('exportPdf.curfewSoftSuffix', {penalty: evt.curfewPenaltyPerMin ?? 1}) : t('exportPdf.curfewHardSuffix'));
  doc.text(t('exportPdf.startLabelPdf') + startTxt, marginX, y);
  doc.setTextColor(evt.curfewMode === 'hard' ? STAMP : STEEL);
  doc.text(curfewTxt, marginX + 200, y);
  y += 22;

  if(ms.headerImage && ms.headerImageWidth){
    const imgW = pageRight - marginX;
    const imgH = imgW * (ms.headerImageHeight / ms.headerImageWidth);
    if(y + imgH > 770){ doc.addPage(); y = 56; }
    doc.addImage(ms.headerImage, 'JPEG', marginX, y, imgW, imgH);
    y += imgH + 20;
  }

  const columnDefs = [
    {key: 'nr', flex: 0.07, label: t('exportPdf.colNr')},
    {key: 'checkpoint', flex: 0.22, label: t('exportPdf.colCheckpoint')},
    {key: 'typ', flex: 0.13, label: t('exportPdf.colTyp')},
    {key: 'clue', flex: 0.30, label: t('exportPdf.colClue')},
    {key: 'koordinaten', flex: 0.18, label: t('exportPdf.colKoordinaten')},
    {key: 'punch', flex: 0.10, label: t('exportPdf.colPunch')}
  ];
  const showKey = {nr: 'showNr', checkpoint: 'showCheckpoint', typ: 'showTyp', clue: 'showClue', koordinaten: 'showKoordinaten', punch: 'showPunch'};
  const visibleCols = columnDefs.filter(c => ms[showKey[c.key]]);
  if(!visibleCols.length){
    appendPdfBlocks(doc, evt, 'manifest');
    showPdfPreview(doc, (evt.name || 'manifest').replace(/\s+/g, '_').toLowerCase() + '-manifest.pdf');
    evt.manifestGenerated = true;
    debouncedSave();
    return;
  }
  const totalFlex = visibleCols.reduce((s, c) => s + c.flex, 0);
  const tableWidth = pageRight - marginX;
  const colX = {};
  const colW = {};
  let cx = marginX;
  visibleCols.forEach(c => {
    colX[c.key] = cx;
    colW[c.key] = (c.flex / totalFlex) * tableWidth;
    cx += colW[c.key];
  });

  doc.setFont('courier','bold'); doc.setFontSize(8.5);
  doc.setTextColor(INK);
  visibleCols.forEach(c => doc.text(c.label, colX[c.key], y));
  y += 6;
  doc.setDrawColor(HIVIS); doc.setLineWidth(1);
  doc.line(marginX, y, pageRight, y);
  y += 16;

  evt.checkpoints.forEach(cp => {
    const nameMaxW = colW.checkpoint ? colW.checkpoint - (cp.mandatory ? 6 : 38) : 0;
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
    const nameLines = colX.checkpoint !== undefined ? doc.splitTextToSize(cp.name || '—', nameMaxW) : [''];
    const typMaxW = colW.typ ? colW.typ - 8 : 0;
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
    const typLines = colX.typ !== undefined ? doc.splitTextToSize(typeFullLabel(cp.type), typMaxW) : [''];
    const clueMaxW = colW.clue ? colW.clue - 6 : 0;
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    const clueLines = colX.clue !== undefined ? doc.splitTextToSize(cp.clue || '—', clueMaxW) : [''];
    const rowLineCount = Math.max(nameLines.length, typLines.length, clueLines.length, 1);
    const rowHeight = 11 * rowLineCount + 9;
    if(y + rowHeight > 770){ doc.addPage(); y = 56; }
    if(colX.nr !== undefined){
      doc.setFont('courier','bold'); doc.setFontSize(9);
      doc.setTextColor(INK);
      doc.text(String(cp.order).padStart(2,'0'), colX.nr, y);
    }
    if(colX.checkpoint !== undefined){
      doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
      doc.setTextColor(INK);
      doc.text(cp.name || '\u2014', colX.checkpoint, y, {maxWidth: colW.checkpoint - (cp.mandatory ? 6 : 38)});
      if(!cp.mandatory){
        const badgeW = 34, badgeX = colX.checkpoint + colW.checkpoint - badgeW - 2, badgeY = y - 8;
        doc.setDrawColor(STEEL); doc.setLineWidth(0.6);
        doc.roundedRect(badgeX, badgeY, badgeW, 11, 2, 2, 'S');
        doc.setFont('helvetica','bold'); doc.setFontSize(6);
        doc.setTextColor(STEEL);
        doc.text(t('exportPdf.bonusBadge'), badgeX + badgeW / 2, badgeY + 7.5, {align: 'center'});
      }
    }
    if(colX.typ !== undefined){
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
      const badgeW = Math.min(colW.typ - 4, Math.max(...typLines.map(l => doc.getTextWidth(l))) + 8);
      const badgeH = 8 * typLines.length + 4;
      doc.setDrawColor(LINE); doc.setLineWidth(0.5);
      doc.roundedRect(colX.typ, y - 8, badgeW, badgeH, 2, 2, 'S');
      doc.setTextColor(STEEL);
      doc.text(typLines, colX.typ + 4, y);
    }
    if(colX.clue !== undefined){
      doc.setFont('helvetica','normal'); doc.setFontSize(9);
      doc.setTextColor(INK);
      doc.text(cp.clue || '\u2014', colX.clue, y, {maxWidth: colW.clue - 6});
    }
    if(colX.koordinaten !== undefined){
      doc.setFont('courier','normal'); doc.setFontSize(7.5);
      doc.setTextColor(STEEL);
      /* Non-decimal coordinate formats (UTM/MGRS especially) can run wider
         than this column was sized for ("50.93750, 6.96030") — shrink the
         font just enough to fit rather than letting it overflow into the
         next column on a printed manifest. */
      const coordText = formatCoordinates(cp.lat, cp.lng);
      const availableWidth = (colW.koordinaten || 60) - 2;
      let coordFontSize = 7.5;
      while(coordFontSize > 5 && doc.getTextWidth(coordText) > availableWidth){
        coordFontSize -= 0.5;
        doc.setFontSize(coordFontSize);
      }
      doc.text(coordText, colX.koordinaten, y);
    }
    if(colX.punch !== undefined){
      const px = colX.punch;
      const punchType = getCheckpointType(cp.type);
      doc.setDrawColor(INK);
      if(punchType.manifestCell === 'answer-line'){
        doc.setLineWidth(0.6); doc.setLineDash([1.5, 1.5], 0);
        doc.line(px, y + 5, px + Math.min(colW.punch - 6, 36), y + 5);
        doc.setLineDash([], 0);
      } else if(punchType.manifestCell === 'score-line'){
        doc.setFont('courier', 'normal'); doc.setFontSize(8);
        doc.setTextColor(INK);
        doc.text(t('exportPdf.scoreOutOf', {max: punchType.scoreMax}), px, y + 2);
      } else {
        doc.setLineWidth(0.8);
        doc.rect(px, y - 8, 13, 13);
      }
    }
    y += rowHeight + 6;
  });

  doc.setFont('helvetica','normal'); doc.setFontSize(7);
  doc.setTextColor(STEEL);
  doc.text(t('exportPdf.productFooter'), marginX, 806);
  doc.text(t('exportPdf.autoGenFooter'), pageRight, 806, {align: 'right'});

  appendPdfBlocks(doc, evt, 'manifest');
  showPdfPreview(doc, (evt.name || 'manifest').replace(/\s+/g,'_').toLowerCase() + '-manifest.pdf');
  evt.manifestGenerated = true;
  debouncedSave();
}


/* ---------------- render: manifest with sidebar navigation -------- */
function renderManifest(){
  const el = document.getElementById('view-manifest');
  const evt = state.currentEvent;
  if(!evt){
    el.innerHTML = `<div class="loading-row">${t('exportPdf.noEventSelected')}</div>`;
    return;
  }
  el.innerHTML = renderManifestLayout(evt);
}

function renderManifestLayout(evt){
  return `
    <div class="settings-layout ${state.manifestMobileDetailOpen ? 'settings-mobile-detail' : 'settings-mobile-list'}">
      ${renderManifestSidebar()}
      <div class="settings-content" id="manifest-content">
        <button type="button" class="settings-mobile-back" onclick="closeManifestMobileDetail()">${t('exportPdf.backToList')}</button>
        ${renderManifestPanel(evt)}
        <div id="print-root">
          ${renderManifestWaybill(evt)}
        </div>
      </div>
    </div>
  `;
}

function renderManifestSidebar(){
  const items = [
    {id: 'anpassen', label: t('exportPdf.customize'), icon: '\u2699'},
    {id: 'baukasten', label: t('pdfBlocks.toggleButton'), icon: '\ud83d\udce6'},
    {id: 'drucken', label: t('exportPdf.print'), icon: '\ud83d\udda8'},
    {id: 'export', label: t('exportPdf.exportAsPdf'), icon: '\ud83d\udcc4'}
  ];
  return `
    <nav class="settings-sidebar">
      <div class="settings-sidebar-head">
        <h2>${t('exportPdf.title')}</h2>
      </div>
      ${items.map(item => `
        <button type="button" class="settings-nav-item ${state.manifestSection === item.id ? 'active' : ''}" onclick="selectManifestSection('${item.id}')">
          <span class="settings-nav-icon">${item.icon}</span>
          <span>${item.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

function renderManifestPanel(evt){
  const ms = evt.manifestSettings;
  const section = state.manifestSection;

  if(section === 'anpassen'){
    return `
      <div class="settings-section">
        <h3>${t('exportPdf.customize')}</h3>
        <div class="manifest-settings-cols">
          <label><input type="checkbox" ${ms.showNr ? 'checked' : ''} onchange="onManifestSettingToggle('showNr', this.checked)"> ${t('exportPdf.colNrCheckbox')}</label>
          <label><input type="checkbox" ${ms.showCheckpoint ? 'checked' : ''} onchange="onManifestSettingToggle('showCheckpoint', this.checked)"> ${t('exportPdf.colCheckpointCheckbox')}</label>
          <label><input type="checkbox" ${ms.showTyp ? 'checked' : ''} onchange="onManifestSettingToggle('showTyp', this.checked)"> ${t('exportPdf.colTypCheckbox')}</label>
          <label><input type="checkbox" ${ms.showClue ? 'checked' : ''} onchange="onManifestSettingToggle('showClue', this.checked)"> ${t('exportPdf.colClueCheckbox')}</label>
          <label><input type="checkbox" ${ms.showKoordinaten ? 'checked' : ''} onchange="onManifestSettingToggle('showKoordinaten', this.checked)"> ${t('exportPdf.colKoordinatenCheckbox')}</label>
          <label><input type="checkbox" ${ms.showPunch ? 'checked' : ''} onchange="onManifestSettingToggle('showPunch', this.checked)"> ${t('exportPdf.colPunchCheckbox')}</label>
        </div>
        <div class="manifest-settings-image">
          <label>${t('exportPdf.headerImageLabel')}</label>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            ${ms.headerImage ? `<img src="${ms.headerImage}" class="manifest-image-preview" alt="">` : ''}
            <input type="file" accept="image/*" onchange="onManifestImageUpload(this)">
            ${ms.headerImage ? `<button class="btn btn-ghost btn-sm" onclick="clearManifestImage()">${t('common.remove')}</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }
  if(section === 'baukasten'){
    return renderPdfBlocksPanel(evt);
  }
  if(section === 'drucken'){
    /* Checkpoint-QR-Blätter nur, wo es eine Fahrer-App gibt — ohne sie
       zeigen die Codes ins Leere. */
    const qrCount = riderAppBaseUrl()
      ? (evt.checkpoints || []).filter(cp => cp.qrCheckinEnabled).length
      : -1;
    return `
      <div class="settings-section">
        <h3>${t('exportPdf.print')}</h3>
        <div class="settings-section-desc">${t('exportPdf.printDescription')}</div>
        <button class="btn btn-primary" onclick="printManifest()" style="margin-top:12px;">${t('exportPdf.print')}</button>
      </div>
      ${qrCount >= 0 ? `
      <div class="settings-section">
        <h3>${t('exportPdf.cpQrHeading')}</h3>
        <div class="settings-section-desc">${t('exportPdf.cpQrDescription')}</div>
        ${qrCount === 0
          ? `<div class="riders-hint warn" style="margin:12px 0 0;">${t('exportPdf.cpQrNone')}</div>`
          : `<button class="btn btn-primary" style="margin-top:12px;" onclick="exportCheckpointQrPDF()">${t('exportPdf.cpQrButton', {count: qrCount})}</button>`}
      </div>` : ''}
    `;
  }
  if(section === 'export'){
    return `
      <div class="settings-section">
        <h3>${t('exportPdf.exportAsPdf')}</h3>
        <div class="settings-section-desc">${t('exportPdf.exportDescription')}</div>
        <button class="btn btn-primary" onclick="exportManifestPDF()" style="margin-top:12px;">${t('exportPdf.exportAsPdf')}</button>
      </div>
    `;
  }
  return '';
}

function renderManifestWaybill(evt){
  const ms = evt.manifestSettings;
  const colCount = [ms.showNr, ms.showCheckpoint, ms.showTyp, ms.showClue, ms.showKoordinaten, ms.showPunch].filter(Boolean).length;

  const rows = evt.checkpoints.map(cp => {
    const type = getCheckpointType(cp.type);
    const punchCellHtml = type.manifestCell === 'answer-line' ? '<div class="answer-line"></div>'
      : type.manifestCell === 'score-line' ? `<div class="score-line">${t('exportPdf.scoreOutOf', {max: type.scoreMax})}</div>`
      : '<div class="punch-box"></div>';
    return `
    <tr>
      ${ms.showNr ? `<td class="m-no">${String(cp.order).padStart(2,'0')}</td>` : ''}
      ${ms.showCheckpoint ? `
      <td>
        <div class="m-name">${escapeHtml(cp.name)}${cp.mandatory ? '' : `<span class="tag-bonus">${t('exportPdf.bonusBadge')}</span>`}</div>
        ${type.hasCustomQuestion && cp.customQuestion ? `<div style="font-family:'JetBrains Mono'; font-size:10px; color:#8a8065; margin-top:2px;">${escapeHtml(cp.customQuestion)}</div>` : ''}
        ${cp.timeWindowEnabled ? `<div style="font-family:'JetBrains Mono'; font-size:10px; color:#8a8065; margin-top:2px;">${t('exportPdf.windowLabel')}${formatTimeOnly(cp.timeWindowStart)}\u2013${formatTimeOnly(cp.timeWindowEnd)}</div>` : ''}
      </td>` : ''}
      ${ms.showTyp ? `<td class="m-type">${escapeHtml(type.fullLabel)}</td>` : ''}
      ${ms.showClue ? `<td>${escapeHtml(cp.clue || '\u2014')}</td>` : ''}
      ${ms.showKoordinaten ? `<td class="m-coord">${formatCoordinates(cp.lat, cp.lng)}</td>` : ''}
      ${ms.showPunch ? `<td>${punchCellHtml}</td>` : ''}
    </tr>
  `;
  }).join('');

  return `
    <div class="waybill">
      <div class="waybill-head">
        <h2>${escapeHtml(evt.name || t('common.unnamedEvent'))}</h2>
        <div class="stamp-tag">${t('exportPdf.manifestStamp')}</div>
      </div>
      <div class="waybill-meta">
        <div>${t('exportPdf.dateLabel')}${escapeHtml(evt.date || '\u2014')}</div>
        <div>${t('exportPdf.checkpointsLabel')}${evt.checkpoints.length}</div>
        <div>${t('exportPdf.mandatoryBonusLine', {mandatory: t('common.mandatory'), mandatoryCount: evt.checkpoints.filter(c=>c.mandatory).length, bonus: t('common.bonus'), bonusCount: evt.checkpoints.filter(c=>!c.mandatory).length})}</div>
      </div>
      <div class="waybill-timing">
        <div>
          <div class="t-label">${t('exportPdf.startLabel')}</div>
          <div class="t-value">${evt.startMode === 'scheduled' ? formatDateTime(evt.startTime) : t('exportPdf.manualStartButton')}</div>
          <div class="t-sub">${evt.startMode === 'scheduled' ? t('exportPdf.fixedTime') : t('exportPdf.adminReleases')}</div>
        </div>
        <div>
          <div class="t-label">${t('exportPdf.curfewLabel')}</div>
          <div class="t-value">${formatDateTime(evt.curfewTime)}</div>
          <div class="t-sub">${evt.curfewMode === 'soft' ? t('exportPdf.curfewSoftSub', {penalty: evt.curfewPenaltyPerMin ?? 1}) : t('exportPdf.curfewHardSub')}</div>
        </div>
      </div>
      ${ms.headerImage ? `<img src="${ms.headerImage}" class="manifest-header-image" alt="">` : ''}
      ${evt.checkpoints.length === 0 ? `
        <div style="font-family:'JetBrains Mono'; font-size:12px; color:#8a8065; padding:20px 0;">${t('exportPdf.noCheckpointsYet')}</div>
      ` : colCount === 0 ? `
        <div style="font-family:'JetBrains Mono'; font-size:12px; color:#8a8065; padding:20px 0;">${t('exportPdf.allColumnsHidden')}</div>
      ` : `
        <div class="manifest-table-scroll">
          <table class="manifest-table">
            <thead>
              <tr>
                ${ms.showNr ? `<th>${t('exportPdf.colNrTh')}</th>` : ''}
                ${ms.showCheckpoint ? `<th>${t('exportPdf.colCheckpointTh')}</th>` : ''}
                ${ms.showTyp ? `<th>${t('exportPdf.colTypTh')}</th>` : ''}
                ${ms.showClue ? `<th>${t('exportPdf.colClueTh')}</th>` : ''}
                ${ms.showKoordinaten ? `<th>${t('exportPdf.colKoordinatenTh')}</th>` : ''}
                ${ms.showPunch ? `<th>${t('exportPdf.colPunchTh')}</th>` : ''}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `}
      <div class="waybill-foot">
        <span>${t('exportPdf.headquarterManifest')}</span>
        <span>${t('exportPdf.autoGenFooter')}</span>
      </div>
    </div>
  `;
}

