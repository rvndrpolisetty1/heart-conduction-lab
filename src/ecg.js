// Lead II ECG on real paper (25 mm/s, 10 mm/mV), drawn from the same beats as the 3D heart.
// Each wave is a sum of smooth bumps (the usual way ECG simulators build P, QRS and T), placed at the
// beat times the engine produced, so a wave appears exactly when that part of the heart lights up.

import { QRS_LEAD } from './timing.js';

const MS_PER_BOX = 40;                 // one small box at 25 mm/s
const MV_PER_BOX = 0.1;                // one small box at 10 mm/mV
const g = (x, mu, s) => Math.exp(-0.5 * ((x - mu) / s) ** 2);
const gAsym = (x, mu, sl, sr) => g(x, mu, x < mu ? sl : sr);

// T-wave peak moves with heart rate (shorter QT at faster rates).
const tPeak = rr => Math.min(330, Math.max(200, 250 * Math.sqrt(rr / 800)));

function beatVoltage(d, escape, rr) {
  if (escape) {
    // Broad escape complex with a T wave pointing the other way†.
    return -0.08 * g(d, 10, 8) + 0.95 * g(d, 62, 22) - 0.35 * g(d, 114, 16) - 0.28 * gAsym(d, 340, 60, 45);
  }
  return -0.1 * g(d, 14, 5) + 1.25 * g(d, 38, 8) - 0.28 * g(d, 58, 7) + 0.32 * gAsym(d, tPeak(rr), 48, 34);
}

// Fibrillatory baseline: a few incommensurate ripples around 6 to 9 per second.
const fWave = t => 0.05 * Math.sin(t / 26) + 0.035 * Math.sin(t / 17.5 + 1.3) + 0.025 * Math.sin(t / 21.7 + 2.1) * Math.sin(t / 310);

export function voltage(t, beats, rhythm, rate) {
  let v = 0;
  if (rhythm === 'af') v += fWave(t);
  else for (const a of beats.atrial) { const d = t - a.sa; if (d > -60 && d < 180) v += 0.15 * g(d, 50, 18); }
  const rr = 60000 / rate;
  for (const b of beats.ventricular) {
    const d = t - (b.his + QRS_LEAD);
    if (d > -60 && d < 800) v += beatVoltage(d, b.escape, rr);
  }
  return v;
}

// Which part of the heart a moment on the strip belongs to (for the two-way link with the 3D view).
export function segmentAt(t, beats, rhythm, rate) {
  const rr = 60000 / rate;
  for (const b of beats.ventricular) {
    const q = b.his + QRS_LEAD;
    if (t >= q - 5 && t < q + (b.escape ? 140 : 95)) return { kind: 'QRS', part: 'ventricles', label: b.escape ? 'Wide escape QRS: ventricles depolarising slowly' : 'QRS: ventricles depolarise', from: q, to: q + (b.escape ? 140 : 95) };
    const tp = b.escape ? 340 : tPeak(rr);
    if (t >= q + 150 && t < q + tp + 130) return { kind: 'T', part: 'ventricles', label: 'T wave: ventricles repolarise', from: q + 150, to: q + tp + 130 };
  }
  if (rhythm === 'af') return { kind: 'f', part: 'atria', label: 'Fibrillatory waves: chaotic atrial activity, no P wave', from: t - 60, to: t + 60 };
  for (const a of beats.atrial) {
    if (t >= a.sa - 5 && t < a.sa + 105) return { kind: 'P', beat: a, part: 'atria', label: a.conducted ? 'P wave: atria depolarise' : 'P wave that is not conducted', from: a.sa, to: a.sa + 105 };
    if (a.conducted && t >= a.sa + 105 && t < a.sa + a.pr) return { kind: 'PR', beat: a, part: 'av', label: `PR segment: AV node delay (PR ${a.pr} ms)`, from: a.sa + 105, to: a.sa + a.pr };
  }
  return null;
}

