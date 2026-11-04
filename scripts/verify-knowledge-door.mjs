import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createJourneyScene} from '../src/heritage/journey-scenes.js';
import {canStand,findWalkPath,segmentWalkable} from '../src/heritage/walk-controller.js';
import {KNOWLEDGE_ENTRANCES,createKnowledgeDoorState,validZhihuAnswer} from '../src/heritage/knowledge-door.js';

let doors=0,approaches=0;
for(const id of Object.keys(KNOWLEDGE_ENTRANCES)) {
  const world=createJourneyScene(id),entrance=world.knowledgeEntrance;
  assert.equal(entrance.id,id);
  assert(entrance.approaches.length>0,`${id}: no accessible approach`);
  for(const [x,y,z] of entrance.approaches) {
    assert(canStand(world,x,z,y),`${id}: knowledge approach is blocked`);
    const path=findWalkPath(world,{x:world.spawn[0],z:world.spawn[2]},{x,z});
    assert(path.length>0&&Math.hypot(path.at(-1).x-x,path.at(-1).z-z)<.1,`${id}: approach unreachable from spawn`);
    approaches++;
  }
  const position=new Vector3().fromArray(entrance.approaches[0]);
  const state=createKnowledgeDoorState(entrance);
  assert.equal(state.update(1,{position:new Vector3(0,0,20)}).phase,'idle',`${id}: opened at spawn`);
  assert.equal(state.update(1,{position,blocked:true}).phase,'idle',`${id}: opened behind a dialog`);
  assert.equal(state.update(1,{position,flying:true}).phase,'idle',`${id}: opened during flight`);
  assert.equal(state.update(.1,{position}).started,true,`${id}: approach did not open`);
  const beforePause=state.update(.1,{position}).progress;
  assert.equal(state.update(10,{position,blocked:true}).progress,beforePause,`${id}: modal did not suspend animation`);
  let completed=0;
  for(let i=0;i<80;i++){const result=state.update(.01,{position});if(result.completed)completed++;}
  assert.equal(completed,1,`${id}: expected exactly one completion`);
  assert.equal(state.phase,'open');
  for(let i=0;i<10;i++)assert.equal(state.update(1,{position}).completed,false,`${id}: repeats while nearby`);
  state.update(1,{position:new Vector3(0,0,20)});
  assert.equal(state.update(1,{position}).completed,false,`${id}: repeats after returning`);
  assert.equal(state.update(0,{position,manual:true}).completed,true,`${id}: cannot reopen manually`);
  assert.equal(state.update(0,{position,manual:true,blocked:true}).completed,false,`${id}: manual open behind a dialog`);
  const reduced=createKnowledgeDoorState(entrance,{reducedMotion:true});
  assert.equal(reduced.update(0,{position}).completed,true,`${id}: reduced motion still delays`);
  // Scene-owned state means a new visit starts fresh without retaining callbacks.
  const nextVisit=createKnowledgeDoorState(entrance);
  assert.equal(nextVisit.phase,'idle');
  if(entrance.mode==='physical') {
    const front=world.interiors[0].entrances.find(e=>e.side==='front');
    const [ox,,oz]=front.outside,[ix,,iz]=front.inside;
    const [doorX,doorY,doorZ]=entrance.doorPosition;
    const sideOfStairs=new Vector3(doorX+2.3,doorY,doorZ+.5);
    assert(Math.hypot(sideOfStairs.x-ox,sideOfStairs.z-oz)>entrance.radius,`${id}: side test does not bypass the old trigger circle`);
    for(const nearDoor of [new Vector3(doorX,doorY,doorZ),new Vector3(...front.inside),sideOfStairs]) {
      const fromSide=createKnowledgeDoorState(entrance);
      assert.equal(fromSide.update(1,{position:nearDoor,blocked:true}).started,false,`${id}: door opens behind another modal`);
      assert.equal(fromSide.update(1,{position:nearDoor,flying:true}).started,false,`${id}: door opens from flight near its facade`);
      assert.equal(fromSide.update(.1,{position:nearDoor}).started,true,`${id}: doorway/interior/side approach missed`);
      assert.equal(fromSide.update(1,{position:nearDoor}).completed,true);
      assert.equal(fromSide.update(1,{position:nearDoor}).completed,false,`${id}: side approach repeatedly opens`);
    }
    const overhead=createKnowledgeDoorState(entrance);
    assert.equal(overhead.update(1,{position:new Vector3(doorX,doorY+3,doorZ)}).started,false,`${id}: excessive altitude triggers doorway`);
    for(const progress of [0,.5,1]) {
      entrance.setProgress(progress);
      assert(segmentWalkable(world,{x:ox,z:oz},{x:ix,z:iz}),`${id}: door animation blocks the existing stairs`);
    }
    assert(Math.abs(entrance.leaves[0].rotation.y-Math.PI/2)<1e-8);
    assert(Math.abs(entrance.leaves[1].rotation.y+Math.PI/2)<1e-8);
    doors++;
  } else {
    assert.equal(entrance.leaves.length,0,`${id}: a physical door was added to a solid monument`);
  }
}
assert(validZhihuAnswer({title:'建筑问题',excerpt:'原回答摘要',url:'https://www.zhihu.com/question/123/answer/456'}));
assert(validZhihuAnswer({title:'建筑问题',excerpt:'搜索摘要',url:'https://www.zhihu.com/answer/456?utm_source=test'}));
assert(validZhihuAnswer({title:'建筑问题',excerpt:'搜索摘要',url:'https://zhihu.com/answer/456/'}));
for(const url of ['javascript:alert(1)','https://zhihu.com.evil.example/question/1/answer/2','https://www.zhihu.com/search?q=test',
  'https://user@www.zhihu.com/answer/123','https://www.zhihu.com:8443/answer/123','https://other.zhihu.com/answer/123'])
  assert.equal(validZhihuAnswer({title:'标题',excerpt:'摘要',url}),false);
assert.equal(validZhihuAnswer({title:'标题',excerpt:'',url:'https://www.zhihu.com/question/1/answer/2'}),false);
console.log(JSON.stringify({ok:true,sites:9,physicalDoors:doors,accessibleApproaches:approaches,checks:['proximity','pause and flight guards','one automatic opening per visit','manual reopen','reduced motion','door hinges','unchanged stair traversal','valid source links']}));
