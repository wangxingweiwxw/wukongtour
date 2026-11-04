import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {beveledBoxGeometry} from './beveled-box.js';

// Authored from the user's front/side/back turnaround. Metres; +Z faces forward.
// All decorative pieces share a vertex-colour material per joint/surface family.
export function createHero(){
 const root=new THREE.Group();root.name='Wukong';
 const parts=new Map(),materials=new Map();
 const palette={blue:'#486879',light:'#638392',shade:'#38505f',hem:'#81929a',leather:'#72503a',leatherLight:'#926548',leatherDark:'#4d392e',gold:'#b79764',goldLight:'#d5b784',skin:'#e9b493',skinLight:'#f4c6a6',skinShade:'#ce927b',pants:'#423e3d'};
 const material=(kind)=>{if(!materials.has(kind))materials.set(kind,new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:kind==='metal'?.61:.9,metalness:kind==='metal'?.32:0}));return materials.get(kind);};
 const joint=(name,x,y,z,parent=root)=>{const g=new THREE.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g;};
 function add(g,geo,color,kind='fabric'){
  const c=new THREE.Color(color),values=new Float32Array(geo.attributes.position.count*3);
  for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}
  geo.setAttribute('color',new THREE.BufferAttribute(values,3));
  if(!parts.has(g))parts.set(g,new Map());const map=parts.get(g);if(!map.has(kind))map.set(kind,[]);map.get(kind).push(geo);
 }
 function box(g,x,y,z,w,h,d,color,rz=0,kind='fabric'){
  const isArm=g.name==='left-arm'||g.name==='staff-arm';
  const bevel=kind==='metal'&&isArm?.006:kind==='skin'&&isArm&&h>.10?.012:g.name.endsWith('-leg')&&y<-.54&&h>.04?.008:0;
  const geo=bevel?beveledBoxGeometry(w,h,d,bevel):new THREE.BoxGeometry(w,h,d);geo.rotateZ(rz);geo.translate(x,y,z);add(g,geo,color,kind);
  (g.userData.collisionBoxes??=[]).push({x,y,z,hx:w/2,hy:h/2,hz:d/2,rz});
 }
 const {blue,light,shade,hem,leather,leatherLight,leatherDark,gold,goldLight,skin,skinLight,skinShade,pants}=palette;
 const body=joint('torso',0,1.05,0),head=joint('head',0,1.52,0);
 head.scale.y=.88;
 // Crossed collar, overlapping tunic and a visible centre seam on the back.
 box(body,0,.12,0,.47,.43,.29,blue);
 box(body,0,.345,.015,.17,.105,.17,shade);
 box(body,0,.325,.166,.15,.09,.025,skin,0,'skin');
 for(const s of [-1,1]){
  for(let row=0;row<4;row++)for(let col=0;col<3;col++){
   box(body,s*(.04+col*.07),.005+row*.082,.153,.068,.079,.018,(row+col)%3===0?light:blue);
   box(body,s*(.045+col*.073),.025+row*.078,-.153,.07,.076,.018,(row+col)%4===0?shade:blue);
  }
  box(body,s*.215,.12,.01,.045,.34,.31,shade);
  box(body,s*.066,-.12,.202,.16,.07,.03,light,s*.09);
 }
 for(let i=0;i<6;i++){
  box(body,-.16+i*.056,.315-i*.055,.173,.09,.113,.025,i%2?light:blue,-.58);
  if(i<4)box(body,.16-i*.045,.315-i*.048,.178,.078,.10,.022,i%2?blue:light,.55);
  box(body,0,.01+i*.055,-.169,.018,.044,.012,shade);
 }
 // Leather baldric crosses the quilted rear panel; the staff rests in a separate socket.
 for(let i=0;i<8;i++)box(body,.21-i*.055,.31-i*.052,-.186,.075,.083,.028,i%3?leather:leatherLight,-.70,'leather');
 box(body,-.18,.25,.184,.052,.19,.025,leatherLight,.48,'leather');
 box(body,0,-.055,0,.535,.095,.345,leather,0,'leather');
 for(let i=0;i<7;i++)box(body,-.225+i*.075,-.055,.181,.07,.085,.025,i%2?leather:leatherLight,0,'leather');
 box(body,0,-.15,0,.555,.085,.375,light);
 box(body,0,-.159,-.199,.52,.024,.024,shade);
 box(body,.175,-.19,.226,.058,.067,.038,gold,0,'metal');
 box(body,-.085,-.16,.225,.05,.06,.036,leatherLight,0,'leather');
 // Separate overlapping cloth lappets read from the rear as well as the front.
 box(body,0,-.33,0,.33,.32,.34,pants);
 for(const s of [-1,1]){
  box(body,s*.16,-.46,0,.28,.49,.35,pants,s*.025);
  for(let col=0;col<3;col++)for(let row=0;row<5;row++){
   const x=s*(.08+col*.067+row*.019),y=-.245-row*.092-(col===1?.025:0);
   const c=(col+row)%4===0?light:blue;
   const fold=.006*col+.003*row;
   box(body,x,y,.217+fold,.084,.103,.052,c,s*.11);
   box(body,x,y,-.219-fold,.084,.103,.052,(col+row)%4===0?shade:c,-s*.11);
   if(row===4){box(body,x,y-.044,.225+fold,.085,.018,.058,hem,s*.11);box(body,x,y-.044,-.225-fold,.085,.018,.058,hem,-s*.11);}
  }
  for(let row=0;row<5;row++){
   box(body,s*(.245+row*.023),-.245-row*.089,.04,.065,.105,.36,row%2?shade:blue,s*.10);
   box(body,s*(.254+row*.023),-.235-row*.085,.235,.075,.098,.06,row%2?leather:leatherDark,s*.18,'leather');
   box(body,s*(.254+row*.023),-.235-row*.085,-.235,.075,.098,.06,row%2?leather:leatherDark,-s*.18,'leather');
  }
  for(let row=0;row<6;row++)box(body,s*.055,-.25-row*.077,.256,.065,.086,.029,row%2?leather:leatherLight,s*.08,'leather');
  box(body,s*.17,-.70,.01,.29,.065,.38,pants,s*.02);
 }
 // Continuous face volume, stepped cheeks, brows, nose, ear rims and small square eyes.
 box(head,0,.06,0,.45,.41,.39,skin,0,'skin');
 box(head,0,-.103,.027,.405,.095,.345,skinLight,0,'skin');
 box(head,0,-.035,.205,.28,.17,.025,skinLight,0,'skin');
 box(head,0,.005,.220,.032,.014,.006,skinLight,0,'skin');
 box(head,0,-.071,.220,.038,.004,.003,'#d6a28b',0,'skin');
 for(const s of [-1,1]){
  box(head,s*.100,.073,.208,.070,.080,.019,'#28231f',0,'face');
  box(head,s*.100,.127,.211,.085,.014,.017,'#674332',-s*.06,'face');
  box(head,s*.185,-.021,.201,.054,.028,.009,'#db9984',0,'skin');
  box(head,s*.275,.037,.015,.080,.115,.10,skin,0,'skin');
  box(head,s*.291,.046,.068,.047,.071,.025,skinLight,0,'skin');
  box(head,s*.292,.034,.083,.021,.040,.007,skinShade,0,'skin');
 }
 // A filled voxel volume, not floating tufts: every crown column reaches the scalp.
 // Hidden shared faces are omitted. The skull cap, sideburns and nape are one closed mesh.
 const hairRoot=joint('HairShell',0,0,0,head),cell=.052,originY=.03,voxels=new Map();
 const key=(x,y,z)=>`${x},${y},${z}`;
 const put=(x,y,z)=>voxels.set(key(x,y,z),[x,y,z]);
 // Overlapping ellipsoidal locks build a round cap in all three axes, including the nape.
 const locks=[
  [0,.19,-.015,.285,.315,.245],
  [-.20,.28,.055,.14,.145,.16],[.205,.29,.035,.135,.16,.155],
  [-.12,.405,-.02,.145,.135,.15],[.075,.455,-.045,.095,.13,.10],
  [.18,.37,-.09,.13,.13,.135],[-.24,.13,-.06,.105,.19,.145],
  [.25,.12,-.055,.10,.175,.145],[-.135,.12,-.19,.145,.20,.11],
  [.14,.19,-.20,.14,.18,.105],[0,-.015,-.18,.19,.105,.12],
  [-.18,.20,.19,.11,.12,.115],[.15,.21,.19,.13,.12,.11],
  [-.085,.27,.255,.075,.085,.085],[.12,.36,.21,.080,.09,.085],
  [-.17,.395,.125,.075,.09,.085],[.025,.20,.26,.067,.08,.072],
  [-.10,.26,-.235,.09,.11,.072],[.13,.16,-.23,.09,.09,.072],
 ];
 for(let x=-8;x<=8;x++)for(let y=-5;y<=13;y++)for(let z=-8;z<=8;z++){
  const px=x*cell,py=originY+y*cell,pz=z*cell;
  const faceOpening=py<.16&&pz>-.105&&Math.abs(px)<.23;
  if(faceOpening)continue;
  if(locks.some(([cx,cy,cz,rx,ry,rz])=>((px-cx)/rx)**2+((py-cy)/ry)**2+((pz-cz)/rz)**2<=1))put(x,y,z);
 }
 // Fill diagonal-only voxel contacts so the exterior is a closed two-manifold surface.
 // Each added cell resolves a four-cell checker at an edge, without cutting new holes.
 const planes=[[[1,0,0],[0,1,0]],[[1,0,0],[0,0,1]],[[0,1,0],[0,0,1]]];
 for(let pass=0;pass<12;pass++){
  let changes=0;
  for(let x=-9;x<=8;x++)for(let y=-6;y<=13;y++)for(let z=-9;z<=8;z++)for(const [a,b] of planes){
   const q=[[x,y,z],[x+a[0],y+a[1],z+a[2]],[x+b[0],y+b[1],z+b[2]],[x+a[0]+b[0],y+a[1]+b[1],z+a[2]+b[2]]];
   const occupied=q.map(p=>voxels.has(key(...p)));
   if((occupied[0]&&occupied[3]&&!occupied[1]&&!occupied[2])||(!occupied[0]&&!occupied[3]&&occupied[1]&&occupied[2])){
    const candidates=q.filter((p,i)=>!occupied[i]);
    candidates.sort((p,q)=>(p[0]**2+(p[1]-4)**2+p[2]**2)-(q[0]**2+(q[1]-4)**2+q[2]**2));
    put(...candidates[0]);changes++;
   }
  }
  if(!changes)break;
 }
 const hairColors=['#80583f','#895d43','#93664a','#9c6c4e'];
 const faces=[
  {n:[1,0,0],v:[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]},
  {n:[-1,0,0],v:[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]},
  {n:[0,1,0],v:[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]},
  {n:[0,-1,0],v:[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]},
  {n:[0,0,1],v:[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]},
  {n:[0,0,-1],v:[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]},
 ];
 const hp=[],hn=[],hc=[],hi=[];
 // Inset each exposed voxel face; its outer perimeter remains shared. This
 // gives every lock a shallow bevel without opening seams in the solid scalp.
 function hairQuad(points,c){
  const base=hp.length/3,a=new THREE.Vector3(...points[0]),b=new THREE.Vector3(...points[1]),d=new THREE.Vector3(...points[2]);
  const normal=b.sub(a).cross(d.sub(a)).normalize();
  for(const p of points){hp.push(...p);hn.push(normal.x,normal.y,normal.z);hc.push(c.r,c.g,c.b);}
  hi.push(base,base+1,base+2,base,base+2,base+3);
 }
 for(const [x,y,z] of voxels.values())for(const {n,v} of faces){
  if(voxels.has(key(x+n[0],y+n[1],z+n[2])))continue;
  const hash=Math.abs(x*73856093^y*19349663^z*83492791),c=new THREE.Color(hairColors[hash%hairColors.length]);
  const outer=v.map(p=>[(x+p[0])*cell,originY+(y+p[1])*cell,(z+p[2])*cell]);
  const centre=[x*cell+n[0]*cell/2,originY+y*cell+n[1]*cell/2,z*cell+n[2]*cell/2];
  // Low variation breaks the helmet-like grid while preserving voxel scale.
  // Downward hidden faces stay flat to spend triangles on the visible locks.
  if(n[1]<0){hairQuad(outer,c);continue;}
  const relief=.004+(hash%5)*.0025,inset=.82+(hash%3)*.025;
  const inner=outer.map(p=>p.map((value,axis)=>centre[axis]+(value-centre[axis])*inset+n[axis]*relief));
  hairQuad(inner,c);
  for(let i=0;i<4;i++){const j=(i+1)%4;hairQuad([outer[i],outer[j],inner[j],inner[i]],c);}
 }
 const hairGeo=new THREE.BufferGeometry();hairGeo.setAttribute('position',new THREE.Float32BufferAttribute(hp,3));hairGeo.setAttribute('normal',new THREE.Float32BufferAttribute(hn,3));hairGeo.setAttribute('color',new THREE.Float32BufferAttribute(hc,3));hairGeo.setIndex(hi);hairGeo.computeBoundingBox();hairGeo.computeBoundingSphere();
 hairRoot.userData.collisionBoxes=[...voxels.values()].map(([x,y,z])=>({x:x*cell,y:originY+y*cell,z:z*cell,hx:cell/2+.014,hy:cell/2+.014,hz:cell/2+.014,rz:0}));
 const hairMesh=new THREE.Mesh(hairGeo,material('hair'));hairMesh.name='ClosedHairVolume';hairMesh.castShadow=true;hairMesh.receiveShadow=false;hairRoot.add(hairMesh);
 const legs=[joint('left-leg',-.195,.65,0),joint('right-leg',.195,.65,0)];
 for(const [index,g] of legs.entries()){
  const s=index===0?-1:1;
  box(g,0,-.17,0,.235,.34,.26,pants);
  box(g,0,-.295,.012,.20,.065,.235,skinShade,0,'skin');
  box(g,0,-.35,.01,.18,.065,.205,skin,0,'skin');
  box(g,0,-.465,.012,.185,.22,.22,leatherDark,0,'leather');
  for(let row=0;row<3;row++){
   box(g,0,-.385-row*.065,.135,.205,.045,.036,row%2?leather:leatherLight,0,'leather');
   box(g,s*.103,-.39-row*.065,.015,.024,.042,.235,leather,0,'leather');
  }
  box(g,0,-.575,.055,.235,.12,.34,leather,0,'leather');
  box(g,0,-.608,.074,.245,.044,.38,leatherLight,0,'leather');
  box(g,0,-.633,.068,.25,.034,.386,'#bba488');
  box(g,s*.055,-.543,.16,.11,.051,.11,leatherLight,0,'leather');
 }
 const arms=[joint('left-arm',-.275,1.32,0),joint('staff-arm',.275,1.32,0)];
 for(const [index,g] of arms.entries()){
  const s=index===0?-1:1;
  g.rotation.z=s*.12;
  box(g,s*.024,-.12,0,.195,.30,.24,shade);
  box(g,s*.038,-.255,.013,.195,.15,.24,blue,s*.035);
  for(let row=0;row<2;row++)box(g,s*.042,-.23-row*.074,.145,.20,.066,.035,row?blue:light);
  box(g,s*.05,-.383,.018,.19,.15,.225,leather,0,'leather');
  for(let col=0;col<3;col++)box(g,s*.05+(col-1)*.06,-.382,.143,.054,.133,.025,col===1?leatherLight:leatherDark,0,'leather');
  for(const y of [-.314,-.445])box(g,s*.05,y,.02,.225,.046,.262,leatherLight,0,'leather');
  box(g,s*.05,-.471,.02,.208,.05,.245,light);
  box(g,s*.055,-.555,.029,.174,.14,.17,skin,0,'skin');
  box(g,s*.055,-.619,.048,.15,.045,.145,skinLight,0,'skin');
  box(g,s*.007,-.544,.13,.052,.082,.045,skinLight,0,'skin');
  box(g,s*.027,-.567,.148,.035,.025,.014,skinShade,0,'skin');
  // Offset curved courses wrap the shoulder; raised plates overlap leather.
  for(let row=0;row<3;row++){
   const y=.035-row*.07,w=.19+row*.026,cx=s*(-.012+row*.008),tilt=-s*.18;
   box(g,cx,y,0,w,.066,.29+row*.02,leatherDark,tilt,'leather');
   for(let col=0;col<3;col++){
    const x=cx+(col-1)*(w/3),py=y+.018-s*(col-1)*.016;
    box(g,x,py,.151+row*.013+(col===1?.012:0),w/3-.004,.070,.069,col===1?'#ac9983':'#8e7b67',tilt,'metal');
    box(g,x,py,-.151-row*.013-(col===1?.012:0),w/3-.004,.070,.069,col===1?'#a18c75':leatherLight,tilt,'metal');
   }
   for(let segment=-1;segment<=1;segment++)box(g,cx+s*(w/2-.008),y-.006,segment*(.09+row*.006),.055,.074,.094+row*.005,segment===0?'#aa967c':'#8e7b67',tilt,'metal');
   if(row===0)box(g,cx,y+.06,0,.17,.052,.23,'#ad9b83',tilt,'metal');
  }
 }
 // Back carry matches the turnaround and leaves both arms free while running.
 const socket=joint('staff-socket',0,1.00,-.41);
 const staff=joint('GoldenStaff',0,0,0,socket);staff.rotation.z=.69;staff.scale.y=.74;
 box(staff,0,0,0,.065,1.72,.065,'#923d2c',0,'leather');
 for(let row=0;row<12;row++)box(staff,0,-.66+row*.12,0,.071,.104,.071,row%3?'#a44731':'#813728',0,'leather');
 for(const s of [-1,1]){
  box(staff,0,s*.77,0,.087,.195,.087,'#60594c',0,'metal');
  for(let i=0;i<2;i++)box(staff,0,s*(.695+i*.12),0,.101,.029,.101,i===1?goldLight:gold,0,'metal');
  box(staff,0,s*.877,0,.106,.055,.106,gold,0,'metal');
 }
 // The cradle is not part of the rod and bridges its safe offset to the baldric.
 box(socket,-.038,0,.095,.035,.10,.18,leather,0,'leather');
 box(socket,.038,0,.095,.035,.10,.18,leather,0,'leather');
 box(socket,0,0,-.04,.11,.10,.025,leatherLight,0,'leather');
 for(const [g,kinds] of parts)for(const [kind,geos] of kinds){
  const mesh=new THREE.Mesh(mergeGeometries(geos),material(kind));mesh.name=`${g.name}-${kind}`;
  geos.forEach(geo=>geo.dispose());mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);
 }
 const initial=new THREE.Box3().setFromObject(root);root.scale.setScalar(1.8/initial.getSize(new THREE.Vector3()).y);
 // Feet stay on y=0; the highest hair tuft defines the 1.8 m gameplay metric.
 const scaled=new THREE.Box3().setFromObject(root);root.position.y=-scaled.min.y;
 let phase=0,blend=0;
 root.userData.animate=(dt,moving,running)=>{
  blend=THREE.MathUtils.damp(blend,moving?1:0,12,dt);phase+=dt*(running?15:10.5)*blend;
  const swing=Math.sin(phase)*blend,stride=running?.49:.39;
  legs[0].rotation.x=swing*stride;legs[1].rotation.x=-swing*stride;
  arms[0].rotation.x=-swing*.30;arms[1].rotation.x=swing*.30;
  body.rotation.z=swing*.012;head.rotation.z=-swing*.009;
 };
 root.userData.staff=staff;
 root.userData.appearance={reference:'主角三视图.png',revision:'round-3',metres:1.8,hairCell:cell,hairVoxelCount:voxels.size,closedHair:'ClosedHairVolume',carry:'back',headLocal:[0,1.52,0]};
 return root;
}
