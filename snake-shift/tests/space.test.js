import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, DIRS, OPPOSITE, DIR_ORDER, cubeNeighbour, cubeCellToWorld, faceFrame, cubeNet, cubeStep,
  cubeFaceNeighbours, localToCanon, canonToLocal, createSpace, stepIn, toBoard, fromBoard,
  leaveToBox, enterFromBox, laneFollow, spaceGraph, bfs, cellKey,
} from '../src/space.js';

const N = SIZE;
const edgeCells = (d) => {
  const out = [];
  for (let k = 0; k < N; k++) {
    if (d === 'up') out.push([k, 0]);
    if (d === 'down') out.push([k, N - 1]);
    if (d === 'left') out.push([0, k]);
    if (d === 'right') out.push([N - 1, k]);
  }
  return out;
};
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('cube: every one of the 24 directed seams leads back to the same canonical cell', () => {
  const seams = new Set();
  for (let f = 0; f < 6; f++) {
    for (const d of DIR_ORDER) {
      for (const [u, v] of edgeCells(d)) {
        const n = cubeNeighbour(f, u, v, d);
        assert.notEqual(n.f, f, 'an edge step leaves the face');
        seams.add(`${f}>${n.f}`);
        const back = cubeNeighbour(n.f, n.u, n.v, OPPOSITE[n.dir]);
        assert.deepEqual(back, { f, u, v, dir: OPPOSITE[d] });
        // Neighbouring cell centres on the cube are one unit apart (or ~0.707 apart across the fold).
        const a = cubeCellToWorld(f, u, v).pos, b = cubeCellToWorld(n.f, n.u, n.v).pos;
        assert.ok(Math.abs(dist3(a, b) - Math.SQRT1_2) < 1e-9, `fold distance ${dist3(a, b)}`);
      }
    }
  }
  assert.equal(seams.size, 24);
});

test('cube: inner steps stay on the face and every cell has four distinct neighbours', () => {
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
      const seen = new Set();
      for (const d of DIR_ORDER) {
        const n = cubeNeighbour(f, u, v, d);
        seen.add(`${n.f},${n.u},${n.v}`);
        const back = cubeNeighbour(n.f, n.u, n.v, OPPOSITE[n.dir]);
        assert.deepEqual([back.f, back.u, back.v], [f, u, v]);
      }
      assert.equal(seen.size, 4);
    }
  }
  for (let f = 0; f < 6; f++) {
    const faces = cubeFaceNeighbours(f);
    assert.equal(new Set(faces).size, 4);
    assert.ok(!faces.includes(f));
  }
});

test('cube: the carried frame keeps the board-local direction and enters on the opposite edge', () => {
  for (let f = 0; f < 6; f++) {
    for (let rot = 0; rot < 4; rot++) {
      for (const d of DIR_ORDER) {
        for (let k = 0; k < N; k++) {
          const x = d === 'left' ? 0 : d === 'right' ? N - 1 : k;
          const y = d === 'up' ? 0 : d === 'down' ? N - 1 : k;
          const c = localToCanon(x, y, rot);
          const s = cubeStep(f, c.u, c.v, rot, d);
          assert.equal(s.crossed, true);
          const l = canonToLocal(s.u, s.v, s.rot);
          // Unfolded: the new cell is one step on in the same direction, wrapped onto the next board.
          assert.deepEqual(l, { x: (x + DIRS[d].x + N) % N, y: (y + DIRS[d].y + N) % N });
          // Step back in the opposite local direction: same cell, same frame.
          const b = cubeStep(s.f, s.u, s.v, s.rot, OPPOSITE[d]);
          assert.deepEqual([b.f, b.u, b.v, b.rot], [f, c.u, c.v, rot]);
        }
      }
    }
  }
});

test('cube: crossing the top seam while heading up lands on the bottom row, still heading up', () => {
  const space = createSpace('cube');
  const head = fromBoard(space, 5, 0);
  const r = stepIn(space, head, 'up');
  assert.equal(r.crossed, true);
  assert.notEqual(r.face, 0);
  const next = { ...space, face: r.face, rot: r.rot };
  assert.deepEqual({ ...toBoard(next, r.cell) }, { x: 5, y: N - 1 });
});

