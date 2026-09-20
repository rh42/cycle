const SVG_NS = 'http://www.w3.org/2000/svg';

export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const easeInOut = (k) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function svg(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

export const linear = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

export function niceMax(max) {
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

export function ticks(max, target = 4) {
  const raw = max / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => max / s <= target + 1);
  const out = [];
  for (let v = 0; v <= max + step * 1e-6; v += step) out.push(+v.toPrecision(12));
  return out;
}

export const fmt = (v) => (v >= 100 ? Math.round(v).toLocaleString('en-GB') : String(+v.toPrecision(3)));

// Fritsch–Carlson monotone cubic: returns f(x), never overshoots the anchors
export function monotone(points) {
  const n = points.length, xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = Math.hypot(a, b);
    if (h > 3) { m[i] = (3 * a / h) * d[i]; m[i + 1] = (3 * b / h) * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], k = (x - xs[i]) / h, k2 = k * k, k3 = k2 * k;
    return (2 * k3 - 3 * k2 + 1) * ys[i] + (k3 - 2 * k2 + k) * h * m[i] + (-2 * k3 + 3 * k2) * ys[i + 1] + (k3 - k2) * h * m[i + 1];
  };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let v = Math.imul(a ^ (a >>> 15), 1 | a);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

// Dense series → path. Above two samples per pixel, keeps each pixel column's min and max only.
export function seriesPath(samples, sx, sy) {
  const x0 = sx(samples[0][0]), x1 = sx(samples[samples.length - 1][0]);
  const perPx = samples.length / Math.max(1, Math.abs(x1 - x0));
  const out = [];
  if (perPx <= 2) {
    for (const [x, y] of samples) out.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
  } else {
    let col = null, lo = 0, hi = 0;
    const flush = () => { if (col !== null) out.push(`${col},${sy(hi).toFixed(1)}`, `${col},${sy(lo).toFixed(1)}`); };
    for (const [x, y] of samples) {
      const c = Math.round(sx(x));
      if (c !== col) { flush(); col = c; lo = hi = y; } else { if (y < lo) lo = y; if (y > hi) hi = y; }
    }
    flush();
  }
  return 'M' + out.join('L');
}
