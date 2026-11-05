#!/usr/bin/env node
// Maintenance-only exporter. The produced skill library has no project imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {heritageSites, sources, atlasMeta} from '../src/heritage/atlas-data.js';
import {validateGlb} from '../skills/image-to-heritage-glb/scripts/lib/validate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'skills/image-to-heritage-glb/assets/library');
const source = JSON.parse(await fs.readFile(path.join(root, 'public/models/imported/manifest.json'), 'utf8'));
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
const siteIds = new Set(heritageSites.map(site => site.id));
const useTags = asset => {
  const tags = new Set([asset.category]);
  const name = asset.name;
  for (const [pattern, values] of [
    [/殿|寺|庙|堂|观/, ['院落', '建筑主体']],
    [/偏殿|副殿|夜寺/, ['配殿', '侧院', '背景建筑']],
    [/大殿/, ['主殿', '中轴线', '终点地标']],
    [/门|牌坊/, ['山门', '入口', '院落分隔']],
    [/回廊|廊亭|亭子|凉亭/, ['亭廊', '院落边界', '沿途停驻']],
    [/钟楼/, ['钟楼', '侧院', '地标']],
    [/墙/, ['围墙', '院落围合', '场地边界']],
    [/桥/, ['桥梁', '跨水连接', '路径转折']],
    [/井/, ['水井', '庭院陈设', '近景']],
    [/塔/, ['塔', '远景地标', '层次轮廓']],
    [/神龛|转经筒|卧榻/, ['陈设', '宗教装饰', '近景']],
    [/木屋|棚屋/, ['附属房屋', '生活空间', '侧院']],
    [/黑风山/, ['黑风山', '山寺']],
    [/雷音寺|小西天/, ['小雷音寺', '山寺']],
    [/角色|僵尸/, ['角色道具', '非建筑']],
  ]) if (pattern.test(name)) values.forEach(value => tags.add(value));
  return [...tags];
};

await fs.mkdir(path.join(destination, 'models'), {recursive:true});
await fs.mkdir(path.join(destination, 'previews'), {recursive:true});
const assets = [];
async function includeAsset(asset, originKind, originalFile, preview) {
  for (const match of asset.matches ?? []) if (!siteIds.has(match.siteId)) throw Error(`Unknown site ${match.siteId}`);
  const bytes = await fs.readFile(path.join(root, 'public', originalFile));
  const check = validateGlb(bytes);
  const file = `models/${asset.id}.glb`;
  await fs.writeFile(path.join(destination, file), bytes);
  let previewInfo;
  if (preview) {
    const image = await fs.readFile(path.join(root, 'public', preview));
    const previewFile = `previews/${asset.id}${path.extname(preview)}`;
    await fs.writeFile(path.join(destination, previewFile), image);
    previewInfo = {preview:previewFile, previewBytes:image.length, previewSha256:digest(image)};
  }
  assets.push({
    id:asset.id, name:asset.name, category:asset.category, file, ...previewInfo,
    bytes:bytes.length, sha256:check.sha256, bounds:check.bounds,
    size:check.bounds.max.map((value, index) => value - check.bounds.min[index]),
    triangles:check.triangles, vertices:check.vertices, meshes:check.meshes, nodes:check.nodes,
    materials:check.materials, embeddedResources:check.embeddedResources,
    usageTags:useTags(asset), style:asset.style, identityStatus:asset.identityStatus,
    matches:asset.matches ?? [],
    provenance:{
      kind:originKind,
      originalFile:asset.source ?? originalFile,
      ...(asset.sourceBytes ? {originalBytes:asset.sourceBytes} : {}),
      conversion:originKind === 'project-original-demo' ? '项目原创通用风格化示范，非对应古建测绘模型。' : source.conversion,
      license:originKind === 'project-original-demo' ? '项目原创资源；本快照未附独立许可文件。' : '用户提供的模型库衍生轻量版本；上游许可未在原始清单中声明。',
    },
    scaleNote:'size 和 bounds 是 GLB 实际坐标范围，不代表古建测绘尺寸；按门高、人体和邻接建筑统一尺度后放置。',
    navigation:{kind:check.walkableScenes ? 'heritageScene' : 'visual-mesh', note:check.walkableScenes ? '复用后仍须重新校验变换与通行。' : '无通行元数据；默认作实体或背景，门洞/桥面不能直接宣称可行走。'},
    validation:{structure:check.validation.structure, heritageContract:check.validation.heritageContract, khronos:{status:'not-run'}, visual:{status:'not-run'}},
  });
}

for (const asset of source.assets.filter(asset => asset.status === 'converted')) {
  await includeAsset(asset, 'user-model-library', asset.url.replace(/^\//,''), asset.preview?.replace(/^\//,''));
}
const demos = [
  {id:'demo-heritage-hall', name:'通用木构殿堂示范', category:'殿堂房屋', model:'heritage-hall', siteId:'foguang'},
  {id:'demo-heritage-tower', name:'通用层檐塔示范', category:'塔', model:'heritage-tower', siteId:'yingxian'},
  {id:'demo-heritage-pavilion', name:'通用亭阁示范', category:'亭廊楼阁', model:'heritage-pavilion', siteId:'dule'},
];
for (const demo of demos) await includeAsset({
  ...demo, style:'original-stylized-demo', identityStatus:'通用风格化示范，非实物复原',
  matches:[{siteId:demo.siteId, level:'通用示范', reason:'保留项目资料页的旧版通用示范关联，不认定为该处古建模型。'}],
}, 'project-original-demo', `models/${demo.model}.glb`);

const sites = heritageSites.map(site => ({
  ...site,
  sourceId:site.source,
  source:sources[site.source],
  candidateAssetIds:assets.filter(asset => asset.provenance.kind === 'user-model-library' && asset.matches.some(match => match.siteId === site.id)).map(asset=>asset.id),
  genericDemoAssetIds:assets.filter(asset => asset.provenance.kind === 'project-original-demo' && asset.matches.some(match=>match.siteId===site.id)).map(asset=>asset.id),
}));
const counts = {sites:sites.length, assets:assets.length, converted:assets.filter(asset => asset.provenance.kind === 'user-model-library').length,
  originalDemos:demos.length, previews:assets.filter(asset=>asset.preview).length, glbBytes:assets.reduce((total,asset)=>total+asset.bytes,0),
  previewBytes:assets.reduce((total,asset)=>total+(asset.previewBytes??0),0), pending:(source.pending??[]).length};
const catalog = {
  version:1, title:'古建筑资料与模型内置库', snapshotDate:'2026-11-05',
  pathsRelativeTo:'directory containing this catalog.json',
  identityNote:source.identityNote,
  atlasMeta,
  reuseNote:'按形制、时代感、材质与尺度挑选补充模型。已收录不代表与目标建筑身份一致；不要为了填满空地混入不合主题的地标。',
  counts, sources, sites, assets, pending:source.pending ?? [],
};
await fs.writeFile(path.join(destination, 'catalog.json'), JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({destination:path.relative(root,destination).split(path.sep).join('/'),...counts},null,2));
