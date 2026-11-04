import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HeroOcclusion } from '../src/heritage/hero-occlusion.js';

// Exercise the production shader hooks and camera projections without a DOM.
// Browser QA still verifies compilation and the appearance of overlapping roofs.
const camera = new THREE.PerspectiveCamera(50, 1280 / 720, .1, 260);
camera.position.set(0, 1, 10);
camera.lookAt(0, 1, 0);
camera.updateMatrixWorld(true);
const position = new THREE.Vector3(0, 0, 0), viewport = new THREE.Vector2(1280, 720);
const root = new THREE.Group(), geometry = new THREE.BoxGeometry(4, 3, .3);
const bodyMaterial = new THREE.MeshStandardMaterial(), roofMaterial = new THREE.MeshStandardMaterial();
let customHookCalls = 0;
const customHook = shader => {customHookCalls++; shader.fragmentShader += '\n// Original material extension';};
const customKey = () => 'authored-building-material';
bodyMaterial.onBeforeCompile = customHook;
bodyMaterial.customProgramCacheKey = customKey;
const body = new THREE.Mesh(geometry, bodyMaterial), roof = new THREE.Mesh(geometry, roofMaterial);
body.castShadow = roof.castShadow = true;
body.receiveShadow = roof.receiveShadow = true;
roof.userData.isRoof = true;
root.add(body, roof);
const basic = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
const basicHook = basic.material.onBeforeCompile;
root.add(basic);
const originalRoofHook = roofMaterial.onBeforeCompile;
const originalUserData = JSON.stringify(roof.userData);
const fader = new HeroOcclusion({samples: 4});
fader.setRoots([root]);

function compile(material) {
  const shader = {uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader);
  return shader;
}
const shader = compile(bodyMaterial), roofShader = compile(roofMaterial);
assert.equal(customHookCalls, 1, 'material extension must survive installing occlusion');
assert.ok(shader.fragmentShader.includes('// Original material extension'));
assert.notEqual(bodyMaterial.customProgramCacheKey(), customKey(), 'different shader needs a separate program cache key');
for (const key of ['uHeroFeet', 'uHeroHead', 'uHeroRadius', 'uHeroFloor', 'uHeroFade', 'uHeroMSAA']) {
  assert.equal(shader.uniforms[key], fader.uniforms[key], `${key}: shader uses live camera uniforms`);
  assert.equal(roofShader.uniforms[key], shader.uniforms[key], `${key}: nested roof/wall layers need the same coverage`);
}
assert.equal(basic.material.onBeforeCompile, basicHook, 'guide/label basic materials must not be patched');
assert.equal(bodyMaterial.alphaToCoverage, true, 'multisampled canvas should use sample coverage');
assert.equal(bodyMaterial.transparent, false, 'opaque depth ordering must remain stable');
assert.equal(bodyMaterial.depthWrite, true);
assert.equal(bodyMaterial.opacity, 1, 'shared journey materials must not globally fade the landscape');
assert.equal(body.customDepthMaterial, undefined, 'shadow geometry must retain its original depth material');

const update = (dt = 1 / 60, enabled = true, point = position, size = viewport) =>
  fader.update({camera, position: point, viewport: size, enabled, dt});
update();
const firstFade = fader.uniforms.uHeroFade.value;
assert.ok(firstFade > 0 && firstFade < 1, 'entering walking mode should fade smoothly');
update();
assert.ok(fader.uniforms.uHeroFade.value > firstFade, 'fade advances over successive frames');
const feet = fader.uniforms.uHeroFeet.value, head = fader.uniforms.uHeroHead.value;
assert.ok(Math.abs(feet.x - 640) < 1e-8 && Math.abs(head.x - 640) < 1e-8);
assert.ok(feet.y < head.y && feet.y > 0 && head.y < viewport.y, 'projected head/feet use GL screen coordinates');
assert.ok(feet.z > 0 && head.z > 0, 'camera-space depth must be positive in front of the camera');
assert.ok(Math.abs(feet.z - 10) < 1e-8 && Math.abs(head.z - 10) < 1e-8);
assert.ok(fader.uniforms.uHeroRadius.value > 0);
assert.ok(fader.uniforms.uHeroFloor.value >= 0 && fader.uniforms.uHeroFloor.value < .4);
const projection = {feet: feet.clone(), head: head.clone(), radius: fader.uniforms.uHeroRadius.value};
update(1 / 60, true, position, viewport.clone().multiplyScalar(2));
assert.ok(Math.abs(feet.x - projection.feet.x * 2) < 1e-8 && Math.abs(feet.y - projection.feet.y * 2) < 1e-8,
  'device pixel ratio/resize must track the actual drawing buffer');
