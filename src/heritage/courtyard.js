import * as THREE from 'three';
// Conversion belongs to scripts/bake-courtyard.mjs, never to the browser startup path.
export async function createCourtyard(scene,loader){
 const loaded=(await loader.loadAsync('/models/courtyard-lite.glb')).scene;
 const root=loaded.getObjectByName('LibraryCourtyard');
 if(!root?.userData.colliders||!root?.userData.report)throw Error('Invalid courtyard asset; run npm run assets:bake');
 const cameraBounds=[];
 root.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.material.flatShading=true;}});
 root.updateMatrixWorld(true);
 for(const child of root.children)cameraBounds.push(new THREE.Box3().setFromObject(child).expandByScalar(.25));
 scene.add(root);
 return {root,colliders:root.userData.colliders,report:root.userData.report,cameraBounds};
}
