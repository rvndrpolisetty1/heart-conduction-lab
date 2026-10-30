// Shell behaviour: view switching, model picker, token meters, theme, controls. No AI is called anywhere.

import { createHeart } from './heart.js';
import { createEngine, RHYTHMS, QRS_LEAD } from './timing.js';
import { createEcg } from './ecg.js';
import { createClassroom } from './classroom.js';
import { createLevels } from './levels.js';
import { createLibrary } from './library.js';
import { createBuilder } from './build.js';
import { SUGGESTIONS, findAnswer, getAnswer } from './answers.js';
import { createLasso } from './lasso.js';
import { createStudio } from './studio.js';
import { createHow } from './how.js';
import { createTour } from './tour.js';
import { LESSON } from './lesson.js';
import { RHYTHM_CARDS } from './content.js';
import { say, hush, setVoice, voiceAvailable } from './speech.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;

const store = {
  get(k) { try { return localStorage.getItem('hcl.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('hcl.' + k, v); } catch { /* storage blocked: fine */ } },
};

// Token budgets per role. Illustrative numbers only; the demo makes no model calls.
const BUDGETS = {
  student: { role: 'Student budget', used: 6.2, cap: 20, unit: 'today' },
  tutor: { role: 'Tutor budget', used: 184, cap: 500, unit: 'this month' },
};
const MODELS = { claude: 'Claude', gemini: 'Gemini', chatgpt: 'ChatGPT' };
let meterRole = 'student';
function paintMeter() {
  const b = BUDGETS[meterRole];
  $('.meter-role').textContent = b.role;
  $('.meter-num').innerHTML = `<b>${b.used.toFixed(1)}k</b> of ${b.cap}k tokens ${b.unit}`;
  $('.meter-bar i').style.width = `${Math.min(100, (b.used / b.cap) * 100)}%`;
}
// Generation spends (illustrative) tokens from the role's budget.
function addTokens(n, role = 'student') { BUDGETS[role].used += n / 1000; if (role === meterRole) paintMeter(); }

// 1. Views
const tabs = $$('.modes [role="tab"]');
const thumb = $('.modes-thumb');
function moveThumb() {
  const on = tabs.find(t => t.getAttribute('aria-selected') === 'true');
  if (!on) return;
  thumb.style.width = on.offsetWidth + 'px';
  thumb.style.transform = `translateX(${on.offsetLeft}px)`;
}
function showView(name) {
  tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === name)));
  $$('main .view').forEach(v => { v.hidden = v.dataset.view !== name; });
  meterRole = name === 'tutor' ? 'tutor' : 'student';
  paintMeter();
  moveThumb();
  store.set('view', name);
  if (name === 'student') ecg?.resize();
  if (name === 'how') requestAnimationFrame(() => how?.layout());
  // The classroom follows the view: lesson panel for students, workspace for the tutor.
  const cls = $('.classroom');
  if (cls) { if (name === 'tutor') $('.room-slot').append(cls); else if (cls.parentElement !== $('.panel')) $('.panel').prepend(cls); }
}
tabs.forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
tabs.forEach((t, i) => t.addEventListener('keydown', e => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  next.focus(); showView(next.dataset.view);
}));

// 2. Model picker
const model = $('.model');
const menu = $('.model-menu');
const btn = $('.model-btn');
function setModel(id) {
  root.dataset.model = id;
  model.dataset.model = id;
  $('.model-name').textContent = MODELS[id];
  $$('.gen-model').forEach(el => { el.textContent = MODELS[id]; });
  $$('.model-menu [role="option"]').forEach(o => o.setAttribute('aria-selected', String(o.dataset.model === id)));
  store.set('model', id);
}
function toggleMenu(open) {
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
}
btn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(menu.hidden); });
$$('.model-menu [role="option"]').forEach(o => o.addEventListener('click', () => { setModel(o.dataset.model); toggleMenu(false); }));
document.addEventListener('click', e => { if (!model.contains(e.target)) toggleMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleMenu(false); });

// 3. Theme
function currentTheme() {
  return root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
$('.theme-btn').addEventListener('click', () => {
  root.dataset.theme = currentTheme() === 'dark' ? 'light' : 'dark';
  store.set('theme', root.dataset.theme);
  ecg?.readColors();
});

// 4. Controls (visual state only until the engines land)
function single(groupSel, itemSel) {
  $$(groupSel).forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest(itemSel);
    if (!b) return;
    $$(itemSel, g).forEach(x => x.classList.toggle('is-on', x === b));
  }));
}
single('.chips', '.chip');
single('.rhythm-pick', '.rp');
const fmt = { speed: v => `${Number(v)}×`, hr: v => `${v} bpm` };
const outputs = {};
$$('[data-in]').forEach(inp => {
  const out = $(`[data-out="${inp.dataset.in}"]`);
  const upd = () => { out.textContent = fmt[inp.dataset.in](inp.value); };
  outputs[inp.dataset.in] = upd;
  inp.addEventListener('input', upd); upd();
});

// 5. ECG: created with the engine below.
let ecg = null;

// 6. The 3D heart, driven by the shared timing engine.
const stage = $('#stage3d');
const engine = window.__engine = createEngine();
const hrIn = $('[data-in="hr"]'), speedIn = $('[data-in="speed"]');
const HR_LABEL = { third: 'Atrial rate', af: 'Mean rate' };
function setRhythm(id) {
  engine.setRhythm(id);
  hrIn.value = RHYTHMS[id].rate; outputs.hr();
  hrIn.closest('.sl').querySelector('span').firstChild.textContent = `${HR_LABEL[id] || 'Heart rate'} `;
}
$$('.rp').forEach(b => b.addEventListener('click', () => { setRhythm(b.dataset.rhythm); explainRhythm(b.dataset.rhythm); }));
hrIn.addEventListener('input', () => engine.setRate(Number(hrIn.value)));

