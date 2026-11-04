import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { duleTemple, foguangTemple } from './journey-scenes-north.js';
import { xiaoxitianTemple, shuiluTemple, kaiyuanTowers } from './journey-scenes-south.js';
import { enterablePlatform, interiorObstacle } from './journey-interiors.js';

// Authored sightseeing spaces, inspired by architectural references rather than
// measured reconstructions. One unit is one metre; hall floors and their stairs
// share the same height-aware walking controller as the architectural garden.
const PALETTE = {
  stone: ['#aba493', '#bdb5a3', '#918d80', '#ccc3b0'],
  sand: ['#bb9e76', '#c9ae87', '#a88b68', '#d7bd96'],
  wood: ['#68503a', '#806046', '#967453', '#483d32'],
  roof: ['#545d59', '#6c7268', '#858778', '#444e4b'],
  leaf: ['#667b46', '#81934f', '#a0aa62', '#526d42'],
  red: '#8f4335', ochre: '#c2a172', gold: '#c3a667', dark: '#393e39',
};
const CLEARANCE = 1.65; // The hero's held staff needs more room than its torso.

class SceneBuilder {
  constructor(id) {
    this.root = new THREE.Group();
    this.root.name = `heritage-journey-${id}`;
    this.batches = new Map();
    this.colliders = [];
    this.surfaces = [];
    this.interiors = [];
    this.cameraBounds = [];
    this.seed = [...id].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) >>> 0;
  }

  random() {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  add(geometry, color, material = 'stone') {
    const rgb = new THREE.Color(color);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) rgb.toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!this.batches.has(material)) this.batches.set(material, []);
    this.batches.get(material).push(geometry);
  }

  box(x, y, z, w, h, d, color, material = 'stone', rotation = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotation) g.rotateY(rotation);
    g.translate(x, y, z);
    this.add(g, color, material);
  }

  octagon(x, y, z, top, bottom, h, color, material = 'stone', sides = 8) {
    const g = new THREE.CylinderGeometry(top, bottom, h, sides, 1);
    g.rotateY(Math.PI / sides);
    g.translate(x, y, z);
    this.add(g, color, material);
  }

  beam(a, b, width, color, material = 'wood', depth = width) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const g = new THREE.BoxGeometry(width, delta.length(), depth);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    g.translate(...start.add(end).multiplyScalar(.5).toArray());
    this.add(g, color, material);
  }

  obstacle(x, z, w, d, minY, maxY, padding = CLEARANCE) {
    this.colliders.push({ minX: x - w / 2 - padding, maxX: x + w / 2 + padding,
      minZ: z - d / 2 - padding, maxZ: z + d / 2 + padding, minY, maxY });
    this.cameraBounds.push(new THREE.Box3(new THREE.Vector3(x - w / 2, minY, z - d / 2),
      new THREE.Vector3(x + w / 2, maxY, z + d / 2)));
  }

  surface(x, z, w, d, height) {
    this.surfaces.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,height});
  }

  // Roof is a sequence of tile courses, with a broad eave and lifted corners.
  roof(x, y, z, w, d, rise = 2, color = PALETTE.roof) {
    const courses = 9;
    for (let i = 0; i < courses; i++) {
      const t = i / (courses - 1);
      const rw = w * (1 - .31 * t), rd = d * (1 - .94 * t);
      const yy = y + rise * (t * .7 + t * t * .3);
      this.box(x, yy, z, rw, .26, rd, color[i % color.length], 'roof');
      const zz = rd / 2;
      for (let xx = -rw / 2 + .18; xx < rw / 2; xx += .58) {
        this.box(x + xx, yy + .15, z + zz - .1, .16, .11, .46, color[(i + 2) % color.length], 'roof');
        this.box(x + xx, yy + .15, z - zz + .1, .16, .11, .46, color[(i + 2) % color.length], 'roof');
      }
    }
    this.box(x, y + rise + .22, z, w * .72, .24, .36, color[2], 'roof');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        this.box(x + sx * (w / 2 - .5 + i * .25), y + i * .19, z + sz * (d / 2 - .35 + i * .15),
          .55, .25, .55, color[(i + 1) % color.length], 'roof');
      }
      this.box(x + sx * w * .35, y + rise + .45, z, .28, .5, .35, color[2], 'roof');
    }
  }

  pillar(x, y, z, height, width = .45, red = false) {
    this.box(x, y + .15, z, width + .24, .3, width + .24, PALETTE.stone[1]);
    this.box(x, y + height / 2 + .3, z, width, height, width,
      red ? PALETTE.red : PALETTE.wood[0], 'wood');
    this.box(x, y + height + .15, z, width * 2.3, .25, width * 1.2, PALETTE.wood[2], 'wood');
    this.box(x, y + height + .37, z, width * 1.4, .2, width * 2.4, PALETTE.wood[1], 'wood');
  }

  railing(x, y, z, length, alongX = true, red = false) {
    const color = red ? PALETTE.red : PALETTE.wood[1];
    this.box(x, y + .95, z, alongX ? length : .15, .16, alongX ? .15 : length, color, 'wood');
    this.box(x, y + .25, z, alongX ? length : .13, .13, alongX ? .13 : length, color, 'wood');
    for (let p = -length / 2; p <= length / 2; p += .65) {
      this.box(x + (alongX ? p : 0), y + .57, z + (alongX ? 0 : p), .13, .9, .13, color, 'wood');
    }
  }

  hall(x, z, w = 14, d = 8, y = 0, height = 4.5, red = false) {
    this.box(x, y + .3, z, w + .7, .6, d + .7, PALETTE.stone[2]);
    this.box(x, y + .63, z, w + 1.2, .16, d + 1.2, PALETTE.stone[1]);
    this.box(x, y + height / 2 + .6, z - .45, w - .7, height, d - 1.5,
      red ? PALETTE.red : PALETTE.ochre, 'wood');
    const front = z + d / 2;
    for (let xx = -w / 2; xx <= w / 2 + .1; xx += w / 4) {
      this.pillar(x + xx, y + .6, front, height, .48, red);
      if (Math.abs(xx) > .01 && Math.abs(xx) < w / 2) {
        this.box(x + xx / 2, y + 2.65, front - .7, w / 4 - .65, 2.5, .16, PALETTE.wood[3], 'wood');
        for (let slat = -.7; slat <= .7; slat += .23) {
          this.box(x + xx / 2 + slat, y + 2.8, front - .58, .09, 2.1, .12, PALETTE.wood[2], 'wood');
        }
      }
    }
    for (const side of [-1, 1]) for (let zz = -d / 2; zz < d / 2; zz += d / 2) {
      this.pillar(x + side * w / 2, y + .6, z + zz, height, .48, red);
    }
    this.box(x, y + 2.2, front - .56, 2.25, 3.1, .26, PALETTE.wood[3], 'wood');
    for (const side of [-1, 1]) {
      this.box(x + side * .56, y + 2.2, front - .39, 1.02, 2.95, .13, PALETTE.wood[1], 'wood');
      this.box(x + side * .16, y + 2.05, front - .29, .1, .22, .08, PALETTE.gold, 'metal');
    }
    this.box(x, y + height + .78, front, w + .5, .42, .6, PALETTE.wood[0], 'wood');
    this.box(x, y + height + .43, front + .33, 2.35, .58, .16, PALETTE.wood[3], 'wood');
    for (let i = -2; i <= 2; i++) this.box(x + i * .34, y + height + .43, front + .43, .12, .25, .04, PALETTE.gold, 'metal');
    this.roof(x, y + height + 1, z, w + 3, d + 3, 2.2);
  }

  tree(x, z, scale = 1, leaning = false) {
    const height = 7 * scale;
    const bend = leaning ? 2.2 * scale : .45 * scale;
    this.beam([x, 0, z], [x + bend, height, z - .45], .95 * scale, PALETTE.wood[0]);
    this.beam([x + bend * .45, height * .48, z], [x - 2.3 * scale, height * .85, z + .7], .45 * scale, PALETTE.wood[1]);
    this.beam([x + bend * .7, height * .66, z], [x + 3.5 * scale, height * .97, z - 1.3], .45 * scale, PALETTE.wood[1]);
    for (let i = 0; i < 28; i++) {
      const a = i * 2.399, r = (.6 + this.random() * 2.9) * scale;
      this.box(x + bend * .55 + Math.cos(a) * r, height + Math.round(this.random() * 2) * scale,
        z + Math.sin(a) * r, (1.4 + this.random()) * scale, (1 + this.random()) * scale,
        (1.4 + this.random()) * scale, PALETTE.leaf[i % 4], 'foliage');
    }
    this.obstacle(x + bend * .4, z, 1.4 + bend * .8, 1.6, 0, height);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * .4;
      this.beam([x, .15, z], [x + Math.cos(a) * 1.7 * scale, .04, z + Math.sin(a) * 1.7 * scale], .27 * scale, PALETTE.wood[1]);
    }
  }

  garden(x, z, w = 3, d = 3, sand = false) {
    // Low moss and flat paving can be walked over; only taller rocks obstruct.
    for (let i = 0; i < 20; i++) {
      const px = x + (this.random() - .5) * w, pz = z + (this.random() - .5) * d;
      this.box(px, .04, pz, .45 + this.random() * .7, .08, .45 + this.random() * .7,
        sand ? PALETTE.sand[i % 4] : PALETTE.leaf[i % 4], sand ? 'stone' : 'foliage');
      if (!sand && i % 3 === 0) this.box(px, .16, pz, .09, .3, .12, PALETTE.leaf[2], 'foliage');
    }
  }

  path(points, width = 3, sand = false) {
    const colors = sand ? PALETTE.sand : PALETTE.stone;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const length = Math.hypot(bx - ax, bz - az), steps = Math.ceil(length / .9);
      const angle = Math.atan2(bx - ax, bz - az);
      for (let j = 0; j < steps; j++) {
        const t = (j + .5) / steps;
        this.box(ax + (bx - ax) * t, .018, az + (bz - az) * t, width, .035, length / steps - .06,
          colors[j % 4], 'stone', angle);
      }
    }
  }

  lantern(x, z) {
    this.box(x, .13, z, .75, .26, .75, PALETTE.stone[2]);
    this.box(x, .65, z, .3, .8, .3, PALETTE.stone[0]);
    this.box(x, 1.22, z, .58, .36, .58, PALETTE.ochre, 'wood');
    this.box(x, 1.46, z, .85, .16, .85, PALETTE.roof[1], 'roof');
    this.box(x, 1.61, z, .44, .16, .44, PALETTE.roof[0], 'roof');
    this.obstacle(x, z, .85, .85, 0, 1.7);
  }

  finish() {
    for (const [kind, geometries] of this.batches) {
      const merged = mergeGeometries(geometries, false);
      if (!merged) throw new Error(`Cannot merge ${kind} geometry`);
      geometries.forEach(g => g.dispose());
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'metal' ? .58 : .96,
        metalness: kind === 'metal' ? .25 : 0, flatShading: true });
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${this.root.name}-${kind}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    this.batches.clear();
    this.root.userData.units = 'metres';
    this.root.userData.style = 'reference-inspired voxel architecture';
    this.root.userData.playerClearance = CLEARANCE;
    return this;
  }
}

