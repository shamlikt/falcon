/* ============================================================================
   roster.js: Team Falcon, one page per player.

   The fixed arena shows the selected player's live 3D figure turning as you
   scroll; the dossier reveals that player's captions line by line; the respawn
   act scatters and reforms the figure; "Meet the Squad" is a grid of links,
   one per player. The URL names the player (`?player=<slug>`), so every
   player has a shareable page and the back button works; clicking a card
   swaps the figure in place without a reload and lazy-loads only that
   player's .splat.

   Data comes from players.js (window.FALCON_PLAYERS). Figures come from
   assets/figures.json, written by tools/build-figures.mjs from the <Name>.ply
   files in the repo root; a player with no capture borrows the placeholder.
   Reuses window.ScrollCraft (never edited) and window.FalconSplat.
   ========================================================================== */
(function () {
  'use strict';

  var DATA = window.FALCON_PLAYERS;
  var PEOPLE = DATA.PEOPLE, EVENTS = DATA.EVENTS, slug = DATA.slug, DEFAULT_PLAYER = DATA.DEFAULT_PLAYER;

  var CFG = {
    up: [0, 0, 1], center: [0.0, -0.05, 0.05], frontYaw: 90, startYaw: 125, turn: 325,
    pitch: -6, fov: 34, scatter: 1.8, accent: '#F7B32B',
    desktop: { dist: 4.3, shift: [0.2, -0.06], maxDpr: 1.5, maxCount: Infinity, embers: 64 },
    mobile: { dist: 4.6, fitWidth: 2.1, shift: [0.0, 0.24], maxDpr: 1.25, maxCount: 120000, embers: 28 },
    manifest: 'assets/figures.json',
    placeholderFile: 'assets/avatar.splat'   // hard fallback if the manifest itself fails
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

  /* ---- jersey art ------------------------------------------------------ */
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

  /* ---- picker grid: built synchronously, before the engine measures ---- */
  var grid = $('squad-grid');
  function buildGrid() {
    PEOPLE.forEach(function (p, i) {
      var s = slug(p.name);
      var a = document.createElement('a');
      a.className = 'pick' + (p.captain ? ' pick--captain' : '');
      a.href = '?player=' + s;
      a.dataset.i = i; a.dataset.slug = s; a.setAttribute('data-sc-tilt', '5');
      // The badge is filled in once the figure manifest arrives; it is
      // absolutely positioned, so painting it later moves nothing.
      a.innerHTML = '<div class="pick__media">' + jersey(p)
        + (p.captain ? '<span class="pick__flag">Captain</span>' : '')
        + '<span class="pick__badge" hidden></span>'
        + '</div><div class="pick__body"><h3 class="display pick__name">' + esc(p.name) + '</h3>'
        + '<span class="pick__event">' + esc(EVENTS[p.event].epic) + '</span></div>';
      grid.appendChild(a);
    });
  }
  buildGrid();

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
  // A software rasteriser gets a smaller splat budget; the files are
  // importance-sorted, so the first N splats are the body, not noise.
  function budget(prof) { return glInfo.software ? Object.assign({}, prof, { maxCount: Math.min(prof.maxCount, 70000), maxDpr: 1 }) : prof; }
  profile = budget(profile);
  function frameOf(p) { return (p && p.frame) || {}; }
  function cameraDist(p) {
    var base = profile.dist;
    if (profile.fitWidth) {
      var aspect = Math.max(innerWidth, 1) / Math.max(innerHeight, 1);
      var halfTan = Math.tan((CFG.fov * Math.PI / 180) / 2);
      base = Math.max(profile.dist, profile.fitWidth / (2 * halfTan * aspect));
    }
    return base * (frameOf(p).distScale || 1);
  }

  /* ---- figures: the manifest maps slug -> file ------------------------- */
  var FIGURES = {}, PLACEHOLDER = null;
  function loadFigures() {
    return fetch(CFG.manifest, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('figures.json ' + r.status); return r.json(); })
      .then(function (m) { FIGURES = m.figures || {}; PLACEHOLDER = FIGURES[m.placeholder] || null; })
      .catch(function (err) { console.warn('[roster] figure manifest unavailable, everyone on the placeholder', err); });
  }
  function figureFor(p) {
    var f = FIGURES[slug(p.name)];
    if (f) return { file: f.file, rev: f.rev, count: f.count, live: true };
    if (PLACEHOLDER) return { file: PLACEHOLDER.file, rev: PLACEHOLDER.rev, count: PLACEHOLDER.count, live: false };
    return { file: CFG.placeholderFile, rev: '', count: 0, live: false };
  }
  function figureUrl(f) { return f.file + (f.rev ? '?v=' + f.rev : ''); }
  // Players with a capture first, then the rest; players.js order inside each
  // group. Moving cards around does not change the grid's height, so the
  // engine's measurements from mount time still hold.
  function orderGrid() {
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.pick'));
    cards.sort(function (a, b) {
      var la = figureFor(PEOPLE[+a.dataset.i]).live ? 0 : 1;
      var lb = figureFor(PEOPLE[+b.dataset.i]).live ? 0 : 1;
      return (la - lb) || (+a.dataset.i - +b.dataset.i);
    });
    cards.forEach(function (c) { grid.appendChild(c); });
  }
  function paintBadges() {
    grid.querySelectorAll('.pick').forEach(function (el) {
      var live = figureFor(PEOPLE[+el.dataset.i]).live;
      var b = el.querySelector('.pick__badge');
      b.textContent = live ? '3D' : 'Placeholder';
      b.classList.toggle('pick__badge--live', live);
      b.hidden = false;
    });
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
    var fig = figureFor(p), frame = frameOf(p);
    arena.classList.remove('is-live'); arena.classList.remove('no-gl');
    if (!(glInfo.supported && window.FalconSplat)) { arena.classList.add('no-gl'); return; }
    arena.classList.add('is-loading');
    splat = FalconSplat.create(cv, { center: frame.center || CFG.center, up: frame.up || CFG.up, fov: CFG.fov, accent: CFG.accent,
      maxDpr: profile.maxDpr, maxCount: profile.maxCount, scatter: CFG.scatter });
    if (!splat) { arena.classList.add('no-gl'); return; }
    splat.set({ yaw: CFG.startYaw, pitch: CFG.pitch, dist: cameraDist(p), shift: profile.shift, assemble: 1 });
    var label = fig.live ? p.name : 'placeholder for ' + p.name;
    loadEl.textContent = 'Loading ' + label;
    splat.on('progress', function (pr) { loadEl.textContent = 'Loading ' + label + ' ' + Math.round(pr * 100) + '%'; });
    splat.on('paint', function () { arena.classList.add('is-live'); loadEl.textContent = ''; });
    splat.load(figureUrl(fig)).catch(function () { arena.classList.add('no-gl'); });
  }

  // opts.scroll: return to the top after the swap (a click does, history does not)
  function selectPerson(i, opts) {
    opts = opts || {};
    if (i === current) { if (opts.scroll) scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); return; }
    current = i;
    var p = PEOPLE[i], fig = figureFor(p);
    grid.querySelectorAll('.pick').forEach(function (el) {
      var on = +el.dataset.i === i;
      el.classList.toggle('is-selected', on);
      if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    document.title = p.name + ' · Team Falcon';
    rname.textContent = p.name;
    rsub.textContent = fig.live ? 'Respawned. Facing you.' : 'Placeholder figure · 3D coming soon';
    buildDossier(p);
    mountSubject(p);
    needsMeasure = true;
    requestAnimationFrame(function () { fitOneLine(rname); });
    if (opts.scroll) scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }

  /* ---- routing: the URL names the player -------------------------------- */
  function indexOfSlug(s) {
    for (var k = 0; k < PEOPLE.length; k++) if (slug(PEOPLE[k].name) === s) return k;
    return -1;
  }
  function playerIndexFromURL() {
    var s = new URLSearchParams(location.search).get('player');
    return s ? indexOfSlug(slug(s)) : -1;
  }
  // The captain once his capture exists; until then the first player in
  // players.js order with a live figure, so the landing shows a real capture.
  function defaultIndex() {
    var d = indexOfSlug(slug(DEFAULT_PLAYER));
    if (d >= 0 && figureFor(PEOPLE[d]).live) return d;
    for (var k = 0; k < PEOPLE.length; k++) if (figureFor(PEOPLE[k]).live) return k;
    return Math.max(d, 0);
  }

  grid.addEventListener('click', function (e) {
    var a = e.target.closest('a.pick');
    if (!a) return;
    // Modified or non-primary clicks keep their native meaning (new tab etc.)
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    history.pushState({ player: a.dataset.slug }, '', a.getAttribute('href'));
    selectPerson(+a.dataset.i, { scroll: true });
  });
  addEventListener('popstate', function () {
    // The stylesheet's smooth scroll-behavior makes Chrome animate history
    // scroll restoration too, slowly enough that the next back/forward can
    // cancel it. Restore instantly, then give anchors their smoothness back.
    document.documentElement.style.scrollBehavior = 'auto';
    setTimeout(function () { document.documentElement.style.scrollBehavior = ''; }, 150);
    var i = playerIndexFromURL();
    if (i < 0) i = defaultIndex();
    // Hash-anchor navigation also fires popstate; only swap when the player changed.
    if (i !== current) selectPerson(i, { scroll: false });
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
    profile = budget(isMobile() ? CFG.mobile : CFG.desktop);
    if (splat) { splat.resize(); splat.set({ dist: cameraDist(PEOPLE[current]), shift: profile.shift }); }
    dossierLines.querySelectorAll('[data-fit]').forEach(fitOneLine); fitOneLine(rname);
  }
  addEventListener('resize', function () { if (innerWidth === vw && isMobile()) { vh = innerHeight; needsMeasure = true; return; } relayout(); }, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { needsMeasure = true; dossierLines.querySelectorAll('[data-fit]').forEach(fitOneLine); fitOneLine(rname); });
  addEventListener('load', function () { needsMeasure = true; });
  document.addEventListener('visibilitychange', function () { if (splat) splat.pause(document.hidden); });

  seedEmbers(); sizeEmbers(); measure();
  requestAnimationFrame(frame);

  // Boot: the grid and engine are already up; only the first subject waits
  // for the (tiny) manifest so it knows which file to fetch.
  loadFigures().then(function () {
    paintBadges();
    orderGrid();
    var i = playerIndexFromURL();
    if (i < 0) {
      i = defaultIndex();
      // A bad or stale player link should not be re-shared: clean it.
      if (new URLSearchParams(location.search).has('player')) history.replaceState(null, '', location.pathname + location.hash);
    }
    selectPerson(i, { scroll: false });
  });

  window.FALCON_ROSTER = {
    people: PEOPLE, select: selectPerson, config: CFG,
    current: function () { return current; },
    splat: function () { return splat; },
    figures: function () { return FIGURES; }
  };
})();
