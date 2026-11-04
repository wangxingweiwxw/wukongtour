import * as THREE from 'three';
import { enterablePlatform, interiorObstacle } from './journey-interiors.js';

// Map-inspired architectural compositions, not surveyed replicas. Courtyard
// routes connect to the ground-storey halls through modelled stone stairways.
const C = {
  stone: ['#b5aa91', '#ccbea2', '#968c76', '#ded0b4'],
  rock: ['#a59476', '#b6a183', '#c5b191', '#8d8269'],
  wood: ['#56402e', '#7c5035', '#9b7045', '#382d25'],
  roof: ['#56615d', '#69726a', '#8e9481', '#424d49'],
  red: '#a35038', ochre: '#c9a776', leaf: ['#5f7d40', '#82954e', '#a1ac65', '#47673c'],
};

function cameraBox(b, x, y, z, w, h, d) {
  b.cameraBounds.push(new THREE.Box3(new THREE.Vector3(x-w/2,y,z-d/2),
    new THREE.Vector3(x+w/2,y+h,z+d/2)));
}

function lattice(b, x, y, z, w, h, red = false) {
  b.box(x,y,z,w,h,.16,C.wood[3],'wood');
  for(let offset=-w/2+.15;offset<w/2;offset+=.28)
    b.box(x+offset,y,z+.12,.07,h-.18,.12,red?C.red:C.wood[2],'wood');
  for(const dy of [-h*.32,h*.32]) b.box(x,y+dy,z+.14,w,.09,.13,C.wood[2],'wood');
}

function brackets(b, x, y, z, width = .8) {
  for(let layer=0;layer<3;layer++) {
    b.box(x,y+layer*.19,z+layer*.16,width+layer*.22,.19,.5+layer*.22,C.wood[(layer+1)%3],'wood');
    b.box(x,y+layer*.19+.08,z+layer*.16,.24,.15,1+layer*.28,C.wood[0],'wood');
  }
}

function pine(b,x,y,z,s=1) {
  b.beam([x,y,z],[x+s*.55,y+s*5,z],s*.5,C.wood[0]);
  b.beam([x+s*.3,y+s*3,z],[x-s*2,y+s*4.2,z+.3],s*.26,C.wood[1]);
  for(let tier=0;tier<3;tier++) for(let branch=-1;branch<=1;branch++) {
    const span=(3.1-tier*.65)*s;
    b.box(x+branch*span*.45+tier*s*.2,y+(3.5+tier*.85)*s,z+(tier%2?.3:-.25)*s,
      span,.8*s,span*.8,C.leaf[(tier+branch+4)%4],'foliage');
  }
  b.obstacle(x,z,1.1*s,1.1*s,y,y+6*s);
  cameraBox(b,x,y+3*s,z,5*s,3*s,3*s);
}

