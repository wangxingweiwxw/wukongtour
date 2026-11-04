import * as THREE from 'three';

// Instanced voxel scenery: irregular canopies, worn stone and warm cloud banks.
export function createReferenceEnvironment(scene){
 let seed=20260923;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 const batches=new Map(),courtyardProps=[],environmentMeshes=[];let propLayer=false,ambientLayer=false,journeyMode=false,compoundMode=false,cliffMode=false;
 const add=(x,y,z,w,h,d,color,cloud=false)=>{const key=color+(cloud?'cloud':'')+(propLayer?'prop':'')+(ambientLayer?'ambient':'');if(!batches.has(key))batches.set(key,{color,cloud,propLayer,ambientLayer,boxes:[]});batches.get(key).boxes.push([x,y,z,w,h,d]);};
 const stone=['#aaa496','#b6afa0','#bdb7a8','#a29e91','#c1b9a7'];
 const leaves=['#879451','#9da962','#72854a','#b0b779','#617447'];
 add(0,-1,0,170,1.8,170,'#84945c');add(0,-.25,0,49,.4,51,'#827d6c');
 for(let x=-23.5;x<=23.5;x++)for(let z=-24.5;z<=24.5;z++){
  const garden=(Math.abs(x)>9&&Math.abs(x)<13&&z>10&&z<24)||(Math.abs(x)>19&&z>-10&&z<19);
  if(garden){add(x,-.035,z,.99,.07,.99,leaves[Math.floor(random()*3)]);if(random()<.18)add(x,.08,z,.12,.20,.12,leaves[3]);continue;}
  const h=.065+random()*.02,axis=Math.abs(x)<2.6&&z>5;
  add(x,-h/2,z,.975,h,.975,axis?stone[2]:stone[Math.floor(random()*stone.length)]);
  if(Math.abs(Math.abs(x)-3.5)<.1&&z>5)add(x,.008,z,.12,.025,.98,'#827d6c');
  if(Math.abs(x)>11&&random()<.08)add(x+.25,.006,z-.2,.38,.012,.33,'#7e8d57');
 }
 propLayer=true;
 for(const side of [-1,1]){
  for(let z=-24;z<26;z+=2){add(side*25.5,-.08,z,1,.7,1.9,stone[Math.floor(random()*3)]);if(z%3===0)add(side*25.5,.32,z,1.1,.13,2,'#c1b9a7');}
  for(const z of [8,18]){
   add(side*6.5,.15,z,.9,.3,.9,'#a29e91');add(side*6.5,.7,z,.3,.9,.3,'#9a9686');
   add(side*6.5,1.21,z,.7,.25,.7,'#bdb7a8');add(side*6.5,1.44,z,.45,.28,.45,'#67705b');add(side*6.5,1.64,z,.85,.13,.85,'#a29e91');
  }
 }
 propLayer=false;
 ambientLayer=true;
 for(let i=0;i<28;i++){
  const a=i*2.39996,r=30+random()*12,x=Math.sin(a)*r,z=Math.cos(a)*r;
  const height=5+random()*5,canopy=2.5+random()*1.5;
  add(x,height/2,z,.9,height,.9,'#755a3c');add(x+.22,height*.48,z+.1,.25,height*.9,.92,'#947249');
  for(const sign of [-1,1])add(x+sign*.9,height*.7,z,.8,1.1,.75,'#755a3c');
  for(let j=0;j<25;j++){
   const dx=(random()-.5)*canopy*2,dz=(random()-.5)*canopy*2,dy=random()*2;
   if(dx*dx+dz*dz>canopy*canopy*1.4)continue;
   add(x+Math.round(dx),height+Math.round(dy)-.3,z+Math.round(dz),1.4+random()*.9,1.1+random(),1.4+random()*.9,leaves[Math.floor(random()*leaves.length)]);
  }
  for(let j=0;j<9;j++)add(x+(random()-.5)*3,.2,z+(random()-.5)*3,.7,.6,.7,leaves[j%leaves.length]);
 }
 for(let i=0;i<150;i++){
  const x=(random()-.5)*70,z=(random()-.5)*70;if(Math.abs(x)<17&&Math.abs(z)<20)continue;
  const size=.3+random()*.6;add(x,size*.22-.05,z,size,size*.45,size,stone[i%stone.length]);
  if(i%3===0)add(x+.5,.22,z,.13,.6,.15,leaves[i%leaves.length]);
  if(i%13===0)add(x+.5,.55,z,.21,.14,.2,'#eee1a7');
 }
 // A broken limestone ridge gives the temple a backdrop instead of an empty horizon.
 for(let i=0;i<9;i++){
  const x=-42+i*10,z=-43-random()*8,height=11+random()*15;
  for(let j=0;j<6;j++){
   const radius=4.5-j*.45;
   for(let ox=-radius;ox<radius;ox+=2.0)for(let oz=-radius;oz<radius;oz+=2.0){
    if(Math.abs(ox)+Math.abs(oz)>radius*1.65)continue;
    add(x+ox+(j%2)*.5,j*height/6-1,z+oz,2.03,height/6+.35,2.03,j===5?leaves[(i+j)%leaves.length]:stone[Math.floor(random()*stone.length)]);
   }
  }
 }
 // Layered block hills fade into the sky beyond the garden.
 for(let i=0;i<16;i++){
  const angle=i*Math.PI*2/16,r=70+random()*12;
  for(let j=0;j<4;j++)add(Math.sin(angle)*r,j*3-1,Math.cos(angle)*r,17-j*3,4,17-j*3,j%2?'#8fa18b':'#9cae96');
 }
 for(let i=0;i<15;i++){
  const angle=i*2.4,x=Math.sin(angle)*62,z=Math.cos(angle)*62,y=19+random()*9;
  add(x,y,z,9,2.2,4,'#fff2d9',true);add(x-2,y+1.8,z,4.8,2,3.8,'#fff7e7',true);add(x+3,y+.7,z+1,4,2,3,'#f4eddf',true);
 }
 // These courtyard props yield to the collision-aware layouts of the journey scenes.
 propLayer=true;ambientLayer=false;
 for(const side of [-1,1])for(const z of [-14,2,17]){
  add(side*11.8,.14,z,2.4,.35,3.8,'#858376');
  for(let i=0;i<12;i++)add(side*11.8+(random()-.5)*2,.45+random()*.3,z+(random()-.5)*3.2,.55,.65,.55,leaves[i%leaves.length]);
 }
 for(const side of [-1,1])for(let z=13;z<23;z+=2){add(side*8.4,.22,z,.32,.44,1.8,'#a29e91');if(z%4===1){add(side*8.4,.45,z,.5,.9,.5,'#aaa496');add(side*8.4,.95,z,.65,.12,.65,'#c1b9a7');}}
 const geometry=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
 for(const {color,cloud,propLayer,ambientLayer,boxes} of batches.values()){
  const material=new THREE.MeshStandardMaterial({color,roughness:1});const mesh=new THREE.InstancedMesh(geometry,material,boxes.length);
  boxes.forEach(([x,y,z,w,h,d],i)=>{dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
  mesh.castShadow=!cloud;mesh.receiveShadow=!cloud;mesh.userData.environmentLayer={cloud,propLayer,ambientLayer};mesh.computeBoundingSphere();scene.add(mesh);environmentMeshes.push(mesh);if(propLayer)courtyardProps.push(mesh);
 }
 const skyGeometry=new THREE.SphereGeometry(140,32,20),positions=skyGeometry.attributes.position,colors=[];
 const low=new THREE.Color('#c1d9e8'),high=new THREE.Color('#6c9fd9');
 for(let i=0;i<positions.count;i++){const t=THREE.MathUtils.clamp((positions.getY(i)+3)/45,0,1);const c=low.clone().lerp(high,Math.sqrt(t));colors.push(c.r,c.g,c.b);}
 skyGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const sky=new THREE.Mesh(skyGeometry,new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,side:THREE.BackSide,fog:false,depthWrite:false}));sky.renderOrder=-1;scene.add(sky);
 // Soft contact shadow anchors the hero without a costly full-screen AO pass.
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');const gradient=ctx.createRadialGradient(64,64,5,64,64,62);gradient.addColorStop(0,'rgba(48,40,27,.5)');gradient.addColorStop(.5,'rgba(48,40,27,.22)');gradient.addColorStop(1,'rgba(48,40,27,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
 const contact=new THREE.Mesh(new THREE.PlaneGeometry(1.7,1.25),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));contact.rotation.x=-Math.PI/2;contact.position.y=.012;contact.renderOrder=2;scene.add(contact);
 const colliders=[];
 const obstacle=(x,z,w,d)=>colliders.push({minX:x-w/2-1.65,maxX:x+w/2+1.65,minZ:z-d/2-1.65,maxZ:z+d/2+1.65});
 for(const side of [-1,1]){for(const z of [8,18])obstacle(side*6.5,z,.9,.9);obstacle(side*8.4,17, .65,10);for(const z of [-14,2,17])obstacle(side*11.8,z,2.4,3.8);}
 function syncVisibility(){environmentMeshes.forEach(o=>{const layer=o.userData.environmentLayer;o.visible=!compoundMode&&!(layer.propLayer&&journeyMode)&&!(cliffMode&&layer.ambientLayer);});}
 return {colliders,setSkyVisible(visible){sky.visible=visible;},setCompoundMode(active){compoundMode=active;syncVisibility();sky.visible=true;},setJourneyMode(active){journeyMode=active;syncVisibility();},setCliffMode(active){cliffMode=active;syncVisibility();},update(hero,airborne=false,camera){if(camera)sky.position.copy(camera.position);if(hero){contact.position.x=hero.position.x;contact.position.z=hero.position.z;contact.position.y=hero.position.y+.012;contact.visible=hero.visible&&!airborne;}}};
}
