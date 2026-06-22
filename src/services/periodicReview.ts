import type { Observation } from '../types/experience'

export type ReviewPeriod = 'week' | 'month'

export interface ReviewTag {
  label: string
  count: number
}

export interface PeriodicReview {
  period: ReviewPeriod
  since: string // ISO 起始时间
  totalCount: number
  topProblems: ReviewTag[] // 高频问题(负向标签)
  topSuccesses: ReviewTag[] // 高频成功(正向标签)
  suggestion: string
}

const PERIOD_DAYS: Record<ReviewPeriod, number> = { week: 7, month: 30 }
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 周·月复盘摘要(V1 能力):基于已分析观察,在时间窗内统计高频问题/成功并给出一句话建议。
 * 纯函数,可测;`now` 可注入以保证测试确定性。
 */
export function buildPeriodicReview(
  observations: Observation[],
  period: ReviewPeriod,
  now: Date = new Date(),
): PeriodicReview {
  const cutoff = now.getTime() - PERIOD_DAYS[period] * DAY_MS
  const inWindow = observations.filter(
    (o) => o.status === 'success' && Date.parse(o.createdAt) >= cutoff,
  )

  const topProblems = topTags(inWindow.filter((o) => o.sentiment === 'negative'))
  const topSuccesses = topTags(inWindow.filter((o) => o.sentiment === 'positive'))

  return {
    period,
    since: new Date(cutoff).toISOString(),
    totalCount: inWindow.length,
    topProblems,
    topSuccesses,
    suggestion: buildSuggestion(inWindow.length, topProblems),
  }
}

function topTags(observations: Observation[], limit = 3): ReviewTag[] {
  const freq = new Map<string, number>()
  for (const obs of observations) {
    for (const tag of obs.tags) {
      const key = tag.trim()
      if (!key) continue
      freq.set(key, (freq.get(key) ?? 0) + 1)
    }
  }
  return [...freq.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function buildSuggestion(total: number, problems: ReviewTag[]): string {
  if (total === 0) {
    return '这个周期还没有记录,先随手记几条经历吧。'
  }
  if (problems.length > 0) {
    return `针对高频问题「${problems[0].label}」做一次复盘,给下个周期定一个小改进。`
  }
  return '没有明显的高频问题,保持记录,继续积累以便发现规律。'
}
