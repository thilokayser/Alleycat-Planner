/* ---------------- leaderboard ---------------- */
function sortRidersForOverview(riders){
  return riders.slice().sort((a, b) => {
    if(!!a.finishTime !== !!b.finishTime) return a.finishTime ? -1 : 1;
    if(a.finishTime && b.finishTime) return new Date(a.finishTime) - new Date(b.finishTime);
    return a.bib - b.bib;
  });
}
function sortRidersByPoints(riders, evt){
  return riders.slice().sort((a, b) => {
    const pa = pointsForRider(evt, a.bib), pb = pointsForRider(evt, b.bib);
    if(pa !== pb) return pb - pa;
    if(!!a.finishTime !== !!b.finishTime) return a.finishTime ? -1 : 1;
    if(a.finishTime && b.finishTime) return new Date(a.finishTime) - new Date(b.finishTime);
    return a.bib - b.bib;
  });
}
function sortRidersByCpCount(riders){
  return riders.slice().sort((a, b) => {
    const ca = (a.completed || []).length, cb = (b.completed || []).length;
    if(ca !== cb) return cb - ca;
    if(!!a.finishTime !== !!b.finishTime) return a.finishTime ? -1 : 1;
    if(a.finishTime && b.finishTime) return new Date(a.finishTime) - new Date(b.finishTime);
    return a.bib - b.bib;
  });
}
/* Leaderboard-Ansichts-Sortierung (Punkte/Zeit/CP-Anzahl, Redesign-Mockup
   "Screen E"): unabhängig von evt.scoringMode, das nur bestimmt, welche
   Bewertung offiziell zählt (Spalten, Podium-Vorbelegung beim Öffnen). Die
   Sortierung hier ist reine Browsing-Ansicht, transient, nicht gespeichert. */
function sortRidersForLeaderboardView(riders, evt, mode){
  if(mode === 'points') return sortRidersByPoints(riders, evt);
  if(mode === 'cpCount') return sortRidersByCpCount(riders);
  return sortRidersForOverview(riders);
}
function setLeaderboardSortMode(mode){
  state.leaderboardSortMode = mode;
  renderLeaderboard();
}
/* ---------------- leaderboard side panel: podium + class winners ----------------
   Independent of the toolbar's search/filter state on purpose (a marshal
   filtering for one rider shouldn't watch the overall podium disappear) —
   computed from every named rider, not the filtered `riders` list. */
