import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useExperienceStore } from '../src/stores/experience'

// ---------------------------------------------------------------------------
// 模拟 localStorage(与 experienceStore.test.ts 相同的 harness)
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

// ---------------------------------------------------------------------------
// 辅助:初始化 Pinia + store
// ---------------------------------------------------------------------------

function makeStore() {
  installLocalStorage()
  setActivePinia(createPinia())
  return useExperienceStore()
}

// ---------------------------------------------------------------------------
// 1. importObservations 真实写入:调用真实 store,不调用模型(无 localStorage model key)
//    本地引擎兜底;已知 demo 文本(健身房/超市/方案)能命中本地规则产出规则
// ---------------------------------------------------------------------------

async function testImportWritesObservationsToStore() {
  const store = makeStore()

  const rawText = [
    '周末10点健身房人少，器械不用排队',
    '工作日晚上8点去小区超市，结账排队明显更短',
  ].join('\n')

  const summary = await store.importObservations(rawText)

  // summary 计数正确
  assert.equal(summary.total, 2, '应识别 2 行输入')
  assert.equal(summary.succeeded, 2, '两条已知文本应被本地引擎成功分析')
  assert.equal(summary.failed, 0, '无失败')

  // observations 真实写入
  assert.equal(store.observations.length, 2, 'store.observations 应有 2 条记录')
  for (const obs of store.observations) {
    assert.equal(obs.status, 'success', '每条观察 status 应为 success')
    assert.notEqual(obs.ruleId, undefined, '分析成功的观察应挂载 ruleId')
  }

  // rules 真实写入
  assert.ok(store.rules.length >= 1, '至少应生成 1 条规则')
}

// ---------------------------------------------------------------------------
// 2. sentiment 来自分析方向(direction):正向文本 → sentiment='positive'
//    本地引擎对 "周末10点健身房人少，器械不用排队" 返回 reusability='high' 且含正向关键词
// ---------------------------------------------------------------------------

async function testImportSentimentDerivesFromDirection() {
  const store = makeStore()

  // "人少"+"不用排队" 命中 inferDirection 正向词表 → positive
  await store.importObservations('周末10点健身房人少，器械不用排队')

  const obs = store.observations[0]
  assert.ok(obs, '应有 1 条观察')
  assert.equal(obs.sentiment, 'positive', '正向文本的 sentiment 应为 positive')
}

// ---------------------------------------------------------------------------
// 3. 部分失败不中断循环:文本 < 4 字节时本地引擎抛出 Error,其余条目正常完成
// ---------------------------------------------------------------------------

async function testImportPartialFailureDoesNotAbortLoop() {
  const store = makeStore()

  // 第 2 条 "???" 长度 3 < 4,analyzeObservation 会 throw
  const rawText = [
    '周末10点健身房人少，器械不用排队',
    '???',
    '工作日晚上8点去小区超市，结账排队明显更短',
  ].join('\n')

  const summary = await store.importObservations(rawText)

  assert.equal(summary.total, 3, '三条输入')
  assert.equal(summary.succeeded, 2, '两条成功')
  assert.equal(summary.failed, 1, '一条失败(文本过短)')

  // 循环未中断:observations 仍有 3 条(失败的也保留,status='failed')
  assert.equal(store.observations.length, 3, '失败条也应保留在 observations 中')

  const failedObs = store.observations.find((o) => o.status === 'failed')
  assert.ok(failedObs, '应有一条 status=failed 的观察')
  assert.equal(failedObs?.summary, '结构化校验失败，原始观察已保存。', '失败降级摘要应正确')

  const successCount = store.observations.filter((o) => o.status === 'success').length
  assert.equal(successCount, 2, '其余两条应成功写入')
}

// ---------------------------------------------------------------------------
// 4. 空输入:不写入任何观察,summary.total=0
// ---------------------------------------------------------------------------

async function testImportEmptyInputNoObservations() {
  const store = makeStore()

  const summary = await store.importObservations('  \n  \n  ')

  assert.equal(summary.total, 0)
  assert.equal(summary.succeeded, 0)
  assert.equal(summary.failed, 0)
  assert.equal(store.observations.length, 0, '空输入不应写入任何观察')
  assert.equal(store.rules.length, 0, '空输入不应创建任何规则')
}

// ---------------------------------------------------------------------------
// 5. 并发守卫:同时发起两个 importObservations 调用,第二个应被守卫阻断
//    importObservations 在循环期间持有 isSeedingDemo=true,
//    第二个并发调用命中守卫,返回空 summary 且不写入额外观察
// ---------------------------------------------------------------------------

async function testImportConcurrentCallIsBlocked() {
  const store = makeStore()

  // 并发发起两个导入(同一 tick 启动),第二个应被守卫阻断
  const [summary1, summary2] = await Promise.all([
    store.importObservations('周末10点健身房人少，器械不用排队'),
    store.importObservations('工作日晚上8点去小区超市，结账排队明显更短'),
  ])

  // 其中一个被守卫阻断(total=0),另一个正常执行
  const blocked = [summary1, summary2].find((s) => s.total === 0)
  const executed = [summary1, summary2].find((s) => s.total > 0)

  assert.ok(blocked, '并发调用中应有一个被守卫阻断(total=0)')
  assert.ok(executed, '并发调用中应有一个正常执行')
  assert.equal(blocked?.succeeded, 0)
  assert.equal(blocked?.failed, 0)
}

// ---------------------------------------------------------------------------
// 6. 多行成功:三条 demo 文本全部成功写入,rules 至少有 2 条(不同分类)
// ---------------------------------------------------------------------------

async function testImportThreeLinesCreatesRules() {
  const store = makeStore()

  const rawText = [
    '周末10点健身房人少，器械不用排队',
    '工作日晚上8点去小区超市，结账排队明显更短',
    '上午10点写方案最顺，下午3点容易卡住',
  ].join('\n')

  const summary = await store.importObservations(rawText)

  assert.equal(summary.total, 3)
  assert.equal(summary.succeeded, 3)
  assert.equal(summary.failed, 0)
  assert.ok(store.rules.length >= 2, '三条跨分类 demo 文本应生成 >=2 条规则')
}

// ---------------------------------------------------------------------------
// 运行所有测试
// ---------------------------------------------------------------------------

async function run() {
  await testImportWritesObservationsToStore()
  await testImportSentimentDerivesFromDirection()
  await testImportPartialFailureDoesNotAbortLoop()
  await testImportEmptyInputNoObservations()
  await testImportConcurrentCallIsBlocked()
  await testImportThreeLinesCreatesRules()

  console.log('importObservations tests passed')
}

void run()
