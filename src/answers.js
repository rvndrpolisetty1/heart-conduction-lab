// Pre-built answers for the concept demo. Each one is real code against the component library: the
// build engine streams this exact text, then runs each block to draw it. Only "a model wrote it" is
// pre-recorded. Questions are matched by keywords; anything else falls back to labelled Guided search.

export const ANSWERS = [
  {
    id: 'avPause',
    match: /\b(pause|paus|wait|delay|hold|slow)\w*\b|why.*av node|av node.*why|pr segment/i,
    question: 'Why does the signal pause at the AV node?',
    plan: ['explainer card', 'animation', 'ECG strip', '3D marker', 'check question'],
    say: 'The AV node holds the signal so the ventricles can fill before they squeeze. That pause is the PR segment.',
    spot: 'av',
    blocks: [
`// Answer: why the signal pauses at the AV node
ui.card({
  title: 'Why the signal waits at the AV node',
  text: 'The AV node conducts slowly on purpose. The pause lets the atria finish emptying into the ventricles before the ventricles squeeze.',
});`,
`// Show one beat, slowed down, with the hold
ui.pauseAnimation({
  hold: 80,            // ms the AV node holds the signal
  label: 'PR segment',
});`,
`// Where the pause appears on the ECG
ui.strip({
  rhythm: 'normal',
  mark: 'PR',          // shade every PR segment
  label: 'The shaded part is the PR: P wave plus the AV node pause',
});`,
`// Mark the AV node on the live 3D heart
heart.mark('av', { label: 'AV node: holds about 80 ms', color: 'gold' });`,
`// Check understanding
ui.quiz({
  q: 'What would a much longer pause look like on the ECG?',
  options: ['A long PR', 'A wide QRS', 'No P waves'],
  answer: 0,
  why: 'The pause is part of the PR, so a longer pause means a longer PR: first-degree block.',
});`,
    ],
  },
  {
    id: 'mobitz1Drop',
    match: /\b(drop|dropped|missing|skip|wenckebach)\w*\b|mobitz\s*(i|1)\b(?!i)/i,
    question: 'Why did that beat drop in Mobitz I?',
    plan: ['explainer card', 'ladder diagram', 'ECG strip', '3D marker'],
    say: 'Each beat the AV node takes a little longer, until one signal cannot get through. Then it resets.',
    spot: 'av',
    blocks: [
`// Answer: the dropped beat in Mobitz I
ui.card({
  title: 'The AV node tires, then drops one',
  text: 'Each beat the AV node takes a little longer to pass the signal on. Eventually one signal does not get through, so there is no QRS. Then the cycle starts again.',
});`,
`// Ladder diagram: follow each beat from atria to ventricles
ui.ladder({ rhythm: 'mobitz1', beats: 6 });`,
`// The same pattern on the ECG, dropped beats circled
ui.strip({ rhythm: 'mobitz1', mark: 'drop', label: 'PR 160 → 240 → 300, then a P with no QRS' });`,
`// Mark the block site on the live 3D heart
heart.mark('av', { label: 'Block at the AV node', color: 'red' });`,
`ui.formula({
  name: 'Wenckebach pattern',
  expr: 'PR ↑, PR ↑, PR ↑ … dropped QRS',
  note: 'The pause is shorter than two normal beats',
});`,
    ],
  },
  {
    id: 'compare',
    match: /\b(vs|versus|differ|difference|compare|between)\b|mobitz\s*(ii|2)/i,
    question: 'What is the difference between Mobitz I and Mobitz II?',
    plan: ['comparison', '2 ladder diagrams', '2 3D markers', 'check question'],
    say: 'Mobitz I: the PR grows, then a beat drops, at the AV node. Mobitz II: the PR stays the same, then a beat drops, below the AV node. That one usually needs a pacemaker.',
    spot: 'his',
    blocks: [
`// Answer: Mobitz I vs Mobitz II
ui.compare({
  left: { title: 'Mobitz I', points: ['PR gets longer, then a QRS drops', 'Block usually at the AV node', 'Usually benign'] },
  right: { title: 'Mobitz II', points: ['PR stays the same, then a QRS drops', 'Block below the AV node', 'Pacemaker usually needed'] },
});`,
`// Same drop, different place: ladder diagrams side by side
ui.ladder({ rhythm: 'mobitz1', beats: 5 });
ui.ladder({ rhythm: 'mobitz2', beats: 5 });`,
`// Mark both block sites on the live 3D heart
heart.mark('av', { label: 'Mobitz I: AV node', color: 'gold' });
heart.mark('his', { label: 'Mobitz II: below the AV node', color: 'red' });`,
`ui.quiz({
  q: 'PR constant at 160 ms, then a QRS suddenly drops. Which is it?',
  options: ['Mobitz I', 'Mobitz II', 'First-degree block'],
  answer: 1,
  why: 'A constant PR with a sudden drop is Mobitz II: the block is below the AV node.',
});`,
    ],
  },
];

