/* ---------------- action log (generic undo) ----------------
   Beyond the check-in view's own dedicated undo (unconfirmRiderAtFinish
   in checkin.js, which has always worked as a one-off toast), this is a
   small, reusable mechanism for other destructive/easy-to-fat-finger
   actions elsewhere in the app: rider deleted, category assignment
   changed, category group/option deleted. evt.actionLog holds the last
   few entries ({id, label, at}) so they stay visible even after the
   originating toast has timed out; the actual undo closures only live
   for the current session in state.actionUndoHandlers (functions can't
   be persisted), so a page reload clears undo-ability but keeps the
   log entries themselves as an audit trail. */
function logUndoableAction(evt, label, undoFn){
  evt.actionLog = evt.actionLog || [];
  const id = uid('action');
  evt.actionLog.push({id, label, at: toLocalDateTimeInputValue(new Date())});
  if(evt.actionLog.length > 5) evt.actionLog = evt.actionLog.slice(-5);
  state.actionUndoHandlers = state.actionUndoHandlers || {};
  state.actionUndoHandlers[id] = undoFn;
  debouncedSave();
  showToast({
    message: label,
    actionLabel: t('actionLog.undoAction'),
    onAction: () => undoLoggedAction(id)
  });
}
function undoLoggedAction(id){
  const evt = state.currentEvent;
  if(!evt) return;
  const handler = state.actionUndoHandlers && state.actionUndoHandlers[id];
  if(!handler) return;
  handler();
  evt.actionLog = (evt.actionLog || []).filter(e => e.id !== id);
  delete state.actionUndoHandlers[id];
  debouncedSave();
}
function renderActionLogPanel(evt){
  const entries = (evt.actionLog || []).slice().reverse();
  if(!entries.length) return '';
  return `
    <div class="action-log-panel">
      <div class="action-log-title">${t('actionLog.panelTitle')}</div>
      <ul class="action-log-list">
        ${entries.map(e => `
          <li>
            <span class="action-log-time">${formatTimeOnly(e.at)}</span>
            <span class="action-log-label">${escapeHtml(e.label)}</span>
            ${state.actionUndoHandlers && state.actionUndoHandlers[e.id] ? `<button type="button" class="btn btn-ghost btn-sm" onclick="undoLoggedAction('${e.id}'); renderRiders();">${t('actionLog.undoAction')}</button>` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}
