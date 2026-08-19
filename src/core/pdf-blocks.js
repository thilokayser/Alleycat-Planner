/* ---------------- PDF-Baukasten ----------------
   Anhängbare Content-Blöcke pro Event, die als zusätzliche Seiten an
   PDF-Exporte angehängt werden (Manifest und/oder Spokecards) — kein
   Ersatz für die bestehende Tabellen-/Karten-Logik dieser Dokumente,
   sondern eine ergänzende Sektion (Waiver, Regeln, Sponsoren, ...).
   evt.pdfBlocks = [{id, type, targetDocuments[], enabled, sortOrder,
   content, config{}}]. Block-Titel laufen über t(), Block-Inhalt bleibt
   unübersetzte Organizer-Freitext-Eingabe wie Checkpoint-/Kategorie-Namen —
   einzige Ausnahme ist der optionale customTitle bei custom_text, der
   ebenfalls Rohtext ist. */
const PDF_BLOCK_TYPES = ['waiver', 'rules', 'sponsors', 'checkpoint_list', 'notes', 'custom_text', 'emergency_info', 'event_locations', 'image', 'table', 'variable_text', 'clue_sheet'];
/* width: 'full'|'half'|'third' + pageBreakBefore (bool) drive layoutBlocks()'s
   auto-flow row packing (Paket 5 Teil B). Defaulted here (not a rigid
   document_type field per the spec's raw schema — kept the pre-existing,
   more flexible targetDocuments[] array instead, see roadmap doc) so any
   block loaded from storage without these keys (pre-Teil-B events) behaves
   exactly as before: one full-width block per row. */
const PDF_BLOCK_WIDTHS = ['full', 'half', 'third'];
const PDF_BLOCK_WIDTH_VALUES = {full: 1, half: 0.5, third: 0.33};
const PDF_DOCUMENT_TYPES = ['manifest', 'spokecards'];
/* Personal-Briefing/Aushang-Endergebnis deliberately excluded — Phase 14
   already drew this exact boundary (appendPdfBlocks() is only ever called
   for manifest/spokecards) and Aushang-Endergebnis has no export function
   at all yet; building one is out of scope for the roadmap's Teil-B
   checklist, which only asks for templates on document types the Baukasten
   already supports. */
const PDF_DOCUMENT_TEMPLATES = {
  manifest: [
    {type: 'checkpoint_list', width: 'half'},
    {type: 'image', width: 'half'},
    {type: 'rules', width: 'full'},
    {type: 'waiver', width: 'full'},
    {type: 'sponsors', width: 'full'}
  ],
  spokecards: [
    {type: 'emergency_info', width: 'full'},
    {type: 'sponsors', width: 'full'}
  ]
};
function pdfBlockLogosPerRow(width){
  return width === 'third' ? 1 : width === 'half' ? 2 : 3;
}
function pdfBlockTypeLabel(type){
  return t('pdfBlocks.type.' + type) || type;
}
function pdfBlockTitle(b){
  if((b.type === 'custom_text' || b.type === 'variable_text') && b.config.customTitle) return b.config.customTitle;
  return pdfBlockTypeLabel(b.type);
}
function withPdfBlockDefaults(b){
  const merged = Object.assign({
    id: uid('block'), type: 'custom_text', targetDocuments: ['manifest'],
    enabled: true, sortOrder: 0, content: '', config: {},
    width: 'full', pageBreakBefore: false
  }, b);
  if(!PDF_BLOCK_WIDTHS.includes(merged.width)) merged.width = 'full';
  merged.pageBreakBefore = merged.pageBreakBefore === true;
  merged.config = Object.assign({}, merged.config);
  return merged;
}
/* Auto-flow row packing — verbatim from spec 17.2. A block forces a new row
   either explicitly (pageBreakBefore) or because it no longer fits in the
   current row's remaining width (the >1.001 slack absorbs float error from
   summing 'third' widths (0.33) three times, which lands at 0.99). */
