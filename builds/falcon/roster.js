/* ============================================================================
   roster.js: Team Falcon roster on the original Falcon page grammar.

   The fixed arena shows ONE selected player's live 3D figure that turns as you
   scroll (default: PMMuneer); the dossier reveals that player's fancy captions
   line by line; the respawn act scatters and reforms the figure; and "Meet the
   Squad" is a picker - choosing a player swaps the arena figure + dossier and
   returns you to the top. Reuses window.ScrollCraft + window.FalconSplat.

   Real captures: PMMuneer -> pmmuneer.splat, AhamedKabir -> ahamedkabir.splat.
   Everyone else borrows avatar.splat (Kabeer / gaussians.ply) until their own
   <name>.ply is converted with tools/ply2splat.mjs.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = {
    up: [0, 0, 1], center: [0.0, -0.05, 0.05], frontYaw: 90, startYaw: 125, turn: 325,
    pitch: -6, fov: 34, scatter: 1.8, accent: '#F7B32B',
    desktop: { dist: 4.3, shift: [0.2, -0.06], maxDpr: 1.5, maxCount: Infinity, embers: 64 },
    mobile: { dist: 4.6, fitWidth: 2.1, shift: [0.0, 0.24], maxDpr: 1.25, maxCount: 120000, embers: 28 }
  };

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var smallMQ = matchMedia('(max-width: 860px)');
  var isMobile = function () { return smallMQ.matches || matchMedia('(hover: none) and (pointer: coarse)').matches; };
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var clamp01 = function (x) { return clamp(x, 0, 1); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var easeOutQuart = function (t) { return 1 - Math.pow(1 - t, 4); };
  var easeInCubic = function (t) { return t * t * t; };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  var EVENTS = [
    { epic: 'The Odyssey of the War of Thugs', real: 'Tug of War' },
    { epic: 'Rise of the Net Titans', real: 'Volleyball' },
    { epic: 'The Grand Chaos Gauntlet', real: 'Fun Games' },
    { epic: 'The Everlasting Sprint Saga', real: 'Relay Race' },
    { epic: 'Throne of the Last Seat', real: 'Musical Chairs' },
    { epic: 'The Balance of Fates', real: 'Lemon & Spoon' },
    { epic: 'The Leap of a Thousand Bounds', real: 'Sack Race' }
  ];

  var PEOPLE = [
    { name: 'PMMuneer', initials: 'PM', num: 2, event: 3, splat: 'assets/pmmuneer.splat', lines: [
      ['Callsign', 'Marshal of the Everlasting Sprint Saga.'],
      ['Doctrine', 'Runs like the deadline is personal.'],
      ['Verdict', 'Overtakes on the corners you did not know existed.'] ] },
    { name: 'AhamedKabir', initials: 'AK', num: 5, event: 0, splat: 'assets/ahamedkabir.splat', lines: [
      ['Callsign', 'Ironhand of the War of Thugs.'],
      ['Doctrine', 'The rope has filed a formal complaint.'],
      ['Verdict', 'Anchors the line like the ground owes him money.'] ] },
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
    { name: 'Shamlik', initials: 'SK', num: 8, event: 2, lines: [
      ['Callsign', 'Chaos Strategist of the Grand Chaos Gauntlet.'],
      ['Doctrine', 'Loses with dignity, wins with suspicion.'],
      ['Verdict', 'Nobody is sure how he is winning. Least of all him.'] ] },
    { name: 'RemyaK', initials: 'RK', num: 11, event: 1, lines: [
      ['Callsign', 'Duchess of the Net Titans.'],
      ['Doctrine', 'Spikes first. Apologizes never.'],
      ['Verdict', 'The net gave up filing complaints.'] ] },
    { name: 'Bajal', initials: 'BJ', num: 6, event: 6, lines: [
      ['Callsign', 'Baron of the Leap of a Thousand Bounds.'],
      ['Doctrine', 'Gravity is a polite suggestion.'],
      ['Verdict', 'Lands three feet past where physics allows.'] ] },
    { name: 'SakeerSheik', initials: 'SS', num: 12, event: 4, lines: [
      ['Callsign', 'Sultan of the Last Seat.'],
      ['Doctrine', 'When the music stops, the throne is already his.'],
      ['Verdict', 'Has never once been caught standing.'] ] },
    { name: 'SinashShajahan', initials: 'SJ', num: 15, event: 0, lines: [
      ['Callsign', 'Colossus of the War of Thugs.'],
      ['Doctrine', 'Anchors the line like a stubborn mountain.'],
      ['Verdict', 'Moves for no one. The rope accepts this.'] ] },
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

  var KITS = ['#2A3346', '#243043', '#303A50', '#28313F', '#37425A', '#222B3A', '#2F3A4E', '#2B3648'];
  var uid = 0;
  function jersey(p) {
    var gid = 'jg' + (uid++), capt = !!p.captain;
    var fill = capt ? '#F7B32B' : KITS[p.num % KITS.length];
    var ink = capt ? '#17110A' : '#F1EFE8', trim = capt ? '#17110A' : '#F7B32B';
    return '<svg viewBox="0 0 100 120" role="img" aria-label="' + esc(p.name) + ', number ' + p.num + '">'
      + '<defs><radialGradient id="' + gid + '" cx="50%" cy="30%" r="80%">'
      + '<stop offset="0" stop-color="#141A26"/><stop offset="1" stop-color="#0A0C12"/></radialGradient></defs>'
      + '<rect width="100" height="120" fill="url(#' + gid + ')"/>'
      + '<g opacity="0.10" stroke="#F7B32B" stroke-width="1.1" fill="none">'
      + '<path d="M-5,96 L50,70 L105,96"/><path d="M-5,108 L50,82 L105,108"/></g>'
      + '<path d="M32,26 L22,31 L11,55 L26,61 L31,50 L31,100 L69,100 L69,50 L74,61 L89,55 L78,31 L68,26 '
      + 'C62,36 38,36 32,26 Z" fill="' + fill + '" stroke="' + trim + '" stroke-width="1.6" stroke-linejoin="round"/>'
      + '<path d="M32,26 C38,36 62,36 68,26" fill="none" stroke="' + trim + '" stroke-width="2.4"/>'
      + '<text x="50" y="47" text-anchor="middle" font-family="Chakra Petch, sans-serif" font-weight="600" '
      + 'font-size="11" letter-spacing="1.6" fill="' + ink + '">' + esc(p.initials.toUpperCase()) + '</text>'
      + '<text x="50" y="90" text-anchor="middle" font-family="Russo One, sans-serif" font-size="40" '
      + 'fill="' + ink + '">' + p.num + '</text></svg>';
  }

  /* ---- picker grid ----------------------------------------------------- */
  var grid = $('squad-grid');
  PEOPLE.forEach(function (p, i) {
    var el = document.createElement('article');
    el.className = 'pick' + (p.captain ? ' pick--captain' : '');
    el.tabIndex = 0; el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Load ' + p.name);
    el.dataset.i = i; el.setAttribute('data-sc-tilt', '5');
    el.innerHTML = '<div class="pick__media">' + jersey(p)
      + (p.captain ? '<span class="pick__flag">Captain</span>' : '')
      + (p.splat ? '<span class="pick__badge pick__badge--live">3D</span>'
                 : '<span class="pick__badge">Placeholder</span>')
      + '</div><div class="pick__body"><h3 class="display pick__name">' + esc(p.name) + '</h3>'
      + '<span class="pick__event">' + esc(EVENTS[p.event].epic) + '</span></div>';
    grid.appendChild(el);
  });

  /* ---- engine + renderer setup ----------------------------------------- */
  var arena = $('arena'), mark = $('mark'), embersCanvas = $('embers'), loadEl = $('load');
  var respawnEl = $('respawn'), squadEl = $('squad'), stamp = $('stamp'), shade = $('shade');
  var rname = $('rname'), rsub = $('rsub'), dossierLines = $('dossier-lines');
  var hud = document.querySelector('.hud'), dial = $('dial'), needle = $('needle'), degNum = $('deg-num');
  var indexLinks = Array.prototype.slice.call(document.querySelectorAll('#index a'));
  var sections = indexLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); });

  var engine = window.ScrollCraft ? ScrollCraft.mount(document.body) : null;
  var glInfo = window.FalconSplat ? FalconSplat.probe() : { supported: false, software: false };
  var profile = isMobile() ? CFG.mobile : CFG.desktop;
  if (glInfo.software) profile = Object.assign({}, profile, { maxCount: Math.min(profile.maxCount, 70000), maxDpr: 1 });
  function cameraDist() {
    if (!profile.fitWidth) return profile.dist;
    var aspect = Math.max(innerWidth, 1) / Math.max(innerHeight, 1);
    var halfTan = Math.tan((CFG.fov * Math.PI / 180) / 2);
    return Math.max(profile.dist, profile.fitWidth / (2 * halfTan * aspect));
  }

  /* ---- the selectable subject ------------------------------------------ */
  var splat = null, current = -1, lineIO = null;

  function fitOneLine(el) {
    if (!el || !el.parentElement) return;
    el.style.whiteSpace = 'nowrap';
    var avail = el.parentElement.clientWidth - 2;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    var guard = 0;
    while (el.scrollWidth > avail && fs > 14 && guard++ < 80) { fs -= 1; el.style.fontSize = fs + 'px'; }
  }

  function revealLines() {
    if (reduce || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('js-reveal');
    if (lineIO) lineIO.disconnect();
    lineIO = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); lineIO.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -14% 0px', threshold: 0.1 });
    dossierLines.querySelectorAll('.dossier__line').forEach(function (el) { lineIO.observe(el); });
  }

  function buildDossier(p) {
    dossierLines.innerHTML = '';
    var lead = document.createElement('div');
    lead.className = 'dossier__line dossier__line--lead';
    lead.innerHTML = '<p class="dossier__label">' + esc(EVENTS[p.event].real) + (p.captain ? ' · Captain' : '') + '</p>'
      + '<h2 class="display dossier__title dossier__title--name" data-fit>' + esc(p.name) + '</h2>'
      + '<p class="dossier__body">' + esc(p.lines[0][1]) + '</p>';
    dossierLines.appendChild(lead);
    p.lines.slice(1).forEach(function (ln, i) {
      var side = (i % 2 === 0) ? 'trail' : 'lead';
      var d = document.createElement('div');
      d.className = 'dossier__line dossier__line--' + side;
      d.innerHTML = '<p class="dossier__label">' + esc(ln[0]) + '</p>'
        + '<h3 class="display dossier__title">' + esc(ln[1]) + '</h3>';
      dossierLines.appendChild(d);
    });
    revealLines();
    requestAnimationFrame(function () { dossierLines.querySelectorAll('[data-fit]').forEach(fitOneLine); });
  }

  function freshCanvas() {
    var old = $('splat');
    var nw = old.cloneNode(false);
    old.parentNode.replaceChild(nw, old);
    return nw;
  }

  function mountSubject(p) {
    if (splat) { splat.destroy(); splat = null; }
    var cv = freshCanvas();
    arena.classList.remove('is-live'); arena.classList.remove('no-gl');
    if (!(glInfo.supported && window.FalconSplat)) { arena.classList.add('no-gl'); return; }
    arena.classList.add('is-loading');
    splat = FalconSplat.create(cv, { center: CFG.center, up: CFG.up, fov: CFG.fov, accent: CFG.accent,
      maxDpr: profile.maxDpr, maxCount: profile.maxCount, scatter: CFG.scatter });
    if (!splat) { arena.classList.add('no-gl'); return; }
    splat.set({ yaw: CFG.startYaw, pitch: CFG.pitch, dist: cameraDist(), shift: profile.shift, assemble: 1 });
    loadEl.textContent = 'Loading ' + p.name;
    splat.on('progress', function (pr) { loadEl.textContent = 'Loading ' + p.name + ' ' + Math.round(pr * 100) + '%'; });
    splat.on('paint', function () { arena.classList.add('is-live'); loadEl.textContent = ''; });
    splat.load(p.splat || 'assets/avatar.splat').catch(function () { arena.classList.add('no-gl'); });
  }

  function selectPerson(i, doScroll) {
    doScroll = doScroll !== false;
    if (i === current) { if (doScroll) scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); return; }
    current = i;
    var p = PEOPLE[i];
    grid.querySelectorAll('.pick').forEach(function (el) { el.classList.toggle('is-selected', +el.dataset.i === i); });
    rname.textContent = p.name;
    rsub.textContent = p.splat ? 'Respawned. Facing you.' : 'Placeholder figure · 3D coming soon';
    buildDossier(p);
    mountSubject(p);
    needsMeasure = true;
    requestAnimationFrame(function () { fitOneLine(rname); });
    if (doScroll) scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }

  grid.addEventListener('click', function (e) { var c = e.target.closest('.pick'); if (c) selectPerson(+c.dataset.i); });
  grid.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var c = e.target.closest('.pick'); if (c) { e.preventDefault(); selectPerson(+c.dataset.i); }
  });

  /* ---- measuring ------------------------------------------------------- */
  var vh = innerHeight, vw = innerWidth;
  var M = { respawnTop: 0, respawnH: 0, travel: 1, turnEnd: 1, coverStart: 0, coverEnd: 0 };
  var needsMeasure = true;
  function measure() {
    vh = innerHeight; vw = innerWidth;
    var r = respawnEl.getBoundingClientRect();
    M.respawnTop = r.top + scrollY; M.respawnH = r.height; M.travel = Math.max(M.respawnH - vh, 1);
    M.turnEnd = M.respawnTop + 0.74 * M.travel;
    var s = squadEl.getBoundingClientRect();
    var squadTop = s.top + scrollY;
    M.coverStart = squadTop - vh; M.coverEnd = squadTop;
    needsMeasure = false;
  }

  function assembleAt(p) {
    if (reduce) return 1;
    if (p < 0.08) return 1;
    if (p < 0.30) return 1 - easeInCubic((p - 0.08) / 0.22);
    if (p < 0.52) return 0;
    if (p < 0.74) return easeOutQuart((p - 0.52) / 0.22);
    return 1;
  }
  function yawAt(y) {
    var t = clamp01(y / Math.max(M.turnEnd, 1));
    return CFG.startYaw + CFG.turn * (1 - Math.pow(1 - t, 1.7));
  }

  /* ---- embers ---------------------------------------------------------- */
  var ectx = embersCanvas.getContext('2d'), embers = [];
  function seedEmbers() {
    embers.length = 0;
    var n = reduce ? Math.round(profile.embers * 0.5) : profile.embers;
    for (var i = 0; i < n; i++) embers.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8,
      s: 0.12 + Math.random() * 0.35, ph: Math.random() * 6.28, a: 0.25 + Math.random() * 0.55 });
  }
  function sizeEmbers() { embersCanvas.width = Math.round(vw); embersCanvas.height = Math.round(vh); }
  function drawEmbers(dt, boost, par) {
    var W = embersCanvas.width, H = embersCanvas.height;
    ectx.clearRect(0, 0, W, H); ectx.fillStyle = CFG.accent;
    for (var i = 0; i < embers.length; i++) {
      var e = embers[i];
      if (!reduce) { e.y -= e.s * dt * (1 + boost * 3) * 0.06; e.ph += dt * 0.9; if (e.y < -0.05) { e.y = 1.05; e.x = Math.random(); } }
      var x = (e.x + Math.sin(e.ph) * 0.012) * W, y = ((e.y + par) % 1.1) * H; if (y < 0) y += 1.1 * H;
      ectx.globalAlpha = e.a * (0.6 + 0.4 * Math.sin(e.ph * 1.7));
      ectx.beginPath(); ectx.arc(x, y, e.r, 0, 6.2832); ectx.fill();
    }
    ectx.globalAlpha = 1;
  }

  /* ---- pointer orbit --------------------------------------------------- */
  var px = 0.5, py = 0.5, pxs = 0.5, pys = 0.5;
  if (fine && !reduce) addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return; px = e.clientX / vw; py = e.clientY / vh;
  }, { passive: true });

  /* ---- the loop -------------------------------------------------------- */
  var lastY = scrollY, lastT = performance.now(), velocity = 0, sweep = 0;
  var lastState = '', lastActive = -1, lastDialGone = null, lastDegShown = null;
  function frame(now) {
    requestAnimationFrame(frame);
    if (needsMeasure) measure();
    var dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;
    var y = scrollY, dy = y - lastY; lastY = y;
    velocity = lerp(velocity, Math.min(Math.abs(dy) / Math.max(vh, 1) * 8, 1.5), 0.12);
    var covered = y >= M.coverEnd + 4;
    var p = clamp01((y - M.respawnTop) / M.travel);
    var a = assembleAt(p), yaw = yawAt(y);
    pxs = lerp(pxs, px, 0.06); pys = lerp(pys, py, 0.06);
    var yawP = fine && !reduce ? (pxs - 0.5) * 12 : 0, pitchP = fine && !reduce ? (0.5 - pys) * 5 : 0;

    if (splat) {
      splat.pause(covered || document.hidden);
      if (!covered) splat.set({ yaw: yaw + yawP, pitch: CFG.pitch + pitchP, assemble: a, spin: (y / Math.max(vh, 1)) * 2.4 });
    }
    var markT = clamp01(y / (vh * 1.35)), markOp = 1 - markT;
    if (!covered) { mark.style.transform = reduce ? 'none' : 'translate3d(0,' + (-y * 0.35).toFixed(1) + 'px,0)'; mark.style.opacity = markOp.toFixed(3); }
    sweep = lerp(sweep, y / Math.max(M.turnEnd, 1), 0.08);
    if (!covered) {
      arena.style.setProperty('--sweep-x', (30 + sweep * 45).toFixed(1) + '%');
      arena.style.setProperty('--sweep-y', (62 - sweep * 20).toFixed(1) + '%');
      arena.style.setProperty('--floor-y', (-(y % (vh * 0.06))).toFixed(1) + 'px');
    }
    if (!covered && !document.hidden) drawEmbers(dt, velocity, -(y / vh) * 0.18);
    shade.style.opacity = stamp.style.opacity || '0';

    var heading = ((yaw - CFG.frontYaw) % 360 + 360) % 360, shown = Math.round(heading) % 360;
    if (shown !== lastDegShown) {
      lastDegShown = shown; needle.style.transform = 'rotate(' + heading.toFixed(1) + 'deg)';
      degNum.textContent = shown + '°'; dial.setAttribute('aria-valuenow', String(shown)); dial.setAttribute('aria-valuetext', shown + ' degrees');
    }
    var active = 0;
    for (var i = 0; i < sections.length; i++) { var s = sections[i]; if (s && s.getBoundingClientRect().top <= vh * 0.45) active = i; }
    if (active !== lastActive) { lastActive = active; indexLinks.forEach(function (aa, k) { aa.classList.toggle('is-active', k === active); }); }
    var dialGone = y > M.coverStart + vh * 0.35;
    if (dialGone !== lastDialGone) { lastDialGone = dialGone; dial.hidden = dialGone; }

    var state = 'yaw:' + (Math.round(heading / 3) * 3) + '|a:' + a.toFixed(2) + '|cov:' + (covered ? 1 : 0);
    if (state !== lastState) { lastState = state; arena.setAttribute('data-sc-verify-state', state); }
  }

  /* ---- dial: dragging scrolls the page --------------------------------- */
  (function () {
    var dragging = false, lastAng = 0;
    function angleOf(e) { var r = dial.querySelector('svg').getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; }
    dial.addEventListener('pointerdown', function (e) { dragging = true; lastAng = angleOf(e); dial.setPointerCapture(e.pointerId); e.preventDefault(); });
    dial.addEventListener('pointermove', function (e) {
      if (!dragging) return; var ang = angleOf(e), d = ang - lastAng;
      if (d > 180) d -= 360; if (d < -180) d += 360; lastAng = ang;
      scrollBy({ top: d / CFG.turn * M.turnEnd, behavior: 'instant' });
    });
    var stop = function () { dragging = false; };
    dial.addEventListener('pointerup', stop); dial.addEventListener('pointercancel', stop);
    dial.addEventListener('keydown', function (e) {
      var step = 15 / CFG.turn * M.turnEnd;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { scrollBy({ top: step, behavior: reduce ? 'instant' : 'smooth' }); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { scrollBy({ top: -step, behavior: reduce ? 'instant' : 'smooth' }); e.preventDefault(); }
    });
  })();

  /* ---- wiring ---------------------------------------------------------- */
  function relayout() {
    vh = innerHeight; vw = innerWidth; needsMeasure = true; sizeEmbers();
    profile = isMobile() ? CFG.mobile : CFG.desktop;
    if (glInfo.software) profile = Object.assign({}, profile, { maxCount: Math.min(profile.maxCount, 70000), maxDpr: 1 });
    if (splat) { splat.resize(); splat.set({ dist: cameraDist(), shift: profile.shift }); }
    dossierLines.querySelectorAll('[data-fit]').forEach(fitOneLine); fitOneLine(rname);
  }
  addEventListener('resize', function () { if (innerWidth === vw && isMobile()) { vh = innerHeight; needsMeasure = true; return; } relayout(); }, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { needsMeasure = true; dossierLines.querySelectorAll('[data-fit]').forEach(fitOneLine); fitOneLine(rname); });
  addEventListener('load', function () { needsMeasure = true; });
  document.addEventListener('visibilitychange', function () { if (splat) splat.pause(document.hidden); });

  seedEmbers(); sizeEmbers(); measure();
  var start = 0; for (var k = 0; k < PEOPLE.length; k++) if (PEOPLE[k].name === 'PMMuneer') { start = k; break; }
  selectPerson(start, false);   // default subject: PMMuneer, no scroll
  requestAnimationFrame(frame);

  window.FALCON_ROSTER = { people: PEOPLE, select: selectPerson };
})();
