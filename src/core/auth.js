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
const ADMIN_ROLE_RANK_CLIENT = {viewer: 1, checkpoint_staff: 1, editor: 2, admin: 3};

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

/* Aktuelle Rolle, unabhängig davon, ob per personalisierter Session oder
   per Master-API-Key angemeldet — Aufrufer sollen diese eine Funktion
   fragen, nie direkt in state.adminSession greifen. hasAdminRoles() ist
   ein Seam (siehe src/storage/*): unter dem lokalen Backend und unter
   geteiltem window.storage gibt es keine Rollen, dort darf alles alles,
   wie bisher. */
function currentUserRole(){
  if(!hasAdminRoles()) return 'admin';
  const session = state.adminSession;
  return session ? session.role : null;
}
function currentUserDisplayName(){
  const session = state.adminSession;
  return session ? (session.displayName || session.username) : '';
}

/* Grobe, aber ehrliche Gate-Funktion: 'view' ist immer erlaubt (auch ohne
   Session, solange keine Rolle geladen ist — verhindert, dass eine noch
   nicht abgeschlossene Anmeldung die ganze Oberfläche sperrt), 'edit'
   braucht mindestens Editor, 'manageUsers' nur Admin. */
function currentUserCan(action){
  const role = currentUserRole();
  if(role === null) return true;
  if(action === 'view') return true;
  if(action === 'manageUsers') return role === 'admin';
  if(action === 'edit') return ADMIN_ROLE_RANK_CLIENT[role] >= ADMIN_ROLE_RANK_CLIENT.editor;
  return false;
}
function isViewerRole(){
  return currentUserRole() === 'viewer';
}
