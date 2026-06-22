import assert from 'node:assert/strict'
import { buildPeriodicReview } from '../src/services/periodicReview'
import type { Observation } from '../src/types/experience'

const NOW = new Date('2026-06-22T12:00:00.000Z')

function obs(overrides: Partial<Observation> & { id: string }): Observation {
  return {
    text: '观察',
    category: '工作',
    tags: [],
    summary: '',
    status: 'success',
    createdAt: NOW.toISOString(),
    ...overrides,
  }
}

async function testCountsOnlyInWindowAndSuccess() {
  const data: Observation[] = [
    obs({ id: '1', createdAt: '2026-06-20T00:00:00.000Z' }), // 窗内
    obs({ id: '2', createdAt: '2026-06-01T00:00:00.000Z' }), // 超出 7 天窗
    obs({ id: '3', createdAt: '2026-06-21T00:00:00.000Z', status: 'pending' }), // 非 success
  ]
  const review = buildPeriodicReview(data, 'week', NOW)
  assert.equal(review.totalCount, 1, '仅统计 7 天内且 success 的观察')
  assert.equal(review.period, 'week')
}

async function testTopProblemsAndSuccessesBySentimentTag() {
  const data: Observation[] = [
    obs({ id: 'p1', sentiment: 'negative', tags: ['目标不一致'] }),
    obs({ id: 'p2', sentiment: 'negative', tags: ['目标不一致'] }),
    obs({ id: 'p3', sentiment: 'negative', tags: ['沟通'] }),
    obs({ id: 's1', sentiment: 'positive', tags: ['提前准备'] }),
    obs({ id: 's2', sentiment: 'positive', tags: ['提前准备'] }),
    obs({ id: 'n1', sentiment: 'neutral', tags: ['杂项'] }),
  ]
  const review = buildPeriodicReview(data, 'week', NOW)
  assert.equal(review.topProblems[0].label, '目标不一致')
  assert.equal(review.topProblems[0].count, 2)
  assert.equal(review.topSuccesses[0].label, '提前准备')
  assert.equal(review.topSuccesses[0].count, 2)
  assert.ok(review.suggestion.includes('目标不一致'), '建议应引用最高频问题')
}

async function testEmptyWindowSuggestion() {
  const review = buildPeriodicReview([], 'month', NOW)
  assert.equal(review.totalCount, 0)
  assert.equal(review.topProblems.length, 0)
  assert.ok(review.suggestion.includes('还没有记录'))
}

async function testMonthWindowWiderThanWeek() {
  const data: Observation[] = [obs({ id: 'm1', createdAt: '2026-06-01T00:00:00.000Z', sentiment: 'negative', tags: ['拖延'] })]
  assert.equal(buildPeriodicReview(data, 'week', NOW).totalCount, 0, '6/1 不在 7 天窗内')
  assert.equal(buildPeriodicReview(data, 'month', NOW).totalCount, 1, '6/1 在 30 天窗内')
}

async function run() {
  await testCountsOnlyInWindowAndSuccess()
  await testTopProblemsAndSuccessesBySentimentTag()
  await testEmptyWindowSuggestion()
  await testMonthWindowWiderThanWeek()
  console.log('periodicReview tests passed')
}

void run()
