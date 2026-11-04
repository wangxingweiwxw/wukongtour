import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {JOURNEYS} from '../src/heritage/journey-data.js';
import {createJourneyState, JOURNEY_SAVE_KEY, OBSERVATION_RADIUS} from '../src/heritage/journey-state.js';

function memoryStorage(initial) {
  const items = new Map(initial === undefined ? [] : [[JOURNEY_SAVE_KEY, initial]]);
  return {getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value)};
}
const results = [];
function check(name, action) { action(); results.push(name); }
const first = JOURNEYS[0].points[0], position = [0, 0, 15], here = {x: 0, z: 15};
const submit = (state, point = first, player = here, where = position) => state.submit(point.id, point.answer, player, where);

check('All 27 tasks have unique ids, valid choices, existing references and matched scene prefixes', () => {
  assert.equal(JOURNEYS.length, 9);
  assert.deepEqual(JOURNEYS.slice(0, 4).map(route => route.id), ['shisi', 'yungang', 'xuankong', 'yingxian']);
  const ids = new Set();
  for (const journey of JOURNEYS) {
    assert.equal(journey.points.length, 3);
    journey.points.forEach((point, i) => {
      assert.equal(point.id, `${journey.id}-${i + 1}`);
      assert(!ids.has(point.id)); ids.add(point.id);
      assert.equal(point.options.length, 3);
      assert(Number.isInteger(point.answer) && point.answer >= 0 && point.answer < point.options.length);
      const reference = point.reference || journey.reference;
      assert(existsSync(new URL(`../public${reference}`, import.meta.url)), `Missing reference: ${reference}`);
      if (journey.referenceKind === 'map') assert.equal(reference, '/heritage-map-v2.png');
      else assert(reference.startsWith('/references/') && reference.endsWith('.jpg'));
    });
  }
  assert.equal(ids.size, 27);
});

check('Walking into interaction range is required; the exact 2.4 m boundary is accepted', () => {
  const state = createJourneyState(memoryStorage());
  assert.equal(submit(state, first, {x: OBSERVATION_RADIUS + .001, z: 15}).reason, 'out-of-range');
  assert.equal(state.progress().done, 0);
  assert.equal(submit(state, first, {x: OBSERVATION_RADIUS, z: 15}).ok, true);
  assert.equal(state.progress().done, 1);
});

check('Wrong answers can be retried and never award a page', () => {
  const state = createJourneyState(memoryStorage());
  assert.equal(state.submit(first.id, (first.answer + 1) % 3, here, position).reason, 'wrong-answer');
  assert.equal(state.nextPoint().id, first.id);
  assert.equal(state.progress().done, 0);
  assert.equal(submit(state).ok, true);
  assert.equal(state.nextPoint().id, 'shisi-2');
});

check('Flying directly above an observation cannot collect it from altitude', () => {
  const state = createJourneyState(memoryStorage());
  assert.equal(submit(state, first, {x: 0, y: 12, z: 15}).reason, 'out-of-range');
  assert.equal(submit(state, first, {x: 0, y: NaN, z: 15}).reason, 'invalid-position');
  assert.equal(state.progress().done, 0);
  assert.equal(submit(state, first, {x: 0, y: 0, z: 15}).ok, true);
});

check('Unvisited scene tasks, unknown ids and invalid travel cannot change progress', () => {
  const state = createJourneyState(memoryStorage());
  assert.equal(submit(state, JOURNEYS[1].points[0]).reason, 'inactive-scene');
  assert.equal(state.submit('missing', 0, here, position).reason, 'unknown-point');
  assert.equal(state.travel('__proto__'), false);
  assert.equal(state.activeId, 'shisi');
  assert.deepEqual(state.progress('missing'), {done: 0, total: 0});
  assert.deepEqual(state.completed, []);
});

check('Malformed coordinates and answer indices fail closed', () => {
  const state = createJourneyState(memoryStorage());
  for (const player of [null, {x: NaN, z: 15}, {x: 0, z: Infinity}, {x: '0', z: 15}]) {
    assert.equal(submit(state, first, player).reason, 'invalid-position');
  }
  for (const where of [null, [0, 15], [0, undefined, 15], [0, , 15], [0, 0, NaN]]) {
    assert.equal(submit(state, first, here, where).reason, 'invalid-position');
  }
  for (const answer of [-1, 3, .5, NaN, String(first.answer)]) {
    assert.equal(state.submit(first.id, answer, here, position).reason, 'invalid-answer');
  }
  assert.equal(state.progress().done, 0);
});

