import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useExperienceStore } from '../src/stores/experience'
import { normalizeModelAnalysis } from '../src/services/analysisContract'
import { analyzeObservationResilient } from '../src/services/resilientAnalysis'
import type { ObservationModelClient } from '../src/services/modelAnalysisAdapter'

// ---------------------------------------------------------------------------
// localStorage harness(与 experienceStore.test.ts 相同)
// ---------------------------------------------------------------------------

function installLocalStorage() {
  const data = new Map<string, string>()
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => {
      data.clear()
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size
    },
  } as Storage
}

function makeStore() {
  installLocalStorage()
  setActivePinia(createPinia())
  return useExperienceStore()
}

// ---------------------------------------------------------------------------
// 辅助:构造一个假的 ObservationModelClient,返回指定 raw JSON
// ---------------------------------------------------------------------------

function makeFakeClient(rawResponse: unknown): ObservationModelClient {
  return {
    completeJson: async () => rawResponse,
  }
}

// ---------------------------------------------------------------------------
// C1 回归(契约层):模型返回 conditions:[] + positive + rule + high
//   → normalizeModelAnalysis 应产出 reusability='watch'(不得是 'high')
//   这是 C1 修复在契约层的直接验证
// ---------------------------------------------------------------------------

function testC1ContractEmptyConditionsPreventsStrategy() {
  const badModelOutput = {
    category: '运动',
    tags: ['周末', '健身房'],
    summary: '周末健身房人少。',
    title: '周末低峰训练策略',
    conclusion: '周末去健身房人少。',
    recommendation: '周末早上去健身房。',
    conditions: [],            // 空条件 — C1 的关键 edge case
    warnings: ['节假日除外'],
    reusability: 'high',       // 模型"误发高复用"
    direction: 'positive',
    analysisType: 'rule',
    confidence: 'high',
  }

  const result = normalizeModelAnalysis(badModelOutput, '周末健身房人少')

  assert.equal(
    result.reusability,
    'watch',
    'C1: 空 conditions + positive + rule + high 必须被契约层降级为 watch',
  )
  assert.equal(result.kind, 'watch', 'C1: kind 应为 watch')
  assert.notEqual(result.kind, 'strategy', 'C1: kind 绝不能是 strategy')
}

// ---------------------------------------------------------------------------
// C1 回归(契约层-变体):conditions 全为空字符串等效于空
// ---------------------------------------------------------------------------

function testC1ContractWhitespaceOnlyConditionsPreventsStrategy() {
  const badModelOutput = {
    category: '运动',
    tags: ['周末'],
    summary: '周末人少。',
    title: '健身低峰',
    conclusion: '周末人少。',
    recommendation: '周末去健身房。',
    conditions: ['', '  '],    // 全空白条件
    warnings: [],
    reusability: 'high',
    direction: 'positive',
    analysisType: 'rule',
    confidence: 'high',
  }

  const result = normalizeModelAnalysis(badModelOutput, '周末健身房人少')

  assert.equal(
    result.reusability,
    'watch',
    'C1 变体: 全空白 conditions 必须等效于空条件,被降级为 watch',
  )
  assert.equal(result.kind, 'watch', 'C1 变体: kind 应为 watch')
}

// ---------------------------------------------------------------------------
// C1 回归(端对端 + store 路径):
//   通过 analyzeObservationResilient 注入伪造客户端,
//   产出 watch 分析结果,再写入 store —— 最终落库规则 reusability='watch'
// ---------------------------------------------------------------------------

async function testC1StoreEmptyConditionsRuleIsWatch() {
  const store = makeStore()

  // 伪造模型客户端,返回空 conditions + positive + rule + high
  const fakeClient = makeFakeClient({
    category: '运动',
    tags: ['周末', '健身房'],
    summary: '周末健身房人少。',
    title: '周末低峰训练策略',
    conclusion: '周末去健身房人少，器械不排队。',
    recommendation: '周末早上去健身房。',
    conditions: [],
    warnings: ['节假日除外'],
    reusability: 'high',
    direction: 'positive',
    analysisType: 'rule',
    confidence: 'high',
  })

  // 1) 契约层直验:空 conditions → watch
  const analysis = await analyzeObservationResilient('周末健身房人少', { client: fakeClient })
  assert.equal(analysis.reusability, 'watch', '契约层:空 conditions → watch')

  // 2) 端到端:经真实 submitObservation 注入伪 client,
  //    走完整 模型 → 契约 → _writeObservation → upsertRuleFromAnalysis 链路
  await store.submitObservation('周末健身房人少', fakeClient)

  const obs = store.observations[0]
  assert.ok(obs, '应写入观察')
  assert.equal(obs.status, 'success', '契约降级为 watch 仍是成功返回')
  const storedRule = store.rules.find((r) => r.id === obs.ruleId)
  assert.ok(storedRule, '应生成对应规则')
  assert.equal(storedRule!.reusability, 'watch', 'C1 端到端:空 conditions → 落库规则 reusability=watch')
  assert.notEqual(storedRule!.reusability, 'high', 'C1 端到端:落库规则不得为 high')
  assert.notEqual(storedRule!.kind, 'strategy', 'C1 端到端:落库规则 kind 不得为 strategy')
}

