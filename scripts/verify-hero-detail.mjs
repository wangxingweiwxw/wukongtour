import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {createHero} from '../src/heritage/hero.js';

// Vertex normals may be smoothly blended along a bevel. Check their hemisphere
// against the geometric triangle normal rather than requiring axis-aligned or
// exactly equal normals, so a genuinely rounded closed scalp remains valid.
export function verifySurfaceNormals(geometry){
 const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
 assert(positions&&normals&&positions.count===normals.count,'surface positions and normals must match');
 const indices=geometry.index, count=indices?.count??positions.count;
 assert.equal(count%3,0,'surface must contain complete triangles');
 const point=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
 const vertexNormal=new THREE.Vector3(),averageNormal=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),cross=new THREE.Vector3();
 let minimumNormalAlignment=1,signedVolume=0;
 for(let i=0;i<count;i+=3){
  averageNormal.set(0,0,0);
  for(let j=0;j<3;j++){
   const index=indices?indices.getX(i+j):i+j;
   point[j].fromBufferAttribute(positions,index);vertexNormal.fromBufferAttribute(normals,index);
   assert([...point[j],...vertexNormal].every(Number.isFinite),`surface has non-finite data at triangle ${i/3}`);
   assert(Math.abs(vertexNormal.length()-1)<.02,`surface normal is not unit length at triangle ${i/3}`);
   averageNormal.add(vertexNormal);
  }
  ab.subVectors(point[1],point[0]);ac.subVectors(point[2],point[0]);cross.crossVectors(ab,ac);
  assert(cross.lengthSq()>1e-16,`surface contains degenerate triangle ${i/3}`);
  const alignment=cross.clone().normalize().dot(averageNormal.normalize());
  assert(alignment>.05,`surface winding disagrees with its normals at triangle ${i/3}`);
  minimumNormalAlignment=Math.min(minimumNormalAlignment,alignment);
  signedVolume+=point[0].dot(ab.crossVectors(point[1],point[2]))/6;
 }
 assert(signedVolume>0,'closed scalp must have outward winding and positive signed volume');
 return {normalCheckedTriangles:count/3,minimumNormalAlignment,signedVolume};
}

// Conservative capsule samples against authored rotated box solids. Unlike the AABB of
// an entire diagonal staff, these do not classify its empty bounding corners as wood.
export function verifyStaffClearance(hero, frames=1200){
 const protectedNames=['torso','left-leg','right-leg','head','left-arm','staff-arm'];
 const groups=[];
 for(const name of protectedNames)hero.getObjectByName(name).traverse(group=>{
  if(!group.userData.collisionBoxes?.length)return;
  const boxes=group.userData.collisionBoxes;
  const bounds=new THREE.Box3();
  for(const b of boxes){
   const c=Math.abs(Math.cos(b.rz)),s=Math.abs(Math.sin(b.rz));
   const half=new THREE.Vector3(c*b.hx+s*b.hy,s*b.hx+c*b.hy,b.hz),centre=new THREE.Vector3(b.x,b.y,b.z);
   bounds.expandByPoint(centre.clone().sub(half));bounds.expandByPoint(centre.clone().add(half));
  }
  groups.push({name:group.name,group,boxes,bounds,matrix:new THREE.Matrix4()});
 });
 assert(groups.length>=7,'collision solids must include hair and articulated limbs');
 const staff=hero.userData.staff,sample=new THREE.Vector3(),worldScale=new THREE.Vector3();
 let minimum=Infinity,conservativeMinimum=Infinity,ground=Infinity;
 const steps=104,spacing=1.82/steps;
 for(let frame=0;frame<frames;frame++){
  hero.userData.animate(1/60,frame%300<250,frame%600<300);hero.updateMatrixWorld(true);
  const staffScale=staff.matrixWorld.getMaxScaleOnAxis();
  ground=Math.min(ground,new THREE.Box3().setFromObject(staff).min.y);
  assert(ground>0,'staff must stay above the ground');
  for(const entry of groups){
   entry.matrix.copy(entry.group.matrixWorld).invert().multiply(staff.matrixWorld);
   worldScale.setFromMatrixScale(entry.group.matrixWorld);
   const minimumScale=Math.min(worldScale.x,worldScale.y,worldScale.z);
   // The authored transforms are rotation plus scale, with no shear. Validate
   // that contract before using the smallest axis as a world-distance bound.
   const m=entry.group.matrixWorld.elements;
   for(const [a,b] of [[0,4],[0,8],[4,8]]){
    const dot=m[a]*m[b]+m[a+1]*m[b+1]+m[a+2]*m[b+2];
    assert(Math.abs(dot)<1e-7,`${entry.name}: sheared collision frame needs a different distance bound`);
   }
   for(let i=0;i<=steps;i++){
    const y=-.91+i*spacing;
    // Rings are square; use their circumradius. The small spacing margin covers between samples.
    const radius=Math.hypot(Math.abs(y)>.56?.082:.058,spacing/2);
    sample.set(0,y,0).applyMatrix4(entry.matrix);
    const broadDistance=entry.bounds.distanceToPoint(sample);
    if(broadDistance>radius+.12&&broadDistance*minimumScale-radius*staffScale>.12)continue;
    for(const box of entry.boxes){
     const dx=sample.x-box.x,dy=sample.y-box.y,dz=sample.z-box.z;
     const c=Math.cos(box.rz),s=Math.sin(box.rz),x=dx*c+dy*s,yy=-dx*s+dy*c;
     const distance=Math.hypot(Math.max(Math.abs(x)-box.hx,0),Math.max(Math.abs(yy)-box.hy,0),Math.max(Math.abs(dz)-box.hz,0));
     const gap=(distance-radius)*hero.scale.x;
     minimum=Math.min(minimum,gap);
     assert(gap>0,`staff capsule touches ${entry.name} at frame ${frame}, y=${y.toFixed(3)}, gap=${gap.toFixed(5)}`);
     // A compressed head has a different local distance scale than the torso.
     // This lower bound never credits the lost axis length as weapon clearance.
     const worldGap=distance*minimumScale-radius*staffScale;
     conservativeMinimum=Math.min(conservativeMinimum,worldGap);
     assert(worldGap>=.02,`staff needs 2 cm body clearance: ${entry.name}, frame ${frame}, y=${y.toFixed(3)}, safe gap=${worldGap.toFixed(5)} m`);
    }
   }
  }
 }
 return {animationSamples:frames,minimumStaffBodyGap:conservativeMinimum,uniformScaleStaffBodyGap:minimum,requiredStaffBodyGap:.02,minimumStaffGroundGap:ground,method:'104-segment conservative capsule versus authored OBB solids; world minimum-axis scale bound includes nonuniform head scale, both arms and all hair voxels'};
}

