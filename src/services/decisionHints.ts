import type { ExperienceRule, Observation } from '../types/experience'
import { segment } from './segmentation'

export interface DecisionHint {
  ruleId: string
  ruleTitle: string
  conclusion: string
  recommendation: string
  score: number
  matchReasons: string[]
}

const DEFAULT_THRESHOLD = 3

/**
 * 对新录入文本召回相关历史规则,产出决策提醒列表。
 * 复用 experience.ts 内已有的分词/评分思路,此处为独立纯函数版本,可被测试。
 * - reusability === 'watch' 的规则排除(尚不稳定,不宜作为决策依据)
 * - 按 score 降序,最多返回 3 条
 */
export function recallDecisionHints(
  text: string,
  rules: ExperienceRule[],
  observations: Observation[],
  threshold = DEFAULT_THRESHOLD,
): DecisionHint[] {
  const content = text.trim()
  if (!content) return []

  return rules
    .filter((rule) => rule.reusability !== 'watch')
    .map((rule) => scoreRule(rule, content, observations))
    .filter((hint) => hint.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

// ---------- 内部评分 ----------

function scoreRule(rule: ExperienceRule, text: string, observations: Observation[]): DecisionHint {
  const sceneTokens = tokenize(text)
  const normalizedScene = normalizeText(text)

  const evidenceTexts = rule.evidenceIds
    .map((id) => observations.find((obs) => obs.id === id)?.text)
    .filter((t): t is string => Boolean(t))

  const fields = [
    { label: '标题', weight: 4, text: rule.title },
    { label: '结论', weight: 3, text: rule.conclusion },
    { label: '行动建议', weight: 3, text: rule.recommendation },
    { label: '地点', weight: 3, text: rule.location ?? '' },
    { label: '适用条件', weight: 2, text: rule.conditions.join(' ') },
    { label: '证据', weight: 1, text: evidenceTexts.join(' ') },
  ]

  let score = 0
  const reasons: string[] = []

  for (const field of fields) {
    if (!field.text) continue
    const fieldText = normalizeText(field.text)
    const matched = sceneTokens.filter((token) => fieldText.includes(token))
    if (matched.length > 0) {
      score += matched.length * field.weight
      reasons.push(`${field.label}匹配：${uniqueArr(matched).slice(0, 3).join('、')}`)
    }
    if (fieldText && normalizedScene.includes(fieldText)) {
      score += field.weight * 2
    }
  }

  return {
    ruleId: rule.id,
    ruleTitle: rule.title,
    conclusion: rule.conclusion,
    recommendation: rule.recommendation,
    score,
    matchReasons: uniqueArr(reasons),
  }
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value)
  const tokens: string[] = normalized.match(/[a-z0-9]+|[一-龥]{2,}/g) ?? []
  const chunks = tokens.flatMap((token) => {
    if (!/[一-龥]/.test(token) || token.length <= 4) return [token]
    const result: string[] = []
    for (let i = 0; i <= token.length - 2; i += 1) {
      result.push(token.slice(i, i + 2))
    }
    return [token, ...result]
  })
  // A1 分词接入:并入 HMM 真词(union),保留原 bigram 不破坏既有匹配,只增不减召回。
  const words = segment(value).map((w) => w.toLowerCase()).filter((w) => w.length >= 2)
  return uniqueArr([...chunks, ...words].filter((t) => t.length >= 2))
}

function uniqueArr<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}
