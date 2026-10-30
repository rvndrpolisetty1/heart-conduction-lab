// Teaching content: levels, tasks, hints, worked solutions, rhythm cards, formulas and the quiz.
// Facts follow the fact table; anything beyond it is listed in MEDICAL-REVIEW.md.

export const RHYTHM_CARDS = {
  normal: {
    name: 'Normal sinus rhythm',
    heart: 'The SA node fires, the signal crosses the atria, waits briefly at the AV node, then spreads through the ventricles. Every beat follows the same path.',
    ecg: 'A P wave before every QRS. PR 120 to 200 ms and constant. QRS under 120 ms.',
    analogy: 'A relay race where every runner passes the baton on time.',
    clue: 'Regular, a P before every QRS, PR normal and the same each beat.',
  },
  first: {
    name: 'First-degree AV block',
    heart: 'The AV node is slow. Every signal still gets through to the ventricles, just later than normal.',
    ecg: 'PR over 200 ms and the same every beat. Every P is followed by a QRS.',
    analogy: 'A slow security gate: everyone gets through, but each person waits longer.',
    clue: 'A long PR that never changes, and no dropped beats.',
  },
  mobitz1: {
    name: 'Mobitz I (Wenckebach)',
    heart: 'The AV node takes a little longer each beat, until one signal does not get through. Then it resets. The block is usually at the AV node and is usually benign.',
    ecg: 'The PR gets longer beat by beat, then a P wave has no QRS after it. Then the cycle starts again.',
    analogy: 'A tiring runner who slows down each lap until they skip one, then starts fresh.',
    clue: 'Longer, longer, longer, dropped.',
  },
  mobitz2: {
    name: 'Mobitz II',
    heart: 'The block is below the AV node, in the His bundle or bundle branches. Signals pass normally, then one suddenly fails. It can progress to third-degree block, so a pacemaker is usually needed.',
    ecg: 'The PR stays the same every beat, then a QRS suddenly drops.',
    analogy: 'A bridge that works perfectly, then without warning lets one car fall through.',
    clue: 'Constant PR with a sudden dropped QRS: think pacemaker.',
  },
  third: {
    name: 'Third-degree (complete) block',
    heart: 'Nothing crosses from the atria to the ventricles. The atria follow the SA node; the ventricles beat on their own slow escape rhythm.',
    ecg: 'P waves and QRS complexes are independent of each other. The QRS rate is slow.',
    analogy: "Two drummers who can't hear each other, each keeping their own beat.",
    clue: 'P waves march through the strip with no link to the QRS.',
  },
  af: {
    name: 'Atrial fibrillation',
    heart: 'The atria quiver with chaotic electrical activity instead of one organised wave. The AV node lets signals through at random.',
    ecg: 'No clear P waves, a wavy baseline, and an irregularly irregular QRS.',
    analogy: 'A crowd all shouting at a door at once; the doorman lets people in at random.',
    clue: 'Irregularly irregular, with no P waves.',
  },
};

