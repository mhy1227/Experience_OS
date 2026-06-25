import assert from 'node:assert/strict'
import { collectTags, ruleMatchesTags, normalizeTagInput } from '../src/services/tagUtils'
import type { ExperienceRule } from '../src/types/experience'

// ---------------------------------------------------------------------------
// 用户标签纯逻辑:全库去重(按频次)、AND 筛选、输入规范化。
// ---------------------------------------------------------------------------

function rule(tags: string[]): ExperienceRule {
  return { tags } as unknown as ExperienceRule
}

// collectTags:去重 + 按频次降序(同频按字母)
{
  const rules = [rule(['高优先', '试过有效']), rule(['高优先']), rule(['想复盘']), rule([])]
  const tags = collectTags(rules)
  assert.equal(tags[0], '高优先', '最高频在前')
  assert.deepEqual(new Set(tags), new Set(['高优先', '试过有效', '想复盘']), '去重')
  assert.equal(tags.length, 3)
}

// ruleMatchesTags:AND(选中的每个都要有);空选 → 全匹配
{
  const r = rule(['高优先', '工作'])
  assert.equal(ruleMatchesTags(r, []), true, '空选 → 全匹配')
  assert.equal(ruleMatchesTags(r, ['高优先']), true)
  assert.equal(ruleMatchesTags(r, ['高优先', '工作']), true, 'AND 全含 → 命中')
  assert.equal(ruleMatchesTags(r, ['高优先', '不存在']), false, '缺一个 → 不命中')
  assert.equal(ruleMatchesTags(rule([]), ['高优先']), false, '无标签的规则不命中')
}

// normalizeTagInput:去 #、去空白
{
  assert.equal(normalizeTagInput('  #高优先 '), '高优先')
  assert.equal(normalizeTagInput('试过 有效'), '试过有效')
  assert.equal(normalizeTagInput('###'), '')
}

console.log('tagUtils tests passed')
