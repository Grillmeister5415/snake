// The three spaces of the rules layer (LEVELS_PLAN 3.4) and the pure geometry
// helpers that renderers import. Pure: no DOM, no state outside the arguments.
//
// Cells by space:
//   box  { x, y }     x, y in 0..15
//   lane { x, y }     x in 0..15, y any integer (absolute row; forward is up, decreasing y)
//   cube { f, u, v }  face 0..5, u, v in 0..15 on the face's canonical axes
// Space state (the snapshot's `space`):
//   { kind: 'box' }
//   { kind: 'lane', y0, prevY0 }
//   { kind: 'cube', face, rot, prevFace, prevRot, entered }
// Directions are board-local strings; on the cube a frame (face, rot) maps them to the
// face's canonical axes: canonical index = (local index + rot) % 4, indices up 0, right 1, down 2, left 3.

import { BOARD as N, LANE } from './rules-config.js';

export const SIZE = N;
export const DIRS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  right: Object.freeze({ x: 1, y: 0 }),
});
export const OPPOSITE = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' });
export const DIR_ORDER = Object.freeze(['up', 'right', 'down', 'left']);
const DIR_INDEX = Object.freeze({ up: 0, right: 1, down: 2, left: 3 });
const DUV = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // canonical (du, dv) per direction index

const inBoard = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
const xy = (x, y) => Object.freeze({ x, y });
const fuv = (f, u, v) => Object.freeze({ f, u, v });

// ---------------------------------------------------------------- cube geometry

// Outward normal n, canonical right u and canonical down v of each face, as world vectors.
// All faces satisfy u x v = -n, so every seam is a rotation (never a mirror).
const FACES = [
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },  // 0 front
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] }, // 1 right
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] }, // 2 back
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] }, // 3 left
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },   // 4 top
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] }, // 5 bottom
];
export const CUBE_FACES = Object.freeze(FACES.map((F) => Object.freeze({
  normal: Object.freeze(F.n.slice()), right: Object.freeze(F.u.slice()), down: Object.freeze(F.v.slice()),
})));

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const eq3 = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const neg3 = (a) => [0 - a[0], 0 - a[1], 0 - a[2]];
const nz = (x) => x || 0; // no negative zeros in returned vectors
function canonVec(f, d) { // world vector of canonical direction index d on face f
  const F = FACES[f];
  return d === 0 ? neg3(F.v) : d === 1 ? F.u.slice() : d === 2 ? F.v.slice() : neg3(F.u);
}

// Neighbour table: CUBE_NB[(f*256 + v*16 + u)*4 + d] = neighbour index; CUBE_ND = canonical dir after the step.
const CELLS = 6 * N * N;
const CUBE_NB = new Int32Array(CELLS * 4);
const CUBE_ND = new Int8Array(CELLS * 4);
(function buildCube() {
  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    for (let v = 0; v < N; v++) {
      for (let u = 0; u < N; u++) {
        const i = f * 256 + v * N + u;
        for (let d = 0; d < 4; d++) {
          const nu = u + DUV[d][0], nv = v + DUV[d][1];
          if (inBoard(nu, nv)) { CUBE_NB[i * 4 + d] = f * 256 + nv * N + nu; CUBE_ND[i * 4 + d] = d; continue; }
          // Across a seam, in doubled coordinates: P = 2 * cell centre.
          const T = canonVec(f, d);
          const P = [0, 1, 2].map((k) => 2 * (N / 2) * F.n[k] + F.u[k] * (2 * u + 1 - N) + F.v[k] * (2 * v + 1 - N));
          const g = FACES.findIndex((G) => eq3(G.n, T));
          const G = FACES[g];
          const Q = [0, 1, 2].map((k) => P[k] + T[k] - F.n[k]);
          const gu = (dot3(Q, G.u) + N - 1) / 2, gv = (dot3(Q, G.v) + N - 1) / 2;
          const D = neg3(F.n);
          let nd = 0;
          for (let k = 0; k < 4; k++) if (eq3(canonVec(g, k), D)) nd = k;
          CUBE_NB[i * 4 + d] = g * 256 + gv * N + gu;
          CUBE_ND[i * 4 + d] = nd;
        }
      }
    }
  }
})();