test('cube: four turns around a corner behave consistently at all eight corners', () => {
  // "Step, then turn left" from a corner cell heading off the face circles the corner:
  // it visits the three corner cells in turn, and after twelve moves the head, heading and frame are back.
  const corners = new Set();
  for (let f = 0; f < 6; f++) {
    for (const [x, y, dir] of [[0, 0, 'up'], [N - 1, 0, 'right'], [N - 1, N - 1, 'down'], [0, N - 1, 'left']]) {
      for (let rot = 0; rot < 4; rot++) {
        const c0 = localToCanon(x, y, rot);
        let cur = { f, u: c0.u, v: c0.v, rot }, d = dir;
        const visited = [];
        for (let i = 0; i < 12; i++) {
          const s = cubeStep(cur.f, cur.u, cur.v, cur.rot, d);
          assert.equal(s.crossed, true, 'every move of the loop crosses a seam');
          cur = s;
          visited.push(`${s.f},${s.u},${s.v}`);
          d = DIR_ORDER[(DIR_ORDER.indexOf(d) + 3) % 4];
        }
        assert.equal(new Set(visited).size, 3, 'three corner cells');
        assert.equal(visited[0], visited[3]);
        assert.equal(visited[2], `${f},${c0.u},${c0.v}`, 'third move returns to the start');
        assert.deepEqual([cur.f, cur.u, cur.v, cur.rot, d], [f, c0.u, c0.v, rot, dir]);
        // The three cells are mutually adjacent and lie around one cube vertex.
        const pts = [...new Set(visited)].map((k) => k.split(',').map(Number)).map(([g, u, v]) => cubeCellToWorld(g, u, v).pos);
        const vtx = pts.reduce((a, p) => a.map((s, k) => s + Math.sign(p[k]) * 8 / 3), [0, 0, 0]).map((s) => Math.round(s));
        corners.add(vtx.join(','));
      }
    }
  }
  assert.equal(corners.size, 8);
});

test('cube: a straight run of 64 steps goes once around the cube and comes back', () => {
  for (let f = 0; f < 6; f++) for (const d of DIR_ORDER) {
    let cur = { f, u: 3, v: 9, rot: 0 };
    const faces = new Set();
    for (let i = 0; i < 4 * N; i++) { cur = cubeStep(cur.f, cur.u, cur.v, cur.rot, d); faces.add(cur.f); }
    assert.deepEqual([cur.f, cur.u, cur.v, cur.rot], [f, 3, 9, 0]);
    assert.equal(faces.size, 4);
  }
});

test('cube: world positions, frames and the net', () => {
  const seen = new Set();
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
      const { pos, normal } = cubeCellToWorld(f, u, v);
      assert.equal(pos.map((p, k) => p * normal[k]).reduce((a, b) => a + b), 8, 'on the face plane');
      assert.ok(pos.every((p) => Math.abs(p) <= 8));
      seen.add(pos.join(','));
    }
    for (let rot = 0; rot < 4; rot++) {
      const { right, up, normal } = faceFrame(f, rot);
      const cross = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]].map((n) => n || 0);
      assert.deepEqual(cross, normal, 'right x up = normal');
      // Moving board-right moves along `right` in the world.
      const a = localToCanon(5, 5, rot), b = localToCanon(6, 5, rot);
      const pa = cubeCellToWorld(f, a.u, a.v).pos, pb = cubeCellToWorld(f, b.u, b.v).pos;
      assert.deepEqual(pb.map((p, k) => (p - pa[k]) || 0), right);
      const c = localToCanon(5, 4, rot), pc = cubeCellToWorld(f, c.u, c.v).pos;
      assert.deepEqual(pc.map((p, k) => (p - pa[k]) || 0), up);
      // Net: every face once, and the board-local edges of the centre continue into its neighbours.
      const net = cubeNet(f, rot);
      assert.equal(new Set(net.map((e) => e.f)).size, 6);
      const at = (gx, gy) => net.find((e) => e.gx === gx && e.gy === gy);
      const links = [[at(1, 1), at(1, 0), 'up'], [at(1, 1), at(2, 1), 'right'], [at(1, 1), at(1, 2), 'down'],
        [at(1, 1), at(0, 1), 'left'], [at(1, 2), at(1, 3), 'down']];
      for (const [from, to, d] of links) {
        for (const [x, y] of edgeCells(d)) {
          const cc = localToCanon(x, y, from.rot);
          const s = cubeStep(from.f, cc.u, cc.v, from.rot, d);
          assert.equal(s.f, to.f);
          assert.equal(s.rot, to.rot);
          const l = canonToLocal(s.u, s.v, to.rot);
          assert.deepEqual(l, { x: (x + DIRS[d].x + N) % N, y: (y + DIRS[d].y + N) % N });
        }
      }
    }
  }
  assert.equal(seen.size, 6 * N * N);
});

