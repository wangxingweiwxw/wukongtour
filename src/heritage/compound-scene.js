import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addPlaqueFace } from './architectural-plaque.js';
import { COMPOUND_LAYOUT } from './compound-layout.js';

// Original metre-scale mountain courts interpreted from the supplied map.
// Geometry and traversable metadata share the same authored placements.
const P = {
  stone: ['#a7adb0', '#bcc3c5', '#899397', '#d7dcda'],
  wood: ['#634634', '#805a40', '#a08058', '#42362b'],
  roof: ['#5b605c', '#71756c', '#969589', '#48514e'],
  leaf: ['#475952', '#61736b', '#81908a', '#384c46'],
  red: '#824436', plaster: '#b4afa4', gold: '#bba06a', dark: '#35423d',
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
    const rows = 9, ribs = Math.max(10, Math.round(w / .78));
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
          // Thin snow caught toward the ridge follows the curved tile surface;
          // exposed lower courses retain the gray roof's architectural outline.
          if (row >= 5 && (row + col * 3 + side) % 5 !== 0) {
            const snowy = [face(u0, t0, side), face(u1, t0, side), face(u1, t1, side), face(u0, t1, side)]
              .map(([xx, yy, zz]) => [xx, yy + .055, zz]);
            this.quad(...snowy, row % 2 ? '#e0e5e3' : '#edf0eb', layer);
          }
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

function buildGate(world, {id = 'gate', name = '雪岭山门'} = {}) {
  const b = new Mason(world, id, name, '三开间重檐山门，中央门道前后贯通。穿门后沿雪石中轴继续登台，楼层仅作外形表达。');
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

function buildGallery(world, side, {id, name, length = 24, width = 7} = {}) {
  const x = side * 18, z0 = -length / 2, z1 = length / 2;
  const b = new Mason(world, id, name,
    '位于中层台地的开放经廊。连续柱梁连接偏殿与登山石阶，四面留出可穿行的柱间。');
  // Posts along the margins leave over 4m even after held-staff padding.
  for (let bay = 0; bay <= 8; bay++) {
    const z = z0 + bay * length / 8;
    for (const sign of [-1, 1]) {
      // Main-hall stairs arrive at the inner central bay. The outer post next
      // to each side hall shifts behind its doorway to keep the route open.
      const inner = sign === -side;
      if (inner && z === 0) continue;
      const postZ = z;
      b.column(x + sign * width / 2, postZ, 0, 3.7, .35, false);
    }
    b.box(x, 3.8, z, width + .35, .28, .35, P.wood[1]);
  }
  for (const sign of [-1, 1]) b.box(x + sign * width / 2, 3.8, 0, .3, .3, length + 1, P.wood[0]);
  // Continuous lengthwise gable in stepped courses, separate from supporting frame.
  for (let row = 0; row < 7; row++) {
    const t = row / 6, rw = width + 2 - t * (width + 1.6), yy = 4 + 1.5 * Math.pow(t, 1.7) + .2 * Math.pow(1 - t, 8);
    b.box(x, yy, 0, rw, .23, length + 2, row > 4 ? '#e1e6e3' : P.roof[row % 4], 'roof');
    for (let z = z0 - .7; z < z1 + 1; z += 1.1) for (const sign of [-1, 1]) {
      if (row < 6) {
        const next = (row + 1) / 6, nextWidth = width + 2 - next * (width + 1.6);
        const nextY = 4 + 1.5 * Math.pow(next, 1.7) + .2 * Math.pow(1 - next, 8);
        b.beam([x + sign * rw / 2, yy + .12, z], [x + sign * nextWidth / 2, nextY + .12, z], .14, P.roof[2], 'roof', .15);
      }
      if (row === 0 && Math.round((z + 22.7) / 1.1) % 2 === 0) b.tileEnd(x + sign * (rw / 2 + .06), yy + .08, z, .13, Math.PI / 2);
    }
  }
  b.box(x, 5.7, 0, .35, .22, length + 2.5, P.roof[1], 'roof');
  for (const zz of [z0 - .2, z1 + .2]) b.ridgeBeast(x, 5.8, zz, 1, .55);
  for (let z = z0 + 1; z < z1; z += 1.5) b.box(x, .015, z, width - 2.4, .03, 1.43, P.stone[(Math.round(z) + 100) % 4]);
  for (const end of [-1, 1]) b.plaque(x, 3.4, end * (length / 2 + .75), 2.8, .6, end);
  b.finish([x, 0, z1 + 2.5], [x, 0, 7], { minX: x - width / 2, maxX: x + width / 2, minZ: z0, maxZ: z1 }, [x, 2.8, 0]);
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

function buildPagoda(world, {id = 'east-pagoda', name = '照雪塔'} = {}) {
  const x = 30, z = -32;
  const b = new Mason(world, id, name, '上院东侧的三层八角木塔。首层四面石阶可入内，塔檐呼应后山大殿，楼上仅供外部观察。');
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
  const b = new Mason(world), {bounds, terraces, stairways} = COMPOUND_LAYOUT;
  const width = bounds.maxX - bounds.minX;
  const floorAt = z => terraces.find(t => z >= t.minZ && z <= t.maxZ)?.height || 0;
  for (const terrace of terraces) {
    const depth = terrace.maxZ - terrace.minZ, z = (terrace.maxZ + terrace.minZ) / 2;
    world.surface(0, z, width, depth, terrace.height);
    const slabTop = terrace.height - .025;
    b.box(0, (slabTop - .5) / 2, z, width, slabTop + .5, depth, P.stone[2], 'ground');
    // Broad staggered stone slabs read as a courtyard, with quiet central paths.
    for (let zz = terrace.minZ; zz < terrace.maxZ; zz += 1.3) {
      const row = Math.round((zz - terrace.minZ) / 1.3);
      for (let xx = bounds.minX; xx < bounds.maxX; xx += 1.9) {
        const x1 = Math.min(bounds.maxX, xx + 1.88), z1 = Math.min(terrace.maxZ, zz + 1.28);
        const color = P.stone[(row + Math.floor((xx + 48) / 1.9)) % 4];
        b.quad([xx, terrace.height, zz], [x1, terrace.height, zz],
          [x1, terrace.height, z1], [xx, terrace.height, z1], color, 'ground');
        if (Math.abs(xx) > 39 && world.random() > .35) {
          b.quad([xx, terrace.height + .012, zz], [x1, terrace.height + .012, zz],
            [x1 - .18, terrace.height + .012, z1], [xx, terrace.height + .012, z1 - .12], '#e6eae6', 'ground');
        }
      }
    }
    if (terrace.height) {
      for (let x = -46; x < 48; x += 2.1) {
        b.box(x, terrace.height / 2, terrace.maxZ + .04, 2.02, terrace.height - .05, .12, P.stone[1], 'ground');
      }
    }
  }
  for (const stair of stairways) {
    const count = Math.round((stair.to - stair.from) / STEP);
    for (let level = 1; level <= count; level++) {
      const height = stair.from + level * STEP;
      const z = stair.z + (count - level) * TREAD + TREAD / 2;
      b.box(stair.x, stair.from + (height - stair.from) / 2, z,
        stair.width, height - stair.from, TREAD, P.stone[level % 4], 'ground');
      world.surface(stair.x, z, stair.width, TREAD, height);
      for (const side of [-1, 1]) b.box(stair.x + side * (stair.width / 2 - .22),
        height + .018, z, .35, .036, TREAD * .8, '#e4e9e7', 'ground');
    }
    // Stone cheeks sit outside the stair width; every tread retains an open centre.
    for (const side of [-1, 1]) for (let level = 0; level <= count; level += 2) {
      const z = stair.z + (count - level) * TREAD;
      const floor = stair.from + Math.max(1, level) * STEP;
      b.box(stair.x + side * (stair.width / 2 + .65), floor + .45, z, .5, .9, .5, P.stone[1]);
      world.obstacle(stair.x + side * (stair.width / 2 + .65), floor + .45, z, .5, .9, .5);
    }
  }
  for (const side of [-1, 1]) {
    for (const t of terraces) {
      const depth = t.maxZ - t.minZ, z = (t.maxZ + t.minZ) / 2;
      b.solid(side * 47.2, t.height + 1.1, z, .65, 2.2, depth, P.red);
      b.box(side * 47.2, t.height + 2.25, z, 1.1, .2, depth, P.roof[0]);
      b.box(side * 47.2, t.height + 2.38, z, 1.05, .08, depth, '#e7ebe7');
    }
    for (const z of [66, 38, 19, -10, -28, -48, -63]) {
      const x = side * (43 + world.random()), base = floorAt(z), height = 6.5 + world.random() * 2;
      b.beam([x, base, z], [x + side * .55, base + height, z], .55, P.wood[0], 'nature');
      world.obstacle(x, base + height / 2, z, .75, height, .75);
      for (let crown = 0; crown < 3; crown++) {
        const cy = base + height - crown * 1.35, reach = 1.5 + crown * .65;
        b.beam([x, cy - 1, z], [x + side * reach, cy, z + .8], .2, P.wood[1], 'nature');
        b.box(x + side * .4, cy, z, reach * 2.2, .5, reach * 1.5, P.leaf[crown], 'nature');
        b.box(x + side * .6, cy + .29, z, reach * 1.8, .1, reach * 1.2, '#dfe6e2', 'nature');
      }
    }
    // Asymmetric close mountain walls define the long valley without occupying
    // walkable court space. Solid heightfields avoid disconnected rock columns.
    for (let mountain = 0; mountain < 5; mountain++) {
      const cx = side * (63 + world.random() * 7), cz = 70 - mountain * 36 + side * 4;
      const nx = 11, nz = 15, cell = 2.35, peak = 35 + world.random() * 26;
      const heights = new Float32Array(nx * nz);
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
        const u = (ix + .5) / nx * 2 - 1, v = (iz + .5) / nz * 2 - 1;
        const r = u * u + v * v;
        if (r < 1) heights[ix * nz + iz] = Math.max(2, Math.round(peak * Math.pow(1 - r, .58)
          * (.8 + .2 * Math.sin(ix * .63 + mountain)) / 1.5) * 1.5);
      }
      const at = (ix, iz) => ix < 0 || iz < 0 || ix >= nx || iz >= nz ? 0 : heights[ix * nz + iz];
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
        const y = at(ix, iz); if (!y) continue;
        const x0 = cx + (ix - nx / 2) * cell, x1 = x0 + cell;
        const z0 = cz + (iz - nz / 2) * cell, z1 = z0 + cell;
        b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1],
          y > peak * .5 ? '#dce2de' : '#929e9e', 'distant');
        for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const low = at(ix + dx, iz + dz); if (low >= y) continue;
          const color = ['#6e7c80', '#849195', '#a0aaa9'][(ix + iz + mountain) % 3];
          if (dx) {
            const xx = dx < 0 ? x0 : x1;
            b.quad([xx, low, z0], [xx, low, z1], [xx, y, z1], [xx, y, z0], color, 'distant', [dx, 0, 0]);
          } else {
            const zz = dz < 0 ? z0 : z1;
            b.quad([x0, low, zz], [x1, low, zz], [x1, y, zz], [x0, y, zz], color, 'distant', [0, 0, dz]);
          }
        }
      }
    }
  }
  b.finish();
}

