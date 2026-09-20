import { SOURCES, MOLECULES, DAYS } from '../data/two-bodies.js';
import { svg, lerp, clamp01, easeInOut, linear, niceMax, ticks, fmt, monotone, mulberry32, seriesPath } from '../js/plot.js';

const BODIES = ['women', 'men'];
const NAMES = { women: 'Women', men: 'Men' };
const X0 = DAYS.from - .5, X1 = DAYS.to + .5;
// whole-month marks (one interval, the two paired draws) sit at the right edge, clear of the curve;
// the two bodies take different columns so they stay apart on one scale
const EDGE = { men: X1 - .7, women: X1 - 2.4 };
const XAXIS = {
  women: { at: [-14, -7, 0, 7, 14], text: ['−14', '−7', 'LH peak', '+7', '+14'], cap: ['days from her LH peak', 'luteinizing hormone, which releases the egg'] },
  men: { at: [-15, -8, -1, 6, 13], text: ['1', '8', '15', '22', '29'], cap: ['any thirty days'] },
};
// a pulse comb needs more time per pixel than a smooth curve
const INTRO_MS = { e2: 1500, t: 3000 };
// how late the mean line and ribbon start, as a fraction of the sweep; both edges move at the
// same speed, so raising this delays and never accelerates
const INTRO_LAG = .4;
const MODEL_NOTES = {
  'through-medians': 'smooth curve drawn through the medians above',
  'daily-rhythm': 'daily cosine through the two medians above, peak at 7 am',
};

const root = document.querySelector('.instrument');
const chartEl = document.getElementById('chart');
const captionEl = document.getElementById('caption');
const evText = document.querySelector('#evidence .ev-text');
const evSrc = document.querySelector('#evidence .ev-src');
const alignBtn = document.getElementById('align');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const state = { mol: 'e2', m: 0, on: false, intro: 1 };
const modelCache = new Map();
let scene = null, raf = 0, introRaf = 0, introObs = null, pinned = null, hot = null;

const smooth = (v, a, b) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const sweep = (k) => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const set = (node, attrs) => { for (const k in attrs) node.setAttribute(k, typeof attrs[k] === 'number' ? attrs[k].toFixed(1) : attrs[k]); };
const wholeMonth = (band) => band.from <= DAYS.from && band.to >= DAYS.to;

/* ── models ─────────────────────────────────────────────────────────── */

function sampleModel(spec) {
  const model = spec.model;
  if (!model) return null;
  if (model.kind === 'through-medians') {
    const f = monotone(spec.medians.map((p) => [p.x, p.v]));
    const a = spec.medians[0].x, b = spec.medians[spec.medians.length - 1].x, out = [];
    for (let x = a; x <= b + 1e-9; x += .1) out.push([x, f(x)]);
    return { curve: out };
  }

  const [am, pm] = spec.levels, mid = (am.v + pm.v) / 2, amp = (am.v - pm.v) / 2;
  const stepMin = 10, n = Math.round((X1 - X0) * 1440 / stepMin);

  let swell = null, swellMean = 1;
  if (model.swell) {
    swell = monotone(model.swell);
    let sum = 0, count = 0;
    for (let x = X0; x <= X1; x += .25) { sum += swell(x); count++; }
    swellMean = sum / count;
  }

  // pulse train is scaled to mean 1, so the curve still passes through the measured medians
  let factor = null;
  if (model.pulses) {
    const { everyMin, jitterMin, rise, decayMin } = model.pulses, riseMin = 12;
    const rnd = mulberry32(7);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    const kernel = (d) => (1 - Math.exp(-d / riseMin)) * Math.exp(-d / decayMin);
    const kMax = kernel(riseMin * Math.log(1 + decayMin / riseMin));
    const pulses = [];
    for (let at = -4 * everyMin; at < (X1 - X0) * 1440; at += everyMin + jitterMin * gauss()) pulses.push([at, rise * (.7 + .6 * rnd())]);
    factor = new Float64Array(n + 1);
    let first = 0, sum = 0;
    for (let i = 0; i <= n; i++) {
      const now = i * stepMin;
      while (first < pulses.length && now - pulses[first][0] > 8 * decayMin) first++;
      let f = 1;
      for (let j = first; j < pulses.length && pulses[j][0] <= now; j++) f += pulses[j][1] * kernel(now - pulses[j][0]) / kMax;
      factor[i] = f; sum += f;
    }
    const mean = sum / (n + 1);
    for (let i = 0; i <= n; i++) factor[i] /= mean;
  }

  // one day per bin: a 30-day window cannot show a pulse, so it shows each day's spread instead
  const bins = new Map(), raw = [];
  for (let i = 0; i <= n; i++) {
    const x = X0 + (i * stepMin) / 1440, hour = ((x - X0) * 24) % 24;
    let v = mid + amp * Math.cos((2 * Math.PI * (hour - am.hour)) / 24);
    if (swell) v *= swell(x) / swellMean;
    if (factor) v *= factor[i];
    raw.push([x, v]);
    const day = Math.max(DAYS.from, Math.min(DAYS.to, Math.round(x)));
    const bin = bins.get(day) || { lo: Infinity, hi: -Infinity, sum: 0, count: 0 };
    bin.lo = Math.min(bin.lo, v); bin.hi = Math.max(bin.hi, v); bin.sum += v; bin.count++;
    bins.set(day, bin);
  }
  const env = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([day, bin]) => ({ x: day, lo: bin.lo, hi: bin.hi, mean: bin.sum / bin.count }));
  return { curve: env.map((e) => [e.x, e.mean]), env, raw };
}

