import {Asset,Geometry} from './mesh.mjs';
import {addVegetation} from './vegetation.mjs';

const DEFAULT_MATERIALS={
  stone:{color:'#b6b09e',roughness:.96},stoneDark:{color:'#8e938a',roughness:1},
  timber:{color:'#76513a',roughness:.9},timberDark:{color:'#49392d',roughness:.94},
  red:{color:'#924c3b',roughness:.91},plaster:{color:'#c8b899',roughness:.97},
  tile:{color:'#626c66',roughness:.9},tileLight:{color:'#859085',roughness:.88},
  rock:{color:'#939582',roughness:1},path:{color:'#b2a58b',roughness:1},
  foliage:{color:'#344c35',roughness:1},foliageLight:{color:'#667843',roughness:1},
};
const finite=(v,label)=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error(`${label} must be a finite number`);return v;};
const range=(v,min,max,label)=>{finite(v,label);if(v<min||v>max)throw Error(`${label} must be between ${min} and ${max}`);return v;};
const vec=(v,label)=>{if(!Array.isArray(v)||v.length!==3)throw Error(`${label} must contain [x,y,z]`);return v.map((n,i)=>range(n,-10000,10000,`${label}[${i}]`));};
const list=(v,label)=>{if(v===undefined)return [];if(!Array.isArray(v)||v.length>300)throw Error(`${label} must be an array with at most 300 entries`);return v;};
const identifier=(v,label)=>{if(typeof v!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(v))throw Error(`${label} must be a unique simple identifier`);return v;};
const stepCount=height=>Math.ceil(height/.18-1e-9);

class Site {
  constructor(spec){
    if(!spec||Array.isArray(spec)||typeof spec!=='object')throw Error('Spec must be a JSON object');
    if(spec.version!==1)throw Error('Spec version must be 1');
    if(spec.units!==undefined&&spec.units!=='meters')throw Error('Only meters are supported');
    this.spec=spec;this.walk=spec.walk!==false;this.materials={...DEFAULT_MATERIALS,...spec.materials};
    for(const [name,m] of Object.entries(this.materials)){
      if(!m||!/^#[\da-fA-F]{6}$/.test(m.color))throw Error(`materials.${name}.color must be #rrggbb`);
      range(m.roughness??.9,0,1,`${name}.roughness`);range(m.metallic??0,0,1,`${name}.metallic`);
    }
    this.asset=new Asset(String(spec.name||'Heritage architecture'),this.materials);
    this.colliders=[];this.surfaces=[];this.buildings=[];this.ids=new Set();
    this.extents={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity,minY:Infinity,maxY:-Infinity};
  }
  material(name,fallback){const key=name??fallback;if(!this.materials[key])throw Error(`Unknown material: ${key}`);return key;}
  frame(item,prefix){
    const id=identifier(item.id,`${prefix}.id`);if(this.ids.has(id))throw Error(`Duplicate object id: ${id}`);this.ids.add(id);
    const position=vec(item.position??[0,0,0],`${id}.position`),rotation=finite(item.rotation??0,`${id}.rotation`);
    if(this.walk&&Math.abs(rotation/(Math.PI/2)-Math.round(rotation/(Math.PI/2)))>1e-6)
      throw Error(`${id}: walkable axis-aligned metadata requires rotation in multiples of pi/2; use walk:false for arbitrary yaw`);
    const c=Math.cos(rotation),s=Math.sin(rotation);
    return {id,position,rotation,node:this.asset.group(id,0,position,rotation),
      point:([x,y,z])=>[position[0]+c*x+s*z,position[1]+y,position[2]-s*x+c*z]};
  }
  rect(frame,x,z,w,d){
    const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([a,b])=>frame.point([x+a*w/2,0,z+b*d/2]));
    return {minX:Math.min(...corners.map(p=>p[0])),maxX:Math.max(...corners.map(p=>p[0])),
      minZ:Math.min(...corners.map(p=>p[2])),maxZ:Math.max(...corners.map(p=>p[2]))};
  }
  collider(frame,x,y,z,w,h,d,padding=.4){
    const r=this.rect(frame,x,z,w,d);
    this.colliders.push({minX:r.minX-padding,maxX:r.maxX+padding,minY:frame.position[1]+y-h/2,
      maxY:frame.position[1]+y+h/2,minZ:r.minZ-padding,maxZ:r.maxZ+padding});
  }
  surface(frame,x,z,w,d,height){this.surfaces.push({...this.rect(frame,x,z,w,d),height:frame.position[1]+height});}
  finish(frame,suffix,geo,extras={}){
    for(const part of geo.parts.values())for(let i=0;i<part.positions.length;i+=3){
      const [x,y,z]=frame.point(part.positions.slice(i,i+3));
      for(const [axis,n] of [['X',x],['Y',y],['Z',z]]){this.extents[`min${axis}`]=Math.min(this.extents[`min${axis}`],n);this.extents[`max${axis}`]=Math.max(this.extents[`max${axis}`],n);}
    }
    return this.asset.addGeometry(`${frame.id}-${suffix}`,geo,frame.node,extras);
  }
}

