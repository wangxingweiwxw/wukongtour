import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addPlaqueFace } from './architectural-plaque.js';

// An authored, metre-scale Chinese architectural garden inspired by the supplied
// videos. Names and layout are fictional; this is not a surveyed palace model.
const P = {
  stone: ['#b2aa98', '#c2b7a2', '#9e9b8e', '#cec2ac'],
  wood: ['#634634', '#805a40', '#a08058', '#42362b'],
  roof: ['#5b605c', '#71756c', '#969589', '#48514e'],
  leaf: ['#718247', '#8c9954', '#a5aa60', '#536b3e'],
  red: '#934e3b', plaster: '#c2ad8e', gold: '#bba06a', dark: '#35423d',
  brick: ['#88513e', '#774535', '#9a624a', '#a27354'], moss: ['#69794b', '#859157'],
};
// Body clearance, rather than the decorative staff's full span. Narrow open
// bays must stay passable while columns and masonry still stop the player.
const PAD = .55;
const PLATFORM = .72;
const STEP = .18;
const TREAD = .8;

class Compound {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'china-heritage-compound';
    this.colliders = [];
    this.cameraBounds = [];
    this.cameraObstacles = [];
    this.surfaces = [];
    this.buildings = [];
    this.seed = 90211;
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  camera(box, buildingId, roof = false) {
    this.cameraBounds.push(box);
    this.cameraObstacles.push({ box, buildingId, roof });
  }
  obstacle(x, y, z, w, h, d, buildingId = null, pad = PAD) {
    this.colliders.push({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad,
      minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad, minY: y - h / 2, maxY: y + h / 2 });
    this.camera(new THREE.Box3(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)), buildingId);
  }
  surface(x, z, w, d, height) {
    this.surfaces.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height });
  }
}

