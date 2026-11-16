// GLSL sources. Four programs: sky, floor, mesh (these three include the room's GLSL) and glow.
// WebGL 1 rules kept here: the derivatives #extension line comes first; room uniforms live only in
// fragment shaders (no precision mismatch with vertex shaders); no mat3(mat4) constructors.

function header(deriv) {
  return (deriv ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIV 1\n' : '') + `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
}

// Shared fragment prelude for every room program. Rooms may use everything declared here.
export const PRELUDE = `
uniform vec4 uFx;        // time (s, wrapped), beat 0..1, punch 0..1, chaos 0..1
uniform vec4 uFx2;       // variant, beatIndex, cutAge (s), reducedMotion 0/1
uniform vec4 uBite;      // world x, world z, age (s), 1 if there was a bite
uniform vec3 uPal[8];    // room palette; [0] ambient sky, [1] ambient ground, rest room-defined
uniform vec4 uRoom[4];   // free room parameters
uniform vec3 uEye;       // camera position
uniform vec2 uBoard;     // board half extents (cols/2, rows/2)
uniform float uPix;      // approx. angular size of a pixel, for derivative fallback
uniform vec3 uFog;       // horizon haze colour (F.fog), used for distance fog
#define uTime uFx.x
#define uBeat uFx.y
#define uPunch uFx.z
#define uChaos uFx.w
#define uVariant uFx2.x
#define uBeatIndex uFx2.y
#define uCutAge uFx2.z
const float PI = 3.14159265;
float gDist = 1.0;       // distance from eye to the fragment (set by main before room code runs)
float gSinElev = 1.0;    // |V.y|, for the no-derivatives fallback
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
// Screen-space filter width of a 2D coordinate.
vec2 aaWidth(vec2 p) {
#ifdef HAS_DERIV
  return fwidth(p);
#else
  float w = gDist * uPix / max(gSinElev, 0.06);
  return vec2(w);
#endif
}
// Box-filtered checker (0/1), p in tile units.
float checkerAA(vec2 p, vec2 w) {
  w = max(w, vec2(0.0001));
  vec2 i = 2.0 * (abs(fract((p - 0.5 * w) * 0.5) - 0.5) - abs(fract((p + 0.5 * w) * 0.5) - 0.5)) / w;
  return 0.5 - 0.5 * i.x * i.y;
}
// Anti-aliased grid lines at integer coordinates; hw = half width in the same units.
float gridAA(vec2 p, float hw, vec2 w) {
  w = max(w, vec2(0.0001));
  vec2 g = abs(fract(p + 0.5) - 0.5);
  vec2 l = 1.0 - smoothstep(vec2(hw) - w, vec2(hw) + w, g);
  return max(l.x, l.y);
}
`;

// ---------- sky ----------
export const SKY_VS = `
attribute vec2 aPos;
uniform vec3 uCamF, uCamR, uCamU;   // forward, right*tanX, up*tanY
varying vec3 vDir;
void main() {
  vDir = uCamF + aPos.x * uCamR + aPos.y * uCamU;
  gl_Position = vec4(aPos, 0.999, 1.0);
}`;

export function skyFS(deriv, room) {
  return header(deriv) + PRELUDE + room.sky + `
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  gDist = 10000.0;
  d.y = abs(d.y);  // below the horizon the sky pass shows the mirror image (seen through the glossy floor)
  gl_FragColor = vec4(roomSky(d), 1.0);
}`;
}

// ---------- floor ----------
export const FLOOR_VS = `
attribute vec2 aPos;
uniform mat4 uViewProj;
varying vec3 vWorld;
void main() {
  vWorld = vec3(aPos.x, 0.0, aPos.y);
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}`;

export function floorFS(deriv, room) {
  return header(deriv) + PRELUDE + room.sky + room.floor + `
uniform vec3 uPanel, uGrid, uFrame;
uniform vec4 uBoardStyle;   // x grid half-width (cells), y frame band width, z grid glow, w frame outer glow
varying vec3 vWorld;
void main() {
  vec3 toP = vWorld - uEye;
  float dist = length(toP);
  vec3 V = toP / dist;
  gDist = dist;
  gSinElev = abs(V.y);
  vec2 p = vWorld.xz;
  vec2 dd = abs(p) - uBoard;
  float sd = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0);
  vec2 w = aaWidth(p);
  float fog = smoothstep(70.0, 1500.0, dist);
  vec3 col;
  float alpha = 1.0;
  if (sd < 0.0) {
    vec2 q = p + uBoard;
    float line = gridAA(q, uBoardStyle.x, w);
    vec2 g = abs(fract(q + 0.5) - 0.5);
    vec2 e = exp(-g * 16.0);
    float glow = max(e.x, e.y) * uBoardStyle.z;
    col = uPanel + uGrid * (line + glow * 0.3);
  } else {
    float gloss = 0.0;
    vec3 n = vec3(0.0, 1.0, 0.0);
    col = roomFloor(p, dist, gloss, n);
    n = normalize(n);
    vec3 R = reflect(V, n);
    R.y = abs(R.y);
    float fres = pow(1.0 - clamp(-dot(V, n), 0.0, 1.0), 5.0);
    float k = clamp(gloss * (0.35 + 0.65 * fres), 0.0, 1.0);
    col = mix(col, roomSky(R), k);
    alpha = 1.0 - clamp(gloss, 0.0, 1.0) * 0.5;
    float band = uBoardStyle.y;
    float aw = max(max(w.x, w.y), 0.0001);
    float fb = 1.0 - smoothstep(band - aw, band + aw, sd);
    col = mix(col, uFrame, fb);
    alpha = max(alpha, fb);
    col += uFrame * exp(-max(sd - band, 0.0) * 2.0) * uBoardStyle.w;
  }
  col = mix(col, uFog, fog);
  alpha = mix(alpha, 1.0, fog);
  gl_FragColor = vec4(col, alpha);
}`;
}

// ---------- mesh ----------
export const MESH_VS = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec2 aUV;
uniform mat4 uViewProj;
uniform mat4 uModel;
varying vec3 vWorld;
varying vec3 vNrm;
varying vec2 vUV;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNrm = (uModel * vec4(aNrm, 0.0)).xyz;
  vUV = aUV;
  gl_Position = uViewProj * w;
}`;

export function meshFS(deriv, room) {
  return header(deriv) + PRELUDE + room.sky + `
