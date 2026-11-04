import {heritageSites as sites, sources} from './atlas-data.js';
import {ART_MAP, ART_PINS, routeForSite, atlasRoutes} from './atlas-routes.js';
import './atlas.css';

const node = (tag, className, text) => {
 const el = document.createElement(tag);
 if (className) el.className = className;
 if (text !== undefined) el.textContent = text;
 return el;
};
const button = (text, className, action) => {
 const el = node('button', className, text); el.type = 'button'; el.onclick = action; return el;
};

export function createHeritageAtlas({onTravel, getModels = () => [], onModel, getJourney = () => null, onJourneyTravel, onRoutes}) {
 const $ = id => document.getElementById(id), ns = 'http://www.w3.org/2000/svg';
 let selected = 'shisi', lastFocus = null;
 const routes = () => { const play = getJourney(); return atlasRoutes(play?.state, play?.active ? play.state.activeId : null); };
 const provinces = [...new Set(sites.map(s => s.province))];
 for (const p of provinces) $('provinceFilter').add(new Option(p,p));
 for (const category of [...new Set(sites.map(s => s.category))]) $('categoryFilter').add(new Option(category,category));
 function filtered() {
  const query = $('siteSearch').value.trim().toLowerCase();
  return sites.filter(s => (!$('provinceFilter').value || s.province === $('provinceFilter').value)
   && (!$('categoryFilter').value || s.category === $('categoryFilter').value)
   && (!query || [s.name,s.locality,s.province,s.feature,s.relationship,routeForSite(s.id)?.name || ''].some(t => t.toLowerCase().includes(query))));
 }
 function select(id, source) {
  if (!sites.some(site => site.id === id)) return;
  selected = id; render();
  if (source) {
   // Re-rendered controls retain keyboard focus; selection never starts a trip.
   const focus = source === 'pin' ? $ ('atlas').querySelector(`[data-site="${id}"]`)
    : source === 'route' ? $('atlasRouteList').querySelector(`[data-site="${id}"]`)
    : $('destinations').querySelector(`[data-site="${id}"]`);
   focus?.focus({preventScroll:true});
   if (innerWidth <= 800) {
    $('siteDetail').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
   }
  }
 }
 function siteResearch(site, panel) {
  const disclosure = node('details','atlas-research');
  disclosure.append(node('summary','','建筑资料与模型'));
  const body = node('div','atlas-research-body');
  body.append(node('p','',site.feature),node('p','',site.evidence));
  const src = sources[site.source];
  if (src) { const link = node('a','',`${src.publisher} · 阅读资料 ↗`); link.href=src.url; link.target='_blank'; link.rel='noreferrer'; body.append(link); }
  const assets = getModels(site.id);
  body.append(node('small','',assets.length ? `${assets.length} 个候选模型，建筑身份尚待确认。` : '此处暂无可预览的候选模型。'));
  for (const asset of assets) body.append(button(`预览 ${asset.name} →`,'candidate-model',() => onModel?.(asset,site)));
  if (site.demoIndex !== undefined) body.append(button('旧版通用建筑示范 →','atlas-demo',() => onTravel?.(site.demoIndex)));
  disclosure.append(body); panel.append(disclosure);
 }
 function details(site, list) {
  const panel = $('siteDetail'); panel.replaceChildren(); if (!site) return;
  const route = list.find(entry => entry.siteId === site.id);
  panel.append(node('span','detail-kicker',`${site.province} · ${site.locality}`),node('h3','',site.name));
  if (route) {
   panel.append(node('span','atlas-playable',`${route.current ? '正在游玩' : '可游玩'} · ${route.name}`),node('p','atlas-detail-intro',route.subtitle));
   const progress = node('div','atlas-detail-progress');
   route.points.forEach(point => {
    const done = getJourney()?.state.has(point.id);
    progress.append(node('span',done ? 'is-done' : '',`${done ? '✓' : '○'} ${point.title}`));
   });
   const go = button(route.current ? '回到本程入口 →' : route.complete ? '重游这一程 →' : '出发 · 进入这一程 →','atlas-start',() => onJourneyTravel?.(route.id));
   go.dataset.journey = route.id;
   panel.append(progress,go,node('small','atlas-route-note',`${route.done} / ${route.total} 处已入册 · 点击地图地名也可选中`));
  } else {
   panel.append(node('span','atlas-reference-only','资料站'),node('p','','此地尚未开放独立观察路线。可以查看建筑资料与候选模型，或选择下方路线出发。'));
  }
  siteResearch(site,panel);
 }
 function renderRoutes(list) {
  const container = $('atlasRouteList'); container.replaceChildren();
  for (const route of list) {
   const site = sites.find(s => s.id === route.siteId);
   const b = button('','atlas-route'+(selected === route.siteId ? ' is-selected' : ''),() => select(route.siteId,'route'));
   b.dataset.site = route.siteId; b.setAttribute('aria-pressed',String(selected === route.siteId));
   b.setAttribute('aria-label',`${site.name}，${route.name}，${route.done}/${route.total} 已记录${route.current ? '，正在游玩' : ''}`);
   b.append(node('span','atlas-route-number',String(route.number).padStart(2,'0')));
   const text = node('span','atlas-route-copy'); text.append(node('b','',route.name),node('small','',site.name));
   const status = node('span','atlas-route-status',`${route.complete ? '✓ ' : ''}${route.done}/${route.total}`);
   if (route.current) status.append(node('small','','当前'));
   b.append(text,status); container.append(b);
  }
 }
 function svgElement(tag, attrs = {}) {const e=document.createElementNS(ns,tag); for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v); return e;}
 function draw(list) {
  const svg = $('atlas'); svg.replaceChildren(); svg.setAttribute('viewBox',`0 0 ${ART_MAP.width} ${ART_MAP.height}`);
  const image = svgElement('image',{href:ART_MAP.url,x:0,y:0,width:ART_MAP.width,height:ART_MAP.height});
  image.addEventListener('error',() => { $('mapLoadStatus').textContent = '地图图片暂未载入，仍可通过路线列表选择目的地。'; });
  svg.append(image);
  for (const [id,x,y,w,h,px,py] of ART_PINS) {
   const site = sites.find(s => s.id === id), route = list.find(r => r.siteId === id);
   const g = svgElement('g',{class:`art-pin${id === selected ? ' selected' : ''}${route ? ' has-route' : ''}`,role:'button',tabindex:0,'aria-pressed':String(id===selected),'aria-label':`${site.name}，${route ? `可游玩，${route.done}/${route.total} 已记录` : '查看建筑资料'}`,'data-site':id});
   const title=svgElement('title'); title.textContent=site.name; g.append(title,svgElement('rect',{x,y,width:w,height:h,rx:10}),svgElement('circle',{cx:px,cy:py,r:21}));
   if (route) {
    const badge = svgElement('g',{class:'atlas-route-badge','aria-hidden':'true'});
    badge.append(svgElement('rect',{x:x-20,y:y-25,width:74,height:43,rx:12}));
    const label = svgElement('text',{x:x+17,y:y+5,'text-anchor':'middle'}); label.textContent=route.complete ? '✓' : String(route.number).padStart(2,'0'); badge.append(label); g.append(badge);
   }
   g.onclick=() => select(id,'pin');
   g.onkeydown=e => { if(['Enter',' '].includes(e.key)){e.preventDefault();select(id,'pin');} }; svg.append(g);
  }
  $('mapLoadStatus').textContent = '';
 }
 function renderDirectory() {
  const list = filtered(), container = $('destinations'); container.replaceChildren();
  $('siteCount').textContent=`${list.length} / ${sites.length} 处`;
  for (const site of list) {
   const b=button('','destination'+(site.id===selected?' active':''),() => select(site.id,'directory'));
   b.dataset.site=site.id; b.setAttribute('aria-pressed',String(site.id===selected));
   b.append(node('span','',`${site.province} · ${site.locality}`),node('b','',site.name),node('small','',routeForSite(site.id) ? `可游玩 · ${routeForSite(site.id).name}` : `${site.category} · 资料站`)); container.append(b);
  }
  if(!list.length)container.append(node('p','','没有匹配地点，请调整搜索或筛选。'));
 }
 function render() {
  const list=routes(), total=list.reduce((sum,r)=>sum+r.done,0), count=list.reduce((sum,r)=>sum+r.total,0);
  $('atlasStats').textContent=`${list.length} 条可玩路线 · ${total} / ${count} 处发现已入册`;
  $('atlas').setAttribute('aria-label',`中国访古艺术地图，${ART_PINS.length} 处建筑可点击选择，含 ${list.length} 条可玩路线`);
  $('atlasProgress').value=total; $('atlasProgress').max=count;
  $('atlasProgress').setAttribute('aria-label',`游记收集 ${total}/${count}`);
  renderRoutes(list); details(sites.find(s=>s.id===selected),list); draw(list); renderDirectory();
 }
 $('siteSearch').oninput=renderDirectory; $('provinceFilter').onchange=renderDirectory; $('categoryFilter').onchange=renderDirectory;
 $('resetAtlas').onclick=()=>{$('siteSearch').value='';$('provinceFilter').value='';$('categoryFilter').value='';renderDirectory();};
 $('atlasJournal').onclick=()=>{ $('map').close(); onRoutes?.(); };
 $('closeMap').onclick=()=> $('map').close();
 $('map').addEventListener('close',()=> { if(lastFocus?.isConnected && !document.querySelector('dialog[open]')) lastFocus.focus({preventScroll:true}); });
 function open() {
  lastFocus = document.activeElement;
  const play = getJourney(); selected = play?.state.activeId || 'shisi';
  document.querySelectorAll('dialog[open]').forEach(dialog=>{if(dialog!==$('map'))dialog.close();});
  render(); if(!$('map').open)$('map').showModal(); $('map').scrollTop=0;
  $('siteDetail').querySelector('button')?.focus({preventScroll:true});
 }
 render(); return {refresh:render,open,sites};
}
