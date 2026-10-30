// The heart, described as shapes. Heart frame, in centimetres: +x is the patient's left (the viewer's right
// in the anterior view), +y is up towards the base, +z is anterior (towards the viewer). The scene tilts the
// whole group so the apex points down and to the patient's left. Illustrative, not anatomically to scale.

import { ellipsoid, roundCone, chain, smin, smax, fbm, mul, add, sub, norm, cross, lerp3, project, dot } from './sdf.js';

const wobble = (p, amp) => amp * fbm(mul(p, 0.9));

// Chamber shapes (exported so the conduction path can sit on their inner walls).
export const LV_AXIS = { base: [0.9, 0.9, -0.9], apex: [1.5, -4.9, 0.1], rBase: 2.75, rApex: 0.6 };
export const RV_AXIS = { base: [-1.4, 0.4, 1.0], apex: [1.0, -4.2, 1.0], rBase: 2.45, rApex: 0.6 };

export const lvRaw = p => roundCone(p, LV_AXIS.base, LV_AXIS.apex, LV_AXIS.rBase, LV_AXIS.rApex);
export const lv = p => lvRaw(p) + wobble(p, 0.06);
export const rv = p => smax(roundCone(p, RV_AXIS.base, RV_AXIS.apex, RV_AXIS.rBase, RV_AXIS.rApex), -(lvRaw(p) - 0.12), 0.7) + wobble(add(p, [3, 1, 2]), 0.06);
export const ra = p => smin(ellipsoid(p, [-2.5, 1.4, 0.0], [1.8, 1.9, 1.7]), ellipsoid(p, [-1.55, 2.7, 1.45], [1.0, 0.72, 0.62]), 0.55) + wobble(add(p, [7, 2, 1]), 0.05);
export const la = p => smin(ellipsoid(p, [0.6, 2.1, -2.3], [2.1, 1.4, 1.5]), ellipsoid(p, [2.35, 2.25, -0.45], [0.95, 0.55, 0.6]), 0.5) + wobble(add(p, [1, 5, 3]), 0.05);

const AORTA = [[-0.3, 0.8, -0.3], [-0.6, 3.0, 0.0], [-0.5, 4.9, -0.3], [0.6, 6.2, -1.3], [1.9, 5.9, -2.6], [2.5, 4.2, -3.3], [2.6, 1.0, -3.6]];
const AORTA_R = [1.25, 1.2, 1.15, 1.1, 1.0, 0.95, 0.9];
export const aorta = p => {
  let d = chain(p, AORTA, AORTA_R);
  d = smin(d, roundCone(p, [-0.1, 6.0, -0.8], [-0.6, 7.7, -0.7], 0.55, 0.42), 0.4);   // brachiocephalic trunk
  d = smin(d, roundCone(p, [0.8, 6.2, -1.6], [0.9, 7.8, -1.7], 0.42, 0.32), 0.35);    // left common carotid
  d = smin(d, roundCone(p, [1.6, 6.0, -2.2], [2.0, 7.5, -2.5], 0.42, 0.32), 0.35);    // left subclavian
  return d;
};
export const pulmonary = p => smin(chain(p, [[0.7, 0.6, 1.7], [0.9, 2.6, 1.6], [1.1, 4.0, 0.6]], [1.15, 1.1, 1.0]),
  Math.min(chain(p, [[1.1, 4.0, 0.6], [2.3, 4.3, -0.3], [3.3, 4.1, -1.0]], [0.9, 0.8, 0.7]),
    chain(p, [[1.1, 4.0, 0.6], [0.2, 4.4, -1.6], [-1.6, 4.3, -2.2], [-3.0, 4.0, -2.3]], [0.85, 0.8, 0.75, 0.7])), 0.5);
