/* ---------------- Fahrer-App: Ansichten ----------------
   Eine renderRider()-Weiche über riderState.view, gleiches Muster wie
   render() im Organizer.

   Alles, was vom Server kommt, läuft durch escapeHtml(): Eventname und
   Checkpoint-Namen sind Eingaben des Organizers, keine Oberfläche. Die
   Startnummer ist eine Zahl und wird als solche behandelt.             */

function renderRider(){
  const el = document.getElementById('rider-app');
  switch(riderState.view){
    case 'login':    el.innerHTML = riderViewLogin(); break;
    case 'code':     el.innerHTML = riderViewCode(); break;
    case 'register': el.innerHTML = riderViewRegister(); break;
    case 'pending':  el.innerHTML = riderViewPending(); break;
    case 'home':     el.innerHTML = riderViewHome(); break;
    case 'scanner':  el.innerHTML = riderViewScanner(); break;
    case 'confirm':  el.innerHTML = riderViewConfirm(); break;
    case 'error':    el.innerHTML = riderViewError(); break;
    case 'checkpointCode': el.innerHTML = riderViewCheckpointCode(); break;
    case 'selfRegisterList': el.innerHTML = riderViewSelfRegisterList(); break;
    case 'selfRegisterForm': el.innerHTML = riderViewSelfRegisterForm(); break;
    case 'accountLogin':    el.innerHTML = riderViewAccountLogin(); break;
    case 'accountRegister': el.innerHTML = riderViewAccountRegister(); break;
    case 'accountForgot':   el.innerHTML = riderViewAccountForgot(); break;
    case 'accountReset':    el.innerHTML = riderViewAccountReset(); break;
    case 'profile':         el.innerHTML = riderViewProfile(); break;
    default:         el.innerHTML = riderViewLoading();
  }
}

function riderViewLoading(){
  return `<div class="rider-body"><div class="rider-lead">${t('riderScan.loading')}</div></div>`;
}

/* Kopfzeile mit der eigenen Startnummer. Groß, weil sie am Checkpoint
   vorgezeigt wird — der Fahrer soll das Handy hinhalten können, ohne zu
   zoomen. */
function riderHead(){
  const bib = riderState.session && riderState.session.bib;
  const evt = riderState.event;
  return `
    <div class="rider-head">
      <div class="rider-head-bib">#${bib != null ? Number(bib) : '—'}</div>
      <div class="rider-head-meta">
        <div class="rider-head-event">${escapeHtml(evt ? evt.name : t('riderScan.appTitle'))}</div>
        <div class="rider-head-status">${riderHeadStatusText()}</div>
      </div>
    </div>
  `;
}
function riderHeadStatusText(){
  const total = riderState.checkpoints.length;
  if(!total) return '';
  const done = riderState.checkpoints.filter(cp => riderState.progress[cp.cpId]).length;
  return escapeHtml(t('riderScan.homeOpenCheckpoints', {done, total}));
}

