import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCompoundScene } from '../src/heritage/compound-scene.js';
import { COMPOUND_LAYOUT } from '../src/heritage/compound-layout.js';
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
assert.ok(meshes <= 64, `draw budget: ${meshes}`);
assert.ok(triangles < 250000, `triangle budget: ${triangles}`);
assert.equal(world.buildings.length, 13);
assert.deepEqual(world.buildings.map(b => b.id), COMPOUND_LAYOUT.buildings.map(b => b.id));
assert.deepEqual(world.bounds, { minX: -48, maxX: 48, minZ: -68, maxZ: 76 });
assert.deepEqual(world.spawn, [0, 0, 71]);
assert.ok(canStand(world, world.spawn[0], world.spawn[2]));
assert.equal(world.displayName, '小雷音寺 · 雪山院落');
assert.ok(world.description.includes('原创'));
assert.ok(world.overview.target.every(Number.isFinite) && world.overview.position.every(Number.isFinite));
assert.deepEqual(world.terraces.map(t => t.height), [0, 1.44, 2.88]);
assert.equal(world.stairways.length, 6);
const mainHall = world.buildings.find(b => b.id === 'main-hall');
const mainSpec = COMPOUND_LAYOUT.buildings.find(b => b.id === 'main-hall');
const middleGate = world.buildings.find(b => b.id === 'terrace-gate');
assert.ok(mainHall.placement.z < middleGate.placement.z && mainHall.placement.y > middleGate.placement.y,
  'the principal hall stands behind and above the middle gate');
assert.equal(new Set(world.walkRoute.map(stop => stop.buildingId).filter(Boolean)).size, world.buildings.length,
  'the authored walk visits every building');

for (const b of world.buildings) {
  assert.ok(b.root.isGroup && world.root.children.includes(b.root));
  assert.ok(b.roofs.length >= 1 && b.roofs.every(mesh => mesh.isMesh && mesh.parent === b.root));
  assert.ok(b.roofs.every(mesh => mesh.visible && mesh.material.side === THREE.DoubleSide),
    `${b.id}: roof stays present and can be viewed from inside`);
  assert.ok(b.bounds instanceof THREE.Box3 && !b.bounds.isEmpty());
  const visibleBounds = new THREE.Box3().setFromObject(b.root);
  assert.ok(visibleBounds.min.distanceTo(b.bounds.min) < 1e-7 && visibleBounds.max.distanceTo(b.bounds.max) < 1e-7,
    `${b.id}: placement metadata must follow the actual visible building`);
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

// Explicitly enter the relocated main hall front/back and cross both flights.
const mainRun = mainHall.entry[2] - mainHall.interior[2];
for (const direction of [-1, 1]) {
  const p = { x: mainHall.interior[0], y: mainHall.placement.y,
    z: mainHall.interior[2] + direction * mainRun };
  let visitedTop = false;
  for (let i = 0; i < Math.round(mainRun * 20); i++) {
    const r = moveWalker(world, p, 0, -direction * .1);
    assert.equal(r.blocked, false, 'main hall front/back traversal');
    visitedTop ||= p.y === mainHall.interior[1];
  }
  assert.ok(visitedTop);
  assert.ok(Math.abs(p.z - (mainHall.interior[2] - direction * mainRun)) < 1e-6);
  assert.equal(p.y, mainHall.placement.y);
}

// All six connecting flights are physical 18cm steps, not visual ramps or
// invisible teleports. Replay ascent and descent through the real controller.
for (const stair of world.stairways) {
  const count = Math.round((stair.to - stair.from) / .18), run = count * .8;
  const low = {x: stair.x, y: stair.from, z: stair.z + run + .4};
  const high = {x: stair.x, y: stair.to, z: stair.z - .4};
  for (let level = 1; level <= count; level++) {
    const z = stair.z + (count - level + .5) * .8;
    assert.ok(Math.abs(groundHeight(world, stair.x, z) - (stair.from + level * .18)) < 1e-7,
      `${stair.id}: missing tread ${level}`);
  }
  for (const [from, to] of [[low, high], [high, low]]) {
    assert.ok(segmentWalkable(world, from, to), `${stair.id}: stair flight is discontinuous`);
    const walker = {...from};
    const result = moveWalker(world, walker, to.x - walker.x, to.z - walker.z);
    assert.ok(result.moved && result.stepped && !result.blocked, `${stair.id}: cannot traverse terrace stairs`);
    assert.ok(Math.hypot(walker.x - to.x, walker.y - to.y, walker.z - to.z) < 1e-7);
  }
}
for (const stair of world.stairways.filter(s => s.x === 0)) {
  const climber = {x: 10, y: stair.from, z: stair.z + .05};
  assert.ok(moveWalker(world, climber, 0, -.1).blocked, `${stair.id}: no climbing the retaining wall beside the stairs`);
  assert.equal(climber.y, stair.from);
}
// Side doors are real walkable passages, including the shared gallery bays.
// Exercise long displacements in both directions to catch blocked narrow treads.
let lateralEntries = 0;
for (const b of world.buildings) for (const entry of b.sideEntries) {
  const p = point(entry), target = point(b.interior);
  assert.ok(canStand(world, p.x, p.z), `${b.id}: side approach blocked`);
  assert.equal(groundHeight(world, p.x, p.z), b.placement.y, `${b.id}: side approach starts on its court terrace`);
  assert.ok(segmentWalkable(world, p, target), `${b.id}: side doorway is not continuous`);
  const inward = moveWalker(world, p, target.x - p.x, target.z - p.z);
  assert.ok(inward.moved && inward.stepped && !inward.blocked, `${b.id}: cannot enter from side`);
  assert.ok(Math.hypot(p.x - target.x, p.z - target.z) < 1e-7);
  assert.equal(p.y, target.y, `${b.id}: player must stand on the interior floor`);
  const outward = moveWalker(world, p, entry[0] - p.x, entry[2] - p.z);
  assert.ok(outward.moved && outward.stepped && !outward.blocked, `${b.id}: cannot leave through side door`);
  assert.ok(Math.hypot(p.x - entry[0], p.z - entry[2]) < 1e-7);
  assert.equal(p.y, b.placement.y, `${b.id}: player must descend to its court terrace`);
  assert.ok(b.roofs.every(mesh => mesh.visible), `${b.id}: walking must retain the roof`);
  lateralEntries++;
}
assert.equal(lateralEntries, 8, 'three halls and one pagoda have paired side entrances');
assert.equal(canStand(world, mainSpec.x + mainSpec.w / 2, mainSpec.z + 5, mainHall.interior[1]), false,
  'solid side-wall return still blocks movement');
assert.equal(canStand(world, mainSpec.x + 4.4, mainSpec.z + mainSpec.d / 2 + .25, mainHall.interior[1]), false,
  'visible doorway column still blocks movement');
const platformEdge = mainSpec.x + (mainSpec.w + 2) / 2;
const sideClimber = { x: platformEdge + .5, y: mainSpec.base, z: mainSpec.z + 3.6 };
assert.ok(moveWalker(world, sideClimber, -1, 0).blocked, 'no jumping up platform sides');
assert.ok(sideClimber.x > platformEdge && sideClimber.y === mainSpec.base);
console.log(`PASS compound: ${world.buildings.length} buildings, ${meshes} draw batches, ${triangles} triangles; ${lateralEntries} lateral entrances, 3 terraces, 6 connecting stairways, all interiors and routes verified`);
world.root.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
