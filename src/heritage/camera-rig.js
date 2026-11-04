import * as THREE from 'three';

export class HeritageCameraRig {
 constructor(){this.ray=new THREE.Ray();this.direction=new THREE.Vector3();this.hit=new THREE.Vector3();this.desired=new THREE.Vector3();this.distance=Infinity;this.applied=false;}
 reset(){this.applied=false;this.distance=Infinity;}
 // Restore orbit intent before controls read the camera; obstruction must not alter user zoom.
 restore(camera){if(this.applied)camera.position.copy(this.desired);this.applied=false;}
 resolve(camera,target,bounds,dt){
  this.desired.copy(camera.position);this.direction.subVectors(this.desired,target);
  const requested=this.direction.length();if(requested<.001)return;
  this.direction.divideScalar(requested);this.ray.set(target,this.direction);
  let allowed=requested;
  for(const box of bounds){if(box.containsPoint(target))continue;const hit=this.ray.intersectBox(box,this.hit);if(hit)allowed=Math.min(allowed,Math.max(.35,target.distanceTo(hit)-.15));}
  this.distance=allowed<this.distance?allowed:THREE.MathUtils.lerp(this.distance,allowed,1-Math.exp(-7*dt));
  if(!Number.isFinite(this.distance))this.distance=allowed;
  camera.position.copy(target).addScaledVector(this.direction,this.distance);camera.lookAt(target);this.applied=true;
 }
}