function samplesFor(mol, body) {
  const key = `${mol}/${body}`;
  if (!modelCache.has(key)) modelCache.set(key, sampleModel(MOLECULES[mol][body]));
  return modelCache.get(key);
}

/* ── marks: every measured thing can say where it came from ─────────── */

function describe(mol, body, kind, d) {
  const M = MOLECULES[mol], spec = M[body];
  if (kind === 'band') {
    const src = SOURCES[spec.bandSource], native = d.native ? ` (${d.native})` : '';
    return { text: `${NAMES[body]}, ${d.phase}: ${fmt(d.lo)}–${fmt(d.hi)} ${M.unit}${native}. Where at least 95 in 100 land, ${spec.sample.replace(' · ', ', ')}. ${src.short}, ${src.method}.`, url: src.url };
  }
  if (kind === 'median') {
    const src = SOURCES[spec.medianSource];
    return { text: `${NAMES[body]}, ${d.phase}: middle value ${fmt(d.v)} ${M.unit} (n = ${d.n}). ${src.short}, ${src.method}.`, url: src.url };
  }
  const src = SOURCES[spec.levelSource];
  return { text: `${NAMES[body]}, drawn at ${d.when}: middle value ${fmt(d.v)} ${M.unit} (${d.native}). ${src.short}, ${src.method}.`, url: src.url };
}

/* ── scene ──────────────────────────────────────────────────────────── */

