import { enterablePlatform, interiorObstacle } from './journey-interiors.js';
import { addPlaqueFace } from './architectural-plaque.js';

// Map-inspired observation spaces, intentionally authored as original scenes.
// Each opens toward +Z; the observation stops remain on the valley floor.
const C = {
  rock: ['#aaa18c', '#c7b89b', '#b5a487', '#958a75'],
  stone: ['#a8aaa0', '#c2c3b6', '#92998f', '#d0cdbd'],
  leaf: ['#708342', '#8e9b50', '#acb068', '#556f3f'],
  roof: ['#535e59', '#738073', '#8a9080', '#46534c'],
  red: '#984b3b', dark: '#3d382b', wood: '#6e4b31', cream: '#d9c7a0',
  gold: ['#b48738', '#d2ab5b', '#e0c57c', '#91703b'],
  pigment: ['#ac674b', '#70978b', '#b09d61', '#687e88'],
};

function approach(b) {
  b.path([[0, 22], [0, 7]], 3.7);
  b.path([[-16, 0], [-16, 7], [0, 7], [16, 7], [16, 0]], 3);
  for (const x of [-8, 8]) b.lantern(x, 10);
}

function hillGarden(b, variant = 0) {
  // Offset clusters and green shelves produce a broken hill silhouette instead
  // of a rectangular scenic wall. All tall rock remains behind the buildings.
  for (let i = 0; i < 18; i++) {
    const x = -30 + i * 3.5, z = -29 - Math.sin(i * .8 + variant) * 4;
    const height = 4 + (Math.sin(i * .63 + variant) + 1) * 4;
    for (let tier = 0; tier < 3; tier++) {
      const w = 5.2 - tier * 1.3, d = 8.2 - tier * 1.6;
      const h = height / 3, y = tier * h + h / 2;
      b.box(x + tier * .34, y, z - tier * .25, w, h, d, C.rock[(i + tier) % 4]);
      b.box(x + tier * .34, y + h / 2 + .05, z - tier * .25, w, .15, d,
        C.leaf[(i + tier) % 4], 'foliage');
    }
    b.obstacle(x + .35, z, 5.9, 8.5, 0, height + .2);
  }
  for (const [x,z,s] of [[-24,-10,.9],[25,-13,1],[-24,13,.75],[23,15,.7]]) b.tree(x,z,s);
  // A loose outer grove replaces the generic environment trees. Unequal
  // heights frame the roofline without closing either observation approach.
  for (const [x,z,s] of [[-29,-18,1.1],[-32,-7,.88],[-28,4,.9],
    [30,-19,1.04],[32,-8,.82],[29,5,.95]]) b.tree(x,z,s);
  for (const [x,z] of [[-11,13],[12,13],[-21,5],[21,5]]) b.garden(x,z,4,3);
}

function openHall(b, {id, name, x=0, z=-13, width=22, depth=10, height=8, red=true}) {
  // Open side bays and three stairways connect the courtyard to the exhibition
  // floor. Collision follows the actual posts, railings and sculpture plinths.
  const base=.94, sideOffset=depth/4, sideOpening=3;
  b.box(x,.4,z,width+1,.8,depth+1,C.stone[2]);
  b.box(x,.86,z,width+1.4,.16,depth+1.4,C.stone[1]);
  b.box(x,height/2+.9,z-depth/2+.25,width,height,.5,red?C.red:C.cream,'wood');
  const interior=enterablePlatform(b,{id,x,z,width:width+1.4,depth:depth+1.4,height:base,
    sideOffset,center:[x,base,z+depth/2-1.2],stone:C.stone});
  interiorObstacle(b,x,z-depth/2+.25,width,.5,base,height+.9);
  const front=z+depth/2;
  for (const dx of [-width/2,-width/4,width/4,width/2]) {
    b.pillar(x+dx,.9,front,height-.9,.44,red);
    b.pillar(x+dx,.9,z-depth/2,height-.9,.44,red);
    for(const zz of [front,z-depth/2])interiorObstacle(b,x+dx,zz,.68,.68,base,height+.3);
    b.beam([x+dx,height,front],[x+dx,height,z-depth/2],.32,C.wood);
    for(let j=0;j<3;j++)b.box(x+dx,height-.3+j*.16,front+j*.12,1.2-j*.24,.16,.8+j*.2,C.wood,'wood');
  }
  for(const side of [-1,1]){
    b.pillar(x+side*width/2,.9,z,height-.9,.44,red);
    interiorObstacle(b,x+side*width/2,z,.68,.68,base,height+.3);
    for(const [near,far] of [[-depth/2,sideOffset-sideOpening/2],
      [sideOffset+sideOpening/2,depth/2]]) {
      if(far<=near)continue;
      const zz=z+(near+far)/2;
      b.railing(x+side*width/2,.9,zz,far-near,false,red);
      interiorObstacle(b,x+side*width/2,zz,.18,far-near,base,1.95);
    }
  }
  b.box(x,height+.16,front,width+.8,.45,.55,C.wood,'wood');
  b.box(x,height-.38,front+.28,3.2,.72,.18,C.dark,'wood');
  addPlaqueFace(b.root, {text: name, position: [x, height-.38, front+.385], width: 3.2, height: .72});
  b.roof(x,height+.5,z,width+3,depth+3,2.1,C.roof);
  interior.solidSamples.push([x,base,z-depth/2+.25],[x+width/2,base,z]);
  return interior;
}

