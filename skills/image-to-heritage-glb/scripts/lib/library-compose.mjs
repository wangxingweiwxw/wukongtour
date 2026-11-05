// Compose the bundled, local reference library without an application or npm.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateGlb} from './validate.mjs';

const DEFAULT_LIBRARY=fileURLToPath(new URL('../../assets/library/',import.meta.url));
const check=(test,message)=>{if(!test)throw Error('Library composition: '+message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const clone=value=>structuredClone(value);
const allowedExtensions=new Set(['KHR_mesh_quantization','KHR_texture_transform','KHR_materials_unlit']);
const index=(id,array,label)=>{check(Number.isInteger(id)&&id>=0&&id<array.length,`${label} index out of range`);return id;};
const finite=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n),`${label} must be finite`);return n;};
function unpack(binary){
  const length=binary.readUInt32LE(12),doc=JSON.parse(binary.subarray(20,20+length));
  return {doc,bin:binary.subarray(28+length,28+length+doc.buffers[0].byteLength)};
}
function pack(doc,bin){
  doc.buffers=[{byteLength:bin.length}];
  const json=Buffer.from(JSON.stringify(doc)),paddedJson=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(paddedJson);
  const paddedBin=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(paddedBin);
  const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+paddedJson.length+paddedBin.length,8);
  header.writeUInt32LE(paddedJson.length,12);header.writeUInt32LE(0x4e4f534a,16);
  binHeader.writeUInt32LE(paddedBin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,paddedJson,binHeader,paddedBin]);
}
function supported(doc,assetId){
  check(!(doc.animations?.length||doc.skins?.length||doc.cameras?.length),`${assetId}: only static architecture meshes are supported`);
  for(const extension of [...(doc.extensionsUsed??[]),...(doc.extensionsRequired??[])])
    check(allowedExtensions.has(extension),`${assetId}: unsupported extension ${extension}; export an uncompressed static GLB`);
  const visit=value=>{
    if(!value||typeof value!=='object')return;
    for(const [key,item] of Object.entries(value)){
      if(key==='extras')continue;
      if(key==='extensions')for(const extension of Object.keys(item))check(allowedExtensions.has(extension),`${assetId}: unsupported extension ${extension}`);
      visit(item);
    }
  };visit(doc);
  for(const node of doc.nodes??[]){
    check(node.skin===undefined&&node.camera===undefined&&node.weights===undefined,`${assetId}: skin, camera or morph weights are unsupported`);
    check(node.extras?.heritageScene===undefined,`${assetId}: library instances cannot carry their own navigation declaration`);
  }
  for(const scene of doc.scenes??[])check(scene.extras?.heritageScene===undefined,`${assetId}: library instances cannot carry their own navigation declaration`);
  for(const mesh of doc.meshes??[]){
    check(mesh.weights===undefined,`${assetId}: morph weights are unsupported`);
    for(const primitive of mesh.primitives)check(primitive.targets===undefined,`${assetId}: morph targets are unsupported`);
  }
}
function boundsAfterPlacement(sourceBounds,position,scale,yaw){
  const center=[(sourceBounds.min[0]+sourceBounds.max[0])/2,sourceBounds.min[1],(sourceBounds.min[2]+sourceBounds.max[2])/2];
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},c=Math.cos(yaw),s=Math.sin(yaw);
  for(const x of [sourceBounds.min[0],sourceBounds.max[0]])for(const y of [sourceBounds.min[1],sourceBounds.max[1]])for(const z of [sourceBounds.min[2],sourceBounds.max[2]]){
    const dx=(x-center[0])*scale,dy=(y-center[1])*scale,dz=(z-center[2])*scale;
    const p=[position[0]+c*dx+s*dz,position[1]+dy,position[2]-s*dx+c*dz];
    for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],p[k]);bounds.max[k]=Math.max(bounds.max[k],p[k]);}
  }
  return {bounds,center};
}