export const venaCava = p => Math.min(
  chain(p, [[-2.5, 2.4, -0.3], [-2.6, 4.3, -0.4], [-2.7, 5.9, -0.5]], [0.95, 0.95, 0.9]),
  chain(p, [[-2.3, 0.0, -0.8], [-2.2, -1.5, -1.0], [-2.1, -2.8, -1.1]], [1.0, 1.0, 0.95]));
export const pulmVeins = p => Math.min(
  roundCone(p, [-0.6, 2.7, -3.0], [-2.1, 3.0, -3.6], 0.5, 0.42),
  roundCone(p, [-0.4, 1.5, -3.0], [-1.9, 1.3, -3.6], 0.5, 0.42),
  roundCone(p, [1.8, 2.7, -3.0], [3.3, 3.0, -3.4], 0.5, 0.42),
  roundCone(p, [1.9, 1.5, -3.0], [3.3, 1.3, -3.4], 0.5, 0.42));

// One fused outer wall (the organ), with each chamber's cavity inside it. The wall thickness differs:
// the left ventricle's is the thickest.
export const shell = p => {
  let d = smin(lv(p), rv(p), 1.5);
  d = smin(d, ra(p), 0.8);
  d = smin(d, la(p), 0.8);
  return d;
};
export const lvCavity = p => lvRaw(p) + 0.85 + wobble(add(p, [2, 2, 2]), 0.05);
export const rvCavity = p => rv(p) + 0.32;
export const raCavity = p => ra(p) + 0.2;
export const laCavity = p => la(p) + 0.2;

// Mesh list: id, shape, bounds (min, max), role, tint.
export const PARTS = [
  { id: 'shell', f: shell, min: [-4.7, -6.0, -4.2], max: [4.5, 4.0, 4.1], role: 'shell', tint: [1.0, 0.45, 0.55] },
  { id: 'lv', f: lvCavity, min: [-1.4, -4.9, -3.4], max: [3.6, 3.2, 1.6], role: 'cavity', group: 'ventricles', tint: [1.0, 0.3, 0.42] },
  { id: 'rv', f: rvCavity, min: [-3.9, -4.7, -1.2], max: [2.6, 2.8, 3.8], role: 'cavity', group: 'ventricles', tint: [1.0, 0.36, 0.5] },
  { id: 'ra', f: raCavity, min: [-4.4, -0.5, -1.8], max: [-0.4, 3.6, 2.2], role: 'cavity', group: 'atria', tint: [1.0, 0.5, 0.6] },
  { id: 'la', f: laCavity, min: [-1.6, 0.6, -3.9], max: [3.4, 3.6, 0.2], role: 'cavity', group: 'atria', tint: [1.0, 0.46, 0.6] },
  { id: 'aorta', f: aorta, min: [-2.0, -0.6, -5.0], max: [3.8, 8.4, 1.4], role: 'vessel', tint: [1.0, 0.3, 0.32] },
  { id: 'pulmonary', f: pulmonary, min: [-4.0, -0.7, -3.3], max: [4.3, 5.4, 3.0], role: 'vessel', tint: [0.48, 0.55, 1.0] },
  { id: 'venaCava', f: venaCava, min: [-3.9, -4.0, -2.3], max: [-1.0, 7.8, 0.9], role: 'vessel', tint: [0.42, 0.62, 1.0] },
  { id: 'pulmVeins', f: pulmVeins, min: [-2.8, 0.6, -4.3], max: [4.0, 3.7, -2.3], role: 'vessel', tint: [1.0, 0.45, 0.5] },
];

// Whole-heart field, for laying vessels on the surface.
export const heartSurface = shell;

// Conduction system: named curves (control points), in order of activation.
export const SA = [-2.3, 2.95, 0.85];
export const AV = [-0.72, 0.55, -0.3];
const HIS_END = [-0.15, -0.55, 0.1];

// Septal points: halfway between the inside of the LV and RV, at a given height.
export function septal(y, bias = 0) {
  const t = (LV_AXIS.base[1] - y) / (LV_AXIS.base[1] - LV_AXIS.apex[1]);
  const a = lerp3(LV_AXIS.base, LV_AXIS.apex, t), b = lerp3(RV_AXIS.base, RV_AXIS.apex, Math.min(1, t * 1.1));
  return lerp3(a, b, 0.5 + bias);
}