function shisiHall(b) {
  const z=-11,w=15,d=8,base=.71,height=4.6,front=z+d/2;
  // The side stairs occupy the rear bay, just beyond the west gallery's first
  // column. This keeps both a usable gallery and a continuous side approach.
  const sideOffset=-2.5,sideOpening=2.7;
  b.box(0,.3,z,w+.7,.6,d+.7,PALETTE.stone[2]);
  b.box(0,.63,z,w+1.2,.16,d+1.2,PALETTE.stone[1]);
  const interior=enterablePlatform(b,{id:'shisi-main-hall',z,width:w+1.2,depth:d+1.2,
    height:base,sideOffset,sideWidth:2.4,center:[0,base,z+2],stone:PALETTE.stone});
  b.box(0,base+height/2,z-d/2,w,height,.4,PALETTE.ochre,'wood');
  interiorObstacle(b,0,z-d/2,w,.4,base,base+height);
  for(const side of [-1,1]) {
    for(const [near,far] of [[-d/2,sideOffset-sideOpening/2],[sideOffset+sideOpening/2,d/2]]) {
      const zz=z+(near+far)/2;
      b.box(side*w/2,base+height/2,zz,.4,height,far-near,PALETTE.ochre,'wood');
      interiorObstacle(b,side*w/2,zz,.4,far-near,base,base+height);
    }
    b.box(side*w/2,base+height-.9,z+sideOffset,.4,1.8,sideOpening,PALETTE.wood[0],'wood');
    // Framed timber panels and open door leaves retain the small hall's facade.
    const panelWidth=(w-3.4)/2,panelX=side*(1.7+panelWidth/2);
    b.box(panelX,base+height/2,front,panelWidth,height,.25,PALETTE.ochre,'wood');
    interiorObstacle(b,panelX,front,panelWidth,.25,base,base+height);
    b.box(panelX,base+2.5,front+.16,2.7,2.4,.13,PALETTE.wood[3],'wood');
    for(let slat=-1.1;slat<=1.1;slat+=.27)
      b.box(panelX+slat,base+2.5,front+.27,.08,2.2,.12,PALETTE.wood[2],'wood');
    b.box(side*1.75,base+1.6,front-.6,.15,3.2,1.2,PALETTE.wood[1],'wood');
    interiorObstacle(b,side*1.75,front-.6,.15,1.2,base,base+3.2);
    for(const zz of [z-d/2,z,front]) {
      b.pillar(side*w/2,base,zz,height,.48);
      interiorObstacle(b,side*w/2,zz,.72,.72,base,base+height);
    }
    b.pillar(side*w/4,base,front,height,.48);
    interiorObstacle(b,side*w/4,front,.72,.72,base,base+height);
  }
  b.box(0,base+height-.1,front,w+.5,.42,.6,PALETTE.wood[0],'wood');
  b.box(0,base+height-.47,front+.33,2.35,.58,.16,PALETTE.wood[3],'wood');
  for(let i=-2;i<=2;i++)b.box(i*.34,base+height-.47,front+.43,.12,.25,.04,PALETTE.gold,'metal');
  // Interior beams and a rear altar remain physical objects under the roof.
  for(const xx of [-3.75,3.75])b.box(xx,base+height-.12,z,.24,.28,d-.4,PALETTE.wood[1],'wood');
  b.box(0,base+.45,z-2.7,5.4,.9,1,PALETTE.wood[0],'wood');
  b.box(0,base+.94,z-2.7,5.7,.14,1.2,PALETTE.wood[2],'wood');
  interiorObstacle(b,0,z-2.7,5.7,1.2,base,base+1.01);
  for(const xx of [-1.4,0,1.4])b.box(xx,base+1.25,z-2.7,.32,.45,.32,PALETTE.gold,'metal');
  interior.solidSamples.push([0,base,z-d/2],[w/2,base,z],[0,base,z-2.7]);
  b.roof(0,5.6,z,w+3,d+3,2.2);
}

