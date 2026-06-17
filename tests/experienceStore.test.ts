import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { deriveEvaluationState } from '../src/services/evaluationEngine'
import { useExperienceStore } from '../src/stores/experience'
import type { ExperienceRule, RuleEvaluation } from '../src/types/experience'

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

function makeRule(): ExperienceRule {
  const rule: ExperienceRule = {
    id: 'rule_store_test',
    title: '周末 10 点健身房人少',
    category: '运动',
    conclusion: '周末上午晚一点到场更容易避开排队。',
    recommendation: '周末 10 点后再去健身房。',
    conditions: ['周末', '上午'],
    warnings: [],
    evidenceIds: [],
    reusability: 'watch',
    feedback: 'none',
    reviewStatus: 'unreviewed',
    evaluations: [],
    updatedAt: '2026-06-01T00:00:00.000Z',
  }

  Object.assign(rule, deriveEvaluationState(rule))
  return rule
}

function makeSlotEvaluation(id: string, focus: 'confirmation' | 'boundary' | 'contrast' | 'expansion', createdAt: string): RuleEvaluation {
  return {
    id,
    outcome: 'passed',
    note: `${focus} 样本。`,
    createdAt,
    observationId: `obs_${id}`,
    observationText: `${focus} 场景。`,
    source: 'plan',
    replicationSlotFocus: focus,
    planSnapshot: {
      priority: 'medium',
      focus,
      scenarioPrompt: `${focus} 场景`,
      evidencePrompt: `${focus} 证据`,
      reason: `${focus} 原因`,
    },
    protocolSnapshot: {
      focus,
      title: `${focus} 协议`,
      scenario: `${focus} 场景`,
      passCriteria: ['仍成立'],
      failCriteria: ['不成立'],
      uncertainCriteria: ['无法判断'],
      requiredEvidence: ['场景证据'],
      cadenceDays: 7,
    },
    protocolExecution: {
      status: 'complete',
      score: 100,
      checkedAt: createdAt,
      matchedCriteria: ['仍成立'],
      missingEvidence: [],
      checks: [],
      summary: '完整',
    },
  }
}

function makeVersionedSlotEvaluation(id: string, focus: 'confirmation' | 'boundary' | 'contrast' | 'expansion', createdAt: string, ruleVersion: number): RuleEvaluation {
  return {
    ...makeSlotEvaluation(id, focus, createdAt),
    ruleVersion,
  }
}

function testAddEvaluationStoresProtocolSnapshot() {
  installLocalStorage()
  setActivePinia(createPinia())
  const store = useExperienceStore()
  const rule = makeRule()
  store.rules.push(rule)

  store.addEvaluation(rule.id, 'passed', '按协议复测。', '周六 10 点到场，器械不用排队。')

  const evaluation = store.rules[0]?.evaluations?.[0]
  assert.ok(evaluation?.protocolSnapshot)
  assert.equal(evaluation.protocolSnapshot.focus, store.rules[0]?.evaluationProtocol?.focus)
  assert.equal(evaluation.protocolExecution?.status, 'complete')
  assert.equal(evaluation.protocolExecution?.score, 100)
  assert.ok(evaluation.protocolExecution?.matchedCriteria.length)
  assert.equal(store.protocolExecutionQueue.length, 0)
}

function testProtocolExecutionBlocksMissingEvidenceAndRepairsWithAttachment() {
  installLocalStorage()
  setActivePinia(createPinia())
  const store = useExperienceStore()
  const rule = makeRule()
  store.rules.push(rule)

  store.addEvaluation(rule.id, 'passed')

  const evaluation = store.rules[0]?.evaluations?.[0]
  assert.ok(evaluation)
  assert.equal(evaluation?.protocolExecution?.status, 'blocked')
  assert.ok(evaluation?.protocolExecution?.missingEvidence.includes('复测场景'))
  assert.equal(store.protocolExecutionQueue.length, 1)
  assert.equal(store.evaluationQuality.completeProtocolExecution, 0)

  assert.equal(store.attachEvaluationEvidence(rule.id, evaluation.id, '周六 10 点到场，器械不用排队。'), true)

  const repairedEvaluation = store.rules[0]?.evaluations?.[0]
  assert.equal(repairedEvaluation?.protocolExecution?.status, 'complete')
  assert.equal(repairedEvaluation?.protocolExecution?.score, 100)
  assert.equal(store.protocolExecutionQueue.length, 0)
  assert.equal(store.evaluationQuality.completeProtocolExecution, 1)
}

function testProtocolExecutionQueueFindsLegacyGaps() {
  installLocalStorage()
  setActivePinia(createPinia())
  const store = useExperienceStore()
  const rule = makeRule()
  const legacyEvaluation: RuleEvaluation = {
    id: 'eval_legacy',
    outcome: 'passed',
    note: '历史评估。',
    createdAt: '2026-06-02T00:00:00.000Z',
    observationId: 'obs_legacy',
    observationText: '周六 10 点到场。',
  }
  rule.evaluations = [legacyEvaluation]
  store.rules.push(rule)

  assert.equal(store.protocolExecutionQueue.length, 1)
  assert.ok(store.protocolExecutionQueue[0].issues.includes('缺少协议快照'))
}

