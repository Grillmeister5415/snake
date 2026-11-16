// Post-effects pass for rooms (BUILD_PLAN 6.6, wave 3 fx-pass).
// The room renders to the screen exactly as without the pass (antialiased). capture() then
// copies the finished frame into one offscreen texture (RGB, backing-store size), and one
// full-screen shader draws it back over the screen with colour splitting that grows toward
// the edges, a cheap glow on bright areas, horizontal glitch slices and a chromatic kick on
// a bite. The board mask is analytic: a ray from the camera through each pixel is tested
// against the board volume (panel, frame band, curb and 0.46 above them, so snake and dot
// are inside). Pixels inside it are discarded, so the board stays bit-identical to the
// direct render; samples that land on it fall back to the undisplaced pixel, so the board
// never smears into the scenery either.
// engine-ext (LEVELS_PLAN 5.3, 5.5): up to 8 extra protected volumes (parallelepipeds, uXR: 3 rows per
// volume mapping world to 0..1 local coordinates), for items(d) meshes and F.protect quads. uXN.y = 1
// drops the board volume (custom board). With uXN = (0, 0) the mask is exactly the board volume as before.
// createPost(gl) never throws; `ok` is false when the program failed, and capture() is
// false when the texture cannot be made: the engine then keeps the direct frame.

import { createProgram } from './glutil.js';

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;      // buffer size, pixels
uniform vec4 uAmt;      // x split px, y glitch 0..1, z glow 0..1.2, w bite kick px
uniform vec4 uSeed;     // x glitch step, y beat, z chaos, w unused
uniform vec2 uTap[8];   // glow tap offsets in uv
uniform vec3 uEye, uCamF, uCamR, uCamU;   // camera; R and U already scaled by tanX, tanY
uniform vec3 uBoxMin, uBoxMax;            // board volume, world units
uniform float uKeep;                      // 1: write board pixels through (buffer mode), 0: discard (copy mode)
uniform vec2 uXN;                         // x extra volume count (0..8), y 1 = no board volume
uniform vec4 uXR[24];                     // extra volumes: local_k = dot(row_k.xyz, p) + row_k.w, inside when all in 0..1

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// 1.0 where the ray from the eye along d crosses one of the extra protected volumes.
float onExtra(vec3 d) {
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uXN.x) break;
    vec4 r0 = uXR[i * 3], r1 = uXR[i * 3 + 1], r2 = uXR[i * 3 + 2];
    vec3 lo = vec3(dot(r0.xyz, uEye) + r0.w, dot(r1.xyz, uEye) + r1.w, dot(r2.xyz, uEye) + r2.w);
    vec3 ld = vec3(dot(r0.xyz, d), dot(r1.xyz, d), dot(r2.xyz, d));
    ld += vec3(lessThan(abs(ld), vec3(1e-7))) * 1e-7;
    vec3 t0 = -lo / ld, t1 = (1.0 - lo) / ld;
    vec3 a = min(t0, t1), b = max(t0, t1);
    float tn = max(max(a.x, a.y), a.z), tf = min(min(b.x, b.y), b.z);
    if (tf >= max(tn, 0.0)) return 1.0;
  }
  return 0.0;
}

// 1.0 where the camera ray through uv crosses the board volume (or an extra protected volume).
float onBoard(vec2 uv) {
  vec2 n = uv * 2.0 - 1.0;
  vec3 d = uCamF + n.x * uCamR + n.y * uCamU;
  d += vec3(lessThan(abs(d), vec3(1e-6))) * 1e-6;
  if (uXN.y < 0.5) {
    vec3 inv = 1.0 / d;
    vec3 t0 = (uBoxMin - uEye) * inv, t1 = (uBoxMax - uEye) * inv;
    vec3 a = min(t0, t1), b = max(t0, t1);
    float tn = max(max(a.x, a.y), a.z), tf = min(min(b.x, b.y), b.z);
    if (tf >= max(tn, 0.0)) return 1.0;
  }
  return uXN.x > 0.5 ? onExtra(d) : 0.0;
}

// A sample that lands on the board falls back to the centre pixel.
vec3 pick(vec2 uv, vec3 c) { return mix(texture2D(uTex, uv).rgb, c, onBoard(uv)); }

