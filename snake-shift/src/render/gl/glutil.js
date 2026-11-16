// WebGL 1 plumbing: programs (with logged failures), buffers, textures.

export const ATTR = { aPos: 0, aNrm: 1, aUV: 2 };

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh) || '(no log)';
    const lines = src.split('\n').map((l, i) => `${String(i + 1).padStart(4)}: ${l}`);
    // Show the lines around the first reported error to make the log useful.
    const m = /ERROR:\s*\d+:(\d+)/.exec(log);
    const at = m ? +m[1] : 0;
    const ctx = at ? lines.slice(Math.max(0, at - 4), at + 3).join('\n') : '';
    console.warn(`[gl] ${label} ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader failed:\n${log}\n${ctx}`);
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// Returns { prog, u: { name: location } } or null. Attribute locations are bound before linking.
export function createProgram(gl, vsSrc, fsSrc, label) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label);
  const fs = vs && compile(gl, gl.FRAGMENT_SHADER, fsSrc, label);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  for (const [name, loc] of Object.entries(ATTR)) gl.bindAttribLocation(prog, loc, name);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    console.warn(`[gl] ${label} program link failed:\n${gl.getProgramInfoLog(prog)}`);
    gl.deleteProgram(prog);
    return null;
  }
  const u = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(prog, info.name);
  }
  const attrs = new Set();
  const na = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) attrs.add(gl.getActiveAttrib(prog, i).name);
  return { prog, u, attrs, label };
}

// Geometry { pos, nrm, uv, idx } -> GPU mesh.
export function uploadMesh(gl, g) {
  const buf = (data, target = gl.ARRAY_BUFFER) => {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  };
  return {
    pos: buf(new Float32Array(g.pos)),
    nrm: buf(new Float32Array(g.nrm)),
    uv: buf(new Float32Array(g.uv)),
    idx: buf(new Uint16Array(g.idx), gl.ELEMENT_ARRAY_BUFFER),
    count: g.idx.length,
  };
}

export function textureFromCanvas(gl, canvas, { repeat = false, mipmap = true } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  const pot = (n) => (n & (n - 1)) === 0;
  const isPot = pot(canvas.width) && pot(canvas.height);
  const wrap = repeat && isPot ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (mipmap && isPot) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}

// Re-upload a canvas into an existing texture (same filtering it was created with).
export function updateTextureFromCanvas(gl, t, canvas) {
  if (!t || !canvas) return t;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  const pot = (n) => (n & (n - 1)) === 0;
  if (pot(canvas.width) && pot(canvas.height)) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

export function whiteTexture(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
