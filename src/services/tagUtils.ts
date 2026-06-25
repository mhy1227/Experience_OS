// 用户标签纯逻辑(可测、无副作用)。供 RuleCard 编辑 / RuleLibrary 筛选 / 自动补全复用。
import type { ExperienceRule } from '../types/experience'

// collectTags:全库标签去重,按出现频次降序(同频按字母),用于筛选项与自动补全建议。
export function collectTags(rules: ExperienceRule[]): string[] {
  const freq = new Map<string, number>()
  for (const r of rules) {
    for (const t of r.tags ?? []) freq.set(t, (freq.get(t) ?? 0) + 1)
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t)
}

// ruleMatchesTags:AND 语义 —— 规则需包含选中的每一个标签;空选 → 全匹配。
export function ruleMatchesTags(rule: ExperienceRule, selected: string[]): boolean {
  if (selected.length === 0) return true
  const tags = new Set(rule.tags ?? [])
  return selected.every((t) => tags.has(t))
}

// normalizeTagInput:去掉前导 #、去除空白(标签不含空格)。
export function normalizeTagInput(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, '')
}