uniform vec3 uColor, uEmissive, uLineCol, uRim;
uniform vec4 uMat;    // x chrome 0..1, y lines per UV unit (0 = none), z line half-width, w mode (0 solid, 1 arches, 2 texture)
uniform vec4 uMat2;   // x two-sided, y/z UV scale, w fog 0..1
uniform sampler2D uTex;
varying vec3 vWorld;
varying vec3 vNrm;
varying vec2 vUV;
void main() {
  vec3 toP = vWorld - uEye;
  float dist = length(toP);
  vec3 V = toP / dist;
  gDist = dist;
  vec3 n = normalize(vNrm);
  if (uMat2.x > 0.5 && dot(n, V) > 0.0) n = -n;
  vec2 uv = vUV * uMat2.yz;
  if (uMat.w > 0.5 && uMat.w < 1.5) {
    // arcade: one round-topped opening per UV unit along x
    vec2 a = vec2(fract(uv.x) - 0.5, vUV.y);
    if (abs(a.x) < 0.3 && a.y < 0.82 && (a.y < 0.52 || length(vec2(a.x, a.y - 0.52)) < 0.3)) discard;
  }
  vec3 base = uColor;
  if (uMat.w > 1.5) base *= texture2D(uTex, vUV * uMat2.yz).rgb;
  float hemi = 0.5 + 0.5 * n.y;
  vec3 col = base * (0.3 + mix(uPal[1], uPal[0], hemi));
  if (uMat.x > 0.0) {
    vec3 R = reflect(V, n);
    float fres = pow(1.0 - clamp(-dot(V, n), 0.0, 1.0), 3.0);
    col = mix(col, roomSky(R), clamp(uMat.x * (0.55 + 0.45 * fres), 0.0, 1.0));
  }
  if (uMat.y > 0.0) {
    vec2 lu = uv * uMat.y;
#ifdef HAS_DERIV
    vec2 fw = fwidth(lu);
#else
    vec2 fw = vec2(0.02);
#endif
    col += uLineCol * gridAA(lu, uMat.z, fw);
  }
  float rim = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 3.0);
  col += uRim * rim + uEmissive;
  float fog = smoothstep(90.0, 1500.0, dist) * uMat2.w;
  col = mix(col, uFog, fog);
  gl_FragColor = vec4(col, 1.0);
}`;
}

// ---------- glow (additive, shared by all rooms) ----------
export const GLOW_VS = `
attribute vec3 aPos;
attribute vec2 aUV;
uniform mat4 uViewProj;
uniform mat4 uModel;
varying vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = uViewProj * (uModel * vec4(aPos, 1.0));
}`;

export function glowFS() {
  return `precision mediump float;
