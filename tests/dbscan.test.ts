import assert from 'node:assert/strict'
import { dbscan, NOISE } from '../src/services/dbscan'
import { buildIdf, toVector, type Vector } from '../src/services/tfidf'

// ---------------------------------------------------------------------------
// A3 DBSCAN(余弦距离)。按 docs/algorithm-a2-a3-vectorize-cluster-plan.md。
// ---------------------------------------------------------------------------

const vec = (pairs: [string, number][]): Vector => new Map(pairs)
const clusterCount = (labels: number[]) => new Set(labels.filter((l) => l >= 0)).size

// 1. 两组明显簇 + 噪声:eps=0.5,minPts=2 → 2 簇 + 1 噪声
{
  const pts = [
    vec([['a', 1], ['b', 1]]), vec([['a', 1], ['b', 1]]), vec([['a', 1], ['b', 1]]),
    vec([['c', 1], ['d', 1]]), vec([['c', 1], ['d', 1]]),
    vec([['e', 1]]),
  ]
  const labels = dbscan(pts, 0.5, 2)
  assert.equal(clusterCount(labels), 2, `应 2 簇,实际 ${JSON.stringify(labels)}`)
  assert.equal(labels[5], NOISE, '孤立点应为噪声')
}

// 2. minPts 调高 → 更多噪声(全噪声)
{
  const pts = [vec([['a', 1]]), vec([['a', 1]]), vec([['c', 1]]), vec([['c', 1]])]
  const labels = dbscan(pts, 0.5, 5)
  assert.ok(labels.every((l) => l === NOISE), 'minPts 大于簇规模 → 全噪声')
}

// 3. 幂等:同输入同结果
{
  const pts = [vec([['a', 1], ['b', 1]]), vec([['a', 1], ['b', 1]]), vec([['z', 1]])]
  assert.deepEqual(dbscan(pts, 0.5, 2), dbscan(pts, 0.5, 2))
}

// 4. 冷启动:空 / 不足 → 不崩
{
  assert.deepEqual(dbscan([], 0.5, 2), [])
  assert.deepEqual(dbscan([vec([['a', 1]])], 0.5, 2), [NOISE])
}

// 5. 端到端:同根因不同表述聚成簇,无关项判噪声
{
  const docs = [
    ['前期', '对齐', '不足', '返工'],
    ['前期', '对齐', '不足', '延期'],
    ['前期', '对齐', '沟通', '返工'],
    ['高峰', '排队', '人', '多'],
    ['高峰', '排队', '拥挤', '多'],
    ['高峰', '排队', '人', '久'],
    ['随机', '无关', '内容', '词'],
  ]
  const idf = buildIdf(docs)
  const vectors = docs.map((d) => toVector(d, idf))
  const labels = dbscan(vectors, 0.6, 2)
  assert.equal(clusterCount(labels), 2, `两类根因应聚成 2 簇,实际 ${JSON.stringify(labels)}`)
  assert.equal(labels[0], labels[1], '同根因应同簇')
  assert.equal(labels[0], labels[2], '同根因应同簇')
  assert.equal(labels[6], NOISE, '无关项应为噪声')
  assert.notEqual(labels[0], labels[3], '两类根因应分属不同簇')
}

console.log('dbscan tests passed')
