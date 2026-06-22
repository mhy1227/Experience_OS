import assert from 'node:assert/strict'
import { enforceAnalysisContract, inferDirection, type ModelAnalysisResult } from '../src/services/analysisContract'

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<ModelAnalysisResult>): ModelAnalysisResult {
  return {
    category: '工作',
    tags: ['测试'],
    summary: '测试摘要',
    title: '测试标题',
    conclusion: '测试结论',
    recommendation: '测试建议',
    conditions: ['条件一', '条件二'],
    warnings: ['注意事项'],
    reusability: 'medium',
    direction: 'positive',
    analysisType: 'rule',
    confidence: 'medium',
    ...overrides,
  }
}

// ─── enforceAnalysisContract 六个分支测试 ─────────────────────────────────────

// 分支 1:原文负向 + 模型报 positive → 降级为 watch
async function testBranch1_NegativePosesAsPositive_Downgraded() {
  const result = enforceAnalysisContract(
    makeResult({
      direction: 'positive',
      analysisType: 'rule',
      confidence: 'high',
      reusability: 'high',
      conditions: ['条件一', '条件二'],
    }),
    '这次返工白做了，全部作废',
  )
  assert.equal(result.kind, 'watch', '负向文本 + 模型 positive → 应降为 watch')
  assert.equal(result.reusability, 'watch')
  assert.ok(result.summary.includes('方向与原文相反') || result.summary.includes('待观察'))
}

// 分支 2:direction=uncertain → watch
async function testBranch2_UncertainDirection_Downgraded() {
  const result = enforceAnalysisContract(
    makeResult({ direction: 'uncertain', confidence: 'medium' }),
    '今天感觉还行',
  )
  assert.equal(result.kind, 'watch')
  assert.equal(result.reusability, 'watch')
}

// 分支 2b:analysisType=watch → watch
async function testBranch2b_AnalysisTypeWatch_Downgraded() {
  const result = enforceAnalysisContract(
    makeResult({ analysisType: 'watch', direction: 'positive' }),
    '今天感觉还行',
  )
  assert.equal(result.kind, 'watch')
  assert.equal(result.reusability, 'watch')
}

// 分支 2c:confidence=low → watch
async function testBranch2c_LowConfidence_Downgraded() {
  const result = enforceAnalysisContract(
    makeResult({ confidence: 'low', direction: 'positive', analysisType: 'rule' }),
    '今天感觉还行',
  )
  assert.equal(result.kind, 'watch')
  assert.equal(result.reusability, 'watch')
}

// 分支 3:结构不足(conditions < 2)→ watch
async function testBranch3_InsufficientConditions_Downgraded() {
  const result = enforceAnalysisContract(
    makeResult({
      direction: 'positive',
      analysisType: 'rule',
      confidence: 'high',
      reusability: 'high',
      conditions: ['仅一个条件'],
    }),
    '工作日晚上去超市排队更短',
  )
  assert.equal(result.kind, 'watch', '只有1个条件 → 应降为 watch')
  assert.equal(result.reusability, 'watch')
}

// 分支 4:正向 + rule + 结构完整 → strategy
async function testBranch4_PositiveRule_Strategy() {
  const result = enforceAnalysisContract(
    makeResult({
      direction: 'positive',
      analysisType: 'rule',
      confidence: 'medium',
      reusability: 'medium',
      conditions: ['工作日晚上', '地点是小区超市'],
    }),
    '工作日晚上8点去超市排队更短',
  )
  assert.equal(result.kind, 'strategy', '正向 rule 结构完整 → 应为 strategy')
  assert.equal(result.direction, 'positive')
}

// 分支 5:负向 + counterexample + 结构完整 → caution
async function testBranch5_NegativeCounterexample_Caution() {
  const result = enforceAnalysisContract(
    makeResult({
      direction: 'negative',
      analysisType: 'counterexample',
      confidence: 'medium',
      reusability: 'medium',
      conditions: ['多方协作', '目标中途可能变更'],
    }),
    '这个功能开发到一半，产品说方向变了，前两周全白做了',
  )
  assert.equal(result.kind, 'caution', '负向 counterexample 结构完整 → 应为 caution')
  assert.notEqual(result.reusability, 'watch')
}

// 分支 6:不一致组合(正向 + counterexample)→ watch 兜底
async function testBranch6_InconsistentCombo_Watch() {
  const result = enforceAnalysisContract(
    makeResult({
      direction: 'positive',
      analysisType: 'counterexample',
      confidence: 'medium',
      reusability: 'medium',
      conditions: ['条件一', '条件二'],
    }),
    '工作日去超市人少',
  )
  assert.equal(result.kind, 'watch', '正向 + counterexample 不一致 → 兜底 watch')
}

// ─── C1 专项:空 conditions + positive + rule + high → 必须是 watch,不能成为 strategy ──

async function testC1_EmptyConditions_PositiveRuleHigh_MustBeWatch() {
  // 模型返回 conditions:[] (空),但 positive + rule + high
  // withMinimumModelFields 会注入 2 条占位条件,
  // 修复前此路径会绕过步骤 3 门槛,直接晋升为 strategy。
  // 修复后:使用原始有效条数(0 < 2)→ 应降为 watch。
  const result = enforceAnalysisContract(
    makeResult({
      direction: 'positive',
      analysisType: 'rule',
      confidence: 'high',
      reusability: 'high',
      conditions: [],  // 模型返回空 conditions
    }),
    '工作日晚上去超市排队更短',
  )
  assert.equal(result.kind, 'watch', 'C1:空 conditions 被占位后不得成为 strategy,应降级为 watch')
  assert.equal(result.reusability, 'watch')
}

