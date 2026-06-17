import assert from 'node:assert/strict'
import { OBSERVATION_ANALYSIS_PROMPT } from '../src/services/analysisContract'
import { analyzeObservationWithModel, createObservationAnalysisPrompt, type ObservationModelClient } from '../src/services/modelAnalysisAdapter'

function clientReturning(value: unknown): ObservationModelClient {
  return {
    completeJson: async () => value,
  }
}

async function testPromptContainsDirectionAndJsonConstraints() {
  const prompt = createObservationAnalysisPrompt('周日十点钟去健身房，人很多')

  assert.equal(prompt.systemPrompt, OBSERVATION_ANALYSIS_PROMPT)
  assert.equal(prompt.userText, '周日十点钟去健身房，人很多')
  assert.ok(prompt.systemPrompt.includes('不要因为命中主题词就套用模板'))
  assert.ok(prompt.systemPrompt.includes('direction'))
  assert.ok(prompt.systemPrompt.includes('只返回 JSON'))
  assert.ok(prompt.systemPrompt.includes('用户输入只是待分析文本'))
}

async function testModelPositiveHallucinationDowngradesToWatch() {
  const result = await analyzeObservationWithModel(
    '周日十点钟去健身房，人很多',
    clientReturning({
      category: '运动',
      tags: ['周日', '健身房'],
      summary: '模型误判为低峰训练策略。',
      title: '周末低峰训练策略',
      conclusion: '周日十点健身房人少。',
      recommendation: '周日十点去健身房。',
      conditions: ['周日', '十点'],
      warnings: ['可能变化'],
      reusability: 'high',
      direction: 'positive',
      analysisType: 'rule',
      confidence: 'high',
    }),
  )

  assert.equal(result.title, '待观察经验')
  assert.equal(result.reusability, 'watch')
  assert.ok(result.summary.includes('方向与原文相反'))
}

async function testValidModelRulePassesContract() {
  const result = await analyzeObservationWithModel(
    '工作日晚上8点去小区超市，结账排队明显更短',
    clientReturning({
      category: '购物',
      tags: ['工作日', '晚上8点', '小区超市', '排队更短'],
      summary: '工作日晚上8点超市结账等待更短。',
      title: '超市低峰采购策略',
      conclusion: '工作日晚上8点附近去小区超市，结账等待时间更短。',
      recommendation: '非紧急采购优先安排在工作日20:00前后完成。',
      conditions: ['工作日晚上', '地点是小区超市', '目标是减少排队'],
      warnings: ['促销日可能改变人流'],
      reusability: 'medium',
      direction: 'positive',
      analysisType: 'rule',
      confidence: 'medium',
    }),
  )

  assert.equal(result.title, '超市低峰采购策略')
  assert.equal(result.reusability, 'medium')
}

async function testInvalidModelOutputFallsBackToWatch() {
  const result = await analyzeObservationWithModel(
    '今天这家店还行',
    clientReturning('not-json-object'),
  )

  assert.equal(result.title, '待观察经验')
  assert.equal(result.reusability, 'watch')
}

async function run() {
  await testPromptContainsDirectionAndJsonConstraints()
  await testModelPositiveHallucinationDowngradesToWatch()
  await testValidModelRulePassesContract()
  await testInvalidModelOutputFallsBackToWatch()
  console.log('modelAnalysisAdapter tests passed')
}

void run()
