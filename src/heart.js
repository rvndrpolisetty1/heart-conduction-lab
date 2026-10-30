// The 3D heart: meshes built from the anatomy shapes, glass shaders driven by activation times, the
// glowing conduction system, block markers, bloom, an orbiting camera and a hover readout.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceNets } from './sdf.js';
import { PARTS, SA, AV, CONDUCTION, HEART_CENTRE } from './anatomy.js';
import { conductionCurves, buildFields, wallAttributes, escapeTime } from './activation.js';

// Baked meshes and activation times (tools/bake.mjs). Null if missing: then everything is computed live.
async function loadBaked() {
  try {
    const [man, buf] = await Promise.all([
      fetch('assets/heart.json').then(r => r.ok ? r.json() : Promise.reject(r.status)),
      // Hosts that serve no raw binary get the same bytes as base64 text (tools/build.mjs).
      fetch('assets/heart.bin').then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
        .catch(() => fetch('assets/heart.b64.txt').then(r => r.ok ? r.text() : Promise.reject(r.status))
          .then(t => Uint8Array.from(atob(t.trim()), c => c.charCodeAt(0)).buffer)),
    ]);
    return { man, buf };
  } catch { return null; }
}
function bakedGeometry({ man, buf }, id) {
  const p = man.parts.find(x => x.id === id);
  const n = p.vertices;
  const pos16 = new Int16Array(buf, p.at.pos, n * 3), nor8 = new Int8Array(buf, p.at.nor, n * 3);
  const act16 = new Uint16Array(buf, p.at.act, n), actE16 = new Uint16Array(buf, p.at.actE, n), dom8 = new Int8Array(buf, p.at.dom, n);
  const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) { positions[i] = pos16[i] / man.posScale; normals[i] = nor8[i] / 127; }
  const act = new Float32Array(n), actE = new Float32Array(n), dom = new Float32Array(n);
  for (let i = 0; i < n; i++) { act[i] = act16[i] / man.actScale; actE[i] = actE16[i] / man.actScale; dom[i] = dom8[i]; }
  const indices = p.index32 ? new Uint32Array(buf, p.at.idx, p.indices) : new Uint16Array(buf, p.at.idx, p.indices);
  return { positions, normals, indices, at: { act, actE, dom } };
}
import { GLASS_VERT, GLASS_FRAG, PATH_VERT, PATH_FRAG, BG_FRAG } from './shaders.js';

const hdr = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const COLORS = {
  path: hdr(0.45, 1.7, 2.5),
  purkinje: hdr(0.2, 0.75, 1.15),
  node: hdr(1.5, 2.3, 2.7),
  block: hdr(3.2, 0.35, 0.3),
};
const ROLE = {
  shell: { alpha: 1.0, body: 0.05, back: true, step: 0.1 },
  cavity: { alpha: 0.42, body: 0.04, back: false, step: 0.1 },
  vessel: { alpha: 0.75, body: 0.05, back: true, step: 0.12 },
};
const NAMES = {
  shell: 'Heart wall (myocardium)', lv: 'Left ventricle', rv: 'Right ventricle', ra: 'Right atrium', la: 'Left atrium',
  aorta: 'Aorta', pulmonary: 'Pulmonary trunk and arteries', venaCava: 'Superior and inferior vena cava', pulmVeins: 'Pulmonary veins',
  atrial: 'Atrial pathways (internodal and Bachmann\'s bundle)', his: 'Bundle of His', bundles: 'Bundle branches (right, left anterior, left posterior)',
  purkinje: 'Purkinje fibres', sa: 'SA node: the natural pacemaker', av: 'AV node: the gatekeeper',
};
const PRIORITY = { sa: 9, av: 9, his: 8, bundles: 8, atrial: 7, purkinje: 7, lv: 5, rv: 5, ra: 5, la: 5, aorta: 4, pulmonary: 4, venaCava: 4, pulmVeins: 4, shell: 1 };