// Answers reached by circling (or selecting text). Same format.
ANSWERS.push(
  {
    id: 'prInterval',
    match: /\bpr\b|pr interval|interval/i,
    question: 'What is the PR interval?',
    plan: ['explainer card', 'formula', 'ECG strip', '3D marker'],
    say: 'The PR interval runs from the start of the P wave to the start of the QRS. Normal is 120 to 200 milliseconds.',
    spot: 'av',
    blocks: [
`// Answer: the PR interval
ui.card({
  title: 'From the start of P to the start of QRS',
  text: 'The PR interval is the time for the signal to cross the atria and the AV node. Most of it is the AV node pause.',
});`,
`ui.formula({
  name: 'Normal PR interval',
  expr: '120 to 200 ms  =  3 to 5 small boxes',
  note: 'One small box is 40 ms at 25 mm/s',
});`,
`// Every PR shaded on a live strip
ui.strip({ rhythm: 'normal', mark: 'PR', label: 'Shaded: P wave start → QRS start' });`,
`heart.mark('av', { label: 'Most of the PR is spent here', color: 'gold' });`,
    ],
  },
  {
    id: 'afBaseline',
    match: /\b(wavy|baseline|fibrillat|chaotic|f wave|no p)\w*/i,
    question: 'Why is the baseline wavy, with no P waves?',
    plan: ['explainer card', 'ECG strip', '3D marker', 'formula'],
    say: 'In AF the atria quiver with many small chaotic waves instead of one organised beat, so there is no P wave, just a wavy baseline.',
    spot: 'atria',
    blocks: [
`// Answer: the wavy baseline in atrial fibrillation
ui.card({
  title: 'Many small waves, no single beat',
  text: 'The atria quiver with chaotic electrical activity instead of one organised wave. There is no P wave, only small irregular f waves on the baseline.',
});`,
`ui.strip({ rhythm: 'af', label: 'f waves on the baseline · QRS at irregular moments' });`,
`// Show where the chaos is on the live 3D heart
heart.mark('atria', { label: 'Atria fibrillating', color: 'red' });`,
`ui.formula({
  name: 'Rate when the rhythm is irregular',
  expr: 'QRS complexes in 6 s × 10',
  note: '6 seconds = 30 large boxes',
});`,
    ],
  },
  {
    id: 'purkinje',
    match: /\b(purkinje|squeeze|bottom|apex|qrs|ventricles?)\b/i,
    question: 'Why do the ventricles squeeze from the bottom up?',
    plan: ['explainer card', 'ECG strip', '3D marker'],
    say: 'Purkinje fibres carry the signal very fast to the bottom of the ventricles first, so they squeeze from the apex upwards, like squeezing a tube of toothpaste.',
    spot: 'purkinje',
    blocks: [
`// Answer: the ventricles squeeze from the apex up
ui.card({
  title: 'Fast wiring to the bottom first',
  text: 'Purkinje fibres carry the signal very fast down to the apex, then up the walls. The ventricles squeeze from the bottom up, pushing blood towards the exits at the top.',
});`,
`ui.strip({ rhythm: 'normal', mark: 'QRS', label: 'Shaded: the QRS, while the ventricles depolarise' });`,
`heart.mark('purkinje', { label: 'Purkinje fibres: fastest conduction', color: 'cyan' });`,
    ],
  },
  {
    id: 'thirdLadder',
    match: /\b(third|complete|independent|march|escape)\w*/i,
    question: 'Why do the P waves not match the QRS?',
    plan: ['explainer card', 'ladder diagram', 'ECG strip', '3D marker'],
    say: 'In complete block nothing crosses from the atria to the ventricles. The atria keep their own rate, and a slow escape rhythm drives the ventricles.',
    spot: 'av',
    blocks: [
`// Answer: the atria and ventricles stopped talking
ui.card({
  title: 'Two rhythms that ignore each other',
  text: 'Every atrial signal stops at the block. The atria keep beating at their own rate, and a slow escape pacemaker in the ventricles takes over.',
});`,
`// Ladder: atrial beats stop at the block; escape beats start in the ventricles
ui.ladder({ rhythm: 'third', beats: 6 });`,
`ui.strip({ rhythm: 'third', label: 'P waves march through · slow, wide QRS' });`,
`heart.mark('av', { label: 'Nothing crosses here', color: 'red' });`,
    ],
  },
  {
    id: 'tWave',
    match: /\b(t wave|repolari|reset|recover)\w*/i,
    question: 'What is the T wave?',
    plan: ['explainer card', 'ECG strip', '3D marker'],
    say: 'The T wave is the ventricles resetting, or repolarising, so they are ready for the next beat.',
    spot: 'ventricles',
    blocks: [
`// Answer: the T wave
ui.card({
  title: 'The ventricles reset',
  text: 'After the ventricles squeeze, their cells reset so they can fire again. That electrical reset is repolarisation, and it shows as the T wave.',
});`,
`ui.strip({ rhythm: 'normal', mark: 'T', label: 'Shaded: the T wave, while the ventricles repolarise' });`,
`heart.mark('ventricles', { label: 'Ventricles repolarising', color: 'cyan' });`,
    ],
  },
);

