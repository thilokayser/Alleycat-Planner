/* ---------------- documentation (Hilfe-Seite unter Einstellungen) ---------------- */
const DOC_TOPICS = [
  {id: 'gettingStarted', icon: '📖', titleKey: 'docs.gettingStartedTitle', bodyKey: 'docs.gettingStartedBody'},
  {id: 'checkpoints', icon: '🗺️', titleKey: 'docs.checkpointsTitle', bodyKey: 'docs.checkpointsBody'},
  {id: 'zonesGameModes', icon: '🎯', titleKey: 'docs.zonesGameModesTitle', bodyKey: 'docs.zonesGameModesBody'},
  {id: 'riders', icon: '👥', titleKey: 'docs.ridersTitle', bodyKey: 'docs.ridersBody'},
  {id: 'checkin', icon: '✅', titleKey: 'docs.checkinTitle', bodyKey: 'docs.checkinBody'},
  {id: 'leaderboard', icon: '🏆', titleKey: 'docs.leaderboardTitle', bodyKey: 'docs.leaderboardBody'},
  {id: 'manifestExport', icon: '📄', titleKey: 'docs.manifestExportTitle', bodyKey: 'docs.manifestExportBody'},
  {id: 'pdfBuilder', icon: '🧱', titleKey: 'docs.pdfBuilderTitle', bodyKey: 'docs.pdfBuilderBody'},
  {id: 'beamer', icon: '📺', titleKey: 'docs.beamerTitle', bodyKey: 'docs.beamerBody'},
  {id: 'offline', icon: '📡', titleKey: 'docs.offlineTitle', bodyKey: 'docs.offlineBody'},
  {id: 'delivery', icon: '📦', titleKey: 'docs.deliveryTitle', bodyKey: 'docs.deliveryBody'},
  {id: 'riderApp', icon: '📱', titleKey: 'docs.riderAppTitle', bodyKey: 'docs.riderAppBody'},
  {id: 'inviteCodes', icon: '🎟️', titleKey: 'docs.inviteCodesTitle', bodyKey: 'docs.inviteCodesBody'}
];

function filteredDocTopics(){
  const q = (state.docSearch || '').trim().toLowerCase();
  if(!q) return DOC_TOPICS;
  return DOC_TOPICS.filter(topic => t(topic.titleKey).toLowerCase().includes(q) || t(topic.bodyKey).toLowerCase().includes(q));
}
function onDocSearchInput(value){
  state.docSearch = value;
  renderSettings();
}
function renderDocTopic(topic){
  const paragraphs = t(topic.bodyKey).split('\n\n').map(p => `<p>${escapeHtml(p)}</p>`).join('');
  return `
    <div class="doc-topic" id="doc-${topic.id}">
      <h4>${topic.icon} ${escapeHtml(t(topic.titleKey))}</h4>
      ${paragraphs}
    </div>
  `;
}
function renderDocumentationSection(){
  const topics = filteredDocTopics();
  return `
    <div class="settings-section documentation-section">
      <h3>${t('docs.heading')}</h3>
      <div class="settings-section-desc">${t('docs.desc')}</div>
      <input type="text" class="feature-registry-search" placeholder="${t('docs.searchPlaceholder')}" value="${escapeHtml(state.docSearch || '')}" oninput="onDocSearchInput(this.value)">
      ${!topics.length ? `<div class="riders-hint">${t('docs.noMatches')}</div>` : ''}
      <div class="doc-topic-list">${topics.map(renderDocTopic).join('')}</div>
    </div>
  `;
}