function drawBody(b, layers, marks) {
  const cls = b.body === 'men' ? 'body hollow' : 'body';
  const gRanges = svg('g', { class: cls }, layers.ranges), gPoints = svg('g', { class: cls }, layers.points);
  const addMark = (g, kind, d) => {
    const info = describe(state.mol, b.body, kind, d);
    g.classList.add('mark');
    set(g, { role: 'img', 'aria-label': info.text, tabindex: '-1' });
    const mark = { g, info, kind, d, body: b.body };
    marks.push(mark);
    return mark;
  };
  const gSpans = svg('g', { class: cls, 'aria-hidden': 'true' }, layers.spans);
  const whiskers = b.spec.bands.map((d) => {
    const g = svg('g', { class: 'whisk' }, gRanges);
    // on one scale a whole-month interval also stretches across the frame, so overlap can be read directly
    const span = wholeMonth(d) ? { fill: svg('rect', { class: 'span-fill' }, gSpans), edge: svg('path', { class: 'span-edge' }, gSpans) } : null;
    const node = {
      d, span, x: wholeMonth(d) ? EDGE[b.body] : (d.from + d.to) / 2,
      hit: svg('rect', { class: 'hit' }, g),
      outer: svg('line', { class: 'whisk-outer' }, g), inner: svg('line', { class: 'whisk-inner' }, g),
      hiText: Object.assign(svg('text', { class: 'wval' }, g), { textContent: fmt(d.hi) }),
      loText: Object.assign(svg('text', { class: 'wval' }, g), { textContent: fmt(d.lo) }),
      ring: svg('rect', { class: 'focus-ring', rx: 3 }, g),
    };
    node.mark = addMark(g, 'band', d);
    return node;
  });
  let ribbon = null, ribbonG = null, flux = null, casing = null, curve = null, wipes = null;
  if (b.samples) {
    // the intro reveal clips the continuous marks; dots and whiskers fade instead, so no circle is sliced
    const ids = { lead: `wipe-lead-${b.body}`, trail: `wipe-trail-${b.body}` };
    const clip = (kind, parent) => {
      wipes[kind] = svg('rect', {}, svg('clipPath', { id: ids[kind], clipPathUnits: 'userSpaceOnUse' }, layers.defs));
      return svg('g', { 'clip-path': `url(#${ids[kind]})` }, parent);
    };
    wipes = {};
    if (b.samples.env) {
      ribbonG = clip('trail', gRanges);
      ribbon = svg('path', { class: 'ribbon' }, ribbonG);
      flux = svg('path', { class: 'flux' }, clip('lead', gRanges));
    }
    const g = wipes.trail ? svg('g', { 'clip-path': `url(#${ids.trail})` }, gPoints) : clip('trail', gPoints);
    casing = svg('path', { class: 'curve-casing' }, g);
    curve = svg('path', { class: 'curve' }, g);
  }
  const levels = b.spec.levels || [];
  const dots = [
    ...b.spec.medians.map((d) => ({ d, x: d.x, kind: 'median' })),
    ...levels.map((d, i) => ({ d, x: EDGE[b.body] - .9 * (levels.length - 1 - i), kind: 'level' })),
  ].map((p) => {
    p.g = svg('g', {}, gPoints);
    svg('circle', { class: 'hit', r: 14 }, p.g);
    svg('circle', { class: 'dot', r: 4.5 }, p.g);
    svg('circle', { class: 'focus-ring', r: 10 }, p.g);
    p.mark = addMark(p.g, p.kind, p.d);
    // hovering a measured point also shows the interval it sits in
    const w = whiskers.find((w) => p.kind === 'level' ? wholeMonth(w.d) : p.x >= w.d.from - .5 && p.x <= w.d.to + .5);
    p.mark.whisker = w ? w.mark : null;
    return p;
  });
  // a body with nothing but an interval says so inside the frame
  let note = null;
  if (!dots.length && !curve) {
    note = svg('text', { class: 'note', 'text-anchor': 'end' }, gPoints);
    for (const line of ['every man’s', 'single draw', 'fell in here']) Object.assign(svg('tspan', { x: 0, dy: '1.25em' }, note), { textContent: line });
  }
  return { gSpans, whiskers, ribbon, ribbonG, flux, casing, curve, dots, note, wipes };
}

function placeBody(b, nodes, r, max, u) {
  const sx = linear(X0, X1, r.x0, r.x1), sy = linear(0, max, r.y1, r.y0);
  for (const n of nodes.whiskers) {
    const x = sx(n.x), clipped = n.d.hi > max, ya = clipped ? r.y0 : sy(n.d.hi), yb = sy(n.d.lo);
    for (const line of [n.outer, n.inner]) set(line, { x1: x, x2: x, y1: ya, y2: yb });
    const left = x > (r.x0 + r.x1) / 2, tx = left ? x - 9 : x + 9;
    set(n.hiText, { x: tx, y: clipped ? ya + 11 * u : ya + 4 * u, 'text-anchor': left ? 'end' : 'start' });
    set(n.loText, { x: tx, y: yb + 4 * u, 'text-anchor': left ? 'end' : 'start' });
    n.hiText.textContent = clipped ? `↑ ${fmt(n.d.hi)}` : fmt(n.d.hi);
    for (const node of [n.hit, n.ring]) set(node, { x: x - 12, y: ya - 6, width: 24, height: yb - ya + 12 });
    if (n.span) {
      set(n.span.fill, { x: r.x0, y: ya, width: r.x1 - r.x0, height: yb - ya });
      n.span.edge.setAttribute('d', `M${r.x0.toFixed(1)},${ya.toFixed(1)}H${r.x1.toFixed(1)}M${r.x0.toFixed(1)},${yb.toFixed(1)}H${r.x1.toFixed(1)}`);
    }
  }
  if (nodes.ribbon) {
    const env = b.samples.env;
    const up = env.map((e) => `${sx(e.x).toFixed(1)},${sy(e.hi).toFixed(1)}`);
    const down = env.map((e) => `${sx(e.x).toFixed(1)},${sy(e.lo).toFixed(1)}`).reverse();
    nodes.ribbon.setAttribute('d', `M${up.join('L')}L${down.join('L')}Z`);
    nodes.flux.setAttribute('d', seriesPath(b.samples.raw, sx, sy));
  }
  if (nodes.curve) {
    const d = seriesPath(b.samples.curve, sx, sy);
    nodes.casing.setAttribute('d', d);
    nodes.curve.setAttribute('d', d);
  }
  for (const p of nodes.dots) p.g.setAttribute('transform', `translate(${sx(p.x).toFixed(1)},${sy(p.d.v).toFixed(1)})`);
  if (nodes.note) {
    const w = nodes.whiskers[0], y = (sy(w.d.hi) + sy(w.d.lo)) / 2 - 2.2 * 16 * u;
    set(nodes.note, { transform: `translate(${(sx(w.x) - 18).toFixed(1)},${y.toFixed(1)})` });
  }
  return { sx, sy };
}

