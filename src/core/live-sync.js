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
