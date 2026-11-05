import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createHeritageAtlas} from './atlas.js';
import {createModelLibrary} from './model-library.js';
import {createReferenceEnvironment} from './reference-environment.js';
import {createGLBHero,HERO_MODEL_URL} from './glb-hero.js';
import {createCourtyard} from './courtyard.js';
import {HeritageCameraRig} from './camera-rig.js';
import {HeroOcclusion} from './hero-occlusion.js';
import {createJourneyPlay} from './journey-play.js';
import {createCompoundPlay} from './compound-play.js';
import {createImportedCompound} from './compound-glb.js';
import {createCompoundLighting} from './compound-lighting.js';
import {createCloudFlight} from './cloud-flight.js';
import {createCloudFlightUI} from './cloud-flight-ui.js';
import {moveWalker,canStand,groundHeight} from './walk-controller.js';
import {WALK_SPEED,RUN_SPEED,frameDelta,substepMove} from './movement.js';
import {createSceneMapUI} from './scene-map-ui.js';
import {createJourneyMapData,createCompoundMapData,createCourtyardMapData} from './scene-map-data.js';
import {createMobileControls} from './mobile-controls.js';
import {createTouchJoystick} from './touch-joystick.js';
import {createImportGuide} from './import-guide.js';

const $=id=>document.getElementById(id),loader=new GLTFLoader();
const stops=[
 {name:'佛光寺',region:'山西 · 五台',model:'hall',lon:113.4,lat:38.9,title:'看一座殿，读唐风',text:'佛光寺东大殿是唐代木构建筑的重要代表。走到檐下，试着观察柱、梁与屋顶如何层层相接。眼前殿堂为通用木构示范，不复原佛光寺的实际形制。',source:'https://www.tup.tsinghua.edu.cn/booksCenter/book_06588001.html'},
 {name:'应县木塔',region:'山西 · 应县',model:'tower',lon:113.2,lat:39.6,title:'层檐之间，木的力量',text:'应县木塔始建于辽代。层层出檐与木构组合，是观察古建筑的一个入口。眼前为三层方形教学塔，与真实木塔的八角形制、层数不同。',source:'https://www.tonghuaxian.gov.cn/thxfb/202603/t20260323_768452.html'},
 {name:'独乐寺',region:'天津 · 蓟州',model:'pavilion',lon:117.4,lat:40.0,title:'走进木构的故事',text:'独乐寺保存有山门、观音阁等古建筑。把目光放慢，看看建筑如何借由柱网组织空间。眼前亭阁为开放式展示原型，并非观音阁复原。',source:'https://www.tj.gov.cn/sq/yztj/jqjs/202005/t20200520_2467995.html'}
];
let visited=new Set();try{const saved=JSON.parse(localStorage.getItem('wukong-heritage-v1')||'[]');if(Array.isArray(saved))visited=new Set(saved.filter(n=>Number.isInteger(n)&&n>=0&&n<3));}catch{}
let current=0,hero,mixer,walk,building,collider,loading=false,loadToken=0,custom=false,toastTimer,activeAsset=null;
const cameraRig=new HeritageCameraRig(),cameraBounds=[];
let viewMode='hero',courtyard,journey,compound; 
const followPosition=new THREE.Vector3(),followDelta=new THREE.Vector3();
const keys=new Set(),canvas=$('scene'),scene=new THREE.Scene();scene.background=new THREE.Color('#9dbcdc');scene.fog=new THREE.Fog('#c4d6d6',42,115);
const camera=new THREE.PerspectiveCamera(42,1,.1,400);camera.position.set(21,16,28);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:false});renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<=800?1.5:1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
const gl=renderer.getContext(),occlusion=new HeroOcclusion({samples:gl.getParameter(gl.SAMPLES)}),occlusionViewport=new THREE.Vector2();
const controls=new OrbitControls(camera,canvas);controls.target.set(0,2,2);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=3.8;controls.maxDistance=48;controls.maxPolarAngle=Math.PI*.60;controls.minPolarAngle=.25;
const hemisphere=new THREE.HemisphereLight('#d5e5ff','#8a7257',1.7);scene.add(hemisphere);const sun=new THREE.DirectionalLight('#ffe2b0',3.0);sun.position.set(-18,28,18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:100});sun.shadow.normalBias=.025;sun.shadow.bias=-.0001;scene.add(sun,sun.target);
const compoundLighting=createCompoundLighting(sun);
const rim=new THREE.DirectionalLight('#e2eeff',1.1);rim.position.set(10,12,-20);scene.add(rim);
const environment=createReferenceEnvironment(scene);
const cloud=createCloudFlight({scene,getHero:()=>hero,toast});
let touchVertical=0,joystick=null;
const joystickInput={x:0,z:0};
const cloudUI=createCloudFlightUI({onToggle:toggleCloud,onVertical:value=>{touchVertical=value;}});
function clearMovementInput(){keys.clear();touchVertical=0;joystick?.reset();joystickInput.x=0;joystickInput.z=0;}
function joystickAllowed(){return Boolean(hero&&!loading&&!document.hidden&&!journey?.opening&&!document.querySelector('dialog[open]')&&(!compound?.active||compound.mode==='walk')&&document.body.classList.contains('mobile-game'));}
function toggleCloud(){
 if(loading||!hero||document.querySelector('dialog[open]'))return;
 clearMovementInput();const wasActive=cloud.active;
 if(cloud.toggle()&&!wasActive){viewMode='hero';frameView();}
 renderer.shadowMap.needsUpdate=true;
}
const ring=new THREE.Mesh(new THREE.TorusGeometry(.8,.055,8,40),new THREE.MeshStandardMaterial({color:'#e2b46e',emissive:'#8a5522',emissiveIntensity:.4}));ring.rotation.x=Math.PI/2;ring.position.set(0,.08,5.8);scene.add(ring);
function toast(text,ms=4000){clearTimeout(toastTimer);$('status').textContent=text;if(ms)toastTimer=setTimeout(()=>$('status').textContent='',ms);}
function shadows(root){root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});}
function dispose(root){if(!root)return;const gs=new Set(),ms=new Set(),ts=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.remove(root);}
function installBuilding(gltf,external=false,dimensions={width:16,height:8}){const root=gltf.scene;let b=new THREE.Box3().setFromObject(root),s=b.getSize(new THREE.Vector3());if(![...b.min,...b.max].every(Number.isFinite)||Math.max(s.x,s.y,s.z)<=0)throw Error('模型没有可见几何体');
 {let scale=Math.min(dimensions.width/Math.max(s.x,s.z),dimensions.height/s.y);root.scale.multiplyScalar(scale);b.setFromObject(root);const center=b.getCenter(new THREE.Vector3());root.position.x-=center.x;root.position.z-=center.z;root.position.y-=b.min.y;}
 occlusion.dispose();cloud.configure(null);clearMovementInput();compound?.leave();environment.setCompoundMode(false);environment.setCliffMode(false);resetCourtyardLight();journey?.leave();scene.background.set('#9dbcdc');scene.fog.color.set('#c4d6d6');sun.color.set('#ffe2b0');environment.setJourneyMode(false);if(courtyard)courtyard.root.visible=true;cameraBounds.length=0;
 shadows(root);renderer.shadowMap.needsUpdate=true;dispose(building);building=root;scene.add(root);b.setFromObject(root);cameraBounds[0]=b.clone().expandByScalar(.25);if(courtyard)cameraBounds.push(...courtyard.cameraBounds);cameraRig.reset();collider={minX:b.min.x-1.65,maxX:b.max.x+1.65,minZ:b.min.z-1.65,maxZ:b.max.z+1.65};ring.position.z=b.max.z+1.4;hero.position.set(0,0,Math.min(20,ring.position.z+4.2));hero.rotation.y=.12;custom=external;ring.visible=!external;activeAsset=null;$('modelDisclosure').textContent=external?'当前为用户提供的模型预览；真实建筑身份未确认。':'场景为原创风格化示范，非文物测绘复原。';
}
async function destination(i){if(loading)return;loading=true;const token=++loadToken;toast('正在前往'+stops[i].name+'……',0);try{const gltf=await loader.loadAsync('/models/heritage-'+stops[i].model+'.glb');if(token!==loadToken){dispose(gltf.scene);return;}installBuilding(gltf,false,stops[i].model==='tower'?{width:10,height:24}:{width:16,height:8});await ensureCourtyard();current=i;const s=stops[i];$('stationNumber').textContent=`0${i+1} / 03`;$('stationName').textContent=s.name;$('stationType').textContent=s.region+' · 风格化场景';$('factTitle').textContent=s.title;$('fact').textContent=s.text;$('source').href=s.source;$('source').hidden=false;frameView();renderDestinations();showCourtyardMap(s.name+' · 示范庭院');toast('已抵达'+s.name+'主题场景 · 走近金色圆环打卡');}catch(e){toast('场景加载失败：'+e.message,0);}finally{loading=false;}}
function renderDestinations(){$('progress').textContent=`${visited.size} / 3`;atlas.refresh();}
const library=createModelLibrary({onLoad:loadLibraryAsset,onReady:()=>atlas.refresh()});
const atlas=createHeritageAtlas({onTravel:i=>{$('map').close();destination(i);},getModels:id=>library.forSite(id),onModel:loadLibraryAsset,getJourney:()=>journey,onJourneyTravel:travelJourney,onRoutes:()=>journey.ui.openRoutes()});
async function loadLibraryAsset(a,site){
 if(loading||!hero){toast('请等待当前场景加载完成');return false;}
 clearMovementInput();$('library').close();$('map').close();loading=true;toast('正在加载 '+a.name+'……',0);
 try{const gltf=await loader.loadAsync(a.url);installBuilding(gltf,true,a.name.includes('塔')?{width:10,height:24}:{width:16,height:8});await ensureCourtyard();activeAsset=a.id;$('stationNumber').textContent='古建模型库';$('stationName').textContent=a.name;$('stationType').textContent=site?`${site.province} · ${site.name} · 候选展示`:'MC 轻量场景 · '+a.category;$('factTitle').textContent=site?'该站候选 · 尚待考证':'从资料走进场景';const match=site?a.matches.find(m=>m.siteId===site.id):a.matches[0];$('fact').textContent=(match?match.reason:'暂未识别真实地点，可作为场景搭建素材。')+' 可绕行观察，当前尚不支持进入建筑内部。';$('source').hidden=true;$('modelDisclosure').textContent=`MC 轻量 GLB · ${(a.bytes/1048576).toFixed(1)} MB。${a.missingColorMaterials?'部分材质缺少贴图。':''}MC 版本依据你提供的资料制作，候选对应未确认。`;frameView();showCourtyardMap(a.name+' · 模型庭院');toast('已载入 '+a.name+' · 拖动查看建筑细节');return true;}catch(e){toast('模型加载失败：'+e.message,0);return false;}finally{loading=false;}
}
async function ensureCourtyard(){
 if(!courtyard){courtyard=await createCourtyard(scene,loader);courtyard.root.visible=!journey?.active;if(!journey?.active)cameraBounds.push(...courtyard.cameraBounds);renderer.shadowMap.needsUpdate=true;}
 occlusion.setRoots([building,courtyard?.root]);
}
function travelJourney(id){
 if(loading||!hero){toast('请等待当前场景加载完成');return;}
 try{
  occlusion.dispose();clearMovementInput();cloud.configure(null);document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  compound?.leave();environment.setCompoundMode(false);resetCourtyardLight();saveExperience('journey');
  const entered=journey.enter(id);if(!entered)return;
  occlusion.setRoots([entered.world.root]);
  cloud.configure(entered.world);
  // Authored map scenes supply their own trees and hills. Hide the generic
  // garden's square background towers so two landscapes never overlap.
  environment.setCliffMode(Boolean(entered.world.flight || entered.world.landmarks));
  dispose(building);building=null;collider=null;custom=false;ring.visible=false;activeAsset=null;
  if(courtyard)courtyard.root.visible=false;environment.setJourneyMode(true);
  cameraBounds.splice(0,cameraBounds.length,...entered.world.cameraBounds);
  const {data,world}=entered;scene.background.set(world.theme.sky);scene.fog.color.set(world.theme.fog);sun.color.set(world.theme.sun);
  if(world.flight){scene.fog.near=65;scene.fog.far=180;hemisphere.intensity=1.45;rim.intensity=.7;}
  const routeProgress=journey.state.progress(data.id);
  $('stationNumber').textContent=`访古路线 · ${routeProgress.done} / ${routeProgress.total}`;
  $('stationName').textContent=data.name;$('stationType').textContent=data.region;
  viewMode='hero';frameView();renderer.shadowMap.needsUpdate=true;
  localMap.setScene(createJourneyMapData(data.id,world),world.root);
  toast('已抵达'+data.name+(world.flight?' · G 上筋斗云，空格升高，Q 降低':' · 沿金色光点寻找观察点'),6000);
 }catch(e){toast('旅程加载失败：'+e.message,0);}
}
journey=createJourneyPlay({scene,getHero:()=>hero,isFlying:()=>cloud.active,blocked,onTravel:travelJourney,onOpenMap:openMap,clearInput:clearMovementInput,toast});
function resetCourtyardLight(){scene.fog.near=42;scene.fog.far=115;hemisphere.intensity=1.7;rim.intensity=1.1;if(compoundLighting.reset())renderer.shadowMap.needsUpdate=true;}
function saveExperience(value){try{localStorage.setItem('wukong-experience-v1',value);}catch{}}
function enterCompound(nextWorld,{duringImport=false}={}){
 if((loading&&!duringImport)||!hero){toast('请等待当前场景加载完成');return;}
 occlusion.dispose();clearMovementInput();cloud.configure(null);environment.setCliffMode(false);document.querySelectorAll('dialog[open]').forEach(d=>d.close());journey.leave();dispose(building);building=null;collider=null;custom=false;ring.visible=false;
 if(courtyard)courtyard.root.visible=false;environment.setCompoundMode(true);
 compound.enter(nextWorld);occlusion.setRoots([compound.world.root]);viewMode='hero';scene.fog.near=65;scene.fog.far=180;scene.fog.color.set('#c5d2c4');
 sun.color.set('#ffe2b0');hemisphere.intensity=1.35;rim.intensity=.65;
 compoundLighting.update({active:true,mode:compound.mode,position:hero.position,world:compound.world});
 renderer.shadowMap.needsUpdate=true;saveExperience('compound');$('stationName').textContent=compound.world.displayName || '山河古建群';
 localMap.setScene(createCompoundMapData(compound.world),compound.world.root);
 toast('穿过山门，走进殿堂与回廊 · V 细看古建，C 俯瞰建筑群');
}
async function downloadCompound(){
 if(!compound?.world)return;
 toast('正在导出古建群模型……',0);
 try{
  const {exportCompoundGLB}=await import('./compound-export.js');
  const buffer=await exportCompoundGLB(compound.world);
  const url=URL.createObjectURL(new Blob([buffer],{type:'model/gltf-binary'}));
  const a=document.createElement('a');a.href=url;a.download='ancient-compound.glb';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);toast('已导出古建群 GLB，可重新导入继续漫游');
 }catch(error){toast('导出失败：'+error.message,0);}
}
compound=createCompoundPlay({scene,camera,controls,renderer,cameraRig,canvas,environment,getHero:()=>hero,clearInput:clearMovementInput,onEnter:enterCompound,onExit:()=>travelJourney(journey.state.activeId),onExport:downloadCompound,toast});
const localMap=createSceneMapUI({onOpen:clearMovementInput,onAtlas:openMap});
createMobileControls({clearInput:clearMovementInput});
joystick=createTouchJoystick({element:$('moveJoystick'),onMove:({x,z})=>{joystickInput.x=x;joystickInput.z=z;},isEnabled:joystickAllowed});
let mapElapsed=0;
function showCourtyardMap(title){
 if(!building)return;
 const root=new THREE.Group();root.add(building.clone(true));if(courtyard)root.add(courtyard.root.clone(true));
 localMap.setScene(createCourtyardMapData({id:activeAsset?'model-'+activeAsset:custom?'import-'+building.uuid:'demo-'+current,title,building,courtyard,ring,custom}),root);
}

