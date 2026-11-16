// Minimal column-major 4x4 matrix helpers for the WebGL 1 engine. No allocation in hot paths.

const TMP = new Float32Array(16);

export function create() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function identity(o) {
  o.fill(0);
  o[0] = o[5] = o[10] = o[15] = 1;
  return o;
}

// o = a * b (o may alias a or b)
export function multiply(o, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      TMP[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  o.set(TMP);
  return o;
}

// Perspective from half-angle tangents (lets callers fix horizontal or vertical FOV).
export function perspective(o, tanX, tanY, near, far) {
  o.fill(0);
  o[0] = 1 / tanX;
  o[5] = 1 / tanY;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
}

// Camera basis from yaw (0 = looking toward -Z, +PI/2 = toward +X) and pitch (negative = down).
export function basis(yaw, pitch) {
  const cp = Math.cos(pitch);
  const f = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  const r = [Math.cos(yaw), 0, Math.sin(yaw)];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { f, r, u };
}

// World -> camera matrix from eye position and basis.
export function view(o, eye, b) {
  const { f, r, u } = b;
  o[0] = r[0]; o[4] = r[1]; o[8] = r[2]; o[12] = -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]);
  o[1] = u[0]; o[5] = u[1]; o[9] = u[2]; o[13] = -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]);
  o[2] = -f[0]; o[6] = -f[1]; o[10] = -f[2]; o[14] = f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2];
  o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1;
  return o;
}

// Translate * rotateY * scale. Rotation +ry turns local +X toward -Z.
export function trs(o, tx, ty, tz, ry, sx, sy, sz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  o[0] = c * sx; o[1] = 0; o[2] = -s * sx; o[3] = 0;
  o[4] = 0; o[5] = sy; o[6] = 0; o[7] = 0;
  o[8] = s * sz; o[9] = 0; o[10] = c * sz; o[11] = 0;
  o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1;
  return o;
}

// Translate * Ry * Rx * Rz * scale.
export function euler(o, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
  const cx = Math.cos(rx), sxn = Math.sin(rx);
  const cy = Math.cos(ry), syn = Math.sin(ry);
  const cz = Math.cos(rz), szn = Math.sin(rz);
  // R = Ry * Rx * Rz, columns
  const r00 = cy * cz + syn * sxn * szn, r01 = -cy * szn + syn * sxn * cz, r02 = syn * cx;
  const r10 = cx * szn, r11 = cx * cz, r12 = -sxn;
  const r20 = -syn * cz + cy * sxn * szn, r21 = syn * szn + cy * sxn * cz, r22 = cy * cx;
  o[0] = r00 * sx; o[1] = r10 * sx; o[2] = r20 * sx; o[3] = 0;
  o[4] = r01 * sy; o[5] = r11 * sy; o[6] = r21 * sy; o[7] = 0;
  o[8] = r02 * sz; o[9] = r12 * sz; o[10] = r22 * sz; o[11] = 0;
  o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1;
  return o;
}

// Clip-space transform of a point: returns [x, y, z, w].
export function project(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}
