// A3 DBSCAN 聚类(余弦距离)。按 docs/algorithm-a2-a3-vectorize-cluster-plan.md。
// 纯前端、离线、可测。核心点/边界点/噪声;不需预设簇数 k(对比 K-means 优势)。
// 距离 = 1 − 余弦相似。映射:密集簇 = 同根因复发 → 一条 Law;噪声 = 偶发观察。
// 接入:lawDiscovery 统计/降级层(本轮只交付纯函数,集成待后续)。
import { cosine, type Vector } from './tfidf'

export const NOISE = -1
const UNVISITED = -2

// dbscan:返回每个点的簇标签(NOISE=-1,簇 id 从 0 起)。
export function dbscan(points: Vector[], eps: number, minPts: number): number[] {
  const n = points.length
  const labels = new Array<number>(n).fill(UNVISITED)
  if (n === 0) return []

  const dist = (i: number, j: number) => 1 - cosine(points[i]!, points[j]!)
  const region = (i: number): number[] => {
    const out: number[] = []
    for (let j = 0; j < n; j++) if (dist(i, j) <= eps) out.push(j)
    return out
  }

  let cluster = -1
  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNVISITED) continue
    const neighbors = region(i) // 含自身
    if (neighbors.length < minPts) {
      labels[i] = NOISE
      continue
    }
    cluster++
    labels[i] = cluster
    // 广度扩展:把密度可达点纳入簇
    const queue = neighbors.filter((j) => j !== i)
    for (let q = 0; q < queue.length; q++) {
      const j = queue[q]!
      if (labels[j] === NOISE) labels[j] = cluster // 噪声转边界点
      if (labels[j] !== UNVISITED) continue
      labels[j] = cluster
      const jn = region(j)
      if (jn.length >= minPts) {
        for (const k of jn) if (!queue.includes(k)) queue.push(k)
      }
    }
  }
  return labels
}
