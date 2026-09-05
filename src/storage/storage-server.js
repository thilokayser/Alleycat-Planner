/* ---------------- storage ----------------
   Nutzt window.storage (geteilter Artifact-Speicher), sofern verfügbar.
   Fällt sonst auf das eigene PHP/MySQL-Backend zurück (siehe /php-backend)
   — echtes Server-Backend, von mehreren Geräten/Browsern gemeinsam
   nutzbar. Verbindungsdaten (Endpunkt + API-Key) werden einmalig beim
   ersten Start abgefragt und lokal in localStorage gemerkt (nur die
   Zugangsdaten selbst, nicht die Event-Daten).                        */
const hasSharedStorage = !!(window.storage && typeof window.storage.get === 'function');
if(!hasSharedStorage){
  console.warn('window.storage nicht verfügbar — nutze PHP-Server-Backend.');
}
if(location.search.includes('reset-php-config')){
  localStorage.removeItem('alleycat:php-config');
}
function getPhpConfig(){
  try{ return JSON.parse(localStorage.getItem('alleycat:php-config') || 'null'); }
  catch(e){ return null; }
}
function savePhpConfig(cfg){
  localStorage.setItem('alleycat:php-config', JSON.stringify(cfg));
}

/* ---------------- Admin-Session (Benutzerverwaltung) ----------------
   Zweiter, personalisierter Zugangsweg neben dem einen geteilten
   API-Key: siehe auth.js für die reine Rollenlogik. Hier nur Transport.

   Vorrang: eine geladene Session verdrängt den Master-Key vollständig —
   sonst würde ein noch lokal gespeicherter Key jede Rollenbeschränkung
   wirkungslos machen (der Key zählt serverseitig immer als 'admin'). Ein
   Browser, der Rollen nutzen soll, darf also gar keinen apiKey mehr in
   seiner php-config haben (siehe submitPhpSetup()/renderAdminLogin()). */
function currentAuthHeaders(contentType){
  const session = loadAdminSession();
  const cfg = getPhpConfig();
  const headers = {};
  if(session && session.token) headers['X-Admin-Token'] = session.token;
  else if(cfg && cfg.apiKey) headers['X-Api-Key'] = cfg.apiKey;
  if(contentType) headers['Content-Type'] = contentType;
  return headers;
}
/* Bei 401 mit aktiver Session ist die Session tot (abgelaufen serverseitig
   gelöscht, oder nie gültig) — nicht bei 403, das heißt "gültig, aber
   Rolle reicht nicht" und ist kein Grund, den Benutzer auszuloggen. */
function handleAuthResponseStatus(status){
  if(status === 401 && loadAdminSession()){
    clearAdminSession();
    location.reload();
  }
}

function authEndpointUrl(){
  const cfg = getPhpConfig();
  if(!cfg || !cfg.apiUrl) return '';
  return cfg.apiUrl.replace(/\/[^\/]*$/, '/auth.php');
}
async function authRequest(method, query, body){
  const res = await fetch(authEndpointUrl() + '?' + query, {
    method,
    headers: Object.assign(currentAuthHeaders(body ? 'application/json' : null)),
    body: body ? JSON.stringify(body) : undefined
  });
  handleAuthResponseStatus(res.status);
  let data = null;
  try{ data = await res.json(); }catch(e){}
  if(!res.ok) return {ok: false, status: res.status, error: (data && data.error) || 'http_' + res.status};
  return Object.assign({ok: true}, data);
}

