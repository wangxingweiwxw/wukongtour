import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {frameDelta} from './movement.js';

// Distances are metres, speeds metres/second. The cloud, stowed staff and hero
// all fit inside this swept envelope; the visible cloud never changes physics.
export const CLOUD_FLIGHT = Object.freeze({speed:7, boostSpeed:11, verticalSpeed:5,
  radius:1.1, belowFeet:.48, height:2.15, takeoffHeight:2.2, response:8});
const EPS=1e-5;
const AXES=['x','y','z'];
const DEFAULT_GROUND={minX:-24,maxX:24,minZ:-25,maxZ:25};

/** A single merged, vertex-coloured cloud: stepped curls, a solid footrest and
 * warm lower edges. It is live 3D geometry, independent of the character rig. */
export function createNimbus(){
  const root=new THREE.Group();root.name='JindouCloud';root.visible=false;
  const pieces=[];
  function box(x,y,z,w,h,d,color){
    const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);
    const rgb=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3)rgb.toArray(colors,i);
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));pieces.push(g);
  }
  const shades=['#fff3d1','#ffe4a5','#fff8df','#f6d38a'];
  // Occupied ellipse rather than separate floating boxes: the centre is solid.
  for(let ix=-5;ix<=5;ix++)for(let iz=-4;iz<=4;iz++){
    const x=ix*.18,z=iz*.18,r=x*x/1.02+z*z/.69;
    if(r>1)continue;
    const h=.15+(1-r)*.13;
    box(x,-.15-h*.5,z,.19,h,.19,shades[(ix*ix+iz*iz)%shades.length]);
    if(r>.62)box(x,-.27-h*.27,z,.18,.09,.18,'#d9ac56');
  }
  box(0,-.078,0,.96,.15,.88,'#fff5d9');
  // Side curls rise at the rim; never cross the boots on the central footrest.
  for(const s of [-1,1]){
    const curl=[[.48,-.15,.43],[.66,-.08,.41],[.79,.015,.30],[.76,.09,.12],[.61,.08,.04],[.55,-.02,.12]];
    curl.forEach(([x,y,z],i)=>box(s*x,y,z-.05,.21,.15,.21,shades[(i+1)%4]));
    for(let i=0;i<4;i++)box(s*(.40-i*.07),-.24-i*.035,-.59-i*.085,.28-i*.025,.13,.23,shades[i%4]);
  }
  const geometry=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,
    emissive:'#a76f21',emissiveIntensity:.11,flatShading:true});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='NimbusVoxelCurls';
  mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  root.userData.triangles=geometry.index.count/3;
  return root;
}

function inflatedObstacle(box){
  return new THREE.Box3(
    new THREE.Vector3(box.min.x-CLOUD_FLIGHT.radius,box.min.y-CLOUD_FLIGHT.height,box.min.z-CLOUD_FLIGHT.radius),
    new THREE.Vector3(box.max.x+CLOUD_FLIGHT.radius,box.max.y+CLOUD_FLIGHT.belowFeet,box.max.z+CLOUD_FLIGHT.radius));
}
function finitePosition(p){return p&&[p.x,p.y,p.z].every(Number.isFinite);}
function columnBlocked(boxes,x,z,bottom,top){
  return boxes.some(b=>x>b.min.x-EPS&&x<b.max.x+EPS&&z>b.min.z-EPS&&z<b.max.z+EPS&&
    top>b.min.y+EPS&&bottom<b.max.y-EPS);
}

/** Headless-testable controller. configure/reset leave the hero transform alone:
 * scene travel and respawn own their positions. G never teleports the player. */