// Each single building remains a reusable local model. One placement translates
// the visible group and all physics/navigation metadata into world coordinates.
function appendBuilding(world, spec) {
  const local = new Compound();
  let origin = [0, 0, 0];
  if (spec.type === 'gate') {buildGate(local, spec); origin = [0, 0, 30];}
  else if (spec.type === 'hall') buildHall(local, {...spec, x: 0, z: 0,
    description: spec.major ? '上院中轴大殿，重檐高起、四面石阶。可穿过前后门及侧门观察高大柱梁。'
      : '中院偏殿，石台抬高于院地，前后及两侧石阶连接经廊与偏院。'});
  else if (spec.type === 'gallery') {buildGallery(local, spec.side, spec); origin = [spec.side * 18, 0, 0];}
  else if (spec.type === 'pagoda') {buildPagoda(local, spec); origin = [30, 0, -32];}
  else buildPavilion(local, {...spec, x: 0, z: 0});
  const offset = new THREE.Vector3(spec.x - origin[0], spec.base, spec.z - origin[2]);
  const point = p => [p[0] + offset.x, p[1] + offset.y, p[2] + offset.z];
  const rect = r => ({...r, minX: r.minX + offset.x, maxX: r.maxX + offset.x,
    minZ: r.minZ + offset.z, maxZ: r.maxZ + offset.z});
  const building = local.buildings[0];
  building.root.position.copy(offset);
  building.root.updateMatrixWorld(true);
  building.bounds.translate(offset);
  for (const key of ['entry', 'interior', 'viewTarget']) building[key] = point(building[key]);
  building.sideEntries = building.sideEntries.map(point);
  building.floorBounds = rect(building.floorBounds);
  building.placement = {x: spec.x, y: spec.base, z: spec.z};
  world.root.add(building.root);
  world.buildings.push(building);
  world.colliders.push(...local.colliders.map(c => ({...rect(c), minY: c.minY + offset.y, maxY: c.maxY + offset.y})));
  world.surfaces.push(...local.surfaces.map(s => ({...rect(s), height: s.height + offset.y})));
  world.cameraBounds.push(...local.cameraBounds.map(box => box.clone().translate(offset)));
  world.cameraObstacles.push(...local.cameraObstacles.map(c => ({...c, box: c.box.clone().translate(offset)})));
}