function testBoundaryCatalogQueuePrioritizesFailedEvaluations() {
  installLocalStorage()
  setActivePinia(createPinia())
  const store = useExperienceStore()
  const rule = makeRule()
  rule.evaluations = [
    {
      id: 'eval_failed',
      outcome: 'failed',
      note: '失败样本。',
      createdAt: '2026-06-03T00:00:00.000Z',
      observationId: 'obs_failed',
      observationText: '周六 10 点仍然排队。',
    },
    {
      id: 'eval_passed',
      outcome: 'passed',
      note: '有效样本。',
      createdAt: '2026-06-02T00:00:00.000Z',
      observationId: 'obs_passed',
      observationText: '周六 10 点不用排队。',
    },
  ]
  Object.assign(rule, deriveEvaluationState(rule))
  store.rules.push(rule)

  assert.equal(store.boundaryCatalogQueue.length, 1)
  assert.equal(store.boundaryCatalogQueue[0].boundary.evaluationId, 'eval_failed')
  assert.equal(store.boundaryCatalogQueue[0].boundary.severity, 'watch')
  assert.equal(store.revisionDraftQueue.length, 1)
  assert.equal(store.revisionDraftQueue[0].id, rule.id)
}

function testApplyRevisionDraftUpdatesRuleAndSuppressesDuplicateDraft() {
  installLocalStorage()
  setActivePinia(createPinia())
  const store = useExperienceStore()
  const rule = makeRule()
  rule.evaluations = [
    {
      id: 'eval_failed',
      outcome: 'failed',
      note: '失败样本。',
      createdAt: '2026-06-03T00:00:00.000Z',
      observationId: 'obs_failed',
      observationText: '周六 10 点仍然排队。',
    },
    {
      id: 'eval_passed',
      outcome: 'passed',
      note: '有效样本。',
      createdAt: '2026-06-02T00:00:00.000Z',
      observationId: 'obs_passed',
      observationText: '周六 10 点不用排队。',
    },
  ]
  Object.assign(rule, deriveEvaluationState(rule))
  store.rules.push(rule)

  const draft = store.rules[0].revisionDraft
  assert.ok(draft)

  assert.equal(store.applyRevisionDraft(rule.id), true)

  const updatedRule = store.rules[0]
  assert.equal(updatedRule.revisionVersion, 1)
  assert.equal(updatedRule.revisionHistory?.length, 1)
  assert.equal(updatedRule.revisionHistory?.[0].draftId, draft.id)
  assert.equal(updatedRule.conclusion, draft.conclusion)
  assert.equal(updatedRule.recommendation, draft.recommendation)
  assert.ok(updatedRule.conditions.some((condition) => condition.includes('排除条件')))
  assert.ok(updatedRule.warnings.some((warning) => warning.includes('排除场景')))
  assert.equal(updatedRule.revisionDraft, undefined)
  assert.equal(store.revisionDraftQueue.length, 0)
  assert.equal(updatedRule.versionCoverageProfile?.status, 'unretested')
  assert.equal(updatedRule.versionCoverageProfile?.currentVersion, 1)
  assert.equal(updatedRule.versionCoverageProfile?.currentVersionEvaluationCount, 0)
  assert.equal(updatedRule.versionCoverageProfile?.historicalEvaluationCount, 2)
  assert.equal(updatedRule.adoptionDecision, 'retest')
  assert.ok(updatedRule.adoptionGate?.blockers.some((item) => item.includes('当前版本复测')))
  assert.equal(store.versionCoverageQueue[0]?.id, rule.id)
  assert.equal(store.versionCoverageStats.unretestedRuleCount, 1)
  assert.equal(store.evaluationQueue[0]?.id, rule.id)

  store.addEvaluation(rule.id, 'passed', '修订后首次复测。', '周六 10 点按新排除条件执行，不用排队。')
  const firstRetestRule = store.rules[0]
  assert.equal(firstRetestRule.evaluations?.[0]?.ruleVersion, 1)
  assert.equal(firstRetestRule.versionCoverageProfile?.status, 'partial')
  assert.equal(firstRetestRule.versionCoverageProfile?.currentVersionEvaluationCount, 1)

  store.addEvaluation(rule.id, 'passed', '修订后第二次复测。', '周日 10 点避开排除场景后，不用排队。')
  const secondRetestRule = store.rules[0]
  assert.equal(secondRetestRule.evaluations?.[0]?.ruleVersion, 1)
  assert.equal(secondRetestRule.versionCoverageProfile?.status, 'covered')
  assert.equal(secondRetestRule.versionCoverageProfile?.currentVersionEvaluationCount, 2)
  assert.equal(secondRetestRule.versionCoverageProfile?.historicalEvaluationCount, 2)
  assert.equal(store.versionCoverageQueue.length, 0)
  assert.equal(store.versionCoverageStats.blockedRuleCount, 0)

  const exported = store.exportEvaluationData()
  assert.equal(exported.summary.currentVersionEvaluationCount, 2)
  assert.equal(exported.summary.historicalVersionEvaluationCount, 2)
  assert.equal(exported.rules[0]?.versionCoverageProfile?.status, 'covered')
  const csv = store.exportEvaluationCsv()
  assert.ok(csv.includes('evaluationRuleVersion'))
  assert.ok(csv.includes('versionCoverageStatus'))
  assert.ok(csv.includes('historicalVersionEvaluationCount'))
}

