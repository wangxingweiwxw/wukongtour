// Ground-only routes use the same collision predicate as the character controller.
// The bounded grid keeps guidance deterministic and inexpensive on phones.
export function findJourneyPath(start, end, blocked, obstacles = []) {
 const intersects=(a,b,box)=>{
  let lo=0,hi=1;
  for(const [axis,min,max] of [['x',box.minX,box.maxX],['z',box.minZ,box.maxZ]]){
   const d=b[axis]-a[axis];
   if(Math.abs(d)<1e-10){if(a[axis]<=min||a[axis]>=max)return false;continue;}
   const u=(min-a[axis])/d,v=(max-a[axis])/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));
   if(lo>=hi)return false;
  }
  return lo<hi&&hi>0&&lo<1;
 };
 const clear=(a,b)=>{
  // Exact slab intersection prevents short diagonals cutting through a padded corner.
  if(obstacles.some(box=>intersects(a,b,box)))return false;
  const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*4);
  for(let i=0;i<=n;i++){const t=n?i/n:0;if(blocked(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))return false;}
  return true;
 };
 if(blocked(start.x,start.z)||blocked(end.x,end.z))return [];
 if(clear(start,end))return [start,end];
 const snap=p=>{const candidates=[];for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const q={x:Math.round(p.x)+dx,z:Math.round(p.z)+dz};if(clear(p,q))candidates.push(q);}return candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];};
 const a=snap(start),b=snap(end);if(!a||!b)return [];
 const key=p=>`${p.x},${p.z}`,queue=[a],previous=new Map([[key(a),null]]),nodes=new Map([[key(a),a]]);
 let found=false;
 for(let i=0;i<queue.length;i++){
  const p=queue[i];if(key(p)===key(b)){found=true;break;}
  for(const [dx,dz] of [[0,-1],[-1,0],[1,0],[0,1]]){
   const q={x:p.x+dx,z:p.z+dz},k=key(q);
   if(Math.abs(q.x)>24||Math.abs(q.z)>25||previous.has(k)||!clear(p,q))continue;
   previous.set(k,key(p));nodes.set(k,q);queue.push(q);
  }
 }
 if(!found)return [];
 const route=[end];let k=key(b);while(k!==null){route.push(nodes.get(k));k=previous.get(k);}route.push(start);route.reverse();
 const simplified=[route[0]];let index=0;
 while(index<route.length-1){let next=route.length-1;while(next>index+1&&!clear(route[index],route[next]))next--;simplified.push(route[next]);index=next;}
 return simplified;
}
