// Levels: tasks with checks, tiered hints, worked solutions, rhythm cards, toolbox panels and the quiz.
// Dr. Tutor and the Student react to hints, right answers and wrong answers.

import { LEVELS, RHYTHM_CARDS, FORMULAS, QUIZ } from './content.js';
import { createEngine, RHYTHMS } from './timing.js';
import { voltage } from './ecg.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ctx: { engine, ecg, room, scene, selectRhythm, setLayer, goStep, calipers: { open, isOpen }, store }
export function createLevels(ctx) {
  const done = new Set(JSON.parse(ctx.store.get('done') || '[]'));
  let level = 0, hintN = 0, tries = 0, solved = false, picked = new Set();

  // ---------- Rail ----------
  function paintRail() {
    $$('button.lvl[data-level]').forEach(b => {
      const n = b.dataset.level;
      if (n === 'quiz') { b.classList.toggle('is-current', !$('.quiz').hidden); return; }
      const i = Number(n);
      b.classList.toggle('is-current', i === level && $('.quiz').hidden);
      b.classList.toggle('is-done', done.has(i));
      b.classList.toggle('is-open', i === 0 || done.has(i - 1) || done.has(i));
      b.title = b.classList.contains('is-open') ? '' : `Preview: finish level ${i} to unlock properly`;
    });
    $('.done-count').textContent = done.size;
  }
  $$('button.lvl[data-level]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.level === 'quiz') openQuiz(); else { closeQuiz(); start(Number(b.dataset.level)); }
  }));

  // ---------- Rhythm card ----------
  let cardKey = 'heart';
  function paintCard() {
    const card = RHYTHM_CARDS[LEVELS[level].rhythm];
    $('.rcard-text').textContent = card[cardKey];
    $$('.rcard-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.k === cardKey)));
  }
  $$('.rcard-tabs button').forEach(b => b.addEventListener('click', () => { cardKey = b.dataset.k; paintCard(); }));

  // ---------- Starting a level ----------
  function start(i, { quiet = false } = {}) {
    level = i; hintN = 0; tries = 0; solved = false; picked = new Set();
    const L = LEVELS[i], card = RHYTHM_CARDS[L.rhythm];
    $('.level-eyebrow').textContent = `Level ${i + 1} · ${card.name}`;
    $('.level-title').textContent = L.title;
    $('.level-intro').textContent = L.intro;
    $('.steps-bar').hidden = L.kind !== 'steps';
    $('.step-card').hidden = L.kind !== 'steps';
    $('.task-card').hidden = L.kind === 'steps';
    cardKey = 'heart'; paintCard();
    paintHint();
    if (ctx.calipers.isOpen()) ctx.calipers.open(false);
    ctx.selectRhythm(L.rhythm);
    if (L.kind === 'steps') { $('.panel').scrollTop = 0; ctx.goStep(0); paintRail(); return; }
    ctx.setLayer(L.layer ?? 0, { quiet: true });
    $('.chip').click();          // back to "All"
    $('.panel').scrollTop = 0;
    buildTask(L);
    paintRail();
    if (!quiet) ctx.scene({ say: `Level ${i + 1}: ${card.name}. ${L.intro} ${L.task}`, spot: { first: 'av', mobitz1: 'av', mobitz2: null, third: 'av', af: 'atria' }[L.rhythm] });
  }

  // ---------- Task card ----------
  function buildTask(L) {
    $('.task-q').textContent = L.task;
    const body = $('.task-body');
    body.innerHTML = '';
    $('.feedback').hidden = true;
    $('.solution').hidden = true;
    $('.sol-btn').disabled = true;
    $('.check-btn').hidden = !['calipers', 'choice', 'multi'].includes(L.kind);
    if (L.kind === 'calipers') {
      body.innerHTML = '<div class="task-live"><span class="dot"></span><span class="cal-read">Calipers closed</span></div>';
      const open = document.createElement('button');
      open.className = 'opt'; open.innerHTML = '<i></i>Open the calipers';
      open.addEventListener('click', () => ctx.calipers.open(true));
      body.append(open);
    }
    if (L.kind === 'ecgClick') body.innerHTML = '<div class="task-live"><span class="dot"></span>Click a P wave on the ECG strip below</div>';
    if (L.kind === 'spot') body.innerHTML = '<div class="task-live"><span class="dot"></span>Click a label on the 3D heart</div>';
    if (L.kind === 'choice' || L.kind === 'multi') {
      L.options.forEach((o, k) => {
        const b = document.createElement('button');
        b.className = 'opt' + (L.kind === 'multi' ? ' multi' : '');
        b.setAttribute('aria-pressed', 'false');
        b.innerHTML = `<i></i>${esc(o.text)}`;
        b.addEventListener('click', () => {
          if (solved) return;
          if (L.kind === 'choice') { picked = new Set([k]); $$('.opt', body).forEach((x, j) => x.setAttribute('aria-pressed', String(j === k))); }
          else { picked.has(k) ? picked.delete(k) : picked.add(k); b.setAttribute('aria-pressed', String(picked.has(k))); }
        });
        body.append(b);
      });
    }
  }
  // Live caliper reading on level 2.
  (function calLoop() {
    const el = $('.cal-read');
    if (el) {
      const c = ctx.ecg.calipers;
      el.textContent = c ? `Measured: ${Math.round(Math.abs(c.b - c.a))} ms (${(Math.abs(c.b - c.a) / 40).toFixed(1)} small boxes)` : 'Calipers closed';
    }
    requestAnimationFrame(calLoop);
  })();

  // ---------- Checking ----------
  function verdict(ok, title, text, { spot } = {}) {
    tries++;
    const fb = $('.feedback');
    fb.hidden = false;
    fb.className = 'feedback ' + (ok ? 'ok' : 'no');
    fb.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
    $('.sol-btn').disabled = false;
    $('.sol-btn').title = '';
    const room = ctx.room;
    if (ok) {
      solved = true;
      done.add(level); ctx.store.set('done', JSON.stringify([...done]));
      paintRail();
      room.student.act('celebrate', 2.2, 'type'); room.doctor.act('thumbs', 2.2, 'idle');
      ctx.scene({ say: text + (level < LEVELS.length - 1 ? ' On to the next level when you are ready.' : ' That was the last level. Try the quiz!'), spot });
    } else {
      room.student.act('puzzled', 2.2, 'type');
      ctx.scene({ say: text, spot });
    }
  }
  $('.check-btn').addEventListener('click', () => {
    const L = LEVELS[level];
    if (solved) return;
    if (L.kind === 'calipers') {
      const c = ctx.ecg.calipers;
      if (!c) return verdict(false, 'Open the calipers first', 'Click Calipers in the toolbox, or the button above, then measure the PR.');
      const ms = Math.round(Math.abs(c.b - c.a));
      if (ms >= L.target[0] && ms <= L.target[1]) return verdict(true, `Right: ${ms} ms`, `That's ${ms} ms, over 200 ms, and it is the same every beat. Every P still conducts, so this is first-degree block.`, { spot: 'av' });
      return verdict(false, `${ms} ms is not the PR here`, ms < L.target[0]
        ? `That's ${ms} ms. Put one handle at the start of the P wave and the other at the start of the QRS.`
        : `That's ${ms} ms, longer than the PR. You may have gone past the start of the QRS.`);
    }
    if (L.kind === 'choice') {
      if (!picked.size) return verdict(false, 'Pick an answer first', 'Choose one of the options, then press Check.');
      const k = [...picked][0], o = L.options[k];
      $$('.opt', $('.task-body')).forEach((x, j) => x.classList.toggle(o.correct ? 'is-right' : 'is-wrong', j === k));
      return verdict(!!o.correct, o.correct ? 'Right' : 'Not quite', o.why, { spot: o.correct ? 'ventricles' : 'av' });
    }
    if (L.kind === 'multi') {
      const want = new Set(L.options.map((o, k) => (o.correct ? k : -1)).filter(k => k >= 0));
      const ok = picked.size === want.size && [...picked].every(k => want.has(k));
      $$('.opt', $('.task-body')).forEach((x, j) => { x.classList.remove('is-right', 'is-wrong'); if (picked.has(j)) x.classList.add(want.has(j) ? 'is-right' : 'is-wrong'); });
      if (!picked.size) return verdict(false, 'Pick two answers first', 'Choose the two features, then press Check.');
      return verdict(ok, ok ? 'Right' : 'Not quite', ok ? L.why : `You need exactly the two features that define AF. ${L.why}`, { spot: 'atria' });
    }
  });
  // ECG clicks (level 3).
  ctx.ecg.onClick(seg => {
    const L = LEVELS[level];
    if (L.kind !== 'ecgClick' || solved || !$('.quiz').hidden) return;
    if (!seg) return;
    if (seg.kind === 'P' && !seg.beat.conducted) { ctx.ecg.flashColor('#16a36a'); return verdict(true, 'Found it', 'That P wave has no QRS after it. The PR grew 160, 240, 300 ms, then the AV node dropped this beat: Mobitz I.', { spot: 'av' }); }
    ctx.ecg.flashColor('#e0453a');
    if (seg.kind === 'P') return verdict(false, 'That P was conducted', `A QRS follows this one (PR ${seg.beat.pr} ms). Look for a P wave with nothing after it.`);
    return verdict(false, `That's a ${seg.kind === 'PR' ? 'PR segment' : seg.kind + (seg.kind === 'T' ? ' wave' : '')}`, 'Click a P wave: the small bump before the QRS. One of them has no QRS after it.');
  });
  // Hotspot clicks (level 4). Returns true when the click was used by the task.
  function onSpot(id) {
    const L = LEVELS[level];
    if (L.kind !== 'spot' || solved) return false;
    if (id === L.answer) verdict(true, 'Right: the bundle of His', L.solution, { spot: 'his' });
    else verdict(false, 'Not there', L.wrong[id] || L.wrong.default, { spot: id });
    return true;
  }

  // ---------- Hints and solution ----------
  function paintHint() {
    const b = $('.hint-btn');
    b.querySelector('small').textContent = hintN < 3 ? `${hintN + 1} of 3` : 'all used';
    b.classList.toggle('is-used', hintN > 0);
  }
  $('.hint-btn').addEventListener('click', () => {
    const L = LEVELS[level];
    const h = L.hints[Math.min(hintN, 2)];
    hintN = Math.min(3, hintN + 1);
    paintHint();
    ctx.room.student.act('think', 2, 'type');
    ctx.scene({ say: `Hint ${Math.min(hintN, 3)}: ${h}`, spot: level === 3 && hintN === 3 ? 'his' : undefined });
  });
  $('.sol-btn').addEventListener('click', () => {
    const L = LEVELS[level];
    $('.solution').hidden = false;
    $('.solution p').textContent = L.solution;
    ctx.scene({ say: L.solution });
  });
  // Level 1 is done when the last step is confirmed.
  $('.step-card .confirm input').addEventListener('change', e => {
    if (e.target.checked && level === 0 && /6 of 6/.test($('.step-card .step-n').textContent)) { done.add(0); ctx.store.set('done', JSON.stringify([...done])); paintRail(); }
  });

  // ---------- Toolbox: Formulas and Theory ----------
  function togglePop(name, on) {
    const pop = $(`.pop-${name}`), btn = $(`.tool[aria-label="${name === 'formulas' ? 'Formulas' : 'Theory'}"]`);
    const show = on ?? pop.hidden;
    $$('.pop').forEach(p => { p.hidden = true; });
    $$('.tool').forEach(t => t.classList.remove('is-open'));
    if (!show) return;
    if (name === 'formulas') {
      $('.pop-formulas .pop-body').innerHTML = FORMULAS.map(f => `<div class="pop-row"><small>${esc(f.name)}</small><code>${esc(f.f)}</code><span>${esc(f.note)}</span></div>`).join('')
        + '<p class="pop-note">Paper speed 25 mm/s: small box 40 ms, large box 200 ms.</p>';
    } else {
      const r = RHYTHM_CARDS[ctx.engine.rhythm];
      $('.pop-theory .pop-body').innerHTML = `<div class="pop-row"><small>Now showing</small><code>${esc(r.name)}</code><span>${esc(r.heart)}</span></div>
        <table class="pop-table"><tbody>
        <tr><td>P wave</td><td>Atrial depolarisation</td></tr><tr><td>PR segment</td><td>Delay at the AV node</td></tr>
        <tr><td>QRS</td><td>Ventricular depolarisation</td></tr><tr><td>T wave</td><td>Ventricular repolarisation</td></tr>
        <tr><td>First-degree</td><td>PR over 200 ms, constant; every P conducts</td></tr>
        <tr><td>Mobitz I</td><td>PR lengthens, then a QRS drops; usually AV node, usually benign</td></tr>
        <tr><td>Mobitz II</td><td>PR constant, sudden dropped QRS; below the AV node; pacemaker usually needed</td></tr>
        <tr><td>Third-degree</td><td>P and QRS independent; slow escape rhythm</td></tr>
        <tr><td>AF</td><td>No clear P waves; irregularly irregular; wavy baseline</td></tr></tbody></table>`;
    }
    pop.hidden = false; btn.classList.add('is-open');
    ctx.room.doctor.act('explain', 1.6, 'idle');
  }
  $('.tool[aria-label="Formulas"]').addEventListener('click', () => togglePop('formulas'));
  $('.tool[aria-label="Theory"]').addEventListener('click', () => togglePop('theory'));
  $$('.pop .pop-x').forEach(x => x.addEventListener('click', () => togglePop('formulas', false)));

  // ---------- Quiz: three unlabelled animated strips ----------
  let quizRaf = 0, quizScore = 0;
  function openQuiz() {
    const quiz = $('.quiz');
    quiz.hidden = false; paintRail();
    quizScore = 0; $('.quiz-score').textContent = `0 / ${QUIZ.length}`;
    const list = $('.quiz-list'); list.innerHTML = '';
    const strips = QUIZ.map((rhythm, n) => {
      const item = document.createElement('div');
      item.className = 'qitem';
      item.innerHTML = `<b>${n + 1}</b><canvas></canvas><div class="qopts"></div><p class="qwhy"></p>`;
      list.append(item);
      const e = createEngine(); e.setRhythm(rhythm); e.advance(9000 + n * 777);
      for (const id of Object.keys(RHYTHMS)) {
        const b = document.createElement('button');
        b.textContent = RHYTHM_CARDS[id].name.replace(' (Wenckebach)', '').replace(' (complete)', '');
        b.addEventListener('click', () => {
          const ok = id === rhythm;
          b.classList.add(ok ? 'is-right' : 'is-wrong');
          if (ok) {
            $$('button', item.querySelector('.qopts')).forEach(x => { x.disabled = true; });
            quizScore++; $('.quiz-score').textContent = `${quizScore} / ${QUIZ.length}`;
            item.querySelector('.qwhy').textContent = `Right: ${RHYTHM_CARDS[rhythm].name}. ${RHYTHM_CARDS[rhythm].clue}`;
            ctx.room.student.act(quizScore === QUIZ.length ? 'celebrate' : 'aha', 2.2, 'type');
            if (quizScore === QUIZ.length) ctx.scene({ say: 'Three out of three. You can read heart blocks and AF from the strip alone.' });
          } else {
            item.querySelector('.qwhy').textContent = `Not ${RHYTHM_CARDS[id].name}: ${RHYTHM_CARDS[id].clue.replace(/\.$/, '')} isn't what this strip shows. Look again.`;
            ctx.room.student.act('puzzled', 1.8, 'type');
          }
        });
        item.querySelector('.qopts').append(b);
      }
      return { canvas: item.querySelector('canvas'), e };
    });
    ctx.scene({ say: 'Quiz time. Three strips with no labels. Name each rhythm.' });
    let last = performance.now();
    cancelAnimationFrame(quizRaf);
    const css = getComputedStyle(document.documentElement);
    const draw = now => {
      const dt = Math.min(50, now - last); last = now;
      for (const s of strips) {
        s.e.advance(dt);
        const c = s.canvas, dpr = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
        if (!w) continue;
        if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = css.getPropertyValue('--paper'); g.fillRect(0, 0, w, h);
        const box = 4, now2 = s.e.time, by = h * 0.66;
        for (let x = w - ((now2 / 40) % 1) * box, k = 0; x > 0; x -= box, k++) {
          g.strokeStyle = css.getPropertyValue(k % 5 ? '--paper-minor' : '--paper-major'); g.lineWidth = k % 5 ? 0.5 : 0.9;
          g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
        }
        g.strokeStyle = css.getPropertyValue('--trace'); g.lineWidth = 1.6; g.beginPath();
        const beats = s.e.beats();
        for (let x = 0; x <= w; x += 1) {
          const t = now2 - (w - x) * (40 / box);
          const y = by - voltage(t, beats, s.e.rhythm, s.e.rate) / 0.1 * box;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
      quizRaf = requestAnimationFrame(draw);
    };
    quizRaf = requestAnimationFrame(draw);
  }
  function closeQuiz() { $('.quiz').hidden = true; cancelAnimationFrame(quizRaf); paintRail(); }
  $('.quiz-x').addEventListener('click', closeQuiz);

  paintRail();
  return { start, onSpot, get level() { return level; }, openQuiz };
}