class Mason {
  constructor(world, id, name, description) {
    this.world = world;
    this.id = id;
    this.name = name;
    this.description = description;
    this.root = new THREE.Group();
    this.root.name = id || 'compound-landscape';
    this.parts = new Map();
  }
  add(geometry, color, layer = 'body') {
    const c = new THREE.Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!this.parts.has(layer)) this.parts.set(layer, []);
    this.parts.get(layer).push(geometry);
  }
  box(x, y, z, w, h, d, color, layer = 'body', turn = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (turn) g.rotateY(turn);
    g.translate(x, y, z);
    this.add(g, color, layer);
  }
  plaque(x, y, z, width, height, side = 1) {
    this.box(x, y, z, width, height, .16, P.dark);
    addPlaqueFace(this.root, {text:this.name, position:[x, y, z + side * .095],
      width, height, rotation:side < 0 ? Math.PI : 0});
  }
  cylinder(x, y, z, rt, rb, h, color, layer = 'body', sides = 8) {
    const g = new THREE.CylinderGeometry(rt, rb, h, sides, 1);
    g.rotateY(Math.PI / sides);
    g.translate(x, y, z);
    this.add(g, color, layer);
  }
  beam(a, b, w, color, layer = 'body', depth = w) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const g = new THREE.BoxGeometry(w, delta.length(), depth);
    // Roof runs sit on a continuous closed tile shell and overlap end-to-end.
    // Their buried end caps do not contribute to the silhouette; reserve those
    // triangles for visible garden detail instead. Structural beams stay closed.
    if (layer.startsWith('roof')) {
      const index = Array.from(g.index.array);
      g.setIndex([...index.slice(0, 12), ...index.slice(24)]);
      g.clearGroups();
    }
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    g.translate(...start.add(end).multiplyScalar(.5).toArray());
    this.add(g, color, layer);
  }
  quad(a, b, c, d, color, layer = 'roof', normalHint = [0, 1, 0]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    const normal = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)));
    g.setIndex(normal.dot(new THREE.Vector3(...normalHint)) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    this.add(g, color, layer);
  }
  tileEnd(x, y, z, radius, facing, layer = 'roof') {
    const g = new THREE.CylinderGeometry(radius, radius, .16, 6, 1);
    g.rotateX(Math.PI / 2);
    g.rotateY(facing);
    g.translate(x, y, z);
    this.add(g, P.roof[2], layer);
  }
  ridgeBeast(x, y, z, direction, scale = 1, layer = 'roof') {
    // An original block silhouette: paws, arched back, raised muzzle and curl.
    this.box(x, y + .12 * scale, z, .9 * scale, .24 * scale, .4 * scale, P.roof[0], layer);
    this.box(x, y + .43 * scale, z, .64 * scale, .44 * scale, .35 * scale, P.roof[2], layer);
    this.box(x + direction * .3 * scale, y + .8 * scale, z, .35 * scale, .48 * scale, .4 * scale, P.roof[1], layer);
    this.box(x + direction * .5 * scale, y + .9 * scale, z, .32 * scale, .21 * scale, .36 * scale, P.roof[2], layer);
    this.box(x - direction * .42 * scale, y + .72 * scale, z, .2 * scale, .5 * scale, .26 * scale, P.roof[0], layer);
    this.box(x + direction * .24 * scale, y + 1.1 * scale, z, .12 * scale, .25 * scale, .28 * scale, P.roof[2], layer);
  }
  solid(x, y, z, w, h, d, color) {
    this.box(x, y, z, w, h, d, color);
    this.world.obstacle(x, y, z, w, h, d, this.id);
  }
  column(x, z, base, height, size = .5, red = true) {
    this.box(x, base + .13, z, size + .28, .26, size + .28, P.stone[1]);
    this.box(x, base + height / 2, z, size, height, size, red ? P.red : P.wood[0]);
    this.world.obstacle(x, base + height / 2, z, size + .28, height, size + .28, this.id);
    this.box(x, base + .35, z, size + .08, .1, size + .08, P.wood[2]);
    // Alternating stepped dougong arms and bearing blocks, merged with the frame.
    for (let i = 0; i < 4; i++) {
      const yy = base + height - .64 + i * .22, span = size + .5 + i * .28;
      this.box(x, yy, z, span, .16, size * .68, P.wood[i % 3]);
      this.box(x, yy + .09, z, size * .68, .16, span, P.wood[(i + 1) % 3]);
      for (const sign of [-1, 1]) {
        this.box(x + sign * span * .35, yy + .14, z, .26, .2, .3, P.wood[2]);
        this.box(x, yy + .22, z + sign * span * .35, .3, .2, .26, P.wood[1]);
      }
    }
  }
  roof(x, y, z, w, d, rise = 2.1, colors = P.roof, layer = 'roof') {
    // A curved tiled shell replaces stacked flat slabs. Raised tile runs follow
    // the actual concave slope, while the four hip seams lift into flying eaves.
    const rows = 10, ribs = Math.max(10, Math.round(w / .66));
    const height = (t, edge) => y + rise * Math.pow(t, 1.72) + .2 * Math.pow(1 - t, 8)
      + .72 * Math.pow(Math.abs(edge), 8) * Math.pow(1 - t, 3);
    const face = (u, t, side) => [x + u * w / 2 * (1 - .3 * t), height(t, u), z + side * d / 2 * (1 - .95 * t)];
    const hip = (u, t, side) => [x + side * w / 2 * (1 - .3 * t), height(t, u), z + u * d / 2 * (1 - .95 * t)];
    for (const side of [-1, 1]) {
      // Continuous fascia and soffit close the outer shell to the existing
      // inset underside. Both follow the lifted eave and share its cutaway layer.
      for (let col = 0; col < 12; col++) {
        const u0 = -1 + col / 6, u1 = -1 + (col + 1) / 6;
        for (const isHip of [false, true]) {
          const outer = isHip ? hip : face;
          const a = outer(u0, 0, side), b = outer(u1, 0, side);
          const lowA = [a[0], a[1] - .25, a[2]], lowB = [b[0], b[1] - .25, b[2]];
          const innerA = isHip ? [x + side * w * .455, y - .2, z + u0 * d * .44]
            : [x + u0 * w * .455, y - .2, z + side * d * .44];
          const innerB = isHip ? [x + side * w * .455, y - .2, z + u1 * d * .44]
            : [x + u1 * w * .455, y - .2, z + side * d * .44];
          this.quad(a, b, lowB, lowA, P.wood[0], layer, isHip ? [side, 0, 0] : [0, 0, side]);
          this.quad(lowA, lowB, innerB, innerA, P.wood[3], layer, [0, -1, 0]);
        }
      }
      for (let row = 0; row < rows; row++) {
        const t0 = row / rows, t1 = (row + 1) / rows;
        for (let col = 0; col < 12; col++) {
          const u0 = -1 + col / 6, u1 = -1 + (col + 1) / 6;
          this.quad(face(u0, t0, side), face(u1, t0, side), face(u1, t1, side), face(u0, t1, side), colors[(row + col) % 4], layer);
          this.quad(hip(u0, t0, side), hip(u1, t0, side), hip(u1, t1, side), hip(u0, t1, side), colors[(row + col + 1) % 4], layer);
        }
        for (let i = 0; i <= ribs; i++) {
          const u = -1 + 2 * i / ribs, a = face(u, t0, side), b = face(u, t1, side);
          a[1] += .09; b[1] += .09;
          this.beam(a, b, i % 5 ? .13 : .18, colors[(i + row) % 3], layer, .15);
          // Overlapping tile lips break the long run into individual courses.
          if (row % 2 === 0) this.box(a[0], a[1] + .055, a[2], .24, .1, .18, colors[2], layer);
        }
        for (let i = 1; i < 8; i++) {
          const u = -1 + i / 4, a = hip(u, t0, side), b = hip(u, t1, side);
          a[1] += .08; b[1] += .08;
          this.beam(a, b, .13, colors[(i + row) % 3], layer, .15);
        }
      }
      for (let i = 0; i <= ribs; i++) {
        const a = face(-1 + 2 * i / ribs, 0, side);
        this.tileEnd(a[0], a[1] + .06, a[2] + side * .08, .13, 0, layer);
      }
    }
    this.box(x, y - .12, z, w * .91, .16, d * .88, P.wood[0], layer);
    this.box(x, y + rise + .14, z, w * .71, .23, d * .065, colors[0], layer);
    this.box(x, y + rise + .35, z, w * .73, .18, .37, colors[2], layer);
    for (const sx of [-1, 1]) {
      this.ridgeBeast(x + sx * w * .35, y + rise + .43, z, sx, w > 18 ? 1.1 : .8, layer);
      for (const sz of [-1, 1]) {
        for (let row = 0; row < rows; row++) {
          const a = face(sx, row / rows, sz), b = face(sx, (row + 1) / rows, sz);
          a[1] += .16; b[1] += .16;
          this.beam(a, b, .3, colors[2], layer, .3);
        }
        for (let tip = 0; tip < 4; tip++) this.box(x + sx * (w / 2 + tip * .2),
          y + .93 + tip * .2, z + sz * (d / 2 + tip * .17), .45, .24, .45, colors[tip % 3], layer);
        this.ridgeBeast(x + sx * w * .44, y + .87, z + sz * d * .4, sx, .45, layer);
      }
    }
  }
  window(x, y, z, w, h, turn = 0) {
    this.box(x, y, z, w, h, .12, P.wood[3], 'body', turn);
    for (let i = -w / 2 + .2; i < w / 2; i += .35) {
      this.box(x + Math.cos(turn) * i, y, z - Math.sin(turn) * i, .09, h, .18, P.wood[2], 'body', turn);
    }
    for (let dy = -h / 2; dy <= h / 2; dy += .33) this.box(x, y + dy, z, w + .12, .075, .2, P.wood[1], 'body', turn);
    for (const side of [-1, 1]) this.box(x + Math.cos(turn) * side * w / 2, y,
      z - Math.sin(turn) * side * w / 2, .15, h + .24, .25, P.wood[2], 'body', turn);
  }
  roundWindow(x, y, z, radius, front = 1) {
    const disc = new THREE.CylinderGeometry(radius, radius, .09, 16);
    disc.rotateX(Math.PI / 2); disc.translate(x, y, z);
    this.add(disc, P.wood[3]);
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8, r = radius + ring * .12;
      this.beam([x + Math.cos(a) * r, y + Math.sin(a) * r, z + front * .08],
        [x + Math.cos(b) * r, y + Math.sin(b) * r, z + front * .08], .13, P.stone[(i + ring) % 4]);
    }
    for (let offset = -radius + .2; offset < radius; offset += .3) {
      const half = Math.sqrt(radius * radius - offset * offset) - .03;
      this.box(x + offset, y, z + front * .11, .07, half * 2, .13, P.wood[2]);
      this.box(x, y + offset, z + front * .12, half * 2, .07, .13, P.wood[1]);
    }
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      this.box(x + Math.cos(a) * radius * .35, y + Math.sin(a) * radius * .35, z + front * .23,
        .16, .16, .12, P.gold);
    }
  }
  brickFace(x, y, z, w, h, front = 1) {
    const rows = Math.max(1, Math.floor(h / .32)), columns = Math.max(1, Math.round(w / .78));
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const ww = w / columns, hh = h / rows;
      this.box(x - w / 2 + (col + .5) * ww, y - h / 2 + (row + .5) * hh,
        z + front * .02, ww - .035, hh - .025, .04, P.brick[(col + row * 3) % 4]);
    }
  }
  platform(x, z, w, d, stairWidth = 8, lateralWidth = 0) {
    this.box(x, PLATFORM / 2, z, w, PLATFORM, d, P.stone[2]);
    this.box(x, PLATFORM - .07, z, w, .14, d, P.stone[1]);
    this.world.surface(x, z, w, d, PLATFORM);
    // Four real collision-free treads, traversed using the walk controller's
    // .22m maximum step; there is deliberately no solid whole-platform collider.
    for (const side of [-1, 1]) for (let level = 1; level <= 4; level++) {
      const h = level * STEP;
      const zz = z + side * (d / 2 + (4 - level) * TREAD + TREAD / 2);
      this.box(x, h / 2, zz, stairWidth, h, TREAD, P.stone[level % 4]);
      this.world.surface(x, zz, stairWidth, TREAD, h);
    }
    // Lateral doors need their own visible treads: lowering a collider alone
    // would still leave an impassable 72cm edge (or feet inside the stone).
    if (lateralWidth) for (const side of [-1, 1]) for (let level = 1; level <= 4; level++) {
      const h = level * STEP;
      const xx = x + side * (w / 2 + (4 - level) * TREAD + TREAD / 2);
      this.box(xx, h / 2, z, TREAD, h, lateralWidth, P.stone[level % 4]);
      this.world.surface(xx, z, TREAD, lateralWidth, h);
    }
    // Offset stone courses show joints at eye level without changing floor tops.
    for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
      for (let zz = -d / 2 + .45; zz < d / 2; zz += 1.05) {
        this.box(x + side * (w / 2 + .025), .18 + row * .28, z + zz, .055, .255, .99, P.stone[(Math.round(zz + d) + row) % 4]);
        if ((Math.round(zz + d) + row) % 5 === 0) this.box(x + side * (w / 2 + .058), .12, z + zz,
          .018, .19, .56, P.moss[row % 2]);
      }
      for (let xx = -w / 2 + .5; xx < w / 2; xx += 1.05) {
        this.box(x + xx, .18 + row * .28, z + side * (d / 2 + .025), .99, .255, .055, P.stone[(Math.round(xx + w) + row) % 4]);
      }
    }
    // Side balustrades stand beyond the eight-metre tread. Their simple proxies
    // preserve a >6m staff-safe central route, wider than the hall door itself.
    for (const end of [-1, 1]) for (const side of [-1, 1]) {
      const xx = x + side * (stairWidth / 2 + 1.1), near = z + end * (d / 2 + .15), far = z + end * (d / 2 + 3.05);
      this.beam([xx, 1.53, near], [xx, .98, far], .2, P.stone[1], 'body', .25);
      for (let i = 0; i < 3; i++) {
        const t = i / 2, zz = near + (far - near) * t, hh = 1.5 - .55 * t;
        this.box(xx, hh / 2, zz, .34, hh, .34, P.stone[0]);
        this.box(xx, hh + .07, zz, .5, .16, .5, P.stone[1]);
        this.box(xx, hh + .21, zz, .29, .18, .29, P.stone[3]);
      }
      this.world.obstacle(xx, .9, (near + far) / 2, .5, 1.8, Math.abs(far - near) + .5, this.id);
    }
  }
  finish(entry, interior, floorBounds, viewTarget, sideEntries = []) {
    const roofs = [];
    for (const [layer, items] of this.parts) {
      const geometry = mergeGeometries(items, false);
      if (!geometry) throw new Error(`Invalid compound geometry: ${this.id}/${layer}`);
      items.forEach(g => g.dispose());
      const mat = layer === 'cloud'
        ? new THREE.MeshBasicMaterial({ vertexColors: true })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: layer.startsWith('roof') ? .87 : .96,
          side: layer.startsWith('roof') ? THREE.DoubleSide : THREE.FrontSide, flatShading: true });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.name = `${this.id || 'landscape'}-${layer}`;
      mesh.castShadow = !['cloud', 'ground', 'distant'].includes(layer);
      mesh.receiveShadow = layer !== 'cloud';
      if (layer.startsWith('roof')) {
        mesh.userData.isRoof = true;
        roofs.push(mesh);
        geometry.computeBoundingBox();
        this.world.camera(geometry.boundingBox.clone(), this.id, true);
      }
      this.root.add(mesh);
    }
    this.parts.clear();
    this.world.root.add(this.root);
    if (this.id) {
      const bounds = new THREE.Box3().setFromObject(this.root);
      const building = { id: this.id, name: this.name, description: this.description, root: this.root, roofs,
        bounds, entry, interior, floorBounds, viewTarget, sideEntries };
      this.root.userData.buildingId = this.id;
      this.world.buildings.push(building);
    }
    return this;
  }
}