function layoutBlocks(blocks){
  const rows = [];
  let currentRow = [];
  let currentWidth = 0;
  for(const block of blocks){
    const w = PDF_BLOCK_WIDTH_VALUES[block.width] || 1;
    if(block.pageBreakBefore || currentWidth + w > 1.001){
      if(currentRow.length) rows.push(currentRow);
      currentRow = [];
      currentWidth = 0;
    }
    currentRow.push(block);
    currentWidth += w;
  }
  if(currentRow.length) rows.push(currentRow);
  return rows;
}
function defaultPdfBlocksForNewEvent(){
  const blocks = [];
  let order = 0;
  PDF_DOCUMENT_TYPES.forEach(docType => {
    (PDF_DOCUMENT_TEMPLATES[docType] || []).forEach(def => {
      blocks.push(withPdfBlockDefaults({type: def.type, width: def.width, targetDocuments: [docType], sortOrder: order++}));
    });
  });
  return blocks;
}
function resetPdfBlocksToDefault(docType){
  const evt = state.currentEvent;
  if(!evt || !PDF_DOCUMENT_TEMPLATES[docType]) return;
  if(!confirm(t('pdfBlocks.resetConfirm'))) return;
  evt.pdfBlocks = (evt.pdfBlocks || []).reduce((acc, b) => {
    if(!b.targetDocuments.includes(docType)){ acc.push(b); return acc; }
    const remaining = b.targetDocuments.filter(d => d !== docType);
    if(remaining.length){ b.targetDocuments = remaining; acc.push(b); }
    return acc;
  }, []);
  const startOrder = evt.pdfBlocks.length;
  PDF_DOCUMENT_TEMPLATES[docType].forEach((def, i) => {
    evt.pdfBlocks.push(withPdfBlockDefaults({type: def.type, width: def.width, targetDocuments: [docType], sortOrder: startOrder + i}));
  });
  debouncedSave();
  renderManifest();
}
function findPdfBlock(id){
  return ((state.currentEvent && state.currentEvent.pdfBlocks) || []).find(b => b.id === id);
}

/* ---------------- CRUD ---------------- */
function addPdfBlock(type){
  const evt = state.currentEvent;
  if(!evt || !PDF_BLOCK_TYPES.includes(type)) return;
  evt.pdfBlocks = evt.pdfBlocks || [];
  evt.pdfBlocks.push(withPdfBlockDefaults({type, sortOrder: evt.pdfBlocks.length}));
  debouncedSave();
  renderManifest();
}
function deletePdfBlock(id){
  if(!confirm(t('pdfBlocks.deleteConfirm'))) return;
  const evt = state.currentEvent;
  evt.pdfBlocks = (evt.pdfBlocks || []).filter(b => b.id !== id);
  debouncedSave();
  renderManifest();
}
function togglePdfBlockEnabled(id, checked){
  const b = findPdfBlock(id);
  if(!b) return;
  b.enabled = checked;
  debouncedSave();
  renderManifest();
}
function togglePdfBlockTargetDocument(id, docType, checked){
  const b = findPdfBlock(id);
  if(!b) return;
  const set = new Set(b.targetDocuments);
  if(checked) set.add(docType); else set.delete(docType);
  b.targetDocuments = Array.from(set);
  debouncedSave();
  renderManifest();
}
function movePdfBlock(id, dir){
  const evt = state.currentEvent;
  if(!evt) return;
  const list = evt.pdfBlocks;
  const idx = list.findIndex(b => b.id === id);
  const newIdx = idx + dir;
  if(idx === -1 || newIdx < 0 || newIdx >= list.length) return;
  const tmp = list[idx]; list[idx] = list[newIdx]; list[newIdx] = tmp;
  list.forEach((b, i) => { b.sortOrder = i; });
  debouncedSave();
  renderManifest();
}
function onPdfBlockContentChange(id, value){
  const b = findPdfBlock(id);
  if(!b) return;
  b.content = value;
  debouncedSave();
}
function onPdfBlockTitleChange(id, value){
  const b = findPdfBlock(id);
  if(!b) return;
  b.config.customTitle = value;
  debouncedSave();
}
function setPdfBlockWidth(id, width){
  const b = findPdfBlock(id);
  if(!b || !PDF_BLOCK_WIDTHS.includes(width)) return;
  b.width = width;
  debouncedSave();
  renderManifest();
}
function togglePdfBlockPageBreak(id, checked){
  const b = findPdfBlock(id);
  if(!b) return;
  b.pageBreakBefore = checked;
  debouncedSave();
  renderManifest();
}
function onPdfBlockConfigToggle(id, key, checked){
  const b = findPdfBlock(id);
  if(!b) return;
  b.config[key] = checked;
  debouncedSave();
  renderManifest();
}
function onPdfBlockSponsorLogoUpload(id, input){
  const file = input.files && input.files[0];
  if(!file) return;
  const b = findPdfBlock(id);
  if(!b){ input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    b.config.logos = b.config.logos || [];
    b.config.logos.push({dataUrl: reader.result, name: file.name});
    debouncedSave();
    renderManifest();
  };
  reader.readAsDataURL(file);
  input.value = '';
}
function removePdfBlockSponsorLogo(id, idx){
  const b = findPdfBlock(id);
  if(!b || !b.config.logos) return;
  b.config.logos.splice(idx, 1);
  debouncedSave();
  renderManifest();
}