export function createEcg(canvas, engine) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, box = 5;
  let hover = null, hoverX = null, partHL = null, flash = null;
  let calipers = null;            // { a, b } in strip time
  let drag = null;
  let frozenAt = null;            // time at the right edge while calipers are on
  const css = () => getComputedStyle(document.documentElement);
  let colors = {};
  function readColors() {
    const c = css();
    colors = {
      paper: c.getPropertyValue('--paper').trim(), minor: c.getPropertyValue('--paper-minor').trim(), major: c.getPropertyValue('--paper-major').trim(),
      trace: c.getPropertyValue('--trace').trim(), ink: c.getPropertyValue('--ink-2').trim(), ink3: c.getPropertyValue('--ink-3').trim(),
      accent: c.getPropertyValue('--accent').trim(), bad: c.getPropertyValue('--bad').trim(), good: c.getPropertyValue('--good').trim(),
    };
  }
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    box = w < 520 ? 3.2 : 5;
    readColors();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const pxPerMs = () => box / MS_PER_BOX;
  const baseY = () => h * 0.64;
  const yOf = mv => baseY() - (mv / MV_PER_BOX) * box;
  const xOf = (time, now) => w - 18 - (now - time) * pxPerMs();
  const tOf = (x, now) => now - (w - 18 - x) / pxPerMs();

  function draw(state) {
    if (!w) return;
    const now = frozenAt ?? state.t;
    const beats = engine.beats(), rate = engine.rate, rhythm = engine.rhythm;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, w, h);

    // Grid scrolls with time: vertical lines sit on fixed 40 ms marks.
    const t0 = tOf(0, now), first = Math.floor(t0 / MS_PER_BOX);
    for (let k = first; ; k++) {
      const x = xOf(k * MS_PER_BOX, now);
      if (x > w) break;
      ctx.strokeStyle = k % 5 ? colors.minor : colors.major; ctx.lineWidth = k % 5 ? 0.6 : 1;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); ctx.stroke();
    }
    const by = baseY();
    for (let k = -Math.ceil(by / box); k * box + by <= h; k++) {
      const y = by + k * box;
      ctx.strokeStyle = k % 5 ? colors.minor : colors.major; ctx.lineWidth = k % 5 ? 0.6 : 1;
      ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); ctx.stroke();
    }

    // Waves belonging to the part hovered in the 3D view, shaded.
    if (partHL) {
      ctx.fillStyle = colors.accent; ctx.globalAlpha = 0.11;
      const band = (a, b) => { const x1 = Math.max(0, xOf(a, now)), x2 = Math.min(w, xOf(b, now)); if (x2 > x1) ctx.fillRect(x1, 0, x2 - x1, h); };
      if (partHL === 'atria' && rhythm !== 'af') for (const a of beats.atrial) band(a.sa - 5, a.sa + 105);
      if (partHL === 'atria' && rhythm === 'af') band(tOf(0, now), now);
      if (partHL === 'av') for (const a of beats.atrial) if (a.conducted) band(a.sa + 105, a.sa + a.pr);
      if (partHL === 'ventricles') for (const b of beats.ventricular) { const q = b.his + QRS_LEAD; band(q - 5, q + (b.escape ? 140 : 95)); }
      ctx.globalAlpha = 1;
    }
    // A clicked wave flashes briefly.
    if (flash && performance.now() < flash.until) {
      const x1 = Math.max(0, xOf(flash.from, now)), x2 = Math.min(w, xOf(flash.to, now));
      ctx.fillStyle = flash.color || colors.accent; ctx.globalAlpha = 0.28 * (flash.until - performance.now()) / 900; ctx.fillRect(x1, 0, x2 - x1, h); ctx.globalAlpha = 1;
    }
    // Hovered segment, shaded.
    if (hover) {
      const x1 = Math.max(0, xOf(hover.from, now)), x2 = Math.min(w, xOf(hover.to, now));
      ctx.fillStyle = colors.accent; ctx.globalAlpha = 0.13; ctx.fillRect(x1, 0, x2 - x1, h); ctx.globalAlpha = 1;
    }

    // Labels: P, PR bracket, QRS, T per beat.
    ctx.font = '600 11px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // At fast rates labels crowd together: a label that would overlap one already drawn is skipped.
    const placed = [];
    const put = (text, x, y, color) => {
      const hw = ctx.measureText(text).width / 2 + 2;
      if (placed.some(r => x - hw < r.x2 && x + hw > r.x1 && y - 11 < r.y2 && y + 2 > r.y1)) return false;
      placed.push({ x1: x - hw, x2: x + hw, y1: y - 11, y2: y + 2 });
      ctx.fillStyle = color; ctx.fillText(text, x, y); return true;
    };
    const label = (text, time, mv, color) => {
      const x = xOf(time, now);
      if (x < 8 || x > w - 8) return;
      put(text, x, yOf(mv) - 7, color);
    };
    const rr = 60000 / rate;
    if (rhythm !== 'af') for (const a of beats.atrial) {
      if (a.sa > now) break;
      label('P', a.sa + 50, 0.15, a.conducted ? colors.ink : colors.bad);
      const yb = by + box * 4.2;
      if (a.conducted && a.sa + a.pr <= now) {
        const x1 = xOf(a.sa, now), x2 = xOf(a.sa + a.pr, now);
        if (x2 > 0 && x1 < w) {
          ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(x1, yb - 4); ctx.lineTo(x1, yb); ctx.lineTo(x2, yb); ctx.lineTo(x2, yb - 4); ctx.stroke();
          put(`PR ${a.pr}`, (x1 + x2) / 2, yb + 13, colors.accent);
        }
      } else if (!a.conducted && rhythm !== 'third' && a.sa + 260 <= now) {
        const x = xOf(a.sa + 230, now);
        if (x > 30 && x < w - 30) put('no QRS', x, yb + 13, colors.bad);
      }
    }
    for (const b of beats.ventricular) {
      const q = b.his + QRS_LEAD;
      if (q > now) break;
      label(b.escape ? 'wide QRS' : 'QRS', q + (b.escape ? 62 : 38), b.escape ? 0.95 : 1.25, colors.ink);
      const tp = b.escape ? 340 : tPeak(rr);
      if (q + tp <= now) label('T', q + tp, b.escape ? 0.05 : 0.32, colors.ink3);
    }
    const caption = { af: 'f waves · no P waves · irregularly irregular QRS', third: 'P waves march through on their own · QRS is a slow, wide escape rhythm' }[rhythm];
    if (caption) { ctx.fillStyle = colors.bad; ctx.textAlign = 'left'; ctx.fillText(caption, 10, h - 9); ctx.textAlign = 'center'; }

    // Trace, up to "now", with a glowing pen at the leading edge.
    ctx.strokeStyle = colors.trace; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
    ctx.beginPath();
    const step = 1 / dpr;
    let started = false, lastY = by;
    for (let x = 0; x <= w - 18; x += step) {
      const tt = tOf(x, now);
      const y = yOf(voltage(tt, beats, rhythm, rate));
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      lastY = y;
    }
    ctx.stroke();
    const px = w - 18;
    const grd = ctx.createRadialGradient(px, lastY, 0, px, lastY, 12);
    grd.addColorStop(0, colors.accent); grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(px, lastY, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, lastY, 2.6, 0, Math.PI * 2); ctx.fill();

    // Calipers.
    if (calipers) {
      const xa = xOf(calipers.a, now), xb = xOf(calipers.b, now);
      ctx.strokeStyle = colors.good; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]);
      for (const x of [xa, xb]) { ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, h - 6); ctx.stroke(); }
      ctx.setLineDash([]);
      for (const x of [xa, xb]) { ctx.fillStyle = colors.good; ctx.beginPath(); ctx.arc(x, h - 12, 6, 0, Math.PI * 2); ctx.fill(); }
      const ms = Math.round(Math.abs(calipers.b - calipers.a));
      const text = `${ms} ms · ${(ms / MS_PER_BOX).toFixed(1)} small boxes`;
      ctx.font = '700 12px "JetBrains Mono", monospace';
      const tw = ctx.measureText(text).width + 16, cx = (xa + xb) / 2;
      ctx.fillStyle = colors.good; ctx.beginPath(); ctx.roundRect(cx - tw / 2, 8, tw, 22, 6); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(text, cx, 23);
    }
  }

  // Two-way link: hover a wave → the matching part of the heart lights up.
  let hoverFn = () => {};
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left;
    const now = frozenAt ?? engine.time;
    if (drag) { calipers[drag] = tOf(x, now); return; }
    if (calipers) {
      const near = ['a', 'b'].find(k => Math.abs(xOf(calipers[k], now) - x) < 12);
      canvas.style.cursor = near ? 'ew-resize' : '';
    }
    hoverX = x;
    hover = segmentAt(tOf(x, now), engine.beats(), engine.rhythm, engine.rate);
    hoverFn(hover);
  });
  canvas.addEventListener('pointerleave', () => { hover = null; hoverX = null; hoverFn(null); });
  canvas.addEventListener('pointerdown', e => {
    if (!calipers) return;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, now = frozenAt ?? engine.time;
    drag = ['a', 'b'].find(k => Math.abs(xOf(calipers[k], now) - x) < 14) || null;
    if (drag) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  // Clicking a wave reports it (used by level tasks such as "click the P wave that was not conducted").
  let clickFn = () => {};
  canvas.addEventListener('click', e => {
    if (calipers) return;
    const r = canvas.getBoundingClientRect(), now = frozenAt ?? engine.time;
    const seg = segmentAt(tOf(e.clientX - r.left, now), engine.beats(), engine.rhythm, engine.rate);
    clickFn(seg);
    if (seg) { flash = { from: seg.from, to: seg.to, until: performance.now() + 900 }; }
  });

  return {
    draw,
    resize, readColors,
    onHover: fn => { hoverFn = fn; },
    highlightPart: part => { partHL = part; },
    onClick: fn => { clickFn = fn; },
    // Waves under a horizontal stretch of the strip (CSS px from the canvas's left edge).
    segmentsBetween(x1, x2) {
      const now = frozenAt ?? engine.time, out = [];
      for (let x = Math.max(0, x1); x <= Math.min(w - 18, x2); x += 3) {
        const s = segmentAt(tOf(x, now), engine.beats(), engine.rhythm, engine.rate);
        if (s) out.push(s);
      }
      return out;
    },
    flashColor: c => { if (flash) flash.color = c; },
    freeze: on => { frozenAt = on ? engine.time : null; },
    get frozen() { return frozenAt !== null; },
    // Calipers freeze the strip and start on the most recent conducted PR (or the last RR).
    setCalipers(on) {
      if (!on) { calipers = null; frozenAt = null; canvas.style.cursor = ''; return null; }
      frozenAt = engine.time;
      const b = engine.beats();
      const pr = [...b.atrial].reverse().find(a => a.conducted && a.sa + a.pr < frozenAt - 200);
      if (pr) calipers = { a: pr.sa, b: pr.sa + pr.pr };
      else {
        const vs = b.ventricular.filter(v => v.his + QRS_LEAD < frozenAt);
        const [p, q] = vs.slice(-2);
        calipers = p && q ? { a: p.his + QRS_LEAD + 38, b: q.his + QRS_LEAD + 38 } : { a: frozenAt - 1200, b: frozenAt - 400 };
      }
      return calipers;
    },
    get calipers() { return calipers; },
  };
}
