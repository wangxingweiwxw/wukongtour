import * as THREE from 'three';
import { JOURNEYS } from './journey-data.js';

const COURTYARD_BOUNDS = { minX: -24, maxX: 24, minZ: -25, maxZ: 25 };

// Label anchors follow the authored structures in journey-scenes.js. Their Y
// coordinates attach labels to the geometry in the isometric map, not the ground.
const JOURNEY_LANDMARKS = {
  shisi: [
    ['hall', '山寺正殿', [0, 4.6, -11]],
    ['gate', '山门', [0, 4.8, 8]],
    ['gallery', '木廊', [-12.15, 4.25, -4.5]],
    ['tree', '古树', [0, 6, -.5], 'landscape'],
    ['wall', '石脚院墙', [21.5, 1.1, -9.5]],
  ],
  yungang: [
    ['buddha', '石窟坐佛', [0, 12, -12]],
    ['west-niches', '西侧佛龛墙', [-17, 6.8, -12.6]],
    ['east-niches', '东侧佛龛墙', [17, 6.8, -12.6]],
    ['cliff', '砂岩崖壁', [0, 20, -18.5], 'landscape'],
  ],
  xuankong: [
    ['west-hall', '西侧楼阁', [-14, 10.6, -10.8]],
    ['middle-hall', '中部楼阁', [0, 15, -10]],
    ['east-hall', '东侧楼阁', [14, 16, -10.8]],
    ['gallery', '沿崖连廊', [-7.4, 7.05, -10]],
    ['cliff', '错落山脊', [9, 36, -29], 'landscape'],
    ['alcove', '岩龛围合', [0, 23, -16.8], 'landscape'],
  ],
  yingxian: [
    ['pagoda', '八角木塔', [0, 13, -8]],
    ['west-hall', '西配殿', [-20, 2.5, -20]],
    ['east-hall', '东配殿', [20, 2.5, -20]],
  ],
};

function position(value) {
  return Array.isArray(value) ? [...value] : [value.x, value.y, value.z];
}

export function createJourneyMapData(id, world) {
  const journey = JOURNEYS.find(item => item.id === id);
  if (!journey) throw new RangeError(`Unknown journey map: ${id}`);
  const names = new Map(journey.points.map(point => [point.id, point.title]));
  return {
    id,
    title: journey.name,
    subtitle: journey.subtitle,
    bounds: id === 'xuankong' && world.flight?.bounds
      ? Object.fromEntries(['minX', 'maxX', 'minZ', 'maxZ'].map(key => [key, world.flight.bounds[key]]))
      : { ...(world.mapBounds || COURTYARD_BOUNDS) },
    landmarks: (world.landmarks || JOURNEY_LANDMARKS[id]).map(([suffix, name, anchor, kind = 'building']) => ({
      id: `${id}-${suffix}`, name, position: [...anchor], kind,
    })),
    points: world.points.map(point => ({
      id: point.id, name: names.get(point.id) || point.id, position: position(point.position),
    })),
    spawn: position(world.spawn),
  };
}

export function createCompoundMapData(world) {
  return {
    id: 'compound',
    title: world.displayName || '古建群落',
    subtitle: world.description || '穿山门 · 入殿观梁 · 沿廊游园',
    bounds: { ...world.bounds },
    landmarks: world.buildings.map(building => ({
      id: building.id,
      name: building.name,
      position: position(building.viewTarget || building.bounds.getCenter(new THREE.Vector3())),
      kind: 'building',
    })),
    points: world.walkRoute.map((point, index) => ({
      id: `compound-${index}`, name: point.name, position: position(point.position),
    })),
    spawn: position(world.spawn),
  };
}

// Compute a world-space box on a disposable hierarchy copy. This leaves source
// transforms, matrices, parent links and shared mesh resources untouched.
function readWorldBox(object) {
  if (!object) return new THREE.Box3();
  const copy = object.clone(true);
  const matrix = new THREE.Matrix4();
  for (let node = object; node; node = node.parent) {
    const local = node.matrixAutoUpdate
      ? new THREE.Matrix4().compose(node.position, node.quaternion, node.scale)
      : node.matrix;
    matrix.premultiply(local);
  }
  copy.matrixAutoUpdate = false;
  copy.matrix.copy(matrix);
  return new THREE.Box3().setFromObject(copy, true);
}

export function createCourtyardMapData({ id, title, building, courtyard, ring, custom = false }) {
  const landmarks = [];
  const addBuilding = (object, landmarkId, name) => {
    const box = readWorldBox(object);
    if (!box.isEmpty()) landmarks.push({
      id: landmarkId, name,
      position: box.getCenter(new THREE.Vector3()).toArray(), kind: 'building',
    });
  };
  addBuilding(building, `${id}-main`, title);
  for (const [index, object] of (courtyard?.root?.children || []).entries()) {
    addBuilding(object, `${id}-court-${index}`, object.name.replace(/_\d+$/, '') || '庭院配景');
  }
  const stamp = position(ring.position || ring);
  return {
    id, title,
    subtitle: custom ? '自定义建筑 · 自由参观' : '院落步道 · 建筑前留影',
    bounds: { ...COURTYARD_BOUNDS },
    landmarks,
    points: custom ? [] : [{ id: 'courtyard-stamp', name: '建筑前留影点', position: stamp }],
    spawn: [0, 0, Math.min(20, stamp[2] + 4.2)],
  };
}
