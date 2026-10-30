// GLSL for the heart. Every vertex carries its activation time; the shaders turn "time since this point
// activated" into a bright wavefront, a depolarised glow, repolarisation and a small contraction.

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT). Drives the chaotic atrial wavelets in AF.
const NOISE = /* glsl */`
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }`;

// Shared activation logic (vertex stage).
const ACTIVATION = /* glsl */`
  attribute float aDom; attribute float aAct; attribute float aActE;
  uniform float uTA; uniform float uTV; uniform float uEscape; uniform float uAF; uniform float uTime;
  varying float vFront; varying float vDep; varying float vActN; varying float vDom; varying float vContract;
  ${NOISE}
  void activation(vec3 pos) {
    vDom = aDom; vFront = 0.0; vDep = 0.0; vActN = 0.0; vContract = 0.0;
    if (aDom < -0.5) return;
    bool atrial = aDom < 0.5;
    float tl = atrial ? uTA : uTV;
    float act = atrial ? aAct : mix(aAct, aActE, uEscape);
    float since = tl - act;
    float w = atrial ? 11.0 : 9.0;
    vFront = since > -40.0 ? exp(-since * since / (w * w)) : 0.0;
    // Cells that activate later have shorter action potentials, so repolarisation runs in reverse
    // (outside in). That is why a normal T wave points the same way as the QRS.
    float apd = atrial ? 150.0 : 300.0 - 0.7 * (act - 40.0);
    vDep = smoothstep(0.0, 14.0, since) * (1.0 - smoothstep(apd, apd + 110.0, since));
    vContract = smoothstep(25.0, 140.0, since) * (1.0 - smoothstep(apd - 30.0, apd + 140.0, since));
    vActN = atrial ? aAct / 95.0 : (uEscape > 0.5 ? aActE / 140.0 : (aAct - 40.0) / 90.0);
    if (atrial && uAF > 0.5) {
      // Fibrillation: many small wavelets, no organised wave, no atrial squeeze.
      // Thin, fast, wandering ridges: many wavelets chasing each other with no common front.
      float n = snoise(pos * 1.3 + vec3(uTime * 0.0026, -uTime * 0.0021, uTime * 0.0017));
      float m = snoise(pos * 2.4 - vec3(uTime * 0.0039, uTime * 0.0015, -uTime * 0.0029));
      float af = max(pow(1.0 - abs(n), 9.0), 0.75 * pow(1.0 - abs(m), 11.0));
      vFront = af * 1.2; vDep = 0.18 + af * 0.25; vContract = 0.0;
    }
  }`;

export const GLASS_VERT = /* glsl */`
  ${ACTIVATION}
  uniform float uSqueeze;
  varying vec3 vN; varying vec3 vW; varying vec3 vL;
  void main() {
    activation(position);
    vL = position;
    float amp = aDom < 0.5 ? 0.07 : 0.17;
    vec3 p = position - normal * amp * vContract * uSqueeze;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

export const GLASS_FRAG = /* glsl */`
  uniform vec3 uTint; uniform float uReveal; uniform float uDim; uniform float uInner; uniform float uAlpha; uniform float uBody;
  uniform float uMap; uniform float uHighlight; uniform float uWave;
  varying vec3 vN; varying vec3 vW; varying vec3 vL;
  varying float vFront; varying float vDep; varying float vActN; varying float vDom; varying float vContract;
  vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    if (uInner > 0.5) n = -n;
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 2.3);
    vec3 L = normalize(vec3(-0.45, 0.8, 0.6));
    float diff = dot(n, L) * 0.5 + 0.5;
    float spec = pow(max(dot(n, normalize(L + v)), 0.0), 80.0);
    float back = pow(max(dot(n, normalize(vec3(0.7, -0.25, -0.65))), 0.0), 2.0);
    float fib = sin(vL.y * 6.5 + sin(vL.x * 2.1 + vL.z * 1.6) * 2.2) * 0.5 + 0.5;
    vec3 tint = uTint * (1.0 + uHighlight * 0.6);
    vec3 base = tint * (0.09 + 0.30 * diff) * (0.84 + 0.16 * fib);
    vec3 rim = mix(tint, vec3(1.0), 0.35) * fres * 0.95 + vec3(0.5, 0.72, 1.0) * back * 0.32;
    vec3 col = base + rim + vec3(1.0) * spec * 0.75;
    float a = uBody + 0.6 * fres + spec * 0.6 + 0.05 * diff + uHighlight * 0.12;
    // Electrical state: warm depolarised glow, white-hot wavefront.
    col += vec3(1.0, 0.36, 0.26) * vDep * (0.5 + 0.7 * fres) * uWave;
    col += vec3(1.5, 1.2, 0.95) * vFront * (0.75 + 0.9 * fres) * uWave;
    a += (vDep * 0.13 + vFront * 0.42) * uWave;
    if (uMap > 0.5 && vDom > -0.5) {
      // Activation map: earliest red, latest purple, with 10 ms isochrone lines.
      float t = clamp(vActN, 0.0, 1.0);
      vec3 m = hsv(t * 0.78, 0.85, 1.0);
      float iso = fract(t * 9.0);
      float line = 1.0 - smoothstep(0.0, 0.07, iso) * smoothstep(1.0, 0.93, iso);
      col = m * (0.35 + 0.55 * diff) + vec3(1.0) * spec * 0.4 + m * fres * 0.6;
      col *= 1.0 - 0.55 * line;
      a = max(a, 0.62);
    }
    if (uInner > 0.5) { col *= 0.5; a *= 0.42; }
    a *= (1.0 - 0.9 * uReveal) * uDim * uAlpha;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }`;

export const PATH_VERT = /* glsl */`
  ${ACTIVATION}
  void main() {
    activation(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

export const PATH_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uLevel; uniform float uMap; uniform float uHighlight; uniform float uFrontGain;
  varying float vFront; varying float vDep; varying float vActN; varying float vDom; varying float vContract;
  void main() {
    float idle = uMap > 0.5 ? 0.25 : 0.32;
    vec3 col = uColor * uLevel * (idle + 0.35 * vDep + uHighlight * 0.8);
    col += vec3(1.6, 2.2, 2.5) * vFront * uFrontGain * uLevel;
    gl_FragColor = vec4(col, 1.0);
  }`;

export const BG_FRAG = /* glsl */`
  uniform vec3 uCentre; uniform vec3 uEdge; uniform float uAspect; varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5; p.x *= uAspect;
    float r = length(p);
    vec3 c = mix(uCentre, uEdge, smoothstep(0.0, 0.8, r));
    c += vec3(0.05, 0.03, 0.16) * exp(-r * r * 6.0);
    gl_FragColor = vec4(c, 1.0);
  }`;
