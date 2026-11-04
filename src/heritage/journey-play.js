import * as THREE from 'three';
import {JOURNEYS} from './journey-data.js';
import {createJourneyState} from './journey-state.js';
import {createJourneyScene} from './journey-scenes.js';
import {createJourneyUI} from './journey-ui.js';
import {findWalkPath,groundHeight} from './walk-controller.js';

export function createJourneyPlay({scene,getHero,isFlying=()=>false,blocked,onTravel,clearInput,toast,onOpenMap}) {
 let storage;try{storage=window.localStorage;}catch{}
 const state=createJourneyState(storage);
 let active=false,world=null,markers=null,observation=null,target=null,pathTime=0,lastTarget='',lastHud='';
 const matrix=new THREE.Object3D(),forward=new THREE.Vector3(),right=new THREE.Vector3();
 const ui=createJourneyUI({journeys:JOURNEYS,state,onTravel,onOpenMap,onInteract:interact,onReturn:()=>onTravel(state.activeId),onOpen:clearInput,onAnswer(index){
  const p=world?.points.find(p=>p.id===observation?.id),hero=getHero();
  if(!active||!p||!hero||isFlying())return {ok:false,reason:'inactive-scene'};
  const result=state.submit(p.id,index,hero.position,p.position);
  if(result.ok){refreshMarkers();ui.refresh();if(!result.saved)toast('游记已收录；本次浏览器未允许保存进度');}
  return result;
 }});
 function dispose(root){if(!root)return;const geometry=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometry.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){materials.add(m);if(m.map)textures.add(m.map);}});geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.removeFromParent();}
 function label(number){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff2cb';ctx.beginPath();ctx.arc(64,64,49,0,Math.PI*2);ctx.fill();ctx.lineWidth=6;ctx.strokeStyle='#986b36';ctx.stroke();ctx.fillStyle='#453f2a';ctx.font='bold 62px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(number,64,66);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:true}));sprite.scale.set(1,1,1);return sprite;}
 function refreshMarkers(){if(!markers)return;const next=state.nextPoint();markers.children.filter(o=>o.userData.pointId).forEach(o=>{const done=state.has(o.userData.pointId);o.material.color.set(done?'#7dba91':o.userData.pointId===next?.id?'#ffc55e':'#c5bfa0');o.material.emissive.copy(o.material.color).multiplyScalar(.25);});lastTarget='';lastHud='';}
 function enter(id){
  const data=JOURNEYS.find(j=>j.id===id);if(!data)return null;
  const nextWorld=createJourneyScene(id); // Build successfully before replacing the current scene.
  leave();state.travel(id);world=nextWorld;scene.add(world.root);active=true;
  markers=new THREE.Group();markers.name='JourneyMarkers';scene.add(markers);
  const geometry=new THREE.TorusGeometry(.92,.06,6,32);
  world.points.forEach((p,i)=>{const ring=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#ffc55e',emissive:'#7d571f',roughness:.8}));ring.rotation.x=-Math.PI/2;ring.position.set(p.position[0],.09,p.position[2]);ring.userData.pointId=p.id;markers.add(ring);const badge=label(String(i+1));badge.position.set(p.position[0],1.6,p.position[2]);markers.add(badge);});
  const dots=new THREE.InstancedMesh(new THREE.BoxGeometry(.15,.035,.3),new THREE.MeshBasicMaterial({color:'#f9d27f'}),100);dots.name='GuideDots';dots.count=0;dots.frustumCulled=false;markers.add(dots);
  getHero().position.fromArray(world.spawn);getHero().rotation.y=Math.PI;
  pathTime=1;target=null;ui.setMode(true);ui.refresh();refreshMarkers();return {data,world};
 }
 function leave(){active=false;ui.closeObservation();ui.setMode(false);dispose(world?.root);dispose(markers);world=null;markers=null;observation=null;target=null;}
 function interact(){
  if(!active||!getHero()||document.querySelector('dialog[open]'))return;
  if(isFlying()){toast('先按 G 在空旷地面落地，再靠近观察点');return;}
  const hero=getHero(),near=world.points.map(p=>({p,d:Math.hypot(hero.position.x-p.position[0],hero.position.z-p.position[2])})).sort((a,b)=>a.d-b.d)[0];
  if(!near||near.d>2.4){if(!state.nextPoint())ui.openRoutes();else toast('沿金色光点靠近观察圆环，再按 E');return;}
  observation=JOURNEYS.find(j=>j.id===state.activeId).points.find(p=>p.id===near.p.id);
  clearInput();ui.openObservation(observation,{completed:state.has(observation.id)});
 }
 function update(dt,camera){
  if(!active||!world||!getHero())return;
  const hero=getHero(),data=JOURNEYS.find(j=>j.id===state.activeId),next=state.nextPoint();
  const near=world.points.map(p=>({p,d:Math.hypot(hero.position.x-p.position[0],hero.position.z-p.position[2])})).filter(p=>!state.has(p.p.id)).sort((a,b)=>a.d-b.d)[0];
  target=near?.d<=2.4?near.p:world.points.find(p=>p.id===next?.id);
  const point=data.points.find(p=>p.id===target?.id),distance=target?Math.hypot(hero.position.x-target.position[0],hero.position.z-target.position[2]):0;
  camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,THREE.Object3D.DEFAULT_UP);
  let direction='';if(target){const dx=target.position[0]-hero.position.x,dz=target.position[2]-hero.position.z;const f=dx*forward.x+dz*forward.z,r=dx*right.x+dz*right.z;direction=Math.abs(r)<Math.abs(f)*.45?(f>=0?'前方':'后方'):Math.abs(f)<Math.abs(r)*.45?(r>=0?'右侧':'左侧'):(r>=0?'右':'左')+(f>=0?'前方':'后方');}
  const airborne=isFlying(),ready=distance<=2.4&&!airborne;
  const hud=[point?.id,Math.ceil(distance),ready,direction,state.completed.length,airborne].join('/');
  if(hud!==lastHud){lastHud=hud;ui.updateTarget({title:point?.title||'这一程已完成',hint:airborne?'腾云赏檐 · 回到空旷地面按 G 落地后可记录观察点。':point?.hint||'打开访古路线，继续下一程或回顾手记。',distance:Math.ceil(distance),ready,complete:!next,direction});}
  if((pathTime+=dt)>=.8||lastTarget!==target?.id){
   pathTime=0;lastTarget=target?.id;const dots=markers.getObjectByName('GuideDots');dots.count=0;
   if(!airborne&&target&&distance>2.4){const path=findWalkPath(world,hero.position,{x:target.position[0],z:target.position[2]});let count=0;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z);for(let d=.9;d<length&&count<100;d+=1.15){const x=a.x+(b.x-a.x)*d/length,z=a.z+(b.z-a.z)*d/length;matrix.position.set(x,groundHeight(world,x,z)+.07,z);matrix.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);matrix.updateMatrix();dots.setMatrixAt(count++,matrix.matrix);}}dots.count=count;dots.instanceMatrix.needsUpdate=true;}
  }
 }
 return {state,ui,enter,leave,interact,update,get active(){return active;},get world(){return world;},get target(){return target;}};
}
