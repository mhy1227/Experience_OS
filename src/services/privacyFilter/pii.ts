// 结构化 PII 检测。移植自 mhy1227/privacy-filter-ts 的 pii.ts(正则本就原生 RegExp 兼容)。
// 数字边界用 digitBounded / ipBounded 手工校验(沿用参考实现,RE2 无断言而手写,原生也照用)。
import { compile, findAllIndex } from './regex'
import type { Span } from './types'

const reEmail = compile(`[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}`)
const rePhoneCN = compile(`(?:\\+?86[-\\s]?)?1[3-9][0-9]{9}`)
const reIDCard = compile(`[1-9][0-9]{16}[0-9Xx]`)
const reBankCard = compile(`[0-9]{13,19}`)
const reIPv4 = compile(
  `(?:(?:25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])`,
)

// 远程命令前缀。user@host 出现在这些命令上下文里通常是 SSH 目标,不是邮箱。
const sshCommands = ['ssh ', 'scp ', 'rsync ', 'sftp ', 'ssh-copy-id ', 'ssh-keygen ']

function isInSSHCommandContext(text: string, emailStart: number): boolean {
  const lineStart = text.lastIndexOf('\n', emailStart - 1) + 1
  const line = text.slice(lineStart, emailStart)
  return sshCommands.some((cmd) => line.includes(cmd))
}

function isDigitCode(code: number): boolean {
  return code >= 48 /* '0' */ && code <= 57 /* '9' */
}

// digitBounded 校验匹配两侧不是数字(替代 RE2 没有的前后向断言)。
function digitBounded(text: string, start: number, end: number): boolean {
  if (start > 0 && isDigitCode(text.charCodeAt(start - 1))) return false
  if (end < text.length && isDigitCode(text.charCodeAt(end))) return false
  return true
}

// ipBounded 校验匹配两侧不是数字或点。
function ipBounded(text: string, start: number, end: number): boolean {
  if (start > 0) {
    const c = text.charCodeAt(start - 1)
    if (isDigitCode(c) || c === 46 /* '.' */) return false
  }
  if (end < text.length) {
    const c = text.charCodeAt(end)
    if (isDigitCode(c) || c === 46) return false
  }
  return true
}

// luhnValid 做 Luhn 校验,过滤掉"长得像卡号的普通数字串"。
function luhnValid(num: string): boolean {
  let sum = 0
  let double = false
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

// detectPII 返回结构化 PII 的命中区间。
export function detectPII(text: string): Span[] {
  const spans: Span[] = []

  for (const [s, e] of findAllIndex(reEmail, text)) {
    // SSH-style URL: user@host:path —— 邮箱后紧接 ":" + 非空白字符 → 视作 git@ URL,不脱
    if (
      e < text.length &&
      text[e] === ':' &&
      e + 1 < text.length &&
      text[e + 1] !== ' ' &&
      text[e + 1] !== '\t'
    ) {
      continue
    }
    // SSH 命令上下文:ssh / scp / rsync user@host 这种调用,host 不是邮箱
    if (isInSSHCommandContext(text, s)) continue
    spans.push({ start: s, end: e, label: '[邮箱]' })
  }
  for (const [s, e] of findAllIndex(rePhoneCN, text)) {
    if (digitBounded(text, s, e)) spans.push({ start: s, end: e, label: '[电话]' })
  }
  for (const [s, e] of findAllIndex(reIDCard, text)) {
    if (digitBounded(text, s, e)) spans.push({ start: s, end: e, label: '[身份证]' })
  }
  for (const [s, e] of findAllIndex(reIPv4, text)) {
    if (ipBounded(text, s, e)) spans.push({ start: s, end: e, label: '[IP]' })
  }
  for (const [s, e] of findAllIndex(reBankCard, text)) {
    if (digitBounded(text, s, e) && luhnValid(text.slice(s, e))) {
      spans.push({ start: s, end: e, label: '[银行卡]' })
    }
  }
  return spans
}
