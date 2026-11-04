import * as THREE from 'three';

// The miniature is rendered from the same geometry as the playable scene. It is
// cached by the caller; this module never creates an animation loop or owns the
// source meshes, materials, textures, visibility or transforms.
const SIZE = 640;
const VIEW = new THREE.Vector3(.65, 1.65, 1).normalize();
const TRANSIENT_NAMES = new Set(['CompoundGuide', 'CompoundBuildingNames', 'GuideDots', 'JourneyMarkers']);

function excluded(object) {
  return object.userData?.minimapExclude || object.isSprite || object.isLight || object.isCamera
    || TRANSIENT_NAMES.has(object.name) || /(?:^|-)cloud(?:-|$)/i.test(object.name);
}

function validBounds(bounds) {
  if (!bounds || !['minX','maxX','minZ','maxZ'].every(key => Number.isFinite(bounds[key]))
    || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) {
    throw new RangeError('Scene map requires finite, non-empty world-space bounds');
  }
  return {...bounds};
}

function visibleMeshes(root, visitor) {
  function visit(object) {
    if (excluded(object)) return;
    if (object.isMesh && object.geometry?.getAttribute('position')) visitor(object);
    for (const child of object.children) visit(child);
  }
  visit(root);
}

/** Node-testable projection shared by the background and moving overlays.
 * x/y are normalized image coordinates (origin at the top-left), not pixels.
 * The diagram keeps a fixed scene axis; it does not claim geographic north. */
export function createSceneMapProjection({root, bounds}) {
  bounds = validBounds(bounds);
  if (!root?.isObject3D) throw new TypeError('Scene map requires an Object3D root');
  root.updateWorldMatrix(true, true);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const center = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  const camera = new THREE.OrthographicCamera(-span, span, span, -span, .1, span * 12 + 500);
  camera.position.copy(center).addScaledVector(VIEW, span * 4 + 100);
  camera.lookAt(center); camera.updateMatrixWorld(true);
  const view = camera.matrixWorldInverse;
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const point = new THREE.Vector3(), local = new THREE.Vector3(), instance = new THREE.Matrix4(), world = new THREE.Matrix4();
  function include(x,y,z) {
    point.set(x,y,z).applyMatrix4(view);
    minX=Math.min(minX,point.x); maxX=Math.max(maxX,point.x);
    minY=Math.min(minY,point.y); maxY=Math.max(maxY,point.y);
  }
  // Floor corners are always included, so the player remains visible right up to
  // every world boundary even if buildings occupy only a small part of the map.
  for (const x of [bounds.minX-.2,bounds.maxX+.2]) for (const z of [bounds.minZ-.2,bounds.maxZ+.2]) {
    include(x,0,z); include(x,-Math.max(1.8,span*.027),z);
  }
  visibleMeshes(root, mesh => {
    const positions=mesh.geometry.getAttribute('position');
    const instances=mesh.isInstancedMesh ? mesh.count : 1;
    for (let i=0;i<instances;i++) {
      if(mesh.isInstancedMesh) {mesh.getMatrixAt(i,instance); world.multiplyMatrices(mesh.matrixWorld,instance);}
      else world.copy(mesh.matrixWorld);
      // Scan actual vertices instead of a tall scene AABB: an AABB would add
      // large empty corners around the pagoda and shrink its useful ground map.
      for (let vertex=0;vertex<positions.count;vertex++) {
        local.fromBufferAttribute(positions,vertex).applyMatrix4(world);
        if(local.x>=bounds.minX && local.x<=bounds.maxX && local.z>=bounds.minZ && local.z<=bounds.maxZ) {
          include(local.x,local.y,local.z);
        }
      }
    }
  });
  const side=Math.max(maxX-minX,maxY-minY)*1.1, cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  camera.left=cx-side/2; camera.right=cx+side/2; camera.bottom=cy-side/2; camera.top=cy+side/2;
  camera.updateProjectionMatrix();
  const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const projected = new THREE.Vector3();
  const project=(x,y,z) => {
    if(![x,y,z].every(Number.isFinite)) throw new RangeError('Scene map coordinates must be finite');
    projected.set(x,y,z).applyMatrix4(projection);
    const imageX=(projected.x+1)/2, imageY=(1-projected.y)/2;
    return {x:imageX,y:imageY,visible:imageX>=0&&imageX<=1&&imageY>=0&&imageY<=1};
  };
  return {camera, project, bounds,
    corners:[[bounds.minX,0,bounds.minZ],[bounds.maxX,0,bounds.minZ],
      [bounds.maxX,0,bounds.maxZ],[bounds.minX,0,bounds.maxZ]].map(p=>project(...p))};
}