function tickSet(max, unit, gridG, textG) {
  return ticks(max).map((v, i, all) => ({
    v, line: svg('line', { class: v === 0 ? 'base-line' : 'grid-line' }, gridG),
    text: Object.assign(svg('text', { class: 'tick' }, textG), { textContent: i === all.length - 1 ? `${fmt(v)} ${unit}` : fmt(v) }),
  }));
}

function build() {
  const W = chartEl.clientWidth, H = chartEl.clientHeight;
  if (!W || !H) return;
  const side = W >= 620;
  const M = MOLECULES[state.mol];
  // SVG text is set in rem; offsets follow so labels keep their spacing at larger user font sizes
  const u = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;

  const hadFocus = scene && scene.mol === state.mol ? scene.marks.findIndex((m) => m.g === document.activeElement) : -1;
  const hadTab = scene && scene.mol === state.mol ? scene.marks.findIndex((m) => m.g.getAttribute('tabindex') === '0') : -1;

  root.dataset.mol = state.mol;
  chartEl.replaceChildren();
  hot = null;
  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': `${M.name} in women and men across thirty days.`, 'aria-describedby': 'caption chart-help' }, chartEl);

  const top = 76 * u, bottom = 60 * u, py1 = H - bottom;
  const merged = { x0: 0, x1: W, y0: top, y1: py1 };
  const gap = side ? 48 : bottom + top;
  const split = side
    ? { women: { x0: 0, x1: (W - gap) / 2, y0: top, y1: py1 }, men: { x0: (W + gap) / 2, x1: W, y0: top, y1: py1 } }
    : { women: { x0: 0, x1: W, y0: top, y1: (top + py1 - gap) / 2 }, men: { x0: 0, x1: W, y0: (top + py1 + gap) / 2, y1: py1 } };

  const bodies = {};
  for (const body of BODIES) {
    const spec = M[body], samples = samplesFor(state.mol, body);
    const hi = Math.max(...spec.bands.map((b) => b.hi));
    // own scale fits what is drawn by default: the curve and its points, or the interval when that is all there is
    let peak = 0;
    for (const d of [...spec.medians, ...(spec.levels || [])]) peak = Math.max(peak, d.v);
    if (samples) for (const e of samples.env || samples.curve.map(([x, v]) => ({ hi: v }))) peak = Math.max(peak, e.hi);
    const own = niceMax(peak ? peak * 1.12 : hi);
    bodies[body] = { body, spec, samples, own, full: niceMax(Math.max(hi, peak)), bare: !peak };
  }
  const shared = Math.max(bodies.women.full, bodies.men.full);
  const small = bodies.women.full < bodies.men.full ? 'women' : 'men', big = small === 'women' ? 'men' : 'women';

  const grid = svg('g', { 'aria-hidden': 'true' }, el);
  const layers = { defs: svg('defs', {}, el), spans: svg('g', {}, el), ranges: svg('g', {}, el), points: svg('g', {}, el) };
  const labels = svg('g', { 'aria-hidden': 'true', 'pointer-events': 'none' }, el);

  for (const body of BODIES) {
    const b = bodies[body];
    b.gridG = svg('g', {}, grid);
    b.tickG = svg('g', {}, labels);
    b.tickNodes = tickSet(b.own, M.unit, b.gridG, b.tickG);
    b.xAxis = svg('g', {}, labels);
    const last = XAXIS[body].at.length - 1;
    b.xNodes = XAXIS[body].at.map((x, i) => ({
      x, nudge: i === 0 ? -3 : i === last ? 3 : 0,
      tickMark: svg('line', { class: 'base-line' }, b.xAxis),
      text: Object.assign(svg('text', { class: 'xlab', 'text-anchor': i === 0 ? 'start' : i === last ? 'end' : 'middle' }, b.xAxis), { textContent: XAXIS[body].text[i] }),
    }));
    b.xCap = svg('text', { class: 'xcap' }, b.xAxis);
    XAXIS[body].cap.forEach((t, i) => Object.assign(svg('tspan', { x: 0, dy: i ? '1.7em' : 0 }, b.xCap), { textContent: t }));
    b.head = svg('g', {}, labels);
    b.title = Object.assign(svg('text', { class: 'title' }, b.head), { textContent: NAMES[body] });
    b.sample = Object.assign(svg('text', { class: 'sample' }, b.head), { textContent: b.spec.sample });
  }
  const sharedGrid = svg('g', {}, grid), sharedTickG = svg('g', {}, labels);
  const sharedTicks = tickSet(shared, M.unit, sharedGrid, sharedTickG);
  // one scale, one heading: both samples named, on two lines when the frame is narrow
  const sharedHead = svg('g', {}, labels);
  Object.assign(svg('text', { class: 'title', x: 0, y: top - (side ? 46 : 56) * u }, sharedHead), { textContent: 'Women and men' });
  const samples = BODIES.map((b) => bodies[b].spec.sample);
  if (side) Object.assign(svg('text', { class: 'sample', x: 0, y: top - 27 * u }, sharedHead), { textContent: samples.join('   ·   ') });
  else samples.forEach((t, i) => Object.assign(svg('text', { class: 'sample', x: 0, y: top - (38 - 14 * i) * u }, sharedHead), { textContent: t }));

  const marks = [];
  bodies[big].nodes = drawBody(bodies[big], layers, marks);
  bodies[small].nodes = drawBody(bodies[small], layers, marks);

  scene = { mol: state.mol, u, merged, split, bodies, shared, sharedGrid, sharedTickG, sharedTicks, sharedHead, small, big, marks };
  wireMarks();
  frame();

  const keep = marks[hadTab] || marks[0];
  keep.g.setAttribute('tabindex', '0');
  fixRoving();
  if (hadFocus >= 0 && marks[hadFocus]) marks[hadFocus].g.focus({ preventScroll: true });
}

