import assert from 'node:assert/strict'
import { synthesizeAdvice } from '../src/services/decisionAdvice'
import type { ExperienceRule, Law } from '../src/types/experience'

// 构造伪规则:trustSignal 取决于 verdict/confidence/score/评估次数
function rule(p: {
  verdict?: ExperienceRule['evaluationVerdict']
  confidence?: ExperienceRule['evaluationConfidence']
  score?: number
  passed?: number
  failed?: number
}): ExperienceRule {
  const evaluations = [
    ...Array.from({ length: p.passed ?? 0 }, () => ({ outcome: 'passed' })),
    ...Array.from({ length: p.failed ?? 0 }, () => ({ outcome: 'failed' })),
  ]
  return {
    evaluationVerdict: p.verdict,
    evaluationConfidence: p.confidence,
    evaluationScore: p.score,
    evaluations,
  } as unknown as ExperienceRule
}
function law(kind: 'caution' | 'strategy'): Law {
  return { kind } as unknown as Law
}

// 可信规则:supported + 高置信 + 复测≥2 → trustSignal=trusted
const trusted = rule({ verdict: 'supported', confidence: 'high', score: 80, passed: 3 })
// 谨慎规则:conflicted → trustSignal=caution
const cautionR = rule({ verdict: 'conflicted', passed: 1, failed: 3 })
// 待验证规则:insufficient + 0 复测 → trustSignal=unproven
const unproven = rule({ verdict: 'insufficient' })

// lean:全可信、无谨慎、有效率高
{
  const a = synthesizeAdvice([{ rule: trusted }], [])!
  assert.equal(a.verdict, 'lean')
  assert.equal(a.stats.trustedCount, 1)
  assert.equal(a.stats.passed, 3)
  assert.equal(a.stats.successRate, 1)
}
// caution:命中谨慎规则
{
  assert.equal(synthesizeAdvice([{ rule: cautionR }], [])!.verdict, 'caution')
}
// caution:命中避坑规律(即使规则可信)
{
  const a = synthesizeAdvice([{ rule: trusted }], [law('caution')])!
  assert.equal(a.verdict, 'caution')
  assert.equal(a.stats.cautionLawCount, 1)
}
// caution:有可信但有效率<50%
{
  const r = rule({ verdict: 'supported', confidence: 'high', score: 80, passed: 2, failed: 3 })
  const a = synthesizeAdvice([{ rule: r }], [])!
  assert.equal(a.verdict, 'caution')
  assert.equal(a.stats.successRate, 0.4)
}
// insufficient:无可信 + 决断样本<2
{
  const a = synthesizeAdvice([{ rule: unproven }], [])!
  assert.equal(a.verdict, 'insufficient')
  assert.equal(a.stats.successRate, null)
}
// 空召回 → null
assert.equal(synthesizeAdvice([], []), null)

console.log('decisionAdvice tests passed')
