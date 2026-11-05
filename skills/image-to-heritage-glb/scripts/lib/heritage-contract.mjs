import {canStand,groundHeight,findWalkPath} from './walkability.mjs';

const KEY='heritageScene',EPS=1e-5;
const LIMIT={coordinate:4096,span:256,gridCells:1050625,buildings:32,rectangles:4096,
  cameras:8192,route:64,bins:300000,nodes:50000,bytes:96*1024*1024};
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const own=(o,key)=>o!=null&&Object.hasOwn(o,key);
function fail(path,reason,details){
  const error=new Error(`heritageScene ${path}: ${reason}${details?' '+JSON.stringify(details):''}`);
  error.validationStage='heritage-contract';throw error;
}
function record(value,path){if(!value||typeof value!=='object'||Array.isArray(value))fail(path,'must be an object');return value;}
function text(value,path,max=160,empty=false){if(typeof value!=='string'||(!empty&&!value.trim())||value.length>max)fail(path,`expected ${empty?'possibly empty ':''}text of at most ${max} characters`);return value;}
function number(value,path){if(!Number.isFinite(value)||Math.abs(value)>LIMIT.coordinate)fail(path,'expected a finite coordinate within ±4096 metres',{value});return value;}
function list(value,path,min,max){if(!Array.isArray(value)||value.length<min||value.length>max)fail(path,`expected ${min}..${max} items`,{count:Array.isArray(value)?value.length:null});return value;}
function vector(value,path){return list(value,path,3,3).map((v,i)=>number(v,`${path}[${i}]`));}
function rectangle(value,path,vertical=false){
  record(value,path);const result={};for(const axis of vertical?['X','Y','Z']:['X','Z']){
    result[`min${axis}`]=number(value[`min${axis}`],`${path}.min${axis}`);result[`max${axis}`]=number(value[`max${axis}`],`${path}.max${axis}`);
    if(result[`min${axis}`]>=result[`max${axis}`])fail(path,'rectangle must have positive extent',{rectangle:result});
  }return result;
}
function inBounds(rect,bounds,path,margin=0){
  for(const axis of ['X','Z'])if(rect[`min${axis}`]<bounds[`min${axis}`]-margin-EPS
    ||rect[`max${axis}`]>bounds[`max${axis}`]+margin+EPS
    ||rect[`max${axis}`]<bounds[`min${axis}`]||rect[`min${axis}`]>bounds[`max${axis}`])
    fail(path,'outside allowed navigation bounds',{rectangle:rect,bounds,margin});
}
function insidePoint(p,b,path){inBounds({minX:p[0],maxX:p[0],minZ:p[2],maxZ:p[2]},b,path);}