/** The cell next to (f, u, v) in canonical direction `dir`. Returns { f, u, v, dir } with the canonical direction on arrival. */
export function cubeNeighbour(f, u, v, dir) {
  const d = typeof dir === 'number' ? dir : DIR_INDEX[dir];
  const k = (f * 256 + v * N + u) * 4 + d;
  const j = CUBE_NB[k];
  return { f: (j / 256) | 0, u: j % N, v: ((j % 256) / N) | 0, dir: DIR_ORDER[CUBE_ND[k]] };
}

/** World position of a cell centre and its face normal, on a cube of edge 16 centred at the origin. */
export function cubeCellToWorld(f, u, v) {
  const F = FACES[f];
  const pos = [0, 1, 2].map((k) => nz((N / 2) * F.n[k] + F.u[k] * (u + 0.5 - N / 2) + F.v[k] * (v + 0.5 - N / 2)));
  return { pos, normal: F.n.slice() };
}

/** World vectors of the board's right and up in frame (f, rot), and the face normal. right x up = normal. */
export function faceFrame(f, rot = 0) {
  return { right: canonVec(f, (1 + rot) % 4), up: canonVec(f, rot % 4), normal: FACES[f].n.slice() };
}

/** Board-local (x, y) in frame rot -> canonical (u, v). */
export function localToCanon(x, y, rot = 0) {
  switch (rot & 3) {
    case 1: return { u: N - 1 - y, v: x };
    case 2: return { u: N - 1 - x, v: N - 1 - y };
    case 3: return { u: y, v: N - 1 - x };
    default: return { u: x, v: y };
  }
}

/** Canonical (u, v) -> board-local (x, y) in frame rot. */
export function canonToLocal(u, v, rot = 0) {
  switch (rot & 3) {
    case 1: return { x: v, y: N - 1 - u };
    case 2: return { x: N - 1 - u, y: N - 1 - v };
    case 3: return { x: N - 1 - v, y: u };
    default: return { x: u, y: v };
  }
}

export const localDirToCanon = (dir, rot = 0) => DIR_ORDER[(DIR_INDEX[dir] + rot) & 3];
export const canonDirToLocal = (dir, rot = 0) => DIR_ORDER[(DIR_INDEX[dir] - rot + 4) & 3];

/**
 * One step of a head that carries its frame: board-local `dir` stays the same across a seam.
 * Returns { f, u, v, rot, crossed }.
 */
export function cubeStep(f, u, v, rot, dir) {
  const L = DIR_INDEX[dir];
  const n = cubeNeighbour(f, u, v, (L + rot) & 3);
  if (n.f === f) return { f, u: n.u, v: n.v, rot, crossed: false };
  return { f: n.f, u: n.u, v: n.v, rot: (DIR_INDEX[n.dir] - L + 4) & 3, crossed: true };
}

/** Faces next to f in canonical directions [up, right, down, left]. */
export function cubeFaceNeighbours(f) {
  return [0, 1, 2, 3].map((d) => edgeFace(f, d));
}
function edgeFace(f, d) {
  const u = d === 1 ? N - 1 : d === 3 ? 0 : 7;
  const v = d === 2 ? N - 1 : d === 0 ? 0 : 7;
  return cubeNeighbour(f, u, v, d).f;
}

/** Frame carried from (face, rot) across its board-local `dir` edge. */
function carry(face, rot, dir) {
  const x = dir === 'right' ? N - 1 : dir === 'left' ? 0 : 7;
  const y = dir === 'down' ? N - 1 : dir === 'up' ? 0 : 7;
  const c = localToCanon(x, y, rot);
  const s = cubeStep(face, c.u, c.v, rot, dir);
  return { f: s.f, rot: s.rot };
}

