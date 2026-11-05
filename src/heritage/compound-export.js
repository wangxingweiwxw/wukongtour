import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {serializeCompoundMetadata} from './compound-glb.js';

// Export a disposable hierarchy so inspection visibility and runtime guide
// meshes never leak into the reusable, fully embedded architectural asset.
export async function exportCompoundGLB(world) {
  const root=world.root.clone(true);
  const omitted=[];
  root.traverse(node=>{if(node.userData.minimapExclude)omitted.push(node);else node.visible=true;});
  omitted.forEach(node=>node.removeFromParent());
  root.userData.heritageScene=serializeCompoundMetadata(world);
  root.updateMatrixWorld(true);
  // Batched colour-only architecture does not use UV coordinates. Omit those
  // unused attributes from the export copy, retaining plaque texture UVs.
  const copies=[];
  root.traverse(node=>{
    if(!node.isMesh||!node.geometry?.getAttribute('uv'))return;
    const materials=Array.isArray(node.material)?node.material:[node.material];
    if(materials.some(material=>Object.values(material||{}).some(value=>value?.isTexture)))return;
    node.geometry=node.geometry.clone();node.geometry.deleteAttribute('uv');copies.push(node.geometry);
  });
  try{return await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});}
  finally{copies.forEach(geometry=>geometry.dispose());}
}
