import assert from 'node:assert/strict'
import { discoverLaws } from '../src/services/lawDiscovery'
import type { Observation } from '../src/types/experience'

// ---------------------------------------------------------------------------
// A2+A3 接入 lawDiscovery 的集成测试:数据量过冷启动线(≥30)→ 走语义聚类。
// 证明:跨 category 的同根因被聚到一起(category 分桶做不到),噪声不成规律。
// 见 docs/superpowers/specs/2026-06-24-lawdiscovery-algo-integration-design.md
// ---------------------------------------------------------------------------

const NOW = Date.parse('2026-06-20T00:00:00Z')
function obs(id: string, text: string, category: string, sentiment: Observation['sentiment']): Observation {
  return {
    id,
    text,
    category: category as Observation['category'],
    tags: [],
    status: 'success',
    createdAt: new Date(NOW - 5 * 24 * 60 * 60 * 1000).toISOString(),
    sentiment,
  } as unknown as Observation
}

// 同根因(对齐/返工)分散在不同 category —— 语义聚类应跨类目把它们聚到一起
const rootCauseA: Observation[] = [
  obs('a1', '需求评审没对齐返工', '工作', 'negative'),
  obs('a2', '评审没对齐导致返工', '学习', 'negative'),
  obs('a3', '需求对齐不足返工', '生活', 'negative'),
]
// 另一根因(高峰/排队)
const rootCauseB: Observation[] = [
  obs('b1', '高峰排队人很多', '出行', 'negative'),
  obs('b2', '高峰排队太久', '出行', 'negative'),
  obs('b3', '高峰排队很挤', '出行', 'negative'),
]
// 填充到 ≥30:中性观察(聚类时跳过,但计入 scoped 数 → 触发语义路径)
const filler: Observation[] = Array.from({ length: 26 }, (_, i) => obs(`n${i}`, `日常记录${i}`, '其他', 'neutral'))

const all = [...rootCauseA, ...rootCauseB, ...filler]
const byId = new Map(all.map((o) => [o.id, o]))

async function run() {
  assert.ok(all.length >= 30, '样本应过冷启动线,走语义聚类')
  const laws = await discoverLaws(all, { nowMs: NOW }) // 无 client → 统计 + 语义聚类

  assert.ok(laws.length >= 1, '应聚出规律')

  // 关键:存在一条规律,其成员跨 ≥2 个 category —— 这是 category 分桶不可能产出的,
  // 证明语义聚类(A2+A3)真的在跨类目把同根因聚到了一起。
  const crossCategory = laws.some((law) => {
    const cats = new Set(law.memberObservationIds.map((id) => byId.get(id)?.category))
    return cats.size >= 2
  })
  assert.ok(crossCategory, '应有跨 category 的语义簇(对齐/返工 散在工作/学习/生活)')

  // 中性填充不应进任何规律
  const hasNeutral = laws.some((law) => law.memberObservationIds.some((id) => id.startsWith('n')))
  assert.ok(!hasNeutral, '中性观察不应成规律')

  console.log('lawDiscoveryIntegration tests passed')
}

void run()