/**
 * Unfolded net for the cube map, centred on `face` in frame `rot` (a vertical cross, 3 wide, 4 high).
 * Returns six { f, gx, gy, rot }: draw cell (u, v) of face f at (gx * 16 + x, gy * 16 + y),
 * with { x, y } = canonToLocal(u, v, rot). The centre's four seams are continuous in the net,
 * and so is the seam between the bottom face and the opposite face below it.
 */
export function cubeNet(face, rot = 0) {
  const up = carry(face, rot, 'up');
  const right = carry(face, rot, 'right');
  const down = carry(face, rot, 'down');
  const left = carry(face, rot, 'left');
  const opp = carry(down.f, down.rot, 'down');
  return Object.freeze([
    Object.freeze({ f: face, gx: 1, gy: 1, rot }),
    Object.freeze({ f: up.f, gx: 1, gy: 0, rot: up.rot }),
    Object.freeze({ f: right.f, gx: 2, gy: 1, rot: right.rot }),
    Object.freeze({ f: down.f, gx: 1, gy: 2, rot: down.rot }),
    Object.freeze({ f: left.f, gx: 0, gy: 1, rot: left.rot }),
    Object.freeze({ f: opp.f, gx: 1, gy: 3, rot: opp.rot }),
  ]);
}

// ---------------------------------------------------------------- spaces

/** A fresh space state for `kind`, as entered from a box (LEVELS_PLAN 3.4 "Changing space"). */
export function createSpace(kind) {
  if (kind === 'lane') return { kind: 'lane', y0: 0, prevY0: 0 };
  if (kind === 'cube') return { kind: 'cube', face: 0, rot: 0, prevFace: 0, prevRot: 0, entered: null };
  return { kind: 'box' };
}

export function sameCell(a, b) {
  if (!a || !b) return false;
  if (a.f !== undefined || b.f !== undefined) return a.f === b.f && a.u === b.u && a.v === b.v;
  return a.x === b.x && a.y === b.y;
}

/** A unique integer per cell within one space kind. */
export function cellKey(kind, c) {
  return kind === 'cube' ? c.f * 256 + c.v * N + c.u : c.y * N + c.x;
}

/**
 * One step from `cell` in board-local `dir`. Returns null when a wall is hit (box: four walls;
 * lane: the two side walls only; cube: never). Otherwise { cell, face, rot, crossed } where
 * face/rot are the head's frame after the step (cube only) and crossed is true on a seam crossing.
 */
export function stepIn(space, cell, dir) {
  const d = DIRS[dir];
  if (space.kind === 'cube') {
    const rot = cell.f === space.face ? space.rot : frameFor(space, cell.f);
    const s = cubeStep(cell.f, cell.u, cell.v, rot, dir);
    return { cell: fuv(s.f, s.u, s.v), face: s.f, rot: s.rot, crossed: s.crossed };
  }
  const x = cell.x + d.x, y = cell.y + d.y;
  if (x < 0 || x >= N) return null;
  if (space.kind === 'box' && (y < 0 || y >= N)) return null;
  return { cell: xy(x, y), crossed: false };
}
function frameFor(space, f) { // frame of a non-active face, as seen from the active one (for stepping other cells)
  for (const e of cubeNet(space.face, space.rot)) if (e.f === f) return e.rot;
  return 0;
}

/** Board-local { x, y } of a space cell on the active board, or null when it is not on it. */
export function toBoard(space, c) {
  if (!c || c.off) return null;
  if (space.kind === 'cube') {
    if (c.f !== space.face) return null;
    const l = canonToLocal(c.u, c.v, space.rot);
    return xy(l.x, l.y);
  }
  if (space.kind === 'lane') {
    const y = c.y - space.y0;
    return y >= 0 && y < N && c.x >= 0 && c.x < N ? xy(c.x, y) : null;
  }
  return inBoard(c.x, c.y) ? xy(c.x, c.y) : null;
}

