import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ART_MAP, ART_PINS, ROUTE_SITES, routeForSite, atlasRoutes} from '../src/heritage/atlas-routes.js';
import {heritageSites} from '../src/heritage/atlas-data.js';
import {JOURNEYS} from '../src/heritage/journey-data.js';
import {createJourneyState, JOURNEY_SAVE_KEY} from '../src/heritage/journey-state.js';

const results = [];
function check(name, action) { action(); results.push(name); }
function memoryStorage() {
  const entries = new Map();
  return {
    writes: 0,
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { this.writes++; entries.set(key, value); },
  };
}
const atObservation = {x:0, z:15}, observationPosition = [0, 0, 15];
function collect(state, point) {
  assert.equal(state.submit(point.id, point.answer, atObservation, observationPosition).ok, true);
}

check('Every playable route resolves to one existing site, without aliasing another route', () => {
  assert.equal(JOURNEYS.length, 9);
  assert.deepEqual(Object.keys(ROUTE_SITES).sort(), JOURNEYS.map(route => route.id).sort());
  const siteIds = new Set(heritageSites.map(site => site.id));
  assert.equal(new Set(Object.values(ROUTE_SITES)).size, JOURNEYS.length);
  for (const route of JOURNEYS) {
    assert(siteIds.has(ROUTE_SITES[route.id]), `Unknown atlas site for ${route.id}`);
    assert.equal(routeForSite(ROUTE_SITES[route.id])?.id, route.id);
  }
});

