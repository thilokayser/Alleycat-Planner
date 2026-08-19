/* ---------------- command palette ----------------
   Global Cmd/Ctrl+K overlay: fuzzy search across navigation, riders,
   checkpoints and a handful of quick actions. No external fuzzy-match
   library — a small substring/subsequence scorer is enough at this
   app's data scale (dozens, not thousands, of riders/checkpoints).
   Rendered into #command-palette-root, a template sibling of #app
   (same pattern as #error-boundary-root/#beamer-root), so it overlays
   regardless of the currently active view. */
function commandPaletteFuzzyScore(text, query){
  const hay = (text || '').toLowerCase();
  const q = (query || '').toLowerCase().trim();
  if(!q) return 0;
  const idx = hay.indexOf(q);
  if(idx !== -1) return 1000 - idx;
  let hi = 0;
  for(let qi = 0; qi < q.length; qi++){
    hi = hay.indexOf(q[qi], hi);
    if(hi === -1) return -1;
    hi++;
  }
  return 1;
}
function buildCommandPaletteItems(){
  const items = [];
  const evt = state.currentEvent;
  const navCat = t('commandPalette.catNav');
  items.push({category: navCat, icon: '⌂', label: t('ui.headquarter'), run: () => goDashboard()});
  items.push({category: navCat, icon: '⚙', label: t('settings.title'), run: () => openSettings()});
  if(evt){
    items.push({category: navCat, icon: '▦', label: t('ui.navOverview'), run: () => openOverview()});
    items.push({category: navCat, icon: '📍', label: t('ui.navMap'), run: () => openEditor(evt.id)});
    items.push({category: navCat, icon: '👤', label: t('ui.navRiders'), run: () => openRiders()});
    items.push({category: navCat, icon: '🏁', label: t('ui.navCheckin'), run: () => openCheckin()});
    items.push({category: navCat, icon: '🏆', label: t('ui.navLeaderboard'), run: () => openLeaderboard()});
    items.push({category: navCat, icon: '📄', label: t('ui.navManifest'), run: () => openManifest()});

    const riderCat = t('commandPalette.catRiders');
    (evt.riders || []).filter(r => r.name).forEach(r => {
      const team = getTeam(evt, r.teamId);
      items.push({
        category: riderCat,
        icon: '👤',
        label: `#${r.bib} ${r.name}`,
        sublabel: team ? team.name : '',
        searchText: `${r.bib} ${r.name} ${team ? team.name : ''}`,
        run: () => openRiders()
      });
    });

    const cpCat = t('commandPalette.catCheckpoints');
    evt.checkpoints.forEach(cp => {
      items.push({
        category: cpCat,
        icon: '📍',
        label: cp.name || t('checkpoint.noName'),
        sublabel: typeLabel(cp.type),
        searchText: `${cp.name || ''} ${typeLabel(cp.type)} ${cp.clue || ''}`,
        run: async () => {
          if(state.view !== 'editor') await openEditor(evt.id);
          setTimeout(() => selectCp(cp.id), 60);
        }
      });
    });

    const actionCat = t('commandPalette.catActions');
    if(evt.status === 'ready'){
      items.push({category: actionCat, icon: '🏁', label: t('commandPalette.actionStartRace'), run: () => onStatusSelectChange('running')});
    }
    items.push({category: actionCat, icon: '💾', label: t('commandPalette.actionBackupNow'), run: () => triggerBackupNow(false)});
  }
  const actionCat = t('commandPalette.catActions');
  Object.entries(THEMES).forEach(([key, th]) => {
    if(state.appSettings.theme === key) return;
    items.push({category: actionCat, icon: '🎨', label: t('commandPalette.actionSwitchTheme', {name: th.label()}), run: () => setTheme(key)});
  });
  return items;
}
function filteredCommandPaletteItems(){
  const items = buildCommandPaletteItems();
  const q = state.commandPaletteQuery.trim();
  if(!q) return items.slice(0, 40);
  return items
    .map(item => ({item, score: Math.max(
      commandPaletteFuzzyScore(item.label, q),
      commandPaletteFuzzyScore(item.sublabel || '', q),
      commandPaletteFuzzyScore(item.searchText || '', q)
    )}))
    .filter(x => x.score > -1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map(x => x.item);
}
function openCommandPalette(){
  state.commandPaletteOpen = true;
  state.commandPaletteQuery = '';
  state.commandPaletteActiveIndex = 0;
  renderCommandPalette();
  setTimeout(() => {
    const input = document.getElementById('command-palette-input');
    if(input) input.focus();
  }, 0);
}
function closeCommandPalette(){
  state.commandPaletteOpen = false;
  renderCommandPalette();
}
function toggleCommandPalette(){
  if(state.commandPaletteOpen) closeCommandPalette(); else openCommandPalette();
}
function onCommandPaletteInput(value){
  state.commandPaletteQuery = value;
  state.commandPaletteActiveIndex = 0;
  renderCommandPaletteList();
}
function runCommandPaletteItem(index){
  const items = filteredCommandPaletteItems();
  const item = items[index];
  if(!item) return;
  closeCommandPalette();
  item.run();
}
function onCommandPaletteKeydown(e){
  const items = filteredCommandPaletteItems();
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    state.commandPaletteActiveIndex = Math.min(items.length - 1, state.commandPaletteActiveIndex + 1);
    renderCommandPaletteList();
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    state.commandPaletteActiveIndex = Math.max(0, state.commandPaletteActiveIndex - 1);
    renderCommandPaletteList();
  } else if(e.key === 'Enter'){
    e.preventDefault();
    runCommandPaletteItem(state.commandPaletteActiveIndex);
  }
}
function renderCommandPaletteList(){
  const listEl = document.getElementById('command-palette-list');
  if(!listEl) return;
  const items = filteredCommandPaletteItems();
  if(state.commandPaletteActiveIndex >= items.length) state.commandPaletteActiveIndex = Math.max(0, items.length - 1);
  let lastCategory = null;
  listEl.innerHTML = items.length ? items.map((item, i) => {
    const heading = item.category !== lastCategory ? `<div class="cmdp-category">${escapeHtml(item.category)}</div>` : '';
    lastCategory = item.category;
    return `
      ${heading}
      <button type="button" class="cmdp-item ${i === state.commandPaletteActiveIndex ? 'active' : ''}" onmouseenter="state.commandPaletteActiveIndex=${i}; renderCommandPaletteList();" onclick="runCommandPaletteItem(${i})">
        <span class="cmdp-item-icon">${item.icon || ''}</span>
        <span class="cmdp-item-text">
          <span class="cmdp-item-label">${escapeHtml(item.label)}</span>
          ${item.sublabel ? `<span class="cmdp-item-sublabel">${escapeHtml(item.sublabel)}</span>` : ''}
        </span>
      </button>
    `;
  }).join('') : `<div class="cmdp-empty">${t('commandPalette.noResults')}</div>`;
}
function renderCommandPalette(){
  const root = document.getElementById('command-palette-root');
  if(!root) return;
  if(!state.commandPaletteOpen){ root.innerHTML = ''; return; }
  root.innerHTML = `
    <div class="cmdp-overlay" onclick="closeCommandPalette()">
      <div class="cmdp-box" onclick="event.stopPropagation()">
        <input type="text" id="command-palette-input" class="cmdp-input" placeholder="${t('commandPalette.placeholder')}"
          value="${escapeHtml(state.commandPaletteQuery)}" oninput="onCommandPaletteInput(this.value)" onkeydown="onCommandPaletteKeydown(event)">
        <div class="cmdp-list" id="command-palette-list"></div>
      </div>
    </div>
  `;
  renderCommandPaletteList();
}
