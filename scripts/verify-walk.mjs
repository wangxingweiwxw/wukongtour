import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {groundHeight, canStand, moveWalker, segmentWalkable, findWalkPath} from '../src/heritage/walk-controller.js';

const bounds = {minX: -44, maxX: 44, minZ: -48, maxZ: 48};
function compound(colliders = []) {
  const surfaces = [{minX: -4, maxX: 4, minZ: -3, maxZ: 3, height: .72}];
  // Four 65cm treads at both ends of a raised hall platform.
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const a = side * (3 + i * .65), b = side * (3 + (i + 1) * .65);
    surfaces.push({minX: -1.5, maxX: 1.5, minZ: Math.min(a, b), maxZ: Math.max(a, b), height: .72 - i * .18});
  }
  return {bounds, surfaces, colliders};
}
const passed = [];
const check = (name, fn) => {fn();passed.push(name);};
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} != ${expected}`);

check('Overlapping surfaces select the highest supported floor; the rest is ground', () => {
  const world = compound();
  near(groundHeight(world, 0, 0), .72, 'platform');
  near(groundHeight(world, 0, 5.3), .18, 'front lowest tread');
  near(groundHeight(world, 0, -4), .54, 'rear tread');
  assert.equal(groundHeight(world, 7, 0), 0);
  world.surfaces.push({minX: -.2, maxX: .2, minZ: -.2, maxZ: .2, height: .9});
  near(groundHeight(world, 0, 0), .9, 'new overlapping surface invalidates index');
});

check('Front and rear stairs permit walking through the hall in both directions', () => {
  const world = compound([
    {minX: -4.1, maxX: -3.5, minZ: -3, maxZ: 3, minY: .72, maxY: 5},
    {minX: 3.5, maxX: 4.1, minZ: -3, maxZ: 3, minY: .72, maxY: 5},
  ]);
  for (const sign of [-1, 1]) {
    const hero = new Vector3(0, 0, sign * 7);
    const result = moveWalker(world, hero, 0, -sign * 14);
    assert(result.moved && result.stepped && !result.blocked);
    near(hero.z, -sign * 7, 'passed opposite stairs');near(hero.y, 0, 'descended to ground');
  }
  const hero = {x: 0, y: .72, z: 0};
  const slide = moveWalker(world, hero, 6, .5);
  assert(slide.blocked && slide.moved);assert(hero.x < 3.5);near(hero.z, .5, 'slides along side wall');
});

check('Platform sides cannot be climbed or dropped from, even during a long update', () => {
  const world = compound();
  const outside = {x: 6, y: 0, z: 0};
  const up = moveWalker(world, outside, -12, 0);
  assert(up.blocked);assert(outside.x > 4);near(outside.y, 0, 'no sideways climb');
  const inside = {x: 0, y: .72, z: 0};
  const down = moveWalker(world, inside, 12, 0);
  assert(down.blocked);assert(inside.x <= 4);near(inside.y, .72, 'no sideways drop');
  assert.equal(segmentWalkable(world, {x: 6, z: 0}, {x: -6, z: 0}), false);
});

check('A 1mm pillar cannot be skipped by fast movement or a diagonal shortcut', () => {
  const pillar = {minX: .031, maxX: .032, minZ: -.1, maxZ: .1, minY: 0, maxY: 3};
  const world = {bounds, surfaces: [], colliders: [pillar]};
  const hero = {x: -3, y: 0, z: 0};
  assert(moveWalker(world, hero, 9, 0).blocked);assert(hero.x < pillar.minX);
  assert.equal(segmentWalkable(world, {x: -3, z: 0}, {x: 6, z: 0}), false);
  assert.equal(segmentWalkable(world, {x: -.1, z: -.1}, {x: .1, z: .1}), false);
});

check('A substep cannot skip a narrow high ledge whose endpoints are both on the ground', () => {
  const world = {bounds, colliders: [], surfaces: [{minX: .03, maxX: .031, minZ: -1, maxZ: 1, height: .72}]};
  const hero = {x: 0, y: 0, z: 0};
  assert(moveWalker(world, hero, .08, 0).blocked);near(hero.x, 0, 'no leap across ledge');
  assert.equal(segmentWalkable(world, hero, {x: .08, z: 0}), false);
});

check('Vertical overlap allows headroom and standing on solids, but blocks low beams', () => {
  const world = {bounds, surfaces: [], colliders: [{minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: 2, maxY: 3}]};
  assert.equal(canStand(world, 0, 0), true);
  assert.equal(canStand(world, 0, 0, .3), false);
  assert.equal(canStand(world, 0, 0, 3), true);
  world.colliders.push({minX: 2, maxX: 3, minZ: -1, maxZ: 1, minY: 0, maxY: .72});
  world.surfaces.push({minX: 2, maxX: 3, minZ: -1, maxZ: 1, height: .72});
  assert.equal(canStand(world, 2.5, 0), true);
  assert.equal(canStand(world, 2.5, 0, 0), false);
});

check('Step limits distinguish 22cm ascent and 26cm descent', () => {
  const world = {bounds, colliders: [], surfaces: [{minX: 0, maxX: 2, minZ: -1, maxZ: 1, height: .25}]};
  assert.equal(segmentWalkable(world, {x: -1, z: 0}, {x: 1, z: 0}), false);
  assert.equal(segmentWalkable(world, {x: 1, z: 0}, {x: -1, z: 0}), true);
  const hero = {x: 1, y: .25, z: 0};
  assert.equal(moveWalker(world, hero, -2, 0).blocked, false);near(hero.y, 0, '25cm descent');
  world.surfaces.push({minX: 3, maxX: 5, minZ: -1, maxZ: 1, height: .27});
  assert.equal(segmentWalkable(world, {x: 4, z: 0}, {x: 6, z: 0}), false);
  for (const [height, up, down] of [[.22, true, true], [.2201, false, true], [.26, false, true], [.2601, false, false]]) {
    const step = {bounds, colliders: [], surfaces: [{minX: 0, maxX: 2, minZ: -1, maxZ: 1, height}]};
    assert.equal(segmentWalkable(step, {x: -1, z: 0}, {x: 1, z: 0}), up);
    assert.equal(segmentWalkable(step, {x: 1, z: 0}, {x: -1, z: 0}), down);
  }
});

check('Displacement is applied without speed amplification; bounds are scene-specific', () => {
  const world = {bounds, surfaces: [], colliders: []};
  const hero = {x: 30, y: 0, z: 30};
  moveWalker(world, hero, 1, 1);near(hero.x, 31, 'x displacement');near(hero.z, 31, 'z displacement');
  assert.equal(canStand(world, 31, 31), true);assert.equal(canStand(world, 44.01, 0), false);
  assert(moveWalker(world, hero, 30, 0).blocked);assert(hero.x <= 44);
  const tight = {bounds: {minX: -1, maxX: 1, minZ: -2, maxZ: 2}, surfaces: [], colliders: []};
  assert.equal(canStand(tight, 2, 0), false);
});

function checkPath(world, start, end) {
  const path = findWalkPath(world, start, end);assert(path.length >= 2, 'reachable route exists');
  near(path[0].x, start.x, 'path starts x');near(path[0].z, start.z, 'path starts z');
  near(path.at(-1).x, end.x, 'path ends x');near(path.at(-1).z, end.z, 'path ends z');
  const hero = {...path[0]};
  for (const target of path.slice(1)) {
    near(target.y, groundHeight(world, target.x, target.z), 'waypoint lies on floor');
    assert(segmentWalkable(world, hero, target), 'each shortcut respects support and headroom');
    const result = moveWalker(world, hero, target.x - hero.x, target.z - hero.z);
    assert.equal(result.blocked, false, 'real movement can follow every path segment');
    near(hero.x, target.x, 'replayed x');near(hero.z, target.z, 'replayed z');near(hero.y, target.y, 'replayed y');
  }
  return path;
}

check('Guidance routes approach raised floors using stairs, not platform edges', () => {
  const world = compound();
  checkPath(world, {x: 6, z: 0}, {x: 0, z: 0});
  checkPath(world, {x: 0, z: 0}, {x: -6, z: 0});
  checkPath(world, {x: 0, z: 7}, {x: 0, z: -7});
});

check('Pathfinding supports coordinates beyond the old courtyard and rejects unreachable tops', () => {
  const world = {bounds, surfaces: [], colliders: [{minX: 29, maxX: 30, minZ: 24, maxZ: 32, minY: 0, maxY: 4}]};
  checkPath(world, {x: 27, z: 28}, {x: 33, z: 28});
  const island = {bounds: {minX: -4, maxX: 4, minZ: -4, maxZ: 4}, colliders: [],
    surfaces: [{minX: -1, maxX: 1, minZ: -1, maxZ: 1, height: .72}]};
  assert.deepEqual(findWalkPath(island, {x: 3, z: 0}, {x: 0, z: 0}), []);
  assert.deepEqual(findWalkPath(world, {x: 0, z: 0}, {x: 45, z: 0}), []);
  assert.deepEqual(findWalkPath(world, {x: NaN, z: 0}, {x: 1, z: 0}), []);
});

console.log(JSON.stringify({passed: passed.length, scenarios: passed}, null, 2));