function buildGate(world) {
  const b = new Mason(world, 'gate', '承风门', '三开间山门，中央门道前后贯通；登楼形制仅作风格化表达。');
  const z = 30, height = 5.4;
  for (const side of [-1, 1]) {
    b.solid(side * 8, height / 2, z, 6, height, 7.5, P.red);
    for (const zz of [26, 34]) b.column(side * 4.8, zz, 0, 5.4, .55);
    for (const zz of [26, 34]) b.column(side * 11.3, zz, 0, 5.4, .55);
    b.beam([side * 4.8, 4, 34], [side * 3.7, 5.1, 34], .3, P.wood[2]);
  }
  for (const zz of [26, 34]) b.solid(0, 5.5, zz, 23.6, .5, .6, P.wood[0]);
  b.roof(0, 5.85, 30, 26, 11.5, 2.3);
  // Open-sided upper silhouette; it is a viewing model, not a second walk floor.
  b.box(0, 8.3, 30, 11.5, .3, 5.6, P.wood[0], 'roof-upper');
  for (const xx of [-5, 0, 5]) for (const zz of [28, 32]) b.box(xx, 9.3, zz, .3, 2, .3, P.red, 'roof-upper');
  b.roof(0, 10.3, 30, 15.3, 8.2, 1.6, P.roof, 'roof-upper');
  for (const side of [-1, 1]) {
    b.brickFace(side * 8, .92, 33.79, 5.75, 1.55);
    b.brickFace(side * 8, .92, 26.21, 5.75, 1.55, -1);
    for (const end of [-1, 1]) b.roundWindow(side * 8, 3.18, 30 + end * 3.98, .92, end);
  }
  for (const side of [-1, 1]) b.plaque(0, 4.85, 30 + side * 4.36, 2.8, .6, side);
  b.finish([0, 0, 37], [0, 0, 30], { minX: -4.5, maxX: 4.5, minZ: 26, maxZ: 34 }, [0, 5.5, 30]);
}

