import assert from 'node:assert/strict'
import { analyzeBatch } from '../src/services/batchAnalysis'
import type { ObservationModelClient } from '../src/services/modelAnalysisAdapter'

const goodClient: ObservationModelClient = {
  completeJson: async () => ({
    category: '购物',
    tags: ['工作日'],
    summary: 's',
    title: '超市低峰采购策略',
    conclusion: 'c',
    recommendation: 'r',
    conditions: ['工作日晚上', '地点是小区超市'],
    warnings: ['w'],
    reusability: 'medium',
    direction: 'positive',
    analysisType: 'rule',
    confidence: 'medium',
  }),
}

const failingClient: ObservationModelClient = {
  completeJson: async () => {
    throw new Error('network down')
  },
}

async function testSkipsEmptyAndAnalyzesRest() {
  const r = await analyzeBatch(['工作日晚上8点去小区超市，结账排队明显更短', '   ', ''], goodClient)
  assert.equal(r.length, 1, '空白行应被跳过')
  assert.equal(r[0].ok, true)
  assert.equal(r[0].analysis.title, '超市低峰采购策略')
}

async function testPerItemDegradeOnError() {
  const r = await analyzeBatch(['随便一条观察文本'], failingClient)
  assert.equal(r[0].ok, false, '异常应标记 ok=false')
  assert.equal(r[0].analysis.reusability, 'watch', '降级为待观察')
}

async function run() {
  await testSkipsEmptyAndAnalyzesRest()
  await testPerItemDegradeOnError()
  console.log('batchAnalysis tests passed')
}

void run()
