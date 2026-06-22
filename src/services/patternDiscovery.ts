import type { Observation, Insight, ClusterDimension, InsightConfidence, InsightType } from '../types/experience'
import type { ObservationModelClient } from './modelAnalysisAdapter'

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 最小样本门槛:低于此数量的簇不产出 medium/high 置信度结论 */
export const MIN_CLUSTER_SIZE = 3

/** 高置信度需要的最小样本数(更大样本 + 更高占比) */
const HIGH_CONFIDENCE_SIZE = 6
const HIGH_CONFIDENCE_RATIO = 0.5

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function createInsightId(): string {
  return `ins_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/** 提取 Observation 的情绪字段(Plan 2 可能新增;若无则返回空字符串) */
function getSentiment(obs: Observation): string {
  // Plan 2 会在 Observation 上新增 sentiment 字段;此处防御性访问
  return (obs as unknown as Record<string, unknown>)['sentiment'] as string || ''
}

/** 从 Observation[] 提取根因(从 tags 里找高频项) */
function extractRootCauseHint(members: Observation[]): string {
  const freq = new Map<string, number>()
  for (const obs of members) {
    for (const tag of obs.tags) {
      freq.set(tag, (freq.get(tag) ?? 0) + 1)
    }
  }
  if (freq.size === 0) return ''
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0]
}

// ─── 聚类 ────────────────────────────────────────────────────────────────────

/**
 * 按指定维度对 observations 聚类,返回 Map<clusterKey, Observation[]>
 * - 纯函数,无副作用
 */
export function clusterObservations(
  observations: Observation[],
  dimension: ClusterDimension,
): Map<string, Observation[]> {
  const result = new Map<string, Observation[]>()

  for (const obs of observations) {
    let keys: string[]

    switch (dimension) {
      case 'category':
        keys = [obs.category]
        break
      case 'tag':
        keys = obs.tags.length > 0 ? obs.tags : []
        break
      case 'sentiment': {
        const s = getSentiment(obs)
        keys = s ? [s] : []
        break
      }
      case 'rootCause': {
        // 用高频 tag 作为根因代理;无 tag 时跳过
        const hint = extractRootCauseHint([obs])
        keys = hint ? [hint] : []
        break
      }
    }

    for (const key of keys) {
      if (!result.has(key)) result.set(key, [])
      result.get(key)!.push(obs)
    }
  }

  return result
}

// ─── 置信度计算 ───────────────────────────────────────────────────────────────

function computeConfidence(clusterSize: number, percentage: number): InsightConfidence {
  if (clusterSize < MIN_CLUSTER_SIZE) return 'low'
  if (clusterSize >= HIGH_CONFIDENCE_SIZE && percentage >= HIGH_CONFIDENCE_RATIO) return 'high'
  return 'medium'
}

// ─── 类型推导 ────────────────────────────────────────────────────────────────

function inferInsightType(dimension: ClusterDimension): InsightType {
  switch (dimension) {
    case 'category': return 'category_pattern'
    case 'tag': return 'tag_pattern'
    case 'sentiment': return 'sentiment_pattern'
    case 'rootCause': return 'root_cause_pattern'
  }
}

// ─── 统计描述模板 ─────────────────────────────────────────────────────────────

function buildStatTitle(clusterKey: string, _clusterSize: number, dimension: ClusterDimension): string {
  switch (dimension) {
    case 'category':
      return `「${clusterKey}」类事件高频出现`
    case 'tag':
      return `「${clusterKey}」标签在多条观察中共现`
    case 'sentiment':
      return `「${clusterKey}」情绪倾向集中`
    case 'rootCause':
      return `「${clusterKey}」是多条观察的共同关联因素`
  }
}

function buildStatSummary(
  clusterKey: string,
  clusterSize: number,
  total: number,
  _dimension: ClusterDimension,
  confidence: InsightConfidence,
): string {
  const pct = Math.round((clusterSize / total) * 100)
  const base = `${total} 条观察中有 ${clusterSize} 条(${pct}%)与「${clusterKey}」相关。`
  if (confidence === 'low') {
    return base + `样本量尚不足以得出强结论,建议继续积累数据。`
  }
  return base + `这是${confidence === 'high' ? '一个显著' : '一个可关注的'}模式。`
}

function buildStatSuggestion(clusterKey: string, confidence: InsightConfidence, dimension: ClusterDimension): string {
  if (confidence === 'low') {
    return `继续记录「${clusterKey}」相关经验,积累足够样本后再做决策。`
  }
  switch (dimension) {
    case 'category':
      return `重点审视「${clusterKey}」类场景下的行为模式,提炼可迁移的决策规则。`
    case 'tag':
      return `关注「${clusterKey}」标签共现的上下文,分析是否存在系统性根因。`
    case 'sentiment':
      return `识别触发「${clusterKey}」情绪的具体场景,针对性调整行为策略。`
    case 'rootCause':
      return `将「${clusterKey}」纳入决策检查清单,每次行动前评估是否存在该因素。`
  }
}

// ─── 核心构建函数 ─────────────────────────────────────────────────────────────

/**
 * 基于统计数据构建 Insight(不调模型)
 * 纯函数,可测
 */
export function buildStatInsight(
  clusterKey: string,
  members: Observation[],
  total: number,
  dimension: ClusterDimension,
  timeWindow: string,
): Insight {
  const clusterSize = members.length
  const percentage = total > 0 ? clusterSize / total : 0
  const confidence = computeConfidence(clusterSize, percentage)
  const type = inferInsightType(dimension)

  return {
    id: createInsightId(),
    dimension,
    type,
    clusterKey,
    clusterSize,
    evidenceObservationIds: members.map((o) => o.id),
    percentage,
    confidence,
    title: buildStatTitle(clusterKey, clusterSize, dimension),
    summary: buildStatSummary(clusterKey, clusterSize, total, dimension, confidence),
    rootCause: '',
    suggestion: buildStatSuggestion(clusterKey, confidence, dimension),
    timeWindow,
    generatedBy: 'statistical',
    status: 'active',
    createdAt: new Date().toISOString(),
  }
}

// ─── 模型增强(可选)────────────────────────────────────────────────────────

/** 模型字段最大长度 */
const MODEL_FIELD_MAX_LEN = 120

/**
 * 模型返回的占位字面量黑名单:命中时回退为统计描述。
 * 不得用于真实 insight,否则 UI 会展示裸占位文本。
 */
const PLACEHOLDER_PATTERNS = [
  '暂无明确根因',
  '无法确定',
  '不明确',
  '无根因',
  'N/A',
  'n/a',
  '待补充',
  '暂无',
]

/**
 * 校验模型返回的单个字段:
 * - 空字符串 / 纯空白 → 回退
 * - 超过 MAX_LEN 字 → 截断到 MAX_LEN
 * - 命中占位黑名单 → 回退(返回 undefined)
 * fallback 为统计兜底值。
 */
function validateModelField(
  value: string,
  fallback: string,
  maxLen: number = MODEL_FIELD_MAX_LEN,
): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) return fallback
  if (PLACEHOLDER_PATTERNS.some((p) => trimmed === p || trimmed.startsWith(p))) return fallback
  if (trimmed.length > maxLen) return trimmed.slice(0, maxLen)
  return trimmed
}

/** 构建用于簇归因的 prompt */
function buildClusterAttributionPrompt(
  clusterKey: string,
  members: Observation[],
  dimension: ClusterDimension,
): { systemPrompt: string; userText: string } {
  const examples = members
    .slice(0, 8) // 最多取 8 条避免 token 超限
    .map((o, i) => `${i + 1}. ${o.text}`)
    .join('\n')

  return {
    systemPrompt: `你是一个经验分析助手。用户会给你一批观察记录,请识别它们的共同根因,并给出简洁的命名和决策建议。
输出严格为 JSON 格式,包含以下字段:
- rootCause: string  // 一句话描述共同根因,不超过 40 字
- title: string      // 模式名称,不超过 20 字
- suggestion: string // 针对该根因的决策建议,不超过 60 字

不得包含任何 JSON 以外的文字。不得过度推断:若根因不明确,rootCause 填"暂无明确根因"。`,
    userText: `这 ${members.length} 条观察都与「${clusterKey}」(${dimension} 维度)相关:\n\n${examples}\n\n请分析它们的共同根因。`,
  }
}

/**
 * 用模型对统计 insight 做归因增强
 * 若模型抛错,原样返回统计 insight(不向上抛)
 */
export async function enrichClusterWithModel(
  insight: Insight,
  members: Observation[],
  client: ObservationModelClient,
): Promise<Insight> {
  // 最小样本门槛:低置信度簇不做模型增强
  if (insight.confidence === 'low') return insight

  try {
    const prompt = buildClusterAttributionPrompt(insight.clusterKey, members, insight.dimension)
    const raw = await client.completeJson(prompt) as Record<string, unknown>

    const rootCause = typeof raw['rootCause'] === 'string'
      ? validateModelField(raw['rootCause'], '')
      : ''
    const title = typeof raw['title'] === 'string'
      ? validateModelField(raw['title'], insight.title)
      : insight.title
    const suggestion = typeof raw['suggestion'] === 'string'
      ? validateModelField(raw['suggestion'], insight.suggestion)
      : insight.suggestion

    return {
      ...insight,
      rootCause,
      title,
      suggestion,
      generatedBy: 'model_enhanced',
    }
  } catch {
    // 模型不可用 → 静默回退统计描述,绝不向上抛
    return insight
  }
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

export interface PatternDiscoveryOptions {
  /** 可用的模型 client;null 时纯统计 */
  client?: ObservationModelClient | null
  /** 时间窗口描述,如"过去 90 天" */
  timeWindowLabel?: string
  /** 需要聚类的维度列表;默认 category + tag */
  dimensions?: ClusterDimension[]
}

/**
 * 主入口:对 observations 进行多维度聚类 + 统计归因 + 可选模型增强
 * 返回 Insight[],按 percentage 降序排列
 */
export async function discoverPatterns(
  observations: Observation[],
  options: PatternDiscoveryOptions = {},
): Promise<Insight[]> {
  const {
    client = null,
    timeWindowLabel = '过去 90 天',
    dimensions = ['category', 'tag'],
  } = options

  if (observations.length === 0) return []

  const total = observations.length
  const insightMap = new Map<string, Insight>() // 去重:dimension+clusterKey

  for (const dimension of dimensions) {
    const clusters = clusterObservations(observations, dimension)

    for (const [clusterKey, members] of clusters) {
      const dedupKey = `${dimension}::${clusterKey}`
      if (insightMap.has(dedupKey)) continue

      // 过滤单条簇:单次出现不构成"共现/高频"模式,避免洞察刷屏
      if (members.length < 2) continue

      // 1. 统计基座(必做)
      let insight = buildStatInsight(clusterKey, members, total, dimension, timeWindowLabel)

      // 2. 模型增强(可选;仅对达标样本)
      if (client && insight.confidence !== 'low') {
        insight = await enrichClusterWithModel(insight, members, client)
      }

      insightMap.set(dedupKey, insight)
    }
  }

  return [...insightMap.values()].sort((a, b) => b.percentage - a.percentage)
}
