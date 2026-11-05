import * as THREE from 'three';
import {canStand, groundHeight, findWalkPath} from './walk-controller.js';

// Version 1 describes metre/Y-up navigation in an identity root's coordinates.
// A normal GLB has no such contract and must remain a model preview.
const KEY = 'heritageScene', EPS = 1e-5;
const LIMIT = {coordinate: 4096, span: 256, gridCells: 1050625, buildings: 32,
  rectangles: 4096, cameras: 8192, route: 64, bins: 300000, nodes: 50000};
const own = (o, key) => o != null && Object.hasOwn(o, key);
function fail(path, reason) {throw new Error(`古建群 GLB 元数据无效：${path} ${reason}`);}
function record(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须为对象');
  return value;
}
function text(value, path, max = 160, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) fail(path, '文字缺失或过长');
  return value;
}
function number(value, path) {
  if (!Number.isFinite(value) || Math.abs(value) > LIMIT.coordinate) fail(path, '须为范围内的有限米数');
  return value;
}
function list(value, path, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, '数量不符合约定');
  return value;
}
function vector(value, path) {
  list(value, path, 3, 3);return value.map((v, i) => number(v, `${path}[${i}]`));
}
function rectangle(value, path, vertical = false) {
  record(value, path);const out = {};
  for (const axis of vertical ? ['X', 'Y', 'Z'] : ['X', 'Z']) {
    out[`min${axis}`] = number(value[`min${axis}`], `${path}.min${axis}`);
    out[`max${axis}`] = number(value[`max${axis}`], `${path}.max${axis}`);
    if (out[`max${axis}`] <= out[`min${axis}`]) fail(path, '最小值必须小于最大值');
  }
  return out;
}
function inBounds(r, bounds, path, margin = 0) {
  for (const axis of ['X', 'Z']) {
    if (r[`min${axis}`] < bounds[`min${axis}`] - margin - EPS
      || r[`max${axis}`] > bounds[`max${axis}`] + margin + EPS
      || r[`max${axis}`] < bounds[`min${axis}`] || r[`min${axis}`] > bounds[`max${axis}`]) fail(path, '超出通行边界');
  }
}
function insidePoint(point, bounds, path) {
  inBounds({minX: point[0], maxX: point[0], minZ: point[2], maxZ: point[2]}, bounds, path);
}
function identity(node, path) {
  if (node.matrixAutoUpdate) node.updateMatrix();
  const expected = new THREE.Matrix4().elements;
  if (node.matrix.elements.some((v, i) => !Number.isFinite(v) || Math.abs(v - expected[i]) > EPS)) fail(path, '必须保持单位变换，不能移动、旋转或缩放根节点');
}
function locate(input) {
  const scene = input?.scene?.isObject3D ? input.scene : input?.isObject3D ? input : null;
  if (!scene) return null;
  const hits = [];
  scene.traverse(node => {if (own(node.userData, KEY)) hits.push(node);});
  if (!hits.length) return null;
  if (hits.length !== 1) fail(KEY, '只能有一份顶层声明');
  const root = hits[0];
  if (root !== scene && (root.parent !== scene || scene.children.length !== 1)) fail(KEY, '必须位于唯一的顶层根节点');
  identity(scene, 'scene');identity(root, 'root');
  return {root, metadata: root.userData[KEY]};
}

// Presence alone is not approval for walking: createImportedCompound validates it.
export function hasCompoundMetadata(input) {
  const scene = input?.scene?.isObject3D ? input.scene : input?.isObject3D ? input : null;
  let found = false;scene?.traverse(node => {found ||= own(node.userData, KEY);});return found;
}

