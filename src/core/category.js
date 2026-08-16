/* ---------------- categories ----------------
   Orthogonale Kategorie-Gruppen pro Event (z. B. Antrieb, Gender), unabhängig
   vom Solo/Team-System. evt.categoryGroups = [{id, name, options[], sortOrder}],
   rider.categories = {[groupId]: selectedOption}. Optionswerte sind Rohtext
   (auch aus Presets übernommen) — laufen NIE durch t(), da sie danach vom
   Nutzer umbenannt werden können wie jeder andere Eingabewert.             */
const CATEGORY_PRESETS = [
  {key: 'drivetrain', name: t('category.presetDrivetrainName'), options: [t('category.presetFixed'), t('category.presetFree')]},
  {key: 'gender', name: t('category.presetGenderName'), options: [t('category.presetOpen'), t('category.presetFlinta')]}
];
function withCategoryGroupDefaults(g){
  return Object.assign({id: uid('catgrp'), name: '', options: [], sortOrder: 0}, g);
}
function addCategoryPreset(presetKey){
  const preset = CATEGORY_PRESETS.find(p => p.key === presetKey);
  const evt = state.currentEvent;
  if(!preset || !evt) return;
  evt.categoryGroups = evt.categoryGroups || [];
  if(evt.categoryGroups.some(g => g.name === preset.name)) return;
  evt.categoryGroups.push(withCategoryGroupDefaults({name: preset.name, options: [...preset.options], sortOrder: evt.categoryGroups.length}));
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
  if(!confirm(t('category.deleteGroupConfirm'))) return;
  const evt = state.currentEvent;
  evt.categoryGroups = (evt.categoryGroups || []).filter(g => g.id !== id);
  (evt.riders || []).forEach(r => { if(r.categories) delete r.categories[id]; });
  debouncedSave();
  renderRiders();
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
  const affected = (evt.riders || []).filter(r => r.categories && r.categories[groupId] === value).length;
  const msg = affected > 0 ? t('category.deleteOptionConfirmWithRiders', {count: affected}) : t('category.deleteOptionConfirm');
  if(!confirm(msg)) return;
  group.options = group.options.filter(o => o !== value);
  (evt.riders || []).forEach(r => {
    if(r.categories && r.categories[groupId] === value) delete r.categories[groupId];
  });
  debouncedSave();
  renderRiders();
}
function onRiderCategoryChange(bib, groupId, value){
  const r = (state.currentEvent.riders || []).find(r => r.bib === bib);
  if(!r) return;
  r.categories = r.categories || {};
  if(value) r.categories[groupId] = value;
  else delete r.categories[groupId];
  debouncedSave();
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
