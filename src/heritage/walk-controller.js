// All distances are metres. Collision rectangles already contain staff clearance.
export const WALKER_HEIGHT = 1.8;
export const MAX_STEP_UP = .22;
export const MAX_STEP_DOWN = .26;
const MOVE_STEP = .08, GRID = .25, BIN = 4, EPS = 1e-9;
const DEFAULT_BOUNDS = {minX: -44, maxX: 44, minZ: -48, maxZ: 48};
const EMPTY = {}, EMPTY_LIST = [], cache = new WeakMap();
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const validRect = r => r && [r.minX, r.maxX, r.minZ, r.maxZ].every(Number.isFinite)
  && r.maxX > r.minX && r.maxZ > r.minZ;
const binKey = (x, z) => `${x},${z}`;

// Scene layouts are static. Replacing/appending their arrays invalidates the index.
function indexFor(world = EMPTY) {
  const surfaces = world.surfaces || EMPTY_LIST, colliders = world.colliders || EMPTY_LIST;
  const prior = cache.get(world);
  if (prior && prior.surfaces === surfaces && prior.colliders === colliders
    && prior.surfaceCount === surfaces.length && prior.colliderCount === colliders.length
    && prior.sourceBounds === world.bounds) return prior;
  const bounds = validRect(world.bounds) ? world.bounds : DEFAULT_BOUNDS;
  const bins = new Map();
  for (const [kind, list] of [['surface', surfaces], ['collider', colliders]]) for (const rect of list) {
    if (!validRect(rect) || (kind === 'surface' && !Number.isFinite(rect.height))) continue;
    const record = {kind, rect};
    const x0 = Math.floor(Math.max(bounds.minX, rect.minX) / BIN), x1 = Math.floor(Math.min(bounds.maxX, rect.maxX) / BIN);
    const z0 = Math.floor(Math.max(bounds.minZ, rect.minZ) / BIN), z1 = Math.floor(Math.min(bounds.maxZ, rect.maxZ) / BIN);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const key = binKey(x, z);if (!bins.has(key)) bins.set(key, []);bins.get(key).push(record);
    }
  }
  const index = {bounds, bins, surfaces, colliders, surfaceCount: surfaces.length,
    colliderCount: colliders.length, sourceBounds: world.bounds};
  cache.set(world, index);return index;
}

function pointRecords(index, x, z) { return index.bins.get(binKey(Math.floor(x / BIN), Math.floor(z / BIN))) || []; }
function heightAt(index, x, z) {
  let height = 0;
  for (const {kind, rect: r} of pointRecords(index, x, z)) {
    if (kind === 'surface' && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) height = Math.max(height, r.height);
  }
  return height;
}
export function groundHeight(world, x, z) { return heightAt(indexFor(world), x, z); }

function standAt(index, x, z, y) {
  if (![x, z, y].every(Number.isFinite)) return false;
  const b = index.bounds;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  return !pointRecords(index, x, z).some(({kind, rect: r}) => kind === 'collider'
    && x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ
    && y + WALKER_HEIGHT > (r.minY ?? -Infinity) + EPS && y < (r.maxY ?? Infinity) - EPS);
}
export function canStand(world, x, z, y) {
  const index = indexFor(world);return standAt(index, x, z, y ?? heightAt(index, x, z));
}

function segmentSpan(a, b, rect) {
  let lo = 0, hi = 1;
  for (const [axis, min, max] of [['x', rect.minX, rect.maxX], ['z', rect.minZ, rect.maxZ]]) {
    const d = b[axis] - a[axis];
    if (Math.abs(d) < EPS) {if (a[axis] < min || a[axis] > max) return null;continue;}
    const u = (min - a[axis]) / d, v = (max - a[axis]) / d;
    lo = Math.max(lo, Math.min(u, v));hi = Math.min(hi, Math.max(u, v));
    if (lo > hi) return null;
  }
  return [lo, hi];
}
const allowedStep = (from, to) => to - from <= MAX_STEP_UP + EPS && from - to <= MAX_STEP_DOWN + EPS;

// Rectangular surface/obstacle boundaries partition a segment into intervals
// with constant floor and collision state. Midpoints therefore catch even an
// obstacle thinner than a movement substep, and a high platform cannot be skipped.
function segmentClear(index, a, b) {
  if (!finitePoint(a) || !finitePoint(b)) return false;
  const startHeight = heightAt(index, a.x, a.z), endHeight = heightAt(index, b.x, b.z);
  if (!standAt(index, a.x, a.z, startHeight) || !standAt(index, b.x, b.z, endHeight)) return false;
  if (Math.hypot(b.x - a.x, b.z - a.z) < EPS) return true;
  const records = new Set();
  for (let x = Math.floor(Math.min(a.x, b.x) / BIN); x <= Math.floor(Math.max(a.x, b.x) / BIN); x++) {
    for (let z = Math.floor(Math.min(a.z, b.z) / BIN); z <= Math.floor(Math.max(a.z, b.z) / BIN); z++) {
      for (const record of index.bins.get(binKey(x, z)) || []) records.add(record);
    }
  }
  const events = [0, 1];
  for (const {rect} of records) {const span = segmentSpan(a, b, rect);if (span) events.push(...span);}
  events.sort((x, y) => x - y);
  let height = startHeight;
  for (let i = 1; i < events.length; i++) {
    if (events[i] - events[i - 1] < 1e-12) continue;
    const t = (events[i] + events[i - 1]) / 2;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const next = heightAt(index, x, z);
    if (!allowedStep(height, next) || !standAt(index, x, z, next)) return false;
    height = next;
  }
  return allowedStep(height, endHeight);
}
export function segmentWalkable(world, a, b) { return segmentClear(indexFor(world), a, b); }

