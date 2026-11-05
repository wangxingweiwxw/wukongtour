#!/usr/bin/env node
// Standalone, read-only localhost viewer. The only file served is --model.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
if (!args.includes('--model') || !value('--model') || value('--model').startsWith('--')) {
  console.error('Usage: node preview.mjs --model architecture.glb [--port 5190]'); process.exit(1);
}
const filename = path.resolve(value('--model'));
const port = args.includes('--port') ? Number(value('--port')) : 5190;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be 1024–65535');
const bytes = await readFile(filename);
if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Expected a GLB file');
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>古建筑 GLB 预览</title><style>body{margin:0;background:#dce3e7;color:#18242a;font:14px system-ui}canvas{display:block;width:100vw;height:100vh}header{position:fixed;top:16px;left:16px;right:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}button{padding:10px 16px;border:1px solid #aab7ba;border-radius:8px;background:#fffffff0;cursor:pointer}#status{padding:10px;background:#ffffffe8;border-radius:8px}#error{position:fixed;bottom:16px;left:16px;right:16px;color:#922;background:#fff;padding:12px;display:none}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
<header><strong>古建筑 GLB 预览</strong><button data-view="front">正面</button><button data-view="angle">斜侧</button><button data-view="back">背面</button><button data-view="top">俯瞰</button><span id="status">正在加载模型…</span></header><div id="error"></div>
<script type="module">
import * as THREE from 'three';import {OrbitControls} from 'three/addons/controls/OrbitControls.js';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const error=document.querySelector('#error');window.addEventListener('error',e=>{error.style.display='block';error.textContent=e.message+'；预览需要访问 Three.js 公共 CDN。'});
const scene=new THREE.Scene();scene.background=new THREE.Color('#dce3e7');
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,4000);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.body.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xeaf4ff,0x62523d,2.5));const sun=new THREE.DirectionalLight(0xffedcf,3);sun.position.set(-80,130,70);scene.add(sun);const fill=new THREE.DirectionalLight(0xcadfff,1);fill.position.set(70,40,-80);scene.add(fill);
let center=new THREE.Vector3(),radius=20;
function view(name){const direction={front:[0,.35,1],angle:[1,.8,1.25],back:[0,.35,-1],top:[0,1,.001]}[name];const angle=Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.min(camera.aspect,1));const distance=radius/Math.sin(angle)*1.08;camera.position.copy(center).addScaledVector(new THREE.Vector3(...direction).normalize(),distance);controls.target.copy(center);controls.maxDistance=distance*3;camera.near=Math.max(.01,radius/1000);camera.far=Math.max(1000,distance*8);camera.updateProjectionMatrix();controls.update();document.body.dataset.view=name;}
try{const gltf=await new GLTFLoader().loadAsync('/model.glb');scene.add(gltf.scene);const box=new THREE.Box3().setFromObject(gltf.scene);if(box.isEmpty())throw new Error('模型没有可显示的网格');center=box.getCenter(new THREE.Vector3());const size=box.getSize(new THREE.Vector3());radius=size.length()/2;const floor=new THREE.Mesh(new THREE.PlaneGeometry(Math.max(size.x,size.z)*2.2,Math.max(size.x,size.z)*2.2),new THREE.MeshStandardMaterial({color:0xc2cbc8,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(center.x,box.min.y-.04,center.z);scene.add(floor);document.querySelector('#status').textContent='已加载 · '+size.toArray().map(v=>v.toFixed(1)).join(' × ')+' 米';document.body.dataset.loaded='true';view('angle');}catch(e){error.style.display='block';error.textContent='加载失败：'+e.message;document.querySelector('#status').textContent='加载失败';}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera)});
</script></html>`;
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  const isModel = req.url === '/model.glb';
  if (!isModel && req.url !== '/') { res.writeHead(404); return res.end(); }
  const body = isModel ? bytes : Buffer.from(html);
  res.writeHead(200, { 'Content-Type': isModel ? 'model/gltf-binary' : 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : body);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log('GLB preview: http://127.0.0.1:' + port + '/\nModel: ' + filename));
