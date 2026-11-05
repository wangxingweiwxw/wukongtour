import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JOURNEYS } from '../src/heritage/journey-data.js';
import { createJourneyScene } from '../src/heritage/journey-scenes.js';
import { createCompoundScene } from '../src/heritage/compound-scene.js';
import { createSceneMapProjection } from '../src/heritage/scene-map-renderer.js';
import {
  createJourneyMapData, createCompoundMapData, createCourtyardMapData,
} from '../src/heritage/scene-map-data.js';

const courtyardBounds = { minX: -24, maxX: 24, minZ: -25, maxZ: 25 };

function verifyMap(data) {
  assert.ok(data.id && data.title && data.subtitle);
  assert.ok(Object.values(data.bounds).every(Number.isFinite));
  assert.ok(data.bounds.minX < data.bounds.maxX && data.bounds.minZ < data.bounds.maxZ);
  const ids = [...data.landmarks, ...data.points].map(point => point.id);
  assert.equal(new Set(ids).size, ids.length, `${data.id}: duplicate marker IDs`);
  for (const marker of [...data.landmarks, ...data.points]) {
    assert.ok(marker.name && marker.position.length === 3);
    assert.ok(marker.position.every(Number.isFinite));
  }
  for (const [x, , z] of [data.spawn, ...data.points.map(point => point.position)]) {
    assert.ok(x >= data.bounds.minX && x <= data.bounds.maxX, `${data.id}: point outside X bounds`);
    assert.ok(z >= data.bounds.minZ && z <= data.bounds.maxZ, `${data.id}: point outside Z bounds`);
  }
}

function verifyProjection(root, data) {
  const { camera, project, corners } = createSceneMapProjection({ root, bounds: data.bounds });
  const { minX, maxX, minZ, maxZ } = data.bounds;
  const boundary = [[minX, 0, minZ], [maxX, 0, minZ], [maxX, 0, maxZ], [minX, 0, maxZ]];
  const samples = [
    { name: 'spawn', position: data.spawn },
    ...data.points,
    ...data.landmarks,
    ...boundary.map((position, index) => ({ name: `boundary corner ${index}`, position })),
    ...boundary.map((position, index) => ({
      name: `boundary edge ${index}`,
      position: position.map((value, axis) => (value + boundary[(index + 1) % boundary.length][axis]) / 2),
    })),
  ];
  for (const { name, position } of samples) {
    const actual = project(...position);
    assert.ok(actual.visible && actual.x >= 0 && actual.x <= 1 && actual.y >= 0 && actual.y <= 1,
      `${data.id}: ${name} must remain inside the rendered map`);
    // Use Three's camera projection as an independent oracle. The overlay must
    // agree with the real rendered image, including each elevated walk stop.
    const ndc = new THREE.Vector3(...position).project(camera);
    assert.ok(Math.abs(actual.x - (ndc.x + 1) / 2) < 1e-10,
      `${data.id}: ${name} has a different X projection from the render camera`);
    assert.ok(Math.abs(actual.y - (1 - ndc.y) / 2) < 1e-10,
      `${data.id}: ${name} has a different Y projection from the render camera`);
    if (position[1] > 0) {
      assert.ok(actual.y < project(position[0], 0, position[2]).y,
        `${data.id}: ${name} must retain its actual height instead of snapping to the ground`);
    }
  }
  assert.deepEqual(corners, boundary.map(position => project(...position)), `${data.id}: boundary outline disagrees with overlays`);
  for (const corner of corners) {
    assert.ok(corner.x > .02 && corner.x < .98 && corner.y > .02 && corner.y < .98,
      `${data.id}: walkable boundary needs padding inside the image`);
  }
  const x = (minX + maxX) / 2, z = (minZ + maxZ) / 2;
  const ground = project(x, 0, z), raised = project(x, 1, z);
  assert.ok(raised.y < ground.y && Math.abs(raised.x - ground.x) < 1e-10,
    `${data.id}: points at the same X/Z but different heights need different image Y coordinates`);
  assert.throws(() => project(x, NaN, z), RangeError);
}

const signatureLandmarks = {
  shisi: ['山寺正殿', [0, 4.6, -11]],
  yungang: ['石窟坐佛', [0, 12, -12]],
  xuankong: ['中部楼阁', [0, 15, -10]],
  yingxian: ['八角木塔', [0, 13, -8]],
};

for (const journey of JOURNEYS) {
  const world = createJourneyScene(journey.id);
  const data = createJourneyMapData(journey.id, world);
  assert.ok(data.landmarks.length >= 3, `${journey.id}: at least three authored landmarks`);
  verifyMap(data);
  assert.equal(data.title, journey.name);
  assert.equal(data.subtitle, journey.subtitle);
  const expectedBounds = journey.id === 'xuankong'
    ? Object.fromEntries(['minX', 'maxX', 'minZ', 'maxZ'].map(key => [key, world.flight.bounds[key]]))
    : (world.mapBounds || courtyardBounds);
  assert.deepEqual(data.bounds, expectedBounds);
  if (world.flight) {
    assert.notEqual(data.bounds, world.flight.bounds, 'map bounds must not alias live flight state');
    assert.ok(data.bounds.minX < courtyardBounds.minX && data.bounds.maxX > courtyardBounds.maxX,
      'the flying player must remain inside the map at the mountain shoulders');
  }
  assert.deepEqual(data.spawn, world.spawn);
  assert.deepEqual(data.points, world.points.map(point => ({
    id: point.id,
    name: journey.points.find(item => item.id === point.id).title,
    position: point.position,
  })));
  for (const [id, [name, anchor]] of Object.entries(signatureLandmarks)) {
    const landmark = data.landmarks.find(item => item.name === name);
    if (id === journey.id) assert.deepEqual(landmark.position, anchor);
    else assert.equal(landmark, undefined, `${journey.id}: borrowed a different scene's landmark`);
  }
  const actualBounds = new THREE.Box3().setFromObject(world.root);
  for (const landmark of data.landmarks) {
    assert.ok(actualBounds.containsPoint(new THREE.Vector3(...landmark.position)), `${landmark.id}: anchor outside scene geometry`);
  }
  verifyProjection(world.root, data);
  // A map consumer may annotate or reorder data without editing live game state.
  data.points[0].position[0] += 1;
  assert.notDeepEqual(data.points[0].position, world.points[0].position);
  data.spawn[0] += 1;
  assert.notDeepEqual(data.spawn, world.spawn);
  world.root.traverse(object => object.geometry?.dispose());
}