function riderViewLogin(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.loginTitle')}</div>
      <div class="rider-lead">${t('riderScan.loginLead')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderStartLoginScan()">${t('riderScan.loginScanButton')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoCode()">${t('riderScan.loginCodeButton')}</button>
    </div>
  `;
}

function riderViewCode(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.codeTitle')}</div>
      <div class="rider-lead">${t('riderScan.codeLead')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field">
        <label for="rider-code-input">${t('riderScan.codeLabel')}</label>
        <input type="text" id="rider-code-input" class="code" inputmode="latin"
               autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="8">
      </div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderSubmitCode()">${t('riderScan.codeSubmit')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoLogin()">${t('riderScan.codeBackToScan')}</button>
    </div>
  `;
}

function riderViewRegister(){
  const bib = riderState.session ? Number(riderState.session.bib) : '';
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${escapeHtml(t('riderScan.registerTitle', {bib}))}</div>
      <div class="rider-lead">${t('riderScan.registerLead')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field">
        <label for="rider-reg-name">${t('riderScan.registerName')}</label>
        <input type="text" id="rider-reg-name" autocomplete="name">
      </div>
      <div class="rider-field">
        <label for="rider-reg-contact">${t('riderScan.registerContact')}</label>
        <input type="text" id="rider-reg-contact" autocomplete="email">
      </div>
      <div class="rider-field">
        <label for="rider-reg-emergency">${t('riderScan.registerEmergency')}</label>
        <input type="text" id="rider-reg-emergency" autocomplete="tel">
      </div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" ${riderState.busy ? 'disabled' : ''} onclick="riderSubmitRegistration()">${t('riderScan.registerSubmit')}</button>
    </div>
  `;
}

/* Einstieg über #g.<publicId> (Teilprojekt 3) — kein Scan, keine Session,
   der Besucher kommt kalt von einem geteilten Link herein. riderHead()
   zeigt hier "#—" und den generischen App-Titel statt eines Eventnamens
   (den liefert ?a=freebibs bewusst nicht mit, siehe Design-Doku §5) —
   gleiches Verhalten wie riderViewLogin() vor jeder Session. */
function riderViewSelfRegisterList(){
  const bibs = riderState.selfRegisterFreeBibs || [];
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.selfRegisterListTitle')}</div>
      <div class="rider-lead">${t('riderScan.selfRegisterListLead')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      ${bibs.length ? `
        <div class="rider-bib-grid">
          ${bibs.map(bib => `<button type="button" class="rider-bib-chip" onclick="riderPickSelfRegisterBib(${bib})">#${bib}</button>`).join('')}
        </div>
      ` : `<div class="rider-note rider-note-info">${t('riderScan.selfRegisterNoneFree')}</div>`}
    </div>
  `;
}

function riderViewSelfRegisterForm(){
  const bib = riderState.selfRegisterBib;
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${escapeHtml(t('riderScan.registerTitle', {bib}))}</div>
      <div class="rider-lead">${t('riderScan.selfRegisterFormLead')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field">
        <label for="rider-reg-name">${t('riderScan.registerName')}</label>
        <input type="text" id="rider-reg-name" autocomplete="name">
      </div>
      <div class="rider-field">
        <label for="rider-reg-contact">${t('riderScan.registerContact')}</label>
        <input type="text" id="rider-reg-contact" autocomplete="email">
      </div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" ${riderState.busy ? 'disabled' : ''} onclick="riderSubmitClaim()">${t('riderScan.registerSubmit')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoSelfRegisterList()">${t('riderScan.selfRegisterBackToList')}</button>
    </div>
  `;
}

function riderViewPending(){
  const bib = riderState.session ? Number(riderState.session.bib) : '';
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.pendingTitle')}</div>
      <div class="rider-lead">${t('riderScan.pendingLead')}</div>
      <div class="rider-note rider-note-info">${escapeHtml(t('riderScan.pendingBib', {bib}))}</div>
    </div>
  `;
}

/* Typ-Auflösung: der Server liefert nur den Schlüssel, die Beschriftung
   holt sich die App aus ihrer eigenen Typtabelle — sonst wäre sie in der
   Sprache des Organizers festgenagelt.

   Der Sonderfall: eigene Typen des Organizers stehen nicht in der
   Typtabelle des Fahrer-Bundles. getCheckpointType() fiele dort auf den
   ersten Typ zurück und behauptete "QR-Code-Scan", was schlicht falsch
   wäre. Deshalb wird der Rückfall erkannt und ein neutraler Hinweis
   gezeigt: der Fahrer hat das Papiermanifest, dort steht es richtig. */
function riderResolveType(cpType){
  const found = getCheckpointType(cpType);
  const known = cpType && found.key === cpType;
  return known
    ? {icon: found.icon, label: found.fullLabel, known: true}
    : {icon: '📍', label: t('riderScan.homeHintUnknownType'), known: false};
}

function riderViewHome(){
  const cps = riderState.checkpoints;
  const queued = typeof riderQueueLength === 'function' ? riderQueueLength() : 0;

  const rows = cps.map(cp => {
    const at = riderState.progress[cp.cpId];
    const type = riderResolveType(cp.cpType);
    const done = !!at;
    const cls = done ? 'done' : (cp.qrEnabled ? 'scannable' : 'marshal');
    const hint = done ? type.label
      : (cp.qrEnabled ? t('riderScan.homeHintScannable')
                      : (type.known ? t('riderScan.homeHintMarshal') : type.label));
    return `
      <div class="rider-cp ${cls}">
        <div class="rider-cp-icon">${done ? '✅' : type.icon}</div>
        <div class="rider-cp-main">
          <div class="rider-cp-name">${escapeHtml(cp.label || cp.cpId)}</div>
          <div class="rider-cp-hint">${escapeHtml(hint)}</div>
        </div>
        ${done ? `<div class="rider-cp-time">${escapeHtml(riderShortTime(at))}</div>` : ''}
      </div>
    `;
  }).join('');

  const showProgress = riderState.settings.progress !== false;

  return `
    ${riderHead()}
    <div class="rider-body">
      ${riderState.offlineSince ? `<div class="rider-note rider-note-warn">${escapeHtml(t('riderScan.homeOfflineBanner', {time: riderShortTime(riderState.offlineSince)}))}</div>` : ''}
      ${riderState.notice ? `<div class="rider-note rider-note-ok">${escapeHtml(riderState.notice)}</div>` : ''}
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      ${queued ? `<div class="rider-note rider-note-warn"><span class="rider-queue-badge">⏳ ${escapeHtml(queued === 1 ? t('riderScan.homeQueueWaiting', {count: queued}) : t('riderScan.homeQueueWaitingPlural', {count: queued}))}</span></div>` : ''}
      ${showProgress ? `<div class="rider-cp-list">${rows}</div>` : ''}
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderStartCheckpointScan()">${t('riderScan.homeScanButton')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderStartClaim()">${riderState.account ? t('riderScan.claimButton') : t('riderScan.claimButtonLoggedOut')}</button>
      ${riderState.account ? `<button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoProfile()">${t('riderScan.profileLink')}</button>` : ''}
    </div>
  `;
}

function riderViewScanner(){
  return `
    <div class="rider-scanner">
      <video id="rider-scan-video" autoplay playsinline muted></video>
      <div class="rider-scanner-frame"></div>
      <div class="rider-scanner-hint">${t('riderScan.scanHint')}</div>
      <button type="button" class="rider-btn rider-btn-ghost rider-scanner-close" onclick="stopRiderScan()">${t('riderScan.scanCancel')}</button>
    </div>
  `;
}

function riderViewConfirm(){
  const c = riderState.confirm || {};
  return `
    ${riderHead()}
    <div class="rider-confirm">
      <div class="rider-confirm-mark">${c.already ? '↩️' : '✅'}</div>
      <div class="rider-confirm-name">${escapeHtml(c.label || '')}</div>
      <div class="rider-confirm-time">${escapeHtml(c.already ? t('riderScan.confirmAlready') + ' · ' + riderShortTime(c.at) : riderShortTime(c.at))}</div>
      ${c.queued ? `<div class="rider-note rider-note-info" style="margin-top:14px;">${t('riderScan.confirmQueued')}</div>` : ''}
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderGoHome()">${t('riderScan.confirmBack')}</button>
    </div>
  `;
}

function riderViewError(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-note rider-note-error">${escapeHtml(riderState.error || t('riderScan.errGeneric'))}</div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderRecoverFromError()">${t('riderScan.errRetry')}</button>
      ${riderState.errorManualView === 'checkpointCode' ? `<button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoCheckpointCode()">${t('riderScan.cpCodeButton')}</button>` : ''}
    </div>
  `;
}

function riderViewCheckpointCode(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.cpCodeTitle')}</div>
      <div class="rider-lead">${t('riderScan.cpCodeLead')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field">
        <label for="rider-cp-code-cpid">${t('riderScan.cpCodeCpIdLabel')}</label>
        <input type="text" id="rider-cp-code-cpid" class="mono" autocapitalize="none" autocomplete="off" spellcheck="false">
      </div>
      <div class="rider-field">
        <label for="rider-cp-code-token">${t('riderScan.cpCodeTokenLabel')}</label>
        <input type="text" id="rider-cp-code-token" class="code" autocapitalize="none" autocomplete="off" spellcheck="false">
      </div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderSubmitCheckpointCode()">${t('riderScan.cpCodeSubmit')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoHome()">${t('riderScan.cpCodeCancel')}</button>
    </div>
  `;
}

/* ---------------- Fahrer-Konten: Login/Register/Reset/Profil ----------------
   Eigenes riderState.accountForm hält Email/Anzeigename über einen
   fehlgeschlagenen Absende-Versuch hinweg am Leben (renderRider() ersetzt
   das gesamte innerHTML und würde sonst getippte Werte löschen) — das
   Passwort selbst wandert NIE in riderState, siehe riderSubmitAccountLogin()/
   riderSubmitAccountRegister() in init.js.

   riderState.notice ist der minimale Ersatz für eine Toast-Funktion: die
   Fahrer-App kennt (anders als der Organizer mit showToast()) noch keine
   eigene, also ein neues Feld analog zu riderState.error, hier grün statt
   rot gerendert (rider-note-ok, in rider.css bereits vorhanden). */
function riderViewAccountLogin(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.acctLoginTitle')}</div>
      ${riderState.notice ? `<div class="rider-note rider-note-ok">${escapeHtml(riderState.notice)}</div>` : ''}
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field"><label>${t('riderScan.acctEmailLabel')}</label>
        <input type="email" id="rider-acct-email" value="${escapeHtml(riderState.accountForm.email)}"></div>
      <div class="rider-field"><label>${t('riderScan.acctPasswordLabel')}</label>
        <input type="password" id="rider-acct-password"></div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderSubmitAccountLogin()">${t('riderScan.acctLoginSubmit')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoAccountRegister()">${t('riderScan.acctGoRegister')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoAccountForgot()">${t('riderScan.acctGoForgot')}</button>
    </div>
  `;
}

function riderViewAccountRegister(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.acctRegisterTitle')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field"><label>${t('riderScan.acctDisplayNameLabel')}</label>
        <input type="text" id="rider-acct-displayname" value="${escapeHtml(riderState.accountForm.displayName)}"></div>
      <div class="rider-field"><label>${t('riderScan.acctEmailLabel')}</label>
        <input type="email" id="rider-acct-email" value="${escapeHtml(riderState.accountForm.email)}"></div>
      <div class="rider-field"><label>${t('riderScan.acctPasswordLabel')}</label>
        <input type="password" id="rider-acct-password"></div>
      <div class="rider-note">${t('riderScan.acctPasswordHint')}</div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderSubmitAccountRegister()">${t('riderScan.acctRegisterSubmit')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoAccountLogin()">${t('riderScan.acctGoLogin')}</button>
    </div>
  `;
}

function riderViewAccountForgot(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.acctForgotTitle')}</div>
      <div class="rider-lead">${t('riderScan.acctForgotLead')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field"><label>${t('riderScan.acctEmailLabel')}</label>
        <input type="email" id="rider-acct-email" value="${escapeHtml(riderState.accountForm.email)}"></div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderSubmitAccountForgot()">${t('riderScan.acctForgotSubmit')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoAccountLogin()">${t('riderScan.acctGoLogin')}</button>
    </div>
  `;
}

function riderViewAccountReset(){
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.acctResetTitle')}</div>
      ${riderState.error ? `<div class="rider-note rider-note-error">${escapeHtml(riderState.error)}</div>` : ''}
      <div class="rider-field"><label>${t('riderScan.acctResetPasswordLabel')}</label>
        <input type="password" id="rider-acct-newpassword"></div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="riderSubmitAccountReset()">${t('riderScan.acctResetSubmit')}</button>
    </div>
  `;
}

function riderViewProfile(){
  const rows = riderState.history.map(h => `
    <div class="rider-cp done">
      <div class="rider-cp-main">
        <div class="rider-cp-name">${escapeHtml(h.eventName)}</div>
        <div class="rider-cp-hint">${escapeHtml(t('riderScan.profileBib', {bib: h.bib}))} · ${escapeHtml(t('riderScan.profileCheckpointsDone', {count: h.checkpointsDone}))}</div>
      </div>
    </div>
  `).join('');
  return `
    ${riderHead()}
    <div class="rider-body">
      <div class="rider-title">${t('riderScan.profileTitle', {name: riderState.account ? riderState.account.displayName : ''})}</div>
      ${riderState.history.length ? `<div class="rider-cp-list">${rows}</div>` : `<div class="rider-lead">${t('riderScan.profileEmpty')}</div>`}
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderLogoutAccount()">${t('riderScan.acctLogout')}</button>
      <button type="button" class="rider-btn rider-btn-ghost" onclick="riderGoHome()">${t('riderScan.profileBack')}</button>
    </div>
  `;
}

/* Nur Stunde und Minute. Sekunden helfen dem Fahrer nicht, und das
   Datum steht ohnehin fest — es ist Renntag. */
function riderShortTime(v){
  if(!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  if(isNaN(d.getTime())) return String(v);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
