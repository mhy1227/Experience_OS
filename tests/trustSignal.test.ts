import assert from 'node:assert/strict'
import { trustSignal } from '../src/services/ruleLabels'
import type { ExperienceRule } from '../src/types/experience'

// ---------------------------------------------------------------------------
// trustSignal:把判定/置信/稳定分/趋势/评估次数收敛成 可信 / 谨慎 / 待验证。
// 决策支持的核心信号,覆盖全部分支与优先级。
// ---------------------------------------------------------------------------

function rule(p: {
  verdict?: ExperienceRule['evaluationVerdict']
  confidence?: ExperienceRule['evaluationConfidence']
  score?: number
  trend?: ExperienceRule['evaluationTrend']
  evals?: number
}): ExperienceRule {
  return {
    evaluationVerdict: p.verdict,
    evaluationConfidence: p.confidence,
    evaluationScore: p.score,
    evaluationTrend: p.trend,
    evaluations: Array.from({ length: p.evals ?? 0 }, () => ({})),
  } as unknown as ExperienceRule
}

// 冲突 → 谨慎(最高优先,先于"评估次数不足")
{
  const t = trustSignal(rule({ verdict: 'conflicted', evals: 5, confidence: 'high', score: 90 }))
  assert.equal(t.level, 'caution')
  assert.ok(t.label.includes('谨慎'))
}

// 分歧 → 谨慎
{
  assert.equal(trustSignal(rule({ verdict: 'mixed', evals: 4 })).level, 'caution')
}

// 趋势走弱 → 谨慎(已支持但在走弱)
{
  assert.equal(trustSignal(rule({ verdict: 'supported', trend: 'declining', evals: 4, score: 80 })).level, 'caution')
}

// 证据不足 → 待验证(从没复测)
{
  const t = trustSignal(rule({ verdict: 'insufficient', evals: 0 }))
  assert.equal(t.level, 'unproven')
  assert.ok(t.note.includes('还没复测'))
}

// 评估 < 2 → 待验证(即使已支持)
{
  const t = trustSignal(rule({ verdict: 'supported', confidence: 'high', score: 90, evals: 1 }))
  assert.equal(t.level, 'unproven')
  assert.ok(t.note.includes('1'))
}

// 已支持 + 高置信 + 够次数 → 可信
{
  const t = trustSignal(rule({ verdict: 'supported', confidence: 'high', evals: 3, score: 60 }))
  assert.equal(t.level, 'trusted')
  assert.ok(t.label.includes('可信'))
}

// 已支持 + 稳定分≥70 + 够次数 → 可信(置信中也算)
{
  assert.equal(trustSignal(rule({ verdict: 'supported', confidence: 'medium', score: 72, evals: 3 })).level, 'trusted')
}

// 已支持但强度一般(置信中、分低、够次数)→ 谨慎(一般)
{
  const t = trustSignal(rule({ verdict: 'supported', confidence: 'medium', score: 50, evals: 3 }))
  assert.equal(t.level, 'caution')
}

// 缺字段(全 undefined)→ 待验证(默认 insufficient/低/0)
{
  assert.equal(trustSignal(rule({})).level, 'unproven')
}

console.log('trustSignal tests passed')
