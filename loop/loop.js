import { svg, clamp01, easeInOut, lerp, seriesPath } from '../js/plot.js';

const params = new URLSearchParams(location.search);
let speed = Math.max(.25, +params.get('speed') || 1);

// body hours per real second: days pass quickly, and holding slows the world down to hours
const RATE = { day: 24, hold: 4, fall: 12 };
const SLOWMO = .5;

const DAY = 24;
const E2 = { low: 30, hold: 170, tau: 8, spent: 14, luteal: 75, counts: 100 };    // pg/mL; plateau is Keye & Jaffe
const ONSET = 60;           // Liu & Yen, Keye & Jaffe: hours of estradiol before the surge
const OVULATION = 33;       // hours from LH rise to rupture; WHO 1980 median 32
const LUTEAL = { min: 12, max: 14 };    // days from egg to bleed, drawn per cycle; Bull 12.4-12.9 by BBT, Lenton 14.1 by serum LH
const READY = 8;            // cycle day the follicle can carry the signal; model choice, not a measurement
const NO_EGG = { min: 26, max: 34 };    // cycle day an unovulated lining breaks down, drawn per cycle; Henry median 29, range 20-37; Seidman mean 29.2, SD 5.7
const SHED = 4;             // days of bleeding, Bull 4.0
const IMPLANT = 9;          // days from egg; Wilcox 1999: most implant at 8-10
const PREG_END = 20;        // days from egg when a pregnant run stops
const BRAKE = .4;
const SURGE = { amp: 7, center: 16, sd: 9, len: 48 };   // Hoff 1983: ~48 h for a spontaneous surge
const LINING = { base: .1, grow: .016 };                // drawn, relative to full thickness

const LINES = {
  idle: 'This is day 1, the day bleeding starts. Calendars count from here. The story started two weeks ago. Tap space to start the clock.',
  shed: 'The old lining is leaving. Estradiol and progesterone are low, so the brake is off and the pituitary sends FSH.',
  grow: 'Follicles in the ovary begin to grow. One pulls ahead and starts making estradiol, which rebuilds the lining.',
  early: 'Not yet. This follicle is too small to matter.',
  ready: 'Your turn. Hold space and this follicle keeps estradiol up.',
  wait: 'The first half of a cycle can wait. Every day here adds a day to this cycle.',
  rising: 'Estradiol climbs. Keep holding.',
  braking: 'The pituitary lets out less LH. Estradiol is a brake.',
  steady: 'The level has stopped changing. Keep holding.',
  thirtysix: 'Thirty-six hours. The brake is still on. Tested now, the pituitary barely answers.',
  same: 'Same molecule, same level. Only the time is changing.',
  fired: 'Sixty hours. The brake has become the trigger.',
  letgo: 'You can let go. This part runs by itself.',
  egg: 'The follicle opens and the egg is out. That is ovulation.',
  p4: 'The empty follicle stays and makes progesterone. The lining stops growing and gets ready.',
  timer: 'Now the clock runs by itself, for about 13 days, however long the first half took.',
  nope: 'Holding does nothing now. This clock is not yours.',
  noembryo: 'No embryo arrives, so nothing keeps the empty follicle going. Exactly what ends it is still unknown.',
  fall: 'Progesterone falls. That fall is the signal, and the lining lets go.',
  bleed: 'Day 1 again. This bleed was mostly set the moment the follicle fired.',
  noegg: 'A bleed with no egg behind it. Progesterone never rose, so no fall set this one off. How the lining breaks down here is less understood.',
  offer: 'The egg is out for a day at most. Tap space to let sperm reach it.',
  offerheld: 'The egg is out for a day at most. Let go, then tap space to let sperm reach it.',
  toolate: 'Too late. The egg lasts a day at most.',
  met: 'They meet. The embryo starts dividing and drifts toward the lining.',
  drift: 'The clock is still running. In a few days progesterone will start to fall.',
  implanted: 'The embryo settles into the lining and starts making hCG.',
  rescue: 'hCG reaches the empty follicle and tells it to keep going. The clock that was not yours has been overruled.',
  nobleed: 'This is when the bleed was due. Progesterone never fell, so the lining was never told to let go.',
  climbs: 'hCG keeps climbing, roughly doubling every day or two at first. It is also what a pregnancy test looks for.',
};
const MIN_LINE_MS = 2200;
const LAST_LINK = { text: 'When progesterone falls, the lining sheds.', c: 'blood' };

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const n = { stage: $('stage'), plot: $('plot'), pit: $('pit'), pitState: $('pit-state'), ov: $('ov'), ovName: $('ov-name'), count: $('count'), countWrap: $('count-wrap'), unit: $('count-unit'), sub: $('count-sub'), say: $('say'), key: $('key'), reset: $('reset'), speed: $('speed'), future: $('future'), chain: $('chain'), bars: $('bars') };

