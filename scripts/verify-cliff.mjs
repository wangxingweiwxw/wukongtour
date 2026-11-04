import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createJourneyScene} from '../src/heritage/journey-scenes.js';
import {createCloudFlight, CLOUD_FLIGHT} from '../src/heritage/cloud-flight.js';

// Integration coverage for the real authored mountain, complementing the
// controller's synthetic thin-wall tests. Rays inspect rendered triangles,
// independently of the occupied-cell / collision construction.
const world = createJourneyScene('xuankong');
world.root.updateMatrixWorld(true);
assert.ok(world.flight?.obstacles.length, 'the actual flying scene has obstacles');
const stone = world.root.children.filter(mesh => mesh.name.endsWith('-stone'));
assert.ok(stone.length, 'the mountain has stone geometry');
const ray = new THREE.Raycaster();
function cast(origin, direction, meshes = stone) {
  ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
  return ray.intersectObjects(meshes, false)[0];
}
function assertSolidBehind(hit, label) {
  assert.ok(hit, `${label}: no visible surface`);
  const inward = hit.point.clone().addScaledVector(hit.face.normal, -.04);
  assert.ok(world.flight.obstacles.some(bounds => bounds.containsPoint(inward)),
    `${label}: visible rock has no matching flight collision at ${inward.toArray()}`);
}

// Sample both faces so a hollow scenic facade cannot pass as a solid mountain.
let frontCount = 0, rearCount = 0;
const depths = [];
for (const x of [-30.23, -24.23, -18.23, -12.23, -6.23, .23, 6.23, 12.23, 18.23, 24.23, 30.23]) {
  for (const y of [5.37, 12.37, 19.37, 26.37, 33.37]) {
    const front = cast([x, y, 35], [0, 0, -1]);
    const rear = cast([x, y, -75], [0, 0, 1]);
    // A notch can legitimately be empty; whenever one side exists the other
    // must close it, at a distinct depth, with collision behind both faces.
    if (!front && !rear) continue;
    assertSolidBehind(front, `front x=${x}, y=${y}`);
    assertSolidBehind(rear, `rear x=${x}, y=${y}`);
    assert.ok(front.point.z > rear.point.z, 'mountain must have real depth');
    depths.push(front.point.z);
    frontCount++; rearCount++;
  }
}
assert.ok(frontCount > 20 && rearCount > 20, 'enough front/rear mountain samples were checked');
assert.ok(Math.max(...depths) - Math.min(...depths) > 4,
  'rock face must have relief across its shoulders and recessed center');

// Check solid rock (including moss-tinted shelves) and the closed underside.
// Decorative shrubs remain in the separate foliage batch and cannot masquerade
// as cliff tops in this collision check.
let verticalCount = 0;
for (const x of [-30.23, -24.23, -18.23, -12.23, -6.23, .23, 6.23, 12.23, 18.23, 24.23, 30.23]) {
  for (const z of [-50.27, -43.27, -36.27, -29.27, -22.27]) {
    const top = cast([x, 70, z], [0, -1, 0]);
    const bottom = cast([x, -5, z], [0, 1, 0]);
    if (!top) continue;
    assertSolidBehind(top, `crest x=${x}, z=${z}`);
    assertSolidBehind(bottom, `underside x=${x}, z=${z}`);
    assert.ok(top.point.y > bottom.point.y, 'rock column must have real height');
    verticalCount++;
  }
}
assert.ok(verticalCount >= 8, 'crest and closed underside have meaningful coverage');

// Fly into both shoulders at several elevations using the real frame-step
// controller. This catches stale collision lists after changing the mesh.
let approachCount = 0;
for (const x of [-30.23, -24.23, 24.23, 30.23]) {
  for (const y of [6.37, 15.37, 24.37]) {
    const hit = cast([x, y + 1, 28], [0, 0, -1]);
    if (!hit) continue;
    const hero = new THREE.Object3D();
    hero.position.set(x, y, 25);
    const flight = createCloudFlight({scene: new THREE.Scene(), getHero: () => hero});
    flight.configure(world);
    assert.equal(flight.toggle(), true, 'open viewing apron allows mounting');
    for (let i = 0; i < 17; i++) flight.update(.05);
    assert.equal(flight.status, 'flying');
    for (let i = 0; i < 100; i++) flight.update(.1, {direction: {x: 0, z: -1}, boost: true});
    assert.ok(hero.position.z < 24, 'test flight must leave its starting point');
    assert.ok(hero.position.z >= hit.point.z + CLOUD_FLIGHT.radius - 1e-4,
      `cloud tunneled through visible shoulder at x=${x}, y=${y}`);
    flight.dispose(); approachCount++;
  }
}
assert.ok(approachCount >= 6, 'both shoulders and multiple elevations were exercised');
world.root.traverse(object => {object.geometry?.dispose(); object.material?.dispose();});
console.log(JSON.stringify({ok: true, frontCount, rearCount, verticalCount, approachCount,
  checks: ['closed rock geometry', 'visible-surface collision coverage', 'non-flat cliff relief', 'boosted shoulder collision']}, null, 2));
