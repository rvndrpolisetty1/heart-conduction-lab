// The component library a model's answer is written against. Generated code calls these functions;
// each one draws a polished, fixed component, so answers look consistent and stay safe.
//   ui.card, ui.pauseAnimation, ui.ladder, ui.strip, ui.compare, ui.formula, ui.quiz
//   heart.mark (a 3D marker built into the live heart)

import { createEngine, QRS_LEAD } from './timing.js';
import { voltage } from './ecg.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const css = () => getComputedStyle(document.documentElement);

// Small canvases redraw every frame while their component is on screen.
const loops = new Set();
(function tick(now) { for (const f of loops) f(now); requestAnimationFrame(tick); })(performance.now());
function canvasLoop(canvas, draw) {
  const ctx = canvas.getContext('2d');
  let last = performance.now();
  const f = now => {
    if (!canvas.isConnected) { loops.delete(f); return; }
    const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w) return;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, w, h, Math.min(50, now - last), now);
    last = now;
  };
  loops.add(f);
}

function paper(g, w, h, box, offsetMs) {
  const c = css();
  g.fillStyle = c.getPropertyValue('--paper'); g.fillRect(0, 0, w, h);
  for (let x = w - ((offsetMs / 40) % 1) * box, k = 0; x > -box; x -= box, k++) {
    g.strokeStyle = c.getPropertyValue(k % 5 ? '--paper-minor' : '--paper-major'); g.lineWidth = k % 5 ? 0.5 : 0.9;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
  }
  for (let y = h, k = 0; y > 0; y -= box, k++) {
    g.strokeStyle = c.getPropertyValue(k % 5 ? '--paper-minor' : '--paper-major'); g.lineWidth = k % 5 ? 0.5 : 0.9;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
  }
}

