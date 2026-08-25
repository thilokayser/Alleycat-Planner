/* ---------------- splashscreen (Hero-Startbildschirm) ---------------- */
function renderSplashscreenLangSwitch(){
  const current = getCurrentLanguage();
  const langs = availableLanguages();
  if(langs.length < 2) return '';
  return `
    <div class="splashscreen-lang-switch">
      ${langs.map(code => `
        <button type="button" class="splashscreen-lang-btn ${code === current ? 'active' : ''}" onclick="setLanguage('${code}')">${escapeHtml(code.toUpperCase())}</button>
      `).join('')}
    </div>
  `;
}
function renderSplashscreen(){
  return `
    <div class="splashscreen">
      ${renderSplashscreenLangSwitch()}
      <div class="splashscreen-card">
        <div class="splashscreen-brand-mark">AC</div>
        <h1 class="splashscreen-title">${t('splashscreen.title')}</h1>
        <p class="splashscreen-claim">${t('splashscreen.claim')}</p>
        <button type="button" class="btn btn-primary splashscreen-cta" onclick="dismissSplashscreen()">${t('splashscreen.cta')}</button>
      </div>
    </div>
  `;
}
function dismissSplashscreen(){
  state.view = 'dashboard';
  render();
  if(!state.appSettings.onboardingCompleted) startOnboardingTour(true);
}
