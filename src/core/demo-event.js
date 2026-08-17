/* ---------------- demo event (first-run example) ----------------
   Seeded once into a brand-new, empty local install so a first-time
   user has something real to click through instead of an empty
   dashboard. Fictional "Kölner Kurierrennen" inspired by real Cologne
   courier-culture alleycats — checkpoint names reference real Cologne
   landmarks for flavor, but the event, riders and results are invented
   for demonstration purposes and coordinates are approximate, not
   surveyed. Deliberately built with withEventDefaults()/withCheckpointDefaults()/
   withRiderDefaults(), the same constructors a real event goes through,
   so this stays valid automatically as those shapes evolve. See
   seedDemoEventIfNeeded() (storage-local.js) for when this runs. */
function buildDemoEvent(){
  const now = new Date();
  const start = new Date(now.getTime() - 100 * 60000);
  const atMin = (min) => toLocalDateTimeInputValue(new Date(start.getTime() + min * 60000));

  const cp1 = withCheckpointDefaults({id: uid('cp'), order: 1, lat: 50.9295, lng: 6.9350, name: 'Zülpicher Platz', type: 'qr', mandatory: true, clue: 'Start & erster Stempel direkt am Brunnen.', punchCode: 'ZP-01'});
  const cp2 = withCheckpointDefaults({id: uid('cp'), order: 2, lat: 50.9413, lng: 6.9583, name: 'Kölner Dom – Domplatte', type: 'photo', mandatory: true, clue: 'Beweisfoto: Rad vor dem Südportal des Doms.', punchCode: 'Rad + Südportal im Bild'});
  const cp3 = withCheckpointDefaults({id: uid('cp'), order: 3, lat: 50.9413, lng: 6.9655, name: 'Hohenzollernbrücke (Deutz-Seite)', type: 'item', mandatory: true, clue: 'Route-Postkarte in den Kasten am Brückenkopf werfen.', punchCode: 'Postkarte abgeben'});
  const cp4 = withCheckpointDefaults({id: uid('cp'), order: 4, lat: 50.9275, lng: 6.9668, name: 'Rheinauhafen – Kranhäuser', type: 'custom', mandatory: false, clue: 'Bonus: Blick auf die Kranhäuser vom Rheinufer aus.', customQuestion: 'Wie viele Kranhäuser stehen nebeneinander am Rheinauhafen?'});
  const cp5 = withCheckpointDefaults({id: uid('cp'), order: 5, lat: 50.9548, lng: 6.9556, name: 'Ebertplatz', type: 'challenge', mandatory: false, clue: 'Bonus: Zeig deinen besten Trackstand für Punkte.'});
  const cp6 = withCheckpointDefaults({
    id: uid('cp'), order: 6, lat: 50.9251, lng: 6.9553, name: 'Chlodwigplatz', type: 'qr', mandatory: true,
    clue: 'Letzter Stempel vor dem Ziel am Ubierring.', punchCode: 'CP-06',
    timeWindowEnabled: true, timeWindowStart: atMin(40), timeWindowEnd: atMin(75)
  });
  const checkpoints = [cp1, cp2, cp3, cp4, cp5, cp6];

  const teamDom = {id: uid('team'), name: 'Team Dom-Sprint', color: '#3a6ea5'};
  const teamKranhaus = {id: uid('team'), name: 'Team Kranhaus', color: '#5c8a5c'};

  const FIXED = t('category.presetFixed'), FREE = t('category.presetFree');
  const catAntrieb = withCategoryGroupDefaults({id: uid('catgrp'), name: t('category.presetDrivetrainName'), options: [FIXED, FREE], sortOrder: 0});

  function rider(bib, name, teamId, category, timeline, extra){
    const r = withRiderDefaults(Object.assign({
      bib, name, teamId: teamId || null,
      categories: category ? {[catAntrieb.id]: category} : {}
    }, extra));
    timeline.forEach(([cp, minOffset, score]) => {
      r.completed.push(cp.id);
      r.checkpointTimes[cp.id] = atMin(minOffset);
      if(score != null) r.scores[cp.id] = score;
    });
    return r;
  }

  const riders = [
    rider(1, 'Jonas Bergmann', teamDom.id, FIXED, [[cp1, 2], [cp2, 14], [cp3, 24], [cp4, 38], [cp5, 50, 8], [cp6, 60]], {finishTime: atMin(64)}),
    rider(2, 'Lea Winter', teamKranhaus.id, FREE, [[cp1, 3], [cp2, 16], [cp3, 27], [cp4, 41], [cp5, 54, 6], [cp6, 63]], {finishTime: atMin(67)}),
    rider(3, 'Kai Radtke', teamDom.id, FIXED, [[cp1, 4], [cp2, 18], [cp3, 30], [cp4, 44], [cp6, 66]], {finishTime: atMin(70)}),
    rider(4, 'Mona Specht', null, FREE, [[cp1, 5], [cp2, 20], [cp3, 33], [cp4, 47], [cp5, 57, 5], [cp6, 69]], {finishTime: atMin(73)}),
    rider(5, 'Tom Gerlach', teamKranhaus.id, null, [[cp1, 6], [cp2, 22], [cp3, 36]], {raceStatus: 'dnf'}),
    rider(6, 'Nina Böckler', null, null, [[cp1, 8], [cp2, 25]], {}),
    rider(7, 'Ben Kessler', null, null, [], {}),
    rider(8, 'Sara Lenz', teamDom.id, null, [], {raceStatus: 'dns'})
  ];

  return withEventDefaults({
    id: uid('evt'),
    name: 'Kölner Kurierrennen (Beispiel)',
    date: toLocalDateTimeInputValue(now).slice(0, 10),
    description: 'Beispiel-Event, damit du direkt siehst, wie ein Alleycat in Alleycat Dispatch aussieht.',
    status: 'completed',
    statusChangedAt: atMin(90),
    startConfirmedAt: toLocalDateTimeInputValue(start),
    expectedRiders: riders.length,
    checkpoints,
    riders,
    teams: [teamDom, teamKranhaus],
    categoryGroups: [catAntrieb],
    bibsPrinted: true,
    spokecardsPrinted: true,
    manifestGenerated: true
  });
}