// C1 变体:只有空字符串的 conditions 也应视为 0 条有效条件
async function testC1_OnlyEmptyStringConditions_MustBeWatch() {
  const result = enforceAnalysisContract(
    makeResult({
      direction: 'positive',
      analysisType: 'rule',
      confidence: 'high',
      reusability: 'high',
      conditions: ['', '  '],  // 全是空串
    }),
    '工作日晚上去超市排队更短',
  )
  assert.equal(result.kind, 'watch', 'C1:全空串 conditions 有效条数为 0,应降级为 watch')
  assert.equal(result.reusability, 'watch')
}

// ─── 完整性闸门:结构/置信达标,但模型漏给核心文本字段 → 显式降级(不再捏造占位)──

async function testIncompleteCoreFields_Downgraded() {
  const result = enforceAnalysisContract(
    makeResult({
      direction: 'positive',
      analysisType: 'rule',
      confidence: 'high',
      reusability: 'high',
      conditions: ['工作日晚上', '地点是小区超市'],
      summary: '', // 模型漏给摘要
    }),
    '工作日晚上8点去超市排队更短',
  )
  assert.equal(result.kind, 'watch', '核心文本字段缺失 → 应显式降级 watch,而非占位补全为 strategy')
  assert.equal(result.reusability, 'watch')
  assert.ok(
    result.summary.includes('关键字段') || result.summary.includes('待观察'),
    '降级结果应带可观测原因',
  )
}

// ─── C2 专项:扩充后的 inferDirection 能识别新增负向词 ────────────────────────────

// 新增负向词(不在旧词表)现在能被判为 negative
async function testC2_NewNegativeKeywords_Detected() {
  // "返工" / "白做" / "作废" / "方向变了" 都是新增词,不在原始词表
  const cases: Array<[string, string]> = [
    ['这次返工了，全浪费了', '返工'],
    ['前两周全白做了', '白做'],
    ['需求全部作废了', '作废'],
    ['产品说方向变了', '方向变了'],
    ['任务被打回了', '打回'],
    ['这次踩雷了', '踩雷'],
    ['项目延期了三天', '延期'],
    ['整个方案失败了', '失败'],
    ['两个需求产生冲突', '冲突'],
    ['拖延了整整两天', '拖延'],
  ]

  for (const [text, keyword] of cases) {
    const direction = inferDirection(text)
    assert.equal(
      direction,
      'negative',
      `C2:含"${keyword}"的文本应被 inferDirection 判为 negative,实际得到 ${direction}`,
    )
  }
}

// C2:含新增负向词的文本,若被模型误报为 positive → 应被 enforceAnalysisContract 拦截降为 watch
async function testC2_NewNegativeText_PosesAsPositive_Downgraded() {
  // "返工"是新增词,旧词表中不存在,旧实现会返回 uncertain,拦截失效
  const result = enforceAnalysisContract(
    makeResult({
      direction: 'positive',
      analysisType: 'rule',
      confidence: 'high',
      reusability: 'high',
      conditions: ['条件一', '条件二'],
    }),
    '这次返工白做了，全部被打回',
  )
  assert.equal(result.kind, 'watch', 'C2:含新增负向词的文本被模型误报 positive → 应被拦截降为 watch')
}

// C2:正向词也应能正确识别
async function testC2_PositiveKeywords_Detected() {
  const cases: Array<[string, string]> = [
    ['这次顺利完成了', '顺利'],
    ['提前发布了', '提前'],
    ['节省了两个小时', '节省'],
    ['高效完成了任务', '高效'],
    ['对齐了需求', '对齐了'],
  ]

  for (const [text, keyword] of cases) {
    const direction = inferDirection(text)
    assert.equal(
      direction,
      'positive',
      `C2:含"${keyword}"的文本应被 inferDirection 判为 positive,实际得到 ${direction}`,
    )
  }
}

// ─── 运行入口 ─────────────────────────────────────────────────────────────────

async function run() {
  // enforceAnalysisContract 六个分支
  await testBranch1_NegativePosesAsPositive_Downgraded()
  await testBranch2_UncertainDirection_Downgraded()
  await testBranch2b_AnalysisTypeWatch_Downgraded()
  await testBranch2c_LowConfidence_Downgraded()
  await testBranch3_InsufficientConditions_Downgraded()
  await testBranch4_PositiveRule_Strategy()
  await testBranch5_NegativeCounterexample_Caution()
  await testBranch6_InconsistentCombo_Watch()

  // C1 专项
  await testC1_EmptyConditions_PositiveRuleHigh_MustBeWatch()
  await testC1_OnlyEmptyStringConditions_MustBeWatch()

  // 完整性闸门
  await testIncompleteCoreFields_Downgraded()

  // C2 专项
  await testC2_NewNegativeKeywords_Detected()
  await testC2_NewNegativeText_PosesAsPositive_Downgraded()
  await testC2_PositiveKeywords_Detected()

  console.log('analysisContract tests passed')
}

void run()
