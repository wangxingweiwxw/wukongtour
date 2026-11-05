#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeLayout,analyzeGlb,compareScenes} from './lib/scene-quality.mjs';
const skill=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{
  const args={};
  for(let i=2;i<process.argv.length;i++){
    const arg=process.argv[i];
    if(arg==='--help'){console.log('Usage: node analyze_scene.mjs --layout layout.json [--model final.glb] [--report scene-review.json]\nOr: node analyze_scene.mjs --model architecture.glb [--report scene-review.json]\nAlways compares against bundled actual GLB and editable template. No automatic aesthetic pass/fail.');process.exit(0);}
    if(!['--layout','--model','--report'].includes(arg)||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw Error(`Unknown/incomplete argument: ${arg}`);
    args[arg.slice(2)]=path.resolve(process.argv[++i]);
  }
  if(!args.layout&&!args.model)throw Error('Provide --layout and/or --model');
  const pathKey=p=>process.platform==='win32'?p.toLowerCase():p;
  if(args.report&&[args.layout,args.model].filter(Boolean).some(p=>pathKey(p)===pathKey(args.report)))throw Error('Report must not overwrite an input');
  const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
  let catalog={assets:[]};try{catalog=await readJson(path.join(skill,'assets/library/catalog.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const baseline=analyzeGlb(await fs.readFile(path.join(skill,'assets/ancient-compound.glb')));
  const template=analyzeLayout(await readJson(path.join(skill,'assets/mountain-temple-layout.json')),catalog);
  const layout=args.layout?analyzeLayout(await readJson(args.layout),catalog):null;
  const model=args.model?analyzeGlb(await fs.readFile(args.model)):null;
  const report={version:1,status:'needs-visual-review',inputs:args,layout,model,reference:{actualGlb:baseline,editableTemplate:template},comparisons:[...(layout?[compareScenes(layout,template)]:[]),...(model?[compareScenes(model,baseline)]:[])],note:'Numeric analysis does not establish image similarity, historical identity, visual quality, collision validity or actual target-side playability.'};
  if(args.report){await fs.mkdir(path.dirname(args.report),{recursive:true});await fs.writeFile(args.report,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));
}catch(error){console.error(`analyze_scene: ${error.message}`);process.exitCode=1;}