function buildHall(world, { id, name, description, x, z, w, d, height, major = false }) {
  const b = new Mason(world, id, name, description);
  const base = PLATFORM, door = 8, sideDoor = 6, wall = .42;
  b.platform(x, z, w + 2, d + 2, 8, sideDoor);
  // Two halves of each end wall leave an eight-metre central opening. Side
  // walls and columns have individual boxes; never close the doorway with AABB.
  for (const side of [-1, 1]) {
    // The two side-wall returns frame a real doorway aligned to the side
    // stairs. A high lintel preserves the enclosed hall's architectural shape.
    const sideSegment = (d - sideDoor) / 2;
    for (const end of [-1, 1]) b.solid(x + side * w / 2, base + height / 2,
      z + end * (sideDoor / 2 + sideSegment / 2), wall, height, sideSegment, P.plaster);
    b.solid(x + side * w / 2, base + height - .35, z, wall + .15, .7, sideDoor, P.wood[0]);
    for (const front of [-1, 1]) {
      const segmentWidth = (w - door) / 2;
      b.solid(x + side * (door / 2 + segmentWidth / 2), base + height / 2,
        z + front * d / 2, segmentWidth, height, wall, P.red);
      const faceX = x + side * (door / 2 + segmentWidth / 2);
      b.brickFace(faceX, base + .73, z + front * (d / 2 + .23), segmentWidth - .08, 1.35, front);
      if (major) b.roundWindow(faceX, base + height * .58, z + front * (d / 2 + .29), 1.14, front);
      else b.window(faceX, base + height * .58, z + front * (d / 2 + .24), Math.max(1, segmentWidth - .9), height * .46);
      b.column(x + side * (door / 2 + .4), z + front * (d / 2 + .25), base, height, .48);
    }
    for (const zz of [-d / 2, -sideDoor / 2 - .4, sideDoor / 2 + .4, d / 2])
      b.column(x + side * (w / 2 + .12), z + zz, base, height, .5);
    // Displays sit in the wall returns, leaving the lateral cross-aisle open.
    const bx = x + side * (w / 2 - 1.2);
    for (const end of [-1, 1]) {
      const bz = z + end * (sideDoor / 2 + sideSegment / 2), length = Math.max(.8, sideSegment - .8);
      b.solid(bx, base + .45, bz, .65, .9, length, P.wood[1]);
      b.box(bx, base + .95, bz, .8, .13, length + .1, P.wood[2]);
      b.box(bx, base + 1.23, bz, .32, .42, .4, P.gold);
    }
  }
  for (const side of [-1, 1]) {
    b.solid(x, base + height - .2, z + side * d / 2, w + .65, .45, .6, P.wood[0]);
    b.plaque(x, base + height - .63, z + side * (d / 2 + .38), 3.25, .65, side);
  }
  if (major) {
    for (const xx of [-6.9, 6.9]) for (const zz of [-3.6, 3.6]) b.column(x + xx, z + zz, base, height, .5);
    // Exposed trusses remain when the separate roof skins are hidden.
    for (const zz of [-3.6, 3.6]) {
      b.box(x, base + height - .2, z + zz, w - 1, .32, .35, P.wood[1]);
      b.beam([x - 8, base + height, z + zz], [x, base + height + 1.35, z + zz], .26, P.wood[2]);
      b.beam([x + 8, base + height, z + zz], [x, base + height + 1.35, z + zz], .26, P.wood[2]);
    }
  }
  b.roof(x, base + height + .15, z, w + 3.9, d + 4.1, major ? 2.8 : 1.9);
  if (major) b.roof(x, base + height + 2.5, z, w * .78, d * .55, 1.65, P.roof, 'roof-upper');
  b.finish([x, 0, z + (d + 2) / 2 + 4], [x, base, z],
    { minX: x - w / 2 + wall, maxX: x + w / 2 - wall, minZ: z - d / 2, maxZ: z + d / 2 },
    [x, base + height / 2 + 1, z], [-1, 1].map(side => [x + side * ((w + 2) / 2 + 3.7), 0, z]));
}

function buildGallery(world, side) {
  const x = side * 18, z0 = -22, z1 = 22, width = 8;
  const b = new Mason(world, side < 0 ? 'west-gallery' : 'east-gallery', side < 0 ? '西回廊' : '东回廊',
    '南北贯通的开放回廊。连续柱网、梁枋与灰瓦把前庭和后院连接起来。');
  // Posts along the margins leave over 4m even after held-staff padding.
  for (let z = z0; z <= z1; z += 5.5) {
    for (const sign of [-1, 1]) {
      // Main-hall stairs arrive at the inner central bay. The outer post next
      // to each side hall shifts behind its doorway to keep the route open.
      const inner = sign === -side;
      if (inner && z === 0) continue;
      const postZ = !inner && z === -5.5 ? -8 : z;
      b.column(x + sign * width / 2, postZ, 0, 3.7, .35, false);
    }
    b.box(x, 3.8, z, width + .35, .28, .35, P.wood[1]);
  }
  for (const sign of [-1, 1]) b.box(x + sign * width / 2, 3.8, 0, .3, .3, 45, P.wood[0]);
  // Continuous lengthwise gable in stepped courses, separate from supporting frame.
  for (let row = 0; row < 7; row++) {
    const t = row / 6, rw = width + 2 - t * (width + 1.6), yy = 4 + 1.5 * Math.pow(t, 1.7) + .2 * Math.pow(1 - t, 8);
    b.box(x, yy, 0, rw, .23, 46, P.roof[row % 4], 'roof');
    for (let z = -22.7; z < 23; z += 1.1) for (const sign of [-1, 1]) {
      if (row < 6) {
        const next = (row + 1) / 6, nextWidth = width + 2 - next * (width + 1.6);
        const nextY = 4 + 1.5 * Math.pow(next, 1.7) + .2 * Math.pow(1 - next, 8);
        b.beam([x + sign * rw / 2, yy + .12, z], [x + sign * nextWidth / 2, nextY + .12, z], .14, P.roof[2], 'roof', .15);
      }
      if (row === 0 && Math.round((z + 22.7) / 1.1) % 2 === 0) b.tileEnd(x + sign * (rw / 2 + .06), yy + .08, z, .13, Math.PI / 2);
    }
  }
  b.box(x, 5.7, 0, .35, .22, 46.5, P.roof[1], 'roof');
  for (const zz of [-22.2, 22.2]) b.ridgeBeast(x, 5.8, zz, 1, .55);
  for (let z = -21; z < 22; z += 1.5) b.box(x, .015, z, 5.6, .03, 1.43, P.stone[(Math.round(z) + 24) % 4]);
  for (const end of [-1, 1]) b.plaque(x, 3.4, end * 22.75, 2.8, .6, end);
  b.finish([x, 0, 24.5], [x, 0, 7], { minX: x - 3.7, maxX: x + 3.7, minZ: z0, maxZ: z1 }, [x, 2.8, 0]);
}

