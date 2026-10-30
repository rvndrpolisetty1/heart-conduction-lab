// The classroom: Dr. Tutor and the Student, Pixar-style, in one small scene with a desk and a laptop.
// Original characters built from smooth shapes in three.js (no downloaded models). All motion is
// procedural: poses blend, eyes blink and look at things, brows and mouth act, and the camera cuts
// between an over-the-shoulder shot (laptop + Dr. Tutor) and a close shot of the Student's face.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const SPHERE = new THREE.SphereGeometry(1, 48, 32);

// ---------- Materials ----------
const MAT = {
  skin: c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.5, sheen: 0.4, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ff9d8a'), clearcoat: 0.06, clearcoatRoughness: 0.7 }),
  cloth: (c, sheen = 0.7) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.82, sheen, sheenRoughness: 0.7, sheenColor: new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.5) }),
  hair: c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.48, sheen: 0.6, sheenRoughness: 0.4, sheenColor: new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.35), clearcoat: 0.25, clearcoatRoughness: 0.5 }),
  gloss: (c, r = 0.25) => new THREE.MeshPhysicalMaterial({ color: c, roughness: r, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  metal: c => new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.28 }),
  flat: c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }),
};
const eyeWhite = new THREE.MeshPhysicalMaterial({ color: '#fbfbfe', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });

// ---------- Shape helpers ----------
function m(geo, mat, { pos, rot, scale, cast = true } = {}) {
  const o = new THREE.Mesh(geo, mat);
  if (pos) o.position.set(...pos);
  if (rot) o.rotation.set(...rot);
  if (scale) o.scale.set(...scale);
  o.castShadow = cast; o.receiveShadow = true;
  return o;
}
const ellip = (r, mat, pos, rot) => m(SPHERE, mat, { scale: r, pos, rot });
const capsule = (r, len, mat, opts) => m(new THREE.CapsuleGeometry(r, len, 10, 24), mat, opts);
const tube = (pts, r, mat, opts) => m(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => v3(...p))), 64, r, 12, false), mat, opts);
const lathe = (profile, mat, phiStart = 0, phiLength = Math.PI * 2, opts) =>
  m(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 64, phiStart, phiLength), mat, opts);
const group = (pos, ...kids) => { const g = new THREE.Group(); if (pos) g.position.set(...pos); if (kids.length) g.add(...kids); return g; };