export function createLibrary({ heart }) {
  let target = null;          // element the next component is appended to
  let onCreate = () => {};

  let before = null;            // when rebuilding in place, new pieces go before this element
  function mount(el) {
    el.classList.add('gen-c');
    if (before && before.parentNode === target) target.insertBefore(el, before); else target.append(el);
    onCreate(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    return el;
  }

  const ui = {
    card({ title, text, tone }) {
      const el = document.createElement('section');
      el.className = 'gc-card' + (tone ? ' is-' + tone : '');
      el.innerHTML = `<h4>${esc(title)}</h4><p>${esc(text)}</p>`;
      return mount(el);
    },

    // Schematic of one beat: atria → AV node (holds) → ventricles, with a filling gauge during the hold.
    pauseAnimation({ hold = 80, label = 'PR segment', speed = 1 }) {
      const el = document.createElement('section');
      el.className = 'gc-anim';
      el.innerHTML = `<canvas></canvas><div class="gc-cap"><b>${esc(label)}</b> · AV node holds the signal ${hold} ms</div>`;
      const cycle = 1400;
      let clock = 0;
      canvasLoop(el.querySelector('canvas'), (g, w, h, dt) => {
        clock += dt * speed;
        const t = clock % cycle, c = css();
        g.clearRect(0, 0, w, h);
        const A = { x: w * 0.16, y: h * 0.5 }, N = { x: w * 0.5, y: h * 0.5 }, V = { x: w * 0.84, y: h * 0.5 };
        const node = (p, r, fill, text, glow) => {
          if (glow) { const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.2); gr.addColorStop(0, 'rgba(94,231,255,0.55)'); gr.addColorStop(1, 'rgba(94,231,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r * 2.2, 0, 7); g.fill(); }
          g.fillStyle = fill; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
          g.fillStyle = c.getPropertyValue('--ink'); g.font = '600 12px "Plus Jakarta Sans", sans-serif'; g.textAlign = 'center'; g.fillText(text, p.x, p.y + r + 18);
        };
        g.strokeStyle = c.getPropertyValue('--line-2'); g.lineWidth = 3; g.setLineDash([2, 6]);
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(V.x, V.y); g.stroke(); g.setLineDash([]);
        // Phases: 0-300 atria → node, 300-300+hold*4 hold, then node → ventricles.
        const tHold = 300, tGo = 300 + hold * 5, tEnd = tGo + 300;
        let p;
        if (t < tHold) p = { x: A.x + (N.x - A.x) * t / tHold, y: A.y };
        else if (t < tGo) p = N;
        else if (t < tEnd) p = { x: N.x + (V.x - N.x) * (t - tGo) / (tEnd - tGo), y: N.y };
        const holding = t >= tHold && t < tGo;
        node(A, 22, t < tHold ? '#ffb27a' : '#f3d9cb', 'Atria', false);
        node(N, 16, holding ? '#9fe8ff' : '#d8eef6', 'AV node', holding);
        // Ventricles fill during the hold, then squeeze.
        const fill = t < tHold ? 0.55 : t < tGo ? 0.55 + 0.45 * (t - tHold) / (tGo - tHold) : t < tEnd ? 1 : Math.max(0.2, 1 - (t - tEnd) / 300);
        g.fillStyle = '#f6d7dc'; g.beginPath(); g.roundRect(V.x - 26, V.y - 30, 52, 60, 12); g.fill();
        g.fillStyle = t >= tEnd && t < tEnd + 250 ? '#ff7d8f' : '#e0697b';
        g.beginPath(); g.roundRect(V.x - 26, V.y + 30 - 60 * fill, 52, 60 * fill, 12); g.fill();
        g.fillStyle = c.getPropertyValue('--ink'); g.fillText('Ventricles', V.x, V.y + 48);
        if (holding) { g.fillStyle = c.getPropertyValue('--accent'); g.font = '700 12px "JetBrains Mono", monospace'; g.fillText(`hold ${Math.round((t - tHold) / 5)} ms`, N.x, N.y - 26); }
        if (p) { g.fillStyle = '#ffffff'; g.shadowColor = '#5ee7ff'; g.shadowBlur = 14; g.beginPath(); g.arc(p.x, p.y, 6, 0, 7); g.fill(); g.shadowBlur = 0; }
      });
      return mount(el);
    },

    // Ladder diagram: activation through the atria, AV node, His–Purkinje and ventricles, beat by beat.
    ladder({ rhythm, beats = 6 }) {
      const el = document.createElement('section');
      el.className = 'gc-ladder';
      const CAP = { mobitz2: 'block below the AV node', mobitz1: 'block at the AV node', third: 'nothing crosses; escape beats start in the ventricles' };
      el.innerHTML = `<canvas></canvas><div class="gc-cap">Ladder diagram · ${esc(CAP[rhythm] || 'conduction')}</div>`;
      const e = createEngine(); e.setRhythm(rhythm); e.advance(beats * 800 + 600);
      const atrial = e.beats().atrial.slice(0, beats);
      const t0 = atrial[0].sa - 100, span = atrial.at(-1).sa + 520 - t0;
      const escapes = e.beats().ventricular.filter(v => v.escape && v.his + QRS_LEAD > t0 && v.his + QRS_LEAD < t0 + span);
      let shown = 0;
      canvasLoop(el.querySelector('canvas'), (g, w, h, dt) => {
        shown = Math.min(1, shown + dt / 2600);
        const c = css(), tiers = ['A', 'AV', 'His', 'V'], top = 6, rowH = (h - 12) / 4, lx = 34;
        const X = t => lx + (t - t0) / span * (w - lx - 10);
        g.clearRect(0, 0, w, h);
        tiers.forEach((n, i) => {
          g.fillStyle = i % 2 ? c.getPropertyValue('--card-2') : 'transparent';
          g.fillRect(lx, top + i * rowH, w - lx - 10, rowH);
          g.fillStyle = c.getPropertyValue('--ink-3'); g.font = '600 11px "JetBrains Mono", monospace'; g.textAlign = 'right';
          g.fillText(n, lx - 6, top + i * rowH + rowH / 2 + 4);
        });
        const cut = t0 + span * shown;
        g.save(); g.beginPath(); g.rect(0, 0, X(cut), h); g.clip();
        g.lineWidth = 2.4; g.lineCap = 'round';
        for (const a of atrial) {
          const y = i => top + i * rowH;
          g.strokeStyle = '#ff9a6b'; g.beginPath(); g.moveTo(X(a.sa), y(0)); g.lineTo(X(a.sa + 30), y(1)); g.stroke();
          const avEnd = a.conducted || a.block === 'his' ? a.sa + (a.pr || 160) - QRS_LEAD : a.sa + 200;
          g.strokeStyle = '#5ac8e6';
          if (a.conducted || a.block === 'his') { g.beginPath(); g.moveTo(X(a.sa + 30), y(1)); g.lineTo(X(avEnd), y(2)); g.stroke(); }
          else {
            const yb = y(1) + rowH * 0.6, xb = X(a.sa + 30 + (avEnd - a.sa - 30) * 0.6);
            g.beginPath(); g.moveTo(X(a.sa + 30), y(1)); g.lineTo(xb, yb); g.stroke();
            g.strokeStyle = '#e0453a'; g.beginPath(); g.moveTo(xb - 7, yb); g.lineTo(xb + 7, yb); g.stroke();
          }
          if (a.conducted) {
            g.strokeStyle = '#5ac8e6'; g.beginPath(); g.moveTo(X(avEnd), y(2)); g.lineTo(X(avEnd + 40), y(3)); g.stroke();
            g.strokeStyle = '#ff7d8f'; g.beginPath(); g.moveTo(X(avEnd + 40), y(3)); g.lineTo(X(avEnd + 70), y(4)); g.stroke();
            g.fillStyle = c.getPropertyValue('--accent'); g.font = '600 10px "JetBrains Mono", monospace'; g.textAlign = 'center';
            g.fillText(String(a.pr), X(a.sa + a.pr / 2), y(1) + rowH * 0.62);
          } else if (a.block === 'his') {
            const yb = y(2) + rowH * 0.55, xb = X(avEnd + 22);
            g.strokeStyle = '#5ac8e6'; g.beginPath(); g.moveTo(X(avEnd), y(2)); g.lineTo(xb, yb); g.stroke();
            g.strokeStyle = '#e0453a'; g.beginPath(); g.moveTo(xb - 7, yb); g.lineTo(xb + 7, yb); g.stroke();
          }
        }
        // Escape beats (third-degree): start low in the ventricles, independent of the atria.
        for (const v of escapes) {
          const y = i => top + i * rowH, x = X(v.his + QRS_LEAD);
          g.strokeStyle = '#ff7d8f'; g.lineWidth = 2.4;
          g.beginPath(); g.moveTo(x, y(4) - rowH * 0.15); g.lineTo(x - 10, y(3)); g.moveTo(x, y(4) - rowH * 0.15); g.lineTo(x + 6, y(4)); g.stroke();
          g.fillStyle = '#ff7d8f'; g.beginPath(); g.arc(x, y(4) - rowH * 0.15, 4, 0, 7); g.fill();
        }
        g.restore();
      });
      return mount(el);
    },

    // A small live ECG strip; mark 'PR' shades the PR segments, 'drop' rings dropped beats.
    strip({ rhythm, mark, label }) {
      const el = document.createElement('section');
      el.className = 'gc-strip';
      el.innerHTML = `<canvas></canvas>${label ? `<div class="gc-cap">${esc(label)}</div>` : ''}`;
      const e = createEngine(); e.setRhythm(rhythm); e.advance(6000);
      canvasLoop(el.querySelector('canvas'), (g, w, h, dt) => {
        e.advance(dt);
        const box = 3.4, now = e.time, by = h * 0.68, c = css(), beats = e.beats();
        paper(g, w, h, box, now);
        const X = t => w - (now - t) * box / 40;
        if (mark === 'PR') for (const a of beats.atrial) if (a.conducted) {
          g.fillStyle = 'rgba(109,74,255,0.16)'; g.fillRect(X(a.sa), 0, (a.pr) * box / 40, h);
        }
        if (mark === 'QRS' || mark === 'T') for (const v of beats.ventricular) {
          const q = v.his + QRS_LEAD, [a, b] = mark === 'QRS' ? [q - 4, q + 95] : [q + 160, q + 420];
          g.fillStyle = 'rgba(109,74,255,0.16)'; g.fillRect(X(a), 0, (b - a) * box / 40, h);
        }
        if (mark === 'drop') for (const a of beats.atrial) if (!a.conducted && X(a.sa) > 0) {
          g.strokeStyle = '#e0453a'; g.lineWidth = 2; g.beginPath(); g.arc(X(a.sa + 50), by - 10, 13, 0, 7); g.stroke();
        }
        g.strokeStyle = c.getPropertyValue('--trace'); g.lineWidth = 1.6; g.beginPath();
        for (let x = 0; x <= w; x++) { const y = by - voltage(now - (w - x) * 40 / box, beats, e.rhythm, e.rate) / 0.1 * box; x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      });
      return mount(el);
    },

    lessonHeader({ title, subtitle, objectives = [] }) {
      const el = document.createElement('section');
      el.className = 'gc-lesson';
      el.innerHTML = `<small>Lesson</small><h4>${esc(title)}</h4><p>${esc(subtitle)}</p><ul>${objectives.map(o => `<li>${esc(o)}</li>`).join('')}</ul>`;
      return mount(el);
    },

    // The live 3D heart, mirrored into the lesson. It arrives as a scan, then sharpens into the real view.
    heartView({ rhythm, reveal = 0.85 }) {
      const el = document.createElement('section');
      el.className = 'gc-heart';
      el.innerHTML = '<div class="gc-heart-frame"><canvas></canvas><span class="gc-scan"></span></div><div class="gc-cap">The live 3D heart: the same one students rotate in the lab</div>';
      heart?.view?.({ rhythm, reveal });
      const c = el.querySelector('canvas'), g = c.getContext('2d');
      heart?.mirror?.(src => {
        if (!c.isConnected) return false;
        const w = c.clientWidth, h = c.clientHeight;
        if (!w || !src.width) return true;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const s = Math.max(c.width / src.width, c.height / src.height), cw = c.width / s, ch = c.height / s;
        g.drawImage(src, (src.width - cw) / 2, (src.height - ch) / 2, cw, ch, 0, 0, c.width, c.height);
        return true;
      });
      requestAnimationFrame(() => setTimeout(() => el.classList.add('is-solid'), 500));
      return mount(el);
    },

    steps(list) {
      const el = document.createElement('section');
      el.className = 'gc-steps';
      el.innerHTML = list.map((s, i) => `<div class="gc-step" style="--d:${i * 120}ms"><b>${i + 1}</b><div><h5>${esc(s.title)}</h5><p>${esc(s.text)}</p></div></div>`).join('');
      return mount(el);
    },

    compare({ left, right }) {
      const el = document.createElement('section');
      el.className = 'gc-compare';
      const col = s => `<div><h5>${esc(s.title)}</h5><ul>${s.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
      el.innerHTML = col(left) + col(right);
      return mount(el);
    },

    formula({ name, expr, note }) {
      const el = document.createElement('section');
      el.className = 'gc-formula';
      el.innerHTML = `<small>${esc(name)}</small><code>${esc(expr)}</code>${note ? `<span>${esc(note)}</span>` : ''}`;
      return mount(el);
    },

    quiz({ q, options, answer, why }) {
      const el = document.createElement('section');
      el.className = 'gc-quiz';
      el.innerHTML = `<h5>${esc(q)}</h5><div class="gc-opts">${options.map((o, i) => `<button data-i="${i}">${esc(o)}</button>`).join('')}</div><p class="gc-why" hidden>${esc(why)}</p>`;
      el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const ok = Number(b.dataset.i) === answer;
        b.classList.add(ok ? 'is-right' : 'is-wrong');
        if (ok) { el.querySelector('.gc-why').hidden = false; el.querySelectorAll('button').forEach(x => { x.disabled = true; }); }
      }));
      return mount(el);
    },
  };

  const heartApi = {
    // Builds a marker into the live 3D heart: wireframe first, then a glowing solid.
    mark(part, { label, color = 'gold' } = {}) {
      const h = heart?.addMarker(part, { label, color });
      const el = document.createElement('section');
      el.className = 'gc-mark';
      el.innerHTML = `<i style="--c:${{ gold: '#ffd36e', red: '#ff5f57', cyan: '#5ee7ff' }[color] || color}"></i><span>Added to the 3D heart: <b>${esc(label)}</b></span>`;
      return mount(el), h;
    },
    activationMap(on = true) { heart?.setMap?.(on); },
  };

  return {
    ui, heart: heartApi,
    into(el, ref = null) { target = el; before = ref; },
    onCreate(fn) { onCreate = fn; },
    clear3d() { heart?.clearMarkers(); heart?.setMap?.(false); },
    removeMarker(part) { heart?.removeMarker?.(part); },
  };
}
