import assert from 'node:assert/strict'
import { deriveEvaluationState, evaluationPlanPriorityValue, normalizeEvaluationScore } from '../src/services/evaluationEngine'
import type { EvaluationOutcome, ExperienceRule, RuleEvaluation } from '../src/types/experience'

function makeEvaluation(id: string, outcome: EvaluationOutcome, createdAt: string): RuleEvaluation {
  const protocolSnapshot = {
    focus: 'confirmation' as const,
    title: 'confirmation protocol',
    scenario: 'confirmation scenario',
    passCriteria: ['still works'],
    failCriteria: ['does not work'],
    uncertainCriteria: ['unclear'],
    requiredEvidence: ['scenario evidence'],
    cadenceDays: 7,
  }
  return {
    id,
    outcome,
    note: `${outcome} note`,
    createdAt,
    observationId: `obs_${id}`,
    observationText: `${outcome} scenario ${id}`,
    source: 'plan',
    planSnapshot: {
      priority: 'medium',
      focus: 'confirmation',
      scenarioPrompt: 'confirmation scenario',
      evidencePrompt: 'confirmation evidence',
      reason: 'confirmation reason',
    },
    protocolSnapshot,
    protocolExecution: {
      status: 'complete',
      score: 100,
      checkedAt: createdAt,
      matchedCriteria: outcome === 'passed' ? protocolSnapshot.passCriteria : outcome === 'failed' ? protocolSnapshot.failCriteria : protocolSnapshot.uncertainCriteria,
      missingEvidence: [],
      checks: [],
      summary: '完整',
    },
  }
}

function makeLegacyEvaluation(id: string, outcome: EvaluationOutcome, createdAt: string): RuleEvaluation {
  return {
    id,
    outcome,
    note: `${outcome} note`,
    createdAt,
    observationId: `obs_${id}`,
    observationText: `${outcome} scenario ${id}`,
  }
}

function makePlannedEvaluation(id: string, outcome: EvaluationOutcome, createdAt: string, focus: 'confirmation' | 'boundary' | 'contrast' | 'expansion'): RuleEvaluation {
  const protocolSnapshot = {
    focus,
    title: `${focus} protocol`,
    scenario: `${focus} scenario`,
    passCriteria: ['still works'],
    failCriteria: ['does not work'],
    uncertainCriteria: ['unclear'],
    requiredEvidence: ['scenario evidence'],
    cadenceDays: 7,
  }
  return {
    ...makeEvaluation(id, outcome, createdAt),
    source: 'plan',
    planSnapshot: {
      priority: 'medium',
      focus,
      scenarioPrompt: `${focus} scenario`,
      evidencePrompt: `${focus} evidence`,
      reason: `${focus} reason`,
    },
    protocolSnapshot,
    protocolExecution: {
      status: 'complete',
      score: 100,
      checkedAt: createdAt,
      matchedCriteria: outcome === 'passed' ? protocolSnapshot.passCriteria : outcome === 'failed' ? protocolSnapshot.failCriteria : protocolSnapshot.uncertainCriteria,
      missingEvidence: [],
      checks: [],
      summary: '完整',
    },
  }
}

function makeVersionedPlannedEvaluation(id: string, outcome: EvaluationOutcome, createdAt: string, focus: 'confirmation' | 'boundary' | 'contrast' | 'expansion', ruleVersion: number): RuleEvaluation {
  return {
    ...makePlannedEvaluation(id, outcome, createdAt, focus),
    ruleVersion,
  }
}