export function createCloudFlight({scene,getHero,toast=()=>{}}){
  const cloud=createNimbus();scene?.add(cloud);
  let world=null,bounds=null,obstacles=[],status='off',clock=0;
  let transitionStart=0,transitionTarget=0,transitionTime=0,transitionDuration=0;
  const velocity=new THREE.Vector3(),targetVelocity=new THREE.Vector3(),delta=new THREE.Vector3();
  const previous=new THREE.Vector3(),responseDelta=new THREE.Vector3();

  function reset(){status='off';cloud.visible=false;velocity.set(0,0,0);clock=0;transitionTime=0;}
  function configure(nextWorld){
    reset();world=nextWorld?.flight?nextWorld:null;
    bounds=world?.flight.bounds??null;
    obstacles=(world?.flight.obstacles??[]).map(inflatedObstacle);
  }
  function withinHorizontal(p,b){return p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ;}
  function landingClear(p){
    const ground=world.flight.landingBounds??DEFAULT_GROUND;
    if(!withinHorizontal(p,ground))return false;
    if(world.colliders?.some(b=>p.x>b.minX-EPS&&p.x<b.maxX+EPS&&p.z>b.minZ-EPS&&p.z<b.maxZ+EPS))return false;
    return !columnBlocked(obstacles,p.x,p.z,0,p.y);
  }
  function toggle(){
    const hero=getHero();
    if(!world||!bounds||!finitePosition(hero?.position))return false;
    const p=hero.position;
    if(status==='takeoff'||status==='landing')return false;
    if(status==='off'){
      const target=Math.max(CLOUD_FLIGHT.takeoffHeight,bounds.minY,p.y);
      if(!withinHorizontal(p,{minX:bounds.minX+CLOUD_FLIGHT.radius,maxX:bounds.maxX-CLOUD_FLIGHT.radius,
          minZ:bounds.minZ+CLOUD_FLIGHT.radius,maxZ:bounds.maxZ-CLOUD_FLIGHT.radius})||target>bounds.maxY||
          columnBlocked(obstacles,p.x,p.z,p.y,target)){
        toast('上方空间不足，走到开阔处再按 G 召唤筋斗云');return false;
      }
      transitionStart=p.y;transitionTarget=target;transitionTime=0;transitionDuration=.85;
      status='takeoff';velocity.set(0,0,0);cloud.visible=true;syncVisual(0);
      toast('筋斗云 · WASD 飞行，空格上升，Q 下降，Shift 加速；G 安全落地',6500);return true;
    }
    if(!landingClear(p)){
      toast('此处无法落地：请飞回地面步道上方，再按 G');return false;
    }
    transitionStart=p.y;transitionTarget=0;transitionTime=0;
    transitionDuration=Math.max(.75,p.y/5);status='landing';velocity.set(0,0,0);
    toast('正在平稳落地……');return true;
  }
  // Sweep each axis against the Minkowski-expanded obstacles. Even a wall much
  // thinner than one frame's travel is hit exactly; free axes still slide.
  function sweep(p,axis,amount,min,max){
    if(!amount)return false;
    const original=p[axis],wanted=original+amount;
    let end=THREE.MathUtils.clamp(wanted,min,max);
    const other=AXES.filter(a=>a!==axis);
    for(const b of obstacles){
      if(!other.every(a=>p[a]>b.min[a]+EPS&&p[a]<b.max[a]-EPS))continue;
      if(amount>0&&original<=b.min[axis]+EPS&&end>b.min[axis]-EPS)end=Math.min(end,b.min[axis]-EPS);
      if(amount<0&&original>=b.max[axis]-EPS&&end<b.max[axis]+EPS)end=Math.max(end,b.max[axis]+EPS);
    }
    p[axis]=end;
    const hit=Math.abs(end-wanted)>EPS;
    if(hit)velocity[axis]=0;
    return hit;
  }
  function syncVisual(dt){
    const hero=getHero();if(!hero)return;
    cloud.visible=status!=='off';cloud.position.copy(hero.position);
    // Tiny visual breathing is below the feet, never applied to physical height.
    cloud.position.y+=Math.sin(clock*2.7)*.009;
    cloud.rotation.y=hero.rotation.y;
    const side=velocity.x*Math.cos(hero.rotation.y)-velocity.z*Math.sin(hero.rotation.y);
    cloud.rotation.z=THREE.MathUtils.lerp(cloud.rotation.z,-side*.007,1-Math.exp(-7*dt));
    cloud.scale.setScalar(status==='landing'?Math.min(1,.25+hero.position.y*1.5):
      status==='takeoff'?Math.min(1,.4+transitionTime*2):1);
  }
  function update(seconds,{direction,vertical=0,boost=false,paused=false}={}){
    const hero=getHero(),dt=frameDelta(seconds);
    if(!world||status==='off'||!finitePosition(hero?.position))return {moved:false,blocked:false,status};
    const p=hero.position;previous.copy(p);
    if(paused||!dt){if(paused)velocity.set(0,0,0);syncVisual(0);return {moved:false,blocked:false,status};}
    clock+=dt;let blocked=false;
    if(status==='takeoff'||status==='landing'){
      transitionTime=Math.min(transitionDuration,transitionTime+dt);
      const t=transitionTime/transitionDuration,eased=t*t*(3-2*t);
      // The complete vertical column was verified before beginning either mode.
      p.y=THREE.MathUtils.lerp(transitionStart,transitionTarget,eased);
      if(t>=1-EPS){
        p.y=transitionTarget;
        if(status==='landing'){status='off';cloud.visible=false;toast('已落地 · G 再次乘云');}
        else status='flying';
      }
    }else{
      const speed=boost?CLOUD_FLIGHT.boostSpeed:CLOUD_FLIGHT.speed;
      const x=Number.isFinite(direction?.x)?direction.x:0,z=Number.isFinite(direction?.z)?direction.z:0;
      const h=Math.max(1,Math.hypot(x,z));
      targetVelocity.set(x/h*speed,THREE.MathUtils.clamp(Number.isFinite(vertical)?vertical:0,-1,1)*CLOUD_FLIGHT.verticalSpeed,z/h*speed);
      if(targetVelocity.length()>speed)targetVelocity.setLength(speed);
      // Exact integral of exponential velocity response, not per-frame lerp.
      // Equal elapsed time gives equal open-space travel at 10..144 FPS.
      const blend=1-Math.exp(-CLOUD_FLIGHT.response*dt);
      delta.copy(targetVelocity).multiplyScalar(dt).addScaledVector(responseDelta.copy(velocity).sub(targetVelocity),blend/CLOUD_FLIGHT.response);
      velocity.lerp(targetVelocity,blend);
      const count=Math.max(1,Math.ceil(delta.length()/.12));delta.divideScalar(count);
      for(let i=0;i<count;i++){
        blocked=sweep(p,'x',delta.x,bounds.minX+CLOUD_FLIGHT.radius,bounds.maxX-CLOUD_FLIGHT.radius)||blocked;
        blocked=sweep(p,'z',delta.z,bounds.minZ+CLOUD_FLIGHT.radius,bounds.maxZ-CLOUD_FLIGHT.radius)||blocked;
        blocked=sweep(p,'y',delta.y,Math.max(.65,bounds.minY),bounds.maxY)||blocked;
      }
    }
    syncVisual(dt);
    return {moved:p.distanceToSquared(previous)>1e-12,blocked,status};
  }
  function dispose(){reset();cloud.removeFromParent();cloud.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});world=null;}
  return {configure,toggle,update,reset,dispose,cloud,
    get active(){return status!=='off';},get available(){return !!world;},get status(){return status;},
    get altitude(){return getHero()?.position.y??0;}};
}