check('Repeated collection is idempotent and returned completion arrays cannot mutate state', () => {
  const state = createJourneyState(memoryStorage());
  assert.equal(submit(state).already, false);
  assert.deepEqual(submit(state), {ok: true, reason: 'already-complete', already: true, saved: true});
  state.completed.push('shisi-2');
  assert.deepEqual(state.completed, [first.id]);
  assert.deepEqual(state.progress(), {done: 1, total: 27});
});

check('Complete all nine journeys, close/recreate state, and restore all 27 pages plus current destination', () => {
  const storage = memoryStorage(), state = createJourneyState(storage);
  for (const journey of JOURNEYS) {
    assert(state.travel(journey.id));
    for (const point of journey.points) assert.equal(submit(state, point).saved, true);
    assert.deepEqual(state.progress(journey.id), {done: 3, total: 3});
    assert.equal(state.nextPoint(), null);
  }
  const reopened = createJourneyState(storage);
  assert.equal(reopened.activeId, 'kaiyuan');
  assert.deepEqual(reopened.progress(), {done: 27, total: 27});
  assert.deepEqual(new Set(reopened.completed), new Set(state.completed));
  const disk = JSON.parse(storage.getItem(JOURNEY_SAVE_KEY));
  assert.equal(disk.version, 1);
  assert.deepEqual(Object.keys(disk).sort(), ['activeId', 'completed', 'version']);
});

check('Existing four-route saves retain all twelve discoveries and unlock five empty new routes', () => {
  const oldIds = JOURNEYS.slice(0, 4).flatMap(route => route.points.map(point => point.id));
  const raw = JSON.stringify({version: 1, activeId: 'xuankong', completed: oldIds});
  const storage = memoryStorage(raw), state = createJourneyState(storage);
  assert.equal(JOURNEY_SAVE_KEY, 'wukong-journey-v1');
  assert.equal(state.activeId, 'xuankong');
  assert.deepEqual(state.completed, oldIds);
  assert.deepEqual(state.progress(), {done: 12, total: 27});
  assert.equal(storage.getItem(JOURNEY_SAVE_KEY), raw, 'loading must not overwrite the existing save');
  for (const journey of JOURNEYS.slice(4)) assert.deepEqual(state.progress(journey.id), {done: 0, total: 3});
  assert.equal(state.travel('dule'), true);
  assert.equal(submit(state, JOURNEYS.find(route => route.id === 'dule').points[0]).saved, true);
  const restored = createJourneyState(storage);
  assert.equal(restored.activeId, 'dule');
  assert.deepEqual(restored.progress(), {done: 13, total: 27});
  assert(oldIds.every(id => restored.has(id)));
});

check('Damaged saves recover safely; known ids are validated and deduplicated', () => {
  for (const raw of ['{', 'null', '[]', 'true', '{"version":0}', '{"version":"1"}']) {
    const state = createJourneyState(memoryStorage(raw));
    assert.equal(state.activeId, 'shisi');
    assert.deepEqual(state.progress(), {done: 0, total: 27});
  }
  const storage = memoryStorage(JSON.stringify({version: 1, activeId: 'unknown', completed: [first.id, first.id, 0, null, {}, 'missing']}));
  const state = createJourneyState(storage);
  assert.equal(state.activeId, 'shisi');
  assert.deepEqual(state.completed, [first.id]);
});

check('Storage failures preserve playability, report unsaved progress and leave the prior save intact', () => {
  const storage = memoryStorage(), state = createJourneyState(storage);
  state.travel('shisi');
  const before = storage.getItem(JOURNEY_SAVE_KEY);
  storage.setItem = () => { throw Error('quota exceeded'); };
  assert.equal(submit(state).saved, false);
  assert.equal(state.progress().done, 1);
  assert.equal(storage.getItem(JOURNEY_SAVE_KEY), before);
  assert.equal(state.travel('yungang'), true);
  assert.equal(state.activeId, 'yungang');
  const denied = createJourneyState({getItem() {throw Error('denied');}, setItem() {throw Error('denied');}});
  assert.equal(submit(denied).ok, true);
  assert.equal(submit(denied).saved, false);
  assert.equal(submit(createJourneyState(null)).saved, false);
});

check('A future-version save is preserved while this build remains playable in memory', () => {
  const future = JSON.stringify({version: 99, activeId: 'future-place', completed: ['future-point']});
  const storage = memoryStorage(future), state = createJourneyState(storage);
  assert.equal(state.activeId, 'shisi');
  assert.equal(state.progress().done, 0);
  assert.equal(submit(state).saved, false);
  assert.equal(state.travel('yungang'), true);
  assert.equal(storage.getItem(JOURNEY_SAVE_KEY), future);
});

console.log(JSON.stringify({passed: results.length, tasks: JOURNEYS.reduce((sum, route) => sum + route.points.length, 0), scenarios: results}, null, 2));
