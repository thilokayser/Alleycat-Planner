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
const PDF_BLOCK_TYPES = ['waiver', 'rules', 'sponsors', 'checkpoint_list', 'notes', 'custom_text', 'emergency_info'];
function pdfBlockTypeLabel(type){
  return t('pdfBlocks.type.' + type) || type;
}
function pdfBlockTitle(b){
  if(b.type === 'custom_text' && b.config.customTitle) return b.config.customTitle;
  return pdfBlockTypeLabel(b.type);
}
function withPdfBlockDefaults(b){
  const merged = Object.assign({
    id: uid('block'), type: 'custom_text', targetDocuments: ['manifest'],
    enabled: true, sortOrder: 0, content: '', config: {}
  }, b);
  merged.config = Object.assign({}, merged.config);
  return merged;
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
        config: (b.config && typeof b.config === 'object') ? b.config : {}
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
      <div class="pdf-block-editor">${renderPdfBlockEditor(b)}</div>
    </div>
  `).join('');
  const addButtons = PDF_BLOCK_TYPES.map(type => `<button type="button" class="btn btn-sm" onclick="addPdfBlock('${type}')">+ ${pdfBlockTypeLabel(type)}</button>`).join('');
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
    </div>
  `;
}