function ridge(b,{center=-34,height=15,lush=true}={}) {
  // Sample a connected, asymmetric heightfield on a small voxel grid. Only
  // exposed top/side/underside surfaces are emitted: there are no nested boxes
  // or five giant rectangular terraces hidden inside the mountain.
  const STEP=1.8, RISE=1.05, NX=46, NZ=25, X0=-41.4, Z0=center-22.5;
  const lobes=[[-30,center+4,11,12,height*.69],[-18,center-2,13,14,height],
    [-3,center-6,12,14,height*.83],[13,center-3,14,15,height*.91],
    [29,center+3,10,12,height*.7]];
  const heights=new Float32Array(NX*NZ);
  const sample=(ix,iz)=>ix<0||iz<0||ix>=NX||iz>=NZ?0:heights[ix*NZ+iz];
  for(let ix=0;ix<NX;ix++)for(let iz=0;iz<NZ;iz++) {
    const x=X0+(ix+.5)*STEP,z=Z0+(iz+.5)*STEP;
    let peak=0;
    for(const [cx,cz,rx,rz,h] of lobes) {
      const dx=x-cx+Math.sin(z*.29)*1.3;
      const dz=z-cz+Math.sin(x*.21)*1.2;
      const envelope=Math.max(0,1-(dx/rx)**2-(dz/rz)**2);
      const relief=(Math.sin(x*.43+z*.31)*1.25+Math.cos(x*.22-z*.39)*.9)*envelope;
      peak=Math.max(peak,h*envelope**.78+relief);
    }
    // Shallow gullies split the front into rock shoulders and grassy saddles.
    const gully=Math.exp(-(((x+7+Math.sin(z*.28)*2)/2.3)**2))*1.7
      +Math.exp(-(((x-22+Math.sin(z*.22))/1.8)**2))*1.3;
    heights[ix*NZ+iz]=Math.max(0,Math.floor((peak-gully)/RISE)*RISE);
  }
  const surfaces=new Map();
  function quad(corners,normal,color) {
    const key=color+normal.join(',');
    if(!surfaces.has(key))surfaces.set(key,{positions:[],normals:[],uv:[],indices:[],color});
    const out=surfaces.get(key),first=out.positions.length/3;
    for(let i=0;i<4;i++) {
      out.positions.push(...corners[i]);out.normals.push(...normal);
      out.uv.push(i===1||i===2?1:0,i>1?1:0);
    }
    out.indices.push(first,first+1,first+2,first,first+2,first+3);
  }
  for(let ix=0;ix<NX;ix++)for(let iz=0;iz<NZ;iz++) {
    const h=sample(ix,iz);if(!h)continue;
    const x0=X0+ix*STEP,x1=x0+STEP,z0=Z0+iz*STEP,z1=z0+STEP;
    const green=lush&&Math.sin(ix*.38+iz*.22)+Math.cos(iz*.44-ix*.13)>-.35;
    quad([[x0,h,z1],[x1,h,z1],[x1,h,z0],[x0,h,z0]],[0,1,0],
      green?C.leaf[(ix+Math.floor(iz/3))%4]:C.rock[(ix+iz)%4]);
    quad([[x0,0,z0],[x1,0,z0],[x1,0,z1],[x0,0,z1]],[0,-1,0],C.rock[3]);
    const neighbours=[[-1,0], [1,0], [0,-1], [0,1]];
    for(const [dx,dz] of neighbours) {
      const floor=sample(ix+dx,iz+dz);if(floor>=h)continue;
      // Exposed side bands continue between neighbouring column heights. The
      // lip is grassy only on selected shelves; deeper faces stay stone.
      for(let low=floor;low<h-.01;low+=RISE*2) {
        const high=Math.min(h,low+RISE*2);
        const color=green&&h-high<.01&&high-low<=RISE*1.05
          ?C.leaf[(ix+iz+1)%4]:C.rock[(Math.round(low/RISE)+Math.floor(ix/5))%4];
        const corners=dx<0?[[x0,low,z0],[x0,low,z1],[x0,high,z1],[x0,high,z0]]
          :dx>0?[[x1,low,z1],[x1,low,z0],[x1,high,z0],[x1,high,z1]]
          :dz<0?[[x1,low,z0],[x0,low,z0],[x0,high,z0],[x1,high,z0]]
          :[[x0,low,z1],[x1,low,z1],[x1,high,z1],[x0,high,z1]];
        quad(corners,[dx,0,dz],color);
      }
    }
    cameraBox(b,(x0+x1)/2,0,(z0+z1)/2,STEP,h,STEP);
  }
  for(const out of surfaces.values()) {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(out.positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(out.normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(out.uv,2));
    geometry.setIndex(out.indices);b.add(geometry,out.color);
  }
  // Ground movement needs only the footprint, merged into occupied strips.
  // Camera bounds above retain every column's actual sampled height.
  for(let ix=0;ix<NX;ix++) {
    let start=-1;
    for(let iz=0;iz<=NZ;iz++) {
      if(sample(ix,iz)>0){if(start<0)start=iz;}
      else if(start>=0){
        b.colliders.push({minX:X0+ix*STEP-1.65,maxX:X0+(ix+1)*STEP+1.65,
          minZ:Z0+start*STEP-1.65,maxZ:Z0+iz*STEP+1.65});start=-1;
      }
    }
  }
  // Roots are placed on the actual sampled shelf, never on an estimated peak.
  for(const [x,z,s] of [[-29,center+3,.85],[-18,center-1,1],[-5,center-5,.75],
    [13,center-3,.85],[29,center+3,.9],[-24,center+9,.7],[22,center+9,.7]]) {
    const ix=Math.floor((x-X0)/STEP),iz=Math.floor((z-Z0)/STEP),h=sample(ix,iz);
    if(h)pine(b,X0+(ix+.5)*STEP,h,Z0+(iz+.5)*STEP,s);
  }
}

function wall(b,x,z,w,d,h=2.4) {
  b.box(x,.22,z,w+.18,.44,d+.18,C.stone[2]);
  b.box(x,h/2+.2,z,w,h,d,C.ochre);
  b.box(x,h+.25,z,w+.35,.22,d+.35,C.roof[0],'roof');
  b.box(x,h+.42,z,w+.1,.14,d+.1,C.roof[2],'roof');
  b.obstacle(x,z,w+.35,d+.35,0,h+.5);
}

function gate(b,z,width=12) {
  // A broad clear opening: column collision excludes only the two supports.
  for(const x of [-width*.4,width*.4]) {
    b.pillar(x,0,z,4.5,.65,true);
    b.obstacle(x,z,.9,.9,0,5.1);
    brackets(b,x,4.5,z+.15,1);
  }
  b.box(0,5.05,z,width,.45,.65,C.wood[0],'wood');
  b.box(0,4.58,z+.4,2.8,.9,.16,C.wood[3],'wood');
  for(let i=-1;i<=1;i++) b.box(i*.65,4.58,z+.5,.24,.4,.06,'#c5a55e','metal');
  b.roof(0,5.4,z,width+2.5,5.4,1.5,C.roof);
  cameraBox(b,0,4.7,z,width+3,2.7,5.8);
}

export function duleTemple(b) {
  b.path([[0,22],[0,5],[0,-2]],4);
  b.path([[-16,0],[0,0],[16,0]],3.2);
  gate(b,4.6,12);
  for(const side of [-1,1]) {
    wall(b,side*16,4.6,15,.8,2.45);
    wall(b,side*23.5,-7,.8,23,2.45);
  }
  wall(b,0,-23,47,.8,2.6);

  const z=-12.8,w=13.4,d=10, base=1.05, sideOffset=2.5, sideOpening=3.4;
  // Two complete floor volumes, deep open verandas, and different roof pitches
  // make the pavilion recognisable from the lower entrance and side viewpoints.
  b.box(0,.45,z,w+2,.9,d+1.5,C.stone[2]);
  b.box(0,.95,z,w+2.5,.2,d+2,C.stone[1]);
  const interior=enterablePlatform(b,{id:'dule-pavilion',z,width:w+2.5,depth:d+2,
    height:base,sideOffset,center:[0,base,z+4.1],stone:C.stone});
  for(const [floor,height] of [[base,5.15],[7.5,5]]) {
    b.box(0,floor-.06,z,w+1,.12,d+1,C.wood[0],'wood');
    b.box(0,floor+height/2,z-d/2+.5,w-.6,height,.65,C.red,'wood');
    if(floor===base) interiorObstacle(b,0,z-d/2+.5,w-.6,.65,floor,floor+height);
    for(const side of [-1,1]) {
      const xx=side*(w/2-.55);
      if(floor>2) b.box(xx,floor+height/2,z,.65,height,d-.4,C.red,'wood');
      else {
        // Two side-wall panels leave a genuine doorway aligned to the stairs.
        for(const [near,far] of [[-d/2+.2,sideOffset-sideOpening/2],
          [sideOffset+sideOpening/2,d/2-.2]]) {
          if(far<=near)continue;
          const zz=z+(near+far)/2;
          b.box(xx,floor+height/2,zz,.65,height,far-near,C.red,'wood');
          interiorObstacle(b,xx,zz,.65,far-near,floor,floor+height);
        }
        b.box(xx,floor+4.45,z+sideOffset,.65,1.4,sideOpening,C.red,'wood');
      }
    }
    for(let column=-2;column<=2;column++) {
      const x=column*w/4;
      if(floor>2||column!==0) {
        b.pillar(x,floor,z+d/2,height,.5,true);
        if(floor===base)interiorObstacle(b,x,z+d/2,.74,.74,floor,floor+height);
      }
      brackets(b,x,floor+height,z+d/2+.2,.8);
      if(column!==0) {
        lattice(b,x*.85,floor+height*.55,z+d/2-1.05,2.2,2.7,true);
        if(floor===base)interiorObstacle(b,x*.85,z+d/2-1.05,2.2,.3,floor,floor+4.2);
      }
    }
    for(const side of [-1,1]) for(const depth of [-4,0]) {
      b.pillar(side*w/2,floor,z+depth,height,.5,true);
      if(floor===base)interiorObstacle(b,side*w/2,z+depth,.74,.74,floor,floor+height);
    }
    b.box(0,floor+height+.35,z+d/2,w+.6,.4,.65,C.wood[0],'wood');
    if(floor>2) {
      b.railing(0,floor,z+d/2+.55,w+1.1,true,true);
      for(const side of [-1,1]) b.railing(side*(w/2+.55),floor,z,d+1.1,false,true);
    }
  }
  b.roof(0,6.8,z,w+4.5,d+4.3,1.3,C.roof);
  b.roof(0,13.1,z,w+4,d+4,2.6,C.roof);
  // Warm silhouette behind the ground-level column screen, an observation cue
  // for the pavilion's central space, rather than a claimed faithful statue.
  b.octagon(0,1.45,z+1.5,1.4,1.65,.7,'#ac8e59');
  b.box(0,3.15,z+1.5,1.25,2.9,.85,'#d2b16b','wood');
  b.box(0,4.95,z+1.5,.85,.85,.75,'#ddc186','wood');
  b.box(0,5.55,z+1.5,.8,.4,.7,'#b99048','wood');
  for(const side of [-1,1]) b.beam([side*.6,4.1,z+1.5],[side*.95,2.6,z+1.7],.35,'#c9a466','wood');
  interiorObstacle(b,0,z+1.5,3.3,3.3,base,5.8);
  interior.solidSamples.push([0,base,z+1.5],[0,base,z-d/2+.5],[w/2,base,z]);
  cameraBox(b,0,6.4,z,w+5,9.9,d+4.5);

  // Low paired stone guardians and a sequence of courtyard plaques.
  for(const side of [-1,1]) {
    const x=side*9.5;
    b.box(x,.35,9,1.4,.7,1.7,C.stone[2]);
    b.box(x,1,9,1,.8,1.15,C.stone[1]);
    b.box(x,1.65,9.3,.75,.75,.75,C.stone[3]);
    b.box(x,1.57,9.75,.55,.3,.35,C.stone[1]);
    b.obstacle(x,9,1.4,1.7,0,2.05);
    b.tree(side*19,-16,.8,side<0);
    b.garden(side*19,12,5,4);
  }
  ridge(b,{center:-37,height:12,lush:true});
  b.root.userData.siteComposition='Dule: open mountain gate, two-storey pavilion and walled courtyard';
  b.landmarks=[['gate','穿行山门',[0,5.4,4.6]],['pavilion','双层观音阁',[0,8,-12.8]],
    ['balcony','木构外廊',[0,8.4,-7.25]],['guardian','石狮门庭',[-9.5,1.5,9]],
    ['ridge','青绿山坡',[-18,13,-39],'landscape']];
}

export function foguangTemple(b) {
  b.path([[0,22],[0,4]],4.4);
  b.path([[-16,0],[-16,7],[16,7],[16,0]],3.4);
  const z=-13,w=25.5,d=11,base=1.05,sideOffset=2.2,sideOpening=3.2;
  // A wide, low seven-bay hall contrasts with Dule's vertical pavilion. Deep
  // eaves, spaced bracket sets and broad roof surfaces carry the composition.
  b.box(0,.45,z,w+2,.9,d+2,C.stone[2]);
  b.box(0,.965,z,w+2.6,.17,d+2.5,C.stone[1]);
  b.box(0,base-.06,z,w+1,.12,d+1,C.wood[1],'wood');
  const interior=enterablePlatform(b,{id:'foguang-hall',z,width:w+2.6,depth:d+2.5,
    height:base,sideOffset,center:[0,base,z+3.5],stone:C.stone});
  b.box(0,3.65,z-d/2+.25,w,5.3,.5,'#b58c5f','wood');
  interiorObstacle(b,0,z-d/2+.25,w,.5,base,6.3);
  for(const side of [-1,1]) {
    for(const [near,far] of [[-d/2,sideOffset-sideOpening/2],[sideOffset+sideOpening/2,d/2]]) {
      const zz=z+(near+far)/2;
      b.box(side*w/2,3.65,zz,.5,5.3,far-near,'#b58c5f','wood');
      interiorObstacle(b,side*w/2,zz,.5,far-near,base,6.3);
    }
    b.box(side*w/2,5.45,z+sideOffset,.5,1.7,sideOpening,'#b58c5f','wood');
  }
  for(let bay=-3;bay<=3;bay++) {
    const x=bay*3.75;
    if(bay!==0) {
      b.pillar(x,base,z+d/2,4.6,.65,true);
      interiorObstacle(b,x,z+d/2,.89,.89,base,6);
    }
    brackets(b,x,5.8,z+d/2+.2,1.3);
    if(bay===0) {
      // Open leaves stand along the jambs, leaving the central approach clear.
      for(const s of [-1,1]) {
        b.box(s*1.7,3.1,z+d/2-.8,.18,3.8,1.4,C.wood[1],'wood');
        interiorObstacle(b,s*1.7,z+d/2-.8,.18,1.4,base,5);
      }
    } else {
      lattice(b,x,3.3,z+d/2-.45,2.75,3.25);
      interiorObstacle(b,x,z+d/2-.45,2.75,.3,base,5.5);
    }
  }
  for(const side of [-1,1]) for(let depth=-4.4;depth<=4.5;depth+=4.4) {
    b.pillar(side*w/2,1.05,z+depth,4.6,.65,true);
    interiorObstacle(b,side*w/2,z+depth,.89,.89,base,6);
    brackets(b,side*w/2,5.8,z+depth,1.15);
  }
  b.box(0,6.15,z+d/2,w+1,.5,.75,C.wood[0],'wood');
  b.box(0,6.44,z,w+1,.22,d+1,C.wood[0],'wood');
  b.roof(0,6.65,z,w+6,d+6,2.65,['#545c53','#657062','#7b846e','#444f47']);
  // Deep overhang brackets and layered cornice remain visible from either side.
  for(const side of [-1,1]) {
    b.box(side*(w/2+.8),6.6,z,.32,.3,d+2,C.wood[2],'wood');
    for(let beam=-4;beam<=4;beam++) b.box(beam*3.1,6.62,z, .24,.28,d+3,C.wood[1],'wood');
  }
  // A shallow timber altar gives the newly accessible interior a destination.
  b.box(0,base+.45,z-3.9,17,.9,1.5,C.wood[0],'wood');
  b.box(0,base+.94,z-3.9,17.5,.14,1.7,C.wood[2],'wood');
  interiorObstacle(b,0,z-3.9,17.5,1.7,base,base+1.01);
  interior.solidSamples.push([0,base,z-3.9],[0,base,z-d/2+.25],[w/2,base,z]);
  cameraBox(b,0,6.4,z,w+6.4,3.4,d+6.4);

  // Stone dharani-pillar-inspired markers frame the forecourt without filling
  // the main approach. Faceted shafts and stacked caps offer another silhouette.
  for(const [x,zz,scale] of [[-9.8,1.8,1],[10.5,2.5,.87]]) {
    b.octagon(x,.25,zz,1.1,1.25,.5,C.stone[2]);
    b.octagon(x,2.25*scale,zz,.48,.58,3.9*scale,C.stone[1]);
    b.octagon(x,4.35*scale,zz,.95,1.02,.25,C.stone[3]);
    b.octagon(x,4.65*scale,zz,.35,.85,.4,C.stone[0]);
    b.octagon(x,5.02*scale,zz,.16,.35,.4,C.stone[1]);
    for(let row=0;row<7;row++) for(const side of [-1,1])
      b.box(x+side*.22,1+row*.4*scale,zz+.55,.13,.16,.035,'#857c6a');
    b.obstacle(x,zz,2.5,2.5,0,5.3*scale);
  }
  // The outer foreground is kept open; side walls end behind the side stops.
  for(const side of [-1,1]) {
    wall(b,side*22,-14,.75,17,2.1);
    b.tree(side*20,11,.85,side<0);
    b.garden(side*20,5,4,5);
    b.garden(side*7,12,4,4);
    b.lantern(side*5.4,11.4);
  }
  ridge(b,{center:-35,height:16,lush:true});
  pine(b,-28,0,-7,1.4);
  pine(b,28,0,-9,1.2);
  b.root.userData.siteComposition='Foguang: broad low hall, deep eaves, stone pillars and pine-covered hillside';
  b.landmarks=[['hall','宽檐大殿',[0,6.65,-13]],['brackets','檐下斗拱',[-11.25,6,-7.3]],
    ['stone-pillar','院前石幢',[-9.8,3,1.8]],['pine','山侧古松',[-28,6,-7],'landscape'],
    ['ridge','松林山脊',[-18,17,-37],'landscape']];
}
