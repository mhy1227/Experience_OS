import assert from 'node:assert/strict'
import { analyzeObservationResilient } from '../src/services/resilientAnalysis'
import type { ObservationModelClient } from '../src/services/modelAnalysisAdapter'

const throwingClient: ObservationModelClient = {
  completeJson: async () => { throw new Error('network down') },
}

async function testFallsBackToLocalOnClientError() {
  const result = await analyzeObservationResilient('周末10点健身房人少，器械不用排队', { client: throwingClient })
  assert.equal(result.title, '周末低峰训练策略') // 本地引擎产出
}

async function testUsesModelWhenClientWorks() {
  const client: ObservationModelClient = {
    completeJson: async () => ({
      category: '购物', tags: ['工作日'], summary: 's', title: '超市低峰采购策略',
      conclusion: 'c', recommendation: 'r', conditions: ['工作日晚上', '地点是小区超市'],
      warnings: ['w'], reusability: 'medium', direction: 'positive', analysisType: 'rule', confidence: 'medium',
    }),
  }
  const result = await analyzeObservationResilient('工作日晚上8点去小区超市，结账排队明显更短', { client })
  assert.equal(result.title, '超市低峰采购策略')
}

async function testNoClientUsesLocal() {
  const result = await analyzeObservationResilient('周末10点健身房人少，器械不用排队', {})
  assert.equal(result.title, '周末低峰训练策略')
}

async function testDowngradedModelResultDoesNotFallBackToLocal() {
  const downgradingClient: ObservationModelClient = {
    completeJson: async () => ({
      category: '运动', tags: ['周末'], summary: 's', title: '周末低峰训练策略',
      conclusion: 'c', recommendation: 'r', conditions: ['仅一个条件'],
      warnings: ['w'], reusability: 'high', direction: 'positive', analysisType: 'rule', confidence: 'high',
    }),
  }
  const result = await analyzeObservationResilient('周末10点健身房人少，器械不用排队', { client: downgradingClient })
  assert.equal(result.reusability, 'watch') // 契约因 rule 条件不足2条而降级
  assert.equal(result.title, '待观察经验')   // 返回降级结果,而非回退本地引擎的 '周末低峰训练策略'
}

async function run() {
  await testFallsBackToLocalOnClientError()
  await testUsesModelWhenClientWorks()
  await testNoClientUsesLocal()
  await testDowngradedModelResultDoesNotFallBackToLocal()
  console.log('resilientAnalysis tests passed')
}

void run()
