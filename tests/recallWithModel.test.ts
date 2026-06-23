import assert from 'node:assert/strict'
import { parseRecallMatches, buildRecallUserText } from '../src/services/recallWithModel'

// ---------------------------------------------------------------------------
// 模型语义召回的纯解析层。核心红线:丢弃任何不在候选集中的 id(防幻觉规则)。
// ---------------------------------------------------------------------------

const valid = new Set(['r1', 'r2', 'r3'])

// 正常解析 + 保序
{
  const out = parseRecallMatches({ matches: [{ id: 'r2', why: '相关A' }, { id: 'r1', why: '相关B' }] }, valid)
  assert.deepEqual(out.map((m) => m.id), ['r2', 'r1'], '应保持模型给出的顺序')
  assert.equal(out[0].why, '相关A')
}

// 丢弃不存在的 id(幻觉)
{
  const out = parseRecallMatches({ matches: [{ id: 'r1', why: 'ok' }, { id: 'ghost', why: '编的' }] }, valid)
  assert.deepEqual(out.map((m) => m.id), ['r1'], '不在候选集的 id 必须丢弃')
}

// 去重
{
  const out = parseRecallMatches({ matches: [{ id: 'r1', why: 'a' }, { id: 'r1', why: 'b' }] }, valid)
  assert.equal(out.length, 1, '同 id 去重')
}

// why 缺失/非字符串 → 兜底文案
{
  const out = parseRecallMatches({ matches: [{ id: 'r3' }, { id: 'r2', why: '   ' }] }, valid)
  assert.equal(out.length, 2)
  assert.ok(out[0].why.length > 0, 'why 缺失应有兜底')
  assert.ok(out[1].why.length > 0, 'why 空白应有兜底')
}

// 坏形状 → 空
{
  assert.deepEqual(parseRecallMatches(null, valid), [])
  assert.deepEqual(parseRecallMatches({}, valid), [])
  assert.deepEqual(parseRecallMatches({ matches: 'nope' }, valid), [])
  assert.deepEqual(parseRecallMatches({ matches: [{ why: '无 id' }] }, valid), [])
}

// 最多 5 条
{
  const many = { matches: ['r1', 'r2', 'r3'].concat(['r1', 'r2']).map((id, i) => ({ id, why: `w${i}` })) }
  // r1,r2,r3 去重后只剩 3 条;这里主要验证 <=5 不报错
  assert.ok(parseRecallMatches(many, valid).length <= 5)
}

// userText 包含候选 id 与场景
{
  const text = buildRecallUserText('周末去健身房', [{ id: 'r1', title: '健身低峰', conclusion: '周末10点人少' }])
  assert.ok(text.includes('周末去健身房'))
  assert.ok(text.includes('id=r1'))
}

console.log('recallWithModel tests passed')
