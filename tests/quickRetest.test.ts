import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useExperienceStore } from '../src/stores/experience'
import { verificationRank } from '../src/services/ruleLabels'
import type { ExperienceRule } from '../src/types/experience'
import type { ObservationModelClient } from '../src/services/modelAnalysisAdapter'

// ---------------------------------------------------------------------------
// V3 就地复测:verificationRank 排序(待验证→谨慎→可信)+ addEvaluation 快速复测路径。
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

function strategyRaw(title: string, category: string) {
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
    location: undefined,
  }
}

// trustSignal 输入字段够用即可的伪规则(镜像 trustSignal.test.ts 写法)
function ruleWith(p: {
  verdict?: ExperienceRule['evaluationVerdict']
  confidence?: ExperienceRule['evaluationConfidence']
  score?: number
  evals?: number
}): ExperienceRule {
  return {
    evaluationVerdict: p.verdict,
    evaluationConfidence: p.confidence,
    evaluationScore: p.score,
    evaluations: Array.from({ length: p.evals ?? 0 }, () => ({})),
  } as unknown as ExperienceRule
}

// verificationRank:三态映射 + 排序
{
  const unproven = ruleWith({ verdict: 'insufficient', evals: 0 })
  const caution = ruleWith({ verdict: 'mixed', evals: 4 })
  const trusted = ruleWith({ verdict: 'supported', confidence: 'high', score: 80, evals: 3 })
  assert.equal(verificationRank(unproven), 0, '待验证应排最前')
  assert.equal(verificationRank(caution), 1)
  assert.equal(verificationRank(trusted), 2, '可信应沉底')
  const sorted = [trusted, unproven, caution].slice().sort((a, b) => verificationRank(a) - verificationRank(b))
  assert.deepEqual(sorted, [unproven, caution, trusted], '排序:待验证→谨慎→可信')
}

async function asyncTests() {
  // 快速复测:一键 + 一句 → evaluations +1,observationText 落成证据
  {
    const store = makeStore()
    await store.submitObservation('工作场景甲一二三', makeFakeClient(strategyRaw('对齐策略', '工作')))
    const id = store.rules[0]!.id
    store.addEvaluation(id, 'passed', '', '这次也按时交付了', 'manual')
    const evals = store.rules[0]!.evaluations ?? []
    assert.equal(evals.length, 1, '快速复测应记一次评估')
    assert.equal(evals[0]!.outcome, 'passed')
    assert.equal(evals[0]!.observationText, '这次也按时交付了', '填的一句应作为证据')
  }

  // 快速复测:一键不填证据 → 仍记一次,不抛错
  {
    const store = makeStore()
    await store.submitObservation('运动场景甲一二三', makeFakeClient(strategyRaw('高峰期避开', '运动')))
    const id = store.rules[0]!.id
    store.addEvaluation(id, 'failed', '', '', 'manual')
    assert.equal((store.rules[0]!.evaluations ?? []).length, 1, '不填证据也应记一次')
  }
}

asyncTests()
  .then(() => console.log('quickRetest tests passed'))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
