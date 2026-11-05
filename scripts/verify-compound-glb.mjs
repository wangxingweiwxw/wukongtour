import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCompoundScene} from '../src/heritage/compound-scene.js';
import {createImportedCompound, extractCompoundMetadata, hasCompoundMetadata, serializeCompoundMetadata} from '../src/heritage/compound-glb.js';
import {canStand, findWalkPath, moveWalker} from '../src/heritage/walk-controller.js';

// The exporter uses FileReader even for binary buffers; Node supplies Blob but
// not this small browser bridge. No DOM/canvas mocks or disk artifacts needed.
if (!globalThis.FileReader) globalThis.FileReader = class {
  readAsArrayBuffer(blob) {blob.arrayBuffer().then(value => {this.result = value;this.onloadend?.({target:this});}, error => this.onerror?.(error));}
  readAsDataURL(blob) {blob.arrayBuffer().then(value => {this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.({target:this});}, error => this.onerror?.(error));}
};

const source = createCompoundScene();
const metadata = serializeCompoundMetadata(source);
assert.equal(metadata.version, 1);assert.equal(metadata.kind, 'compound');
assert.equal(metadata.buildings.length, source.buildings.length);
assert.ok(!Object.hasOwn(source.root.userData, 'heritageScene'), 'serialization must not mutate live metadata');
source.root.userData.heritageScene = metadata;
const binary = await new GLTFExporter().parseAsync(source.root, {binary:true});
assert.ok(binary instanceof ArrayBuffer);
const bytes = Buffer.from(binary);
assert.equal(bytes.readUInt32LE(0), 0x46546c67);assert.equal(bytes.readUInt32LE(4), 2);
assert.equal(bytes.readUInt32LE(8), bytes.length);
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
assert.ok(json.buffers.every(buffer => !buffer.uri), 'buffers must be embedded');
assert.ok((json.images || []).every(image => image.bufferView !== undefined), 'images must be embedded');
assert.equal(json.nodes.filter(node => node.extras?.heritageScene).length, 1);
const gltf = await new GLTFLoader().parseAsync(binary, '');
assert.equal(hasCompoundMetadata(gltf), true);
const imported = createImportedCompound(gltf);
assert.equal(imported.imported, true);
assert.equal(imported.displayName, metadata.name);
assert.equal(imported.description, metadata.description);
assert.deepEqual(imported.bounds, source.bounds);assert.deepEqual(imported.spawn, source.spawn);
assert.deepEqual(imported.colliders, source.colliders);assert.deepEqual(imported.surfaces, source.surfaces);
assert.equal(imported.buildings.length, source.buildings.length);
assert.ok(imported.cameraBounds.every(box => box instanceof THREE.Box3));
assert.ok(imported.cameraObstacles.every(c => c.box instanceof THREE.Box3));
assert.deepEqual(extractCompoundMetadata(gltf), metadata);
assert.deepEqual(serializeCompoundMetadata(imported), metadata, 'imported scenes can be re-exported without metadata drift');
for (const building of imported.buildings) {
  assert.equal(building.root.parent, imported.root, 'inspection uses direct root children');
  assert.ok(building.bounds instanceof THREE.Box3 && !building.bounds.isEmpty());
  assert.ok(building.roofs.every(roof => roof.userData.isRoof));
  assert.ok(building.roofs.every(roof => roof.castShadow && roof.receiveShadow), 'GLB roundtrip restores roof shadows');
  assert.equal(building.root.userData.buildingId, building.id);
  building.roofs.forEach(roof => {roof.visible = false;});
  assert.ok(building.root.children.some(node => node.visible), 'cutaway preserves the building body');
  building.roofs.forEach(roof => {roof.visible = true;});
}