void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  if (onBoard(vUv) > 0.5) {          // board volume: untouched
    if (uKeep < 0.5) discard;        // copy mode: the screen already holds it
    gl_FragColor = vec4(c, 1.0);     // buffer mode: pass it through unchanged
    return;
  }
  vec2 px = 1.0 / uRes;
  float g = uAmt.y;
  float st = uSeed.x;
  vec2 uv = vUv;
  float slice = 0.0;
  if (g > 0.001) {
    // coarse horizontal slices: bursts, sparse at the baseline, dense on a hit
    float nb = 10.0 + floor(hash12(vec2(st, 1.7)) * 42.0);
    float band = floor(vUv.y * nb);
    if (hash12(vec2(band, st)) < g * g * 0.55) {
      slice = 1.0;
      uv.x = fract(uv.x + (hash12(vec2(band, st + 3.1)) - 0.5) * (0.03 + 0.32 * g));
      if (hash12(vec2(band, st + 9.7)) < g * 0.6) {   // blocky resample inside some slices
        vec2 blk = vec2(6.0 + 36.0 * hash12(vec2(band, st + 5.3)), 3.0) * px;
        uv = (floor(uv / blk) + 0.5) * blk;
      }
    }
    // hairline tears
    float fine = floor(gl_FragCoord.y / 3.0);
    if (hash12(vec2(fine, st + 11.0)) < g * 0.06) {
      uv.x = fract(uv.x + (hash12(vec2(fine, st + 2.0)) - 0.5) * 0.6 * g);
      slice = 1.0;
    }
  }

  // colour splitting, radial, growing toward the screen edges; the bite kick adds on top
  vec2 cc = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(cc);
  vec2 dir = r > 1e-4 ? cc / r : vec2(0.0);
  float sp = uAmt.x * (0.25 + 1.8 * r * r) + uAmt.w * (0.5 + 1.2 * r) + slice * uAmt.x * 1.5;
  vec2 off = dir * sp * px;
  vec3 col = vec3(pick(uv + off, c).r, pick(uv, c).g, pick(uv - off, c).b);
  if (slice > 0.5 && hash12(vec2(floor(vUv.y * 23.0), st + 7.0)) < g * 0.35) col = col.gbr;

  // cheap glow: 8 taps around the pixel, bright-pass
  if (uAmt.z > 0.001) {
    vec3 gs = vec3(0.0);
    for (int i = 0; i < 8; i++) gs += max(texture2D(uTex, vUv + uTap[i]).rgb - 0.58, 0.0);
    col += gs * (uAmt.z * 0.13) * (1.0 - 0.6 * c);   // less on what is already bright: keeps hue
  }

  // faint scanlines that come in with chaos
  col *= 1.0 - uSeed.z * 0.12 * step(mod(floor(gl_FragCoord.y), 3.0), 0.5);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createPost(gl) {
  const prog = createProgram(gl, VS, FS, 'post');
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
  // One target at a time: 'copy' holds an RGB texture, 'buffer' an RGBA texture + depth + framebuffer.
  const T = { mode: '', tex: null, fb: null, rb: null, w: 0, h: 0, failKey: '' };

  function free() {
    if (T.fb) gl.deleteFramebuffer(T.fb);
    if (T.rb) gl.deleteRenderbuffer(T.rb);
    if (T.tex) gl.deleteTexture(T.tex);
    T.tex = T.fb = T.rb = null;
    T.mode = '';
    T.w = T.h = 0;
  }

  function alloc(mode, W, H) {
    free();
    const key = `${mode}:${W}x${H}`;
    if (key === T.failKey) return false;
    const fail = () => {
      try { gl.bindFramebuffer(gl.FRAMEBUFFER, null); } catch { /* lost */ }
      free();
      T.failKey = key;
      return false;
    };
    if (W > maxTex || H > maxTex) return fail();
    try {
      const fmt = mode === 'buffer' ? gl.RGBA : gl.RGB; // the drawing buffer has no alpha, so a copy must be RGB
      T.tex = gl.createTexture();
      if (!T.tex) return fail();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, T.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, W, H, 0, fmt, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const e = gl.getError();
      if (e === gl.OUT_OF_MEMORY || e === gl.INVALID_VALUE) return fail();
      if (mode === 'buffer') {
        T.rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, T.rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, W, H);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        T.fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.tex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, T.rb);
        const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (!ok) return fail();
      }
      gl.bindTexture(gl.TEXTURE_2D, null); // never leave the target bound while the room draws into it
      T.mode = mode; T.w = W; T.h = H;
      return true;
    } catch {
      return fail();
    }
  }

  const ready = (mode, W, H) => !!prog && !gl.isContextLost() && ((T.mode === mode && T.w === W && T.h === H && T.tex) || alloc(mode, W, H));

  return {
    prog,
    get ok() { return !!prog && !gl.isContextLost(); },
    get tex() { return T.tex; },
    get size() { return [T.w, T.h]; },
    get mode() { return T.mode; },
    // Buffer mode: bind the offscreen buffer before the room draws. false: draw to the screen.
    begin(W, H) {
      if (!ready('buffer', W, H)) return false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
      return true;
    },
    // Buffer mode: back to the screen, buffer texture bound on TEXTURE0.
    end() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, T.tex);
    },
    // Copy mode: copy the finished frame into the texture, bound on TEXTURE0. false: keep the direct frame.
    capture(W, H) {
      if (!ready('copy', W, H)) return false;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, T.tex);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H);
      return true;
    },
    free,
  };
}
