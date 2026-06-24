import assert from 'node:assert/strict'
import { trainNB, classify, classifyText } from '../src/services/sentiment'

// ---------------------------------------------------------------------------
// A8 朴素贝叶斯情绪分类。按 docs/algorithm-a8-a9-sentiment-theme-plan.md §A8.6。
// P(类|词) ∝ P(类)·Π P(词|类),对数 + 拉普拉斯平滑;否定词翻转;未登录走平滑。
// 用显式 tokens 测分类(确定性);classifyText 只测不崩。
// ---------------------------------------------------------------------------

// 1. 正向 → positive,负向 → negative
{
  assert.equal(classify(['很', '顺利']), 'positive')
  assert.equal(classify(['又', '踩坑']), 'negative')
}

// 2. 否定翻转:"踩坑" 负;"没踩坑" 不应再判负
{
  assert.equal(classify(['踩坑']), 'negative')
  assert.notEqual(classify(['没', '踩坑']), 'negative', '否定后不应仍判负')
}

// 3. 未登录词不崩(平滑)→ 返回合法类别
{
  const r = classify(['魑魅', '魍魉'])
  assert.ok(['positive', 'negative', 'neutral'].includes(r))
}

// 4. 防"全判中性":明确负向句要判 negative
{
  assert.equal(classify(['沟通', '不畅', '导致', '返工']), 'negative')
}

// 5. 降级:空模型 → neutral,不抛错
{
  const empty = trainNB([])
  assert.equal(classify(['任意', '词'], empty), 'neutral')
}

// 6. classifyText 入口(内部分词)不崩,返回合法类别
{
  const r = classifyText('这次又踩坑导致返工')
  assert.ok(['positive', 'negative', 'neutral'].includes(r))
}

console.log('sentiment tests passed')
