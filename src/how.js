// How it works: a glowing packet travels the pipeline from the tutor's request to the student. Each
// stage lights up as it arrives and the caption explains it. Hover or click a stage to hold on it.

const STAGES = [
  { title: 'The tutor asks', text: 'In plain English, inside the AI workspace: "Build an interactive for my Step 1 class: Mobitz I vs Mobitz II."',
    demo: 'The request is pre-built; you can still type your own.', prod: 'Any request, typed or spoken.' },
  { title: 'A model writes it as code', text: 'Claude, Gemini or ChatGPT turns the approved objectives into a short program against the component library, streamed live.',
    demo: 'Pre-recorded code, replayed at typing speed.', prod: 'A live call to the chosen model, streamed token by token.' },
  { title: 'Tested components draw it', text: 'The code only calls fixed, tested pieces: the 3D heart, ECG strips, ladder diagrams, step cards, quizzes. That keeps every lesson polished and safe.',
    demo: 'Real: the code on screen is what draws the lesson.', prod: 'The same library, growing over time.' },
  { title: 'Automated checks', text: 'Facts against the fact table, every step solvable, controls at their limits, readable on a phone.',
    demo: 'Simulated, and labelled as such.', prod: 'An agent actually plays the lesson in a browser before the tutor sees it.' },
  { title: 'The tutor approves', text: 'The tutor previews it as a student, edits anything, then publishes it to the course. Nothing reaches students unreviewed.',
    demo: 'Real buttons: approve, preview, publish.', prod: 'The same, with version history and a physician sign-off step.' },
  { title: 'Students learn, and ask', text: 'Levels, hints and quizzes. When a student circles something or types a doubt, a new panel is built for them on the spot.',
    demo: 'Eight pre-built answers; anything else gets a labelled keyword search.', prod: 'Live answers, within a token budget per student.' },
];

export function createHow({ onTutor, onStudent }) {
  const root = document.querySelector('.view-how');
  const $ = s => root.querySelector(s);
  const svg = $('.flow-lines'), path = $('.flow-path'), lit = $('.flow-lit'), packet = $('.flow-packet');
  const nodes = [...root.querySelectorAll('.flow-nodes li')];
  $('.flow-table tbody').innerHTML = STAGES.map((s, i) => `<tr data-i="${i}"><td><b>${String(i + 1).padStart(2, '0')}</b> ${s.title}</td><td>${s.demo}</td><td>${s.prod}</td></tr>`).join('');
  const rows = [...root.querySelectorAll('.flow-table tbody tr')];
  let pts = [], len = 0, marks = [], t = 0, hold = null, current = -1, last = performance.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function layout() {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    pts = nodes.map(n => { const b = n.querySelector('.fn-ico').getBoundingClientRect(); return { x: b.left + b.width / 2 - r.left, y: b.top + b.height / 2 - r.top }; });
    const vertical = pts.length > 1 && Math.abs(pts[1].x - pts[0].x) < 10;
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      d += vertical ? ` C${a.x - 40},${(a.y + b.y) / 2} ${b.x - 40},${(a.y + b.y) / 2} ${b.x},${b.y}`
        : ` C${(a.x + b.x) / 2},${a.y - 46} ${(a.x + b.x) / 2},${b.y - 46} ${b.x},${b.y}`;
    }
    path.setAttribute('d', d); lit.setAttribute('d', d);
    len = path.getTotalLength();
    // Where each node sits along the path.
    marks = pts.map(p => {
      let best = 0, bd = Infinity;
      for (let s = 0; s <= len; s += len / 400) { const q = path.getPointAtLength(s); const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (dd < bd) { bd = dd; best = s; } }
      return best;
    });
    lit.style.strokeDasharray = `${len}`;
  }
  new ResizeObserver(layout).observe(svg);

  function show(i) {
    if (i === current) return;
    current = i;
    nodes.forEach((n, k) => { n.classList.toggle('is-on', k === i); n.classList.toggle('is-past', k < i); });
    rows.forEach((r, k) => r.classList.toggle('is-on', k === i));
    $('.fd-title').textContent = `${String(i + 1).padStart(2, '0')} · ${STAGES[i].title}`;
    $('.fd-text').textContent = STAGES[i].text;
  }
  nodes.forEach((n, i) => {
    n.tabIndex = 0;
    const on = () => { hold = i; show(i); };
    n.addEventListener('mouseenter', on); n.addEventListener('focus', on); n.addEventListener('click', on);
    n.addEventListener('mouseleave', () => { hold = null; });
    n.addEventListener('blur', () => { hold = null; });
  });

  // Packet: travels the path over ~9 s, pausing briefly at each stage.
  const CYCLE = 9000;
  function frame(now) {
    const dt = Math.min(50, now - last); last = now;
    if (!root.hidden && len) {
      if (hold === null && !reduced) t = (t + dt) % CYCLE;
      const u = hold !== null ? marks[hold] / len : easeStops(t / CYCLE);
      const s = u * len, p = path.getPointAtLength(s);
      packet.setAttribute('cx', p.x); packet.setAttribute('cy', p.y);
      lit.style.strokeDashoffset = `${len - s}`;
      let i = 0; for (let k = 0; k < marks.length; k++) if (s >= marks[k] - 2) i = k;
      show(hold ?? i);
    }
    requestAnimationFrame(frame);
  }
  // Slow down at each node so the stage reads, then travel on.
  function easeStops(u) {
    if (!marks.length) return u;
    const n = marks.length, seg = 1 / (n - 1 + 0.6);
    const k = Math.min(n - 1, Math.floor(u / seg)), f = (u - k * seg) / seg;
    if (k >= n - 1) return 1;
    const a = marks[k] / len, b = marks[k + 1] / len;
    const g = f < 0.35 ? 0 : (f - 0.35) / 0.65;
    return a + (b - a) * (g * g * (3 - 2 * g));
  }
  requestAnimationFrame(frame);
  if (reduced) setTimeout(() => show(0), 0);

  $('.cta-tutor').addEventListener('click', onTutor);
  $('.cta-student').addEventListener('click', onStudent);
  return { layout };
}
