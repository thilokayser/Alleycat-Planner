/* ---------------- season: model + CRUD ----------------
   Bündelt mehrere abgeschlossene Events zu einer Serie/Saison, über die
   das Liga-System (league.js) Team- und Fahrer-Wertungen aggregiert.
   Speicherform ist bewusst identisch zu Events: ein Stub-Array
   (`seasons:index`) plus ein Voll-Blob pro Saison (`season:<id>`) — der
   exakte Aufbau, den dashboard.js für Events schon nutzt (siehe
   createNewEvent()/confirmDeleteEvent()), damit hier kein zweites
   Speichermuster entsteht. */
function withSeasonDefaults(season){
  return Object.assign({
    id: '',
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    linkedEventIds: [],
    teamPointsTable: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    riderPointsTable: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    pointsForParticipation: 0,
    createdAt: ''
  }, season);
}

async function loadSeasonsIndex(){
  try{
    const res = await storageGet('seasons:index');
    state.seasonsIndex = res ? JSON.parse(res.value) : [];
  }catch(e){ state.seasonsIndex = []; }
}
async function saveSeasonsIndex(){
  await storageSet('seasons:index', JSON.stringify(state.seasonsIndex));
}
async function loadSeason(id){
  try{
    const res = await storageGet('season:' + id);
    return res ? withSeasonDefaults(JSON.parse(res.value)) : null;
  }catch(e){ return null; }
}
async function saveSeason(season){
  await storageSet('season:' + season.id, JSON.stringify(season));
  state.leagueStandingsCache = null;
}

async function createNewSeason(){
  const id = uid('season');
  const season = withSeasonDefaults({id, name: t('league.newSeasonDefaultName'), createdAt: new Date().toISOString()});
  state.seasonsIndex.push({id, name: season.name, startDate: '', endDate: ''});
  await saveSeasonsIndex();
  await saveSeason(season);
  state.selectedSeasonId = id;
  renderLeague();
}
function askDeleteSeason(id){
  state.confirmDeleteSeasonId = id;
  renderLeague();
}
async function confirmDeleteSeason(id){
  state.seasonsIndex = state.seasonsIndex.filter(s => s.id !== id);
  await saveSeasonsIndex();
  await storageDelete('season:' + id);
  state.confirmDeleteSeasonId = null;
  if(state.selectedSeasonId === id) state.selectedSeasonId = null;
  state.leagueStandingsCache = null;
  renderLeague();
}
async function renameSeason(id, name){
  const season = await loadSeason(id);
  if(!season) return;
  season.name = name;
  await saveSeason(season);
  const stub = state.seasonsIndex.find(s => s.id === id);
  if(stub) stub.name = name;
  await saveSeasonsIndex();
}
async function updateSeasonDates(id, startDate, endDate){
  const season = await loadSeason(id);
  if(!season) return;
  season.startDate = startDate;
  season.endDate = endDate;
  await saveSeason(season);
  const stub = state.seasonsIndex.find(s => s.id === id);
  if(stub){ stub.startDate = startDate; stub.endDate = endDate; }
  await saveSeasonsIndex();
}
async function linkEventToSeason(seasonId, eventId){
  const season = await loadSeason(seasonId);
  if(!season || season.linkedEventIds.includes(eventId)) return;
  season.linkedEventIds.push(eventId);
  await saveSeason(season);
  renderLeague();
}
async function unlinkEventFromSeason(seasonId, eventId){
  const season = await loadSeason(seasonId);
  if(!season) return;
  season.linkedEventIds = season.linkedEventIds.filter(id => id !== eventId);
  await saveSeason(season);
  renderLeague();
}
async function updateSeasonPointsTable(seasonId, which, tableArray){
  const season = await loadSeason(seasonId);
  if(!season) return;
  if(which === 'team') season.teamPointsTable = tableArray;
  else if(which === 'rider') season.riderPointsTable = tableArray;
  await saveSeason(season);
  renderLeague();
}
function parsePointsTableInput(value){
  return (value || '').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0);
}
async function exportSeasonJSON(id){
  const season = await loadSeason(id);
  if(!season) return;
  const filename = (season.name || 'season').replace(/\s+/g, '_').toLowerCase() + '-liga.json';
  downloadJSON(season, filename);
}