export const CONDUCTION = {
  internodalAnterior: [SA, [-1.7, 2.25, 0.75], [-1.05, 1.25, 0.25], AV],
  internodalMiddle: [SA, [-2.45, 2.0, 0.35], [-1.55, 1.0, -0.15], AV],
  internodalPosterior: [SA, [-2.75, 1.9, -0.35], [-1.9, 0.6, -0.65], AV],
  bachmann: [SA, [-1.3, 2.95, 0.25], [0.2, 2.85, -0.9], [1.6, 2.6, -1.6]],
  his: [AV, [-0.45, 0.0, -0.1], HIS_END],
  rightBundle: [HIS_END, septal(-1.6, 0.18), septal(-2.9, 0.2), septal(-3.6, 0.24)],
  leftAnterior: [HIS_END, septal(-1.2, -0.18), [1.2, -2.3, 0.15], [2.2, -3.0, 0.35]],
  leftPosterior: [HIS_END, septal(-1.4, -0.22), [0.75, -2.3, -0.95], [1.35, -3.5, -1.25]],
};

// Purkinje fibres: a branching net lining the inside of each ventricle, from near the apex up the walls.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function wallNet(f, axis, count, inset, seed, side) {
  const rnd = seeded(seed);
  const dir = norm(sub(axis.base, axis.apex));
  const u = norm(cross(dir, [0, 0, 1])), w = cross(dir, u);
  const curves = [];
  for (let n = 0; n < count; n++) {
    const th = (n / count) * Math.PI * 2 + rnd() * 0.3;
    if (side && !side(th)) continue;
    const pts = [];
    const steps = 7;
    for (let s = 0; s <= steps; s++) {
      const t = 0.12 + (s / steps) * (0.62 + rnd() * 0.12);
      const a = lerp3(axis.apex, axis.base, t);
      const ang = th + Math.sin(s * 1.1 + n * 1.7) * 0.28 + (rnd() - 0.5) * 0.1;
      const radial = add(mul(u, Math.cos(ang)), mul(w, Math.sin(ang)));
      pts.push(project(f, add(a, mul(radial, 3)), -inset));
    }
    curves.push(pts);
    // One or two short twigs off the main fibre.
    for (let b = 0; b < 2; b++) {
      if (rnd() < 0.35) continue;
      const from = pts[2 + Math.floor(rnd() * 4)];
      const off = add(from, add(mul(u, (rnd() - 0.5) * 1.4), add(mul(w, (rnd() - 0.5) * 1.4), mul(dir, 0.5 + rnd() * 0.6))));
      const mid = project(f, lerp3(from, off, 0.5), -inset), end = project(f, off, -inset);
      curves.push([from, mid, end]);
    }
  }
  return curves;
}
export function purkinje() {
  // RV fibres only on the free wall (the side away from the septum).
  const rvFree = th => Math.cos(th - 2.1) > -0.2;
  // Laid just outside each cavity wall, i.e. in the innermost layer of muscle.
  return [
    ...wallNet(lvCavity, LV_AXIS, 26, -0.06, 7, null),
    ...wallNet(rvCavity, RV_AXIS, 14, -0.05, 11, rvFree),
  ];
}

// Coronary arteries, laid on the outer surface (realism only; not teaching content in this lab).
// The LAD runs in the anterior groove over the septum: take septal points, push them forward, drop them
// onto the outer wall.
export function coronaries() {
  const lad = [];
  for (let y = 0.6; y >= -4.4; y -= 0.5) lad.push(project(heartSurface, add(septal(y, 0.1), [0, 0, 4]), 0.03));
  return [lad];
}

export const HEART_CENTRE = [0.2, 1.0, -0.6];
export { dot };