/* ---------------- image block: client-side compression ----------------
   Resized to max 1600px width / re-encoded as JPEG ~80% before ever
   touching storage, consistent with the app's existing storage-size
   sensitivity (4.13's Storage-Estimate warning) — avoids ballooning the
   local SQLite DB with full-resolution route-map screenshots/event photos. */
function compressImageFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1600;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve({dataUrl: canvas.toDataURL('image/jpeg', 0.8), w, h});
      };
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}
async function onPdfBlockImageUpload(id, input){
  const file = input.files && input.files[0];
  if(!file) return;
  const b = findPdfBlock(id);
  if(!b){ input.value = ''; return; }
  try{
    const {dataUrl, w, h} = await compressImageFile(file);
    b.config.dataUrl = dataUrl;
    b.config.imageDims = {w, h};
    debouncedSave();
    renderManifest();
  }catch(e){
    alert(t('pdfBlocks.imageUploadFailed'));
  }
  input.value = '';
}
function removePdfBlockImage(id){
  const b = findPdfBlock(id);
  if(!b) return;
  delete b.config.dataUrl;
  delete b.config.imageDims;
  debouncedSave();
  renderManifest();
}
function onPdfBlockImageCaptionChange(id, value){
  const b = findPdfBlock(id);
  if(!b) return;
  b.config.caption = value;
  debouncedSave();
}
function onPdfBlockImageAlignChange(id, value){
  const b = findPdfBlock(id);
  if(!b) return;
  b.config.alignment = value;
  debouncedSave();
  renderManifest();
}

/* ---------------- table block: fixed app-data sources (no freeform grid) ---------------- */
const PDF_TABLE_SOURCES = ['checkpoint_distances', 'category_breakdown', 'team_list'];
function onPdfBlockTableSourceChange(id, value){
  const b = findPdfBlock(id);
  if(!b || !PDF_TABLE_SOURCES.includes(value)) return;
  b.config.source = value;
  debouncedSave();
  renderManifest();
}
function pdfBlockTableData(b, evt){
  const source = PDF_TABLE_SOURCES.includes(b.config.source) ? b.config.source : 'checkpoint_distances';
  if(source === 'category_breakdown'){
    const headers = [t('pdfBlocks.table.category'), t('pdfBlocks.table.option'), t('pdfBlocks.table.count')];
    const rows = [];
    (evt.categoryGroups || []).slice().sort((a, c) => a.sortOrder - c.sortOrder).forEach(g => {
      (g.options || []).forEach(opt => {
        const count = (evt.riders || []).filter(r => r.categories && r.categories[g.id] === opt).length;
        rows.push([g.name, opt, String(count)]);
      });
    });
    return {headers, rows};
  }
  if(source === 'team_list'){
    const headers = [t('pdfBlocks.table.team'), t('pdfBlocks.table.members')];
    const rows = (evt.teams || []).map(tm => {
      const members = (evt.riders || []).filter(r => r.teamId === tm.id).map(r => r.name || ('#' + r.bib)).join(', ');
      return [tm.name, members || '—'];
    });
    return {headers, rows};
  }
  const headers = [t('pdfBlocks.table.checkpoint'), t('pdfBlocks.table.leg'), t('pdfBlocks.table.cumulative')];
  const ordered = (evt.checkpoints || []).slice().sort((a, c) => a.order - c.order);
  const {legs, total} = computeRouteLegs(ordered);
  let cumulative = 0;
  const rows = ordered.map((cp, i) => {
    const legKm = i === 0 ? 0 : legs[i - 1].km;
    cumulative += legKm;
    return [cp.name || ('#' + (i + 1)), i === 0 ? '—' : formatDistance(legKm * 1000), formatDistance(cumulative * 1000)];
  });
  if(ordered.length > 1) rows.push([t('pdfBlocks.table.total'), '', formatDistance(total * 1000)]);
  return {headers, rows};
}