function makeRule(evaluations: RuleEvaluation[]): ExperienceRule {
  return {
    id: 'rule_test',
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
    evaluations,
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

function testConflictedRule() {
  const state = deriveEvaluationState(
    makeRule([
      makeEvaluation('eval_1', 'failed', '2026-06-06T00:00:00.000Z'),
      makeEvaluation('eval_2', 'failed', '2026-06-05T00:00:00.000Z'),
      makeEvaluation('eval_3', 'passed', '2026-06-04T00:00:00.000Z'),
    ]),
  )

  assert.equal(state.evaluationVerdict, 'conflicted')
  assert.equal(state.adoptionDecision, 'suspend')
  assert.equal(state.reviewStatus, 'needsFix')
  assert.equal(state.reusability, 'watch')
  assert.equal(state.evaluationPlan.priority, 'high')
  assert.equal(state.evaluationPlan.focus, 'boundary')
  assert.equal(state.evaluationProtocol.focus, 'boundary')
  assert.ok(state.evaluationProtocol.failCriteria.some((item) => item.includes('无效样本')))
  assert.equal(state.boundaryCatalog[0]?.severity, 'critical')
  assert.ok(state.boundaryCatalog[0]?.suggestedConstraint.includes('排除条件'))
  assert.equal(state.revisionDraft?.priority, 'high')
  assert.ok(state.revisionDraft?.recommendation.includes('暂停默认采用'))
  assert.ok(state.evaluationScore <= 42)
}

function testSupportedRule() {
  const state = deriveEvaluationState(
    makeRule([
      makePlannedEvaluation('eval_1', 'passed', '2026-06-06T00:00:00.000Z', 'confirmation'),
      makePlannedEvaluation('eval_2', 'passed', '2026-06-05T00:00:00.000Z', 'confirmation'),
      makePlannedEvaluation('eval_3', 'passed', '2026-06-04T00:00:00.000Z', 'boundary'),
    ]),
  )

  assert.equal(state.evaluationVerdict, 'supported')
  assert.equal(state.adoptionDecision, 'retest')
  assert.equal(state.reviewStatus, 'validated')
  assert.equal(state.reusability, 'high')
  assert.equal(state.evaluationConfidence, 'medium')
  assert.equal(state.evaluationPlan.focus, 'expansion')
  assert.equal(state.evaluationProtocol.focus, 'expansion')
  assert.ok(state.evaluationProtocol.passCriteria.some((item) => item.includes('新增时间、地点或对象')))
  assert.equal(state.adoptionGate.ready, false)
  assert.ok(state.adoptionGate.blockers.some((item) => item.includes('采用置信')))
  assert.ok(state.adoptionGate.blockers.some((item) => item.includes('复测矩阵')))
  assert.equal(state.repeatabilityProfile.level, 'developing')
  assert.ok(state.repeatabilityProfile.issueSummary.some((item) => item.includes('复测焦点只覆盖')))
}

function testDecliningTrendOverridesSupportedPlan() {
  const state = deriveEvaluationState(
    makeRule([
      makeEvaluation('eval_6', 'failed', '2026-06-06T00:00:00.000Z'),
      makeEvaluation('eval_5', 'failed', '2026-06-05T00:00:00.000Z'),
      makeEvaluation('eval_4', 'failed', '2026-06-04T00:00:00.000Z'),
      makeEvaluation('eval_3', 'passed', '2026-06-03T00:00:00.000Z'),
      makeEvaluation('eval_2', 'passed', '2026-06-02T00:00:00.000Z'),
      makeEvaluation('eval_1', 'passed', '2026-06-01T00:00:00.000Z'),
    ]),
  )

  assert.equal(state.evaluationTrend, 'declining')
  assert.equal(state.adoptionDecision, 'suspend')
  assert.equal(state.evaluationPlan.priority, 'high')
  assert.equal(state.evaluationPlan.focus, 'boundary')
  assert.equal(state.reviewStatus, 'needsFix')
}

function testScoreNormalizationAndPriorityWeight() {
  assert.equal(normalizeEvaluationScore(Number.NaN), 0)
  assert.equal(normalizeEvaluationScore(101.7), 100)
  assert.equal(normalizeEvaluationScore(-8), 0)
  assert.ok(evaluationPlanPriorityValue('high') > evaluationPlanPriorityValue('medium'))
  assert.ok(evaluationPlanPriorityValue('medium') > evaluationPlanPriorityValue('low'))
}

function testAdoptDecisionRequiresReadyReplicationMatrix() {
  const state = deriveEvaluationState(
    makeRule([
      makeEvaluation('eval_6', 'passed', '2026-06-06T00:00:00.000Z'),
      makeEvaluation('eval_5', 'passed', '2026-06-05T00:00:00.000Z'),
      makeEvaluation('eval_4', 'passed', '2026-06-04T00:00:00.000Z'),
      makeEvaluation('eval_3', 'passed', '2026-06-03T00:00:00.000Z'),
      makeEvaluation('eval_2', 'passed', '2026-06-02T00:00:00.000Z'),
      makeEvaluation('eval_1', 'passed', '2026-06-01T00:00:00.000Z'),
    ]),
  )

  assert.equal(state.evaluationConfidence, 'high')
  assert.equal(state.evaluationReplicationMatrix.status, 'incomplete')
  assert.equal(state.adoptionDecision, 'retest')
  assert.equal(state.adoptionGate.ready, false)
  assert.ok(state.adoptionGate.blockers.some((item) => item.includes('复测矩阵')))
  assert.equal(state.repeatabilityProfile.level, 'developing')
  assert.deepEqual(
    state.adoptionTimeline.map((event) => event.decision),
    ['retest'],
  )
}

function testRepairDecisionForWeakEvidence() {
  const state = deriveEvaluationState(
    makeRule([
      {
        id: 'eval_weak',
        outcome: 'passed',
        note: 'missing evidence',
        createdAt: '2026-06-06T00:00:00.000Z',
      },
      makeEvaluation('eval_1', 'passed', '2026-06-01T00:00:00.000Z'),
    ]),
  )

  assert.equal(state.evaluationVerdict, 'supported')
  assert.equal(state.adoptionDecision, 'repair')
  assert.ok(state.evaluationProtocol.requiredEvidence.some((item) => item.includes('历史样本')))
  assert.equal(state.adoptionGate.ready, false)
  assert.ok(state.adoptionGate.blockers.some((item) => item.includes('证据完整度')))
  assert.equal(state.repeatabilityProfile.level, 'weak')
}

function testPlannedMultiFocusEvaluationsAreRepeatable() {
  const state = deriveEvaluationState(
    makeRule([
      makePlannedEvaluation('eval_5', 'passed', '2026-06-05T00:00:00.000Z', 'expansion'),
      makePlannedEvaluation('eval_4', 'passed', '2026-06-04T00:00:00.000Z', 'contrast'),
      makePlannedEvaluation('eval_3', 'passed', '2026-06-03T00:00:00.000Z', 'boundary'),
      makePlannedEvaluation('eval_2', 'passed', '2026-06-02T00:00:00.000Z', 'confirmation'),
      makePlannedEvaluation('eval_1', 'passed', '2026-06-01T00:00:00.000Z', 'confirmation'),
    ]),
  )

  assert.equal(state.repeatabilityProfile.level, 'repeatable')
  assert.equal(state.sampleIndependenceProfile.level, 'independent')
  assert.equal(state.evaluationProtocol.cadenceDays, 30)
  assert.equal(state.repeatabilityProfile.focusCoverage, 4)
  assert.equal(state.repeatabilityProfile.plannedRate, 1)
  assert.equal(state.repeatabilityProfile.issueSummary.length, 0)
  assert.equal(state.evaluationReplicationMatrix.status, 'ready')
  assert.equal(state.evaluationReplicationMatrix.completedSlots, 4)
  assert.equal(state.evaluationReplicationMatrix.recoveredSlots, 0)
  assert.equal(state.evaluationReplicationMatrix.missingFocuses.length, 0)
  assert.equal(state.evaluationReplicationMatrix.nextFocus, 'confirmation')
  assert.ok(state.evaluationReplicationMatrix.nextMatrixStep.includes('低频维护'))
  assert.equal(state.evaluationConfidence, 'high')
  assert.equal(state.adoptionDecision, 'adopt')
  assert.equal(state.adoptionGate.ready, true)
  assert.equal(state.adoptionGate.blockers.length, 0)
}

function testClusteredSamplesBlockDefaultAdoption() {
  const state = deriveEvaluationState(
    makeRule([
      makePlannedEvaluation('eval_5', 'passed', '2026-06-01T04:00:00.000Z', 'expansion'),
      makePlannedEvaluation('eval_4', 'passed', '2026-06-01T03:00:00.000Z', 'contrast'),
      makePlannedEvaluation('eval_3', 'passed', '2026-06-01T02:00:00.000Z', 'boundary'),
      makePlannedEvaluation('eval_2', 'passed', '2026-06-01T01:00:00.000Z', 'confirmation'),
      makePlannedEvaluation('eval_1', 'passed', '2026-06-01T00:00:00.000Z', 'confirmation'),
    ].map((evaluation) => ({
      ...evaluation,
      observationText: '同一天同一个健身房场景重复点击。',
    }))),
  )

  assert.equal(state.evaluationReplicationMatrix.status, 'ready')
  assert.equal(state.evaluationConfidence, 'high')
  assert.equal(state.sampleIndependenceProfile.level, 'weak')
  assert.equal(state.sampleIndependenceProfile.independentDayCount, 1)
  assert.equal(state.sampleIndependenceProfile.independentScenarioCount, 1)
  assert.equal(state.adoptionDecision, 'retest')
  assert.equal(state.adoptionGate.ready, false)
  assert.ok(state.adoptionGate.blockers.some((item) => item.includes('样本独立性')))
  assert.ok(state.repeatabilityProfile.issueSummary.some((item) => item.includes('样本独立性')))
}

function testUnresolvedMaintenanceRegressionBlocksAdoption() {
  const state = deriveEvaluationState(
    makeRule([
      {
        ...makePlannedEvaluation('maintenance_failed', 'failed', '2026-06-07T00:00:00.000Z', 'boundary'),
        cycle: 'maintenance',
      },
      makePlannedEvaluation('eval_5', 'passed', '2026-06-05T00:00:00.000Z', 'expansion'),
      makePlannedEvaluation('eval_4', 'passed', '2026-06-04T00:00:00.000Z', 'contrast'),
      makePlannedEvaluation('eval_3', 'passed', '2026-06-03T00:00:00.000Z', 'boundary'),
      makePlannedEvaluation('eval_2', 'passed', '2026-06-02T00:00:00.000Z', 'confirmation'),
      makePlannedEvaluation('eval_1', 'passed', '2026-06-01T00:00:00.000Z', 'confirmation'),
    ]),
  )

  assert.equal(state.adoptionDecision, 'suspend')
  assert.equal(state.adoptionGate.ready, false)
  assert.ok(state.adoptionReason.includes('未解决维护回归'))
  assert.ok(state.adoptionGate.blockers.some((item) => item.includes('维护回归')))
}

function testPassedRetestClosesMaintenanceRegressionGate() {
  const state = deriveEvaluationState(
    makeRule([
      makePlannedEvaluation('retest_passed', 'passed', '2026-06-08T00:00:00.000Z', 'boundary'),
      {
        ...makePlannedEvaluation('maintenance_failed', 'failed', '2026-06-07T00:00:00.000Z', 'boundary'),
        cycle: 'maintenance',
      },
      makePlannedEvaluation('eval_5', 'passed', '2026-06-05T00:00:00.000Z', 'expansion'),
      makePlannedEvaluation('eval_4', 'passed', '2026-06-04T00:00:00.000Z', 'contrast'),
      makePlannedEvaluation('eval_3', 'passed', '2026-06-03T00:00:00.000Z', 'boundary'),
      makePlannedEvaluation('eval_2', 'passed', '2026-06-02T00:00:00.000Z', 'confirmation'),
      makePlannedEvaluation('eval_1', 'passed', '2026-06-01T00:00:00.000Z', 'confirmation'),
    ]),
  )

  assert.equal(state.evaluationReplicationMatrix.status, 'ready')
  assert.equal(state.evaluationReplicationMatrix.recoveredSlots, 1)
  assert.deepEqual(state.evaluationReplicationMatrix.recoveryFocuses, ['boundary'])
  assert.equal(state.evaluationReplicationMatrix.observingRecoveredSlots, 1)
  assert.deepEqual(state.evaluationReplicationMatrix.recoveryObservationFocuses, ['boundary'])
  assert.equal(state.adoptionDecision, 'limit')
  assert.equal(state.adoptionGate.ready, false)
  assert.equal(state.adoptionGate.blockers.some((item) => item.includes('维护回归')), false)
  assert.equal(state.adoptionGate.blockers.some((item) => item.includes('复测矩阵')), false)
  assert.ok(state.adoptionGate.warnings.some((item) => item.includes('恢复观察期')))
  assert.ok(state.adoptionReason.includes('恢复'))
  assert.ok(state.evaluationReplicationMatrix.slots.find((slot) => slot.focus === 'boundary')?.recoverySummary?.includes('历史'))
}

function testRecoveryObservationClearsAfterExtraPass() {
  const state = deriveEvaluationState(
    makeRule([
      makePlannedEvaluation('steady_passed_2', 'passed', '2026-06-11T00:00:00.000Z', 'boundary'),
      makePlannedEvaluation('steady_passed_1', 'passed', '2026-06-10T00:00:00.000Z', 'boundary'),
      makePlannedEvaluation('observation_passed', 'passed', '2026-06-09T00:00:00.000Z', 'boundary'),
      makePlannedEvaluation('retest_passed', 'passed', '2026-06-08T00:00:00.000Z', 'boundary'),
      {
        ...makePlannedEvaluation('maintenance_failed', 'failed', '2026-06-07T00:00:00.000Z', 'boundary'),
        cycle: 'maintenance',
      },
      makePlannedEvaluation('eval_5', 'passed', '2026-06-05T00:00:00.000Z', 'expansion'),
      makePlannedEvaluation('eval_4', 'passed', '2026-06-04T00:00:00.000Z', 'contrast'),
      makePlannedEvaluation('eval_3', 'passed', '2026-06-03T00:00:00.000Z', 'boundary'),
      makePlannedEvaluation('eval_2', 'passed', '2026-06-02T00:00:00.000Z', 'confirmation'),
      makePlannedEvaluation('eval_1', 'passed', '2026-06-01T00:00:00.000Z', 'confirmation'),
    ]),
  )

  assert.equal(state.evaluationReplicationMatrix.status, 'ready')
  assert.equal(state.evaluationReplicationMatrix.recoveredSlots, 1)
  assert.equal(state.evaluationReplicationMatrix.observingRecoveredSlots, 0)
  assert.deepEqual(state.evaluationReplicationMatrix.recoveryObservationFocuses, [])
  assert.equal(state.adoptionDecision, 'adopt')
  assert.equal(state.adoptionGate.ready, true)
  assert.equal(state.adoptionGate.warnings.some((item) => item.includes('恢复观察期')), false)
  assert.ok(state.evaluationReplicationMatrix.slots.find((slot) => slot.focus === 'boundary')?.recoverySummary?.includes('已清除'))
}

function testSameFocusConflictIsNotConsistent() {
  const state = deriveEvaluationState(
    makeRule([
      makePlannedEvaluation('eval_3', 'failed', '2026-06-03T00:00:00.000Z', 'boundary'),
      makePlannedEvaluation('eval_2', 'passed', '2026-06-02T00:00:00.000Z', 'boundary'),
      makePlannedEvaluation('eval_1', 'passed', '2026-06-01T00:00:00.000Z', 'confirmation'),
    ]),
  )

  assert.equal(state.evaluationConsistencyProfile.status, 'conflicting')
  assert.ok(state.evaluationConsistencyProfile.conflictingFocuses.includes('boundary'))
  assert.ok(state.evaluationConsistencyProfile.issueSummary.some((item) => item.includes('同一焦点')))
  assert.equal(state.evaluationReplicationMatrix.status, 'blocked')
  assert.ok(state.evaluationReplicationMatrix.conflictingFocuses.includes('boundary'))
  assert.equal(state.evaluationReplicationMatrix.nextFocus, 'boundary')
  assert.equal(state.adoptionDecision, 'suspend')
  assert.equal(state.adoptionGate.ready, false)
  assert.ok(state.adoptionGate.blockers.some((item) => item.includes('复测矩阵')))
}

function testConsistentFocusGroupsAreStable() {
  const state = deriveEvaluationState(
    makeRule([
      makePlannedEvaluation('eval_3', 'failed', '2026-06-03T00:00:00.000Z', 'boundary'),
      makePlannedEvaluation('eval_2', 'passed', '2026-06-02T00:00:00.000Z', 'confirmation'),
      makePlannedEvaluation('eval_1', 'passed', '2026-06-01T00:00:00.000Z', 'confirmation'),
    ]),
  )

  assert.equal(state.evaluationConsistencyProfile.status, 'stable')
  assert.equal(state.evaluationConsistencyProfile.agreementRate, 1)
  assert.equal(state.evaluationConsistencyProfile.conflictingFocuses.length, 0)
  assert.equal(state.evaluationReplicationMatrix.status, 'incomplete')
  assert.ok(state.evaluationReplicationMatrix.missingFocuses.includes('contrast'))
  assert.equal(state.evaluationReplicationMatrix.nextFocus, 'contrast')
  assert.equal(state.adoptionDecision, 'retest')
  assert.equal(state.adoptionGate.ready, false)
  assert.ok(state.adoptionGate.blockers.some((item) => item.includes('复测矩阵')))
}

function testAdoptionTimelineCapturesConflictRegression() {
  const state = deriveEvaluationState(
    makeRule([
      makeEvaluation('eval_4', 'failed', '2026-06-04T00:00:00.000Z'),
      makeEvaluation('eval_3', 'failed', '2026-06-03T00:00:00.000Z'),
      makeEvaluation('eval_2', 'passed', '2026-06-02T00:00:00.000Z'),
      makeEvaluation('eval_1', 'passed', '2026-06-01T00:00:00.000Z'),
    ]),
  )

  assert.equal(state.adoptionDecision, 'suspend')
  assert.equal(state.adoptionGate.status, 'blocked')
  assert.ok(state.adoptionGate.blockers.some((item) => item.includes('冲突控制')))
  assert.ok(state.repeatabilityProfile.issueSummary.some((item) => item.includes('冲突结论')))
  assert.equal(state.boundaryCatalog.length, 2)
  assert.ok(state.revisionDraft?.suggestedConstraints.some((item) => item.includes('排除条件')))
  assert.deepEqual(
    state.adoptionTimeline.map((event) => `${event.decision}:${event.evaluationId}`),
    ['retest:eval_1', 'suspend:eval_3'],
  )
}

function testRevisionVersionIsolationRequiresCurrentVersionRetest() {
  const historical = [
    makeVersionedPlannedEvaluation('eval_v0_5', 'passed', '2026-06-05T00:00:00.000Z', 'expansion', 0),
    makeVersionedPlannedEvaluation('eval_v0_4', 'passed', '2026-06-04T00:00:00.000Z', 'contrast', 0),
    makeVersionedPlannedEvaluation('eval_v0_3', 'passed', '2026-06-03T00:00:00.000Z', 'boundary', 0),
    makeVersionedPlannedEvaluation('eval_v0_2', 'passed', '2026-06-02T00:00:00.000Z', 'confirmation', 0),
    makeVersionedPlannedEvaluation('eval_v0_1', 'passed', '2026-06-01T00:00:00.000Z', 'confirmation', 0),
  ]
  const unretestedState = deriveEvaluationState({
    ...makeRule(historical),
    revisionVersion: 1,
  })

  assert.equal(unretestedState.versionCoverageProfile.status, 'unretested')
  assert.equal(unretestedState.versionCoverageProfile.currentVersion, 1)
  assert.equal(unretestedState.versionCoverageProfile.currentVersionEvaluationCount, 0)
  assert.equal(unretestedState.versionCoverageProfile.historicalEvaluationCount, 5)
  assert.equal(unretestedState.evaluationVerdict, 'insufficient')
  assert.equal(unretestedState.evaluationReplicationMatrix.status, 'empty')
  assert.equal(unretestedState.adoptionDecision, 'retest')
  assert.ok(unretestedState.adoptionGate.blockers.some((item) => item.includes('当前版本复测')))
  assert.equal(unretestedState.boundaryCatalog.length, 0)

  const partiallyRetestedState = deriveEvaluationState({
    ...makeRule([
      makeVersionedPlannedEvaluation('eval_v1_1', 'passed', '2026-06-06T00:00:00.000Z', 'confirmation', 1),
      ...historical,
    ]),
    revisionVersion: 1,
  })

  assert.equal(partiallyRetestedState.versionCoverageProfile.status, 'partial')
  assert.equal(partiallyRetestedState.versionCoverageProfile.currentVersionDecisiveCount, 1)
  assert.equal(partiallyRetestedState.adoptionDecision, 'retest')
  assert.ok(partiallyRetestedState.adoptionGate.blockers.some((item) => item.includes('当前版本复测')))

  const coveredState = deriveEvaluationState({
    ...makeRule([
      makeVersionedPlannedEvaluation('eval_v1_2', 'passed', '2026-06-07T00:00:00.000Z', 'confirmation', 1),
      makeVersionedPlannedEvaluation('eval_v1_1', 'passed', '2026-06-06T00:00:00.000Z', 'confirmation', 1),
      ...historical,
    ]),
    revisionVersion: 1,
  })

  assert.equal(coveredState.versionCoverageProfile.status, 'covered')
  assert.equal(coveredState.versionCoverageProfile.currentVersionEvaluationCount, 2)
  assert.equal(coveredState.versionCoverageProfile.historicalEvaluationCount, 5)
  assert.equal(coveredState.evaluationVerdict, 'supported')
  assert.equal(coveredState.evaluationReplicationMatrix.completedSlots, 1)
  assert.equal(coveredState.adoptionGate.blockers.some((item) => item.includes('当前版本复测')), false)
}

function testProtocolComplianceBlocksUnrepeatableSamples() {
  const state = deriveEvaluationState(
    makeRule([
      makeLegacyEvaluation('legacy_2', 'passed', '2026-06-02T00:00:00.000Z'),
      makeLegacyEvaluation('legacy_1', 'passed', '2026-06-01T00:00:00.000Z'),
    ]),
  )

  assert.equal(state.evaluationVerdict, 'supported')
  assert.equal(state.protocolComplianceProfile.status, 'blocked')
  assert.equal(state.protocolComplianceProfile.missingSnapshotCount, 2)
  assert.equal(state.adoptionDecision, 'repair')
  assert.ok(state.adoptionGate.blockers.some((item) => item.includes('协议执行一致')))
  assert.equal(state.repeatabilityProfile.level, 'weak')
  assert.ok(state.repeatabilityProfile.issueSummary.some((item) => item.includes('协议执行')))
}

function testLegacyMissingProtocolStillRepairs() {
  const state = deriveEvaluationState(
    makeRule([
      makeLegacyEvaluation('legacy_2', 'passed', '2026-06-02T00:00:00.000Z'),
      makeLegacyEvaluation('legacy_1', 'passed', '2026-06-01T00:00:00.000Z'),
    ]),
  )

  assert.equal(state.adoptionDecision, 'repair')
  assert.equal(state.protocolComplianceProfile.status, 'blocked')
  assert.ok(state.adoptionReason.includes('协议'))
}

testConflictedRule()
testSupportedRule()
testDecliningTrendOverridesSupportedPlan()
testAdoptDecisionRequiresReadyReplicationMatrix()
testRepairDecisionForWeakEvidence()
testPlannedMultiFocusEvaluationsAreRepeatable()
testClusteredSamplesBlockDefaultAdoption()
testUnresolvedMaintenanceRegressionBlocksAdoption()
testPassedRetestClosesMaintenanceRegressionGate()
testRecoveryObservationClearsAfterExtraPass()
testSameFocusConflictIsNotConsistent()
testConsistentFocusGroupsAreStable()
testAdoptionTimelineCapturesConflictRegression()
testRevisionVersionIsolationRequiresCurrentVersionRetest()
testProtocolComplianceBlocksUnrepeatableSamples()
testLegacyMissingProtocolStillRepairs()
testScoreNormalizationAndPriorityWeight()

console.log('evaluationEngine tests passed')