function computeLeaderboardPodium(evt){
  const named = (evt.riders || []).filter(r => (r.name || '').trim());
  const ranked = evt.scoringMode === 'points'
    ? sortRidersByPoints(named, evt)
    : named.filter(r => r.finishTime).sort((a, b) => new Date(a.finishTime) - new Date(b.finishTime));
  return ranked.slice(0, 3);
}
function computeClassWinners(evt){
  const groups = (evt.categoryGroups || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const pointsScoring = evt.scoringMode === 'points';
  const rankOf = riders => pointsScoring
    ? sortRidersByPoints(riders, evt)
    : riders.filter(r => r.finishTime).sort((a, b) => new Date(a.finishTime) - new Date(b.finishTime));
  const winners = [];
  groups.forEach(g => {
    g.options.forEach(opt => {
      const inClass = (evt.riders || []).filter(r => r.categories && r.categories[g.id] === opt);
      const ranked = rankOf(inClass);
      if(ranked.length) winners.push({groupName: g.name, optionName: opt, rider: ranked[0]});
    });
  });
  return winners;
}
function renderLeaderboardSidebar(evt){
  const pointsScoring = evt.scoringMode === 'points';
  const podium = computeLeaderboardPodium(evt);
  const podiumHtml = podium.length ? podium.map((r, i) => `
    <div class="lb-podium-row ${i === 0 ? 'first' : ''}">
      <span class="lb-podium-rank">${i + 1}</span>
      <span class="lb-podium-name">${escapeHtml(r.name || '—')}</span>
      <span class="lb-podium-value">${pointsScoring ? pointsForRider(evt, r.bib) + ' Pkt.' : (r.finishTime ? formatTimeOnly(r.finishTime) : '—')}</span>
    </div>
  `).join('') : `<div class="overview-widget-empty">${t('leaderboard.podiumEmpty')}</div>`;

  const classWinners = computeClassWinners(evt);
  const classRowsHtml = classWinners.map(w => `
    <div class="lb-class-winner-row">
      <span class="lb-class-winner-label">${escapeHtml(w.groupName)}: ${escapeHtml(w.optionName)}</span>
      <span class="lb-class-winner-name">${escapeHtml(w.rider.name || '—')}</span>
    </div>
  `).join('');
  const teamStats = (evt.teams || []).length ? computeTeamStats(evt) : null;
  const topTeam = teamStats && teamStats.teams.length ? teamStats.teams[0] : null;
  const teamRowHtml = topTeam ? `
    <div class="lb-class-winner-row">
      <span class="lb-class-winner-label">${t('leaderboard.teamWinnerLabel')}</span>
      <span class="lb-class-winner-name">${escapeHtml(topTeam.team.name)}</span>
    </div>
  ` : '';
  const classWinnersHtml = (classRowsHtml || teamRowHtml) ? (classRowsHtml + teamRowHtml) : `<div class="overview-widget-empty">${t('leaderboard.classWinnersEmpty')}</div>`;

  const underwayCount = (evt.riders || []).filter(r => (r.name || '').trim() && !r.finishTime && r.raceStatus !== 'dnf' && r.raceStatus !== 'dns' && r.raceStatus !== 'eliminated').length;

  return `
    <div class="leaderboard-side">
      <div class="overview-widget">
        <div class="overview-widget-head"><h3>${t('leaderboard.podiumTitle')}</h3></div>
        <div class="overview-widget-body">${podiumHtml}</div>
      </div>
      <div class="overview-widget">
        <div class="overview-widget-head"><h3>${t('leaderboard.classWinnersTitle')}</h3></div>
        <div class="overview-widget-body">${classWinnersHtml}</div>
      </div>
      ${evt.status === 'running' ? `
        <div class="raceday-status-footer">
          <span class="raceday-status-dot"></span>
          <span>${t('leaderboard.provisionalNote', {count: underwayCount})}</span>
        </div>
      ` : ''}
    </div>
  `;
}
function showPointsLedger(bib){
  const evt = state.currentEvent;
  const entries = ledgerEntriesForRider(evt, bib);
  if(!entries.length){ alert(t('gameModes.ledgerEmpty')); return; }
  const lines = entries.map(e => `${e.amount > 0 ? '+' : ''}${e.amount} — ${e.reason} (${formatDateTime(e.createdAt)})`);
  alert(t('gameModes.ledgerTitle', {bib}) + '\n\n' + lines.join('\n'));
}

let leaderboardSearchRenderTimeout;
function onLeaderboardSearchInput(value){
  state.leaderboardSearch = value;
  clearTimeout(leaderboardSearchRenderTimeout);
  leaderboardSearchRenderTimeout = setTimeout(() => {
    const active = document.activeElement;
    const cursor = active && active.classList.contains('leaderboard-search-input') ? active.selectionStart : null;
    renderLeaderboard();
    restoreInputFocus('.leaderboard-search-input', cursor);
  }, 150);
}
function onLeaderboardTeamFilterChange(value){
  state.leaderboardTeamFilter = value;
  renderLeaderboard();
}
function onLeaderboardStatusFilterChange(value){
  state.leaderboardStatusFilter = value;
  renderLeaderboard();
}
function onLeaderboardCategoryFilterChange(groupId, value){
  state.leaderboardCategoryFilters = state.leaderboardCategoryFilters || {};
  if(value) state.leaderboardCategoryFilters[groupId] = value;
  else delete state.leaderboardCategoryFilters[groupId];
  renderLeaderboard();
}
function removeLeaderboardFilter(kind, groupId){
  if(kind === 'team') state.leaderboardTeamFilter = '';
  else if(kind === 'status') state.leaderboardStatusFilter = '';
  else if(kind === 'category') delete state.leaderboardCategoryFilters[groupId];
  renderLeaderboard();
}
function clearLeaderboardFilters(){
  state.leaderboardSearch = '';
  state.leaderboardTeamFilter = '';
  state.leaderboardStatusFilter = '';
  state.leaderboardCategoryFilters = {};
  renderLeaderboard();
}
function riderMatchesStatusFilter(r, filter){
  if(!filter) return true;
  if(filter === 'dnf') return r.raceStatus === 'dnf';
  if(filter === 'dns') return r.raceStatus === 'dns';
  if(filter === 'eliminated') return r.raceStatus === 'eliminated';
  if(filter === 'arrived') return !!r.finishTime && r.raceStatus !== 'dnf' && r.raceStatus !== 'dns' && r.raceStatus !== 'eliminated';
  if(filter === 'underway') return !r.finishTime && r.raceStatus !== 'dnf' && r.raceStatus !== 'dns' && r.raceStatus !== 'eliminated';
  return true;
}
function setLeaderboardTab(tab){
  state.leaderboardTab = tab;
  renderLeaderboard();
}
function renderLeaderboard(){
  const el = document.getElementById('view-leaderboard');
  const evt = state.currentEvent;
  if(!evt){
    el.innerHTML = `<div class="loading-row">${t('leaderboard.noEventSelected')}</div>`;
    return;
  }
  const allRiders = evt.riders || [];
  const teams = evt.teams || [];
  const groups = (evt.categoryGroups || []).slice().sort((a,b) => a.sortOrder - b.sortOrder);
  const catFilters = state.leaderboardCategoryFilters || {};
  const cps = evt.checkpoints.slice().sort((a,b) => a.order - b.order);
  const mandatoryCps = cps.filter(c => c.mandatory);

  const q = state.leaderboardSearch.trim().toLowerCase();
  const filteredRiders = allRiders.filter(r =>
    (!q || String(r.bib).includes(q) || (r.name || '').toLowerCase().includes(q)) &&
    (!state.leaderboardTeamFilter || r.teamId === state.leaderboardTeamFilter) &&
    riderMatchesStatusFilter(r, state.leaderboardStatusFilter) &&
    groups.every(g => !catFilters[g.id] || (r.categories && r.categories[g.id] === catFilters[g.id]))
  );
  const sortMode = state.leaderboardSortMode || (evt.scoringMode === 'points' ? 'points' : 'time');
  const riders = sortRidersForLeaderboardView(filteredRiders, evt, sortMode);

  const activeFilters = [];
  if(state.leaderboardTeamFilter){
    const tm = teams.find(t => t.id === state.leaderboardTeamFilter);
    if(tm) activeFilters.push({label: tm.name, onclick: `removeLeaderboardFilter('team')`});
  }
  if(state.leaderboardStatusFilter){
    const statusLabels = {underway: t('leaderboard.statusUnderway'), arrived: t('checkin.statusArrived'), dnf: t('checkin.statusDnf'), dns: t('checkin.statusDns')};
    activeFilters.push({label: statusLabels[state.leaderboardStatusFilter] || state.leaderboardStatusFilter, onclick: `removeLeaderboardFilter('status')`});
  }
  groups.forEach(g => {
    if(catFilters[g.id]) activeFilters.push({label: `${g.name}: ${catFilters[g.id]}`, onclick: `removeLeaderboardFilter('category', '${g.id}')`});
  });
  const filterChipsHtml = activeFilters.length ? `
    <div class="leaderboard-filter-chips">
      ${activeFilters.map(f => `<span class="filter-chip">${escapeHtml(f.label)} <button type="button" onclick="${f.onclick}">&times;</button></span>`).join('')}
      <button type="button" class="filter-chip-reset" onclick="clearLeaderboardFilters()">${t('leaderboard.resetFilters')}</button>
    </div>
  ` : '';

  const arrivedCount = allRiders.filter(r => r.finishTime).length;
  const arrivalPct = allRiders.length ? Math.round((arrivedCount / allRiders.length) * 100) : 0;

  /* Check-ins, deren Startnummer oder Checkpoint es im Event nicht mehr
     gibt — etwa weil ein Checkpoint nach dem Kartendruck gelöscht wurde.
     Sie werden angezeigt statt verworfen: ein Fahrer, der nachweislich
     an einem Punkt war, darf nicht durch einen Konfigurationsfehler aus
     der Wertung fallen. */
  const orphanHtml = (evt.orphanCheckins || []).length ? `
    <div class="leaderboard-orphan-note">
      <strong>${t('riderApp.orphanHeading', {count: evt.orphanCheckins.length})}</strong>
      <div>${t('riderApp.orphanDesc')}</div>
      <ul>
        ${evt.orphanCheckins.slice(0, 10).map(o =>
          `<li>${t('riderApp.orphanRow', {bib: o.bib, cp: escapeHtml(o.cp_id || '—')})}</li>`
        ).join('')}
      </ul>
    </div>
  ` : '';

  const tabsHtml = `
    <div class="leaderboard-tabs">
      <button class="lb-tab-btn ${state.leaderboardTab === 'individual' ? 'active' : ''}" onclick="setLeaderboardTab('individual')">${t('leaderboard.individualTab')}</button>
      <button class="lb-tab-btn ${state.leaderboardTab === 'teams' ? 'active' : ''}" onclick="setLeaderboardTab('teams')">${t('leaderboard.teamsTab')}</button>
    </div>
  `;

  if(allRiders.length === 0){
    el.innerHTML = `
      <div class="leaderboard-page-head">
        <div class="leaderboard-page-stamp">🏆</div>
        <h2>${t('leaderboard.title')}</h2>
      </div>
      ${emptyStateHtml({
        icon: '🏆',
        title: t('leaderboard.noRidersYet'),
        description: t('leaderboard.setUpRidersFirst'),
        primaryAction: {label: t('ui.navRiders'), onclick: 'openRiders()'}
      })}
    `;
    return;
  }
  if((evt.status === 'planning' || evt.status === 'ready') && !allRiders.some(r => r.finishTime || r.raceStatus)){
    el.innerHTML = `
      <div class="leaderboard-page-head">
        <div class="leaderboard-page-stamp">🏆</div>
        <h2>${t('leaderboard.title')}</h2>
      </div>
      ${emptyStateHtml({
        icon: '⏳',
        title: t('leaderboard.raceNotStartedTitle'),
        description: t('leaderboard.raceNotStartedDesc')
      })}
    `;
    return;
  }

  if(state.leaderboardTab === 'teams'){
    const teamStats = computeTeamStats(evt);
    const relevantTime = ts => teamStats.scoringMode === 'allMustFinish' ? ts.worstTime : ts.bestTime;
    const teamRowsHtml = teamStats.teams.map(ts => `
      <tr>
        <td class="lb-rider">${teamBadgeHtml(evt, ts.team.id)}</td>
        <td>${ts.memberCount}</td>
        <td>${ts.arrived}</td>
        <td>${relevantTime(ts) ? formatDateTime(relevantTime(ts)) : '—'}</td>
        <td><span class="lb-progress-tag">${ts.doneMandatory}/${ts.memberCount * teamStats.mandatoryTotal} ${t('common.mandatory')}</span></td>
        ${teamStats.hasScoredCheckpoints ? `<td><span class="lb-progress-tag points${ts.totalScore === 0 ? ' zero' : ''}">${ts.totalScore} Pkt.</span></td>` : ''}
      </tr>
    `).join('');
    el.innerHTML = `
      <div class="leaderboard-page-head">
        <div class="leaderboard-page-stamp">🏆</div>
        <h2>${t('leaderboard.title')}</h2>
      </div>
      ${tabsHtml}
      ${orphanHtml}
      <div class="leaderboard-toolbar">
        <div class="leaderboard-stats"><span>${t(teamStats.teams.length === 1 ? 'leaderboard.teamCountSingular' : 'leaderboard.teamCountPlural', {count: teamStats.teams.length})}</span> <span class="lb-scoring-mode-tag">${teamStats.scoringMode === 'allMustFinish' ? t('rider.teamScoringAllMustFinish') : t('rider.teamScoringBestTime')}</span></div>
        <button class="btn" onclick="exportLeaderboardCSV()">${t('leaderboard.exportCsv')}</button>
      </div>
      <div class="leaderboard-scroll">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th class="lb-rider">${t('leaderboard.colTeam')}</th>
              <th>${t('leaderboard.colRider')}</th>
              <th>${t('leaderboard.colArrived')}</th>
              <th>${t('leaderboard.colTeamTime')}</th>
              <th>${t('leaderboard.colMandatoryDone')}</th>
              ${teamStats.hasScoredCheckpoints ? `<th>${t('leaderboard.colPoints')}</th>` : ''}
            </tr>
          </thead>
          <tbody>${teamRowsHtml || `<tr><td colspan="6" class="leaderboard-empty">${t('leaderboard.noTeamsYet')}</td></tr>`}</tbody>
        </table>
      </div>
    `;
    return;
  }

  const pointsScoring = evt.scoringMode === 'points';
  /* Rank badges follow the view's sort toggle (sortMode), not necessarily
     evt.scoringMode — a marshal sorting by CP-count should see #1/#2/#3
     match what's actually on top of the table. The extra Punkte/Zielzeit
     *columns* below stay tied to pointsScoring (the event's real scoring
     mode) since those are structural, not a view preference. */
  const rankedForBadges = sortMode === 'cpCount'
    ? sortRidersByCpCount(allRiders.filter(r => (r.name || '').trim() && r.finishTime))
    : sortMode === 'points'
    ? sortRidersByPoints(allRiders.filter(r => (r.name || '').trim()), evt)
    : allRiders.filter(r => r.finishTime).sort((a, b) => new Date(a.finishTime) - new Date(b.finishTime));
  const rankMap = new Map(rankedForBadges.map((r, i) => [r.bib, i + 1]));

  const hasScoredCheckpoints = cps.some(cp => getCheckpointType(cp.type).isScored);
  const headCps = cps.map(cp => `<th class="lb-cp ${cp.mandatory ? '' : 'optional'}" title="${escapeHtml(cp.name || '')}">${t('leaderboard.cpPrefix')}${String(cp.order).padStart(2,'0')}</th>`).join('');

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
          titleAttr += ' — ' + (twResult.reason === 'early' ? t('leaderboard.tooEarly') : t('leaderboard.tooLate')) + ' (' + formatTimeOnly(cpTimes[cp.id]) + ')';
        } else if(twResult && twResult.ok){
          titleAttr += ' — ' + t('leaderboard.inTimeWindow') + ' (' + formatTimeOnly(cpTimes[cp.id]) + ')';
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
        <td><span class="lb-progress-tag">${t('leaderboard.progressCell', {done: doneMandatory, total: mandatoryCps.length, doneAll: completed.length, totalAll: cps.length})}</span></td>
        ${hasScoredCheckpoints ? `<td><span class="lb-progress-tag points${totalScore === 0 ? ' zero' : ''}">${totalScore} Pkt.</span></td>` : ''}
        ${pointsScoring ? `<td><span class="lb-progress-tag points${pointsForRider(evt, r.bib) === 0 ? ' zero' : ''}" onclick="showPointsLedger(${r.bib})" title="${t('gameModes.ledgerClickHint')}" style="cursor:pointer;">${pointsForRider(evt, r.bib)} Pkt.</span></td><td>${r.finishTime ? formatDateTime(r.finishTime) : '—'}</td>` : ''}
      </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="leaderboard-page-head">
      <div class="leaderboard-page-stamp">🏆</div>
      <h2>${t('leaderboard.title')}</h2>
    </div>
    ${tabsHtml}
      ${orphanHtml}
    <div class="leaderboard-layout">
    <div class="leaderboard-main">
    <div class="leaderboard-toolbar">
      <div class="lb-sort-segmented">
        <button type="button" class="${sortMode === 'points' ? 'active' : ''}" onclick="setLeaderboardSortMode('points')">${t('leaderboard.sortByPoints')}</button>
        <button type="button" class="${sortMode === 'time' ? 'active' : ''}" onclick="setLeaderboardSortMode('time')">${t('leaderboard.sortByTime')}</button>
        <button type="button" class="${sortMode === 'cpCount' ? 'active' : ''}" onclick="setLeaderboardSortMode('cpCount')">${t('leaderboard.sortByCpCount')}</button>
      </div>
      <div class="leaderboard-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="leaderboard-search-input" placeholder="${t('leaderboard.searchPlaceholder')}" value="${escapeHtml(state.leaderboardSearch)}" oninput="onLeaderboardSearchInput(this.value)">
      </div>
      <select class="leaderboard-status-filter" onchange="onLeaderboardStatusFilterChange(this.value)">
        <option value="">${t('leaderboard.allStatuses')}</option>
        <option value="underway" ${state.leaderboardStatusFilter === 'underway' ? 'selected' : ''}>${t('leaderboard.statusUnderway')}</option>
        <option value="arrived" ${state.leaderboardStatusFilter === 'arrived' ? 'selected' : ''}>${t('checkin.statusArrived')}</option>
        <option value="dnf" ${state.leaderboardStatusFilter === 'dnf' ? 'selected' : ''}>${t('checkin.statusDnf')}</option>
        <option value="dns" ${state.leaderboardStatusFilter === 'dns' ? 'selected' : ''}>${t('checkin.statusDns')}</option>
        ${(evt.riders || []).some(r => r.raceStatus === 'eliminated') ? `<option value="eliminated" ${state.leaderboardStatusFilter === 'eliminated' ? 'selected' : ''}>${t('gameModes.eliminatedStatus')}</option>` : ''}
      </select>
      ${teams.length ? `
        <select class="leaderboard-team-filter" onchange="onLeaderboardTeamFilterChange(this.value)">
          <option value="">${t('leaderboard.allTeams')}</option>
          ${teams.map(tm => `<option value="${tm.id}" ${state.leaderboardTeamFilter === tm.id ? 'selected' : ''}>${escapeHtml(tm.name)}</option>`).join('')}
        </select>
      ` : ''}
      ${groups.map(g => `
        <select class="leaderboard-category-filter" onchange="onLeaderboardCategoryFilterChange('${g.id}', this.value)">
          <option value="">${escapeHtml(g.name)}</option>
          ${g.options.map(opt => `<option value="${escapeHtml(opt)}" ${catFilters[g.id] === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
        </select>
      `).join('')}
      <div class="leaderboard-stats">
        <div class="leaderboard-progress-bar"><div class="leaderboard-progress-fill" style="width:${arrivalPct}%"></div></div>
        <span><b>${arrivedCount}</b> ${t('leaderboard.ridersArrived', {total: allRiders.length})}</span>
      </div>
      ${teams.length || groups.length ? `
        <select class="leaderboard-csv-split" onchange="state.leaderboardCsvSplitKey = this.value;">
          <option value="">${t('leaderboard.splitByNone')}</option>
          ${teams.length ? `<option value="team">${t('leaderboard.splitByTeam')}</option>` : ''}
          ${groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('')}
        </select>
      ` : ''}
      <button class="btn" onclick="exportLeaderboardCSV(state.leaderboardCsvSplitKey)">${t('leaderboard.exportCsv')}</button>
    </div>
    ${filterChipsHtml}
    <div class="leaderboard-scroll">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th class="lb-rider">${t('leaderboard.colRider')}</th>
            ${headCps}
            <th>${t('leaderboard.colStatus')}</th>
            <th>${t('leaderboard.colProgress')}</th>
            ${hasScoredCheckpoints ? `<th>${t('leaderboard.colPoints')}</th>` : ''}
            ${pointsScoring ? `<th>${t('gameModes.colGameModePoints')}</th><th>${t('gameModes.colFinishTime')}</th>` : ''}
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${cps.length + (hasScoredCheckpoints ? 4 : 3) + (pointsScoring ? 2 : 0)}" class="leaderboard-empty">${t('leaderboard.noRidersFound')}</td></tr>`}</tbody>
      </table>
    </div>
    </div>
    ${renderLeaderboardSidebar(evt)}
    </div>
  `;
}
