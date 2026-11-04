import * as THREE from 'three';

// Grid-cluster LOD for the existing, already voxelised library. Retain source files.
export function blockLOD(source,cell=.22){
 const p=source.attributes.position,c=source.attributes.color,index=source.index;
 const vertices=[],colors=[],lookup=new Map(),remap=[];
 for(let i=0;i<p.count;i++){
  const xyz=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v/cell)*cell);
  const rgb=c?[c.getX(i),c.getY(i),c.getZ(i)].map(v=>Math.round(v*12)/12):[];
  const key=[...xyz,...rgb].join(',');if(!lookup.has(key)){lookup.set(key,vertices.length/3);vertices.push(...xyz);colors.push(...rgb);}remap.push(lookup.get(key));
 }
 const faces=[],seen=new Set();
 for(let i=0;i<(index?.count||p.count);i+=3){const ids=[0,1,2].map(j=>remap[index?index.getX(i+j):i+j]);if(new Set(ids).size<3)continue;const key=[...ids].sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);faces.push(...ids);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));if(c)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(faces);g.computeVertexNormals();g.computeBoundingSphere();return g;
}

export async function createCourtyard(scene,loader,assets){
 const root=new THREE.Group();root.name='LibraryCourtyard';scene.add(root);const colliders=[],report=[];
 const layout=[
  ['偏殿',10,[[-14,0,-5,Math.PI/2],[14,0,-5,-Math.PI/2]]],
  ['回廊',12,[[-16,0,8,Math.PI/2],[16,0,8,-Math.PI/2]]],
  ['亭子01',7,[[-16,0,22,0],[16,0,22,0]]],
  ['钟楼',8,[[-23,0,-20,0]]],
  ['浮屠塔',7,[[24,0,-25,0]]],
 ];
 for(const [name,width,placements] of layout){
  const asset=assets.find(a=>a.name===name);if(!asset)continue;
  try{
   const src=(await loader.loadAsync(asset.url)).scene;src.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(src),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   const factor=width/Math.max(size.x,size.z),template=new THREE.Group();let before=0,after=0;
   src.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld);g.translate(-center.x,-bounds.min.y,-center.z);g.scale(factor,factor,factor);before+=(g.index?.count||g.attributes.position.count)/3;
    const reduced=blockLOD(g,.38);
    // Restrained stone / timber / tile palette removes photographic colour noise.
    const pos=reduced.attributes.position,cols=[];const height=size.y*factor;
    for(let i=0;i<pos.count;i++){const y=pos.getY(i)/height;const band=y<.18?'#aaa08a':y>.59?'#666b62':'#78513b';const col=new THREE.Color(band);const shade=.90+.16*(.5+.5*Math.sin(pos.getX(i)*7+pos.getY(i)*13+pos.getZ(i)*11));col.multiplyScalar(shade);cols.push(col.r,col.g,col.b);}
    reduced.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));after+=reduced.index.count/3;g.dispose();const material=o.material.clone();material.vertexColors=true;material.color.set(0xffffff);material.flatShading=true;material.roughness=1;
    const mesh=new THREE.Mesh(reduced,material);mesh.castShadow=mesh.receiveShadow=true;template.add(mesh);
   });
   for(const [x,y,z,angle] of placements){const instance=template.clone();instance.name=name;instance.position.set(x,y,z);instance.rotation.y=angle;root.add(instance);instance.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(instance);colliders.push({minX:b.min.x-1.65,maxX:b.max.x+1.65,minZ:b.min.z-1.65,maxZ:b.max.z+1.65});}
   report.push({name,before,after,instances:placements.length,source:asset.url});
   src.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [o.material].flat())m.dispose();}});
  }catch(error){console.warn('Courtyard asset unavailable',name,error);report.push({name,error:error.message});}
 }
 return {root,colliders,report};
}
