// A9 TextRank 主题词抽取。按 docs/algorithm-a8-a9-sentiment-theme-plan.md。
// 纯前端、离线、可测。词当节点,滑动窗口内共现连边(累加权重),
// 用 PageRank 变体迭代算重要度,取 top-N 词作主题词。
// 接入:lawDiscovery 降级层,无模型时用它生成 Law.theme。本轮只交付模块。

// 内置小停用词集(中文常见虚词)。
const STOPWORDS = new Set([
  '的', '了', '和', '在', '是', '也', '就', '都', '而', '及',
  '与', '这', '那', '又', '但', '或', '吧', '呢', '啊', '把',
  '被', '让', '给', '对', '从', '到', '我', '你', '他', '她',
  '它', '们', '有', '没', '不', '很', '太', '更', '会', '要',
])

const WINDOW = 4 // 滑动窗口大小(方案 2~5,取 4)
const DAMPING = 0.85 // 阻尼系数 d
const MAX_ITER = 100 // 最大迭代步
const CONVERGENCE = 1e-5 // 收敛阈值(分数变化总和小于此值即停)

// 过滤:去停用词、去空白 token。
function filterTokens(tokens: string[]): string[] {
  const out: string[] = []
  for (const t of tokens) {
    const w = (t ?? '').trim()
    if (!w) continue
    if (STOPWORDS.has(w)) continue
    out.push(w)
  }
  return out
}

// extractKeywords:TextRank 抽 top-N 主题词。空/单词输入安全返回。
export function extractKeywords(tokens: string[], topN = 5): string[] {
  const words = filterTokens(tokens)
  if (words.length === 0) return []

  // 唯一词集合(图节点)。
  const vocab = Array.from(new Set(words))
  if (vocab.length === 1) return vocab.slice()

  // 邻接表:Map<term, Map<term, weight>>,无向(双向累加)。
  const graph = new Map<string, Map<string, number>>()
  for (const v of vocab) graph.set(v, new Map())

  const addEdge = (a: string, b: string) => {
    if (a === b) return
    const ma = graph.get(a)!
    ma.set(b, (ma.get(b) ?? 0) + 1)
  }

  // 滑动窗口内两两共现连边(无向 → 两个方向都加)。
  for (let i = 0; i < words.length; i++) {
    const end = Math.min(words.length, i + WINDOW)
    for (let j = i + 1; j < end; j++) {
      addEdge(words[i], words[j])
      addEdge(words[j], words[i])
    }
  }

  // 每个节点的出边权重总和(Σ_k w_jk),预计算。
  const outSum = new Map<string, number>()
  for (const [term, nbrs] of graph) {
    let s = 0
    for (const w of nbrs.values()) s += w
    outSum.set(term, s)
  }

  // 双缓冲分数,初始均为 1。
  let scores = new Map<string, number>()
  for (const v of vocab) scores.set(v, 1)

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const next = new Map<string, number>()
    for (const vi of vocab) {
      let sum = 0
      // Σ_{j∈邻居(Vi)} (w_ji / Σ_k w_jk) · WS(Vj)
      // 图无向,vi 的邻居即指向 vi 的节点;w_ji 对称。
      for (const [vj, wji] of graph.get(vi)!) {
        const sj = outSum.get(vj)!
        if (sj > 0) sum += (wji / sj) * scores.get(vj)!
      }
      next.set(vi, 1 - DAMPING + DAMPING * sum)
    }

    // 收敛判定:分数变化绝对值总和。
    let delta = 0
    for (const vi of vocab) delta += Math.abs(next.get(vi)! - scores.get(vi)!)
    scores = next
    if (delta < CONVERGENCE) break
  }

  // 取 top-N。平分时按 vocab(首次出现)顺序稳定排序。
  const order = new Map<string, number>()
  vocab.forEach((v, idx) => order.set(v, idx))
  const ranked = vocab.slice().sort((a, b) => {
    const diff = scores.get(b)! - scores.get(a)!
    if (diff !== 0) return diff
    return order.get(a)! - order.get(b)!
  })

  return ranked.slice(0, Math.max(0, topN))
}
