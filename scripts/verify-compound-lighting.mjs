import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCompoundLighting } from '../src/heritage/compound-lighting.js';
import { createCompoundScene } from '../src/heritage/compound-scene.js';

const sun = new THREE.DirectionalLight('#ffe2b0', 3);
sun.shadow.mapSize.set(2048, 2048);
const color = sun.color.clone(), intensity = sun.intensity;
const lighting = createCompoundLighting(sun);
const lightDirection = new THREE.Vector3(-32, 42, 27).normalize();
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} != ${b}`);
const camera = sun.shadow.camera;

function shadowCamera() {
  sun.updateWorldMatrix(true, false);
  sun.target.updateWorldMatrix(true, false);
  sun.shadow.updateMatrices(sun);
  return camera;
}
function verifyDirection() {
  assert.ok(sun.position.clone().sub(sun.target.position).normalize().distanceTo(lightDirection) < 1e-12,
    'following the player must not rotate the sun');
}
function insideShadow(point, label) {
  const ndc = new THREE.Vector3(...point).project(shadowCamera());
  assert.ok([ndc.x, ndc.y, ndc.z].every(value => value >= -1 && value <= 1),
    `${label} falls outside the real shadow camera: ${ndc.toArray()}`);
}

// Exercise the actual authored scene, including raised interior floors and the
// formerly uncovered opposite corners of the playable square.
const world = createCompoundScene();
const corners = [];
for (const x of [world.bounds.minX, world.bounds.maxX]) for (const z of [world.bounds.minZ, world.bounds.maxZ]) {
  corners.push([x, 0, z]);
}
for (const [index, point] of [world.spawn, ...world.walkRoute.map(stop => stop.position), ...corners].entries()) {
  const position = new THREE.Vector3(...point);
  lighting.update({ active: true, mode: 'walk', position });
  verifyDirection();
  assert.equal(camera.left, -32); assert.equal(camera.right, 32);
  assert.equal(camera.near, 1); assert.equal(camera.far, 180);
  for (const x of [-20, 0, 20]) for (const z of [-20, 0, 20]) for (const y of [0, 8]) {
    insideShadow([position.x + x, position.y + y, position.z + z], `walk ${index} neighborhood`);
  }
  sun.shadow.needsUpdate = false;
  assert.equal(lighting.update({ active: true, mode: 'walk', position }), false);
  assert.equal(sun.shadow.needsUpdate, false, 'stationary walking must not dirty shadows');
}

// Read the real camera axes rather than reproducing the controller's basis.
lighting.update({ active: true, mode: 'walk', position: new THREE.Vector3() });
shadowCamera();
const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
const texelX = (camera.right - camera.left) / sun.shadow.mapSize.x;
const texelY = (camera.top - camera.bottom) / sun.shadow.mapSize.y;
const nudge = right.clone().multiplyScalar(texelX * .2).addScaledVector(up, texelY * .2);
sun.shadow.needsUpdate = false;
assert.equal(lighting.update({ active: true, mode: 'walk', position: nudge }), false,
  'sub-texel movement in the light plane must keep the shadow grid stationary');
assert.equal(sun.shadow.needsUpdate, false);
const crossing = right.clone().multiplyScalar(texelX * .7).addScaledVector(up, texelY * .7);
assert.equal(lighting.update({ active: true, mode: 'walk', position: crossing }), true);
assert.equal(sun.shadow.needsUpdate, true);
close(sun.target.position.dot(right), texelX, 'horizontal focus snaps to a real shadow texel');
close(sun.target.position.dot(up), texelY, 'vertical focus snaps to a real shadow texel');
verifyDirection();

// A fixed landmark may move by an integer number of shadow pixels as the focus
// moves, never by fractions that make otherwise static roof edges shimmer.
const landmark = new THREE.Vector3(3, 1, -4);
const before = landmark.clone().project(shadowCamera());
lighting.update({ active: true, mode: 'walk', position: new THREE.Vector3(5.43, .72, 7.87) });
const after = landmark.clone().project(shadowCamera());
for (const [difference, resolution] of [[after.x - before.x, sun.shadow.mapSize.x], [after.y - before.y, sun.shadow.mapSize.y]]) {
  const pixels = difference * resolution / 2;
  close(pixels, Math.round(pixels), 'a fixed landmark remains aligned to the shadow texel grid');
}

for (const mode of ['overview', 'inspect']) {
  lighting.update({ active: true, mode, world });
  verifyDirection();
  assert.ok(sun.target.position.toArray().every(Number.isFinite));
  assert.ok(camera.right > 0 && camera.top > 0);
  assert.equal(camera.left, -camera.right); assert.equal(camera.bottom, -camera.top);
  assert.equal(camera.near, 1); assert.ok(camera.far > camera.near);
  for (const [x, , z] of corners) for (const y of [0, 1.8]) insideShadow([x, y, z], `${mode} playable corner`);
  for (const building of world.buildings) {
    for (const x of [building.bounds.min.x, building.bounds.max.x]) {
      for (const y of [building.bounds.min.y, building.bounds.max.y]) {
        for (const z of [building.bounds.min.z, building.bounds.max.z]) insideShadow([x, y, z], `${mode} ${building.id}`);
      }
    }
  }
  sun.shadow.needsUpdate = false;
  assert.equal(lighting.update({ active: true, mode, world }), false);
  assert.equal(sun.shadow.needsUpdate, false);
}

assert.equal(lighting.reset(), true);
assert.deepEqual(sun.position.toArray(), [-18, 28, 18]);
assert.deepEqual(sun.target.position.toArray(), [0, 0, 0]);
assert.equal(camera.left, -35); assert.equal(camera.right, 35);
assert.equal(camera.top, 35); assert.equal(camera.bottom, -35);
assert.equal(camera.near, 1); assert.equal(camera.far, 100);
sun.shadow.needsUpdate = false;
assert.equal(lighting.reset(), false);
assert.equal(lighting.update({ active: false }), false);
assert.equal(sun.shadow.needsUpdate, false);
assert.ok(sun.color.equals(color)); assert.equal(sun.intensity, intensity);
assert.deepEqual(sun.shadow.mapSize.toArray(), [2048, 2048]);
assert.throws(() => lighting.update({ active: true, mode: 'walk', position: { x: NaN, y: 0, z: 0 } }), RangeError);
assert.throws(() => createCompoundLighting(new THREE.PointLight()), TypeError);
world.root.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
console.log('Compound lighting: 17 walking positions and neighborhoods, light-plane texel stability, overview/inspection coverage, unchanged light direction, and courtyard reset passed.');
