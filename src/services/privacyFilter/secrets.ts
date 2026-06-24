// 密钥 / 凭证检测。移植自 mhy1227/privacy-filter-ts 的 secrets.ts。
// 浏览器原生化:去掉 gitleaks-TOML/fs 路径(只保留 builtin 规则 + 上下文口令 + 高熵兜底),
// Buffer 换 TextEncoder。222 条 gitleaks 规则留作后续(见 a6 设计文档「后续」)。
import { compile, compileTest, findAllIndex, findAllSubmatch, test, type RE2 } from './regex'
import { shannonEntropy } from './entropy'
import type { Span } from './types'

const entropyMin = 4.0 // 高熵兜底默认阈值
const entropyMinStrict = 4.8 // 周围无密钥语义关键词时启用,进一步压低误报
const contextLookback = 30 // hasSecretContext 往前回溯的码元数

// 上下文型口令:藏在句子里的密码/token。
const reContextSecret = compile(
  String.raw`(?i)(密码|口令|密钥|password|passwd|pwd|secret|token|api[_\s-]?key)\s*(?:是|为|:|：|=)\s*['"]?([^\s'"，。；;]{4,})`,
  { indices: true },
)

// 高熵兜底:抓不匹配任何已知格式的随机串。
const reEntropyToken = compile(String.raw`[A-Za-z0-9+/=_\-]{20,}`)

// 密钥语义关键词。
const reSecretContext = compile(
  String.raw`(?i)(?:password|passwd|pwd|secret|token|api[_\s-]?key|access[_\s-]?key|bearer|authorization|credential|jwt|密码|口令|密钥|凭证|令牌|鉴权)`,
)

const pathBoundaryChars = String.raw`/\:.@?=`
const pathInternalChars = String.raw`/\:`

const urlPrefixes = [
  'http://', 'https://', 'ftp://', 'ssh://',
  's3://', 'gs://', 'oss://',
  'git@', 'sha256:', 'sha1:', 'md5:',
]

const assignmentChars = " \t\r\n=:'\""

const reTemplateVar = compileTest(
  String.raw`^(?:\{\{[^{}]+\}\}|\$\{[^{}]+\}|%\{[^{}]+\}|<[^<>]+>)$`,
)
const reUUID = compileTest(
  String.raw`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`,
)
const reHexOnly = compileTest(String.raw`^[0-9a-fA-F]+$`)

const benignIDSuffixes = ['_id', '_uuid', '_uid', '_oid', '_no', '_seq']

const reAuthHeaderPrefix = compileTest(
  String.raw`(?i)\bauthorization\s*:\s*(?:basic|bearer|digest|ntlm|hmac|token)\s+$`,
)

const reHostPortPrefix = compileTest(String.raw`^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z0-9-]+:`)

function looksLikeURLMatch(s: string): boolean {
  if (s.includes('://')) return true
  return test(reHostPortPrefix, s)
}

const commonPlaceholders = [
  'REPLACE_ME', 'REPLACE_THIS', 'REPLACE_WITH',
  'YOUR_KEY', 'YOUR_TOKEN', 'YOUR_SECRET', 'YOUR_API_KEY', 'YOUR_PASSWORD',
  'INSERT_HERE', 'INSERT_KEY', 'INSERT_TOKEN',
  'PLACEHOLDER', 'EXAMPLE_KEY', 'EXAMPLE_TOKEN',
  'TODO', 'FIXME', 'XXXX',
]

function isLikelyPlaceholder(s: string): boolean {
  const upper = s.toUpperCase()
  return commonPlaceholders.some((p) => upper.includes(p))
}

function hasJSONNoise(s: string): boolean {
  return s.includes(',')
}

interface SecretRule {
  id: string
  re: RE2
  keywords: string[] // 已小写;空表示该规则总是参与
  entropy: number
  secretGroup: number
}

const utf8 = new TextEncoder()
function byteLen(s: string): number {
  return utf8.encode(s).length
}

export class SecretDetector {
  readonly rules: SecretRule[] = []
  skipped = 0 // 因正则语法不兼容被跳过的规则数

  // create:浏览器版只用内置兜底规则(无 gitleaks TOML)。
  static create(): SecretDetector {
    const sd = new SecretDetector()
    sd.loadBuiltin()
    return sd
  }