const smooth = (k) => { const v = clamp01(k); return v * v * (3 - 2 * v); };
const between = (r) => r.min + Math.random() * (r.max - r.min);
const bump = (t, b) => (t < 0 || t > b.len ? 0 : b.amp * Math.exp(-((t - b.center) ** 2) / (2 * b.sd * b.sd)) * smooth(t / 8));
// progesterone relative to its own peak, by days since the egg
const p4At = (d) => smooth(d / 6) * (1 - smooth((d - S.luteal + 4) / 4));
// hCG relative to where it ends up; the doubling is why the line looks like nothing, then everything
const hcgAt = (d) => (d < IMPLANT ? 0 : (2 ** ((d - IMPLANT) / 2) - 1) / (2 ** ((PREG_END - IMPLANT) / 2) - 1));

/* ── state ──────────────────────────────────────────────────────────────── */

const fresh = () => ({
  h: 0, T: 0, r: RATE.day, c0: 0, phase: 'idle', running: false,
  pressed: false, holding: false, wasHolding: false, heldFrom: 0,
  luteal: 13, noEgg: Math.round(between(NO_EGG)),
  e2: E2.low, lh: 1, p4: 0, hcg: 0, lin: .35, brake: 0, held: 0, letGoAt: 0, releasedAt: null,
  onset: null, ovH: null, ovDay: null, offer: false, preg: null, ended: false, shed: { until: DAY * SHED, uneven: false }, summaryAt: null, pull: 0, paused: false,
  hist: [[-24000, E2.low, 1, 0, .35, -1000, 0], [0, E2.low, 1, 0, .35, 0, 0]], lastSample: 0,
  marks: [], ticks: [], lastDay: 0, dots: [], spawnE2: 0, spawnLH: 0, spawnP4: 0, spawnBlood: 0, spawnHCG: 0, ripple: 0, flip: false,
  results: [], cause: 'bleed', line: 'idle', lineSince: -Infinity, nopeUntil: 0, late: false, summary: '', winFrom: 0,
});
const S = fresh();
const day = () => Math.floor((S.h - S.c0) / DAY) + 1;
// an implanted embryo is the one thing that stops the fall
// Baird 2003: in most pregnancies progesterone rises around implantation
const p4Now = (d) => (S.preg ? smooth(d / 6) * (1 + .25 * smooth((d - IMPLANT) / 2)) : p4At(d));

/* ── model ──────────────────────────────────────────────────────────────── */

function step(dh, dt) {
  S.h += dh; S.T += dt;
  const t = S.onset === null ? 0 : S.h - S.onset;
  const d = S.ovH === null ? 0 : (S.h - S.ovH) / DAY;

  if (S.phase === 'grow' && day() >= READY) S.phase = 'ready';
  S.holding = S.pressed && S.phase === 'ready';
  if (S.holding && !S.wasHolding && S.held === 0) S.heldFrom = S.h;
  if (!S.holding && S.wasHolding && S.phase === 'ready') { S.letGoAt = S.held; S.releasedAt = S.h; }
  if (S.holding) S.releasedAt = null;
  S.wasHolding = S.holding;

  let tgt = E2.low + 20 * clamp01(day() / READY), tau = E2.tau;
  if (S.holding) tgt = E2.hold;
  if (S.phase === 'fired') { tgt = E2.low + 15; tau = E2.spent; }
  if (S.phase === 'luteal') tgt = E2.low + E2.luteal * p4Now(d);
  S.e2 += (tgt - S.e2) * (1 - Math.exp(-dh / tau));
  S.p4 = S.phase === 'luteal' ? p4Now(d) : 0;
  S.hcg = S.preg ? hcgAt(d) : 0;

  if (S.phase === 'ready') {
    S.held = S.e2 > E2.counts ? S.held + dh : 0;
    if (S.held >= 36 && !S.marks.some((m) => m.attempt === S.heldFrom && m.at === 36)) mark({ label: '36 h · LH response gone · 2 women', at: 36, attempt: S.heldFrom, y: .34 });
    if (S.held === 0) for (const m of S.marks) if (m.attempt === S.heldFrom) m.spent = true;
    if (S.held >= ONSET) fire();
    else if (S.releasedAt !== null && S.held === 0 && day() >= S.noEgg && S.h - S.releasedAt > 2 * DAY) endCycle(null);
    else if (S.releasedAt === null && !S.holding && day() >= S.noEgg) endCycle(null);
  }
  if (S.phase === 'fired' && t >= OVULATION) {
    S.phase = 'luteal'; S.ovH = S.h; S.ovDay = day(); S.luteal = between(LUTEAL);
    S.offer = S.results.some((r) => r.ov !== null);   // the first cycle always teaches the plain clock
    mark({ label: `Egg out · day ${S.ovDay}`, big: true, y: .3 });
    n.ov.dataset.state = 'empty'; n.ovName.textContent = 'Empty follicle';
  }
  if (S.phase === 'luteal' && d >= S.luteal && !S.preg) endCycle(S.ovDay);
  if (S.preg) pregnancy(d);

  const brakeTgt = S.phase === 'fired' ? 0 : S.e2 > 60 || S.p4 > .2 ? 1 : 0;
  S.brake += (brakeTgt - S.brake) * (1 - Math.exp(-dh / 10));
  S.lh = 1 - BRAKE * S.brake + (S.phase === 'fired' || (S.onset !== null && t < SURGE.len) ? bump(t, SURGE) : 0);

  // estradiol builds the lining, progesterone stops it building; the shed reads the withdrawal, never estradiol
  if (S.shed && S.h < S.shed.until) {
    const gate = S.shed.uneven ? (Math.sin(S.h * .55) + Math.sin(S.h * .23) > .4 ? 1 : .08) : 1;
    S.lin += ((S.shed.uneven ? .22 : LINING.base) - S.lin) * (1 - Math.exp(-dh * gate / 26));
  } else if (S.p4 < .1 && S.phase !== 'luteal') {
    S.lin += (1 - S.lin) * (1 - Math.exp(-LINING.grow * dh * clamp01((S.e2 - 25) / 145)));
  } else if (d > S.luteal - 4 && !S.preg) {
    S.lin -= .012 * dh / DAY;   // Yen & Jaffe: the lining shrinks before a period
  }

  const nowDay = day();
  if (nowDay !== S.lastDay) { S.lastDay = nowDay; S.ticks.push({ h: S.h, T: S.T, d: nowDay }); if (scene && (nowDay === 1 || nowDay % 7 === 0)) dayLabel(S.ticks[S.ticks.length - 1]); }
  if (S.T - S.lastSample >= .08) { S.hist.push([S.h, S.e2, S.lh, S.p4, S.lin, S.T, S.hcg]); S.lastSample = S.T; }
  if (S.summaryAt !== null && S.h >= S.summaryAt) pause();
}

