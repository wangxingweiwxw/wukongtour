import assert from 'node:assert/strict';
import { createJourneyScene } from '../src/heritage/journey-scenes.js';
import { canStand, groundHeight, moveWalker, findWalkPath, segmentWalkable } from '../src/heritage/walk-controller.js';

const point=([x,y,z])=>({x,y,z});
const close=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-7;

for(const id of ['shisi','dule','foguang','xiaoxitian','shuilu']) {
  const world=createJourneyScene(id);
  assert.equal(world.interiors.length,1,`${id}: one authored ground-storey interior`);
  const interior=world.interiors[0],center=point(interior.center);
  assert(canStand(world,center.x,center.z,center.y),`${id}: interior standing space`);
  assert.equal(groundHeight(world,center.x,center.z),center.y,`${id}: visible floor matches walk height`);
  assert.deepEqual(interior.entrances.map(e=>e.side),['left','right','front']);
  for(const entrance of interior.entrances) {
    const outside=point(entrance.outside),inside=point(entrance.inside);
    assert.equal(groundHeight(world,outside.x,outside.z),0,`${id}/${entrance.side}: steps start on courtyard`);
    assert(segmentWalkable(world,outside,inside),`${id}/${entrance.side}: stairs and open doorway are continuous`);
    assert(segmentWalkable(world,inside,outside),`${id}/${entrance.side}: exit is continuous`);
    for(const [from,to] of [[outside,inside],[inside,outside]]) {
      const position={...from};
      const result=moveWalker(world,position,to.x-from.x,to.z-from.z);
      assert(result.moved&&result.stepped,`${id}/${entrance.side}: moves over real steps`);
      assert(close(position,to),`${id}/${entrance.side}: reaches destination (${JSON.stringify(position)})`);
    }
    const arrival=findWalkPath(world,point(world.spawn),outside);
    assert(arrival.length>=2,`${id}/${entrance.side}: stairway reachable from spawn`);
    const indoor=findWalkPath(world,inside,center);
    assert(indoor.length>=2,`${id}/${entrance.side}: connects to indoor circulation`);
    for(const route of [arrival,indoor])for(let i=1;i<route.length;i++)
      assert(segmentWalkable(world,route[i-1],route[i]),`${id}: path does not cut through walls or props`);
  }
  for(const [x,y,z] of interior.solidSamples)assert.equal(canStand(world,x,z,y),false,`${id}: solid wall, column or sculpture at ${x},${z}`);
  assert(world.root.children.some(mesh=>mesh.name.endsWith('-roof')&&mesh.visible),`${id}: roof remains in the scene`);
  world.root.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});
  console.log(`${id}: left/right/front stairs traversable in both directions; indoor paths, solid props and retained roof verified`);
}
