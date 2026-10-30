// Tutor studio: Dr. Tutor asks for a lesson, approves the objectives, watches the whole lesson build
// live from code, sees the checks pass, and publishes it to the student lab. Then a quick question is
// answered with an inline visual. Concept demo: every response is pre-built.

import { createLibrary } from './library.js';
import { createBuilder } from './build.js';
import { REQUEST, OBJECTIVES, OBJECTIVE_EDIT, CHECKS, LESSON, QUICK } from './lesson.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ctx: { heartApi, addTokens, talk(who, text), room, setLaptop(text), modelName(), onPublish(lesson), openAsStudent() }
export function createStudio(ctx) {
  const root = document.querySelector('.view-tutor');
  const $ = s => root.querySelector(s);
  const chat = $('.chat'), input = $('.composer input'), studio = $('.studio');
  const trace = [...root.querySelectorAll('.trace li')];
  const lib = createLibrary({ heart: ctx.heartApi });
  const builder = createBuilder(studio, lib, { onTokens: n => ctx.addTokens(n, 'tutor') });
  let run = 0, built = false, published = false, objectives = OBJECTIVES.slice();
  const hello = $('.chat-hello').outerHTML;

  const alive = id => id === run;
  function setTrace(i) {
    trace.forEach((li, k) => {
      li.classList.toggle('is-done', k < i);
      li.classList.toggle('is-on', k === i);
      li.querySelector('span').innerHTML = k < i ? '<svg><use href="#i-check"/></svg>' : String(k + 1);
    });
  }
  function msg(kind, html) {
    const el = document.createElement('div');
    el.className = `msg msg-${kind}`;
    el.innerHTML = kind === 'ai' ? `<span class="msg-who"><svg><use href="#i-spark"/></svg><b class="gen-model">${esc(ctx.modelName())}</b></span>${html}` : html;
    chat.append(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }
  async function typeInto(set, text, cps, id) {
    for (let i = 1; i <= text.length; i++) { if (!alive(id)) return false; set(text.slice(0, i)); await sleep(1000 / cps); }
    return true;
  }
  async function streamText(el, text, id) {
    for (let i = 1; i <= text.length; i += 2) { if (!alive(id)) return false; el.textContent = text.slice(0, i); chat.scrollTop = chat.scrollHeight; await sleep(16); }
    el.textContent = text;
    return true;
  }

  function reset() {
    run++;
    builder.cancel();
    chat.innerHTML = hello;
    setTrace(-1);
    trace.forEach(li => li.classList.remove('is-on', 'is-done'));
    studio.querySelector('.gen-lines').innerHTML = '';
    studio.querySelector('.studio-preview').innerHTML = '';
    studio.querySelector('.gen-plan').innerHTML = '';
    studio.querySelector('.gen-tokens').textContent = '0 tokens';
    studio.querySelectorAll('.gen-stages li').forEach(li => li.classList.remove('is-on', 'is-done'));
    $('.studio-checks').hidden = true; $('.studio-checks').innerHTML = '';
    $('.studio-foot').hidden = true; $('.studio-badge').hidden = true;
    const pub = $('.studio-publish'); pub.disabled = false; pub.textContent = 'Approve and publish'; pub.classList.remove('is-done');
    built = false; published = false; objectives = OBJECTIVES.slice();
    ctx.setLaptop('');
  }

  // 1 → 5: the full flow. `auto` plays Dr. Tutor's clicks; otherwise the tutor clicks.
  async function lesson(request = REQUEST, { auto = false } = {}) {
    reset();
    const id = run;
    setTrace(0);
    ctx.room.setShot('shoulder'); ctx.room.doctor.act('pointScreen'); ctx.room.student.act('look');
    if (auto) {
      ctx.talk('doctor', "Let's build my Step 1 class a lesson on Mobitz I versus Mobitz II.");
      if (!(await typeInto(t => { input.value = t; ctx.setLaptop(t); }, request, 34, id))) return;
      await sleep(300);
    }
    input.value = '';
    msg('user', esc(request));
    ctx.setLaptop(request);
    if (!(await objectivesStep(id, auto))) return;
    await generate(id);
    if (!alive(id)) return;
    await checks(id);
    if (!alive(id)) return;
    await review(id, auto);
  }

  async function objectivesStep(id, auto) {
    setTrace(1);
    const m = msg('ai', '<p class="obj-intro"></p><ul class="objectives"></ul>');
    ctx.room.doctor.act('explain');
    if (!(await streamText(m.querySelector('.obj-intro'), 'Here are three learning objectives for your class. Edit any of them, then approve and I will build the interactive.', id))) return false;
    const ul = m.querySelector('.objectives');
    const items = OBJECTIVES.map(o => {
      const li = document.createElement('li');
      li.className = 'is-pending';
      li.innerHTML = `<label><input type="checkbox" checked><span class="obj-text" contenteditable="true" spellcheck="false">${esc(o)}</span></label>`;
      ul.append(li);
      return li;
    });
    for (const li of items) { await sleep(280); if (!alive(id)) return false; li.classList.remove('is-pending'); chat.scrollTop = chat.scrollHeight; }
    const approve = document.createElement('button');
    approve.className = 'btn'; approve.textContent = 'Approve and build';
    m.append(approve);
    chat.scrollTop = chat.scrollHeight;
    const go = new Promise(res => approve.addEventListener('click', res, { once: true }));
    if (auto) {
      // Dr. Tutor edits the third objective, then approves.
      await sleep(900);
      const t = items[OBJECTIVE_EDIT.index].querySelector('.obj-text');
      t.classList.add('is-edited');
      ctx.talk('doctor', 'I want them to name the rhythm too.');
      const base = t.textContent;
      if (!(await typeInto(s => { t.textContent = base + s; }, OBJECTIVE_EDIT.append, 26, id))) return false;
      await sleep(700);
      approve.click();
    }
    await go;
    if (!alive(id)) return false;
    objectives = items.map(li => li.querySelector('.obj-text').textContent.trim());
    approve.disabled = true; approve.textContent = 'Approved';
    items.forEach(li => { li.querySelector('.obj-text').contentEditable = 'false'; });
    msg('user', 'Approved.');
    return true;
  }

  async function generate(id) {
    setTrace(2);
    const m = msg('ai', '<div class="msg-status"><span class="dot"></span><span class="st">Building the lesson…</span></div>');
    ctx.room.doctor.act('pointScreen'); ctx.room.student.act('look');
    const tick = setInterval(() => { m.querySelector('.st').textContent = `Building the lesson… ${builder.tokens} tokens`; }, 200);
    // The header carries the approved objectives (including Dr. Tutor's edit).
    const lessonNow = { ...LESSON, blocks: LESSON.blocks.slice() };
    lessonNow.blocks[0] = lessonNow.blocks[0].replace(/objectives: \[[\s\S]*?\],/, `objectives: [\n${objectives.map(o => `    '${o.replace(/'/g, "\\'")}',`).join('\n')}\n  ],`);
    const ok = await builder.start(lessonNow, { skipChecks: true });
    clearInterval(tick);
    if (!ok || !alive(id)) return;
    m.querySelector('.st').textContent = `Built ${lessonNow.blocks.length} parts from ${builder.tokens} tokens.`;
    m.querySelector('.dot').style.animation = 'none';
    built = true;
  }

  async function checks(id) {
    setTrace(3);
    builder.stage('Check');
    const box = $('.studio-checks');
    box.hidden = false;
    box.innerHTML = '<p class="sim">Automated checks · simulated in this concept demo</p>';
    for (const c of CHECKS) {
      const el = document.createElement('div');
      el.className = 'chk';
      el.innerHTML = `<i></i><b>${esc(c.name)}</b><span>${esc(c.proof)}</span>`;
      box.append(el);
      await sleep(650);
      if (!alive(id)) return;
      el.classList.add('is-ok');
      ctx.room.doctor.act('nod', 0.6, 'idle');
    }
    builder.done();
  }

  async function review(id, auto) {
    $('.studio-foot').hidden = false;
    msg('ai', 'Ready for your review. Preview it as a student, or approve and publish it to your course.');
    await ctx.talk('doctor', 'Looks right. The block sites, the PR patterns, and a question to finish.');
    if (!alive(id)) return;
    if (auto) { await sleep(500); if (alive(id) && !published) publish(); }
  }

  function publish() {
    if (!built || published) return;
    published = true;
    setTrace(5);
    const pub = $('.studio-publish');
    pub.textContent = 'Published'; pub.disabled = true; pub.classList.add('is-done');
    $('.studio-badge').hidden = false;
    ctx.room.doctor.act('thumbs', 2, 'idle'); ctx.room.student.act('celebrate', 2, 'look');
    const m = msg('ai', 'Published to <b>Step 1 · Cardiology</b>. Students see it in their lab now, marked as new.');
    const open = document.createElement('button');
    open.className = 'btn ghost'; open.textContent = 'Open as a student';
    open.addEventListener('click', () => ctx.openAsStudent());
    m.append(document.createElement('br'), open);
    ctx.onPublish(LESSON);
    ctx.talk('doctor', 'Published. My students will see it in their lab.');
    suggest();
  }

  function suggest() {
    chat.querySelector('.chat-sugs')?.remove();
    const s = document.createElement('div');
    s.className = 'chat-sugs';
    const b = document.createElement('button');
    b.textContent = QUICK.ask;
    b.addEventListener('click', () => { s.remove(); quick(); });
    s.append(b);
    chat.append(s);
    chat.scrollTop = chat.scrollHeight;
  }

  // A quick question answered with a visual, right in the chat.
  async function quick(text = QUICK.ask) {
    const id = run;
    chat.querySelector('.chat-sugs')?.remove();
    msg('user', esc(text));
    ctx.room.doctor.act('pointScreen');
    const m = msg('ai', '<div class="msg-status"><span class="dot"></span><span class="st">Drawing it…</span></div>');
    await sleep(900);
    if (!alive(id)) return;
    m.querySelector('.msg-status').remove();
    m.insertAdjacentHTML('beforeend', `<p>${esc(QUICK.reply)}</p><div class="msg-visual"></div>`);
    lib.into(m.querySelector('.msg-visual'));
    lib.onCreate(() => {});
    for (const code of QUICK.blocks) { new Function('ui', 'heart', code)(lib.ui, lib.heart); ctx.addTokens(38, 'tutor'); }
    lib.into(studio.querySelector('.studio-preview'));
    chat.scrollTop = chat.scrollHeight;
    setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 500);
    ctx.room.doctor.act('nod', 1.2, 'idle');
  }

  // The tutor's own typing.
  function send() {
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    if (/\b(picture|visual|diagram|draw|difference)\b/i.test(t) && built) return quick(t);
    if (/\b(mobitz|lesson|build|interactive|block)\b/i.test(t)) return lesson(t);
    msg('user', esc(t));
    msg('ai', 'In this concept demo I can build the <b>Mobitz I vs Mobitz II</b> lesson, or show a difference in one picture once it is built. In production, the chosen model would take any request.');
  }
  $('.composer .ask-send').addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  $('.play-demo').addEventListener('click', () => lesson(REQUEST, { auto: true }));
  $('.studio-publish').addEventListener('click', publish);
  $('.studio-as-student').addEventListener('click', () => ctx.openAsStudent());

  return { lesson, quick, reset, builder, get published() { return published; }, codeText: () => builder.state.text };
}