function fire() {
  S.phase = 'fired'; S.onset = S.h; S.held = ONSET; S.ripple = 1; S.flip = true;
  mark({ label: '60 h · LH response up · 2 women', at: 60, attempt: S.heldFrom, y: .38 });
  if (!reduced) { n.stage.classList.remove('jolt'); void n.stage.offsetWidth; n.stage.classList.add('jolt'); }
}

function pregnancy(d) {
  if (!S.preg.implanted && d >= IMPLANT) {
    S.preg.implanted = true;
    mark({ label: `Embryo implants · day ${day()}`, big: true, y: .25 });
    setLastLink('hCG keeps it going, so progesterone does not fall.', 'hcg');
  }
  if (!S.preg.due && d >= S.luteal) {
    S.preg.due = true;
    mark({ label: `Bleed was due · day ${day()}`, big: true, y: .36 });
  }
  if (d >= PREG_END) {
    S.ended = true; S.winFrom = S.c0;
    S.results.push({ ov: S.ovDay, len: day() - 1, preg: true });
    pause();
  }
}
function setLastLink(text, c) {
  const li = n.chain.lastElementChild;
  li.textContent = text; li.dataset.c = c;
}

function endCycle(ovDay) {
  const len = day() - 1;
  S.winFrom = S.c0;
  S.results.push({ ov: ovDay, len });
  S.c0 = S.h; S.lastDay = 0; S.phase = 'grow'; S.ovH = null; S.onset = null; S.held = 0; S.heldFrom = null; S.releasedAt = null; S.letGoAt = 0; S.noEgg = Math.round(between(NO_EGG));
  S.shed = { until: S.h + SHED * DAY, uneven: ovDay === null };
  S.summaryAt = S.h + 2.2 * DAY;
  S.cause = ovDay === null ? 'noegg' : 'bleed';
  mark({ label: ovDay === null ? 'Bleed, no egg · new day 1' : 'Bleed · new day 1', big: true, y: .3 });
  n.ov.dataset.state = 'spent'; n.ovName.textContent = 'Follicle';
  requestAnimationFrame(() => { n.ov.dataset.state = 'follicle'; });
}

function pause() {
  S.summaryAt = null; S.paused = true; S.summary = summaryLine();
  renderBars();
  n.future.dataset.mode = 'summary';
}

function summaryLine() {
  const r = S.results[S.results.length - 1];
  if (r.preg) return 'A late period, and this time not a late egg. One signal from the embryo kept the second half going. Press space to start over.';
  const earlier = S.results.slice(0, -1).filter((x) => x.ov !== null);
  const prev = earlier[earlier.length - 1];
  if (r.ov === null) return `No egg this cycle, and still a bleed. In women with regular cycles it can come at about the usual time, so a period does not prove ovulation. Press space.`;
  if (!prev) return `Egg on day ${r.ov}, bleed ${r.len + 1 - r.ov} days later. Press space. This time wait longer before you hold, and tap once the egg is out.`;
  const late = r.ov - prev.ov, moved = r.len - prev.len;
  const days = (v) => `${v} day${v === 1 ? '' : 's'}`;
  if (late >= 2 && moved >= 1) return `Egg ${days(late)} later than last time, and the bleed ${days(moved)} later. A late period mostly means a late egg, already decided about two weeks before anyone noticed. Press space.`;
  if (late <= -2 && moved <= -1) return `Egg ${days(-late)} earlier than last time, and the bleed ${days(-moved)} earlier. The days after the egg barely moved. Press space.`;
  return `Egg on day ${r.ov}, bleed ${r.len + 1 - r.ov} days later. The first half decides most of this. Press space, and try waiting longer before you hold.`;
}