function buildPavilion(world, { id, name, x, z, w, d, double = false }) {
  const b = new Mason(world, id, name, '可穿行的园林亭。四面敞开，以柱网、屋檐和取景窗形成休息节点。');
  for (const xx of [-w / 2, w / 2]) for (const zz of [-d / 2, d / 2]) b.column(x + xx, z + zz, 0, 4, .45, false);
  for (const xx of [-w / 2, w / 2]) b.box(x + xx, 4.1, z, .35, .3, d + .7, P.wood[0]);
  for (const zz of [-d / 2, d / 2]) b.box(x, 4.1, z + zz, w + .7, .3, .35, P.wood[0]);
  b.roof(x, 4.4, z, w + 3, d + 3, 1.8);
  if (double) b.roof(x, 6.1, z, w + .8, d + .5, 1.3, P.roof, 'roof-upper');
  // Flush inset instead of a decorative platform which the controller could not climb.
  b.box(x, -.02, z, w + .8, .04, d + .8, P.stone[1]);
  for (const side of [-1, 1]) b.plaque(x, 3.68, z + side * (d / 2 + .26), 2.8, .6, side);
  b.finish([x, 0, z + d / 2 + 1.5], [x, 0, z],
    { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }, [x, 3, z]);
}

function buildPagoda(world) {
  const x = 30, z = -32;
  const b = new Mason(world, 'east-pagoda', '听松塔', '三层八角木塔的风格化演绎。首层敞开，环绕观察层层出檐与木构比例。');
  b.platform(x, z, 12, 12, 8, 6);
  for (const xx of [-4.7, 4.7]) for (const zz of [-4.7, 4.7]) b.column(x + xx, z + zz, PLATFORM, 4.2, .5);
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) b.solid(x + side * 4.7, PLATFORM + 1.7, z + end * 3.8, .35, 3.4, 1.4, P.plaster);
    b.solid(x + side * 4.7, PLATFORM + 3.7, z, .45, .5, 6.2, P.wood[0]);
  }
  // Open ground-storey entrance is rectangular and wide enough for held staff.
  for (let level = 0; level < 3; level++) {
    const yy = PLATFORM + 4.5 + level * 4, r = 6.5 - level * .7;
    if (level > 0) {
      b.cylinder(x, yy - 1.5, z, r - 1.4, r - 1.4, 3, P.red, 'roof-upper');
      for (let i = 0; i < 8; i++) {
        const a = Math.PI * i / 4, px = x + Math.sin(a) * (r - .8), pz = z + Math.cos(a) * (r - .8);
        b.box(px, yy - 1.5, pz, .28, 3, .28, P.wood[2], 'roof-upper');
      }
    }
    const layer = level === 0 ? 'roof' : 'roof-upper';
    for (let row = 0; row < 6; row++) b.cylinder(x, yy + .1 + .9 * Math.pow(row / 5, 1.7), z,
      r - row * .28 - .1, r - row * .28, .23, P.roof[row % 4], layer);
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const factor = Math.cos(Math.PI / 8) / Math.cos(((a + Math.PI / 8) % (Math.PI / 4)) - Math.PI / 8);
      for (let row = 0; row < 5; row++) {
        const rr0 = (r - row * .28) * factor, rr1 = (r - (row + 1) * .28) * factor;
        b.beam([x + Math.sin(a) * rr0, yy + .28 + .9 * Math.pow(row / 5, 1.7), z + Math.cos(a) * rr0],
          [x + Math.sin(a) * rr1, yy + .28 + .9 * Math.pow((row + 1) / 5, 1.7), z + Math.cos(a) * rr1],
          .15, P.roof[2], layer);
      }
      b.tileEnd(x + Math.sin(a) * r * factor, yy + .2, z + Math.cos(a) * r * factor, .14, a, layer);
    }
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + Math.PI / 8;
      for (let step = 0; step < 3; step++) b.box(x + Math.sin(a) * (r + step * .2), yy + .12 + step * .15,
        z + Math.cos(a) * (r + step * .2), .25, .18, .6, P.roof[2], layer, a);
    }
  }
  b.cylinder(x, 14.8, z, .35, 1.3, 1.1, P.gold, 'roof-upper');
  b.box(x, 15.65, z, .15, .85, .15, P.gold, 'roof-upper');
  for (const side of [-1, 1]) {
    b.box(x, PLATFORM + 4.08, z + side * 4.7, 9.4, .28, .35, P.wood[0]);
    b.plaque(x, PLATFORM + 3.64, z + side * 4.94, 3, .65, side);
  }
  b.finish([x, 0, z + 10], [x, PLATFORM, z],
    { minX: x - 4.5, maxX: x + 4.5, minZ: z - 4.5, maxZ: z + 4.5 }, [x, 7.2, z],
    [-1, 1].map(side => [x + side * 9.7, 0, z]));
}

