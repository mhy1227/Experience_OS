# Plan 3: 规律发现(M3)+ 扫描 90 天归因卡

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 M3 规律发现核心模块——统计聚类为可靠基座,对达到最小样本门槛的簇可选地调模型做归因/命名/建议,产出结构化 `Insight`;并在 UI 侧提供「扫描我的 90 天」按钮 + `InsightCard` 归因卡片组件。

**Architecture:**
```
Observation[] (from store)
    ↓
patternDiscovery.ts  ←── 纯函数,可测
  ├─ clusterObservations()      # 统计聚类(category/tag/sentiment/rootCause)
  ├─ applyMinSampleGuard()      # 最小样本门槛过滤
  ├─ buildStatInsight()         # 纯统计描述(降级路径/必做路径)
  └─ enrichClusterWithModel()   # 模型归因增强(可选;模型不可用时跳过)
    ↓
Insight[]
    ↓
store: computeInsights() action → insights[] state → localStorage 持久化
    ↓
InsightCard.vue  (src/pages/index/components/InsightCard.vue)
    ↓
index.vue: 新增 insights tab / scan 按钮(最小侵入)
```

**依赖:**
- **Plan 1(已完成)**:依赖 `createModelClient`、`getActiveModelClient`、`analyzeObservationResilient`。本 plan 用同一 `ObservationModelClient` 接口调模型做簇归因,不重复实现网络层。
- **Plan 2(情绪字段/更多数据)**:本 plan 的情绪维度聚类依赖 `Observation.sentiment` 字段。若 Plan 2 尚未落地,该维度自动降级为"按 tags 聚类";核心统计聚类仍可独立运行。

**Tech Stack:** Vue 3 + Pinia + Vite + TypeScript;测试为纯 TS,经 `tsconfig.test.json` 编译到 `dist-tests/` 后用 `node` + `node:assert/strict` 运行。

---

## Global Constraints

- 统计基座**必做**,模型增强**可选**;绝不在样本不足时硬出强结论。
- 最小样本门槛:簇内 observations 数量 < `MIN_CLUSTER_SIZE`(默认 3)时不产出强置信度 insight,仅在达标后产出 `confidence: 'high'` 或 `'medium'`。
- 纯函数原则:`patternDiscovery.ts` 内所有函数均为纯函数(无副作用,无 localStorage 调用),测试无需 mock 环境。
- 不重写已完成部分:复用 `getActiveModelClient()`、`ObservationModelClient` 接口、`createObservationAnalysisPrompt`(或新建专用 prompt),不绕过契约层。
- 不向 `index.vue` 继续堆砌:新增 UI 拆为独立组件 `InsightCard.vue`,`index.vue` 仅添加最小挂载代码。
- API Key 只存浏览器本地,**绝不提交进仓库、绝不上云**。
- 测试文件用 `node:assert/strict`,以 `async function run()` + 末尾 `void run()` 组织(沿用已有测试风格)。

---

## File Structure

| 操作 | 路径 |
|------|------|
| **新建** | `src/types/experience.ts` — 追加 `Insight` 接口及相关类型 |
| **新建** | `src/services/patternDiscovery.ts` — 纯函数聚类 + 归因引擎 |
| **新建** | `tests/patternDiscovery.test.ts` — TDD 测试套件 |
| **新建** | `src/pages/index/components/InsightCard.vue` — 归因卡片组件 |
| **修改** | `src/stores/experience.ts` — 新增 `insights` 状态 + `computeInsights()` action + 持久化 |
| **修改** | `src/pages/index/index.vue` — 新增 insights tab / scan 按钮(最小侵入) |
| **修改** | `package.json` — `test:evaluation` 脚本追加新测试文件 |

---

## Task 1: 新增 `Insight` 类型(追加到 `src/types/experience.ts`)

**Files:**
- Modify: `src/types/experience.ts`(仅追加,不改动已有类型)

**Interfaces produced:**
```
InsightType         联合类型
InsightConfidence   联合类型
Insight             接口(对应设计 §4 exp_insights)
ClusterDimension    联合类型(内部聚类维度)
ObservationCluster  内部中间类型
```

- [ ] **Step 1: 追加类型定义到 `src/types/experience.ts` 末尾**

在文件末尾(现有 `DemoSample` 接口之后)追加:

