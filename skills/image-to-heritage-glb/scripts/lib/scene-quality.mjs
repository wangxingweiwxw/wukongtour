// Composition measurements, not a perceptual score or a replacement for GLB validation.
const round = n => Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
const area = r => Math.max(0, r.maxX-r.minX) * Math.max(0, r.maxZ-r.minZ);
const finite = values => values.every(Number.isFinite);
const extent = rects => rects.length ? ({minX:Math.min(...rects.map(r=>r.minX)),maxX:Math.max(...rects.map(r=>r.maxX)),minZ:Math.min(...rects.map(r=>r.minZ)),maxZ:Math.max(...rects.map(r=>r.maxZ))}) : null;
function rect(item, width, depth) {
  const [x,,z] = item.position ?? [0,0,0], yaw=item.rotation ?? 0;
  if(!finite([x,z,yaw,width,depth]) || width<=0 || depth<=0) throw Error(`Invalid composition dimensions: ${item.id??'unnamed'}`);
  const c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw)),w=c*width+s*depth,d=s*width+c*depth;
  return {id:item.id??item.name??'',minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2};
}
export function rectangleUnionArea(rects) {
  // Exact union of axis-aligned boxes. Arbitrary yaw is conservatively represented by its AABB.
  if(!rects.length)return 0;
  const xs=[...new Set(rects.flatMap(r=>[r.minX,r.maxX]))].sort((a,b)=>a-b);
  let sum=0;
  for(let i=1;i<xs.length;i++){
    const mid=(xs[i-1]+xs[i])/2, intervals=rects.filter(r=>r.minX<mid&&r.maxX>mid).map(r=>[r.minZ,r.maxZ]).sort((a,b)=>a[0]-b[0]);
    let lo=null,hi=null,z=0;
    for(const [a,b] of intervals){if(lo===null){lo=a;hi=b;}else if(a<=hi)hi=Math.max(hi,b);else{z+=hi-lo;lo=a;hi=b;}}
    if(lo!==null)z+=hi-lo;sum+=(xs[i]-xs[i-1])*z;
  }
  return sum;
}
const edgeDistance=(a,b)=>Math.hypot(Math.max(0,a.minX-b.maxX,b.minX-a.maxX),Math.max(0,a.minZ-b.maxZ,b.minZ-a.maxZ));
const pointDistance=(p,r)=>Math.hypot(Math.max(0,r.minX-p[0],p[0]-r.maxX),Math.max(0,r.minZ-p[2],p[2]-r.maxZ));
function spacing(rects) {
  const entries=rects.map((r,i)=>({id:r.id,nearestEdgeGapM:round(Math.min(...rects.filter((_,j)=>i!==j).map(o=>edgeDistance(r,o))))}));
  const values=entries.map(e=>e.nearestEdgeGapM).filter(Number.isFinite).sort((a,b)=>a-b);
  return {byBuilding:entries,medianNearestEdgeGapM:values.length?round((values[Math.floor((values.length-1)/2)]+values[Math.ceil((values.length-1)/2)])/2):null,maxNearestEdgeGapM:values.length?values.at(-1):null};
}
function routeMetrics(points,features,threshold=12) {
  const segments=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b.position[0]-a.position[0],b.position[2]-a.position[2]);
    if(!finite([...a.position,...b.position,length]))throw Error('Route coordinates must be finite');
    if(length<.001)continue;
    const count=Math.ceil(length/2),step=length/count;let sparse=0,longest=0,run=0,max=0;
    for(let n=0;n<count;n++){
      const t=(n+.5)/count,p=a.position.map((v,j)=>v+(b.position[j]-v)*t),distance=Math.min(...features.map(f=>pointDistance(p,f)));
      max=Math.max(max,distance);
      if(distance>threshold){sparse+=step;run+=step;longest=Math.max(longest,run);}else run=0;
    }
    segments.push({from:a.name??String(i-1),to:b.name??String(i),straightLineLengthM:round(length),maxFeatureGapM:round(max),lengthBeyondReviewRadiusM:round(sparse),longestSparseRunM:round(longest)});
  }
  return {method:'Midpoint samples every <=2m on straight waypoint chords; these are NOT solved walking paths or visibility rays.',reviewRadiusM:threshold,featureDistance:'Horizontal distance to declared feature AABBs; no occlusion, silhouette or texture judgment.',segments};
}
function common(name,kind,buildings,ground,levels,features,route,signals,warnings) {
  const coverage=rectangleUnionArea(buildings),groundArea=rectangleUnionArea(ground),bounds=extent(ground);
  return {name,kind,status:'needs-visual-review',buildingCount:buildings.length,
    coverage:{footprintAreaM2:round(coverage),groundAreaM2:round(groundArea),ratio:groundArea?round(coverage/groundArea):null,groundBounds:bounds},
    spacing:spacing(buildings),floorLevelsM:[...new Set(levels.map(round))].sort((a,b)=>a-b),
    route:routeMetrics(route,features),signals,warnings,
    visualReview:['Read the reference images and inspect the actual bundled baseline GLB, not only its JSON statistics.','Review human eye-level entry, route bends, courtyard and summit views; compare foreground, midground and background.','Keep intentional open courts and sightlines; do not fill space solely to match a percentage.','Check added features against doors, stairs, routes and player/camera clearance.']};
}
export function analyzeLayout(spec,catalog={assets:[]}) {
  if(spec?.version!==1||!Array.isArray(spec.buildings))throw Error('Expected a version 1 layout with buildings');
  const buildings=spec.buildings.map(b=>rect(b,b.width??12,b.depth??8));
  const ground=(spec.terraces??[]).map(t=>rect(t,t.width,t.depth));
  if(!ground.length && spec.walk?.bounds)ground.push(spec.walk.bounds);
  const walls=(spec.walls??[]).map(w=>rect(w,w.width,w.thickness??.3));
  const rocks=(spec.rocks??[]).map(r=>rect(r,2*(r.radius??1),2*(r.radius??1)));
  const trees=(spec.trees??[]).map(t=>rect(t,2*(t.crownRadius??(t.height??9)*.28),2*(t.crownRadius??(t.height??9)*.28)));
  const assets=new Map((catalog.assets??[]).map(a=>[a.id,a])),instances=[],unmeasured=[];
  for(const item of spec.libraryInstances??[]){
    const a=assets.get(item.assetId),size=a?.size??(a?.bounds?.min&&a?.bounds?.max?a.bounds.max.map((v,i)=>v-a.bounds.min[i]):null);
    if(!size||!finite(size)||size[1]<=0){unmeasured.push(item.id);continue;}
    const scale=item.height/size[1];instances.push(rect(item,size[0]*scale,size[2]*scale));
  }
  const counts=Object.fromEntries(['terraces','stairs','walls','rocks','trees','paths','libraryInstances'].map(k=>[k,(spec[k]??[]).length]));
  const warnings=[];
  if(!counts.walls)warnings.push('No declared courtyard walls; inspect whether rocks, terrain, galleries or vegetation provide the intended enclosure.');
  if(!counts.trees)warnings.push('No procedural trees declared; inspect library assets or explicitly justify an unplanted scene.');
  if(unmeasured.length)warnings.push(`Library footprints not measured without valid catalog bounds: ${unmeasured.join(', ')}`);
  if((spec.paths??[]).some(p=>/(stream|river|water|溪|河|水)/i.test([p.id,p.material,p.description].join(' '))))warnings.push('A water-named path is thin ground paving in this generator; review bridge clearance and visible water level instead of assuming a river mesh.');
  const result=common(spec.name??'Untitled layout','layout',buildings,ground,(spec.terraces??[]).map(t=>(t.position?.[1]??0)+t.height),[...buildings,...walls,...rocks,...trees,...instances],spec.walk?.walkRoute??[],{counts,libraryFootprintsMeasured:instances.length,libraryFootprintsUnmeasured:unmeasured},warnings);
  result.coverage.footprintDefinition='Union of building column footprints, excludes platforms and roof overhang; rotated footprints use their AABB. Ground is union of all terrace X/Z projections, or explicit walk bounds if terraces absent.';
  result.route.featureSet='Buildings, walls, rocks, tree canopies, measured library instances; ground, paving and stairs excluded.';
  return result;
}
export function readGlbDocument(bytes) {
  if(!Buffer.isBuffer(bytes)||bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Not a complete GLB 2 file');
  const length=bytes.readUInt32LE(12);
  if(bytes.readUInt32LE(16)!==0x4e4f534a||length%4||20+length>bytes.length)throw Error('Invalid GLB JSON chunk');
  return JSON.parse(bytes.subarray(20,20+length).toString('utf8'));
}
export function analyzeGlb(bytes) {
  const doc=readGlbDocument(bytes),nodes=doc.nodes??[],roots=nodes.filter(n=>n.extras?.heritageScene);
  if(roots.length!==1)throw Error('Composition analysis currently requires exactly one heritageScene root; use --layout for ordinary GLBs');
  const h=roots[0].extras.heritageScene;
  const buildings=(h.buildings??[]).filter(b=>b.floorBounds).map(b=>({id:b.id,...b.floorBounds}));
  const names=nodes.map(n=>n.name??''),landscapeNames=names.filter(n=>/landscape|nature|distant|terrain|vegetation|forest|tree|pine|山势|植被/i.test(n));
  const result=common(h.name??doc.asset?.generator??'GLB','glb-navigation',buildings,h.bounds?[h.bounds]:[],(h.surfaces??[]).map(s=>s.height),buildings,h.walkRoute??[],{nodeCount:nodes.length,meshCount:(doc.meshes??[]).length,landscapeNameSignals:landscapeNames,embeddedImageCount:(doc.images??[]).filter(i=>i.bufferView!==undefined).length},['GLB floorBounds are navigable interior/platform bounds, not building silhouettes. Their ratio cannot be compared directly to layout column-footprint ratios.','Landscape node names are existence hints only. Meshes may be batched; names do not prove tree count, quality, placement or sightline enclosure.','This command reads composition metadata; run validate_glb.mjs separately for geometry and navigation correctness.']);
  result.coverage.footprintDefinition='Union of heritageScene.buildings[].floorBounds / declared walk bounds; this is navigation-space occupancy, not architectural plot coverage.';
  result.route.featureSet='Only navigable building floorBounds; batched landscape geometry is deliberately NOT treated as a whole-site feature box.';
  return result;
}
export function compareScenes(current,reference) {
  const same=current.kind===reference.kind;
  return {reference:reference.name,sameMetricDefinitions:same,buildingCountDifference:current.buildingCount-reference.buildingCount,
    coverageRatioDifference:same&&current.coverage.ratio!==null&&reference.coverage.ratio!==null?round(current.coverage.ratio-reference.coverage.ratio):null,
    interpretation:'Differences identify review questions, not quality failures or targets. Forest routes, temples and open courts need different compositions.'};
}
