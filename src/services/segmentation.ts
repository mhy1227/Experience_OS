// A1 中文分词(HMM + Viterbi)。按 docs/algorithm-a1-segmentation-plan.md。
// 纯前端、离线、可测。字位标注 {B,M,E,S} + Viterbi 动态规划求最优状态序列。
// 概率表由内置小语料训练(plan 的 option B/C:计数 + 拉普拉斯平滑 + 对数);
// 未登录字走平滑发射概率;HMM 异常/空表时入口降级到词典最大匹配,再不行按字。
//
// 说明:内置语料为 demo 级(覆盖常见 + 领域词);生产可换内置 jieba 全量发射表(留后续)。

export type SegState = 'B' | 'M' | 'E' | 'S'
const STATES: SegState[] = ['B', 'M', 'E', 'S']
const NEG = -1e10 // 非法转移/不可能起始的对数概率(避免 -Infinity 引发 NaN)

export interface SegProbs {
  piLog: Record<SegState, number>
  transLog: Record<SegState, Record<SegState, number>>
  emitLog: Record<SegState, Record<string, number>>
  emitDefault: Record<SegState, number> // 未登录字在该状态的兜底对数发射概率
}

// 合法转移掩码(其余置 NEG):B→M/E,M→M/E,E→B/S,S→B/S。
const LEGAL: Record<SegState, SegState[]> = {
  B: ['M', 'E'],
  M: ['M', 'E'],
  E: ['B', 'S'],
  S: ['B', 'S'],
}

// 给一个词的每个字打 B/M/E/S 标签。
function tagWord(word: string): SegState[] {
  const n = word.length
  if (n <= 0) return []
  if (n === 1) return ['S']
  const tags: SegState[] = ['B']
  for (let i = 1; i < n - 1; i++) tags.push('M')
  tags.push('E')
  return tags
}

// trainHMM:在已分词语料(每句为词数组)上计数 + 拉普拉斯平滑 → 对数概率表。
export function trainHMM(corpus: string[][]): SegProbs {
  const piCount: Record<SegState, number> = { B: 0, M: 0, E: 0, S: 0 }
  const transCount: Record<SegState, Record<SegState, number>> = {
    B: { B: 0, M: 0, E: 0, S: 0 }, M: { B: 0, M: 0, E: 0, S: 0 },
    E: { B: 0, M: 0, E: 0, S: 0 }, S: { B: 0, M: 0, E: 0, S: 0 },
  }
  const emitCount: Record<SegState, Record<string, number>> = { B: {}, M: {}, E: {}, S: {} }
  const stateTotal: Record<SegState, number> = { B: 0, M: 0, E: 0, S: 0 }
  const vocab = new Set<string>()
  let sentences = 0

  for (const words of corpus) {
    const chars: string[] = []
    const tags: SegState[] = []
    for (const w of words) {
      const t = tagWord(w)
      for (let i = 0; i < w.length; i++) {
        chars.push(w[i]!)
        tags.push(t[i]!)
      }
    }
    if (chars.length === 0) continue
    sentences++
    piCount[tags[0]!]++
    for (let i = 0; i < chars.length; i++) {
      const s = tags[i]!
      const c = chars[i]!
      emitCount[s][c] = (emitCount[s][c] ?? 0) + 1
      stateTotal[s]++
      vocab.add(c)
      if (i > 0) transCount[tags[i - 1]!][s]++
    }
  }

  const V = Math.max(vocab.size, 1)
  const piLog = {} as Record<SegState, number>
  const transLog = {} as Record<SegState, Record<SegState, number>>
  const emitLog = {} as Record<SegState, Record<string, number>>
  const emitDefault = {} as Record<SegState, number>

  for (const s of STATES) {
    // 起始:只允许 B / S(句首不可能是 M/E)
    if (s === 'M' || s === 'E') piLog[s] = NEG
    else piLog[s] = Math.log((piCount[s] + 1) / (sentences + 2))

    // 转移:合法的按计数平滑,非法置 NEG
    const row = {} as Record<SegState, number>
    const legalSet = new Set(LEGAL[s])
    let rowTotal = 0
    for (const t of STATES) if (legalSet.has(t)) rowTotal += transCount[s][t]
    for (const t of STATES) {
      if (!legalSet.has(t)) row[t] = NEG
      else row[t] = Math.log((transCount[s][t] + 1) / (rowTotal + legalSet.size))
    }
    transLog[s] = row

    // 发射:平滑;未登录字走 emitDefault
    const e: Record<string, number> = {}
    for (const c of Object.keys(emitCount[s])) {
      e[c] = Math.log((emitCount[s][c]! + 1) / (stateTotal[s] + V))
    }
    emitLog[s] = e
    emitDefault[s] = Math.log(1 / (stateTotal[s] + V))
  }

  return { piLog, transLog, emitLog, emitDefault }
}

function emitOf(probs: SegProbs, s: SegState, ch: string): number {
  const v = probs.emitLog[s][ch]
  return v === undefined ? probs.emitDefault[s] : v
}