function renderBars() {
  const rows = S.results.slice(-4).map((r) => {
    const px = (v) => `${(v / 50) * 100}%`;
    const inner = r.ov === null
      ? `<span class="none" style="width:${px(r.len)}"></span>`
      : `<span class="e2" style="width:${px(r.ov - 1)}"></span><span class="p4" style="width:${px(r.len + 1 - r.ov)}"></span>`;
    return `<div class="bar">${inner}<b>${r.preg ? 'no bleed' : `${r.len} days`}</b></div>`;
  }).join('');
  n.bars.innerHTML = `<p class="label bars-head"><i class="e2">Before the egg</i><i class="p4">After the egg</i></p>${rows}`;
}

function rateNow() {
  if (S.phase === 'fired') return RATE.hold * lerp(SLOWMO, 1, smooth((S.h - S.onset - 8) / 14));
  if (S.holding) return RATE.hold;
  if (S.phase === 'luteal') {
    const d = (S.h - S.ovH) / DAY;
    if (S.offer && !S.preg && d < 1) return RATE.hold;
    if (d < 1.5) return lerp(RATE.hold, RATE.day, d / 1.5);
    if (S.preg) return d > IMPLANT - .5 && d < S.luteal ? RATE.fall : RATE.day;
    return d > S.luteal - 2 ? RATE.fall : RATE.day;
  }
  if (S.shed && S.h < S.shed.until - 2 * DAY) return RATE.fall;
  return RATE.day;
}

/* ── words ──────────────────────────────────────────────────────────────── */

function wanted(now) {
  if (S.paused) return 'summary';
  if (now < S.nopeUntil) return S.phase === 'luteal' ? (S.late ? 'toolate' : 'nope') : 'early';
  const dy = day();
  if (S.phase === 'idle') return 'idle';
  if (S.phase === 'fired') { const t = S.h - S.onset; return t > 9 ? 'letgo' : 'fired'; }
  if (S.phase === 'luteal') {
    const d = (S.h - S.ovH) / DAY;
    if (S.preg) return d - S.preg.at < 1 ? 'met' : d < 4.5 ? 'p4' : d < IMPLANT - .3 ? 'drift' : d < 11 ? 'implanted' : d < S.luteal ? 'rescue' : d < 17 ? 'nobleed' : 'climbs';
    if (S.offer && d < 1) return S.pressed ? 'offerheld' : 'offer';
    return d < 1 ? 'egg' : d < 4.5 ? 'p4' : d < 8 ? 'timer' : d < S.luteal - 2 ? 'noembryo' : 'fall';
  }
  if (S.summaryAt !== null) return S.cause;
  if (S.phase === 'grow') return S.shed && S.h < S.shed.until && !S.results.length ? 'shed' : 'grow';
  if (S.holding) {
    if (S.held >= 46) return 'same';
    if (S.held >= 36) return 'thirtysix';
    if (S.held >= 24) return 'steady';
    return S.h - S.heldFrom >= 10 ? 'braking' : 'rising';
  }
  if (S.releasedAt !== null) return 'released';
  return dy >= 16 ? 'wait' : 'ready';
}

let swap = 0;
function say(now) {
  const key = wanted(now);
  if (key === S.line) return;
  const urgent = ['released', 'nope', 'toolate', 'early', 'summary', 'rising', 'offer', 'offerheld', 'met'].includes(key) || S.line === 'released';
  if (!urgent && now - S.lineSince < MIN_LINE_MS) return;
  S.line = key; S.lineSince = now;
  const text = key === 'summary' ? S.summary
    : key === 'released' ? (S.letGoAt < 1 ? 'Too short to count. Estradiol falls back as soon as the hold stops.' : `Let go at ${Math.floor(S.letGoAt)} hours. Nothing fired, and the count starts over.`)
    : LINES[key];
  n.say.classList.add('swap');
  clearTimeout(swap);
  swap = setTimeout(() => { n.say.textContent = text; n.say.classList.remove('swap'); }, reduced ? 0 : 180);
}

function chainStep() {
  if (S.phase === 'fired') return S.h - S.onset < 20 ? 1 : 2;
  if (S.phase === 'luteal') { const d = (S.h - S.ovH) / DAY; return d < 1 ? 2 : d < (S.preg ? IMPLANT : S.luteal - 2) ? 3 : 4; }
  if (S.shed && S.h < S.shed.until && S.phase !== 'idle') return 4;
  if (S.holding && S.held >= 36) return 1;
  return 0;
}