```ts
// ─── M3 规律发现 ───────────────────────────────────────────────────────────

/** 洞察维度:按哪个维度聚类产出 */
export type ClusterDimension = 'category' | 'tag' | 'sentiment' | 'rootCause'

/** 洞察类型:描述归因模式的语义分类 */
export type InsightType =
  | 'frequency_pattern'   // 高频同类事件
  | 'sentiment_pattern'   // 情绪倾向集中
  | 'root_cause_pattern'  // 共同根因归因
  | 'tag_pattern'         // 标签共现
  | 'category_pattern'    // 分类集中

/** 洞察置信度:由样本量和归因方式决定 */
export type InsightConfidence = 'low' | 'medium' | 'high'

/** InsightStatus:生命周期状态 */
export type InsightStatus = 'active' | 'archived' | 'dismissed'

/**
 * Insight — M3 规律发现的核心产出单元
 * 对应设计文档 §4 exp_insights 表
 */
export interface Insight {
  /** 唯一 ID,格式 ins_{timestamp}_{random} */
  id: string
  /** 洞察维度 */
  dimension: ClusterDimension
  /** 洞察类型 */
  type: InsightType
  /** 一句话标题(统计生成或模型命名) */
  title: string
  /** 摘要描述,支持百分比表述如"38 条里 80% 指向同一根因" */
  summary: string
  /** 归因根因(模型归因时填写,纯统计时为空字符串) */
  rootCause: string
  /** 命中观察数 / 总观察数,如 0.8 */
  percentage: number
  /** 置信度(由 MIN_CLUSTER_SIZE 门槛决定) */
  confidence: InsightConfidence
  /** 支撑证据的 observationId 列表 */
  evidenceObservationIds: string[]
  /** 决策建议(模型生成或统计模板) */
  suggestion: string
  /** 洞察时间窗口描述,如"过去 90 天" */
  timeWindow: string
  /** 生成方式 */
  generatedBy: 'statistical' | 'model_enhanced'
  /** 状态 */
  status: InsightStatus
  /** 生成时间 ISO 字符串 */
  createdAt: string
  /** 聚类键(如具体的 category 值或 tag 值) */
  clusterKey: string
  /** 聚类内观察总数 */
  clusterSize: number
}
```

- [ ] **Step 2: 类型检查**

```bash
npm run typecheck -- --pretty false
```
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/types/experience.ts
git commit -m "feat(types): add Insight interface and related types for M3 pattern discovery"
```

---

## Task 2: 纯函数聚类引擎 `patternDiscovery.ts`

**Files:**
- Create: `src/services/patternDiscovery.ts`
- Create: `tests/patternDiscovery.test.ts`

**Interfaces:**
- Consumes: `Observation`, `Insight`, `InsightType`, `InsightConfidence`, `ClusterDimension` from `../types/experience`; `ObservationModelClient` from `./modelAnalysisAdapter`
- Produces:
  ```ts
  export const MIN_CLUSTER_SIZE: number  // = 3,最小样本门槛
  export function clusterObservations(observations: Observation[], dimension: ClusterDimension): Map<string, Observation[]>
  export function buildStatInsight(clusterKey: string, members: Observation[], total: number, dimension: ClusterDimension, timeWindow: string): Insight
  export async function enrichClusterWithModel(insight: Insight, members: Observation[], client: ObservationModelClient): Promise<Insight>
  export async function discoverPatterns(observations: Observation[], options?: PatternDiscoveryOptions): Promise<Insight[]>
  ```

- [ ] **Step 1: 写失败测试**

新建 `tests/patternDiscovery.test.ts`:

```ts
import assert from 'node:assert/strict'
import {
  MIN_CLUSTER_SIZE,
  clusterObservations,
  buildStatInsight,
  discoverPatterns,
} from '../src/services/patternDiscovery'
import type { Observation } from '../src/types/experience'
import type { ObservationModelClient } from '../src/services/modelAnalysisAdapter'

// ─── 测试固件 ────────────────────────────────────────────────────────────────

