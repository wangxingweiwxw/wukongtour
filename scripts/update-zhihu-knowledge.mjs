import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SITES = {
  shisi: {name:'时思寺', query:'景宁 时思寺 古建筑', keywords:['时思寺']},
  yungang: {name:'云冈石窟', query:'大同 云冈石窟', keywords:['云冈石窟']},
  xuankong: {name:'悬空寺', query:'浑源 悬空寺 古建筑', keywords:['悬空寺']},
  yingxian: {name:'应县木塔', query:'应县木塔', keywords:['应县木塔','佛宫寺释迦塔']},
  dule: {name:'独乐寺', query:'蓟州 独乐寺 观音阁', keywords:['独乐寺']},
  foguang: {name:'佛光寺', query:'五台山 佛光寺 东大殿', keywords:['佛光寺']},
  xiaoxitian: {name:'小西天', query:'隰县 小西天 悬塑', keywords:['小西天','千佛庵']},
  shuilu: {name:'水陆庵', query:'蓝田 水陆庵 壁塑', keywords:['水陆庵']},
  kaiyuan: {name:'开元寺东西塔', query:'泉州 开元寺 东西塔', keywords:['开元寺','东西塔','东西双塔']},
};
const OUTPUT = fileURLToPath(new URL('../public/knowledge/zhihu.json', import.meta.url));
export const SOURCE = '知乎官方开放平台搜索快照；每处检索最多 10 项，筛选标题或正文包含当前建筑名称的回答后，按返回的赞同数降序选取最多 3 条，不代表全站最高赞或实时热榜。摘要为搜索返回内容中建筑相关段落的短节选。';

export function plainText(value) {
  const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (match, entity) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()];
      const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
        ? String.fromCodePoint(number) : '';
    }).replace(/\s+/g, ' ').trim();
}

function relevantExcerpt(content, keywords) {
  // Search summaries may cover several sites. Start at the sentence containing
  // this building instead of blindly displaying the beginning of the answer.
  const matches = [];
  for (const word of keywords) {
    if (!word) continue;
    for (let index = content.indexOf(word); index >= 0; index = content.indexOf(word, index + word.length)) {
      // A direct description is more useful than an introductory list of sites.
      const tail = content.slice(index + word.length, index + word.length + 24);
      const describes = /^[”」）)\s]*(?:位于|始建|建于|原来|上部|是|占地|在|保存|又叫|又称|全长)/.test(tail);
      matches.push({index, describes});
    }
  }
  matches.sort((a, b) => Number(b.describes) - Number(a.describes) || a.index - b.index);
  const match = matches[0]?.index ?? 0;
  const glyphs = Array.from(content), at = Array.from(content.slice(0, match)).length;
  const sentenceEnd = /[。！？!?；;]/;
  let start = 0;
  for (let i = at - 1; i >= 0; i--) {
    if (sentenceEnd.test(glyphs[i])) { start = i + 1; break; }
  }
  if (at - start > 48) start = Math.max(0, at - 12);
  while (glyphs[start] === ' ') start++;
  const limit = Math.min(glyphs.length, start + 118);
  let end = limit;
  // Prefer a complete sentence after about 80 characters, but never discard the
  // matched building or extend the preview beyond a short reading card.
  for (let i = Math.max(start + 79, at + 8); i < limit; i++) {
    if (sentenceEnd.test(glyphs[i])) { end = i + 1; break; }
  }
  return (start > 0 ? '…' : '') + glyphs.slice(start, end).join('').trim()
    + (end < glyphs.length ? '…' : '');
}