/* ── stage ──────────────────────────────────────────────────────────────── */

let scene = null;
const rem = (v) => v * parseFloat(getComputedStyle(document.documentElement).fontSize);
function build() {
  const W = n.plot.clientWidth, H = n.plot.clientHeight;
  if (!W || !H) return;
  n.plot.replaceChildren();
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, n.plot);
  const nowX = W * parseFloat(getComputedStyle(n.stage).getPropertyValue('--now')) / 100;
  // three floors: LH hangs from the top, ovary hormones stand on the floor line, the lining grows up to it
  const floor = H * .78, unit = H * .075;
  scene = {
    W, H, nowX, floor, pxs: W * .024,
    ly: (v) => v * unit, ey: (v) => floor - (v / E2.hold) * H * .36, py: (v) => floor - v * H * .3, hy: (v) => floor - v * H * .62, ny: (v) => H - v * (H - floor - rem(1.75)),
    linArea: svg('path', { class: 'area lining' }, root), linEdge: svg('path', { class: 'edge lining' }, root),
    e2Area: svg('path', { class: 'area e2' }, root), e2Edge: svg('path', { class: 'edge e2' }, root),
    p4Area: svg('path', { class: 'area p4' }, root), p4Edge: svg('path', { class: 'edge p4' }, root),
    hcgArea: svg('path', { class: 'area hcg' }, root), hcgEdge: svg('path', { class: 'edge hcg' }, root),
    lhArea: svg('path', { class: 'area lh' }, root), lhEdge: svg('path', { class: 'edge lh' }, root),
    floorMask: svg('line', { class: 'floor-mask', x1: 0, x2: nowX, y1: floor, y2: floor }, root),
    floorLine: svg('line', { class: 'floor', x1: 0, x2: nowX, y1: floor, y2: floor }, root),
    ticks: svg('path', { class: 'ticks' }, root),
    dayLayer: svg('g', {}, root), markLayer: svg('g', {}, root),
    line: svg('line', { class: 'now', x1: nowX, x2: nowX, y1: 0, y2: H }, root),
    dotLayer: svg('g', {}, root),
    embryo: embryoEl(root),
    ripple: svg('circle', { class: 'ripple', cx: nowX, cy: rem(4.75) }, root),
    names: { lh: nameEl(root, 'LH', 'lh'), e2: nameEl(root, 'Estradiol', 'e2'), p4: nameEl(root, 'Progesterone', 'p4'), lin: nameEl(root, 'Lining', 'lining'), hcg: nameEl(root, 'hCG', 'hcg') },
  };
  for (const m of S.marks) drawMark(m);
  for (const t of S.ticks) if (t.d === 1 || t.d % 7 === 0) dayLabel(t);
  for (const dt of S.dots) dt.el = null;
  draw();
}
const nameEl = (root, label, kind) => {
  const text = svg('text', { class: 'name' }, root); text.textContent = label;
  return { text, dot: svg('circle', { class: `swatch ${kind}`, r: 4 }, root) };
};

function embryoEl(root) {
  const g = svg('g', { class: 'embryo', visibility: 'hidden' }, root);
  const shell = svg('circle', { class: 'shell' }, g);
  const cells = Array.from({ length: 8 }, () => svg('circle', { class: 'cell' }, g));
  const text = svg('text', { class: 'name embryo-name', y: 3 }, g); text.textContent = 'Embryo';
  return { g, shell, cells, text, drawn: '' };
}
// cells double on the way down, then gather to one side of a hollow ball before it implants
function drawEmbryo(d, r) {
  const hollow = d >= 4, n = hollow ? 5 : d < 1.5 ? 2 : d < 2.5 ? 4 : 8;
  const key = `${n}:${r.toFixed(1)}`, e = scene.embryo;
  if (key === e.drawn) return;
  e.drawn = key;
  e.shell.setAttribute('r', r);
  e.text.setAttribute('x', r + 7);
  const ring = hollow ? r * .56 : n === 2 ? r * .4 : r * .46, cell = hollow ? r * .22 : n === 2 ? r * .38 : n === 4 ? r * .32 : r * .24;
  e.cells.forEach((c, i) => {
    const a = hollow ? 2.1 + i * .52 : (i / n) * Math.PI * 2 + .4;
    c.setAttribute('visibility', i < n ? 'inherit' : 'hidden');
    c.setAttribute('cx', Math.cos(a) * ring); c.setAttribute('cy', Math.sin(a) * ring); c.setAttribute('r', cell);
  });
}
function mark(m) { m.h = S.h; m.T = S.T; S.marks.push(m); if (scene) drawMark(m); }
function drawMark(m) {
  m.g = svg('g', { class: m.big ? 'mark big' : 'mark' }, scene.markLayer);
  m.lineEl = svg('line', {}, m.g); m.textEl = svg('text', {}, m.g);
  m.textEl.textContent = m.label;
}

function dayLabel(t) { t.el = svg('text', { class: 'day', y: scene.floor + 14 }, scene.dayLayer); t.el.textContent = t.d; }

