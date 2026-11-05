#!/usr/bin/env node
// Self-contained composition regression: real bundled asset + embedded texture fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildArchitecture} from './lib/architecture.mjs';
import {composeLibraryInstances} from './lib/library-compose.mjs';
import {validateGlb} from './lib/validate.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const decode=bytes=>{const length=bytes.readUInt32LE(12);return {doc:JSON.parse(bytes.subarray(20,20+length)),bin:bytes.subarray(28+length)};};
function encode(doc,bin){
  const text=Buffer.from(JSON.stringify(doc)),json=Buffer.alloc(Math.ceil(text.length/4)*4,0x20);text.copy(json);
  const padded=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(padded);
  const header=Buffer.alloc(20),tail=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);
  header.writeUInt32LE(28+json.length+padded.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  tail.writeUInt32LE(padded.length);tail.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,tail,padded]);
}
const spec={version:1,name:'Library composition regression',buildings:[{id:'pavilion',type:'pavilion',width:8,depth:6,height:4,base:{height:0,stairs:'none'}}],
  terraces:[{id:'ground',position:[0,-.12,0],width:46,depth:46,height:.12}],walk:{bounds:{minX:-24,maxX:24,minZ:-24,maxZ:24},spawn:[0,0,10]}};
const raw=buildArchitecture(spec).binary;
const instance={id:'gate-scenery',assetId:'asset-9d5476c46624',purpose:'Side courtyard architectural scenery',position:[13,0,6],height:5,collision:'solid'};
const composed=await composeLibraryInstances(raw,{...spec,libraryInstances:[instance,{...instance,id:'gate-scenery-two',position:[-13,0,-8],rotation:Math.PI/2}]});
const report=validateGlb(composed.binary),{doc}=decode(composed.binary),base=decode(raw).doc;
assert.equal(report.validation.connectivity.status,'passed');
assert.equal(composed.instances.length,2);
assert.equal(doc.meshes.length,base.meshes.length+1,'repeated library assets share geometry');
assert.equal(doc.nodes[0].extras.heritageScene.buildings.length,1,'scenery must not become navigable buildings');
assert.equal(doc.nodes[0].extras.heritageScene.colliders.length,base.nodes[0].extras.heritageScene.colliders.length+2);
assert.ok(doc.extensionsRequired.includes('KHR_mesh_quantization'));
assert.equal(composed.instances[0].bounds.min[1],0);
assert.equal(composed.instances[0].bounds.max[1],5);
assert.equal(composed.warnings.length,2);

await assert.rejects(composeLibraryInstances(raw,{...spec,libraryInstances:[{...instance,assetId:'missing-model'}]}),/unknown or ambiguous/);
await assert.rejects(composeLibraryInstances(raw,{...spec,libraryInstances:[{...instance,collision:undefined}]}),/explicitly solid or visualOnly/);
await assert.rejects(composeLibraryInstances(raw,{...spec,libraryInstances:[{...instance,position:[100,0,0]}]}),/outside walk.bounds/);
const blocked=await composeLibraryInstances(raw,{...spec,libraryInstances:[{...instance,position:spec.walk.spawn}]});
assert.throws(()=>validateGlb(blocked.binary),/spawn|standing|blocked/);
const visual=await composeLibraryInstances(raw,{...spec,libraryInstances:[{...instance,collision:'visualOnly'}]});
assert.equal(decode(visual.binary).doc.nodes[0].extras.heritageScene.colliders.length,base.nodes[0].extras.heritageScene.colliders.length);
assert.match(visual.warnings[0],/no collision/);

// The real library uses normalized Int8 normals. Invalid normalized index data
// and missing quantization declarations must still be rejected.
const source=await fs.readFile(new URL('../assets/library/models/asset-9d5476c46624.glb',import.meta.url)),sourceDoc=decode(source);
const malformed=structuredClone(sourceDoc.doc);malformed.accessors[malformed.meshes[0].primitives[0].indices].normalized=true;
assert.throws(()=>validateGlb(encode(malformed,sourceDoc.bin)),/normalized/);
const missingExtension=structuredClone(sourceDoc.doc);delete missingExtension.extensionsRequired;
assert.throws(()=>validateGlb(encode(missingExtension,sourceDoc.bin)),/KHR_mesh_quantization/);

