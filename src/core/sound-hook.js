/* ---------------- sound hook ----------------
   Eigenständiges, wiederverwendbares Modul (nicht nur für den Beamer) —
   registriert Base64-Data-URLs pro Event unter einem SOUND_EVENTS-Key
   und spielt sie ab. play() wirft nie, sondern liefert per Promise
   zurück ob die Wiedergabe geklappt hat (false bei fehlendem Sound
   oder Autoplay-Block) — Aufrufer entscheiden selbst, ob dafür ein
   optisches Fallback (z. B. „Klicken zum Aktivieren") nötig ist. */
const AlleycatSounds = {
  sounds: {},
  register(key, url){
    if(!url) return;
    const a = new Audio(url);
    a.preload = 'auto';
    this.sounds[key] = a;
  },
  unregister(key){
    delete this.sounds[key];
  },
  play(key){
    const a = this.sounds[key];
    if(!a || !isFeatureEnabled('sound_hook')) return Promise.resolve(false);
    a.currentTime = 0;
    return a.play().then(() => true).catch(() => false);
  },
  isRegistered(key){ return !!this.sounds[key]; }
};

const SOUND_EVENTS = {
  race_start: 'raceStart',
  checkpoint_scan: 'checkpointScan',
  rider_finished: 'riderFinished',
  countdown_tick: 'countdownTick',
  zone_shrink: 'zoneShrink',
  rider_eliminated: 'riderEliminated',
  bonus_secured: 'bonusSecured',
  checkpoint_revealed: 'checkpointRevealed'
};
