#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {buildArchitecture} from './lib/architecture.mjs';
import {validateGlb} from './lib/validate.mjs';

function options(args){
  const result={};for(let i=0;i<args.length;i++){
    if(args[i]==='--help'||args[i]==='-h'){console.log('Usage: node build_glb.mjs --spec layout.json --out building.glb [--report report.json]\nCreates a model from an agent-authored layout; it does not infer geometry directly from pixels.');process.exit(0);}
    if(!['--spec','--out','--report'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error(`Unknown/incomplete argument: ${args[i]}`);
    result[args[i].slice(2)]=path.resolve(args[++i]);
  }
  if(!result.spec||!result.out)throw Error('--spec and --out are required');
  if(result.spec===result.out||result.report===result.spec||result.report===result.out)throw Error('Spec, GLB and report paths must be distinct');
  return result;
}
try{
  const args=options(process.argv.slice(2));const spec=JSON.parse(await fs.readFile(args.spec,'utf8'));
  const generated=buildArchitecture(spec),validation=validateGlb(generated.binary);
  await fs.mkdir(path.dirname(args.out),{recursive:true});await fs.writeFile(args.out,generated.binary);
  const report={...generated.summary,...validation,spec:args.spec,output:args.out};
  if(args.report){await fs.mkdir(path.dirname(args.report),{recursive:true});await fs.writeFile(args.report,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));
}catch(error){console.error(`build_glb: ${error.message}`);process.exitCode=1;}