// Dr. Tutor's improvisations: ask the AI to redo an answer another way. Each changes some blocks
// (replace by index) or adds new ones; the build engine shows the change as a diff.
const SIMPLER = {
  avPause: `// Answer: why the signal pauses at the AV node
ui.card({
  title: 'The AV node is a waiting room',
  text: 'The signal waits a moment at the AV node, so the lower chambers can fill up with blood before they squeeze.',
});`,
  mobitz1Drop: `// Answer: the dropped beat in Mobitz I
ui.card({
  title: 'Slower, slower, skip',
  text: 'The AV node gets a little slower every beat, until it skips one. Then it starts fresh.',
});`,
  compare: `// Answer: Mobitz I vs Mobitz II
ui.compare({
  left: { title: 'Mobitz I', points: ['Gap grows, then a skip', 'Problem in the AV node', 'Usually harmless'] },
  right: { title: 'Mobitz II', points: ['Same gap, sudden skip', 'Problem lower down', 'Usually needs a pacemaker'] },
});`,
};
const VARIANTS = {
  avPause: [
    { label: 'Slow it down', request: 'Can you slow the animation down so they see the hold?', replace: { 1:
`// Show one beat at a third of real speed, with the hold
ui.pauseAnimation({
  hold: 80,            // ms the AV node holds the signal
  speed: 0.35,         // slowed down to see the hold
  label: 'PR segment · slowed down',
});` } },
    { label: 'Simpler words', request: 'Say it more simply, for a first-year student.', replace: { 0: SIMPLER.avPause } },
  ],
  mobitz1Drop: [
    { label: 'Add a check question', request: 'Add a quick question so they test themselves.', append: [
`// Check understanding
ui.quiz({
  q: 'PR 160, 240, 300, then no QRS. Where is the block?',
  options: ['AV node', 'Below the AV node', 'SA node'],
  answer: 0,
  why: 'A lengthening PR before the drop means the AV node is tiring: Mobitz I.',
});`] },
    { label: 'Simpler words', request: 'Say it more simply.', replace: { 0: SIMPLER.mobitz1Drop } },
  ],
  compare: [
    { label: 'Show ECG strips instead', request: 'Show them the ECG strips instead of ladder diagrams.', replace: { 1:
`// Same drop, different strip: dropped beats circled
ui.strip({ rhythm: 'mobitz1', mark: 'drop', label: 'Mobitz I: PR grows, then a drop' });
ui.strip({ rhythm: 'mobitz2', mark: 'drop', label: 'Mobitz II: PR constant, then a drop' });` } },
    { label: 'Simpler words', request: 'Say it more simply.', replace: { 0: SIMPLER.compare } },
  ],
  prInterval: [
    { label: 'Show a long PR too', request: 'Show them a long PR next to the normal one.', append: [
`// A long PR for comparison: first-degree block
ui.strip({ rhythm: 'first', mark: 'PR', label: 'First-degree block: PR 260 ms, every beat' });`] },
  ],
  afBaseline: [
    { label: 'Compare with normal', request: 'Put a normal strip next to it so the difference is obvious.', append: [
`// Normal rhythm for comparison: a P before every QRS
ui.strip({ rhythm: 'normal', label: 'Normal: clear P waves, regular QRS' });`] },
  ],
  purkinje: [
    { label: 'Show the activation map', request: 'Show them the activation map on the heart.', append: [
`// Colour the heart by activation time: earliest red, latest purple
heart.activationMap(true);
ui.card({ title: 'Activation map', text: 'Red activates first, purple last. The ventricles go from the septum and apex up to the base.' });`] },
  ],
  thirdLadder: [
    { label: 'Add a check question', request: 'Add a question about the escape rhythm.', append: [
`ui.quiz({
  q: 'What drives the ventricles in complete heart block?',
  options: ['The SA node', 'A slow escape rhythm', 'The AV node'],
  answer: 1,
  why: 'Nothing crosses the block, so a slow pacemaker low down takes over.',
});`] },
  ],
  tWave: [
    { label: 'Simpler words', request: 'Say it more simply.', replace: { 0:
`// Answer: the T wave
ui.card({
  title: 'The reset button',
  text: 'After each squeeze, the lower chambers reset so they are ready for the next one. That reset is the T wave.',
});` } },
  ],
};
for (const a of ANSWERS) a.variants = VARIANTS[a.id] || [];

export const getAnswer = id => ANSWERS.find(a => a.id === id) || null;
export const SUGGESTIONS = ANSWERS.slice(0, 3).map(a => a.question);
// Comparison questions first (they mention both Mobitz types), then dropped beats, then the AV pause.
const ORDER = ['compare', 'mobitz1Drop', 'afBaseline', 'thirdLadder', 'tWave', 'prInterval', 'avPause', 'purkinje'];
export const findAnswer = q => ANSWERS.find(a => a.question === q)
  || ORDER.map(id => ANSWERS.find(a => a.id === id)).find(a => a.match.test(q)) || null;