export async function createHeart(container, { onProgress = () => {}, engine } = {}) {
  const bvh = await import('three-mesh-bvh').catch(() => null);
  if (bvh) {
    THREE.BufferGeometry.prototype.computeBoundsTree = bvh.computeBoundsTree;
    THREE.Mesh.prototype.raycast = bvh.acceleratedRaycast;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  // Adaptive quality: start sharp, step the resolution down if frames run slow (checked once a second).
  const maxDpr = Math.min(devicePixelRatio || 1, 2);
  let dpr = window.__recording ? maxDpr : Math.min(maxDpr, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'heart-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  camera.position.set(0, 0.6, 33);
  scene.add(camera);

  const bgMat = new THREE.ShaderMaterial({
    uniforms: { uCentre: { value: new THREE.Color('#1c1745') }, uEdge: { value: new THREE.Color('#0b0d1d') }, uAspect: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: BG_FRAG, depthWrite: false, depthTest: false,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false; bg.renderOrder = -10;
  scene.add(bg);

  const heart = new THREE.Group();
  heart.rotation.set(0.12, -0.32, 0.42);
  const inner = new THREE.Group();
  inner.position.set(-HEART_CENTRE[0], -HEART_CENTRE[1], -HEART_CENTRE[2]);
  heart.add(inner);
  scene.add(heart);

  // Uniforms every material shares: the clocks and modes.
  const shared = {
    uTA: { value: 1e6 }, uTV: { value: 1e6 }, uEscape: { value: 0 }, uAF: { value: 0 }, uTime: { value: 0 },
    uMap: { value: 0 }, uSqueeze: { value: 1 }, uWave: { value: 1 },
  };

  onProgress('Loading the heart', 0.02);
  const baked = await loadBaked();
  let curves, fields = null, escapeParams;
  if (baked) {
    curves = baked.man.curves;
    escapeParams = baked.man.escape;
  } else {
    onProgress('Mapping activation times', 0.05);
    await new Promise(requestAnimationFrame);
    curves = conductionCurves();
    fields = buildFields(curves);
    escapeParams = fields.escapeParams;
  }

  // 1. Walls: surface nets per part, activation attributes per vertex.
  const parts = {};
  const pickables = [];
  for (let i = 0; i < PARTS.length; i++) {
    const part = PARTS[i];
    const role = ROLE[part.role];
    let m;
    if (baked) m = bakedGeometry(baked, part.id);
    else {
      onProgress(`Building ${NAMES[part.id] || part.id}`, 0.1 + 0.75 * i / PARTS.length);
      await new Promise(requestAnimationFrame);
      m = surfaceNets(part.f, part.min, part.max, role.step);
      const kind = part.role === 'vessel' ? 'none' : part.role === 'shell' ? 'auto' : (part.group === 'atria' ? 'atrial' : 'ventricular');
      m.at = wallAttributes(m.positions, fields, kind);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
    const at = m.at;
    geo.setAttribute('aDom', new THREE.BufferAttribute(at.dom, 1));
    geo.setAttribute('aAct', new THREE.BufferAttribute(at.act, 1));
    geo.setAttribute('aActE', new THREE.BufferAttribute(at.actE, 1));
    geo.computeBoundsTree?.();
    const own = () => ({
      uTint: { value: new THREE.Color().setRGB(...part.tint) }, uReveal: { value: 0 }, uDim: { value: 1 }, uInner: { value: 0 },
      uAlpha: { value: role.alpha }, uBody: { value: role.body }, uHighlight: { value: 0 },
    });
    const mat = side => new THREE.ShaderMaterial({ uniforms: { ...shared, ...own() }, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
      transparent: true, depthWrite: false, side });
    const mats = [mat(THREE.FrontSide)];
    const front = new THREE.Mesh(geo, mats[0]);
    front.renderOrder = part.role === 'cavity' ? 1 : 3;
    front.userData.pick = part.id;
    inner.add(front);
    pickables.push(front);
    if (role.back) {
      const back = mat(THREE.BackSide);
      back.uniforms.uInner.value = 1;
      const mesh = new THREE.Mesh(geo, back); mesh.renderOrder = 0;
      inner.add(mesh);
      mats.push(back);
    }
    parts[part.id] = { part, mats, dim: 1, targetDim: 1, hl: 0 };
  }

  // 2. Conduction system: tubes carrying their own activation times.
  onProgress('Laying the conduction path', 0.9);
  await new Promise(requestAnimationFrame);
  const groupOf = c => c.dom === 0 ? 'atrial' : c.id === 'his' ? 'his' : c.id === 'purkinje' ? 'purkinje' : 'bundles';
  const RADIUS = { atrial: 0.05, his: 0.12, bundles: 0.085, purkinje: 0.02 };
  const byGroup = {};
  for (const c of curves) {
    const g = groupOf(c);
    const curve = new THREE.CatmullRomCurve3(c.pts.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);
    const tube = new THREE.TubeGeometry(curve, g === 'purkinje' ? 24 : 48, RADIUS[g], 8, false);
    const n = tube.attributes.position.count, uv = tube.attributes.uv, pos = tube.attributes.position;
    const dom = new Float32Array(n).fill(c.dom), act = new Float32Array(n), actE = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      act[v] = c.t0 + (c.t1 - c.t0) * uv.getX(v);
      if (c.dom === 1) actE[v] = escapeTime(escapeParams, [pos.getX(v), pos.getY(v), pos.getZ(v)]);
    }
    tube.setAttribute('aDom', new THREE.BufferAttribute(dom, 1));
    tube.setAttribute('aAct', new THREE.BufferAttribute(act, 1));
    tube.setAttribute('aActE', new THREE.BufferAttribute(actE, 1));
    (byGroup[g] ||= []).push(tube);
  }
  const conduction = {};
  for (const [g, geos] of Object.entries(byGroup)) {
    const geo = mergeGeometries(geos);
    geo.computeBoundsTree?.();
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uColor: { value: (g === 'purkinje' ? COLORS.purkinje : COLORS.path).clone() }, uLevel: { value: 1 }, uHighlight: { value: 0 },
        uFrontGain: { value: { atrial: 1.0, his: 1.1, bundles: 0.9, purkinje: 0.75 }[g] } },
      vertexShader: PATH_VERT, fragmentShader: PATH_FRAG,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2; mesh.userData.pick = g;
    inner.add(mesh); pickables.push(mesh);
    conduction[g] = { mesh, level: 1, target: 1 };
  }
  // Nodes and the block marker.
  const nodeGeo = new THREE.SphereGeometry(1, 32, 16);
  const nodes = {};
  for (const [id, p, r] of [['sa', SA, 0.22], ['av', AV, 0.2]]) {
    const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color: COLORS.node.clone() }));
    mesh.position.set(...p); mesh.scale.setScalar(r); mesh.renderOrder = 2; mesh.userData.pick = id;
    inner.add(mesh); pickables.push(mesh);
    nodes[id] = { mesh, r, level: 1, target: 1 };
  }
  const blockMarker = new THREE.Group();
  const blockCore = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color: COLORS.block.clone(), transparent: true, depthWrite: false }));
  blockCore.scale.setScalar(0.24);
  const blockRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 12, 64), new THREE.MeshBasicMaterial({ color: COLORS.block.clone(), transparent: true, depthWrite: false }));
  blockMarker.add(blockCore, blockRing);
  blockMarker.visible = false; blockMarker.renderOrder = 5;
  inner.add(blockMarker);
  const BLOCK_SITE = { av: new THREE.Vector3(...AV), his: new THREE.Vector3(...CONDUCTION.his[1]) };

  // 3. Floating dust, for depth.
  const dustN = 420, dust = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    const r = 9 + Math.random() * 14, th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
    dust.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.7, r * Math.sin(ph) * Math.sin(th) - 6], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: hdr(0.5, 0.6, 1.0), size: 0.07, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dustPts);

  // 4. Post: bloom on the bright parts only.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // 5. Camera.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.enablePan = false; controls.minDistance = 7; controls.maxDistance = 56;
  // Reduced motion: no idle spin and no camera flights; the heartbeat itself still plays.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotate = !still; controls.autoRotateSpeed = 0.45;
  let idleTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener('end', () => { if (!still) idleTimer = setTimeout(() => { controls.autoRotate = true; }, 5000); });

  function resize() {
    let w = container.clientWidth, h = container.clientHeight;
    // Hidden (another view is showing): keep rendering at the last size, or a default one, so mirrors
    // of the heart elsewhere (the laptop, a lesson preview) still have a picture.
    if (!w || !h) { const cur = renderer.getSize(new THREE.Vector2()); if (cur.x >= 480 && cur.y >= 300) return; w = 900; h = 560; }
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    const base = w < 560 ? 42 : 33;   // phones: pull back so the chips and tools don't sit on the heart
    if (!zoomed) camera.position.setLength(camera.aspect < 0.9 ? base / Math.max(camera.aspect, 0.55) * 0.9 : base);
    camera.updateProjectionMatrix();
    bgMat.uniforms.uAspect.value = camera.aspect;
  }
  let zoomed = false;
  new ResizeObserver(resize).observe(container);
  resize();

  // 6. Hover readout: what is under the pointer, and when it activates.
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = false;
  const ndc = new THREE.Vector2();
  let hoverListener = () => {}, hovered = null, pointer = null, pointerDirty = false;
  renderer.domElement.addEventListener('pointermove', e => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    pointerDirty = true;
  });
  renderer.domElement.addEventListener('pointerleave', () => { pointer = null; pointerDirty = true; });
  function pick() {
    pointerDirty = false;
    let info = null;
    if (pointer) {
      ndc.set(pointer.x / pointer.w * 2 - 1, -(pointer.y / pointer.h) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(pickables, false).slice(0, 8);
      let best = null;
      for (const h of hits) {
        const id = h.object.userData.pick;
        if (!best || PRIORITY[id] > PRIORITY[best.object.userData.pick]) best = h;
      }
      if (best) {
        const id = best.object.userData.pick, g = best.object.geometry;
        const dom = g.attributes.aDom?.getX(best.face.a), act = g.attributes.aAct?.getX(best.face.a);
        info = { id, name: NAMES[id], x: pointer.x, y: pointer.y, dom, act };
      }
    }
    const id = info?.id || null;
    if (id !== hovered) {
      hovered = id;
      for (const [pid, p] of Object.entries(parts)) p.hl = pid === id ? 1 : 0;
      for (const [cid, c] of Object.entries(conduction)) c.mesh.material.uniforms.uHighlight.value = cid === id ? 1 : 0;
      renderer.domElement.style.cursor = id ? 'pointer' : '';
    }
    hoverListener(info);
  }

  // UI-driven state.
  let reveal = 0, revealTarget = 0;
  const FOCUS = {
    all: { parts: null, path: null },
    atria: { parts: ['ra', 'la'], path: ['sa', 'atrial'] },
    av: { parts: [], path: ['av', 'his'] },
    ventricles: { parts: ['lv', 'rv'], path: ['bundles', 'purkinje'] },
  };
  function setFocus(name) {
    const f = FOCUS[name] || FOCUS.all;
    for (const [id, p] of Object.entries(parts)) {
      if (!f.parts) p.targetDim = 1;
      else if (id === 'shell') p.targetDim = 0.45;
      else p.targetDim = f.parts.includes(id) ? 1.6 : 0.2;
    }
    for (const [id, c] of Object.entries(conduction)) c.target = !f.path || f.path.includes(id) ? 1 : 0.2;
    for (const [id, nd] of Object.entries(nodes)) nd.target = !f.path || f.path.includes(id) ? 1 : 0.25;
  }

  // 7. Frame loop: advance the clock, push the engine state into the shaders.
  const clock = new THREE.Clock();
  let running = true, speed = 1, paused = false, stateListener = () => {};
  let perfT = 0, perfN = 0, settled = 0;
  function adapt(rawDt) {
    if (settled > 4 || window.__recording) return;
    perfT += rawDt; perfN++;
    if (perfT < 1) return;
    const fps = perfN / perfT;
    perfT = 0; perfN = 0;
    if (fps < 52 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); resize(); settled = 0; }
    else settled++;
  }
  function frame() {
    if (!running) return;
    const raw = clock.getDelta();
    adapt(raw);
    const dt = Math.min(raw, 0.05);
    const k = 1 - Math.exp(-dt * 6);

    if (engine && !paused) engine.advance(dt * 1000 * speed);
    const s = engine?.state();
    if (s) {
      shared.uTA.value = s.tA; shared.uTV.value = s.tV; shared.uEscape.value = s.escape; shared.uAF.value = s.af;
      shared.uTime.value = s.t;
      // SA node flashes as it fires; AV node glows while it holds the signal.
      const saGlow = s.af ? 0.12 + 0.1 * Math.random() : 0.3 + 1.0 * Math.exp(-((s.tA / 28) ** 2));
      nodes.sa.mesh.material.color.copy(COLORS.node).multiplyScalar(saGlow * nodes.sa.level);
      nodes.sa.mesh.scale.setScalar(nodes.sa.r * (1 + 0.5 * Math.exp(-((s.tA / 40) ** 2)) * (1 - s.af)));
      const avGlow = 0.3 + s.av * (1.1 + 0.25 * Math.sin(s.t / 30));
      nodes.av.mesh.material.color.copy(COLORS.node).multiplyScalar(avGlow * nodes.av.level);
      nodes.av.mesh.scale.setScalar(nodes.av.r * (1 + 0.35 * s.av));
      blockMarker.visible = s.blockFlash > 0.01;
      if (blockMarker.visible) {
        blockMarker.position.copy(BLOCK_SITE[s.block] || BLOCK_SITE.av);
        blockMarker.quaternion.copy(camera.quaternion).premultiply(heart.quaternion.clone().invert());
        blockCore.material.opacity = s.blockFlash; blockRing.material.opacity = s.blockFlash;
        blockRing.scale.setScalar(1 + (1 - s.blockFlash) * 0.8);
      }
      stateListener(s);
    }

    reveal += (revealTarget - reveal) * k;
    for (const p of Object.values(parts)) {
      p.dim += (p.targetDim - p.dim) * k;
      for (const m of p.mats) { m.uniforms.uReveal.value = reveal; m.uniforms.uDim.value = p.dim; m.uniforms.uHighlight.value = p.hl; }
    }
    for (const c of Object.values(conduction)) {
      c.level += (c.target - c.level) * k;
      c.mesh.material.uniforms.uLevel.value = c.level * (1 + reveal * 0.35);
    }
    for (const nd of Object.values(nodes)) nd.level += (nd.target - nd.level) * k;
    if (pointerDirty || (pointer && Math.random() < 0.1)) pick();
    dustPts.rotation.y += dt * 0.01;
    // Camera flight between zoom layers: ease the orbit target and the distance, keep the direction.
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur);
      const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, flight.fromDist + (flight.toDist - flight.fromDist) * e);
      if (flight.t >= 1) flight = null;
    }
    animateMarkers(dt);
    if (Math.abs(shiftTarget - shift) > 1e-4) {
      shift += (shiftTarget - shift) * (1 - Math.exp(-dt * 5));
      camera.filmOffset = shift * camera.getFilmWidth();
      camera.updateProjectionMatrix();
    }
    controls.update();
    composer.render();
    frameListener();
    requestAnimationFrame(frame);
  }
  let flight = null, frameListener = () => {};

  // Generated 3D markers: a ring and a glowing core that build in (wireframe, then solid) at a landmark.
  const markers = [];
  const MARK_COLORS = { gold: hdr(2.2, 1.6, 0.45), red: hdr(2.6, 0.35, 0.3), cyan: hdr(0.5, 2.2, 2.8) };
  function addMarker(part, { label = '', color = 'gold' } = {}) {
    const p = LANDMARKS[part];
    if (!p) return null;
    const col = MARK_COLORS[color] || MARK_COLORS.gold;
    const g = new THREE.Group();
    g.position.set(...p);
    const ringGeo = new THREE.TorusGeometry(0.62, 0.05, 16, 72);
    const wire = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 8, 36), new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, depthWrite: false }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false }));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false }));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.02, 8, 72), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false }));
    g.add(wire, ring, core, halo);
    g.renderOrder = 6; g.scale.setScalar(0.001);
    inner.add(g);
    const m = { id: `gen-${markers.length}`, part, label, color, g, wire, ring, core, halo, t: 0 };
    markers.push(m);
    markerListener();
    return m;
  }
  function clearMarkers() {
    for (const m of markers) inner.remove(m.g);
    markers.length = 0;
    markerListener();
  }
  let markerListener = () => {};
  function animateMarkers(dt) {
    for (const m of markers) {
      m.t += dt;
      const t = m.t;
      m.g.quaternion.copy(camera.quaternion).premultiply(heart.quaternion.clone().invert());
      m.g.scale.setScalar(Math.min(1, 0.001 + t / 0.45) * (1 + 0.04 * Math.sin(t * 4)));
      const solid = Math.min(1, Math.max(0, (t - 0.5) / 0.6));
      m.wire.material.opacity = (1 - solid) * 0.9;
      m.ring.material.opacity = solid;
      m.core.material.opacity = solid * (0.7 + 0.3 * Math.sin(t * 5));
      const pulse = (t * 0.8) % 1;
      m.halo.scale.setScalar(1 + pulse * 0.9);
      m.halo.material.opacity = solid * (1 - pulse) * 0.8;
    }
  }
  // Shift the picture sideways (fraction of the width) so a panel can sit beside the heart.
  let shift = 0, shiftTarget = 0;
  function flyTo(id, dist, dur = 1.6) {
    const to = new THREE.Vector3();
    if (id && LANDMARKS[id]) { to.set(...LANDMARKS[id]); inner.localToWorld(to); }
    flight = { t: 0, dur: still ? 0.01 : dur, fromTarget: controls.target.clone(), toTarget: to, fromDist: camera.position.distanceTo(controls.target), toDist: dist };
  }
  const baseDistance = () => (container.clientWidth < 560 ? 42 : 33) / (camera.aspect < 0.9 ? Math.max(camera.aspect, 0.55) / 0.9 : 1);
  // Landmarks the characters can point at, in heart coordinates.
  const LANDMARKS = {
    sa: SA, av: AV, his: CONDUCTION.his[1], atria: [-2.4, 1.6, 0.4], ventricles: [1.0, -2.2, 0.6], purkinje: [1.6, -3.4, 0.2],
    ra: [-2.9, 1.2, 0.8], la: [1.6, 2.4, -1.9], rv: [-0.3, -1.4, 2.3], lv: [2.6, -1.4, -0.6], aorta: [-0.4, 4.9, -0.2],
    conduction: [-0.3, -0.4, 0.2], bundles: CONDUCTION.leftAnterior[2], internodal: CONDUCTION.internodalMiddle[2],
  };
  const lv = new THREE.Vector3();
  function screenOf(id) {
    const p = LANDMARKS[id];
    if (!p) return null;
    lv.set(...p);
    inner.localToWorld(lv);
    lv.project(camera);
    const w = container.clientWidth, h = container.clientHeight;
    return { x: (lv.x * 0.5 + 0.5) * w, y: (-lv.y * 0.5 + 0.5) * h, visible: lv.z < 1 };
  }

  onProgress('Ready', 1);
  requestAnimationFrame(frame);

  return {
    setReveal: v => { revealTarget = v; },
    setFocus,
    setSpeed: v => { speed = v; },
    setPaused: v => { paused = v; },
    get paused() { return paused; },
    setMap: on => { shared.uMap.value = on ? 1 : 0; },
    screenOf,
    landmarks: Object.keys(LANDMARKS),
    // Zoom layers: 0 whole heart, 1 conduction system, 2 AV node close-up.
    setLayer(n) {
      zoomed = n > 0;
      const base = baseDistance();
      if (n === 0) flyTo(null, base);
      if (n === 1) flyTo('conduction', base * 0.72);
      if (n === 2) flyTo('av', base * 0.3);
    },
    onFrame: fn => { frameListener = fn; },
    addMarker, clearMarkers,
    markers: () => markers.map(({ id, part, label, color }) => ({ id, part, label, color })),
    onMarkers: fn => { markerListener = fn; },
    setShift: f => { shiftTarget = f; },
    onHover: fn => { hoverListener = fn; },
    onState: fn => { stateListener = fn; },
    pause: () => { running = false; },
    resume: () => { if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); } },
    three: { scene, camera, renderer, heart, controls, parts, conduction, nodes, shared },
  };
}
