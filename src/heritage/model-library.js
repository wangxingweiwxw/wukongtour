import {heritageSites,sources} from './atlas-data.js';

const siteById=new Map(heritageSites.map(s=>[s.id,s]));
export function createModelLibrary({onLoad,onReady}){
 const $=id=>document.getElementById(id);let assets=[],pending=[],selected;
 function el(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
 function describe(a){
  const panel=$('modelDetail');panel.replaceChildren();if(!a){panel.append(el('p','没有匹配的模型，请调整筛选。'));return;}
  if(a.preview){const im=el('img');im.src=a.preview;im.alt=a.name+' · MC 轻量模型预览';im.className='model-preview';panel.append(im);}
  panel.append(el('small','轻量 MC 模型 · 预览为游戏实际渲染','model-caption'),el('h3',a.name),el('p',`${a.category} · ${(a.bytes/1048576).toFixed(1)} MB · ${(a.triangles/10000).toFixed(1)} 万三角面`));
  const b=el('button','进入三维场景 →','primary');b.dataset.loadAsset=a.id;b.onclick=()=>onLoad(a);panel.append(b);
  const dl=el('a','下载 GLB ↗');dl.href=a.url;dl.download=a.name+'.glb';panel.append(dl);
  panel.append(el('h4','城市与建筑的初步对应'));
  if(!a.matches.length)panel.append(el('p','尚未识别真实地点。保留为场景部件或独立模型，不自动放到中国地图上。'));
  for(const m of a.matches){const s=siteById.get(m.siteId);if(!s)continue;panel.append(el('b',`${s.province} · ${s.locality} / ${s.name}`),el('span',m.level,'match-badge'),el('p',m.reason));const l=el('a','查看该地点的取材报道 ↗');l.href=sources[s.source].url;l.target='_blank';l.rel='noreferrer';panel.append(l);}
  panel.append(el('p','所有对应均未确认为真实古建扫描件；“主题配置”只表示可用于该站场景搭建。','model-caution'));
  const d=el('details');d.append(el('summary','模型来源与转换说明'));d.append(el('p','来源：'+a.source),el('p','基于用户资料制作 MC 轻量版本：镜湖小庙按参考图重建，其余模型保留外形并转为块状表面。共用配色，不携带原高清贴图；原始资源保留在完整项目。'));
  if(a.missingColorMaterials)d.append(el('p',`${a.missingColorMaterials} 个材质未找到可靠的颜色贴图，暂用中性色。`));panel.append(d);
 }
 function render(){
  const q=$('modelSearch').value.trim().toLowerCase(),cat=$('modelCategory').value,place=$('modelPlace').value;
  const list=assets.filter(a=>(!cat||a.category===cat)&&(!place||(place==='unmatched'?!a.matches.length:a.matches.some(m=>m.siteId===place)))&&(!q||[a.name,a.category,...a.matches.map(m=>{const s=siteById.get(m.siteId);return s?[s.name,s.province,s.locality].join(' '):'';})].some(t=>t.toLowerCase().includes(q))));
  if(!list.some(a=>a.id===selected))selected=list[0]?.id;$('modelCount').textContent=`${list.length} / ${assets.length} 个可用模型`;
  const container=$('modelCards');container.replaceChildren();
  for(const a of list){const b=el('button',null,'model-tile'+(a.id===selected?' active':''));b.dataset.asset=a.id;b.setAttribute('aria-pressed',a.id===selected);if(a.preview){const im=el('img');im.src=a.preview;im.loading='lazy';im.alt='';b.append(im);}else b.append(el('div','古建部件','model-placeholder'));b.append(el('b',a.name),el('small',`${a.category} · ${(a.bytes/1048576).toFixed(1)} MB`),el('span',a.matches.length?'有候选对应 · 未确认':'地点待识别','match-badge'));b.onclick=()=>{selected=a.id;render();if(innerWidth<=800)$('modelDetail').scrollIntoView({block:'start',behavior:'smooth'});};container.append(b);}
  describe(list.find(a=>a.id===selected));
 }
 function open(){render();$('library').showModal();}
 $('libraryButton').onclick=open;$('closeLibrary').onclick=()=>$('library').close();
 $('modelSearch').oninput=render;$('modelCategory').onchange=render;$('modelPlace').onchange=render;
 const ready=fetch('/models/imported/manifest.json').then(r=>{if(!r.ok)throw Error('模型目录尚未生成');return r.json();}).then(data=>{
  assets=data.assets;pending=data.pending||[];selected=assets.find(a=>a.name==='镜湖小庙')?.id||assets[0]?.id;
  for(const c of [...new Set(assets.map(a=>a.category))])$('modelCategory').add(new Option(c,c));
  for(const id of [...new Set(assets.flatMap(a=>a.matches.map(m=>m.siteId)))]){const s=siteById.get(id);if(s)$('modelPlace').add(new Option(`${s.province} · ${s.name}`,id));}
  $('libraryStats').textContent=`${assets.length} 个 MC 轻量模型 · 按需加载 · 城市对应均待确认`;
  $('modelPending').textContent=pending.length?'待转换：'+pending.map(p=>p.name+'（'+p.reason+'）').join('；'):'';
  render();onReady?.();return assets;
 }).catch(e=>{$('libraryStats').textContent=e.message;return [];});
 return {ready,get assets(){return assets;},forSite:id=>assets.filter(a=>a.matches.some(m=>m.siteId===id)),open};
}
