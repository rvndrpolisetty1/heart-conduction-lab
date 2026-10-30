// The lesson Dr. Tutor builds in the tutor studio. Same format as an answer: real code against the
// component library, streamed and run block by block. Facts follow the fact table.

export const REQUEST = 'Build an interactive for my Step 1 class: Mobitz I vs Mobitz II, where the block is and how it looks on the ECG.';

export const OBJECTIVES = [
  'Locate the block: AV node in Mobitz I, below it in Mobitz II',
  'Read the PR pattern: lengthening vs constant',
  'Spot the dropped QRS on a strip',
];
// Dr. Tutor's edit to the third objective, typed during the demo.
export const OBJECTIVE_EDIT = { index: 2, append: ' and name the rhythm' };

export const CHECKS = [
  { name: 'Facts match the fact table', proof: 'PR 160 → 240 → 300 ms (Mobitz I); PR constant 160 ms (Mobitz II); block sites AV node / below it' },
  { name: 'Every step is solvable', proof: 'Simulated agent walked all 4 steps and answered the quiz' },
  { name: 'Controls hold up at the limits', proof: 'Heart rate 40 and 150 bpm, speed 0.25×: no errors' },
  { name: 'Readable everywhere', proof: 'Labels legible at 400 px wide, in light and dark' },
];

export const LESSON = {
  id: 'lessonMobitz',
  title: 'Mobitz I vs Mobitz II',
  question: 'Lesson: Mobitz I vs Mobitz II',
  plan: ['lesson header', '3D heart', '2 block markers', '2 ECG strips', '4 step cards', '2 ladder diagrams', 'comparison', 'quiz'],
  say: 'This lesson shows both blocks on the live heart and the ECG. Mobitz I blocks at the AV node, with a lengthening PR. Mobitz II blocks below it, with a constant PR.',
  spot: 'his',
  blocks: [
`// Lesson: Mobitz I vs Mobitz II (Step 1 cardiology)
ui.lessonHeader({
  title: 'Mobitz I vs Mobitz II',
  subtitle: 'Where the block is, and how it looks on the ECG',
  objectives: [
    'Locate the block: AV node in Mobitz I, below it in Mobitz II',
    'Read the PR pattern: lengthening vs constant',
    'Spot the dropped QRS on a strip and name the rhythm',
  ],
});`,
`// The live 3D heart, conduction system revealed
ui.heartView({ rhythm: 'mobitz1', reveal: 0.85 });
// Mark both block sites on it
heart.mark('av', { label: 'Mobitz I: AV node', color: 'gold' });
heart.mark('his', { label: 'Mobitz II: below the AV node', color: 'red' });`,
`// Two strips, dropped beats circled
ui.strip({ rhythm: 'mobitz1', mark: 'drop', label: 'Mobitz I: PR 160 → 240 → 300, then a drop' });
ui.strip({ rhythm: 'mobitz2', mark: 'drop', label: 'Mobitz II: PR constant at 160, then a drop' });`,
`// Step cards the student walks through
ui.steps([
  { title: 'Watch the PR in Mobitz I', text: 'Each beat the AV node takes longer. Read the PR: 160, 240, 300 ms.' },
  { title: 'Find the dropped beat', text: 'After the longest PR, one P wave has no QRS after it.' },
  { title: 'Now Mobitz II', text: 'The PR stays at 160 ms every beat, then a QRS suddenly drops.' },
  { title: 'Locate the block', text: 'Mobitz I blocks at the AV node. Mobitz II blocks below it, so a pacemaker is usually needed.' },
]);`,
`// Ladder diagrams: same drop, different place
ui.ladder({ rhythm: 'mobitz1', beats: 5 });
ui.ladder({ rhythm: 'mobitz2', beats: 5 });`,
`ui.compare({
  left: { title: 'Mobitz I', points: ['PR gets longer, then a QRS drops', 'Block usually at the AV node', 'Usually benign'] },
  right: { title: 'Mobitz II', points: ['PR stays the same, then a QRS drops', 'Block below the AV node', 'Pacemaker usually needed'] },
});`,
`// Check: name the rhythm from the pattern
ui.quiz({
  q: 'PR 160, 160, 160, then a QRS suddenly drops. Which rhythm?',
  options: ['Mobitz I', 'Mobitz II', 'First-degree block'],
  answer: 1,
  why: 'A constant PR with a sudden drop is Mobitz II: the block is below the AV node.',
});`,
  ],
};

// The quick chat question after publishing: answered with an inline visual instead of text.
export const QUICK = {
  ask: 'Show me the difference in one picture.',
  reply: 'Here it is in one picture: the same dropped beat, blocked in two different places.',
  blocks: [
`ui.ladder({ rhythm: 'mobitz1', beats: 5 });
ui.ladder({ rhythm: 'mobitz2', beats: 5 });`,
  ],
};