async function adminBootstrap(apiKey, username, password, displayName){
  return authRequest('POST', 'a=bootstrap', {apiKey, username, password, displayName});
}
async function adminLogin(username, password){
  const res = await authRequest('POST', 'a=login', {username, password});
  if(res.ok) saveAdminSession({token: res.token, role: res.role, username: res.username, displayName: res.displayName});
  return res;
}
async function adminLogout(){
  await authRequest('POST', 'a=logout', {});
  clearAdminSession();
}
async function adminWhoami(){
  return authRequest('GET', 'a=whoami');
}
async function adminListUsers(){
  return authRequest('GET', 'a=users');
}
async function adminCreateUser(user){
  return authRequest('POST', 'a=users/create', user);
}
async function adminUpdateUser(patch){
  return authRequest('POST', 'a=users/update', patch);
}
async function adminDeleteUser(id){
  return authRequest('POST', 'a=users/delete', {id});
}
async function adminGetCheckpointStaff(publicId){
  return authRequest('GET', 'a=checkpointstaff&public_id=' + encodeURIComponent(publicId));
}
async function adminSetCheckpointStaff(userId, publicId, cpIds){
  return authRequest('POST', 'a=checkpointstaff/set', {userId, publicId, cpIds});
}
/* ---------------- Einladungscodes ----------------
   Vier Funktionen, analog zu adminLogin() & Co. oben — reiner Transport,
   die Endpunkte selbst sind in auth.php. Unter geteiltem window.storage
   liefern alle vier null (siehe hasAdminRoles()), die aufrufende UI
   blendet die Sektion dann ganz aus statt mit leeren Listen zu arbeiten. */
async function createInviteCode(payload){
  if(!hasAdminRoles()) return null;
  return authRequest('POST', 'a=invite-create', payload);
}
async function listInviteCodes(){
  if(!hasAdminRoles()) return null;
  return authRequest('GET', 'a=invite-list');
}
async function revokeInviteCode(id){
  if(!hasAdminRoles()) return null;
  return authRequest('POST', 'a=invite-revoke', {id});
}
async function registerWithInviteCode(code, username, password){
  if(!hasAdminRoles()) return null;
  const res = await authRequest('POST', 'a=register', {code, username, password});
  if(res.ok) saveAdminSession({token: res.token, role: res.role, username: res.username, displayName: res.displayName});
  return res;
}
/* ---------------- Passwort-Reset / Überall abmelden / Audit-Log ----------------
   Gleiches Transport-Muster wie oben. resetPasswordWithCode() speichert
   bewusst keine Session — anders als registerWithInviteCode() landet ein
   Reset nicht automatisch eingeloggt, das bestehende Konto behält seine
   Rolle unverändert, nur das Passwort ändert sich. */
async function createResetCode(userId){
  if(!hasAdminRoles()) return null;
  return authRequest('POST', 'a=users/reset-code-create', {id: userId});
}
async function resetPasswordWithCode(code, password){
  if(!hasAdminRoles()) return null;
  return authRequest('POST', 'a=reset-password', {code, password});
}
async function logoutAllSessions(userId){
  if(!hasAdminRoles()) return null;
  return authRequest('POST', 'a=users/logout-all', {id: userId});
}
async function listAuditLog(){
  if(!hasAdminRoles()) return null;
  return authRequest('GET', 'a=audit-log');
}
/* Admin-Rollen-Seam (siehe auth.js currentUserRole()): unter geteiltem
   window.storage gibt es kein PHP-Backend und damit keine Konten. */
function hasAdminRoles(){
  return !hasSharedStorage;
}

