import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {JOURNEYS} from '../src/heritage/journey-data.js';
import {REFERENCE_CROPS, REFERENCE_SIZES} from '../src/heritage/reference-crops.js';

const generatedIds = ['xuankong', 'yingxian', 'dule', 'foguang', 'xiaoxitian', 'shuilu']
  .flatMap(id => [2, 3].map(number => `${id}-${number}`));
const seenHashes = new Map(), actualAI = [];
for (const route of JOURNEYS) for (const point of route.points) {
  const source = point.reference || route.reference;
  const bytes = readFileSync(new URL(`../public${source}`, import.meta.url));
  const hash = createHash('sha256').update(bytes).digest('hex');
  // Kaiyuan's two retained map references are intentional. All other stops
  // must have distinct files by content, not just different filenames.
  if (route.id !== 'kaiyuan') {
    assert(!seenHashes.has(hash), `${point.id} repeats ${seenHashes.get(hash)}`);
    seenHashes.set(hash, point.id);
  }
  const kind = point.referenceKind || route.referenceKind || 'game';
  if (kind !== 'ai') continue;
  actualAI.push(point.id);
  assert.equal(source, `/references/ai/${point.id}.png`);
  assert.equal(REFERENCE_CROPS[source], undefined, 'AI detail images must not use composite crop coordinates');
  assert.deepEqual([...bytes.subarray(0,8)], [137,80,78,71,13,10,26,10]);
  const size = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  assert.deepEqual(REFERENCE_SIZES[source], size, `${point.id}: display ratio must match the full image`);
  assert(size[0] >= 1000 && size[1] >= 700, `${point.id}: detail image resolution is insufficient`);
}
assert.deepEqual(actualAI.sort(), generatedIds.sort());
const kaiyuan = JOURNEYS.find(route => route.id === 'kaiyuan');
assert.deepEqual(kaiyuan.points.map(point => point.id), ['kaiyuan-1','kaiyuan-2','kaiyuan-3']);
assert.equal(kaiyuan.points[0].reference, '/references/kaiyuan.png');
for (const point of kaiyuan.points.slice(1)) assert.equal(point.reference, '/heritage-map-v2.png');
console.log(`Verified ${seenHashes.size} unique references outside Kaiyuan, ${actualAI.length} distinct AI detail images, native aspect ratios and preserved Kaiyuan map references.`);