export function moveWalker(world, position, deltaX, deltaZ) {
  const index = indexFor(world);
  if (!finitePoint(position) || ![deltaX, deltaZ].every(Number.isFinite)) {
    return {moved: false, blocked: true, stepped: false, height: position?.y ?? 0};
  }
  const startX = position.x, startZ = position.z, floor = heightAt(index, startX, startZ);
  if (!standAt(index, startX, startZ, floor)) return {moved: false, blocked: true, stepped: false, height: position.y ?? floor};
  let stepped = Number.isFinite(position.y) && Math.abs(position.y - floor) > EPS, blocked = false;
  position.y = floor;
  const count = Math.max(1, Math.ceil(Math.hypot(deltaX, deltaZ) / MOVE_STEP));
  const dx = deltaX / count, dz = deltaZ / count;
  function attempt(x, z) {
    if (!segmentClear(index, position, {x, z})) return false;
    const y = heightAt(index, x, z);stepped ||= Math.abs(y - position.y) > EPS;
    position.x = x;position.y = y;position.z = z;return true;
  }
  for (let i = 0; i < count; i++) {
    if (attempt(position.x + dx, position.z + dz)) continue;
    blocked = true;
    if (Math.abs(dx) > EPS) attempt(position.x + dx, position.z);
    if (Math.abs(dz) > EPS) attempt(position.x, position.z + dz);
  }
  return {moved: Math.hypot(position.x - startX, position.z - startZ) > EPS, blocked, stepped, height: position.y};
}

class MinHeap {
  items = [];
  better(a, b) {return a.f < b.f || (a.f === b.f && a.h < b.h);}
  push(value) {
    const list = this.items;let i = list.length;list.push(value);
    while (i > 0) {const p = (i - 1) >> 1;if (!this.better(value, list[p])) break;list[i] = list[p];i = p;}
    list[i] = value;
  }
  pop() {
    const list = this.items, first = list[0], last = list.pop();if (!list.length) return first;
    let i = 0;
    while (i * 2 + 1 < list.length) {
      let child = i * 2 + 1;if (child + 1 < list.length && this.better(list[child + 1], list[child])) child++;
      if (!this.better(list[child], last)) break;list[i] = list[child];i = child;
    }
    list[i] = last;return first;
  }
}

export function findWalkPath(world, start, end) {
  const index = indexFor(world);
  if (!finitePoint(start) || !finitePoint(end)) return [];
  const grounded = p => ({x: p.x, y: heightAt(index, p.x, p.z), z: p.z});
  if (!standAt(index, start.x, start.z, heightAt(index, start.x, start.z))
    || !standAt(index, end.x, end.z, heightAt(index, end.x, end.z))) return [];
  if (segmentClear(index, start, end)) return [grounded(start), grounded(end)];
  const bounds = index.bounds, nx = Math.floor((bounds.maxX - bounds.minX) / GRID) + 1;
  const nz = Math.floor((bounds.maxZ - bounds.minZ) / GRID) + 1, total = nx * nz;
  const point = key => ({x: bounds.minX + key % nx * GRID, z: bounds.minZ + Math.floor(key / nx) * GRID});
  function snap(p, towardEndpoint = false) {
    const ix = Math.round((p.x - bounds.minX) / GRID), iz = Math.round((p.z - bounds.minZ) / GRID), candidates = [];
    for (let x = ix - 2; x <= ix + 2; x++) for (let z = iz - 2; z <= iz + 2; z++) {
      if (x < 0 || x >= nx || z < 0 || z >= nz) continue;
      const key = z * nx + x, q = point(key);
      if (towardEndpoint ? segmentClear(index, q, p) : segmentClear(index, p, q)) candidates.push({key, distance: Math.hypot(q.x - p.x, q.z - p.z)});
    }
    return candidates.sort((a, b) => a.distance - b.distance)[0]?.key;
  }
  const first = snap(start), last = snap(end, true);if (first === undefined || last === undefined) return [];
  const scores = new Float64Array(total).fill(Infinity), parents = new Int32Array(total).fill(-1), closed = new Uint8Array(total);
  const lastX = last % nx, lastZ = Math.floor(last / nx);
  const heuristic = key => Math.abs(key % nx - lastX) + Math.abs(Math.floor(key / nx) - lastZ);
  const heap = new MinHeap();scores[first] = 0;heap.push({key: first, f: heuristic(first), h: heuristic(first)});
  let found = false;
  while (heap.items.length) {
    const {key} = heap.pop();if (closed[key]) continue;if (key === last) {found = true;break;}
    closed[key] = 1;const x = key % nx, z = Math.floor(key / nx), p = point(key);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (x + dx < 0 || x + dx >= nx || z + dz < 0 || z + dz >= nz) continue;
      const next = key + dx + dz * nx, score = scores[key] + 1;
      if (closed[next] || score >= scores[next] || !segmentClear(index, p, point(next))) continue;
      scores[next] = score;parents[next] = key;const h = heuristic(next);heap.push({key: next, f: score + h, h});
    }
  }
  if (!found) return [];
  const route = [end];for (let at = last; at !== -1; at = parents[at]) route.push(point(at));route.push(start);route.reverse();
  const result = [grounded(start)];let at = 0;
  while (at < route.length - 1) {
    let next = route.length - 1;while (next > at + 1 && !segmentClear(index, route[at], route[next])) next--;
    const p = grounded(route[next]);if (Math.hypot(p.x - result.at(-1).x, p.z - result.at(-1).z) > EPS) result.push(p);
    at = next;
  }
  return result;
}