function draw() {
  const { H, nowX, floor, ly, ey, py, hy, ny, pxs } = scene;
  const e = easeInOut(S.pull);
  // while running, x is real seconds, so a held hour is wide; the pull-back morphs to true linear hours
  const xOf = (h, T) => lerp(nowX - (S.T - T) * pxs, ((h - S.winFrom) / Math.max(S.h - S.winFrom, 1)) * nowX, e);
  const rows = e === 0 ? S.hist.filter((r, i) => { const nx = S.hist[i + 1]; return !nx || nowX - (S.T - nx[5]) * pxs >= -2; }) : S.hist;
  const pts = rows.map((r) => [xOf(r[0], r[5]), r]);
  pts.push([nowX, [S.h, S.e2, S.lh, S.p4, S.lin, S.T, S.hcg]]);
  const id = (v) => v;
  const series = (i, sy) => seriesPath(pts.map((p) => [p[0], p[1][i]]), id, sy);
  const x0 = pts[0][0].toFixed(1);
  const e2 = series(1, ey), lh = series(2, ly), p4 = series(3, py), lin = series(4, ny), hcg = series(6, hy);
  scene.e2Edge.setAttribute('d', e2); scene.e2Area.setAttribute('d', `${e2}L${nowX},${floor}L${x0},${floor}Z`);
  scene.lhEdge.setAttribute('d', lh); scene.lhArea.setAttribute('d', `${lh}L${nowX},0L${x0},0Z`);
  scene.p4Edge.setAttribute('d', p4); scene.p4Area.setAttribute('d', `${p4}L${nowX},${floor}L${x0},${floor}Z`);
  scene.hcgEdge.setAttribute('d', hcg); scene.hcgArea.setAttribute('d', `${hcg}L${nowX},${floor}L${x0},${floor}Z`);
  scene.linEdge.setAttribute('d', lin); scene.linArea.setAttribute('d', `${lin}L${nowX},${H}L${x0},${H}Z`);

  let tick = '';
  for (const t of S.ticks) {
    const x = xOf(t.h, t.T);
    if (x < -40) { if (t.el) t.el.setAttribute('visibility', 'hidden'); continue; }
    tick += `M${x.toFixed(1)},${floor - 3}V${floor + 3}`;
    if (t.el) { t.el.setAttribute('visibility', 'visible'); t.el.setAttribute('x', x.toFixed(1)); }
  }
  scene.ticks.setAttribute('d', tick);

  for (const m of S.marks) {
    const x = xOf(m.h, m.T);
    if (x < -400) { m.g.setAttribute('visibility', 'hidden'); continue; }
    m.g.setAttribute('visibility', 'visible');
    m.lineEl.setAttribute('x1', x); m.lineEl.setAttribute('x2', x);
    m.lineEl.setAttribute('y1', m.big ? 0 : ly(1)); m.lineEl.setAttribute('y2', m.big ? H : floor);
    m.textEl.setAttribute('x', x - 8); m.textEl.setAttribute('y', H * m.y);
    m.g.style.opacity = m.big ? 1 : (m.spent ? .3 : 1) * (1 - e);
  }

  const ovR = rem(+getComputedStyle(n.ov).getPropertyValue('--d') || 5) / 2;
  const clear = rem(3.5) + 14, cov = ovR + 16;
  const place = ({ text, dot }, x, y) => {
    text.setAttribute('x', x - 14); text.setAttribute('y', y);
    dot.setAttribute('cx', x - 4); dot.setAttribute('cy', y - 4);
  };
  // these curves cross, so their labels stack in height order instead of colliding
  const stack = [[scene.names.e2, ey(S.e2) - 8], [scene.names.p4, py(S.p4) - 8]];
  const hasHCG = S.hcg > 0;
  scene.names.hcg.text.setAttribute('visibility', hasHCG ? 'visible' : 'hidden');
  scene.names.hcg.dot.setAttribute('visibility', hasHCG ? 'visible' : 'hidden');
  if (hasHCG) stack.push([scene.names.hcg, hy(S.hcg) - 8]);
  stack.sort((a, b) => a[1] - b[1]);
  stack.forEach((row, i) => { if (i && row[1] - stack[i - 1][1] < rem(1.1)) row[1] = stack[i - 1][1] + rem(1.1); });
  place(scene.names.lh, nowX - clear, Math.max(ly(S.lh) + 16, 20));
  for (const [name, y] of stack) place(name, nowX - cov, y);
  place(scene.names.lin, nowX - (S.preg ? 30 : 12), Math.min(ny(S.lin) + 16, H - 6));

  if (S.preg) {
    const d = (S.h - S.ovH) / DAY, k = smooth((d - S.preg.at) / (IMPLANT - S.preg.at)), r = lerp(8, 12, k);
    scene.embryo.g.setAttribute('visibility', 'visible');
    scene.embryo.g.setAttribute('transform', `translate(${nowX} ${lerp(H * .6, ny(S.lin) + r + 4, k)})`);
    drawEmbryo(d, r);
  } else scene.embryo.g.setAttribute('visibility', 'hidden');

  for (const d of S.dots) {
    if (!d.el) continue;
    if (d.kind === 'blood') { d.el.setAttribute('cx', nowX - d.dx); d.el.setAttribute('cy', lerp(ny(d.top), H + 8, d.p * d.p)); } else {
      d.el.setAttribute('cx', nowX); d.el.setAttribute('cy', lerp(H * d.y0, H * d.y1, d.p));
    }
  }
  if (S.ripple > 0) {
    scene.ripple.setAttribute('r', rem(3.5) + (1 - S.ripple) * scene.W * .35);
    scene.ripple.style.opacity = S.ripple * .8;
  } else scene.ripple.style.opacity = 0;
}