function landscaping(world) {
  const b = new Mason(world, null);
  b.box(0, -.65, 0, 270, 1.2, 270, '#78845b', 'ground');
  b.box(0, -.11, 0, 89, .2, 97, '#827d6d', 'ground');
  const inGarden = (x, z) => (Math.abs(x) > 25 && z > 10 && z < 24)
    || (Math.abs(x) > 8.8 && Math.abs(x) < 12.2 && z > 16 && z < 23)
    || (Math.abs(x) > 6 && Math.abs(x) < 12 && z < -22 && z > -28);
  const paving = ['#b7af9e', '#bab19f', '#afa997', '#c1b7a4', '#b1aa99', '#c7bda9'];
  // Metre-scale, staggered flagstones replace the two-metre checkerboard.
  // Each slab is a top face, not a hidden six-sided box: all floor tops remain
  // exactly y=0 and the original stair heights/collision surfaces remain valid.
  const rowDepth = .86, slabWidth = 1.26;
  for (let row = 0; row < 112; row++) {
    const z0 = -48 + row * rowDepth, z1 = Math.min(48, z0 + rowDepth - .018);
    for (let col = -1; col < 71; col++) {
      const x0 = Math.max(-44, -44 + col * slabWidth + (row % 2) * slabWidth / 2);
      const x1 = Math.min(44, -44 + (col + 1) * slabWidth + (row % 2) * slabWidth / 2 - .022);
      if (x1 <= x0) continue;
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2, garden = inGarden(x, z);
      const color = garden ? ['#747f50', '#7d8656', '#72764e'][Math.floor(world.random() * 3)]
        : paving[Math.floor(world.random() * paving.length)];
      const nick = !garden && world.random() < .16 ? .035 + world.random() * .07 : 0;
      b.quad([x0 + nick, 0, z0], [x1, 0, z0], [x1 - nick, 0, z1], [x0, 0, z1], color, 'ground');
      // Moss lives at planting beds and aged wall edges. The central approach
      // stays quiet enough to read the route and the player's feet clearly.
      const edge = Math.abs(x) > 38 || inGarden(x - 1.25, z) || inGarden(x + 1.25, z)
        || inGarden(x, z - .9) || inGarden(x, z + .9);
      if (!garden && edge && world.random() < .28) {
        const mw = .15 + world.random() * .35, md = .08 + world.random() * .18;
        b.quad([x0, .003, z0], [x0 + mw, .003, z0], [x0 + mw * .76, .003, z0 + md],
          [x0, .003, z0 + md * 1.5], P.moss[row % 2], 'ground');
      }
      if (!garden && Math.abs(x) < 6 && world.random() < .045) {
        // A flush dark hairline across occasional slabs, not an obstacle.
        b.quad([x0 + .3, .002, z0], [x0 + .315, .002, z0],
          [x0 + .65, .002, z1], [x0 + .63, .002, z1], '#8c887a', 'ground');
      }
    }
  }
  // Perimeter walls break at both axial exits so spawn and rear garden remain open.
  for (const side of [-1, 1]) {
    b.solid(side * 44, 1.3, 0, .65, 2.6, 96, P.red);
    b.box(side * 44, 2.7, 0, 1.05, .23, 96, P.roof[0]);
    b.box(side * 43.62, .32, 0, .14, .64, 96, P.stone[2]);
    for (const end of [-1, 1]) {
      b.solid(side * 26, 1.3, end * 46, 36, 2.6, .65, P.red);
      b.box(side * 26, 2.7, end * 46, 36, .23, 1.05, P.roof[1]);
      b.box(side * 26, .32, end * 45.62, 36, .64, .14, P.stone[2]);
      for (let x = 8.5; x < 44; x += 1.1) {
        b.box(side * x, .66, end * 45.56, 1.02, .17, .21, P.stone[Math.floor(x) % 4]);
        b.box(side * x, 2.83, end * 46, .13, .13, 1.16, P.roof[2]);
      }
    }
  }
  function tree(x, z, scale, autumn = false, inBounds = true) {
    const height = 6.1 * scale, palette = autumn ? ['#858e49', '#a1a354', '#b5ae64', '#697d42'] : P.leaf;
    const lean = (.35 + world.random() * .45) * scale;
    b.beam([x, 0, z], [x + lean, height, z + .16 * scale], .68 * scale, P.wood[0], 'nature');
    b.beam([x - .16 * scale, .18, z + .12 * scale], [x + lean - .18 * scale, height * .83, z], .17 * scale, P.wood[1], 'nature');
    // Three asymmetric boughs carry broad, stepped clusters. Small peripheral
    // cells and narrower vertical crowns avoid the old floating-cube canopy.
    for (let lobe = 0; lobe < 3; lobe++) {
      const angle = lobe * 2.25 + x * .17, reach = (1.35 + lobe * .28) * scale;
      const lx = x + lean + Math.cos(angle) * reach, lz = z + Math.sin(angle) * reach;
      const ly = height + (lobe === 1 ? .85 : -.2) * scale;
      b.beam([x + lean * .65, height * .62, z], [lx, ly - .4 * scale, lz], .26 * scale, P.wood[1], 'nature');
      for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
        const edge = Math.abs(ix) + Math.abs(iz), step = .78 * scale;
        const top = ly + (edge === 0 ? .65 : edge === 1 ? .36 : -.02) * scale + world.random() * .25 * scale;
        b.box(lx + ix * step, top, lz + iz * step, (1.02 + world.random() * .18) * scale,
          (.72 + world.random() * .28) * scale, (1.02 + world.random() * .18) * scale, palette[(ix + iz + lobe + 6) % 4], 'nature');
        if (edge === 2 && (ix + iz + lobe) % 2 === 0) b.box(lx + ix * step * 1.65, top - .32 * scale,
          lz + iz * step * 1.45, .58 * scale, .48 * scale, .56 * scale, palette[lobe], 'nature');
      }
    }
    if (inBounds) world.obstacle(x, height / 2, z, 1.15 * scale, height, 1.15 * scale);
  }
  function lantern(x, z, scale = 1) {
    const stone = (xx, yy, zz, w, h, d, color) => b.box(x + xx * scale, yy * scale, z + zz * scale,
      w * scale, h * scale, d * scale, color);
    stone(0, .1, 0, 1.04, .2, 1.04, P.stone[2]);
    stone(0, .26, 0, .8, .16, .8, P.stone[1]);
    stone(0, .68, 0, .38, .72, .38, P.stone[0]);
    stone(0, 1.07, 0, .76, .17, .76, P.stone[1]);
    stone(0, 1.37, 0, .42, .45, .42, '#5d6153');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) stone(sx * .27, 1.36, sz * .27, .16, .45, .16, P.stone[3]);
    stone(0, 1.65, 0, 1.08, .16, 1.08, P.stone[1]);
    stone(0, 1.79, 0, .76, .13, .76, P.stone[0]);
    stone(0, 1.94, 0, .36, .18, .36, P.stone[3]);
    stone(-.33, .24, .42, .28, .09, .04, P.moss[0]);
    world.obstacle(x, scale, z, 1.08 * scale, 2.05 * scale, 1.08 * scale);
  }
  function shortRail(x, z, length) {
    // Short sections frame planting beds; none cross a door or the central axis.
    b.box(x, .11, z, length + .5, .22, .56, P.stone[2]);
    for (let i = 0; i <= 2; i++) {
      const xx = x - length / 2 + i * length / 2;
      b.box(xx, .61, z, .28, 1, .32, P.stone[i % 4]);
      b.box(xx, 1.14, z, .46, .16, .48, P.stone[1]);
      b.box(xx, 1.3, z, .25, .18, .27, P.stone[3]);
    }
    b.box(x, .88, z, length, .18, .27, P.stone[1]);
    b.box(x, .43, z, length, .15, .23, P.stone[0]);
    world.obstacle(x, .72, z, length + .5, 1.44, .56);
  }
  function rock(x, z, scale = 1) {
    b.box(x, .21 * scale, z, .94 * scale, .42 * scale, .75 * scale, P.stone[2], 'nature');
    b.box(x - .14 * scale, .48 * scale, z + .05 * scale, .67 * scale, .2 * scale, .62 * scale, P.stone[0], 'nature');
    b.box(x - .29 * scale, .61 * scale, z, .33 * scale, .08 * scale, .46 * scale, P.moss[0], 'nature');
    world.obstacle(x, .33 * scale, z, .94 * scale, .66 * scale, .75 * scale);
  }
  function shrubs(cx, cz, w, d, count) {
    for (let i = 0; i < count; i++) {
      const x = cx + (world.random() - .5) * w, z = cz + (world.random() - .5) * d;
      const s = .25 + world.random() * .38;
      b.box(x, s * .36, z, s * 1.25, s * .72, s, P.leaf[i % 4], 'nature');
      if (i % 3 === 0) b.box(x + s * .3, s * .75, z, s * .5, s * .35, s * .6, P.leaf[(i + 1) % 4], 'nature');
    }
  }
  for (const side of [-1, 1]) {
    for (const [x, z, s] of [[33, 18, 1.1], [39, 10, .85], [10, -24, .9], [40, -37, .95], [39, 35, 1], [11.1, 22.2, 1.12]]) tree(side * x, z, s, z > 10);
    // The front pair already has staff-safe trunk proxies at (+/-11.1,22.2).
    // Lean secondary boughs over the garden, leaving over 4m physical headroom
    // and framing the main hall from the gate without moving a route obstacle.
    for (const [cx, cz, cy] of [[7.3, 21.1, 5.65], [9.3, 24.2, 6.25]]) {
      b.beam([side * 11.1, 4.1, 22.2], [side * cx, cy - .3, cz], .28, P.wood[1], 'nature');
      for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
        const edge = Math.abs(ix) + Math.abs(iz);
        b.box(side * (cx + ix * .95), cy + (2 - edge) * .23, cz + iz * .85,
          1.24, .7, 1.12, P.leaf[(ix + iz + 6) % 4], 'nature');
      }
    }
    for (let z = -55; z < 60; z += 12) tree(side * (51 + world.random() * 5), z, 1 + world.random() * .65, false, false);
    shrubs(side * 33, 17, 12, 10, 85);
    shrubs(side * 10.5, 20.1, 2.4, 4.5, 36);
    shrubs(side * 9, -25, 4.5, 4.5, 30);
    for (const z of [18, -17]) lantern(side * 7.8, z);
    lantern(side * 25.2, 24.6, .86);
    shortRail(side * 10.6, 15.1, 2.8);
    shortRail(side * 33.5, 24, 4.6);
    rock(side * 10.5, 19.7, .95);
    rock(side * 38.5, 18.4, 1.3);
    // Low fragments at the planting edge remain outside the staff-safe route.
    for (let i = 0; i < 6; i++) {
      const x = side * (9.1 + world.random() * 2.5), z = 17 + world.random() * 4.8;
      b.box(x, .035, z, .22 + world.random() * .28, .07, .22 + world.random() * .25, P.stone[i % 4], 'nature');
    }
    // Paired original stone guardians give the main stairs a human-scale frame.
    const gx = side * 10.2, gz = 10.6;
    b.box(gx, .18, gz, 1.02, .36, 1.14, P.stone[1]);
    b.box(gx, .64, gz, .6, .58, .69, P.stone[0]);
    b.box(gx, 1.03, gz + .19, .52, .4, .5, P.stone[2]);
    b.box(gx, 1.08, gz + .47, .34, .2, .19, P.stone[1]);
    for (const paw of [-1, 1]) b.box(gx + paw * .2, .48, gz + .43, .21, .24, .34, P.stone[3]);
    b.box(gx, .87, gz - .37, .25, .52, .23, P.stone[0]);
    world.obstacle(gx, .65, gz, 1.02, 1.3, 1.18);
  }
  // Quiet garden pool below the west pavilion, with edging outside passage.
  b.box(-31, -.015, -21, 9.5, .03, 5.5, '#6f9790', 'ground');
  for (const side of [-1, 1]) b.solid(-31 + side * 5.1, .2, -21, .55, .4, 6.1, P.stone[0]);
  for (const side of [-1, 1]) b.solid(-31, .2, -21 + side * 3.05, 10.7, .4, .55, P.stone[0]);
  // Each mountain is one solid elliptical heightfield, not separate columns.
  // Broad shoulders support two or three uneven summits; exterior-only voxel
  // faces reveal 1.6m rock courses without hidden faces or stacked box bases.
  const mountainPalettes = [['#7c8d89', '#879590', '#929e96', '#74857e'],
    ['#90a29c', '#9bacA3', '#a5b3a9', '#899c93']];
  const cell = 1.7, rockStep = 1.6;
  for (let ring = 1; ring >= 0; ring--) {
    const count = ring ? 10 : 12;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count + ring * .21, radius = 83 + ring * 31 + world.random() * 7;
      const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      const peak = Math.round((22 + world.random() * 10) / rockStep) * rockStep;
      const nx = 9 + Math.floor(world.random() * 4), nz = 7 + Math.floor(world.random() * 3);
      const phase = world.random() * Math.PI * 2, palette = mountainPalettes[ring];
      const heights = new Float32Array(nx * nz);
      const summits = [[-.37, -.08, .55], [.3, .2, .48], [.02, -.42, i % 3 ? .32 : 0]];
      let maximum = 0;
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
        const u = ((ix + .5) / nx - .5) * 2, v = ((iz + .5) / nz - .5) * 2;
        const radius2 = u * u + v * v;
        if (radius2 >= 1) continue;
        const shoulder = .5 * Math.pow(1 - radius2, .6);
        let summit = 0;
        for (const [px, pz, amplitude] of summits) summit = Math.max(summit,
          amplitude * Math.exp(-((u - px) ** 2 / .12 + (v - pz) ** 2 / .2)));
        const weathering = .035 * Math.sin(ix * 2.7 + iz * 1.3 + phase)
          + .025 * Math.cos(ix * 1.1 - iz * 2.3 + phase);
        const value = Math.max(.04, shoulder + summit + weathering);
        heights[ix * nz + iz] = value;
        maximum = Math.max(maximum, value);
      }
      for (let k = 0; k < heights.length; k++) {
        if (heights[k] > 0) heights[k] = Math.max(rockStep, Math.round(heights[k] / maximum * peak / rockStep) * rockStep);
      }
      const at = (ix, iz) => ix < 0 || ix >= nx || iz < 0 || iz >= nz ? 0 : heights[ix * nz + iz];
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
        const height = at(ix, iz);
        if (!height) continue;
        const x0 = x + (ix - nx / 2) * cell, x1 = x0 + cell;
        const z0 = z + (iz - nz / 2) * cell, z1 = z0 + cell;
        const moss = height < peak * .6 && (ix * 3 + iz + i) % 5 < 2;
        const topColor = moss ? (ring ? '#8b9d84' : '#74865e') : palette[(ix + iz + i) % 3];
        b.quad([x0, height, z0], [x1, height, z0], [x1, height, z1], [x0, height, z1], topColor, 'distant');
        // Only the difference above an adjacent column is exposed. All omitted
        // faces are internal solid rock; no independent thin shafts remain.
        for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const low = at(ix + dx, iz + dz);
          if (low >= height) continue;
          for (let y0 = low; y0 < height - .01; y0 += rockStep * 2) {
            const y1 = Math.min(height, y0 + rockStep * 2);
            const stratum = (Math.floor(y0 / (rockStep * 2)) + ix * 2 + iz + i) % 7;
            const color = palette[stratum === 0 ? 2 : stratum === 1 ? 3 : 1];
            if (dx) {
              const xx = dx < 0 ? x0 : x1;
              b.quad([xx, y0, z0], [xx, y0, z1], [xx, y1, z1], [xx, y1, z0], color, 'distant', [dx, 0, 0]);
            } else {
              const zz = dz < 0 ? z0 : z1;
              b.quad([x0, y0, zz], [x1, y0, zz], [x1, y1, zz], [x0, y1, zz], color, 'distant', [0, 0, dz]);
            }
          }
        }
      }
    }
  }
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4, x = Math.sin(a) * 71, z = Math.cos(a) * 71, y = 24 + (i % 4) * 2.8;
    b.box(x, y, z, 10, 2, 4.2, '#fff4df', 'cloud');
    b.box(x - 2, y + 1.2, z, 5, 2, 4, '#fff8e9', 'cloud');
    b.box(x + 4, y + .6, z + .3, 5, 1.5, 3.8, '#f5eddd', 'cloud');
  }
  b.finish();
}