uniform vec3 uColor;
uniform vec4 uGlow;     // x mode (0 blob, 1 ring, 2 energy wall, 3 beam, 4 laser, 5 smoke), y intensity, z/w mode params
uniform float uGTime;
varying vec2 vUV;
float gHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 c = vUV * 2.0 - 1.0;
  float m = uGlow.x;
  float a = 0.0;
  if (m < 0.5) {
    float d = length(c);
    a = exp(-d * d * 3.5) * (1.0 - smoothstep(0.7, 1.0, d));
  } else if (m < 1.5) {
    float r = length(c);
    float t = (r - uGlow.z) / max(uGlow.w, 0.001);
    a = exp(-t * t) * (1.0 - smoothstep(0.9, 1.0, r));
  } else if (m < 2.5) {
    float y = vUV.y;
    float scan = 0.6 + 0.4 * sin(y * 64.0 - uGTime * 9.0);
    vec2 cell = vec2(vUV.x * uGlow.z, y * uGlow.w);
    vec2 g = abs(fract(cell + 0.5) - 0.5);
    float grid = max(1.0 - smoothstep(0.0, 0.05, g.x), 1.0 - smoothstep(0.0, 0.04, g.y));
    float sweep = exp(-pow((fract(y * 0.5 - uGTime * 0.6) - 0.5) * 9.0, 2.0));
    a = (0.16 + 0.55 * pow(1.0 - y, 3.0)) * scan + grid * 0.5 * (1.0 - y * 0.7) + exp(-y * 28.0) * 1.3 + sweep * 0.35;
    a *= 1.0 - smoothstep(0.75, 1.0, y);
  } else if (m < 3.5) {
    float x = abs(vUV.x - 0.5) * 2.0;
    float y = vUV.y;
    a = (exp(-x * x * 9.0) * 0.7 + exp(-x * x * 140.0)) * pow(1.0 - y, 1.4) * (0.75 + 0.25 * sin(y * 36.0 - uGTime * 12.0));
  } else if (m < 4.5) {
    // 4 laser line (d.beam): hard core across vUV.x, z = halo amount
    float x = abs(vUV.x - 0.5) * 2.0;
    a = exp(-x * x * 70.0) * 1.6 + exp(-x * x * 5.0) * uGlow.z * (1.0 - x);
  } else {
    // 5 smoke sheet: drifting value noise, soft edges; z = seed, w = density (0 = default 1)
    vec2 p = vUV * vec2(2.4, 1.5) + uGlow.z * 3.7;
    float t = mod(uGTime, 400.0);
    float n = gNoise(p + vec2(t * 0.06, -t * 0.1)) * 0.65 + gNoise(p * 2.7 + vec2(-t * 0.09, t * 0.04)) * 0.35;
    float e = smoothstep(0.0, 0.3, vUV.x) * smoothstep(1.0, 0.7, vUV.x) * smoothstep(0.0, 0.3, vUV.y) * smoothstep(1.0, 0.5, vUV.y);
    float k = uGlow.w > 0.0 ? uGlow.w : 1.0;
    a = smoothstep(0.3 - 0.2 * k, 0.95, n) * e * k;
  }
  gl_FragColor = vec4(uColor * a * uGlow.y, 1.0);
}`;
}