function paint() {
  const dy = day();
  let num = dy, unit = 'day of this cycle', sub = '', cs = '';
  if (S.phase === 'idle') { num = 1; }
  else if (S.phase === 'fired') { num = ONSET; unit = 'hours of estradiol'; sub = `Day ${dy}`; cs = 'fired'; }
  else if (S.phase === 'luteal') { num = Math.floor((S.h - S.ovH) / DAY); unit = 'days since the egg'; sub = `Day ${dy}`; cs = 'luteal'; }
  else if (S.holding) { num = Math.floor(S.held); unit = 'hours of estradiol'; sub = `Day ${dy}`; }
  else if (S.held > 0) { num = Math.floor(S.letGoAt); unit = 'hours of estradiol'; sub = `Day ${dy}`; cs = 'fading'; }
  else if (S.shed && S.h < S.shed.until && S.results.length) cs = 'shed';
  if (n.count.textContent !== String(num)) n.count.textContent = num;
  if (n.unit.textContent !== unit) n.unit.textContent = unit;
  if (n.sub.textContent !== sub) n.sub.textContent = sub;
  if (n.countWrap.dataset.state !== cs) n.countWrap.dataset.state = cs;

  const d = S.phase === 'luteal' ? lerp(7, 5.2, clamp01(Math.min((S.h - S.ovH) / DAY, S.preg ? IMPLANT : S.luteal) / S.luteal)) : S.phase === 'fired' ? 8.5 : lerp(5, 8.5, clamp01((dy - 1) / 11) * .75 + clamp01(S.held / ONSET) * .25);
  const dd = d.toFixed(2);
  if (n.ov.style.getPropertyValue('--d') !== dd) n.ov.style.setProperty('--d', dd);
  const tint = (S.phase === 'luteal' ? clamp01(S.p4) : clamp01((S.e2 - E2.low) / (E2.hold - E2.low))).toFixed(2);
  if (n.ov.style.getPropertyValue('--k') !== tint) n.ov.style.setProperty('--k', tint);
  const hold = String(S.holding);
  if (n.ov.dataset.hold !== hold) n.ov.dataset.hold = hold;

  const firing = S.onset !== null && S.h - S.onset < SURGE.len;
  const pit = firing ? 'firing' : S.brake > .3 ? 'braking' : 'quiet';
  if (n.pit.dataset.state !== pit) {
    n.pit.dataset.state = pit;
    n.pitState.textContent = { quiet: 'listening', braking: 'braking', firing: 'firing' }[pit];
  }

  const inviting = S.phase === 'luteal' && S.offer && !S.preg && (S.h - S.ovH) / DAY < 1;
  const useful = S.paused || S.phase === 'idle' || S.phase === 'ready' || inviting;
  n.key.classList.toggle('down', S.pressed);
  n.key.classList.toggle('live', S.holding);
  n.key.classList.toggle('invite', inviting);
  const keyText = inviting ? 'tap' : 'space';
  if (n.key.textContent !== keyText) n.key.textContent = keyText;
  n.key.classList.toggle('idle', !useful && !S.pressed);
  n.reset.hidden = S.phase === 'idle';
  n.speed.textContent = `Speed ${speed}× · [ and ] to change · R to start over`;

  const stepNow = chainStep();
  [...n.chain.children].forEach((li, i) => { li.className = `${li.dataset.c} ${i === stepNow ? 'now' : i < stepNow ? 'done' : ''}`; });
}

/* ── blood ──────────────────────────────────────────────────────────────── */