export function selectAnswers(items, keywords = []) {
  const answers = new Map();
  for (const item of items) {
    if (String(item?.ContentType).toLowerCase() !== 'answer') continue;
    let url;
    try { url = new URL(item.Url); } catch { continue; }
    const path = url.pathname.match(/^\/(?:question\/\d+\/)?answer\/(\d+)\/?$/);
    if (url.protocol !== 'https:' || !['www.zhihu.com','zhihu.com'].includes(url.hostname)
      || url.username || url.password || url.port || !path) continue;
    const title = plainText(item.Title), content = plainText(item.ContentText);
    if (!title || !content || !Number.isSafeInteger(item.VoteUpCount) || item.VoteUpCount < 0) continue;
    if (keywords.length && !keywords.some(word => title.includes(word) || content.includes(word))) continue;
    const answer = {title, author:plainText(item.AuthorName) || '知乎用户',
      excerpt:relevantExcerpt(content, keywords),
      url:url.href, voteUpCount:item.VoteUpCount};
    const prior = answers.get(path[1]);
    if (!prior || prior.voteUpCount < answer.voteUpCount) answers.set(path[1], answer);
  }
  return [...answers.values()].sort((a,b) => b.voteUpCount - a.voteUpCount).slice(0, 3);
}

function options(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--cli','--site'].includes(args[i]) || !args[i+1] || values[args[i]])
      throw new Error('用法：node scripts/update-zhihu-knowledge.mjs --cli <官方 CLI 绝对路径> [--site shisi]');
    values[args[i]] = args[i+1];
  }
  const cli = values['--cli'], site = values['--site'];
  if (!cli || !isAbsolute(cli)) throw new Error('--cli 必须为官方安装程序返回的 binary_path 绝对路径。');
  try { if (!statSync(cli).isFile()) throw new Error(); } catch { throw new Error('指定的官方 CLI 文件不存在。'); }
  if (site && !Object.hasOwn(SITES, site)) throw new Error('--site 必须为九条路线的有效 ID。');
  return {cli, site};
}

function readPrevious() {
  try {
    const data = JSON.parse(readFileSync(OUTPUT, 'utf8'));
    if (!data.sites || typeof data.sites !== 'object' || Array.isArray(data.sites)) throw new Error();
    return data.sites;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error('现有知识快照无法解析，已停止更新以保留原文件。');
  }
}

function search(cli, site) {
  let output;
  try {
    // No shell, token arguments, raw stderr logging or automatic retries.
    output = execFileSync(cli, ['search','zhihu','--query',site.query,'--count','10'],
      {encoding:'utf8', windowsHide:true, timeout:90_000, maxBuffer:4*1024*1024, stdio:['ignore','pipe','pipe']});
  } catch {
    throw new Error(`${site.name}：CLI 查询失败。请检查官方 CLI 的授权、额度与网络；原快照未修改。`);
  }
  let data;
  try { data = JSON.parse(output.replace(/^\uFEFF/, '')); } catch {
    throw new Error(`${site.name}：CLI 未返回有效 JSON；原快照未修改。`);
  }
  if (data.Code !== 0 || !Array.isArray(data.Data?.Items)) {
    throw new Error(`${site.name}：知乎服务返回错误或无效数据；原快照未修改。`);
  }
  return selectAnswers(data.Data.Items, site.keywords);
}

function main() {
  const {cli, site} = options(process.argv.slice(2));
  const sites = site ? readPrevious() : {};
  for (const id of site ? [site] : Object.keys(SITES)) {
    const entry = SITES[id], answers = search(cli, entry);
    sites[id] = {name:entry.name, query:entry.query, updatedAt:new Date().toISOString(), answers};
    console.log(`${entry.name}：${answers.length} 条有效回答`);
  }
  // Write only once all selected queries succeed. Rename on the same filesystem
  // replaces the old snapshot atomically; a partial run never publishes data.
  const snapshot = {updatedAt:new Date().toISOString(), source:SOURCE, sites};
  mkdirSync(dirname(OUTPUT), {recursive:true});
  const temporary = `${OUTPUT}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(snapshot, null, 2) + '\n', {encoding:'utf8',flag:'wx'});
    renameSync(temporary, OUTPUT);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  console.log('已更新 public/knowledge/zhihu.json；重新构建并部署后上线。');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    // Never print a child-process exception, stdout or stderr: those may contain
    // upstream diagnostics. Only the controlled messages above reach the user.
    const message = error.message;
    console.error(error.code ? '知识快照写入失败；请检查文件权限或占用。' : message);
    process.exitCode = 1;
  }
}