/** Merge geometry once per asset, then instantiate its node tree at each placement. */
export async function composeLibraryInstances(binary,spec,{libraryRoot=DEFAULT_LIBRARY}={}){
  const entries=spec.libraryInstances??[];
  check(Array.isArray(entries)&&entries.length<=128,'libraryInstances must contain at most 128 entries');
  if(!entries.length)return {binary,instances:[],warnings:[]};
  const {doc,bin}=unpack(binary),scene=doc.scenes[doc.scene??0];
  check(scene.nodes.length===1,'generated scene must retain its single identity root');
  const root=doc.nodes[scene.nodes[0]],nav=root.extras?.heritageScene;
  root.children??=[];
  const library=await fs.realpath(libraryRoot),catalog=JSON.parse(await fs.readFile(path.join(library,'catalog.json'),'utf8'));
  check(Array.isArray(catalog.assets),'catalog.assets must be an array');
  const names=new Set(doc.nodes.map(n=>n.name).filter(Boolean)),usedIds=new Set(),resources=new Map();
  const chunks=[bin];let byteLength=bin.length;
  const warnings=[],instances=[];
  for(const key of ['bufferViews','accessors','meshes','materials','images','textures','samplers'])doc[key]??=[];
  async function load(assetId){
    if(resources.has(assetId))return resources.get(assetId);
    const matches=catalog.assets.filter(asset=>asset.id===assetId);check(matches.length===1,`unknown or ambiguous assetId ${assetId}`);
    const entry=matches[0];check(typeof entry.file==='string'&&!path.isAbsolute(entry.file),`${assetId}: catalog file must be relative`);
    const filename=await fs.realpath(path.resolve(library,entry.file)),relative=path.relative(library,filename);
    check(relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative),`${assetId}: model path leaves the bundled library`);
    const sourceBinary=await fs.readFile(filename);
    check(/^[a-f0-9]{64}$/i.test(entry.sha256??'')&&hash(sourceBinary)===entry.sha256.toLowerCase(),`${assetId}: source SHA-256 does not match catalog`);
    const sourceReport=validateGlb(sourceBinary),{doc:source,bin:sourceBin}=unpack(sourceBinary);supported(source,assetId);
    const offset=Object.fromEntries(['bufferViews','accessors','meshes','materials','images','textures','samplers'].map(key=>[key,doc[key].length]));
    const pad=Buffer.alloc((4-byteLength%4)%4);chunks.push(pad);byteLength+=pad.length;
    const binOffset=byteLength;chunks.push(sourceBin);byteLength+=sourceBin.length;
    for(const view of source.bufferViews??[])doc.bufferViews.push({...clone(view),buffer:0,byteOffset:(view.byteOffset??0)+binOffset});
    for(const accessor of source.accessors??[])doc.accessors.push({...clone(accessor),bufferView:index(accessor.bufferView,source.bufferViews,'accessor.bufferView')+offset.bufferViews});
    for(const image of source.images??[])doc.images.push({...clone(image),bufferView:index(image.bufferView,source.bufferViews,'image.bufferView')+offset.bufferViews});
    for(const sampler of source.samplers??[])doc.samplers.push(clone(sampler));
    for(const texture of source.textures??[]){
      const copy=clone(texture);copy.source=index(copy.source,source.images??[],'texture.source')+offset.images;
      if(copy.sampler!==undefined)copy.sampler=index(copy.sampler,source.samplers??[],'texture.sampler')+offset.samplers;
      doc.textures.push(copy);
    }
    for(const material of source.materials??[]){
      const copy=clone(material),textureInfos=[copy.normalTexture,copy.occlusionTexture,copy.emissiveTexture,
        copy.pbrMetallicRoughness?.baseColorTexture,copy.pbrMetallicRoughness?.metallicRoughnessTexture];
      for(const info of textureInfos)if(info)info.index=index(info.index,source.textures??[],'material.texture')+offset.textures;
      doc.materials.push(copy);
    }
    for(const mesh of source.meshes??[]){
      const copy=clone(mesh);
      for(const primitive of copy.primitives){
        for(const [semantic,accessor] of Object.entries(primitive.attributes))primitive.attributes[semantic]=index(accessor,source.accessors,'primitive attribute')+offset.accessors;
        if(primitive.indices!==undefined)primitive.indices=index(primitive.indices,source.accessors,'primitive.indices')+offset.accessors;
        if(primitive.material!==undefined)primitive.material=index(primitive.material,source.materials??[],'primitive.material')+offset.materials;
      }
      doc.meshes.push(copy);
    }
    for(const key of ['extensionsUsed','extensionsRequired']){
      const values=[...new Set([...(doc[key]??[]),...(source[key]??[])])];if(values.length)doc[key]=values;
    }
    const result={entry,source,offset,bounds:sourceReport.bounds};resources.set(assetId,result);return result;
  }
  for(const [i,item] of entries.entries()){
    const label=`libraryInstances[${i}]`;
    check(item&&typeof item==='object'&&!Array.isArray(item),`${label} must be an object`);
    check(typeof item.id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(item.id),`${label}.id must be a simple identifier`);
    check(!usedIds.has(item.id)&&!names.has(item.id),`${label}.id is not unique: ${item.id}`);usedIds.add(item.id);
    check(typeof item.assetId==='string'&&item.assetId.length>0,`${label}.assetId is required`);
    check(typeof item.purpose==='string'&&item.purpose.trim().length>0&&item.purpose.length<=500,`${label}.purpose must explain its architectural or landscape role`);
    check(['solid','visualOnly'].includes(item.collision),`${label}.collision must be explicitly solid or visualOnly`);
    check(Array.isArray(item.position)&&item.position.length===3,`${label}.position must be [x,y,z]`);
    const position=item.position.map((n,k)=>finite(n,`${label}.position[${k}]`)),height=finite(item.height,`${label}.height`),yaw=finite(item.rotation??0,`${label}.rotation`);
    check(height>=.1&&height<=80,`${label}.height must be 0.1..80 metres`);
    check(position.every(n=>Math.abs(n)<=4096),`${label}.position exceeds ±4096 metres`);
    const asset=await load(item.assetId),sourceHeight=asset.bounds.max[1]-asset.bounds.min[1];
    check(sourceHeight>1e-6,`${item.assetId}: library model has no usable height`);
    const scale=height/sourceHeight,{bounds,center}=boundsAfterPlacement(asset.bounds,position,scale,yaw);
    check(bounds.min.every((n,k)=>Number.isFinite(n)&&Number.isFinite(bounds.max[k])&&n<bounds.max[k]),`${label} has invalid transformed bounds`);
    if(nav){
      if(!spec.walk?.bounds)for(const [axis,k] of [['X',0],['Z',2]]){
        nav.bounds[`min${axis}`]=Math.min(nav.bounds[`min${axis}`],Math.floor(bounds.min[k]-3));
        nav.bounds[`max${axis}`]=Math.max(nav.bounds[`max${axis}`],Math.ceil(bounds.max[k]+3));
      }
      for(const [axis,k] of [['X',0],['Z',2]])check(bounds.min[k]>=nav.bounds[`min${axis}`]-1e-5&&bounds.max[k]<=nav.bounds[`max${axis}`]+1e-5,
        `${item.id}: complete model footprint is outside walk.bounds; move/resize it or deliberately revise the site boundary`);
      if(item.collision==='solid')nav.colliders.push({minX:bounds.min[0]-.4,maxX:bounds.max[0]+.4,minY:bounds.min[1],maxY:bounds.max[1],minZ:bounds.min[2]-.4,maxZ:bounds.max[2]+.4});
    }
    if(!nav)warnings.push(`${item.id}: this ordinary GLB has no heritageScene navigation; the requested ${item.collision} collision mode is not serialized as runtime collision.`);
    else if(item.collision==='visualOnly')warnings.push(`${item.id}: visualOnly has no collision or interior navigation; review placement so it cannot be mistaken for a traversable building.`);
    else warnings.push(`${item.id}: solid library geometry uses one conservative padded bounding box; its doors and interiors are not traversable.`);
    const wrapper=doc.nodes.length,nodeOffset=wrapper+2;
    doc.nodes.push({name:item.id,translation:position,rotation:[0,Math.sin(yaw/2),0,Math.cos(yaw/2)],scale:[scale,scale,scale],children:[wrapper+1],
      extras:{libraryInstance:{assetId:item.assetId,purpose:item.purpose,collision:item.collision,sourceSha256:asset.entry.sha256,identityStatus:asset.entry.identityStatus??'Not a verified historical reconstruction'}}});
    doc.nodes.push({name:item.id+'--origin',translation:center.map(n=>-n),children:asset.source.scenes[asset.source.scene??0].nodes.map(n=>n+nodeOffset)});
    for(const [sourceIndex,node] of asset.source.nodes.entries()){
      const copy=clone(node);copy.name=`${item.id}--source-${sourceIndex}`;
      if(copy.mesh!==undefined)copy.mesh+=asset.offset.meshes;
      if(copy.children)copy.children=copy.children.map(n=>n+nodeOffset);
      doc.nodes.push(copy);
    }
    for(const node of doc.nodes.slice(wrapper)){
      check(!names.has(node.name),`${item.id}: generated node name collides with ${node.name}`);names.add(node.name);
    }
    root.children.push(wrapper);
    instances.push({id:item.id,assetId:item.assetId,purpose:item.purpose,collision:item.collision,height,position,rotation:yaw,scale,bounds,
      source:{file:asset.entry.file,sha256:asset.entry.sha256,identityStatus:asset.entry.identityStatus??'unconfirmed'},collisionSerialized:!!nav&&item.collision==='solid',walkableInterior:false});
  }
  root.extras??={};root.extras.libraryInstances=instances;
  for(const key of ['images','textures','samplers'])if(!doc[key].length)delete doc[key];
  return {binary:pack(doc,Buffer.concat(chunks,byteLength)),instances,warnings};
}
