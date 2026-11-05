// Small deterministic geometry toolkit. No browser, npm package or project imports.
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const unit=v=>{const length=Math.hypot(...v);return length>1e-10?v.map(n=>n/length):null;};

export class Geometry {
  constructor(){this.parts=new Map();}
  triangle(a,b,c,material,normalHint=null){
    let normal=unit(cross(sub(b,a),sub(c,a)));
    if(!normal)return; // Collapsed roof-apex triangles have no surface area.
    if(normalHint&&dot(normal,normalHint)<0){[b,c]=[c,b];normal=normal.map(v=>-v);}
    let part=this.parts.get(material);
    if(!part){part={positions:[],normals:[],indices:[]};this.parts.set(material,part);}
    const start=part.positions.length/3;
    part.positions.push(...a,...b,...c);part.normals.push(...normal,...normal,...normal);
    part.indices.push(start,start+1,start+2);
  }
  quad(a,b,c,d,material,hint=null){this.triangle(a,b,c,material,hint);this.triangle(a,c,d,material,hint);}
  box(x,y,z,w,h,d,material,transform=null){
    if(Math.min(w,h,d)<=0)return;
    const points=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
      .map(([a,b,c])=>[x+a*w/2,y+b*h/2,z+c*d/2]).map(p=>transform?transform(p):p);
    for(const ids of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]])this.quad(...ids.map(i=>points[i]),material);
  }
  cylinder(x,y,z,radius,height,material,sides=12){
    for(let i=0;i<sides;i++){
      const a=i*Math.PI*2/sides,b=(i+1)*Math.PI*2/sides;
      const p=[x+Math.cos(a)*radius,y-height/2,z+Math.sin(a)*radius];
      const q=[x+Math.cos(b)*radius,y-height/2,z+Math.sin(b)*radius];
      const r=[q[0],y+height/2,q[2]],s=[p[0],y+height/2,p[2]];
      this.quad(p,q,r,s,material,[Math.cos((a+b)/2),0,Math.sin((a+b)/2)]);
      this.triangle([x,y+height/2,z],s,r,material,[0,1,0]);
      this.triangle([x,y-height/2,z],q,p,material,[0,-1,0]);
    }
  }
  beam(a,b,width,depth,material){
    const direction=sub(b,a),axis=unit(direction);if(!axis)return;
    const right=unit(cross(Math.abs(axis[1])>.95?[1,0,0]:[0,1,0],axis));
    const forward=cross(right,axis),center=a.map((v,i)=>(v+b[i])/2);
    this.box(0,0,0,width,Math.hypot(...direction),depth,material,p=>center.map((v,i)=>v+right[i]*p[0]+axis[i]*p[1]+forward[i]*p[2]));
  }
}

function linearColor(value){return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;}
export class Asset {
  constructor(name,materials){
    this.nodes=[{name,children:[],extras:{units:'meters',upAxis:'Y',frontAxis:'+Z'}}];
    this.meshes=[];this.views=[];this.accessors=[];this.chunks=[];this.byteLength=0;
    this.materialNames=Object.keys(materials);
    this.materials=this.materialNames.map(name=>{
      const m=materials[name],hex=m.color.replace('#','');
      return {name,pbrMetallicRoughness:{baseColorFactor:[0,2,4].map(i=>linearColor(parseInt(hex.slice(i,i+2),16)/255)).concat(1),
        metallicFactor:m.metallic??0,roughnessFactor:m.roughness??.9},doubleSided:false};
    });
  }
  group(name,parent=0,position=null,rotation=0){
    if(this.nodes.some(node=>node.name===name))throw Error(`Duplicate node name: ${name}`);
    const node={name,children:[]};
    if(position)node.translation=position;
    if(rotation)node.rotation=[0,Math.sin(rotation/2),0,Math.cos(rotation/2)];
    this.nodes.push(node);const index=this.nodes.length-1;this.nodes[parent].children.push(index);return index;
  }
  accessor(values,size,componentType,target){
    if(!values.length||values.length%size||!values.every(Number.isFinite))throw Error('Empty or non-finite geometry attribute');
    const bytesPer=componentType===5123?2:4,buffer=Buffer.alloc(values.length*bytesPer);
    values.forEach((value,i)=>{
      if(componentType===5126)buffer.writeFloatLE(value,i*4);
      else if(componentType===5123)buffer.writeUInt16LE(value,i*2);
      else buffer.writeUInt32LE(value,i*4);
    });
    const pad=Buffer.alloc((4-this.byteLength%4)%4);this.chunks.push(pad);this.byteLength+=pad.length;
    const view=this.views.length;this.views.push({buffer:0,byteOffset:this.byteLength,byteLength:buffer.length,target});
    this.chunks.push(buffer);this.byteLength+=buffer.length;
    const min=Array(size).fill(Infinity),max=Array(size).fill(-Infinity);
    values.forEach((v,i)=>{min[i%size]=Math.min(min[i%size],v);max[i%size]=Math.max(max[i%size],v);});
    this.accessors.push({bufferView:view,byteOffset:0,componentType,count:values.length/size,type:size===1?'SCALAR':`VEC${size}`,min,max});
    return this.accessors.length-1;
  }
  addGeometry(name,geometry,parent,extras={}){
    const primitives=[];
    for(const [material,part] of geometry.parts){
      const materialIndex=this.materialNames.indexOf(material);if(materialIndex<0)throw Error(`Unknown material: ${material}`);
      primitives.push({attributes:{POSITION:this.accessor(part.positions,3,5126,34962),NORMAL:this.accessor(part.normals,3,5126,34962)},
        indices:this.accessor(part.indices,1,part.positions.length/3<=65535?5123:5125,34963),material:materialIndex,mode:4});
    }
    if(!primitives.length)return null;
    const node=this.group(name,parent);this.nodes[node].mesh=this.meshes.length;
    if(Object.keys(extras).length)this.nodes[node].extras=extras;
    this.meshes.push({name,primitives});return node;
  }
  binary(){
    const bin=Buffer.concat([...this.chunks,Buffer.alloc((4-this.byteLength%4)%4)]);
    const doc={asset:{version:'2.0',generator:'image-to-heritage-glb / standalone Node builder 1'},scene:0,scenes:[{name:this.nodes[0].name,nodes:[0]}],
      nodes:this.nodes.map(node=>{const copy={...node};if(!copy.children.length)delete copy.children;return copy;}),
      meshes:this.meshes,materials:this.materials,buffers:[{byteLength:this.byteLength}],bufferViews:this.views,accessors:this.accessors};
    const raw=Buffer.from(JSON.stringify(doc));const json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]);
    const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);
    header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
    const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
    return Buffer.concat([header,json,binHeader,bin]);
  }
}