function figure(b,x,y,z,scale,color,standing=false) {
  const s=scale;
  interiorObstacle(b,x,z,2.4*s,2.4*s,y,y+(standing?3.3:3.05)*s,.28);
  // The sculpture is volumetric: shoulders, robe, folded legs, hands and a
  // stepped head project from the shrine at visibly different depths.
  b.octagon(x,y+.15*s,z,1.02*s,1.2*s,.3*s,C.gold[3]);
  b.box(x,y+.45*s,z,1.65*s,.4*s,1.1*s,C.gold[1],'metal');
  if(standing){
    b.box(x,y+1.05*s,z,.88*s,1.15*s,.6*s,color,'sculpture');
    b.box(x,y+.6*s,z+.08,1.2*s,.45*s,.78*s,color,'sculpture');
  }else{
    b.box(x,y+.8*s,z+.14*s,1.85*s,.55*s,1.05*s,color,'sculpture');
    for(const side of [-1,1])b.box(x+side*.55*s,y+.91*s,z+.45*s,.9*s,.48*s,.8*s,C.gold[1],'sculpture');
  }
  const chest=standing?1.65:1.4;
  b.box(x,y+chest*s,z,.94*s,1.22*s,.65*s,color,'sculpture');
  b.box(x,y+(chest+.5)*s,z,1.3*s,.35*s,.72*s,color,'sculpture');
  b.box(x,y+(chest+1.05)*s,z+.08*s,.66*s,.81*s,.57*s,C.gold[2],'sculpture');
  b.box(x,y+(chest+1.5)*s,z,.55*s,.23*s,.5*s,C.gold[3],'sculpture');
  b.box(x,y+(chest+1.09)*s,z+.39*s,.13*s,.24*s,.15*s,C.gold[1],'sculpture');
  for(const side of [-1,1]){
    b.beam([x+side*.57*s,y+(chest+.4)*s,z],[x+side*.76*s,y+(chest-.35)*s,z+.45*s],.27*s,color,'sculpture');
    b.box(x+side*.63*s,y+(chest-.4)*s,z+.62*s,.32*s,.19*s,.4*s,C.gold[2],'sculpture');
    b.box(x+side*.19*s,y+(chest+1.18)*s,z+.376*s,.17*s,.045*s,.04*s,C.dark,'sculpture');
  }
  for(let k=-2;k<=2;k++)b.beam([x+k*.13*s,y+(chest+.45)*s,z+.36*s],
    [x+k*.21*s,y+.75*s,z+.55*s],.065*s,C.gold[1],'sculpture');
}

function shrineHalo(b,x,y,z,radius,color) {
  // Nested, squared arc reads as a carved aureole without a texture billboard.
  for(let i=0;i<9;i++){
    const a=i*Math.PI/8;
    b.box(x+Math.cos(a)*radius,y+Math.sin(a)*radius,z,.28,.46,.25,color,'sculpture');
  }
}

function littlePalace(b,x,y,z,scale) {
  b.box(x,y+.15*scale,z,2.4*scale,.3*scale,1.5*scale,C.gold[3],'sculpture');
  for(const dx of [-.83,.83])b.box(x+dx*scale,y+.8*scale,z+.4*scale,.18*scale,1.2*scale,.18*scale,C.gold[1],'sculpture');
  b.box(x,y+.75*scale,z-.35*scale,1.9*scale,1.1*scale,.3*scale,C.red,'sculpture');
  // Three broad cornices make miniature roofs, with no thousands of tiny tiles.
  for(let tier=0;tier<3;tier++)b.box(x,y+(1.45+tier*.25)*scale,z,
    (2.8-tier*.5)*scale,.24*scale,(1.9-tier*.65)*scale,C.gold[(tier+1)%4],'sculpture');
  b.box(x,y+2.14*scale,z,2.1*scale,.16*scale,.18*scale,C.gold[2],'sculpture');
}

