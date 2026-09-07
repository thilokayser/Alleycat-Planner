/* ---------------- Admin-Rollen: reine Logik ----------------
   Kennt keinen Endpunkt und kein fetch — das lebt hinter den Seams in
   src/storage/ (adminLogin(), adminLogout(), …), genau wie rider-sync.js
   von den Rider-Seams getrennt ist. Hier steht nur, was aus einer Rolle
   eine Berechtigung macht, damit das ohne Server und ohne Netz testbar
   bleibt.

   Session wird über adminSessionState() gehalten statt eines eigenen
   Zustandsobjekts wie bei riderState — anders als die Fahrer-App teilt
   sich das hier den einen `state` des Organizers, weil Login-Status und
   aktuelles Event ohnehin zusammen gerendert werden. */

const ADMIN_SESSION_LS_KEY = 'alleycat:admin-session';
/* 'captain' statt 'admin' als höchster Rang: seit Multi-Tenancy heißt die
   Org-Spitzenrolle so (ADMIN_ROLE_RANK in bootstrap.php spiegelt exakt
   diese Tabelle). 'admin' existiert serverseitig gar nicht mehr. */
const ADMIN_ROLE_RANK_CLIENT = {viewer: 1, checkpoint_staff: 1, editor: 2, captain: 3};

function loadAdminSession(){
  try{ return JSON.parse(localStorage.getItem(ADMIN_SESSION_LS_KEY) || 'null'); }
  catch(e){ return null; }
}
function saveAdminSession(session){
  try{ localStorage.setItem(ADMIN_SESSION_LS_KEY, JSON.stringify(session)); }
  catch(e){ console.error('admin session nicht speicherbar', e); }
}
function clearAdminSession(){
  try{ localStorage.removeItem(ADMIN_SESSION_LS_KEY); }catch(e){}
}

/* Instanzweiter Sonderstatus. Kommt aus ?a=login (siehe adminLogin() in
   storage-server.js) und ist das EINZIGE, was die Session dauerhaft über
   Berechtigungen weiß — alles andere hängt an der aktiven Org.
   Ohne Rollensystem (lokale Variante, geteiltes window.storage) und beim
   Master-Key-Zugang (keine Session, serverseitig immer SysAdmin) gilt
   jeder als SysAdmin, wie bisher. */
function currentUserIsSysAdmin(){
  if(!hasAdminRoles()) return true;
  const session = state.adminSession;
  if(!session) return true;
  return !!session.isSysAdmin;
}

/* Rolle INNERHALB des gerade gewählten Workspaces. Die Quelle ist
   state.myOrgs (?a=my-orgs liefert {id,slug,name,role} je Org) und nicht
   die Session: dieselbe Person kann in Org A Captain und in Org B
   Betrachter sein, eine beim Login eingefrorene Rolle wäre nach dem
   ersten Workspace-Wechsel falsch. */
function activeOrgRole(){
  const org = (state.myOrgs || []).find(o => o.slug === state.activeOrgSlug);
  return org && org.role ? org.role : null;
}

/* Aktuelle Rolle, unabhängig davon, ob per personalisierter Session oder
   per Master-API-Key angemeldet — Aufrufer sollen diese eine Funktion
   fragen, nie direkt in state.adminSession greifen. hasAdminRoles() ist
   ein Seam (siehe src/storage/*): unter dem lokalen Backend und unter
   geteiltem window.storage gibt es keine Rollen, dort darf alles alles,
   wie bisher.

   SysAdmin zählt überall als 'captain' — genau wie serverseitig in
   apiVerifyAccess(), wo is_sysadmin ohne org_member-Zeile durchgreift.
   null heißt "noch keine Rolle bekannt" (Anmeldung läuft, oder das Konto
   ist in gar keiner Org) und wird von currentUserCan() bewusst nicht als
   Sperre behandelt — die echte Durchsetzung sitzt im Backend. */
