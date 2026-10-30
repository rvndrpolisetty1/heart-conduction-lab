// Circle to ask: draw a loop over the 3D heart or the ECG. The lasso works out what is inside it:
// heart landmarks (projected from the live 3D scene) or ECG waves (from the shared beat timeline).

const PRIORITY_HEART = ['av', 'his', 'sa', 'purkinje', 'bundles', 'internodal', 'atria', 'ventricles', 'ra', 'la', 'rv', 'lv', 'aorta'];
const PRIORITY_ECG = s => (s.kind === 'P' && !s.beat.conducted ? 6 : s.kind === 'f' ? 5 : s.kind === 'QRS' ? 4 : s.kind === 'PR' ? 3 : s.kind === 'T' ? 2 : 1);

function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

export function createLasso({ root, stage3d, ecgCanvas, getHeart, ecg, onCircle, onToggle = () => {} }) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('lasso'); svg.setAttribute('hidden', '');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.append(path);
  const hint = document.createElement('div');
  hint.className = 'lasso-hint'; hint.hidden = true;
  hint.textContent = 'Draw a circle around anything on the heart or the ECG';
  root.append(svg, hint);
  let pts = null, on = false;

  const rel = e => { const r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const d = () => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('') + (pts.length > 2 ? 'Z' : '');

  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId);
    svg.classList.remove('is-done');
    pts = [rel(e)];
    path.setAttribute('d', d());
  });
  svg.addEventListener('pointermove', e => {
    if (!pts) return;
    const p = rel(e), q = pts.at(-1);
    if (Math.hypot(p.x - q.x, p.y - q.y) > 3) { pts.push(p); path.setAttribute('d', d()); }
  });
  svg.addEventListener('pointerup', () => {
    if (!pts) return;
    const poly = pts; pts = null;
    const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
    const box = { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
    if (poly.length < 6 || box.x2 - box.x1 < 14 || box.y2 - box.y1 < 14) { path.setAttribute('d', ''); return; }
    svg.classList.add('is-done');
    const result = detect(poly, box);
    const c = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
    if (result) {
      const chip = document.createElement('div');
      chip.className = 'lasso-chip'; chip.textContent = `◯ ${result.label}`;
      chip.style.left = c.x + 'px'; chip.style.top = Math.max(16, box.y1 - 14) + 'px';
      root.append(chip); setTimeout(() => chip.remove(), 1700);
    }
    toggle(false);
    setTimeout(() => { svg.toggleAttribute('hidden', !on); path.setAttribute('d', ''); }, 1200);
    svg.removeAttribute('hidden');
    onCircle(result);
  });

  function detect(poly, box) {
    const R = root.getBoundingClientRect();
    const c = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
    const er = ecgCanvas.getBoundingClientRect(), sr = stage3d.getBoundingClientRect();
    const inRect = (p, r) => p.x >= r.left - R.left && p.x <= r.right - R.left && p.y >= r.top - R.top && p.y <= r.bottom - R.top;
    if (inRect(c, er)) {
      const segs = ecg.segmentsBetween(box.x1 - (er.left - R.left), box.x2 - (er.left - R.left));
      if (!segs.length) return null;
      const best = segs.reduce((a, b) => (PRIORITY_ECG(b) > PRIORITY_ECG(a) ? b : a));
      return { where: 'ecg', seg: best, label: best.label.split(':')[0] };
    }
    const heart = getHeart();
    if (heart && inRect(c, sr)) {
      const off = { x: sr.left - R.left, y: sr.top - R.top };
      const hits = [], near = [];
      for (const id of PRIORITY_HEART) {
        const p = heart.screenOf(id); if (!p) continue;
        const q = { x: p.x + off.x, y: p.y + off.y };
        if (inside(q, poly)) hits.push(id);
        near.push({ id, d: Math.hypot(q.x - c.x, q.y - c.y) });
      }
      const id = hits[0] || near.sort((a, b) => a.d - b.d).find(n => n.d < 90)?.id;
      if (!id) return null;
      return { where: 'heart', part: id, label: NAMES[id] || id };
    }
    return null;
  }

  function toggle(v = !on) {
    on = v;
    svg.toggleAttribute('hidden', !on); hint.hidden = !on;
    if (on) { svg.classList.remove('is-done'); path.setAttribute('d', ''); }
    onToggle(on);
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && on) toggle(false); });
  return { toggle, get on() { return on; } };
}

const NAMES = { av: 'AV node', his: 'Bundle of His', sa: 'SA node', purkinje: 'Purkinje fibres', bundles: 'Bundle branches', internodal: 'Internodal pathways',
  atria: 'Atria', ventricles: 'Ventricles', ra: 'Right atrium', la: 'Left atrium', rv: 'Right ventricle', lv: 'Left ventricle', aorta: 'Aorta' };
