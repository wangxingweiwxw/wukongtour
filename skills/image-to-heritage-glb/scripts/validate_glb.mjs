#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {validateGlb} from './lib/validate.mjs';
try{
  const argv=process.argv.slice(2);let input,report;
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--help'||argv[i]==='-h'){console.log('Usage: node validate_glb.mjs file.glb [--report report.json]\nAlso accepts --input file.glb. Validates uncompressed triangle GLBs and optional heritageScene metadata.');process.exit(0);}
    if(argv[i]==='--input'||argv[i]==='--report'){if(!argv[i+1])throw Error(`Missing value for ${argv[i]}`);if(argv[i]==='--input')input=argv[++i];else report=argv[++i];}
    else if(!input&&!argv[i].startsWith('-'))input=argv[i];else throw Error(`Unknown argument: ${argv[i]}`);
  }
  if(!input)throw Error('A GLB path is required');
  if(report&&path.resolve(input)===path.resolve(report))throw Error('Report must not overwrite the input GLB');
  const result={file:path.resolve(input),...validateGlb(await fs.readFile(input))};
  if(report){await fs.mkdir(path.dirname(path.resolve(report)),{recursive:true});await fs.writeFile(report,JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(`validate_glb: ${error.message}`);process.exitCode=1;}
