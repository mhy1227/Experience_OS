import assert from 'node:assert/strict'
import { extractKeywords } from '../src/services/textrank'

// ---------------------------------------------------------------------------
// A9 TextRank 主题词抽取。按 docs/algorithm-a8-a9-sentiment-theme-plan.md §A9.6。
// ---------------------------------------------------------------------------

// 1. 含明显主题:top 词应含主题词('对齐'/'返工')。
{
  const tokens = ['对齐', '返工', '对齐', '沟通', '返工', '对齐', '接口', '返工']
  const top = extractKeywords(tokens, 3)
  assert.ok(top.includes('对齐'), `top 应含 '对齐',实际 ${JSON.stringify(top)}`)
  assert.ok(top.includes('返工'), `top 应含 '返工',实际 ${JSON.stringify(top)}`)
}

// 2. 停用词不入榜。
{
  const tokens = ['对齐', '的', '返工', '了', '对齐', '在', '返工', '是', '对齐']
  const top = extractKeywords(tokens, 5)
  for (const sw of ['的', '了', '在', '是']) {
    assert.ok(!top.includes(sw), `停用词 '${sw}' 不应入榜,实际 ${JSON.stringify(top)}`)
  }
}

// 3. 收敛性:同输入两次结果完全相同(确定性、有限步返回)。
{
  const tokens = ['对齐', '返工', '对齐', '沟通', '返工', '对齐', '接口', '返工', '沟通']
  const a = extractKeywords(tokens, 4)
  const b = extractKeywords(tokens, 4)
  assert.deepEqual(a, b, '同输入两次结果应相同')
}

// 4. 短文本 / 单词 / 空数组 不崩,返回数组。
{
  assert.deepEqual(extractKeywords([], 5), [], '空数组应返回 []')
  assert.deepEqual(extractKeywords(['对齐'], 5), ['对齐'], '单词应返回该词')
  assert.deepEqual(extractKeywords(['的', '了'], 5), [], '全停用词应返回 []')
  const two = extractKeywords(['对齐', '返工'], 5)
  assert.ok(Array.isArray(two) && two.length === 2, `两词应返回 2 项,实际 ${JSON.stringify(two)}`)
  // topN 边界
  assert.deepEqual(extractKeywords(['对齐', '返工', '接口'], 0), [], 'topN=0 应返回 []')
}

console.log('textrank tests passed')
