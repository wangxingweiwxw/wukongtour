import {Geometry} from './mesh.mjs';

const dimension=(value,min,max,label)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(`${label} must be between ${min} and ${max}`);
  return value;
};
// Faceted, closed ellipsoid crowns; real meshes rather than billboard textures.
function crown(geo,center,radius,height,material,phase){
  const segments=10,rings=5;
  const point=(row,col)=>{
    const t=row/rings*Math.PI,a=col/segments*Math.PI*2;
    const variation=1+.09*Math.sin(col*2.7+phase)*Math.sin(t);
    return [center[0]+Math.sin(t)*Math.cos(a)*radius*variation,
      center[1]+Math.cos(t)*height/2,
      center[2]+Math.sin(t)*Math.sin(a)*radius*variation];
  };
  for(let row=0;row<rings;row++)for(let col=0;col<segments;col++){
    const a=point(row,col),b=point(row,col+1),c=point(row+1,col+1),d=point(row+1,col);
    const hint=a.map((v,i)=>(v+b[i]+c[i]+d[i])/4-center[i]);
    geo.quad(a,b,c,d,material,hint);
  }
}

export function addVegetation(site,spec){
  const trees=spec.trees??[];
  if(!Array.isArray(trees)||trees.length>300)throw Error('trees must be an array with at most 300 entries');
  for(const item of trees){
    const f=site.frame(item,'trees'),geo=new Geometry();
    const h=dimension(item.height??9,3.5,32,`${f.id}.height`);
    const r=dimension(item.crownRadius??h*.28,.5,12,`${f.id}.crownRadius`);
    const trunk=dimension(item.trunkRadius??h*.035,.08,1.5,`${f.id}.trunkRadius`);
    const seed=dimension(item.seed??spec.seed??17,-1e9,1e9,`${f.id}.seed`);
    const style=item.style??'pine';
    if(!['pine','broadleaf'].includes(style))throw Error(`${f.id}.style must be pine or broadleaf`);
    const bark=site.material(item.trunkMaterial,'timberDark');
    const leaf=site.material(item.leafMaterial,'foliage');
    const light=site.material(item.highlightMaterial,'foliageLight');
    geo.cylinder(0,h*.39,0,trunk,h*.78,bark,10);
    if(style==='pine'){
      for(let i=0;i<5;i++){
        const a=seed+i*2.4,y=h*(.48+i*.095),reach=r*(.72-i*.1);
        const x=Math.cos(a)*reach,z=Math.sin(a)*reach;
        geo.beam([0,y-.4,0],[x,y,z],trunk*.8,trunk*.7,bark);
        crown(geo,[x*.55,y+.2,z*.55],r*(.9-i*.12),h*.18,i%2?light:leaf,seed+i);
      }
      crown(geo,[0,h*.94,0],r*.3,h*.12,light,seed+7);
    }else{
      crown(geo,[0,h*.76,0],r,h*.48,leaf,seed);
      for(let i=0;i<3;i++){
        const a=i*Math.PI*2/3+seed,x=Math.cos(a)*r*.55,z=Math.sin(a)*r*.55;
        geo.beam([0,h*.45,0],[x,h*.66,z],trunk*.7,trunk*.7,bark);
        crown(geo,[x,h*.7,z],r*.65,h*.3,i%2?light:leaf,seed+i);
      }
    }
    // Soft foliage is decorative. Collision follows the physical trunk only.
    site.collider(f,0,h*.39,0,trunk*2,h*.78,trunk*2,.4);
    site.asset.nodes[f.node].extras={kind:'tree',style};
    site.finish(f,'vegetation',geo,{kind:'vegetation',style});
  }
}