function stairs(site,frame,geo,{x=0,z=0,width,depth,height,base=0,turn=0,material='stone'}){
  if(height<=0)return;
  const count=stepCount(height),rise=height/count,tread=depth/count;
  const c=Math.cos(turn),s=Math.sin(turn);
  // The bottom tread is at local +Z; the stairs ascend toward local -Z.
  for(let i=0;i<count;i++){
    const zz=depth/2-(i+.5)*tread,y=(i+1)*rise;
    const cx=x+s*zz,cz=z+c*zz,w=Math.abs(c)*width+Math.abs(s)*tread,d=Math.abs(s)*width+Math.abs(c)*tread;
    // Small overlapping tread edges avoid zero-width height seams at a landing;
    // the visible geometry and walkable rectangle use the same dimensions.
    geo.box(cx,base+y/2,cz,w+.02,y,d+.02,material);
    site.surface(frame,cx,cz,w+.02,d+.02,base+y);
  }
}

function roof(geo,{width,depth,y,rise,cornerLift,curve,material,trim}){
  const rows=10,cols=12,halfW=width/2,halfD=depth/2;
  const height=(u,t)=>y+rise*t**curve+cornerLift*Math.abs(u)**7*(1-t)**3+.12*(1-t)**7;
  const face=(u,t,sign)=>[u*halfW*(1-.32*t),height(u,t),sign*halfD*(1-t)];
  const hip=(u,t,sign)=>[sign*halfW*(1-.32*t),height(u,t),u*halfD*(1-t)];
  for(const sign of [-1,1])for(const mapping of [face,hip]){
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const u0=-1+2*col/cols,u1=-1+2*(col+1)/cols,t0=row/rows,t1=(row+1)/rows;
      const a=mapping(u0,t0,sign),b=mapping(u1,t0,sign),c=mapping(u1,t1,sign),d=mapping(u0,t1,sign);
      geo.quad(a,b,c,d,material,[0,1,0]);
      geo.quad(...[a,b,c,d].map(p=>[p[0],p[1]-.2,p[2]]),material,[0,-1,0]);
      if(row===0)geo.quad(a,b,[b[0],b[1]-.2,b[2]],[a[0],a[1]-.2,a[2]],trim,mapping===face?[0,0,sign]:[sign,0,0]);
    }
    const ribs=mapping===face?Math.max(6,Math.min(28,Math.round(width/.9))):6;
    for(let i=0;i<=ribs;i++)for(let row=0;row<rows;row++){
      const a=mapping(-1+2*i/ribs,row/rows,sign),b=mapping(-1+2*i/ribs,(row+1)/rows,sign);
      a[1]+=.045;b[1]+=.045;geo.beam(a,b,.07,.075,trim);
    }
  }
  geo.box(0,y+rise+.11,0,width*.7,.22,.3,trim);
  for(const side of [-1,1]){
    geo.box(side*width*.34,y+rise+.31,0,.32,.45,.36,trim);
    geo.box(side*width*.355,y+rise+.58,0,.2,.24,.3,trim);
  }
}