function validate(metadata, root, gltf) {
  record(metadata, KEY);
  if (metadata.version !== 1 || metadata.kind !== 'compound') fail(KEY, '不支持的版本或类型');
  const data = {version: 1, kind: 'compound', name: text(metadata.name, 'name'),
    description: text(metadata.description, 'description', 2000, true), bounds: rectangle(metadata.bounds, 'bounds')};
  const width = data.bounds.maxX - data.bounds.minX, depth = data.bounds.maxZ - data.bounds.minZ;
  if (width < 2 || depth < 2 || width > LIMIT.span || depth > LIMIT.span
    || (Math.floor(width / .25) + 1) * (Math.floor(depth / .25) + 1) > LIMIT.gridCells) fail('bounds', '通行区域尺寸不合理');
  data.spawn = vector(metadata.spawn, 'spawn');insidePoint(data.spawn, data.bounds, 'spawn');
  let binCount = 0;
  function navigationRects(items, kind) {
    return list(items, kind, 0, LIMIT.rectangles).map((item, i) => {
      const path = `${kind}[${i}]`, r = rectangle(item, path, kind === 'colliders');
      // Perimeter collision padding can protrude slightly beyond the playable area.
      inBounds(r, data.bounds, path, kind === 'colliders' ? 4 : 0);
      if (kind === 'surfaces') {
        r.height = number(item.height, `${path}.height`);
        if (r.height < 0 || r.height > 128) fail(path, '地面高度须介于 0 和 128 米');
      }
      binCount += (Math.floor((r.maxX - r.minX) / 4) + 2) * (Math.floor((r.maxZ - r.minZ) / 4) + 2);
      if (binCount > LIMIT.bins) fail(kind, '空间索引过大');
      return r;
    });
  }
  data.colliders = navigationRects(metadata.colliders, 'colliders');
  data.surfaces = navigationRects(metadata.surfaces, 'surfaces');
  const nodes = new Map();let nodeCount = 0;
  root.updateWorldMatrix(true, true);
  root.traverse(node => {
    if (++nodeCount > LIMIT.nodes) fail('root', '节点过多');
    // GLTFLoader sanitizes names for animation bindings. Resolve metadata against
    // the original glTF node name, not that changed runtime name or mutable extras.
    const index = gltf?.parser?.associations?.get(node)?.nodes;
    const name = Number.isInteger(index) ? gltf.parser.json.nodes[index].name : node.name;
    if (name) {if (!nodes.has(name)) nodes.set(name, []);nodes.get(name).push(node);}
  });
  function referenced(name, path) {
    text(name, path, 200);const matches = nodes.get(name);
    if (!matches || matches.length !== 1) fail(path, '节点名不存在或不唯一');
    return matches[0];
  }
  const ids = new Set(), roots = new Set(), roofNodes = new Set(), resolved = [];
  data.buildings = list(metadata.buildings, 'buildings', 1, LIMIT.buildings).map((item, i) => {
    const path = `buildings[${i}]`;record(item, path);
    const b = {id: text(item.id, `${path}.id`, 100), name: text(item.name, `${path}.name`),
      description: text(item.description, `${path}.description`, 2000, true), nodeName: text(item.nodeName, `${path}.nodeName`, 200)};
    if (ids.has(b.id)) fail(path, '建筑 id 重复');ids.add(b.id);
    const node = referenced(b.nodeName, `${path}.nodeName`);
    if (node.parent !== root || roots.has(node)) fail(path, '建筑必须对应独立的根节点直接子级');roots.add(node);
    const box = new THREE.Box3().setFromObject(node);
    if (box.isEmpty() || [...box.min.toArray(), ...box.max.toArray()].some(v => !Number.isFinite(v) || Math.abs(v) > LIMIT.coordinate)) fail(path, '建筑没有有效几何范围');
    b.roofNodeNames = list(item.roofNodeNames, `${path}.roofNodeNames`, 1, 32).map((name, j) => {
      const roof = referenced(name, `${path}.roofNodeNames[${j}]`);
      let ancestor = roof.parent;while (ancestor && ancestor !== node) ancestor = ancestor.parent;
      if (!ancestor || roofNodes.has(roof)) fail(path, '屋顶必须唯一且属于当前建筑');
      let meshes = 0;roof.traverse(child => {if (child.isMesh) meshes++;});
      if (!meshes) fail(path, '屋顶节点没有网格');
      roofNodes.add(roof);return name;
    });
    b.entry = vector(item.entry, `${path}.entry`);b.interior = vector(item.interior, `${path}.interior`);
    b.sideEntries = list(item.sideEntries, `${path}.sideEntries`, 0, 16).map((p, j) => vector(p, `${path}.sideEntries[${j}]`));
    b.floorBounds = rectangle(item.floorBounds, `${path}.floorBounds`);inBounds(b.floorBounds, data.bounds, `${path}.floorBounds`);
    insidePoint(b.interior, b.floorBounds, `${path}.interior`);
    // A claimed room must actually overlap its rendered building footprint.
    inBounds(b.floorBounds, {minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z}, `${path}.floorBounds`, .25);
    resolved.push({root: node, bounds: box, roofs: b.roofNodeNames.map(name => nodes.get(name)[0])});
    return b;
  });
  data.walkRoute = list(metadata.walkRoute, 'walkRoute', 1, LIMIT.route).map((stop, i) => {
    record(stop, `walkRoute[${i}]`);
    return {name: text(stop.name, `walkRoute[${i}].name`), position: vector(stop.position, `walkRoute[${i}].position`)};
  });
  if (metadata.cameraObstacles !== undefined) {
    data.cameraObstacles = list(metadata.cameraObstacles, 'cameraObstacles', 0, LIMIT.cameras).map((item, i) => {
      const path = `cameraObstacles[${i}]`;record(item, path);record(item.box, `${path}.box`);
      const min = vector(item.box.min, `${path}.box.min`), max = vector(item.box.max, `${path}.box.max`);
      if (min.some((v, j) => max[j] <= v)) fail(path, '相机盒范围无效');
      inBounds({minX:min[0],maxX:max[0],minZ:min[2],maxZ:max[2]}, data.bounds, path, 4);
      if (item.buildingId !== null && !ids.has(item.buildingId)) fail(path, '建筑引用无效');
      if (typeof item.roof !== 'boolean' || (item.roof && item.buildingId === null)) fail(path, '屋顶标记无效');
      return {box: {min, max}, buildingId: item.buildingId, roof: item.roof};
    });
  }
  const point = ([x, y, z]) => ({x, y, z});
  function standing(p, path) {
    insidePoint(p, data.bounds, path);
    if (Math.abs(groundHeight(data, p[0], p[2]) - p[1]) > .02) fail(path, '站位高度与地面不符');
    if (!canStand(data, p[0], p[2], p[1])) fail(path, '站位被碰撞体遮挡');
  }
  function reachable(a, b, path) {
    if (!findWalkPath(data, point(a), point(b)).length) fail(path, '缺少可通行路径');
  }
  standing(data.spawn, 'spawn');
  for (let i = 0; i < data.buildings.length; i++) {
    const b = data.buildings[i], path = `buildings[${i}]`;
    standing(b.entry, `${path}.entry`);standing(b.interior, `${path}.interior`);
    reachable(data.spawn, b.entry, `${path}.entry`);
    reachable(b.entry, b.interior, `${path}.interior`);reachable(b.interior, b.entry, `${path}.entry`);
    for (const [j, p] of b.sideEntries.entries()) {
      standing(p, `${path}.sideEntries[${j}]`);reachable(p, b.interior, `${path}.sideEntries[${j}]`);reachable(b.interior, p, `${path}.sideEntries[${j}]`);
    }
  }
  let previous = data.spawn;
  for (const [i, stop] of data.walkRoute.entries()) {
    standing(stop.position, `walkRoute[${i}]`);reachable(previous, stop.position, `walkRoute[${i}]`);previous = stop.position;
  }
  return {data, resolved};
}

