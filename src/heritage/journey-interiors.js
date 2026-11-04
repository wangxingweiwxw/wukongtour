// Steps and their walk surfaces share the same dimensions. A platform edge
// remains a real drop; only the authored entrances let a walker climb it.
export function enterablePlatform(b, {id, x=0, z, width, depth, height,
  sideOffset=2.5, sideWidth=2.8, frontWidth=3.2, frontX=x,
  center=[x,height,z+depth/2-1.8], stone=['#aba493','#bdb5a3','#918d80','#ccc3b0']}) {
  b.surface(x,z,width,depth,height);
  const steps=Math.ceil(height/.18), rise=height/steps, tread=.6, run=steps*tread;
  for (const side of [-1,1]) for (let level=1;level<=steps;level++) {
    const xx=x+side*(width/2+(steps-level+.5)*tread), h=level*rise;
    b.box(xx,h/2,z+sideOffset,tread,h,sideWidth,stone[level%stone.length]);
    b.surface(xx,z+sideOffset,tread,sideWidth,h);
  }
  for (let level=1;level<=steps;level++) {
    const zz=z+depth/2+(steps-level+.5)*tread, h=level*rise;
    b.box(frontX,h/2,zz,frontWidth,h,tread,stone[level%stone.length]);
    b.surface(frontX,zz,frontWidth,tread,h);
  }
  const interior={id,center,entrances:[
    ...[-1,1].map(side=>({side:side<0?'left':'right',
      outside:[x+side*(width/2+run+.6),0,z+sideOffset],
      inside:[x+side*(width/2-2.6),height,z+sideOffset]})),
    {side:'front',outside:[frontX,0,z+depth/2+run+.6],inside:[frontX,height,center[2]]},
  ],solidSamples:[]};
  (b.interiors ||= []).push(interior);
  return interior;
}

// Body-sized clearance permits walking between columns while retaining their
// physical collision. The wider scenery clearance is still used outside halls.
export function interiorObstacle(b,x,z,w,d,minY,maxY,padding=.38) {
  b.obstacle(x,z,w,d,minY,maxY,padding);
}