async function phpRequest(method, key, body){
  const cfg = getPhpConfig();
  if(!cfg) throw new Error('PHP-Backend nicht konfiguriert');
  const url = cfg.apiUrl + '?key=' + encodeURIComponent(key);
  const res = await fetch(url, {
    method,
    headers: Object.assign(currentAuthHeaders(method === 'POST' ? 'text/plain' : null)),
    body: method === 'POST' ? body : undefined
  });
  handleAuthResponseStatus(res.status);
  return res;
}
async function storageGet(key){
  if(hasSharedStorage){
    try{ return await window.storage.get(key, true); }
    catch(e){ console.error('storage.get failed', e); return null; }
  }
  try{
    const res = await phpRequest('GET', key);
    if(res.status === 404) return null;
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return {value: data.value};
  }catch(e){ console.error('php storage get failed', e); return null; }
}
async function storageSet(key, value){
  if(hasSharedStorage){
    try{ await window.storage.set(key, value, true); return true; }
    catch(e){ console.error('storage.set failed', e); return false; }
  }
  try{
    const res = await phpRequest('POST', key, value);
    return res.ok;
  }catch(e){ console.error('php storage set failed', e); return false; }
}
async function storageDelete(key){
  if(hasSharedStorage){
    try{ await window.storage.delete(key, true); return; }
    catch(e){ console.error('storage.delete failed', e); }
    return;
  }
  try{ await phpRequest('DELETE', key); }
  catch(e){ console.error('php storage delete failed', e); }
}
function renderPhpSetup(error){
  document.getElementById('app').innerHTML = `
    <div style="max-width:480px; margin:60px auto; padding:32px; background:var(--asphalt-2); border:1px solid var(--asphalt-3); border-top:3px solid var(--hivis); border-radius:6px;">
      <h2 style="margin:0 0 4px;">Alleycat Dispatch</h2>
      <div style="color:var(--steel); font-size:13px; font-family:'JetBrains Mono'; margin-bottom:22px;">${t('phpSetup.subtitle')}</div>
      ${error ? `<div style="background:rgba(178,58,46,0.15); border:1px solid var(--stamp); color:#ff9a8f; padding:10px 12px; border-radius:4px; font-size:13px; margin-bottom:14px;">${escapeHtml(error)}</div>` : ''}
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('phpSetup.apiEndpointLabel')}</label>
      <input type="text" id="php-setup-url" placeholder="${escapeHtml(t('phpSetup.apiEndpointPlaceholder'))}"
        style="width:100%; padding:9px 10px; margin-bottom:14px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('phpSetup.apiKeyLabel')}</label>
      <input type="text" id="php-setup-key" placeholder="${escapeHtml(t('phpSetup.apiKeyPlaceholder'))}"
        style="width:100%; padding:9px 10px; margin-bottom:6px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <div style="color:var(--steel); font-size:11.5px; margin-bottom:14px; line-height:1.5;">${t('phpSetup.apiKeyOptionalHint')}</div>
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('phpSetup.riderAppUrlLabel')}</label>
      <input type="text" id="php-setup-rider-url" placeholder="${escapeHtml(t('phpSetup.riderAppUrlPlaceholder'))}"
        style="width:100%; padding:9px 10px; margin-bottom:6px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <div style="color:var(--steel); font-size:11.5px; margin-bottom:20px; line-height:1.5;">${t('phpSetup.riderAppUrlHint')}</div>
      <button class="btn btn-primary" style="width:100%;" onclick="submitPhpSetup()">${t('phpSetup.connectButton')}</button>
      <div style="color:var(--steel); font-size:11.5px; margin-top:14px; line-height:1.5;">${t('phpSetup.installHint', {installPhp: '<code>install.php</code>', phpBackend: '<code>php-backend</code>', resetParam: '<code>?reset-php-config</code>'})}</div>
    </div>
  `;
}
async function submitPhpSetup(){
  const apiUrl = (document.getElementById('php-setup-url').value || '').trim().replace(/\/$/, '');
  /* Der API-Key ist jetzt OPTIONAL: leer gelassen bekommt dieser Browser
     keinen Vollzugriffs-Key, sondern landet nach dem Verbinden auf dem
     personalisierten Login (renderAdminLogin()) — genau der Weg, wie ein
     Gerät für Editor/Betrachter/Checkpoint-Personal eingerichtet wird,
     ohne den Master-Key aus der Hand zu geben. Wer den Key einträgt,
     bekommt weiterhin sofort Vollzugriff wie bisher (Rückwärtskompatibilität). */
  const apiKey = (document.getElementById('php-setup-key').value || '').trim();
  /* Optional: leer lassen heißt "keine Fahrer-App". Die Rider-Seams
     liefern dann null und der geteilte Kern blendet alles Zugehörige
     aus — eine bestehende Installation bleibt damit ohne Zutun
     unverändert lauffähig. */
  const riderAppUrl = (document.getElementById('php-setup-rider-url').value || '').trim();
  if(!apiUrl){ renderPhpSetup(t('phpSetup.errorFieldsRequired')); return; }
  savePhpConfig({apiUrl, apiKey, riderAppUrl});
  if(apiKey){
    try{
      const res = await phpRequest('GET', 'events:index');
      if(res.status === 401){
        localStorage.removeItem('alleycat:php-config');
        renderPhpSetup(t('phpSetup.errorKeyRejected'));
        return;
      }
      if(!res.ok && res.status !== 404){
        localStorage.removeItem('alleycat:php-config');
        renderPhpSetup(t('phpSetup.errorServerStatus', {status: res.status}));
        return;
      }
    }catch(e){
      localStorage.removeItem('alleycat:php-config');
      renderPhpSetup(t('phpSetup.errorConnectionFailed', {message: e.message}));
      return;
    }
  }
  location.reload();
}

