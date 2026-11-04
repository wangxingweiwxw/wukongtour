import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCloudFlight,CLOUD_FLIGHT,createNimbus} from '../src/heritage/cloud-flight.js';

const rates=[10,30,60,144],passed=[];
const check=(name,fn)=>{fn();passed.push(name);};
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
const box=(min,max)=>new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max));
function setup({obstacles=[],colliders=[],position=[0,0,0],bounds={minX:-100,maxX:100,minZ:-100,maxZ:100,minY:1.6,maxY:42}}={}){
  const hero=new THREE.Object3D();hero.position.fromArray(position);
  const scene=new THREE.Scene(),messages=[];
  const flight=createCloudFlight({scene,getHero:()=>hero,toast:t=>messages.push(t)});
  flight.configure({spawn:[0,0,0],colliders,flight:{bounds,obstacles}});
  return {hero,flight,messages,scene};
}
function mount(f){assert.equal(f.toggle(),true);for(let i=0;i<17;i++)f.update(.05);assert.equal(f.status,'flying');}
function run(f,seconds,fps,input){for(let i=0;i<seconds*fps;i++)f.update(1/fps,input);}

check('Mount animates upward, stays anchored, and ignores repeated G during transitions',()=>{
  const {hero,flight}=setup();assert.equal(flight.toggle(),true);assert.equal(flight.status,'takeoff');
  assert.equal(hero.position.y,0);assert.equal(flight.toggle(),false);
  flight.update(.1);assert.ok(hero.position.y>0&&hero.position.y<.2);
  assert.equal(flight.cloud.visible,true);
  for(let i=0;i<15;i++)flight.update(.05);
  assert.equal(flight.status,'flying');close(hero.position.y,2.2,'takeoff height');
  assert.equal(flight.toggle(),true);assert.equal(flight.status,'landing');assert.equal(flight.toggle(),false);
  run(flight,2,60,{direction:{x:1,z:0},vertical:1});
  assert.equal(flight.status,'off');assert.equal(flight.cloud.visible,false);close(hero.position.y,0,'ground');close(hero.position.x,0,'landing locks horizontal steering');
  flight.dispose();
});
check('Horizontal travel and acceleration are equal at 10/30/60/144 FPS, normal and boosted',()=>{
  for(const boost of [false,true])for(const fps of rates){
    const {hero,flight}=setup();mount(flight);
    run(flight,2,fps,{direction:{x:1,z:0},boost});
    const speed=boost?CLOUD_FLIGHT.boostSpeed:CLOUD_FLIGHT.speed;
    close(hero.position.x,speed*(2-(1-Math.exp(-16))/8),`${fps} fps distance`);
    close(hero.position.y,2.2,'hover holds altitude');flight.dispose();
  }
});
check('Diagonal keys cannot exceed the speed cap, including simultaneous ascent',()=>{
  for(const direction of [{x:1,z:1},{x:100,z:100}])for(const vertical of [0,1]){
    const {hero,flight}=setup();mount(flight);const before=hero.position.clone();
    run(flight,1,60,{direction,vertical});
    close(hero.position.distanceTo(before),7*(1-(1-Math.exp(-8))/8),'normalized diagonal');flight.dispose();
  }
});
check('Boosted flight cannot tunnel through a 1 mm wall and can slide alongside it',()=>{
  for(const fps of rates){
    const {hero,flight}=setup({obstacles:[box([5,0,-40],[5.001,15,40])]});mount(flight);
    run(flight,2,fps,{direction:{x:1,z:.2},boost:true});
    assert.ok(hero.position.x<=3.9&&hero.position.x>3.899,'entire cloud remains before wall');
    assert.ok(hero.position.z>3,'unblocked axis slides');flight.dispose();
  }
});
check('Floor, ceiling and horizontal boundary stop the full envelope',()=>{
  const bounds={minX:-10,maxX:10,minZ:-10,maxZ:10,minY:1.6,maxY:12};
  const {hero,flight}=setup({bounds});mount(flight);
  run(flight,8,30,{direction:{x:1,z:1},vertical:1,boost:true});
  close(hero.position.x,8.9,'right bound');close(hero.position.z,8.9,'far bound');close(hero.position.y,12,'ceiling');
  run(flight,8,30,{vertical:-1});close(hero.position.y,1.6,'hover floor');
  assert.ok(flight.toggle());run(flight,2,60);close(hero.position.y,0,'intentional landing bypasses hover floor');flight.dispose();
});
check('Roof blocks takeoff without changing position or showing a cloud',()=>{
  const {hero,flight,messages}=setup({obstacles:[box([-4,2.4,-4],[4,3,4])]});
  assert.equal(flight.toggle(),false);assert.equal(flight.status,'off');assert.equal(flight.cloud.visible,false);
  assert.deepEqual(hero.position.toArray(),[0,0,0]);assert.match(messages.at(-1),/上方空间不足/);flight.dispose();
});
check('G over a building denies landing, preserving flight and height',()=>{
  const {hero,flight,messages}=setup({position:[0,12,0],obstacles:[box([-3,0,-3],[3,6,3])],colliders:[{minX:-4.65,maxX:4.65,minZ:-4.65,maxZ:4.65}]});
  mount(flight);assert.equal(flight.toggle(),false);assert.equal(flight.status,'flying');close(hero.position.y,12,'no drop');
  assert.match(messages.at(-1),/无法落地/);flight.dispose();
});
check('Empty ground still cannot be reached through an overhead gallery or outside walking bounds',()=>{
  for(const opts of [{position:[0,12,0],obstacles:[box([-3,5,-3],[3,6,3])]}, {position:[35,8,0]}]){
    const {hero,flight}=setup(opts);mount(flight);const before=hero.position.clone();
    assert.equal(flight.toggle(),false);assert.deepEqual(hero.position.toArray(),before.toArray());flight.dispose();
  }
});
check('Paused UI freezes movement and removes latent inertia; invalid time cannot move',()=>{
  const {hero,flight}=setup();mount(flight);run(flight,1,60,{direction:{x:1,z:0}});
  const before=hero.position.clone();run(flight,1,30,{direction:{x:1,z:1},vertical:1,paused:true});
  assert.deepEqual(hero.position.toArray(),before.toArray());run(flight,1,60,{});
  assert.deepEqual(hero.position.toArray(),before.toArray());
  for(const dt of [NaN,-1,Infinity,undefined])flight.update(dt,{direction:{x:1,z:0}});
  assert.deepEqual(hero.position.toArray(),before.toArray());flight.dispose();
});
check('Configuration changes hide and reset cloud without teleporting scene-owned hero',()=>{
  const {hero,flight,scene}=setup();mount(flight);hero.position.y=10;flight.reset();
  assert.equal(flight.active,false);close(hero.position.y,10,'reset is transform-neutral');
  flight.configure(null);assert.equal(flight.available,false);assert.equal(flight.toggle(),false);
  assert.equal(flight.cloud.visible,false);close(hero.position.y,10,'transition caller owns spawn');
  flight.dispose();assert.equal(scene.children.length,0);
});
check('Cloud is one draw, under 4000 triangles, and fits its collision envelope',()=>{
  const cloud=createNimbus();cloud.updateMatrixWorld(true);
  const meshes=[];cloud.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.equal(meshes.length,1);
  assert.ok(cloud.userData.triangles<4000);
  const extent=new THREE.Box3().setFromObject(cloud);
  assert.ok(extent.min.y>=-CLOUD_FLIGHT.belowFeet&&extent.max.y<CLOUD_FLIGHT.height);
  for(const axis of ['x','z'])assert.ok(extent.min[axis]>=-CLOUD_FLIGHT.radius&&extent.max[axis]<=CLOUD_FLIGHT.radius);
  meshes.forEach(m=>{m.geometry.dispose();m.material.dispose();});
});
console.log(JSON.stringify({ok:true,checks:passed.length,passed,speeds:CLOUD_FLIGHT},null,2));