/** All positions and boxes use metres in world space. Colliders include body
 * padding in x/z only, while minY/maxY and camera boxes retain physical heights.
 * Surfaces are floor tops; choose the highest covering surface at each x/z.
 * Each building has independent roof meshes for cutaway and independent groups
 * for selecting it in the architecture viewer. No external assets are loaded.
 */
export function createCompoundScene() {
  const world = new Compound();
  landscaping(world);
  buildGate(world);
  buildHall(world, { id: 'main-hall', name: '明德殿', description: '中轴主殿。0.72米台基、四面石阶、通透柱网与双层出檐，可从前后门与侧门入内观察梁架。',
    x: 0, z: 0, w: 22, d: 14, height: 5.8, major: true });
  buildGallery(world, -1);
  buildGallery(world, 1);
  for (const side of [-1, 1]) buildHall(world, { id: side < 0 ? 'west-hall' : 'east-hall',
    name: side < 0 ? '西静堂' : '东文轩', description: '四面石阶与侧门相连的偏殿。灰瓦、朱柱与木格窗围出尺度亲切的室内空间。',
    x: side * 31, z: -5, w: 14, d: 10, height: 4.2 });
  buildPavilion(world, { id: 'rear-pavilion', name: '望山亭', x: 0, z: -34, w: 10, d: 8, double: true });
  buildPavilion(world, { id: 'garden-pavilion', name: '临池亭', x: -30, z: -32, w: 9, d: 8 });
  buildPagoda(world);
  const walkRoute = [
    { name: '穿过承风门', position: [0, 0, 30] },
    { name: '前庭中轴', position: [0, 0, 20] },
    { name: '西回廊柱网', position: [-18, 0, 7] },
    { name: '明德殿前阶', position: [0, 0, 13] },
    { name: '入殿观梁架', position: [0, PLATFORM, 0] },
    { name: '穿殿到后院', position: [0, 0, -20] },
    { name: '东廊回望', position: [18, 0, -18] },
    { name: '东文轩门前', position: [31, 0, 6] },
    { name: '东文轩内', position: [31, PLATFORM, -5] },
    { name: '望山亭休憩', position: [0, 0, -34] },
    { name: '临池亭', position: [-30, 0, -32] },
    { name: '听松塔前', position: [30, 0, -22] },
  ];
  world.root.userData.units = 'metres';
  world.root.userData.playerHeight = 1.8;
  world.root.userData.playerClearance = PAD;
  world.root.userData.disclaimer = '参考视频形制创作的原创古建群，非故宫或其他文物的测绘复原。';
  return { root: world.root, colliders: world.colliders, cameraBounds: world.cameraBounds,
    cameraObstacles: world.cameraObstacles, surfaces: world.surfaces, buildings: world.buildings,
    spawn: [0, 0, 42], bounds: { minX: -44, maxX: 44, minZ: -48, maxZ: 48 }, walkRoute };
}
