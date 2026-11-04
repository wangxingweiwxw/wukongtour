import * as THREE from 'three';

const vertexDeclarations = '\nvarying float vHeroWorldY;\n';
const fragmentDeclarations = `
uniform vec3 uHeroFeet;
uniform vec3 uHeroHead;
uniform float uHeroRadius;
uniform float uHeroFloor;
uniform float uHeroFade;
uniform float uHeroMSAA;
varying float vHeroWorldY;
`;
const fragmentMask = `
// A small capsule follows the hero, not the building's merged bounding box.
// Depth and floor gates keep distant scenery and walkable floors intact.
if (uHeroFade > 0.0 && vHeroWorldY > uHeroFloor + 0.12) {
  vec2 axis = uHeroHead.xy - uHeroFeet.xy;
  float t = clamp(dot(gl_FragCoord.xy - uHeroFeet.xy, axis) / max(dot(axis, axis), 1.0), 0.0, 1.0);
  float depth = mix(uHeroFeet.z, uHeroHead.z, t);
  float distanceToHero = length(gl_FragCoord.xy - mix(uHeroFeet.xy, uHeroHead.xy, t));
  float mask = (1.0 - smoothstep(uHeroRadius * 0.65, uHeroRadius, distanceToHero))
    * (1.0 - smoothstep(depth - 0.25, depth - 0.08, vViewPosition.z)) * uHeroFade;
  float coverage = 1.0 - mask * 0.76;
  float threshold = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
  if (uHeroMSAA > 0.5) {
    // Correlated sample coverage reveals the hero through several overlapping
    // roof courses without accumulating the opacity of every roof layer.
    // Sub-sample noise softens the otherwise visible four-sample contour bands.
    diffuseColor.a *= clamp(coverage + (threshold - 0.5) * 0.24 * mask, 0.0, 1.0);
  } else {
    // Stable screen-space coverage for devices without multisample buffers.
    // All layers use the SAME threshold; no time-dependent flicker or sorting.
    if (threshold >= coverage) discard;
  }
}
`;

/** Local, reversible architectural transparency. Geometry, collisions and shadow
 * materials never change; inspection and the minimap retain complete buildings. */
export class HeroOcclusion {
  constructor({samples = 0} = {}) {
    this.uniforms = {
      uHeroFeet: {value:new THREE.Vector3()}, uHeroHead: {value:new THREE.Vector3()},
      uHeroRadius: {value:1}, uHeroFloor: {value:0}, uHeroFade: {value:0},
      uHeroMSAA: {value:samples > 1 ? 1 : 0},
    };
    this.materials = new Map();
    this.point = new THREE.Vector3();
    this.midpoint = new THREE.Vector3();
    this.cameraRight = new THREE.Vector3();
  }

  setRoots(roots) {
    this.dispose();
    const visit = node => {
      if (node.userData?.minimapExclude || /(?:^|-)(?:ground|cloud|distant)(?:-|$)/i.test(node.name)) return;
      if (node.isMesh) for (const material of [node.material].flat()) {
        if (!material?.isMeshStandardMaterial || this.materials.has(material)) continue;
        const prior = {compile:material.onBeforeCompile,key:material.customProgramCacheKey,coverage:material.alphaToCoverage};
        const programKey = material.customProgramCacheKey();
        this.materials.set(material, prior);
        const uniforms = this.uniforms;
        material.onBeforeCompile = function(shader, renderer) {
          prior.compile.call(this, shader, renderer);
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = vertexDeclarations + shader.vertexShader.replace('#include <project_vertex>',
            `#include <project_vertex>
vec4 heroWorldPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  heroWorldPosition = batchingMatrix * heroWorldPosition;
#endif
#ifdef USE_INSTANCING
  heroWorldPosition = instanceMatrix * heroWorldPosition;
#endif
vHeroWorldY = (modelMatrix * heroWorldPosition).y;`);
          shader.fragmentShader = fragmentDeclarations + shader.fragmentShader.replace('#include <opaque_fragment>',
            fragmentMask + '\n#include <opaque_fragment>');
        };
        material.customProgramCacheKey = () => programKey + '|hero-occlusion-v1';
        if (uniforms.uHeroMSAA.value) material.alphaToCoverage = true;
        material.needsUpdate = true;
      }
      node.children.forEach(visit);
    };
    roots.filter(Boolean).forEach(visit);
  }

  update({camera,position,viewport,enabled,dt}) {
    if (!enabled || !position || !viewport || viewport.x <= 0 || viewport.y <= 0) {this.reset();return;}
    camera.updateMatrixWorld();
    const project = (height, output) => {
      this.point.copy(position);this.point.y += height;
      const depth = -this.point.clone().applyMatrix4(camera.matrixWorldInverse).z;
      this.point.project(camera);
      return output.set((this.point.x + 1) * viewport.x / 2, (this.point.y + 1) * viewport.y / 2, depth);
    };
    const feet = project(.2, this.uniforms.uHeroFeet.value), head = project(1.8, this.uniforms.uHeroHead.value);
    if (Math.min(feet.z,head.z) <= camera.near || Math.max(feet.z,head.z) >= camera.far) {this.reset();return;}
    project(1, this.midpoint);
    this.cameraRight.setFromMatrixColumn(camera.matrixWorld,0);
    this.point.copy(position).addScaledVector(this.cameraRight,1.45);this.point.y += 1;
    this.point.project(camera);
    const radius = Math.abs((this.point.x + 1) * viewport.x / 2 - this.midpoint.x);
    this.uniforms.uHeroRadius.value = Math.max(12, radius);
    this.uniforms.uHeroFloor.value = position.y;
    this.uniforms.uHeroFade.value = THREE.MathUtils.lerp(this.uniforms.uHeroFade.value,1,1-Math.exp(-10*Math.max(0,dt || 0)));
  }

  reset() {this.uniforms.uHeroFade.value = 0;}

  dispose() {
    this.reset();
    for (const [material, prior] of this.materials) {
      material.onBeforeCompile = prior.compile;
      material.customProgramCacheKey = prior.key;
      material.alphaToCoverage = prior.coverage;
      material.needsUpdate = true;
    }
    this.materials.clear();
  }
}