// Graph uses original glTF node indices/names and world-space subtree AABBs.
// A scene-level declaration is a virtual identity root, exactly as GLTFLoader
// exposes scene.extras on its scene Group. Deep or duplicate declarations fail.
export function validateHeritageContract({doc,sceneIndex,sceneNodeIds,parents,localMatrices,nodeBounds,subtreeMeshes,bytes}){
  const scene=doc.scenes[sceneIndex],nodes=doc.nodes,hits=[];
  if(own(scene.extras,KEY))hits.push({root:null,metadata:scene.extras[KEY]});
  for(const id of sceneNodeIds)if(own(nodes[id].extras,KEY))hits.push({root:id,metadata:nodes[id].extras[KEY]});
  const navigation={gridMetres:.25,walkerHeight:1.8,maxStepUp:.22,maxStepDown:.26};
  if(!hits.length)return {contract:{status:'not-present'},connectivity:{status:'not-applicable',standingPoints:0,pathsChecked:0,...navigation}};
  if(hits.length!==1)fail(KEY,'requires exactly one declaration in the active scene',{declarations:hits.map(h=>h.root===null?'scene.extras':`nodes[${h.root}].extras`)});
  const {root,metadata}=hits[0];
  if(root!==null&&((scene.nodes??[]).length!==1||scene.nodes[0]!==root))fail(KEY,'declaration must be on the scene or its sole top-level root, never a deeper node');
  if(root!==null&&localMatrices[root].some((v,i)=>!Number.isFinite(v)||Math.abs(v-IDENTITY[i])>EPS))fail('root','metadata root must retain an identity transform');
  if(bytes>LIMIT.bytes)fail('file','walkable receiver accepts at most 96 MiB',{bytes,maximumBytes:LIMIT.bytes});
  record(metadata,KEY);if(metadata.version!==1||metadata.kind!=='compound')fail(KEY,'unsupported version or kind');
  const data={version:1,kind:'compound',name:text(metadata.name,'name'),description:text(metadata.description,'description',2000,true),bounds:rectangle(metadata.bounds,'bounds')};
  const width=data.bounds.maxX-data.bounds.minX,depth=data.bounds.maxZ-data.bounds.minZ;
  if(width<2||depth<2||width>LIMIT.span||depth>LIMIT.span||(Math.floor(width/.25)+1)*(Math.floor(depth/.25)+1)>LIMIT.gridCells)
    fail('bounds','navigation area must span 2..256 metres per axis and fit the 25cm grid limit',{bounds:data.bounds,gridCells:(Math.floor(width/.25)+1)*(Math.floor(depth/.25)+1)});
  data.spawn=vector(metadata.spawn,'spawn');insidePoint(data.spawn,data.bounds,'spawn');
  let binCount=0;
  function rectangles(items,kind){
    return list(items,kind,0,LIMIT.rectangles).map((item,i)=>{
      const path=`${kind}[${i}]`,r=rectangle(item,path,kind==='colliders');inBounds(r,data.bounds,path,kind==='colliders'?4:0);
      if(kind==='surfaces'){r.height=number(item.height,`${path}.height`);if(r.height<0||r.height>128)fail(path,'surface height must be 0..128 metres',{height:r.height});}
      binCount+=(Math.floor((r.maxX-r.minX)/4)+2)*(Math.floor((r.maxZ-r.minZ)/4)+2);
      if(binCount>LIMIT.bins)fail(kind,'navigation spatial index exceeds limit',{bins:binCount,maximum:LIMIT.bins});return r;
    });
  }
  data.colliders=rectangles(metadata.colliders,'colliders');data.surfaces=rectangles(metadata.surfaces,'surfaces');
  const byName=new Map();let effectiveNodeCount=sceneNodeIds.size+(root===null?1:0);
  for(const id of sceneNodeIds){
    const node=nodes[id];if(node.name){if(!byName.has(node.name))byName.set(node.name,[]);byName.get(node.name).push(id);}
    // GLTFLoader represents a multi-primitive mesh as a Group plus mesh children.
    if(node.mesh!==undefined&&doc.meshes[node.mesh].primitives.length>1)effectiveNodeCount+=doc.meshes[node.mesh].primitives.length;
  }
  if(effectiveNodeCount>LIMIT.nodes)fail('root','too many nodes for the walkable receiver',{nodes:effectiveNodeCount,maximum:LIMIT.nodes});
  function referenced(name,path){text(name,path,200);const ids=byName.get(name);if(!ids||ids.length!==1)fail(path,'node name is missing or ambiguous',{name,matches:ids?.length??0});return ids[0];}
  const ids=new Set(),buildingRoots=new Set(),roofNodes=new Set();
  data.buildings=list(metadata.buildings,'buildings',1,LIMIT.buildings).map((item,i)=>{
    const path=`buildings[${i}]`;record(item,path);
    const b={id:text(item.id,`${path}.id`,100),name:text(item.name,`${path}.name`),description:text(item.description,`${path}.description`,2000,true),nodeName:text(item.nodeName,`${path}.nodeName`,200)};
    if(ids.has(b.id))fail(path,'duplicate building id',{id:b.id});ids.add(b.id);
    const node=referenced(b.nodeName,`${path}.nodeName`),direct=root===null?(scene.nodes??[]).includes(node):parents.get(node)===root;
    if(!direct||buildingRoots.has(node))fail(path,'building must be a distinct direct child of the metadata root',{nodeName:b.nodeName});buildingRoots.add(node);
    const box=nodeBounds.get(node);
    if(!box||box.min.some((v,k)=>v>box.max[k])||[...box.min,...box.max].some(v=>!Number.isFinite(v)||Math.abs(v)>LIMIT.coordinate))fail(path,'building lacks valid finite mesh bounds',{nodeName:b.nodeName,box});
    b.roofNodeNames=list(item.roofNodeNames,`${path}.roofNodeNames`,1,32).map((name,j)=>{
      const roof=referenced(name,`${path}.roofNodeNames[${j}]`);let ancestor=parents.get(roof);
      while(ancestor!==undefined&&ancestor!==node)ancestor=parents.get(ancestor);
      if(ancestor!==node||roofNodes.has(roof))fail(path,'roof must be a unique strict descendant of this building',{roof:name,building:b.nodeName});
      if(!(subtreeMeshes.get(roof)>0))fail(path,'roof node has no mesh',{roof:name});roofNodes.add(roof);return name;
    });
    b.entry=vector(item.entry,`${path}.entry`);b.interior=vector(item.interior,`${path}.interior`);
    b.sideEntries=list(item.sideEntries,`${path}.sideEntries`,0,16).map((p,j)=>vector(p,`${path}.sideEntries[${j}]`));
    b.floorBounds=rectangle(item.floorBounds,`${path}.floorBounds`);inBounds(b.floorBounds,data.bounds,`${path}.floorBounds`);insidePoint(b.interior,b.floorBounds,`${path}.interior`);
    inBounds(b.floorBounds,{minX:box.min[0],maxX:box.max[0],minZ:box.min[2],maxZ:box.max[2]},`${path}.floorBounds`,.25);return b;
  });
  data.walkRoute=list(metadata.walkRoute,'walkRoute',1,LIMIT.route).map((stop,i)=>{record(stop,`walkRoute[${i}]`);return {name:text(stop.name,`walkRoute[${i}].name`),position:vector(stop.position,`walkRoute[${i}].position`)};});
  if(metadata.cameraObstacles!==undefined)data.cameraObstacles=list(metadata.cameraObstacles,'cameraObstacles',0,LIMIT.cameras).map((item,i)=>{
    const path=`cameraObstacles[${i}]`;record(item,path);record(item.box,`${path}.box`);const min=vector(item.box.min,`${path}.box.min`),max=vector(item.box.max,`${path}.box.max`);
    if(min.some((v,k)=>max[k]<=v))fail(path,'camera box must have positive extent',{min,max});
    inBounds({minX:min[0],maxX:max[0],minZ:min[2],maxZ:max[2]},data.bounds,path,4);
    if(item.buildingId!==null&&!ids.has(item.buildingId))fail(path,'camera obstacle has an invalid buildingId',{buildingId:item.buildingId});
    if(typeof item.roof!=='boolean'||(item.roof&&item.buildingId===null))fail(path,'invalid camera roof flag');return {box:{min,max},buildingId:item.buildingId,roof:item.roof};
  });
  let standingPoints=0,pathsChecked=0;const point=([x,y,z])=>({x,y,z});
  function standing(p,path){
    insidePoint(p,data.bounds,path);const height=groundHeight(data,p[0],p[2]);
    if(Math.abs(height-p[1])>.02)fail(path,'standing height differs from the highest walk surface by more than 0.02m',{point:p,groundHeight:height});
    if(!canStand(data,p[0],p[2],p[1]))fail(path,'standing point intersects a collider',{point:p,colliders:data.colliders.map((c,i)=>({c,i})).filter(({c})=>p[0]>c.minX&&p[0]<c.maxX&&p[2]>c.minZ&&p[2]<c.maxZ&&p[1]+1.8>c.minY&&p[1]<c.maxY).map(({i,c})=>({index:i,...c}))});
    standingPoints++;
  }
  function reachable(a,b,path){
    if(!findWalkPath(data,point(a),point(b)).length){const error=new Error(`heritageScene ${path}: no walkable path ${JSON.stringify({from:a,to:b,gridMetres:.25,maxStepUp:.22,maxStepDown:.26})}`);error.validationStage='connectivity';throw error;}
    pathsChecked++;
  }
  standing(data.spawn,'spawn');
  for(const [i,b] of data.buildings.entries()){
    const path=`buildings[${i}]`;standing(b.entry,`${path}.entry`);standing(b.interior,`${path}.interior`);
    reachable(data.spawn,b.entry,`${path}.entry (spawn to entry)`);reachable(b.entry,b.interior,`${path}.interior (entry to interior)`);reachable(b.interior,b.entry,`${path}.entry (interior to entry)`);
    for(const [j,p] of b.sideEntries.entries()){standing(p,`${path}.sideEntries[${j}]`);reachable(p,b.interior,`${path}.sideEntries[${j}] (side to interior)`);reachable(b.interior,p,`${path}.sideEntries[${j}] (interior to side)`);}
  }
  let previous=data.spawn;for(const [i,stop] of data.walkRoute.entries()){standing(stop.position,`walkRoute[${i}]`);reachable(previous,stop.position,`walkRoute[${i}] (${stop.name})`);previous=stop.position;}
  return {contract:{status:'passed',version:1,rootNodeName:root===null?(scene.name??''):(nodes[root].name??''),rootLocation:root===null?'scene.extras':`nodes[${root}].extras`,buildings:data.buildings.length,
    colliders:data.colliders.length,surfaces:data.surfaces.length,receiverLimitBytes:LIMIT.bytes},connectivity:{status:'passed',standingPoints,pathsChecked,...navigation}};
}
