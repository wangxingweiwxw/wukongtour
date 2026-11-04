import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCompoundScene } from '../src/heritage/compound-scene.js';
import { groundHeight, canStand, moveWalker, segmentWalkable, findWalkPath } from '../src/heritage/walk-controller.js';

const world = createCompoundScene();
const point = ([x, y, z]) => ({ x, y, z });
let meshes = 0, triangles = 0;
world.root.traverse(node => {
  if (!node.isMesh) return;
  meshes++;
  triangles += node.geometry.index.count / 3;
  assert.ok(node.geometry.getAttribute('position').array.every(Number.isFinite));
  assert.ok(node.geometry.getAttribute('normal').array.every(Number.isFinite));
});
assert.ok(meshes < 60, `draw budget: ${meshes}`);
assert.ok(triangles < 250000, `triangle budget: ${triangles}`);
assert.ok(world.buildings.length >= 8);
assert.deepEqual(world.bounds, { minX: -44, maxX: 44, minZ: -48, maxZ: 48 });
assert.deepEqual(world.spawn, [0, 0, 42]);
assert.ok(canStand(world, 0, 42));

for (const b of world.buildings) {
  assert.ok(b.root.isGroup && world.root.children.includes(b.root));
  assert.ok(b.roofs.length >= 1 && b.roofs.every(mesh => mesh.isMesh && mesh.parent === b.root));
  assert.ok(b.roofs.every(mesh => mesh.visible && mesh.material.side === THREE.DoubleSide),
    `${b.id}: roof stays present and can be viewed from inside`);
  assert.ok(b.bounds instanceof THREE.Box3 && !b.bounds.isEmpty());
  assert.ok(b.floorBounds.minX < b.floorBounds.maxX && b.floorBounds.minZ < b.floorBounds.maxZ);
  assert.ok(canStand(world, b.entry[0], b.entry[2]), `${b.id}: entry obstructed`);
  assert.ok(canStand(world, b.interior[0], b.interior[2]), `${b.id}: interior obstructed`);
  assert.equal(groundHeight(world, b.interior[0], b.interior[2]), b.interior[1]);
  assert.ok(findWalkPath(world, point(world.spawn), point(b.entry)).length >= 2, `${b.id}: entry unreachable from spawn`);
  assert.ok(findWalkPath(world, point(b.entry), point(b.interior)).length >= 2, `${b.id}: cannot enter interior`);
  assert.ok(findWalkPath(world, point(b.interior), point(b.entry)).length >= 2, `${b.id}: cannot leave interior`);
  for (const roof of b.roofs) roof.visible = false;
  assert.ok(b.root.children.some(mesh => mesh.visible), `${b.id}: cutaway hides the whole building`);
  for (const roof of b.roofs) roof.visible = true;
  assert.ok(world.cameraObstacles.some(c => c.buildingId === b.id && c.roof), `${b.id}: missing roof camera data`);
}
for (const c of world.colliders) {
  assert.ok([c.minX, c.maxX, c.minZ, c.maxZ, c.minY, c.maxY].every(Number.isFinite));
  assert.ok(c.maxY > c.minY);
}

// Traverse every authored tour leg using the exact gameplay controller, not a
// substitute ground-only grid. Each returned line is stepped at walking speed.
let from = point(world.spawn);
for (const stop of world.walkRoute) {
  const to = point(stop.position);
  assert.ok(canStand(world, to.x, to.z), `${stop.name}: blocked stop`);
  assert.equal(groundHeight(world, to.x, to.z), to.y, `${stop.name}: wrong marker floor`);
  const path = findWalkPath(world, from, to);
  assert.ok(path.length >= 2, `${stop.name}: no playable route`);
  const walker = { ...from };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    assert.ok(segmentWalkable(world, a, b), `${stop.name}: invalid simplified path`);
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .11));
    for (let j = 1; j <= n; j++) {
      const targetX = a.x + (b.x - a.x) * j / n, targetZ = a.z + (b.z - a.z) * j / n;
      const result = moveWalker(world, walker, targetX - walker.x, targetZ - walker.z);
      assert.equal(result.blocked, false, `${stop.name}: controller blocked on planned route`);
      assert.ok(canStand(world, walker.x, walker.z, walker.y));
      assert.equal(walker.y, groundHeight(world, walker.x, walker.z));
    }
  }
  assert.ok(Math.hypot(walker.x - to.x, walker.z - to.z) < 1e-6, `${stop.name}: failed to arrive`);
  from = to;
  console.log(`PASS route: ${stop.name} (${path.length} waypoints)`);
}

// Explicitly enter the main hall front/back and cross both stair flights.
for (const direction of [-1, 1]) {
  const p = { x: 0, y: 0, z: direction * 13 };
  let visitedTop = false;
  for (let i = 0; i < 260; i++) {
    const r = moveWalker(world, p, 0, -direction * .1);
    assert.equal(r.blocked, false, 'main hall front/back traversal');
    visitedTop ||= p.y === .72;
  }
  assert.ok(visitedTop);
  assert.ok(Math.abs(p.z + direction * 13) < 1e-6);
  assert.equal(p.y, 0);
}
// Side doors are real walkable passages, including the shared gallery bays.
// Exercise long displacements in both directions to catch blocked narrow treads.
let lateralEntries = 0;
for (const b of world.buildings) for (const entry of b.sideEntries) {
  const p = point(entry), target = point(b.interior);
  assert.ok(canStand(world, p.x, p.z), `${b.id}: side approach blocked`);
  assert.equal(groundHeight(world, p.x, p.z), 0, `${b.id}: side approach starts on ground`);
  assert.ok(segmentWalkable(world, p, target), `${b.id}: side doorway is not continuous`);
  const inward = moveWalker(world, p, target.x - p.x, target.z - p.z);
  assert.ok(inward.moved && inward.stepped && !inward.blocked, `${b.id}: cannot enter from side`);
  assert.ok(Math.hypot(p.x - target.x, p.z - target.z) < 1e-7);
  assert.equal(p.y, target.y, `${b.id}: player must stand on the interior floor`);
  const outward = moveWalker(world, p, entry[0] - p.x, entry[2] - p.z);
  assert.ok(outward.moved && outward.stepped && !outward.blocked, `${b.id}: cannot leave through side door`);
  assert.ok(Math.hypot(p.x - entry[0], p.z - entry[2]) < 1e-7);
  assert.equal(p.y, 0, `${b.id}: player must descend to ground`);
  assert.ok(b.roofs.every(mesh => mesh.visible), `${b.id}: walking must retain the roof`);
  lateralEntries++;
}
assert.equal(lateralEntries, 8, 'three halls and one pagoda have paired side entrances');
assert.equal(canStand(world, 11, 5, .72), false, 'solid side-wall return still blocks movement');
assert.equal(canStand(world, 4.4, 7.25, .72), false, 'visible doorway column still blocks movement');
const sideClimber = { x: 12.5, y: 0, z: 3.6 };
assert.ok(moveWalker(world, sideClimber, -1, 0).blocked, 'no jumping up platform sides');
assert.ok(sideClimber.x > 12 && sideClimber.y === 0);
console.log(`PASS compound: ${world.buildings.length} buildings, ${meshes} draw batches, ${triangles} triangles; ${lateralEntries} lateral entrances, all interiors, routes and stairs verified`);
world.root.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
