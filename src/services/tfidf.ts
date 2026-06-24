// A2 TF-IDF 向量化 + 余弦相似。按 docs/algorithm-a2-a3-vectorize-cluster-plan.md。
// 纯前端、离线、可测。稀疏向量 Map<term, weight>;idf 用 sklearn 平滑式(恒正)。
// 上游 term 来自 A1 分词(segment());下游喂 A3 DBSCAN 聚类。

export type Vector = Map<string, number>

// buildIdf:基于全部文档(已分词)算逆文档频率。
// idf = log((1+N)/(1+df)) + 1 —— 平滑、恒正(避免普遍词出现负权)。
export function buildIdf(docs: string[][]): Map<string, number> {
  const N = docs.length
  const df = new Map<string, number>()
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const idf = new Map<string, number>()
  for (const [term, d] of df) idf.set(term, Math.log((1 + N) / (1 + d)) + 1)
  return idf
}

// toVector:tokens → tf×idf 稀疏向量。tf = 词频/总词数。idf 表里没有的 term 跳过。
export function toVector(tokens: string[], idf: Map<string, number>): Vector {
  const total = tokens.length
  if (total === 0) return new Map()
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  const v: Vector = new Map()
  for (const [term, count] of tf) {
    const w = idf.get(term)
    if (w === undefined) continue
    v.set(term, (count / total) * w)
  }
  return v
}

// cosine:两稀疏向量余弦相似(0~1,非负权下)。空向量 → 0。
export function cosine(a: Vector, b: Vector): number {
  if (a.size === 0 || b.size === 0) return 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let dot = 0
  for (const [t, w] of small) {
    const o = large.get(t)
    if (o !== undefined) dot += w * o
  }
  if (dot === 0) return 0
  let na = 0
  for (const w of a.values()) na += w * w
  let nb = 0
  for (const w of b.values()) nb += w * w
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