function openMap(){clearMovementInput();atlas.open();} $('mapButton').onclick=openMap;$('mapButton').hidden=true;
addEventListener('keydown',e=>{
 if(e.target.matches('input,textarea,select')||e.target.isContentEditable)return;
 const dialog=document.querySelector('dialog[open]');
 if(dialog){if(e.code==='KeyM'&&!e.repeat&&dialog===$('map'))$('map').close();if(e.code==='KeyN'&&!e.repeat&&dialog===$('sceneMap'))$('sceneMap').close();return;}
 if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.code))e.preventDefault();
 if(cloud.available&&['KeyG','Space','KeyQ'].includes(e.code))e.preventDefault();
 if(e.code==='KeyG'&&!e.repeat){if(cloud.available)toggleCloud();else toast('筋斗云可在悬空寺路线中使用');return;}
 if(compound.active&&e.code==='Escape'&&!e.repeat){compound.setMode('walk');return;}
 if(compound.active&&e.code==='KeyV'&&!e.repeat){compound.inspect();return;}
 if(compound.active&&e.code==='KeyR'&&!e.repeat){compound.reset();return;}
 if(e.code==='KeyE'&&!e.repeat){journey.interact();return;}
 if(e.code==='KeyR'&&!e.repeat&&journey.active){clearMovementInput();cloud.reset();hero.position.fromArray(journey.world.spawn);frameView();renderer.shadowMap.needsUpdate=true;toast('已回到本程入口');return;}
 if(e.code==='KeyC'&&!e.repeat){toggleView();return;}
 if(e.code==='KeyM'&&!e.repeat){openMap();return;}
 if(e.code==='KeyN'&&!e.repeat){localMap.open();return;}
 keys.add(e.code);
});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',clearMovementInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearMovementInput();});
$('stamp').onclick=()=>{if(!hero||hero.position.distanceTo(ring.position)>2.4||custom)return;visited.add(current);try{localStorage.setItem('wukong-heritage-v1',JSON.stringify([...visited]));}catch{toast('已打卡；浏览器未允许保存进度');return;}renderDestinations();toast(visited.size===3?'三程已过，山河入册。恭喜完成首批访古之旅！':'已收藏「'+stops[current].name+'」足迹');};
$('photo').onclick=()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='悟空访古-'+$('stationName').textContent+'.png';a.href=canvas.toDataURL('image/png');a.click();toast('留影已保存');};
const architecturePhotoButton=document.createElement('button');architecturePhotoButton.type='button';architecturePhotoButton.id='architecturePhotoButton';architecturePhotoButton.textContent='建筑写实纪念照';
architecturePhotoButton.onclick=()=>{if(!journey.knowledge.openPhoto())toast('请先从访古地图进入一条主题建筑路线');};
$('photo').before(architecturePhotoButton);
const importGuide=createImportGuide({trigger:$('importButton'),fileInput:$('glbFile'),clearInput:clearMovementInput});
$('glbFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 if(loading||!hero){importGuide.showError('请等待当前场景加载完成后重试');e.target.value='';return;}
 loading=true;clearMovementInput();importGuide.setBusy(true);toast('正在读取建筑模型……',0);
 try{
  if(file.size>96*1024*1024)throw Error('单个 GLB 限制为 96 MiB');
  const buf=await file.arrayBuffer(),v=new DataView(buf);
  if(buf.byteLength<20||v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==buf.byteLength)throw Error('请选择有效的 GLB 2.0 文件');
  const len=v.getUint32(12,true);
  if(v.getUint32(16,true)!==0x4e4f534a||20+len>buf.byteLength)throw Error('GLB JSON 数据不完整');
  const doc=JSON.parse(new TextDecoder().decode(buf.slice(20,20+len)));
  for(const resource of [...(doc.images||[]),...(doc.buffers||[])])if(resource.uri&&!resource.uri.startsWith('data:'))throw Error('请导出贴图全部内嵌的 GLB');
  const gltf=await loader.parseAsync(buf,'');const importedWorld=createImportedCompound(gltf);
  if(importedWorld){enterCompound(importedWorld,{duringImport:true});importGuide.close();toast('已导入 '+importedWorld.displayName+' · 可进入殿堂漫游');return;}
  installBuilding(gltf,true);$('stationName').textContent='我的古建';$('stationType').textContent=file.name;
  $('factTitle').textContent='模型预览庭院';$('fact').textContent='已按庭院大小自动缩放并落地。当前使用包围盒碰撞，无法进入模型内部；可在访古地图中返回示范场景。';
  $('source').hidden=true;frameView();showCourtyardMap('我的古建 · 模型庭院');importGuide.close();toast('模型已导入 · 只在本次浏览器会话中展示');
 }catch(err){importGuide.showError(err.message);toast('导入失败：'+err.message,0);}
 finally{loading=false;importGuide.setBusy(false);e.target.value='';}
};
let mobileView;
function frameView(){
 if(compound?.active){compound.frameCamera();return;}
 cameraRig.reset();
 const mobile=innerWidth<=800;camera.fov=mobile?62:50;
 if(viewMode==='hero'&&hero){
  if(journey?.active&&journey.state.activeId==='xuankong'){scene.fog.near=65;scene.fog.far=180;}
  const monument=journey?.active&&journey.state.activeId!=='shisi';
  followPosition.copy(hero.position);controls.target.copy(hero.position).add(new THREE.Vector3(0,cloud.active?1.2:monument?(mobile?2.5:2.7):(mobile?1.9:2.1),-.15));
  camera.position.copy(hero.position).add(new THREE.Vector3(mobile?0:3.2,cloud.active?3.8:mobile?3:3.1,cloud.active?9.2:mobile?8.8:8.2));
  controls.minDistance=3.8;controls.maxDistance=25;
 }else if(journey?.active&&journey.state.activeId==='xuankong'){
  // Fit the whole amphitheatre, including its rear ridge, on narrow screens.
  // Walking retains the close human-scale view; overview shows the depth.
  controls.target.set(0,14,-23);
  const halfFov=THREE.MathUtils.degToRad(camera.fov*.5);
  const distance=Math.max(92,47/(Math.tan(halfFov)*Math.min(camera.aspect,1.35))+28);
  scene.fog.near=Math.max(65,distance*.7);scene.fog.far=distance+160;
  camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(mobile ? .06 : .34,.29,1).normalize(),distance);
  controls.minDistance=12;controls.maxDistance=Math.max(140,distance*1.25);
 }else{
  const h=journey?.active?new THREE.Box3().setFromObject(journey.world.root).getSize(new THREE.Vector3()).y:custom&&building?new THREE.Box3().setFromObject(building).getSize(new THREE.Vector3()).y:5;
  controls.target.set(0,journey?.active?h*.36:custom?Math.max(2,h*.4):2,journey?.active?-6:mobile?3:2);camera.position.set(mobile?0:24,journey?.active?Math.max(16,h*.62):mobile?22:16,journey?.active?(mobile?52:38):mobile?33:28);controls.minDistance=9;controls.maxDistance=70;
 }
 camera.updateProjectionMatrix();controls.update();
 $('cameraMode').textContent=viewMode==='hero'?'建筑全景':'跟随悟空';$('cameraMode').setAttribute('aria-pressed',String(viewMode==='overview'));
}
function toggleView(){if(compound?.active){compound.toggleView();return;}viewMode=viewMode==='hero'?'overview':'hero';frameView();}
$('cameraMode').onclick=toggleView;
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;const mobile=innerWidth<=800;if(mobileView!==mobile){mobileView=mobile;frameView();}camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
function blocked(x,z){if(journey?.active)return !canStand(journey.world,x,z);return Math.abs(x)>24||Math.abs(z)>25||environment.colliders.some(b=>x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ)||courtyard?.colliders.some(b=>x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ)||(collider&&x>collider.minX&&x<collider.maxX&&z>collider.minZ&&z<collider.maxZ);}
const clock=new THREE.Clock(),forward=new THREE.Vector3(),right=new THREE.Vector3(),move=new THREE.Vector3();
const qaEnabled=new URLSearchParams(location.search).has('qa');
const stampButton=$('stamp');let stampState='',shadowSettling=0,qaElapsed=0,qaPanel,qaFrameSeconds=0,qaFrames=0;
const desiredFollow=new THREE.Vector3();
function frame(){
 requestAnimationFrame(frame);
 const rawDt=clock.getDelta(),dt=frameDelta(rawDt);
 if(qaEnabled&&rawDt>0&&rawDt<1){qaFrameSeconds+=rawDt;qaFrames++;}
 cameraRig.restore(camera);
 let moving=false;const running=keys.has('ShiftLeft')||keys.has('ShiftRight');
 const paused=loading||document.hidden||journey.opening||Boolean(document.querySelector('dialog[open]'));
 const movementAllowed=Boolean(hero&&!paused&&(!compound.active||compound.mode==='walk'));
 joystick.setEnabled(movementAllowed&&document.body.classList.contains('mobile-game'));
 move.set(0,0,0);
 if(movementAllowed){
  const x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+joystickInput.x;
  const z=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'))+joystickInput.z;
  camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,THREE.Object3D.DEFAULT_UP);
  move.copy(forward).multiplyScalar(z).addScaledVector(right,x);
  if(move.lengthSq()>0){
   // Keep the stick's analogue speed, while capping combined/diagonal input.
   if(move.lengthSq()>1)move.normalize();const speed=(running?RUN_SPEED:WALK_SPEED)*dt,oldX=hero.position.x,oldZ=hero.position.z;
   if(cloud.active){/* Cloud motion resolves below in all three dimensions. */}
   else if(compound.active)moveWalker(compound.world,hero.position,move.x*speed,move.z*speed);
   else if(journey.active)moveWalker(journey.world,hero.position,move.x*speed,move.z*speed);
   else substepMove(hero.position,move.x*speed,move.z*speed,(x,z)=>!blocked(x,z));
   moving=Math.hypot(hero.position.x-oldX,hero.position.z-oldZ)>.0001;
   const desired=Math.atan2(move.x,move.z),delta=Math.atan2(Math.sin(desired-hero.rotation.y),Math.cos(desired-hero.rotation.y));
   hero.rotation.y+=delta*(1-Math.exp(-12*dt));
  }
 }
 if(hero&&cloud.available){
  const vertical=touchVertical||Number(keys.has('Space'))-Number(keys.has('KeyQ'));
  const flightStep=cloud.update(dt,{direction:move,vertical,boost:running,paused});
  moving=moving||flightStep.moved;
 }
 if(moving)shadowSettling=.6;shadowSettling=Math.max(0,shadowSettling-dt);
 if(journey.opening)renderer.shadowMap.needsUpdate=true;
 if(shadowSettling>0)renderer.shadowMap.needsUpdate=true;
 hero?.userData.animate?.(paused?0:dt,moving&&!cloud.active,running&&!cloud.active);
 if(hero){
  journey.update(dt,camera);compound.update(dt,moving,move);
  if((mapElapsed+=dt)>=.1){
   mapElapsed=0;
   cloudUI.update({enabled:cloud.available,active:cloud.active,status:cloud.status,altitude:hero.position.y,paused});
   const doneIds=compound.active?compound.reached.map(i=>'compound-'+i):journey.active?journey.state.completed.filter(id=>id.startsWith(journey.state.activeId+'-')):!custom&&visited.has(current)?['courtyard-stamp']:[];
   const targetId=compound.active?(compound.reached.length<compound.world.walkRoute.length?'compound-'+compound.guideIndex:null):journey.active?journey.target?.id:custom||visited.has(current)?null:'courtyard-stamp';
   localMap.update({position:hero.position,heading:hero.rotation.y,doneIds,targetId,paused:compound.active&&compound.mode!=='walk'});
  }
  const near=hero.position.distanceTo(ring.position)<2.4;
  const text=custom?'自定义模型预览':visited.has(current)?'✓ 已留下足迹':near?'收下这一程的故事':'靠近建筑前的金色圆环';
  const disabled=!near||custom||loading,state=text+disabled;
  if(!journey.active&&!compound.active&&state!==stampState){stampButton.disabled=disabled;stampButton.textContent=text;stampState=state;}
  if(viewMode==='hero'&&!compound.active){
   desiredFollow.copy(hero.position);if(moving)desiredFollow.addScaledVector(move,.45);
   desiredFollow.lerpVectors(followPosition,desiredFollow,1-Math.exp(-10*dt));
   followDelta.subVectors(desiredFollow,followPosition);camera.position.add(followDelta);controls.target.add(followDelta);followPosition.copy(desiredFollow);
  }
 }
 controls.update();camera.position.y=Math.max(.55,camera.position.y);
 if(compound.active)compound.resolve();
 else if(journey.active)camera.position.y=Math.max(groundHeight(journey.world,camera.position.x,camera.position.z)+.3,camera.position.y);
 // Retain the orbit distance through buildings. The foreground alone fades;
 // neither the camera nor the hero snaps away when crossing a doorway.
 if(hero)occlusion.update({camera,position:hero.position,viewport:renderer.getDrawingBufferSize(occlusionViewport),
  enabled:compound.active?compound.mode==='walk':viewMode==='hero',dt});
 if(compound.active&&compoundLighting.update({active:true,mode:compound.mode,position:hero.position,world:compound.world}))renderer.shadowMap.needsUpdate=true;
 if(journey.active&&cloud.available&&compoundLighting.update({active:true,mode:viewMode==='hero'?'walk':'overview',position:hero.position}))renderer.shadowMap.needsUpdate=true;
 environment.update(hero,cloud.active,camera);
 renderer.render(scene,camera);
 if(qaEnabled&&(qaElapsed+=dt)>.5){
  qaElapsed=0;if(!qaPanel){qaPanel=document.createElement('pre');qaPanel.id='qa-report';qaPanel.style.cssText='position:fixed;left:8px;top:250px;background:#fffD;font:11px monospace;max-width:440px;max-height:180px;overflow:auto;z-index:99';document.body.append(qaPanel);}
  qaPanel.textContent=JSON.stringify({position:hero?.position.toArray(),flight:cloud.available?{status:cloud.status,active:cloud.active}:null,movement:{walk:WALK_SPEED,run:RUN_SPEED},frameMs:qaFrames?Math.round(qaFrameSeconds/qaFrames*10000)/10:null,cameraDistance:cameraRig.distance,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,compound:compound.active?{mode:compound.mode,selected:compound.selected,indoor:compound.indoorId,guide:compound.guideIndex,reached:compound.reached}:null,journey:journey.active?journey.state.activeId:null,completed:journey.state.completed,target:journey.target?.id,courtyard:journey.active?null:courtyard?.report},null,2);
  qaFrames=0;qaFrameSeconds=0;
  qaPanel.dataset.heroModel=hero?.userData.modelUrl||'';qaPanel.dataset.heroAnimation=hero?.userData.animation||'';
 }
}
async function start(){try{
 // The supplied GLB owns the protagonist's appearance and animation clips.
 loading=true;hero=createGLBHero(await loader.loadAsync(HERO_MODEL_URL));scene.add(hero);loading=false;let experience;try{experience=localStorage.getItem('wukong-experience-v1');}catch{}if(experience==='journey')travelJourney(journey.state.activeId);else enterCompound();frame();
 // Always begin with destination selection, including visits with saved progress.
 openMap();
 // Model-library refreshes replace route buttons; keep initial focus stable.
 $('atlasTitle').tabIndex=-1;$('atlasTitle').focus({preventScroll:true});
 window.__heritage={scene,hero,stops,renderer,camera,controls,occlusion,toggleView,journey,travelJourney,compound,enterCompound,get viewMode(){return viewMode;},destination,get current(){return current;},get visited(){return [...visited];},get collider(){return collider;},get custom(){return custom;},library,loadLibraryAsset,get activeAsset(){return activeAsset;},get building(){return building;},get courtyard(){return courtyard;}};
}catch(e){loading=false;toast('启动失败：'+e.message,0);}}
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',clearMovementInput));
$('libraryButton').addEventListener('click',clearMovementInput);
start();

