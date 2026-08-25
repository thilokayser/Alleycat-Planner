function csvEscape(v){
  let s = String(v == null ? '' : v);
  if(/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function buildLeaderboardCsvLines(evt, ridersSubset, rankMap, cps, mandatoryCps, hasScoredCheckpoints){
  const header = [t('exportCsv.colRank'), t('exportCsv.colBib'), t('exportCsv.colName'), t('exportCsv.colTeam'), t('exportCsv.colFinishTime'), t('exportCsv.colStatus'),
    ...cps.map(cp => t('leaderboard.cpPrefix') + String(cp.order).padStart(2, '0') + ' ' + (cp.name || '')),
    t('exportCsv.colMandatoryDone'), t('exportCsv.colTotalDone'), ...(hasScoredCheckpoints ? [t('exportCsv.colTotalPoints')] : [])];
  const lines = [header.map(csvEscape).join(';')];
  sortRidersForOverview(ridersSubset).forEach(r => {
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
  return lines;
}
function buildLeaderboardSplitBuckets(evt, splitKey){
  const allRiders = evt.riders || [];
  if(splitKey === 'team'){
    const buckets = (evt.teams || []).map(tm => ({label: tm.name, riders: allRiders.filter(r => r.teamId === tm.id)}));
    buckets.push({label: t('rider.noTeam'), riders: allRiders.filter(r => !r.teamId)});
    return buckets;
  }
  const group = (evt.categoryGroups || []).find(g => g.id === splitKey);
  if(!group) return null;
  const buckets = group.options.map(opt => ({label: `${group.name}: ${opt}`, riders: allRiders.filter(r => r.categories && r.categories[group.id] === opt)}));
  buckets.push({label: `${group.name}: ${t('category.noCategory')}`, riders: allRiders.filter(r => !r.categories || !r.categories[group.id])});
  return buckets;
}
function exportLeaderboardCSV(splitKey){
  const evt = state.currentEvent;
  const allRiders = evt ? (evt.riders || []) : [];
  if(!allRiders.length){ alert(t('leaderboard.noRidersYet')); return; }

  const cps = evt.checkpoints.slice().sort((a, b) => a.order - b.order);
  const mandatoryCps = cps.filter(c => c.mandatory);
  const hasScoredCheckpoints = cps.some(cp => getCheckpointType(cp.type).isScored);
  const arrivedSorted = allRiders.filter(r => r.finishTime).sort((a, b) => new Date(a.finishTime) - new Date(b.finishTime));
  const rankMap = new Map(arrivedSorted.map((r, i) => [r.bib, i + 1]));

  const buckets = splitKey ? buildLeaderboardSplitBuckets(evt, splitKey) : null;
  let lines = [];
  if(buckets){
    buckets.forEach(bucket => {
      if(!bucket.riders.length) return;
      if(lines.length) lines.push('');
      lines.push(csvEscape(bucket.label));
      lines = lines.concat(buildLeaderboardCsvLines(evt, bucket.riders, rankMap, cps, mandatoryCps, hasScoredCheckpoints));
    });
  } else {
    lines = buildLeaderboardCsvLines(evt, allRiders, rankMap, cps, mandatoryCps, hasScoredCheckpoints);
  }

  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  downloadBlob(blob, (evt.name || 'leaderboard').replace(/\s+/g, '_').toLowerCase() + '-ergebnisse.csv');
}

