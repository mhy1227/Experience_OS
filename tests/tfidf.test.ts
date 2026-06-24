import assert from 'node:assert/strict'
import { buildIdf, toVector, cosine, type Vector } from '../src/services/tfidf'

// ---------------------------------------------------------------------------
// A2 TF-IDF + 余弦相似。按 docs/algorithm-a2-a3-vectorize-cluster-plan.md。
// ---------------------------------------------------------------------------

// 常见词权重低、独特词权重高(sklearn 平滑 idf,恒正)
{
  const docs = [
    ['的', '对齐', '不足'],
    ['的', '高峰', '拥挤'],
    ['的', '写作', '效率'],
  ]
  const idf = buildIdf(docs)
  assert.ok(idf.get('对齐')! > idf.get('的')!, '独特词 idf 应高于到处都有的"的"')
  assert.ok(idf.get('的')! > 0, 'idf 应恒正(平滑)')
}

// 余弦:相同=1、正交=0、空=0
{
  const a: Vector = new Map([['x', 1], ['y', 1]])
  const b: Vector = new Map([['x', 1], ['y', 1]])
  const c: Vector = new Map([['z', 1]])
  assert.ok(Math.abs(cosine(a, b) - 1) < 1e-9, '相同向量余弦=1')
  assert.equal(cosine(a, c), 0, '无共词余弦=0')
  assert.equal(cosine(a, new Map()), 0, '空向量余弦=0,不崩')
}

// toVector:tf×idf,空文档 → 空向量
{
  const docs = [['对齐', '对齐', '返工'], ['高峰', '拥挤']]
  const idf = buildIdf(docs)
  const v = toVector(['对齐', '对齐', '返工'], idf)
  assert.ok(v.get('对齐')! > 0)
  assert.equal(toVector([], idf).size, 0, '空文档 → 空向量')
}

console.log('tfidf tests passed')
