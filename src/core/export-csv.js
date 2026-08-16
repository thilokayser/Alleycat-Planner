function csvEscape(v){
  let s = String(v == null ? '' : v);
  if(/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportLeaderboardCSV(){
  const evt = state.currentEvent;
  const allRiders = evt ? (evt.riders || []) : [];
  if(!allRiders.length){ alert('Noch keine Fahrerliste angelegt.'); return; }

  const cps = evt.checkpoints.slice().sort((a, b) => a.order - b.order);
  const mandatoryCps = cps.filter(c => c.mandatory);
  const hasScoredCheckpoints = cps.some(cp => getCheckpointType(cp.type).isScored);
  const riders = sortRidersForOverview(allRiders);
  const arrivedSorted = allRiders.filter(r => r.finishTime).sort((a, b) => new Date(a.finishTime) - new Date(b.finishTime));
  const rankMap = new Map(arrivedSorted.map((r, i) => [r.bib, i + 1]));

  const header = ['Rang', 'Bib', 'Name', 'Team', 'Zielzeit', 'Status',
    ...cps.map(cp => 'CP-' + String(cp.order).padStart(2, '0') + ' ' + (cp.name || '')),
    'Pflicht erledigt', 'Gesamt erledigt', ...(hasScoredCheckpoints ? ['Punkte gesamt'] : [])];
  const lines = [header.map(csvEscape).join(';')];

  riders.forEach(r => {
    const completed = r.completed || [];
    const scores = r.scores || {};
    const doneMandatory = mandatoryCps.filter(cp => completed.includes(cp.id)).length;
    const totalScore = Object.values(scores).reduce((sum, v) => sum + (Number(v) || 0), 0);
    const cpValues = cps.map(cp => {
      if(!completed.includes(cp.id)) return '';
      const type = getCheckpointType(cp.type);
      return type.isScored && scores[cp.id] !== undefined ? String(scores[cp.id]) : 'x';
    });
    const row = [
      rankMap.get(r.bib) || '',
      r.bib,
      r.name || '',
      getTeam(evt, r.teamId)?.name || '',
      r.finishTime ? formatDateTime(r.finishTime) : '',
      riderStatusBadgeHtml(evt, r).replace(/<[^>]*>/g, ''),
      ...cpValues,
      `${doneMandatory}/${mandatoryCps.length}`,
      `${completed.length}/${cps.length}`,
      ...(hasScoredCheckpoints ? [totalScore] : [])
    ];
    lines.push(row.map(csvEscape).join(';'));
  });

  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (evt.name || 'leaderboard').replace(/\s+/g, '_').toLowerCase() + '-ergebnisse.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