const compound = createCompoundScene();
const compoundMap = createCompoundMapData(compound);
verifyMap(compoundMap);
assert.deepEqual(compoundMap.bounds, compound.bounds);
assert.notEqual(compoundMap.bounds, compound.bounds);
assert.deepEqual(compoundMap.spawn, compound.spawn);
assert.equal(compoundMap.landmarks.length, compound.buildings.length);
for (const [index, building] of compound.buildings.entries()) {
  assert.deepEqual(compoundMap.landmarks[index], {
    id: building.id, name: building.name, position: building.viewTarget, kind: 'building',
  });
}
assert.deepEqual(compoundMap.points, compound.walkRoute.map((point, index) => ({
  id: `compound-${index}`, name: point.name, position: point.position,
})));
assert.equal(compoundMap.points.filter(point => point.position[1] > 0).length,
  compound.walkRoute.filter(point => point.position[1] > 0).length, 'raised courtyards and indoor platforms retain their actual heights');
verifyProjection(compound.root, compoundMap);
compoundMap.points[0].position[2] += 1;
assert.notDeepEqual(compoundMap.points[0].position, compound.walkRoute[0].position);
compound.root.traverse(object => object.geometry?.dispose());

// Model-library halls, a tall pagoda and a transformed imported model all share
// this contract. Test with geometry of different proportions and parent poses.
for (const dimensions of [[16, 8, 12], [10, 24, 10], [5, 3, 19]]) {
  const parent = new THREE.Group();
  parent.position.set(2, 0, -3);
  parent.rotation.y = Math.PI / 2;
  const geometry = new THREE.BoxGeometry(...dimensions);
  const building = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  building.position.set(1, dimensions[1] * .4, 0);
  building.scale.setScalar(.8);
  parent.add(building);
  const court = new THREE.Group();
  const ancillary = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 8), building.material);
  ancillary.name = '偏殿';
  ancillary.position.set(-14, 2.5, -5);
  court.add(ancillary);
  const ring = new THREE.Object3D();
  ring.position.set(0, .08, 12);
  const originalMatrix = building.matrix.clone();
  const originalWorldMatrix = building.matrixWorld.clone();
  const data = createCourtyardMapData({
    id: 'model-preview', title: '模型庭院', building, courtyard: { root: court }, ring,
  });
  verifyMap(data);
  assert.deepEqual(data.bounds, courtyardBounds);
  assert.deepEqual(data.points, [{ id: 'courtyard-stamp', name: '建筑前留影点', position: [0, .08, 12] }]);
  assert.deepEqual(data.spawn, [0, 0, 16.2]);
  assert.equal(data.landmarks.length, 2);
  assert.equal(data.landmarks[1].name, '偏殿');
  const expectedCenter = new THREE.Vector3(1, dimensions[1] * .4, 0)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).add(parent.position);
  assert.ok(new THREE.Vector3(...data.landmarks[0].position).distanceTo(expectedCenter) < 1e-6,
    'imported model label uses its real transformed center');
  assert.deepEqual(data.landmarks[1].position, [-14, 2.5, -5]);
  assert.equal(building.parent, parent);
  assert.equal(ancillary.parent, court);
  assert.ok(building.matrix.equals(originalMatrix));
  assert.ok(building.matrixWorld.equals(originalWorldMatrix));
  assert.equal(geometry.boundingBox, null, 'map extraction must not mutate shared geometry');
  const customMap = createCourtyardMapData({
    id: 'custom-model', title: '导入建筑', building, courtyard: { root: court }, ring, custom: true,
  });
  verifyMap(customMap);
  assert.deepEqual(customMap.points, [], 'imported models must not fabricate stamp completion points');
  ring.position.z = 22;
  assert.deepEqual(createCourtyardMapData({ id: 'tall', title: '塔', building, ring, custom: true }).spawn, [0, 0, 20]);
  geometry.dispose();
  ancillary.geometry.dispose();
  building.material.dispose();
}

assert.throws(() => createSceneMapProjection({ root: new THREE.Group(), bounds: { minX: 0, maxX: 0, minZ: -1, maxZ: 1 } }), RangeError);

console.log(`Scene map data and projections verified: ${JOURNEYS.length} journeys, ${compound.buildings.length} compound buildings, ${compound.walkRoute.length} walk stops, padded walkable boundaries and camera-aligned overlays; scaled/imported courtyard data has no live-state mutations.`);