// Iris texture laid out for a sphere cap: rows from the pole (pupil) to the rim; columns go round.
function irisTexture(color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const base = new THREE.Color(color);
  // The texture spans the whole iris cap: row 0 is the pupil centre, the last row the iris edge.
  for (let y = 0; y < 256; y++) {
    const r = y / 255;
    for (let x = 0; x < 128; x += 2) {
      let col;
      if (r < 0.4) col = '#08070c';
      else if (r > 0.93) col = '#1a120e';
      else {
        const streak = 0.78 + 0.32 * Math.sin(x * 0.55 + Math.sin(x * 0.17) * 3) * (0.3 + r);
        const k = base.clone().multiplyScalar(streak * (1.35 - r * 0.6));
        col = `#${k.getHexString()}`;
      }
      g.fillStyle = col; g.fillRect(x, y, 2, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- Head ----------
function buildHead({ skin, hair, irisColor, browColor, style }) {
  const skinMat = MAT.skin(skin), hairMat = MAT.hair(hair);
  const head = new THREE.Group();
  head.add(ellip([0.205, 0.22, 0.198], skinMat, [0, 0, 0]));
  head.add(ellip([0.034, 0.05, 0.026], skinMat, [0.196, -0.01, -0.01]));
  head.add(ellip([0.034, 0.05, 0.026], skinMat, [-0.196, -0.01, -0.01]));         // ears
  head.add(ellip([0.026, 0.022, 0.028], MAT.skin(new THREE.Color(skin).offsetHSL(0, 0.05, -0.03)), [0, -0.035, 0.194]));  // nose
  // Eyes: ball + iris cap (they rotate to look), fixed glints, lids that blink.
  const irisMat = new THREE.MeshPhysicalMaterial({ map: irisTexture(irisColor), roughness: 0.15, clearcoat: 1 });
  const lidMat = skinMat;
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = group([sx * 0.072, 0.03, 0.155]);
    eye.rotation.y = sx * 0.14;
    const gaze = new THREE.Group();
    gaze.add(m(SPHERE, eyeWhite, { scale: [0.056, 0.056, 0.056], cast: false }));
    const cap = m(new THREE.SphereGeometry(0.0565, 40, 16, 0, Math.PI * 2, 0, 0.6), irisMat, { cast: false });
    cap.rotation.x = Math.PI / 2;
    gaze.add(cap);
    eye.add(gaze);
    eye.add(m(SPHERE, shine, { scale: [0.011, 0.011, 0.011], pos: [-0.018, 0.022, 0.05], cast: false }));
    eye.add(m(SPHERE, shine, { scale: [0.005, 0.005, 0.005], pos: [0.016, -0.014, 0.053], cast: false }));
    const lid = m(new THREE.SphereGeometry(0.06, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), lidMat, { cast: false });
    const lidPivot = group(null, lid);
    eye.add(lidPivot);
    head.add(eye);
    eyes.push({ eye, gaze, lid: lidPivot });
  }
  // Brows.
  const browMat = MAT.hair(browColor);
  const brows = [-1, 1].map(sx => {
    const b = tube([[-0.034, -0.006, 0], [0, 0.006, 0.006], [0.034, -0.004, 0]], 0.0085, browMat);
    const p = group([sx * 0.072, 0.105, 0.185], b);
    p.rotation.y = sx * 0.2;
    head.add(p);
    return p;
  });
  // Mouth: a smile line, an open mouth for talking, teeth.
  const lipMat = MAT.gloss('#8a3a44', 0.4);
  const smile = tube([[-0.04, 0.012, -0.012], [-0.02, -0.004, 0], [0, -0.008, 0.003], [0.02, -0.004, 0], [0.04, 0.012, -0.012]], 0.0062, lipMat);
  const smileP = group([0, -0.1, 0.188], smile);
  const open = ellip([0.034, 0.024, 0.014], MAT.gloss('#3b1119', 0.6), [0, -0.112, 0.184]);
  const teeth = ellip([0.026, 0.007, 0.01], MAT.gloss('#fbfaf6', 0.3), [0, -0.097, 0.19]);
  open.scale.y = 0.001; teeth.visible = false;
  head.add(smileP, open, teeth);
  // Hair.
  const capGeo = new THREE.SphereGeometry(0.214, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const hairCap = m(capGeo, hairMat, { pos: [0, 0.014, -0.014], rot: [-0.62, 0, 0] });
  head.add(hairCap);
  if (style === 'doctor') {
    head.add(ellip([0.14, 0.055, 0.1], hairMat, [0.035, 0.185, 0.09], [0.15, 0, -0.28]));        // swept fringe
    const grey = MAT.hair('#9a948f');
    head.add(ellip([0.035, 0.07, 0.07], grey, [0.188, 0.05, 0.015]), ellip([0.035, 0.07, 0.07], grey, [-0.188, 0.05, 0.015]));
    // Glasses.
    const frame = MAT.gloss('#2a2f45', 0.3);
    for (const sx of [-1, 1]) head.add(m(new THREE.TorusGeometry(0.06, 0.0065, 12, 48), frame, { pos: [sx * 0.074, 0.028, 0.214], rot: [0, sx * 0.14, 0] }));
    head.add(tube([[-0.016, 0.034, 0.222], [0, 0.04, 0.226], [0.016, 0.034, 0.222]], 0.005, frame));
    for (const sx of [-1, 1]) head.add(tube([[sx * 0.132, 0.034, 0.2], [sx * 0.19, 0.03, 0.09], [sx * 0.196, 0.0, -0.02]], 0.005, frame));
  } else {
    const tufts = [[0.0, 0.2, 0.12, 0.07], [0.07, 0.19, 0.1, 0.06], [-0.07, 0.19, 0.1, 0.06], [0.12, 0.17, 0.06, 0.055], [-0.12, 0.17, 0.05, 0.055],
      [0.04, 0.23, 0.02, 0.07], [-0.05, 0.225, 0.0, 0.065], [0.1, 0.21, -0.06, 0.06], [-0.1, 0.205, -0.07, 0.06], [0.0, 0.215, -0.11, 0.07]];
    tufts.forEach(([x, y, z, r], i) => head.add(ellip([r, r * 0.8, r], hairMat, [x, y, z], [0.3 * Math.sin(i), i, 0.2 * Math.cos(i * 2)])));
    head.add(ellip([0.11, 0.035, 0.055], hairMat, [-0.04, 0.18, 0.14], [0.6, 0, 0.3]));              // fringe over the forehead
  }
  return { head, eyes, brows, smile: smileP, open, teeth };
}

// ---------- Arms and legs ----------
function buildArm(sleeveMat, skinMat, cuffMat) {
  const shoulder = new THREE.Group();
  shoulder.add(capsule(0.056, 0.2, sleeveMat, { pos: [0, -0.13, 0] }));
  const elbow = group([0, -0.265, 0]);
  shoulder.add(elbow);
  elbow.add(capsule(0.05, 0.17, sleeveMat, { pos: [0, -0.11, 0] }));
  elbow.add(m(new THREE.CylinderGeometry(0.052, 0.054, 0.03, 24), cuffMat, { pos: [0, -0.205, 0] }));
  const wrist = group([0, -0.225, 0]);
  elbow.add(wrist);
  wrist.add(ellip([0.042, 0.052, 0.026], skinMat, [0, -0.045, 0]));
  const thumb = group([0.03, -0.03, 0.015], capsule(0.012, 0.032, skinMat, { pos: [0, -0.02, 0] }));
  thumb.rotation.set(0.3, 0, 0.7);
  const index = group([-0.022, -0.09, 0.004], capsule(0.0115, 0.036, skinMat, { pos: [0, -0.02, 0] }));
  const fingers = group([0.008, -0.09, 0], capsule(0.03, 0.022, skinMat, { pos: [0, -0.018, 0], scale: [1, 1, 0.42] }));
  wrist.add(thumb, index, fingers);
  return { shoulder, elbow, wrist, index, fingers, thumb };
}
function buildLeg(trouserMat, shoeMat) {
  const hip = new THREE.Group();
  hip.add(capsule(0.072, 0.3, trouserMat, { pos: [0, -0.2, 0] }));
  const knee = group([0, -0.4, 0]);
  hip.add(knee);
  knee.add(capsule(0.062, 0.3, trouserMat, { pos: [0, -0.19, 0] }));
  const ankle = group([0, -0.4, 0]);
  knee.add(ankle);
  ankle.add(ellip([0.068, 0.05, 0.13], shoeMat, [0, -0.03, 0.045]));
  return { hip, knee, ankle };
}

// ---------- Dr. Tutor ----------
function buildDoctor() {
  const skin = '#b47350', skinMat = MAT.skin(skin);
  const coat = MAT.cloth('#f4f6fb', 0.5); coat.side = THREE.DoubleSide;
  const shirt = MAT.cloth('#9cc0ee'), trousers = MAT.cloth('#2c3352'), shoe = MAT.gloss('#3a2a22', 0.35);
  const root = new THREE.Group();
  const hips = group([0, 0.86, 0]); root.add(hips);
  const legs = [-1, 1].map(sx => { const l = buildLeg(trousers, shoe); l.hip.position.x = sx * 0.095; hips.add(l.hip); return l; });
  const spine = new THREE.Group(); hips.add(spine);
  const torso = new THREE.Group(); torso.scale.z = 0.78; spine.add(torso);
  torso.add(lathe([[0.17, 0], [0.19, 0.1], [0.205, 0.24], [0.21, 0.36], [0.19, 0.45], [0.12, 0.52], [0.06, 0.54]], shirt));
  torso.add(lathe([[0.25, -0.38], [0.238, -0.2], [0.226, 0], [0.232, 0.18], [0.24, 0.32], [0.226, 0.43], [0.17, 0.51], [0.1, 0.545]], coat, 0.3, Math.PI * 2 - 0.6));
  // Tie and lapels.
  const tie = MAT.cloth('#4f46c9', 0.4);
  torso.add(m(new RoundedBoxGeometry(0.05, 0.28, 0.02, 3, 0.01), tie, { pos: [0, 0.32, 0.205] }));
  torso.add(m(new RoundedBoxGeometry(0.06, 0.04, 0.025, 3, 0.012), tie, { pos: [0, 0.47, 0.19] }));
  for (const sx of [-1, 1]) torso.add(m(new RoundedBoxGeometry(0.055, 0.2, 0.02, 3, 0.01), MAT.cloth('#e6eaf2', 0.5), { pos: [sx * 0.075, 0.4, 0.215], rot: [0.05, 0, sx * 0.35] }));
  // Stethoscope round the neck, chestpiece, badge and pen.
  const steth = MAT.gloss('#323849', 0.35);
  torso.add(tube([[-0.08, 0.3, 0.215], [-0.11, 0.45, 0.17], [-0.06, 0.53, 0.02], [0.06, 0.53, 0.02], [0.11, 0.45, 0.17], [0.09, 0.28, 0.22]], 0.012, steth));
  torso.add(m(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 32), MAT.metal('#cfd6e2'), { pos: [0.095, 0.26, 0.225], rot: [Math.PI / 2, 0, 0] }));
  const badgeTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#6d4aff'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#ffffff'; g.fillRect(0, 40, 128, 24);
    g.fillStyle = '#ffffff'; g.font = '700 26px sans-serif'; g.textAlign = 'center'; g.fillText('TUTOR', 64, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  torso.add(m(new THREE.PlaneGeometry(0.075, 0.04), new THREE.MeshStandardMaterial({ map: badgeTex, roughness: 0.4 }), { pos: [-0.135, 0.36, 0.218], rot: [0, -0.35, 0], cast: false }));
  torso.add(m(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 12), MAT.gloss('#6d4aff'), { pos: [0.15, 0.39, 0.205] }));
  // Neck, head.
  const neck = group([0, 0.53, 0]); spine.add(neck);
  neck.add(m(new THREE.CylinderGeometry(0.055, 0.06, 0.08, 24), skinMat, { pos: [0, 0.03, 0] }));
  const H = buildHead({ skin, hair: '#2b2421', irisColor: '#6b3e22', browColor: '#2b2421', style: 'doctor' });
  H.head.position.y = 0.23; neck.add(H.head);
  // Arms.
  const cuff = MAT.cloth('#dfe4ee', 0.5);
  const arms = [-1, 1].map(sx => { const a = buildArm(coat, skinMat, cuff); a.shoulder.position.set(sx * 0.235, 0.45, 0); spine.add(a.shoulder); return a; });
  return { root, hips, spine, neck, legs, armR: arms[0], armL: arms[1], ...H };
}

// ---------- Student ----------
function buildStudent() {
  const skin = '#f0c4a2', skinMat = MAT.skin(skin);
  const hood = MAT.cloth('#7b5cff', 0.8), hoodDark = MAT.cloth('#6544e8', 0.8), jeans = MAT.cloth('#3b5f9f'), sneaker = MAT.gloss('#f4f4f7', 0.4);
  const root = new THREE.Group();
  const hips = group([0, 0.5, 0]); root.add(hips);
  const legs = [-1, 1].map(sx => {
    const l = buildLeg(jeans, sneaker);
    l.hip.position.x = sx * 0.1; l.hip.rotation.x = -Math.PI / 2 + 0.05; l.knee.rotation.x = Math.PI / 2 - 0.1;
    hips.add(l.hip); return l;
  });
  const spine = new THREE.Group(); hips.add(spine);
  const torso = new THREE.Group(); torso.scale.z = 0.8; spine.add(torso);
  torso.add(lathe([[0.2, -0.02], [0.215, 0.1], [0.22, 0.24], [0.215, 0.36], [0.19, 0.44], [0.12, 0.5], [0.07, 0.52]], hood));
  torso.add(m(new RoundedBoxGeometry(0.22, 0.11, 0.04, 4, 0.02), hoodDark, { pos: [0, 0.1, 0.205] }));            // pocket
  torso.add(m(new THREE.TorusGeometry(0.15, 0.05, 16, 48, Math.PI * 1.25), hoodDark, { pos: [0, 0.47, -0.02], rot: [Math.PI / 2 - 0.25, 0, Math.PI * -0.125] }));   // hood
  for (const sx of [-1, 1]) {
    torso.add(tube([[sx * 0.035, 0.46, 0.17], [sx * 0.04, 0.38, 0.215], [sx * 0.045, 0.3, 0.22]], 0.006, MAT.cloth('#ffffff')));
    torso.add(ellip([0.011, 0.016, 0.011], MAT.gloss('#ffffff'), [sx * 0.045, 0.29, 0.22]));
  }
  const neck = group([0, 0.5, 0]); spine.add(neck);
  neck.add(m(new THREE.CylinderGeometry(0.053, 0.058, 0.08, 24), skinMat, { pos: [0, 0.03, 0] }));
  const H = buildHead({ skin, hair: '#4a2c1f', irisColor: '#3d7a5c', browColor: '#3e2519', style: 'student' });
  H.head.position.y = 0.23; neck.add(H.head);
  const cuff = MAT.cloth('#6544e8', 0.8);
  const arms = [-1, 1].map(sx => { const a = buildArm(hood, skinMat, cuff); a.shoulder.position.set(sx * 0.24, 0.43, 0); spine.add(a.shoulder); return a; });
  // Lightbulb for the "aha".
  const bulb = new THREE.Group();
  bulb.add(m(SPHERE, new THREE.MeshBasicMaterial({ color: '#ffe06a', toneMapped: false }), { scale: [0.055, 0.065, 0.055], cast: false }));
  bulb.add(m(new THREE.CylinderGeometry(0.026, 0.024, 0.04, 24), MAT.metal('#b9c0cc'), { pos: [0, -0.075, 0], cast: false }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffd84a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(0.4, 0.4, 1); bulb.add(glow);
  bulb.position.set(0.12, 1.5, 0.05); bulb.scale.setScalar(0.001);
  root.add(bulb);
  return { root, hips, spine, neck, legs, armR: arms[0], armL: arms[1], bulb, ...H };
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.4, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------- Set: desk, chair, laptop ----------
function buildSet(screenTexture) {
  const set = new THREE.Group();
  const wood = MAT.gloss('#c99a6b', 0.5), leg = MAT.metal('#8f97a6');
  set.add(m(new RoundedBoxGeometry(1.15, 0.045, 0.62, 4, 0.02), wood, { pos: [0, 0.74, -0.36] }));
  for (const [x, z] of [[-0.52, -0.62], [0.52, -0.62], [-0.52, -0.1], [0.52, -0.1]]) set.add(m(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 16), leg, { pos: [x, 0.36, z] }));
  // Chair.
  const chair = MAT.cloth('#565c78', 0.4);
  set.add(m(new RoundedBoxGeometry(0.46, 0.06, 0.42, 4, 0.025), chair, { pos: [0, 0.45, 0.24] }));
  set.add(m(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 16), leg, { pos: [0, 0.21, 0.24] }));
  // Laptop: base and lid; the screen shows the live mirror of the main view.
  const shell = MAT.metal('#c6ccd8');
  const laptop = group([0.02, 0.764, -0.25]);
  laptop.add(m(new RoundedBoxGeometry(0.38, 0.016, 0.26, 3, 0.006), shell, { pos: [0, 0, 0] }));
  laptop.add(m(new THREE.PlaneGeometry(0.33, 0.13), MAT.flat('#2b2f3d'), { pos: [0, 0.0085, 0.02], rot: [-Math.PI / 2, 0, 0], cast: false }));
  const lid = group([0, 0.006, -0.128]);
  lid.rotation.x = -0.22;
  lid.add(m(new RoundedBoxGeometry(0.38, 0.25, 0.012, 3, 0.005), shell, { pos: [0, 0.125, 0] }));
  const screen = m(new THREE.PlaneGeometry(0.35, 0.219), new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false }), { pos: [0, 0.127, 0.0068], cast: false });
  lid.add(screen);
  laptop.add(lid);
  set.add(laptop);
  // Shadow-catching floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  set.add(floor);
  return { set, laptop, screen };
}

// ---------- Poses ----------
// Targets for joints and face; everything eases toward them each frame.
const DEFAULT = {
  spineX: 0, headX: 0, headY: 0, headZ: 0,
  rSx: 0, rSz: -0.12, rEx: -0.15, rWx: 0, rCurl: 0.2,
  lSx: 0, lSz: 0.12, lEx: -0.15, lWx: 0, lCurl: 0.2,
  brow: 0, browTilt: 0, smile: 0.6, jump: 0,
};
const KEYS = Object.keys(DEFAULT);
const DOCTOR = {
  idle: t => ({ headY: 0.12 * Math.sin(t * 0.5), headX: 0.03 * Math.sin(t * 0.9), lSx: -0.15, lEx: -0.9, rSx: -0.12, rEx: -0.25, smile: 0.6 }),
  explain: t => ({ rSx: -0.55 + 0.12 * Math.sin(t * 2.3), rSz: -0.2, rEx: -1.25 + 0.15 * Math.sin(t * 3.1), rCurl: 0,
    lSx: -0.45 + 0.1 * Math.sin(t * 2.0 + 1), lSz: 0.2, lEx: -1.15 + 0.12 * Math.sin(t * 2.7 + 2), lCurl: 0,
    headX: 0.05 * Math.sin(t * 3.4), headY: 0.12 * Math.sin(t * 0.8), brow: 0.35 + 0.25 * Math.max(0, Math.sin(t * 1.7)), smile: 0.75 }),
  pointScreen: t => ({ lSx: -0.95, lSz: 0.42, lEx: -0.45, lCurl: 1.5, rSx: -0.35, rEx: -1.0, headY: 0.32, headX: 0.22 + 0.03 * Math.sin(t * 3), brow: 0.3, smile: 0.7 }),
  pointStage: t => ({ rSx: -0.25, rSz: -1.35 - 0.05 * Math.sin(t * 2), rEx: -0.15, rCurl: 1.5, lSx: -0.2, lEx: -0.7, headY: -0.45, headX: 0.02, brow: 0.4, smile: 0.7 }),
  nod: t => ({ headX: 0.16 * Math.max(0, Math.sin(t * 6.5)), lSx: -0.15, lEx: -0.9, smile: 0.95, brow: 0.2 }),
  thumbs: t => ({ rSx: -1.2, rSz: -0.15, rEx: -1.3, rCurl: 1.6, lSx: -0.15, lEx: -0.9, smile: 1, brow: 0.35, headZ: 0.06 }),
};
const STUDENT = {
  type: t => ({ spineX: 0.12, headX: 0.32, rSx: -0.62, rSz: -0.12, rEx: -1.22 + 0.06 * Math.sin(t * 16), rWx: 0.25, lSx: -0.62, lSz: 0.12, lEx: -1.22 + 0.06 * Math.sin(t * 16 + 2), lWx: 0.25, rCurl: 0.5, lCurl: 0.5, smile: 0.45 }),
  look: t => ({ spineX: 0.02, headX: -0.18, headY: 0.06 * Math.sin(t * 0.7), rSx: -0.6, rEx: -1.15, rWx: 0.25, lSx: -0.6, lEx: -1.15, lWx: 0.25, smile: 0.55, brow: 0.15 }),
  think: t => ({ spineX: 0.05, headX: -0.22, headZ: 0.14, rSx: -1.45, rSz: 0.38, rEx: -2.05, rCurl: 0.9, lSx: -0.6, lEx: -1.15, lWx: 0.25, brow: 0.55, browTilt: 0.35, smile: 0.1 + 0.05 * Math.sin(t * 2) }),
  puzzled: t => ({ headZ: 0.22, headX: -0.08, rSx: -2.55, rSz: 0.25, rEx: -1.4, rCurl: 0.7, lSx: -0.6, lEx: -1.15, brow: 0.2, browTilt: -0.5, smile: 0.0 }),
  aha: t => ({ spineX: -0.08, headX: -0.25, rSx: -2.85, rSz: -0.1, rEx: -0.2, rCurl: 1.5, lSx: -0.55, lEx: -1.1, brow: 1, smile: 1, jump: 0.02 * Math.max(0, Math.sin(t * 8)) }),
  ask: t => ({ spineX: 0.22, headX: 0.4, rSx: -0.75, rEx: -1.12 + 0.09 * Math.sin(t * 22), rWx: 0.25, lSx: -0.75, lEx: -1.12 + 0.09 * Math.sin(t * 22 + 2.4), lWx: 0.25, rCurl: 0.5, lCurl: 0.5, brow: 0.3, smile: 0.35 }),
  celebrate: t => ({ spineX: -0.08, rSx: -2.9, rSz: -0.35 - 0.12 * Math.sin(t * 9), rEx: -0.25, lSx: -2.9, lSz: 0.35 + 0.12 * Math.sin(t * 9), lEx: -0.25, headX: -0.2, brow: 0.9, smile: 1, rCurl: 1.2, lCurl: 1.2 }),
};

function makeActor(rig, poses, initial) {
  const cur = { ...DEFAULT }, target = { ...DEFAULT };
  const st = { action: initial, until: 0, then: initial, mouth: 0, speaking: false, blinkAt: 1 + Math.random() * 2, look: null };
  function apply(dt, t) {
    Object.assign(target, DEFAULT, (poses[st.action] || poses[initial])(t));
    const k = 1 - Math.exp(-dt * 7.5);
    for (const key of KEYS) cur[key] += (target[key] - cur[key]) * k;
    rig.spine.rotation.x = cur.spineX;
    rig.spine.scale.y = 1 + 0.01 * Math.sin(t * 2.2);
    rig.neck.rotation.set(cur.headX, cur.headY, cur.headZ);
    rig.armR.shoulder.rotation.set(cur.rSx, 0, cur.rSz); rig.armR.elbow.rotation.x = cur.rEx; rig.armR.wrist.rotation.x = cur.rWx;
    rig.armL.shoulder.rotation.set(cur.lSx, 0, cur.lSz); rig.armL.elbow.rotation.x = cur.lEx; rig.armL.wrist.rotation.x = cur.lWx;
    // Finger curl: pointing curls the three fingers and thumb but keeps the index straight.
    for (const [arm, c] of [[rig.armR, cur.rCurl], [rig.armL, cur.lCurl]]) {
      arm.fingers.rotation.x = Math.min(1.4, c);
      arm.index.rotation.x = c > 1.2 ? 0 : Math.min(1.2, c);
      arm.thumb.rotation.z = 0.7 - Math.min(0.5, c * 0.3);
    }
    rig.root.position.y = cur.jump;
    // Brows and mouth.
    rig.brows.forEach((b, i) => { b.position.y = 0.105 + cur.brow * 0.018; b.rotation.z = (i ? -1 : 1) * cur.browTilt * 0.25; });
    rig.smile.scale.set(1, 0.4 + cur.smile * 0.9, 1);
    const open = st.speaking ? st.mouth : 0;
    rig.open.scale.y += (Math.max(0.001, open * 0.024) - rig.open.scale.y) * (1 - Math.exp(-dt * 28));
    rig.teeth.visible = rig.open.scale.y > 0.006;
    rig.smile.visible = rig.open.scale.y < 0.012;
    // Blink.
    if (t > st.blinkAt) st.blinkAt = t + 2.2 + Math.random() * 3.2;
    const b = st.blinkAt - t;
    const closed = b > 0 && b < 0.13 ? 1 : 0;
    rig.eyes.forEach(e => { e.lid.rotation.x += ((closed ? 1.25 : -0.62 + cur.brow * -0.12) - e.lid.rotation.x) * (closed ? 1 : 1 - Math.exp(-dt * 20)); });
    // Gaze toward a world point.
    if (st.look) rig.eyes.forEach(e => {
      const p = e.eye.worldToLocal(st.look.clone());
      e.gaze.rotation.y = Math.max(-0.45, Math.min(0.45, Math.atan2(p.x, p.z)));
      e.gaze.rotation.x = Math.max(-0.35, Math.min(0.35, -Math.atan2(p.y, Math.hypot(p.x, p.z))));
    });
    if (st.until && t > st.until) { st.action = st.then; st.until = 0; }
  }
  return {
    st, apply,
    act(name, seconds = 0, then = initial, clock) { st.action = name; st.until = seconds ? clock + seconds : 0; st.then = then; },
    setMouth(level, speaking = true) { st.mouth = level; st.speaking = speaking; },
  };
}

// ---------- The classroom stage ----------
export function createClassroom(container, { screenCanvas } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'room-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight('#e8edff', '#4a3a55', 0.7));
  const key = new THREE.DirectionalLight('#fff0dc', 2.4);
  key.position.set(1.4, 2.6, 2.0); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 5; key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.2, bottom: -0.2, near: 0.5, far: 8 });
  scene.add(key);
  const rim = new THREE.DirectionalLight('#a993ff', 1.8); rim.position.set(-1.6, 1.8, -2.2); scene.add(rim);

  const screenTexture = new THREE.CanvasTexture(screenCanvas || document.createElement('canvas'));
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  const { set, laptop, screen } = buildSet(screenTexture);
  scene.add(set);

  const doc = buildDoctor();
  doc.root.position.set(-0.36, 0, -0.86);
  doc.root.rotation.y = 0.22;
  scene.add(doc.root);
  const stu = buildStudent();
  stu.root.position.set(0.02, 0, 0.26);
  stu.root.rotation.y = Math.PI;              // facing the desk, back to the over-the-shoulder camera
  scene.add(stu.root);

  const doctor = makeActor(doc, DOCTOR, 'idle');
  const student = makeActor(stu, STUDENT, 'type');

  // Camera shots.
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  const SHOTS = {
    shoulder: { pos: v3(1.55, 1.78, 1.6), look: v3(-0.18, 1.12, -0.55) },
    face: { pos: v3(0.62, 1.4, -0.82), look: v3(0.0, 1.2, 0.26) },
  };
  let shot = 'shoulder';
  const camPos = SHOTS.shoulder.pos.clone(), camLook = SHOTS.shoulder.look.clone();
  camera.position.copy(camPos); camera.lookAt(camLook);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // Where people look.
  const screenWorld = new THREE.Vector3(), headWorld = new THREE.Vector3(), docHeadWorld = new THREE.Vector3();
  const clock = new THREE.Clock();
  let t = 0, running = true, screenDirty = false, bulbT = -1;
  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    screen.getWorldPosition(screenWorld);
    stu.head.getWorldPosition(headWorld);
    doc.head.getWorldPosition(docHeadWorld);
    // Gaze: the Student watches the screen while typing, Dr. Tutor otherwise; Dr. Tutor watches the
    // Student, or the screen while pointing at it.
    student.st.look = ['type', 'ask'].includes(student.st.action) ? screenWorld : ['think', 'aha', 'puzzled', 'celebrate'].includes(student.st.action) ? camera.position : docHeadWorld;
    doctor.st.look = doctor.st.action === 'pointScreen' ? screenWorld : doctor.st.action === 'pointStage' ? v3(-3, 1.3, 1) : headWorld;
    doctor.apply(dt, t);
    student.apply(dt, t);
    // Lightbulb pop.
    if (student.st.action === 'aha' && bulbT < 0) bulbT = 0;
    if (bulbT >= 0) {
      bulbT += dt;
      const s = bulbT < 0.3 ? (bulbT / 0.3) * 1.2 : bulbT < 0.45 ? 1.2 - (bulbT - 0.3) * 1.3 : bulbT < 2.2 ? 1 : Math.max(0.001, 1 - (bulbT - 2.2) * 3);
      stu.bulb.scale.setScalar(Math.max(0.001, s));
      stu.bulb.position.y = 1.5 + 0.02 * Math.sin(t * 4);
      if (bulbT > 2.6) bulbT = -1;
    }
    // Camera: ease toward the chosen shot.
    const ck = 1 - Math.exp(-dt * 3.2);
    camPos.lerp(SHOTS[shot].pos, ck); camLook.lerp(SHOTS[shot].look, ck);
    camera.position.copy(camPos); camera.lookAt(camLook);
    if (screenDirty) { screenTexture.needsUpdate = true; screenDirty = false; }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    doctor: { act: (a, s, then) => doctor.act(a, s, then ?? 'idle', t), setMouth: (l, sp) => doctor.setMouth(l, sp), get action() { return doctor.st.action; } },
    student: { act: (a, s, then) => student.act(a, s, then ?? 'type', t), setMouth: (l, sp) => student.setMouth(l, sp), get action() { return student.st.action; } },
    setShot(name) { if (SHOTS[name]) shot = name; },
    screenUpdated() { screenDirty = true; },
    pause: () => { running = false; },
    resume: () => { if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); } },
    three: { scene, camera, renderer, doc, stu, laptop },
  };
}
