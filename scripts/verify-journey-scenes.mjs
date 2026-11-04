import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createJourneyScene } from '../src/heritage/journey-scenes.js';
import { findJourneyPath } from '../src/heritage/journey-path.js';
import { canStand, findWalkPath, groundHeight, moveWalker, segmentWalkable } from '../src/heritage/walk-controller.js';
import { JOURNEYS } from '../src/heritage/journey-data.js';

// Validate the actual authored play space at 25cm resolution, rather than only
// checking isolated markers. Collision boxes already include held-staff clearance.
const STEP = .25;
const MIN_X = -24, MAX_X = 24, MIN_Z = -25, MAX_Z = 25;
const NX = Math.round((MAX_X - MIN_X) / STEP) + 1;
const NZ = Math.round((MAX_Z - MIN_Z) / STEP) + 1;
const cell = ([x, , z]) => Math.round((z - MIN_Z) / STEP) * NX + Math.round((x - MIN_X) / STEP);

function assertLegacyClearPath(label, start, end, isBlocked, obstacles) {
  const path = findJourneyPath(start, end, isBlocked, obstacles);
  assert.ok(path.length >= 2, `${label}: gameplay path is empty`);
  assert.deepEqual(path[0], start);
  assert.deepEqual(path.at(-1), end);
  for (let segment = 1; segment < path.length; segment++) {
    const a = path[segment - 1], b = path[segment];
    const samples = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .01));
    for (let i = 0; i <= samples; i++) {
      const x = a.x + (b.x - a.x) * i / samples, z = a.z + (b.z - a.z) * i / samples;
      assert.equal(isBlocked(x, z), false, `${label}: path crosses collision at ${x.toFixed(4)}, ${z.toFixed(4)}`);
    }
  }
  return path;
}

function assertWalkPath(label, world, start, end) {
  const path = findWalkPath(world, start, end);
  assert.ok(path.length >= 2, `${label}: gameplay path is empty`);
  assert.deepEqual(path[0], {...start, y: groundHeight(world, start.x, start.z)});
  assert.deepEqual(path.at(-1), {...end, y: groundHeight(world, end.x, end.z)});
  const walker = {...path[0]};
  for (let segment = 1; segment < path.length; segment++) {
    const a = path[segment - 1], b = path[segment];
    assert.ok(segmentWalkable(world, a, b), `${label}: guide cuts a wall or platform side`);
    const samples = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .11));
    for (let i = 1; i <= samples; i++) {
      const x = a.x + (b.x - a.x) * i / samples, z = a.z + (b.z - a.z) * i / samples;
      const step = moveWalker(world, walker, x - walker.x, z - walker.z);
      assert.equal(step.blocked, false, `${label}: player cannot follow the guide`);
      assert.ok(canStand(world, walker.x, walker.z, walker.y));
      assert.equal(walker.y, groundHeight(world, walker.x, walker.z), `${label}: guide or hero floats above floor`);
    }
  }
  assert.ok(Math.hypot(walker.x - end.x, walker.z - end.z) < 1e-6, `${label}: failed to reach target`);
  return path;
}

