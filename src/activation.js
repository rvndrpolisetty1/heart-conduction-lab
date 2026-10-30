// Activation times: when each point of the heart depolarises, in ms. The same idea as a clinical
// electroanatomic activation map. Atrial times run from the SA node firing; ventricular times run from
// the impulse entering the bundle of His. Conduction speeds are approximate teaching values.

import { CONDUCTION, purkinje, SA, septal, raCavity, laCavity, lvCavity, rvCavity, shell } from './anatomy.js';
import { sub, len, lerp3 } from './sdf.js';

const V_ATRIUM = 0.075;     // cm/ms (~0.75 m/s)
const V_PURKINJE = 0.3;     // cm/ms (~3 m/s)
const V_MYO = 0.045;        // cm/ms (~0.45 m/s)
const V_ESCAPE = 0.05;      // muscle-to-muscle spread from an escape focus
const ATRIAL_MAX = 95;      // P wave about 100 ms
const QRS_START = 40, QRS_END = 130;    // ventricular myocardium, on the His clock (QRS about 90 ms)
const ESCAPE_MAX = 140;     // broad escape QRS†

// Named curves with their timing (dom: 0 atrial, 1 ventricular).
const TIMED = {
  internodalAnterior: { dom: 0, t0: 0, t1: 40 },
  internodalMiddle: { dom: 0, t0: 0, t1: 40 },
  internodalPosterior: { dom: 0, t0: 0, t1: 40 },
  bachmann: { dom: 0, t0: 0, t1: 55 },
  his: { dom: 1, t0: 0, t1: 15 },
  rightBundle: { dom: 1, t0: 15, t1: 38 },
  leftAnterior: { dom: 1, t0: 15, t1: 34 },
  leftPosterior: { dom: 1, t0: 15, t1: 34 },
};

const polyLen = pts => pts.slice(1).reduce((s, p, i) => s + len(sub(p, pts[i])), 0);
function samples(pts, t0, t1, n = 12) {
  const total = polyLen(pts), out = [];
  for (let k = 0; k <= n; k++) {
    let d = (k / n) * total, i = 0;
    while (i < pts.length - 2 && d > len(sub(pts[i + 1], pts[i]))) { d -= len(sub(pts[i + 1], pts[i])); i++; }
    const seg = len(sub(pts[i + 1], pts[i])) || 1;
    out.push({ p: lerp3(pts[i], pts[i + 1], Math.min(1, d / seg)), t: t0 + (t1 - t0) * (k / n) });
  }
  return out;
}

// Curves (with times) for drawing the conduction system.
export function conductionCurves() {
  const curves = Object.entries(TIMED).map(([id, c]) => ({ id, pts: CONDUCTION[id], ...c }));
  const bundleSamples = curves.filter(c => c.dom === 1).flatMap(c => samples(c.pts, c.t0, c.t1));
  for (const pts of purkinje()) {
    let t0 = Infinity;
    for (const s of bundleSamples) t0 = Math.min(t0, s.t + len(sub(pts[0], s.p)) / V_PURKINJE);
    curves.push({ id: 'purkinje', pts, dom: 1, t0, t1: t0 + polyLen(pts) / V_PURKINJE });
  }
  return curves;
}

// Time fields on a coarse grid, sampled per vertex with trilinear interpolation.
export function buildFields(curves) {
  const vSamples = curves.filter(c => c.dom === 1).flatMap(c => samples(c.pts, c.t0, c.t1, c.id === 'purkinje' ? 6 : 12));
  const bachEnd = CONDUCTION.bachmann.at(-1);
  const focus = septal(-3.0, 0.15);
  const min = [-5.0, -6.4, -4.6], step = 0.25;
  const nx = 40, ny = 44, nz = 38;
  const A = new Float32Array(nx * ny * nz), V = new Float32Array(A.length), E = new Float32Array(A.length);
  let vMin = Infinity, vMax = -Infinity, eMax = 0, aMax = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = [min[0] + i * step, min[1] + j * step, min[2] + k * step], idx = i + nx * (j + ny * k);
    A[idx] = Math.min(len(sub(p, SA)) / V_ATRIUM, 55 + len(sub(p, bachEnd)) / V_ATRIUM);
    let v = Infinity;
    for (const s of vSamples) { const d = s.t + len(sub(p, s.p)) / V_MYO; if (d < v) v = d; }
    V[idx] = v;
    E[idx] = len(sub(p, focus)) / V_ESCAPE;
    // Normalise only over cells inside the heart wall.
    if (shell(p) < 0.2) {
      const atrialSide = Math.min(raCavity(p), laCavity(p)) < Math.min(lvCavity(p), rvCavity(p));
      if (atrialSide) aMax = Math.max(aMax, A[idx]);
      else { vMin = Math.min(vMin, v); vMax = Math.max(vMax, v); eMax = Math.max(eMax, E[idx]); }
    }
  }
  const sample = (F, p) => {
    const fx = Math.min(Math.max((p[0] - min[0]) / step, 0), nx - 1.001);
    const fy = Math.min(Math.max((p[1] - min[1]) / step, 0), ny - 1.001);
    const fz = Math.min(Math.max((p[2] - min[2]) / step, 0), nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz), u = fx - i, v = fy - j, w = fz - k;
    const g = (a, b, c) => F[(i + a) + nx * ((j + b) + ny * (k + c))];
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(g(0, 0, 0), g(1, 0, 0), u), l(g(0, 1, 0), g(1, 1, 0), u), v),
      l(l(g(0, 0, 1), g(1, 0, 1), u), l(g(0, 1, 1), g(1, 1, 1), u), v), w);
  };
  return {
    escapeParams: { focus, scale: ESCAPE_MAX / (eMax * V_ESCAPE), max: ESCAPE_MAX },
    atrial: p => Math.min(ATRIAL_MAX, (sample(A, p) / aMax) * ATRIAL_MAX),
    ventricular: p => QRS_START + Math.min(1, Math.max(0, (sample(V, p) - vMin) / (vMax - vMin))) * (QRS_END - QRS_START),
    escape: p => Math.min(ESCAPE_MAX, (sample(E, p) / eMax) * ESCAPE_MAX),
    isAtrial: p => Math.min(raCavity(p), laCavity(p)) < Math.min(lvCavity(p), rvCavity(p)),
  };
}

// Per-vertex attributes for a wall mesh: domain (0 atrial, 1 ventricular, -1 none), act, escape act.
export function wallAttributes(positions, fields, kind) {
  const n = positions.length / 3;
  const dom = new Float32Array(n), act = new Float32Array(n), actE = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    let d = kind === 'atrial' ? 0 : kind === 'ventricular' ? 1 : kind === 'none' ? -1 : (fields.isAtrial(p) ? 0 : 1);
    dom[v] = d;
    if (d === 0) act[v] = fields.atrial(p);
    else if (d === 1) { act[v] = fields.ventricular(p); actE[v] = fields.escape(p); }
  }
  return { dom, act, actE };
}

// Escape time for any point, from the baked parameters (distance from the focus, scaled).
export const escapeTime = (params, p) => Math.min(params.max, len(sub(p, params.focus)) * params.scale);

export { TIMED };
