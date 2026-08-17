/* ---------------- empty states ---------------- */
/* Wiederverwendbare Komponente statt Einzellösungen pro Screen (16.3). Generalisiert das
   bestehende .empty-state (bisher nur Dashboard/Fahrerliste) um einen optionalen Icon-Slot
   und eine zweite Aktion — ersetzt keine der schlankeren Inline-Hinweis-Klassen
   (.cp-list-empty/.leaderboard-empty/.overview-widget-empty etc.), die bewusst knapper
   bleiben, wo kein eigener Screen dahintersteht (z. B. eine leere Tabellenzeile). */
function emptyStateHtml({icon, title, description, primaryAction, secondaryAction, compact}){
  const actions = (primaryAction || secondaryAction) ? `
    <div class="empty-state-actions">
      ${primaryAction ? `<button type="button" class="btn btn-primary" onclick="${primaryAction.onclick}">${escapeHtml(primaryAction.label)}</button>` : ''}
      ${secondaryAction ? `<button type="button" class="btn btn-ghost" onclick="${secondaryAction.onclick}">${escapeHtml(secondaryAction.label)}</button>` : ''}
    </div>
  ` : '';
  return `
    <div class="empty-state${compact ? ' empty-state-compact' : ''}">
      ${icon ? `<div class="empty-state-icon">${icon}</div>` : ''}
      <div class="display">${escapeHtml(title)}</div>
      ${description ? `<p>${escapeHtml(description)}</p>` : ''}
      ${actions}
    </div>
  `;
}