// Level tasks. kind: 'steps' (the step cards), 'calipers', 'ecgClick', 'spot', 'choice', 'multi'.
export const LEVELS = [
  {
    rhythm: 'normal', title: 'Follow one heartbeat', kind: 'steps',
    intro: 'Watch the electrical signal start at the SA node and travel to the ventricles. Notice where it pauses.',
    hints: ['Press Next to move through the six steps.', 'Watch where the bright signal waits: that is the AV node.', 'The pause between the P wave and the QRS is the PR segment, about 160 ms here.'],
    solution: 'SA node fires → atria depolarise (P) → AV node pause (PR segment) → His bundle and bundle branches → Purkinje fibres, ventricles depolarise (QRS) → ventricles reset (T).',
  },
  {
    rhythm: 'first', title: 'Measure a long PR', kind: 'calipers',
    intro: 'The AV node is holding the signal longer. Measure the PR interval and decide if it is normal.',
    task: 'Open the calipers, measure from the start of a P wave to the start of its QRS, then press Check.',
    target: [240, 280],
    hints: ['Click Calipers in the toolbox: the strip freezes and two green handles appear.', 'Drag the handles: one to the start of the P wave, one to the start of the QRS.', 'Each small box is 40 ms. Count about 6.5 small boxes.'],
    solution: 'PR = 6.5 small boxes × 40 ms = 260 ms. It is over 200 ms, the same every beat, and every P conducts: first-degree AV block.',
  },
  {
    rhythm: 'mobitz1', title: 'Find the dropped beat', kind: 'ecgClick',
    intro: 'The PR is changing from beat to beat. Something happens at the end of each cycle.',
    task: 'Click the P wave on the ECG that was not conducted.',
    hints: ['Look for a P wave with no QRS after it.', 'Read the PR brackets in order: 160, 240, 300…', 'It is the P wave straight after the PR 300 beat.'],
    solution: 'PR 160 → 240 → 300 ms, then one P is not conducted. The AV node tires and drops a beat: Mobitz I (Wenckebach).',
  },
  {
    rhythm: 'mobitz2', title: 'Where is the block?', kind: 'spot', answer: 'his', layer: 1,
    intro: 'Beats drop without warning, but the PR never changes. Where in the heart is the signal failing?',
    task: 'Click the label on the heart where the block is.',
    wrong: { av: 'Close, but the AV node is where Mobitz I blocks. Here the PR never changes, so the AV node is working. Look lower down.',
      sa: 'The SA node is firing normally: every P wave is there.', default: 'Not there. Watch for the red flash when a beat drops.' },
    hints: ['The PR is the same every beat, so the AV node is working normally.', 'Watch the heart for the red flash when a beat drops.', 'It flashes at the bundle of His, just below the AV node.'],
    solution: 'Constant PR, then a sudden dropped QRS. The block is below the AV node, in the His bundle. It can progress to third-degree block, so a pacemaker is usually needed.',
  },
  {
    rhythm: 'third', title: 'Two separate rhythms', kind: 'choice',
    intro: 'The P waves and the QRS complexes do not seem to agree with each other.',
    task: 'What is making the ventricles beat?',
    options: [
      { text: 'SA node signals crossing late', why: 'If they crossed late, each P would still lead to a QRS. Here no P is linked to a QRS.' },
      { text: 'The AV node holding every beat', why: 'Holding would lengthen the PR, but here there is no fixed PR at all.' },
      { text: 'A slow escape rhythm in the ventricles', correct: true, why: 'Nothing crosses the block, so a slow pacemaker low in the ventricles takes over.' },
      { text: 'Atrial fibrillation', why: 'There are clear, regular P waves, so the atria are not fibrillating.' },
    ],
    hints: ['Compare the P waves with the QRS: do they keep step?', 'Count the QRS rate. Is it the same as the P rate?', 'P waves at 80 a minute, QRS at 40: they are independent.'],
    solution: 'P waves (80 a minute) and QRS (40 a minute) are independent. Nothing crosses from atria to ventricles, so a slow escape rhythm drives the ventricles: third-degree block.',
  },
  {
    rhythm: 'af', title: 'Irregularly irregular', kind: 'multi',
    intro: 'The atria look chaotic and the beats come at random moments.',
    task: 'Which two features show this is atrial fibrillation?',
    options: [
      { text: 'No clear P waves', correct: true }, { text: 'Irregularly irregular QRS', correct: true },
      { text: 'Long, constant PR' }, { text: 'Wide QRS' },
    ],
    why: 'In AF there is no organised atrial wave, so no P waves; and the AV node lets signals through at random, so the QRS is irregularly irregular. There is no PR to measure, and the QRS is narrow.',
    hints: ['Look at the baseline just before each QRS.', 'Compare a few gaps between QRS complexes: are they equal?', 'No P waves, and every gap is different.'],
    solution: 'No P waves (a wavy baseline instead), and the QRS arrives at irregularly irregular intervals: atrial fibrillation.',
  },
];

export const FORMULAS = [
  { name: 'Heart rate (regular rhythm)', f: '300 ÷ large boxes between two R waves', note: 'One large box = 200 ms' },
  { name: 'Heart rate (more exact)', f: '1500 ÷ small boxes between two R waves', note: 'One small box = 40 ms' },
  { name: 'Heart rate (irregular rhythm)', f: 'QRS complexes in 6 s × 10', note: '6 s = 30 large boxes' },
  { name: 'Normal PR', f: '120 to 200 ms', note: '3 to 5 small boxes' },
  { name: 'Normal QRS', f: 'under 120 ms', note: 'under 3 small boxes' },
];

// Quiz strips: shown without labels; the student picks the rhythm.
export const QUIZ = ['mobitz1', 'third', 'af'];