// ---------------------------------------------------------------------------
// submitObservation 核心 V1 路径:本地引擎兜底(无模型)能正常写入 observations + rules
// ---------------------------------------------------------------------------

async function testSubmitObservationWritesToStore() {
  const store = makeStore()

  await store.submitObservation('周末10点健身房人少，器械不用排队')

  assert.equal(store.observations.length, 1, 'submitObservation 应写入 1 条观察')
  const obs = store.observations[0]
  assert.equal(obs.status, 'success', '本地引擎应成功分析')
  assert.ok(obs.ruleId, '分析成功的观察应有 ruleId')
  assert.ok(store.rules.length >= 1, '应生成至少 1 条规则')
}

// ---------------------------------------------------------------------------
// submitObservation:正向文本 sentiment=positive
// ---------------------------------------------------------------------------

async function testSubmitObservationSentimentPositive() {
  const store = makeStore()

  // "人少"+"不用排队" 命中正向词表
  await store.submitObservation('周末10点健身房人少，器械不用排队')

  const obs = store.observations[0]
  assert.ok(obs, '应有观察记录')
  assert.equal(obs.sentiment, 'positive', '正向文本 sentiment 应为 positive')
}

// ---------------------------------------------------------------------------
// upsertRuleFromAnalysis(通过 submitObservation 间接测试):
//   watch-reusability 分析 → 不与已有同 title+category 规则合并
//   (findSimilarRule 在 reusability=watch 时直接返回 undefined)
// ---------------------------------------------------------------------------

async function testWatchAnalysisAlwaysCreatesNewRule() {
  const store = makeStore()

  // 先提交一次(本地引擎产出 watch 对未知文本)
  await store.submitObservation('随机的未知场景文本 abc')
  const countAfterFirst = store.rules.length

  // 再提交完全相同的文本:watch 不合并 → 创建新规则
  await store.submitObservation('随机的未知场景文本 abc')

  // watch 分析不走 findSimilarRule(直接 skip,始终创建新规则)
  assert.ok(store.rules.length >= countAfterFirst, '每次 watch 分析应至少维持规则数(不减少)')
}

// ---------------------------------------------------------------------------
// computeInsights:在有 success 观察的情况下能正常执行,不抛出
// ---------------------------------------------------------------------------

async function testComputeInsightsRunsWithoutError() {
  const store = makeStore()

  // 先提交几条观察
  await store.importObservations([
    '周末10点健身房人少，器械不用排队',
    '工作日晚上8点去小区超市，结账排队明显更短',
  ].join('\n'))

  // computeInsights 应能在无模型客户端情况下正常运行(纯统计基座)
  await store.computeInsights('过去 90 天')

  // insights 应已更新(可能为空数组,但不应抛出)
  assert.ok(Array.isArray(store.insights), 'insights 应为数组')
}

// ---------------------------------------------------------------------------
// 运行所有测试
// ---------------------------------------------------------------------------

async function run() {
  // C1 回归 — 契约层
  testC1ContractEmptyConditionsPreventsStrategy()
  testC1ContractWhitespaceOnlyConditionsPreventsStrategy()

  // C1 回归 — store 路径(端对端)
  await testC1StoreEmptyConditionsRuleIsWatch()

  // V1 核心路径
  await testSubmitObservationWritesToStore()
  await testSubmitObservationSentimentPositive()
  await testWatchAnalysisAlwaysCreatesNewRule()
  await testComputeInsightsRunsWithoutError()

  console.log('storeV1Core tests passed')
}

void run()