function frame() {
  if (!scene) return;
  const { u, merged, split, bodies, shared, sharedGrid, sharedTickG, sharedTicks, sharedHead, small, big } = scene;
  const e = easeInOut(state.m);
  const hotWhisker = hot && (hot.kind === 'band' ? hot : hot.whisker);
  const pinWhisker = pinned && (pinned.kind === 'band' ? pinned : pinned.whisker);
  // one lag for the chart, so two panels never sweep at different speeds; with no comb to lead,
  // the mean line is the leading edge itself
  const ip = state.intro, lag = BODIES.some((body) => bodies[body].nodes.flux) ? INTRO_LAG : 0;
  const lead = sweep(clamp01(ip / (1 - lag))), trail = sweep(clamp01((ip - lag) / (1 - lag)));

  for (const body of BODIES) {
    const b = bodies[body], a = split[body], isSmall = body === small;
    const r = { x0: lerp(a.x0, merged.x0, e), x1: lerp(a.x1, merged.x1, e), y0: lerp(a.y0, merged.y0, e), y1: lerp(a.y1, merged.y1, e) };
    // lerp on 1/max, not max: on-screen height then changes evenly through the collapse
    const max = 1 / lerp(1 / b.own, 1 / shared, e);
    const { sx, sy } = placeBody(b, b.nodes, r, max, u);
    b.r = r; b.sy = sy;

    const fw = r.x1 - r.x0, edge = r.x0 + fw * trail;
    if (b.nodes.wipes) {
      const y = r.y0 - 60 * u, height = r.y1 - r.y0 + 120 * u;
      const cut = (rect, k) => rect && set(rect, { x: r.x0 - 24, y, height, width: ip >= 1 ? fw + 240 : 24 + fw * k });
      cut(b.nodes.wipes.lead, lead);
      cut(b.nodes.wipes.trail, trail);
      // the ribbon fades in as well as trailing; a clipped fill on its own is only a box growing
      if (b.nodes.ribbonG) b.nodes.ribbonG.setAttribute('opacity', smooth(trail, 0, .85));
    }
    // a body with only an interval rises from its measured floor; there is no curve to draw
    if (b.bare && ip < 1) for (const n of b.nodes.whiskers) {
      const yb = sy(n.d.lo), ya = lerp(yb, sy(n.d.hi), lead);
      for (const line of [n.outer, n.inner]) set(line, { y1: ya, y2: yb });
      set(n.hiText, { y: ya + 4 * u });
    }

    const fade = 1 - smooth(e, .15, .8);
    b.gridG.setAttribute('opacity', fade);
    b.tickG.setAttribute('opacity', fade);
    for (const n of b.tickNodes) {
      const y = sy(n.v);
      set(n.line, { x1: r.x0, x2: r.x1, y1: y, y2: y });
      set(n.text, { x: r.x0 + 2, y: y - 6 * u });
    }

    b.xAxis.setAttribute('opacity', body === 'men' ? 1 - smooth(e, 0, .5) : 1);
    for (const n of b.xNodes) {
      const x = sx(n.x);
      set(n.tickMark, { x1: x, x2: x, y1: r.y1, y2: r.y1 + 5 });
      set(n.text, { x: x + n.nudge, y: r.y1 + 20 * u });
    }
    set(b.xCap, { transform: `translate(${r.x0.toFixed(1)},${(r.y1 + 40 * u).toFixed(1)})` });

    b.head.setAttribute('opacity', 1 - smooth(e, 0, .4));
    set(b.title, { x: r.x0, y: r.y0 - 46 * u });
    set(b.sample, { x: r.x0, y: r.y0 - 27 * u });

    // intervals are annotation while each body has its own scale; on one scale they are the argument
    const nw = b.nodes.whiskers.length;
    for (let i = 0; i < nw; i++) {
      const w = b.nodes.whiskers[i];
      // staggered so they arrive left to right
      const t0 = .28 + (nw > 1 ? i / (nw - 1) : 0) * .22;
      const base = b.bare ? 1 : smooth(e, t0, t0 + .4);
      const lit = w.mark === hotWhisker || w.mark === pinWhisker;
      const o = lit ? 1 : base;
      w.mark.g.setAttribute('opacity', o);
      w.mark.g.style.visibility = o === 0 ? 'hidden' : '';
      w.mark.g.classList.toggle('lit', lit);
    }
    b.nodes.gSpans.setAttribute('opacity', smooth(e, .55, 1));
    if (b.nodes.note) b.nodes.note.setAttribute('opacity', (1 - smooth(e, 0, .4)) * smooth(ip, .8, 1));
    for (const p of b.nodes.dots) {
      const o = isSmall && p.kind === 'level' ? 1 - smooth(e, .2, .7) : 1;
      // the intro dims, it never hides: a hidden mark drops out of the roving tab stop
      p.g.setAttribute('opacity', o * (ip >= 1 ? 1 : clamp01((edge - sx(p.x) + 4) / 16)));
      p.g.style.visibility = o === 0 ? 'hidden' : '';
    }
  }

  const sharedOn = smooth(e, .5, 1);
  sharedHead.setAttribute('opacity', sharedOn);
  sharedGrid.setAttribute('opacity', sharedOn);
  sharedTickG.setAttribute('opacity', sharedOn);
  const B = bodies[big];
  // a band edge that lands on a tick label pushes the label up past it
  const edges = [];
  for (const body of BODIES) for (const w of bodies[body].nodes.whiskers) if (w.span) edges.push(bodies[body].sy(w.d.hi), bodies[body].sy(w.d.lo));
  for (const n of sharedTicks) {
    const y = B.sy(n.v);
    set(n.line, { x1: B.r.x0, x2: B.r.x1, y1: y, y2: y });
    let ty = y - 6 * u;
    for (const ey of edges) if (ey > ty - 11 * u && ey < ty + 3 * u) ty = ey - 5 * u;
    set(n.text, { x: B.r.x0 + 2, y: ty });
  }
}