/** The space cell under board-local (x, y). */
export function fromBoard(space, x, y) {
  if (space.kind === 'cube') {
    const c = localToCanon(x, y, space.rot);
    return fuv(space.face, c.u, c.v);
  }
  if (space.kind === 'lane') return xy(x, y + space.y0);
  return xy(x, y);
}

/** Leaving a space: the active board becomes the box. Returns the box cell, or null for an off-board cell. */
export function leaveToBox(space, c) {
  return toBoard(space, c);
}

/** Entering `kind` from a box: the box becomes the lane window at y0 = 0, or face 0 with rot 0. */
export function enterFromBox(kind, c) {
  if (!c) return null;
  if (kind === 'cube') return fuv(0, c.x, c.y);
  return xy(c.x, c.y);
}

/** Lane: scroll the window so the head's local row moves into bandTop..bandBottom (at most maxScroll rows a tick). */
export function laneFollow(space, head) {
  const r = head.y - space.y0;
  if (r < LANE.bandTop) space.y0 -= Math.min(LANE.maxScroll, LANE.bandTop - r);
  else if (r > LANE.bandBottom) space.y0 += Math.min(LANE.maxScroll, r - LANE.bandBottom);
  return space.y0;
}

// ---------------------------------------------------------------- graphs for search

function gridNb(rows) {
  const nb = new Int32Array(rows * N * 4).fill(-1);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      for (let d = 0; d < 4; d++) {
        const nx = x + DUV[d][0], ny = y + DUV[d][1];
        if (nx >= 0 && ny >= 0 && nx < N && ny < rows) nb[i * 4 + d] = ny * N + nx;
      }
    }
  }
  return nb;
}
const BOX_NB = gridNb(N);
const LANE_NB = gridNb(LANE.graphRows);

const BOX_GRAPH = Object.freeze({
  kind: 'box', size: N * N, nb: BOX_NB,
  index: (c) => (c && !c.off && inBoard(c.x, c.y) ? c.y * N + c.x : -1),
  cell: (i) => xy(i % N, (i / N) | 0),
});
const CUBE_GRAPH = Object.freeze({
  kind: 'cube', size: CELLS, nb: CUBE_NB,
  index: (c) => (c && !c.off && c.f !== undefined ? c.f * 256 + c.v * N + c.u : -1),
  cell: (i) => fuv((i / 256) | 0, i % N, ((i % 256) / N) | 0),
});

/**
 * Finite graph over a space for breadth-first search: { kind, size, nb, index(cell) -> i | -1, cell(i) }.
 * nb[i * 4 + d] is the neighbour of i (canonical direction d on the cube), or -1.
 * The lane graph covers LANE.graphRows rows starting LANE.graphRowsAbove rows above the window.
 */
export function spaceGraph(space) {
  if (space.kind === 'cube') return CUBE_GRAPH;
  if (space.kind !== 'lane') return BOX_GRAPH;
  const ya = space.y0 - LANE.graphRowsAbove, rows = LANE.graphRows;
  return {
    kind: 'lane', size: rows * N, nb: LANE_NB, ya,
    index: (c) => (c && !c.off && c.x >= 0 && c.x < N && c.y >= ya && c.y < ya + rows ? (c.y - ya) * N + c.x : -1),
    cell: (i) => xy(i % N, ya + ((i / N) | 0)),
  };
}

/** Breadth-first distances from `start` over cells not in `blocked` (Uint8Array). -1 = unreachable. The start is never blocked. */
export function bfs(graph, blocked, start) {
  const dist = new Int16Array(graph.size).fill(-1);
  if (start < 0) return dist;
  const q = new Int32Array(graph.size);
  let h = 0, t = 0;
  dist[start] = 0;
  q[t++] = start;
  const nb = graph.nb;
  while (h < t) {
    const i = q[h++];
    const d = dist[i] + 1;
    for (let k = 0; k < 4; k++) {
      const j = nb[i * 4 + k];
      if (j < 0 || dist[j] >= 0 || blocked[j]) continue;
      dist[j] = d;
      q[t++] = j;
    }
  }
  return dist;
}
