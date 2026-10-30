// The welcome screen and the guided tour. The narration plays chapter by chapter and its clock drives the
// page: a drawn cursor clicks and circles, the view zooms, the classroom speaks the lines, and captions
// follow. Cues come from assets/tour/tour.json (tools/record/tourdata.mjs). Concept demo: nothing is live.

import { pace } from './pace.js';

const WHO = { doctor: 'Dr. Tutor', student: 'Student', narrator: 'Narrator' };
const ease = u => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
const clamp01 = u => Math.max(0, Math.min(1, u));
const $ = s => document.querySelector(s);

export function createTour({ room, reset, askDropped, store, onEnd }) {
  const html = document.documentElement;
  const add = (cls, inner = '') => { const el = document.createElement('div'); el.className = cls; el.innerHTML = inner; el.hidden = true; html.append(el); return el; };

  // ---------- Welcome ----------
  const welcome = add('welcome', `
    <div class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <span class="eyebrow">Concept demo</span>
      <h1 id="welcome-title">Heart Conduction Lab</h1>
      <p class="welcome-lead">Lessons and answers that build themselves, for medical tutors and their students. This demo shows the idea on one topic: how electricity makes the heart beat.</p>
      <h2>In the 8-minute guided tour</h2>
      <ol class="welcome-list">
        <li><b>The idea</b><span>What generative UI means, in plain words</span></li>
        <li><b>The tutor</b><span>One request becomes a full lesson, built live</span></li>
        <li><b>The student</b><span>One heartbeat, the heart blocks and the ECG</span></li>
        <li><b>Asking</b><span>Type or circle a doubt, and a new panel is built</span></li>
      </ol>
      <div class="welcome-actions">
        <button class="btn welcome-start"><svg><use href="#i-play"/></svg>Start guided tour</button>
        <button class="btn ghost welcome-skip">Explore on my own</button>
      </div>
      <p class="welcome-hint">Turn your sound on for the tour. On your own, start at <b>How it works</b>, then <b>Tutor</b>, then <b>Student</b>.</p>
      <p class="welcome-note">No AI is called here: every response is pre-built. <em>Draft for physician review. Not for clinical use.</em></p>
    </div>`);

  // ---------- Tour furniture (on <html>, so the zoom doesn't scale it) ----------
  const block = add('tour-block');
  const cursor = add('tour-cursor', '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2l16 12.5-7.2.8 4.4 7.3-3 1.7-4.3-7.5L4 21z" fill="#fff" stroke="#15122b" stroke-width="1.4" stroke-linejoin="round"/></svg>');
  const ring = add('tour-ring');
  const endCard = add('tour-end', `
    <h1>Heart Conduction Lab</h1>
    <p>Concept demo: every AI response is pre-built.</p>
    <small>Draft for physician review. Not for clinical use.</small>
    <p>Prototype for The Match Guy. Built by Ravi Polisetti.</p>
    <div class="tour-end-actions"><button class="btn tour-explore">Explore the lab</button><button class="btn ghost tour-again">Watch again</button></div>`);
  const bar = add('tour-bar', `
    <div class="tour-cap" aria-live="off"><b></b><span></span></div>
    <div class="tour-controls">
      <button class="tour-btn-ic tour-prev" aria-label="Previous chapter"><svg><use href="#i-prev"/></svg></button>
      <button class="tour-btn-ic tour-play" aria-label="Pause"><svg><use href="#i-pause"/></svg></button>
      <button class="tour-btn-ic tour-next" aria-label="Next chapter"><svg><use href="#i-next"/></svg></button>
      <div class="tour-info"><b class="tour-title"></b><small><span class="tour-n"></span> · Concept demo, pre-built · Draft for physician review</small></div>
      <div class="tour-steps" aria-hidden="true"></div>
      <button class="btn ghost tour-exit">End tour</button>
    </div>`);
  cursor.hidden = ring.hidden = false;
  const capWho = bar.querySelector('.tour-cap b'), capText = bar.querySelector('.tour-cap span');
  const playBtn = bar.querySelector('.tour-play');

  const audio = new Audio(); audio.preload = 'auto';
  let chapters = null, n = 0, on = false, raf = 0;
  let ch = null, cues = [], tasks = [], lineI = -1, level = '';
  let cx = 960, cy = 540, glide = null, ringAt = -9, cursorOn = 0, cursorTarget = 0;
  let zoom = { from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 }, t0: 0, dur: 0.01 };
  const real = { setShot: room.setShot, dAct: room.doctor.act, sAct: room.student.act };
  const phone = () => innerWidth < 900;

  const tween = (t0, dur, fn) => tasks.push({ t0, dur, fn });
  const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const target = c => (c.text ? [...document.querySelectorAll(c.sel)].find(e => e.textContent.trim().includes(c.text)) : $(c.sel));
  const moveTo = (x, y, t, dur = 0.65) => { glide = { x0: cx, y0: cy, x1: x, y1: y, t0: t, dur }; cursorTarget = 1; };

  function zoomNow(t) {
    const u = ease(clamp01((t - zoom.t0) / zoom.dur)), a = zoom.from, b = zoom.to;
    return { s: a.s + (b.s - a.s) * u, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }
  function setZoom(t, c) {
    if (phone()) { if (c.sel) $(c.sel)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const W = innerWidth, H = innerHeight;
    let s = c.scale || 1, x = 0, y = 0;
    if (s > 1) {
      const el = $(c.sel); if (!el) return;
      const p = center(el), z = zoomNow(t), ux = (p.x - z.x) / z.s, uy = (p.y - z.y) / z.s;
      x = Math.min(0, Math.max(W - W * s, W / 2 - ux * s));
      y = Math.min(0, Math.max(H - H * s, H / 2 - uy * s));
    }
    zoom = { from: zoomNow(t), to: { s, x, y }, t0: t, dur: c.dur || 1.2 };
  }

  function pickDropped() {
    const e = window.__engine, cv = $('#ecg'), r = cv.getBoundingClientRect(), now = e.time, ppm = 5 / 40;
    const xOf = t => r.width - 18 - (now - t) * ppm;
    for (const a of e.beats().atrial.filter(b => !b.conducted && b.sa < now - 300).reverse()) {
      const x = xOf(a.sa + 50); if (x > 60 && x < r.width - 60) return { x: r.left + x, y: r.top + r.height * 0.6 };
    }
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 };
  }

  const run = {
    move(c, t) { const el = target(c); if (!el) return; if (phone()) el.scrollIntoView({ block: 'center' }); const p = center(el); moveTo(p.x, p.y, t, c.dur); },
    click(c, t) {
      const el = target(c); if (!el) return;
      el.scrollIntoView?.({ block: phone() ? 'center' : 'nearest' });
      const p = center(el); ringAt = t; ring.style.left = p.x + 'px'; ring.style.top = p.y + 'px'; cx = p.x; cy = p.y; glide = null;
      if (!c.keep) el.click();
    },
    hide() { cursorTarget = 0; },
    slide(c, t) {
      const el = $(c.sel), v0 = Number(el.value);
      tween(t, c.dur || 2, u => {
        el.value = v0 + (c.to - v0) * ease(u); el.dispatchEvent(new Event('input', { bubbles: true }));
        const r = el.getBoundingClientRect(), f = (el.value - el.min) / (el.max - el.min);
        cx = r.left + 10 + (r.width - 20) * f; cy = r.top + r.height / 2; glide = null;
      });
    },
    type(c, t) {
      const el = c.nth !== undefined ? document.querySelectorAll(c.sel)[c.nth] : target(c), text = c.value, base = c.append && el ? el.textContent : '';
      if (el && !c.append) el.focus?.({ preventScroll: true });
      tween(t, text.length / (c.cps || 30), u => {
        if (!el) return;
        const v = text.slice(0, Math.round(u * text.length));
        if ('value' in el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } else el.textContent = base + v;
      });
    },
    zoom: (c, t) => setZoom(t, c),
    stretch(c) { pace.k = c.v; },
    follow(c, t) { const el = $(c.sel); tween(t, c.dur, () => { if (el) el.scrollTop += (el.scrollHeight - el.clientHeight - el.scrollTop) * 0.06; }); },
    lasso(c, t) {
      const svg = $('svg.lasso'); svg.setPointerCapture = () => {};
      $('#ecg').scrollIntoView?.({ block: phone() ? 'center' : 'nearest' });
      const p = pickDropped(), r = c.r || 26, dur = c.dur || 1.3;
      const send = (type, a) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: p.x + Math.cos(a) * r, clientY: p.y + Math.sin(a) * r * 0.8 }));
      let began = false;
      moveTo(p.x + r, p.y, t - 0.6, 0.6);
      tween(t, dur, u => {
        const a = u * Math.PI * 2.15;
        if (!began) { began = true; send('pointerdown', 0); }
        send('pointermove', a); cx = p.x + Math.cos(a) * r; cy = p.y + Math.sin(a) * r * 0.8; glide = null;
        if (u >= 1) { send('pointerup', a); setTimeout(() => { if (on && $('.gen').hidden) askDropped(); }, 400); }
      });
    },
    js(c) { (0, eval)(c.code); },
    card(c, t) { endCard.hidden = false; const go = c.on; tween(t, 1, u => { endCard.style.opacity = go ? u : 1 - u; }); },
  };

  function voices(t) {
    const lv = (level.charCodeAt(Math.floor(t * 15)) - 48) / 9 || 0;
    let i = -1;
    for (let k = 0; k < ch.lines.length; k++) if (t >= ch.lines[k].s - 0.05 && t <= ch.lines[k].e + 0.25) i = k;
    const line = ch.lines[i];
    const bubble = $('.room-bubble'), text = $('.room-bubble p'), who = $('.room-bubble b');
    if (i !== lineI) {
      lineI = i;
      room.doctor.setMouth(0, false); room.student.setMouth(0, false);
      if (line?.who === 'student') { real.setShot.call(room, 'face'); real.sAct.call(room.student, 'puzzled'); }
      if (line?.who === 'doctor') { real.setShot.call(room, 'shoulder'); real.dAct.call(room.doctor, 'explain'); real.sAct.call(room.student, 'look'); }
      if (line && line.who !== 'narrator') bubble.classList.remove('is-out'), bubble.hidden = false;
      if (line?.who === 'narrator') bubble.classList.add('is-out');
    }
    if (line && line.who !== 'narrator') {
      who.textContent = WHO[line.who]; bubble.classList.toggle('is-student', line.who === 'student');
      room[line.who].setMouth(Math.min(1, lv * 1.9), true);
      let shown = '';
      for (const [w, s] of line.words) if (t >= s) shown += (shown ? ' ' : '') + w;
      text.textContent = shown;
    }
    // Don't leave a finished line up: the lab may relabel the bubble underneath it.
    if (!line && !ch.lines.some(l => t >= l.e && t < l.e + 1.5)) $('.room-bubble').classList.add('is-out');
    const cap = line?.caps.find(c => t >= c.s - 0.05 && t <= c.e + 0.3);
    capWho.textContent = cap ? WHO[line.who] : ''; capText.textContent = cap ? cap.text : '';
    capWho.parentElement.classList.toggle('is-on', !!cap);
  }

  function tick() {
    if (!on) return;
    raf = requestAnimationFrame(tick);
    const t = audio.currentTime;
    while (cues.length && cues[0].t <= t) { const c = cues.shift(); try { run[c.k]?.(c, c.t); } catch (e) { console.warn('tour cue', c.k, e); } }
    for (let i = tasks.length - 1; i >= 0; i--) {
      const k = tasks[i]; if (t < k.t0) continue;
      const u = clamp01((t - k.t0) / k.dur); k.fn(u); if (u >= 1) tasks.splice(i, 1);
    }
    if (glide && t >= glide.t0) {
      const u = ease(clamp01((t - glide.t0) / glide.dur));
      cx = glide.x0 + (glide.x1 - glide.x0) * u; cy = glide.y0 + (glide.y1 - glide.y0) * u;
      if (u >= 1) glide = null;
    }
    cursorOn += (cursorTarget - cursorOn) * 0.15;
    cursor.style.opacity = cursorOn; cursor.style.transform = `translate(${cx - 4}px, ${cy - 2}px)`;
    const r = clamp01((t - ringAt) / 0.4);
    ring.style.opacity = r < 1 ? 1 - r : 0; ring.style.transform = `scale(${0.4 + r})`;
    const z = zoomNow(t);
    document.body.style.transformOrigin = '0 0';
    document.body.style.transform = z.s < 1.001 ? '' : `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
    voices(t);
  }

  function paintBar() {
    bar.querySelector('.tour-title').textContent = ch.title;
    bar.querySelector('.tour-n').textContent = `Chapter ${n + 1} of ${chapters.length}`;
    [...bar.querySelectorAll('.tour-steps i')].forEach((el, i) => { el.classList.toggle('is-done', i < n); el.classList.toggle('is-on', i === n); });
    bar.querySelector('.tour-prev').disabled = n === 0;
    bar.querySelector('.tour-next').disabled = n === chapters.length - 1;
  }

  function setPlaying(p) {
    playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play');
    playBtn.querySelector('use').setAttribute('href', p ? '#i-pause' : '#i-play');
  }

  function load(i) {
    n = i; ch = chapters[i];
    cues = ch.cues.slice().sort((a, b) => a.t - b.t); tasks = []; lineI = -1; level = ch.level; glide = null; cursorTarget = 0; pace.k = 1;
    zoom = { from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 }, t0: 0, dur: 0.01 };
    document.body.style.transform = ''; endCard.hidden = true; endCard.style.opacity = 0;
    room.doctor.setMouth(0, false); room.student.setMouth(0, false);
    reset(ch.view);
    $('.room-bubble').classList.add('is-out');
    capText.textContent = ''; capWho.parentElement.classList.remove('is-on');
    audio.src = `assets/tour/${ch.id}.mp3`;
    paintBar();
    // Let the view settle, then run the opening state and start the voice.
    const token = ++loadToken;
    setTimeout(() => {
      if (token !== loadToken || !on) return;
      for (const k of ch.start || []) { try { run[k.k]?.(k, 0); } catch { /* optional */ } }
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }, 350);
  }
  let loadToken = 0;

  async function start() {
    welcome.hidden = true; store.set('welcomed', '1');
    chapters ||= await fetch('assets/tour/tour.json').then(r => r.json());
    bar.querySelector('.tour-steps').innerHTML = chapters.map(() => '<i></i>').join('');
    on = true; window.__touring = true;
    room.setShot = () => {}; room.doctor.act = () => {}; room.student.act = () => {};
    bar.hidden = false; block.hidden = false;
    load(0);
    tick();
  }

  function stop({ keepCard = false } = {}) {
    on = false; loadToken++; window.__touring = false; pace.k = 1;
    cancelAnimationFrame(raf); audio.pause();
    room.setShot = real.setShot; room.doctor.act = real.dAct; room.student.act = real.sAct;
    room.doctor.setMouth(0, false); room.student.setMouth(0, false);
    document.body.style.transform = '';
    bar.hidden = true; block.hidden = true; cursor.style.opacity = 0; ring.style.opacity = 0;
    $('.room-bubble').classList.add('is-out');
    if (!keepCard) { endCard.hidden = true; reset('student'); onEnd?.(); }
  }

  audio.addEventListener('ended', () => {
    if (!on) return;
    if (n < chapters.length - 1) load(n + 1);
    else { stop({ keepCard: true }); endCard.hidden = false; endCard.style.opacity = 1; endCard.classList.add('is-final'); }
  });
  playBtn.addEventListener('click', () => { if (audio.paused) audio.play().then(() => setPlaying(true)); else { audio.pause(); setPlaying(false); } });
  bar.querySelector('.tour-prev').addEventListener('click', () => { if (n > 0) load(n - 1); });
  bar.querySelector('.tour-next').addEventListener('click', () => { if (n < chapters.length - 1) load(n + 1); });
  bar.querySelector('.tour-exit').addEventListener('click', () => stop());
  endCard.querySelector('.tour-explore').addEventListener('click', () => { endCard.hidden = true; endCard.classList.remove('is-final'); reset('student'); onEnd?.(); });
  endCard.querySelector('.tour-again').addEventListener('click', () => { endCard.classList.remove('is-final'); start(); });
  welcome.querySelector('.welcome-start').addEventListener('click', start);
  welcome.querySelector('.welcome-skip').addEventListener('click', () => { welcome.hidden = true; store.set('welcomed', '1'); });
  document.addEventListener('keydown', e => {
    if (!on) { if (e.key === 'Escape' && !welcome.hidden) welcome.querySelector('.welcome-skip').click(); return; }
    if (e.key === 'Escape') stop();
    if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && on && !audio.paused) { audio.pause(); setPlaying(false); } });

  return { start, stop, welcome: () => { welcome.hidden = false; welcome.querySelector('.welcome-start').focus(); }, get on() { return on; } };
}
