import assert from 'node:assert/strict';
import {WALK_SPEED, RUN_SPEED, frameDelta, substepMove} from '../src/heritage/movement.js';
import {moveWalker, groundHeight} from '../src/heritage/walk-controller.js';
import {createCompoundScene} from '../src/heritage/compound-scene.js';

const passed = [];
const check = (name, fn) => {fn();passed.push(name);};
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);
const rates = [10, 30, 60, 144];
const flat = {bounds: {minX: -44, maxX: 44, minZ: -48, maxZ: 48}, surfaces: [], colliders: []};
const modes = [
  ['legacy', (p, x, z) => substepMove(p, x, z, () => true)],
  ['compound', (p, x, z) => moveWalker(flat, p, x, z)],
];

check('Walk/run cover their real-time distance equally at 10/30/60/144 fps in both controllers', () => {
  for (const [mode, move] of modes) for (const speed of [WALK_SPEED, RUN_SPEED]) for (const fps of rates) {
    const p = {x: 0, y: 0, z: 0};
    for (let frame = 0; frame < fps * 2; frame++) move(p, speed * frameDelta(1 / fps), 0);
    close(p.x, speed * 2, `${mode} ${fps}fps ${speed}m/s`);
    close(p.z, 0, 'no lateral drift');
  }
});

check('A 100ms hitch preserves distance; a long pause is capped and invalid deltas cannot move', () => {
  const frames = [...Array(20).fill(1 / 60), .1, ...Array(40).fill(1 / 60)];
  for (const [mode, move] of modes) {
    const p = {x: 0, y: 0, z: 0};
    for (const dt of frames) move(p, RUN_SPEED * frameDelta(dt), 0);
    close(p.x, RUN_SPEED * 1.1, `${mode} hitch distance`);
    const before = p.x;move(p, RUN_SPEED * frameDelta(8), 0);
    close(p.x - before, .8, 'long pause displacement budget');
  }
  for (const invalid of [-1, NaN, Infinity, undefined, '0.1']) assert.equal(frameDelta(invalid), 0);
});

check('Normalized diagonal input travels at the same speed, with no helper renormalization', () => {
  for (const [mode, move] of modes) for (const fps of rates) {
    const p = {x: 0, y: 0, z: 0}, direction = 1 / Math.sqrt(2);
    for (let frame = 0; frame < fps; frame++) {
      const distance = RUN_SPEED * frameDelta(1 / fps);move(p, direction * distance, direction * distance);
    }
    close(Math.hypot(p.x, p.z), RUN_SPEED, `${mode} diagonal ${fps}fps`);
  }
  const p = {x: 0, y: .72, z: 0};substepMove(p, .12, .16, () => true);
  close(p.x, .12, 'requested x');close(p.z, .16, 'requested z');close(p.y, .72, 'legacy height preserved');
});

check('8m/s legacy running cannot skip a 5cm wall across frame phases, and slides along it', () => {
  // A 10fps frame spans 80cm: endpoint-only collision would jump these walls.
  for (const fps of rates) for (let phase = 0; phase < 20; phase++) {
    const left = .113 + phase * .003, right = left + .05;
    const canMove = (x, z) => !(x > left && x < right && Math.abs(z) < 5);
    const p = {x: -.4, y: 0, z: 0};
    for (let frame = 0; frame < fps; frame++) substepMove(p, RUN_SPEED * frameDelta(1 / fps), 0, canMove);
    assert.ok(p.x <= left && p.x > left - .041, `${fps}fps phase ${phase}: stopped before thin wall`);
  }
  const p = {x: 0, y: 0, z: 0};
  const result = substepMove(p, .8, .4, x => x < .2);
  assert.ok(result.blocked && result.moved);assert.ok(p.x < .2);close(p.z, .4, 'wall sliding preserves free axis');
  const idle = substepMove(p, 0, 0, () => {throw Error('idle must not query collision');});
  assert.deepEqual(idle, {moved: false, blocked: false});
});

check('8m/s compound running still sweeps a 1mm wall exactly at 10/30/60/144 fps', () => {
  const wall = {minX: .031, maxX: .032, minZ: -1, maxZ: 1, minY: 0, maxY: 3};
  const world = {...flat, colliders: [wall]};
  for (const fps of rates) {
    const p = {x: -1, y: 0, z: 0};
    for (let frame = 0; frame < fps; frame++) moveWalker(world, p, RUN_SPEED * frameDelta(1 / fps), 0);
    assert.ok(p.x < wall.minX, `${fps}fps cannot tunnel`);
  }
});

check('8m/s can cross the real main-hall stairs in both directions at low and high fps', () => {
  const world = createCompoundScene();
  try {
    for (const fps of rates) for (const direction of [-1, 1]) {
      const p = {x: 0, y: 0, z: direction * 13};let remaining = 26, top = false;
      while (remaining > 1e-8) {
        const distance = Math.min(remaining, RUN_SPEED * frameDelta(1 / fps));
        const result = moveWalker(world, p, 0, -direction * distance);
        assert.equal(result.blocked, false, `main hall ${fps}fps direction ${direction}`);
        close(p.y, groundHeight(world, p.x, p.z), 'grounded on each tread');
        top ||= Math.abs(p.y - .72) < 1e-8;remaining -= distance;
      }
      assert.ok(top, 'crossed the raised hall floor');close(p.z, -direction * 13, 'exit opposite side');close(p.y, 0, 'descended to ground');
    }
    // The centre of this side now has a real staircase. Probe the untouched
    // platform edge beside it so the no-jumping regression remains meaningful.
    const p = {x: 12.5, y: 0, z: 3.6};
    assert.equal(moveWalker(world, p, -RUN_SPEED * frameDelta(.1), 0).blocked, true);
    assert.ok(p.x > 12);close(p.y, 0, 'speed increase cannot hop onto platform side');
  } finally {world.root.traverse(node => {node.geometry?.dispose();node.material?.dispose();});}
});

check('All eight lateral entrances climb and descend at 8m/s across low and high fps', () => {
  const world = createCompoundScene();
  try {
    for (const building of world.buildings) for (const entry of building.sideEntries) for (const fps of rates) {
      const p = {x: entry[0], y: entry[1], z: entry[2]};
      for (const target of [building.interior, entry]) {
        const direction = Math.sign(target[0] - p.x);
        let remaining = Math.abs(target[0] - p.x), stepped = false;
        while (remaining > 1e-8) {
          const distance = Math.min(remaining, RUN_SPEED * frameDelta(1 / fps));
          const result = moveWalker(world, p, direction * distance, 0);
          assert.equal(result.blocked, false, `${building.id} lateral entry ${entry[0]} at ${fps}fps`);
          close(p.y, groundHeight(world, p.x, p.z), 'side stair remains grounded');
          stepped ||= result.stepped;remaining -= distance;
        }
        assert.ok(stepped, 'side route traverses real treads');
        close(p.x, target[0], 'arrived at side-route target');
        close(p.y, target[1], 'arrived at correct floor height');
      }
    }
  } finally {world.root.traverse(node => {node.geometry?.dispose();node.material?.dispose();});}
});

console.log(JSON.stringify({passed: passed.length, walkSpeed: WALK_SPEED, runSpeed: RUN_SPEED, testedFps: rates, scenarios: passed}, null, 2));