/** All positions and boxes use metres in world space. Colliders include body
 * padding in x/z only, while minY/maxY and camera boxes retain physical heights.
 * Surfaces are floor tops; choose the highest covering surface at each x/z.
 * Each building has independent roof meshes for cutaway and independent groups
 * for selecting it in the architecture viewer. No external assets are loaded.
 */
export function createCompoundScene() {
  const world = new Compound(), layout = COMPOUND_LAYOUT;
  landscaping(world);
  for (const spec of layout.buildings) appendBuilding(world, spec);
  const byId = new Map(world.buildings.map(building => [building.id, building]));
  const inside = (id, name) => ({name: name || byId.get(id).name, buildingId: id,
    position: [...byId.get(id).interior]});
  const walkRoute = [
    inside('gate', '穿过雪岭山门'),
    inside('west-front-pavilion'), inside('east-front-pavilion'),
    {name: '登中轴第一重石阶', position: [0, 1.44, 22]},
    inside('terrace-gate', '穿入云门进中院'),
    inside('west-gallery'), inside('west-hall'),
    inside('east-gallery'), inside('east-hall'),
    {name: '登上后山台地', position: [0, 2.88, -21]},
    inside('west-upper-pavilion'),
    {name: '雷音大殿前阶', buildingId: 'main-hall', position: [...byId.get('main-hall').entry]},
    inside('main-hall', '入雷音大殿观梁'),
    inside('east-upper-pavilion'), inside('east-pagoda'), inside('rear-pavilion'),
  ];
  world.root.name = 'snow-mountain-temple-compound';
  Object.assign(world.root.userData, {units: 'metres', playerHeight: 1.8, playerClearance: PAD,
    layoutId: layout.id, disclaimer: layout.description});
  return {root: world.root, colliders: world.colliders, cameraBounds: world.cameraBounds,
    cameraObstacles: world.cameraObstacles, surfaces: world.surfaces, buildings: world.buildings,
    spawn: [...layout.spawn], bounds: {...layout.bounds}, walkRoute,
    displayName: layout.displayName, description: layout.description,
    overview: {...layout.overview, target: [...layout.overview.target], position: [...layout.overview.position],
      mobilePosition: [...layout.overview.mobilePosition]},
    terraces: layout.terraces.map(t => ({...t})), stairways: layout.stairways.map(s => ({...s})), layoutId: layout.id};
}
