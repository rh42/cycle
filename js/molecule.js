import { svg } from './plot.js';

const RADIUS = { C: .34, O: .4, H: .13 };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const rotX = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const rotY = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const mul = (A, B) => A.map((r) => B[0].map((_, j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const apply = (R, p) => R.map((r) => r[0] * p[0] + r[1] * p[1] + r[2] * p[2]);
const put = (node, k, v) => { if (node.getAttribute(k) !== v) node.setAttribute(k, v); };

// Ball-and-stick in SVG: ~50 atoms, so no need for WebGL, and it takes the page's own color tokens.
export function mountMolecule(host, mol, { label }) {
  const el = svg('svg', { role: 'img', tabindex: '0', 'aria-label': label }, host);
  const gBonds = svg('g', { class: 'bonds' }, el), gAtoms = svg('g', { class: 'atoms' }, el);
  const atoms = mol.atoms.map(([e, x, y, z], i) => ({ e, p: [x, y, z], i, node: null }));
  const bonds = mol.bonds.map(([a, b]) => ({ a: atoms[a], b: atoms[b], toH: atoms[a].e === 'H' || atoms[b].e === 'H' }));
  for (const b of bonds) b.node = svg('line', { class: b.toH ? 'bond bond-h' : 'bond' }, gBonds);
  for (const a of atoms) a.node = svg('circle', { class: `atom atom-${a.e.toLowerCase()}${a.i === mol.extra ? ' atom-extra' : ''}` }, gAtoms);
  let tag = null;
  if (mol.extra != null) {
    tag = svg('g', { class: 'tag' }, el);
    svg('line', { class: 'tag-lead' }, tag);
    Object.assign(svg('text', { class: 'tag-text' }, tag), { textContent: 'the extra carbon' });
  }

  // start tilted so the rings read as a 3D object, not a flat drawing
  let R = mul(rotX(-.55), rotY(.35));
  let W = 0, H = 0, s = 1;
  let vx = 0, vy = 0, touched = false, dragging = false, visible = false, raf = 0, lastFrame = 0, order = '';

  function draw() {
    const cx = W / 2, cy = H / 2;
    const items = [];
    for (const a of atoms) { a.q = apply(R, a.p); items.push({ z: a.q[2], a }); }
    for (const b of bonds) items.push({ z: (b.a.q[2] + b.b.q[2]) / 2 - .01, b });
    items.sort((p, q) => p.z - q.z);
    const zs = atoms.map((a) => a.q[2]), zmin = Math.min(...zs), zmax = Math.max(...zs);
    const depth = (z) => (z - zmin) / (zmax - zmin || 1);
    // painter's order changes rarely between frames; re-append only when it does
    const key = items.map((it) => (it.a ? it.a.i : 'b' + it.b.a.i + '.' + it.b.b.i)).join(',');
    const reorder = key !== order;
    order = key;
    for (const it of items) {
      if (it.a) {
        const a = it.a, d = depth(a.q[2]);
        put(a.node, 'cx', (cx + a.q[0] * s).toFixed(1));
        put(a.node, 'cy', (cy - a.q[1] * s).toFixed(1));
        put(a.node, 'r', (RADIUS[a.e] * s * (.85 + .3 * d)).toFixed(1));
        put(a.node, 'opacity', (a.e === 'H' ? .35 + .45 * d : .55 + .45 * d).toFixed(2));
        if (reorder) gAtoms.appendChild(a.node);
      } else {
        const { a, b } = it.b, n = it.b.node;
        put(n, 'x1', (cx + a.q[0] * s).toFixed(1)); put(n, 'y1', (cy - a.q[1] * s).toFixed(1));
        put(n, 'x2', (cx + b.q[0] * s).toFixed(1)); put(n, 'y2', (cy - b.q[1] * s).toFixed(1));
        put(n, 'opacity', (.45 + .55 * depth(it.z)).toFixed(2));
        if (reorder) gBonds.appendChild(n);
      }
    }
    if (tag) {
      const a = atoms[mol.extra], x = cx + a.q[0] * s, y = cy - a.q[1] * s;
      const right = x < cx, tx = x + (right ? 1 : -1) * 2.2 * s, ty = y - 1.6 * s;
      const lead = tag.firstChild, text = tag.lastChild;
      put(lead, 'x1', x.toFixed(1)); put(lead, 'y1', y.toFixed(1));
      put(lead, 'x2', tx.toFixed(1)); put(lead, 'y2', ty.toFixed(1));
      put(text, 'x', (tx + (right ? 4 : -4)).toFixed(1)); put(text, 'y', (ty - 4).toFixed(1));
      put(text, 'text-anchor', right ? 'start' : 'end');
    }
  }

  function turn(dx, dy) { R = mul(mul(rotY(dx), rotX(dy)), R); }

  // Untouched and on screen, it turns slowly at ~12 fps (one revolution a minute). A drag or a
  // key stops that for good, so it stays where the reader left it. Off screen nothing runs.
  function tick(now) {
    raf = 0;
    if (!visible) return;
    if (dragging) { draw(); lastFrame = now; }
    else if (Math.abs(vx) + Math.abs(vy) > 1e-3) { turn(vx, vy); vx *= .92; vy *= .92; if (now - lastFrame >= 33) { draw(); lastFrame = now; } }
    else if (!touched && !reduced.matches) { if (now - lastFrame >= 80) { turn(.008, 0); draw(); lastFrame = now; } }
    else return;
    raf = requestAnimationFrame(tick);
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

  let last = null;
  el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    dragging = true; touched = true; vx = vy = 0; last = [ev.clientX, ev.clientY];
    el.setPointerCapture(ev.pointerId); el.classList.add('grabbing'); wake();
  });
  el.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const dx = (ev.clientX - last[0]) / 120, dy = (ev.clientY - last[1]) / 120;
    last = [ev.clientX, ev.clientY];
    vx = dx; vy = dy; turn(dx, dy); wake();
  });
  const release = () => { dragging = false; el.classList.remove('grabbing'); wake(); };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('keydown', (ev) => {
    const step = Math.PI / 12, k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
    if (!k) return;
    ev.preventDefault(); touched = true; vx = vy = 0; turn(k[0], k[1]); draw();
  });

  new ResizeObserver(() => {
    W = host.clientWidth; H = host.clientHeight;
    if (!W || !H) return;
    el.setAttribute('viewBox', `0 0 ${W} ${H}`);
    s = Math.min(W, H) / 13.5;
    draw();
  }).observe(host);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }, { rootMargin: '80px' }).observe(host);
}