/* ---------------- Login-Gate (Benutzerverwaltung) ----------------
   Greift nur, wenn ein apiUrl konfiguriert ist UND kein lokal
   gespeicherter Master-Key vorliegt — siehe currentAuthHeaders()-
   Kommentar oben: mit gespeichertem Key bleibt der Browser wie bisher
   sofort im Vollzugriff, ganz ohne diesen Bildschirm. */
function renderAdminLogin(error, notice){
  document.getElementById('app').innerHTML = `
    <div style="max-width:420px; margin:60px auto; padding:32px; background:var(--asphalt-2); border:1px solid var(--asphalt-3); border-top:3px solid var(--hivis); border-radius:6px;">
      <h2 style="margin:0 0 4px;">Alleycat Dispatch</h2>
      <div style="color:var(--steel); font-size:13px; font-family:'JetBrains Mono'; margin-bottom:22px;">${t('auth.loginTitle')}</div>
      ${error ? `<div style="background:rgba(178,58,46,0.15); border:1px solid var(--stamp); color:#ff9a8f; padding:10px 12px; border-radius:4px; font-size:13px; margin-bottom:14px;">${escapeHtml(error)}</div>` : ''}
      ${notice ? `<div style="background:rgba(58,154,92,0.15); border:1px solid #3a9a5c; color:#8fd6a8; padding:10px 12px; border-radius:4px; font-size:13px; margin-bottom:14px;">${escapeHtml(notice)}</div>` : ''}
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('auth.loginUsernameLabel')}</label>
      <input type="text" id="admin-login-username" autocomplete="username"
        style="width:100%; padding:9px 10px; margin-bottom:14px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('auth.loginPasswordLabel')}</label>
      <input type="password" id="admin-login-password" autocomplete="current-password" onkeydown="if(event.key==='Enter') submitAdminLogin();"
        style="width:100%; padding:9px 10px; margin-bottom:20px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <button class="btn btn-primary" style="width:100%;" onclick="submitAdminLogin()">${t('auth.loginButton')}</button>
      <div style="text-align:center; margin-top:16px; display:flex; flex-direction:column; gap:6px;">
        <button type="button" style="background:none; border:none; color:var(--steel); font-size:12px; text-decoration:underline; cursor:pointer;" onclick="renderAdminRegister()">${t('auth.inviteLoginLink')}</button>
        <button type="button" style="background:none; border:none; color:var(--steel); font-size:12px; text-decoration:underline; cursor:pointer;" onclick="renderAdminResetPassword()">${t('auth.resetLoginLink')}</button>
        <button type="button" style="background:none; border:none; color:var(--steel); font-size:12px; text-decoration:underline; cursor:pointer;" onclick="renderAdminBootstrap()">${t('auth.bootstrapTitle')}</button>
      </div>
    </div>
  `;
}
async function submitAdminLogin(){
  const username = (document.getElementById('admin-login-username').value || '').trim();
  const password = document.getElementById('admin-login-password').value || '';
  if(!username || !password){ renderAdminLogin(t('auth.loginErrorInvalid')); return; }
  const res = await adminLogin(username, password);
  if(!res.ok){
    if(res.status === 429) renderAdminLogin(t('auth.loginErrorRateLimited', {seconds: res.retryAfter || 60}));
    else if(res.status === 403 || res.error === 'invalid_credentials') renderAdminLogin(t('auth.loginErrorInvalid'));
    else renderAdminLogin(t('auth.loginErrorGeneric'));
    return;
  }
  location.reload();
}
function renderAdminBootstrap(error){
  document.getElementById('app').innerHTML = `
    <div style="max-width:440px; margin:60px auto; padding:32px; background:var(--asphalt-2); border:1px solid var(--asphalt-3); border-top:3px solid var(--hivis); border-radius:6px;">
      <h2 style="margin:0 0 4px;">${t('auth.bootstrapTitle')}</h2>
      <div style="color:var(--steel); font-size:12.5px; margin-bottom:20px; line-height:1.5;">${t('auth.bootstrapDesc')}</div>
      ${error ? `<div style="background:rgba(178,58,46,0.15); border:1px solid var(--stamp); color:#ff9a8f; padding:10px 12px; border-radius:4px; font-size:13px; margin-bottom:14px;">${escapeHtml(error)}</div>` : ''}
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('auth.bootstrapApiKeyLabel')}</label>
      <input type="text" id="admin-bootstrap-key" style="width:100%; padding:9px 10px; margin-bottom:14px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('auth.bootstrapUsernameLabel')}</label>
      <input type="text" id="admin-bootstrap-username" style="width:100%; padding:9px 10px; margin-bottom:14px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('auth.bootstrapPasswordLabel')}</label>
      <input type="password" id="admin-bootstrap-password" oninput="updatePasswordStrengthMeter('admin-bootstrap-password','admin-bootstrap-password-meter')" style="width:100%; padding:9px 10px; margin-bottom:4px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <div id="admin-bootstrap-password-meter">${renderPasswordStrengthMeter('')}</div>
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('auth.bootstrapDisplayNameLabel')}</label>
      <input type="text" id="admin-bootstrap-displayname" style="width:100%; padding:9px 10px; margin-bottom:20px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <button class="btn btn-primary" style="width:100%;" onclick="submitAdminBootstrap()">${t('auth.bootstrapButton')}</button>
      <div style="text-align:center; margin-top:16px;">
        <button type="button" style="background:none; border:none; color:var(--steel); font-size:12px; text-decoration:underline; cursor:pointer;" onclick="renderAdminLogin()">${t('auth.loginButton')}</button>
      </div>
    </div>
  `;
}
async function submitAdminBootstrap(){
  const apiKey = (document.getElementById('admin-bootstrap-key').value || '').trim();
  const username = (document.getElementById('admin-bootstrap-username').value || '').trim();
  const password = document.getElementById('admin-bootstrap-password').value || '';
  const displayName = (document.getElementById('admin-bootstrap-displayname').value || '').trim();
  if(!apiKey || !username || !validatePasswordStrength(password).valid){ renderAdminBootstrap(t('auth.bootstrapError')); return; }
  const res = await adminBootstrap(apiKey, username, password, displayName);
  if(!res.ok){ renderAdminBootstrap(t('auth.bootstrapError')); return; }
  renderAdminLogin();
}