function building(site,item){
  const type=item.type??'hall';if(!['hall','gate','pavilion'].includes(type))throw Error(`Unsupported building type: ${type}`);
  const f=site.frame(item,'buildings'),w=range(item.width??12,4,100,`${f.id}.width`),d=range(item.depth??8,3,100,`${f.id}.depth`);
  const h=range(item.height??4.4,2.8,30,`${f.id}.height`),base=item.base??{},bh=range(base.height??(type==='gate'?0:.54),0,3,`${f.id}.base.height`);
  const bays=item.bays??3;if(!Number.isInteger(bays)||bays<1||bays>9||bays%2!==1||w/bays<1.4)throw Error(`${f.id}.bays must be odd, 1..9, with bays at least 1.4m wide`);
  const mats=item.materials??{},stone=site.material(mats.base,'stone'),wood=site.material(mats.frame,'red'),beamMat=site.material(mats.beam,'timber');
  const wallMat=site.material(mats.wall,'plaster'),doorMat=site.material(mats.door,'timberDark');
  const body=new Geometry(),foundation=new Geometry(),walls=new Geometry();
  const pw=w+1,pd=d+1,stairDepth=bh?stepCount(bh)*.6:0;
  const door=item.doors??{},doorW=range(door.width??Math.min(2.8,w/bays-.7),.7,Math.min(w-1,w/bays-.4),`${f.id}.doors.width`);
  const doorH=range(door.height??Math.min(2.8,h-.35),2, h-.2,`${f.id}.doors.height`);
  const frontDoor=type==='pavilion'||door.front!==false,backDoor=type==='pavilion'||door.back!==false;
  let stairMode=base.stairs??(type==='pavilion'?'all':'both');
  if(!['front','both','all','none'].includes(stairMode))throw Error(`${f.id}.base.stairs must be front, both, all or none`);
  if(site.walk&&bh>0&&stairMode==='none')throw Error(`${f.id}: raised walkable building needs stairs (or set walk:false)`);
  if(site.walk&&!frontDoor&&!backDoor)throw Error(`${f.id}: walkable building needs at least one open entrance`);
  if(site.walk&&bh>0&&!frontDoor&&stairMode==='front')throw Error(`${f.id}: rear-only entrance needs rear stairs`);
  if(bh>0){
    foundation.box(0,bh/2,0,pw,bh,pd,stone);
    foundation.box(0,bh-.045,0,pw+.08,.09,pd+.08,stone);
    site.surface(f,0,0,pw,pd,bh);
    const sw=Math.max(2.4,doorW+.4);
    if(stairMode!=='none')stairs(site,f,foundation,{z:pd/2+stairDepth/2,width:sw,depth:stairDepth,height:bh,material:stone});
    if(['both','all'].includes(stairMode))stairs(site,f,foundation,{z:-pd/2-stairDepth/2,width:sw,depth:stairDepth,height:bh,turn:Math.PI,material:stone});
    if(stairMode==='all')for(const side of [-1,1])stairs(site,f,foundation,{x:side*(pw/2+stairDepth/2),width:sw,depth:stairDepth,height:bh,turn:side*Math.PI/2,material:stone});
  }
  for(let i=0;i<=bays;i++)for(const z of [-d/2,d/2]){
    const x=-w/2+i*w/bays;
    body.cylinder(x,bh+.12,z,.36,.24,stone,8);
    body.cylinder(x,bh+h/2,z,.23,h,wood,12);site.collider(f,x,bh+h/2,z,.72,h,.72);
    for(let level=0;level<3;level++){
      const span=.65+level*.3,y=bh+h-.6+level*.22;
      body.box(x,y,z,span,.15,.25,beamMat);body.box(x,y+.08,z,.25,.15,span,beamMat);
    }
  }
  for(const z of [-d/2,d/2])body.box(0,bh+h-.12,z,w+.5,.35,.34,beamMat);
  for(const x of [-w/2,w/2])body.box(x,bh+h-.12,0,.34,.35,d,beamMat);
  const wall=(x,y,z,ww,hh,dd)=>{walls.box(x,y,z,ww,hh,dd,wallMat);site.collider(f,x,y,z,ww,hh,dd);};
  if(type!=='pavilion'){
    for(const side of [-1,1]){
      const z=side*d/2,hasDoor=side===1?frontDoor:backDoor;
      if(hasDoor){
        const width=(w-doorW)/2;
        for(const s of [-1,1])wall(s*(doorW/2+width/2),bh+h/2,z,width,h,.18);
        wall(0,bh+doorH+(h-doorH)/2,z,doorW,h-doorH,.18);
        // Always-open timber leaves sit parallel to the passage and never seal it.
        for(const s of [-1,1]){
          walls.box(s*(doorW/2+.06),bh+doorH/2,z-side*.6,.12,doorH,1.2,doorMat);
          site.collider(f,s*(doorW/2+.06),bh+doorH/2,z-side*.6,.12,doorH,1.2,.32);
        }
      }else wall(0,bh+h/2,z,w,h,.18);
    }
    for(const x of [-w/2,w/2])wall(x,bh+h/2,0,.18,h,d);
  }
  site.finish(f,'base',foundation);site.finish(f,'frame',body);site.finish(f,'walls-and-open-doors',walls);
  const r=item.roof??{},levels=r.levels??1;
  if(!Number.isInteger(levels)||levels<1||levels>3)throw Error(`${f.id}.roof.levels must be 1..3`);
  const rise=range(r.rise??Math.max(1.3,d*.22),.5,12,`${f.id}.roof.rise`),overhang=range(r.overhang??1.1,.2,5,`${f.id}.roof.overhang`);
  const lift=range(r.cornerLift??.6,0,2,`${f.id}.roof.cornerLift`),curve=range(r.curve??1.7,1,3,`${f.id}.roof.curve`);
  const roofMaterial=site.material(r.material,'tile'),roofTrim=site.material(r.trimMaterial,'tileLight'),roofNames=[];
  for(let i=0;i<levels;i++){
    const scale=.73**i,y=bh+h+.35+i*(rise*.9+1.15),g=new Geometry();
    roof(g,{width:(w+2*overhang)*scale,depth:(d+2*overhang)*scale,y,rise:rise*scale,cornerLift:lift*scale,curve,material:roofMaterial,trim:roofTrim});
    if(i>0)g.box(0,y-.5,0,w*scale*.9,1.1,d*scale*.85,wood);
    const name=`${f.id}-roof-${i+1}`;site.finish(f,`roof-${i+1}`,g,{isRoof:true,buildingId:f.id});roofNames.push(name);
  }
  const entry=f.point([0,0,(frontDoor?1:-1)*(pd/2+stairDepth+1.2)]),interior=f.point([0,bh,0]);
  const sideEntries=type==='pavilion'&&stairMode==='all'?[-1,1].map(side=>f.point([side*(pw/2+stairDepth+1.2),0,0])):[];
  site.asset.nodes[f.node].extras={buildingId:f.id,type,description:String(item.description??'Original image-informed architectural interpretation')};
  site.buildings.push({id:f.id,name:String(item.name??f.id),description:String(item.description??''),nodeName:f.id,roofNodeNames:roofNames,
    entry,interior,sideEntries,floorBounds:site.rect(f,0,0,pw,pd)});
}