function testVersionIsolationAffectsQueuesAndRecall() {
  installLocalStorage()
  setActivePinia(createPinia())
  const store = useExperienceStore()
  store.updateEvaluationSettings({ normalReviewDays: 30, replicationMaintenanceDays: 7 })

  const rule = makeRule()
  rule.id = 'rule_version_isolation'
  rule.revisionVersion = 1
  rule.title = '周日 10 点健身房人多'
  rule.conclusion = '修订后需要避开周日早高峰。'
  rule.recommendation = '周日 10 点不要去。'
  rule.evaluations = [
    makeVersionedSlotEvaluation('eval_v1_pass', 'confirmation', '2026-06-10T00:00:00.000Z', 1),
    makeVersionedSlotEvaluation('eval_v0_fail', 'boundary', '2026-06-09T00:00:00.000Z', 0),
    makeVersionedSlotEvaluation('eval_v0_pass', 'contrast', '2026-06-08T00:00:00.000Z', 0),
  ]
  Object.assign(rule, deriveEvaluationState(rule))
  store.rules.push(rule)

  assert.equal(store.versionCoverageQueue[0]?.id, rule.id)
  assert.equal(store.evaluationQueue[0]?.id, rule.id)
  assert.equal(store.repeatEvaluatedRuleCount, 0)
  assert.equal(store.replicationMaintenanceStats.maintenanceEvaluationCount, 0)
  assert.equal(store.recallEvaluationCandidates('周日 10 点健身房人多')[0]?.ruleId, rule.id)
  assert.ok(store.recallEvaluationCandidates('周日 10 点健身房人多')[0]?.reasons.some((item) => item.includes('标题匹配')))

  store.addEvaluation(rule.id, 'passed', '修订后第二次复测。', '周日 10 点继续按新版本复测。')
  assert.equal(store.repeatEvaluatedRuleCount, 1)
  assert.equal(store.versionCoverageQueue.length, 0)
  assert.equal(store.evaluationQueue[0]?.id, rule.id)
  assert.equal(store.exportEvaluationData().summary.currentVersionEvaluationCount, 2)
  assert.equal(store.exportEvaluationData().summary.historicalVersionEvaluationCount, 2)
  assert.equal(store.exportEvaluationData().summary.protocolComplianceAlignedRuleCount, 1)
  assert.equal(store.exportEvaluationData().rules[0]?.protocolComplianceProfile?.status, 'aligned')
  assert.ok(store.exportEvaluationCsv().includes('protocolComplianceStatus'))
  assert.ok(store.exportEvaluationCsv().includes('protocolCompleteExecutionCount'))
}

function testReplicationSlotEvaluationUsesFocusSpecificSnapshots() {
  installLocalStorage()
  setActivePinia(createPinia())
  const store = useExperienceStore()
  const rule = makeRule()
  rule.evaluations = [
    {
      id: 'eval_1',
      outcome: 'passed',
      note: '确认样本。',
      createdAt: '2026-06-01T00:00:00.000Z',
      observationId: 'obs_1',
      observationText: '周末 10 点健身房人少。',
      source: 'plan',
      planSnapshot: {
        priority: 'high',
        focus: 'confirmation',
        scenarioPrompt: '确认场景',
        evidencePrompt: '确认证据',
        reason: '确认原因',
      },
      protocolSnapshot: {
        focus: 'confirmation',
        title: '确认协议',
        scenario: '确认场景',
        passCriteria: ['仍成立'],
        failCriteria: ['不成立'],
        uncertainCriteria: ['无法判断'],
        requiredEvidence: ['场景证据'],
        cadenceDays: 7,
      },
    },
  ]
  Object.assign(rule, deriveEvaluationState(rule))
  store.rules.push(rule)

  assert.equal(store.evaluateReplicationSlot(rule.id, 'boundary', 'failed'), true)

  const evaluation = store.rules[0]?.evaluations?.[0]
  assert.ok(evaluation)
  assert.equal(evaluation?.source, 'plan')
  assert.equal(evaluation?.cycle, 'fill')
  assert.equal(evaluation?.replicationSlotFocus, 'boundary')
  assert.equal(evaluation?.planSnapshot?.focus, 'boundary')
  assert.equal(evaluation?.protocolSnapshot?.focus, 'boundary')
  assert.ok(evaluation?.note.includes('边界槽位'))
  assert.ok(evaluation?.protocolExecution)
  assert.ok(store.replicationMatrixQueue.length > 0)
  assert.ok(store.exportEvaluationCsv().includes('replicationSlotFocus'))
}

function testNextReplicationSlotEvaluationUsesMatrixRecommendation() {
  installLocalStorage()
  setActivePinia(createPinia())
  const store = useExperienceStore()
  const rule = makeRule()
  rule.evaluations = [
    {
      id: 'eval_1',
      outcome: 'passed',
      note: '确认样本。',
      createdAt: '2026-06-01T00:00:00.000Z',
      observationId: 'obs_1',
      observationText: '周末 10 点健身房人少。',
      source: 'plan',
      replicationSlotFocus: 'confirmation',
      planSnapshot: {
        priority: 'high',
        focus: 'confirmation',
        scenarioPrompt: '确认场景',
        evidencePrompt: '确认证据',
        reason: '确认原因',
      },
    },
  ]
  Object.assign(rule, deriveEvaluationState(rule))
  store.rules.push(rule)

  assert.equal(store.rules[0]?.evaluationReplicationMatrix?.nextFocus, 'confirmation')
  assert.equal(store.evaluateNextReplicationSlot(rule.id, 'passed'), true)

  const evaluation = store.rules[0]?.evaluations?.[0]
  assert.equal(evaluation?.cycle, 'fill')
  assert.equal(evaluation?.replicationSlotFocus, 'confirmation')
  assert.equal(evaluation?.planSnapshot?.focus, 'confirmation')
  assert.equal(store.rules[0]?.evaluationReplicationMatrix?.nextFocus, 'boundary')
}