test('local and canonical coordinates round-trip in every frame', () => {
  for (let rot = 0; rot < 4; rot++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = localToCanon(x, y, rot);
    assert.deepEqual(canonToLocal(c.u, c.v, rot), { x, y });
  }
});

test('box: walls on four sides; lane: side walls only', () => {
  const box = createSpace('box');
  assert.equal(stepIn(box, { x: 0, y: 4 }, 'left'), null);
  assert.equal(stepIn(box, { x: 4, y: 0 }, 'up'), null);
  assert.equal(stepIn(box, { x: 4, y: 15 }, 'down'), null);
  assert.deepEqual({ ...stepIn(box, { x: 4, y: 4 }, 'right').cell }, { x: 5, y: 4 });
  const lane = createSpace('lane');
  assert.equal(stepIn(lane, { x: 0, y: -40 }, 'left'), null);
  assert.equal(stepIn(lane, { x: 15, y: 90 }, 'right'), null);
  assert.deepEqual({ ...stepIn(lane, { x: 4, y: 0 }, 'up').cell }, { x: 4, y: -1 });
  assert.deepEqual({ ...stepIn(lane, { x: 4, y: 15 }, 'down').cell }, { x: 4, y: 16 });
});

test('lane window follows the head, catching up at most two rows a tick', () => {
  const lane = createSpace('lane');
  let head = { x: 3, y: 1 };
  const rows = [];
  for (let i = 0; i < 12; i++) {
    head = { x: 3, y: head.y - 1 };
    laneFollow(lane, head);
    const r = head.y - lane.y0;
    assert.ok(r >= 0 && r < N);
    rows.push(r);
  }
  assert.deepEqual(rows.slice(0, 5), [2, 3, 4, 5, 5]);
  assert.ok(rows.slice(4).every((r) => r === 5));
  for (let i = 0; i < 30; i++) { head = { x: 3, y: head.y + 1 }; laneFollow(lane, head); }
  assert.equal(head.y - lane.y0, 10);
});

test('leaving and entering spaces never moves a cell; cells outside the board become off-board', () => {
  const lane = { kind: 'lane', y0: -20, prevY0: -20 };
  assert.deepEqual({ ...leaveToBox(lane, { x: 2, y: -20 }) }, { x: 2, y: 0 });
  assert.deepEqual({ ...leaveToBox(lane, { x: 2, y: -5 }) }, { x: 2, y: 15 });
  assert.equal(leaveToBox(lane, { x: 2, y: -4 }), null);
  assert.equal(leaveToBox(lane, { x: 2, y: -21 }), null);
  const cube = { kind: 'cube', face: 4, rot: 3, prevFace: 4, prevRot: 3, entered: null };
  const c = fromBoard(cube, 6, 2);
  assert.deepEqual({ ...leaveToBox(cube, c) }, { x: 6, y: 2 });
  assert.equal(leaveToBox(cube, { f: 1, u: 6, v: 2 }), null);
  for (const kind of ['box', 'lane', 'cube']) {
    const s = createSpace(kind);
    for (const [x, y] of [[0, 0], [15, 15], [7, 3]]) {
      const cell = enterFromBox(kind, { x, y });
      assert.deepEqual({ ...toBoard(s, cell) }, { x, y });
    }
  }
});

test('graphs: search stays inside the space and respects blocked cells', () => {
  for (const kind of ['box', 'lane', 'cube']) {
    const s = createSpace(kind);
    const g = spaceGraph(s);
    const start = g.index(fromBoard(s, 8, 8));
    const blocked = new Uint8Array(g.size);
    const all = bfs(g, blocked, start);
    const reached = [...all].filter((d) => d >= 0).length;
    assert.equal(reached, g.size, `${kind}: everything reachable`);
    // Wall the start in.
    for (const d of DIR_ORDER) blocked[g.index(stepIn(s, fromBoard(s, 8, 8), d).cell)] = 1;
    const shut = bfs(g, blocked, start);
    assert.equal([...shut].filter((d) => d >= 0).length, 1);
    for (let i = 0; i < g.size; i += 37) assert.equal(g.index(g.cell(i)), i);
  }
  assert.notEqual(cellKey('lane', { x: 15, y: -1 }), cellKey('lane', { x: 0, y: 0 }));
});
