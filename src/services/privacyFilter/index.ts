// A6 隐私脱敏入口。移植自 mhy1227/privacy-filter(-ts),浏览器原生化。
// 在文本进模型前剥离 PII / 密钥;占位符不可逆;纯本地、无网络、无 Node API。
import { detectPII } from './pii'
import { SecretDetector } from './secrets'
import { mergeSpans } from './spans'
import type { Entity, Result } from './types'

export { mergeSpans } from './spans'
export { detectPII } from './pii'
export { SecretDetector } from './secrets'
export { shannonEntropy } from './entropy'
export type { Entity, Result, Span } from './types'

export class Filter {
  private constructor(private readonly secrets: SecretDetector) {}

  static create(): Filter {
    return new Filter(SecretDetector.create())
  }

  // stats 返回已加载规则数 + 因语法不兼容被跳过的规则数。
  stats(): { rules: number; skipped: number } {
    return { rules: this.secrets.rules.length, skipped: this.secrets.skipped }
  }

  redact(text: string): Result {
    const spans = [...detectPII(text), ...this.secrets.detect(text)]
    const merged = mergeSpans(spans)

    let out = ''
    let prev = 0
    for (const s of merged) {
      out += text.slice(prev, s.start)
      out += s.label
      prev = s.end
    }
    out += text.slice(prev)

    const entities: Entity[] = merged.map((s) => ({
      type: s.label,
      start: s.start,
      end: s.end,
      text: text.slice(s.start, s.end),
    }))

    return { redacted: out, hit: merged.length > 0, count: merged.length, entities }
  }
}

// 单例:规则集只读,创建一次复用。
let shared: Filter | null = null

// redact 便捷入口:对文本脱敏,返回结果。
export function redact(text: string): Result {
  if (!shared) shared = Filter.create()
  return shared.redact(text)
}
