import assert from 'node:assert/strict'
import type { Observation, Law } from '../src/types/experience'
import type { ObservationModelClient } from '../src/services/modelAnalysisAdapter'
import {
  dominantKind,
  lawConfidence,
  computeTrend,
  mergeLaws,
  markLawStatus,
  discoverLaws,
} from '../src/services/lawDiscovery'

const NOW = Date.parse('2026-06-23T00:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString()
}

function obs(over: Partial<Observation> & { id: string }): Observation {
  return {
    id: over.id,
    text: over.text ?? '一条观察',
    category: over.category ?? '工作',
    tags: over.tags ?? [],
    summary: over.summary ?? '',
    status: over.status ?? 'success',
    createdAt: over.createdAt ?? daysAgo(1),
    sentiment: over.sentiment ?? 'negative',
  }
}

// 固定主题的假模型(语义归因)
function fakeClient(theme = '前期对齐不足'): ObservationModelClient {
  return {
    completeJson: async () => ({ theme, rootCause: '缺少前期对齐', suggestion: '事前开对齐会' }),
  }
}

// ─── 纯逻辑 ─────────────────────────────────────────────────────────────────

async function testDominantKind() {
  assert.equal(dominantKind([obs({ id: 'a', sentiment: 'negative' }), obs({ id: 'b', sentiment: 'negative' })]), 'caution')
  assert.equal(dominantKind([obs({ id: 'a', sentiment: 'positive' }), obs({ id: 'b', sentiment: 'positive' })]), 'strategy')
  assert.equal(dominantKind([obs({ id: 'a', sentiment: 'neutral' }), obs({ id: 'b', sentiment: 'neutral' })]), null, '全中性 → null')
}

async function testLawConfidence() {
  assert.equal(lawConfidence(6, 10), 'high', '≥6 且占比≥0.5 → high')
  assert.equal(lawConfidence(3, 100), 'medium', '≥3 → medium')
  assert.equal(lawConfidence(2, 100), 'low')
}

async function testComputeTrend() {
  // 5 条全在近 30 天 → rising
  assert.equal(computeTrend([daysAgo(1), daysAgo(2), daysAgo(3), daysAgo(4), daysAgo(5)], NOW), 'rising')
  // 5 条全在 30 天前 → falling
  assert.equal(computeTrend([daysAgo(40), daysAgo(50), daysAgo(60), daysAgo(70), daysAgo(80)], NOW), 'falling')
  // 样本不足(<4)→ flat
  assert.equal(computeTrend([daysAgo(1), daysAgo(2), daysAgo(3)], NOW), 'flat', '样本不足 → flat')
}

// ─── discoverLaws ───────────────────────────────────────────────────────────

async function testDiscover_DegradeNoClient() {
  const observations = [
    obs({ id: 'n1', sentiment: 'negative', tags: ['返工'] }),
    obs({ id: 'n2', sentiment: 'negative', tags: ['返工'] }),
    obs({ id: 'n3', sentiment: 'negative', tags: ['返工'] }),
  ]
  const laws = await discoverLaws(observations, { nowMs: NOW }) // 无 client → 降级统计
  assert.equal(laws.length, 1, '应聚成 1 条规律')
  assert.equal(laws[0]!.kind, 'caution')
  assert.equal(laws[0]!.generatedBy, 'statistical', '无 client → 统计降级')
  assert.equal(laws[0]!.recurrence, 3)
}

async function testDiscover_SkipsSingleAndNeutral() {
  const observations = [
    obs({ id: 's1', sentiment: 'negative', category: '工作' }), // 单条 工作 → 不足 2,跳过
    obs({ id: 'x1', sentiment: 'neutral', category: '生活' }),
    obs({ id: 'x2', sentiment: 'neutral', category: '生活' }), // 全中性 → 跳过
  ]
  const laws = await discoverLaws(observations, { nowMs: NOW })
  assert.equal(laws.length, 0, '单条簇 + 全中性簇都不产规律')
}

async function testDiscover_WithModelTheme() {
  const observations = [
    obs({ id: 'a', sentiment: 'negative', category: '工作', text: '不开对齐会返工' }),
    obs({ id: 'b', sentiment: 'negative', category: '工作', text: '没定接口返工' }),
  ]
  const laws = await discoverLaws(observations, { nowMs: NOW, client: fakeClient('前期对齐不足') })
  assert.equal(laws.length, 1)
  assert.equal(laws[0]!.theme, '前期对齐不足', '采用模型主题')
  assert.equal(laws[0]!.generatedBy, 'model')
}

async function testDiscover_Idempotent() {
  const observations = [
    obs({ id: 'a', sentiment: 'negative', tags: ['返工'] }),
    obs({ id: 'b', sentiment: 'negative', tags: ['返工'] }),
    obs({ id: 'c', sentiment: 'negative', tags: ['返工'] }),
  ]
  const first = await discoverLaws(observations, { nowMs: NOW })
  const second = await discoverLaws(observations, { nowMs: NOW, existingLaws: first })
  assert.equal(second.length, 1, '同一批扫两次不应膨胀')
  assert.equal(second[0]!.recurrence, 3, '复发数不应翻倍(成员去重)')
}

// ─── mergeLaws 生命周期 ──────────────────────────────────────────────────────

async function testMerge_ResolvedReactivatesOnRecurrence() {
  const resolved: Law = {
    id: 'law_x',
    theme: '前期对齐不足',
    kind: 'caution',
    rootCause: '',
    suggestion: '',
    memberObservationIds: ['a', 'b'],
    recurrence: 2,
    firstSeenAt: daysAgo(60),
    lastSeenAt: daysAgo(40),
    trend: 'flat',
    confidence: 'medium',
    status: 'resolved',
    generatedBy: 'statistical',
    createdAt: daysAgo(60),
    updatedAt: daysAgo(40),
  }
  const candidate: Law = {
    ...resolved,
    id: 'law_cand',
    memberObservationIds: ['a', 'b', 'c'], // 新成员 c → 复发
    recurrence: 3,
  }
  const merged = mergeLaws([resolved], [candidate], daysAgo(0))
  assert.equal(merged.length, 1, '应合并不新增')
  assert.equal(merged[0]!.status, 'active', '已解决 + 新成员复发 → 重新激活')
  assert.equal(merged[0]!.recurrence, 3)
}

async function testMarkLawStatus() {
  const law = (await discoverLaws(
    [obs({ id: 'a', sentiment: 'negative', tags: ['返工'] }), obs({ id: 'b', sentiment: 'negative', tags: ['返工'] })],
    { nowMs: NOW },
  ))[0]!
  const reviewed = markLawStatus(law, 'reviewed', daysAgo(0), '已开复盘会')
  assert.equal(reviewed.status, 'reviewed')
  assert.equal(reviewed.note, '已开复盘会')
  assert.equal(law.status, 'active', '原对象不被修改(纯函数)')
}

async function run() {
  await testDominantKind()
  await testLawConfidence()
  await testComputeTrend()
  await testDiscover_DegradeNoClient()
  await testDiscover_SkipsSingleAndNeutral()
  await testDiscover_WithModelTheme()
  await testDiscover_Idempotent()
  await testMerge_ResolvedReactivatesOnRecurrence()
  await testMarkLawStatus()
  console.log('lawDiscovery tests passed')
}

void run()