check('All nine artwork sites have distinct playable journeys', () => {
  assert.equal(ART_PINS.length, 9);
  assert.deepEqual(ART_PINS.map(pin => pin[0]).sort(), ['dule', 'foguang', 'kaiyuan', 'shisi', 'shuilu', 'xiaoxitian', 'xuankong', 'yingxian', 'yungang']);
  assert.deepEqual(ART_PINS.filter(pin => routeForSite(pin[0])).map(pin => pin[0]).sort(), ART_PINS.map(pin => pin[0]).sort());
  const routes = atlasRoutes();
  assert(routes.every(route => route.onArtwork), 'Every journey must be selectable from the artwork');
  assert.deepEqual(routes.map(route => route.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert(routes.every(route => route.done === 0 && route.total === route.points.length && !route.complete && !route.current));
  assert.equal(routes.reduce((total, route) => total + route.total, 0), 27);
  assert.equal(routes.find(route => route.id === 'kaiyuan').total, 3);
});

check('The cliff temple is Xuankong in Hunyuan; Guangsheng remains a separate library site', () => {
  const xuankong = heritageSites.find(site => site.id === 'xuankong');
  assert.equal(xuankong.name, '悬空寺');
  assert.equal(xuankong.locality, '大同 · 浑源县');
  assert.equal(routeForSite('xuankong')?.id, 'xuankong');
  assert.equal(ART_PINS.some(pin => pin[0] === 'guangsheng'), false);
  const guangsheng = heritageSites.find(site => site.id === 'guangsheng');
  assert.equal(guangsheng.name, '广胜寺飞虹塔');
  assert.equal(guangsheng.locality, '临汾 · 洪洞县');
  assert.equal(routeForSite('guangsheng'), null);
});

check('The wider research directory stays separate while former demo sites gain full journeys', () => {
  const playable = new Set(Object.values(ROUTE_SITES));
  for (const site of heritageSites.filter(site => !playable.has(site.id))) {
    assert.equal(routeForSite(site.id), null, `Unexpected playable route for ${site.id}`);
  }
  // These also retain legacy generic examples, separate from the new routes.
  assert.deepEqual(routeForSite('foguang').points, JOURNEYS.find(route => route.id === 'foguang').points);
  assert.deepEqual(routeForSite('dule').points, JOURNEYS.find(route => route.id === 'dule').points);
  for (const unknown of ['missing', '__proto__', '', null, undefined]) assert.equal(routeForSite(unknown), null);
});

check('Map hit targets fit the real image and retain unique, existing site identities', () => {
  const png = readFileSync(new URL(`../public${ART_MAP.url}`, import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), ART_MAP.width);
  assert.equal(png.readUInt32BE(20), ART_MAP.height);
  const seen = new Set(), siteIds = new Set(heritageSites.map(site => site.id));
  for (const [id, x, y, width, height, pinX, pinY] of ART_PINS) {
    assert(siteIds.has(id) && !seen.has(id), `Invalid or duplicate artwork site ${id}`);
    seen.add(id);
    assert([x, y, width, height, pinX, pinY].every(Number.isFinite));
    assert(x >= 0 && y >= 0 && width > 0 && height > 0);
    assert(x + width <= ART_MAP.width && y + height <= ART_MAP.height, `${id} label leaves image`);
    assert(pinX >= 0 && pinX <= ART_MAP.width && pinY >= 0 && pinY <= ART_MAP.height, `${id} pin leaves image`);
  }
});

check('Browsing every site and highlighting any route never awards progress, travels or writes storage', () => {
  const storage = memoryStorage(), state = createJourneyState(storage);
  state.travel('shisi');
  collect(state, JOURNEYS.find(route => route.id === 'shisi').points[0]);
  const snapshot = storage.getItem(JOURNEY_SAVE_KEY), writes = storage.writes;
  for (const site of heritageSites) {
    const selected = routeForSite(site.id);
    atlasRoutes(state, selected?.id ?? null);
  }
  assert.equal(storage.writes, writes);
  assert.equal(storage.getItem(JOURNEY_SAVE_KEY), snapshot);
  assert.equal(state.activeId, 'shisi');
  assert.deepEqual(state.completed, ['shisi-1']);
  assert.equal(atlasRoutes(state, null).some(route => route.current), false, 'Compound/model views have no current journey');
});

check('Travel preserves collected pages, observations update map progress, and reload restores it', () => {
  const storage = memoryStorage(), state = createJourneyState(storage);
  const shisi = routeForSite('shisi'), yungang = routeForSite('yungang');
  collect(state, shisi.points[0]);
  assert.equal(state.travel(yungang.id), true);
  let routes = atlasRoutes(state, state.activeId);
  assert.equal(routes.find(route => route.id === 'shisi').done, 1);
  assert.equal(routes.find(route => route.id === 'yungang').done, 0);
  assert.deepEqual(routes.filter(route => route.current).map(route => route.id), ['yungang']);
  collect(state, yungang.points[0]);
  assert.equal(atlasRoutes(state).find(route => route.id === 'yungang').done, 1);
  assert.equal(atlasRoutes(state).find(route => route.id === 'yungang').complete, false);
  for (const point of yungang.points.slice(1)) collect(state, point);
  const restored = createJourneyState(storage);
  routes = atlasRoutes(restored, restored.activeId);
  assert.equal(restored.activeId, 'yungang');
  assert.deepEqual(routes.map(route => [route.id, route.done, route.total, route.complete]),
    JOURNEYS.map(route => [route.id, route.id === 'shisi' ? 1 : route.id === 'yungang' ? route.points.length : 0,
      route.points.length, route.id === 'yungang']));
  assert.equal(restored.travel('shisi'), true);
  assert.deepEqual(atlasRoutes(restored, restored.activeId).filter(route => route.current).map(route => route.id), ['shisi']);
  assert.equal(restored.progress().done, 1 + yungang.points.length);
});

check('A legacy Kaiyuan route shows 2/3 until the gate is visited, then restores 3/3', () => {
  const storage = memoryStorage();
  storage.setItem(JOURNEY_SAVE_KEY, JSON.stringify({version: 1, activeId: 'kaiyuan',
    completed: ['kaiyuan-1', 'kaiyuan-2', 'kaiyuan-3']}));
  const state = createJourneyState(storage), writes = storage.writes;
  let route = atlasRoutes(state, state.activeId).find(entry => entry.id === 'kaiyuan');
  assert.deepEqual([route.done, route.total, route.complete, route.current], [2, 3, false, true]);
  assert.equal(storage.writes, writes, 'reading map progress must not rewrite the legacy save');
  assert.equal(state.nextPoint().id, 'kaiyuan-1');
  collect(state, state.nextPoint());
  const restored = createJourneyState(storage);
  route = atlasRoutes(restored, restored.activeId).find(entry => entry.id === 'kaiyuan');
  assert.deepEqual([route.done, route.total, route.complete, route.current], [3, 3, true, true]);
  assert.deepEqual(restored.completed, ['kaiyuan-2', 'kaiyuan-3', 'kaiyuan-1']);
});

console.log(JSON.stringify({passed: results.length, artworkPins: ART_PINS.length, playableRoutes: JOURNEYS.length, scenarios: results}, null, 2));