function currentUserRole(){
  if(!hasAdminRoles()) return 'captain';
  const session = state.adminSession;
  if(!session) return null;
  if(session.isSysAdmin) return 'captain';
  return activeOrgRole();
}
function currentUserDisplayName(){
  const session = state.adminSession;
  return session ? (session.displayName || session.username) : '';
}

/* Grobe, aber ehrliche Gate-Funktion: 'view' ist immer erlaubt (auch ohne
   Session, solange keine Rolle geladen ist — verhindert, dass eine noch
   nicht abgeschlossene Anmeldung die ganze Oberfläche sperrt), 'edit'
   braucht mindestens Editor, 'manageUsers' nur SysAdmin.

   'manageUsers' hängt bewusst an currentUserIsSysAdmin() und nicht mehr
   an der Rolle: Benutzer-, Einladungs- und Audit-Verwaltung sind
   instanzweit, ein Captain ist nur innerhalb seiner Org mächtig. auth.php
   verlangt seit dem Governance-Pass dort ebenfalls SysAdmin — die
   Oberfläche würde sonst Formulare zeigen, die jedes Absenden mit 403
   quittiert. */
function currentUserCan(action){
  if(action === 'manageUsers') return currentUserIsSysAdmin();
  const role = currentUserRole();
  if(role === null) return true;
  if(action === 'view') return true;
  if(action === 'edit') return ADMIN_ROLE_RANK_CLIENT[role] >= ADMIN_ROLE_RANK_CLIENT.editor;
  return false;
}
function isViewerRole(){
  return currentUserRole() === 'viewer';
}

/* Eine Policy für jeden Passwort-Eingabepunkt (Bootstrap, Einladungs-
   Registrierung, ein späterer Passwort-Ändern-Screen) statt mehrerer
   divergierender Regeln. Mindestlänge statt Zeichenklassen-Zwang (NIST
   SP 800-63B statt veralteter Komplexitätsregeln) — Nutzer weichen bei
   erzwungenem Sonderzeichen-/Großbuchstaben-Mix erfahrungsgemäß auf
   vorhersehbare Muster aus. Rein clientseitiges Feedback, kein
   Blocker — spiegelt authPasswordValid() in auth.php, die einzige
   wirklich durchgesetzte Instanz. */
const PASSWORD_MIN_LENGTH = 12;
function validatePasswordStrength(password){
  const len = (password || '').length;
  if(len === 0) return {valid: false, level: 'empty', message: t('auth.passwordHintMinLength', {min: PASSWORD_MIN_LENGTH})};
  if(len < PASSWORD_MIN_LENGTH) return {valid: false, level: 'weak', message: t('auth.passwordHintMinLength', {min: PASSWORD_MIN_LENGTH})};
  if(len < PASSWORD_MIN_LENGTH + 6) return {valid: true, level: 'ok', message: t('auth.passwordHintOk')};
  return {valid: true, level: 'strong', message: t('auth.passwordHintStrong')};
}
/* Gemeinsame UI-Komponente statt Insel je Formular — Bootstrap,
   Registrierung und ein späterer Passwort-Ändern-Screen bleiben damit
   optisch/funktional identisch. Reines Feedback: aktualisiert nur eine
   vorhandene Anzeige-Zeile, blockiert kein Absenden selbst. */
function renderPasswordStrengthMeter(password){
  const r = validatePasswordStrength(password);
  const color = r.level === 'strong' ? '#3a9a5c' : r.level === 'ok' ? 'var(--hivis)' : 'var(--steel)';
  return `<div style="color:${color}; font-size:11.5px; margin:-8px 0 14px;">${escapeHtml(r.message)}</div>`;
}
function updatePasswordStrengthMeter(inputId, meterId){
  const meterEl = document.getElementById(meterId);
  if(!meterEl) return;
  meterEl.outerHTML = renderPasswordStrengthMeter(document.getElementById(inputId).value || '').replace('<div', `<div id="${meterId}"`);
}
