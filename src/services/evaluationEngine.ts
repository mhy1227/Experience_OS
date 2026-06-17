import type {
  AdoptionDecisionEvent,
  EvaluationAdoptionDecision,
  EvaluationAdoptionGate,
  EvaluationBoundaryCase,
  EvaluationConfidence,
  EvaluationConsistencyProfile,
  EvaluationConsistencyStatus,
  EvaluationFocusConsistency,
  EvaluationGateCheck,
  EvaluationGateCheckStatus,
  EvaluationOutcome,
  EvaluationPlan,
  EvaluationPlanFocus,
  EvaluationPlanPriority,
  EvaluationProtocolComplianceProfile,
  EvaluationProtocolComplianceStatus,
  EvaluationProtocol,
  EvaluationReplicationMatrix,
  EvaluationReplicationMatrixStatus,
  EvaluationReplicationSlot,
  EvaluationRepeatabilityLevel,
  EvaluationRepeatabilityProfile,
  EvaluationSampleIndependenceLevel,
  EvaluationSampleIndependenceProfile,
  EvaluationTrend,
  EvaluationVerdict,
  EvaluationVersionCoverageProfile,
  EvaluationVersionCoverageStatus,
  ExperienceRule,
  Reusability,
  RuleRevisionDraft,
  RuleEvaluation,
  RuleReviewStatus,
} from '../types/experience'

const EVALUATION_FOCUSES: readonly EvaluationPlanFocus[] = ['confirmation', 'boundary', 'contrast', 'expansion']

export interface DerivedEvaluationState {
  evaluationVerdict: EvaluationVerdict
  evaluationScore: number
  evaluationConfidence: EvaluationConfidence
  evaluationTrend: EvaluationTrend
  nextEvaluationAction: string
  adoptionDecision: EvaluationAdoptionDecision
  adoptionReason: string
  adoptionTimeline: AdoptionDecisionEvent[]
  adoptionGate: EvaluationAdoptionGate
  repeatabilityProfile: EvaluationRepeatabilityProfile
  sampleIndependenceProfile: EvaluationSampleIndependenceProfile
  versionCoverageProfile: EvaluationVersionCoverageProfile
  protocolComplianceProfile: EvaluationProtocolComplianceProfile
  evaluationConsistencyProfile: EvaluationConsistencyProfile
  evaluationReplicationMatrix: EvaluationReplicationMatrix
  evaluationProtocol: EvaluationProtocol
  boundaryCatalog: EvaluationBoundaryCase[]
  revisionDraft: RuleRevisionDraft | undefined
  evaluationPlan: EvaluationPlan
  revisionSuggestion: string
  reviewStatus: RuleReviewStatus
  reusability: Reusability
}

export function deriveEvaluationState(rule: ExperienceRule): DerivedEvaluationState {
  return {
    ...deriveEvaluationStateCore(rule),
    adoptionTimeline: deriveAdoptionTimeline(rule),
  }
}

export function deriveAdoptionTimeline(rule: ExperienceRule): AdoptionDecisionEvent[] {
  const evaluations = [...(rule.evaluations ?? [])].sort(compareEvaluationAsc)
  const events: AdoptionDecisionEvent[] = []
  let previousDecision: EvaluationAdoptionDecision | undefined

  for (let index = 0; index < evaluations.length; index += 1) {
    const evaluation = evaluations[index]
    const timelineRule = {
      ...rule,
      revisionVersion: evaluation.ruleVersion ?? 0,
      evaluations: evaluations.slice(0, index + 1),
    }
    const state = deriveEvaluationStateCore({
      ...timelineRule,
    })

    if (state.adoptionDecision === previousDecision) continue

    events.push({
      id: `adoption_${evaluation.id}_${state.adoptionDecision}`,
      evaluationId: evaluation.id,
      createdAt: evaluation.createdAt,
      decision: state.adoptionDecision,
      reason: state.adoptionReason,
      evaluationCount: index + 1,
    })
    previousDecision = state.adoptionDecision
  }

  return events
}

function deriveEvaluationStateCore(rule: ExperienceRule): Omit<DerivedEvaluationState, 'adoptionTimeline'> {
  const allEvaluations = rule.evaluations ?? []
  const evaluations = currentVersionEvaluations(rule)
  const versionCoverageProfile = versionCoverageProfileFor(rule, evaluations, allEvaluations)
  const passed = evaluations.filter((item) => item.outcome === 'passed').length
  const failed = evaluations.filter((item) => item.outcome === 'failed').length
  const uncertain = evaluations.length - passed - failed
  const totalDecisive = passed + failed
  const verdict = getEvaluationVerdict(passed, failed, evaluations.length)
  const confidence = evaluationConfidenceFor(evaluations.length, totalDecisive, verdict)
  const trend = evaluationTrendFor(evaluations)
  const score = evaluationScoreFor(verdict, passed, failed, evaluations.length)

  const partialRule = {
    ...rule,
    evaluationConfidence: confidence,
    evaluationTrend: trend,
  }

  const evaluationReplicationMatrix = evaluationReplicationMatrixFor(evaluations)
  const sampleIndependenceProfile = sampleIndependenceProfileFor(evaluations)
  const protocolComplianceProfile = protocolComplianceProfileFor(evaluations)
  const adoption = adoptionDecisionFor(partialRule, verdict, score, confidence, evaluations, evaluationReplicationMatrix, sampleIndependenceProfile, versionCoverageProfile, protocolComplianceProfile)
  const evaluationPlan = evaluationPlanFor(partialRule, verdict, evaluations.length, passed, failed)
  const boundaryCatalog = boundaryCatalogFor(partialRule, verdict, allEvaluations)
  const adoptionGate = adoptionGateFor(
    partialRule,
    adoption.adoptionDecision,
    verdict,
    score,
    confidence,
    trend,
    evaluations,
    passed,
    failed,
    uncertain,
    evaluationReplicationMatrix,
    sampleIndependenceProfile,
    versionCoverageProfile,
    protocolComplianceProfile,
  )

  return {
    evaluationVerdict: verdict,
    evaluationScore: score,
    evaluationConfidence: confidence,
    evaluationTrend: trend,
    nextEvaluationAction: nextEvaluationActionFor(partialRule, verdict, evaluations.length, passed, failed),
    ...adoption,
    adoptionGate,
    repeatabilityProfile: repeatabilityProfileFor(verdict, evaluations, passed, failed, uncertain, sampleIndependenceProfile, protocolComplianceProfile),
    sampleIndependenceProfile,
    versionCoverageProfile,
    protocolComplianceProfile,
    evaluationConsistencyProfile: evaluationConsistencyProfileFor(evaluations),
    evaluationReplicationMatrix,
    evaluationProtocol: evaluationProtocolFor(partialRule, verdict, score, confidence, evaluations.length, passed, failed, uncertain, evaluationPlan),
    boundaryCatalog,
    revisionDraft: revisionDraftFor(partialRule, verdict, adoption.adoptionDecision, adoptionGate, boundaryCatalog),
    evaluationPlan,
    revisionSuggestion: revisionSuggestionFor(rule, verdict, passed, failed),
    ...reviewStateFor(totalDecisive, passed, failed),
  }
}

function currentVersionEvaluations(rule: ExperienceRule) {
  const currentVersion = rule.revisionVersion ?? 0
  return (rule.evaluations ?? []).filter((evaluation) => (evaluation.ruleVersion ?? 0) === currentVersion)
}

function defaultVersionCoverageFor(evaluations: RuleEvaluation[], currentVersion = 0): EvaluationVersionCoverageProfile {
  const currentVersionDecisiveCount = evaluations.filter((evaluation) => evaluation.outcome === 'passed' || evaluation.outcome === 'failed').length
  return {
    status: 'covered',
    currentVersion,
    currentVersionEvaluationCount: evaluations.length,
    historicalEvaluationCount: 0,
    currentVersionDecisiveCount,
    issueSummary: [],
    nextVersionStep: `当前 v${currentVersion} 已完成最小复测覆盖。`,
  }
}

function defaultProtocolComplianceFor(evaluations: RuleEvaluation[]): EvaluationProtocolComplianceProfile {
  return protocolComplianceProfileFor(evaluations)
}

export function protocolComplianceProfileFor(evaluations: RuleEvaluation[]): EvaluationProtocolComplianceProfile {
  const total = evaluations.length
  const completeExecutionCount = evaluations.filter((evaluation) => evaluation.protocolExecution?.status === 'complete').length
  const partialExecutionCount = evaluations.filter((evaluation) => evaluation.protocolExecution?.status === 'partial').length
  const blockedExecutionCount = evaluations.filter((evaluation) => evaluation.protocolExecution?.status === 'blocked').length
  const missingSnapshotCount = evaluations.filter((evaluation) => !evaluation.protocolSnapshot).length
  const missingExecutionCount = evaluations.filter((evaluation) => !evaluation.protocolExecution).length
  const focusMismatchCount = evaluations.filter((evaluation) => {
    const focus = evaluationFocusOf(evaluation)
    if (!focus || !evaluation.protocolSnapshot) return false
    return evaluation.protocolSnapshot.focus !== focus
  }).length
  const completeRate = total === 0 ? 0 : completeExecutionCount / total
  const blockedRate = total === 0 ? 0 : (blockedExecutionCount + missingSnapshotCount + missingExecutionCount + focusMismatchCount) / total
  const partialRate = total === 0 ? 0 : partialExecutionCount / total
  const score = normalizeEvaluationScore(completeRate * 100 - blockedRate * 32 - partialRate * 14)
  const status: EvaluationProtocolComplianceStatus =
    total === 0
      ? 'empty'
      : blockedExecutionCount > 0 || missingSnapshotCount > 0 || missingExecutionCount > 0 || focusMismatchCount > 0
        ? 'blocked'
        : partialExecutionCount > 0
          ? 'partial'
          : 'aligned'
  const issueSummary: string[] = []

  if (missingSnapshotCount > 0) issueSummary.push(`${missingSnapshotCount} 条评估缺少协议快照，无法复现当时判定口径。`)
  if (missingExecutionCount > 0) issueSummary.push(`${missingExecutionCount} 条评估缺少协议执行结果，无法审计是否按协议完成。`)
  if (blockedExecutionCount > 0) issueSummary.push(`${blockedExecutionCount} 条评估存在协议执行阻断，不能作为高可信样本。`)
  if (partialExecutionCount > 0) issueSummary.push(`${partialExecutionCount} 条评估协议执行不完整，需要补证据或说明。`)
  if (focusMismatchCount > 0) issueSummary.push(`${focusMismatchCount} 条评估的协议焦点与复测槽位不一致。`)

  return {
    status,
    score,
    currentVersionEvaluationCount: total,
    completeExecutionCount,
    partialExecutionCount,
    blockedExecutionCount,
    missingSnapshotCount,
    missingExecutionCount,
    focusMismatchCount,
    issueSummary,
    nextProtocolStep:
      status === 'aligned'
        ? '当前版本评估均有完整协议执行记录。'
        : status === 'empty'
          ? '先按当前协议完成至少 2 次明确复测。'
          : '先补齐协议快照、执行结果和缺失证据，再把样本计入高可信复测。',
  }
}