export function verifyHeroDetail(){
 const hero=createHero();hero.updateMatrixWorld(true);
 const hair=hero.getObjectByName('ClosedHairVolume');assert(hair,'closed hair mesh exists');
 const geometry=hair.geometry,p=geometry.attributes.position,index=geometry.index.array;
 const surface=verifySurfaceNormals(geometry);
 const vertexKey=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>Math.round(n*1e6)).join(',');
 const edges=new Map();
 for(let i=0;i<index.length;i+=3){
  for(const [a,b] of [[index[i],index[i+1]],[index[i+1],index[i+2]],[index[i+2],index[i]]]){
   const key=[vertexKey(a),vertexKey(b)].sort().join('/');edges.set(key,(edges.get(key)||0)+1);
  }
 }
 assert([...edges.values()].every(count=>count===2),'every welded hair edge must have exactly two faces; no holes or diagonal pinches');
 const hairRoot=hero.getObjectByName('HairShell'),boxes=hairRoot.userData.collisionBoxes,cell=hero.userData.appearance.hairCell;
 const cells=new Map(boxes.map(b=>{const xyz=[Math.round(b.x/cell),Math.round((b.y-.03)/cell),Math.round(b.z/cell)];return [xyz.join(','),xyz];}));
 const visited=new Set(),queue=[cells.values().next().value];
 while(queue.length){const point=queue.pop(),key=point.join(',');if(visited.has(key))continue;visited.add(key);for(const [axis,sign] of [[0,1],[0,-1],[1,1],[1,-1],[2,1],[2,-1]]){const n=point.slice();n[axis]+=sign;if(cells.has(n.join(','))&&!visited.has(n.join(',')))queue.push(n);}}
 assert.equal(visited.size,cells.size,'all hair tufts must be face-connected to one solid scalp');
 const ray=new THREE.Raycaster(),counts={front:0,back:0,top:0,left:0,right:0};
 const cast=(face,origin,direction)=>{
  const from=hair.localToWorld(new THREE.Vector3(...origin));
  const dir=new THREE.Vector3(...direction).transformDirection(hair.matrixWorld);
  ray.set(from,dir);assert(ray.intersectObject(hair,false).length>0,`${face} scalp ray has a transparent gap at ${origin}`);counts[face]++;
 };
 for(let a=-3;a<=3;a++)for(let b=0;b<5;b++){
  const x=a*.05,y=.22+b*.035;
  cast('front',[x,y,2],[0,0,-1]);cast('back',[x,.08+b*.05,-2],[0,0,1]);
  cast('top',[x,2,-.12+b*.05],[0,-1,0]);
  cast('left',[-2,.15+b*.045,-.12+a*.025],[1,0,0]);
  cast('right',[2,.15+b*.045,-.12+a*.025],[-1,0,0]);
 }
 let meshes=0,triangles=0;hero.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
 assert(meshes<=55,'draw-call budget exceeded');assert(triangles<15000,'triangle budget exceeded');
 const bounds=new THREE.Box3().setFromObject(hero),headBounds=new THREE.Box3().setFromObject(hero.getObjectByName('head'));
 assert(Math.abs(bounds.getSize(new THREE.Vector3()).y-1.8)<.001,'1.8 m total height');
 const animation=verifyStaffClearance(hero);
 const report={reference:hero.userData.appearance.reference,meshes,triangles,hairTriangles:index.length/3,hairVoxels:cells.size,manifoldEdges:edges.size,scalpRays:counts,headBounds:{min:headBounds.min.toArray(),max:headBounds.max.toArray()},...surface,...animation};
 fs.writeFileSync(new URL('../artifacts/hero-detail-validation.json',import.meta.url),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(verifyHeroDetail(),null,2));
