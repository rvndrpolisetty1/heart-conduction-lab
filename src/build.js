// Live build engine: streams an answer's code token by token with syntax colours, runs each block the
// moment its last line lands (so the preview and the 3D heart build as you watch), then compiles,
// checks and finishes. Speed 1×, 3× or Skip. Hovering code lights what it built, and the other way round.
// revise() applies an improvisation as a diff: changed lines go red and out, new lines stream in green,
// and only the pieces those blocks drew are rebuilt, in place.

const TOKEN = /\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\d+(?:\.\d+)?|[A-Za-z_$][\w$]*|\n|[ \t]+|[^\sA-Za-z_$\d]/g;
const KEYWORDS = new Set(['const', 'let', 'return', 'true', 'false', 'null']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const STAGES = ['Plan', 'Write', 'Compile', 'Check', 'Ready'];

function classify(tok, next) {
  if (tok.startsWith('//')) return 'c-com';
  if (tok[0] === "'" || tok[0] === '`') return 'c-str';
  if (/^\d/.test(tok)) return 'c-num';
  if (KEYWORDS.has(tok)) return 'c-key';
  if (/^[A-Za-z_$]/.test(tok)) {
    if (next === '(') return 'c-fn';
    if (next === ':') return 'c-prop';
    if (tok === 'ui' || tok === 'heart') return 'c-obj';
    return 'c-id';
  }
  if (/^[{}()[\]]$/.test(tok)) return 'c-br';
  return 'c-pun';
}

export function createBuilder(root, lib, { onTokens = () => {} } = {}) {
  const $ = s => root.querySelector(s);
  const linesEl = $('.gen-lines'), preview = $('.gen-preview'), stages = [...root.querySelectorAll('.gen-stages li')];
  const planEl = $('.gen-plan'), tokEl = $('.gen-tokens'), checksEl = $('.gen-checks');
  let speed = 1, run = 0, tokens = 0, blocks = [];
  const state = { active: false, phase: '', text: '', answer: null };

  root.querySelectorAll('.gen-speed button').forEach(b => b.addEventListener('click', () => {
    speed = b.dataset.s === 'skip' ? Infinity : Number(b.dataset.s);
    root.querySelectorAll('.gen-speed button').forEach(x => x.classList.toggle('is-on', x === b));
  }));

  function stage(name) {
    state.phase = name;
    const i = STAGES.indexOf(name);
    stages.forEach((li, k) => { li.classList.toggle('is-done', k < i); li.classList.toggle('is-on', k === i); });
  }
  const wait = async (ms, id) => { if (speed !== Infinity) await sleep(ms / Math.min(speed, 3)); return id === run; };

  // Two-way link between code blocks and what they built.
  const link = (b, on) => {
    linesEl.querySelectorAll(`.cblock[data-b="${b}"]`).forEach(x => x.classList.toggle('is-linked', on));
    preview.querySelectorAll(`[data-b="${b}"]`).forEach(x => x.classList.toggle('is-linked', on));
  };
  linesEl.addEventListener('mouseover', e => { const c = e.target.closest('.cblock'); if (c) link(c.dataset.b, true); });
  linesEl.addEventListener('mouseout', e => { const c = e.target.closest('.cblock'); if (c) link(c.dataset.b, false); });
  preview.addEventListener('mouseover', e => {
    const c = e.target.closest('[data-b]'); if (!c) return;
    link(c.dataset.b, true);
    linesEl.querySelector(`.cblock[data-b="${c.dataset.b}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  preview.addEventListener('mouseout', e => { const c = e.target.closest('[data-b]'); if (c) link(c.dataset.b, false); });

  const caret = document.createElement('span'); caret.className = 'caret';
  const renumber = () => linesEl.querySelectorAll('.cl').forEach((l, i) => { l.dataset.n = i + 1; });
  const plainText = () => [...linesEl.querySelectorAll('.cblock')].map(b => [...b.querySelectorAll('.cl:not(.del)')].map(l => l.textContent).join('\n')).join('\n\n');

  // Stream one block's code into `block`, a few tokens at a time. Lines get `cls` (e.g. 'add').
  async function stream(block, code, id, cls = '') {
    const newLine = () => { const l = document.createElement('div'); l.className = 'cl' + (cls ? ' ' + cls : ''); block.append(l); renumber(); return l; };
    let line = newLine();
    const toks = code.match(TOKEN) || [];
    let budget = 0, last = performance.now();
    for (let i = 0; i < toks.length; i++) {
      if (id !== run) return false;
      const tk = toks[i];
      if (tk === '\n') { line = newLine(); state.text = plainText(); continue; }
      const span = document.createElement('span');
      span.className = /^\s+$/.test(tk) ? '' : classify(tk, toks.slice(i + 1).find(t => !/^\s+$/.test(t)));
      span.textContent = tk;
      line.append(span, caret);
      if (!/^\s+$/.test(tk)) { tokens++; onTokens(1); }
      // About 40 tokens a second at 1×, in small bursts like a real stream.
      if (speed !== Infinity) {
        budget -= 1;
        if (budget < 0) {
          await sleep(Math.max(0, 25 - (performance.now() - last)) + Math.random() * 20);
          last = performance.now();
          budget += speed * 40 * 0.035 * (0.6 + Math.random() * 0.8);
          tokEl.textContent = `${tokens} tokens`;
          state.text = plainText();
          line.scrollIntoView({ block: 'nearest' });
        }
      }
    }
    tokEl.textContent = `${tokens} tokens`;
    state.text = plainText();
    return true;
  }
  // Run one block against the library, tagging what it draws with the block number.
  function exec(code, b) {
    lib.onCreate(el => { el.dataset.b = b; });
    try { new Function('ui', 'heart', code)(lib.ui, lib.heart); }
    catch (err) { console.error(err); }
  }
  async function finishStages(id, checks) {
    caret.remove();
    stage('Compile');
    if (!(await wait(500, id))) return false;
    stage('Check');
    checksEl.innerHTML = '';
    for (const c of checks) {
      const el = document.createElement('span');
      el.innerHTML = `<i>✓</i>${c}`;
      checksEl.append(el);
      requestAnimationFrame(() => el.classList.add('is-in'));
      if (!(await wait(330, id))) return false;
    }
    stage('Ready');
    root.classList.remove('is-building');
    return true;
  }
  async function chips(list, id) {
    planEl.innerHTML = '';
    for (const p of list) {
      const chip = document.createElement('span');
      chip.textContent = p; planEl.append(chip);
      requestAnimationFrame(() => chip.classList.add('is-in'));
      if (!(await wait(260, id))) return false;
    }
    return true;
  }

  async function start(answer, { checks = ['Facts match the fact table', 'Every component rendered', 'Readable on a phone'], skipChecks = false } = {}) {
    const id = ++run;
    state.active = true; state.text = ''; state.answer = answer;
    blocks = answer.blocks.slice();
    tokens = 0; tokEl.textContent = '0 tokens';
    linesEl.innerHTML = ''; preview.innerHTML = ''; checksEl.innerHTML = '';
    root.querySelector('.gen-diff')?.remove();
    lib.clear3d();
    lib.into(preview);
    root.classList.add('is-building');
    stage('Plan');
    if (!(await chips(answer.plan, id))) return;
    stage('Write');
    for (let b = 0; b < blocks.length; b++) {
      const block = document.createElement('div');
      block.className = 'cblock'; block.dataset.b = b;
      linesEl.append(block);
      if (!(await stream(block, blocks[b], id))) return;
      exec(blocks[b], b);              // complete: run it, so what it describes appears now
      block.classList.add('is-done');
      if (!(await wait(220, id))) return;
    }
    if (skipChecks) { caret.remove(); stage('Compile'); if (!(await wait(400, id))) return false; return id; }
    return finishStages(id, checks);
  }
  // For callers that run their own checks: finish the stage bar.
  function done() { stage('Ready'); root.classList.remove('is-building'); }

  // Apply an improvisation: replace some blocks and/or append new ones, shown as a diff.
  async function revise(variant) {
    const id = ++run;
    root.classList.add('is-building');
    const next = blocks.slice();
    for (const [k, code] of Object.entries(variant.replace || {})) next[Number(k)] = code;
    for (const code of variant.append || []) next.push(code);
    const changed = next.map((c, i) => c !== blocks[i]);
    const count = s => s.split('\n').length;
    const added = next.reduce((n, c, i) => n + (changed[i] ? count(c) : 0), 0);
    const removed = blocks.reduce((n, c, i) => n + (changed[i] ? count(c) : 0), 0);
    let diff = root.querySelector('.gen-diff');
    if (!diff) { diff = document.createElement('span'); diff.className = 'gen-diff'; tokEl.before(diff); }
    diff.innerHTML = `<b>+${added}</b> <s>−${removed}</s>`;
    stage('Plan');
    if (!(await chips([`revise: ${variant.label.toLowerCase()}`, ...next.map((c, i) => (changed[i] ? `block ${i + 1}` : null)).filter(Boolean)], id))) return;
    stage('Write');
    for (let b = 0; b < next.length; b++) {
      if (!changed[b]) continue;
      let block = linesEl.querySelector(`.cblock[data-b="${b}"]`);
      if (block) {
        // Old lines go red and strike through, then leave.
        block.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        block.querySelectorAll('.cl').forEach(l => l.classList.add('del'));
        state.text = plainText();
        if (!(await wait(800, id))) return;
        block.querySelectorAll('.cl.del').forEach(l => l.remove());
        preview.querySelectorAll(`[data-b="${b}"]`).forEach(el => { el.classList.add('is-out'); setTimeout(() => el.remove(), 350); });
      } else {
        block = document.createElement('div');
        block.className = 'cblock'; block.dataset.b = b;
        linesEl.append(block);
      }
      block.classList.add('is-changed');
      if (!(await stream(block, next[b], id, 'add'))) return;
      // Rebuild just this piece, in its place.
      const ref = [...preview.querySelectorAll('[data-b]')].find(el => Number(el.dataset.b) > b && !el.classList.contains('is-out')) || null;
      lib.into(preview, ref);
      exec(next[b], b);
      lib.into(preview);
      if (!(await wait(250, id))) return;
    }
    blocks = next;
    return finishStages(id, ['Facts unchanged', 'Changed parts rebuilt', 'Rest of the answer kept']);
  }

  return {
    start, revise, done, stage,
    alive: id => id === run,
    cancel() { run++; state.active = false; root.classList.remove('is-building'); },
    state,
    get tokens() { return tokens; },
  };
}
