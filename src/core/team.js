/* ---------------- teams ---------------- */
const TEAM_COLOR_PALETTE = ['#ff5f1f', '#5c8a5c', '#b23a2e', '#7c8388', '#ff8a3d', '#3a6ea5', '#8a5cb2'];
function getTeam(evt, teamId){
  if(!teamId) return null;
  return (evt.teams || []).find(t => t.id === teamId) || null;
}
function teamBadgeHtml(evt, teamId){
  const team = getTeam(evt, teamId);
  if(!team) return '';
  return `<span class="team-badge" title="${escapeHtml(team.name)}"><span class="team-dot" style="background:${escapeHtml(team.color)}"></span>${escapeHtml(team.name)}</span>`;
}
function onRiderTeamChange(bib, teamId){
  const r = (state.currentEvent.riders || []).find(r => r.bib === bib);
  if(!r) return;
  r.teamId = teamId || null;
  debouncedSave();
}
function toggleNewTeamForm(){
  state.newTeamFormOpen = !state.newTeamFormOpen;
  renderRiders();
}
function addTeam(){
  const name = (document.getElementById('newteam-name').value || '').trim();
  if(!name){ alert(t('team.namePrompt')); return; }
  const evt = state.currentEvent;
  const colorInput = document.getElementById('newteam-color').value;
  const color = colorInput || TEAM_COLOR_PALETTE[(evt.teams || []).length % TEAM_COLOR_PALETTE.length];
  evt.teams = evt.teams || [];
  evt.teams.push({id: uid('team'), name, color});
  state.newTeamFormOpen = false;
  debouncedSave();
  renderRiders();
}
function renameTeam(id, name){
  const team = getTeam(state.currentEvent, id);
  if(!team) return;
  team.name = name;
  debouncedSave();
}
function setTeamColor(id, color){
  const team = getTeam(state.currentEvent, id);
  if(!team) return;
  team.color = color;
  debouncedSave();
  renderRiders();
}
function deleteTeam(id){
  if(!confirm(t('team.deleteConfirm'))) return;
  const evt = state.currentEvent;
  evt.teams = (evt.teams || []).filter(t => t.id !== id);
  (evt.riders || []).forEach(r => { if(r.teamId === id) r.teamId = null; });
  debouncedSave();
  renderRiders();
}
function onTeamScoringModeChange(mode){
  const evt = state.currentEvent;
  if(!evt) return;
  evt.teamScoringMode = mode;
  debouncedSave();
  render();
}

function computeTeamStats(evt){
  const riders = evt.riders || [];
  const mandatoryCps = evt.checkpoints.filter(c => c.mandatory);
  const hasScoredCheckpoints = evt.checkpoints.some(cp => getCheckpointType(cp.type).isScored);
  const mode = evt.teamScoringMode === 'allMustFinish' ? 'allMustFinish' : 'bestTime';
  const teams = (evt.teams || []).map(t => {
    const members = riders.filter(r => r.teamId === t.id);
    const arrivedMembers = members.filter(r => r.finishTime);
    const arrived = arrivedMembers.length;
    const finishTimes = arrivedMembers.map(r => new Date(r.finishTime).getTime()).filter(ms => !isNaN(ms));
    const bestTime = finishTimes.length ? Math.min(...finishTimes) : null;
    const allFinished = members.length > 0 && arrived === members.length;
    const worstTime = allFinished && finishTimes.length ? Math.max(...finishTimes) : null;
    const doneMandatory = members.reduce((sum, r) => sum + mandatoryCps.filter(cp => (r.completed || []).includes(cp.id)).length, 0);
    const totalScore = members.reduce((sum, r) => sum + Object.values(r.scores || {}).reduce((s, v) => s + (Number(v) || 0), 0), 0);
    return {team: t, memberCount: members.length, arrived, doneMandatory, totalScore, bestTime, worstTime, allFinished};
  });
  if(mode === 'allMustFinish'){
    teams.sort((a, b) => {
      if(a.allFinished !== b.allFinished) return a.allFinished ? -1 : 1;
      if(a.allFinished && b.allFinished) return a.worstTime - b.worstTime;
      return b.arrived - a.arrived || b.totalScore - a.totalScore;
    });
  } else {
    teams.sort((a, b) => {
      if(!!a.bestTime !== !!b.bestTime) return a.bestTime ? -1 : 1;
      if(a.bestTime && b.bestTime) return a.bestTime - b.bestTime;
      return b.arrived - a.arrived || b.totalScore - a.totalScore;
    });
  }
  return {teams, hasScoredCheckpoints, mandatoryTotal: mandatoryCps.length, scoringMode: mode};
}
