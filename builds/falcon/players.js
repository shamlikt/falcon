/* ============================================================================
   players.js: the one home of Team Falcon roster data.

   Loaded by the page as a classic script (window.FALCON_PLAYERS) and by the
   Node tools as a CommonJS module (tools/check-roster.mjs, build-figures.mjs).
   Edit names, numbers, events and captions here and nowhere else.

   A player's 3D figure is NOT declared here. Drop `<Name>.ply` in the repo
   root, run `node tools/build-figures.mjs`, and the page finds the figure by
   slug(name) in assets/figures.json. Players without a capture borrow the
   placeholder figure (gaussians.ply -> assets/avatar.splat).

   Optional per-player `frame: { center, up, distScale }` overrides the shared
   camera for a capture that is framed differently from the rest.
   ========================================================================== */
(function (root) {
  'use strict';

  var EVENTS = [
    { epic: 'The Odyssey of the War of Thugs', real: 'Tug of War' },
    { epic: 'Rise of the Net Titans', real: 'Volleyball' },
    { epic: 'The Grand Chaos Gauntlet', real: 'Fun Games' },
    { epic: 'The Everlasting Sprint Saga', real: 'Relay Race' },
    { epic: 'Throne of the Last Seat', real: 'Musical Chairs' },
    { epic: 'The Balance of Fates', real: 'Lemon & Spoon' },
    { epic: 'The Leap of a Thousand Bounds', real: 'Sack Race' }
  ];

  // Display priority. The page shows players WITH a capture first (in this
  // order), then players still on the placeholder (in this order). A player
  // moves between the two groups automatically when their .ply is built.
  var PEOPLE = [
    { name: 'AhamedKabir', initials: 'AK', num: 5, event: 0, lines: [
      ['Callsign', 'Ironhand of the War of Thugs.'],
      ['Doctrine', 'The rope has filed a formal complaint.'],
      ['Verdict', 'Anchors the line like the ground owes him money.'] ] },
    { name: 'PMMuneer', initials: 'PM', num: 2, event: 3, lines: [
      ['Callsign', 'Marshal of the Everlasting Sprint Saga.'],
      ['Doctrine', 'Runs like the deadline is personal.'],
      ['Verdict', 'Overtakes on the corners you did not know existed.'] ] },
    { name: 'Bajal', initials: 'BJ', num: 6, event: 6, lines: [
      ['Callsign', 'Baron of the Leap of a Thousand Bounds.'],
      ['Doctrine', 'Gravity is a polite suggestion.'],
      ['Verdict', 'Lands three feet past where physics allows.'] ] },
    { name: 'Shamlik', initials: 'SK', num: 8, event: 2, lines: [
      ['Callsign', 'Chaos Strategist of the Grand Chaos Gauntlet.'],
      ['Doctrine', 'Loses with dignity, wins with suspicion.'],
      ['Verdict', 'Nobody is sure how he is winning. Least of all him.'] ] },
    { name: 'SinashShajahan', initials: 'SJ', num: 15, event: 0, lines: [
      ['Callsign', 'Colossus of the War of Thugs.'],
      ['Doctrine', 'A mountain that learned to lean back.'],
      ['Verdict', 'Moves for no one. The rope accepts this.'] ] },
    { name: 'Lifin', initials: 'LF', num: 10, captain: true, event: 0, lines: [
      ['Callsign', 'Supreme Warlord of the Odyssey of the War of Thugs.'],
      ['Doctrine', 'Where the rope leads, the enemy follows.'],
      ['Verdict', 'Never lost a war he started.'] ] },
    { name: 'Ashna', initials: 'AS', num: 7, captain: true, event: 1, lines: [
      ['Callsign', 'Co-Sovereign of the Falcons.'],
      ['Doctrine', 'Serene in the storm, merciless at the net.'],
      ['Verdict', 'Executes the play before you finish blinking.'] ] },
    { name: 'Nabeela Abdul', initials: 'NA', num: 4, event: 2, lines: [
      ['Callsign', 'Keeper of the Grand Chaos Gauntlet.'],
      ['Doctrine', 'Every fun game becomes a documented conquest.'],
      ['Verdict', 'Bends the rules strategically, wins anyway.'] ] },
    { name: 'Hamsa', initials: 'HM', num: 9, event: 3, lines: [
      ['Callsign', 'Oracle of the Everlasting Sprint Saga.'],
      ['Doctrine', 'At the line before the whistle believes it.'],
      ['Verdict', 'Time is a suggestion; Hamsa is the correction.'] ] },
    { name: 'AnsinaMHaroon', initials: 'AH', num: 3, event: 5, lines: [
      ['Callsign', 'Empress of the Balance of Fates.'],
      ['Doctrine', 'One lemon, one spoon, zero doubt.'],
      ['Verdict', 'Steady hands have never once betrayed her.'] ] },
    { name: 'RemyaK', initials: 'RK', num: 11, event: 1, lines: [
      ['Callsign', 'Duchess of the Net Titans.'],
      ['Doctrine', 'Spikes first. Apologizes never.'],
      ['Verdict', 'The net gave up filing complaints.'] ] },
    { name: 'SakeerSheik', initials: 'SS', num: 12, event: 4, lines: [
      ['Callsign', 'Sultan of the Last Seat.'],
      ['Doctrine', 'When the music stops, the throne is already his.'],
      ['Verdict', 'Has never once been caught standing.'] ] },
    { name: 'Basheer', initials: 'BR', num: 14, event: 1, lines: [
      ['Callsign', 'Sentinel of the Net Titans.'],
      ['Doctrine', 'The net has never won an argument.'],
      ['Verdict', 'Guards his half like a state secret.'] ] },
    { name: 'SarinJalal', initials: 'SL', num: 21, event: 2, lines: [
      ['Callsign', 'Herald of the Grand Chaos Gauntlet.'],
      ['Doctrine', 'Rules optional. Glory mandatory.'],
      ['Verdict', 'Turns confusion into undisputed points.'] ] },
    { name: 'Shameer', initials: 'SM', num: 17, event: 6, lines: [
      ['Callsign', 'Vanguard of the Leap of a Thousand Bounds.'],
      ['Doctrine', 'Half athlete, half kangaroo, fully committed.'],
      ['Verdict', 'Bounces where others stumble.'] ] },
    { name: 'Reas', initials: 'RS', num: 23, event: 5, lines: [
      ['Callsign', 'Warden of the Balance of Fates.'],
      ['Doctrine', 'Steady nerves, suspiciously fast walk.'],
      ['Verdict', 'The lemon has never dared to fall.'] ] }
  ];

  // The one name rule. "Nabeela Abdul", "nabeela_abdul.ply" and
  // "NabeelaAbdul" all resolve to "nabeelaabdul".
  function slug(name) { return String(name).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  // Who the page opens on when the URL names nobody: the captain, once his
  // capture exists; until then the first player in the list who has one, so
  // the landing always shows a live figure.
  var DEFAULT_PLAYER = 'Lifin';

  var api = { EVENTS: EVENTS, PEOPLE: PEOPLE, slug: slug, DEFAULT_PLAYER: DEFAULT_PLAYER };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FALCON_PLAYERS = api;
})(typeof window !== 'undefined' ? window : this);