/* ---------------- Selbstregistrierung mit Einladungscode ----------------
   Öffentlich erreichbar, kein Login nötig — der Code selbst ist der
   Ausweis. Vorausgefüllt, wenn per ?invite=<code> aufgerufen (Link/
   QR-Code von der Visitenkarte, siehe exportInviteCardsPDF() in
   export-pdf.js); die URL trägt die Query weiter, bis initStorageBackend()
   sie einmalig ausliest (siehe dort) — kein eigener Routing-Zustand nötig,
   das ist derselbe dist/alleycat-dispatch-server.html-Ladevorgang wie
   jeder andere Seiteneinstieg auch. */
function inviteCodeFromUrl(){
  return new URLSearchParams(location.search).get('invite') || '';
}
function renderAdminRegister(prefilledCode, error){
  const code = prefilledCode || inviteCodeFromUrl();
  /* Reine Anzeige: der Wert kommt unverifiziert aus der URL (siehe
     inviteQrPayload() in export-pdf.js) und hat keinerlei Einfluss auf
     die Validierung, die läuft ausschließlich serverseitig bei
     ?a=register. Nur sichtbar, wenn der Link/QR-Code den Parameter
     trägt — das war eine bewusste Entscheidung des Admins beim
     Erstellen (Feature-Registry: invite_registration_validity). */
  const expParam = new URLSearchParams(location.search).get('exp');
  const expDate = expParam ? new Date(expParam) : null;
  const validityHint = (expDate && !isNaN(expDate.getTime()))
    ? `<div style="color:var(--steel); font-size:12px; margin-bottom:14px;">${t('auth.registerValidUntil', {date: expDate.toLocaleDateString('de-DE')})}</div>`
    : '';
  document.getElementById('app').innerHTML = `
    <div style="max-width:420px; margin:60px auto; padding:32px; background:var(--asphalt-2); border:1px solid var(--asphalt-3); border-top:3px solid var(--hivis); border-radius:6px;">
      <h2 style="margin:0 0 4px;">${t('auth.registerTitle')}</h2>
      <div style="color:var(--steel); font-size:12.5px; margin-bottom:20px; line-height:1.5;">${t('auth.registerDesc')}</div>
      ${validityHint}
      ${error ? `<div style="background:rgba(178,58,46,0.15); border:1px solid var(--stamp); color:#ff9a8f; padding:10px 12px; border-radius:4px; font-size:13px; margin-bottom:14px;">${escapeHtml(error)}</div>` : ''}
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('auth.registerCodeLabel')}</label>
      <input type="text" id="admin-register-code" value="${escapeHtml(code)}" style="width:100%; padding:9px 10px; margin-bottom:14px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px; text-transform:uppercase;">
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('auth.registerUsernameLabel')}</label>
      <input type="text" id="admin-register-username" autocomplete="username" style="width:100%; padding:9px 10px; margin-bottom:14px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('auth.registerPasswordLabel')}</label>
      <input type="password" id="admin-register-password" autocomplete="new-password" oninput="updatePasswordStrengthMeter('admin-register-password','admin-register-password-meter')" style="width:100%; padding:9px 10px; margin-bottom:4px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <div id="admin-register-password-meter">${renderPasswordStrengthMeter('')}</div>
      <button class="btn btn-primary" style="width:100%;" onclick="submitAdminRegister()">${t('auth.registerButton')}</button>
      <div style="text-align:center; margin-top:16px;">
        <button type="button" style="background:none; border:none; color:var(--steel); font-size:12px; text-decoration:underline; cursor:pointer;" onclick="renderAdminLogin()">${t('auth.loginButton')}</button>
      </div>
    </div>
  `;
}
async function submitAdminRegister(){
  const code = (document.getElementById('admin-register-code').value || '').trim().toUpperCase();
  const username = (document.getElementById('admin-register-username').value || '').trim();
  const password = document.getElementById('admin-register-password').value || '';
  if(!code || !username || !validatePasswordStrength(password).valid){ renderAdminRegister(code, t('auth.registerErrorInvalid')); return; }
  const res = await registerWithInviteCode(code, username, password);
  if(!res.ok){
    if(res.status === 429) renderAdminRegister(code, t('auth.loginErrorRateLimited', {seconds: res.retryAfter || 60}));
    else if(res.error === 'username_taken') renderAdminRegister(code, t('auth.usersUsernameTaken'));
    else renderAdminRegister(code, t('auth.registerErrorInvalid'));
    return;
  }
  location.href = location.pathname;
}