// Nontrivial source hierarchy/TRS and an actual embedded PNG exercise resource
// remapping independently of today's vertex-colour-only model library.
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'heritage-library-test-'));
const textureModel=decode(buildArchitecture({...spec,walk:false,terraces:[]}).binary);
textureModel.doc.nodes[0].translation=[100,9,-30];textureModel.doc.nodes[0].rotation=[0,Math.SQRT1_2,0,Math.SQRT1_2];textureModel.doc.nodes[0].scale=[2,3,.5];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=','base64');
const imageOffset=textureModel.bin.length,view=textureModel.doc.bufferViews.length;
textureModel.doc.bufferViews.push({buffer:0,byteOffset:imageOffset,byteLength:png.length});
textureModel.doc.images=[{bufferView:view,mimeType:'image/png'}];textureModel.doc.samplers=[{magFilter:9729,minFilter:9729}];textureModel.doc.textures=[{source:0,sampler:0}];
textureModel.doc.materials[0].pbrMetallicRoughness.baseColorTexture={index:0};
const withImage=Buffer.concat([textureModel.bin,png]);textureModel.doc.buffers[0].byteLength=withImage.length;
const textured=encode(textureModel.doc,withImage);validateGlb(textured);
await fs.writeFile(path.join(temp,'textured.glb'),textured);
await fs.writeFile(path.join(temp,'catalog.json'),JSON.stringify({assets:['textured','second-textured'].map(id=>({id,file:'textured.glb',sha256:hash(textured)}))}));
const combined=await composeLibraryInstances(raw,{...spec,libraryInstances:[{...instance,assetId:'textured',height:5},
  {...instance,id:'second-texture-instance',assetId:'second-textured',height:5,position:[-13,0,-8]}]},{libraryRoot:temp});
assert.equal(validateGlb(combined.binary).validation.connectivity.status,'passed');
const result=decode(combined.binary).doc;
assert.equal(result.images[0].bufferView,base.bufferViews.length+view);
assert.equal(result.textures[0].source,0);
assert.equal(result.textures[0].sampler,0);
assert.equal(result.materials[base.materials.length].pbrMetallicRoughness.baseColorTexture.index,0);
assert.equal(result.images[1].bufferView,base.bufferViews.length+textureModel.doc.bufferViews.length+view);
assert.equal(result.textures[1].source,1);
assert.equal(result.textures[1].sampler,1);
assert.equal(result.materials[base.materials.length+textureModel.doc.materials.length].pbrMetallicRoughness.baseColorTexture.index,1);
assert.equal(combined.instances[0].bounds.max[1],5);
assert.equal(combined.instances[0].bounds.min[1],0);

// CLI fails before overwriting the prior valid file and reports the failing
// composition stage. This also verifies relative library lookup from any cwd.
const specPath=path.join(temp,'layout.json'),out=path.join(temp,'composed.glb'),reportPath=path.join(temp,'report.json');
await fs.writeFile(specPath,JSON.stringify({...spec,libraryInstances:[instance]}));
const cli=fileURLToPath(new URL('./build_glb.mjs',import.meta.url));
const run=()=>spawnSync(process.execPath,[cli,'--spec',specPath,'--out',out,'--report',reportPath],{cwd:temp,encoding:'utf8'});
let proc=run();assert.equal(proc.status,0,proc.stderr);const before=hash(await fs.readFile(out));
await fs.writeFile(specPath,JSON.stringify({...spec,libraryInstances:[{...instance,assetId:'not-in-library'}]}));
proc=run();assert.equal(proc.status,1);assert.equal(hash(await fs.readFile(out)),before);
const failure=JSON.parse(await fs.readFile(reportPath));assert.equal(failure.ok,false);assert.equal(failure.artifactWritten,false);assert.equal(failure.stage,'library-composition');
console.log(JSON.stringify({ok:true,checks:['real bundled Int8-normal model','shared geometry across placements','static model never becomes walkable interior','missing asset rejection','explicit collision semantics','full footprint boundary','spawn obstruction','visual-only warning','embedded texture remapping','nontrivial source transforms','invalid normalized indices','quantization declaration required','CLI preserves valid output'],artifacts:temp},null,2));
