// One clock for the whole lab. The engine turns a rhythm into a list of beats; the 3D heart and the ECG
// both read the same beats, so they can never drift apart.
//
// Times are in milliseconds of simulated time.
//   SA fire (sa)    = P-wave onset
//   QRS onset       = sa + PR
//   His entry (his) = QRS onset - QRS_LEAD (the ventricular clock starts here)
// Intervals come from the fact table. Items marked † are listed for physician review.

export const QRS_LEAD = 40;          // His entry → first septal myocardium (QRS onset)
export const AV_ARRIVE = 40;         // SA fire → impulse reaches the AV node

export const RHYTHMS = {
  normal: { label: 'Normal sinus rhythm', rate: 75 },
  first: { label: 'First-degree AV block', rate: 75 },
  mobitz1: { label: 'Mobitz I (Wenckebach)', rate: 75 },
  mobitz2: { label: 'Mobitz II', rate: 75 },
  third: { label: 'Third-degree (complete) block', rate: 80 },
  af: { label: 'Atrial fibrillation', rate: 110 },
};

const MOBITZ1_PR = [160, 240, 300];   // then one P is not conducted (4:3)†
const MOBITZ2_EVERY = 4;              // every 4th P blocked below the AV node (4:3)†
const ESCAPE_RR = 1500;               // third-degree escape rhythm, 40 bpm†

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function createEngine() {
  let rhythm = 'normal';
  let rate = RHYTHMS.normal.rate;
  let t = 0;                 // simulated time
  let atrial = [];           // { sa, n, pr, conducted, block: null|'av'|'his', his }
  let ventricular = [];      // { his, escape, from }
  let nextSA = 0, nextEscape = 0, nextAF = 0, n = 0;
  let rnd = seeded(42);

  function reset(at = t) {
    atrial = []; ventricular = []; n = 0; rnd = seeded(42);
    nextSA = at + 120; nextEscape = at + 700; nextAF = at + 200;
  }

  // Generate beats up to `until`.
  function fill(until) {
    if (rhythm === 'af') {
      while (nextAF < until) {
        ventricular.push({ his: nextAF, escape: false });
        const mean = 60000 / rate;
        nextAF += mean * (0.6 + rnd() * 0.8);      // irregularly irregular RR
      }
      return;
    }
    while (nextSA < until) {
      const sa = nextSA, i = n++;
      let pr = 160, conducted = true, block = null;
      if (rhythm === 'first') pr = 260;
      if (rhythm === 'mobitz1') {
        const k = i % (MOBITZ1_PR.length + 1);
        if (k < MOBITZ1_PR.length) pr = MOBITZ1_PR[k];
        else { conducted = false; block = 'av'; pr = 0; }
      }
      if (rhythm === 'mobitz2' && i % MOBITZ2_EVERY === MOBITZ2_EVERY - 1) { conducted = false; block = 'his'; }
      if (rhythm === 'third') { conducted = false; block = 'av'; pr = 0; }
      const beat = { sa, n: i, pr, conducted, block, his: conducted ? sa + pr - QRS_LEAD : null };
      atrial.push(beat);
      if (conducted) ventricular.push({ his: beat.his, escape: false, from: beat });
      nextSA += 60000 / rate;
    }
    if (rhythm === 'third') {
      while (nextEscape < until) { ventricular.push({ his: nextEscape, escape: true }); nextEscape += ESCAPE_RR; }
    }
    ventricular.sort((a, b) => a.his - b.his);
  }

  function lastBefore(list, key, time) {
    let best = null;
    for (const b of list) if (b[key] <= time) best = b; else break;
    return best;
  }

  return {
    get time() { return t; },
    get rhythm() { return rhythm; },
    get rate() { return rate; },
    setRhythm(id) { rhythm = id; rate = RHYTHMS[id].rate; reset(); },
    // A new rate applies from the next beat: drop the beats queued ahead at the old rate and rebuild.
    setRate(bpm) {
      if (bpm === rate) return;
      rate = bpm;
      atrial = atrial.filter(a => a.sa <= t);
      ventricular = ventricular.filter(v => v.escape || (v.from ? v.from.sa <= t : v.his <= t));
      const lastA = atrial[atrial.length - 1];
      if (lastA) { n = lastA.n + 1; nextSA = Math.max(t, lastA.sa + 60000 / rate); }
      if (rhythm === 'af') {
        const lastV = ventricular[ventricular.length - 1];
        nextAF = Math.max(t, (lastV ? lastV.his : t) + (60000 / rate) * (0.6 + rnd() * 0.8));
      }
      fill(t + 4000);
    },
    advance(ms) {
      t += ms;
      fill(t + 4000);
      // Forget beats long gone.
      const keep = t - 9000;     // the ECG strip shows up to about 8 s
      while (atrial.length > 2 && atrial[1].sa < keep) atrial.shift();
      while (ventricular.length > 2 && ventricular[1].his < keep) ventricular.shift();
    },
    // Everything the renderer and the readout need for "now".
    state() {
      const a = rhythm === 'af' ? null : lastBefore(atrial, 'sa', t);
      const v = lastBefore(ventricular, 'his', t);
      const s = {
        t, rhythm, rate,
        tA: a ? t - a.sa : 1e6,
        tV: v ? t - v.his : 1e6,
        escape: v?.escape ? 1 : 0,
        af: rhythm === 'af' ? 1 : 0,
        beat: a, vbeat: v,
        av: 0, block: null, blockFlash: 0,
      };
      // AV node: lit from arrival until the impulse leaves (or fails).
      if (a) {
        const since = t - a.sa - AV_ARRIVE;
        const hold = a.conducted ? a.pr - QRS_LEAD - AV_ARRIVE : (a.block === 'his' ? 160 - QRS_LEAD - AV_ARRIVE : 200);
        if (since >= 0 && since < hold) s.av = 1;
        if (!a.conducted) {
          const failAt = AV_ARRIVE + hold;
          const f = t - a.sa - failAt;
          if (f >= 0 && f < 420) { s.block = a.block; s.blockFlash = Math.max(0, 1 - f / 420) * (0.6 + 0.4 * Math.sin(f / 22)); }
        }
      }
      if (rhythm === 'af') s.av = (s.tV > -60 && s.tV < 10) ? 1 : 0;
      s.phase = describe(s);
      return s;
    },
    beats: () => ({ atrial, ventricular }),
  };
}