function versionCoverageProfileFor(
  rule: ExperienceRule,
  currentEvaluations: RuleEvaluation[],
  allEvaluations: RuleEvaluation[],
): EvaluationVersionCoverageProfile {
  const currentVersion = rule.revisionVersion ?? 0
  const currentVersionDecisiveCount = currentEvaluations.filter((evaluation) => evaluation.outcome === 'passed' || evaluation.outcome === 'failed').length
  const historicalEvaluationCount = allEvaluations.length - currentEvaluations.length
  const status: EvaluationVersionCoverageStatus =
    currentVersion === 0
      ? 'covered'
      : currentVersionDecisiveCount >= 2
        ? 'covered'
        : currentVersionDecisiveCount > 0
          ? 'partial'
          : 'unretested'
  const issueSummary: string[] = []

  if (status === 'unretested') {
    issueSummary.push(`规则已修订到 v${currentVersion}，当前版本还没有明确复测样本。`)
  } else if (status === 'partial') {
    issueSummary.push(`规则 v${currentVersion} 只有 ${currentVersionDecisiveCount} 次明确复测，还不能继承历史版本结论。`)
  }

  if (historicalEvaluationCount > 0 && currentVersion > 0) {
    issueSummary.push(`历史版本有 ${historicalEvaluationCount} 次评估，仅作修订审计，不直接支撑当前版本采用。`)
  }

  return {
    status,
    currentVersion,
    currentVersionEvaluationCount: currentEvaluations.length,
    historicalEvaluationCount,
    currentVersionDecisiveCount,
    issueSummary,
    nextVersionStep:
      status === 'covered'
        ? `当前 v${currentVersion} 已完成最小复测覆盖。`
        : `至少补足 ${Math.max(1, 2 - currentVersionDecisiveCount)} 次当前版本的明确复测。`,
  }
}

export function normalizeEvaluationScore(value: number | undefined) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value ?? 0)))
}

export function getEvaluationVerdict(passed: number, failed: number, total: number): EvaluationVerdict {
  if (total < 2) return 'insufficient'
  if (failed >= 2 && failed >= passed) return 'conflicted'
  if (passed >= 2 && passed > failed) return 'supported'
  return 'mixed'
}

export function evaluationScoreFor(verdict: EvaluationVerdict, passed: number, failed: number, total: number) {
  const decisiveBalance = passed - failed
  const sampleBonus = Math.min(total, 6) * 4
  const uncertain = Math.max(0, total - passed - failed)
  const conflictCap = verdict === 'conflicted' ? 42 : 100
  const base = 45 + decisiveBalance * 18 + sampleBonus - uncertain * 4
  return Math.min(conflictCap, normalizeEvaluationScore(base))
}

export function evaluationConfidenceFor(total: number, decisive: number, verdict: EvaluationVerdict): EvaluationConfidence {
  if (total >= 5 && decisive >= 4 && verdict !== 'mixed') return 'high'
  if (total >= 2 && decisive >= 1) return 'medium'
  return 'low'
}

