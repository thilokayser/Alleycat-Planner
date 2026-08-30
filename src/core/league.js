/* ---------------- league: cross-event standings ----------------
   Rechnet für eine Saison (season.js) Team- und Fahrer-Wertungen über
   alle verknüpften, ABGESCHLOSSENEN Events zusammen — laufende oder
   noch nicht gestartete Events zählen bewusst nicht mit (kein
   Doppelzählen, keine instabile Zwischenwertung, siehe
   withSeasonDefaults()-Kommentar in season.js). Platzierung pro Event
   kommt aus der bestehenden Event-eigenen Rangliste
   (computeTeamStats()/Fahrer-Ranking aus leaderboard.js) — die Liga
   erfindet keine eigene Rangermittlung, sie übersetzt nur "Platz X in
   Event Y" in Liga-Punkte über die pro Saison konfigurierbare
   Punktetabelle (Motorsport-Stil: Tabellenindex 0 = Platz 1). */

/* Wie computeLeaderboardPodium(), aber ohne den Top-3-Schnitt — die
   Liga-Punktetabelle kann mehr als drei Plätze vergeben. */
function rankRidersForEvent(evt){
  const named = (evt.riders || []).filter(r => (r.name || '').trim());
  return evt.scoringMode === 'points'
    ? sortRidersByPoints(named, evt)
    : named.filter(r => r.finishTime).sort((a, b) => new Date(a.finishTime) - new Date(b.finishTime));
}

function pointsForPlacement(pointsTable, pointsForParticipation, index){
  if(index < pointsTable.length) return pointsTable[index];
  return pointsForParticipation;
}

/* Reine Funktion — keine I/O. `loadedEvents` sind bereits geladene
   Event-Objekte (siehe loadSeasonEventsAndCompute()), damit sich das
   hier isoliert mit Fixture-Daten testen lässt (test-suite.js). */
function computeLeagueStandings(season, loadedEvents){
  const teamMap = new Map();
  const riderMap = new Map();
  const pendingEvents = [];

  (season.linkedEventIds || []).forEach(eventId => {
    const evt = loadedEvents.find(e => e && e.id === eventId);
    if(!evt) return;
    if(evt.status !== 'completed'){
      pendingEvents.push({id: evt.id, name: evt.name, date: evt.date});
      return;
    }

    const teamStats = computeTeamStats(evt);
    teamStats.teams.forEach((ts, i) => {
      const rosterTeamId = ts.team.rosterTeamId;
      if(!rosterTeamId) return;
      const rosterTeam = getRosterTeam(rosterTeamId);
      if(!rosterTeam) return;
      if(!teamMap.has(rosterTeamId)) teamMap.set(rosterTeamId, {rosterTeamId, rosterTeam, totalPoints: 0, perEvent: [], eventsCompleted: 0, eventsPending: 0});
      const row = teamMap.get(rosterTeamId);
      const pointsAwarded = pointsForPlacement(season.teamPointsTable, season.pointsForParticipation, i);
      row.totalPoints += pointsAwarded;
      row.eventsCompleted++;
      row.perEvent.push({eventId: evt.id, eventName: evt.name, eventDate: evt.date, placement: i + 1, pointsAwarded});
    });

    rankRidersForEvent(evt).forEach((r, i) => {
      const rosterRiderId = r.rosterRiderId;
      if(!rosterRiderId) return;
      const rosterRider = getRosterRider(rosterRiderId);
      if(!rosterRider) return;
      if(!riderMap.has(rosterRiderId)) riderMap.set(rosterRiderId, {rosterRiderId, rosterRider, totalPoints: 0, perEvent: [], eventsCompleted: 0, eventsPending: 0});
      const row = riderMap.get(rosterRiderId);
      const pointsAwarded = pointsForPlacement(season.riderPointsTable, season.pointsForParticipation, i);
      row.totalPoints += pointsAwarded;
      row.eventsCompleted++;
      row.perEvent.push({eventId: evt.id, eventName: evt.name, eventDate: evt.date, placement: i + 1, pointsAwarded});
    });
  });

  const byPointsDesc = (a, b) => b.totalPoints - a.totalPoints;
  return {
    teamRows: Array.from(teamMap.values()).sort(byPointsDesc),
    riderRows: Array.from(riderMap.values()).sort(byPointsDesc),
    pendingEvents
  };
}

