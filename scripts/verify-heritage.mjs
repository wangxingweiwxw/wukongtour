import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createHero} from '../src/heritage/hero.js';
import {createCourtyard} from '../src/heritage/courtyard.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {verifyStaffClearance} from './verify-hero-detail.mjs';
const hero=createHero(),bounds=new THREE.Box3().setFromObject(hero);
assert(Math.abs(bounds.max.y-bounds.min.y-1.8)<.001);
// The diagonal back-carried rod's whole AABB contains a large empty triangle.
// Check its conservative capsule against individual animated OBB solids instead.
const staffValidation=verifyStaffClearance(hero,1200);
const loader=new GLTFLoader();
const localLoader={async loadAsync(url){const b=fs.readFileSync(new URL('../public'+url,import.meta.url));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}};
const manifest=JSON.parse(fs.readFileSync(new URL('../public/models/imported/manifest.json',import.meta.url)));
const yard=await createCourtyard(new THREE.Scene(),localLoader,manifest.assets);
assert.equal(yard.root.children.length,8);assert(yard.report.every(x=>!x.error&&x.after<=x.before));
const result={heroHeight:1.8,...staffValidation,courtyard:yard.report,instances:yard.root.children.length};
fs.writeFileSync(new URL('../artifacts/heritage-validation.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
