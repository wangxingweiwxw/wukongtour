#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateGlb} from './lib/validate.mjs';
const pathKey=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
let input,report,bytes,reportReady=false,stage='arguments';
try{
  const argv=process.argv.slice(2);
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--help'||argv[i]==='-h'){console.log('Usage: node validate_glb.mjs file.glb [--report report.json]\nAlso accepts --input file.glb. Validates uncompressed triangle GLBs and optional heritageScene metadata.');process.exit(0);}
    if(argv[i]==='--input'||argv[i]==='--report'){if(!argv[i+1])throw Error(`Missing value for ${argv[i]}`);if(argv[i]==='--input')input=argv[++i];else report=argv[++i];}
    else if(!input&&!argv[i].startsWith('-'))input=argv[i];else throw Error(`Unknown argument: ${argv[i]}`);
  }
  if(!input)throw Error('A GLB path is required');
  if(report&&pathKey(input)===pathKey(report))throw Error('Report must not overwrite the input GLB');
  reportReady=true;stage='read-model';bytes=await fs.readFile(input);stage='structure';
  const result={file:path.resolve(input),...validateGlb(bytes)};
  if(report){await fs.mkdir(path.dirname(path.resolve(report)),{recursive:true});await fs.writeFile(report,JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify(result,null,2));
}catch(error){
  if(reportReady&&report)try{
    await fs.mkdir(path.dirname(path.resolve(report)),{recursive:true});
    const failure={ok:false,file:path.resolve(input),stage:error.validationStage??stage,error:error.message};
    if(bytes){failure.bytes=bytes.length;failure.sha256=createHash('sha256').update(bytes).digest('hex');}
    await fs.writeFile(report,JSON.stringify(failure,null,2)+'\n');
  }catch(reportError){console.error(`validate_glb: unable to write failure report: ${reportError.message}`);}
  console.error(`validate_glb: ${error.message}`);process.exitCode=1;
}
