// V4 决策建议合成(纯本地确定性)。把找经验召回的规则/规律聚合成一档结论 + 战绩数字。
// 红线:不调模型、不碰 store、不改引擎;只消费 trustSignal 与评估战绩。
import type { ExperienceRule, Law, RuleEvaluation } from '../types/experience'
import { trustSignal } from './ruleLabels'

export type AdviceVerdict = 'lean' | 'caution' | 'insufficient'

export interface DecisionAdviceStats {
  ruleCount: number
  trustedCount: number
  cautionCount: number
  unprovenCount: number
  cautionLawCount: number
  passed: number
  failed: number
  successRate: number | null
}

export interface DecisionAdvice {
  verdict: AdviceVerdict
  label: string
  reason: string
  stats: DecisionAdviceStats
}

// 阈值集中,便于调
const MIN_DECISIVE = 2 // 决断样本(有效+无效)低于此 → 证据不足
const LOW_SUCCESS = 0.5 // 有效率低于此 → 谨慎
const OK_SUCCESS = 0.6 // 有效率不低于此(或无样本)+ 有可信 → 倾向采用

function countOutcomes(evaluations: RuleEvaluation[] | undefined) {
  let passed = 0
  let failed = 0
  for (const e of evaluations ?? []) {
    if (e.outcome === 'passed') passed++
    else if (e.outcome === 'failed') failed++
  }
  return { passed, failed }
}

export function synthesizeAdvice(
  recalledRules: { rule: ExperienceRule }[],
  recalledLaws: Law[],
): DecisionAdvice | null {
  if (recalledRules.length === 0 && recalledLaws.length === 0) return null

  let trustedCount = 0
  let cautionCount = 0
  let unprovenCount = 0
  let passed = 0
  let failed = 0
  for (const { rule } of recalledRules) {
    const level = trustSignal(rule).level
    if (level === 'trusted') trustedCount++
    else if (level === 'caution') cautionCount++
    else unprovenCount++
    const o = countOutcomes(rule.evaluations)
    passed += o.passed
    failed += o.failed
  }
  const cautionLawCount = recalledLaws.filter((l) => l.kind === 'caution').length
  const decisive = passed + failed
  const successRate = decisive > 0 ? passed / decisive : null

  const stats: DecisionAdviceStats = {
    ruleCount: recalledRules.length,
    trustedCount,
    cautionCount,
    unprovenCount,
    cautionLawCount,
    passed,
    failed,
    successRate,
  }

  let verdict: AdviceVerdict
  let label: string
  let reason: string
  if (trustedCount === 0 && decisive < MIN_DECISIVE) {
    verdict = 'insufficient'
    label = '🔍 证据不足'
    reason = '线索有限,先当参考;用后回填结果,让它长出可信度。'
  } else if (cautionCount > 0 || cautionLawCount > 0 || (successRate !== null && successRate < LOW_SUCCESS)) {
    verdict = 'caution'
    label = '⚠️ 谨慎'
    reason = '这类你踩过坑,采纳前先看下面带⚠️的经验。'
  } else if (trustedCount > 0 && cautionCount === 0 && (successRate === null || successRate >= OK_SUCCESS)) {
    verdict = 'lean'
    label = '✅ 倾向采用'
    reason = '这类经验复测站得住,可放心参考。'
  } else {
    verdict = 'caution'
    label = '⚠️ 谨慎'
    reason = '证据有分歧,采纳前再看下面逐条。'
  }

  return { verdict, label, reason, stats }
}