for (const {id} of JOURNEYS) {
  const scene = createJourneyScene(id);
  assert.ok(scene.root instanceof THREE.Group);
  assert.equal(scene.points.length, 3);
  assert.ok(scene.root.children.length <= 25, `${id}: draw call budget`);
  assert.deepEqual(scene.bounds, {minX: MIN_X, maxX: MAX_X, minZ: MIN_Z, maxZ: MAX_Z});
  const isBlocked = (x, z) => !canStand(scene, x, z);
  const blocked = new Uint8Array(NX * NZ);
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    const x = MIN_X + ix * STEP, z = MIN_Z + iz * STEP;
    if (isBlocked(x, z)) blocked[iz * NX + ix] = 1;
  }
  // Players may collect out of order or return to the entrance. Check every
  // directed pair, including stationary routes, using the runtime obstacle list.
  const destinations = [scene.spawn, ...scene.points.map(point => point.position)]
    .map(([x, , z]) => ({x, z}));
  for (const [from, start] of destinations.entries()) for (const [to, end] of destinations.entries()) {
    assertWalkPath(`${id} point ${from} -> ${to}`, scene, start, end);
  }
  const reached = new Uint8Array(NX * NZ);
  const queue = [cell(scene.spawn)];
  assert.equal(blocked[queue[0]], 0, `${id}: spawn obstructed`);
  reached[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head], ix = at % NX, iz = Math.floor(at / NX);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (ix + dx < 0 || ix + dx >= NX || iz + dz < 0 || iz + dz >= NZ) continue;
      const next = at + dx + dz * NX;
      if (blocked[next] || reached[next]) continue;
      const from = {x: MIN_X + ix * STEP, z: MIN_Z + iz * STEP};
      if (!segmentWalkable(scene, from, {x: from.x + dx * STEP, z: from.z + dz * STEP})) continue;
      reached[next] = 1;
      queue.push(next);
    }
  }
  for (const [i, point] of scene.points.entries()) {
    assert.equal(point.id, `${id}-${i + 1}`);
    assert.equal(point.position[1], 0, `${point.id}: floating observation point`);
    assert.ok(point.position[0] >= MIN_X && point.position[0] <= MAX_X);
    assert.ok(point.position[2] >= MIN_Z && point.position[2] <= MAX_Z);
    assert.equal(reached[cell(point.position)], 1, `${point.id}: route is blocked`);
  }
  assert.equal(Math.hypot(scene.spawn[0] - scene.points[0].position[0], scene.spawn[2] - scene.points[0].position[2]), 5);
  for (const c of scene.colliders) {
    assert.ok(Object.values(c).every(Number.isFinite));
    assert.ok(c.minX < c.maxX && c.minZ < c.maxZ);
  }
  for (const box of scene.cameraBounds) {
    assert.ok(box instanceof THREE.Box3 && !box.isEmpty());
    assert.ok([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite));
  }
  let triangles = 0;
  for (const mesh of scene.root.children) {
    assert.ok(mesh.geometry.getAttribute('position').array.every(Number.isFinite));
    assert.ok(mesh.geometry.getAttribute('normal').array.every(Number.isFinite));
    triangles += mesh.geometry.index.count / 3;
  }
  assert.ok(triangles < 50000, `${id}: triangle budget`);
  console.log(`${id}: ${scene.root.children.length} draw batches, ${triangles} triangles; 3 reachable points + all 16 guided paths traversed with the gameplay controller`);
  scene.root.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
}

assert.throws(() => createJourneyScene('missing'), RangeError);

// This segment previously clipped a lantern's padded corner between 25cm samples.
// The second case narrows the crossed corner below 1mm, so even the denser test
// sampling alone cannot substitute for the exact intersection check.
const start = {x: 0, z: 20}, end = {x: -11, z: 4};
for (const minX of [-6.85, -6.841]) {
  const corner = {minX, maxX: -2.75, minZ: 5.95, maxZ: 10.05};
  const isBlocked = (x, z) => x < MIN_X || x > MAX_X || z < MIN_Z || z > MAX_Z
    || (x > corner.minX && x < corner.maxX && z > corner.minZ && z < corner.maxZ);
  // A known interior point proves that the straight segment really is blocked.
  const midpointT = ((20 - corner.maxZ) / 16 + (-corner.minX) / 11) / 2;
  assert.ok(isBlocked(-11 * midpointT, 20 - 16 * midpointT));
  for (const [a, b] of [[start, end], [end, start]]) {
    const path = assertLegacyClearPath(`narrow corner ${minX}`, a, b, isBlocked, [corner]);
    assert.ok(path.length > 2, `narrow corner ${minX}: shortcut through corner must be rejected`);
    const actualPath = assertWalkPath(`walker narrow corner ${minX}`, {colliders: [corner],
      bounds: {minX: MIN_X, maxX: MAX_X, minZ: MIN_Z, maxZ: MAX_Z}}, a, b);
    assert.ok(actualPath.length > 2, `walker narrow corner ${minX}: shortcut through corner must be rejected`);
  }
}
console.log('Narrow-corner regression: original lantern corner and sub-millimetre crossing both detour in both directions');