async function loadSeasonEventsAndCompute(season){
  const loadedEvents = await Promise.all(season.linkedEventIds.map(loadEvent));
  return computeLeagueStandings(season, loadedEvents.map(withEventDefaults));
}

async function refreshLeagueStandings(){
  if(!state.selectedSeasonId) return;
  const season = await loadSeason(state.selectedSeasonId);
  if(!season) return;
  state.leagueStandingsCache = await loadSeasonEventsAndCompute(season);
  renderLeague();
}

function setLeagueStandingsTab(tab){
  state.leagueStandingsTab = tab;
  renderLeague();
}

/* ---------------- render ---------------- */
function openLeague(){
  state.view = 'league';
  state.currentEvent = null;
  render();
}
function selectSeason(id){
  state.selectedSeasonId = id;
  state.leagueStandingsCache = null;
  renderLeague();
  refreshLeagueStandings();
}
function backToSeasonList(){
  state.selectedSeasonId = null;
  renderLeague();
}

function renderSeasonListView(){
  const cards = state.seasonsIndex.map(s => {
    if(state.confirmDeleteSeasonId === s.id){
      return `
        <div class="event-card">
          <h3>${escapeHtml(s.name)}</h3>
          <div class="confirm-row">
            ${t('league.deleteSeasonConfirm')}
            <div class="row2" style="display:flex; gap:8px; margin-top:6px;">
              <button class="btn btn-danger btn-sm" onclick="confirmDeleteSeason('${s.id}')" style="flex:1;">${t('common.delete')}</button>
              <button class="btn btn-ghost btn-sm" onclick="state.confirmDeleteSeasonId=null; renderLeague();" style="flex:1;">${t('common.cancel')}</button>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="event-card" onclick="selectSeason('${s.id}')">
        <h3>${escapeHtml(s.name || t('league.unnamedSeason'))}</h3>
        <div class="meta">${escapeHtml(s.startDate || '—')} – ${escapeHtml(s.endDate || '—')}</div>
        <div class="event-card-actions">
          <button class="btn btn-sm" onclick="event.stopPropagation(); exportSeasonJSON('${s.id}')">${t('common.export')}</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); askDeleteSeason('${s.id}')">${t('common.delete')}</button>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="dash-head">
      <div>
        <h2>${t('league.title')}</h2>
        <p>${t('league.intro')}</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="goDashboard()">${t('ui.backToAllEvents')}</button>
        <button class="btn btn-primary" onclick="createNewSeason()">${t('league.newSeason')}</button>
      </div>
    </div>
    ${state.seasonsIndex.length === 0 ? `
      <div class="empty-state">
        <div class="display">${t('league.emptyTitle')}</div>
        <p>${t('league.emptyHint')}</p>
        <div style="margin-top:16px;"><button class="btn btn-primary" onclick="createNewSeason()">${t('league.newSeason')}</button></div>
      </div>
    ` : `<div class="event-grid">${cards}</div>`}
  `;
}

function renderStandingsTable(rows, kind){
  const header = kind === 'teams'
    ? `<th>${t('league.colTeam')}</th>`
    : `<th>${t('league.colRider')}</th>`;
  const bodyRows = rows.map((row, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${kind === 'teams' ? rosterTeamBadgeHtml(row.rosterTeamId) : escapeHtml(row.rosterRider.name)}</td>
      <td>${row.totalPoints}</td>
      <td>${row.eventsCompleted}</td>
    </tr>
  `).join('');
  return `
    <table class="leaderboard-table">
      <thead><tr><th>${t('league.colRank')}</th>${header}<th>${t('league.colPoints')}</th><th>${t('league.colEventsCounted')}</th></tr></thead>
      <tbody>${bodyRows || `<tr><td colspan="4" class="leaderboard-empty">${t('league.noStandingsYet')}</td></tr>`}</tbody>
    </table>
  `;
}

async function renderSeasonDetailView(){
  const season = await loadSeason(state.selectedSeasonId);
  if(!season){ state.selectedSeasonId = null; renderLeague(); return; }
  const linkableEvents = state.eventsIndex.filter(e => !season.linkedEventIds.includes(e.id));
  const standings = state.leagueStandingsCache;

  const el = document.getElementById('view-league');
  el.innerHTML = `
    <div class="dash-head">
      <div>
        <h2><input type="text" class="team-name-input" value="${escapeHtml(season.name)}" onchange="renameSeason('${season.id}', this.value)"></h2>
        <p>${t('league.linkedEventsCount', {count: season.linkedEventIds.length})}</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="backToSeasonList()">${t('common.back')}</button>
      </div>
    </div>

    <div class="settings-section">
      <h3>${t('league.linkedEventsHeading')}</h3>
      <div class="type-list">
        ${season.linkedEventIds.map(id => {
          const stub = state.eventsIndex.find(e => e.id === id);
          const pending = standings && standings.pendingEvents.some(p => p.id === id);
          return `
            <div class="type-row">
              <div class="type-info">
                <div class="type-name">${escapeHtml(stub ? stub.name : id)}</div>
                ${pending ? `<div class="type-meta">${t('league.pendingBadge')}</div>` : ''}
              </div>
              <button class="btn btn-sm btn-danger" onclick="unlinkEventFromSeason('${season.id}', '${id}')">${t('league.unlinkEvent')}</button>
            </div>
          `;
        }).join('') || `<p class="settings-hint">${t('league.noEventsLinked')}</p>`}
      </div>
      ${linkableEvents.length ? `
        <div class="settings-form">
          <select id="link-event-select">
            ${linkableEvents.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')}
          </select>
          <button class="btn" onclick="linkEventToSeason('${season.id}', document.getElementById('link-event-select').value).then(refreshLeagueStandings)">${t('league.linkEvent')}</button>
        </div>
      ` : ''}
    </div>

    <div class="settings-section">
      <h3>${t('league.pointsTableHeading')}</h3>
      <div class="settings-section-desc">${t('league.pointsTableDesc')}</div>
      <label>${t('league.teamPointsTableLabel')}</label>
      <input type="text" value="${season.teamPointsTable.join(', ')}" onchange="updateSeasonPointsTable('${season.id}', 'team', parsePointsTableInput(this.value)).then(refreshLeagueStandings)">
      <label>${t('league.riderPointsTableLabel')}</label>
      <input type="text" value="${season.riderPointsTable.join(', ')}" onchange="updateSeasonPointsTable('${season.id}', 'rider', parsePointsTableInput(this.value)).then(refreshLeagueStandings)">
    </div>

    <div class="leaderboard-toolbar">
      <div class="leaderboard-tabs">
        <button class="lb-tab-btn ${state.leagueStandingsTab === 'teams' ? 'active' : ''}" onclick="setLeagueStandingsTab('teams')">${t('league.teamsTab')}</button>
        <button class="lb-tab-btn ${state.leagueStandingsTab === 'riders' ? 'active' : ''}" onclick="setLeagueStandingsTab('riders')">${t('league.ridersTab')}</button>
      </div>
      <button class="btn" onclick="${state.leagueStandingsTab === 'teams' ? `exportTeamStandingsCSV('${season.id}')` : `exportRiderStandingsCSV('${season.id}')`}">${t('league.exportCsv')}</button>
    </div>
    <div class="leaderboard-scroll">
      ${!standings ? `<p class="settings-hint">${t('league.calculating')}</p>`
        : state.leagueStandingsTab === 'teams' ? renderStandingsTable(standings.teamRows, 'teams') : renderStandingsTable(standings.riderRows, 'riders')}
    </div>
  `;
}

function renderLeague(){
  const el = document.getElementById('view-league');
  if(!el) return;
  if(!state.selectedSeasonId){
    el.innerHTML = renderSeasonListView();
    return;
  }
  renderSeasonDetailView();
}
