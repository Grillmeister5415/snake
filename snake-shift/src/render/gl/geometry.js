// Procedural meshes. Every generator returns { pos, nrm, uv, idx } as plain arrays.
// Convention: everything stands on y = 0 and is 1 unit tall/wide, except `sphere` and `torus`,
// which are centred on the origin. Forward for oriented shapes (`head`) is local -Z.
// Face UVs run 0..1 so the mesh shader's `lines` option can outline faces.

function G() { return { pos: [], nrm: [], uv: [], idx: [] }; }

function vert(g, p, n, uv) {
  g.pos.push(p[0], p[1], p[2]);
  g.nrm.push(n[0], n[1], n[2]);
  g.uv.push(uv[0], uv[1]);
  return g.pos.length / 3 - 1;
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// Flat quad a,b,c,d (in order around the face) with outward normal n.
function quad(g, a, b, c, d, n) {
  const i0 = vert(g, a, n, [0, 0]);
  vert(g, b, n, [1, 0]);
  vert(g, c, n, [1, 1]);
  vert(g, d, n, [0, 1]);
  g.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
}

function tri(g, a, b, c, n, uvs = [[0, 0], [1, 0], [0, 1]]) {
  n = n || norm(cross(sub(b, a), sub(c, a)));
  const i0 = vert(g, a, n, uvs[0]);
  vert(g, b, n, uvs[1]);
  vert(g, c, n, uvs[2]);
  g.idx.push(i0, i0 + 1, i0 + 2);
}

// Prism from an XZ outline (any order), y 0..1. Caps get UVs that outline the polygon edge.
export function prism(outline) {
  const g = G();
  const n = outline.length;
  let cx = 0, cz = 0;
  for (const [x, z] of outline) { cx += x; cz += z; }
  cx /= n; cz /= n;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = outline[i];
    const [x1, z1] = outline[(i + 1) % n];
    let nx = z1 - z0, nz = -(x1 - x0);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l; nz /= l;
    // make the normal point away from the centroid
    const mx = (x0 + x1) / 2 - cx, mz = (z0 + z1) / 2 - cz;
    if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
    quad(g, [x0, 0, z0], [x1, 0, z1], [x1, 1, z1], [x0, 1, z0], [nx, 0, nz]);
  }
  for (const y of [0, 1]) {
    const ny = y ? 1 : -1;
    const c = vert(g, [cx, y, cz], [0, ny, 0], [0.5, 0.5]);
    const ring = outline.map(([x, z]) => vert(g, [x, y, z], [0, ny, 0], [0.5, 0]));
    for (let i = 0; i < n; i++) g.idx.push(c, ring[i], ring[(i + 1) % n]);
  }
  return g;
}

export function box() {
  return prism([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]);
}

// Snake head: a block with a tapered nose pointing to local -Z.
export function head() {
  return prism([[-0.5, 0.5], [0.5, 0.5], [0.5, -0.02], [0.2, -0.5], [-0.2, -0.5], [-0.5, -0.02]]);
}

// Octahedron gem, y 0..1.
export function gem() {
  const g = G();
  const top = [0, 1, 0], bot = [0, 0, 0];
  const ring = [[0.5, 0.5, 0], [0, 0.5, 0.5], [-0.5, 0.5, 0], [0, 0.5, -0.5]];
  for (let i = 0; i < 4; i++) {
    const a = ring[i], b = ring[(i + 1) % 4];
    tri(g, a, b, top);
    tri(g, b, a, bot);
  }
  return g;
}

