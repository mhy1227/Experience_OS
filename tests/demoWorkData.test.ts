import assert from 'node:assert/strict'
import { DEMO_WORK_DATA } from '../src/services/demoWorkData'
import type { DemoWorkItem } from '../src/services/demoWorkData'

async function testTotalCount() {
  assert.ok(DEMO_WORK_DATA.length >= 30, `种子条数应 ≥30,实际 ${DEMO_WORK_DATA.length}`)
}

async function testRootCauseTagCoverage() {
  const rootCauseItems = DEMO_WORK_DATA.filter((item) => item.rootCauseTag === '目标不一致')
  assert.ok(
    rootCauseItems.length >= 12,
    `埋根因条数应 ≥12,实际 ${rootCauseItems.length}`,
  )
}

async function testPositivePatterns() {
  const positive = DEMO_WORK_DATA.filter((item) => item.direction === 'positive')
  assert.ok(positive.length >= 3, `正向规律应 ≥3 条,实际 ${positive.length}`)
}

async function testNegativePatterns() {
  const negative = DEMO_WORK_DATA.filter((item) => item.direction === 'negative')
  assert.ok(negative.length >= 10, `负向观察应 ≥10 条,实际 ${negative.length}`)
}

async function testDateFormat() {
  for (const item of DEMO_WORK_DATA) {
    const d = new Date(item.date)
    assert.ok(
      Number.isFinite(d.getTime()),
      `date 字段应为有效 ISO 日期字符串,实际: ${item.date}`,
    )
  }
}

async function testRequiredFields() {
  for (const item of DEMO_WORK_DATA) {
    assert.ok(typeof item.text === 'string' && item.text.length > 0, 'text 不能为空')
    assert.ok(['positive', 'negative', 'neutral'].includes(item.direction), `direction 非法: ${item.direction}`)
    assert.ok(typeof item.rootCauseTag === 'string', 'rootCauseTag 应为字符串')
  }
}

async function testRootCauseRatioAmongNegative() {
  const negative = DEMO_WORK_DATA.filter((item) => item.direction === 'negative')
  const rootCause = negative.filter((item) => item.rootCauseTag === '目标不一致')
  const ratio = rootCause.length / negative.length
  assert.ok(
    ratio >= 0.75,
    `负向观察中根因占比应 ≥75%(演示声称 80%,彩排 T3.3 要求 ≥70%),实际 ${(ratio * 100).toFixed(0)}%`,
  )
}

// 跨品类演示集:有效性 + 多样性 + "半途而废"共同根因(便于跨场景规律演示)
async function testVariedData() {
  const { DEMO_VARIED_DATA } = await import('../src/services/demoWorkData')
  assert.ok(DEMO_VARIED_DATA.length >= 15, `跨品类数据应 ≥15 条,实际 ${DEMO_VARIED_DATA.length}`)
  for (const item of DEMO_VARIED_DATA) {
    assert.ok(typeof item.text === 'string' && item.text.length > 0, 'text 不能为空')
    assert.ok(['positive', 'negative', 'neutral'].includes(item.direction), `direction 非法: ${item.direction}`)
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(item.date), `date 格式应为 YYYY-MM-DD: ${item.date}`)
  }
  const positive = DEMO_VARIED_DATA.filter((i) => i.direction === 'positive')
  const negative = DEMO_VARIED_DATA.filter((i) => i.direction === 'negative')
  assert.ok(positive.length >= 5 && negative.length >= 4, '正负向都应有一定量,体现多样性')
  const giveUp = DEMO_VARIED_DATA.filter((i) => i.rootCauseTag === '半途而废')
  assert.ok(giveUp.length >= 3, `应有"半途而废"共同根因簇(≥3),实际 ${giveUp.length}`)
}

async function run() {
  await testTotalCount()
  await testRootCauseTagCoverage()
  await testPositivePatterns()
  await testNegativePatterns()
  await testDateFormat()
  await testRequiredFields()
  await testRootCauseRatioAmongNegative()
  await testVariedData()
  console.log('demoWorkData tests passed')
}

void run()
