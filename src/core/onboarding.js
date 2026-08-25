/* ---------------- onboarding (geführte Tour) ---------------- */
const ONBOARDING_STEPS = [
  {view: 'dashboard',    selector: '.event-card',           titleKey: 'onboarding.step1Title', textKey: 'onboarding.step1Text'},
  {view: 'editor',       selector: '.cp-list',               titleKey: 'onboarding.step2Title', textKey: 'onboarding.step2Text'},
  {view: 'riders',       selector: '.rider-grid',            titleKey: 'onboarding.step3Title', textKey: 'onboarding.step3Text'},
  {view: 'checkin',      selector: '#checkin-bib-input',     titleKey: 'onboarding.step4Title', textKey: 'onboarding.step4Text'},
  {view: 'leaderboard',  selector: '.leaderboard-table',     titleKey: 'onboarding.step5Title', textKey: 'onboarding.step5Text'},
  {view: 'manifest',     selector: '#manifest-content',      titleKey: 'onboarding.step6Title', textKey: 'onboarding.step6Text'}
];
const ONBOARDING_DEMO_EVENT_NAME = 'Kölner Kurierrennen (Beispiel)';

function findOnboardingTargetEvent(){
  if(!state.eventsIndex.length) return null;
  return state.eventsIndex.find(e => e.name === ONBOARDING_DEMO_EVENT_NAME) || state.eventsIndex[0];
}

function startOnboardingTour(silent){
  const target = findOnboardingTargetEvent();
  if(!target){
    if(!silent) showToast({message: t('onboarding.noEventToast')});
    return;
  }
  state.onboarding = {active: true, stepIndex: 0, eventId: target.id};
  window.removeEventListener('resize', repositionOnboardingOverlay);
  window.addEventListener('resize', repositionOnboardingOverlay);
  goToTourStep(0);
}

function goToTourStep(index){
  if(index < 0 || index >= ONBOARDING_STEPS.length) return;
  const step = ONBOARDING_STEPS[index];
  state.onboarding.stepIndex = index;
  if(state.view !== step.view){
    if(step.view === 'dashboard') goDashboard();
    else if(step.view === 'editor') openEditor(state.onboarding.eventId);
    else if(step.view === 'riders') openRiders();
    else if(step.view === 'checkin') openCheckin();
    else if(step.view === 'leaderboard') openLeaderboard();
    else if(step.view === 'manifest') openManifest();
  }
  setTimeout(() => {
    if(!state.onboarding.active || state.view !== step.view) return;
    renderOnboardingOverlay();
  }, 50);
}

function advanceOnboardingStep(){
  goToTourStep(state.onboarding.stepIndex + 1);
}
function retreatOnboardingStep(){
  goToTourStep(state.onboarding.stepIndex - 1);
}

function finishOnboardingTour(){
  endOnboardingTour();
}
function skipOnboardingTour(){
  endOnboardingTour();
}
function endOnboardingTour(){
  state.onboarding.active = false;
  state.appSettings.onboardingCompleted = true;
  saveAppSettings();
  window.removeEventListener('resize', repositionOnboardingOverlay);
  const root = document.getElementById('onboarding-root');
  if(root){ root.style.display = 'none'; root.innerHTML = ''; }
}

function retryFindOnboardingTarget(selector, attempt){
  const el = document.querySelector(selector);
  if(el || attempt >= 5){ renderOnboardingOverlayFor(el); return; }
  setTimeout(() => {
    if(!state.onboarding.active) return;
    retryFindOnboardingTarget(selector, attempt + 1);
  }, 100);
}

function renderOnboardingOverlay(){
  const step = ONBOARDING_STEPS[state.onboarding.stepIndex];
  const el = document.querySelector(step.selector);
  if(el) renderOnboardingOverlayFor(el);
  else retryFindOnboardingTarget(step.selector, 0);
}

function repositionOnboardingOverlay(){
  if(!state.onboarding || !state.onboarding.active) return;
  renderOnboardingOverlay();
}

function renderOnboardingOverlayFor(targetEl){
  const root = document.getElementById('onboarding-root');
  if(!root) return;
  const step = ONBOARDING_STEPS[state.onboarding.stepIndex];
  const stepNum = state.onboarding.stepIndex + 1;
  const isLast = stepNum === ONBOARDING_STEPS.length;

  let spotlightStyle = 'display:none;';
  let tooltipStyle = 'top:50%; left:50%; transform:translate(-50%,-50%);';

  if(targetEl){
    targetEl.scrollIntoView({block: 'center', behavior: 'auto'});
    const rect = targetEl.getBoundingClientRect();
    const pad = 8;
    const top = Math.max(rect.top - pad, 0);
    const left = Math.max(rect.left - pad, 0);
    const width = rect.width + pad * 2;
    const height = rect.height + pad * 2;
    spotlightStyle = `top:${top}px; left:${left}px; width:${width}px; height:${height}px;`;

    const tooltipWidth = 320;
    const tooltipEstHeight = 180;
    let tooltipTop = top + height + 16;
    if(tooltipTop + tooltipEstHeight > window.innerHeight){
      tooltipTop = Math.max(top - tooltipEstHeight - 16, 16);
    }
    let tooltipLeft = left + width / 2 - tooltipWidth / 2;
    tooltipLeft = Math.min(Math.max(tooltipLeft, 16), window.innerWidth - tooltipWidth - 16);
    tooltipStyle = `top:${tooltipTop}px; left:${tooltipLeft}px;`;
  }

  root.style.display = 'block';
  root.innerHTML = `
    <div class="onboarding-backdrop"></div>
    <div class="onboarding-spotlight" style="${spotlightStyle}"></div>
    <div class="onboarding-tooltip" style="${tooltipStyle}">
      <div class="onboarding-tooltip-step">${t('onboarding.stepCounter', {current: stepNum, total: ONBOARDING_STEPS.length})}</div>
      <h3>${t(step.titleKey)}</h3>
      <p>${t(step.textKey)}</p>
      <div class="onboarding-tooltip-actions">
        <button type="button" class="btn btn-sm" onclick="skipOnboardingTour()">${t('onboarding.skip')}</button>
        <div style="flex:1;"></div>
        ${stepNum > 1 ? `<button type="button" class="btn btn-sm" onclick="retreatOnboardingStep()">${t('onboarding.back')}</button>` : ''}
        <button type="button" class="btn btn-sm btn-primary" onclick="${isLast ? 'finishOnboardingTour()' : 'advanceOnboardingStep()'}">${isLast ? t('onboarding.finish') : t('onboarding.next')}</button>
      </div>
    </div>
  `;
}