export function evaluationTrendFor(evaluations: RuleEvaluation[]): EvaluationTrend {
  if (evaluations.length < 4) return 'unknown'

  const ordered = [...evaluations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const recent = averageOutcomeScore(ordered.slice(0, 3))
  const previous = averageOutcomeScore(ordered.slice(3, 6))
  if (previous === undefined || recent === undefined) return 'unknown'

  const delta = recent - previous
  if (delta >= 0.35) return 'improving'
  if (delta <= -0.35) return 'declining'
  return 'flat'
}

export function nextEvaluationActionFor(rule: ExperienceRule, verdict: EvaluationVerdict, total: number, passed: number, failed: number) {
  if (verdict === 'conflicted') {
    return `优先复测边界场景，拆分“${rule.title}”的适用条件。`
  }

  if (rule.evaluationTrend === 'declining') {
    return '最近复测走弱，下一次优先记录失败发生的前提。'
  }

  if (total < 2) {
    return `还需 ${2 - total} 次复测才能形成初步判断。`
  }

  if (verdict === 'mixed') {
    return '继续收集有效和无效场景的差异，避免过早扩大使用范围。'
  }

  if (verdict === 'supported' && passed >= 3 && failed === 0) {
    return '规则稳定，可选择不同地点或时间段做扩展验证。'
  }

  if (verdict === 'supported') {
    return '规则初步成立，下一次复测应覆盖新的时间、地点或人群。'
  }

  return '继续补充复测样本，优先记录具体场景和触发条件。'
}

export function evaluationPlanFor(rule: ExperienceRule, verdict: EvaluationVerdict, total: number, passed: number, failed: number): EvaluationPlan {
  if (verdict === 'conflicted') {
    return {
      priority: 'high',
      focus: 'boundary',
      scenarioPrompt: `选择一次最容易让“${rule.title}”失效的场景，优先覆盖时间、地点或前提边界。`,
      evidencePrompt: '记录具体触发条件、与原规则不一致的行为结果，以及是否需要收窄适用条件。',
      reviewAfterDays: 3,
      reason: `已有 ${failed} 次无效且不低于有效次数，规则需要边界复测。`,
    }
  }

  if (rule.evaluationTrend === 'declining') {
    return {
      priority: 'high',
      focus: 'contrast',
      scenarioPrompt: '复测最近一次失败场景的相似条件，并与早期有效场景做对照。',
      evidencePrompt: '同时记录失败前提和有效前提，标出两类场景的关键差异。',
      reviewAfterDays: 5,
      reason: '最近 3 次评估结果弱于更早样本，规则稳定性正在下降。',
    }
  }

  if (total < 2) {
    return {
      priority: 'high',
      focus: 'confirmation',
      scenarioPrompt: `在与原始证据相似的场景中复测“${rule.title}”。`,
      evidencePrompt: '记录是否符合推荐行动、发生时间、地点和关键限制条件。',
      reviewAfterDays: 7,
      reason: `当前只有 ${total} 次评估，未达到初步判断样本数。`,
    }
  }

  if (verdict === 'mixed') {
    return {
      priority: 'medium',
      focus: 'contrast',
      scenarioPrompt: '各选一个有效场景和无效场景做对照复测。',
      evidencePrompt: '记录两次复测中不同的时间、地点、对象、约束和结果。',
      reviewAfterDays: 7,
      reason: '评估结果存在分歧，需要找出有效和无效条件差异。',
    }
  }

  if (verdict === 'supported' && rule.evaluationConfidence !== 'high') {
    return {
      priority: 'medium',
      focus: 'expansion',
      scenarioPrompt: '选择一个新的时间段、地点或对象复测这条规则。',
      evidencePrompt: '记录规则是否跨场景成立，以及新增场景与原始场景的差异。',
      reviewAfterDays: 14,
      reason: `已有 ${passed} 次有效，但置信等级还未达到高置信。`,
    }
  }

  return {
    priority: 'low',
    focus: 'expansion',
    scenarioPrompt: '低频抽样复测一个新的边界场景，确认规则没有过期。',
    evidencePrompt: '记录当前场景是否仍符合规则，若失败则补充变化原因。',
    reviewAfterDays: 30,
    reason: '规则当前稳定，可按较低频率维护证据链。',
  }
}

export function evaluationPlanForFocus(rule: ExperienceRule, focus: EvaluationPlanFocus): EvaluationPlan {
  const evaluations = currentVersionEvaluations(rule)
  const passed = passedCount(rule)
  const failed = failedCount(rule)
  const plan = evaluationPlanFor(rule, rule.evaluationVerdict ?? 'insufficient', evaluations.length, passed, failed)
  const overrides: Partial<EvaluationPlan> = {
    priority: focus === 'confirmation' ? 'high' : focus === 'boundary' ? 'high' : focus === 'contrast' ? 'medium' : 'low',
    focus,
    scenarioPrompt:
      focus === 'confirmation'
        ? `在与原始证据相似的场景中复测“${rule.title}”。`
        : focus === 'boundary'
          ? `选择一次最容易让“${rule.title}”失效的场景，优先覆盖时间、地点或前提边界。`
          : focus === 'contrast'
            ? '各选一个有效场景和无效场景做对照复测。'
            : '选择一个新的时间段、地点或对象复测这条规则。',
    evidencePrompt: requiredEvidencePromptForFocus(rule, focus),
    reviewAfterDays: focus === 'confirmation' ? 7 : focus === 'boundary' ? 3 : focus === 'contrast' ? 7 : 14,
    reason: focusReasonFor(rule, focus, plan),
  }
  return { ...plan, ...overrides }
}

export function evaluationPlanPriorityValue(priority: EvaluationPlanPriority | undefined) {
  const map: Record<EvaluationPlanPriority, number> = {
    high: 30,
    medium: 20,
    low: 10,
  }
  return priority ? map[priority] : 0
}

export function evaluationProtocolFor(
  rule: ExperienceRule,
  verdict: EvaluationVerdict,
  score: number,
  confidence: EvaluationConfidence,
  total: number,
  passed: number,
  failed: number,
  uncertain: number,
  plan: EvaluationPlan,
): EvaluationProtocol {
  return {
    id: `protocol_${rule.id}_${plan.focus}`,
    focus: plan.focus,
    title: protocolTitleFor(plan.focus, rule.title),
    scenario: plan.scenarioPrompt,
    passCriteria: passCriteriaFor(rule, plan.focus, passed),
    failCriteria: failCriteriaFor(rule, verdict, failed),
    uncertainCriteria: uncertainCriteriaFor(rule, uncertain),
    requiredEvidence: requiredEvidenceFor(rule, plan.focus, score, confidence, total),
    cadenceDays: plan.reviewAfterDays,
  }
}

export function evaluationProtocolForFocus(rule: ExperienceRule, focus: EvaluationPlanFocus): EvaluationProtocol {
  const plan = evaluationPlanForFocus(rule, focus)
  const passed = passedCount(rule, focus)
  const failed = failedCount(rule, focus)
  const uncertain = uncertainCount(rule, focus)
  const total = currentVersionEvaluations(rule).length
  const score = normalizeEvaluationScore((passed - failed) * 12 + total * 4)
  const confidence = rule.evaluationConfidence ?? 'low'
  return evaluationProtocolFor(rule, rule.evaluationVerdict ?? 'insufficient', score, confidence, total, passed, failed, uncertain, plan)
}

export function adoptionDecisionFor(
  rule: ExperienceRule,
  verdict: EvaluationVerdict,
  score: number,
  confidence: EvaluationConfidence,
  evaluations: RuleEvaluation[],
  replicationMatrix = evaluationReplicationMatrixFor(evaluations),
  sampleIndependence = sampleIndependenceProfileFor(evaluations),
  versionCoverage: EvaluationVersionCoverageProfile = defaultVersionCoverageFor(evaluations, rule.revisionVersion ?? 0),
  protocolCompliance: EvaluationProtocolComplianceProfile = defaultProtocolComplianceFor(evaluations),
): Pick<DerivedEvaluationState, 'adoptionDecision' | 'adoptionReason'> {
  const qualityIssues = ruleQualityIssueCount(evaluations)
  const maintenanceRegressions = unresolvedMaintenanceRegressions(evaluations)

  if (verdict === 'conflicted') {
    return {
      adoptionDecision: 'suspend',
      adoptionReason: '规则存在冲突评估，暂停采用并优先收窄适用边界。',
    }
  }

  if (maintenanceRegressions.length > 0) {
    return {
      adoptionDecision: 'suspend',
      adoptionReason: `存在 ${maintenanceRegressions.length} 个未解决维护回归槽位，先完成回归复测后再采用。`,
    }
  }

  if (replicationMatrix.status === 'blocked') {
    return {
      adoptionDecision: 'suspend',
      adoptionReason: `复测矩阵存在${replicationMatrix.conflictingFocuses.map(focusLabelForIssue).join('、')}槽位冲突，先拆分边界后再采用。`,
    }
  }

  if (versionCoverage.status !== 'covered') {
    return {
      adoptionDecision: 'retest',
      adoptionReason: `规则 v${versionCoverage.currentVersion} 修订后复测不足，历史 ${versionCoverage.historicalEvaluationCount} 次评估只作审计，需先补当前版本复测。`,
    }
  }

  if (protocolCompliance.status === 'blocked') {
    return {
      adoptionDecision: 'repair',
      adoptionReason: `当前版本有 ${protocolCompliance.blockedExecutionCount + protocolCompliance.missingSnapshotCount + protocolCompliance.missingExecutionCount + protocolCompliance.focusMismatchCount} 个协议执行缺口，先修复协议证据再采用。`,
    }
  }

  if (protocolCompliance.status === 'partial') {
    return {
      adoptionDecision: 'repair',
      adoptionReason: `当前版本有 ${protocolCompliance.partialExecutionCount} 条复测协议执行不完整，先补齐证据再判断。`,
    }
  }

  if (qualityIssues > 0 && evaluations.length > 0) {
    return {
      adoptionDecision: 'repair',
      adoptionReason: `有 ${qualityIssues} 条评估缺少场景证据或计划快照，先补齐证据再判断。`,
    }
  }

  if (sampleIndependence.level === 'weak' && evaluations.length >= 2) {
    return {
      adoptionDecision: 'retest',
      adoptionReason: `复测样本独立性不足，只有 ${sampleIndependence.independentDayCount} 个独立日期和 ${sampleIndependence.independentScenarioCount} 个独立场景，需要换时间或场景复测。`,
    }
  }

  if (evaluations.length < 2 || verdict === 'insufficient') {
    return {
      adoptionDecision: 'retest',
      adoptionReason: '评估样本不足，至少完成 2 次复测后再纳入稳定规则。',
    }
  }

  if (replicationMatrix.status === 'incomplete') {
    return {
      adoptionDecision: 'retest',
      adoptionReason: `复测矩阵未完成，还缺少${replicationMatrix.missingFocuses.map(focusLabelForIssue).join('、')}槽位，不能进入默认采用。`,
    }
  }

  if (replicationMatrix.observingRecoveredSlots > 0 && verdict === 'supported') {
    return {
      adoptionDecision: 'limit',
      adoptionReason: `复测矩阵已有 ${replicationMatrix.observingRecoveredSlots} 个槽位刚从历史冲突恢复，先限制使用并继续观察恢复稳定性。`,
    }
  }

  if (rule.evaluationTrend === 'declining' || verdict === 'mixed') {
    return {
      adoptionDecision: 'limit',
      adoptionReason: '结果存在分歧或趋势走弱，只能在已验证场景中限制使用。',
    }
  }

  if (verdict === 'supported' && score >= 75 && confidence === 'high') {
    return {
      adoptionDecision: 'adopt',
      adoptionReason: '规则已获得高置信支持，可作为默认行动参考。',
    }
  }

  if (verdict === 'supported') {
    return {
      adoptionDecision: 'limit',
      adoptionReason: '规则初步成立，但置信或稳定分不足，先限制在相似场景使用。',
    }
  }

  return {
    adoptionDecision: 'retest',
    adoptionReason: '当前证据还不足以形成采用结论，继续按计划复测。',
  }
}

export function adoptionGateFor(
  rule: ExperienceRule,
  targetDecision: EvaluationAdoptionDecision,
  verdict: EvaluationVerdict,
  score: number,
  confidence: EvaluationConfidence,
  trend: EvaluationTrend,
  evaluations: RuleEvaluation[],
  passed: number,
  failed: number,
  uncertain: number,
  replicationMatrix = evaluationReplicationMatrixFor(evaluations),
  sampleIndependence = sampleIndependenceProfileFor(evaluations),
  versionCoverage: EvaluationVersionCoverageProfile = defaultVersionCoverageFor(evaluations, rule.revisionVersion ?? 0),
  protocolCompliance: EvaluationProtocolComplianceProfile = defaultProtocolComplianceFor(evaluations),
): EvaluationAdoptionGate {
  const decisive = passed + failed
  const qualityIssues = ruleQualityIssueCount(evaluations)
  const plannedEvaluations = evaluations.filter((evaluation) => evaluation.source === 'plan')
  const focusCounts = evaluationFocusCounts(evaluations)
  const maintenanceRegressions = unresolvedMaintenanceRegressions(evaluations)
  const observingRecoveredSlots = replicationMatrix.observingRecoveredSlots
  const checks: EvaluationGateCheck[] = [
    gateCheck(
      'minimum-samples',
      '最小复测样本',
      evaluations.length >= 2 ? 'passed' : 'blocked',
      evaluations.length >= 2 ? `已有 ${evaluations.length} 次复测。` : `还差 ${2 - evaluations.length} 次复测才能形成采用判断。`,
    ),
    gateCheck(
      'decisive-samples',
      '明确结果样本',
      decisive >= 2 ? 'passed' : 'blocked',
      decisive >= 2 ? `已有 ${decisive} 次明确有效/无效样本。` : `明确有效/无效样本只有 ${decisive} 次，不确定样本不能支撑采用。`,
    ),
    gateCheck(
      'evidence-quality',
      '证据完整度',
      qualityIssues === 0 ? 'passed' : 'blocked',
      qualityIssues === 0 ? '复测样本均绑定场景证据。' : `存在 ${qualityIssues} 个证据缺口，需要先补齐复测场景或观察绑定。`,
    ),
    gateCheck(
      'conflict-control',
      '冲突控制',
      verdict === 'conflicted' ? 'blocked' : verdict === 'mixed' ? 'blocked' : 'passed',
      verdict === 'conflicted'
        ? `已有 ${failed} 次无效且不低于有效次数，必须先收窄边界。`
        : verdict === 'mixed'
          ? '有效和无效并存，需要先找出场景差异。'
          : '当前未形成冲突结论。',
    ),
    gateCheck(
      'confidence',
      '采用置信',
      confidence === 'high' ? 'passed' : 'blocked',
      confidence === 'high' ? '已达到高置信。' : `当前为${confidenceLabel(confidence)}，默认采用需要高置信。`,
    ),
    gateCheck(
      'stability-score',
      '稳定分',
      score >= 75 ? 'passed' : 'blocked',
      score >= 75 ? `稳定分 ${score}，达到默认采用线。` : `稳定分 ${score}，低于 75 的默认采用线。`,
    ),
    gateCheck(
      'trend',
      '近期趋势',
      trend === 'declining' ? 'blocked' : trend === 'unknown' ? 'warning' : 'passed',
      trend === 'declining'
        ? '最近样本走弱，不能扩大采用。'
        : trend === 'unknown'
          ? '样本量还不足以判断近期趋势。'
          : `近期趋势为${trendLabel(trend)}。`,
    ),
    gateCheck(
      'planned-samples',
      '计划执行样本',
      plannedEvaluations.length > 0 ? 'passed' : evaluations.length >= 2 ? 'warning' : 'warning',
      plannedEvaluations.length > 0 ? `已有 ${plannedEvaluations.length} 次按计划执行的复测。` : '尚无按计划执行的复测，后续复盘依据偏弱。',
    ),
    gateCheck(
      'sample-independence',
      '样本独立性',
      sampleIndependence.level === 'weak' ? 'blocked' : sampleIndependence.level === 'clustered' ? 'warning' : 'passed',
      sampleIndependence.level === 'independent'
        ? `已覆盖 ${sampleIndependence.independentDayCount} 个独立日期和 ${sampleIndependence.independentScenarioCount} 个独立场景。`
        : sampleIndependence.level === 'clustered'
          ? `样本有聚集风险：${sampleIndependence.issueSummary.join('；')}`
          : `样本独立性不足：${sampleIndependence.issueSummary.join('；')}`,
    ),
    gateCheck(
      'current-version-coverage',
      '当前版本复测',
      versionCoverage.status === 'covered' ? 'passed' : 'blocked',
      versionCoverage.status === 'covered'
        ? `当前 v${versionCoverage.currentVersion} 已有 ${versionCoverage.currentVersionEvaluationCount} 次复测。`
        : `${versionCoverage.issueSummary.join('；')} ${versionCoverage.nextVersionStep}`,
    ),
    gateCheck(
      'protocol-compliance',
      '协议执行一致',
      protocolCompliance.status === 'blocked' ? 'blocked' : protocolCompliance.status === 'partial' ? 'blocked' : protocolCompliance.status === 'empty' ? 'warning' : 'passed',
      protocolCompliance.status === 'aligned'
        ? `当前版本 ${protocolCompliance.completeExecutionCount} 条评估均按协议完整执行。`
        : `${protocolCompliance.issueSummary.join('；')} ${protocolCompliance.nextProtocolStep}`,
    ),
    gateCheck(
      'focus-coverage',
      '复测焦点覆盖',
      coveredFocusCount(focusCounts) >= 2 ? 'passed' : coveredFocusCount(focusCounts) === 1 ? 'warning' : 'warning',
      coveredFocusCount(focusCounts) >= 2
        ? `已覆盖 ${coveredFocusNames(focusCounts).join('、')} 焦点。`
        : coveredFocusCount(focusCounts) === 1
          ? `目前只覆盖 ${coveredFocusNames(focusCounts).join('、')} 焦点，建议补充对照或扩展复测。`
          : '尚未形成带计划快照的焦点覆盖。',
    ),
    gateCheck(
      'replication-matrix',
      '复测矩阵',
      replicationMatrix.status === 'ready' ? 'passed' : replicationMatrix.status === 'empty' ? 'warning' : 'blocked',
      replicationMatrix.status === 'ready'
        ? `确认、边界、对照、扩展槽位均已满足，矩阵分 ${replicationMatrix.score}。`
        : replicationMatrix.status === 'blocked'
          ? `存在${replicationMatrix.conflictingFocuses.map(focusLabelForIssue).join('、')}槽位冲突，需要先拆分或修订规则。`
          : replicationMatrix.status === 'incomplete'
            ? `还缺少${replicationMatrix.missingFocuses.map(focusLabelForIssue).join('、')}槽位，不能默认采用。`
            : '尚未形成复测矩阵，至少要先完成带槽位的复测。',
    ),
    gateCheck(
      'maintenance-regression',
      '维护回归',
      maintenanceRegressions.length === 0 ? 'passed' : 'blocked',
      maintenanceRegressions.length === 0
        ? '当前没有未解决维护回归。'
        : `仍有 ${maintenanceRegressions.length} 个维护回归槽位未关闭：${maintenanceRegressions.map((item) => focusLabelForIssue(item.focus)).join('、')}。`,
    ),
    gateCheck(
      'recovery-observation',
      '恢复观察期',
      observingRecoveredSlots === 0 ? 'passed' : 'warning',
      observingRecoveredSlots === 0
        ? '当前矩阵没有处于恢复观察期的槽位。'
        : `${observingRecoveredSlots} 个槽位刚从历史冲突恢复：${replicationMatrix.recoveryObservationFocuses.map(focusLabelForIssue).join('、')}，默认采用前需要继续观察。`,
    ),
  ]

  if (failed > 0 && verdict !== 'conflicted') {
    checks.push(gateCheck('failure-residue', '失败残留', 'warning', `仍有 ${failed} 次无效样本，采用时需要保留限制条件。`))
  }

  if (uncertain > 0) {
    checks.push(gateCheck('uncertain-residue', '不确定样本', 'warning', `仍有 ${uncertain} 次不确定样本，后续应补成明确结果。`))
  }

  const blockers = checks.filter((check) => check.status === 'blocked').map((check) => `${check.label}：${check.detail}`)
  const warnings = checks.filter((check) => check.status === 'warning').map((check) => `${check.label}：${check.detail}`)
  const ready = targetDecision === 'adopt' && blockers.length === 0

  return {
    status: blockers.length > 0 ? 'blocked' : ready ? 'ready' : 'attention',
    ready,
    targetDecision,
    checks,
    blockers,
    warnings,
  }
}

export function repeatabilityProfileFor(
  verdict: EvaluationVerdict,
  evaluations: RuleEvaluation[],
  passed: number,
  failed: number,
  uncertain: number,
  sampleIndependence = sampleIndependenceProfileFor(evaluations),
  protocolCompliance = protocolComplianceProfileFor(evaluations),
): EvaluationRepeatabilityProfile {
  const total = evaluations.length
  const decisive = passed + failed
  const evidenceComplete = evaluations.filter((evaluation) => evaluation.observationId && evaluation.observationText?.trim()).length
  const planned = evaluations.filter((evaluation) => evaluation.source === 'plan' && evaluation.planSnapshot).length
  const focusCoverage = coveredFocusCount(evaluationFocusCounts(evaluations))
  const decisiveRate = total === 0 ? 0 : roundRate(decisive / total)
  const evidenceRate = total === 0 ? 0 : roundRate(evidenceComplete / total)
  const plannedRate = total === 0 ? 0 : roundRate(planned / total)
  const sampleScore = Math.min(total / 5, 1) * 24
  const decisiveScore = decisiveRate * 20
  const evidenceScore = evidenceRate * 22
  const plannedScore = plannedRate * 16
  const focusScore = Math.min(focusCoverage / 3, 1) * 10
  const independenceScore = sampleIndependence.score * 0.08
  const protocolScore = protocolCompliance.score * 0.08
  const conflictScore = verdict === 'conflicted' ? 0 : 4
  const score = normalizeEvaluationScore(sampleScore + decisiveScore + evidenceScore + plannedScore + focusScore + independenceScore + protocolScore + conflictScore)
  const issueSummary = repeatabilityIssues(total, decisiveRate, evidenceRate, plannedRate, focusCoverage, uncertain, verdict, sampleIndependence, protocolCompliance)

  return {
    score,
    level: repeatabilityLevelFor(score, evidenceRate, sampleIndependence.level, focusCoverage, protocolCompliance.status),
    decisiveRate,
    evidenceRate,
    plannedRate,
    focusCoverage,
    sampleIndependenceScore: sampleIndependence.score,
    sampleIndependenceLevel: sampleIndependence.level,
    issueSummary,
    nextRepeatableStep: nextRepeatableStepFor(total, decisiveRate, evidenceRate, plannedRate, focusCoverage, verdict, sampleIndependence, protocolCompliance),
  }
}

export function sampleIndependenceProfileFor(evaluations: RuleEvaluation[]): EvaluationSampleIndependenceProfile {
  const qualified = evaluations.filter((evaluation) => evaluation.outcome !== 'uncertain')
  const days = qualified.map((evaluation) => dayKeyOf(evaluation.createdAt)).filter(Boolean)
  const scenarios = qualified.map((evaluation) => scenarioKeyOf(evaluation)).filter(Boolean)
  const dayCounts = countValues(days)
  const scenarioCounts = countValues(scenarios)
  const independentDayCount = dayCounts.size
  const independentScenarioCount = scenarioCounts.size
  const maxSameDayCount = maxCount(dayCounts)
  const maxSameScenarioCount = maxCount(scenarioCounts)
  const duplicateScenarioCount = Array.from(scenarioCounts.values()).reduce((total, count) => total + Math.max(0, count - 1), 0)
  const total = qualified.length
  const dayRate = total === 0 ? 0 : independentDayCount / total
  const scenarioRate = total === 0 ? 0 : independentScenarioCount / total
  const duplicatePenalty = total === 0 ? 0 : duplicateScenarioCount / total
  const sameDayPenalty = total === 0 ? 0 : Math.max(0, maxSameDayCount - 2) / total
  const score = normalizeEvaluationScore(dayRate * 42 + scenarioRate * 42 + Math.min(independentDayCount / 3, 1) * 8 + Math.min(independentScenarioCount / 3, 1) * 8 - duplicatePenalty * 22 - sameDayPenalty * 12)
  const level = sampleIndependenceLevelFor(score, total, independentDayCount, independentScenarioCount)
  const issueSummary = sampleIndependenceIssues(total, independentDayCount, independentScenarioCount, duplicateScenarioCount, maxSameDayCount, maxSameScenarioCount)

  return {
    score,
    level,
    independentDayCount,
    independentScenarioCount,
    duplicateScenarioCount,
    maxSameDayCount,
    maxSameScenarioCount,
    issueSummary,
    nextIndependenceStep: nextIndependenceStepFor(level, independentDayCount, independentScenarioCount, duplicateScenarioCount),
  }
}

export function evaluationConsistencyProfileFor(evaluations: RuleEvaluation[]): EvaluationConsistencyProfile {
  const summaries = EVALUATION_FOCUSES.map((focus) => focusConsistencyFor(focus, evaluations)).filter((summary) => summary.total > 0)
  const scopedEvaluationCount = summaries.reduce((total, summary) => total + summary.total, 0)
  const decisiveCount = summaries.reduce((total, summary) => total + summary.passed + summary.failed, 0)
  const agreedCount = summaries.reduce((total, summary) => total + Math.max(summary.passed, summary.failed), 0)
  const agreementRate = decisiveCount === 0 ? 0 : roundRate(agreedCount / decisiveCount)
  const conflictingFocuses = summaries.filter((summary) => summary.passed > 0 && summary.failed > 0).map((summary) => summary.focus)
  const completeProtocolCount = evaluations.filter((evaluation) => evaluation.protocolExecution?.status === 'complete').length
  const protocolCompletenessRate = evaluations.length === 0 ? 0 : completeProtocolCount / evaluations.length
  const score = normalizeEvaluationScore(agreementRate * 62 + Math.min(scopedEvaluationCount / 4, 1) * 18 + protocolCompletenessRate * 20)
  const status = consistencyStatusFor(scopedEvaluationCount, decisiveCount, agreementRate, conflictingFocuses.length)

  return {
    status,
    score,
    agreementRate,
    scopedEvaluationCount,
    conflictingFocuses,
    focusSummaries: summaries.sort((a, b) => b.total - a.total || focusPriority(a.focus) - focusPriority(b.focus)),
    issueSummary: consistencyIssues(scopedEvaluationCount, decisiveCount, agreementRate, conflictingFocuses, protocolCompletenessRate),
    nextConsistencyStep: nextConsistencyStepFor(status, conflictingFocuses, summaries),
  }
}

export function evaluationReplicationMatrixFor(evaluations: RuleEvaluation[]): EvaluationReplicationMatrix {
  const slots = EVALUATION_FOCUSES.map((focus) => replicationSlotFor(focus, evaluations))
  const completedSlots = slots.filter((slot) => slot.status === 'complete').length
  const recoveredSlots = slots.filter((slot) => (slot.recoveredConflictCount ?? 0) > 0).length
  const recoveryFocuses = slots.filter((slot) => (slot.recoveredConflictCount ?? 0) > 0).map((slot) => slot.focus)
  const observingRecoveredSlots = slots.filter((slot) => slot.recoveryObservationStatus === 'observing').length
  const recoveryObservationFocuses = slots.filter((slot) => slot.recoveryObservationStatus === 'observing').map((slot) => slot.focus)
  const conflictingFocuses = slots.filter((slot) => slot.status === 'conflicted').map((slot) => slot.focus)
  const missingFocuses = slots.filter((slot) => slot.status === 'missing' || slot.status === 'partial').map((slot) => slot.focus)
  const totalCompleted = slots.reduce((total, slot) => total + Math.min(slot.completedCount, slot.requiredCount), 0)
  const totalRequired = slots.reduce((total, slot) => total + slot.requiredCount, 0)
  const totalProtocolComplete = slots.reduce((total, slot) => total + slot.completeProtocolCount, 0)
  const totalScoped = slots.reduce((total, slot) => total + slot.completedCount, 0)
  const slotRate = totalRequired === 0 ? 0 : totalCompleted / totalRequired
  const protocolRate = totalScoped === 0 ? 0 : totalProtocolComplete / totalScoped
  const status = replicationMatrixStatusFor(evaluations.length, completedSlots, slots.length, conflictingFocuses.length)
  const rawScore = slotRate * 78 + protocolRate * 12 + (conflictingFocuses.length === 0 ? 10 : 0)
  const score = normalizeEvaluationScore(status === 'blocked' ? Math.min(rawScore, 64) : rawScore)
  const nextFocus = nextReplicationMatrixFocus(status, slots, conflictingFocuses)

  return {
    status,
    score,
    ready: status === 'ready',
    completedSlots,
    totalSlots: slots.length,
    recoveredSlots,
    recoveryFocuses,
    observingRecoveredSlots,
    recoveryObservationFocuses,
    missingFocuses,
    conflictingFocuses,
    nextFocus,
    slots,
    nextMatrixStep: nextReplicationMatrixStep(status, slots, missingFocuses, conflictingFocuses),
  }
}

export function boundaryCatalogFor(rule: ExperienceRule, verdict: EvaluationVerdict, evaluations: RuleEvaluation[]): EvaluationBoundaryCase[] {
  return evaluations
    .filter((evaluation): evaluation is RuleEvaluation & { outcome: 'failed' | 'uncertain' } => evaluation.outcome === 'failed' || evaluation.outcome === 'uncertain')
    .map((evaluation) => {
      const focus = evaluation.replicationSlotFocus ?? evaluation.protocolSnapshot?.focus ?? evaluation.planSnapshot?.focus
      const scenario = evaluation.observationText?.trim() || evaluation.note || '缺少复测场景。'
      const evidenceStatus: EvaluationBoundaryCase['evidenceStatus'] = evaluation.observationId && evaluation.observationText?.trim() && evaluation.protocolSnapshot ? 'complete' : 'incomplete'
      const failed = evaluation.outcome === 'failed'
      const severity: EvaluationBoundaryCase['severity'] = failed && verdict === 'conflicted' ? 'critical' : failed ? 'watch' : 'unknown'

      return {
        id: `boundary_${evaluation.id}`,
        evaluationId: evaluation.id,
        createdAt: evaluation.createdAt,
        outcome: evaluation.outcome,
        severity,
        focus,
        scenario,
        hypothesis: failed ? boundaryFailureHypothesis(rule, focus) : boundaryUncertainHypothesis(rule, focus),
        suggestedConstraint: failed ? boundarySuggestedConstraint(rule, focus) : boundaryEvidenceConstraint(rule, focus),
        evidenceStatus,
      }
    })
    .sort(
      (a, b) =>
        boundarySeverityValue(b.severity) - boundarySeverityValue(a.severity) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
}

export function revisionDraftFor(
  rule: ExperienceRule,
  verdict: EvaluationVerdict,
  adoptionDecision: EvaluationAdoptionDecision,
  adoptionGate: EvaluationAdoptionGate,
  boundaryCatalog: EvaluationBoundaryCase[],
): RuleRevisionDraft | undefined {
  const shouldRevise =
    verdict === 'conflicted' ||
    adoptionDecision === 'repair' ||
    adoptionDecision === 'suspend' ||
    boundaryCatalog.some((boundary) => boundary.severity === 'critical' || boundary.severity === 'watch')

  if (!shouldRevise) return undefined

  const failedBoundaries = boundaryCatalog.filter((boundary) => boundary.outcome === 'failed')
  const uncertainBoundaries = boundaryCatalog.filter((boundary) => boundary.outcome === 'uncertain')
  const suggestedConstraints = uniqueTexts([
    ...rule.conditions,
    ...failedBoundaries.map((boundary) => boundary.suggestedConstraint),
  ])
  const excludedScenarios = uniqueTexts(
    failedBoundaries.map((boundary) => boundary.scenario).filter((scenario) => scenario !== '缺少复测场景。'),
  )
  const evidenceIds = uniqueTexts(boundaryCatalog.map((boundary) => boundary.evaluationId))
  const priority = verdict === 'conflicted' || adoptionDecision === 'suspend' ? 'high' : adoptionDecision === 'repair' ? 'medium' : 'low'
  const draftId = `revision_${rule.id}_${boundaryCatalog[0]?.evaluationId ?? adoptionDecision}`

  if (rule.revisionHistory?.some((record) => record.draftId === draftId)) return undefined

  return {
    id: draftId,
    createdAt: boundaryCatalog[0]?.createdAt ?? new Date(0).toISOString(),
    priority,
    reason: revisionDraftReason(verdict, adoptionDecision, failedBoundaries.length, uncertainBoundaries.length, adoptionGate.blockers.length),
    title: rule.title,
    conclusion: revisionDraftConclusion(rule, failedBoundaries, uncertainBoundaries),
    recommendation: revisionDraftRecommendation(rule, adoptionDecision),
    keptConditions: rule.conditions,
    suggestedConstraints,
    excludedScenarios,
    evidenceIds,
  }
}

function reviewStateFor(totalDecisive: number, passed: number, failed: number): Pick<DerivedEvaluationState, 'reviewStatus' | 'reusability'> {
  if (totalDecisive === 0) {
    return { reviewStatus: 'watching', reusability: 'watch' }
  }

  if (failed >= 2 && failed >= passed) {
    return { reviewStatus: 'needsFix', reusability: 'watch' }
  }

  if (passed >= 3 && failed === 0) {
    return { reviewStatus: 'validated', reusability: 'high' }
  }

  if (passed >= 2 && passed > failed) {
    return { reviewStatus: 'validated', reusability: 'medium' }
  }

  return { reviewStatus: 'watching', reusability: failed > passed ? 'watch' : 'medium' }
}

function ruleQualityIssueCount(evaluations: RuleEvaluation[]) {
  return evaluations.reduce((total, evaluation) => {
    let issues = 0
    if (!evaluation.observationText?.trim()) issues += 1
    if (!evaluation.observationId) issues += 1
    if (evaluation.source === 'plan' && !evaluation.planSnapshot) issues += 1
    return total + issues
  }, 0)
}

function unresolvedMaintenanceRegressions(evaluations: RuleEvaluation[]) {
  const latestByFocus = new Map<EvaluationPlanFocus, RuleEvaluation>()
  const fallback: Array<{ focus: EvaluationPlanFocus; evaluation: RuleEvaluation }> = []
  const ordered = evaluations
    .map((evaluation, index) => ({ evaluation, index }))
    .sort((a, b) => {
      const timeDiff = new Date(b.evaluation.createdAt).getTime() - new Date(a.evaluation.createdAt).getTime()
      return timeDiff || a.index - b.index
    })

  for (const { evaluation } of ordered) {
    const focus = evaluationFocusOf(evaluation)
    if (!focus) continue
    if (!latestByFocus.has(focus)) {
      latestByFocus.set(focus, evaluation)
    }
  }

  for (const evaluation of evaluations) {
    if (evaluation.cycle !== 'maintenance' || evaluation.outcome === 'passed') continue
    const focus = evaluationFocusOf(evaluation)
    if (focus) continue
    fallback.push({ focus: 'confirmation', evaluation })
  }

  return [
    ...Array.from(latestByFocus.entries())
      .filter(([, evaluation]) => evaluation.outcome !== 'passed' && hasMaintenanceRegressionSource(evaluations, evaluation))
      .map(([focus, evaluation]) => ({ focus, evaluation })),
    ...fallback,
  ]
}

function hasMaintenanceRegressionSource(evaluations: RuleEvaluation[], latestEvaluation: RuleEvaluation) {
  const focus = evaluationFocusOf(latestEvaluation)
  if (!focus) return latestEvaluation.cycle === 'maintenance'
  const latestTime = new Date(latestEvaluation.createdAt).getTime()
  return evaluations.some((evaluation) => {
    if (evaluationFocusOf(evaluation) !== focus || evaluation.cycle !== 'maintenance' || evaluation.outcome === 'passed') return false
    return new Date(evaluation.createdAt).getTime() <= latestTime
  })
}

function gateCheck(id: string, label: string, status: EvaluationGateCheckStatus, detail: string): EvaluationGateCheck {
  return {
    id,
    label,
    status,
    detail,
  }
}

function evaluationFocusCounts(evaluations: RuleEvaluation[]) {
  const counts: Record<EvaluationPlanFocus, number> = {
    confirmation: 0,
    boundary: 0,
    contrast: 0,
    expansion: 0,
  }

  for (const evaluation of evaluations) {
    if (evaluation.planSnapshot) {
      counts[evaluation.planSnapshot.focus] += 1
    }
  }

  return counts
}

function coveredFocusCount(counts: Record<EvaluationPlanFocus, number>) {
  return Object.values(counts).filter((count) => count > 0).length
}

function coveredFocusNames(counts: Record<EvaluationPlanFocus, number>) {
  return (Object.entries(counts) as Array<[EvaluationPlanFocus, number]>)
    .filter(([, count]) => count > 0)
    .map(([focus]) => focusLabel(focus))
}

function focusLabel(focus: EvaluationPlanFocus) {
  const map: Record<EvaluationPlanFocus, string> = {
    confirmation: '确认',
    boundary: '边界',
    contrast: '对照',
    expansion: '扩展',
  }
  return map[focus]
}

function protocolTitleFor(focus: EvaluationPlanFocus, title: string) {
  const map: Record<EvaluationPlanFocus, string> = {
    confirmation: `确认复测：${title}`,
    boundary: `边界复测：${title}`,
    contrast: `对照复测：${title}`,
    expansion: `扩展复测：${title}`,
  }
  return map[focus]
}

function passCriteriaFor(rule: ExperienceRule, focus: EvaluationPlanFocus, passed: number) {
  const criteria = [
    `本次场景满足规则适用条件：${listOrFallback(rule.conditions, '未记录条件')}`,
    `按推荐行动执行后，结果与结论一致：${rule.conclusion}`,
  ]

  if (focus === 'expansion') {
    criteria.push('新增时间、地点或对象后仍能得到同类结果。')
  }

  if (focus === 'contrast') {
    criteria.push('与对照场景相比，关键差异能解释规则为什么成立。')
  }

  if (passed > 0) {
    criteria.push(`与既有 ${passed} 次有效样本的关键前提一致。`)
  }

  return criteria
}

function failCriteriaFor(rule: ExperienceRule, verdict: EvaluationVerdict, failed: number) {
  const criteria = [
    `场景满足适用条件，但按推荐行动执行后未得到预期结果：${rule.recommendation}`,
    '出现新的限制条件，导致原结论不能直接使用。',
  ]

  if (rule.warnings.length > 0) {
    criteria.push(`触发注意事项：${rule.warnings.join('、')}`)
  }

  if (verdict === 'conflicted' || failed > 0) {
    criteria.push(`与既有 ${failed} 次无效样本呈现相同失败前提。`)
  }

  return criteria
}

function uncertainCriteriaFor(rule: ExperienceRule, uncertain: number) {
  const criteria = [
    '场景缺少时间、地点、对象或关键约束，无法判断是否满足适用条件。',
    '结果受到外部因素干扰，不能归因到这条规则。',
  ]

  if (uncertain > 0) {
    criteria.push(`与既有 ${uncertain} 次不确定样本一样，缺少可复核证据。`)
  }

  if (rule.conditions.length === 0) {
    criteria.push('规则尚未记录明确适用条件，本次结果不能直接作为有效或无效。')
  }

  return criteria
}

function requiredEvidenceFor(rule: ExperienceRule, focus: EvaluationPlanFocus, score: number, confidence: EvaluationConfidence, total: number) {
  const evidence = [
    '复测发生的时间、地点和对象。',
    `本次是否满足适用条件：${listOrFallback(rule.conditions, '补充至少一个条件')}`,
    '实际采取的行动和可观察结果。',
    '与原始规则不同的限制条件或异常因素。',
  ]

  if (focus === 'boundary') {
    evidence.push('最容易让规则失效的边界前提。')
  }

  if (focus === 'contrast') {
    evidence.push('有效场景和无效场景的关键差异。')
  }

  if (score < 75 || confidence !== 'high' || total < 5) {
    evidence.push('本次样本与历史样本的相似点和差异点。')
  }

  return evidence
}

function listOrFallback(values: string[], fallback: string) {
  return values.length > 0 ? values.join('、') : fallback
}

function confidenceLabel(confidence: EvaluationConfidence) {
  const map: Record<EvaluationConfidence, string> = {
    low: '低置信',
    medium: '中置信',
    high: '高置信',
  }
  return map[confidence]
}

function trendLabel(trend: EvaluationTrend) {
  const map: Record<EvaluationTrend, string> = {
    unknown: '趋势不足',
    improving: '趋势增强',
    declining: '趋势走弱',
    flat: '趋势平稳',
  }
  return map[trend]
}

function roundRate(value: number) {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100
}

function repeatabilityLevelFor(
  score: number,
  evidenceRate = 1,
  sampleIndependenceLevel: EvaluationSampleIndependenceLevel = 'independent',
  focusCoverage = 4,
  protocolComplianceStatus: EvaluationProtocolComplianceStatus = 'aligned',
): EvaluationRepeatabilityLevel {
  if (evidenceRate < 0.75 || sampleIndependenceLevel === 'weak' || protocolComplianceStatus === 'blocked') return 'weak'
  if (focusCoverage < 4 && score >= 78) return 'developing'
  if (sampleIndependenceLevel === 'clustered' && score >= 78) return 'developing'
  if (protocolComplianceStatus === 'partial' && score >= 78) return 'developing'
  if (score >= 78) return 'repeatable'
  if (score >= 50) return 'developing'
  return 'weak'
}

function repeatabilityIssues(
  total: number,
  decisiveRate: number,
  evidenceRate: number,
  plannedRate: number,
  focusCoverage: number,
  uncertain: number,
  verdict: EvaluationVerdict,
  sampleIndependence: EvaluationSampleIndependenceProfile,
  protocolCompliance: EvaluationProtocolComplianceProfile,
) {
  const issues: string[] = []
  if (total < 2) issues.push(`复测样本只有 ${total} 次，至少补足 2 次。`)
  if (total > 0 && decisiveRate < 0.75) issues.push(`明确结果率 ${Math.round(decisiveRate * 100)}%，不确定样本偏多。`)
  if (evidenceRate < 1 && total > 0) issues.push(`证据完整率 ${Math.round(evidenceRate * 100)}%，仍有评估缺少场景或观察绑定。`)
  if (plannedRate < 0.5 && total >= 2) issues.push(`计划执行率 ${Math.round(plannedRate * 100)}%，复测流程还不够标准化。`)
  if (focusCoverage < 2 && total >= 2) issues.push('复测焦点覆盖不足，缺少跨焦点验证。')
  else if (focusCoverage < 4 && total >= 2) issues.push(`复测焦点只覆盖 ${focusCoverage}/4，默认采用前还需要补齐矩阵槽位。`)
  if (sampleIndependence.level !== 'independent' && total >= 2) issues.push(`样本独立性${sampleIndependence.score}分：${sampleIndependence.issueSummary.join('；')}`)
  if (protocolCompliance.status === 'blocked' || protocolCompliance.status === 'partial') issues.push(`协议执行${protocolCompliance.score}分：${protocolCompliance.issueSummary.join('；')}`)
  if (uncertain > 0) issues.push(`仍有 ${uncertain} 次不确定结果，需要补成明确有效或无效。`)
  if (verdict === 'conflicted') issues.push('存在冲突结论，需要先拆分边界再继续复测。')
  return issues
}

function nextRepeatableStepFor(
  total: number,
  decisiveRate: number,
  evidenceRate: number,
  plannedRate: number,
  focusCoverage: number,
  verdict: EvaluationVerdict,
  sampleIndependence: EvaluationSampleIndependenceProfile,
  protocolCompliance: EvaluationProtocolComplianceProfile,
) {
  if (verdict === 'conflicted') return '下一次优先做边界复测，并把失败前提写成可检查条件。'
  if (total < 2) return '先补足最少 2 次带场景证据的复测。'
  if (protocolCompliance.status === 'blocked' || protocolCompliance.status === 'partial') return protocolCompliance.nextProtocolStep
  if (evidenceRate < 1) return '先补齐缺失的复测场景和观察绑定，再继续扩大样本。'
  if (decisiveRate < 0.75) return '把不确定样本复测成明确有效或无效。'
  if (plannedRate < 0.5) return '下一次按系统复测计划执行，并保留计划快照。'
  if (sampleIndependence.level !== 'independent') return sampleIndependence.nextIndependenceStep
  if (focusCoverage < 2) return '补一个不同焦点的复测，优先选择对照或边界场景。'
  if (focusCoverage < 4) return '继续补齐确认、边界、对照、扩展矩阵中尚未覆盖的焦点。'
  return '复测过程已经具备复现基础，后续按低频抽样维护。'
}

function sampleIndependenceLevelFor(score: number, total: number, independentDayCount: number, independentScenarioCount: number): EvaluationSampleIndependenceLevel {
  if (total < 2 || independentDayCount < 2 || independentScenarioCount < 2 || score < 45) return 'weak'
  if (independentDayCount < 3 || independentScenarioCount < 3 || score < 78) return 'clustered'
  return 'independent'
}

function sampleIndependenceIssues(
  total: number,
  independentDayCount: number,
  independentScenarioCount: number,
  duplicateScenarioCount: number,
  maxSameDayCount: number,
  maxSameScenarioCount: number,
) {
  const issues: string[] = []
  if (total < 2) issues.push('明确样本不足，无法判断独立性。')
  if (independentDayCount < 2 && total >= 2) issues.push(`只覆盖 ${independentDayCount} 个复测日期。`)
  if (independentScenarioCount < 2 && total >= 2) issues.push(`只覆盖 ${independentScenarioCount} 个复测场景。`)
  if (duplicateScenarioCount > 0) issues.push(`有 ${duplicateScenarioCount} 次重复场景样本。`)
  if (maxSameDayCount > 2) issues.push(`同一天最多记录 ${maxSameDayCount} 次，存在集中点击风险。`)
  if (maxSameScenarioCount > 1) issues.push(`同一场景最多重复 ${maxSameScenarioCount} 次。`)
  return issues
}

function nextIndependenceStepFor(
  level: EvaluationSampleIndependenceLevel,
  independentDayCount: number,
  independentScenarioCount: number,
  duplicateScenarioCount: number,
) {
  if (level === 'independent') return '样本已覆盖多个日期和场景，后续按矩阵维护节奏抽样。'
  if (independentDayCount < 2) return '下一次换一个日期复测，避免同一天连续点击凑样本。'
  if (independentScenarioCount < 2 || duplicateScenarioCount > 0) return '下一次换一个具体场景复测，记录不同时间、地点或对象。'
  return '再补一个独立日期或独立场景样本后再默认采用。'
}

function dayKeyOf(value: string) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  return new Date(time).toISOString().slice(0, 10)
}

function scenarioKeyOf(evaluation: RuleEvaluation) {
  const raw = evaluation.observationText?.trim() || evaluation.note.trim()
  return raw.toLowerCase().replace(/\s+/g, '').slice(0, 80)
}

function countValues(values: string[]) {
  return values.reduce((map, value) => {
    map.set(value, (map.get(value) ?? 0) + 1)
    return map
  }, new Map<string, number>())
}

function maxCount(map: Map<string, number>) {
  return Array.from(map.values()).reduce((max, count) => Math.max(max, count), 0)
}

function focusConsistencyFor(focus: EvaluationPlanFocus, evaluations: RuleEvaluation[]): EvaluationFocusConsistency {
  const scoped = evaluations.filter((evaluation) => evaluationFocusOf(evaluation) === focus)
  const passed = scoped.filter((evaluation) => evaluation.outcome === 'passed').length
  const failed = scoped.filter((evaluation) => evaluation.outcome === 'failed').length
  const uncertain = scoped.length - passed - failed
  const decisive = passed + failed
  const dominantOutcome: EvaluationFocusConsistency['dominantOutcome'] = passed === failed ? undefined : passed > failed ? 'passed' : 'failed'

  return {
    focus,
    total: scoped.length,
    passed,
    failed,
    uncertain,
    agreementRate: decisive === 0 ? 0 : roundRate(Math.max(passed, failed) / decisive),
    dominantOutcome,
  }
}

function evaluationFocusOf(evaluation: RuleEvaluation): EvaluationPlanFocus | undefined {
  return evaluation.replicationSlotFocus ?? evaluation.protocolSnapshot?.focus ?? evaluation.planSnapshot?.focus
}

function consistencyStatusFor(
  scopedEvaluationCount: number,
  decisiveCount: number,
  agreementRate: number,
  conflictingFocusCount: number,
): EvaluationConsistencyStatus {
  if (scopedEvaluationCount < 2 || decisiveCount < 2) return 'insufficient'
  if (conflictingFocusCount > 0 && agreementRate < 0.8) return 'conflicting'
  if (agreementRate < 0.9) return 'drifting'
  return 'stable'
}

function consistencyIssues(
  scopedEvaluationCount: number,
  decisiveCount: number,
  agreementRate: number,
  conflictingFocuses: EvaluationPlanFocus[],
  protocolCompletenessRate: number,
) {
  const issues: string[] = []
  if (scopedEvaluationCount < 2) issues.push(`带协议焦点的复测只有 ${scopedEvaluationCount} 次，无法比较重复一致性。`)
  if (decisiveCount < 2 && scopedEvaluationCount >= 2) issues.push('明确有效/无效样本不足，暂时只能观察不能判断一致性。')
  if (conflictingFocuses.length > 0) issues.push(`同一焦点出现有效/无效冲突：${conflictingFocuses.map(focusLabelForIssue).join('、')}。`)
  if (agreementRate > 0 && agreementRate < 0.9) issues.push(`同焦点结果一致率 ${Math.round(agreementRate * 100)}%，需要继续定位差异条件。`)
  if (protocolCompletenessRate < 1 && scopedEvaluationCount > 0) issues.push(`协议完整执行率 ${Math.round(protocolCompletenessRate * 100)}%，部分样本不可完全复现。`)
  return issues
}

function nextConsistencyStepFor(
  status: EvaluationConsistencyStatus,
  conflictingFocuses: EvaluationPlanFocus[],
  summaries: ReturnType<typeof focusConsistencyFor>[],
) {
  if (status === 'conflicting') return `优先围绕${conflictingFocuses.map(focusLabelForIssue).join('、')}做对照复测，拆出导致有效/无效差异的前提。`
  if (status === 'drifting') return '选择结果最不一致的焦点补一条带完整协议执行的复测。'
  if (status === 'stable') return '同焦点结果已稳定，下一步可扩展到未覆盖焦点做低频复核。'
  const missingFocus = EVALUATION_FOCUSES.find((focus) => !summaries.some((summary) => summary.focus === focus)) ?? 'confirmation'
  return `先补 2 次带协议焦点的明确复测，优先补${focusLabelForIssue(missingFocus)}。`
}

function replicationSlotFor(focus: EvaluationPlanFocus, evaluations: RuleEvaluation[]): EvaluationReplicationSlot {
  const scoped = evaluations.filter((evaluation) => evaluationFocusOf(evaluation) === focus)
  const qualified = scoped.filter((evaluation) => evaluation.protocolExecution?.status !== 'blocked')
  const orderedQualified = [...qualified].sort(compareEvaluationDesc)
  const completedCount = qualified.length
  const passed = qualified.filter((evaluation) => evaluation.outcome === 'passed').length
  const failed = qualified.filter((evaluation) => evaluation.outcome === 'failed').length
  const decisiveCount = passed + failed
  const requiredCount = replicationRequiredCount(focus)
  const completeProtocolCount = qualified.filter((evaluation) => evaluation.protocolExecution?.status === 'complete' || !evaluation.protocolExecution).length
  const latestEvaluatedAt = [...scoped].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt
  const latestPassedStreak = latestOutcomeStreak(orderedQualified, 'passed')
  const hasHistoricalConflict = passed > 0 && failed > 0
  const recoveredConflictCount = hasHistoricalConflict && latestPassedStreak >= requiredCount ? failed : 0
  const recoveryObservationRequiredCount = recoveredConflictCount > 0 ? requiredCount : 0
  const recoveryObservationPassedCount = recoveredConflictCount > 0 ? Math.max(0, latestPassedStreak - requiredCount) : 0
  const recoveryObservationStatus =
    recoveredConflictCount === 0
      ? undefined
      : recoveryObservationPassedCount >= recoveryObservationRequiredCount
        ? 'cleared'
        : 'observing'
  const status =
    hasHistoricalConflict && recoveredConflictCount === 0
      ? 'conflicted'
      : completedCount >= requiredCount && decisiveCount >= requiredCount
        ? 'complete'
        : completedCount > 0
          ? 'partial'
          : 'missing'

  return {
    focus,
    requiredCount,
    completedCount,
    decisiveCount,
    completeProtocolCount,
    status,
    latestEvaluatedAt,
    recoveredConflictCount: recoveredConflictCount || undefined,
    recoveryObservationStatus,
    recoveryObservationPassedCount: recoveredConflictCount > 0 ? recoveryObservationPassedCount : undefined,
    recoveryObservationRequiredCount: recoveredConflictCount > 0 ? recoveryObservationRequiredCount : undefined,
    recoverySummary: recoverySummaryFor(focus, recoveredConflictCount, latestPassedStreak, recoveryObservationPassedCount, recoveryObservationRequiredCount, recoveryObservationStatus),
    summary: replicationSlotSummary(focus, requiredCount, completedCount, decisiveCount, status, recoveredConflictCount, latestPassedStreak, recoveryObservationPassedCount, recoveryObservationRequiredCount, recoveryObservationStatus),
  }
}

function passedCount(rule: ExperienceRule, focus?: EvaluationPlanFocus) {
  return currentVersionEvaluations(rule).filter((evaluation) => evaluation.outcome === 'passed' && (!focus || evaluationFocusOf(evaluation) === focus)).length
}

function failedCount(rule: ExperienceRule, focus?: EvaluationPlanFocus) {
  return currentVersionEvaluations(rule).filter((evaluation) => evaluation.outcome === 'failed' && (!focus || evaluationFocusOf(evaluation) === focus)).length
}

function uncertainCount(rule: ExperienceRule, focus?: EvaluationPlanFocus) {
  return currentVersionEvaluations(rule).filter((evaluation) => evaluation.outcome === 'uncertain' && (!focus || evaluationFocusOf(evaluation) === focus)).length
}

function replicationRequiredCount(focus: EvaluationPlanFocus) {
  return focus === 'confirmation' ? 2 : 1
}

function replicationMatrixStatusFor(
  evaluationCount: number,
  completedSlots: number,
  totalSlots: number,
  conflictingFocusCount: number,
): EvaluationReplicationMatrixStatus {
  if (evaluationCount === 0) return 'empty'
  if (conflictingFocusCount > 0) return 'blocked'
  if (completedSlots === totalSlots) return 'ready'
  return 'incomplete'
}

function replicationSlotSummary(
  focus: EvaluationPlanFocus,
  requiredCount: number,
  completedCount: number,
  decisiveCount: number,
  status: EvaluationReplicationSlot['status'],
  recoveredConflictCount = 0,
  latestPassedStreak = 0,
  recoveryObservationPassedCount = 0,
  recoveryObservationRequiredCount = 0,
  recoveryObservationStatus?: EvaluationReplicationSlot['recoveryObservationStatus'],
) {
  if (recoveredConflictCount > 0 && recoveryObservationStatus === 'observing') {
    return `${focusLabelForIssue(focus)}槽位历史冲突已恢复，观察期还需 ${Math.max(0, recoveryObservationRequiredCount - recoveryObservationPassedCount)} 次通过复测。`
  }
  if (recoveredConflictCount > 0) return `${focusLabelForIssue(focus)}槽位历史冲突已由最近 ${latestPassedStreak} 次通过复测恢复并清除观察期。`
  if (status === 'conflicted') return `${focusLabelForIssue(focus)}槽位出现有效/无效冲突，先做对照拆分。`
  if (status === 'complete') return `${focusLabelForIssue(focus)}槽位已完成 ${completedCount}/${requiredCount} 次明确复测。`
  if (completedCount > 0 && decisiveCount < requiredCount) return `${focusLabelForIssue(focus)}槽位已有 ${completedCount} 次复测，但明确结果不足。`
  if (completedCount > 0) return `${focusLabelForIssue(focus)}槽位已完成 ${completedCount}/${requiredCount} 次，还需补 ${requiredCount - completedCount} 次。`
  return `${focusLabelForIssue(focus)}槽位缺少复测样本。`
}

function recoverySummaryFor(
  focus: EvaluationPlanFocus,
  recoveredConflictCount: number,
  latestPassedStreak: number,
  recoveryObservationPassedCount: number,
  recoveryObservationRequiredCount: number,
  recoveryObservationStatus?: EvaluationReplicationSlot['recoveryObservationStatus'],
) {
  if (recoveredConflictCount === 0 || !recoveryObservationStatus) return undefined
  if (recoveryObservationStatus === 'cleared') {
    return `${focusLabelForIssue(focus)}槽位历史 ${recoveredConflictCount} 次无效已被最近 ${latestPassedStreak} 次通过复测覆盖，恢复观察期已清除。`
  }
  return `${focusLabelForIssue(focus)}槽位历史 ${recoveredConflictCount} 次无效已被最近 ${latestPassedStreak} 次通过复测覆盖，观察期进度 ${recoveryObservationPassedCount}/${recoveryObservationRequiredCount}。`
}

function latestOutcomeStreak(evaluations: RuleEvaluation[], outcome: EvaluationOutcome) {
  let count = 0
  for (const evaluation of evaluations) {
    if (evaluation.outcome !== outcome) break
    count += 1
  }
  return count
}

function nextReplicationMatrixStep(
  status: EvaluationReplicationMatrixStatus,
  slots: EvaluationReplicationSlot[],
  missingFocuses: EvaluationPlanFocus[],
  conflictingFocuses: EvaluationPlanFocus[],
) {
  if (status === 'blocked') return `先处理${conflictingFocuses.map(focusLabelForIssue).join('、')}槽位冲突，再扩大复测矩阵。`
  if (status === 'ready') {
    const observingSlot = nextRecoveryObservationSlot(slots)
    if (observingSlot) {
      const remaining = Math.max(0, (observingSlot.recoveryObservationRequiredCount ?? 0) - (observingSlot.recoveryObservationPassedCount ?? 0))
      return `${focusLabelForIssue(observingSlot.focus)}槽位刚从历史冲突恢复，还需 ${Math.max(1, remaining)} 次观察复测后再解除限制采用。`
    }
    const maintenanceFocus = leastRecentlyEvaluatedSlot(slots)?.focus ?? 'confirmation'
    return `四类复测槽位已满足，下一次低频维护优先抽样${focusLabelForIssue(maintenanceFocus)}槽位。`
  }
  const nextPartial = slots.find((slot) => slot.status === 'partial')
  if (nextPartial) return `补齐${focusLabelForIssue(nextPartial.focus)}槽位，还需 ${Math.max(1, nextPartial.requiredCount - nextPartial.completedCount)} 次明确复测。`
  const nextMissing = missingFocuses[0] ?? 'confirmation'
  return `下一次优先补${focusLabelForIssue(nextMissing)}槽位，按协议记录完整场景和结果。`
}

function nextReplicationMatrixFocus(
  status: EvaluationReplicationMatrixStatus,
  slots: EvaluationReplicationSlot[],
  conflictingFocuses: EvaluationPlanFocus[],
): EvaluationPlanFocus | undefined {
  if (status === 'empty') return undefined
  if (status === 'ready') return nextRecoveryObservationSlot(slots)?.focus ?? leastRecentlyEvaluatedSlot(slots)?.focus
  if (status === 'blocked') return conflictingFocuses[0]
  return slots.find((slot) => slot.status === 'partial')?.focus ?? slots.find((slot) => slot.status === 'missing')?.focus
}

function nextRecoveryObservationSlot(slots: EvaluationReplicationSlot[]) {
  return slots
    .filter((slot) => slot.recoveryObservationStatus === 'observing')
    .sort(
      (a, b) =>
        ((a.recoveryObservationPassedCount ?? 0) - (b.recoveryObservationPassedCount ?? 0)) ||
        focusPriority(a.focus) - focusPriority(b.focus),
    )[0]
}

function leastRecentlyEvaluatedSlot(slots: EvaluationReplicationSlot[]) {
  return [...slots].sort((a, b) => {
    const aTime = a.latestEvaluatedAt ? new Date(a.latestEvaluatedAt).getTime() : 0
    const bTime = b.latestEvaluatedAt ? new Date(b.latestEvaluatedAt).getTime() : 0
    return aTime - bTime || focusPriority(a.focus) - focusPriority(b.focus)
  })[0]
}

function focusPriority(focus: EvaluationPlanFocus) {
  return EVALUATION_FOCUSES.indexOf(focus)
}

function focusLabelForIssue(focus: EvaluationPlanFocus) {
  const map: Record<EvaluationPlanFocus, string> = {
    confirmation: '确认',
    boundary: '边界',
    contrast: '对照',
    expansion: '扩展',
  }
  return map[focus]
}

function requiredEvidencePromptForFocus(rule: ExperienceRule, focus: EvaluationPlanFocus) {
  const base = requiredEvidenceFor(rule, focus, rule.evaluationScore ?? 0, rule.evaluationConfidence ?? 'low', currentVersionEvaluations(rule).length)
  return base.join(' ')
}

function focusReasonFor(rule: ExperienceRule, focus: EvaluationPlanFocus, plan: EvaluationPlan) {
  const map: Record<EvaluationPlanFocus, string> = {
    confirmation: `按确认槽位复测“${rule.title}”，补足原始前提下的稳定样本。`,
    boundary: `按边界槽位复测“${rule.title}”，确认最容易失效的前提。`,
    contrast: `按对照槽位复测“${rule.title}”，比较有效与无效场景差异。`,
    expansion: `按扩展槽位复测“${rule.title}”，验证跨场景可用性。`,
  }
  return `${map[focus]}（${plan.reason}）`
}

function boundaryFailureHypothesis(rule: ExperienceRule, focus: EvaluationPlanFocus | undefined) {
  if (focus === 'boundary') return `“${rule.title}”在当前边界条件下失效，需要确认哪个前提过宽。`
  if (focus === 'contrast') return `有效场景和无效场景之间存在关键差异，原规则缺少区分条件。`
  if (focus === 'expansion') return `规则跨新时间、地点或对象后不成立，适用范围需要收窄。`
  return `场景看似满足条件但结果无效，需要补充限制条件。`
}

function boundaryUncertainHypothesis(rule: ExperienceRule, focus: EvaluationPlanFocus | undefined) {
  if (focus === 'boundary') return `“${rule.title}”的边界证据不足，无法判断是否真正失效。`
  if (focus === 'contrast') return '对照条件记录不足，无法解释有效和无效差异。'
  if (focus === 'expansion') return '扩展场景缺少关键上下文，不能判断规则是否可跨场景复用。'
  return '复测证据不足，不能把本次结果计入有效或无效。'
}

function boundarySuggestedConstraint(rule: ExperienceRule, focus: EvaluationPlanFocus | undefined) {
  const base = rule.conditions.length > 0 ? `保留条件“${rule.conditions.join('、')}”` : '先补充明确适用条件'
  if (focus === 'boundary') return `${base}，并把本次失败前提加入排除条件。`
  if (focus === 'contrast') return `${base}，新增能区分有效/无效场景的对照条件。`
  if (focus === 'expansion') return `${base}，限制到已验证的时间、地点或对象。`
  return `${base}，在采用前把本次失败触发条件加入排除条件。`
}

function boundaryEvidenceConstraint(rule: ExperienceRule, focus: EvaluationPlanFocus | undefined) {
  if (focus === 'boundary') return '补齐边界场景的时间、地点、对象和触发条件后再判断。'
  if (focus === 'contrast') return '补齐对照场景的差异字段，再决定是否拆分规则。'
  if (focus === 'expansion') return '补齐新场景与原始场景的差异，再判断能否扩展。'
  return rule.conditions.length === 0 ? '先补规则适用条件，再重新复测。' : '补齐复测证据后重新判定。'
}

function boundarySeverityValue(severity: EvaluationBoundaryCase['severity']) {
  const map: Record<EvaluationBoundaryCase['severity'], number> = {
    critical: 30,
    watch: 20,
    unknown: 10,
  }
  return map[severity]
}

function revisionDraftReason(
  verdict: EvaluationVerdict,
  adoptionDecision: EvaluationAdoptionDecision,
  failedBoundaryCount: number,
  uncertainBoundaryCount: number,
  blockerCount: number,
) {
  if (verdict === 'conflicted') return `存在冲突结论，已有 ${failedBoundaryCount} 条反例边界，需要优先收窄规则。`
  if (adoptionDecision === 'repair') return `采用前有 ${blockerCount} 个门槛阻断，且证据链需要修复。`
  if (failedBoundaryCount > 0) return `已有 ${failedBoundaryCount} 条失败边界，建议把失败前提写入限制条件。`
  if (uncertainBoundaryCount > 0) return `已有 ${uncertainBoundaryCount} 条不确定边界，建议先补充适用条件和证据要求。`
  return `当前采用决策为 ${adoptionDecision}，建议复核规则表述。`
}

function revisionDraftConclusion(rule: ExperienceRule, failedBoundaries: EvaluationBoundaryCase[], uncertainBoundaries: EvaluationBoundaryCase[]) {
  if (failedBoundaries.length > 0) {
    return `${rule.conclusion} 但需排除已出现失败前提的场景。`
  }
  if (uncertainBoundaries.length > 0) {
    return `${rule.conclusion} 但当前适用条件和证据要求需要补充后再判断。`
  }
  return rule.conclusion
}

function revisionDraftRecommendation(rule: ExperienceRule, adoptionDecision: EvaluationAdoptionDecision) {
  if (adoptionDecision === 'suspend') return `暂停默认采用“${rule.recommendation}”，先按边界协议复测。`
  if (adoptionDecision === 'repair') return `先补齐证据后再执行“${rule.recommendation}”。`
  if (adoptionDecision === 'limit') return `仅在已验证条件下执行：${rule.recommendation}`
  return rule.recommendation
}

function uniqueTexts(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function revisionSuggestionFor(rule: ExperienceRule, verdict: EvaluationVerdict, passed: number, failed: number) {
  if (verdict === 'conflicted') {
    return `已有 ${failed} 次复测无效，建议收窄规则“${rule.title}”的适用条件，重点检查时间、地点或前提是否过宽。`
  }

  if (verdict === 'mixed') {
    return `复测结果存在分歧，建议继续记录触发条件，找出有效与无效场景的差异。`
  }

  if (verdict === 'supported') {
    return `已有 ${passed} 次复测有效，可继续积累不同时间或地点下的证据。`
  }

  return '评估证据不足，至少需要 2 次复测后再判断规则稳定性。'
}

function averageOutcomeScore(evaluations: RuleEvaluation[]) {
  if (evaluations.length === 0) return undefined
  const score = evaluations.reduce((total, evaluation) => total + outcomeTrendValue(evaluation.outcome), 0)
  return score / evaluations.length
}

function outcomeTrendValue(outcome: EvaluationOutcome) {
  const map: Record<EvaluationOutcome, number> = {
    passed: 1,
    uncertain: 0,
    failed: -1,
  }
  return map[outcome]
}

function compareEvaluationAsc(a: RuleEvaluation, b: RuleEvaluation) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id)
}

function compareEvaluationDesc(a: RuleEvaluation, b: RuleEvaluation) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id.localeCompare(a.id)
}
