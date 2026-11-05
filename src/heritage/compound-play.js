import * as THREE from 'three';
import {createCompoundScene} from './compound-scene.js';
import {createCompoundUI} from './compound-ui.js';
import {groundHeight,findWalkPath} from './walk-controller.js';

// Building inspection and walking share one scene and one real player position.
export function createCompoundPlay({scene,camera,controls,renderer,cameraRig,canvas,environment,getHero,clearInput,onEnter,onExit,onExport,toast}) {
 let world=null,active=false,mode='walk',selected=null,manualRoof=false,nearby=null;
 let guideIndex=0,guideFinished=false,pathElapsed=1,nearbyKey='',indoorId=null;
 const reached=new Set(),follow=new THREE.Vector3(),delta=new THREE.Vector3(),desired=new THREE.Vector3();
 const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2(),dummy=new THREE.Object3D();
 let guideDots,guideMarker,inspectionFloor,buildingLabels,lastPathStart=null,roofKey='',pointerStart=null;
 const ui=createCompoundUI({onEnter,onExit,onExport,onRestore:()=>onEnter?.(createCompoundScene()),onWalk:()=>setMode('walk'),onOverview:()=>setMode('overview'),
  onInspect:id=>inspect(id),onRoofToggle(){if(mode!=='inspect')inspect(nearby?.id||selected);manualRoof=!manualRoof;updateRoofs(true);},
  onFocusNext(){if(!world||reached.size===world.walkRoute.length)return;do{guideIndex=(guideIndex+1)%world.walkRoute.length;}while(reached.has(guideIndex));guideFinished=false;pathElapsed=2;updateRoute();if(mode!=='walk')setMode('walk');},
  onReset(){if(!world)return;clearInput();getHero().position.fromArray(world.spawn);setMode('walk');toast('已回到古建群南门入口');}
 });
 function updateRoute(){if(!world)return;const stop=world.walkRoute[guideIndex];ui.setRoute({name:stop.name,index:guideIndex+1,total:world.walkRoute.length,complete:guideFinished});guideMarker.position.set(stop.position[0],stop.position[1]+.1,stop.position[2]);guideMarker.visible=!guideFinished;lastPathStart=null;}
 function ensureWorld(){
  if(guideDots)return;if(!world)world=createCompoundScene();scene.add(world.root);ui.setBuildings(world.buildings);ui.setWorld(world);selected=world.buildings[0]?.id;
  guideDots=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,.035,.28),new THREE.MeshBasicMaterial({color:'#e9b94d'}),180);guideDots.count=0;guideDots.frustumCulled=false;guideDots.name='CompoundGuide';world.root.add(guideDots);
  guideMarker=new THREE.Mesh(new THREE.TorusGeometry(.85,.055,6,40),new THREE.MeshStandardMaterial({color:'#e9b94d',emissive:'#664c16',emissiveIntensity:.5}));guideMarker.rotation.x=-Math.PI/2;world.root.add(guideMarker);
  inspectionFloor=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.14,64),new THREE.MeshStandardMaterial({color:'#c8c0ac',roughness:1}));inspectionFloor.receiveShadow=true;inspectionFloor.visible=false;world.root.add(inspectionFloor);
  buildingLabels=new THREE.Group();buildingLabels.name='CompoundBuildingNames';
  for(const b of world.buildings){
   const label=document.createElement('canvas');label.width=256;label.height=64;const ctx=label.getContext('2d');
   ctx.fillStyle='#fff5de';ctx.fillRect(0,0,256,64);ctx.strokeStyle='#a77744';ctx.lineWidth=5;ctx.strokeRect(2,2,252,60);
   ctx.fillStyle='#374c3b';ctx.font='bold 30px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.name,128,33);
   const texture=new THREE.CanvasTexture(label);texture.colorSpace=THREE.SRGBColorSpace;
   const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,fog:false}));
   const center=b.bounds.getCenter(new THREE.Vector3());sprite.position.set(center.x,b.bounds.max.y+2,center.z);sprite.scale.set(9,2.25,1);sprite.userData.buildingId=b.id;sprite.renderOrder=10;buildingLabels.add(sprite);
  }
  world.root.add(buildingLabels);
  for(const decoration of [guideDots,guideMarker,inspectionFloor,buildingLabels])decoration.userData.minimapExclude=true;
 }
 function frameCamera(){
  if(!active)return;cameraRig.reset();const mobile=innerWidth<=800;camera.fov=mobile?62:50;camera.far=700;
  controls.autoRotate=false;controls.enablePan=mode!=='walk';controls.maxPolarAngle=Math.PI*.60;controls.minPolarAngle=.12;
  if(mode==='walk'){
   const hero=getHero();follow.copy(hero.position);controls.target.copy(hero.position).add(new THREE.Vector3(0,1.35,0));
   // Near eye-level framing keeps the complete eaves above a readable hero.
   camera.position.copy(hero.position).add(new THREE.Vector3(0,mobile?2.2:1.95,mobile?6.8:5.6));controls.minDistance=2.2;controls.maxDistance=21;
  }else if(mode==='overview'){
   const bounds=world.bounds,width=bounds.maxX-bounds.minX,depth=bounds.maxZ-bounds.minZ;
   const target=world.overview?.target || [(bounds.minX+bounds.maxX)/2,5,(bounds.minZ+bounds.maxZ)/2];
   controls.target.fromArray(target);
   const halfFov=THREE.MathUtils.degToRad(camera.fov/2),radius=Math.hypot(width,depth)*.52;
   const distance=radius/Math.sin(Math.atan(Math.tan(halfFov)*Math.min(camera.aspect,1)));
   camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(mobile ? .16 : .7,1,1.12).normalize(),distance);
   controls.minDistance=22;controls.maxDistance=Math.max(200,distance*1.5);controls.maxPolarAngle=Math.PI*.48;
  }else{
   const building=world.buildings.find(b=>b.id===selected);if(!building)return;
   const box=building.bounds,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
   const vertical=THREE.MathUtils.degToRad(camera.fov)/2,horizontal=Math.atan(Math.tan(vertical)*camera.aspect);
   const distance=size.length()*.5/Math.sin(Math.min(vertical,horizontal))*1.12;
   controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(1,.6,1.2).normalize().multiplyScalar(distance));
   controls.minDistance=Math.max(2,size.length()*.13);controls.maxDistance=Math.max(55,distance*1.6);controls.maxPolarAngle=Math.PI*.55;
  }
  camera.updateProjectionMatrix();controls.update();getHero().visible=mode==='walk';
 }
 function setMode(next){
  if(!active)return;clearInput();mode=next;manualRoof=false;indoorId=null;ui.setMode(mode);ui.setSelection(selected);
  const building=world.buildings.find(b=>b.id===selected);
  world.root.children.forEach(node=>node.visible=mode!=='inspect'||node===building?.root||node===inspectionFloor);
  inspectionFloor.visible=mode==='inspect';environment.setSkyVisible(mode!=='inspect');scene.background.set(mode==='inspect'?'#e8e2d4':'#b9cfdb');
  const extent=Math.max(world.bounds.maxX-world.bounds.minX,world.bounds.maxZ-world.bounds.minZ);
  scene.fog.near=mode==='overview'?extent*2:65;scene.fog.far=mode==='overview'?extent*5:Math.max(180,extent*1.4);
  if(mode==='inspect'&&building){const size=building.bounds.getSize(new THREE.Vector3()),center=building.bounds.getCenter(new THREE.Vector3()),r=Math.max(size.x,size.z)*.77;inspectionFloor.scale.set(r,1,r);inspectionFloor.position.set(center.x,building.bounds.min.y-.09,center.z);}
  updateRoofs(true);frameCamera();
 }
 function inspect(id){if(!active)return;selected=world.buildings.some(b=>b.id===id)?id:nearby?.id||selected||world.buildings[0].id;setMode('inspect');}
 function updateRoofs(force=false){
  if(!world)return;const key=`${mode}/${selected}/${manualRoof}/${indoorId}`;if(!force&&key===roofKey)return;roofKey=key;
  // Walking under a roof must retain the doorway silhouette and its shade.
  // Main-view occlusion fades only the part in front of the hero. Cutaway is an
  // explicit inspection tool; walking never removes a roof or hides the hero.
  for(const b of world.buildings){const hidden=mode==='inspect'&&manualRoof&&b.id===selected;b.roofs.forEach(mesh=>mesh.visible=!hidden);}
  ui.setRoofHidden(mode==='inspect'&&manualRoof);renderer.shadowMap.needsUpdate=true;
 }
 function enter(nextWorld){
  if(nextWorld&&nextWorld!==world){
   if(world){scene.remove(world.root);const geometries=new Set(),materials=new Set(),textures=new Set();world.root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of (Array.isArray(node.material)?node.material:[node.material]))if(material){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});textures.forEach(item=>item.dispose());geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());}
   world=nextWorld;guideDots=null;guideMarker=null;inspectionFloor=null;buildingLabels=null;nearby=null;indoorId=null;roofKey='';
  }
  ensureWorld();active=true;world.root.visible=true;guideIndex=0;guideFinished=false;reached.clear();lastPathStart=null;pathElapsed=2;nearbyKey='';
  getHero().position.fromArray(world.spawn);getHero().rotation.y=Math.PI;ui.setActive(true);setMode('walk');updateRoute();renderer.shadowMap.needsUpdate=true;
 }
 function leave(){
  if(!active)return;active=false;clearInput();world.root.visible=false;world.buildings.forEach(b=>b.roofs.forEach(r=>r.visible=true));
  ui.setActive(false);getHero().visible=true;controls.enablePan=false;controls.autoRotate=false;camera.far=400;environment.setSkyVisible(true);cameraRig.reset();
 }
 function update(dt,moving,direction){
  if(!active)return;const hero=getHero();
  nearby=world.buildings.reduce((best,b)=>{const d=b.bounds.distanceToPoint(hero.position);return !best||d<best.distance?{...b,distance:d}:best;},null);
  const inside=world.buildings.find(b=>{const f=b.floorBounds;return f&&hero.position.x>f.minX&&hero.position.x<f.maxX&&hero.position.z>f.minZ&&hero.position.z<f.maxZ;});
  indoorId=inside?.id||null;updateRoofs();
  const key=`${nearby?.id}/${Math.ceil(nearby?.distance||0)}/${indoorId}`;
  if(key!==nearbyKey){nearbyKey=key;ui.setNearby({name:inside?.name||nearby?.name,distance:inside?0:Math.ceil(nearby?.distance||0),inside:Boolean(inside)});}
  if(mode==='walk'){
   const stop=world.walkRoute[guideIndex],distance=Math.hypot(hero.position.x-stop.position[0],hero.position.z-stop.position[2]);
   if(!guideFinished&&distance<1.7&&Math.abs(hero.position.y-stop.position[1])<.3&&!reached.has(guideIndex)){
    reached.add(guideIndex);toast('已走到'+stop.name,2200);
    if(reached.size===world.walkRoute.length)guideFinished=true;
    else{do{guideIndex=(guideIndex+1)%world.walkRoute.length;}while(reached.has(guideIndex));}
    pathElapsed=2;updateRoute();
   }
   desired.copy(hero.position);if(moving)desired.addScaledVector(direction,.25);
   desired.lerpVectors(follow,desired,1-Math.exp(-11*dt));delta.subVectors(desired,follow);camera.position.add(delta);controls.target.add(delta);follow.copy(desired);
   pathElapsed+=dt;
   if(pathElapsed>.9&&(!lastPathStart||lastPathStart.distanceTo(hero.position)>2||pathElapsed>4)){
    pathElapsed=0;lastPathStart=hero.position.clone();guideDots.count=0;
    if(!guideFinished){
     const goal=world.walkRoute[guideIndex].position,path=findWalkPath(world,hero.position,{x:goal[0],y:goal[1],z:goal[2]});let count=0;
     for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z);for(let d=.7;d<length&&count<180;d+=1.05){const x=a.x+(b.x-a.x)*d/length,z=a.z+(b.z-a.z)*d/length;dummy.position.set(x,groundHeight(world,x,z)+.07,z);dummy.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);dummy.updateMatrix();guideDots.setMatrixAt(count++,dummy.matrix);}}
     guideDots.count=count;guideDots.instanceMatrix.needsUpdate=true;
    }
   }
  }
  guideDots.visible=guideMarker.visible=mode==='walk'&&!guideFinished;
  buildingLabels.visible=mode==='overview';
 }
 function resolve(){if(!active)return;if(mode==='walk'){camera.position.y=Math.max(groundHeight(world,camera.position.x,camera.position.z)+.3,camera.position.y);getHero().visible=true;}else getHero().visible=false;}
 function onPointerDown(e){if(active&&mode!=='walk')pointerStart={x:e.clientX,y:e.clientY};}
 function onPointerUp(e){
  if(!active||mode==='walk'||!pointerStart)return;const start=pointerStart;pointerStart=null;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>6)return;
  const rect=canvas.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);
  const targets=world.buildings.filter(b=>b.root.visible).map(b=>b.root);if(mode==='overview')targets.push(buildingLabels);
  const hit=raycaster.intersectObjects(targets,true).find(h=>h.object.visible);if(!hit)return;
  if(hit.object.userData.buildingId){inspect(hit.object.userData.buildingId);return;}
  let node=hit.object;while(node){const building=world.buildings.find(b=>b.root===node);if(building){inspect(building.id);break;}node=node.parent;}
 }
 canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointerup',onPointerUp);
 return {enter,leave,update,resolve,frameCamera,inspect,setMode,toggleView(){setMode(mode==='walk'?'overview':'walk');},reset(){if(active){getHero().position.fromArray(world.spawn);setMode('walk');}},
  get active(){return active;},get mode(){return mode;},get world(){return world;},get selected(){return selected;},get indoorId(){return indoorId;},get guideIndex(){return guideIndex;},get reached(){return [...reached];}};
}
