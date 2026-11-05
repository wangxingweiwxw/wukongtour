import {createHash} from 'node:crypto';
import {validateHeritageContract} from './heritage-contract.mjs';

const fail=message=>{throw Error(message);};
const check=(condition,message)=>{if(!condition)fail(message);};
const index=(n,list,label)=>{check(Number.isInteger(n)&&n>=0&&n<list.length,`${label}: index out of range`);return list[n];};
const finiteArray=(a,count,label)=>check(Array.isArray(a)&&a.length===count&&a.every(Number.isFinite),`${label}: expected ${count} finite numbers`);
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const row=i%4,col=Math.floor(i/4);let n=0;for(let k=0;k<4;k++)n+=a[k*4+row]*b[col*4+k];return n;});
const transform=(m,p)=>[0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);
function nodeMatrix(node){
  if(node.matrix){finiteArray(node.matrix,16,'node.matrix');check(!node.translation&&!node.rotation&&!node.scale,'Node cannot combine matrix and TRS');
    check([3,7,11].every(i=>Math.abs(node.matrix[i])<1e-9)&&Math.abs(node.matrix[15]-1)<1e-9,'Node matrix must be affine');return node.matrix;}
  const t=node.translation??[0,0,0],s=node.scale??[1,1,1],q=node.rotation??[0,0,0,1];
  finiteArray(t,3,'node.translation');finiteArray(s,3,'node.scale');finiteArray(q,4,'node.rotation');
  check(Math.abs(Math.hypot(...q)-1)<1e-4,'Node quaternion is not normalized');
  const [x,y,z,w]=q;
  return [(1-2*y*y-2*z*z)*s[0],(2*x*y+2*z*w)*s[0],(2*x*z-2*y*w)*s[0],0,
    (2*x*y-2*z*w)*s[1],(1-2*x*x-2*z*z)*s[1],(2*y*z+2*x*w)*s[1],0,
    (2*x*z+2*y*w)*s[2],(2*y*z-2*x*w)*s[2],(1-2*x*x-2*y*y)*s[2],0,...t,1];
}

