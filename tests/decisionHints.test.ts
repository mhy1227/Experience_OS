import assert from 'node:assert/strict'
import { recallDecisionHints } from '../src/services/decisionHints'
import type { ExperienceRule, Observation } from '../src/types/experience'

const baseRule: ExperienceRule = {
  id: 'rule_1',
  title: '周末低峰训练策略',
  category: '运动',
  conclusion: '周末上午10点健身房人少器械空闲',
  recommendation: '把高强度训练排到周末上午',
  conditions: ['周末', '上午10点'],
  warnings: [],
  evidenceIds: ['obs_1'],
  reusability: 'high',
  feedback: 'none',
  reviewStatus: 'validated',
  evaluations: [],
  evaluationVerdict: 'supported',
  revisionSuggestion: '',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const obs: Observation = {
  id: 'obs_1',
  text: '周末10点健身房人少，器械不用排队',
  category: '运动',
  tags: ['健身', '周末'],
  summary: '周末低峰',
  status: 'success',
  createdAt: '2026-01-01T00:00:00.000Z',
}

async function testReturnsHintOnHighRelevance() {
  const hints = recallDecisionHints('周末上午去健身房', [baseRule], [obs])
  assert.ok(hints.length > 0, '相关规则应命中')
  assert.equal(hints[0].ruleId, 'rule_1')
  assert.ok(hints[0].score >= 3, '分数应达到默认阈值')
  assert.ok(hints[0].matchReasons.length > 0, '应有匹配理由')
}

async function testReturnsEmptyForIrrelevantText() {
  const hints = recallDecisionHints('今天吃了一碗面', [baseRule], [obs])
  assert.equal(hints.length, 0, '无关文本不应命中规则')
}

async function testRespectsCustomThreshold() {
  // threshold=999 → 无法命中
  const hints = recallDecisionHints('周末健身房', [baseRule], [obs], 999)
  assert.equal(hints.length, 0, '高阈值不应命中')
}

async function testSortsByScoreDescending() {
  // strongRule 在标题/结论/建议/条件多处命中"周末上午";weakRule 仅结论命中 → 分数显著不同
  const strongRule: ExperienceRule = {
    ...baseRule,
    id: 'rule_strong',
    title: '周末上午高效训练',
    conclusion: '周末上午健身房人少',
    recommendation: '周末上午去训练',
    conditions: ['周末上午'],
  }
  const weakRule: ExperienceRule = {
    ...baseRule,
    id: 'rule_weak',
    title: '超市采购清单',
    conclusion: '周末上午顺路买菜',
    recommendation: '提前列好清单',
    conditions: ['列清单'],
  }
  const hints = recallDecisionHints('周末上午', [weakRule, strongRule], [obs])
  assert.equal(hints.length, 2, '两条规则都应达到阈值')
  assert.equal(hints[0].ruleId, 'rule_strong', '高分规则应排在最前')
  assert.ok(hints[0].score > hints[1].score, '应严格按分数降序(两者分数不同)')
}

async function testExcludesWatchReusability() {
  const watchRule: ExperienceRule = {
    ...baseRule,
    id: 'rule_watch',
    reusability: 'watch',
  }
  const hints = recallDecisionHints('周末健身房', [watchRule], [obs])
  assert.equal(hints.length, 0, 'watch 级别规则不应出现在决策提醒')
}

async function run() {
  await testReturnsHintOnHighRelevance()
  await testReturnsEmptyForIrrelevantText()
  await testRespectsCustomThreshold()
  await testSortsByScoreDescending()
  await testExcludesWatchReusability()
  console.log('decisionHints tests passed')
}

void run()
