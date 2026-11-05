#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {buildArchitecture} from './lib/architecture.mjs';
import {validateGlb} from './lib/validate.mjs';
import {composeLibraryInstances} from './lib/library-compose.mjs';
const pathKey=value=>process.platform==='win32'?value.toLowerCase():value;

function options(args){
  const result={};for(let i=0;i<args.length;i++){
    if(args[i]==='--help'||args[i]==='-h'){console.log('Usage: node build_glb.mjs --spec layout.json --out building.glb [--report report.json]\nCreates a model from an agent-authored layout; it does not infer geometry directly from pixels.');process.exit(0);}
    if(!['--spec','--out','--report'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error(`Unknown/incomplete argument: ${args[i]}`);
    result[args[i].slice(2)]=path.resolve(args[++i]);
  }
  if(!result.spec||!result.out)throw Error('--spec and --out are required');
  const paths=[result.spec,result.out,...(result.report?[result.report]:[])].map(pathKey);
  if(new Set(paths).size!==paths.length)throw Error('Spec, GLB and report paths must be distinct');
  return result;
}
let args,stage='arguments',artifactWritten=false;
try{
  args=options(process.argv.slice(2));stage='read-layout';
  const spec=JSON.parse(await fs.readFile(args.spec,'utf8'));
  stage='build';const generated=buildArchitecture(spec);
  stage='library-composition';const composed=await composeLibraryInstances(generated.binary,spec);generated.binary=composed.binary;
  stage='validation';const validation=validateGlb(generated.binary);
  stage='write-model';await fs.mkdir(path.dirname(args.out),{recursive:true});await fs.writeFile(args.out,generated.binary);artifactWritten=true;
  const report={...generated.summary,...validation,meshCount:validation.meshes,nodeCount:validation.nodes,materialCount:validation.materials,
    libraryInstances:composed.instances,warnings:[...validation.warnings,...composed.warnings],spec:args.spec,output:args.out};
  stage='write-report';
  if(args.report){await fs.mkdir(path.dirname(args.report),{recursive:true});await fs.writeFile(args.report,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));
}catch(error){
  // A failed retry must not leave an old successful report looking current.
  if(args?.report)try{
    await fs.mkdir(path.dirname(args.report),{recursive:true});
    await fs.writeFile(args.report,JSON.stringify({ok:false,stage:error.validationStage??stage,error:error.message,spec:args.spec,output:args.out,artifactWritten},null,2)+'\n');
  }catch(reportError){console.error(`build_glb: unable to write failure report: ${reportError.message}`);}
  console.error(`build_glb: ${error.message}`);process.exitCode=1;
}