export function validateGlb(bytes){
  check(Buffer.isBuffer(bytes)&&bytes.length>=28,'Input is not a complete GLB');
  check(bytes.readUInt32LE(0)===0x46546c67,'Invalid GLB magic');check(bytes.readUInt32LE(4)===2,'Only GLB version 2 is supported');
  check(bytes.readUInt32LE(8)===bytes.length,'GLB declared byte length does not match file');
  const chunks=[];let offset=12;
  while(offset<bytes.length){
    check(offset+8<=bytes.length,'Truncated GLB chunk header');const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);
    check(length%4===0,'GLB chunks must be aligned to 4 bytes');check(offset+8+length<=bytes.length,'Truncated GLB chunk');
    chunks.push({type,data:bytes.subarray(offset+8,offset+8+length)});offset+=8+length;
  }
  check(chunks.length===2&&chunks[0].type===0x4e4f534a&&chunks[1].type===0x004e4942,'Expected JSON then one embedded BIN chunk');
  let doc;try{doc=JSON.parse(chunks[0].data.toString('utf8'));}catch{fail('Invalid JSON chunk');}
  check(doc.asset?.version==='2.0','asset.version must be 2.0');
  check(Array.isArray(doc.buffers)&&doc.buffers.length===1&&!doc.buffers[0].uri,'Expected one embedded buffer without URI');
  const bin=chunks[1].data,declared=doc.buffers[0].byteLength;
  check(Number.isInteger(declared)&&declared>0&&declared<=bin.length&&bin.length-declared<=3,'Invalid embedded buffer byteLength');
  const views=doc.bufferViews??[],accessors=doc.accessors??[],meshes=doc.meshes??[],nodes=doc.nodes??[],materials=doc.materials??[];
  check(meshes.length>0&&nodes.length>0,'GLB contains no scene geometry');
  for(const [i,v] of views.entries()){
    check(v.buffer===0,`bufferView ${i} uses missing buffer`);
    check(Number.isInteger(v.byteOffset??0)&&(v.byteOffset??0)>=0&&Number.isInteger(v.byteLength)&&v.byteLength>0,`Invalid bufferView ${i} range`);
    check((v.byteOffset??0)+v.byteLength<=declared,`bufferView ${i} exceeds buffer`);
    if(v.byteStride!==undefined)check(Number.isInteger(v.byteStride)&&v.byteStride>=4&&v.byteStride<=252&&v.byteStride%4===0,`Invalid byteStride ${i}`);
  }
  for(const [i,image] of (doc.images??[]).entries()){
    check(image.uri===undefined,`Image ${i} is not embedded`);index(image.bufferView,views,`Image ${i}.bufferView`);
    check(['image/png','image/jpeg','image/webp','image/ktx2'].includes(image.mimeType),`Image ${i}: unsupported/missing mimeType`);
  }
  const components={5120:[1,'readInt8'],5121:[1,'readUInt8'],5122:[2,'readInt16LE'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
  const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},cache=new Map();
  function readAccessor(id){
    if(cache.has(id))return cache.get(id);
    const a=index(id,accessors,'accessor');check(!a.sparse,`Sparse accessor ${id} is outside this validator's supported uncompressed output`);
    const v=index(a.bufferView,views,`accessor ${id}.bufferView`),component=components[a.componentType],width=widths[a.type];
    check(component&&width,`Unknown componentType/type in accessor ${id}`);
    check(!a.type.startsWith('MAT')||component[0]===4,`Packed small-component matrices are outside this validator's supported output`);
    check(Number.isInteger(a.count)&&a.count>0,`Invalid accessor ${id}.count`);
    const size=component[0]*width,stride=v.byteStride??size,start=a.byteOffset??0;
    check(Number.isInteger(start)&&start>=0&&start%component[0]===0&&stride>=size,`Misaligned accessor ${id}`);
    check(((v.byteOffset??0)+start)%component[0]===0,`Misaligned absolute accessor ${id}`);
    check(start+(a.count-1)*stride+size<=v.byteLength,`Accessor ${id} exceeds bufferView`);
    const values=[];for(let n=0;n<a.count;n++)for(let k=0;k<width;k++){
      const value=bin[component[1]]((v.byteOffset??0)+start+n*stride+k*component[0]);
      check(Number.isFinite(value),`Accessor ${id} contains NaN/Infinity`);values.push(value);
    }
    for(const bound of ['min','max'])if(a[bound]!==undefined)finiteArray(a[bound],width,`accessor ${id}.${bound}`);
    const result={definition:a,values,width};cache.set(id,result);return result;
  }
  // Read even unused accessors so malformed unreachable geometry cannot hide.
  accessors.forEach((_,i)=>readAccessor(i));
  let triangles=0,vertices=0;
  for(const [mi,m] of meshes.entries()){
    check(Array.isArray(m.primitives)&&m.primitives.length>0,`Mesh ${mi} has no primitives`);
    for(const p of m.primitives){
      check((p.mode??4)===4,'Only uncompressed TRIANGLES output is supported');
      const position=readAccessor(p.attributes?.POSITION);
      check(position.width===3&&position.definition.componentType===5126,'POSITION must be float VEC3');
      check(position.definition.min&&position.definition.max,'POSITION is missing min/max bounds');
      for(let k=0;k<3;k++){
        let lo=Infinity,hi=-Infinity;for(let i=k;i<position.values.length;i+=3){lo=Math.min(lo,position.values[i]);hi=Math.max(hi,position.values[i]);}
        check(Math.abs(lo-position.definition.min[k])<=Math.max(1e-5,Math.abs(lo)*1e-6)&&Math.abs(hi-position.definition.max[k])<=Math.max(1e-5,Math.abs(hi)*1e-6),'POSITION min/max do not match data');
      }
      for(const [semantic,id] of Object.entries(p.attributes??{})){
        const attribute=readAccessor(id);check(attribute.definition.count===position.definition.count,`${semantic} attribute count mismatch`);
        if(semantic==='NORMAL'){
          check(attribute.width===3,'NORMAL must be VEC3');
          for(let i=0;i<attribute.values.length;i+=3)check(Math.abs(Math.hypot(...attribute.values.slice(i,i+3))-1)<.01,'Non-unit normal');
        }
      }
      if(p.material!==undefined)index(p.material,materials,'primitive.material');
      let count=position.definition.count;
      if(p.indices!==undefined){const ix=readAccessor(p.indices);check(ix.width===1&&[5121,5123,5125].includes(ix.definition.componentType),'Indices must be unsigned SCALAR');
        check(ix.values.every(i=>i>=0&&i<position.definition.count),'Primitive index exceeds vertex count');count=ix.definition.count;}
      check(count%3===0,'Triangle count is not divisible by three');triangles+=count/3;vertices+=position.definition.count;
    }
  }
  for(const [i,m] of materials.entries()){
    const p=m.pbrMetallicRoughness??{};
    if(p.baseColorFactor){finiteArray(p.baseColorFactor,4,`material ${i} baseColor`);check(p.baseColorFactor.every(v=>v>=0&&v<=1),'PBR colour must be in [0,1]');}
    for(const key of ['metallicFactor','roughnessFactor'])if(p[key]!==undefined)check(Number.isFinite(p[key])&&p[key]>=0&&p[key]<=1,`Invalid ${key}`);
  }
  const parents=new Map(),localMatrices=nodes.map(node=>nodeMatrix(node));
  nodes.forEach((node,i)=>{if(node.mesh!==undefined)index(node.mesh,meshes,`node ${i}.mesh`);
    check(node.children===undefined||Array.isArray(node.children),'Node children must be an array');
    for(const child of node.children??[]){index(child,nodes,'node child');check(!parents.has(child),'Node has multiple parents or duplicate child references');parents.set(child,i);}});
  // Linear-time, iterative cycle check also covers unreachable nodes.
  const state=new Uint8Array(nodes.length);
  for(let id=0;id<nodes.length;id++)if(!state[id]){
    const trail=[];let at=id;
    while(at!==undefined&&!state[at]){state[at]=1;trail.push(at);at=parents.get(at);}
    check(at===undefined||state[at]!==1,'Node hierarchy has a cycle');for(const n of trail)state[n]=2;
  }
  const scenes=doc.scenes??[],sceneIndex=doc.scene??0,scene=index(sceneIndex,scenes,'scene'),visited=new Set();
  const emptyBox=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
  const include=(a,b)=>{if(b.min.some((v,i)=>v>b.max[i]))return;for(let i=0;i<3;i++){a.min[i]=Math.min(a.min[i],b.min[i]);a.max[i]=Math.max(a.max[i],b.max[i]);}};
  const localMeshBounds=meshes.map(mesh=>mesh.primitives.map(primitive=>{
    const b=emptyBox();const values=readAccessor(primitive.attributes.POSITION).values;
      for(let i=0;i<values.length;i+=3)for(let k=0;k<3;k++){b.min[k]=Math.min(b.min[k],values[i+k]);b.max[k]=Math.max(b.max[k],values[i+k]);}
    return b;
  }));
  const bounds=emptyBox(),nodeBounds=new Map(),subtreeMeshes=new Map(),worldMatrices=new Map(),stack=[];
  check(Array.isArray(scene.nodes),'Scene nodes must be an array');
  for(const root of scene.nodes){index(root,nodes,'scene root');check(!parents.has(root),'Scene root cannot also have a parent node');stack.push({id:root,parent:IDENTITY,exit:false});}
  while(stack.length){
    const {id,parent,exit}=stack.pop(),node=nodes[id];
    if(exit){
      const box=nodeBounds.get(id);let count=node.mesh===undefined?0:1;
      for(const child of node.children??[]){include(box,nodeBounds.get(child));count+=subtreeMeshes.get(child);}
      subtreeMeshes.set(id,count);continue;
    }
    check(!visited.has(id),'Scene references a node more than once');visited.add(id);
    const world=multiply(parent,localMatrices[id]);check(world.every(Number.isFinite),'Non-finite accumulated node transform');worldMatrices.set(id,world);
    const box=emptyBox();nodeBounds.set(id,box);
    if(node.mesh!==undefined){
      // Match the receiver's Box3.setFromObject: transform the mesh's local AABB
      // corners, not only actual vertices (the latter can produce tighter bounds).
      for(const local of localMeshBounds[node.mesh])for(const x of [local.min[0],local.max[0]])for(const y of [local.min[1],local.max[1]])for(const z of [local.min[2],local.max[2]]){
        const p=transform(world,[x,y,z]);check(p.every(Number.isFinite),'Non-finite transformed geometry');include(box,{min:p,max:p});
      }
    }
    stack.push({id,exit:true});for(const child of node.children??[])stack.push({id:child,parent:world,exit:false});
  }
  for(const root of scene.nodes)include(bounds,nodeBounds.get(root));
  check(bounds.min.every(Number.isFinite)&&bounds.max.every(Number.isFinite),'Scene has no finite visible geometry');
  const heritage=validateHeritageContract({doc,sceneIndex,sceneNodeIds:visited,parents,localMatrices,nodeBounds,subtreeMeshes,bytes:bytes.length});
  const validation={structure:{status:'passed',scope:'supported uncompressed GLB triangle geometry'},heritageContract:heritage.contract,
    connectivity:heritage.connectivity,khronos:{status:'not-run'},visual:{status:'not-run'}};
  return {ok:true,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),meshes:meshes.length,nodes:nodes.length,
    materials:materials.length,vertices,triangles,bounds,embeddedResources:true,walkableScenes:heritage.contract.status==='passed'?1:0,validation,
    nodeNames:nodes.map(node=>node.name??''),warnings:[],
    checks:['GLB chunks and embedded buffer','accessor ranges and finite data','index ranges','position bounds','normals','scene hierarchy and transforms',
      ...(heritage.contract.status==='passed'?['heritageScene v1 receiver contract','standing points and directed walk connectivity']:[])]};
}
