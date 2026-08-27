/* ---------------- live sync ----------------
   Separate BroadcastChannel from beamer.js's 'alleycat-beamer' one
   (which only carries race-start/event-updated nudges) — this one
   carries individual game-mode event-log entries (see pushEventLog()
   in rules-engine.js) so an open beamer tab can react instantly (e.g.
   trigger the elimination overlay) instead of waiting for its ~7s
   event-data poll. Storage stays the source of truth either way: the
   entry is already persisted on evt.ruleRuntimeState.eventLog before
   this fires, so a missed broadcast just means the poll catches up. */
let liveSyncChannel;
function getLiveSyncChannel(){
  if(liveSyncChannel === undefined){
    try{ liveSyncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('alleycat-live') : null; }
    catch(e){ liveSyncChannel = null; }
  }
  return liveSyncChannel;
}
function broadcastLiveEvent(eventId, entry){
  const ch = getLiveSyncChannel();
  if(ch) ch.postMessage({eventId, entry, timestamp: Date.now()});
}
/* Checkpoint-Ping (Redesign-Roadmap, Teilprojekt 3): eigener, ungated
   Broadcast-Typ statt über pushEventLog() — der ist an anyGameModeEnabled()
   gebunden (rules-engine.js:63), ein Ping auf der Beamer-Zonenkarte soll
   aber für jedes Event mit Checkpoints funktionieren, nicht nur mit
   aktiven Spielmodi. handleLiveEvent() (beamer-modes.js) erkennt den Typ
   und pingt nur den Marker statt eines vollen Reloads. */
function broadcastCheckpointPing(evt, checkpointId){
  broadcastLiveEvent(evt.id, {type: 'checkpoint_ping', checkpointId});
}