  private loadBuiltin(): void {
    const builtin: Array<{ id: string; pat: string; kws: string[] }> = [
      { id: 'openai-key', pat: String.raw`sk-(?:proj-)?[A-Za-z0-9_-]{20,}`, kws: ['sk-'] },
      { id: 'aws-access-key', pat: String.raw`AKIA[0-9A-Z]{16}`, kws: ['akia'] },
      { id: 'github-token', pat: String.raw`gh[pousr]_[A-Za-z0-9]{36,}`, kws: ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'] },
      { id: 'google-api-key', pat: String.raw`AIza[0-9A-Za-z_-]{35}`, kws: ['aiza'] },
      { id: 'slack-token', pat: String.raw`xox[baprs]-[0-9A-Za-z-]{10,}`, kws: ['xox'] },
      { id: 'jwt', pat: String.raw`eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}`, kws: ['eyj'] },
      { id: 'private-key', pat: String.raw`-----BEGIN[A-Z ]*PRIVATE KEY-----`, kws: ['private key'] },
    ]
    for (const b of builtin) {
      try {
        this.rules.push({ id: b.id, re: compile(b.pat, { indices: true }), keywords: b.kws, entropy: 0, secretGroup: 0 })
      } catch {
        this.skipped++
      }
    }
  }

  // detect 返回密钥/凭证的命中区间。
  detect(text: string): Span[] {
    const spans: Span[] = []
    const low = text.toLowerCase()

    // Route 1 — 规则:关键词预筛 → 跑正则
    for (const r of this.rules) {
      if (!ruleApplies(r, low)) continue
      for (const m of findAllSubmatch(r.re, text)) {
        const whole = m[0]!
        let s = whole[0]
        let e = whole[1]
        const g = r.secretGroup
        if (g > 0 && m[g]) {
          s = m[g]![0]
          e = m[g]![1]
        }
        if (s < 0 || s >= e) continue
        if (r.entropy > 0 && shannonEntropy(text.slice(s, e)) < r.entropy) continue
        const cand = text.slice(s, e)
        if (
          looksLikeURLMatch(cand) ||
          isTemplateVar(cand) || isHexHash(cand) || isUUID(cand) ||
          isBusinessIDAssignment(cand) ||
          isLikelyPlaceholder(cand) || hasJSONNoise(cand)
        ) {
          continue
        }
        spans.push({ start: s, end: e, label: '[密钥]' })
      }
    }

    // Route 2 — 上下文口令:只脱掉 value(第 2 个分组)
    for (const m of findAllSubmatch(reContextSecret, text)) {
      const v = m[2]
      if (!v) continue
      const value = text.slice(v[0], v[1])
      if (isTemplateVar(value)) continue
      if (byteLen(value) <= 16 && shannonEntropy(value) < 3.0) continue
      spans.push({ start: v[0], end: v[1], label: '[密钥]' })
    }

    // Route 3 — 高熵兜底
    for (const [s, e] of findAllIndex(reEntropyToken, text)) {
      const cand = text.slice(s, e)
      const strong = hasStrongSecretContext(text, s, e)
      if (!strong && isOnPathOrURLBoundary(text, s, e)) continue
      if (isTemplateVar(cand) || isHexHash(cand) || isUUID(cand) || isBusinessIDAssignment(cand)) continue
      let threshold = entropyMin
      if (!hasSecretContext(text, s, e)) threshold = entropyMinStrict
      if (shannonEntropy(cand) >= threshold) spans.push({ start: s, end: e, label: '[密钥]' })
    }

    return spans
  }
}

function isOnPathOrURLBoundary(text: string, start: number, end: number): boolean {
  if (containsAny(text.slice(start, end), pathInternalChars)) return true
  if (start > 0 && pathBoundaryChars.includes(text[start - 1]!)) return true
  if (end < text.length && pathBoundaryChars.includes(text[end]!)) return true
  const lo = Math.max(0, start - 8)
  const look = text.slice(lo, start)
  return urlPrefixes.some((p) => look.includes(p))
}

function hasSecretContext(text: string, start: number, end: number): boolean {
  const lo = Math.max(0, start - contextLookback)
  return test(reSecretContext, text.slice(lo, end))
}

function hasStrongSecretContext(text: string, start: number, end: number): boolean {
  const lo = Math.max(0, start - contextLookback)
  if (test(reAuthHeaderPrefix, text.slice(lo, start))) return true
  const region = text.slice(lo, end)
  const locs = findAllIndex(reSecretContext, region)
  if (locs.length === 0) return false
  const last = locs[locs.length - 1]!
  const candStartInRegion = start - lo
  if (last[0] >= candStartInRegion) return true
  const between = region.slice(last[1], candStartInRegion)
  for (const ch of between) {
    if (!assignmentChars.includes(ch)) return false
  }
  return true
}

function isTemplateVar(s: string): boolean {
  return test(reTemplateVar, s)
}

function isHexHash(s: string): boolean {
  const n = s.length
  return (n === 32 || n === 40 || n === 64) && test(reHexOnly, s)
}

function isUUID(s: string): boolean {
  return test(reUUID, s)
}

function isBusinessIDAssignment(s: string): boolean {
  const eq = s.indexOf('=')
  if (eq <= 0) return false
  const name = s.slice(0, eq).toLowerCase()
  for (const k of ['key', 'secret', 'token', 'auth', 'password', 'credential']) {
    if (name.includes(k)) return false
  }
  return benignIDSuffixes.some((suf) => name.endsWith(suf))
}

function ruleApplies(r: SecretRule, lowText: string): boolean {
  if (r.keywords.length === 0) return true
  return r.keywords.some((kw) => lowText.includes(kw))
}

function containsAny(s: string, chars: string): boolean {
  for (const c of s) {
    if (chars.includes(c)) return true
  }
  return false
}
