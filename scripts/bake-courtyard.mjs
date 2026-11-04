import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createCourtyard} from './lib/courtyard-source.mjs';
globalThis.FileReader=class {
 readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
 readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result=`data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;this.onloadend?.();});}
};
const loader=new GLTFLoader();
const read=async url=>{const b=await fs.readFile(new URL('../public'+url,import.meta.url));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const manifest=JSON.parse(await fs.readFile(new URL('../public/models/imported/manifest.json',import.meta.url)));
const start=performance.now(),yard=await createCourtyard(new THREE.Scene(),{loadAsync:read},manifest.assets);
const conversionMs=performance.now()-start;
if(yard.report.some(r=>r.error))throw Error('Source asset conversion incomplete');
yard.root.userData={colliders:yard.colliders,report:yard.report};
const binary=await new GLTFExporter().parseAsync(yard.root,{binary:true});
await fs.writeFile(new URL('../public/models/courtyard-lite.glb',import.meta.url),new Uint8Array(binary));
const samples=[];for(let i=0;i<5;i++){const t=performance.now();await read('/models/courtyard-lite.glb');samples.push(performance.now()-t);}
const sourceBytes=yard.report.reduce((sum,r)=>sum+manifest.assets.find(a=>a.url===r.source).bytes,0);
const result={scope:'Node local file read + GLTF parse; source includes runtime conversion; not browser FPS',conversionMs,bakedLoadMedianMs:samples.sort((a,b)=>a-b)[2],sourceBytes,bakedBytes:binary.byteLength,report:yard.report};
await fs.mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../artifacts/courtyard-bake.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