function testReplicationSlotFocusOverridesLegacySnapshots() {
  installLocalStorage()
  setActivePinia(createPinia())
  const store = useExperienceStore()
  const rule = makeRule()
  rule.evaluations = [
    {
      id: 'eval_legacy_plan',
      outcome: 'passed',
      note: '旧样本。',
      createdAt: '2026-06-01T00:00:00.000Z',
      observationId: 'obs_legacy',
      observationText: '周末 10 点健身房人少。',
      replicationSlotFocus: 'contrast',
      planSnapshot: {
        priority: 'high',
        focus: 'confirmation',
        scenarioPrompt: '旧计划',
        evidencePrompt: '旧证据',
        reason: '旧原因',
      },
      protocolSnapshot: {
        focus: 'confirmation',
        title: '旧协议',
        scenario: '旧场景',
        passCriteria: ['仍成立'],
        failCriteria: ['不成立'],
        uncertainCriteria: ['无法判断'],
        requiredEvidence: ['证据'],
        cadenceDays: 7,
      },
    },
  ]
  Object.assign(rule, deriveEvaluationState(rule))
  store.rules.push(rule)

  const state = store.rules[0]
  assert.equal(state.evaluationConsistencyProfile?.focusSummaries.some((item) => item.focus === 'contrast'), true)
  assert.equal(state.evaluationConsistencyProfile?.focusSummaries.some((item) => item.focus === 'confirmation'), false)
  assert.equal(state.evaluationReplicationMatrix?.slots.find((slot) => slot.focus === 'contrast')?.completedCount, 1)
}

function testReplicationMatrixPrioritizesBlockedRules() {
  const originalNow = Date.now
  Date.now = () => new Date('2026-06-16T00:00:00.000Z').getTime()

  try {
  installLocalStorage()
  setActivePinia(createPinia())
  const store = useExperienceStore()
  store.updateEvaluationSettings({ replicationMaintenanceDays: 7 })
  const blockedRule = makeRule()
  blockedRule.id = 'rule_blocked'
  blockedRule.evaluations = [
    {
      id: 'eval_blocked_1',
      outcome: 'passed',
      note: '有效。',
      createdAt: '2026-06-03T00:00:00.000Z',
      observationId: 'obs_blocked_1',
      observationText: '周末 10 点健身房人少。',
      replicationSlotFocus: 'boundary',
    },
    {
      id: 'eval_blocked_2',
      outcome: 'failed',
      note: '无效。',
      createdAt: '2026-06-02T00:00:00.000Z',
      observationId: 'obs_blocked_2',
      observationText: '周末 10 点健身房排队。',
      replicationSlotFocus: 'boundary',
    },
  ]
  Object.assign(blockedRule, deriveEvaluationState(blockedRule))
  const normalRule = makeRule()
  normalRule.id = 'rule_normal'
  normalRule.title = '正常规则'
  normalRule.evaluations = [
    {
      id: 'eval_normal_1',
      outcome: 'passed',
      note: '有效。',
      createdAt: '2026-06-03T00:00:00.000Z',
      observationId: 'obs_normal_1',
      observationText: '确认样本。',
      replicationSlotFocus: 'confirmation',
      planSnapshot: {
        priority: 'high',
        focus: 'confirmation',
        scenarioPrompt: '确认',
        evidencePrompt: '证据',
        reason: '原因',
      },
      protocolSnapshot: {
        focus: 'confirmation',
        title: '协议',
        scenario: '场景',
        passCriteria: ['仍成立'],
        failCriteria: ['不成立'],
        uncertainCriteria: ['无法判断'],
        requiredEvidence: ['证据'],
        cadenceDays: 7,
      },
      protocolExecution: {
        status: 'complete',
        score: 100,
        checkedAt: '2026-06-03T00:00:00.000Z',
        matchedCriteria: ['仍成立'],
        missingEvidence: [],
        checks: [],
        summary: '完整',
      },
    },
  ]
  Object.assign(normalRule, deriveEvaluationState(normalRule))
  const maintenanceRule = makeRule()
  maintenanceRule.id = 'rule_critical_maintenance'
  maintenanceRule.title = '严重维护规则'
  maintenanceRule.evaluations = [
    makeSlotEvaluation('critical_confirmation_2', 'confirmation', '2026-05-05T00:00:00.000Z'),
    makeSlotEvaluation('critical_expansion', 'expansion', '2026-05-04T00:00:00.000Z'),
    makeSlotEvaluation('critical_contrast', 'contrast', '2026-05-03T00:00:00.000Z'),
    makeSlotEvaluation('critical_boundary', 'boundary', '2026-05-02T00:00:00.000Z'),
    makeSlotEvaluation('critical_confirmation_1', 'confirmation', '2026-05-01T00:00:00.000Z'),
  ]
  Object.assign(maintenanceRule, deriveEvaluationState(maintenanceRule))
  store.rules.push(blockedRule, normalRule, maintenanceRule)

  assert.equal(store.replicationMaintenanceHealth(maintenanceRule).level, 'critical')
  assert.equal(store.replicationMatrixQueue[0]?.id, blockedRule.id)
  assert.equal(store.evaluationQueue[0]?.id, blockedRule.id)
  } finally {
    Date.now = originalNow
  }
}