export function xiaoxitianTemple(b) {
  approach(b);hillGarden(b,1);
  const interior=openHall(b,{id:'xiaoxitian-hall',name:'小西天',width:23,depth:10,height:9.2,z:-13.5,red:true});
  // Earth-red side plinths and an open front frame an entire golden sculptural
  // mountain: figures in front, cloud shelves, then tiny celestial pavilions.
  b.box(0,4.3,-17.8,20,6.8,.7,'#65452d','sculpture');
  interiorObstacle(b,0,-16.5,20.5,3.3,.9,9);
  interior.solidSamples.push([0,.94,-12.5],[0,.94,-16.5]);
  for(let row=0;row<3;row++){
    const y=1.15+row*2.3;
    for(let col=-4;col<=4;col++){
      const x=col*2.22, z=-15.7-row*.35+Math.sin(col*1.7+row)*.3;
      const s=.42+(row===0?.09:0);
      b.box(x,y-.18,z,2,.32,1.4,C.gold[(row+col+8)%4],'sculpture');
      figure(b,x,y,z,s,C.gold[(col+8)%3]);
      if(row>0&&col%2===0)littlePalace(b,x,y+1.5,z-.35,.55);
    }
  }
  for(const x of [-5.5,0,5.5]){
    shrineHalo(b,x,4.65,-13.7,2.3,C.gold[1]);
    figure(b,x,1,-12.5,x===0?1.6:1.32,C.gold[x===0?1:0]);
  }
  // Cloud curls sit in several depth planes, joining the suspension composition.
  for(let i=0;i<34;i++){
    const x=-10+(i%12)*1.8,y=2.4+Math.floor(i/12)*2.2+(i%3)*.17;
    b.box(x,y,-14.4-(i%3)*.6,1.15,.3,.6,C.gold[i%4],'sculpture');
    if(i%3===0)b.box(x+.45,y+.25,-14.2-(i%3)*.6,.4,.32,.5,C.gold[2],'sculpture');
  }
  for(const side of [-1,1]){
    b.hall(side*20,-18,6,5,0,3.2,true);
    b.obstacle(side*20,-18,7.4,6.4,0,6.5);
    b.box(side*12.6,1.1,-5.8,.75,2.2,2.5,C.red,'wood');
    b.obstacle(side*12.6,-5.8,.75,2.5,0,2.2);
  }
  b.landmarks = [
    ['hall','悬塑观赏殿',[0,7,-13.5]],
    ['figures','三尊金色造像',[0,4,-12.5]],
    ['palaces','层叠天宫',[0,8,-16.4]],
    ['hill','覆草山坡',[-13,9,-29],'landscape'],
  ];
}

function reliefPanel(b,x,z,width,height,variant) {
  interiorObstacle(b,x,z+.65,width,2.6,.85,height+.85,.3);
  b.box(x,height/2+.85,z,width,height,.8,'#bfa77c','sculpture');
  b.box(x,height/2+.85,z+.45,width-.5,height-.5,.2,'#6d7056','sculpture');
  for(const side of [-1,1])b.box(x+side*(width/2-.2),height/2+.85,z+.65,.32,height,.5,C.gold[1],'sculpture');
  for(const y of [.95,height+.75])b.box(x,y,z+.65,width,.26,.5,C.gold[2],'sculpture');
  // Figurative reliefs project from a deep panel; roofs, rocks, people and foliage
  // deliberately occupy four different planes of the wall sculpture.
  for(let row=0;row<2;row++)for(let col=-1;col<=1;col++){
    const px=x+col*width*.28, py=1.2+row*2.65;
    b.box(px,py-.18,z+1,2,.23,1.1,C.rock[(row+variant)%4],'sculpture');
    figure(b,px,py,z+1.18,.65,C.pigment[(col+row+variant+4)%4],true);
    if(row===1)littlePalace(b,px,py+2.2,z+.7,.48);
  }
  for(let i=0;i<12;i++)b.box(x+(i%4-1.5)*width*.23,1.7+Math.floor(i/4)*2.25,
    z+.72,1.3,.25,.38,C.cream,'sculpture');
}

