/* ---------------- PDF-Baukasten: block-append rendering ----------------
   Margins/line-heights are computed as fractions of the doc's own page
   size rather than fixed pt values, so this same function works whether
   the caller's jsPDF instance uses 'pt' units (manifest) or 'mm' units
   (spokecards) — only font sizes stay in fixed pt, since jsPDF's
   setFontSize() is always in points regardless of the document unit. */
function appendPdfBlocks(doc, evt, targetDocType){
  const blocks = ((evt.pdfBlocks || [])).filter(b => b.enabled && (b.targetDocuments || []).includes(targetDocType)).sort((a, b) => a.sortOrder - b.sortOrder);
  if(!blocks.length) return;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = pageW * 0.08;
  const pageRight = pageW - marginX;
  const topY = pageH * 0.09;
  const bottomLimit = pageH * 0.92;
  const lineH = pageH * 0.018;
  const INK = '#241f18', HIVIS = '#ff5f1f', STEEL = '#5b5340';

  blocks.forEach(b => {
    doc.addPage();
    let y = topY;
    doc.setTextColor(INK);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(pdfBlockTitle(b), marginX, y);
    y += pageH * 0.012;
    doc.setDrawColor(HIVIS); doc.setLineWidth(1);
    doc.line(marginX, y, pageRight, y);
    y += pageH * 0.03;

    y = renderPdfBlockContentToDoc(doc, b, evt, marginX, pageRight, y, bottomLimit, topY, lineH);

    if(b.type === 'waiver' && (b.config.showSignatureLine || b.config.showDateField)){
      y += pageH * 0.03;
      if(y > bottomLimit - pageH * 0.06){ doc.addPage(); y = topY; }
      doc.setDrawColor(STEEL); doc.setLineWidth(0.6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(STEEL);
      if(b.config.showDateField){
        const w = (pageRight - marginX) * 0.28;
        doc.line(marginX, y, marginX + w, y);
        doc.text(t('pdfBlocks.dateFieldLabel'), marginX, y + pageH * 0.014);
      }
      if(b.config.showSignatureLine){
        const sigX = marginX + (pageRight - marginX) * 0.4;
        doc.line(sigX, y, pageRight, y);
        doc.text(t('pdfBlocks.signatureFieldLabel'), sigX, y + pageH * 0.014);
      }
    }
  });
}
function renderPdfBlockContentToDoc(doc, b, evt, marginX, pageRight, y, bottomLimit, topY, lineH){
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.setTextColor('#241f18');

  if(b.type === 'sponsors'){
    const logos = b.config.logos || [];
    if(!logos.length){
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor('#5b5340');
      doc.text(t('pdfBlocks.sponsorsEmpty'), marginX, y);
      return y + lineH;
    }
    const gap = (pageRight - marginX) * 0.03;
    const logoW = (pageRight - marginX - gap * 2) / 3;
    const logoH = logoW * 0.5;
    let x = marginX, col = 0;
    logos.forEach(l => {
      if(y + logoH > bottomLimit){ doc.addPage(); y = topY; x = marginX; col = 0; }
      try{ doc.addImage(l.dataUrl, x, y, logoW, logoH, undefined, 'FAST'); }catch(e){ /* unsupported image format — skip tile */ }
      col++;
      if(col >= 3){ col = 0; x = marginX; y += logoH + lineH; }
      else x += logoW + gap;
    });
    return y + logoH + lineH;
  }

  if(b.type === 'checkpoint_list'){
    const checkpoints = evt.checkpoints.slice().sort((a, c) => a.order - c.order);
    checkpoints.forEach(cp => {
      if(y > bottomLimit){ doc.addPage(); y = topY; }
      doc.setFont('courier', 'bold'); doc.setFontSize(9); doc.setTextColor('#241f18');
      doc.text(String(cp.order).padStart(2, '0'), marginX, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(cp.name || '—', marginX + (pageRight - marginX) * 0.06, y);
      y += lineH;
    });
    return y;
  }

  const content = b.content || '';
  if(!content.trim()){
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor('#5b5340');
    doc.text(t('pdfBlocks.emptyContent'), marginX, y);
    return y + lineH;
  }
  content.split(/\n{2,}/).forEach(paragraph => {
    const lines = doc.splitTextToSize(paragraph, pageRight - marginX);
    lines.forEach(line => {
      if(y > bottomLimit){ doc.addPage(); y = topY; }
      doc.text(line, marginX, y);
      y += lineH;
    });
    y += lineH * 0.5;
  });
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

  if(rider.name){
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor('#5b5340');
    doc.text(truncateText(rider.name, 26), x + w / 2, y + h - 15, {align: 'center', maxWidth: w - 10});
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

  doc.addPage();
  for(let i = 0; i < riders.length; i++){
    if(i > 0 && i % perPage === 0) doc.addPage();
    const {x, y} = pos(i);
    const qr = await renderQrDataUrl(String(riders[i].bib), 300);
    drawSpokeCardBack(doc, x, y, cardW, cardH, evt, riders[i], qr);
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
async function buildRiderSheetDoc(evt){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const cardW = 63.5, cardH = 88.9;
  const {perPage, pos} = computeCardGrid(210, 297, cardW, cardH, 10, 8, 6, 5);

  const riders = evt.riders;
  for(let i = 0; i < riders.length; i++){
    if(i > 0 && i % perPage === 0) doc.addPage();
    const {x, y} = pos(i);
    const qr = await renderQrDataUrl(String(riders[i].bib), 300);
    drawSpokeCardBack(doc, x, y, cardW, cardH, evt, riders[i], qr);
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
  doc.save((evt.name || 'personal-briefing').replace(/\s+/g, '_').toLowerCase() + '-personal-briefing.pdf');
}

/* ---------------- manifest export ---------------- */
function printManifest(){
  if(state.currentEvent){
    state.currentEvent.manifestGenerated = true;
    debouncedSave();
  }
  window.print();
}
function toggleManifestSettings(){
  state.manifestSettingsOpen = !state.manifestSettingsOpen;
  renderManifest();
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
    doc.save((evt.name || 'manifest').replace(/\s+/g, '_').toLowerCase() + '-manifest.pdf');
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
      doc.text(cp.lat.toFixed(5) + ', ' + cp.lng.toFixed(5), colX.koordinaten, y);
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
  doc.save((evt.name || 'manifest').replace(/\s+/g,'_').toLowerCase() + '-manifest.pdf');
  evt.manifestGenerated = true;
  debouncedSave();
}


/* ---------------- render: manifest ---------------- */
function renderManifest(){
  const el = document.getElementById('view-manifest');
  const evt = state.currentEvent;
  if(!evt){
    el.innerHTML = `<div class="loading-row">${t('exportPdf.noEventSelected')}</div>`;
    return;
  }
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
      ${ms.showKoordinaten ? `<td class="m-coord">${cp.lat.toFixed(5)}, ${cp.lng.toFixed(5)}</td>` : ''}
      ${ms.showPunch ? `<td>${punchCellHtml}</td>` : ''}
    </tr>
  `;
  }).join('');

  el.innerHTML = `
    <div class="manifest-toolbar">
      <div class="mono" style="color:var(--steel); font-size:11px;">${t(evt.checkpoints.length === 1 ? 'exportPdf.checkpointCountSingular' : 'exportPdf.checkpointCountPlural', {count: evt.checkpoints.length})}</div>
      <div class="manifest-toolbar-actions">
        <button class="btn" onclick="toggleManifestSettings()">${state.manifestSettingsOpen ? '\u25be' : '\u25b8'} ${t('exportPdf.customize')}</button>
        <button class="btn" onclick="togglePdfBlocksPanel()">${state.pdfBlocksPanelOpen ? '\u25be' : '\u25b8'} ${t('pdfBlocks.toggleButton')}</button>
        <button class="btn" onclick="printManifest()">${t('exportPdf.print')}</button>
        <button class="btn btn-primary" onclick="exportManifestPDF()">${t('exportPdf.exportAsPdf')}</button>
      </div>
    </div>
    ${state.pdfBlocksPanelOpen ? renderPdfBlocksPanel(evt) : ''}
    ${state.manifestSettingsOpen ? `
      <div class="manifest-settings-panel">
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
            ${ms.headerImage ? `<img src="${ms.headerImage}" class="manifest-image-preview" alt="${t('exportPdf.headerImagePreviewAlt')}">` : ''}
            <input type="file" accept="image/*" onchange="onManifestImageUpload(this)">
            ${ms.headerImage ? `<button class="btn btn-ghost btn-sm" onclick="clearManifestImage()">${t('common.remove')}</button>` : ''}
          </div>
        </div>
      </div>
    ` : ''}
    <div id="print-root">
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
        ${ms.headerImage ? `<img src="${ms.headerImage}" class="manifest-header-image" alt="${t('exportPdf.headerImageAlt')}">` : ''}
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
    </div>
  `;
}

