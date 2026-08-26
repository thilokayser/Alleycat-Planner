/* ---------------- Fahrer-App: Zustand ----------------
   Eigenes Zustandsobjekt, absichtlich nicht das `state` des Organizers —
   die Fahrer-App teilt mit ihm keine Ansicht und keinen Speicher.

   Platzhalter (Paket 3). Inhalt folgt in Paket 4.                      */
const riderState = {
  view: 'loading',
  session: null,
  event: null,
  checkpoints: [],
  progress: {},
  error: ''
};
