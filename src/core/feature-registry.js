/* ---------------- feature registry ---------------- */
/* Zentrale Übersicht schaltbarer Features (Settings-Hub, Obsidian-Community-Plugins-Stil).
   scope:'device' -> gespeichert in state.appSettings.featureToggles (per-Browser via app:settings,
   gleiches Speicherprinzip wie appSettings.theme/iconPack). scope:'event' -> gespeichert in
   evt.featureFlags, rein additive Sichtbarkeits-Flags, rühren NICHT an den bestehenden
   Datenmodellen (evt.categoryGroups/evt.gameModes bleiben unangetastet, ein deaktiviertes
   Feature blendet nur dessen UI aus). battle_royale/districts folgen erst mit dem Zonen-System
   (Paket 4) und sind hier bewusst noch nicht eingetragen. */
const FEATURE_REGISTRY = [
  {id: 'social_share_cards', scope: 'device', icon: '🎉', name: () => t('featureRegistry.socialShareName'), description: () => t('featureRegistry.socialShareDesc'), defaultEnabled: true, configScreen: null},
  {id: 'sound_hook', scope: 'device', icon: '🔊', name: () => t('featureRegistry.soundHookName'), description: () => t('featureRegistry.soundHookDesc'), defaultEnabled: true, configScreen: 'sound-settings'},
  {id: 'offline_map_cache', scope: 'device', icon: '🗺', name: () => t('featureRegistry.offlineCacheName'), description: () => t('featureRegistry.offlineCacheDesc'), defaultEnabled: false, configScreen: 'offline-settings'},
  {id: 'categories', scope: 'event', icon: '🎫', name: () => t('featureRegistry.categoriesName'), description: () => t('featureRegistry.categoriesDesc'), defaultEnabled: true, configScreen: 'category-settings'},
  {id: 'game_modes', scope: 'event', icon: '🏆', name: () => t('featureRegistry.gameModesName'), description: () => t('featureRegistry.gameModesDesc'), defaultEnabled: true, configScreen: 'game-modes-settings'}
];
function featureRegistryEntry(id){
  return FEATURE_REGISTRY.find(f => f.id === id);
}
function isFeatureEnabled(id, evt){
  const entry = featureRegistryEntry(id);
  if(!entry) return true;
  if(entry.scope === 'device'){
    const toggles = state.appSettings.featureToggles || {};
    return toggles[id] !== undefined ? toggles[id] : entry.defaultEnabled;
  }
  const flags = (evt || state.currentEvent) ? (evt || state.currentEvent).featureFlags || {} : {};
  return flags[id] !== undefined ? flags[id] : entry.defaultEnabled;
}
function toggleFeature(id){
  const entry = featureRegistryEntry(id);
  if(!entry) return;
  const next = !isFeatureEnabled(id);
  if(entry.scope === 'device'){
    if(!state.appSettings.featureToggles) state.appSettings.featureToggles = {};
    state.appSettings.featureToggles[id] = next;
    saveAppSettings();
  } else {
    if(!state.currentEvent) return;
    state.currentEvent.featureFlags = state.currentEvent.featureFlags || {};
    state.currentEvent.featureFlags[id] = next;
    debouncedSave();
  }
  render();
}
function jumpToFeatureConfig(screen){
  if(!screen) return;
  const targets = {
    'sound-settings': {open: () => openOverview(), anchor: 'overview-beamer-section'},
    'offline-settings': {open: () => openSettings(), anchor: 'offline-readiness-section'},
    'category-settings': {open: () => { openRiders(); state.categoriesPanelOpen = true; }, anchor: 'rider-categories-section'},
    'game-modes-settings': {open: () => { openOverview(); state.gameModesSectionOpen = true; }, anchor: 'overview-gamemodes-section'}
  };
  const target = targets[screen];
  if(!target) return;
  target.open();
  render();
  setTimeout(() => {
    const el = document.getElementById(target.anchor);
    if(el) el.scrollIntoView({behavior: 'smooth', block: 'start'});
  }, 30);
}
function featureRegistryGroups(evt){
  const q = (state.featureRegistrySearch || '').trim().toLowerCase();
  const matches = (entry) => !q || entry.name().toLowerCase().includes(q) || entry.description().toLowerCase().includes(q);
  return {
    device: FEATURE_REGISTRY.filter(f => f.scope === 'device' && matches(f)),
    event: FEATURE_REGISTRY.filter(f => f.scope === 'event' && matches(f))
  };
}
function onFeatureRegistrySearchInput(value){
  state.featureRegistrySearch = value;
  renderSettings();
}
function renderFeatureRegistryRow(entry, evt){
  const enabled = isFeatureEnabled(entry.id, evt);
  return `
    <div class="feature-row">
      <span class="feature-row-icon">${entry.icon}</span>
      <div class="feature-row-info">
        <div class="feature-row-name">${escapeHtml(entry.name())}</div>
        <div class="feature-row-desc">${escapeHtml(entry.description())}</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleFeature('${entry.id}')">
        <span class="toggle-switch-track"></span>
      </label>
      ${entry.configScreen ? `<button type="button" class="btn btn-sm feature-row-gear" title="${t('featureRegistry.configureTitle')}" onclick="jumpToFeatureConfig('${entry.configScreen}')">⚙</button>` : ''}
    </div>
  `;
}
function renderFeatureRegistrySection(){
  const evt = state.currentEvent;
  const groups = featureRegistryGroups(evt);
  const deviceRows = groups.device.map(f => renderFeatureRegistryRow(f, evt)).join('');
  const eventRows = evt ? groups.event.map(f => renderFeatureRegistryRow(f, evt)).join('') : '';
  const nothingFound = !groups.device.length && !groups.event.length;
  return `
    <div class="settings-section feature-registry-section">
      <h3>${t('featureRegistry.heading')}</h3>
      <div class="settings-section-desc">${t('featureRegistry.desc')}</div>
      <input type="text" class="feature-registry-search" placeholder="${t('featureRegistry.searchPlaceholder')}" value="${escapeHtml(state.featureRegistrySearch || '')}" oninput="onFeatureRegistrySearchInput(this.value)">
      ${nothingFound ? `<div class="riders-hint">${t('featureRegistry.noMatches')}</div>` : ''}
      ${groups.device.length ? `
        <div class="feature-group-heading">${t('featureRegistry.groupDevice')}</div>
        <div class="feature-row-list">${deviceRows}</div>
      ` : ''}
      ${evt && groups.event.length ? `
        <div class="feature-group-heading">${t('featureRegistry.groupEvent', {name: evt.name || t('common.unnamedEvent')})}</div>
        <div class="feature-row-list">${eventRows}</div>
      ` : ''}
    </div>
  `;
}
