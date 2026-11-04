import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createArchitecturePhoto} from './architecture-photo.js';

// The four solid monuments use a screen transition; their historic facades and
// existing collision volumes are not turned into invented walkable doorways.
export const KNOWLEDGE_ENTRANCES = {
  shisi: {name:'时思寺', door:[0,.71,-7], width:3.4, height:3.2},
  dule: {name:'独乐寺', door:[0,1.05,-7.8], width:3.3, height:4},
  foguang: {name:'佛光寺', door:[0,1.05,-7.5], width:3.4, height:3.8},
  xiaoxitian: {name:'小西天', door:[0,.94,-8.5], width:3.4, height:3.8},
  shuilu: {name:'水陆庵', door:[0,.94,-9], width:3.4, height:3.8},
  yungang: {name:'云冈石窟', approaches:[[0,0,-3]]},
  xuankong: {name:'悬空寺', approaches:[[0,0,-3]]},
  yingxian: {name:'应县木塔', approaches:[[0,0,3]]},
  kaiyuan: {name:'开元寺东西塔', approaches:[[-10.2,0,-2],[10.2,0,-3.5]]},
};

export function createKnowledgeEntrance(world, id) {
  const config=KNOWLEDGE_ENTRANCES[id];
  if(!config)return null;
  const front=world.interiors?.[0]?.entrances.find(entry=>entry.side==='front');
  const entrance={id,name:config.name,mode:config.door?'physical':'transition',
    approaches:config.approaches?.map(p=>[...p])||(front?[[...front.outside]]:[]),radius:2.4,
    doorPosition:config.door?[...config.door]:null,
    leaves:[],setProgress() {}};
  if(!config.door)return entrance;
  const root=new THREE.Group();root.name=`knowledge-door-${id}`;
  root.position.fromArray(config.door);root.userData.knowledgeDoor=true;
  const wood=new THREE.MeshStandardMaterial({color:'#75442c',roughness:.95});
  const trim=new THREE.MeshStandardMaterial({color:'#ab7744',roughness:.9});
  const metal=new THREE.MeshStandardMaterial({color:'#c2a367',roughness:.65,metalness:.3});
  const {width,height}=config;
  const box=(parent,x,y,z,w,h,d,material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  for(const side of [-1,1]) {
    const hinge=new THREE.Group();hinge.name=side<0?'left-door-leaf':'right-door-leaf';
    hinge.position.x=side*width/2;root.add(hinge);entrance.leaves.push(hinge);
    const center=-side*width/4,leafWidth=width/2-.035;
    box(hinge,center,height/2,0,leafWidth,height,.14,wood);
    for(const y of [.14,height*.28,height*.72,height-.14])box(hinge,center,y,.09,leafWidth,.12,.08,trim);
    for(const edge of [-1,1])box(hinge,center+edge*(leafWidth/2-.09),height/2,.09,.1,height-.14,.08,trim);
    for(let i=1;i<5;i++)box(hinge,center-leafWidth/2+i*leafWidth/5,height*.51,.083,.025,height*.38,.025,trim);
    box(hinge,-side*(width/2-.2),height*.48,.13,.09,.2,.08,metal);
    // Keep each independently animated leaf to three draw calls.
    const batches=new Map();
    for(const mesh of [...hinge.children]) {
      mesh.updateMatrix();mesh.geometry.applyMatrix4(mesh.matrix);
      if(!batches.has(mesh.material))batches.set(mesh.material,[]);
      batches.get(mesh.material).push(mesh.geometry);hinge.remove(mesh);
    }
    for(const [material,geometries] of batches) {
      const mesh=new THREE.Mesh(mergeGeometries(geometries),material);
      geometries.forEach(geometry=>geometry.dispose());
      mesh.castShadow=true;mesh.receiveShadow=true;hinge.add(mesh);
    }
  }
  entrance.setProgress=progress=>{
    const eased=1-Math.pow(1-THREE.MathUtils.clamp(progress,0,1),3);
    entrance.leaves[0].rotation.y=eased*Math.PI/2;
    entrance.leaves[1].rotation.y=-eased*Math.PI/2;
  };
  entrance.root=root;world.root.add(root);
  return entrance;
}

// Frame-driven state keeps scene changes, hidden tabs and modal windows from
// leaving timers that reopen an old building's content in a different scene.
export function createKnowledgeDoorState(entrance,{duration=.7,reducedMotion=false}={}) {
  let phase='idle',elapsed=0,near=false;
  const proximity=position=>Boolean(position&&entrance.approaches.some(([x,y,z])=>{
    // Cover the entire front stair approach, including the inside of the
    // doorway. A circle only at the bottom step can be bypassed from the side.
    if(entrance.mode==='physical'&&entrance.doorPosition) {
      const [doorX,doorY,doorZ]=entrance.doorPosition,dx=doorX-x,dz=doorZ-z;
      const lengthSquared=dx*dx+dz*dz;
      const t=lengthSquared?Math.max(0,Math.min(1,((position.x-x)*dx+(position.z-z)*dz)/lengthSquared)):1;
      return Math.abs(position.y-(y+(doorY-y)*t))<1.5
        &&Math.hypot(position.x-(x+dx*t),position.z-(z+dz*t))<=entrance.radius;
    }
    return Math.abs(position.y-y)<1.5&&Math.hypot(position.x-x,position.z-z)<=entrance.radius;
  }));
  function update(dt,{position,blocked=false,flying=false,manual=false}={}) {
    near=!flying&&proximity(position);
    let started=false,completed=false;
    if(!blocked&&near&&phase==='idle'){phase='opening';started=true;}
    if(!blocked&&phase==='opening') {
      elapsed=reducedMotion?duration:Math.min(duration,elapsed+Math.max(0,Number.isFinite(dt)?dt:0));
      if(elapsed>=duration){phase='open';completed=true;}
    } else if(!blocked&&manual&&near&&phase==='open')completed=true;
    return {started,completed,near,phase,progress:duration?elapsed/duration:1};
  }
  return {update,get phase(){return phase;},get near(){return near;}};
}

function node(tag,className,text) {
  const el=document.createElement(tag);if(className)el.className=className;
  if(text!==undefined)el.textContent=text;return el;
}
export function validZhihuAnswer(answer) {
  if(!answer||typeof answer.title!=='string'||typeof answer.excerpt!=='string'||!answer.title.trim()||!answer.excerpt.trim())return false;
  try {
    const url=new URL(answer.url);
    return url.protocol==='https:'&&['www.zhihu.com','zhihu.com'].includes(url.hostname)
      &&!url.username&&!url.password&&!url.port&&/^\/(?:question\/\d+\/)?answer\/\d+\/?$/.test(url.pathname);
  }catch{return false;}
}

export function createKnowledgeDoorUI({clearInput=()=>{}}={}) {
  let entrance=null,state=null,generation=0,request=null;
  const photograph=createArchitecturePhoto({clearInput});
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const action=node('button','knowledge-door-action');action.type='button';action.hidden=true;
  action.id='knowledgeDoorAction';action.addEventListener('click',interact);
  const transition=node('div','knowledge-door-transition');transition.hidden=true;
  transition.setAttribute('aria-hidden','true');
  const transitionFrame=node('div','knowledge-door-transition-frame');
  const left=node('div','knowledge-door-shutter knowledge-door-shutter-left');
  const right=node('div','knowledge-door-shutter knowledge-door-shutter-right');
  const transitionTitle=node('span','knowledge-door-transition-title');
  transitionFrame.append(left,right);transition.append(transitionFrame,transitionTitle);
  const dialog=node('dialog','knowledge-dialog');dialog.id='knowledgeDialog';
  dialog.setAttribute('aria-labelledby','knowledgeTitle');
  const head=node('header','knowledge-dialog-head');
  const titles=node('div');const kicker=node('p','knowledge-kicker','推门见知 · 知乎');
  const title=node('h2');title.id='knowledgeTitle';titles.append(kicker,title);
  const close=node('button','knowledge-close','×');close.type='button';close.setAttribute('aria-label','关闭回答，继续漫游');
  close.addEventListener('click',()=>dialog.close());head.append(titles,close);
  const content=node('div','knowledge-content');content.setAttribute('aria-live','polite');
  const footer=node('footer','knowledge-dialog-footer');
  const search=node('a','knowledge-search','去知乎搜索相关回答 ↗');search.target='_blank';search.rel='noopener noreferrer';
  const continueButton=node('button','knowledge-continue','继续漫游');continueButton.type='button';continueButton.addEventListener('click',()=>dialog.close());
  const photoButton=node('button','knowledge-photo','拍建筑纪念照');photoButton.type='button';photoButton.onclick=openPhoto;
  footer.append(search,photoButton,continueButton);dialog.append(head,content,footer);
  dialog.addEventListener('close',()=>{clearInput();if(entrance&&state?.near&&!document.querySelector('dialog[open]')){action.hidden=false;action.focus({preventScroll:true});}});
  document.body.append(action,transition,dialog);

  function context(position,flying=false) {
    return {position,flying,blocked:document.hidden||Boolean(document.querySelector('dialog[open]'))};
  }
  function apply(result) {
    if(!entrance)return;
    entrance.setProgress(result.progress);
    if(result.started){clearInput();transitionTitle.textContent=`走近${entrance.name} · 推门见知`;}
    transition.hidden=entrance.mode!=='transition'||result.phase!=='opening'||reduced.matches;
    const eased=1-Math.pow(1-result.progress,3);
    left.style.transform=`perspective(700px) rotateY(${-eased*100}deg)`;
    right.style.transform=`perspective(700px) rotateY(${eased*100}deg)`;
    action.textContent=result.phase==='open'?`重看${entrance.name}的知乎回答 · E`:`走近${entrance.name} · 推门见知`;
    action.hidden=!result.near||result.phase!=='open'||Boolean(document.querySelector('dialog[open]'));
    if(result.completed)openAnswers();
  }
  let lastPosition=null,lastFlying=false;
  function update(dt,position,flying=false) {
    if(!state)return;
    lastPosition=position;lastFlying=flying;
    apply(state.update(dt,context(position,flying)));
  }
  function interact() {
    if(!state||!lastPosition)return false;
    const input=context(lastPosition,lastFlying);
    if(input.blocked||input.flying||!state.near)return false;
    apply(state.update(0,{...input,manual:true}));return true;
  }
  function enter(nextEntrance) {
    leave();entrance=nextEntrance;
    if(entrance)state=createKnowledgeDoorState(entrance,{reducedMotion:reduced.matches});
  }
  function leave() {
    photograph.reset();
    generation++;request?.abort();request=null;entrance=null;state=null;lastPosition=null;lastFlying=false;
    action.hidden=true;transition.hidden=true;if(dialog.open)dialog.close();content.replaceChildren();
  }
  function openPhoto(){return entrance?photograph.open(entrance.id):false;}
  async function openAnswers() {
    if(!entrance||dialog.open)return;
    clearInput();action.hidden=true;transition.hidden=true;
    const current=entrance,token=++generation;
    title.textContent=current.name;
    search.href=`https://www.zhihu.com/search?type=content&q=${encodeURIComponent(current.name)}`;
    content.replaceChildren(node('p','knowledge-status','正在读取相关回答……'));
    dialog.showModal();close.focus({preventScroll:true});
    request?.abort();request=new AbortController();
    try {
      const response=await fetch('/knowledge/zhihu.json',{signal:request.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();if(token!==generation||entrance!==current)return;
      const site=data?.sites?.[current.id];
      const votes=answer=>Number.isFinite(answer.voteUpCount)?answer.voteUpCount:-1;
      const answers=Array.isArray(site?.answers)?site.answers.filter(validZhihuAnswer).sort((a,b)=>votes(b)-votes(a)).slice(0,5):[];
      content.replaceChildren();
      if(!answers.length)content.append(node('p','knowledge-status','暂无已收录的知乎回答。可以前往知乎搜索这座建筑，或继续在场景中探索。'));
      else {
        content.append(node('p','knowledge-note','检索结果中按赞同数排序 · 搜索摘要节选'));
        for(const answer of answers) {
          const article=node('article','knowledge-answer');
          article.append(node('h3','',answer.title));
          const author=typeof answer.author==='string'&&answer.author.trim()?answer.author:'作者未提供';
          const votes=Number.isFinite(answer.voteUpCount)&&answer.voteUpCount>=0?` · ${Math.floor(answer.voteUpCount).toLocaleString('zh-CN')} 赞同`:'';
          article.append(node('p','knowledge-answer-meta',author+votes));
          const excerpt=answer.excerpt.trim();
          article.append(node('p','knowledge-answer-excerpt',excerpt.length>280?excerpt.slice(0,280)+'…':excerpt));
          const link=node('a','knowledge-answer-link','阅读知乎原回答 ↗');link.href=answer.url;link.target='_blank';link.rel='noopener noreferrer';article.append(link);content.append(article);
        }
      }
      if(typeof data.updatedAt==='string') {
        const date=new Date(data.updatedAt);
        if(Number.isFinite(date.getTime()))content.append(node('p','knowledge-updated',`收录于 ${date.toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})} · 赞同数以收录时为准`));
      }
    } catch(error) {
      if(error.name==='AbortError'||token!==generation||entrance!==current)return;
      content.replaceChildren(node('p','knowledge-status','回答暂时加载失败。可以稍后在门前重试，或前往知乎搜索相关内容。'));
    }
  }
  return {enter,leave,update,interact,openPhoto,get opening(){return state?.phase==='opening';},
    get state(){return state;},get entrance(){return entrance;},destroy(){leave();photograph.destroy();action.remove();transition.remove();dialog.remove();}};
}