const hud = $('.beat-hud'), hudText = $('.hud-text'), hudPr = $('.hud-pr'), ecgHr = $('.ecg-hr'), ecgWhat = $('.ecg-what');
ecg = window.__ecg = createEcg($('#ecg'), engine);
let lastPhase = '';
function ventricularRate() {
  const v = engine.beats().ventricular.filter(b => b.his + QRS_LEAD <= engine.time);
  if (v.length < 2) return '–';
  if (engine.rhythm === 'af') {
    const span = v.at(-1).his - v[Math.max(0, v.length - 6)].his, n = Math.min(5, v.length - 1);
    return `irregular · about ${Math.round(60000 / (span / n))} bpm`;
  }
  return `HR ${Math.round(60000 / (v.at(-1).his - v.at(-2).his))} bpm`;
}
function showState(s) {
  const key = s.phase.text + s.phase.tone;
  if (key !== lastPhase) { hudText.textContent = s.phase.text; hud.dataset.tone = s.phase.tone; lastPhase = key; }
  const pr = s.rhythm === 'af' ? 'no PR' : s.rhythm === 'third' ? 'P and QRS unlinked' : s.beat ? (s.beat.conducted ? `PR ${s.beat.pr} ms` : 'P not conducted') : '';
  if (hudPr.textContent !== pr) hudPr.textContent = pr;
  const hr = ventricularRate();
  if (ecgHr.textContent !== hr) ecgHr.textContent = hr;
  ecg.draw(s);
}
// Hover a wave on the strip → that part of the heart lights up.
let chipFocus = 'all';
ecg.onHover(seg => {
  ecgWhat.textContent = seg ? seg.label : '';
  heart?.setFocus(seg ? seg.part : chipFocus);
});

const tip = $('.hover-tip');
const PART_OF = { ra: 'atria', la: 'atria', atrial: 'atria', sa: 'atria', av: 'av', his: 'ventricles', lv: 'ventricles', rv: 'ventricles', bundles: 'ventricles', purkinje: 'ventricles' };
function showHover(info) {
  ecg.highlightPart(info ? (PART_OF[info.id] || (info.id === 'shell' ? (info.dom === 0 ? 'atria' : 'ventricles') : null)) : null);
  if (!info) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.style.left = info.x + 'px'; tip.style.top = info.y + 'px';
  tip.querySelector('b').textContent = info.name;
  let when = '';
  const s = engine.state();
  if (info.id === 'sa') when = 'Fires first, at 0 ms. Sets the heart rate.';
  else if (info.id === 'av') when = s.beat?.conducted ? `Holds the signal for ${s.beat.pr - 80} ms this beat` : 'Delays the signal so the ventricles can fill';
  else if (info.dom === 0) when = `Activates ${Math.round(info.act)} ms after the SA node fires`;
  else if (info.dom === 1) when = s.escape ? 'Activated by the slow escape rhythm' : `Activates ${Math.round(info.act)} ms after the signal enters the His bundle`;
  else when = 'A great vessel; no electrical activity';
  tip.querySelector('span').textContent = when;
}