function testReplicationMatrixPrioritizesReadyMaintenance() {
  const originalNow = Date.now
  Date.now = () => new Date('2026-06-16T00:00:00.000Z').getTime()

  try {
    installLocalStorage()
    setActivePinia(createPinia())
    const store = useExperienceStore()
    store.updateEvaluationSettings({ normalReviewDays: 30, replicationMaintenanceDays: 7 })
    assert.equal(store.evaluationSettings.normalReviewDays, 30)
    assert.equal(store.evaluationSettings.replicationMaintenanceDays, 7)

    const freshRule = makeRule()
    freshRule.id = 'rule_fresh_ready'
    freshRule.updatedAt = '2026-06-15T00:00:00.000Z'
    freshRule.evaluations = [
      makeSlotEvaluation('fresh_confirmation_2', 'confirmation', '2026-06-15T00:00:00.000Z'),
      makeSlotEvaluation('fresh_expansion', 'expansion', '2026-06-14T00:00:00.000Z'),
      makeSlotEvaluation('fresh_contrast', 'contrast', '2026-06-13T00:00:00.000Z'),
      makeSlotEvaluation('fresh_boundary', 'boundary', '2026-06-12T00:00:00.000Z'),
      makeSlotEvaluation('fresh_confirmation_1', 'confirmation', '2026-06-11T00:00:00.000Z'),
    ]
    Object.assign(freshRule, deriveEvaluationState(freshRule))

    const staleRule = makeRule()
    staleRule.id = 'rule_stale_ready'
    staleRule.updatedAt = '2026-05-05T00:00:00.000Z'
    staleRule.evaluations = [
      makeSlotEvaluation('stale_confirmation_2', 'confirmation', '2026-05-05T00:00:00.000Z'),
      makeSlotEvaluation('stale_expansion', 'expansion', '2026-05-04T00:00:00.000Z'),
      makeSlotEvaluation('stale_contrast', 'contrast', '2026-05-03T00:00:00.000Z'),
      makeSlotEvaluation('stale_boundary', 'boundary', '2026-05-02T00:00:00.000Z'),
      makeSlotEvaluation('stale_confirmation_1', 'confirmation', '2026-05-01T00:00:00.000Z'),
    ]
    Object.assign(staleRule, deriveEvaluationState(staleRule))

    const lightlyOverdueRule = makeRule()
    lightlyOverdueRule.id = 'rule_lightly_overdue_ready'
    lightlyOverdueRule.updatedAt = '2026-06-08T00:00:00.000Z'
    lightlyOverdueRule.evaluations = [
      makeSlotEvaluation('light_confirmation_2', 'confirmation', '2026-06-08T00:00:00.000Z'),
      makeSlotEvaluation('light_expansion', 'expansion', '2026-06-08T00:00:00.000Z'),
      makeSlotEvaluation('light_contrast', 'contrast', '2026-06-08T00:00:00.000Z'),
      makeSlotEvaluation('light_boundary', 'boundary', '2026-06-08T00:00:00.000Z'),
      makeSlotEvaluation('light_confirmation_1', 'confirmation', '2026-06-08T00:00:00.000Z'),
    ]
    Object.assign(lightlyOverdueRule, deriveEvaluationState(lightlyOverdueRule))

    const singleDueRule = makeRule()
    singleDueRule.id = 'rule_single_due_ready'
    singleDueRule.updatedAt = '2026-06-09T00:00:00.000Z'
    singleDueRule.evaluations = [
      makeSlotEvaluation('single_expansion', 'expansion', '2026-06-15T00:00:00.000Z'),
      makeSlotEvaluation('single_contrast', 'contrast', '2026-06-14T00:00:00.000Z'),
      makeSlotEvaluation('single_confirmation_2', 'confirmation', '2026-06-13T00:00:00.000Z'),
      makeSlotEvaluation('single_boundary', 'boundary', '2026-06-08T00:00:00.000Z'),
      makeSlotEvaluation('single_confirmation_1', 'confirmation', '2026-06-13T00:00:00.000Z'),
    ]
    Object.assign(singleDueRule, deriveEvaluationState(singleDueRule))

    const rotatedRule = makeRule()
    rotatedRule.id = 'rule_rotated_slot_due'
    rotatedRule.updatedAt = '2026-06-15T00:00:00.000Z'
    rotatedRule.evaluations = [
      makeSlotEvaluation('rotated_expansion', 'expansion', '2026-06-15T00:00:00.000Z'),
      makeSlotEvaluation('rotated_confirmation_2', 'confirmation', '2026-06-14T00:00:00.000Z'),
      makeSlotEvaluation('rotated_contrast', 'contrast', '2026-06-13T00:00:00.000Z'),
      makeSlotEvaluation('rotated_boundary', 'boundary', '2026-05-01T00:00:00.000Z'),
      makeSlotEvaluation('rotated_confirmation_1', 'confirmation', '2026-06-12T00:00:00.000Z'),
    ]
    Object.assign(rotatedRule, deriveEvaluationState(rotatedRule))

    store.rules.push(freshRule, lightlyOverdueRule, singleDueRule, staleRule, rotatedRule)

    assert.equal(staleRule.evaluationReplicationMatrix?.status, 'ready')
    assert.equal(staleRule.evaluationReplicationMatrix?.nextFocus, 'boundary')
    assert.equal(rotatedRule.evaluationReplicationMatrix?.nextFocus, 'boundary')
    assert.equal(singleDueRule.evaluationReplicationMatrix?.nextFocus, 'boundary')
    assert.equal(store.replicationMaintenanceInfo(staleRule).due, true)
    assert.equal(store.replicationMaintenanceInfo(staleRule).overdueDays, 38)
    assert.equal(store.replicationMaintenanceInfo(lightlyOverdueRule).overdueDays, 1)
    assert.equal(store.replicationMaintenanceInfo(singleDueRule).overdueDays, 1)
    assert.equal(store.replicationMaintenanceInfo(rotatedRule).overdueDays, 39)
    assert.equal(store.replicationMaintenanceHealth(freshRule).level, 'healthy')
    assert.equal(store.replicationMaintenanceHealth(singleDueRule).level, 'due')
    assert.equal(store.replicationMaintenanceHealth(lightlyOverdueRule).level, 'critical')
    assert.equal(store.replicationMaintenanceHealth(staleRule).level, 'critical')
    assert.equal(store.replicationMaintenanceHealth(rotatedRule).level, 'critical')
    assert.equal(store.replicationMaintenanceHealth(rotatedRule).dueSlotCount, 1)
    assert.equal(store.replicationMaintenanceHealth(lightlyOverdueRule).dueSlotCount, 4)
    assert.ok(store.replicationMaintenanceHealth(rotatedRule).reason.includes('最大超期 39 天'))
    assert.equal(store.replicationSlotMaintenanceInfo(rotatedRule, 'boundary').due, true)
    assert.equal(store.replicationSlotMaintenanceInfo(rotatedRule, 'boundary').overdueDays, 39)
    assert.equal(store.replicationSlotMaintenanceInfo(rotatedRule, 'expansion').due, false)
    assert.ok(store.replicationSlotMaintenanceInfo(rotatedRule, 'boundary').reason.includes('边界槽位'))
    assert.ok(store.replicationMaintenanceInfo(staleRule).reason.includes('维护周期'))
    assert.equal(store.replicationMaintenanceStats.readyRuleCount, 5)
    assert.equal(store.replicationMaintenanceStats.dueRuleCount, 4)
    assert.equal(store.replicationMaintenanceStats.dueSlotCount, 10)
    assert.deepEqual(store.replicationMaintenanceStats.dueFocuses, ['confirmation', 'boundary', 'contrast', 'expansion'])
    assert.deepEqual(store.replicationMaintenanceStats.dueFocusCounts, {
      confirmation: 2,
      boundary: 4,
      contrast: 2,
      expansion: 2,
    })
    assert.equal(store.replicationMaintenanceStats.overdueMaxDays, 39)
    assert.deepEqual(store.replicationMaintenanceStats.healthCounts, {
      healthy: 1,
      due: 1,
      risk: 0,
      critical: 3,
    })
    assert.equal(store.replicationMaintenanceStats.criticalRuleCount, 3)
    assert.equal(store.replicationMaintenanceStats.riskRuleCount, 0)
    assert.equal(store.replicationMaintenanceBacklog.length, 10)
    assert.equal(store.replicationMaintenanceBacklog[0]?.rule.id, rotatedRule.id)
    assert.equal(store.replicationMaintenanceBacklog[0]?.focus, 'boundary')
    assert.equal(store.replicationMaintenanceBacklog[0]?.info.overdueDays, 39)
    assert.equal(store.replicationMaintenanceBacklog[0]?.health.level, 'critical')
    assert.equal(store.replicationMaintenanceBacklog[1]?.rule.id, staleRule.id)
    assert.equal(store.replicationMaintenanceBacklog[1]?.focus, 'boundary')
    assert.equal(store.replicationMaintenanceBacklog[2]?.rule.id, staleRule.id)
    assert.equal(store.replicationMaintenanceBacklog[2]?.focus, 'contrast')
    assert.equal(store.replicationMaintenanceStats.topBacklog[0]?.ruleId, rotatedRule.id)
    assert.equal(store.replicationMaintenanceStats.topBacklog[0]?.focus, 'boundary')
    assert.equal(store.replicationMatrixQueue[0]?.id, rotatedRule.id)
    assert.equal(store.replicationMatrixQueue[1]?.id, staleRule.id)
    assert.equal(store.replicationMatrixQueue[2]?.id, lightlyOverdueRule.id)
    assert.equal(store.replicationMatrixQueue[3]?.id, singleDueRule.id)
    assert.equal(store.evaluationQueue[0]?.id, rotatedRule.id)
    assert.equal(store.evaluationQueue[1]?.id, staleRule.id)
    assert.equal(store.evaluationQueue[2]?.id, lightlyOverdueRule.id)
    assert.equal(store.evaluationQueue[3]?.id, singleDueRule.id)
    assert.equal(store.evaluationAnalysis.actionable, 4)
    assert.equal(store.exportEvaluationData().summary.replicationMaintenanceDueRuleCount, 4)
    assert.equal(store.exportEvaluationData().summary.averageSampleIndependenceScore > 0, true)
    assert.equal(store.exportEvaluationData().summary.weakSampleIndependenceRuleCount >= 0, true)
    assert.equal(store.exportEvaluationData().summary.replicationMaintenanceDueSlotCount, 10)
    assert.deepEqual(store.exportEvaluationData().summary.replicationMaintenanceDueFocuses, ['confirmation', 'boundary', 'contrast', 'expansion'])
    assert.deepEqual(store.exportEvaluationData().summary.replicationMaintenanceDueFocusCounts, {
      confirmation: 2,
      boundary: 4,
      contrast: 2,
      expansion: 2,
    })
    assert.equal(store.exportEvaluationData().summary.replicationMaintenanceOverdueMaxDays, 39)
    assert.deepEqual(store.exportEvaluationData().summary.replicationMaintenanceHealthCounts, {
      healthy: 1,
      due: 1,
      risk: 0,
      critical: 3,
    })
    assert.equal(store.exportEvaluationData().summary.replicationMaintenanceCriticalRuleCount, 3)
    assert.equal(store.exportEvaluationData().summary.replicationMaintenanceRiskRuleCount, 0)
    assert.equal(store.exportEvaluationData().summary.replicationMaintenanceBacklog[0]?.ruleId, rotatedRule.id)
    assert.equal(store.exportEvaluationData().summary.replicationMaintenanceBacklog[0]?.focus, 'boundary')
    assert.equal(store.exportEvaluationData().replicationMaintenanceBacklog[0]?.ruleId, rotatedRule.id)
    assert.equal(store.exportEvaluationData().replicationMaintenanceBacklog[0]?.health, 'critical')
    assert.equal(store.exportEvaluationData().rules.find((rule) => rule.id === rotatedRule.id)?.replicationMaintenanceHealth.level, 'critical')
    assert.ok(store.exportEvaluationCsv().includes('replicationMaintenanceDue'))
    assert.ok(store.exportEvaluationCsv().includes('sampleIndependenceScore'))
    assert.ok(store.exportEvaluationCsv().includes('sampleIndependenceLevel'))
    assert.ok(store.exportEvaluationCsv().includes('replicationMaintenanceDueSlotCount'))
    assert.ok(store.exportEvaluationCsv().includes('replicationMaintenanceDueFocuses'))
    assert.ok(store.exportEvaluationCsv().includes('replicationMaintenanceDueFocusCounts'))
    assert.ok(store.exportEvaluationCsv().includes('replicationMaintenanceHealth'))
    assert.ok(store.exportEvaluationCsv().includes('critical'))
    assert.ok(store.exportEvaluationCsv().includes('due'))
    assert.ok(store.exportEvaluationCsv().includes('confirmation:1;boundary:1;contrast:1;expansion:1'))
    assert.ok(store.exportEvaluationCsv().includes('true,38'))
    assert.equal(store.evaluateReplicationSlot(rotatedRule.id, 'boundary', 'passed'), true)
    const slotMaintenanceEvaluation = store.rules.find((rule) => rule.id === rotatedRule.id)?.evaluations?.[0]
    assert.equal(slotMaintenanceEvaluation?.cycle, 'maintenance')
    assert.equal(slotMaintenanceEvaluation?.replicationSlotFocus, 'boundary')
    assert.equal(store.replicationMaintenanceStats.maintenanceEvaluationCount, 1)
    assert.equal(store.replicationMaintenanceBacklog.some((item) => item.rule.id === rotatedRule.id && item.focus === 'boundary'), false)
    assert.equal(store.replicationMaintenanceBacklog[0]?.rule.id, staleRule.id)
    assert.equal(store.replicationMaintenanceBacklog[0]?.focus, 'boundary')
    assert.equal(store.evaluateNextReplicationSlot(staleRule.id, 'passed'), true)
    const maintenanceEvaluation = store.rules.find((rule) => rule.id === staleRule.id)?.evaluations?.[0]
    assert.equal(maintenanceEvaluation?.cycle, 'maintenance')
    assert.equal(maintenanceEvaluation?.replicationSlotFocus, 'boundary')
    assert.equal(store.replicationMaintenanceStats.maintenanceEvaluationCount, 2)
    assert.equal(store.exportEvaluationData().summary.maintenanceEvaluationCount, 2)
    assert.equal(store.evaluateReplicationSlot(freshRule.id, 'expansion', 'passed'), true)
    const directMaintenanceEvaluation = store.rules.find((rule) => rule.id === freshRule.id)?.evaluations?.[0]
    assert.equal(directMaintenanceEvaluation?.cycle, 'maintenance')
    assert.equal(directMaintenanceEvaluation?.replicationSlotFocus, 'expansion')
    assert.ok(directMaintenanceEvaluation?.note.includes('维护抽样'))
    assert.equal(store.replicationMaintenanceStats.maintenanceEvaluationCount, 3)
    assert.ok(store.exportEvaluationCsv().includes('evaluationCycle'))
    assert.ok(store.exportEvaluationCsv().includes('maintenance'))
  } finally {
    Date.now = originalNow
  }
}

