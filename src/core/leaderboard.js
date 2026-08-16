/* ---------------- leaderboard ---------------- */
function sortRidersForOverview(riders){
  return riders.slice().sort((a, b) => {
    if(!!a.finishTime !== !!b.finishTime) return a.finishTime ? -1 : 1;
    if(a.finishTime && b.finishTime) return new Date(a.finishTime) - new Date(b.finishTime);
    return a.bib - b.bib;
  });
}

function onLeaderboardSearchInput(value){
  state.leaderboardSearch = value;
  renderLeaderboard();
}
function onLeaderboardTeamFilterChange(value){
  state.leaderboardTeamFilter = value;
  renderLeaderboard();
}
function setLeaderboardTab(tab){
  state.leaderboardTab = tab;
  renderLeaderboard();
}
function renderLeaderboard(){
  const el = document.getElementById('view-leaderboard');
  const evt = state.currentEvent;
  if(!evt){
    el.innerHTML = `<div class="loading-row">Kein Event ausgewählt.</div>`;
    return;
  }
  const allRiders = evt.riders || [];
  const teams = evt.teams || [];
  const cps = evt.checkpoints.slice().sort((a,b) => a.order - b.order);
  const mandatoryCps = cps.filter(c => c.mandatory);

  const q = state.leaderboardSearch.trim().toLowerCase();
  const riders = sortRidersForOverview(
    allRiders.filter(r =>
      (!q || String(r.bib).includes(q) || (r.name || '').toLowerCase().includes(q)) &&
      (!state.leaderboardTeamFilter || r.teamId === state.leaderboardTeamFilter)
    )
  );

  const arrivedCount = allRiders.filter(r => r.finishTime).length;
  const arrivalPct = allRiders.length ? Math.round((arrivedCount / allRiders.length) * 100) : 0;

  const tabsHtml = `
    <div class="leaderboard-tabs">
      <button class="lb-tab-btn ${state.leaderboardTab === 'individual' ? 'active' : ''}" onclick="setLeaderboardTab('individual')">Einzelwertung</button>
      <button class="lb-tab-btn ${state.leaderboardTab === 'teams' ? 'active' : ''}" onclick="setLeaderboardTab('teams')">Team-Wertung</button>
    </div>
  `;

  if(allRiders.length === 0){
    el.innerHTML = `
      <div class="leaderboard-page-head">
        <div class="leaderboard-page-stamp">🏆</div>
        <h2>Leaderboard</h2>
      </div>
      <div class="leaderboard-toolbar">
        <div class="leaderboard-stats">Noch keine Fahrerliste angelegt.</div>
      </div>
      <div class="leaderboard-empty">Leg zuerst unter „Fahrer" die erwartete Fahreranzahl an.</div>
    `;
    return;
  }

  if(state.leaderboardTab === 'teams'){
    const teamStats = computeTeamStats(evt);
    const teamRowsHtml = teamStats.teams.map(ts => `
      <tr>
        <td class="lb-rider">${teamBadgeHtml(evt, ts.team.id)}</td>
        <td>${ts.memberCount}</td>
        <td>${ts.arrived}</td>
        <td><span class="lb-progress-tag">${ts.doneMandatory}/${ts.memberCount * teamStats.mandatoryTotal} Pflicht</span></td>
        ${teamStats.hasScoredCheckpoints ? `<td><span class="lb-progress-tag points${ts.totalScore === 0 ? ' zero' : ''}">${ts.totalScore} Pkt.</span></td>` : ''}
      </tr>
    `).join('');
    el.innerHTML = `
      <div class="leaderboard-page-head">
        <div class="leaderboard-page-stamp">🏆</div>
        <h2>Leaderboard</h2>
      </div>
      ${tabsHtml}
      <div class="leaderboard-toolbar">
        <div class="leaderboard-stats"><span>${teamStats.teams.length} Team${teamStats.teams.length === 1 ? '' : 's'}</span></div>
        <button class="btn" onclick="exportLeaderboardCSV()">CSV exportieren</button>
      </div>
      <div class="leaderboard-scroll">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th class="lb-rider">Team</th>
              <th>Fahrer</th>
              <th>Im Ziel</th>
              <th>Pflicht erledigt</th>
              ${teamStats.hasScoredCheckpoints ? '<th>Punkte</th>' : ''}
            </tr>
          </thead>
          <tbody>${teamRowsHtml || `<tr><td colspan="5" class="leaderboard-empty">Noch keine Teams angelegt — unter „Fahrer" anlegen.</td></tr>`}</tbody>
        </table>
      </div>
    `;
    return;
  }

  const arrivedSorted = allRiders.filter(r => r.finishTime).sort((a, b) => new Date(a.finishTime) - new Date(b.finishTime));
  const rankMap = new Map(arrivedSorted.map((r, i) => [r.bib, i + 1]));

  const hasScoredCheckpoints = cps.some(cp => getCheckpointType(cp.type).isScored);
  const headCps = cps.map(cp => `<th class="lb-cp ${cp.mandatory ? '' : 'optional'}" title="${escapeHtml(cp.name || '')}">CP-${String(cp.order).padStart(2,'0')}</th>`).join('');

  const rows = riders.map(r => {
    const completed = r.completed || [];
    const scores = r.scores || {};
    const cpTimes = r.checkpointTimes || {};
    const cells = cps.map(cp => {
      const done = completed.includes(cp.id);
      const missingMandatory = !done && cp.mandatory && r.finishTime;
      let twClass = '', titleAttr = escapeHtml(cp.name || '');
      if(cp.timeWindowEnabled && done){
        const twResult = computeTimeWindowResult(cp, cpTimes[cp.id]);
        if(twResult && !twResult.ok){
          twClass = 'tw-warn';
          titleAttr += ' — ' + (twResult.reason === 'early' ? 'zu früh' : 'zu spät') + ' (' + formatTimeOnly(cpTimes[cp.id]) + ')';
        } else if(twResult && twResult.ok){
          titleAttr += ' — im Zeitfenster (' + formatTimeOnly(cpTimes[cp.id]) + ')';
        }
      }
      const label = getCheckpointType(cp.type).isScored && done && scores[cp.id] !== undefined ? String(scores[cp.id]) : (done ? '&#10003;' : '');
      return `<td><span class="matrix-cell ${done ? 'done' : ''} ${done && !cp.mandatory ? 'optional' : ''} ${missingMandatory ? 'missing-mandatory' : ''} ${twClass}" title="${titleAttr}">${label}</span></td>`;
    }).join('');

    const statusHtml = riderStatusBadgeHtml(evt, r);
    const doneMandatory = mandatoryCps.filter(cp => completed.includes(cp.id)).length;

    const totalScore = Object.values(scores).reduce((sum, v) => sum + (Number(v) || 0), 0);

    const rank = rankMap.get(r.bib);
    const rankTier = rank === 1 ? 'tier-1' : rank === 2 ? 'tier-2' : rank === 3 ? 'tier-3' : '';
    const rankBadge = rank ? `<span class="lb-rank ${rankTier}">${rank}</span>` : '';

    return `
      <tr class="lb-row ${r.finishTime ? 'arrived' : 'missing'}">
        <td class="lb-rider">${rankBadge}<span class="lb-bib">#${r.bib}</span><span class="lb-name">${escapeHtml(r.name || '—')}</span>${teamBadgeHtml(evt, r.teamId)}</td>
        ${cells}
        <td>${statusHtml}</td>
        <td><span class="lb-progress-tag">${doneMandatory}/${mandatoryCps.length} Pflicht &middot; ${completed.length}/${cps.length} ges.</span></td>
        ${hasScoredCheckpoints ? `<td><span class="lb-progress-tag points${totalScore === 0 ? ' zero' : ''}">${totalScore} Pkt.</span></td>` : ''}
      </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="leaderboard-page-head">
      <div class="leaderboard-page-stamp">🏆</div>
      <h2>Leaderboard</h2>
    </div>
    ${tabsHtml}
    <div class="leaderboard-toolbar">
      <div class="leaderboard-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Fahrer oder Bib-Nummer suchen…" value="${escapeHtml(state.leaderboardSearch)}" oninput="onLeaderboardSearchInput(this.value)">
      </div>
      ${teams.length ? `
        <select class="leaderboard-team-filter" onchange="onLeaderboardTeamFilterChange(this.value)">
          <option value="">Alle Teams</option>
          ${teams.map(t => `<option value="${t.id}" ${state.leaderboardTeamFilter === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
        </select>
      ` : ''}
      <div class="leaderboard-stats">
        <div class="leaderboard-progress-bar"><div class="leaderboard-progress-fill" style="width:${arrivalPct}%"></div></div>
        <span><b>${arrivedCount}</b> / ${allRiders.length} Fahrer im Ziel</span>
      </div>
      <button class="btn" onclick="exportLeaderboardCSV()">CSV exportieren</button>
    </div>
    <div class="leaderboard-scroll">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th class="lb-rider">Fahrer</th>
            ${headCps}
            <th>Status</th>
            <th>Fortschritt</th>
            ${hasScoredCheckpoints ? '<th>Punkte</th>' : ''}
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${cps.length + (hasScoredCheckpoints ? 4 : 3)}" class="leaderboard-empty">Keine Fahrer gefunden.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}