function landscape(site,spec){
  for(const item of list(spec.terraces,'terraces')){
    const f=site.frame(item,'terraces'),g=new Geometry();
    const w=range(item.width,1,200,`${f.id}.width`),d=range(item.depth,1,200,`${f.id}.depth`),h=range(item.height,.01,20,`${f.id}.height`);
    g.box(0,h/2,0,w,h,d,site.material(item.material,'stone'));site.surface(f,0,0,w,d,h);site.finish(f,'slab',g);
  }
  for(const item of list(spec.stairs,'stairs')){
    const f=site.frame(item,'stairs'),g=new Geometry();
    const width=range(item.width,.8,30,`${f.id}.width`),depth=range(item.depth,.6,80,`${f.id}.depth`),height=range(item.height,.01,10,`${f.id}.height`);
    if(depth/stepCount(height)<.25)throw Error(`${f.id}: treads would be narrower than 0.25m`);
    stairs(site,f,g,{width,depth,height,material:site.material(item.material,'stone')});site.finish(f,'treads',g);
  }
  for(const item of list(spec.walls,'walls')){
    const f=site.frame(item,'walls'),g=new Geometry();
    const w=range(item.width,.1,200,`${f.id}.width`),h=range(item.height,.2,20,`${f.id}.height`),d=range(item.thickness??.3,.08,5,`${f.id}.thickness`);
    const m=site.material(item.material,'plaster'),opening=item.opening;
    const add=(x,y,ww,hh)=>{g.box(x,y,0,ww,hh,d,m);site.collider(f,x,y,0,ww,hh,d);};
    if(opening){
      const ow=range(opening.width,.8,w-.2,`${f.id}.opening.width`),oh=range(opening.height,1.8,h-.1,`${f.id}.opening.height`);
      const wing=(w-ow)/2;for(const side of [-1,1])add(side*(ow/2+wing/2),h/2,wing,h);add(0,oh+(h-oh)/2,ow,h-oh);
    }else add(0,h/2,w,h);
    g.box(0,h+.08,0,w+.12,.16,d+.25,'tile');site.finish(f,'wall',g);
  }
  for(const item of list(spec.rocks,'rocks')){
    const f=site.frame(item,'rocks'),g=new Geometry();
    const r=range(item.radius??1,.1,15,`${f.id}.radius`),h=range(item.height??1.3,.1,30,`${f.id}.height`),m=site.material(item.material,'rock');
    const seed=finite(item.seed??spec.seed??17,`${f.id}.seed`),n=9;
    const ring=(i,upper)=>{const a=i*Math.PI*2/n,k=.85+.12*Math.sin(i*3.1+seed);return [Math.cos(a)*r*k*(upper?.65:1),upper?h*(.72+.18*Math.sin(i*1.7+seed)):0,Math.sin(a)*r*k*(upper?.65:1)];};
    for(let i=0;i<n;i++){
      const a=ring(i,false),b=ring((i+1)%n,false),c=ring((i+1)%n,true),d=ring(i,true);
      g.quad(a,b,c,d,m,[a[0],0,a[2]]);g.triangle(d,c,[0,h,0],m,[0,1,0]);g.triangle([0,0,0],b,a,m,[0,-1,0]);
    }
    site.collider(f,0,h/2,0,r*2,h,r*2);site.finish(f,'rock',g);
  }
  for(const item of list(spec.paths,'paths')){
    const f=site.frame({...item,position:[0,0,0],rotation:0},'paths'),g=new Geometry(),points=list(item.points,`${f.id}.points`);
    if(points.length<2)throw Error(`${f.id}.points needs at least two [x,z] pairs`);
    const w=range(item.width??2,.3,30,`${f.id}.width`),m=site.material(item.material,'path');
    const y=range(item.height??0,-20,128,`${f.id}.height`)+.025;
    const normalized=points.map((p,i)=>{if(!Array.isArray(p)||p.length!==2)throw Error(`${f.id}.points[${i}] must be [x,z]`);return [finite(p[0],'path x'),finite(p[1],'path z')];});
    for(let i=1;i<normalized.length;i++){
      const a=normalized[i-1],b=normalized[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1e-6)continue;
      const nx=-dz/length*w/2,nz=dx/length*w/2;
      g.quad([a[0]+nx,y,a[1]+nz],[b[0]+nx,y,b[1]+nz],[b[0]-nx,y,b[1]-nz],[a[0]-nx,y,a[1]-nz],m,[0,1,0]);
    }
    site.finish(f,'paving',g);
  }
}