function mountainTemple(b) {
  b.path([[0, 22], [0, 2]]);
  b.path([[-17, 0], [-17, 4.5], [0, 4.5], [17, 4.5], [17, 1]], 2.8);
  shisiHall(b);
  // Gateway stays open: both pillars have their own collider, no doorway box.
  for (const x of [-4.8, 4.8]) {
    b.pillar(x, 0, 8, 4.2, .55);
    b.obstacle(x, 8, .8, .8, 0, 4.8);
    b.beam([x, 3.1, 8], [x - Math.sign(x) * .95, 4.05, 8], .22, PALETTE.wood[2]);
  }
  b.box(0, 4.5, 8, 10.5, .4, .65, PALETTE.wood[0], 'wood');
  b.roof(0, 4.8, 8, 12, 4.1, 1.65);
  b.cameraBounds.push(new THREE.Box3(new THREE.Vector3(-6, 4.2, 5.8), new THREE.Vector3(6, 6.8, 10.2)));
  // A long open timber gallery with repeated beams gives a human-scale rhythm.
  for (const x of [-9.5, -14.8]) {
    for (let z = -11; z <= 2; z += 3.25) {
      b.pillar(x, 0, z, 3.7, .36);
      b.obstacle(x, z, .5, .5, 0, 4.2);
    }
    b.box(x, 3.95, -4.5, .35, .35, 15, PALETTE.wood[1], 'wood');
  }
  for (let z = -11; z <= 2; z += 3.25) b.box(-12.15, 3.95, z, 5.7, .34, .35, PALETTE.wood[0], 'wood');
  // Rotated gable roof is built as three short overlapping pavilions.
  for (const z of [-9, -4.5, 0]) b.roof(-12.15, 4.25, z, 6.7, 5.2, 1.05);
  b.cameraBounds.push(new THREE.Box3(new THREE.Vector3(-15.5, 3.7, -12), new THREE.Vector3(-8.8, 5.8, 3)));
  for (let x = -21; x <= 21; x += 3) {
    b.box(x, 1.15, -20, 2.94, 2.3, .8, PALETTE.ochre, 'stone');
    b.box(x, .3, -19.88, 2.94, .6, 1, PALETTE.stone[Math.abs(x) % 4]);
    b.box(x, 2.4, -20, 3.1, .25, 1.1, PALETTE.roof[0], 'roof');
  }
  b.obstacle(0, -20, 45, 1.1, 0, 2.6);
  // The leaning ancient tree is framed by the entrance, matching the first
  // observation task. Its exclusion ends at z=1.95, clear of the z=4.5 route.
  b.tree(0, -.5, 1.3, true);
  b.tree(14, -8, .95);
  b.tree(-21, -13, .95);
  b.tree(22, 7, .85);
  for (const p of [[-20, 11], [19, 13], [14, -9], [-20, -6]]) b.garden(...p, 5, 5);
  for (const x of [-9.2, 9.2]) b.lantern(x, 12);
  // Low ochre side wall and stone bench form the quiet ancient-tree alcove.
  for (let z = -16; z <= -3; z += 2.6) {
    b.box(21.5, 1.1, z, .75, 2.2, 2.55, PALETTE.ochre);
    b.box(21.5, 2.3, z, 1.1, .2, 2.65, PALETTE.roof[1], 'roof');
  }
  b.obstacle(21.5, -9.5, 1.1, 15.6, 0, 2.5);
}

