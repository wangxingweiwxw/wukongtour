import assert from 'node:assert/strict';
import {buildArchitecture} from './lib/architecture.mjs';
import {validateGlb} from './lib/validate.mjs';
const spec={version:1,buildings:[{id:'hall',width:10,depth:8,base:{height:0}}],
  terraces:[{id:'ground',position:[0,-.12,0],width:40,depth:40,height:.12}],
  trees:[{id:'pine',position:[10,0,0],height:9},{id:'broadleaf',position:[-10,0,0],height:6,style:'broadleaf'}],
  walk:{bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawn:[0,0,15]}};
const output=buildArchitecture(spec).binary,report=validateGlb(output);
assert.equal(report.validation.connectivity.status,'passed');
const doc=JSON.parse(output.subarray(20,20+output.readUInt32LE(12)));
assert.equal(doc.nodes.filter(n=>n.extras?.kind==='vegetation').length,2);
const blocked=structuredClone(spec);blocked.trees[0].position=blocked.walk.spawn;
assert.throws(()=>validateGlb(buildArchitecture(blocked).binary),/spawn|blocked|standing/i);
assert.deepEqual(output,buildArchitecture(spec).binary,'vegetation must be deterministic');
const invalid=structuredClone(spec);invalid.trees[0].height=NaN;
assert.throws(()=>buildArchitecture(invalid),/height/);
console.log('Vegetation: real mesh, deterministic output, valid paths, blocked spawn and invalid size checks passed.');
