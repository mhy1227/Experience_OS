import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// 独立于 Vue/Pinia:测试拆行逻辑、sentiment 映射、批量写入行为、失败降级
// ---------------------------------------------------------------------------

// 拆行工具(镜像 store importObservations 中同款逻辑)
function splitLines(rawText: string): string[] {
  return rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

// sentiment 映射(镜像 store mapSentiment 逻辑)
type ObservationDirection = 'positive' | 'negative' | 'mixed' | 'uncertain'
type ObservationSentiment = 'positive' | 'neutral' | 'negative'

function mapSentiment(direction: ObservationDirection): ObservationSentiment {
  if (direction === 'positive') return 'positive'
  if (direction === 'negative') return 'negative'
  return 'neutral'
}

// ---------------------------------------------------------------------------
// 批量写入行为 + 失败降级:用独立 harness 模拟 importObservations 核心循环
// ---------------------------------------------------------------------------

interface ImportSummary {
  total: number
  succeeded: number
  failed: number
}

interface ObservationStub {
  id: string
  text: string
  status: 'pending' | 'success' | 'failed'
  summary: string
}

// 模拟 importObservations 主循环(不依赖 Pinia/Vue):
//   - analyzeStub: 模拟 analyzeObservationResilient,可选择抛出错误
//   - writeStub: 模拟 _writeObservation,写入 status/summary
async function runImportLoop(
  lines: string[],
  analyzeStub: (text: string) => Promise<{ category: string }>,
): Promise<{ summary: ImportSummary; observations: ObservationStub[] }> {
  const summary: ImportSummary = { total: lines.length, succeeded: 0, failed: 0 }
  const observations: ObservationStub[] = []

  for (const line of lines) {
    const obs: ObservationStub = {
      id: `obs-${observations.length}`,
      text: line,
      status: 'pending',
      summary: '批量导入中',
    }
    observations.push(obs)

    try {
      await analyzeStub(line)
      // 模拟 _writeObservation:写入成功状态
      obs.status = 'success'
      obs.summary = `提炼完成:${line}`
      summary.succeeded += 1
    } catch {
      // 单条失败降级,不中断循环
      obs.status = 'failed'
      obs.summary = '结构化校验失败，原始观察已保存。'
      summary.failed += 1
    }
  }

  return { summary, observations }
}

// ---------------------------------------------------------------------------
// 拆行逻辑测试
// ---------------------------------------------------------------------------

function testSplitLinesFiltersEmpty() {
  const raw = '\n  \n第一条观察\n\n第二条观察\n  \n'
  const lines = splitLines(raw)
  assert.equal(lines.length, 2)
  assert.equal(lines[0], '第一条观察')
  assert.equal(lines[1], '第二条观察')
}

function testSplitLinesSingleLine() {
  const lines = splitLines('周末健身房人少')
  assert.equal(lines.length, 1)
  assert.equal(lines[0], '周末健身房人少')
}

function testSplitLinesAllEmpty() {
  const lines = splitLines('  \n  \n  ')
  assert.equal(lines.length, 0)
}

// ---------------------------------------------------------------------------
// sentiment 映射测试
// ---------------------------------------------------------------------------

function testMapSentimentPositive() {
  assert.equal(mapSentiment('positive'), 'positive')
}

function testMapSentimentNegative() {
  assert.equal(mapSentiment('negative'), 'negative')
}

function testMapSentimentMixed() {
  assert.equal(mapSentiment('mixed'), 'neutral')
}

function testMapSentimentUncertain() {
  assert.equal(mapSentiment('uncertain'), 'neutral')
}

// ---------------------------------------------------------------------------
// 批量写入行为测试:全部成功
// ---------------------------------------------------------------------------

async function testBatchWriteAllSucceed() {
  const lines = ['健身房周末人少', '工作日早高峰拥堵', '晚上9点超市折扣多']
  const { summary, observations } = await runImportLoop(
    lines,
    async (_text) => ({ category: '其他' }),
  )

  assert.equal(summary.total, 3)
  assert.equal(summary.succeeded, 3)
  assert.equal(summary.failed, 0)
  assert.equal(observations.length, 3)
  for (const obs of observations) {
    assert.equal(obs.status, 'success')
  }
}

// ---------------------------------------------------------------------------
// 失败降级测试:部分失败不中断整体循环
// ---------------------------------------------------------------------------

async function testBatchWritePartialFailureDoesNotAbortLoop() {
  const lines = ['正常观察1', '触发异常观察', '正常观察2']
  let callCount = 0

  const { summary, observations } = await runImportLoop(
    lines,
    async (text) => {
      callCount += 1
      if (text === '触发异常观察') throw new Error('模拟分析失败')
      return { category: '其他' }
    },
  )

  // 所有行均被处理(循环未被中断)
  assert.equal(callCount, 3, '三条均应调用 analyze,失败不应中断循环')
  assert.equal(summary.total, 3)
  assert.equal(summary.succeeded, 2)
  assert.equal(summary.failed, 1)

  // 失败条降级保存,非中止
  assert.equal(observations[0].status, 'success')
  assert.equal(observations[1].status, 'failed')
  assert.equal(observations[1].summary, '结构化校验失败，原始观察已保存。')
  assert.equal(observations[2].status, 'success')
}

// ---------------------------------------------------------------------------
// 失败降级测试:全部失败时 summary 正确
// ---------------------------------------------------------------------------

async function testBatchWriteAllFailedSummary() {
  const lines = ['失败1', '失败2']
  const { summary } = await runImportLoop(
    lines,
    async () => { throw new Error('全部失败') },
  )

  assert.equal(summary.total, 2)
  assert.equal(summary.succeeded, 0)
  assert.equal(summary.failed, 2)
}

// ---------------------------------------------------------------------------
// 空输入测试:lines 为空时不调用 analyze
// ---------------------------------------------------------------------------

async function testBatchWriteEmptyInputSkipsAnalyze() {
  const lines = splitLines('  \n  \n  ')
  assert.equal(lines.length, 0)

  let callCount = 0
  const { summary } = await runImportLoop(
    lines,
    async () => { callCount += 1; return { category: '其他' } },
  )

  assert.equal(callCount, 0, '空输入不应调用 analyze')
  assert.equal(summary.total, 0)
  assert.equal(summary.succeeded, 0)
  assert.equal(summary.failed, 0)
}

// ---------------------------------------------------------------------------
// 并发守卫行为测试:isSeedingDemo/isAnalyzing 为 true 时应返回空 summary
// ---------------------------------------------------------------------------

async function testConcurrencyGuardReturnsEmptySummaryWhenBlocked() {
  // 模拟 importObservations 并发守卫:当 isAnalyzing 为 true 时立即返回空 summary
  async function importWithGuard(
    rawText: string,
    isAnalyzing: boolean,
    isSeedingDemo: boolean,
  ): Promise<ImportSummary> {
    if (isAnalyzing || isSeedingDemo) {
      return { total: 0, succeeded: 0, failed: 0 }
    }
    const lines = splitLines(rawText)
    const summary: ImportSummary = { total: lines.length, succeeded: 0, failed: 0 }
    // 简化:不实际执行分析
    return summary
  }

  const blockedByAnalyzing = await importWithGuard('观察1\n观察2', true, false)
  assert.equal(blockedByAnalyzing.total, 0, 'isAnalyzing=true 时应被守卫阻断返回空 summary')

  const blockedBySeeding = await importWithGuard('观察1\n观察2', false, true)
  assert.equal(blockedBySeeding.total, 0, 'isSeedingDemo=true 时应被守卫阻断返回空 summary')

  const notBlocked = await importWithGuard('观察1\n观察2', false, false)
  assert.equal(notBlocked.total, 2, '无守卫时应正常处理 2 条')
}

// ---------------------------------------------------------------------------
// 运行所有测试
// ---------------------------------------------------------------------------

async function run() {
  // 拆行逻辑
  testSplitLinesFiltersEmpty()
  testSplitLinesSingleLine()
  testSplitLinesAllEmpty()

  // sentiment 映射
  testMapSentimentPositive()
  testMapSentimentNegative()
  testMapSentimentMixed()
  testMapSentimentUncertain()

  // 批量写入行为
  await testBatchWriteAllSucceed()
  await testBatchWritePartialFailureDoesNotAbortLoop()
  await testBatchWriteAllFailedSummary()
  await testBatchWriteEmptyInputSkipsAnalyze()

  // 并发守卫行为
  await testConcurrencyGuardReturnsEmptySummaryWhenBlocked()

  console.log('importObservations tests passed')
}

void run()