/* ---------------- clue_sheet: cipher-shift config ---------------- */
function onPdfBlockClueSheetShiftChange(id, value){
  const b = findPdfBlock(id);
  if(!b) return;
  let shift = parseInt(value, 10);
  if(!Number.isFinite(shift)) shift = 3;
  shift = Math.min(9, Math.max(1, shift));
  b.config.cipherShift = shift;
  debouncedSave();
  renderManifest();
}

/* ---------------- variable_text: {{event.x}} placeholder interpolation ----------------
   Interpolated at export time only (17.5) — the stored content stays the
   raw template text, same "never runs through t()" rule as custom_text, so
   the template remains reusable across events via the existing JSON
   export/import instead of being baked to one event's values on save. */
function pdfBlockVariableValues(evt){
  const hq = getEventLocation(evt, 'headquarters');
  const afterparty = getEventLocation(evt, 'afterparty');
  return {
    'event.name': evt.name || '',
    'event.date': formatDateOnly(evt.date),
    'event.riderCount': String((evt.riders || []).length || evt.expectedRiders || 0),
    'event.hqAddress': (hq && hq.address) || '',
    'event.afterpartyName': (afterparty && afterparty.name) || ''
  };
}
function interpolatePdfBlockVariables(text, evt){
  const values = pdfBlockVariableValues(evt);
  return (text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m);
}

/* ---------------- export/import as template ---------------- */
function exportPdfBlocksJSON(){
  const evt = state.currentEvent;
  if(!evt || !(evt.pdfBlocks || []).length) return;
  const filename = (evt.name || 'event').replace(/\s+/g, '_').toLowerCase() + '-pdf-blocks.json';
  downloadJSON(evt.pdfBlocks, filename);
}
async function onImportPdfBlocksFile(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const evt = state.currentEvent;
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    if(!Array.isArray(parsed)) throw new Error('invalid shape');
    if(!confirm(t('pdfBlocks.importPreview', {count: parsed.length}))){ input.value = ''; return; }
    evt.pdfBlocks = evt.pdfBlocks || [];
    parsed.forEach(b => {
      if(!b || !PDF_BLOCK_TYPES.includes(b.type)) return;
      evt.pdfBlocks.push(withPdfBlockDefaults({
        id: uid('block'), type: b.type,
        targetDocuments: Array.isArray(b.targetDocuments) ? b.targetDocuments : ['manifest'],
        enabled: b.enabled !== false, sortOrder: evt.pdfBlocks.length,
        content: typeof b.content === 'string' ? b.content : '',
        config: (b.config && typeof b.config === 'object') ? b.config : {},
        width: PDF_BLOCK_WIDTHS.includes(b.width) ? b.width : 'full',
        pageBreakBefore: b.pageBreakBefore === true
      }));
    });
    input.value = '';
    debouncedSave();
    renderManifest();
  }catch(e){
    alert(t('pdfBlocks.importFailed'));
    input.value = '';
  }
}

