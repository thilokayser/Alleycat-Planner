/* ---------------- categories ----------------
   Orthogonale Kategorie-Gruppen pro Event (z. B. Antrieb, Gender), unabhängig
   vom Solo/Team-System. evt.categoryGroups = [{id, name, options[], sortOrder}],
   rider.categories = {[groupId]: selectedOption}. Optionswerte sind Rohtext
   (auch aus Presets übernommen) — laufen NIE durch t(), da sie danach vom
   Nutzer umbenannt werden können wie jeder andere Eingabewert.             */
const CATEGORY_PRESETS = [
  {key: 'drivetrain', name: () => t('category.presetDrivetrainName'), options: () => [t('category.presetFixed'), t('category.presetFree')]},
  {key: 'gender', name: () => t('category.presetGenderName'), options: () => [t('category.presetOpen'), t('category.presetFlinta')]}
];
function withCategoryGroupDefaults(g){
  return Object.assign({id: uid('catgrp'), name: '', options: [], sortOrder: 0}, g);
}
function addCategoryPreset(presetKey){
  const preset = CATEGORY_PRESETS.find(p => p.key === presetKey);
  const evt = state.currentEvent;
  if(!preset || !evt) return;
  const name = preset.name();
  evt.categoryGroups = evt.categoryGroups || [];
  if(evt.categoryGroups.some(g => g.name === name)) return;
  evt.categoryGroups.push(withCategoryGroupDefaults({name, options: preset.options(), sortOrder: evt.categoryGroups.length}));
  debouncedSave();
  renderRiders();
}
function toggleNewCategoryGroupForm(){
  state.newCategoryGroupFormOpen = !state.newCategoryGroupFormOpen;
  renderRiders();
}
function addNewCategoryGroupOptionField(){
  const container = document.getElementById('newcatgroup-options-container');
  if(!container) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'newcatgroup-option-input';
  input.placeholder = t('category.optionPlaceholder') + ' ' + (container.children.length + 1);
  input.style.marginBottom = '6px';
  input.style.display = 'block';
  container.appendChild(input);
}
function addCategoryGroup(){
  const evt = state.currentEvent;
  if(!evt) return;
  const name = (document.getElementById('newcatgroup-name').value || '').trim();
  if(!name){ alert(t('category.namePrompt')); return; }
  const options = Array.from(document.querySelectorAll('.newcatgroup-option-input'))
    .map(inp => inp.value.trim()).filter(Boolean);
  if(!options.length){ alert(t('category.optionsPrompt')); return; }
  evt.categoryGroups = evt.categoryGroups || [];
  evt.categoryGroups.push(withCategoryGroupDefaults({name, options, sortOrder: evt.categoryGroups.length}));
  state.newCategoryGroupFormOpen = false;
  state.newCategoryGroupOptionCount = 1;
  debouncedSave();
  renderRiders();
}
function renameCategoryGroup(id, name){
  const group = ((state.currentEvent && state.currentEvent.categoryGroups) || []).find(g => g.id === id);
  if(!group) return;
  group.name = name;
  debouncedSave();
}
function deleteCategoryGroup(id){
  const evt = state.currentEvent;
  const idx = (evt.categoryGroups || []).findIndex(g => g.id === id);
  if(idx === -1) return;
  if(!confirm(t('category.deleteGroupConfirm'))) return;
  const group = evt.categoryGroups[idx];
  const affected = (evt.riders || []).filter(r => r.categories && r.categories[id] !== undefined).map(r => ({bib: r.bib, value: r.categories[id]}));
  evt.categoryGroups = evt.categoryGroups.filter(g => g.id !== id);
  (evt.riders || []).forEach(r => { if(r.categories) delete r.categories[id]; });
  renderRiders();
  logUndoableAction(evt, t('actionLog.categoryGroupDeleted', {name: group.name}), () => {
    evt.categoryGroups.splice(idx, 0, group);
    affected.forEach(({bib, value}) => {
      const r = (evt.riders || []).find(x => x.bib === bib);
      if(r){ r.categories = r.categories || {}; r.categories[id] = value; }
    });
    renderRiders();
  });
}
function addCategoryOption(groupId){
  const evt = state.currentEvent;
  const group = ((evt && evt.categoryGroups) || []).find(g => g.id === groupId);
  const input = document.getElementById('newoption-' + groupId);
  if(!group || !input) return;
  const value = (input.value || '').trim();
  if(!value || group.options.includes(value)) return;
  group.options.push(value);
  debouncedSave();
  renderRiders();
}
function renameCategoryOption(groupId, oldValue, newValue){
  const evt = state.currentEvent;
  const group = ((evt && evt.categoryGroups) || []).find(g => g.id === groupId);
  newValue = (newValue || '').trim();
  if(!group || !newValue || newValue === oldValue){ renderRiders(); return; }
  if(group.options.includes(newValue)){ alert(t('category.optionExists')); renderRiders(); return; }
  const idx = group.options.indexOf(oldValue);
  if(idx === -1) return;
  group.options[idx] = newValue;
  (evt.riders || []).forEach(r => {
    if(r.categories && r.categories[groupId] === oldValue) r.categories[groupId] = newValue;
  });
  debouncedSave();
  renderRiders();
}
function deleteCategoryOption(groupId, value){
  const evt = state.currentEvent;
  const group = ((evt && evt.categoryGroups) || []).find(g => g.id === groupId);
  if(!group) return;
  const affectedRiders = (evt.riders || []).filter(r => r.categories && r.categories[groupId] === value);
  const msg = affectedRiders.length > 0 ? t('category.deleteOptionConfirmWithRiders', {count: affectedRiders.length}) : t('category.deleteOptionConfirm');
  if(!confirm(msg)) return;
  const optionIdx = group.options.indexOf(value);
  const affectedBibs = affectedRiders.map(r => r.bib);
  group.options = group.options.filter(o => o !== value);
  (evt.riders || []).forEach(r => {
    if(r.categories && r.categories[groupId] === value) delete r.categories[groupId];
  });
  renderRiders();
  logUndoableAction(evt, t('actionLog.categoryOptionDeleted', {value, group: group.name}), () => {
    if(!group.options.includes(value)) group.options.splice(Math.min(optionIdx, group.options.length), 0, value);
    affectedBibs.forEach(bib => {
      const r = (evt.riders || []).find(x => x.bib === bib);
      if(r){ r.categories = r.categories || {}; r.categories[groupId] = value; }
    });
    renderRiders();
  });
}
function onRiderCategoryChange(bib, groupId, value){
  const evt = state.currentEvent;
  const r = (evt.riders || []).find(r => r.bib === bib);
  if(!r) return;
  r.categories = r.categories || {};
  const previous = r.categories[groupId];
  if(previous === (value || undefined)) return;
  if(value) r.categories[groupId] = value;
  else delete r.categories[groupId];
  const group = (evt.categoryGroups || []).find(g => g.id === groupId);
  logUndoableAction(evt, t('actionLog.categoryChanged', {bib, group: (group && group.name) || ''}), () => {
    if(previous) r.categories[groupId] = previous;
    else delete r.categories[groupId];
    renderRiders();
  });
}
function exportCategoriesJSON(){
  const evt = state.currentEvent;
  if(!evt || !(evt.categoryGroups || []).length) return;
  const filename = (evt.name || 'event').replace(/\s+/g, '_').toLowerCase() + '-categories.json';
  downloadJSON(evt.categoryGroups, filename);
}
async function onImportCategoriesFile(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const evt = state.currentEvent;
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    if(!Array.isArray(parsed)) throw new Error('invalid shape');
    evt.categoryGroups = evt.categoryGroups || [];
    const existingNames = new Set(evt.categoryGroups.map(g => g.name));
    const overwrite = parsed.filter(g => g && existingNames.has(g.name)).length;
    if(!confirm(t('category.importPreview', {count: parsed.length, overwrite}))){ input.value = ''; return; }
    parsed.forEach(g => {
      if(!g || typeof g.name !== 'string') return;
      const idx = evt.categoryGroups.findIndex(existing => existing.name === g.name);
      const merged = withCategoryGroupDefaults({
        id: idx > -1 ? evt.categoryGroups[idx].id : uid('catgrp'),
        name: g.name,
        options: Array.isArray(g.options) ? g.options : [],
        sortOrder: idx > -1 ? evt.categoryGroups[idx].sortOrder : evt.categoryGroups.length
      });
      if(idx > -1) evt.categoryGroups[idx] = merged;
      else evt.categoryGroups.push(merged);
    });
    input.value = '';
    debouncedSave();
    renderRiders();
  }catch(e){
    alert(t('category.importFailed'));
    input.value = '';
  }
}
