import type { ExperienceRule, Observation } from '../types/experience'

/**
 * 将规则库 + 观察记录渲染成可读 Markdown 字符串。
 * 纯函数，不依赖 DOM / store，可在 Node 测试环境直接调用。
 */

/**
 * 对 Markdown 表格单元格内容做安全转义：
 * - 竖线(|) → 全角｜，防止破坏列分隔符
 * - 换行(\r?\n 或 \r) → 空格，防止破坏表格行
 * - 反引号(`) → 全角｀，防止意外进入行内代码块
 */
function escapeCell(value: string): string {
  return value
    .replace(/\r?\n|\r/g, ' ')  // 换行 → 空格
    .replace(/\|/g, '｜')       // 竖线 → 全角
    .replace(/`/g, '｀')        // 反引号 → 全角
}
export function renderExperienceMarkdown(
  rules: ExperienceRule[],
  observations: Observation[],
): string {
  const exportedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  const obsMap = new Map(observations.map((o) => [o.id, o]))

  const lines: string[] = []

  // ── 元信息 ──────────────────────────────────────────────────────────────
  lines.push('# 我的经验资产')
  lines.push('')
  lines.push(`> 导出时间: ${exportedAt}`)
  lines.push('> **数据只在本机** — Experience OS 不上传任何数据到云端，此文件由您本地浏览器生成。')
  lines.push(`> 规则数: ${rules.length}  |  观察记录数: ${observations.length}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  if (rules.length === 0) {
    lines.push('*暂无经验规则。录入您的第一条观察后，AI 将自动提炼规则。*')
    lines.push('')
    return lines.join('\n')
  }

  // ── 规则索引 ─────────────────────────────────────────────────────────────
  lines.push('## 规则目录')
  lines.push('')
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]
    const anchor = `rule-${i + 1}`
    lines.push(`${i + 1}. [${r.title}](#${anchor})（${r.category} · ${reusabilityLabel(r.reusability)}）`)
  }
  lines.push('')
  lines.push('---')
  lines.push('')

  // ── 规则详情 ─────────────────────────────────────────────────────────────
  lines.push('## 经验规则')
  lines.push('')

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]
    lines.push(`### ${i + 1}. ${r.title} {#rule-${i + 1}}`)
    lines.push('')
    lines.push(`| 字段 | 内容 |`)
    lines.push(`|------|------|`)
    lines.push(`| 分类 | ${escapeCell(r.category)} |`)
    lines.push(`| 可复用性 | ${escapeCell(reusabilityLabel(r.reusability))} |`)
    lines.push(`| 结论 | ${escapeCell(r.conclusion)} |`)
    lines.push(`| 建议 | ${escapeCell(r.recommendation)} |`)
    if (r.conditions.length > 0) {
      lines.push(`| 适用条件 | ${escapeCell(r.conditions.join(' / '))} |`)
    }
    if (r.warnings && r.warnings.length > 0) {
      lines.push(`| 注意事项 | ${escapeCell(r.warnings.join(' / '))} |`)
    }
    lines.push('')

    // 关联观察
    const linkedObs = r.evidenceIds
      .map((id) => obsMap.get(id))
      .filter((o): o is Observation => Boolean(o))

    if (linkedObs.length > 0) {
      lines.push('**来源观察:**')
      lines.push('')
      for (const o of linkedObs) {
        const date = o.createdAt.slice(0, 10)
        lines.push(`- \`${date}\` ${o.text}`)
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  // ── 观察记录总表 ──────────────────────────────────────────────────────────
  lines.push('## 原始观察记录')
  lines.push('')
  lines.push('| 日期 | 分类 | 摘要 | 原文 |')
  lines.push('|------|------|------|------|')
  for (const o of observations) {
    const date = o.createdAt.slice(0, 10)
    const summary = escapeCell(o.summary ?? '')
    const text = escapeCell(o.text)
    lines.push(`| ${date} | ${escapeCell(o.category)} | ${summary} | ${text} |`)
  }
  lines.push('')

  return lines.join('\n')
}

function reusabilityLabel(value: string): string {
  switch (value) {
    case 'high': return '高复用'
    case 'medium': return '中复用'
    case 'low': return '低复用'
    case 'watch': return '待观察'
    default: return value
  }
}