function sandstoneGrotto(b) {
  b.path([[0, 22], [0, 7]], 3.8, true);
  b.path([[-16, -2], [-16, 7], [0, 7], [15, 7], [15, 2]], 2.8, true);
  // A recessed facade; the central dark niche remains behind the giant figure.
  b.box(0, 10.7, -18.5, 47, 21.4, 5, PALETTE.sand[2]);
  b.obstacle(0, -18.5, 47, 5, 0, 23);
  b.box(0, 11, -15.92, 13.6, 18, .16, '#706854');
  for (let row = 0; row < 12; row++) for (const side of [-1, 1]) {
    const x = side * (8.5 + (row % 3) * .26);
    b.box(x, .8 + row * 1.8, -14.8, 3.1, 1.87, 3.2, PALETTE.sand[(row + (side > 0 ? 1 : 0)) % 4]);
  }
  for (let i = -3; i <= 3; i++) b.box(i * 2.1, 21.7 + (3 - Math.abs(i)) * .45, -15, 2.18, 2.9, 3.4, PALETTE.sand[(i + 4) % 4]);
  // Seated monumental figure. Crisp nested blocks retain the readable pose at distance.
  b.box(0, .6, -10.9, 11, 1.2, 6.6, PALETTE.sand[2]);
  b.box(0, 1.35, -10.9, 10.2, .35, 6.1, PALETTE.sand[1]);
  b.octagon(0, 2.35, -10.9, 5, 5.45, 1.7, PALETTE.sand[0]);
  b.box(0, 3.35, -10.8, 8.8, 1.8, 4.7, PALETTE.sand[1]);
  b.box(0, 7.7, -12.2, 5.8, 7.5, 3.8, PALETTE.sand[1]);
  b.box(0, 11.2, -12.2, 6.8, 1.8, 3.85, PALETTE.sand[1]);
  for (const side of [-1, 1]) {
    b.box(side * 3.05, 4, -9.8, 3.5, 2.3, 4.0, PALETTE.sand[1]);
    b.beam([side * 3.35, 10.9, -12.3], [side * 4.05, 6.15, -10.7], 1.55, PALETTE.sand[0], 'stone', 1.7);
    b.beam([side * 4.05, 6.15, -10.7], [side * 3.2, 5.2, -8.75], 1.25, PALETTE.sand[1], 'stone', 1.4);
    b.box(side * 3.18, 4.95, -8.55, 1.3, .7, 1.7, PALETTE.sand[3]);
    for (let finger = 0; finger < 4; finger++) b.box(side * 3.2 + (finger - 1.5) * .23, 4.65, -7.95, .16, .55, .35, PALETTE.sand[0]);
  }
  b.box(0, 12.4, -12.2, 1.9, 1.1, 1.8, PALETTE.sand[0]);
  b.box(0, 14.9, -12.0, 3.4, 4.2, 2.8, PALETTE.sand[3]);
  b.box(0, 14.7, -10.55, 2.8, 3.4, .28, PALETTE.sand[1]);
  b.box(0, 14.8, -10.25, .52, 1.15, .5, PALETTE.sand[0]);
  b.box(0, 13.7, -10.23, 1.15, .12, .13, PALETTE.sand[2]);
  for (const side of [-1, 1]) {
    b.box(side * .82, 15.3, -10.3, .72, .14, .13, PALETTE.sand[2]);
    b.box(side * 1.83, 14.3, -12, .45, 2.3, .8, PALETTE.sand[0]);
  }
  b.octagon(0, 17.3, -12.1, 1.35, 1.85, 1, PALETTE.sand[2]);
  b.octagon(0, 18.02, -12.1, .6, 1.15, .6, PALETTE.sand[0]);
  // Robe folds read as long offset strips without expensive sculpted topology.
  for (let i = 0; i < 7; i++) {
    b.beam([-2.45 + i * .65, 11.6 - i * .12, -10.15], [-1.9 + i * .55, 5.1, -10.12], .17, PALETTE.sand[0], 'stone');
    b.box(-3.5 + i * 1.15, 3.25, -8.35, .15, 1.8, .12, PALETTE.sand[2]);
  }
  b.obstacle(0, -10.5, 11, 7.6, 0, 18.5);
  // Rows of small sculptural niches, framed by chunky sandstone blocks.
  for (const side of [-1, 1]) {
    const cx = side * 17;
    b.box(cx, 6.8, -12.6, 9.5, 13.6, 2.5, PALETTE.sand[0]);
    b.obstacle(cx, -12.6, 9.5, 2.5, 0, 14.4);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
      const x = cx + (col - 2) * 1.8, y = 1.1 + row * 2.45;
      b.box(x, y + .8, -11.29, 1.36, 1.9, .12, '#80735c');
      b.box(x, y, -11.13, 1.22, .2, .5, PALETTE.sand[3]);
      b.box(x, y + .53, -11.05, .7, .8, .42, PALETTE.sand[1]);
      b.box(x, y + 1.15, -11.06, .4, .44, .43, PALETTE.sand[3]);
      b.box(x, y + 1.56, -11.1, 1.15, .15, .32, PALETTE.sand[2]);
    }
  }
  // Outlying squared rocks deepen the cliff silhouette but leave side paths clear.
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? -1 : 1, x = side * (24 + b.random() * 4), h = 8 + b.random() * 16;
    b.box(x, h / 2, -16 - b.random() * 6, 2.5 + b.random() * 3, h, 4, PALETTE.sand[i % 4]);
  }
  for (const p of [[-20, 11], [20, 11], [-8, 7], [8, 7]]) b.garden(...p, 4, 3, true);
  for (const x of [-8, 8]) {
    b.box(x, .4, 7, 1, .8, 1, PALETTE.sand[2]);
    b.obstacle(x, 7, 1, 1, 0, .8);
  }
}

