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

async function run() {
  await testTotalCount()
  await testRootCauseTagCoverage()
  await testPositivePatterns()
  await testNegativePatterns()
  await testDateFormat()
  await testRequiredFields()
  await testRootCauseRatioAmongNegative()
  console.log('demoWorkData tests passed')
}

void run()