function cloneForMap(root, planes, materials) {
  const materialCopies=new Map();
  function material(source) {
    if(!materialCopies.has(source)) {
      const clone=source.clone();
      clone.clippingPlanes=planes; clone.clipShadows=true;
      materialCopies.set(source,clone); materials.push(clone);
    }
    return materialCopies.get(source);
  }
  function clone(source) {
    if(excluded(source)) return null;
    const copy=source.clone(false);
    // Reveal roofs and buildings hidden by the main camera's cutaway/inspect
    // state; the miniature should not change shape as the player walks inside.
    copy.visible=true;
    if(source.isMesh) {
      copy.material=Array.isArray(source.material) ? source.material.map(material) : material(source.material);
      copy.castShadow=true; copy.receiveShadow=true;
    }
    for(const child of source.children) {const part=clone(child); if(part)copy.add(part);}
    return copy;
  }
  const result=clone(root);
  if(result) {
    result.matrixAutoUpdate=false;
    result.matrix.copy(root.matrixWorld);
    result.matrixWorldNeedsUpdate=true;
  }
  return result;
}

export function createSceneMapRenderer() {
  let renderer=null, destroyed=false;
  function ensureRenderer() {
    if(destroyed) throw new Error('Scene map renderer has been destroyed');
    if(renderer) return renderer;
    renderer=new THREE.WebGLRenderer({alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
    renderer.setPixelRatio(1); renderer.setSize(SIZE,SIZE,false);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.15;
    renderer.localClippingEnabled=true;
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    return renderer;
  }
  function render({root,bounds}) {
    const projection=createSceneMapProjection({root,bounds});
    const display=ensureRenderer(), scene=new THREE.Scene(); scene.background=new THREE.Color('#c5d9df');
    const ownedGeometries=[], ownedMaterials=[];
    const span=Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ);
    const center=new THREE.Vector3((bounds.minX+bounds.maxX)/2,0,(bounds.minZ+bounds.maxZ)/2);
    const width=bounds.maxX-bounds.minX, depth=bounds.maxZ-bounds.minZ, thickness=Math.max(1.8,span*.027);
    // Clip distant landscape from merged meshes, without altering its geometry.
    const planes=[new THREE.Plane(new THREE.Vector3(1,0,0),-bounds.minX),
      new THREE.Plane(new THREE.Vector3(-1,0,0),bounds.maxX),
      new THREE.Plane(new THREE.Vector3(0,0,1),-bounds.minZ),
      new THREE.Plane(new THREE.Vector3(0,0,-1),bounds.maxZ)];
    const sun=new THREE.DirectionalLight('#ffe5b8',2.8);
    try {
      const copy=cloneForMap(root,planes,ownedMaterials); if(copy)scene.add(copy);
      function box(w,h,d,y,color) {
        const geometry=new THREE.BoxGeometry(w,h,d), material=new THREE.MeshStandardMaterial({color,roughness:1});
        ownedGeometries.push(geometry); ownedMaterials.push(material);
        const mesh=new THREE.Mesh(geometry,material); mesh.position.set(center.x,y,center.z); mesh.receiveShadow=true; scene.add(mesh);
      }
      // A cut-earth plinth and green top make each scene read as the same family
      // of voxel map islands. Original paving and gardens remain above this top.
      box(width,thickness*.55,depth,-thickness*.275-.05,'#a68b60');
      box(width*.985,thickness*.4,depth*.985,-thickness*.75-.05,'#8c7553');
      box(width,.10,depth,-.056,'#82965c');
      scene.add(new THREE.HemisphereLight('#e8f3ff','#b29a6f',2.1));
      sun.position.copy(center).add(new THREE.Vector3(-span*.55,span*1.3,span*.5));
      sun.target.position.copy(center); scene.add(sun,sun.target); sun.castShadow=true;
      Object.assign(sun.shadow.camera,{left:-span*.85,right:span*.85,top:span*.85,bottom:-span*.85,near:.5,far:span*4});
      sun.shadow.mapSize.set(1024,1024); sun.shadow.normalBias=.06; sun.shadow.bias=-.00025;
      const fill=new THREE.DirectionalLight('#d9ebfa',.7); fill.position.copy(center).add(new THREE.Vector3(span*.8,span*.7,-span)); scene.add(fill);
      display.render(scene,projection.camera);
      const image=display.domElement.toDataURL('image/png');
      if(!image.startsWith('data:image/png;base64,')) throw new Error('Scene map image could not be exported');
      return {image,project:projection.project,corners:projection.corners,bounds:projection.bounds,width:SIZE,height:SIZE};
    } finally {
      sun.shadow.map?.dispose();
      ownedGeometries.forEach(geometry=>geometry.dispose());
      // Cloned materials share original textures, which must not be disposed.
      ownedMaterials.forEach(material=>material.dispose());
      scene.clear(); display.renderLists.dispose();
    }
  }
  function destroy() {
    if(destroyed)return; destroyed=true;
    renderer?.dispose(); renderer?.forceContextLoss(); renderer=null;
  }
  return {render,destroy};
}
