import * as THREE from 'three';

export const HERO_MODEL_URL='/models/wukong-current-hero.glb';

/** Keep the asset's authored transforms inside a separate gameplay root, so
 * movement, stairs and scene changes never overwrite the GLB's foot offset. */
export function createGLBHero(gltf) {
  if(!gltf?.scene)throw new Error('主角 GLB 缺少场景');
  const model=gltf.scene,root=new THREE.Group();root.name='WukongPlayer';root.add(model);
  const bounds=new THREE.Box3().setFromObject(model),height=bounds.max.y-bounds.min.y;
  if(!Number.isFinite(height)||height<=0)throw new Error('主角 GLB 没有有效几何体');
  model.scale.multiplyScalar(1.8/height);
  bounds.setFromObject(model);model.position.y-=bounds.min.y;
  model.traverse(node=>{
    if(!node.isMesh)return;
    node.castShadow=true;node.receiveShadow=node.name!=='ClosedHairVolume';
  });

  const mixer=new THREE.AnimationMixer(model),actions={};
  for(const name of ['Idle','Walk','Run']) {
    const clip=gltf.animations.find(clip=>clip.name.toLowerCase()===name.toLowerCase());
    if(!clip)throw new Error(`主角 GLB 缺少 ${name} 动画`);
    actions[name]=mixer.clipAction(clip);
  }
  let current='Idle';actions.Idle.play();mixer.update(0);
  root.animations=gltf.animations;
  root.userData.modelUrl=HERO_MODEL_URL;
  root.userData.animation=current;
  root.userData.staff=model.getObjectByName('GoldenStaff');
  root.userData.appearance={...model.getObjectByName('Wukong')?.userData.appearance,metres:1.8};
  root.userData.animate=(dt,moving,running)=>{
    // A paused game passes zero time: preserve the pose as well as the clock.
    if(!Number.isFinite(dt)||dt<=0)return;
    const next=moving?(running?'Run':'Walk'):'Idle';
    if(next!==current) {
      actions[current].fadeOut(.15);
      actions[next].reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(.15).play();
      current=next;root.userData.animation=current;
    }
    mixer.update(Math.min(dt,.1));
  };
  root.userData.disposeAnimation=()=>{mixer.stopAllAction();mixer.uncacheRoot(model);};
  root.updateMatrixWorld(true);
  return root;
}