assert.ok(Math.abs(head.x - projection.head.x * 2) < 1e-8 && Math.abs(head.y - projection.head.y * 2) < 1e-8);
assert.ok(Math.abs(fader.uniforms.uHeroRadius.value - projection.radius * 2) < 1e-8);

function strengthAfterSecond(hz) {
  fader.reset();
  for (let i = 0; i < hz; i++) update(1 / hz);
  return fader.uniforms.uHeroFade.value;
}
assert.ok(Math.abs(strengthAfterSecond(30) - strengthAfterSecond(144)) < 1e-10,
  'fade timing must match at low and high refresh rates');
update(1 / 60, false);
assert.equal(fader.uniforms.uHeroFade.value, 0, 'overview/inspection must immediately restore opaque architecture');
update(1 / 60, true, new THREE.Vector3(0, 0, 20));
assert.equal(fader.uniforms.uHeroFade.value, 0, 'a hero behind the camera must not open a screen-space window');
update(1 / 60, true, new THREE.Vector3(0, 4, 0));
assert.ok(fader.uniforms.uHeroFloor.value >= 4 && fader.uniforms.uHeroFloor.value < 4.4,
  'raised floors and cloud flight must use actual hero height');

// Nothing about walking inside changes visibility, shadows or author metadata.
assert.equal(body.visible, true);
assert.equal(roof.visible, true);
assert.equal(roof.castShadow, true);
assert.equal(roof.receiveShadow, true);
assert.equal(JSON.stringify(roof.userData), originalUserData);
roof.visible = false;
update();
assert.equal(roof.visible, false, 'explicit inspection cutaway remains owned by the inspection UI');
roof.visible = true;
const nextRoot = new THREE.Group(), nextMaterial = new THREE.MeshStandardMaterial();
const nextHook = nextMaterial.onBeforeCompile;
nextRoot.add(new THREE.Mesh(geometry, nextMaterial));
fader.setRoots([nextRoot]);
assert.equal(bodyMaterial.onBeforeCompile, customHook, 'scene changes restore material callbacks');
assert.equal(bodyMaterial.customProgramCacheKey, customKey);
assert.equal(roofMaterial.onBeforeCompile, originalRoofHook);
assert.equal(bodyMaterial.alphaToCoverage, false, 'scene changes restore the original coverage setting');
fader.dispose();
assert.equal(nextMaterial.onBeforeCompile, nextHook);
assert.equal(nextMaterial.alphaToCoverage, false);
assert.equal(fader.uniforms.uHeroFade.value, 0);

const fallback = new HeroOcclusion({samples: 0});
fallback.setRoots([root]);
assert.equal(bodyMaterial.alphaToCoverage, false);
assert.equal(fallback.uniforms.uHeroMSAA.value, 0, 'non-MSAA devices need a deterministic screen-door fallback');
const fallbackShader = compile(bodyMaterial);
assert.ok(fallbackShader.fragmentShader.includes('discard'), 'fallback must preserve depth without alpha blending');
fallback.dispose();
geometry.dispose();
for (const material of [bodyMaterial, roofMaterial, basic.material, nextMaterial]) material.dispose();
console.log('PASS occlusion: projection, DPI resize, 30/144 Hz fade, mode restoration, layered coverage, shadows and material lifecycle');