let heart = null;
createHeart(stage, { engine, onProgress: (msg) => { $('.ph-status').textContent = msg; } })
  .then(h => {
    heart = window.__heart = h;
    stage.classList.add('is-live');
    heart.setReveal($('#reveal').value / 100);
    heart.setSpeed(Number(speedIn.value));
    heart.onState(showState);
    heart.onHover(showHover);
    onHeartReady();
  })
  .catch(err => {
    console.error(err);
    $('.stage-placeholder b').textContent = '3D needs WebGL';
    $('.ph-status').textContent = 'This browser could not start the 3D view.';
    // Keep the ECG running on its own clock.
    let last = performance.now();
    const tick = now => { engine.advance((now - last) * Number(speedIn.value)); last = now; showState(engine.state()); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
$('#reveal').addEventListener('input', e => heart?.setReveal(e.target.value / 100));
const FOCUS_BY_LABEL = { 'All': 'all', 'Atria': 'atria', 'AV node': 'av', 'Ventricles': 'ventricles' };
$('.chips').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (b) { chipFocus = FOCUS_BY_LABEL[b.textContent.trim()]; heart?.setFocus(chipFocus); }
});
// Calipers: freeze the strip and measure an interval.
const calBtn = $('.tool[aria-label="Calipers"]');
calBtn.addEventListener('click', () => setCalipers(!ecg.calipers));
function setCalipers(on) {
  if (!!ecg.calipers === on) return;
  ecg.setCalipers(on);
  calBtn.classList.toggle('is-on', on);
  calBtn.setAttribute('aria-pressed', String(on));
  if (heart) { heart.setPaused(on); hud.classList.toggle('is-paused', on); }
  ecgWhat.textContent = on ? 'Calipers: drag the green handles to measure' : '';
}
// Pick a rhythm from code (levels), keeping the buttons in step.
function selectRhythm(id) {
  $$('.rp').forEach(b => b.classList.toggle('is-on', b.dataset.rhythm === id));
  setRhythm(id);
}
document.addEventListener('visibilitychange', () => heart && (document.hidden ? heart.pause() : heart.resume()));
speedIn.addEventListener('input', () => heart?.setSpeed(Number(speedIn.value)));
$('.hud-play').addEventListener('click', () => {
  if (!heart) return;
  heart.setPaused(!heart.paused);
  hud.classList.toggle('is-paused', heart.paused);
  $('.hud-play').setAttribute('aria-label', heart.paused ? 'Play' : 'Pause');
});
$('#mapToggle').addEventListener('change', e => {
  heart?.setMap(e.target.checked);
  $('.map-legend').hidden = !e.target.checked;
});

// 7. Classroom: Dr. Tutor and the Student (Pixar-style, in the lesson panel). The Student's laptop
// mirrors the main screen live: the beating heart, the ECG and the readout.
const mirror = document.createElement('canvas');
mirror.width = 640; mirror.height = 400;
const mctx = mirror.getContext('2d');
const room = window.__room = createClassroom($('.room-stage'), { screenCanvas: mirror });
const bubble = { el: $('.room-bubble'), text: $('.room-bubble p') };
const speakerEl = $('.room-bubble b');
const RHYTHM_NAME = Object.fromEntries(Object.entries(RHYTHMS).map(([k, v]) => [k, v.label]));
function cover(src, x, y, w, h) {
  const sw = src.width, sh = src.height;
  if (!sw || !sh) return;
  const s = Math.max(w / sw, h / sh), cw = w / s, ch = h / s;
  mctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
}
let askText = '', mirrorTick = 0;
function drawMirror() {
  const W = 640;
  mctx.fillStyle = '#0d1022'; mctx.fillRect(0, 0, W, 400);
  const heartCanvas = stage.querySelector('canvas.heart-canvas');
  if (heartCanvas) cover(heartCanvas, 0, 30, W, 232);
  mctx.fillStyle = '#18163a'; mctx.fillRect(0, 0, W, 30);
  mctx.font = '700 15px "Plus Jakarta Sans", sans-serif'; mctx.fillStyle = '#ffffff'; mctx.fillText('Heart Lab', 14, 20);
  mctx.font = '600 12px "JetBrains Mono", monospace'; mctx.fillStyle = '#b9b2ff';
  mctx.textAlign = 'right'; mctx.fillText(RHYTHM_NAME[engine.rhythm] || '', W - 14, 20); mctx.textAlign = 'left';
  // Readout pill, as on the main screen.
  const phase = hudText.textContent;
  mctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
  const pw = mctx.measureText(phase).width + 28;
  mctx.fillStyle = 'rgba(13,16,34,0.72)'; mctx.beginPath(); mctx.roundRect(W - pw - 12, 40, pw, 26, 13); mctx.fill();
  mctx.fillStyle = hud.dataset.tone === 'bad' ? '#ff9b9b' : '#ffffff'; mctx.fillText(phase, W - pw + 2, 58);
  // While an answer is open, the laptop shows its code streaming in, beside the heart.
  const codeNow = viewIs('tutor') ? studio?.codeText() : !genEl.hidden ? builder.state.text : '';
  if (codeNow) {
    mctx.fillStyle = 'rgba(20,18,42,0.94)'; mctx.fillRect(0, 30, W * 0.56, 232);
    const lines = codeNow.split('\n').slice(-13);
    mctx.font = '500 12.5px "JetBrains Mono", monospace';
    lines.forEach((l, i) => {
      mctx.fillStyle = l.trim().startsWith('//') ? '#7f79a8' : /ui\.|heart\./.test(l) ? '#7fd8ff' : '#e8e5ff';
      mctx.fillText(l.slice(0, 40), 12, 50 + i * 16.5);
    });
    if (genEl.classList.contains('is-building')) { mctx.fillStyle = '#b3a1ff'; mctx.fillRect(12 + Math.min(40, (lines.at(-1) || '').length) * 7.5, 38 + (lines.length - 1) * 16.5, 7, 14); }
  }
  cover($('#ecg'), 0, 262, W, 90);
  // "Ask AI" bar: where the Student types questions (live in phase 7).
  mctx.fillStyle = '#ffffff'; mctx.fillRect(0, 352, W, 48);
  mctx.fillStyle = '#efecff'; mctx.beginPath(); mctx.roundRect(12, 360, W - 24, 32, 16); mctx.fill();
  mctx.font = '500 14px "Plus Jakarta Sans", sans-serif'; mctx.fillStyle = askText ? '#15122b' : '#8c86a8';
  mctx.fillText(askText ? (askText.length > 62 ? '…' + askText.slice(-61) : askText) : '✦  Ask AI about anything on screen…', 28, 381);
}

// Who is talking: one bubble in the classroom, labelled with the speaker.
function speaker(who) {
  speakerEl.textContent = who === 'student' ? 'Student' : 'Dr. Tutor';
  bubble.el.classList.toggle('is-student', who === 'student');
}
let sayToken = 0, lastLine = null;
const stale = token => token !== sayToken;

// Lines from the fact table; `spot` is the part the hotspot marks on the main heart.
const LINES = {
  normal: { say: 'Normal sinus rhythm. Every P wave is followed by a QRS, and the PR stays between 120 and 200 ms.', spot: 'sa',
    q: 'What makes a rhythm normal?', a: 'Every P conducts, PR 120 to 200 ms.' },
  first: { say: 'First-degree block. The AV node holds the signal longer: PR over 200 ms, but every P still gets through.', spot: 'av',
    q: 'Why is the PR so long?', a: 'Slow AV node, but no beat is dropped.' },
  mobitz1: { say: 'Mobitz I. The PR gets longer each beat until one P is not conducted. The block is usually at the AV node.', spot: 'av',
    q: 'Why did that beat drop?', a: 'PR longer, longer, then dropped: AV node.' },
  mobitz2: { say: 'Mobitz II. The PR stays the same, then a QRS suddenly drops. The block is below the AV node, so a pacemaker is usually needed.', spot: 'his',
    q: 'Same PR, then a sudden drop?', a: 'Block below the AV node. Pacemaker usually needed.' },
  third: { say: 'Third-degree block. Nothing gets through, so the atria and ventricles beat on their own, with a slow escape rhythm.', spot: 'av',
    q: "Why don't the P waves match the QRS?", a: 'Nothing crosses. A slow escape rhythm takes over.' },
  af: { say: 'Atrial fibrillation. There are no clear P waves, and the rhythm is irregularly irregular.', spot: 'atria',
    q: 'Where did the P waves go?', a: 'Chaotic atria: no P, irregularly irregular.' },
};
// A short scene: the Student asks, Dr. Tutor explains at the laptop, the Student gets it.
async function scene(line) {
  const token = ++sayToken;
  activeSpot = line.spot;
  buildSpots();
  if (line.q) {
    room.setShot('face'); room.student.act('puzzled'); speaker('student');
    await say(room.student, bubble, line.q, { hold: 0.5 });
    if (stale(token)) return;
  }
  room.setShot('shoulder'); room.doctor.act('pointScreen', 1.8, 'explain'); room.student.act('look'); speaker('doctor');
  await say(room.doctor, bubble, line.say, { hold: line.a ? 0.9 : 2.4 });
  if (stale(token)) return;
  room.doctor.act('nod', 1.4, 'idle');
  if (line.a) {
    room.setShot('face'); room.student.act('aha', 2.6, 'type'); speaker('student');
    await say(room.student, bubble, line.a, { hold: 2 });
    if (stale(token)) return;
    room.setShot('shoulder');
  } else room.student.act('type');
}
function explainRhythm(id) { lastLine = LINES[id]; scene(lastLine); }

// 8. Hotspots and zoom layers (Gemini-style): ring dot, dashed leader, label. Click to zoom or explain.
const HOTSPOTS = [
  [{ id: 'ra', label: 'Right atrium' }, { id: 'la', label: 'Left atrium' }, { id: 'rv', label: 'Right ventricle' }, { id: 'lv', label: 'Left ventricle' },
    { id: 'aorta', label: 'Aorta' }, { id: 'conduction', label: 'Conduction system', zoom: 1 }],
  [{ id: 'sa', label: 'SA node' }, { id: 'internodal', label: 'Internodal pathways' }, { id: 'av', label: 'AV node', zoom: 2 },
    { id: 'his', label: 'Bundle of His' }, { id: 'bundles', label: 'Bundle branches' }, { id: 'purkinje', label: 'Purkinje fibres' }],
  [{ id: 'internodal', label: 'From the atria' }, { id: 'av', label: 'AV node · the gatekeeper' }, { id: 'his', label: 'Bundle of His' }],
];
const PART_LINES = {
  ra: 'The right atrium collects blood from the body. The SA node sits high in its wall.',
  la: "The left atrium collects blood from the lungs. Bachmann's bundle carries the signal across to it.",
  rv: 'The right ventricle pumps blood to the lungs. Its wall is thinner than the left.',
  lv: 'The left ventricle pumps blood to the whole body, so it has the thickest wall.',
  aorta: 'The aorta carries blood from the left ventricle to the body. It has no electrical activity.',
  sa: 'The SA node is the natural pacemaker. It fires first and sets the heart rate.',
  internodal: 'Internodal pathways carry the signal across the right atrium to the AV node.',
  av: 'The AV node is the gatekeeper. It holds the signal briefly: that pause is the PR segment.',
  his: 'The bundle of His carries the signal from the AV node into the septum. A block here is below the AV node.',
  bundles: 'The bundle branches run down each side of the septum, one to each ventricle.',
  purkinje: 'Purkinje fibres spread the signal fast through the ventricle walls, so they squeeze together, from the apex up.',
};
const LAYER_LINES = [null,
  'This is the conduction system on its own. Follow the signal from the SA node to the Purkinje fibres.',
  'Close up on the AV node. Watch how the signal waits here before it goes on.'];
const hsLayer = $('.hotspots');
let layer = 0, activeSpot = null, spots = [];
const SPOT_NAME = { sa: 'SA node', av: 'AV node', his: 'Bundle of His', purkinje: 'Purkinje fibres', atria: 'Atria', ventricles: 'Ventricles',
  bundles: 'Bundle branches', internodal: 'Internodal pathways', ra: 'Right atrium', la: 'Left atrium', rv: 'Right ventricle', lv: 'Left ventricle', aorta: 'Aorta' };
function buildSpots() {
  hsLayer.innerHTML = '';
  // The part Dr. Tutor is talking about always gets a label, even if this layer doesn't list it.
  const list = [...HOTSPOTS[layer]];
  // Markers built by a generated answer get their own gold or red labels.
  for (const m of heart?.markers() || []) {
    const i = list.findIndex(h => h.id === m.part);
    const entry = { id: m.part, label: m.label, gen: m.color };
    if (i >= 0) list[i] = entry; else list.push(entry);
  }
  // "Atria" or "Ventricles" lights an existing chamber label rather than adding one on top of it.
  const alias = { atria: 'ra', ventricles: 'lv' }[activeSpot];
  if (alias && list.some(h => h.id === alias)) activeSpot = alias;
  if (activeSpot && !list.some(h => h.id === activeSpot)) list.push({ id: activeSpot, label: SPOT_NAME[activeSpot] || activeSpot });
  spots = list.map(h => {
    const el = document.createElement('button');
    el.className = 'hs' + (h.zoom ? ' can-zoom' : '') + (h.gen ? ' hs-gen' + (h.gen === 'red' ? ' is-red' : '') : '');
    el.setAttribute('aria-label', h.zoom ? `${h.label}: zoom in` : h.label);
    el.innerHTML = '<span class="hs-lead"></span><span class="hs-dot"></span><span class="hs-label"></span>';
    el.querySelector('.hs-label').textContent = h.label;
    el.addEventListener('click', () => {
      if (levels?.onSpot(h.id)) return;
      if (h.zoom) setLayer(h.zoom);
      else if (PART_LINES[h.id]) { lastLine = { say: PART_LINES[h.id], spot: h.id }; scene(lastLine); }
    });
    hsLayer.append(el);
    return { ...h, el, lead: el.querySelector('.hs-lead'), lab: el.querySelector('.hs-label') };
  });
}
function placeSpots() {
  if (!heart) return;
  const w = stage.clientWidth;
  // Labels fan outward from the middle of the heart so they never pile up on it.
  const c = heart.screenOf(layer === 2 ? 'av' : 'conduction');
  for (const s of spots) {
    const p = heart.screenOf(s.id);
    if (!p) continue;
    let dx = p.x - c.x, dy = p.y - c.y;
    if (Math.hypot(dx, dy) < 12) { dx = 0.25; dy = -1; }
    const L = (w < 560 ? 34 : 62) + (layer === 2 ? 40 : 0);
    let ang = Math.atan2(dy, dx) * 180 / Math.PI;
    let side = dx < 0 ? -1 : 1;
    // Keep labels on screen: mirror the leader to the other side if the label would run off an edge.
    const lw = s.lab.offsetWidth || 90, reach = Math.abs(Math.cos(ang * Math.PI / 180)) * L;
    if ((side < 0 && p.x - reach - lw < 4) || (side > 0 && p.x + reach + lw > w - 4)) { side = -side; ang = 180 - ang; }
    const ex = Math.cos(ang * Math.PI / 180) * L, ey = Math.sin(ang * Math.PI / 180) * L;
    s.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    s.lead.style.width = L + 'px'; s.lead.style.transform = `rotate(${ang}deg)`;
    s.lab.style.left = ex + 'px'; s.lab.style.top = ey + 'px';
    s.lab.style.setProperty('--lx', side < 0 ? '-100%' : '0');
    s.el.classList.toggle('is-active', s.id === activeSpot);
    s.el.classList.toggle('is-dim', !!activeSpot && s.id !== activeSpot && !s.gen);
  }
}
const REVEAL = [0, 85, 92];
function setLayer(n, { quiet = false } = {}) {
  layer = n;
  heart?.setLayer(n);
  $('#reveal').value = REVEAL[n]; heart?.setReveal(REVEAL[n] / 100);
  $$('.crumbs button').forEach(b => b.classList.toggle('is-on', Number(b.dataset.layer) === n));
  buildSpots();
  if (!quiet && LAYER_LINES[n]) { lastLine = { say: LAYER_LINES[n], spot: n === 2 ? 'av' : 'sa' }; scene(lastLine); }
}
$$('.crumbs button').forEach(b => b.addEventListener('click', () => setLayer(Number(b.dataset.layer))));

// 9. Step cards: Dr. Tutor walks one heartbeat, step by step, marking each part on the main heart.
const STEPS = [
  { title: 'The SA node fires', spot: 'sa', focus: 'atria', layer: 0, confirm: 'I found the SA node',
    body: "A small patch of cells high in the right atrium sets off each heartbeat. It is the heart's natural pacemaker.",
    say: "Hi, I'm Dr. Tutor. Let's follow one heartbeat. It starts at the SA node, high in the right atrium: the heart's natural pacemaker." },
  { title: 'The atria depolarise', spot: 'ra', focus: 'atria', layer: 0, confirm: 'I saw the P wave',
    body: 'The signal spreads across both atria, and they squeeze. On the ECG this is the P wave.',
    say: 'The signal spreads across both atria and they squeeze. On the ECG, that is the P wave.' },
  { title: 'The AV node pauses', spot: 'av', focus: 'av', layer: 2, confirm: 'I saw the AV pause',
    body: 'The AV node holds the signal for a moment, so the ventricles can fill. This pause is the flat PR segment.',
    say: 'Now the AV node holds the signal for a moment, so the ventricles can fill. That pause is the flat PR segment.' },
  { title: 'Down the bundle of His', spot: 'his', focus: 'ventricles', layer: 1, confirm: 'I traced the bundle branches',
    body: 'The signal runs down the bundle of His and splits into the right and left bundle branches, either side of the septum.',
    say: 'The signal runs down the bundle of His, then splits into the right and left bundle branches.' },
  { title: 'The ventricles depolarise', spot: 'purkinje', focus: 'ventricles', layer: 1, confirm: 'I saw the QRS',
    body: 'Purkinje fibres spread the signal fast through both ventricles, and they squeeze from the apex up. This is the QRS.',
    say: 'Purkinje fibres spread it fast through both ventricles, and they squeeze from the bottom up. That is the QRS.' },
  { title: 'The ventricles reset', spot: 'lv', focus: 'ventricles', layer: 0, confirm: 'I saw the T wave',
    body: 'The ventricles repolarise, ready for the next beat. On the ECG this is the T wave.',
    say: 'Finally the ventricles reset, ready for the next beat. On the ECG, that is the T wave.' },
];
let step = 0;
function goStep(i) {
  step = Math.max(0, Math.min(STEPS.length - 1, i));
  const s = STEPS[step], card = $('.step-card');
  card.querySelector('.step-n').textContent = `Step ${step + 1} of ${STEPS.length}`;
  card.querySelector('h3').textContent = s.title;
  card.querySelector('.step-body').textContent = s.body;
  card.querySelector('.confirm-text').textContent = s.confirm;
  card.querySelector('.confirm input').checked = false;
  $('.step-back').disabled = step === 0;
  $('.step-next').textContent = step === STEPS.length - 1 ? 'Start again' : 'Next';
  $$('.steps-bar i').forEach((b, k) => b.classList.toggle('on', k <= step));
  $('.steps-bar').setAttribute('aria-label', `Step ${step + 1} of ${STEPS.length}`);
  if (layer !== s.layer) setLayer(s.layer, { quiet: true });
  chipFocus = s.focus; heart?.setFocus(s.focus);
  $$('.chip').forEach(c => c.classList.toggle('is-on', FOCUS_BY_LABEL[c.textContent.trim()] === s.focus));
  lastLine = { say: s.say, spot: s.spot };
  scene(lastLine);
}
$('.step-next').addEventListener('click', () => goStep(step === STEPS.length - 1 ? 0 : step + 1));
$('.step-back').addEventListener('click', () => goStep(step - 1));
$('.step-card .confirm input').addEventListener('change', e => {
  if (!e.target.checked) return;
  room.student.act('celebrate', 1.6, 'type'); room.doctor.act('thumbs', 1.6, 'idle');
});

// 10. Levels, hints, solutions, rhythm cards, toolbox panels and the quiz.
const levels = window.__levels = createLevels({
  engine, ecg, room, scene, selectRhythm, setLayer, goStep, store,
  calipers: { open: setCalipers, isOpen: () => !!ecg.calipers },
});

// 11. Ask the AI (concept demo): the Student types a doubt on the laptop, the answer's code streams in,
// and each block builds the moment it completes: in the panel, and as markers in the live 3D heart.
const genEl = $('.gen');
const setMapUI = on => { heart?.setMap(on); $('#mapToggle').checked = on; $('.map-legend').hidden = !on; };
// Heart access for generated code: markers, the activation map, switching the shown rhythm, and
// mirroring the live 3D canvas into a component (drawn in the heart's own frame).
const mirrorFns = new Set();
const heartApi = {
  addMarker: (...a) => heart?.addMarker(...a), clearMarkers: () => heart?.clearMarkers(), setMap: setMapUI,
  view: ({ rhythm, reveal }) => { if (rhythm) selectRhythm(rhythm); if (reveal != null) { $('#reveal').value = reveal * 100; heart?.setReveal(reveal); } },
  mirror: fn => mirrorFns.add(fn),
};
const lib = createLibrary({ heart: heartApi });
let spendRole = 'student';
const builder = window.__builder = createBuilder(genEl, lib, { onTokens: n => addTokens(n, spendRole) });
const typeOut = async (text, set, cps = 28) => { for (let i = 1; i <= text.length; i++) { set(text.slice(0, i)); await new Promise(r => setTimeout(r, 1000 / cps)); } };
let askToken = 0;
async function ask(q, { answerId = null, circled = null } = {}) {
  q = q.trim(); if (!q) return;
  const token = ++askToken;
  sayToken++; hush(room.doctor, bubble);       // interrupt any scene and its speech
  $('.ask input').value = '';
  $('.gen-improv').hidden = true; $('.gen-request').hidden = true;
  spendRole = 'student';
  // 1. The Student types the question on the laptop (after circling, the circle comes first).
  room.setShot('shoulder'); room.student.act('ask'); speaker('student');
  bubble.el.classList.remove('is-out');
  const prefix = circled ? `◯ ${circled} · ` : '';
  await typeOut(q, t => { askText = prefix + t; bubble.text.textContent = t; });
  if (token !== askToken) return;
  const answer = answerId ? getAnswer(answerId) : findAnswer(q);
  // 2. Open the panel; the heart slides left to make room.
  genEl.hidden = false;
  heart?.setShift(stage.clientWidth > 600 ? 0.31 : 0);
  $('.gen-q').textContent = answer ? q : `“${q}”`;
  room.student.act('think');
  if (!answer) return guidedSearch(q, token);
  activeSpot = answer.spot; buildSpots();
  const ok = await builder.start(answer);
  if (!ok || token !== askToken) return;
  // 3. Ready: the Student gets it; Dr. Tutor sums up, and can ask the AI to improvise.
  askText = '';
  room.student.act('aha', 2.6, 'look');
  showImprov(answer, token);
  setTimeout(() => token === askToken && scene({ say: answer.say, spot: answer.spot }), 1400);
}

// Dr. Tutor improvises: asks the AI to redo the answer another way; the change arrives as a diff.
function showImprov(answer, token) {
  const box = $('.gen-improv');
  box.querySelectorAll('button').forEach(b => b.remove());
  if (!answer.variants?.length) { box.hidden = true; return; }
  for (const v of answer.variants) {
    const b = document.createElement('button');
    b.textContent = v.label;
    b.addEventListener('click', () => improvise(v, b, token));
    box.append(b);
  }
  box.hidden = false;
}
async function improvise(variant, btn, token) {
  if (token !== askToken) return;
  sayToken++;
  $$('.gen-improv button').forEach(b => { b.disabled = true; });
  const req = $('.gen-request');
  req.hidden = false; req.innerHTML = `<b>Dr. Tutor:</b> “${variant.request}”`;
  room.setShot('shoulder'); room.doctor.act('pointScreen', 1.6, 'explain'); room.student.act('look'); speaker('doctor');
  await say(room.doctor, bubble, variant.request, { hold: 0.3 });
  if (token !== askToken) return;
  room.doctor.act('idle'); room.student.act('think');
  spendRole = 'tutor';
  const ok = await builder.revise(variant);
  spendRole = 'student';
  if (!ok || token !== askToken) return;
  room.student.act('aha', 2.4, 'look'); room.doctor.act('thumbs', 1.8, 'idle');
  btn.textContent = `✓ ${variant.label}`;
  $$('.gen-improv button').forEach(b => { if (b !== btn && !b.textContent.startsWith('✓')) b.disabled = false; });
}

// Circle to ask: what was circled decides the answer.
function answerForCircle(r) {
  const rh = engine.rhythm;
  if (!r) return null;
  if (r.where === 'ecg') {
    const s = r.seg;
    if (s.kind === 'P' && !s.beat.conducted) {
      if (rh === 'mobitz1') return ['mobitz1Drop', 'Why did this beat drop?'];
      if (rh === 'mobitz2') return ['compare', 'Same drop, but why is this one different?'];
      return ['thirdLadder', 'Why does this P wave have no QRS?'];
    }
    if (s.kind === 'f') return ['afBaseline', 'Why is the baseline wavy here?'];
    if (s.kind === 'T') return ['tWave', 'What is this wave?'];
    if (s.kind === 'QRS') return rh === 'third' ? ['thirdLadder', 'Why is this QRS so wide and slow?'] : ['purkinje', 'What is happening during this spike?'];
    if (s.kind === 'PR') return ['avPause', 'Why is the line flat here?'];
    if (s.kind === 'P') return rh === 'third' ? ['thirdLadder', 'Why do the P waves not match the QRS?'] : ['prInterval', 'What is this bump and the gap after it?'];
    return null;
  }
  const p = r.part;
  if (p === 'av') return rh === 'third' ? ['thirdLadder', 'Why does nothing get through here?'] : ['avPause', 'Why does the signal pause here?'];
  if (p === 'his') return rh === 'mobitz2' || rh === 'mobitz1' ? ['compare', 'Is this where the beat is dropped?'] : ['purkinje', 'Where does the signal go from here?'];
  if (['purkinje', 'bundles', 'ventricles', 'lv', 'rv'].includes(p)) return ['purkinje', 'Why do the ventricles squeeze from the bottom up?'];
  if (['atria', 'ra', 'la', 'sa', 'internodal'].includes(p)) {
    if (rh === 'af') return ['afBaseline', 'What is going on in the atria?'];
    if (rh === 'third') return ['thirdLadder', 'Why are the atria beating on their own?'];
    return ['prInterval', 'How long does the signal take to get through here?'];
  }
  return null;
}
const askTool = $('.tool[aria-label="Circle to ask"]');
const lasso = window.__lasso = createLasso({
  root: $('.stage'), stage3d: stage, ecgCanvas: $('#ecg'), getHeart: () => heart, ecg,
  onToggle: on => { askTool.classList.toggle('is-on', on); askTool.setAttribute('aria-pressed', String(on)); ecg.freeze(on); if (on) { room.student.act('ask'); room.setShot('shoulder'); } },
  onCircle: r => {
    ecg.freeze(false);
    const m = answerForCircle(r);
    if (m) ask(m[1], { answerId: m[0], circled: r.label });
    else ask(r ? `Tell me about the ${r.label.toLowerCase()}` : 'What is this?', { circled: r?.label || 'something' });
  },
});
askTool.addEventListener('click', () => lasso.toggle());

// Select any text in the lesson or an answer → "Ask about this".
const selBtn = document.createElement('button');
selBtn.className = 'sel-ask'; selBtn.hidden = true;
selBtn.innerHTML = '<svg><use href="#i-spark"/></svg>Ask about this';
document.body.append(selBtn);
let selText = '';
document.addEventListener('mouseup', e => {
  if (e.target.closest?.('.sel-ask')) return;
  setTimeout(() => {
    const sel = getSelection(), t = sel.toString().trim();
    const inLesson = sel.rangeCount && sel.anchorNode && (sel.anchorNode.parentElement?.closest('.panel, .gen-preview, .pop'));
    if (!t || t.length < 2 || t.length > 160 || !inLesson) { selBtn.hidden = true; return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    selText = t;
    selBtn.style.left = (r.left + r.width / 2) + 'px'; selBtn.style.top = r.top + 'px';
    selBtn.hidden = false;
  }, 10);
});
selBtn.addEventListener('mousedown', e => e.preventDefault());
selBtn.addEventListener('click', () => {
  selBtn.hidden = true;
  getSelection().removeAllRanges();
  ask(`Explain “${selText}”`, { answerId: findAnswer(selText)?.id || null, circled: 'selected text' });
});
// No pre-built answer: say so, and fall back to a labelled keyword search of the rhythm cards.
function guidedSearch(q, token) {
  builder.cancel(); lib.clear3d();
  $('.gen-tokens').textContent = '0 tokens';
  $('.gen-lines').innerHTML = '<div class="cblock"><div class="cl c-com" data-n="1">// No pre-built answer for this question in the demo.</div><div class="cl c-com" data-n="2">// Guided search: keyword match over the rhythm cards (no model).</div></div>';
  $('.gen-plan').innerHTML = ''; $('.gen-checks').innerHTML = '';
  const pv = $('.gen-preview'); pv.innerHTML = '';
  lib.into(pv); lib.onCreate(() => {});
  const words = q.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const hits = Object.values(RHYTHM_CARDS).map(c => ({ c, n: words.filter(w => (c.name + c.heart + c.ecg + c.clue).toLowerCase().includes(w)).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 2);
  lib.ui.card({ title: 'Guided search', text: 'This concept demo has no pre-built answer for that question, so here are the closest rhythm cards. In production, the chosen model would answer it.', tone: 'note' });
  for (const { c } of hits) lib.ui.card({ title: c.name, text: `${c.heart} ${c.ecg}` });
  if (!hits.length) lib.ui.card({ title: 'Try one of these', text: SUGGESTIONS.join(' · ') });
  $$('.gen-stages li').forEach(li => li.classList.remove('is-on', 'is-done'));
  askText = '';
  room.student.act('look');
}
function closeGen() {
  askToken++; builder.cancel(); askText = '';
  $('.gen-improv').hidden = true; $('.gen-request').hidden = true;
  genEl.hidden = true;
  heart?.setShift(0); lib.clear3d();
  room.student.act('type');
}
$('.gen-x').addEventListener('click', closeGen);
// Escape closes the top layer: a tool pop, then the answer, then the quiz (the lasso handles its own).
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || lasso?.on || !viewIs('student')) return;
  const pop = $('.pop:not([hidden]) .pop-x');
  if (pop) pop.click(); else if (!genEl.hidden) closeGen(); else if (!$('.quiz').hidden) $('.quiz-x').click();
});
$('.ask').addEventListener('submit', e => e.preventDefault());
$('.ask input').addEventListener('keydown', e => { if (e.key === 'Enter') ask(e.target.value); });
$('.ask .ask-send').addEventListener('click', () => ask($('.ask input').value));
for (const s of SUGGESTIONS) {
  const b = document.createElement('button');
  b.textContent = s;
  b.addEventListener('click', () => ask(s));
  $('.ask-sugs').append(b);
}

// 12. Tutor studio: Dr. Tutor builds a lesson live, checks it and publishes it to the student lab.
function viewIs(name) { return !$(`main .view[data-view="${name}"]`).hidden; }
function talk(who, text) {
  sayToken++;
  speaker(who);
  return say(who === 'student' ? room.student : room.doctor, bubble, text, { hold: 1.2 });
}
// The published lesson appears in the student's rail and opens in the answer panel.
function addLessonToRail(lesson) {
  if ($(`button.lvl[data-lesson="${lesson.id}"]`)) return;
  const li = document.createElement('li');
  li.innerHTML = `<button class="lvl lvl-new" data-lesson="${lesson.id}"><span class="lvl-n">★</span><div><b>${lesson.title}</b><small>From Dr. Tutor</small></div></button>`;
  $('button.lvl-quiz').closest('li').before(li);
  li.querySelector('button').addEventListener('click', () => openLesson(lesson));
}
async function openLesson(lesson) {
  const token = ++askToken;
  sayToken++;
  $('.gen-improv').hidden = true; $('.gen-request').hidden = true;
  genEl.hidden = false;
  heart?.setShift(stage.clientWidth > 600 ? 0.31 : 0);
  $('.gen-q').textContent = `${lesson.title} · from Dr. Tutor`;
  const was = $('.gen .gen-speed button.is-on');
  $('.gen .gen-speed button[data-s="skip"]').click();
  spendRole = 'student';
  const ok = await builder.start(lesson, { checks: ['Vetted by tutor', 'Published to Step 1 · Cardiology'] });
  was?.click();
  if (!ok || token !== askToken) return;
  room.student.act('aha', 2.4, 'look');
  setTimeout(() => token === askToken && scene({ say: lesson.say, spot: lesson.spot }), 900);
}
const studio = window.__studio = createStudio({
  heartApi, addTokens, talk, room,
  setLaptop: t => { askText = t; },
  modelName: () => $('.model-name').textContent,
  onPublish: addLessonToRail,
  openAsStudent: () => { showView('student'); setTimeout(() => openLesson(LESSON), 300); },
});

// Welcome screen and guided tour.
function tourReset(view) {
  closeGen();
  if (!$('.quiz').hidden) $('.quiz-x').click();
  $$('.pop:not([hidden]) .pop-x').forEach(x => x.click());
  setCalipers(false);
  if (lasso.on) lasso.toggle(false);
  setMapUI(false);
  studio.reset();
  $('.ask input').value = ''; $('.composer input').value = '';
  showView(view);
  levels.start(0);
  setLayer(0, { quiet: true });
}
const tour = window.__tour = createTour({
  room, store, reset: tourReset,
  askDropped: () => ask('Why did this beat drop?', { answerId: 'mobitz1Drop' }),
});
$('.tour-launch').addEventListener('click', () => tour.start());

// 13. How it works: the animated pipeline, with buttons into the two live demos.
const how = createHow({
  onTutor: () => { showView('tutor'); setTimeout(() => $('.play-demo').click(), 400); },
  onStudent: () => { showView('student'); setTimeout(() => ask(SUGGESTIONS[0]), 600); },
});

// Voice: the device's own speech engine, off by default.
const voiceBtn = $('.voice-btn');
if (!voiceAvailable()) voiceBtn.disabled = true;
voiceBtn.addEventListener('click', () => {
  const on = voiceBtn.getAttribute('aria-pressed') !== 'true';
  voiceBtn.setAttribute('aria-pressed', String(on));
  voiceBtn.querySelector('span').textContent = on ? 'Voice on' : 'Voice off';
  setVoice(on);
  if (on && lastLine) scene(lastLine);
});
document.addEventListener('visibilitychange', () => (document.hidden ? room.pause() : room.resume()));
function onHeartReady() {
  heart.onMarkers(buildSpots);
  heart.onFrame(() => {
    placeSpots();
    const hc = stage.querySelector('canvas.heart-canvas');
    if (hc) for (const fn of mirrorFns) if (!fn(hc)) mirrorFns.delete(fn);
    if (++mirrorTick % 2 === 0) { drawMirror(); room.screenUpdated(); }
  });
  setLayer(0, { quiet: true });
  setTimeout(() => levels.start(0), 700);
  // First visit: say what this is and offer the tour. Automated test browsers go straight in.
  if ((!store.get('welcomed') && !navigator.webdriver) || location.search.includes('welcome')) tour.welcome();
}

// Start (the mode highlight only animates after its first placement)
const saved = store.get('theme');
if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
setModel(MODELS[store.get('model')] ? store.get('model') : 'claude');
showView(['tutor', 'student', 'how'].includes(store.get('view')) ? store.get('view') : 'student');
addEventListener('resize', moveThumb);
document.fonts?.ready.then(() => { moveThumb(); requestAnimationFrame(() => thumb.classList.add('is-ready')); });