function makeObs(overrides: Partial<Observation> & { id: string }): Observation {
  return {
    text: '观察文本',
    category: '工作',
    tags: [],
    summary: '摘要',
    status: 'success',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

/** 6 条工作类 + 2 条饮食类 */
const workObs: Observation[] = [
  makeObs({ id: 'obs1', category: '工作', tags: ['目标不一致', '沟通'] }),
  makeObs({ id: 'obs2', category: '工作', tags: ['目标不一致', '进度'] }),
  makeObs({ id: 'obs3', category: '工作', tags: ['目标不一致'] }),
  makeObs({ id: 'obs4', category: '工作', tags: ['沟通'] }),
  makeObs({ id: 'obs5', category: '工作', tags: ['进度'] }),
  makeObs({ id: 'obs6', category: '工作', tags: [] }),
]
const foodObs: Observation[] = [
  makeObs({ id: 'obs7', category: '饮食', tags: [] }),
  makeObs({ id: 'obs8', category: '饮食', tags: [] }),
]
const allObs = [...workObs, ...foodObs]

// ─── clusterObservations ─────────────────────────────────────────────────────

async function testClusterByCategory() {
  const clusters = clusterObservations(allObs, 'category')
  assert.equal(clusters.get('工作')?.length, 6, '工作类应有 6 条')
  assert.equal(clusters.get('饮食')?.length, 2, '饮食类应有 2 条')
}

async function testClusterByTag() {
  const clusters = clusterObservations(allObs, 'tag')
  // '目标不一致' 出现在 obs1/obs2/obs3
  assert.equal(clusters.get('目标不一致')?.length, 3, '目标不一致标签应有 3 条')
  assert.equal(clusters.get('沟通')?.length, 2, '沟通标签应有 2 条')
}

async function testClusterEmptyInput() {
  const clusters = clusterObservations([], 'category')
  assert.equal(clusters.size, 0, '空输入应返回空 Map')
}

// ─── buildStatInsight ────────────────────────────────────────────────────────

async function testStatInsightFields() {
  const insight = buildStatInsight('工作', workObs, allObs.length, 'category', '过去 90 天')
  assert.equal(insight.clusterKey, '工作')
  assert.equal(insight.clusterSize, 6)
  assert.equal(insight.evidenceObservationIds.length, 6)
  assert.ok(insight.percentage > 0 && insight.percentage <= 1, 'percentage 应在 0-1 之间')
  assert.equal(insight.generatedBy, 'statistical')
  assert.equal(insight.dimension, 'category')
  assert.ok(insight.title.length > 0, 'title 不得为空')
  assert.ok(insight.summary.length > 0, 'summary 不得为空')
  assert.ok(insight.suggestion.length > 0, 'suggestion 不得为空')
}

async function testStatInsightConfidenceHighWhenAboveThreshold() {
  // clusterSize=6 > MIN_CLUSTER_SIZE(3),且占比 > 50%
  const insight = buildStatInsight('工作', workObs, allObs.length, 'category', '过去 90 天')
  assert.ok(
    insight.confidence === 'high' || insight.confidence === 'medium',
    `样本充足时置信度应为 medium 或 high,实际: ${insight.confidence}`,
  )
}

async function testStatInsightConfidenceLowWhenBelowThreshold() {
  // 只有 2 条饮食观察 < MIN_CLUSTER_SIZE(3)
  const insight = buildStatInsight('饮食', foodObs, allObs.length, 'category', '过去 90 天')
  assert.equal(insight.confidence, 'low', '样本不足时置信度必须为 low')
  // 低置信度时 suggestion 不应包含强断言词
  assert.ok(
    !insight.suggestion.includes('必须') && !insight.suggestion.includes('一定'),
    '低置信度建议不得含强断言',
  )
}

// ─── discoverPatterns — 最小样本门槛 ────────────────────────────────────────

async function testDiscoverPatternsFiltersLowSampleDimensions() {
  // 只提供 2 条观察 → 所有簇 < MIN_CLUSTER_SIZE,结果应全为 low 置信度
  const twoObs = [
    makeObs({ id: 'a1', category: '购物', tags: ['促销'] }),
    makeObs({ id: 'a2', category: '购物', tags: ['促销'] }),
  ]
  const insights = await discoverPatterns(twoObs, { timeWindowLabel: '过去 90 天' })
  insights.forEach((i) => {
    assert.equal(i.confidence, 'low', `样本不足时每条 insight 置信度必须为 low: ${i.title}`)
  })
}

async function testDiscoverPatternsProducesInsightsForLargeCluster() {
  // 6 条工作观察 → 应至少产出一条工作类 insight
  const insights = await discoverPatterns(workObs, { timeWindowLabel: '过去 90 天' })
  assert.ok(insights.length > 0, '应至少产出一条 insight')
  const workInsight = insights.find((i) => i.clusterKey === '工作' && i.dimension === 'category')
  assert.ok(workInsight, '应有工作-category 维度的 insight')
  assert.ok(
    workInsight!.confidence === 'medium' || workInsight!.confidence === 'high',
    '6 条样本的 insight 置信度应为 medium 或 high',
  )
}

async function testDiscoverPatternsNoClientUsesStatOnly() {
  const insights = await discoverPatterns(workObs, { client: null, timeWindowLabel: '过去 90 天' })
  insights.forEach((i) => {
    assert.equal(i.generatedBy, 'statistical', '无 client 时全部为统计生成')
  })
}

async function testDiscoverPatternsModelEnhancedOnSuccess() {
  // mock client 返回增强结果
  const mockClient: ObservationModelClient = {
    completeJson: async () => ({
      rootCause: '目标对齐缺失导致沟通低效',
      title: '目标不一致是工作负面结果的主因',
      suggestion: '每次启动项目前明确对齐各方目标,记录共识',
    }),
  }
  const insights = await discoverPatterns(workObs, { client: mockClient, timeWindowLabel: '过去 90 天' })
  const enhanced = insights.filter((i) => i.generatedBy === 'model_enhanced')
  assert.ok(enhanced.length > 0, '有 client 且样本达标时应有模型增强的 insight')
  const i = enhanced[0]!
  assert.ok(i.rootCause.length > 0, 'model_enhanced insight 应有 rootCause')
}

async function testDiscoverPatternsModelFailureFallsBackToStat() {
  const failingClient: ObservationModelClient = {
    completeJson: async () => { throw new Error('network error') },
  }
  const insights = await discoverPatterns(workObs, { client: failingClient, timeWindowLabel: '过去 90 天' })
  // 模型失败应回退统计,不应抛错,且仍有结果
  assert.ok(insights.length > 0, '模型失败时仍应有统计 insight')
  insights.forEach((i) => {
    assert.equal(i.generatedBy, 'statistical', '模型失败时回退为统计生成')
  })
}

async function testMinClusterSizeConstant() {
  assert.ok(MIN_CLUSTER_SIZE >= 3, 'MIN_CLUSTER_SIZE 应至少为 3')
}

// ─── run ─────────────────────────────────────────────────────────────────────

async function run() {
  await testClusterByCategory()
  await testClusterByTag()
  await testClusterEmptyInput()
  await testStatInsightFields()
  await testStatInsightConfidenceHighWhenAboveThreshold()
  await testStatInsightConfidenceLowWhenBelowThreshold()
  await testDiscoverPatternsFiltersLowSampleDimensions()
  await testDiscoverPatternsProducesInsightsForLargeCluster()
  await testDiscoverPatternsNoClientUsesStatOnly()
  await testDiscoverPatternsModelEnhancedOnSuccess()
  await testDiscoverPatternsModelFailureFallsBackToStat()
  await testMinClusterSizeConstant()
  console.log('patternDiscovery tests passed')
}

void run()
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx tsc -p tsconfig.test.json && node dist-tests/tests/patternDiscovery.test.js
```
Expected: FAIL —— 编译报错 `Cannot find module '../src/services/patternDiscovery'`。

- [ ] **Step 3: 写最小实现 `src/services/patternDiscovery.ts`**

```ts
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
  return (obs as Record<string, unknown>)['sentiment'] as string || ''
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

function buildStatTitle(clusterKey: string, clusterSize: number, dimension: ClusterDimension): string {
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
  dimension: ClusterDimension,
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

    const rootCause = typeof raw['rootCause'] === 'string' ? raw['rootCause'] : ''
    const title = typeof raw['title'] === 'string' && raw['title'].length > 0
      ? raw['title']
      : insight.title
    const suggestion = typeof raw['suggestion'] === 'string' && raw['suggestion'].length > 0
      ? raw['suggestion']
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx tsc -p tsconfig.test.json && node dist-tests/tests/patternDiscovery.test.js
```
Expected: PASS,输出 `patternDiscovery tests passed`。

- [ ] **Step 5: Commit**

```bash
git add src/services/patternDiscovery.ts tests/patternDiscovery.test.ts
git commit -m "feat(services): add patternDiscovery engine with statistical clustering and optional model enrichment"
```

---

## Task 3: Store 接入 — `computeInsights()` action + 状态 + 持久化

**Files:**
- Modify: `src/stores/experience.ts`

**接入要点:**
- 新增 `insights` ref 状态
- 新增 `computeInsights()` async action
- 新增 `isComputingInsights` loading 状态
- `persist()` 函数已有的 localStorage 写入中追加 `insights`
- 初始化时从 localStorage 读取恢复 `insights`

- [ ] **Step 1: 在 store import 区追加导入**

定位到 `src/stores/experience.ts` 顶部 import 区(现有 import 之后),追加:

```ts
import { discoverPatterns } from '../services/patternDiscovery'
import type { Insight } from '../types/experience'
```

- [ ] **Step 2: 在 store 的 ref 声明区追加状态**

在 `experience.ts` 中找到 `const isAnalyzing = ref(false)` 附近,追加:

```ts
const insights = ref<Insight[]>([])
const isComputingInsights = ref(false)
```

- [ ] **Step 3: 追加 `computeInsights()` action**

在 `submitObservation` 函数之后追加:

```ts
/**
 * M3 规律发现:对当前所有 success 状态的 observations 执行聚类归因
 * 统计基座必做;若有可用模型 client 则做增强
 */
async function computeInsights(timeWindowLabel = '过去 90 天') {
  if (isComputingInsights.value) return
  isComputingInsights.value = true

  try {
    const successObs = observations.value.filter((o) => o.status === 'success')
    const client = getActiveModelClient()
    const result = await discoverPatterns(successObs, {
      client,
      timeWindowLabel,
      dimensions: ['category', 'tag'],
    })
    insights.value = result
    persist()
  } finally {
    isComputingInsights.value = false
  }
}
```

- [ ] **Step 4: 扩展 `persist()` 和初始化加载**

找到 store 中 `persist()` 函数里 `localStorage.setItem(...)` 的对象字面量,追加 `insights` 字段:

```ts
// 在 persist() 的 JSON.stringify 对象里追加:
insights: insights.value,
```

找到 store 初始化时从 localStorage 读取数据的位置(通常是 `const saved = localStorage.getItem(...)` 之后的解构),追加:

```ts
if (saved.insights) insights.value = saved.insights as Insight[]
```

- [ ] **Step 5: 在 `return` 语句中暴露新状态和 action**

在 store 的 `return { ... }` 对象中追加:

```ts
insights,
isComputingInsights,
computeInsights,
```

- [ ] **Step 6: 类型检查**

```bash
npm run typecheck -- --pretty false
```
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add src/stores/experience.ts
git commit -m "feat(store): add computeInsights action, insights state, and localStorage persistence for M3"
```

---

## Task 4: `InsightCard.vue` 归因卡片组件

**Files:**
- Create: `src/pages/index/components/InsightCard.vue`

确保目录存在:

```bash
# 目录若不存在需先创建(Vite 项目中已有 index.vue,components/ 子目录需新建)
```

**组件设计:**
- Props: `insight: Insight`
- 大字百分比展示
- 证据时间线(展示 evidence observations 的创建时间)
- 一条决策建议
- 置信度标签(low/medium/high 视觉差异化)
- 根因文本(仅 `generatedBy === 'model_enhanced'` 且 `rootCause` 非空时展示)

- [ ] **Step 1: 确认 components 目录结构**

```bash
ls src/pages/index/
```
若无 `components/` 目录,在编辑器中创建。

- [ ] **Step 2: 写组件**

新建 `src/pages/index/components/InsightCard.vue`:

```vue
<template>
  <view class="insight-card" :class="`confidence-${insight.confidence}`">
    <!-- 头部:维度标签 + 置信度 -->
    <view class="insight-header">
      <text class="dimension-badge">{{ dimensionLabel }}</text>
      <text class="confidence-badge" :class="`conf-${insight.confidence}`">
        {{ confidenceLabel }}
      </text>
      <text class="generated-by">{{ generatedByLabel }}</text>
    </view>

    <!-- 大字百分比 -->
    <view class="insight-hero">
      <text class="percentage-big">{{ percentageDisplay }}</text>
      <text class="percentage-label">的观察与此模式相关</text>
    </view>

    <!-- 标题 -->
    <text class="insight-title">{{ insight.title }}</text>

    <!-- 根因(仅模型增强且有根因时展示) -->
    <view v-if="insight.rootCause && insight.generatedBy === 'model_enhanced'" class="root-cause">
      <text class="root-cause-label">根因归因</text>
      <text class="root-cause-text">{{ insight.rootCause }}</text>
    </view>

    <!-- 摘要 -->
    <text class="insight-summary">{{ insight.summary }}</text>

    <!-- 证据时间线 -->
    <view v-if="evidenceTimeline.length > 0" class="evidence-timeline">
      <text class="timeline-label">证据时间线({{ evidenceTimeline.length }} 条)</text>
      <view class="timeline-dots">
        <view
          v-for="(item, idx) in evidenceTimeline"
          :key="idx"
          class="timeline-item"
        >
          <view class="timeline-dot" />
          <text class="timeline-time">{{ item.time }}</text>
          <text class="timeline-text">{{ item.text }}</text>
        </view>
      </view>
    </view>

    <!-- 决策建议 -->
    <view class="suggestion-box">
      <text class="suggestion-label">决策建议</text>
      <text class="suggestion-text">{{ insight.suggestion }}</text>
    </view>

    <!-- 低置信度免责声明 -->
    <view v-if="insight.confidence === 'low'" class="low-confidence-notice">
      <text class="notice-text">样本量不足,以上为初步观察,建议继续积累数据后再做决策。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Insight, Observation } from '../../../types/experience'

interface Props {
  insight: Insight
  /** 传入 observations 用于渲染证据时间线;可为空 */
  observations?: Observation[]
}

const props = withDefaults(defineProps<Props>(), {
  observations: () => [],
})

const percentageDisplay = computed(() => {
  return `${Math.round(props.insight.percentage * 100)}%`
})

const dimensionLabel = computed(() => {
  const map: Record<string, string> = {
    category: '分类模式',
    tag: '标签模式',
    sentiment: '情绪模式',
    rootCause: '根因模式',
  }
  return map[props.insight.dimension] ?? props.insight.dimension
})

const confidenceLabel = computed(() => {
  const map: Record<string, string> = {
    high: '高置信',
    medium: '中置信',
    low: '低置信·仅供参考',
  }
  return map[props.insight.confidence] ?? props.insight.confidence
})

const generatedByLabel = computed(() => {
  return props.insight.generatedBy === 'model_enhanced' ? 'AI 归因增强' : '统计归因'
})

interface TimelineItem {
  time: string
  text: string
}

const evidenceTimeline = computed((): TimelineItem[] => {
  if (!props.observations || props.observations.length === 0) return []

  const evidenceSet = new Set(props.insight.evidenceObservationIds)
  return props.observations
    .filter((o) => evidenceSet.has(o.id))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 5) // 最多展示 5 条证据
    .map((o) => ({
      time: formatTime(o.createdAt),
      text: o.text.slice(0, 40) + (o.text.length > 40 ? '…' : ''),
    }))
})

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<style lang="scss" scoped>
.insight-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  border-left: 4px solid #94a3b8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);

  &.confidence-high {
    border-left-color: #10b981;
  }

  &.confidence-medium {
    border-left-color: #f59e0b;
  }

  &.confidence-low {
    border-left-color: #94a3b8;
    opacity: 0.85;
  }
}

.insight-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.dimension-badge {
  font-size: 11px;
  background: #f1f5f9;
  color: #64748b;
  padding: 2px 8px;
  border-radius: 20px;
}

.confidence-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 20px;

  &.conf-high { background: #d1fae5; color: #065f46; }
  &.conf-medium { background: #fef3c7; color: #92400e; }
  &.conf-low { background: #f1f5f9; color: #64748b; }
}

.generated-by {
  font-size: 11px;
  color: #94a3b8;
  margin-left: auto;
}

.insight-hero {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}

.percentage-big {
  font-size: 48px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1;
}

.percentage-label {
  font-size: 14px;
  color: #64748b;
}

.insight-title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  display: block;
  margin-bottom: 8px;
}

.root-cause {
  background: #f0fdf4;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.root-cause-label {
  font-size: 11px;
  color: #16a34a;
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}

.root-cause-text {
  font-size: 14px;
  color: #166534;
}

.insight-summary {
  font-size: 13px;
  color: #475569;
  display: block;
  line-height: 1.6;
  margin-bottom: 12px;
}

.evidence-timeline {
  margin-bottom: 12px;
}

.timeline-label {
  font-size: 11px;
  color: #94a3b8;
  display: block;
  margin-bottom: 8px;
}

.timeline-dots {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.timeline-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #cbd5e1;
  margin-top: 5px;
  flex-shrink: 0;
}

.timeline-time {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
  width: 36px;
}

.timeline-text {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.suggestion-box {
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}

.suggestion-label {
  font-size: 11px;
  color: #94a3b8;
  display: block;
  margin-bottom: 4px;
}

.suggestion-text {
  font-size: 14px;
  color: #334155;
  font-weight: 500;
  line-height: 1.5;
}

.low-confidence-notice {
  background: #f8fafc;
  border-radius: 6px;
  padding: 8px 10px;
  border: 1px dashed #e2e8f0;
}

.notice-text {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.5;
}
</style>
```

- [ ] **Step 3: 类型检查**

```bash
npm run typecheck -- --pretty false
```
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add src/pages/index/components/InsightCard.vue
git commit -m "feat(ui): add InsightCard component for M3 pattern discovery attribution cards"
```

---

## Task 5: 接入 `index.vue` — 扫描按钮 + insights tab(最小侵入)

**Files:**
- Modify: `src/pages/index/index.vue`

**原则:** 不向 index.vue 继续堆砌大段代码,仅做最小挂载:
1. import `InsightCard`
2. 在 tabs 数组追加 `insights` tab
3. 在 composer 区追加「扫描我的 90 天」按钮
4. 追加 insights panel(用 `v-if="activeTab === 'insights'"`)

- [ ] **Step 1: 在 `<script setup>` import 区追加**

找到 index.vue 的 `<script setup>` 区内现有 component import 位置(如 `RuleCard` import),追加:

```ts
import InsightCard from './components/InsightCard.vue'
```

- [ ] **Step 2: 在 tabs 数组追加 insights tab**

找到 index.vue 中定义 `tabs` 的地方(如 `const tabs = [...]`),追加一项:

```ts
{ key: 'insights', label: '规律发现' },
```

- [ ] **Step 3: 在 composer 区或 ops-board 区追加扫描按钮**

在 composer 的 `utility-actions` view 内(与"加载示例"/"清空"按钮同区),或在 ops-board 下方追加:

```vue
<button
  class="primary-button scan-button"
  :disabled="store.observations.filter(o => o.status === 'success').length < 3 || store.isComputingInsights"
  @click="store.computeInsights('过去 90 天')"
>
  {{ store.isComputingInsights ? '扫描中…' : '扫描我的 90 天' }}
</button>
```

> 注意:按钮在观察数量 < 3 时禁用(呼应最小样本门槛),避免用户在数据不足时触发无意义扫描。

- [ ] **Step 4: 追加 insights panel**

在最后一个 `v-if="activeTab === '...'"` panel 之后追加:

```vue
<view v-if="activeTab === 'insights'" class="panel">
  <view class="section-head">
    <text class="section-title">规律发现</text>
    <text class="section-meta">{{ store.insights.length }} 条洞察</text>
  </view>

  <view v-if="store.insights.length === 0 && !store.isComputingInsights" class="empty">
    <text>点击「扫描我的 90 天」开始分析跨记录规律。</text>
    <text class="empty-hint">至少需要 3 条成功处理的观察。</text>
  </view>

  <view v-if="store.isComputingInsights" class="analyzing-hint">
    <text>正在扫描规律中…</text>
  </view>

  <InsightCard
    v-for="insight in store.insights"
    :key="insight.id"
    :insight="insight"
    :observations="store.observations"
  />
</view>
```

- [ ] **Step 5: 追加最小 SCSS(仅新增部分)**

在 index.vue 的 `<style>` 区末尾追加:

```scss
.scan-button {
  margin-top: 12px;
  width: 100%;
}

.empty-hint {
  font-size: 12px;
  color: #94a3b8;
  display: block;
  margin-top: 4px;
}

.analyzing-hint {
  text-align: center;
  padding: 20px;
  color: #64748b;
  font-size: 14px;
}
```

- [ ] **Step 6: 类型检查**

```bash
npm run typecheck -- --pretty false
```
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add src/pages/index/index.vue
git commit -m "feat(ui): wire InsightCard and scan-90-days button into index.vue for M3"
```

---

## Task 6: 注册测试 + 全量验证

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 在 `test:evaluation` 脚本末尾追加新测试文件**

当前脚本末尾为 `...&& node dist-tests/tests/resilientAnalysis.test.js`

改为追加 `&& node dist-tests/tests/patternDiscovery.test.js`:

```json
"test:evaluation": "tsc -p tsconfig.test.json && node dist-tests/tests/aiAnalyzer.test.js && node dist-tests/tests/modelAnalysisAdapter.test.js && node dist-tests/tests/evaluationEngine.test.js && node dist-tests/tests/experienceStore.test.js && node dist-tests/tests/modelClient.test.js && node dist-tests/tests/resilientAnalysis.test.js && node dist-tests/tests/patternDiscovery.test.js"
```

- [ ] **Step 2: 全量测试通过**

```bash
npm run typecheck -- --pretty false && npm run test:evaluation
```
Expected: typecheck 无错;所有测试通过,末行输出 `patternDiscovery tests passed`。

- [ ] **Step 3: 手动验证演示路径(可选,需有效 DeepSeek Key)**

```bash
npm run dev:h5
```

浏览器操作:
1. 点"加载示例"加载 demo 数据(确保有 ≥ 3 条 success 状态的观察)。
2. 点「扫描我的 90 天」按钮(应激活,文字变"扫描中…")。
3. 切换到"规律发现"tab,应看到至少 1 张 InsightCard。
4. 断网或不配置 Key:刷新后重复步骤,InsightCard 仍应出现(统计降级路径)。

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "test: register patternDiscovery tests in test:evaluation script"
```

---

## 任务汇总

| # | 任务 | 关键产出 | 测试 |
|---|------|---------|------|
| 1 | 新增 `Insight` 类型 | `src/types/experience.ts` 追加 7 个类型/接口 | typecheck |
| 2 | 聚类引擎 `patternDiscovery.ts` | 纯函数服务 + 12 个测试用例 | `patternDiscovery.test.ts` |
| 3 | Store 接入 | `computeInsights()` action + `insights` 状态 + 持久化 | typecheck |
| 4 | `InsightCard.vue` 组件 | 归因卡片组件(大字百分比 + 证据时间线 + 建议) | typecheck |
| 5 | `index.vue` 最小接入 | 扫描按钮 + insights tab + InsightCard 挂载 | typecheck |
| 6 | 注册测试 + 全量验证 | `package.json` 更新 + 全量通过 | 全量回归 |

**总任务数: 6 个任务,合计 28 个步骤(含 12 个测试用例)**

---

## 后续路线图(本 plan 后置)

- **Plan 4(D4)M4 决策辅助**:录入新行动时主动召回命中的历史 Insight 并提醒。
- **Plan 4(续) Key 配置 UI**:设置页 DeepSeek Key 配置。
- **Plan 4(续) 评估降级**:评估工作台折叠隐藏。
- **Plan 5(D5)种子数据**:预置 ~35 条跨 90 天工作观察(埋共同根因),让真实管线自然产出 insight。
- **后置**:embedding 语义聚类(替代 tag 聚类)、多维度交叉归因(category × sentiment)、insight 反馈(有用/无用)。

---

## Self-Review(Plan 3)

**Spec coverage:**
- 覆盖设计 §3(M3 规律发现:统计聚类 + 模型归因 + 最小样本门槛 + 纯统计兜底)。
- 覆盖设计 §4(`exp_insights` 表:所有字段在 `Insight` 接口中均有对应)。
- 覆盖设计 §5(AI 流水线第 3 件:对达标簇调模型;模型不可用时退回统计描述)。
- 覆盖设计 §6(演示路径:「扫描我的 90 天」按钮 + 归因卡片)。

**Placeholder scan:** 无 TBD/TODO。所有步骤含完整代码与命令。

**Type consistency:**
- `Insight` 接口在 `types/experience.ts` 定义,在 `patternDiscovery.ts`、`experience.ts`(store)、`InsightCard.vue` 中均通过 import 使用,不重复声明。
- `ClusterDimension`、`InsightConfidence`、`InsightType` 均为 `types/experience.ts` 导出,测试文件通过相同路径导入。
- `ObservationModelClient` 复用自 `modelAnalysisAdapter.ts`,不重复实现。

**最小样本门槛一致性:**
- `MIN_CLUSTER_SIZE = 3` 在 `patternDiscovery.ts` 中为唯一数字字面量,store 和 UI 均通过导入或间接使用此值(UI 按钮禁用条件 `< 3` 与常量对齐)。
- 低置信度簇:`buildStatInsight` 返回 `confidence: 'low'`;`enrichClusterWithModel` 检查 `confidence === 'low'` 时跳过模型调用;InsightCard 展示免责声明。

**模型降级链:**
- `enrichClusterWithModel` 内部 catch 静默回退统计 insight,不向上抛。
- `discoverPatterns` 传 `client: null` 时完全跳过模型增强路径。
- 两条路径均有测试覆盖(`testDiscoverPatternsNoClientUsesStatOnly` / `testDiscoverPatternsModelFailureFallsBackToStat`)。

**不膨胀 index.vue:** UI 逻辑全在 `InsightCard.vue`,index.vue 新增 ≤ 30 行(import + tab entry + scan button + panel 壳)。