/* ---------------- Passwort-Reset mit Admin-Code ----------------
   Gegenstück zu renderAdminRegister(): auch hier ist der Code der
   Ausweis, aber er zielt auf ein BESTEHENDES Konto statt eins neu
   anzulegen — der Admin erzeugt ihn gezielt für einen Benutzer (siehe
   "Passwort ändern"-Button in renderSettingsSectionUsers()), es gibt
   keine Selbstauslösung à la "Passwort vergessen"-E-Mail, weil diese
   Installation keine E-Mail-Infrastruktur hat. */
function resetCodeFromUrl(){
  return new URLSearchParams(location.search).get('reset') || '';
}
function renderAdminResetPassword(prefilledCode, error){
  const code = prefilledCode || resetCodeFromUrl();
  document.getElementById('app').innerHTML = `
    <div style="max-width:420px; margin:60px auto; padding:32px; background:var(--asphalt-2); border:1px solid var(--asphalt-3); border-top:3px solid var(--hivis); border-radius:6px;">
      <h2 style="margin:0 0 4px;">${t('auth.resetTitle')}</h2>
      <div style="color:var(--steel); font-size:12.5px; margin-bottom:20px; line-height:1.5;">${t('auth.resetDesc')}</div>
      ${error ? `<div style="background:rgba(178,58,46,0.15); border:1px solid var(--stamp); color:#ff9a8f; padding:10px 12px; border-radius:4px; font-size:13px; margin-bottom:14px;">${escapeHtml(error)}</div>` : ''}
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('auth.resetCodeLabel')}</label>
      <input type="text" id="admin-reset-code" value="${escapeHtml(code)}" style="width:100%; padding:9px 10px; margin-bottom:14px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px; text-transform:uppercase;">
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('auth.resetPasswordLabel')}</label>
      <input type="password" id="admin-reset-password" autocomplete="new-password" oninput="updatePasswordStrengthMeter('admin-reset-password','admin-reset-password-meter')" style="width:100%; padding:9px 10px; margin-bottom:4px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <div id="admin-reset-password-meter">${renderPasswordStrengthMeter('')}</div>
      <button class="btn btn-primary" style="width:100%;" onclick="submitAdminResetPassword()">${t('auth.resetButton')}</button>
      <div style="text-align:center; margin-top:16px;">
        <button type="button" style="background:none; border:none; color:var(--steel); font-size:12px; text-decoration:underline; cursor:pointer;" onclick="renderAdminLogin()">${t('auth.loginButton')}</button>
      </div>
    </div>
  `;
}
async function submitAdminResetPassword(){
  const code = (document.getElementById('admin-reset-code').value || '').trim().toUpperCase();
  const password = document.getElementById('admin-reset-password').value || '';
  if(!code || !validatePasswordStrength(password).valid){ renderAdminResetPassword(code, t('auth.resetErrorInvalid')); return; }
  const res = await resetPasswordWithCode(code, password);
  if(!res.ok){
    if(res.status === 429) renderAdminResetPassword(code, t('auth.loginErrorRateLimited', {seconds: res.retryAfter || 60}));
    else renderAdminResetPassword(code, t('auth.resetErrorInvalid'));
    return;
  }
  renderAdminLogin(null, t('auth.resetSuccessMessage'));
}