// Plain-English phase for the live readout.
function describe(s) {
  if (s.rhythm === 'af') {
    if (s.tV >= 0 && s.tV < 130) return { text: 'Ventricles depolarising (QRS) at an irregular moment', tone: 'v' };
    return { text: 'Atria fibrillating: no organised P wave', tone: 'a' };
  }
  if (s.block === 'av' && s.blockFlash > 0) return { text: s.rhythm === 'third' ? 'Blocked: nothing crosses to the ventricles' : 'Blocked at the AV node: no QRS', tone: 'bad' };
  if (s.block === 'his' && s.blockFlash > 0) return { text: 'Blocked below the AV node (His): no QRS', tone: 'bad' };
  if (s.rhythm === 'third' && s.tV >= 0 && s.tV < 180) return { text: 'Escape rhythm: slow, wide beat from the ventricles', tone: 'v' };
  if (s.tV >= 0 && s.tV < QRS_LEAD) return { text: 'His bundle and bundle branches', tone: 'v' };
  if (s.tV >= QRS_LEAD && s.tV < QRS_LEAD + 90) return { text: 'Ventricles depolarising (QRS)', tone: 'v' };
  if (s.av && s.rhythm === 'third') return { text: 'Atrial signal reaches the AV node but cannot cross', tone: 'av' };
  if (s.av) return { text: 'AV node holds the signal (PR segment)', tone: 'av' };
  if (s.tA >= 0 && s.tA < 100) return { text: 'SA node fires, atria depolarise (P wave)', tone: 'a' };
  if (s.tV >= QRS_LEAD + 90 && s.tV < 520) return { text: 'Ventricles repolarising (T wave)', tone: 'v' };
  return { text: 'Resting between beats', tone: 'rest' };
}
