import assert from 'node:assert/strict'
import { polishAdvice, buildAdviceUserText } from '../src/services/adviceWithModel'
import type { DecisionAdvice } from '../src/services/decisionAdvice'
import type { ObservationModelClient } from '../src/services/modelAnalysisAdapter'

function fakeClient(raw: unknown): ObservationModelClient {
  return { completeJson: async () => raw }
}

const advice: DecisionAdvice = {
  verdict: 'lean',
  label: '✅ 倾向采用',
  reason: '这类经验复测站得住,可放心参考。',
  stats: { ruleCount: 2, trustedCount: 2, cautionCount: 0, unprovenCount: 0, cautionLawCount: 0, passed: 5, failed: 1, successRate: 5 / 6 },
}

// userText 含场景与战绩
{
  const t = buildAdviceUserText('要不要接急活', advice)
  assert.ok(t.includes('要不要接急活'))
  assert.ok(t.includes('命中2条') || t.includes('命中 2'))
}

async function asyncTests() {
  // 正常润色 → 采用模型句
  {
    const out = await polishAdvice('要不要接急活', advice, fakeClient({ advice: '这类活你过去基本都搞定了,可以接。' }))
    assert.equal(out, '这类活你过去基本都搞定了,可以接。')
  }
  // 空白 → 退回本地
  {
    const out = await polishAdvice('场景', advice, fakeClient({ advice: '   ' }))
    assert.equal(out, advice.reason)
  }
  // 坏形状(无 advice 字段)→ 退回本地
  {
    const out = await polishAdvice('场景', advice, fakeClient({}))
    assert.equal(out, advice.reason)
  }
  // 空场景 → 不调用 client、退回本地
  {
    let called = false
    const watch: ObservationModelClient = { completeJson: async () => { called = true; return { advice: 'x' } } }
    const out = await polishAdvice('   ', advice, watch)
    assert.equal(out, advice.reason)
    assert.equal(called, false, '空场景不应触发模型调用')
  }
}

asyncTests()
  .then(() => console.log('adviceWithModel tests passed'))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