async function exportBackupBlob(evt){
  if(hasSharedStorage || !evt) return null;
  const slug = (evt.name || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
  const ts = toLocalDateTimeInputValue(new Date()).replace(/[:T]/g, '-');
  return {blob: new Blob([JSON.stringify(evt, null, 2)], {type: 'application/json'}), filename: `alleycat-autobackup-${slug}-${ts}.json`};
}

/* ---------------- storage capability seams (used by shared core/*.js) ---------------- */
/* See the local variant for the full rationale: false under a shared
   window.storage, where a per-device backup would be misleading. With the PHP
   backend configured, backups are genuine JSON exports of the event. */
function supportsLocalBackup(){
  return !hasSharedStorage;
}

/* ---------------- Rider-App-Seams ----------------
   Alle drei liefern null, wenn es keine Fahrer-App geben kann: unter
   einem geteilten window.storage gibt es kein PHP-Backend, und ohne
   konfigurierte Rider-App-URL gibt es keine Adresse, auf die ein
   QR-Code zeigen könnte. Der geteilte Kern wertet ausschließlich dieses
   null aus und fragt nie selbst nach der Variante. */
function riderAppBaseUrl(){
  const cfg = getPhpConfig();
  return (cfg && cfg.riderAppUrl) ? cfg.riderAppUrl : '';
}
function riderEndpointUrl(){
  const cfg = getPhpConfig();
  if(!cfg || !cfg.apiUrl) return '';
  /* rider.php liegt neben api.php — der Nutzer konfiguriert nur einen
     Endpunkt, und beide Dateien kommen aus demselben Ordner. */
  return cfg.apiUrl.replace(/\/[^\/]*$/, '/rider.php');
}
function riderSeamsAvailable(){
  return !hasSharedStorage && !!getPhpConfig() && !!riderAppBaseUrl();
}
async function riderRequest(method, query, body){
  const res = await fetch(riderEndpointUrl() + '?' + query, {
    method,
    headers: Object.assign(currentAuthHeaders(body ? 'application/json' : null)),
    body: body ? JSON.stringify(body) : undefined
  });
  handleAuthResponseStatus(res.status);
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function publishRiderConfig(payload){
  if(!riderSeamsAvailable()) return null;
  try{
    return await riderRequest('POST', 'a=sync', payload);
  }catch(e){
    console.error('rider sync failed', e);
    return {ok: false, error: e.message};
  }
}
async function pollRiderLog(publicId, sinceId){
  if(!riderSeamsAvailable()) return null;
  try{
    return await riderRequest('GET', 'a=log&public_id=' + encodeURIComponent(publicId) + '&since=' + (sinceId || 0));
  }catch(e){
    console.error('rider log poll failed', e);
    return {ok: false, error: e.message};
  }
}
async function confirmRiderSlot(publicId, bib, status){
  if(!riderSeamsAvailable()) return null;
  try{
    return await riderRequest('POST', 'a=slotstatus', {publicId, bib, status});
  }catch(e){
    console.error('rider slot status failed', e);
    return {ok: false, error: e.message};
  }
}
async function initStorageBackend(){
  if(hasSharedStorage) return true;
  const cfg = getPhpConfig();
  if(!cfg){
    renderPhpSetup();
    return false;
  }
  /* Ohne gespeicherten Master-Key ist dieser Browser für den
     personalisierten Login eingerichtet (siehe submitPhpSetup()) — ohne
     gültige Session kommt er nicht weiter. Die Session selbst wird nicht
     gegen den Server verifiziert, bevor die Oberfläche lädt: ein toter
     Token fällt beim ersten echten Aufruf mit 401 auf und
     handleAuthResponseStatus() schickt dann zurück zum Login. Das spart
     einen Roundtrip bei jedem Start, auf Kosten eines einzigen
     fehlschlagenden Requests im toten Fall. */
  if(!cfg.apiKey && !loadAdminSession()){
    if(inviteCodeFromUrl()) renderAdminRegister();
    else if(resetCodeFromUrl()) renderAdminResetPassword();
    else renderAdminLogin();
    return false;
  }
  return true;
}
function renderStorageDashboardExtras(){
  return '';
}
/* No-op: this variant's storage is shared across every organizer on the
   installation (PHP backend, or a shared window.storage), so auto-creating
   a demo event here would clutter a board other people already use. See
   the local variant's seedDemoEventIfNeeded() for the real implementation. */
async function seedDemoEventIfNeeded(){}
