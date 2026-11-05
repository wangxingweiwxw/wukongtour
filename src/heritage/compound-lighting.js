import * as THREE from 'three';

const COMPOUND_OFFSET = new THREE.Vector3(-32, 42, 27);
const COURTYARD_OFFSET = new THREE.Vector3(-18, 28, 18);
const ORIGIN = new THREE.Vector3();
const WALK_EXTENT = 32, OVERVIEW_EXTENT = 70, COURTYARD_EXTENT = 35;
const POSITION_EPSILON_SQUARED = 1e-18;

/** Keep close walking shadows detailed without changing the sun's direction.
 * The light and its target use the scene's metre-scale, untransformed world
 * coordinates. This controller owns only their positions and shadow frustum;
 * the caller owns light colour/intensity and renderer.shadowMap.needsUpdate. */
export function createCompoundLighting(sun) {
  if (!sun?.isDirectionalLight || !sun.shadow?.camera?.isOrthographicCamera) {
    throw new TypeError('Compound lighting requires a directional sun with an orthographic shadow camera');
  }
  const normal = COMPOUND_OFFSET.clone().normalize();
  // These are the same axes used by a shadow camera looking from sun to target.
  const right = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, normal).normalize();
  const up = new THREE.Vector3().crossVectors(normal, right).normalize();
  const focus = new THREE.Vector3(), desiredSun = new THREE.Vector3();
  const sceneBox = new THREE.Box3(), sceneCenter = new THREE.Vector3(), corner = new THREE.Vector3();
  const overviewOffset = new THREE.Vector3();
  let overviewWorld = null, overviewExtent = OVERVIEW_EXTENT, overviewFar = 180;

  function frameWorld(world) {
    if(world===overviewWorld)return;
    overviewWorld=world;
    if(!world){sceneCenter.copy(ORIGIN);overviewOffset.copy(COMPOUND_OFFSET);overviewExtent=OVERVIEW_EXTENT;overviewFar=180;return;}
    const b=world.bounds;
    sceneBox.set(new THREE.Vector3(b.minX,0,b.minZ),new THREE.Vector3(b.maxX,0,b.maxZ));
    world.buildings.forEach(building=>sceneBox.union(building.bounds));
    sceneBox.getCenter(sceneCenter);
    let horizontal=0,vertical=0,depth=0;
    for(const x of [sceneBox.min.x,sceneBox.max.x])for(const y of [sceneBox.min.y,sceneBox.max.y])for(const z of [sceneBox.min.z,sceneBox.max.z]){
      corner.set(x,y,z).sub(sceneCenter);
      horizontal=Math.max(horizontal,Math.abs(corner.dot(right)));vertical=Math.max(vertical,Math.abs(corner.dot(up)));depth=Math.max(depth,Math.abs(corner.dot(normal)));
    }
    overviewExtent=Math.ceil(Math.max(horizontal,vertical)+5);
    overviewOffset.copy(normal).multiplyScalar(depth+40);overviewFar=Math.ceil(depth*2+80);
  }
  overviewOffset.copy(COMPOUND_OFFSET);

  function apply(center, offset, extent, far) {
    const camera = sun.shadow.camera;
    desiredSun.copy(center).add(offset);
    const positionsChanged = sun.position.distanceToSquared(desiredSun) > POSITION_EPSILON_SQUARED
      || sun.target.position.distanceToSquared(center) > POSITION_EPSILON_SQUARED;
    const frustumChanged = camera.left !== -extent || camera.right !== extent
      || camera.top !== extent || camera.bottom !== -extent || camera.near !== 1 || camera.far !== far;
    if (!positionsChanged && !frustumChanged) return false;
    if (positionsChanged) {
      sun.position.copy(desiredSun);
      sun.target.position.copy(center);
      // The default DirectionalLight target is not automatically added to a
      // scene. Updating it here also supports that normal Three.js setup.
      sun.updateWorldMatrix(true, false);
      sun.target.updateWorldMatrix(true, false);
    }
    if (frustumChanged) {
      Object.assign(camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far });
      camera.updateProjectionMatrix();
    }
    sun.shadow.needsUpdate = true;
    return true;
  }

  function reset() {
    return apply(ORIGIN, COURTYARD_OFFSET, COURTYARD_EXTENT, 100);
  }

  function update({ active, mode, position, world }) {
    if (!active) return reset();
    if (mode !== 'walk') {frameWorld(world || null);return apply(sceneCenter, overviewOffset, overviewExtent, overviewFar);}
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
      throw new RangeError('Walking shadow focus requires a finite player position');
    }
    const { x: width, y: height } = sun.shadow.mapSize;
    if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
      throw new RangeError('Walking shadows require a positive shadow map size');
    }
    focus.copy(position);
    const texelX = 2 * WALK_EXTENT / width, texelY = 2 * WALK_EXTENT / height;
    const horizontal = Math.round(focus.dot(right) / texelX) * texelX;
    const vertical = Math.round(focus.dot(up) / texelY) * texelY;
    const depth = focus.dot(normal);
    // Quantize in the light's image plane, not on world X/Z. Preserve the depth
    // component so movement along the light direction does not move texel edges.
    focus.copy(right).multiplyScalar(horizontal).addScaledVector(up, vertical).addScaledVector(normal, depth);
    return apply(focus, COMPOUND_OFFSET, WALK_EXTENT, 180);
  }

  return { update, reset };
}
