import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createGLBHero,HERO_MODEL_URL} from '../src/heritage/glb-hero.js';

const bytes=readFileSync(new URL('../public'+HERO_MODEL_URL,import.meta.url));
assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
assert.equal(bytes.readUInt32LE(8),bytes.length);
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
assert.ok(json.buffers.every(buffer=>!buffer.uri),'GLB must embed its buffers');
assert.ok((json.images||[]).every(image=>image.bufferView!==undefined),'GLB must embed any images');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const hero=createGLBHero(gltf);
let meshes=0,triangles=0;
hero.traverse(node=>{if(node.isMesh){meshes++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;
  assert.ok(node.geometry.attributes.color&&node.material.vertexColors,'preserve authored colours');
  assert.equal(node.castShadow,true);assert.equal(node.receiveShadow,node.name!=='ClosedHairVolume');
}});
assert.equal(meshes,24);assert.equal(triangles,14840);
assert.equal(hero.userData.staff.name,'GoldenStaff');assert.equal(hero.userData.staff.parent.name,'staff-socket');
assert.equal(hero.userData.modelUrl,HERO_MODEL_URL);
const bounds=new THREE.Box3().setFromObject(hero);
assert.ok(Math.abs(bounds.min.y)<1e-6,'feet grounded');
assert.ok(Math.abs(bounds.max.y-bounds.min.y-1.8)<.005,'compatible player height');
hero.position.set(7,2,-5);hero.rotation.y=1.1;
for(const [moving,running,name] of [[false,false,'Idle'],[true,false,'Walk'],[true,true,'Run'],[false,true,'Idle']]) {
  for(let i=0;i<20;i++)hero.userData.animate(1/60,moving,running);
  assert.equal(hero.userData.animation,name);
  const part=hero.getObjectByName(name==='Idle'?'torso':'left-leg'),before=part.quaternion.clone();
  for(let i=0;i<7;i++)hero.userData.animate(1/60,moving,running);
  assert.ok(before.angleTo(part.quaternion)>.0001,`${name} plays`);
  assert.deepEqual(hero.position.toArray(),[7,2,-5]);assert.equal(hero.rotation.y,1.1);
  const frozen=part.quaternion.clone(),state=hero.userData.animation;
  for(const dt of [0,-1,NaN,Infinity])hero.userData.animate(dt,!moving,!running);
  assert.ok(frozen.equals(part.quaternion),'pause retains the exact pose');assert.equal(hero.userData.animation,state);
}
hero.userData.disposeAnimation();
assert.throws(()=>createGLBHero({scene:new THREE.Group(),animations:[]}),/有效几何体/);
console.log(JSON.stringify({ok:true,model:HERO_MODEL_URL,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),meshes,triangles,
  checks:['embedded resources','vertex colours','feet and height','back-carried staff','shadow flags','Idle/Walk/Run playback','pause','independent gameplay transforms']},null,2));
