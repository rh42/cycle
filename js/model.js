import { monotone, mulberry32 } from './plot.js';
import { DAYS } from '../data/two-bodies.js';

export const X0 = DAYS.from - .5, X1 = DAYS.to + .5;

export function sampleModel(spec) {
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