export function sphere(seg = 28, rings = 18, yOffset = 0) {
  const g = G();
  for (let r = 0; r <= rings; r++) {
    const v = r / rings, th = v * Math.PI;
    for (let s = 0; s <= seg; s++) {
      const u = s / seg, ph = u * Math.PI * 2;
      const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      vert(g, [n[0] * 0.5, n[1] * 0.5 + yOffset, n[2] * 0.5], n, [u, 1 - v]);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s, b = a + seg + 1;
      g.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return g;
}

export function cylinder(seg = 20, topScale = 1) {
  const g = G();
  const slope = 0.5 * (1 - topScale);
  for (let s = 0; s <= seg; s++) {
    const u = s / seg, ph = u * Math.PI * 2;
    const c = Math.cos(ph), sn = Math.sin(ph);
    const n = norm([c, slope, sn]);
    vert(g, [c * 0.5, 0, sn * 0.5], n, [u, 0]);
    vert(g, [c * 0.5 * topScale, 1, sn * 0.5 * topScale], n, [u, 1]);
  }
  for (let s = 0; s < seg; s++) {
    const a = s * 2;
    g.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // caps
  for (const [y, sc, ny] of [[0, 1, -1], [1, topScale, 1]]) {
    if (sc <= 0) continue;
    const c = vert(g, [0, y, 0], [0, ny, 0], [0.5, 0.5]);
    const first = g.pos.length / 3;
    for (let s = 0; s <= seg; s++) {
      const ph = (s / seg) * Math.PI * 2;
      vert(g, [Math.cos(ph) * 0.5 * sc, y, Math.sin(ph) * 0.5 * sc], [0, ny, 0], [0.5, 0]);
    }
    for (let s = 0; s < seg; s++) g.idx.push(c, first + s, first + s + 1);
  }
  return g;
}

export function cone(seg = 24) {
  return cylinder(seg, 0);
}

// Square pyramid, base 1x1, apex at y = 1.
export function pyramid() {
  const g = G();
  const b = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]];
  const apex = [0, 1, 0];
  for (let i = 0; i < 4; i++) {
    const p = b[i], q = b[(i + 1) % 4];
    const n = norm(cross(sub(q, p), sub(apex, p)));
    const nn = n[0] * (p[0] + q[0]) + n[2] * (p[2] + q[2]) < 0 ? [-n[0], -n[1], -n[2]] : n;
    tri(g, p, q, apex, nn, [[0, 0], [1, 0], [0.5, 1]]);
  }
  quad(g, b[0], b[1], b[2], b[3], [0, -1, 0]);
  return g;
}

// Torus in the XZ plane, centred. R = ring radius, r = tube radius (unit ring: R 0.5).
export function torus(R = 0.5, r = 0.06, seg = 64, tube = 10) {
  const g = G();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = u * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j <= tube; j++) {
      const v = j / tube, b = v * Math.PI * 2;
      const cb = Math.cos(b), sb = Math.sin(b);
      const n = [ca * cb, sb, sa * cb];
      vert(g, [ca * (R + r * cb), r * sb, sa * (R + r * cb)], n, [u, v]);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < tube; j++) {
      const a = i * (tube + 1) + j, b = a + tube + 1;
      g.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return g;
}

// Vertical plane in XY: x -0.5..0.5, y 0..1, normal +Z. Used for walls, billboards, arcades.
export function plane() {
  const g = G();
  quad(g, [-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0], [0, 0, 1]);
  return g;
}

// Like plane(), with a chosen UV window (for poster sheets that should not repeat wall to wall).
export function planeUV(u0 = 0, u1 = 1, v0 = 0, v1 = 1) {
  const g = G();
  const n = [0, 0, 1];
  const i0 = vert(g, [-0.5, 0, 0], n, [u0, v0]);
  vert(g, [0.5, 0, 0], n, [u1, v0]);
  vert(g, [0.5, 1, 0], n, [u1, v1]);
  vert(g, [-0.5, 1, 0], n, [u0, v1]);
  g.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  return g;
}

// Merge scaled + translated copies into one mesh (one draw call). parts: [{ g, t: [x,y,z], s: [sx,sy,sz] }].
// Keep the total under 65536 vertices (16-bit indices).
export function merge(parts) {
  const out = G();
  for (const { g, t = [0, 0, 0], s = [1, 1, 1] } of parts) {
    const base = out.pos.length / 3;
    for (let i = 0; i < g.pos.length; i += 3) {
      out.pos.push(g.pos[i] * s[0] + t[0], g.pos[i + 1] * s[1] + t[1], g.pos[i + 2] * s[2] + t[2]);
      const n = norm([g.nrm[i] / s[0], g.nrm[i + 1] / s[1], g.nrm[i + 2] / s[2]]);
      out.nrm.push(n[0], n[1], n[2]);
    }
    for (let i = 0; i < g.uv.length; i++) out.uv.push(g.uv[i]);
    for (let i = 0; i < g.idx.length; i++) out.idx.push(g.idx[i] + base);
  }
  return out;
}

// Floor-aligned quad: x,z -0.5..0.5 at y = 0, normal +Y. Used for light pools and rings.
export function floorQuad() {
  const g = G();
  quad(g, [-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5], [0, 1, 0]);
  return g;
}

export const LIBRARY = {
  box, block: box, head, gem, pyramid, plane, floorQuad,
  sphere: () => sphere(32, 20, 0),
  ball: () => sphere(20, 12, 0.5),
  cylinder: () => cylinder(24, 1),
  cone: () => cone(28),
  torus: () => torus(0.5, 0.035, 72, 8),
};
