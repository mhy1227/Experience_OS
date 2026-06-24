// ---------------------------------------------------------------------------
// A4 端上 embedding 语义召回(可测核心)。
// 方案见 docs/algorithm-a4-embedding-recall-plan.md。
//
// 本文件只实现「可测的召回核心」:把「如何得到向量」抽象成 Embedder 接口,
// 内部只做稠密向量余弦 + 降序 top-k。真实的向量提供方(transformers.js /
// IndexedDB 缓存 / Web Worker)留作后续适配器实现,不在此文件内实现:
//
//   - 真实 Embedder:封装 transformers.js(ONNX/WASM)懒加载小型多语
//     embedding 模型(如 bge-small-zh / MiniLM 量化版),把文本编码成定长
//     稠密向量。模型几十 MB,懒加载 + 浏览器缓存,绝不进主 bundle 关键路径。
//   - 计算放 Web Worker,不阻塞 UI。
//   - 向量缓存放 IndexedDB(key = 观察 id + 内容 hash,内容变才重算)。
//   - 降级链:模型加载失败 / 不支持 WASM → 回退 TF-IDF(A2)→ 关键词。
//
// 这些都是浏览器专属、重依赖,无法在 node 下测,因此不在本文件实现。
// 本文件纯 TS、无 DOM / fs / Buffer 依赖,可在 node 直接跑测试。
// ---------------------------------------------------------------------------

/**
 * 向量提供方抽象点。真实实现 = transformers.js 适配器(后续,见文件头注释)。
 * 测试用确定性 fake embedder 替身即可。
 */
export interface Embedder {
  embed(text: string): Promise<number[]>
}

/**
 * 稠密向量余弦相似度(本文件内自实现,不依赖其它文件)。
 * 长度不一致按较短长度对齐计算;空向量 / 零向量(模为 0)→ 0。
 */
export function cosineDense(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0
  const n = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < n; i++) {
    const x = a[i]
    const y = b[i]
    dot += x * y
    normA += x * x
    normB += y * y
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 语义召回:对 query 与每个 item 取 embedding,算余弦,降序取 topK。
 * - 空 items → [](不调用 embedder)。
 * - query 为空(去空白后)→ [] 且不调用 embedder。
 * - topK 默认 5。
 */
export async function recallByEmbedding(
  query: string,
  items: { id: string; text: string }[],
  embedder: Embedder,
  topK = 5,
): Promise<{ id: string; score: number }[]> {
  if (!query || query.trim().length === 0) return []
  if (!items || items.length === 0) return []

  const queryVec = await embedder.embed(query)
  const scored = await Promise.all(
    items.map(async (item) => {
      const itemVec = await embedder.embed(item.text)
      return { id: item.id, score: cosineDense(queryVec, itemVec) }
    }),
  )

  scored.sort((a, b) => b.score - a.score)
  const limit = topK > 0 ? topK : 0
  return scored.slice(0, limit)
}
