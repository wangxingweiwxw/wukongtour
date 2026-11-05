import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildArchitecture} from '../skills/image-to-heritage-glb/scripts/lib/architecture.mjs';
import {validateGlb} from '../skills/image-to-heritage-glb/scripts/lib/validate.mjs';
import {createImportedCompound} from '../src/heritage/compound-glb.js';

const spec={version:1,name:'Output regression pavilion',buildings:[{id:'pavilion',name:'Pavilion',type:'pavilion',width:8,depth:6,height:4,base:{height:0,stairs:'none'}}],
  terraces:[{id:'ground-court',position:[0,-.12,0],width:20,depth:20,height:.12}],
  walk:{bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},spawn:[0,0,8]}};
const valid=buildArchitecture(spec).binary;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function change(bytes,edit){
  const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength));
  edit(json);
  const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,0x20);text.copy(padded);
  const remainder=bytes.subarray(20+jsonLength),header=Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+padded.length+remainder.length,8);
  header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
  return Buffer.concat([header,padded,remainder]);
}
const metadata=doc=>doc.nodes.find(n=>Object.hasOwn(n.extras??{},'heritageScene')).extras.heritageScene;
const loader=new GLTFLoader();
async function imported(bytes){return createImportedCompound(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''));}
const report=validateGlb(valid);
assert.equal(report.validation.heritageContract.status,'passed');
assert.equal(report.validation.connectivity.status,'passed');
assert.equal(report.validation.khronos.status,'not-run');
assert.ok((await imported(valid)).imported);

const cases=[
  ['complete ground surface outside bounds',doc=>{metadata(doc).bounds.maxX=9;}],
  ['collision outside allowed perimeter',doc=>{metadata(doc).colliders[0].minX=-17;}],
  ['surface height beyond reference limit',doc=>{metadata(doc).surfaces[0].height=129;}],
  ['floor bounds outside navigation bounds',doc=>{metadata(doc).buildings[0].floorBounds.maxX=13;}],
  ['missing roof references',doc=>{metadata(doc).buildings[0].roofNodeNames=[];}],
  ['missing side entry array',doc=>{delete metadata(doc).buildings[0].sideEntries;}],
  ['duplicate building identity',doc=>{metadata(doc).buildings.push(structuredClone(metadata(doc).buildings[0]));}],
  ['roof outside building hierarchy',doc=>{metadata(doc).buildings[0].roofNodeNames=['ground-court'];}],
  ['duplicate navigation declarations',doc=>{doc.nodes[1].extras={heritageScene:structuredClone(metadata(doc))};}],
  ['deep navigation declaration',doc=>{const meta=metadata(doc);delete doc.nodes[0].extras.heritageScene;doc.nodes[1].extras={heritageScene:meta};}],
  ['nonidentity navigation root',doc=>{doc.nodes[0].translation=[1,0,0];}],
  ['valid standing points separated by a wall',doc=>{metadata(doc).colliders.push({minX:-13,maxX:13,minY:0,maxY:5,minZ:3.8,maxZ:4.1});}],
];
for(const [name,edit] of cases){
  const bytes=change(valid,edit);
  assert.throws(()=>validateGlb(bytes),undefined,'skill must reject: '+name);
  await assert.rejects(()=>imported(bytes),undefined,'runtime must reject: '+name);
}

// Both supported declaration locations must retain consistent semantics.
const sceneMetadata=change(valid,doc=>{
  doc.scenes[0].extras={heritageScene:metadata(doc)};delete doc.nodes[0].extras.heritageScene;
  doc.scenes[0].nodes=doc.nodes[0].children;delete doc.nodes[0].children;
});
assert.equal(validateGlb(sceneMetadata).validation.connectivity.status,'passed');
assert.ok((await imported(sceneMetadata)).imported);
const ordinary=change(valid,doc=>{delete doc.nodes[0].extras.heritageScene;});
assert.equal(validateGlb(ordinary).validation.heritageContract.status,'not-present');
assert.equal(await imported(ordinary),null);

// Reproduce the reported large-ground mismatch without including user assets.
const boundarySpec=structuredClone(spec);
boundarySpec.terraces[0].width=96;boundarySpec.terraces[0].depth=120;
boundarySpec.walk.bounds={minX:-44,maxX:42,minZ:-66,maxZ:58};
assert.throws(()=>validateGlb(buildArchitecture(boundarySpec).binary),/surfaces\[/);
boundarySpec.walk.bounds={minX:-48,maxX:48,minZ:-66,maxZ:60};
const repaired=buildArchitecture(boundarySpec).binary;
assert.equal(validateGlb(repaired).validation.connectivity.status,'passed');assert.ok((await imported(repaired)).imported);

// The CLI must reject before replacing a previously valid model and must replace
// stale successful reports with the current failure rather than leaving ok:true.
const temp=new URL('../.tools/skill-output-regression/',import.meta.url);mkdirSync(temp,{recursive:true});
const path=name=>fileURLToPath(new URL(name,temp));
const skill=new URL('../skills/image-to-heritage-glb/scripts/',import.meta.url);
function run(script,args){return spawnSync(process.execPath,[fileURLToPath(new URL(script,skill)),...args],{encoding:'utf8',cwd:fileURLToPath(temp)});}
const specPath=path('layout.json'),out=path('model.glb'),buildReport=path('build-report.json'),validationReport=path('validation.json');
writeFileSync(specPath,JSON.stringify(spec));
let result=run('build_glb.mjs',['--spec',specPath,'--out',out,'--report',buildReport]);
assert.equal(result.status,0,result.stderr);const before=hash(readFileSync(out));
const bad=structuredClone(spec);bad.walk.bounds.maxX=9;writeFileSync(specPath,JSON.stringify(bad));
result=run('build_glb.mjs',['--spec',specPath,'--out',out,'--report',buildReport]);
assert.equal(result.status,1);assert.equal(hash(readFileSync(out)),before,'failed build preserves last valid GLB');
const failure=JSON.parse(readFileSync(buildReport));assert.equal(failure.ok,false);assert.equal(failure.artifactWritten,false);assert.match(failure.error,/surfaces\[/);
const newOut=path('never-created.glb');assert.equal(existsSync(newOut),false);
result=run('build_glb.mjs',['--spec',specPath,'--out',newOut,'--report',buildReport]);assert.equal(result.status,1);assert.equal(existsSync(newOut),false);
result=run('validate_glb.mjs',[out,'--report',validationReport]);assert.equal(result.status,0,result.stderr);
const badPath=path('bad.glb'),badBytes=change(valid,cases[0][1]);writeFileSync(badPath,badBytes);
result=run('validate_glb.mjs',[badPath,'--report',validationReport]);assert.equal(result.status,1);
const failedValidation=JSON.parse(readFileSync(validationReport));assert.equal(failedValidation.ok,false);assert.equal(failedValidation.sha256,hash(badBytes));
console.log(JSON.stringify({ok:true,pairedRejections:cases.length,checks:['complete surface containment','metadata and hierarchy parity','disconnected standing points rejected','scene-level metadata','ordinary GLB fallback','reported ground-boundary regression','failed build preserves GLB','failure reports replace stale success']},null,2));