// Imported navigation must drive the actual movement controller, not just have
// the same JSON shape. Follow every route segment through stairs and doorways.
const asPoint = ([x,y,z]) => ({x,y,z});let walker = asPoint(imported.spawn);
for (const stop of imported.walkRoute) {
  const path = findWalkPath(imported, walker, asPoint(stop.position));
  assert.ok(path.length, `${stop.name}: reachable after GLB roundtrip`);
  for (const target of path.slice(1)) {
    const result = moveWalker(imported, walker, target.x - walker.x, target.z - walker.z);
    assert.equal(result.blocked, false, `${stop.name}: movement remains unobstructed`);
  }
  assert.ok(Math.hypot(walker.x - stop.position[0], walker.z - stop.position[2]) < 1e-5);
  assert.ok(canStand(imported, walker.x, walker.z, walker.y));
}

let rejected = 0;
function rejects(change, match = /古建群 GLB 元数据无效/) {
  const invalid = structuredClone(metadata);change(invalid);
  imported.root.userData.heritageScene = invalid;
  assert.equal(hasCompoundMetadata(gltf), true, 'bad metadata must not silently become an ordinary preview');
  assert.throws(() => createImportedCompound(gltf), match);rejected++;
  imported.root.userData.heritageScene = metadata;
}
rejects(m => {m.version = 99;});
rejects(m => {m.kind = 'generic';});
rejects(m => {m.bounds.maxX = Infinity;});
rejects(m => {m.bounds.maxX = m.bounds.minX;});
rejects(m => {m.bounds.maxX = m.bounds.minX + 1000;});
rejects(m => {m.colliders = undefined;});
rejects(m => {m.colliders[0].minY = NaN;});
rejects(m => {m.surfaces[0].height = -1;});
rejects(m => {m.surfaces[0].maxZ = m.bounds.maxZ + 1;});
rejects(m => {m.colliders[0].minX = m.bounds.minX - 100;});
rejects(m => {m.spawn[0] = m.bounds.maxX + 1;});
rejects(m => {m.spawn[1] += 2;});
rejects(m => {m.buildings[0].nodeName = 'missing-node';});
rejects(m => {m.buildings[1].id = m.buildings[0].id;});
rejects(m => {m.buildings[0].roofNodeNames = [m.buildings[1].roofNodeNames[0]];});
rejects(m => {m.buildings[0].floorBounds.maxX = m.bounds.maxX + 1;});
rejects(m => {m.buildings[0].interior[0] = m.buildings[0].floorBounds.maxX + .1;});
rejects(m => {m.walkRoute = [];});
rejects(m => {m.walkRoute[0].position[2] = m.bounds.maxZ + 1;});
rejects(m => {m.cameraObstacles[0].buildingId = 'missing-building';});
rejects(m => {m.cameraObstacles[0].box.min = [0,0,0];m.cameraObstacles[0].box.max = [0,0,0];});
rejects(m => {
  const [x,y,z] = m.spawn;
  m.colliders.push({minX:x-.1,maxX:x+.1,minY:y-.1,maxY:y+2,minZ:z-.1,maxZ:z+.1});
}, /站位被碰撞体遮挡/);
rejects(m => {
  const [x,y,z] = m.spawn;
  for (const r of [
    {minX:x-.6,maxX:x-.5,minZ:z-.6,maxZ:z+.6},
    {minX:x+.5,maxX:x+.6,minZ:z-.6,maxZ:z+.6},
    {minX:x-.6,maxX:x+.6,minZ:z-.6,maxZ:z-.5},
    {minX:x-.6,maxX:x+.6,minZ:z+.5,maxZ:z+.6},
  ]) m.colliders.push({...r,minY:y-.1,maxY:y+3});
}, /缺少可通行路径/);

