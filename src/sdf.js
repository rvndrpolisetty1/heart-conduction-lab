// Signed-distance shapes and a surface-nets mesher. Plain arrays, no three.js, so the same code can
// run in the page or in Node. Units are centimetres; negative distance means inside.

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Ellipsoid (approximate distance, after Inigo Quilez).
export function ellipsoid(p, c, r) {
  const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  return k1 === 0 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
}

// Cone with rounded ends: radius r1 at a, r2 at b.
export function roundCone(p, a, b, r1, r2) {
  const ba = sub(b, a), l2 = dot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pa = sub(p, a), y = dot(pa, ba), z = y - l2;
  const xv = sub(mul(pa, l2), mul(ba, y));
  const x2 = dot(xv, xv), y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// A tapered tube through points, as a chain of round cones.
export function chain(p, pts, radii) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, roundCone(p, pts[i], pts[i + 1], radii[i], radii[i + 1]));
  return d;
}

export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export const smax = (a, b, k) => -smin(-a, -b, k);

// Value noise, smooth and cheap. Gives the muscle surface a little life.
function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise(p) {
  const xi = Math.floor(p[0]), yi = Math.floor(p[1]), zi = Math.floor(p[2]);
  const xf = p[0] - xi, yf = p[1] - yi, zf = p[2] - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
export const fbm = p => noise(p) * 0.6 + noise(mul(p, 2.03)) * 0.3 + noise(mul(p, 4.1)) * 0.1;

export function gradient(f, p, e = 0.01) {
  return norm([
    f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]]),
    f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]]),
    f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e]),
  ]);
}

// Move a point onto the level set f = iso (a few Newton steps along the gradient).
export function project(f, p, iso = 0, steps = 8) {
  let q = p;
  for (let i = 0; i < steps; i++) {
    const d = f(q) - iso;
    if (Math.abs(d) < 1e-3) break;
    q = sub(q, mul(gradient(f, q), d));
  }
  return q;
}

// Naive surface nets: one vertex per surface cell, quads across every sign-changing grid edge.
// Returns { positions, normals, indices } with normals from the field's gradient (smooth shading).
export function surfaceNets(f, min, max, step) {
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const at = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    vals[at(i, j, k)] = f([min[0] + i * step, min[1] + j * step, min[2] + k * step]);

  const cx = nx - 1, cy = ny - 1;
  const cell = (i, j, k) => i + cx * (j + cy * k);
  const vidx = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const pos = [];
  const EDGES = [];
  for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) EDGES.push([a, a | bit]);
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      cv[c] = vals[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
      if (cv[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t;
      sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
      sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
      n++;
    }
    vidx[cell(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * step, min[1] + (j + sy / n) * step, min[2] + (k + sz / n) * step);
  }

  const idx = [];
  const quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = vals[at(i, j, k)] < 0;
    if (v0 !== (vals[at(i + 1, j, k)] < 0))
      quad(vidx[cell(i, j - 1, k - 1)], vidx[cell(i, j, k - 1)], vidx[cell(i, j, k)], vidx[cell(i, j - 1, k)]);
    if (v0 !== (vals[at(i, j + 1, k)] < 0))
      quad(vidx[cell(i - 1, j, k - 1)], vidx[cell(i - 1, j, k)], vidx[cell(i, j, k)], vidx[cell(i, j, k - 1)]);
    if (v0 !== (vals[at(i, j, k + 1)] < 0))
      quad(vidx[cell(i - 1, j - 1, k)], vidx[cell(i, j - 1, k)], vidx[cell(i, j, k)], vidx[cell(i - 1, j, k)]);
  }

  const normals = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    const g = gradient(f, [pos[v], pos[v + 1], pos[v + 2]], step * 0.5);
    normals[v] = g[0]; normals[v + 1] = g[1]; normals[v + 2] = g[2];
  }
  // Wind every triangle so its face normal agrees with the field gradient (outward).
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const fn = cross(e1, e2);
    const g = [normals[a] + normals[b] + normals[c], normals[a + 1] + normals[b + 1] + normals[c + 1], normals[a + 2] + normals[b + 2] + normals[c + 2]];
    if (dot(fn, g) < 0) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  }
  return { positions: new Float32Array(pos), normals, indices: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}
