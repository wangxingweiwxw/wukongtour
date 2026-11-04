// Each scene has its own pre-generated, high-detail architectural artwork.
// Load only the selected photograph; the nine full-size images stay off the
// gameplay path and no model credentials are shipped to the browser.
export const ARCHITECTURE_PHOTOS = {
  shisi: {name:'时思寺',caption:'古树荫下，木殿听雨。'},
  yungang: {name:'云冈石窟',caption:'砂岩深处，千年凝望。'},
  xuankong: {name:'悬空寺',caption:'危崖悬阁，云起檐间。'},
  yingxian: {name:'应县木塔',caption:'层檐叠影，木构入云。'},
  dule: {name:'独乐寺',caption:'重阁静立，古木生光。'},
  foguang: {name:'佛光寺',caption:'唐风宽檐，山中一殿。'},
  xiaoxitian: {name:'小西天',caption:'金色悬塑，一殿万象。'},
  shuilu: {name:'水陆庵',caption:'彩塑满壁，咫尺山河。'},
  kaiyuan: {name:'开元寺东西塔',caption:'东西双塔，石庭相望。'},
};

function element(tag,className,text) {
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}

export function createArchitecturePhoto({clearInput=()=>{}}={}) {
  let generation=0,currentId=null;
  const dialog=element('dialog','architecture-photo');dialog.id='architecturePhoto';
  dialog.setAttribute('aria-labelledby','architecturePhotoTitle');
  const head=element('div','architecture-photo-head');
  const titles=element('div');
  const eyebrow=element('p','architecture-photo-kicker','山河入镜 · 建筑纪念照');
  const title=element('h2');title.id='architecturePhotoTitle';titles.append(eyebrow,title);
  const close=element('button','architecture-photo-close','×');close.type='button';
  close.setAttribute('aria-label','关闭纪念照，继续漫游');close.onclick=()=>dialog.close();
  head.append(titles,close);
  const frame=element('div','architecture-photo-frame');
  const status=element('p','architecture-photo-status');status.setAttribute('role','status');
  const caption=element('p','architecture-photo-caption');
  const label=element('p','architecture-photo-label','AI 写实纪念照 · 黑神话氛围演绎');
  const note=element('p','architecture-photo-note','为当前建筑预制的 AI 场景画面，非游戏实拍。');
  const footer=element('div','architecture-photo-footer');
  const download=element('a','architecture-photo-save','保存原图');download.hidden=true;
  const retry=element('button','architecture-photo-retry','重新载入');retry.type='button';retry.hidden=true;
  retry.onclick=()=>load(currentId);
  const back=element('button','architecture-photo-back','继续漫游');back.type='button';back.onclick=()=>dialog.close();
  footer.append(download,retry,back);dialog.append(head,frame,status,caption,label,note,footer);
  dialog.addEventListener('close',()=>{generation++;clearInput();});
  document.body.append(dialog);

  function load(id) {
    const photo=ARCHITECTURE_PHOTOS[id];if(!photo)return false;
    currentId=id;const token=++generation;
    title.textContent=photo.name;caption.textContent=photo.caption;
    status.hidden=false;status.textContent='正在装入建筑纪念照……';
    frame.classList.remove('is-ready');frame.replaceChildren();
    download.hidden=true;download.removeAttribute('href');retry.hidden=true;
    const image=element('img');image.alt=`${photo.name} · 黑神话氛围 AI 写实建筑纪念照`;
    image.width=1672;image.height=941;image.decoding='async';image.hidden=true;
    const url=`/photos/${id}.png`;
    image.onload=()=>{
      if(token!==generation)return;
      image.hidden=false;status.hidden=true;frame.classList.add('is-ready');
      download.href=url;download.download=`悟空访古-${photo.name}-AI写实纪念照.png`;download.hidden=false;
    };
    image.onerror=()=>{
      if(token!==generation)return;
      status.textContent='纪念照暂时未能载入，请重试。';retry.hidden=false;
    };
    frame.append(image);image.src=url;return true;
  }
  function open(id) {
    if(!Object.hasOwn(ARCHITECTURE_PHOTOS,id))return false;
    clearInput();
    // The menu and answer panel yield their modal focus to the photograph.
    for(const id of ['mobileGameMenu','knowledgeDialog']) {
      const previous=document.getElementById(id);if(previous?.open)previous.close();
    }
    load(id);if(!dialog.open)dialog.showModal();close.focus({preventScroll:true});return true;
  }
  function reset(){generation++;currentId=null;if(dialog.open)dialog.close();frame.replaceChildren();}
  return {open,reset,destroy(){reset();dialog.remove();}};
}
