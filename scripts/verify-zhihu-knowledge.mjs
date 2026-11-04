import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SITES, plainText, selectAnswers} from './update-zhihu-knowledge.mjs';

const answer = (id, votes, text, overrides = {}) => ({ContentType:'Answer',Title:'中国古建筑',
  ContentText:text,AuthorName:'作者',Url:`https://www.zhihu.com/question/12/answer/${id}?utm_source=test`,
  VoteUpCount:votes,...overrides});
const longLead = '这里在介绍别的景点。'.repeat(30);
const relevant = '云冈石窟保存着北魏的石雕造像。' + '建筑与雕刻细节值得近看。'.repeat(15);
const selected = selectAnswers([
  answer(1, 900, '乐山大佛是另一处石刻造像。'),
  answer(2, 10, longLead + relevant),
  answer(2, 11, longLead + relevant, {Url:'https://www.zhihu.com/answer/2?utm_source=test'}),
  answer(3, 5, '参观时可以慢慢观察雕塑。', {Title:'云冈石窟值得去吗？'}),
  answer(4, 500, relevant, {ContentType:'Article'}),
  answer(5, 500, relevant, {Url:'https://www.zhihu.com.evil.test/answer/5'}),
  answer(6, -1, relevant),
], ['云冈石窟']);
assert.deepEqual(selected.map(item => item.voteUpCount), [11, 5]);
assert.ok(selected[0].excerpt.includes('云冈石窟'));
assert.ok(!selected[0].excerpt.includes('别的景点'));
assert.ok(Array.from(selected[0].excerpt).length <= 120);
assert.ok(selected[0].url.includes('utm_source=test'));
assert.equal(plainText('<em>时思寺</em>&nbsp;&#x53e4;建筑'), '时思寺 古建筑');
assert.equal(selectAnswers([answer(7, 8, '千佛庵的悬塑令人震撼。')],SITES.xiaoxitian.keywords).length, 1);
const focused = selectAnswers([answer(8, 2, '游览点包括灵隐寺、时思寺和其他地方。' + longLead
  + '时思寺位于景宁的山中，保存着古老的木构建筑。')], SITES.shisi.keywords);
assert.ok(focused[0].excerpt.includes('时思寺位于景宁'));
assert.ok(!focused[0].excerpt.includes('灵隐寺'));

const snapshot = JSON.parse(readFileSync(new URL('../public/knowledge/zhihu.json', import.meta.url), 'utf8'));
let count = 0;
for (const [id, site] of Object.entries(SITES)) {
  const rows = snapshot.sites[id].answers;
  assert.ok(rows.length <= 3, `${id}: too many answers`);
  for (const [i, row] of rows.entries()) {
    assert.ok(site.keywords.some(word => row.title.includes(word) || row.excerpt.includes(word)), `${id}: unrelated preview`);
    assert.ok(Array.from(row.excerpt).length <= 120, `${id}: long preview`);
    assert.ok(i === 0 || rows[i-1].voteUpCount >= row.voteUpCount, `${id}: incorrect order`);
    count++;
  }
  console.log(`${id}: ${rows.length} relevant answers`);
}
console.log(`PASS: relevance, focused excerpts, aliases, deduplication, URLs, ranking; ${count} published previews`);
