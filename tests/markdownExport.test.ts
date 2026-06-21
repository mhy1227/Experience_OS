import assert from 'node:assert/strict'
import { renderExperienceMarkdown } from '../src/services/markdownExport'
import type { ExperienceRule, Observation } from '../src/types/experience'

const now = new Date().toISOString()

const rule: ExperienceRule = {
  id: 'rule-1',
  title: '项目目标不一致导致返工',
  category: '工作',
  conclusion: '项目启动阶段若各方目标未对齐，中期大概率出现返工',
  recommendation: '启动会必须确认对齐目标并书面记录',
  conditions: ['多方协作项目', '无书面目标确认'],
  warnings: ['临时插入需求时需重新对齐'],
  evidenceIds: ['obs-1', 'obs-2'],
  reusability: 'high',
  feedback: 'none',
  reviewStatus: 'unreviewed',
  evaluations: [],
  evaluationVerdict: 'insufficient',
  revisionSuggestion: '',
  updatedAt: now,
}

const obs: Observation = {
  id: 'obs-1',
  text: '这次项目中途改需求，导致前两周工作全部推翻',
  category: '工作',
  tags: ['目标不一致', '返工'],
  summary: '目标变更导致返工',
  status: 'success',
  createdAt: now,
}

async function testContainsRuleTitle() {
  const md = renderExperienceMarkdown([rule], [obs])
  assert.ok(md.includes('项目目标不一致导致返工'), '应包含规则标题')
}

async function testContainsConclusion() {
  const md = renderExperienceMarkdown([rule], [obs])
  assert.ok(md.includes('项目启动阶段若各方目标未对齐'), '应包含结论')
}

async function testContainsObservationText() {
  const md = renderExperienceMarkdown([rule], [obs])
  assert.ok(md.includes('这次项目中途改需求'), '应包含观察原文')
}

async function testContainsMetaSection() {
  const md = renderExperienceMarkdown([rule], [obs])
  assert.ok(md.includes('数据只在本机'), '应包含本地优先声明')
}

async function testEmptyRulesReturnsMarkdown() {
  const md = renderExperienceMarkdown([], [])
  assert.ok(typeof md === 'string' && md.length > 0, '空数据也应返回非空字符串')
}

async function run() {
  await testContainsRuleTitle()
  await testContainsConclusion()
  await testContainsObservationText()
  await testContainsMetaSection()
  await testEmptyRulesReturnsMarkdown()
  console.log('markdownExport tests passed')
}

void run()