function hangingCliff(b) {
  // The map reference has a sheltered rock amphitheatre, staggered pinnacles
  // and green shelves. Shape those at mountain scale first, then voxelize:
  // tiny colour changes alone cannot make a flat cliff feel three-dimensional.
  const DX = 1.6, DY = 1.25, DZ = 1.6;
  const NX = 54, NY = 34, NZ = 39, X0 = -43.2, Z0 = -62.4;
  const cells = new Uint8Array(NX * NY * NZ);
  const index = (x, y, z) => (x * NZ + z) * NY + y;
  const occupied = (x, y, z) => x >= 0 && x < NX && y >= 0 && y < NY && z >= 0 && z < NZ
    && cells[index(x, y, z)];
  // Unequal lobes overlap in depth, with real saddles between the peaks. The
  // rear ridge is narrower and taller; the near shoulders wrap the temple.
  const shoulders = [[-30, -23, 12, 15, 24], [-20, -32, 16, 20, 34],
    [-6, -40, 15, 18, 39], [13, -37, 17, 21, 35], [29, -27, 13, 17, 28],
    [-13, -20, 17, 12, 26], [8, -22, 18, 12, 28]];
  const heightAt = (x, z) => Math.max(...shoulders.map(([cx, cz, rx, rz, h]) => {
    const r2 = ((x - cx + Math.sin(z * .19) * 1.2) / rx) ** 2 + ((z - cz) / rz) ** 2;
    const envelope = Math.max(0, 1 - r2);
    return h * envelope ** .72 + (Math.sin(x * .48 + z * .23) * 2.1
      + Math.sin(x * .21 - z * .43) * 1.4) * envelope;
  }));
  const gaussian = (value, center, width) => Math.exp(-(((value - center) / width) ** 2));
  const faceAt = (x, y) => {
    const shoulder = gaussian(x, -29 + y * .045, 6.5) * 11
      + gaussian(x, 29 - y * .065, 7) * 10;
    // Broad ledges above the roofs, undercut at balcony height, and a sloping
    // talus foot. Keep the timber's embedded ends in solid rock at z <= -17.
    const alcove = gaussian(x, 0, 21) * gaussian(y, 14.5, 7) * 2.4;
    const brow = gaussian(x, -2, 23) * gaussian(y, 25.5, 3.6) * 6.2;
    const toe = gaussian(y, 1, 3.8) * (1.8 + gaussian(x, -24, 9) * 2);
    const ribs = (gaussian(x, -22 + y * .12, 2.4) * 3.9
      + gaussian(x, 23 - y * .09, 2.7) * 3.4
      + gaussian(x, -7 + Math.sin(y * .19) * .8, 2.2) * 1.4
      + gaussian(x, 7 + y * .04, 1.9) * 1.2);
    const beds = Math.sin(y * .9 + x * .045) * .65
      + Math.sin(y * .32 - x * .09) * .9;
    // Narrow vertical erosion channels interrupt the horizontal sediment bands.
    const fissures = gaussian(x, -25 + y * .07, 1.3) * 2.5
      + gaussian(x, 19 + Math.sin(y * .16), 1.1) * 1.8;
    return -15.3 + shoulder - alcove + brow + toe + ribs + beds - fissures;
  };
  for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NZ; iz++) {
    const x = X0 + (ix + .5) * DX, z = Z0 + (iz + .5) * DZ;
    const height = heightAt(x, z);
    for (let iy = 0; iy < NY; iy++) {
      const y = (iy + .5) * DY;
      if (y <= height && z <= faceAt(x, y)) cells[index(ix, iy, iz)] = 1;
    }
  }

  const rockColors = ['#a18b70', '#b49c7e', '#c6ae8e', '#bfaa8e', '#d3bea1', '#927e66'];
  const surface = new Map();
  const sides = [
    [[1,0,0], [[1,0,1],[1,0,0],[1,1,0],[1,1,1]]],
    [[-1,0,0], [[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],
    [[0,1,0], [[0,1,1],[1,1,1],[1,1,0],[0,1,0]]],
    [[0,-1,0], [[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],
    [[0,0,1], [[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],
    [[0,0,-1], [[1,0,0],[0,0,0],[0,1,0],[1,1,0]]],
  ];
  const topCells = [];
  for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NZ; iz++) {
    let runStart = -1;
    for (let iy = 0; iy <= NY; iy++) {
      const solid = occupied(ix, iy, iz);
      if (solid && runStart < 0) runStart = iy;
      if (!solid && runStart >= 0) {
        // Every occupied column is closed, including its rear and underside.
        // Collision runs follow exactly the same occupied cells as the mesh.
        b.cameraBounds.push(new THREE.Box3(
          new THREE.Vector3(X0 + ix * DX, runStart * DY, Z0 + iz * DZ),
          new THREE.Vector3(X0 + (ix + 1) * DX, iy * DY, Z0 + (iz + 1) * DZ)));
        runStart = -1;
      }
      if (!solid) continue;
      for (const [normal, corners] of sides) {
        if (occupied(ix + normal[0], iy + normal[1], iz + normal[2])) continue;
        // The flat underside is emitted as closed strips below, avoiding a
        // pair of invisible triangles for every individual ground voxel.
        if (iy === 0 && normal[1] === -1) continue;
        const top = normal[1] === 1;
        const wx = X0 + (ix + .5) * DX, wz = Z0 + (iz + .5) * DZ;
        const colorNoise = Math.sin(iy * .72 + wx * .045 + wz * .025)
          + Math.sin(ix * 1.7 + iz * 2.3) * .16;
        // Green collects on horizontal shelves and rear slopes, while the
        // sheltered, vertical rock around the buildings remains exposed.
        const shelfLip = normal[1] === 0 && !occupied(ix, iy + 1, iz);
        const moss = (top || shelfLip) && iy > 3 && (wz < -23 || Math.abs(wx) > 24)
          && Math.sin(ix * .41 + iz * .57) + Math.cos(iz * .29) > -.3;
        const color = moss ? PALETTE.leaf[(ix + iz) % 3]
          : rockColors[Math.max(0, Math.min(4, Math.floor(2.4 + colorNoise * 1.65)))];
        // Baked local contact shading describes recess depth even on devices
        // using a small shadow map. Real directional shadows still sit on top.
        let cover = 0;
        for (let up = 1; up <= 4; up++) if (occupied(ix + normal[0], iy + up, iz + normal[2])) cover++;
        const shade = normal[1] < 0 ? .63 : top ? 1 : 1 - cover * .065;
        const shaded = new THREE.Color(color).multiplyScalar(shade);
        // Moss is the colour of a solid rock face, not a separate leaf mesh.
        const key = `${color}:${shade}`;
        if (!surface.has(key)) surface.set(key, { position: [], normal: [], uv: [], indices: [], color: shaded, material: 'stone' });
        const out = surface.get(key), first = out.position.length / 3;
        corners.forEach(([cx, cy, cz], j) => {
          out.position.push(X0 + (ix + cx) * DX, (iy + cy) * DY, Z0 + (iz + cz) * DZ);
          out.normal.push(...normal);
          out.uv.push(j === 1 || j === 2 ? 1 : 0, j > 1 ? 1 : 0);
        });
        out.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
        if (top) topCells.push({ x: X0 + (ix + .5) * DX, y: (iy + 1) * DY, z: Z0 + (iz + .5) * DZ });
      }
    }
  }
  for (const out of surface.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
    geometry.setIndex(out.indices);
    b.add(geometry, out.color, out.material);
  }
  // Footprint strips only obstruct ground movement where rock reaches the floor.
  for (let ix = 0; ix < NX; ix++) {
    const zs = Array.from({length: NZ}, (_, iz) => iz).filter(iz => occupied(ix, 0, iz));
    if (!zs.length) continue;
    b.colliders.push({minX: X0 + ix * DX - CLEARANCE, maxX: X0 + (ix + 1) * DX + CLEARANCE,
      minZ: Z0 + zs[0] * DZ - CLEARANCE, maxZ: Z0 + (zs.at(-1) + 1) * DZ + CLEARANCE});
    let start = -1;
    for (let iz = 0; iz <= NZ; iz++) {
      if (occupied(ix, 0, iz)) { if (start < 0) start = iz; }
      else if (start >= 0) {
        const underside = new THREE.PlaneGeometry(DX, (iz - start) * DZ);
        underside.rotateX(Math.PI / 2);
        underside.translate(X0 + (ix + .5) * DX, 0, Z0 + (start + iz) * DZ / 2);
        b.add(underside, '#75634f');
        start = -1;
      }
    }
  }

  // Small windswept pines rooted on real ledges, not floating decorative crowns.
  const pine = (x, y, z, scale) => {
    b.beam([x,y,z], [x + .4 * scale,y + 3.7 * scale,z], .35 * scale, PALETTE.wood[1]);
    for (let tier = 0; tier < 3; tier++) {
      const cy = y + (2.2 + tier * .85) * scale, spread = (2.7 - tier * .58) * scale;
      for (let j = -1; j <= 1; j++) b.box(x + j * spread * .36, cy + j * .1, z + (tier % 2 ? .25 : -.1) * scale,
        spread * .73, .65 * scale, spread * .74, PALETTE.leaf[(tier + j + 3) % 4], 'foliage');
    }
    b.cameraBounds.push(new THREE.Box3(new THREE.Vector3(x - 1.6 * scale,y,z - 1.3 * scale),
      new THREE.Vector3(x + 1.6 * scale,y + 4.6 * scale,z + 1.3 * scale)));
  };
  for (const [x, z, scale] of [[-32,-15,.95],[-25,-24,.75],[-35,-29,.8],[30,-14,.85],
    [34,-23,.8],[20,-33,.7],[-5,-39,.8],[29,-34,.65],[-22,-39,.85],
    [4,-46,.7],[14,-46,.75],[-15,-49,.65],[-37,-23,.65],[36,-29,.7]]) {
    const ledge = topCells.filter(p => Math.abs(p.x - x) < 1.5 && Math.abs(p.z - z) < 1.5)
      .sort((a,c) => (a.x-x)**2+(a.z-z)**2 - ((c.x-x)**2+(c.z-z)**2))[0];
    if (ledge) pine(ledge.x, ledge.y, ledge.z, scale);
  }
  // Clumps root into the occupied top cells. Broad gaps preserve readable rock
  // strata and avoid turning the mountain into a uniform green hemisphere.
  for (const p of topCells) {
    if (p.y < 4 || (p.z > -23 && Math.abs(p.x) < 24) || b.random() > .045) continue;
    const size = .65 + b.random() * .75;
    b.box(p.x, p.y + size * .25, p.z, size * 1.35, size * .65, size,
      PALETTE.leaf[Math.floor(b.random() * 4)], 'foliage');
  }
  b.root.userData.cliff = {solid: true, cellSize: [DX,DY,DZ], profile: 'layered amphitheatre, eroded ribs and staggered rear peaks'};
}

function hangingTemple(b) {
  b.path([[0, 22], [0, 7]]);
  b.path([[-16, 0], [-16, 7], [0, 7], [16, 7], [16, 0]], 3);
  hangingCliff(b);
  b.flight = {bounds: {minX: -49, maxX: 49, minZ: -68, maxZ: 29, minY: 1.6, maxY: 46}};
  // Elevated rooms are viewed from below; no false ground-level entrances.
  for (const [x, z, w, base, levels] of [[-14, -10.8, 7.5, 5.7, 2], [0, -10, 8.6, 8.1, 3], [14, -10.8, 7.4, 11.2, 2]]) {
    for (let level = 0; level < levels; level++) {
      const y = base + level * 3.55;
      b.box(x, y, z, w + 1, .35, 4.6, PALETTE.wood[0], 'wood');
      // Back landings and embedded timber ties visibly attach the pavilions to
      // the recess; side views from the cloud never reveal a detached facade.
      b.box(x, y, z - 3.8, w - .4, .28, 3.4, PALETTE.wood[1], 'wood');
      for (const dx of [-w * .3, 0, w * .3]) {
        b.box(x + dx, y - .22, z - 2.7, .28, .34, 6.6, PALETTE.wood[0], 'wood');
      }
      b.box(x, y + 1.35, z - .8, w - .7, 2.7, 2.4, level % 2 ? PALETTE.ochre : PALETTE.red, 'wood');
      for (let k = 0; k < 4; k++) {
        const px = x - w / 2 + k * w / 3;
        b.pillar(px, y, z + 1.8, 2.55, .26, true);
        for (let bracket = 0; bracket < 3; bracket++) {
          b.box(px, y + 2.47 + bracket * .14, z + 1.88 + bracket * .12,
            .72 - bracket * .12, .14, .46 + bracket * .18, PALETTE.wood[(bracket + 1) % 3], 'wood');
        }
        if (k < 3) {
          b.box(px + w / 6, y + 1.55, z + .45, w / 3 - .5, 1.55, .1, PALETTE.wood[3], 'wood');
          for (let bar = -.4; bar <= .4; bar += .2) b.box(px + w / 6 + bar, y + 1.55, z + .55, .07, 1.5, .1, PALETTE.wood[2], 'wood');
        }
      }
      b.railing(x, y, z + 2.1, w, true, true);
      b.roof(x, y + 2.9, z, w + 1.8, 5.6, 1.1, level === levels - 1
        ? ['#7e7160', '#9b8866', '#b6a079', '#655e51'] : PALETTE.roof);
      b.cameraBounds.push(new THREE.Box3(new THREE.Vector3(x - w / 2 - 1.3, y - .4, z - 6),
        new THREE.Vector3(x + w / 2 + 1.3, y + 4.7, z + 3.3)));
    }
    for (const ox of [-w / 2 + .7, w / 2 - .7]) {
      b.beam([x + ox, .1, z + 1.3], [x + ox, base - .2, z + 1.3], .25, PALETTE.wood[0]);
      b.beam([x + ox, base - 3.3, z + 1.2], [x + ox, base - .1, z + 2.1], .19, PALETTE.wood[2]);
    }
    // Exclude the space under elevated buildings so held staff never crosses posts.
    b.obstacle(x, z, w + 1, 5.6, 0, base);
  }
  // Connecting galleries follow the cliff in shallow rises; deliberately inaccessible.
  for (const [x1, x2, y1, y2] of [[-10, -4.8, 6.0, 8.1], [4.8, 10, 8.1, 11.2]]) {
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const t = (i + .5) / segments, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      b.box(x, y, -10, (x2 - x1) / segments + .04, .18, 2.7, PALETTE.wood[i % 3], 'wood');
      b.box(x, y + .65, -8.7, .12, 1.2, .12, PALETTE.red, 'wood');
    }
    b.beam([x1, y1 + 1.2, -8.7], [x2, y2 + 1.2, -8.7], .15, PALETTE.red);
    b.obstacle((x1 + x2) / 2, -10, x2 - x1, 2.7, 0, Math.max(y1, y2) + 1.3);
  }
  // Broken low retaining wall, visible from the lookout with no traversal ambiguity.
  for (const side of [-1, 1]) {
    for (let z = -3; z <= 11; z += 2) b.box(side * 22.5, .45, z, .7, .9, 1.92, PALETTE.stone[Math.abs(z) % 4]);
    b.obstacle(side * 22.5, 4, .7, 16, 0, 1);
    b.tree(side * 25, 13, .8);
    b.cameraBounds.push(new THREE.Box3(new THREE.Vector3(side * 25 - 4, 0, 9),
      new THREE.Vector3(side * 25 + 4, 8.5, 17)));
    // Eroded talus at the shoulders breaks the straight cliff/ground seam.
    for (let i = 0; i < 5; i++) {
      const x = side * (21.3 + i * 2.25), z = -5.6 - i * .85;
      const w = 2.1 + (i % 3) * .55, h = .8 + (i % 3) * .65, d = 2.1;
      b.box(x, h * .5, z, w, h, d, PALETTE.sand[(i + 1) % 4]);
      b.box(x + side * .3, h + .1, z, w * .65, .2, d * .7, PALETTE.leaf[i % 4], 'foliage');
      b.obstacle(x, z, w, d, 0, h + .2);
    }
  }
  for (const p of [[-9, 10], [9, 10], [-20, -3], [20, -3]]) b.garden(...p, 4, 3);
  // Irregular grass-covered foothills blend the rock into the valley. These
  // stay outside the ground observation route, but remain solid when flying.
  for (const side of [-1, 1]) for (let i = 0; i < 10; i++) {
    const x = side * (28 + (i % 3) * 3.1), z = -4 + Math.floor(i / 3) * 5.4;
    const w = 3.4 + b.random() * 1.8, d = 4 + b.random() * 2;
    const h = 1.1 + b.random() * 2.5 + (i < 3 ? 1.1 : 0);
    b.box(x, h / 2, z, w, h, d, PALETTE.sand[i % 4]);
    b.box(x, h + .12, z, w + .05, .24, d + .05, PALETTE.leaf[i % 4], 'foliage');
    b.obstacle(x, z, w + .05, d + .05, 0, h + .24);
    if (i % 2 === 0) {
      b.box(x + .2, h + .6, z, 1.6, 1, 1.4, PALETTE.leaf[(i + 1) % 4], 'foliage');
      b.cameraBounds.push(new THREE.Box3(new THREE.Vector3(x - .6, h, z - .7),
        new THREE.Vector3(x + 1, h + 1.1, z + .7)));
    }
  }
}

function timberPagoda(b) {
  const x = 0, z = -8;
  b.path([[0, 22], [0, 4]], 3.8);
  b.path([[-17, -6], [-17, 5], [0, 5], [17, 5], [17, -6]], 3);
  b.octagon(x, .35, z, 7, 7.3, .7, PALETTE.stone[2]);
  b.octagon(x, .8, z, 6.9, 6.9, .2, PALETTE.stone[1]);
  for (let level = 0; level < 5; level++) {
    const base = 1 + level * 4.5, radius = 5.5 - level * .53, height = 3.25;
    const wallRadius = radius - .5;
    b.octagon(x, base + height / 2, z, wallRadius, wallRadius, height,
      level === 0 ? PALETTE.red : PALETTE.wood[0], 'wood');
    b.octagon(x, base + .1, z, radius + .4, radius + .4, .26, PALETTE.wood[2], 'wood');
    for (let face = 0; face < 8; face++) {
      const a = face * Math.PI / 4;
      const faceWidth = 2 * radius * Math.sin(Math.PI / 8);
      const faceDistance = radius * Math.cos(Math.PI / 8);
      const fx = Math.sin(a) * faceDistance, fz = z + Math.cos(a) * faceDistance;
      const forward = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      for (const side of [-1, 1]) {
        const px = fx + Math.cos(a) * side * faceWidth * .46;
        const pz = fz - Math.sin(a) * side * faceWidth * .46;
        b.pillar(px, base, pz, height - .1, .28, level === 0);
        b.box(px, base + height + .1, pz, .9, .22, .65, PALETTE.wood[2], 'wood', a);
        b.box(px, base + height + .35, pz, .55, .2, 1.1, PALETTE.wood[1], 'wood', a);
      }
      b.box(fx, base + 1.8, fz, faceWidth * .55, 1.9, .12, PALETTE.wood[3], 'wood', a);
      for (let i = -2; i <= 2; i++) {
        b.box(fx + Math.cos(a) * i * .25 + forward.x * .09, base + 1.8,
          fz - Math.sin(a) * i * .25 + forward.z * .09, .08, 1.8, .1, PALETTE.wood[2], 'wood', a);
      }
      if (level > 0) {
        b.box(fx + forward.x * .5, base + 1.0, fz + forward.z * .5, faceWidth + .2, .14, .14, PALETTE.wood[2], 'wood', a);
        for (let i = -3; i <= 3; i++) b.box(fx + Math.cos(a) * i * faceWidth / 7 + forward.x * .5,
          base + .58, fz - Math.sin(a) * i * faceWidth / 7 + forward.z * .5, .11, .95, .11, PALETTE.wood[1], 'wood');
      }
    }
    // Each storey has a full octagonal stepped eave; broad lower storey anchors scale.
    const roofRadius = radius + 1.4;
    for (let row = 0; row < 6; row++) {
      const rr = roofRadius - row * .29, yy = base + height + .42 + row * .18;
      b.octagon(x, yy, z, rr - .12, rr, .22, PALETTE.roof[row % 4], 'roof');
      for (let face = 0; face < 8; face++) {
        const a = face * Math.PI / 4 + Math.PI / 8;
        b.box(Math.sin(a) * rr, yy + .16, z + Math.cos(a) * rr, .2, .17, .5, PALETTE.roof[2], 'roof', a);
      }
    }
    // Small raised corner tips emphasize the Chinese eave silhouette.
    for (let face = 0; face < 8; face++) {
      const a = face * Math.PI / 4 + Math.PI / 8;
      for (let k = 0; k < 3; k++) b.box(Math.sin(a) * (roofRadius + k * .17), base + height + .5 + k * .13,
        z + Math.cos(a) * (roofRadius + k * .17), .24, .19, .55, PALETTE.roof[1], 'roof', a);
    }
    if (level === 0) {
      // Ground porch has no walkable stairs: the visiting route circles its plinth.
      b.box(0, 2.15, z + radius * Math.cos(Math.PI / 8) + .12, 1.7, 2.6, .18, PALETTE.wood[3], 'wood');
    }
  }
  b.octagon(0, 24.3, z, .55, 1.6, 1.2, PALETTE.roof[1], 'roof');
  b.octagon(0, 25.1, z, .2, .55, .7, PALETTE.gold, 'metal');
  b.box(0, 25.8, z, .13, .9, .13, PALETTE.gold, 'metal');
  b.obstacle(0, z, 15.4, 15.4, 0, 26.4);
  for (const side of [-1, 1]) {
    b.tree(side * 22, -15, 1.1);
    b.tree(side * 23, 13, .9);
    b.lantern(side * 7, 12);
    b.garden(side * 12.5, 10, 4, 5);
    // Low auxiliary shrine frames the pagoda without competing with its height.
    b.hall(side * 20, -20, 6, 4, 0, 2.5, true);
    b.obstacle(side * 20, -20, 7, 5, 0, 6);
  }
}

const SCENES = {
  shisi: { build: mountainTemple, points: [[0, 0, 15], [-17, 0, 0], [17, 0, 1]],
    theme: { sky: '#c4d8d7', fog: '#c6d8ca', sun: '#ffe2ad' } },
  yungang: { build: sandstoneGrotto, points: [[0, 0, 15], [-16, 0, -2], [15, 0, 2]],
    theme: { sky: '#c9dbde', fog: '#d7c8af', sun: '#ffe4ba' } },
  xuankong: { build: hangingTemple, points: [[0, 0, 15], [-16, 0, 0], [16, 0, 0]],
    theme: { sky: '#b6cacf', fog: '#bdc8c4', sun: '#ffe0ae' } },
  yingxian: { build: timberPagoda, points: [[0, 0, 15], [-17, 0, -6], [17, 0, -6]],
    theme: { sky: '#bcd6e3', fog: '#c8d8cd', sun: '#ffdfab' } },
  dule: { build: duleTemple, points: [[0, 0, 15], [-16, 0, 0], [16, 0, 0]],
    theme: { sky: '#c3d8dd', fog: '#c9d8c7', sun: '#ffe4b6' } },
  foguang: { build: foguangTemple, points: [[0, 0, 15], [-16, 0, 0], [16, 0, 0]],
    theme: { sky: '#c3d7d0', fog: '#ced5ba', sun: '#ffe0a4' } },
  xiaoxitian: { build: xiaoxitianTemple, points: [[0, 0, 15], [-16, 0, 0], [16, 0, 0]],
    theme: { sky: '#c2d5dc', fog: '#d4ccb7', sun: '#ffe0ad' } },
  shuilu: { build: shuiluTemple, points: [[0, 0, 15], [-16, 0, 0], [16, 0, 0]],
    theme: { sky: '#c4dce0', fog: '#c4d7c9', sun: '#ffe6c1' } },
  kaiyuan: { build: kaiyuanTowers, points: [[0, 0, 15], [-16, 0, 0], [16, 0, 0]],
    theme: { sky: '#b7d5e4', fog: '#cadbd7', sun: '#fff0ce' } },
};

/**
 * Create a fresh disposable scene. Collision rectangles already include 1.65m
 * staff clearance; do not expand them again. cameraBounds have physical sizes.
 * No ground mesh, animation loop, lights, controls, textures or network requests.
 */
export function createJourneyScene(id) {
  const config = SCENES[id];
  if (!config) throw new RangeError(`Unknown heritage journey scene: ${id}`);
  const builder = new SceneBuilder(id);
  config.build(builder);
  builder.finish();
  // New map compositions include authored hills outside the walking courtyard.
  // Frame the whole diorama in the local map; movement keeps its own bounds.
  const extent = builder.landmarks ? new THREE.Box3().setFromObject(builder.root) : null;
  const mapBounds = extent ? {minX: Math.min(-24, Math.floor(extent.min.x)),
    maxX: Math.max(24, Math.ceil(extent.max.x)), minZ: Math.min(-25, Math.floor(extent.min.z)),
    maxZ: Math.max(25, Math.ceil(extent.max.z))} : null;
  return { root: builder.root, colliders: builder.colliders, cameraBounds: builder.cameraBounds,
    surfaces: builder.surfaces, interiors: builder.interiors,
    bounds: {minX:-24,maxX:24,minZ:-25,maxZ:25},
    spawn: [0, 0, 20], points: config.points.map((position, i) => ({ id: `${id}-${i + 1}`, position: [...position] })),
    theme: { ...config.theme },
    landmarks: builder.landmarks,
    mapBounds,
    flight: builder.flight ? { ...builder.flight, obstacles: builder.cameraBounds } : null,
    flightObstacles: builder.flight ? builder.cameraBounds : [] };
}