/* ---------------- panel UI (rendered into the Manifest view) ---------------- */
function togglePdfBlocksPanel(){
  state.pdfBlocksPanelOpen = !state.pdfBlocksPanelOpen;
  renderManifest();
}
function renderPdfBlockEditor(b){
  switch(b.type){
    case 'waiver':
      return `
        <textarea class="pdf-block-textarea" rows="4" placeholder="${t('pdfBlocks.contentPlaceholder')}" oninput="onPdfBlockContentChange('${b.id}', this.value)">${escapeHtml(b.content)}</textarea>
        <label class="checkbox-row"><input type="checkbox" ${b.config.showSignatureLine ? 'checked' : ''} onchange="onPdfBlockConfigToggle('${b.id}', 'showSignatureLine', this.checked)"> ${t('pdfBlocks.waiverShowSignature')}</label>
        <label class="checkbox-row"><input type="checkbox" ${b.config.showDateField ? 'checked' : ''} onchange="onPdfBlockConfigToggle('${b.id}', 'showDateField', this.checked)"> ${t('pdfBlocks.waiverShowDate')}</label>
      `;
    case 'rules':
    case 'notes':
    case 'emergency_info':
      return `<textarea class="pdf-block-textarea" rows="4" placeholder="${t('pdfBlocks.contentPlaceholder')}" oninput="onPdfBlockContentChange('${b.id}', this.value)">${escapeHtml(b.content)}</textarea>`;
    case 'custom_text':
      return `
        <input type="text" placeholder="${t('pdfBlocks.customTitlePlaceholder')}" value="${escapeHtml(b.config.customTitle || '')}" oninput="onPdfBlockTitleChange('${b.id}', this.value)">
        <textarea class="pdf-block-textarea" rows="4" placeholder="${t('pdfBlocks.contentPlaceholder')}" oninput="onPdfBlockContentChange('${b.id}', this.value)">${escapeHtml(b.content)}</textarea>
      `;
    case 'sponsors': {
      const logos = b.config.logos || [];
      return `
        <div class="pdf-block-sponsor-logos">
          ${logos.map((l, i) => `
            <span class="pdf-block-sponsor-logo">
              <img src="${l.dataUrl}" alt="">
              <button type="button" class="btn btn-sm btn-danger" onclick="removePdfBlockSponsorLogo('${b.id}', ${i})">${t('common.remove')}</button>
            </span>
          `).join('')}
        </div>
        <input type="file" accept="image/*" onchange="onPdfBlockSponsorLogoUpload('${b.id}', this)">
      `;
    }
    case 'checkpoint_list':
      return `<div class="settings-section-desc">${t('pdfBlocks.checkpointListAuto')}</div>`;
    case 'event_locations':
      return `<div class="settings-section-desc">${t('pdfBlocks.eventLocationsAuto')}</div>`;
    case 'variable_text':
      return `
        <input type="text" placeholder="${t('pdfBlocks.customTitlePlaceholder')}" value="${escapeHtml(b.config.customTitle || '')}" oninput="onPdfBlockTitleChange('${b.id}', this.value)">
        <textarea class="pdf-block-textarea" rows="4" placeholder="${t('pdfBlocks.contentPlaceholder')}" oninput="onPdfBlockContentChange('${b.id}', this.value)">${escapeHtml(b.content)}</textarea>
        <div class="settings-section-desc">${t('pdfBlocks.variableTextHint')}</div>
      `;
    case 'image': {
      const cfg = b.config;
      return `
        <input type="file" accept="image/*" onchange="onPdfBlockImageUpload('${b.id}', this)">
        ${cfg.dataUrl ? `
          <div class="pdf-block-image-preview">
            <img src="${cfg.dataUrl}" alt="">
            <button type="button" class="btn btn-sm btn-danger" onclick="removePdfBlockImage('${b.id}')">${t('common.remove')}</button>
          </div>
        ` : `<div class="settings-section-desc">${t('pdfBlocks.imageEmpty')}</div>`}
        <input type="text" placeholder="${t('pdfBlocks.imageCaptionPlaceholder')}" value="${escapeHtml(cfg.caption || '')}" oninput="onPdfBlockImageCaptionChange('${b.id}', this.value)">
        <select onchange="onPdfBlockImageAlignChange('${b.id}', this.value)">
          <option value="left" ${cfg.alignment === 'left' ? 'selected' : ''}>${t('pdfBlocks.alignLeft')}</option>
          <option value="center" ${!cfg.alignment || cfg.alignment === 'center' ? 'selected' : ''}>${t('pdfBlocks.alignCenter')}</option>
          <option value="right" ${cfg.alignment === 'right' ? 'selected' : ''}>${t('pdfBlocks.alignRight')}</option>
        </select>
      `;
    }
    case 'table': {
      const src = PDF_TABLE_SOURCES.includes(b.config.source) ? b.config.source : 'checkpoint_distances';
      return `
        <select onchange="onPdfBlockTableSourceChange('${b.id}', this.value)">
          ${PDF_TABLE_SOURCES.map(s => `<option value="${s}" ${s === src ? 'selected' : ''}>${t('pdfBlocks.tableSource.' + s)}</option>`).join('')}
        </select>
        <div class="settings-section-desc">${t('pdfBlocks.tableAuto')}</div>
      `;
    }
    case 'clue_sheet':
      return `
        <div class="settings-section-desc">${t('pdfBlocks.clueSheetAuto')}</div>
        <div class="row2">
          <div>
            <label>${t('pdfBlocks.clueSheetShiftLabel')}</label>
            <input type="number" min="1" max="9" value="${b.config.cipherShift ?? 3}" onchange="onPdfBlockClueSheetShiftChange('${b.id}', this.value)">
          </div>
        </div>
        <label class="checkbox-row"><input type="checkbox" ${b.config.includeStamps !== false ? 'checked' : ''} onchange="onPdfBlockConfigToggle('${b.id}', 'includeStamps', this.checked)"> ${t('pdfBlocks.clueSheetStampsLabel')}</label>
      `;
    default:
      return '';
  }
}
function renderPdfBlocksPanel(evt){
  const blocks = (evt.pdfBlocks || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = blocks.map((b, i) => `
    <div class="pdf-block-row">
      <div class="pdf-block-row-head">
        <span class="pdf-block-move">
          <button type="button" class="btn btn-sm" ${i === 0 ? 'disabled' : ''} onclick="movePdfBlock('${b.id}', -1)">&uarr;</button>
          <button type="button" class="btn btn-sm" ${i === blocks.length - 1 ? 'disabled' : ''} onclick="movePdfBlock('${b.id}', 1)">&darr;</button>
        </span>
        <label class="checkbox-row pdf-block-enabled"><input type="checkbox" ${b.enabled ? 'checked' : ''} onchange="togglePdfBlockEnabled('${b.id}', this.checked)"> ${pdfBlockTitle(b)}</label>
        <span class="pdf-block-targets">
          <label><input type="checkbox" ${b.targetDocuments.includes('manifest') ? 'checked' : ''} onchange="togglePdfBlockTargetDocument('${b.id}', 'manifest', this.checked)"> ${t('pdfBlocks.targetManifest')}</label>
          <label><input type="checkbox" ${b.targetDocuments.includes('spokecards') ? 'checked' : ''} onchange="togglePdfBlockTargetDocument('${b.id}', 'spokecards', this.checked)"> ${t('pdfBlocks.targetSpokecards')}</label>
        </span>
        <button type="button" class="btn btn-sm btn-danger" onclick="deletePdfBlock('${b.id}')">${t('common.delete')}</button>
      </div>
      <div class="pdf-block-row-options">
        <label class="pdf-block-width-label">${t('pdfBlocks.widthLabel')}
          <select onchange="setPdfBlockWidth('${b.id}', this.value)">
            <option value="full" ${b.width === 'full' ? 'selected' : ''}>${t('pdfBlocks.widthFull')}</option>
            <option value="half" ${b.width === 'half' ? 'selected' : ''}>${t('pdfBlocks.widthHalf')}</option>
            <option value="third" ${b.width === 'third' ? 'selected' : ''}>${t('pdfBlocks.widthThird')}</option>
          </select>
        </label>
        <label class="checkbox-row"><input type="checkbox" ${b.pageBreakBefore ? 'checked' : ''} onchange="togglePdfBlockPageBreak('${b.id}', this.checked)"> ${t('pdfBlocks.pageBreakBefore')}</label>
      </div>
      <div class="pdf-block-editor">${renderPdfBlockEditor(b)}</div>
    </div>
  `).join('');
  const addButtons = PDF_BLOCK_TYPES.map(type => `<button type="button" class="btn btn-sm" onclick="addPdfBlock('${type}')">+ ${pdfBlockTypeLabel(type)}</button>`).join('');
  const resetButtons = PDF_DOCUMENT_TYPES.map(docType => `<button type="button" class="btn btn-sm" onclick="resetPdfBlocksToDefault('${docType}')">${t('pdfBlocks.resetTo', {doc: t('pdfBlocks.target' + (docType === 'manifest' ? 'Manifest' : 'Spokecards'))})}</button>`).join('');
  return `
    <div class="pdf-blocks-panel">
      <div class="settings-section-desc">${t('pdfBlocks.hint')}</div>
      <div class="pdf-block-list">${rows || `<div class="settings-section-desc">${t('pdfBlocks.empty')}</div>`}</div>
      <div class="pdf-block-add-row">${addButtons}</div>
      <div class="pdf-block-template-row">
        <input type="file" id="import-pdfblocks-file" accept="application/json,.json" style="display:none;" onchange="onImportPdfBlocksFile(this)">
        <button type="button" class="btn btn-sm" onclick="document.getElementById('import-pdfblocks-file').click()">${t('pdfBlocks.importTemplate')}</button>
        <button type="button" class="btn btn-sm" ${blocks.length ? '' : 'disabled'} onclick="exportPdfBlocksJSON()">${t('pdfBlocks.exportTemplate')}</button>
      </div>
      <div class="pdf-block-template-row">
        ${resetButtons}
        <button type="button" class="btn btn-sm btn-primary" onclick="previewPdfBlocksLayout('manifest')">${t('pdfBlocks.previewManifest')}</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="previewPdfBlocksLayout('spokecards')">${t('pdfBlocks.previewSpokecards')}</button>
      </div>
    </div>
  `;
}
