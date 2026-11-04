import assert from 'node:assert/strict';
import * as THREE from 'three';
import {HeritageCameraRig} from '../src/heritage/camera-rig.js';
const target=new THREE.Vector3(0,1.8,0),wall=new THREE.Box3(new THREE.Vector3(-3,0,4),new THREE.Vector3(3,6,6));
function run(hz){
 const rig=new HeritageCameraRig(),camera=new THREE.PerspectiveCamera();camera.position.set(0,2,10);
 rig.resolve(camera,target,[wall],1/hz);assert(camera.position.z<4,'camera must stop in front of wall');
 rig.restore(camera);assert.equal(camera.position.z,10,'occlusion must preserve orbit distance');
 for(let i=0;i<hz;i++){rig.restore(camera);rig.resolve(camera,target,[],1/hz);}
 return camera.position.clone();
}
const a=run(30),b=run(144);assert(a.distanceTo(b)<1e-6,'recovery must be frame-rate independent');
const rig=new HeritageCameraRig(),camera=new THREE.PerspectiveCamera();
for(let i=0;i<360;i++){rig.reset();camera.position.set(Math.sin(i*Math.PI/180)*10,2,Math.cos(i*Math.PI/180)*10);rig.resolve(camera,target,[wall],1/60);assert(!wall.containsPoint(camera.position),'orbit enters wall');}
console.log('Camera: 360 orbit samples + obstruction recovery at 30/144 Hz passed');
