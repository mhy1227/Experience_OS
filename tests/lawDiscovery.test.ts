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
  assert.equal(lawConfidence(6), 'high', '≥6 → high(按复发数,不再受全量分母拖累)')
  assert.equal(lawConfidence(3), 'medium', '≥3 → medium')
  assert.equal(lawConfidence(2), 'low')
}

async function testComputeTrend() {
  // A7 接入 Mann-Kendall:按时间跨度分桶成复发计数序列(旧→新),统计显著才判趋势。
  // 注:语义比原"近期占比"更严谨/保守 —— 复发计数随时间「单调上升」才 rising。
  const ramp = (counts: number[]): string[] => {
    const out: string[] = []
    counts.forEach((c, seg) => {
      const base = 78 - seg * 13 // 6 段,每段约 13 天,旧→新
      for (let k = 0; k < c; k++) out.push(daysAgo(base - k))
    })
    return out
  }
  // 复发计数单调上升 → rising
  assert.equal(computeTrend(ramp([1, 2, 3, 4, 5, 6]), NOW), 'rising')
  // 复发计数单调下降 → falling
  assert.equal(computeTrend(ramp([6, 5, 4, 3, 2, 1]), NOW), 'falling')
  // 无单调趋势(噪声)→ flat
  assert.equal(computeTrend(ramp([2, 3, 2, 3, 2, 3]), NOW), 'flat', '无显著趋势 → flat')
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
    note: '已针对它改进',
    createdAt: daysAgo(60),
    updatedAt: daysAgo(40),
  }
  const candidate: Law = {
    ...resolved,
    id: 'law_cand',
    memberObservationIds: ['a', 'b', 'c'], // 新成员 c → 复发
    recurrence: 3,
  }
  const merged = mergeLaws([resolved], [candidate], daysAgo(0), new Set(['a', 'b', 'c']))
  assert.equal(merged.length, 1, '应合并不新增')
  assert.equal(merged[0]!.status, 'active', '已解决 + 新成员复发 → 重新激活')
  assert.equal(merged[0]!.recurrence, 3)
  assert.equal(merged[0]!.note, undefined, '重新激活时旧 note 应清空(与 markLawStatus 一致)')
}

// 🔴 review 修复:旧成员里仍在窗口、来自其它桶的不被硬替换丢掉
async function testMerge_KeepsInScopePrevMembers() {
  const prev: Law = {
    id: 'law_p', theme: '前期对齐不足', kind: 'caution', rootCause: '', suggestion: '',
    memberObservationIds: ['x', 'y'], recurrence: 2, firstSeenAt: daysAgo(10), lastSeenAt: daysAgo(5),
    trend: 'flat', confidence: 'low', status: 'active', generatedBy: 'statistical',
    createdAt: daysAgo(10), updatedAt: daysAgo(5),
  }
  // 候选只含 [x, z](按 x 重叠命中),y 仍在窗口内
  const cand: Law = { ...prev, id: 'law_c', memberObservationIds: ['x', 'z'], recurrence: 2 }
  const merged = mergeLaws([prev], [cand], daysAgo(0), new Set(['x', 'y', 'z']))
  assert.equal(merged.length, 1)
  assert.deepEqual([...merged[0]!.memberObservationIds].sort(), ['x', 'y', 'z'], 'y 在窗口内不应被丢;z 应并入')
  assert.equal(merged[0]!.recurrence, 3)
}

// 🟢 review 补:契约路径——模型返回占位/超长主题应被拦(此前假 client 永返固定值,未覆盖)
async function testContract_PlaceholderAndLongTheme() {
  const placeholderClient: ObservationModelClient = {
    completeJson: async () => ({ theme: '暂无明确主题', rootCause: '', suggestion: '' }),
  }
  const ph = await discoverLaws(
    [obs({ id: 'a', sentiment: 'negative', category: '工作', tags: ['返工'] }), obs({ id: 'b', sentiment: 'negative', category: '工作', tags: ['返工'] })],
    { nowMs: NOW, client: placeholderClient },
  )
  assert.equal(ph[0]!.generatedBy, 'statistical', '占位主题被拒 → 回退统计')

  const longClient: ObservationModelClient = {
    completeJson: async () => ({ theme: '这是一个非常非常非常非常冗长的主题名称超过十六个字', rootCause: '', suggestion: '' }),
  }
  const lg = await discoverLaws(
    [obs({ id: 'c', sentiment: 'positive', category: '运动', tags: ['健身'] }), obs({ id: 'd', sentiment: 'positive', category: '运动', tags: ['健身'] })],
    { nowMs: NOW, client: longClient },
  )
  assert.ok(lg[0]!.theme.length <= 16, '超长主题应被截断到 ≤16 字')
}

// 🔴 修复:窗口准确——过期成员不计入复发数(recurrence 反映 90 天窗口,不无限并集)
async function testWindowAccurateRecurrence() {
  const recent = [
    obs({ id: 'a', sentiment: 'negative', category: '工作', tags: ['返工'], createdAt: daysAgo(1) }),
    obs({ id: 'b', sentiment: 'negative', category: '工作', tags: ['返工'], createdAt: daysAgo(2) }),
    obs({ id: 'c', sentiment: 'negative', category: '工作', tags: ['返工'], createdAt: daysAgo(3) }),
  ]
  const s1 = await discoverLaws(recent, { nowMs: NOW })
  assert.equal(s1[0]!.recurrence, 3)
  // a 变成 100 天前(超窗口)→ 再扫只剩 2 条在窗口内
  const aged = [
    obs({ id: 'a', sentiment: 'negative', category: '工作', tags: ['返工'], createdAt: daysAgo(100) }),
    obs({ id: 'b', sentiment: 'negative', category: '工作', tags: ['返工'], createdAt: daysAgo(2) }),
    obs({ id: 'c', sentiment: 'negative', category: '工作', tags: ['返工'], createdAt: daysAgo(3) }),
  ]
  const s2 = await discoverLaws(aged, { nowMs: NOW, existingLaws: s1 })
  assert.equal(s2.length, 1, '仍是同一条规律')
  assert.equal(s2[0]!.recurrence, 2, '过期成员不计入窗口复发数(不无限并集)')
}

// 🟡 修复:同一 category 的正负观察分成两条规律(kind 轴干净,即使主题字符串相同也不合并)
async function testSplitsByKindWithinCategory() {
  const observations = [
    obs({ id: 'n1', sentiment: 'negative', category: '工作', text: '返工1' }),
    obs({ id: 'n2', sentiment: 'negative', category: '工作', text: '返工2' }),
    obs({ id: 'p1', sentiment: 'positive', category: '工作', text: '顺利1' }),
    obs({ id: 'p2', sentiment: 'positive', category: '工作', text: '顺利2' }),
  ]
  // 假模型对所有簇返回相同主题 → 验证 kind 感知 dedupe 不会把避坑/成功并成一条
  const laws = await discoverLaws(observations, { nowMs: NOW, client: fakeClient('共同主题') })
  assert.equal(laws.length, 2, '同 category 正负 + 同主题字符串 → 仍应是 2 条(按 kind 区分)')
  assert.deepEqual(laws.map((l) => l.kind).sort(), ['caution', 'strategy'])
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
  await testMerge_KeepsInScopePrevMembers()
  await testContract_PlaceholderAndLongTheme()
  await testWindowAccurateRecurrence()
  await testSplitsByKindWithinCategory()
  await testMarkLawStatus()
  console.log('lawDiscovery tests passed')
}

void run()
