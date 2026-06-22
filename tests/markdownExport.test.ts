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

async function testCellPipeEscaped() {
  // 竖线在规则结论中应被转义为全角｜,不破坏表格
  const ruleWithPipe: ExperienceRule = {
    ...rule,
    conclusion: '条件A|条件B 同时满足时',
    recommendation: '优先处理|级风险',
  }
  const md = renderExperienceMarkdown([ruleWithPipe], [])
  // 转义后应出现全角｜而非原始 |
  assert.ok(md.includes('条件A｜条件B'), '结论中竖线应被转义为全角｜')
  assert.ok(md.includes('优先处理｜级风险'), '建议中竖线应被转义为全角｜')
}

async function testCellNewlineEscaped() {
  // 换行符在观察文本中应被替换为空格,不破坏表格行
  const obsWithNewline: Observation = {
    ...obs,
    id: 'obs-newline',
    text: '第一行内容\n第二行内容',
    summary: '摘要第一行\n摘要第二行',
  }
  // 必须传入至少一条规则,否则函数提前返回,跳过观察记录总表
  const md = renderExperienceMarkdown([rule], [obsWithNewline])
  // 换行被替换为空格,表格单行内不应含原始换行
  const tableSection = md.split('## 原始观察记录')[1] ?? ''
  assert.ok(tableSection.length > 0, '应存在观察记录总表区块')
  assert.ok(!tableSection.includes('\n第二行内容'), '观察文本的换行应被替换(不影响表格行)')
  assert.ok(tableSection.includes('第一行内容 第二行内容'), '换行应替换为空格')
}

async function testCellBacktickEscaped() {
  // 反引号在观察摘要中应被转义为全角｀
  const obsWithBacktick: Observation = {
    ...obs,
    id: 'obs-bt',
    text: '普通文本',
    summary: '使用`git rebase`时出错',
  }
  // 必须传入至少一条规则,否则函数提前返回,跳过观察记录总表
  const md = renderExperienceMarkdown([rule], [obsWithBacktick])
  assert.ok(md.includes('使用｀git rebase｀时出错'), '摘要中反引号应被转义为全角｀')
}

async function run() {
  await testContainsRuleTitle()
  await testContainsConclusion()
  await testContainsObservationText()
  await testContainsMetaSection()
  await testEmptyRulesReturnsMarkdown()
  await testCellPipeEscaped()
  await testCellNewlineEscaped()
  await testCellBacktickEscaped()
  console.log('markdownExport tests passed')
}

void run()