function testMaintenanceRegressionQueueEscalatesFailedMaintenance() {
  const originalNow = Date.now
  let now = new Date('2026-06-16T00:00:00.000Z').getTime()
  Date.now = () => now

  try {
    installLocalStorage()
    setActivePinia(createPinia())
    const store = useExperienceStore()
    store.updateEvaluationSettings({ normalReviewDays: 30, replicationMaintenanceDays: 7 })

    const regressionRule = makeRule()
    regressionRule.id = 'rule_failed_maintenance'
    regressionRule.updatedAt = '2026-06-15T00:00:00.000Z'
    regressionRule.evaluations = [
      makeSlotEvaluation('regression_expansion', 'expansion', '2026-06-15T00:00:00.000Z'),
      makeSlotEvaluation('regression_confirmation_2', 'confirmation', '2026-06-14T00:00:00.000Z'),
      makeSlotEvaluation('regression_contrast', 'contrast', '2026-06-13T00:00:00.000Z'),
      makeSlotEvaluation('regression_boundary', 'boundary', '2026-05-01T00:00:00.000Z'),
      makeSlotEvaluation('regression_confirmation_1', 'confirmation', '2026-06-12T00:00:00.000Z'),
    ]
    Object.assign(regressionRule, deriveEvaluationState(regressionRule))

    const dueRule = makeRule()
    dueRule.id = 'rule_plain_due'
    dueRule.updatedAt = '2026-06-08T00:00:00.000Z'
    dueRule.evaluations = [
      makeSlotEvaluation('plain_confirmation_2', 'confirmation', '2026-06-08T00:00:00.000Z'),
      makeSlotEvaluation('plain_expansion', 'expansion', '2026-06-08T00:00:00.000Z'),
      makeSlotEvaluation('plain_contrast', 'contrast', '2026-06-08T00:00:00.000Z'),
      makeSlotEvaluation('plain_boundary', 'boundary', '2026-06-08T00:00:00.000Z'),
      makeSlotEvaluation('plain_confirmation_1', 'confirmation', '2026-06-08T00:00:00.000Z'),
    ]
    Object.assign(dueRule, deriveEvaluationState(dueRule))

    store.rules.push(regressionRule, dueRule)

    assert.equal(store.evaluateReplicationSlot(regressionRule.id, 'boundary', 'failed'), true)
    assert.equal(store.maintenanceRegressionQueue.length, 1)
    assert.equal(store.maintenanceRegressionQueue[0]?.rule.id, regressionRule.id)
    assert.equal(store.maintenanceRegressionQueue[0]?.evaluation.outcome, 'failed')
    assert.equal(store.maintenanceRegressionQueue[0]?.focus, 'boundary')
    assert.equal(store.evaluationQueue[0]?.id, regressionRule.id)
    assert.equal(store.evaluationQueue[1]?.id, dueRule.id)
    assert.equal(store.replicationMaintenanceStats.regressionCount, 1)
    assert.equal(store.replicationMaintenanceStats.failedRegressionCount, 1)
    assert.equal(store.replicationMaintenanceStats.uncertainRegressionCount, 0)
    assert.equal(store.exportEvaluationData().summary.replicationMaintenanceRegressionCount, 1)
    assert.equal(store.exportEvaluationData().maintenanceRegressionQueue[0]?.ruleId, regressionRule.id)
    assert.equal(store.exportEvaluationData().maintenanceRegressionQueue[0]?.focus, 'boundary')
    assert.ok(store.exportEvaluationCsv().includes('maintenanceRegression'))
    assert.ok(store.exportEvaluationCsv().includes('true,boundary,boundary'))
    assert.equal(store.evaluateReplicationSlot(regressionRule.id, 'boundary', 'passed'), true)
    assert.equal(store.maintenanceRegressionQueue.length, 0)
    assert.equal(store.replicationMaintenanceStats.regressionCount, 0)
    assert.equal(store.replicationMaintenanceStats.failedRegressionCount, 0)
    assert.equal(store.exportEvaluationData().summary.replicationMaintenanceRegressionCount, 0)
    assert.equal(store.exportEvaluationData().maintenanceRegressionQueue.length, 0)
    const recoveredRule = store.rules.find((rule) => rule.id === regressionRule.id)
    assert.equal(recoveredRule?.evaluationReplicationMatrix?.status, 'ready')
    assert.equal(recoveredRule?.evaluationReplicationMatrix?.recoveredSlots, 1)
    assert.deepEqual(recoveredRule?.evaluationReplicationMatrix?.recoveryFocuses, ['boundary'])
    assert.equal(recoveredRule?.evaluationReplicationMatrix?.observingRecoveredSlots, 1)
    assert.deepEqual(recoveredRule?.evaluationReplicationMatrix?.recoveryObservationFocuses, ['boundary'])
    assert.equal(recoveredRule?.evaluationReplicationMatrix?.slots.find((slot) => slot.focus === 'boundary')?.recoveredConflictCount, 1)
    assert.equal(recoveredRule?.evaluationReplicationMatrix?.slots.find((slot) => slot.focus === 'boundary')?.recoveryObservationStatus, 'observing')
    assert.ok(recoveredRule?.evaluationReplicationMatrix?.slots.find((slot) => slot.focus === 'boundary')?.recoverySummary?.includes('历史'))
    assert.equal(store.regressionRecoveryQueue.length, 0)
    assert.equal(store.replicationMaintenanceStats.recoveryCount, 0)
    assert.equal(store.exportEvaluationData().summary.replicationMaintenanceRecoveryCount, 0)
    assert.equal(store.exportEvaluationData().summary.replicationRecoveredRuleCount, 1)
    assert.equal(store.exportEvaluationData().summary.replicationRecoveredSlotCount, 1)
    assert.equal(store.exportEvaluationData().summary.replicationRecoveryObservationRuleCount, 1)
    assert.equal(store.exportEvaluationData().summary.replicationRecoveryObservationSlotCount, 1)
    assert.equal(store.exportEvaluationData().regressionRecoveryQueue.length, 0)
    assert.ok(store.exportEvaluationCsv().includes('replicationMatrixRecoveredSlots'))
    assert.ok(store.exportEvaluationCsv().includes('replicationMatrixRecoveryObservationSlots'))
    assert.ok(store.exportEvaluationCsv().includes('boundary'))
    assert.equal(store.evaluationQueue[0]?.id, regressionRule.id)
    now = new Date('2026-06-17T00:00:00.000Z').getTime()
    assert.equal(store.evaluateReplicationSlot(regressionRule.id, 'boundary', 'passed'), true)
    now = new Date('2026-06-18T00:00:00.000Z').getTime()
    assert.equal(store.evaluateReplicationSlot(regressionRule.id, 'boundary', 'passed'), true)
    now = new Date('2026-06-19T00:00:00.000Z').getTime()
    assert.equal(store.evaluateReplicationSlot(regressionRule.id, 'boundary', 'passed'), true)
    const clearedRule = store.rules.find((rule) => rule.id === regressionRule.id)
    assert.equal(clearedRule?.evaluationReplicationMatrix?.status, 'ready')
    assert.equal(clearedRule?.evaluationReplicationMatrix?.recoveredSlots, 1)
    assert.equal(clearedRule?.evaluationReplicationMatrix?.observingRecoveredSlots, 0)
    assert.equal(clearedRule?.evaluationReplicationMatrix?.slots.find((slot) => slot.focus === 'boundary')?.recoveryObservationStatus, 'cleared')
    assert.equal(clearedRule?.adoptionDecision, 'adopt')
    assert.equal(store.exportEvaluationData().summary.replicationRecoveredRuleCount, 1)
    assert.equal(store.exportEvaluationData().summary.replicationRecoveryObservationRuleCount, 0)
    assert.notEqual(store.evaluationQueue[0]?.id, regressionRule.id)
  } finally {
    Date.now = originalNow
  }
}

testAddEvaluationStoresProtocolSnapshot()
testProtocolExecutionBlocksMissingEvidenceAndRepairsWithAttachment()
testProtocolExecutionQueueFindsLegacyGaps()
testBoundaryCatalogQueuePrioritizesFailedEvaluations()
testApplyRevisionDraftUpdatesRuleAndSuppressesDuplicateDraft()
testVersionIsolationAffectsQueuesAndRecall()
testReplicationSlotEvaluationUsesFocusSpecificSnapshots()
testNextReplicationSlotEvaluationUsesMatrixRecommendation()
testReplicationSlotFocusOverridesLegacySnapshots()
testReplicationMatrixPrioritizesBlockedRules()
testReplicationMatrixPrioritizesReadyMaintenance()
testMaintenanceRegressionQueueEscalatesFailedMaintenance()

console.log('experienceStore tests passed')