const duplicate = new THREE.Group();duplicate.name = metadata.buildings[0].nodeName;imported.root.add(duplicate);
assert.throws(() => createImportedCompound(gltf), /节点名不存在或不唯一/);duplicate.removeFromParent();rejected++;
imported.root.position.x = 1;
assert.throws(() => createImportedCompound(gltf), /单位变换/);imported.root.position.x = 0;rejected++;
gltf.scene.scale.setScalar(.01);
assert.throws(() => createImportedCompound(gltf), /单位变换/);gltf.scene.scale.setScalar(1);rejected++;
const nested = new THREE.Group();nested.add(new THREE.Group());nested.children[0].add(new THREE.Group());
nested.children[0].children[0].userData.heritageScene = metadata;
assert.throws(() => createImportedCompound({scene:nested}), /顶层根节点/);rejected++;
imported.root.userData.heritageScene = null;
assert.throws(() => createImportedCompound(gltf), /必须为对象/);imported.root.userData.heritageScene = metadata;rejected++;

const noCamera = structuredClone(metadata);delete noCamera.cameraObstacles;
imported.root.userData.heritageScene = noCamera;
const fallback = createImportedCompound(gltf);
assert.ok(fallback.cameraObstacles.some(c => c.roof && c.buildingId));
assert.equal(fallback.cameraBounds.length, metadata.colliders.length + imported.buildings.reduce((sum,b) => sum+b.roofs.length,0));
imported.root.userData.heritageScene = metadata;

const ordinary = {scene:new THREE.Group()};ordinary.scene.name = 'ordinary-model';
const before = ordinary.scene.toJSON();
assert.equal(hasCompoundMetadata(ordinary), false);
assert.equal(extractCompoundMetadata(ordinary), null);
assert.equal(createImportedCompound(ordinary), null);
assert.deepEqual(ordinary.scene.toJSON(), before, 'ordinary preview is unchanged');

// Legal glTF names may contain punctuation that GLTFLoader removes. Resolve
// original names via parser associations, then serialize the new runtime names.
const namedRoot = new THREE.Group(), namedBuilding = new THREE.Group();
namedRoot.name = 'named-compound';namedBuilding.name = 'Main Hall.一';namedRoot.add(namedBuilding);
const floor = new THREE.Mesh(new THREE.BoxGeometry(5,.1,5), new THREE.MeshStandardMaterial());floor.position.y = -.05;
const roof = new THREE.Mesh(new THREE.BoxGeometry(6,.3,6), new THREE.MeshStandardMaterial());roof.name = 'Roof.檐 [upper]';roof.position.y = 3;
namedBuilding.add(floor, roof);
const namedWorld = {root:namedRoot,displayName:'名称兼容场景',description:'',bounds:{minX:-6,maxX:6,minZ:-6,maxZ:6},spawn:[0,0,4],colliders:[],surfaces:[],
  buildings:[{id:'hall',name:'殿',description:'',root:namedBuilding,roofs:[roof],entry:[0,0,3],interior:[0,0,0],sideEntries:[],floorBounds:{minX:-2,maxX:2,minZ:-2,maxZ:2}}],
  walkRoute:[{name:'入殿',position:[0,0,0]}]};
namedRoot.userData.heritageScene = serializeCompoundMetadata(namedWorld);
const namedBinary = await new GLTFExporter().parseAsync(namedRoot, {binary:true});
const namedImport = createImportedCompound(await new GLTFLoader().parseAsync(namedBinary, ''));
assert.notEqual(namedImport.buildings[0].root.name, namedBuilding.name, 'fixture exercises loader name sanitization');
assert.equal(namedImport.buildings[0].roofs.length, 1);
namedImport.root.userData.heritageScene = serializeCompoundMetadata(namedImport);
const renamedBinary = await new GLTFExporter().parseAsync(namedImport.root, {binary:true});
assert.ok(createImportedCompound(await new GLTFLoader().parseAsync(renamedBinary, '')).imported, 'sanitized names can be re-exported');
console.log(JSON.stringify({ok:true,bytes:bytes.length,buildings:imported.buildings.length,routeStops:imported.walkRoute.length,
  rejected,checks:['binary roundtrip','embedded buffers/images','metadata preservation','THREE bounds and roofs',
    'walk controller traversal','fallback camera collisions','malformed and disconnected navigation rejected','ordinary model unchanged','loader name sanitization and re-export']},null,2));