function spawn(kind, y0, y1, extra = {}) {
  if (reduced || S.dots.length > 70 || !scene) return;
  const r = kind === 'blood' ? 3 + Math.random() * 3 : 4;
  S.dots.push({ kind, y0, y1, p: 0, el: svg('circle', { class: `dot ${kind}`, r }, scene.dotLayer), ...extra });
}
function moveDots(dt) {
  // along the now line: pituitary .1, ovary .52, lining .82
  S.spawnE2 += dt; S.spawnLH += dt; S.spawnP4 += dt; S.spawnBlood += dt; S.spawnHCG += dt;
  const live = !S.paused;
  if (live && S.e2 > 60 && S.spawnE2 > .38) { S.spawnE2 = 0; spawn('e2', .46, .14); spawn('e2', .58, .82); }
  if (live && S.onset !== null && S.h - S.onset < 26 && S.spawnLH > .1) { S.spawnLH = 0; spawn('lh', .14, .46); }
  if (live && S.p4 > .2 && S.spawnP4 > .34) { S.spawnP4 = 0; spawn('p4', .58, .82); }
  if (live && S.hcg > 0 && S.spawnHCG > .3) { S.spawnHCG = 0; spawn('hcg', .84, .58); }
  const shedding = live && S.shed && S.h < S.shed.until && S.phase !== 'idle';
  if (shedding && S.spawnBlood > (S.shed.uneven ? .26 : .05)) {
    S.spawnBlood = 0;
    spawn('blood', 0, 0, { dx: 6 + Math.random() * scene.nowX * .22, top: S.lin * Math.random(), speed: .9 + Math.random() * .6 });
  }
  for (let i = S.dots.length - 1; i >= 0; i--) {
    const d = S.dots[i];
    d.p += dt / (d.kind === 'blood' ? d.speed : 1.3);
    if (d.p >= 1) { d.el?.remove(); S.dots.splice(i, 1); }
  }
  if (S.ripple > 0) S.ripple = Math.max(0, S.ripple - dt / 1.6);
}

/* ── clock ──────────────────────────────────────────────────────────────── */

let last = 0, raf = 0;
function tick(now) {
  const dt = Math.min(.6, (now - last) / 1000); last = now;
  if (S.paused) {
    S.pull = reduced ? 1 : Math.min(1, S.pull + dt / 1.6);
  } else {
    if (S.pull > 0) S.pull = reduced ? 0 : Math.max(0, S.pull - dt / 1.1);
    S.r += (rateNow() * speed - S.r) * (1 - Math.exp(-dt / .22));
    step(S.r * dt, dt);
  }
  moveDots(dt);
  if (scene) draw();
  paint();
  say(now);
  if (S.paused && S.pull >= 1 && !S.dots.length) { S.running = false; return; }
  raf = requestAnimationFrame(tick);
}
function run() {
  if (S.running) return;
  S.running = true; last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

/* ── hands ──────────────────────────────────────────────────────────────── */

function press() {
  S.pressed = true;
  if (S.phase === 'idle') { S.phase = 'grow'; S.shed = { until: S.h + SHED * DAY, uneven: false }; run(); return; }
  if (S.paused && S.ended) { startOver(); return; }
  if (S.paused) { S.paused = false; n.future.dataset.mode = ''; run(); return; }
  if (S.phase === 'luteal' && S.offer && !S.preg && (S.h - S.ovH) / DAY < 1) {
    S.preg = { at: (S.h - S.ovH) / DAY, implanted: false, due: false };
    n.ov.dataset.embryo = 'true';
    return;
  }
  if (S.phase === 'luteal' || S.phase === 'grow') {
    S.late = S.phase === 'luteal' && S.offer && !S.preg && (S.h - S.ovH) / DAY < 1.5;
    S.nopeUntil = performance.now() + 1800;
    n.key.classList.remove('nope'); void n.key.offsetWidth; n.key.classList.add('nope');
  }
}
function release() { S.pressed = false; }
function startOver() {
  cancelAnimationFrame(raf); clearTimeout(swap);
  Object.assign(S, fresh());
  n.future.dataset.mode = '';
  n.ov.dataset.state = 'follicle'; n.ov.dataset.embryo = ''; n.ovName.textContent = 'Follicle';
  setLastLink(LAST_LINK.text, LAST_LINK.c);
  n.say.classList.remove('swap'); n.say.textContent = LINES.idle;
  build();
  paint();
}

// space scrolls the page unless the stage is the thing on screen
const onStage = () => scrollY < innerHeight / 2;
addEventListener('keydown', (e) => {
  if (e.key === '[' || e.key === ']') {
    speed = Math.max(.25, Math.min(4, speed + (e.key === ']' ? .25 : -.25)));
    paint();
    return;
  }
  if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) { startOver(); return; }
  if (e.key !== ' ' || !onStage() || e.target.closest('button, a')) return;
  e.preventDefault();
  if (!e.repeat) press();
});
addEventListener('keyup', (e) => { if (e.key === ' ' && !e.target.closest('button, a')) { e.preventDefault(); release(); } });
addEventListener('blur', release);

n.stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button, a')) return;
  try { n.stage.setPointerCapture(e.pointerId); } catch { /* the hold still works without capture */ }
  press();
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) n.stage.addEventListener(ev, release);
n.stage.addEventListener('contextmenu', (e) => e.preventDefault());

// without the blur, the next space would press this button instead of the follicle
n.reset.addEventListener('click', () => { startOver(); n.reset.blur(); });

build();
paint();
new ResizeObserver(() => { build(); if (scene) paint(); }).observe(n.plot);