/* ── interaction ────────────────────────────────────────────────────── */

const evLabel = document.querySelector('.evidence .label');
function showEvidence(info) {
  const text = info ? info.text : MOLECULES[state.mol].evidence;
  if (evText.textContent !== text) evText.textContent = text;
  evLabel.textContent = info ? 'Evidence' : 'Evidence · point at any mark';
  evSrc.hidden = !info;
  if (info) evSrc.href = info.url;
  root.classList.toggle('ev-pinned', !!(pinned && info === pinned.info));
}

function unpin() {
  if (!pinned) return;
  if (document.activeElement === pinned.g) pinned.g.blur();
  pinned = null;
  showEvidence(null);
  frame();
}

// on a phone the readout is a sheet over the page; scrolling away from the chart dismisses it
const narrow = matchMedia('(max-width: 860px)');
let pinScroll = 0;
addEventListener('scroll', () => { if (pinned && narrow.matches && Math.abs(scrollY - pinScroll) > 48) unpin(); }, { passive: true });

const liveMarks = () => scene.marks.filter((m) => m.g.style.visibility !== 'hidden');

// a mark that fades out must not keep the chart's only tab stop
function fixRoving() {
  const live = liveMarks(), holder = scene.marks.find((m) => m.g.getAttribute('tabindex') === '0');
  if (!live.length || (holder && live.includes(holder))) return;
  if (holder) holder.g.setAttribute('tabindex', '-1');
  live[0].g.setAttribute('tabindex', '0');
}

