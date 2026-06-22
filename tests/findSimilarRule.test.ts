import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useExperienceStore } from '../src/stores/experience'
import type { ObservationModelClient } from '../src/services/modelAnalysisAdapter'

// ---------------------------------------------------------------------------
// 真测真实 store 的规则合并(findSimilarRule / upsertRuleFromAnalysis):
// 经 submitObservation 注入伪 client,走完整 模型→契约→写入 链路。
// 覆盖:I2(kind 不一致不合并)、M5(同名 title 需同 category)、watch 不合并。
// ---------------------------------------------------------------------------

function installLocalStorage() {
  const data = new Map<string, string>()
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
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

function makeFakeClient(raw: unknown): ObservationModelClient {
  return { completeJson: async () => raw }
}

function strategyRaw(title: string, category: string, location?: string) {
  return {
    category,
    tags: ['标签'],
    summary: '摘要',
    title,
    conclusion: '结论说明。',
    recommendation: '可执行的建议。',
    conditions: ['条件一', '条件二'],
    warnings: ['注意'],
    reusability: 'medium',
    direction: 'positive',
    analysisType: 'rule',
    confidence: 'medium',
    location,
  }
}

function cautionRaw(title: string, category: string, location?: string) {
  return { ...strategyRaw(title, category, location), direction: 'negative', analysisType: 'counterexample' }
}

function watchRaw() {
  return {
    category: '其他',
    tags: [],
    summary: '',
    title: '',
    conclusion: '',
    recommendation: '',
    conditions: [],
    warnings: [],
    reusability: 'watch',
    direction: 'uncertain',
    analysisType: 'watch',
    confidence: 'low',
  }
}

// 同 kind + title + category → 合并为 1 条,证据累加
async function testSameKindTitleCategoryMerges() {
  const store = makeStore()
  await store.submitObservation('工作场景甲一二三', makeFakeClient(strategyRaw('对齐策略', '工作')))
  await store.submitObservation('工作场景乙一二三', makeFakeClient(strategyRaw('对齐策略', '工作')))
  assert.equal(store.rules.length, 1, '同 kind+title+category → 合并为 1 条规则')
  assert.equal(store.rules[0].evidenceIds.length, 2, '合并后应累加为 2 条证据')
  assert.equal(store.rules[0].kind, 'strategy')
}

// I2:同 category+location 但 kind 不同(strategy vs caution)→ 不合并
async function testDifferentKindDoesNotMerge() {
  const store = makeStore()
  await store.submitObservation('工作场景甲一二三', makeFakeClient(strategyRaw('对齐策略', '工作', '公司')))
  await store.submitObservation('协作场景乙一二三', makeFakeClient(cautionRaw('目标不一致', '工作', '公司')))
  assert.equal(store.rules.length, 2, 'kind 不同 → 不合并,另建规则')
  const kinds = store.rules.map((r) => r.kind).sort()
  assert.deepEqual(kinds, ['caution', 'strategy'], '应分别为 strategy 与 caution 各一条')
}

// M5:同名 title 但 category 不同 → 不合并
async function testSameTitleDifferentCategoryDoesNotMerge() {
  const store = makeStore()
  await store.submitObservation('运动场景甲一二三', makeFakeClient(strategyRaw('高峰期避开', '运动')))
  await store.submitObservation('出行场景乙一二三', makeFakeClient(strategyRaw('高峰期避开', '出行')))
  assert.equal(store.rules.length, 2, '同名 title 但 category 不同 → 跨领域不合并')
}

// watch 分析始终不合并(findSimilarRule 对 watch 直接返回 undefined)
async function testWatchNeverMerges() {
  const store = makeStore()
  await store.submitObservation('模糊文本甲一二三', makeFakeClient(watchRaw()))
  await store.submitObservation('模糊文本乙一二三', makeFakeClient(watchRaw()))
  assert.equal(store.rules.length, 2, 'watch 不合并,各自建规则')
  assert.ok(store.rules.every((r) => r.kind === 'watch'), '两条均为 watch')
}

async function run() {
  await testSameKindTitleCategoryMerges()
  await testDifferentKindDoesNotMerge()
  await testSameTitleDifferentCategoryDoesNotMerge()
  await testWatchNeverMerges()
  console.log('findSimilarRule tests passed')
}

void run()