export function extractCompoundMetadata(input) {
  const found = locate(input);return found ? validate(found.metadata, found.root, input).data : null;
}

export function createImportedCompound(gltf) {
  const found = locate(gltf);if (!found) return null;
  const {root} = found, {data, resolved} = validate(found.metadata, root, gltf);
  const buildings = data.buildings.map((b, i) => ({...b, ...resolved[i], viewTarget: b.interior.slice()}));
  let cameraObstacles = data.cameraObstacles?.map(c => ({...c, box: new THREE.Box3(new THREE.Vector3(...c.box.min), new THREE.Vector3(...c.box.max))}));
  if (!cameraObstacles) {
    cameraObstacles = data.colliders.map(c => ({box: new THREE.Box3(new THREE.Vector3(c.minX,c.minY,c.minZ),new THREE.Vector3(c.maxX,c.maxY,c.maxZ)), buildingId: null, roof: false}));
    for (const b of buildings) for (const roof of b.roofs) cameraObstacles.push({box: new THREE.Box3().setFromObject(roof), buildingId: b.id, roof: true});
  }
  for (const b of buildings) {
    b.root.userData.buildingId = b.id;
    b.roofs.forEach(roof => {roof.userData.isRoof = true;});
  }
  // glTF has no standard Three.js shadow flags; restore the authored environment
  // convention after loading while leaving unlit clouds/lettering unaffected.
  root.traverse(node => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const unlit = materials.every(material => material?.isMeshBasicMaterial);
    node.castShadow = !unlit && !/(?:^|-)(?:ground|distant)$/.test(node.name);
    node.receiveShadow = !unlit;
  });
  return {root, bounds: data.bounds, spawn: data.spawn, colliders: data.colliders, surfaces: data.surfaces,
    buildings, walkRoute: data.walkRoute, cameraObstacles, cameraBounds: cameraObstacles.map(c => c.box),
    displayName: data.name, description: data.description, imported: true,
    overview: {target: [(data.bounds.minX + data.bounds.maxX) / 2, 5, (data.bounds.minZ + data.bounds.maxZ) / 2]}};
}

export function serializeCompoundMetadata(world) {
  if (!world?.root?.isObject3D) fail('root', '缺少场景根节点');identity(world.root, 'root');
  const data = {version: 1, kind: 'compound', name: world.displayName || world.root.name || '原创古建群',
    description: world.description || world.root.userData.disclaimer || '', bounds: {...world.bounds}, spawn: [...world.spawn],
    colliders: world.colliders.map(c => ({...c})), surfaces: world.surfaces.map(s => ({...s})),
    buildings: world.buildings.map(b => ({id: b.id, name: b.name, description: b.description || '', nodeName: b.root.name,
      roofNodeNames: b.roofs.map(r => r.name), entry: [...b.entry], interior: [...b.interior],
      sideEntries: (b.sideEntries || []).map(p => [...p]), floorBounds: {...b.floorBounds}})),
    walkRoute: world.walkRoute.map(s => ({name: s.name, position: [...s.position]}))};
  if (world.cameraObstacles) data.cameraObstacles = world.cameraObstacles.map(c => ({
    box: {min: c.box.min.toArray(), max: c.box.max.toArray()}, buildingId: c.buildingId ?? null, roof: Boolean(c.roof)}));
  return validate(data, world.root).data;
}