function wireMarks() {
  pinned = null;
  for (const mark of scene.marks) {
    const { g, info } = mark;
    g.addEventListener('pointerenter', () => { endIntro(); hot = mark; showEvidence(info); frame(); });
    g.addEventListener('pointerleave', () => { hot = null; showEvidence(pinned && pinned.info); frame(); });
    g.addEventListener('focus', () => { endIntro(); pinned = mark; pinScroll = scrollY; showEvidence(info); frame(); });
    g.addEventListener('click', () => g.focus());
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { unpin(); return; }
      const live = liveMarks(), i = live.indexOf(mark);
      const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: live.length - 1 }[ev.key];
      if (to === undefined) return;
      ev.preventDefault();
      const next = live[(to + live.length) % live.length].g;
      for (const m of scene.marks) m.g.setAttribute('tabindex', m.g === next ? '0' : '-1');
      next.focus();
    });
  }
}

const stepText = alignBtn.querySelector('.step-text');
// on wide screens the evidence block's top rule meets the chart's x axis
const evidenceEl = document.querySelector('.evidence'), wide = matchMedia('(min-width: 1100px)');
function alignEvidence() {
  if (!wide.matches || !scene) { evidenceEl.style.removeProperty('--ev-nudge'); return; }
  evidenceEl.style.setProperty('--ev-nudge', '0px');
  const axisY = chartEl.getBoundingClientRect().top + scene.merged.y1;
  const d = axisY - evidenceEl.getBoundingClientRect().top;
  // meet the axis when there is room; never sit closer to the button than the normal gap
  const gap = 2 * parseFloat(getComputedStyle(document.documentElement).fontSize);
  evidenceEl.style.setProperty('--ev-nudge', `${Math.max(gap, d).toFixed(1)}px`);
}
document.fonts.ready.then(alignEvidence);
addEventListener('resize', alignEvidence);

function sync() {
  const on = state.on;
  captionEl.textContent = MOLECULES[state.mol].captions[on ? 'merged' : 'split'];
  stepText.textContent = on ? 'Back to their own scales' : 'Now put them on the same scale';
  alignBtn.dataset.on = String(on);
  alignEvidence();
  showEvidence(pinned && pinned.info);
}

function animateTo(target) {
  cancelAnimationFrame(raf);
  const from = state.m, start = performance.now(), dur = reduced.matches ? 0 : 1100 * Math.abs(target - from);
  const step = (now) => {
    const k = dur ? clamp01((now - start) / dur) : 1;
    state.m = lerp(from, target, k);
    frame();
    if (k < 1) raf = requestAnimationFrame(step); else if (scene) fixRoving();
  };
  raf = requestAnimationFrame(step);
}

