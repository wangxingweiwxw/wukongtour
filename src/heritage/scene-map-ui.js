import {createSceneMapRenderer} from './scene-map-renderer.js';
import './scene-map.css';

const NS = 'http://www.w3.org/2000/svg';
const make = (tag, cls, text) => {
 const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n;
};
const svgNode = (tag, attrs={}) => {
 const n=document.createElementNS(NS,tag); for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v); return n;
};
const action = (text, cls, handler) => {const b=make('button',cls,text);b.type='button';b.onclick=handler;return b;};

/** A static scene illustration plus lightweight live SVG markers. No second render loop. */
export function createSceneMapUI({onOpen,onAtlas}) {
 let data=null, mapImage=null, selected=null, position={x:0,y:0,z:0}, heading=0;
 let done=new Set(), targetId=null, paused=false, lastPaint='', lastList='', openedFrom=null;
 let renderer=null, renderCount=0;
 const cache=new Map();
 const mini=make('aside','scene-minimap'); mini.id='sceneMinimap'; mini.hidden=true;
 mini.setAttribute('aria-label','当前场景小地图');
 const miniHead=make('div','scene-minimap-head');
 miniHead.append(make('span','','场景小地图'));
 const collapse=action('−','scene-minimap-collapse',()=>{
  const collapsed=mini.classList.toggle('is-collapsed');
  collapse.textContent=collapsed?'+':'−'; collapse.setAttribute('aria-expanded',String(!collapsed));
  collapse.setAttribute('aria-label',collapsed?'展开小地图预览':'收起小地图预览');
 });
 collapse.setAttribute('aria-expanded','true');collapse.setAttribute('aria-label','收起小地图预览');miniHead.append(collapse);
 const miniButton=action('','scene-minimap-open',open);miniButton.id='sceneMapButton';
 const miniTitle=make('strong','scene-minimap-title');
 const miniStatus=make('small','scene-minimap-status');
 const miniHint=make('span','scene-minimap-hint','点击放大 · N');
 mini.append(miniHead,miniButton);document.body.append(mini);

 const dialog=make('dialog','scene-map-dialog');dialog.id='sceneMap';dialog.setAttribute('aria-labelledby','sceneMapTitle');
 const header=make('div','scene-map-header'),titles=make('div');
 const title=make('h2');title.id='sceneMapTitle';
 const subtitle=make('p');titles.append(make('span','scene-map-eyebrow','一景一图 · 随行图志'),title,subtitle);
 const close=action('×','scene-map-close',()=>dialog.close());close.setAttribute('aria-label','关闭场景小地图');header.append(titles,close);
 const layout=make('div','scene-map-layout'),illustration=make('div','scene-map-illustration');
 const aside=make('aside','scene-map-index');
 const current=make('p','scene-map-current');current.setAttribute('role','status');
 const pointTitle=make('h3','','观察与足迹'),pointList=make('div','scene-map-points');pointList.id='sceneMapPoints';
 const landmarkTitle=make('h3','','建筑与景物'),landmarks=make('div','scene-map-landmarks');
 const atlas=action('打开访古总地图 →','scene-map-atlas',()=>{dialog.close();onAtlas?.();});
 aside.append(current,pointTitle,pointList,landmarkTitle,landmarks,atlas);layout.append(illustration,aside);
 const legend=make('div','scene-map-legend');
 legend.append(make('span','legend-player','▲ 悟空'),make('span','legend-target','◎ 当前目标'),make('span','legend-done','✓ 已完成'),make('span','','数字 · 观察 / 导览点'));
 const note=make('p','scene-map-note','建筑按场景实际布局生成，方位固定；点选标记查看名称，按原路标行走。');
 dialog.append(header,layout,legend,note);document.body.append(dialog);
 let views=[];
 function makeView(large) {
  const svg=svgNode('svg',{viewBox:'0 0 640 640',class:'scene-map-art',role:large?'group':'img','aria-label':data.title+'场景俯瞰图'});
  if(!large)svg.setAttribute('aria-hidden','true');
  if(mapImage?.image)svg.append(svgNode('image',{href:mapImage.image,x:0,y:0,width:640,height:640}));
  else {
   svg.append(svgNode('rect',{width:640,height:640,fill:'#e7e5c9'}));
   svg.append(svgNode('path',{d:'M65 70H575V570H65Z',fill:'#c5cf9d',stroke:'#a99b72','stroke-width':4}));
  }
  if(large){
   const placed=data.points.map(point=>{const p=project(point.position);return{x:p.x-20,y:p.y-20,w:40,h:40};});
   for(const landmark of data.landmarks){
    const anchor=project(landmark.position),w=Math.min(210,landmark.name.length*16+16);
    const x=Math.max(8,Math.min(632-w,anchor.x-w/2));let y=Math.max(8,Math.min(604,anchor.y-34));
    const overlaps=rect=>placed.some(other=>rect.x<other.x+other.w+3&&rect.x+rect.w+3>other.x&&rect.y<other.y+other.h+3&&rect.y+rect.h+3>other.y);
    for(let offset=0;offset<8&&overlaps({x,y,w,h:24});offset++)y=Math.max(8,Math.min(604,anchor.y-34+(offset%2?-1:1)*Math.ceil((offset+1)/2)*28));
    placed.push({x,y,w,h:24});
    const g=svgNode('g',{class:'scene-map-landmark-label','aria-hidden':'true'});
    g.append(svgNode('path',{d:`M${anchor.x} ${anchor.y}L${x+w/2} ${y+12}`}));
    g.append(svgNode('rect',{x,y,width:w,height:24,rx:5}));
    const text=svgNode('text',{x:x+w/2,y:y+16,'text-anchor':'middle'});text.textContent=landmark.name;g.append(text);svg.append(g);
   }
  }
  const markerLayer=svgNode('g',{class:'scene-map-markers'});svg.append(markerLayer);
  const markers=new Map();
  data.points.forEach((point,index)=>{
   const p=project(point.position),g=svgNode('g',{class:'scene-map-point',transform:`translate(${p.x} ${p.y})`,'data-point':point.id});
   g.append(svgNode('circle',{r:large?15:23}));
   const number=svgNode('text',{'text-anchor':'middle',y:large?5:6});number.textContent=String(index+1);g.append(number);
   const tip=svgNode('title');tip.textContent=point.name;g.append(tip);
   if(large){g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',`${index+1} ${point.name}`);
    const choose=()=>select(point.id);g.onclick=choose;g.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose();}};
   }
   markers.set(point.id,g);markerLayer.append(g);
  });
  const player=svgNode('g',{class:'scene-map-player','aria-hidden':'true'});
  player.append(svgNode('circle',{r:large?14:18}),svgNode('path',{d:large?'M0 -14L9 10L0 6L-9 10Z':'M0 -17L11 12L0 7L-11 12Z'}));
  svg.append(player);
  const view={svg,markers,player};views.push(view);return view;
 }
 function project(coords) {
  if(mapImage?.project){const p=mapImage.project(coords[0],coords[1]||0,coords[2]);return{x:p.x*640,y:p.y*640};}
  const b=data.bounds;return{x:65+(coords[0]-b.minX)/(b.maxX-b.minX)*510,y:70+(coords[2]-b.minZ)/(b.maxZ-b.minZ)*500};
 }
 function select(id) {
  if(!data?.points.some(p=>p.id===id))return;
  selected=id;lastList='';paint();
  const choice=pointList.querySelector(`[data-point="${id}"]`);choice?.focus({preventScroll:true});choice?.scrollIntoView({block:'nearest'});
 }
 function setScene(next,root) {
  if(!next)return clear();
  data=next;selected=null;done=new Set();targetId=null;lastPaint=lastList='';views=[];
  const cacheKey=next.id;let entry=cache.get(cacheKey);
  if(!entry){
   try{renderer ||= createSceneMapRenderer();entry=renderer.render({root,bounds:data.bounds});renderCount++;}
   catch(error){console.warn('场景小地图改用坐标示意：',error.message);}
   if(entry){cache.set(cacheKey,entry);if(cache.size>8)cache.delete(cache.keys().next().value);}
  }
  mapImage=entry||null;
  miniButton.replaceChildren();const small=makeView(false);miniButton.append(small.svg,miniTitle,miniStatus,miniHint);
  miniTitle.textContent=data.title;miniButton.setAttribute('aria-label',`放大${data.title}场景小地图`);
  illustration.replaceChildren(makeView(true).svg);
  title.textContent=data.title;subtitle.textContent=data.subtitle||'循着建筑与路标，找到这一处风景。';
  landmarks.replaceChildren();
  for(const item of data.landmarks){const line=make('p');line.append(make('span','','◆'),make('span','',item.name));landmarks.append(line);}
  landmarkTitle.hidden=landmarks.hidden=!data.landmarks.length;
  note.textContent=mapImage ? '建筑按场景实际布局生成，方位固定；点选标记查看名称，按原路标行走。' : '当前为坐标示意图；点选编号查看目标，按场景原有路标行走。';
  position={x:data.spawn[0],y:data.spawn[1],z:data.spawn[2]};mini.hidden=false;paint();
  mini.dataset.scene=data.id;mini.dataset.renders=String(renderCount);
 }
 function paint() {
  if(!data)return;
  const listKey=[targetId,[...done].join(','),selected,paused].join('/');
  if(listKey!==lastList){
   lastList=listKey;
   for(const view of views)for(const [id,marker] of view.markers){
    marker.classList.toggle('is-done',done.has(id));marker.classList.toggle('is-target',id===targetId);marker.classList.toggle('is-selected',id===selected);
    const point=data.points.find(p=>p.id===id);
    if(view===views[1]){
     marker.setAttribute('aria-label',`${point.name}，${done.has(id)?'已完成':id===targetId?'当前目标':'待发现'}`);
     marker.setAttribute('aria-pressed',String(id===selected));
    }
    marker.querySelector('text').textContent=done.has(id)?'✓':String(data.points.indexOf(point)+1);
   }
   pointList.replaceChildren();
   data.points.forEach((point,index)=>{
    const b=action('','scene-map-stop'+(selected===point.id?' is-selected':''),()=>select(point.id));b.dataset.point=point.id;
    b.setAttribute('aria-pressed',String(selected===point.id));
    b.append(make('b','',done.has(point.id)?'✓':String(index+1).padStart(2,'0')),make('span','',point.name),make('small','',done.has(point.id)?'已完成':point.id===targetId?'当前目标':'待发现'));pointList.append(b);
   });
   if(!data.points.length)pointList.append(make('p','scene-map-empty','当前为模型庭院，可以沿建筑外围自由观察。'));
  }
  const p=project([position.x,position.y,position.z]),tip=project([position.x+Math.sin(heading),position.y,position.z+Math.cos(heading)]);
  const angle=Math.atan2(tip.y-p.y,tip.x-p.x)*180/Math.PI+90;
  for(const view of views)view.player.setAttribute('transform',`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${angle.toFixed(1)})`);
  mini.dataset.player=`${position.x.toFixed(2)},${position.z.toFixed(2)}`;
  const target=data.points.find(point=>point.id===(selected||targetId));
  const remaining=target?Math.round(Math.hypot(position.x-target.position[0],position.z-target.position[2])):null;
   const text=target?`${target.name} · 直线约 ${remaining} m`:`${done.size} / ${data.points.length} 处已走过`;
  miniStatus.textContent=data.points.length?`${done.size} / ${data.points.length} · ${paused?'人物暂停':'随行定位'}`:'模型庭院 · 随行定位';
  current.textContent=(paused?'人物暂停 · ':'')+(target?text:data.points.length?(done.size===data.points.length?'这一景的足迹已收齐。':'点选编号，查看这一景的观察点。'):'沿建筑外围自由观察。');
 }
 function update(next) {
  if(!data||!next?.position)return;
  position=next.position;heading=next.heading||0;done=new Set(next.doneIds||[]);targetId=next.targetId||null;paused=Boolean(next.paused);
  const key=[position.x.toFixed(2),position.y.toFixed(2),position.z.toFixed(2),heading.toFixed(2),[...done].join(','),targetId,paused,selected].join('/');
  if(key===lastPaint)return;lastPaint=key;paint();
 }
 function open(){
  if(!data)return;openedFrom=document.activeElement;onOpen?.();
  document.querySelectorAll('dialog[open]').forEach(other=>{if(other!==dialog)other.close();});
  if(!dialog.open)dialog.showModal();dialog.scrollTop=0;close.focus({preventScroll:true});
 }
 dialog.addEventListener('close',()=>{onOpen?.();if(openedFrom?.isConnected&&!document.querySelector('dialog[open]'))openedFrom.focus({preventScroll:true});});
 function clear(){data=null;mini.hidden=true;if(dialog.open)dialog.close();}
 function destroy(){clear();renderer?.destroy();cache.clear();mini.remove();dialog.remove();}
 return{setScene,update,open,clear,destroy,get sceneId(){return data?.id;}};
}