export function buildArchitecture(spec){
  const site=new Site(spec),items=list(spec.buildings,'buildings');
  if(!items.length)throw Error('At least one building is required');
  for(const item of items)building(site,item);
  landscape(site,spec);
  addVegetation(site,spec);
  const root=site.asset.nodes[0];root.extras.description=String(spec.description??'Agent-authored architectural interpretation of reference imagery; not a measured reconstruction.');
  root.extras.specVersion=1;
  if(site.walk){
    const overrides=spec.walk&&typeof spec.walk==='object'?spec.walk:{};
    const spawn=vec(overrides.spawn??site.buildings[0].entry,'walk.spawn');
    const bounds=overrides.bounds??{minX:Math.floor(Math.min(site.extents.minX,spawn[0])-3),maxX:Math.ceil(Math.max(site.extents.maxX,spawn[0])+3),
      minZ:Math.floor(Math.min(site.extents.minZ,spawn[2])-3),maxZ:Math.ceil(Math.max(site.extents.maxZ,spawn[2])+3)};
    for(const key of ['minX','maxX','minZ','maxZ'])finite(bounds[key],`walk.bounds.${key}`);
    if(bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ)throw Error('walk.bounds must have positive area');
    const walkRoute=overrides.walkRoute??site.buildings.flatMap(b=>[{name:`${b.name} entrance`,position:b.entry},{name:`${b.name} interior`,position:b.interior}]);
    for(const p of list(walkRoute,'walk.walkRoute')){if(typeof p.name!=='string')throw Error('walkRoute name must be a string');vec(p.position,'walkRoute.position');}
    root.extras.heritageScene={version:1,kind:'compound',name:String(spec.name??'Heritage architecture'),description:root.extras.description,bounds,spawn,
      colliders:site.colliders,surfaces:site.surfaces,buildings:site.buildings,walkRoute};
  }
  return {binary:site.asset.binary(),summary:{name:root.name,buildings:site.buildings.length,meshCount:site.asset.meshes.length,
    nodeCount:site.asset.nodes.length,materialCount:site.asset.materials.length,walkable:site.walk,bounds:site.extents}};
}
