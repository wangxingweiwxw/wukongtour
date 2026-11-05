#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const libraryRoot = fileURLToPath(new URL('../assets/library/', import.meta.url));
const catalog = JSON.parse(await fs.readFile(path.join(libraryRoot,'catalog.json'),'utf8'));
const [command='summary', ...argv] = process.argv.slice(2);
const help = `Usage: node <skill>/scripts/catalog.mjs [summary|sites|search|site|asset|verify] [query] [--category category] [--use purpose]
  summary                   Counts and categories
  sites [query]             23-site inventory; matches name, ID, province and features
  search [query]            Models by name, site, category or intended use
  site <id or name>         Source-backed site record with candidate model records
  asset <id or name>        Full model record, local file and measured coordinate bounds
  verify                    Verify all bundled model/preview bytes and SHA-256
Examples:
  node <skill>/scripts/catalog.mjs search 黑风山
  node <skill>/scripts/catalog.mjs search --category 场景部件 --use 院落围合
  node <skill>/scripts/catalog.mjs site 佛光寺
  node <skill>/scripts/catalog.mjs asset asset-60863a416fd6`;
function argumentsFor(args) {
  const result={query:[],category:null,use:null};
  for(let i=0;i<args.length;i++) {
    if(args[i].startsWith('--')) {
      if(!['--category','--use'].includes(args[i]) || !args[i+1] || args[i+1].startsWith('--')) throw Error('Unknown/incomplete option: '+args[i]);
      result[args[i].slice(2)]=args[++i];
    } else result.query.push(args[i]);
  }
  result.query=result.query.join(' ').toLocaleLowerCase();return result;
}
const includes = (values,query) => !query || values.filter(value=>value!==undefined&&value!==null).join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase());
const summaryAsset = asset => ({id:asset.id,name:asset.name,category:asset.category,usageTags:asset.usageTags,
  file:asset.file,preview:asset.preview,bytes:asset.bytes,triangles:asset.triangles,size:asset.size,identityStatus:asset.identityStatus,
  matches:asset.matches});
function choose(records,query,label) {
  if(!query) throw Error(label+' requires an ID or name');
  const exact=records.filter(record=>[record.id,record.name].some(value=>value.toLocaleLowerCase()===query));
  if(exact.length===1) return exact[0];
  const matches=records.filter(record=>includes([record.id,record.name],query));
  if(matches.length!==1) throw Error(matches.length ? `${label} is ambiguous: ${matches.map(record=>record.id).join(', ')}` : `${label} not found: ${query}`);
  return matches[0];
}
function safePath(relative) {
  if(typeof relative!=='string'||path.isAbsolute(relative)) throw Error('Catalog paths must be relative');
  const resolved=path.resolve(libraryRoot,relative), rel=path.relative(libraryRoot,resolved);
  if(rel.startsWith('..'+path.sep)||rel==='..'||path.isAbsolute(rel)) throw Error('Catalog path escapes library: '+relative);
  return resolved;
}
try {
  if(['--help','-h','help'].includes(command)){console.log(help);process.exit(0);}
  const options=argumentsFor(argv);
  let result;
  if(command==='summary') result={title:catalog.title,counts:catalog.counts,identityNote:catalog.identityNote,
    categories:[...new Set(catalog.assets.map(asset=>asset.category))],pending:catalog.pending};
  else if(command==='sites') result=catalog.sites.filter(site=>includes([site.id,site.name,site.province,site.locality,site.feature],options.query))
    .map(site=>({id:site.id,name:site.name,province:site.province,category:site.category,feature:site.feature,candidateAssetIds:site.candidateAssetIds,genericDemoAssetIds:site.genericDemoAssetIds,source:site.source}));
  else if(command==='search') {
    const assets=catalog.assets.filter(asset=>{
      const siteNames=asset.matches.map(match=>catalog.sites.find(site=>site.id===match.siteId)?.name);
      return includes([asset.id,asset.name,asset.category,...asset.usageTags,...siteNames],options.query)
        && (!options.category||asset.category===options.category)
        && includes(asset.usageTags,options.use);
    });
    result={count:assets.length,identityNote:catalog.identityNote,assets:assets.map(summaryAsset)};
  } else if(command==='site') {
    const site=choose(catalog.sites,options.query,'site');
    result={...site,candidateAssets:site.candidateAssetIds.map(id=>summaryAsset(catalog.assets.find(asset=>asset.id===id))),
      genericDemoAssets:site.genericDemoAssetIds.map(id=>summaryAsset(catalog.assets.find(asset=>asset.id===id)))};
  } else if(command==='asset') {
    const asset=choose(catalog.assets,options.query,'asset');
    result={...asset,resolvedFile:safePath(asset.file),...(asset.preview?{resolvedPreview:safePath(asset.preview)}:{})};
  } else if(command==='verify') {
    const failures=[];let checkedFiles=0;
    for(const asset of catalog.assets) for(const [file,bytes,sha] of [[asset.file,asset.bytes,asset.sha256],...(asset.preview?[[asset.preview,asset.previewBytes,asset.previewSha256]]:[])]) {
      try {
        const data=await fs.readFile(safePath(file));checkedFiles++;
        if(data.length!==bytes||createHash('sha256').update(data).digest('hex')!==sha) failures.push({file,error:'Byte length or SHA-256 mismatch'});
      }catch(error){failures.push({file,error:error.message});}
    }
    result={ok:!failures.length,checkedFiles,sites:catalog.sites.length,models:catalog.assets.length,failures};
    if(failures.length)process.exitCode=1;
  } else throw Error('Unknown command: '+command+'\n'+help);
  console.log(JSON.stringify(result,null,2));
} catch(error) {console.error('catalog: '+error.message);process.exitCode=1;}
