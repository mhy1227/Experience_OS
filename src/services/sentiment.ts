// A8 朴素贝叶斯情绪分类。按 docs/algorithm-a8-a9-sentiment-theme-plan.md。
// 纯前端、离线、可测。P(类|词) ∝ P(类)·Π P(词|类),取对数防下溢,拉普拉斯平滑。
// 否定处理:没/不/别/未/无 后续词加 NOT_ 前缀作独立特征。
// 接入:可作 inferDirection 的本地升级(无模型时),失败回退关键词表(降级链)。本轮只交付模块。
import { segment } from './segmentation'

export type Sentiment = 'positive' | 'negative' | 'neutral'
const CLASSES: Sentiment[] = ['neutral', 'positive', 'negative'] // 顺序即平局优先级(平 → neutral)

export interface NBModel {
  classLogPrior: Record<Sentiment, number>
  wordLog: Record<Sentiment, Record<string, number>>
  classDefault: Record<Sentiment, number> // 未登录词在该类的兜底对数概率
}

export interface LabeledSample {
  tokens: string[]
  label: Sentiment
}

const NEGATION = new Set(['没', '不', '别', '未', '无', '莫', '没有', '不要'])

// applyNegation:否定词后续一个词加 NOT_ 前缀(否定词本身丢弃)。
export function applyNegation(tokens: string[]): string[] {
  const out: string[] = []
  let negate = false
  for (const t of tokens) {
    if (NEGATION.has(t)) {
      negate = true
      continue
    }
    out.push(negate ? `NOT_${t}` : t)
    negate = false
  }
  return out
}

// trainNB:在带标注样本上计数 + 拉普拉斯平滑 → 对数概率模型。
export function trainNB(samples: LabeledSample[]): NBModel {
  const classCount: Record<Sentiment, number> = { positive: 0, negative: 0, neutral: 0 }
  const wordCount: Record<Sentiment, Record<string, number>> = { positive: {}, negative: {}, neutral: {} }
  const classWordTotal: Record<Sentiment, number> = { positive: 0, negative: 0, neutral: 0 }
  const vocab = new Set<string>()

  for (const { tokens, label } of samples) {
    classCount[label]++
    for (const w of applyNegation(tokens)) {
      wordCount[label][w] = (wordCount[label][w] ?? 0) + 1
      classWordTotal[label]++
      vocab.add(w)
    }
  }

  const totalDocs = samples.length
  const V = Math.max(vocab.size, 1)
  const classLogPrior = {} as Record<Sentiment, number>
  const wordLog = {} as Record<Sentiment, Record<string, number>>
  const classDefault = {} as Record<Sentiment, number>

  for (const c of CLASSES) {
    classLogPrior[c] = Math.log((classCount[c] + 1) / (totalDocs + CLASSES.length))
    const wl: Record<string, number> = {}
    for (const [w, n] of Object.entries(wordCount[c])) {
      wl[w] = Math.log((n + 1) / (classWordTotal[c] + V))
    }
    wordLog[c] = wl
    classDefault[c] = Math.log(1 / (classWordTotal[c] + V))
  }

  return { classLogPrior, wordLog, classDefault }
}

// classify:对一组词分类。先否定处理,再 argmax(平局按 CLASSES 顺序 → neutral)。
export function classify(tokens: string[], model: NBModel = DEFAULT_MODEL): Sentiment {
  const feats = applyNegation(tokens)
  let best: Sentiment = 'neutral'
  let bestScore = -Infinity
  for (const c of CLASSES) {
    let score = model.classLogPrior[c]
    for (const w of feats) {
      const wl = model.wordLog[c][w]
      score += wl === undefined ? model.classDefault[c] : wl
    }
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

// classifyText:入口,内部用 A1 分词后分类。
export function classifyText(text: string, model: NBModel = DEFAULT_MODEL): Sentiment {
  return classify(segment(text), model)
}

// 内置标注语料(已分词)。情绪词覆盖常见 + 领域。
const BUILTIN_SAMPLES: LabeledSample[] = [
  { tokens: ['人少', '不用', '排队'], label: 'positive' },
  { tokens: ['很', '顺利'], label: 'positive' },
  { tokens: ['效率', '高'], label: 'positive' },
  { tokens: ['省时', '省力'], label: 'positive' },
  { tokens: ['提前', '准备', '顺利'], label: 'positive' },
  { tokens: ['避开', '高峰', '轻松'], label: 'positive' },
  { tokens: ['这次', '搞定', '很', '快'], label: 'positive' },
  { tokens: ['沟通', '充分', '没', '返工'], label: 'positive' },
  { tokens: ['又', '踩坑'], label: 'negative' },
  { tokens: ['导致', '返工'], label: 'negative' },
  { tokens: ['排期', '延期'], label: 'negative' },
  { tokens: ['人', '太多', '很', '挤'], label: 'negative' },
  { tokens: ['失败', '了'], label: 'negative' },
  { tokens: ['沟通', '不畅', '导致', '返工'], label: 'negative' },
  { tokens: ['排队', '太', '久', '体验', '差'], label: 'negative' },
  { tokens: ['目标', '不', '清晰', '反复', '改'], label: 'negative' },
  { tokens: ['记录', '一下'], label: 'neutral' },
  { tokens: ['今天', '开会'], label: 'neutral' },
  { tokens: ['整理', '材料'], label: 'neutral' },
  { tokens: ['正常', '进行'], label: 'neutral' },
  { tokens: ['例行', '复盘'], label: 'neutral' },
  { tokens: ['更新', '文档'], label: 'neutral' },
]

// 默认模型(模块加载时训练一次)。
export const DEFAULT_MODEL: NBModel = trainNB(BUILTIN_SAMPLES)
