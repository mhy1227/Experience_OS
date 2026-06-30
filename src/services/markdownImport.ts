// Markdown 导入:把 .md/.txt 内容解析成"候选经验文本"。
// 原则:解析内容不解析字段;纯本地、0 token;marked 懒加载(仅导入时使用)。
// 解析出的 string[] 交给 store.importObservations 走现有提炼/落库管线。

export interface MarkdownParseOptions {
  /** 候选条数上限,默认 50(每条 = 1 次模型调用,防大文件爆量) */
  maxItems?: number
  /** 标题作为后续条目的上下文前缀,默认 false */
  headingAsContext?: boolean
}

export interface MarkdownParseResult {
  observations: string[]
  /** 是否因 maxItems 被截断 */
  truncated: boolean
  /** 截断前(去重、过滤后)的总条数 */
  totalParsed: number
}

const DEFAULT_MAX_ITEMS = 200
const MIN_LEN = 4

/** 剥除文件开头的 YAML front-matter(marked 不会把它当 front-matter) */
function stripFrontMatter(md: string): string {
  return md.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

/** 清洗:去行内标记/链接、压平换行、trim */
function clean(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [文字](url) / ![alt](url) → 文字
    .replace(/[*_`~]/g, '') // 强调/行内代码标记
    .replace(/^#+\s*/gm, '') // 行首 # 标题标记
    .replace(/^>\s?/gm, '') // 行首引用标记
    .replace(/\s+/g, ' ')
    .trim()
}

/** 表格行取最长单元格(最像"内容"的那个) */
function longestCell(row: Array<{ text?: string }>): string {
  return row
    .map((c) => (c && typeof c.text === 'string' ? c.text : ''))
    .reduce((a, b) => (b.length > a.length ? b : a), '')
}

export async function parseMarkdownToObservations(
  md: string,
  options: MarkdownParseOptions = {},
): Promise<MarkdownParseResult> {
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS
  const headingAsContext = options.headingAsContext ?? false

  // 懒加载 marked(仅导入时拉入,不进主 bundle)
  const mod = (await import('marked')) as unknown as Record<string, unknown>
  const marked = (mod.marked ?? mod.default ?? mod) as { lexer: (src: string) => unknown[] }
  const tokens = marked.lexer(stripFrontMatter(md)) as Array<Record<string, unknown>>

  const emitted: string[] = []
  let heading = ''

  const emit = (raw: string) => {
    let text = clean(raw)
    if (!text) return
    if (headingAsContext && heading) text = `${heading} — ${text}`
    if (text.length < MIN_LEN) return
    emitted.push(text)
  }

  for (const t of tokens) {
    switch (t.type) {
      case 'heading':
        heading = clean(typeof t.text === 'string' ? t.text : '')
        break
      case 'paragraph':
      case 'blockquote':
        emit(typeof t.text === 'string' ? t.text : '')
        break
      case 'list':
        for (const item of (t.items as Array<{ text?: string }>) ?? []) {
          emit(item?.text ?? '')
        }
        break
      case 'table':
        for (const row of (t.rows as Array<Array<{ text?: string }>>) ?? []) {
          emit(longestCell(row ?? []))
        }
        break
      default:
        break // code / space / hr / html 等:跳过
    }
  }

  const deduped = Array.from(new Set(emitted))
  return {
    observations: deduped.slice(0, maxItems),
    truncated: deduped.length > maxItems,
    totalParsed: deduped.length,
  }
}
