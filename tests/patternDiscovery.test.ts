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
  // clusterSize=6 (>= HIGH_CONFIDENCE_SIZE) 且占比 6/8=75% (>= 0.5) → 必为 high
  const insight = buildStatInsight('工作', workObs, allObs.length, 'category', '过去 90 天')
  assert.equal(insight.confidence, 'high', `6/8=75% 且样本=6 时置信度必须为 high,实际: ${insight.confidence}`)
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

async function testFiltersSingleOccurrenceClusters() {
  // 每个 tag 仅出现 1 次 → 不应产出标签洞察(避免刷屏);category 工作 size=3 应保留
  const data: Observation[] = [
    makeObs({ id: 'x1', category: '工作', tags: ['唯一A'] }),
    makeObs({ id: 'x2', category: '工作', tags: ['唯一B'] }),
    makeObs({ id: 'x3', category: '工作', tags: ['唯一C'] }),
  ]
  const insights = await discoverPatterns(data, { timeWindowLabel: '过去 90 天' })
  assert.equal(insights.filter((i) => i.dimension === 'tag').length, 0, '单次出现的标签不应产出洞察')
  assert.ok(insights.some((i) => i.dimension === 'category' && i.clusterKey === '工作'), '工作类(size=3)应保留')
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
  await testFiltersSingleOccurrenceClusters()
  console.log('patternDiscovery tests passed')
}

void run()