export function shuiluTemple(b) {
  approach(b);hillGarden(b,3);
  // The long, open gallery expresses a wall-sculpture collection, rather than
  // repeating the freestanding golden statues of the Xiaoxitian composition.
  const interior=openHall(b,{id:'shuilu-hall',name:'水陆庵',width:27,depth:8,height:8.5,z:-13,red:true});
  for(const [x,variant] of [[-8.6,0],[0,1],[8.6,2]])reliefPanel(b,x,-15.8,7.7,6.8,variant);
  interior.solidSamples.push([0,.94,-15.8],[-8.6,.94,-15.8]);
  // Red perimeter walls frame a cool-grey roofline. Side lookout passages at
  // x=±16 remain outside the hall and clear of the wall's collision padding.
  for(const side of [-1,1]){
    const x=side*21.8;
    for(let z=-18;z<=-2;z+=3){
      b.box(x,1.45,z,.7,2.9,2.98,C.red,'wood');
      b.box(x,.28,z,.95,.56,3,C.stone[2]);
      b.box(x,2.98,z,1.15,.22,3.1,C.roof[1],'roof');
    }
    b.obstacle(x,-10,.95,19,0,3.1);
    // Small round-window motif, with four step-cut arcs and a dark recess.
    const wx=side*9.5;
    b.box(wx,1.4,4,4.6,2.8,.65,C.red,'wood');
    b.box(wx,1.65,4.36,1.6,1.6,.08,C.dark,'wood');
    for(let k=0;k<8;k++){
      const a=k*Math.PI/4;
      b.box(wx+Math.sin(a)*.88,1.65+Math.cos(a)*.88,4.43,.38,.38,.14,C.cream,'stone');
    }
    b.box(wx,2.92,4,4.95,.24,1.15,C.roof[0],'roof');
    b.obstacle(wx,4,4.95,1.15,0,3.1);
  }
  b.landmarks = [
    ['gallery','彩塑观赏廊',[0,7,-13]],
    ['center-relief','中央彩塑壁',[0,4.5,-14.5]],
    ['west-relief','西侧壁塑',[-8.6,4.5,-14.5]],
    ['round-window','红墙圆窗',[9.5,1.65,4]],
  ];
}

function stonePagoda(b,x,z,scale=1,tone=0) {
  const base=.7,r0=3.5*scale;
  b.octagon(x,.35,z,r0+1,r0+1.25,.7,C.stone[2]);
  b.octagon(x,.85,z,r0+.7,r0+1,.3,C.stone[1]);
  for(let level=0;level<5;level++){
    const y=base+level*4.1*scale,r=(3.45-level*.3)*scale,h=3.25*scale;
    b.octagon(x,y+h/2,z,r,r,h,C.stone[(level+tone)%4]);
    for(let band=0;band<4;band++)b.octagon(x,y+band*.78*scale,z,r+.035,r+.035,.055*scale,C.stone[2]);
    // Heavy masonry eaves have stepped corbels and flat stone corners, unlike
    // the fine wooden brackets and timber balconies of the Yingxian route.
    for(let tier=0;tier<4;tier++)b.octagon(x,y+h+tier*.18*scale,z,
      r+(.35+tier*.17)*scale,r+(.5+tier*.17)*scale,.2*scale,C.stone[(tier+1)%4]);
    const faceRadius=r*Math.cos(Math.PI/8);
    for(let face=0;face<8;face++){
      const a=face*Math.PI/4,fx=x+Math.sin(a)*faceRadius,fz=z+Math.cos(a)*faceRadius;
      const transform=(u,v,depth)=>[fx+Math.cos(a)*u+Math.sin(a)*depth,y+v,fz-Math.sin(a)*u+Math.cos(a)*depth];
      const block=(u,v,depth,w,hh,d,color)=>b.box(...transform(u,v,depth),w,hh,d,color,'stone',a);
      block(0,1.8*scale,.06,.95*scale,1.9*scale,.13,C.stone[2]);
      block(0,1.8*scale,.14,.65*scale,1.56*scale,.08,'#626d66');
      for(const side of [-1,1])block(side*.62*scale,1.7*scale,.16,.21*scale,2.25*scale,.28,C.stone[1]);
      block(0,2.9*scale,.17,1.5*scale,.25*scale,.3,C.stone[1]);
      block(0,.72*scale,.18,1.5*scale,.2*scale,.4,C.stone[2]);
      // Small high-relief figure inside each octagonal niche.
      block(0,1.29*scale,.32,.55*scale,.34*scale,.3,C.stone[1]);
      block(0,1.7*scale,.32,.36*scale,.65*scale,.3,C.stone[0]);
      block(0,2.2*scale,.33,.28*scale,.34*scale,.3,C.stone[1]);
      for(const side of [-1,1])block(side*.27*scale,1.65*scale,.29,.14*scale,.5*scale,.24,C.stone[1]);
      for(const side of [-1,1])block(side*1.1*scale,3.05*scale,.18,.27*scale,.27*scale,.5,C.stone[2]);
    }
  }
  const crown=base+20.5*scale;
  b.octagon(x,crown,z,1.2*scale,2.2*scale,.7*scale,C.stone[0]);
  for(let k=0;k<4;k++)b.octagon(x,crown+.7*scale+k*.42*scale,z,
    (.75-k*.12)*scale,(.85-k*.12)*scale,.26*scale,C.stone[1]);
  b.box(x,crown+2.6*scale,z,.19*scale,1.05*scale,.19*scale,C.stone[2]);
  b.obstacle(x,z,(r0+1.25)*2,(r0+1.25)*2,0,crown+3.2*scale);
}