// segmentByHMM:对一段连续中文做 Viterbi 切词。O(T·S²),S=4。
export function segmentByHMM(text: string, probs: SegProbs): string[] {
  const n = text.length
  if (n === 0) return []
  if (n === 1) return [text]

  // dp[t][s] 最大对数概率;back[t][s] 回溯指针
  const dp: number[][] = Array.from({ length: n }, () => new Array<number>(4).fill(NEG))
  const back: number[][] = Array.from({ length: n }, () => new Array<number>(4).fill(0))

  for (let si = 0; si < 4; si++) dp[0]![si] = probs.piLog[STATES[si]!] + emitOf(probs, STATES[si]!, text[0]!)

  for (let t = 1; t < n; t++) {
    const ch = text[t]!
    for (let si = 0; si < 4; si++) {
      const s = STATES[si]!
      let best = NEG
      let bestP = 0
      for (let pi = 0; pi < 4; pi++) {
        const cand = dp[t - 1]![pi]! + probs.transLog[STATES[pi]!][s]
        if (cand > best) {
          best = cand
          bestP = pi
        }
      }
      dp[t]![si] = best + emitOf(probs, s, ch)
      back[t]![si] = bestP
    }
  }

  // 终止:取最后一字概率最大者(合理收尾应为 E 或 S,但不强制)
  let last = 0
  for (let si = 1; si < 4; si++) if (dp[n - 1]![si]! > dp[n - 1]![last]!) last = si

  // 回溯状态序列
  const tags = new Array<SegState>(n)
  let cur = last
  for (let t = n - 1; t >= 0; t--) {
    tags[t] = STATES[cur]!
    cur = back[t]![cur]!
  }

  // 按 B/M/E/S 切词
  const out: string[] = []
  let buf = ''
  for (let t = 0; t < n; t++) {
    buf += text[t]
    if (tags[t] === 'E' || tags[t] === 'S') {
      out.push(buf)
      buf = ''
    }
  }
  if (buf) out.push(buf) // 防御:未正常收尾的残余
  return out
}

// segmentByDict:双向最大匹配(以正向为准,简洁兜底)。
export function segmentByDict(text: string, dict: Set<string>, maxLen = 6): string[] {
  const out: string[] = []
  let i = 0
  const n = text.length
  while (i < n) {
    let matched = ''
    const upper = Math.min(maxLen, n - i)
    for (let len = upper; len >= 2; len--) {
      const cand = text.slice(i, i + len)
      if (dict.has(cand)) {
        matched = cand
        break
      }
    }
    if (matched) {
      out.push(matched)
      i += matched.length
    } else {
      out.push(text[i]!)
      i++
    }
  }
  return out
}

function isCJK(code: number): boolean {
  return code >= 0x4e00 && code <= 0x9fff
}
function isAsciiAlnum(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) // a-z
  )
}

// 内置小语料(已分词,'/' 分隔)。覆盖常见词 + 领域词 + 歧义测试词。
const BUILTIN_CORPUS_RAW = [
  '周末/十点/健身房/人少/不用/排队',
  '工作日/早高峰/避开/八点/出门',
  '研究/生命/的/起源',
  '会议/之前/准备/材料',
  '下雨/天/走/地铁/更/快',
  '超市/晚上/结账/排队/更/短',
  '写作/在/早上/效率/高',
  '项目/启动/要/对齐/交付/物',
  '需求/评审/要/记/结论',
  '上游/排期/没/确认/会/延期',
  '健身/在/低峰/时段/人少',
  '午后/小睡/恢复/精力',
  '宠物/用品/网上/更/便宜',
  '周末/逛/超市/人/太多',
  '早上/十点/去/健身房/锻炼',
  '地铁/在/晚高峰/很/挤',
  '提前/准备/能/减少/返工',
  '记录/经验/帮助/决策',
  '高峰/时段/人/特别/多',
  '团队/对齐/目标/很/重要',
  '雨天/路线/选/地铁/比较/稳',
  '生命/科学/研究/进展',
  '起源/问题/值得/深入/研究',
  '健身房/器械/不用/排队',
  '十点/以后/人/明显/变少',
]

function parseCorpus(raw: string[]): string[][] {
  return raw.map((line) => line.split('/').filter(Boolean))
}

export const BUILTIN_CORPUS: string[][] = parseCorpus(BUILTIN_CORPUS_RAW)

// 内置词典(兜底用):语料里所有多字词。
export const BUILTIN_DICT: Set<string> = new Set(
  BUILTIN_CORPUS.flat().filter((w) => w.length >= 2),
)

// 默认概率表(模块加载时训练一次)。
const DEFAULT_PROBS: SegProbs = trainHMM(BUILTIN_CORPUS)

// segment:入口。预处理(英文/数字整体、标点/空白作分隔),中文段走 HMM,
// 异常 → 词典最大匹配 → 再不行按字。空串/纯标点 → []。
export function segment(text: string, probs: SegProbs = DEFAULT_PROBS): string[] {
  const out: string[] = []
  let i = 0
  const n = text.length
  while (i < n) {
    const code = text.charCodeAt(i)
    if (isCJK(code)) {
      let j = i
      while (j < n && isCJK(text.charCodeAt(j))) j++
      const run = text.slice(i, j)
      try {
        const seg = segmentByHMM(run, probs)
        out.push(...(seg.length ? seg : segmentByDict(run, BUILTIN_DICT)))
      } catch {
        out.push(...segmentByDict(run, BUILTIN_DICT))
      }
      i = j
    } else if (isAsciiAlnum(code)) {
      let j = i
      while (j < n && isAsciiAlnum(text.charCodeAt(j))) j++
      out.push(text.slice(i, j))
      i = j
    } else {
      // 标点 / 空白 / 其它 → 分隔符,丢弃
      i++
    }
  }
  return out
}