// only armIntro resets state.intro, so a rebuild from a resize never replays the sweep
const figureEl = document.querySelector('.figure');
function endIntro() {
  cancelAnimationFrame(introRaf);
  if (introObs) { introObs.disconnect(); introObs = null; }
  if (state.intro < 1) { state.intro = 1; frame(); }
}
function armIntro() {
  endIntro();
  if (reduced.matches) return;
  state.intro = 0;
  introObs = new IntersectionObserver((entries, obs) => {
    if (!entries.some((en) => en.isIntersecting)) return;
    obs.disconnect();
    introObs = null;
    const start = performance.now(), dur = INTRO_MS[state.mol] || 1500;
    const step = (now) => {
      state.intro = clamp01((now - start) / dur);
      frame();
      if (state.intro < 1) introRaf = requestAnimationFrame(step);
    };
    introRaf = requestAnimationFrame(step);
  }, { rootMargin: '0px 0px -25% 0px' });
  introObs.observe(figureEl);
}
armIntro();

alignBtn.addEventListener('click', () => {
  endIntro();
  state.on = !state.on;
  sync();
  animateTo(state.on ? 1 : 0);
});

// a new hormone starts from the two-panel view, so the shared-scale reveal is never skipped
for (const input of document.querySelectorAll('input[name="mol"]')) {
  // Firefox restores radio state across reloads; the chart starts on state.mol, so the radio must too
  input.checked = input.value === state.mol;
  input.addEventListener('change', () => {
    cancelAnimationFrame(raf);
    state.mol = input.value; state.m = 0; pinned = null; hot = null;
    state.on = false;
    armIntro();
    build(); sync(); fillTable();
  });
}

/* ── the same numbers, without the picture ──────────────────────────── */

function fillTable() {
  const M = MOLECULES[state.mol], table = document.getElementById('table');
  table.replaceChildren();
  table.createCaption().textContent = `${M.name}, ${M.unit}. Measured values first; the last row for each body describes its modeled curve.`;
  const cell = (row, tag, text, cls) => { const c = document.createElement(tag); c.textContent = text; if (cls) c.className = cls; if (tag === 'th') c.scope = 'col'; row.appendChild(c); };
  const head = table.createTHead().insertRow();
  for (const h of ['Body', 'Measure', 'Value', 'n', 'Source']) cell(head, 'th', h);
  const body = table.createTBody();
  const row = (...cells) => { const r = body.insertRow(); cells.forEach((c, i) => cell(r, 'td', c, i === 2 || i === 3 ? 'num' : '')); };
  for (const who of BODIES) {
    const spec = M[who], group = spec.sample.split(' · ')[0];
    for (const b of spec.bands) row(NAMES[who], `reference interval, ${b.phase}`, `${fmt(b.lo)}–${fmt(b.hi)}`, group, SOURCES[spec.bandSource].short);
    for (const d of spec.medians) row(NAMES[who], `median, ${d.phase}`, fmt(d.v), String(d.n), SOURCES[spec.medianSource].short);
    for (const d of spec.levels || []) row(NAMES[who], `median, ${d.when}`, fmt(d.v), group, SOURCES[spec.levelSource].short);
    row(NAMES[who], spec.model ? `curve, a model: ${MODEL_NOTES[spec.model.kind]}${spec.model.pulses ? ', plus a pulse about every 112 min' : ''}${spec.model.swell ? ', plus a mid-cycle rise' : ''}` : 'curve: none drawn', '–', '–', spec.model ? 'not measured' : '–');
  }
}

function fillSources() {
  const list = document.getElementById('sources');
  for (const s of Object.values(SOURCES)) {
    const li = document.createElement('li'), a = document.createElement('a');
    li.append(`${s.cite} `);
    a.href = s.url; a.textContent = s.url.replace('https://', ''); a.target = '_blank'; a.rel = 'noopener';
    li.append(a);
    list.append(li);
  }
}

let seen = '';
new ResizeObserver(() => {
  const size = `${chartEl.clientWidth}x${chartEl.clientHeight}`;
  if (size !== seen) { seen = size; build(); alignEvidence(); }
}).observe(chartEl);
sync(); fillTable(); fillSources();