export function kaiyuanTowers(b) {
  approach(b);
  stonePagoda(b,-10.2,-10.7,1,0);
  stonePagoda(b,10.2,-12.2,.94,1);
  // A calm axial garden links the paired towers without blocking the cross-path.
  b.path([[0,7],[0,-19]],3.4);
  // The gate belongs to the southern entrance, clear of both the z=0 tower
  // cross-corridor and the z=7 approach path. Stop 1 sits in front at [0,0,17].
  // The two towers and their side observation stops retain their positions.
  // No sill or platform spans the opening, and collision leaves a 2.38m-wide
  // centre passage after the scene's existing staff-clearance padding.
  const gateZ=12, gateFront=gateZ+1.4, gateBack=gateZ-1.4;
  for(const side of [-1,1]){
    const wingX=side*4.15;
    b.box(wingX,.2,gateZ,1.8,.4,2.8,C.stone[2]);
    b.box(wingX,1.8,gateZ,1.45,2.8,2.5,C.red,'wood');
    b.obstacle(wingX,gateZ,1.8,2.8,0,3.2);
    for(const x of [side*3.2,side*5.1])for(const z of [gateFront,gateBack]){
      b.pillar(x,0,z,3.65,.48,true);
      b.obstacle(x,z,.72,.72,0,4.1);
    }
    // The timber leaves are held open alongside the jambs, not across the path.
    b.box(side*2.95,1.6,gateZ,.16,3.2,2.35,C.wood,'wood');
    b.box(side*2.85,1.55,gateZ+.9,.08,.24,.14,C.gold[1],'metal');
    b.obstacle(side*2.95,gateZ,.16,2.35,0,3.2);
  }
  for(const z of [gateFront,gateBack])b.box(0,4.05,z,10.9,.42,.55,C.wood,'wood');
  b.box(0,3.62,gateFront+.32,3.2,.7,.18,C.dark,'wood');
  addPlaqueFace(b.root,{text:'开元寺',position:[0,3.62,gateFront+.425],width:3.2,height:.7});
  b.roof(0,4.32,gateZ,12.6,5.3,1.45,C.roof);
  b.hall(0,-24.5,10,5,0,3.3,true,'开元寺');
  b.obstacle(0,-24.5,11.4,6.4,0,6.7);
  for(const side of [-1,1]){
    b.tree(side*22,-16,1.05);
    b.tree(side*23,12,.85);
    for(const z of [-6,5])b.garden(side*20,z,3,4);
    // Carved steles face the approach, giving the courtyard a human-scale layer.
    const x=side*7.8,z=3;
    b.box(x,.2,z,1.65,.4,1,C.stone[2]);
    b.box(x,1.35,z,1.05,2.3,.42,C.stone[0]);
    b.box(x,2.65,z,1.35,.35,.65,C.stone[1]);
    for(let row=0;row<5;row++)for(let col=0;col<3;col++)b.box(x+(col-1)*.22,.7+row*.32,z+.23,.09,.16,.03,C.stone[2]);
    b.obstacle(x,z,1.65,1,0,2.85);
  }
  for(let i=0;i<10;i++){
    const x=-28+i*6.2,h=2.2+(i%3)*.75;
    b.box(x,h/2,-31,5.8,h,6,C.rock[i%4]);
    b.box(x,h+.1,-31,5.8,.2,6,C.leaf[i%4],'foliage');
    b.obstacle(x,-31,5.8,6,0,h+.2);
  }
  b.landmarks = [
    ['west-tower','西侧石塔',[-10.2,12,-10.7]],
    ['east-tower','东侧石塔',[10.2,11.6,-12.2]],
    ['hall','双塔后殿',[0,4,-24.5]],
    ['stele','石刻碑亭',[7.8,2,3]],
    ['gate','开元寺山门',[0,3.62,gateFront]],
  ];
}
