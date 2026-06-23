import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { demoSamples } from '../services/aiAnalyzer'
import { analyzeObservationResilient } from '../services/resilientAnalysis'
import { getActiveModelClient } from '../services/modelConfig'
import type { ObservationModelClient } from '../services/modelAnalysisAdapter'
import { inferDirection } from '../services/analysisContract'
import type { ObservationDirection } from '../services/analysisContract'
import type { ObservationSentiment } from '../types/experience'
import { discoverPatterns } from '../services/patternDiscovery'
import { discoverLaws, markLawStatus } from '../services/lawDiscovery'
import type { Insight, Law, LawStatus } from '../types/experience'
import { recallDecisionHints, type DecisionHint } from '../services/decisionHints'
import { renderExperienceMarkdown } from '../services/markdownExport'
import { buildPeriodicReview, type ReviewPeriod } from '../services/periodicReview'
import { getBackendUrl, analyzeBatchViaBackend } from '../services/backendClient'
import { DEMO_WORK_DATA } from '../services/demoWorkData'
import {
  deriveEvaluationState,
  evaluationPlanPriorityValue,
  evaluationPlanFor,
  evaluationPlanForFocus,
  evaluationProtocolFor,
  evaluationProtocolForFocus,
  normalizeEvaluationScore,
} from '../services/evaluationEngine'
import type {
  AdoptionDecisionEvent,
  AnalysisResult,
  EvaluationBoundaryCase,
  EvaluationConfidence,
  EvaluationAdoptionDecision,
  EvaluationImportResult,
  EvaluationMaintenanceHealth,
  EvaluationCandidate,
  EvaluationConsistencyStatus,
  EvaluationCycle,
  EvaluationGateStatus,
  EvaluationPlan,
  EvaluationPlanFocus,
  EvaluationPlanPriority,
  EvaluationProtocolExecution,
  EvaluationProtocolExecutionStatus,
  EvaluationPlanSnapshot,
  EvaluationProtocol,
  EvaluationProtocolSnapshot,
  EvaluationReplicationMatrixStatus,
  EvaluationReplicationSlot,
  EvaluationRepeatabilityLevel,
  EvaluationSettings,
  EvaluationSource,
  EvaluationTrend,
  EvaluationVerdict,
  EvaluationVersionCoverageStatus,
  EvaluationOutcome,
  ExperienceCategory,
  ExperienceRule,
  Feedback,
  Observation,
  ProcessStatus,
  Reusability,
  RuleEvaluation,
  RuleRevisionRecord,
  RuleReviewStatus,
} from '../types/experience'

const STORAGE_KEY = 'experience-os-state-v1'

export interface ImportSummary {
  total: number       // 拆出的非空行数
  succeeded: number  // 分析成功条数
  failed: number     // 分析失败条数(已降级保存)
  note?: string      // 提示信息(如单次数量超上限被截断)
}

interface PersistedState {
  observations: Observation[]
  rules: ExperienceRule[]
  evaluationSettings: EvaluationSettings
  insights?: Insight[]
  laws?: Law[]
}

const DEFAULT_EVALUATION_SETTINGS: EvaluationSettings = {
  normalReviewDays: 14,
  conflictReviewDays: 7,
  replicationMaintenanceDays: 14,
}

type ImportableRecord = Record<string, unknown>
interface AddEvaluationOptions {
  source?: EvaluationSource
  focus?: EvaluationPlanFocus
  cycle?: EvaluationCycle
}

const EXPERIENCE_CATEGORIES: readonly ExperienceCategory[] = ['饮食', '购物', '出行', '运动', '工作', '生活', '偏好', '其他']
const PROCESS_STATUSES: readonly ProcessStatus[] = ['pending', 'success', 'failed']
const REUSABILITY_VALUES: readonly Reusability[] = ['high', 'medium', 'low', 'watch']
const FEEDBACK_VALUES: readonly Feedback[] = ['useful', 'watch', 'inaccurate', 'none']
const REVIEW_STATUS_VALUES: readonly RuleReviewStatus[] = ['unreviewed', 'validated', 'watching', 'needsFix']
const EVALUATION_OUTCOMES: readonly EvaluationOutcome[] = ['passed', 'failed', 'uncertain']
const EVALUATION_VERDICTS: readonly EvaluationVerdict[] = ['insufficient', 'supported', 'mixed', 'conflicted']
const EVALUATION_CONFIDENCES: readonly EvaluationConfidence[] = ['low', 'medium', 'high']
const EVALUATION_TRENDS: readonly EvaluationTrend[] = ['unknown', 'improving', 'declining', 'flat']
const EVALUATION_PLAN_PRIORITIES: readonly EvaluationPlanPriority[] = ['high', 'medium', 'low']
const EVALUATION_PLAN_FOCUS_VALUES: readonly EvaluationPlanFocus[] = ['confirmation', 'boundary', 'contrast', 'expansion']
const EVALUATION_SOURCES: readonly EvaluationSource[] = ['manual', 'recall', 'plan']
const EVALUATION_CYCLES: readonly EvaluationCycle[] = ['fill', 'maintenance']
const EVALUATION_ADOPTION_DECISIONS: readonly EvaluationAdoptionDecision[] = ['adopt', 'limit', 'retest', 'repair', 'suspend']
const EVALUATION_PROTOCOL_EXECUTION_STATUSES: readonly EvaluationProtocolExecutionStatus[] = ['complete', 'partial', 'blocked']
const EVALUATION_MAINTENANCE_HEALTH_LEVELS: readonly EvaluationMaintenanceHealth[] = ['healthy', 'due', 'risk', 'critical']

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function clampReviewDays(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_EVALUATION_SETTINGS.normalReviewDays
  return Math.min(90, Math.max(1, Math.round(value)))
}

function readPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { observations: [], rules: [], evaluationSettings: DEFAULT_EVALUATION_SETTINGS }
    const state = JSON.parse(raw) as Partial<PersistedState>
    return {
      observations: Array.isArray(state.observations) ? state.observations : [],
      rules: Array.isArray(state.rules) ? state.rules.map(normalizeRule) : [],
      evaluationSettings: normalizeEvaluationSettings(state.evaluationSettings),
      insights: Array.isArray(state.insights) ? state.insights as Insight[] : [],
      laws: Array.isArray(state.laws) ? state.laws as Law[] : [],
    }
  } catch {
    return { observations: [], rules: [], evaluationSettings: DEFAULT_EVALUATION_SETTINGS }
  }
}

function normalizeEvaluationSettings(settings: Partial<EvaluationSettings> | undefined): EvaluationSettings {
  return {
    normalReviewDays: clampReviewDays(settings?.normalReviewDays ?? DEFAULT_EVALUATION_SETTINGS.normalReviewDays),
    conflictReviewDays: clampReviewDays(settings?.conflictReviewDays ?? DEFAULT_EVALUATION_SETTINGS.conflictReviewDays),
    replicationMaintenanceDays: clampReviewDays(settings?.replicationMaintenanceDays ?? DEFAULT_EVALUATION_SETTINGS.replicationMaintenanceDays),
  }
}

function normalizePersistedEvaluation(input: RuleEvaluation): RuleEvaluation {
  const outcome = EVALUATION_OUTCOMES.includes(input.outcome) ? input.outcome : 'uncertain'
  const evaluation: RuleEvaluation = {
    ...input,
    outcome,
    note: input.note?.trim() || evaluationNoteFromOutcome(outcome),
    createdAt: dateValue(input.createdAt, new Date().toISOString()),
    source: input.source && EVALUATION_SOURCES.includes(input.source) ? input.source : 'manual',
    ruleVersion: Math.max(0, Math.round(numberValue(input.ruleVersion, 0))),
  }
  evaluation.protocolExecution = normalizeImportedProtocolExecution(toRecord(input.protocolExecution), evaluation)
  return evaluation
}

function normalizeRule(rule: ExperienceRule): ExperienceRule {
  const normalized = {
    ...rule,
    reviewStatus: rule.reviewStatus ?? reviewStatusFromFeedback(rule.feedback),
    evaluations: Array.isArray(rule.evaluations) ? rule.evaluations.map(normalizePersistedEvaluation) : [],
    evaluationVerdict: rule.evaluationVerdict ?? 'insufficient',
    evaluationScore: normalizeEvaluationScore(rule.evaluationScore),
    evaluationConfidence: rule.evaluationConfidence ?? 'low',
    evaluationTrend: rule.evaluationTrend ?? 'unknown',
    nextEvaluationAction: rule.nextEvaluationAction ?? '',
    adoptionDecision: rule.adoptionDecision ?? 'retest',
    adoptionReason: rule.adoptionReason ?? '',
    adoptionTimeline: Array.isArray(rule.adoptionTimeline) ? rule.adoptionTimeline : [],
    adoptionGate: rule.adoptionGate,
    repeatabilityProfile: rule.repeatabilityProfile,
    sampleIndependenceProfile: rule.sampleIndependenceProfile,
    versionCoverageProfile: rule.versionCoverageProfile,
    protocolComplianceProfile: rule.protocolComplianceProfile,
    evaluationConsistencyProfile: rule.evaluationConsistencyProfile,
    evaluationReplicationMatrix: rule.evaluationReplicationMatrix,
    evaluationProtocol: rule.evaluationProtocol,
    boundaryCatalog: Array.isArray(rule.boundaryCatalog) ? rule.boundaryCatalog : [],
    revisionDraft: rule.revisionDraft,
    revisionHistory: Array.isArray(rule.revisionHistory) ? rule.revisionHistory : [],
    revisionVersion: Math.max(0, Math.round(rule.revisionVersion ?? 0)),
    evaluationPlan: rule.evaluationPlan,
    revisionSuggestion: rule.revisionSuggestion ?? '',
  }

  applyEvaluationState(normalized)
  return {
    ...normalized,
  }
}

export const useExperienceStore = defineStore('experience', () => {
  const persisted = readPersisted()
  const observations = ref<Observation[]>(persisted.observations)
  const rules = ref<ExperienceRule[]>(persisted.rules)
  const evaluationSettings = ref<EvaluationSettings>(persisted.evaluationSettings)
  const isAnalyzing = ref(false)
  const isSeedingDemo = ref(false)
  const insights = ref<Insight[]>(persisted.insights ?? [])
  const isComputingInsights = ref(false)
  const laws = ref<Law[]>(persisted.laws ?? [])
  const isScanningLaws = ref(false)
  const decisionHints = ref<DecisionHint[]>([])
  const latestRuleId = ref(rules.value[0]?.id ?? '')

  const latestRule = computed(() => rules.value.find((rule) => rule.id === latestRuleId.value) ?? rules.value[0])

  const rulesByCategory = computed(() => {
    return rules.value.reduce<Record<string, number>>((acc, rule) => {
      acc[rule.category] = (acc[rule.category] ?? 0) + 1
      return acc
    }, {})
  })

  const locationGroups = computed(() => {
    const groups = new Map<string, { location: string; rules: ExperienceRule[]; observations: Observation[] }>()

    for (const rule of rules.value) {
      const location = rule.location || '未标记地点'
      const group = groups.get(location) ?? { location, rules: [], observations: [] }
      group.rules.push(rule)
      groups.set(location, group)
    }

    for (const observation of observations.value) {
      const location = observation.location || '未标记地点'
      const group = groups.get(location) ?? { location, rules: [], observations: [] }
      group.observations.push(observation)
      groups.set(location, group)
    }

    return Array.from(groups.values()).sort((a, b) => b.rules.length + b.observations.length - (a.rules.length + a.observations.length))
  })

  const timelineItems = computed(() => {
    return observations.value.map((observation) => ({
      observation,
      rule: rules.value.find((rule) => rule.id === observation.ruleId),
    }))
  })

  const stableRuleCount = computed(() => {
    return rules.value.filter((rule) => rule.reusability !== 'watch').length
  })

  const watchingRuleCount = computed(() => {
    return rules.value.filter((rule) => rule.reviewStatus === 'watching' || rule.reusability === 'watch').length
  })

  const needsFixRuleCount = computed(() => {
    return rules.value.filter((rule) => rule.reviewStatus === 'needsFix').length
  })

  const conflictedRuleCount = computed(() => {
    return rules.value.filter((rule) => rule.evaluationVerdict === 'conflicted').length
  })

  const evaluationCount = computed(() => {
    return rules.value.reduce((total, rule) => total + getEvaluations(rule).length, 0)
  })

  const repeatEvaluatedRuleCount = computed(() => {
    return rules.value.filter((rule) => getCurrentVersionEvaluations(rule).length >= 2).length
  })

  const evaluationStats = computed(() => {
    return rules.value.reduce(
      (acc, rule) => {
        for (const evaluation of getEvaluations(rule)) {
          acc.total += 1
          acc[evaluation.outcome] += 1
          acc[evaluation.source ?? 'manual'] += 1
        }
        return acc
      },
      { total: 0, passed: 0, failed: 0, uncertain: 0, manual: 0, recall: 0, plan: 0 },
    )
  })

  const evaluationAnalysis = computed(() => {
    const evaluatedRules = rules.value.filter((rule) => getCurrentVersionEvaluations(rule).length > 0)
    const totalScore = evaluatedRules.reduce((total, rule) => total + (rule.evaluationScore ?? 0), 0)
    const adoptionCounts = createAdoptionCountMap()
    const currentVersionGapCount = rules.value.filter((rule) => rule.versionCoverageProfile?.status !== 'covered').length
    for (const rule of rules.value) {
      adoptionCounts[rule.adoptionDecision ?? 'retest'] += 1
    }
    return {
      averageScore: evaluatedRules.length === 0 ? 0 : Math.round(totalScore / evaluatedRules.length),
      highConfidence: rules.value.filter((rule) => rule.evaluationConfidence === 'high').length,
      declining: rules.value.filter((rule) => rule.evaluationTrend === 'declining').length,
      actionable: rules.value.filter((rule) => shouldEvaluate(rule, evaluationSettings.value) || rule.evaluationTrend === 'declining').length,
      currentVersionGapCount,
      adoptionCounts,
    }
  })

  const versionCoverageStats = computed(() => {
    let coveredRuleCount = 0
    let unretestedRuleCount = 0
    let partialRuleCount = 0
    let currentVersionEvaluationCount = 0
    let historicalEvaluationCount = 0

    for (const rule of rules.value) {
      const profile = rule.versionCoverageProfile
      if (!profile || profile.status === 'covered') coveredRuleCount += 1
      if (profile?.status === 'unretested') unretestedRuleCount += 1
      if (profile?.status === 'partial') partialRuleCount += 1
      currentVersionEvaluationCount += profile?.currentVersionEvaluationCount ?? getEvaluations(rule).length
      historicalEvaluationCount += profile?.historicalEvaluationCount ?? 0
    }

    return {
      coveredRuleCount,
      unretestedRuleCount,
      partialRuleCount,
      blockedRuleCount: unretestedRuleCount + partialRuleCount,
      currentVersionEvaluationCount,
      historicalEvaluationCount,
    }
  })

  const evaluationCoverage = computed(() => {
    const completedFocusCounts = createFocusCountMap()
    const activePlanFocusCounts = createFocusCountMap()
    let plannedExecutions = 0

    for (const rule of rules.value) {
      if (rule.evaluationPlan) {
        activePlanFocusCounts[rule.evaluationPlan.focus] += 1
      }

      for (const evaluation of getCurrentVersionEvaluations(rule)) {
        if (evaluation.source === 'plan') {
          plannedExecutions += 1
        }
        if (evaluation.planSnapshot) {
          completedFocusCounts[evaluation.planSnapshot.focus] += 1
        }
      }
    }

    const missingFocuses = EVALUATION_PLAN_FOCUS_VALUES.filter((focus) => completedFocusCounts[focus] === 0)
    const coveredFocusCount = EVALUATION_PLAN_FOCUS_VALUES.length - missingFocuses.length

    return {
      completedFocusCounts,
      activePlanFocusCounts,
      missingFocuses,
      coveredFocusCount,
      planExecutionRate: versionCoverageStats.value.currentVersionEvaluationCount === 0 ? 0 : Math.round((plannedExecutions / versionCoverageStats.value.currentVersionEvaluationCount) * 100),
    }
  })

  const evaluationQuality = computed(() => {
    let total = 0
    let withScenarioText = 0
    let linkedObservation = 0
    let plannedEvaluations = 0
    let plannedWithSnapshot = 0
    let completeProtocolExecution = 0
    const weakEvaluations: Array<{
      ruleId: string
      ruleTitle: string
      evaluationId: string
      outcome: EvaluationOutcome
      createdAt: string
      reasons: string[]
    }> = []

    for (const rule of rules.value) {
      for (const evaluation of getCurrentVersionEvaluations(rule)) {
        total += 1
        const issues = evaluationQualityIssues(evaluation)

        if (evaluation.observationText?.trim()) {
          withScenarioText += 1
        }
        if (evaluation.observationId) {
          linkedObservation += 1
        }
        if (evaluation.source === 'plan') {
          plannedEvaluations += 1
          if (evaluation.planSnapshot) {
            plannedWithSnapshot += 1
          }
        }
        if (evaluation.protocolExecution?.status === 'complete') {
          completeProtocolExecution += 1
        }
        if (issues.length > 0) {
          weakEvaluations.push({
            ruleId: rule.id,
            ruleTitle: rule.title,
            evaluationId: evaluation.id,
            outcome: evaluation.outcome,
            createdAt: evaluation.createdAt,
            reasons: issues,
          })
        }
      }
    }

    const scenarioRate = total === 0 ? 0 : withScenarioText / total
    const linkedRate = total === 0 ? 0 : linkedObservation / total
    const planSnapshotRate = plannedEvaluations === 0 ? 1 : plannedWithSnapshot / plannedEvaluations
    const protocolExecutionRate = total === 0 ? 0 : completeProtocolExecution / total

    return {
      total,
      withScenarioText,
      linkedObservation,
      plannedEvaluations,
      plannedWithSnapshot,
      completeProtocolExecution,
      weakEvaluationCount: weakEvaluations.length,
      weakEvaluations: weakEvaluations
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6),
      qualityScore: total === 0 ? 0 : Math.round((scenarioRate * 0.35 + linkedRate * 0.25 + planSnapshotRate * 0.2 + protocolExecutionRate * 0.2) * 100),
    }
  })

  const evaluationQueue = computed(() => {
    return [...rules.value]
      .filter((rule) => shouldEvaluate(rule, evaluationSettings.value))
      .sort((a, b) => evaluationPriority(b, evaluationSettings.value) - evaluationPriority(a, evaluationSettings.value) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  })

  const evaluationPlanQueue = computed(() => {
    return [...rules.value]
      .filter((rule) => Boolean(rule.evaluationPlan))
      .sort(
        (a, b) =>
          evaluationPlanPriorityValue(b.evaluationPlan?.priority) - evaluationPlanPriorityValue(a.evaluationPlan?.priority) ||
          (a.evaluationPlan?.reviewAfterDays ?? 99) - (b.evaluationPlan?.reviewAfterDays ?? 99) ||
          (b.evaluationScore ?? 0) - (a.evaluationScore ?? 0),
      )
  })

  const evaluationProtocolQueue = computed(() => {
    return [...rules.value]
      .filter((rule) => Boolean(rule.evaluationProtocol))
      .sort(
        (a, b) =>
          evaluationPlanPriorityValue(b.evaluationPlan?.priority) - evaluationPlanPriorityValue(a.evaluationPlan?.priority) ||
          (a.evaluationProtocol?.cadenceDays ?? 99) - (b.evaluationProtocol?.cadenceDays ?? 99) ||
          (a.repeatabilityProfile?.score ?? 100) - (b.repeatabilityProfile?.score ?? 100),
      )
  })

  const adoptionDecisionQueue = computed(() => {
    return EVALUATION_ADOPTION_DECISIONS.map((decision) => ({
      decision,
      rules: rules.value
        .filter((rule) => (rule.adoptionDecision ?? 'retest') === decision)
        .sort((a, b) => adoptionDecisionPriorityValue(b.adoptionDecision) - adoptionDecisionPriorityValue(a.adoptionDecision) || (b.evaluationScore ?? 0) - (a.evaluationScore ?? 0)),
    }))
      .filter((item) => item.rules.length > 0)
      .sort((a, b) => adoptionDecisionPriorityValue(b.decision) - adoptionDecisionPriorityValue(a.decision))
  })

  const adoptionTimelineQueue = computed(() => {
    return rules.value
      .flatMap((rule) =>
        getAdoptionTimeline(rule).map((event) => ({
          rule,
          event,
        })),
      )
      .sort(
        (a, b) =>
          new Date(b.event.createdAt).getTime() - new Date(a.event.createdAt).getTime() ||
          adoptionDecisionPriorityValue(b.event.decision) - adoptionDecisionPriorityValue(a.event.decision),
      )
  })

  const adoptionGateQueue = computed(() => {
    return [...rules.value]
      .filter((rule) => rule.adoptionGate && (rule.adoptionGate.blockers.length > 0 || rule.adoptionGate.warnings.length > 0))
      .sort(
        (a, b) =>
          adoptionGatePriorityValue(b.adoptionGate?.status) - adoptionGatePriorityValue(a.adoptionGate?.status) ||
          adoptionDecisionPriorityValue(b.adoptionDecision) - adoptionDecisionPriorityValue(a.adoptionDecision) ||
          (b.adoptionGate?.blockers.length ?? 0) - (a.adoptionGate?.blockers.length ?? 0),
      )
  })

  const repeatabilityQueue = computed(() => {
    return [...rules.value]
      .filter((rule) => getCurrentVersionEvaluations(rule).length > 0 && Boolean(rule.repeatabilityProfile))
      .sort(
        (a, b) =>
          (a.repeatabilityProfile?.score ?? 0) - (b.repeatabilityProfile?.score ?? 0) ||
          repeatabilityLevelPriority(a.repeatabilityProfile?.level) - repeatabilityLevelPriority(b.repeatabilityProfile?.level) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
  })

  const consistencyQueue = computed(() => {
    return [...rules.value]
      .filter((rule) => getCurrentVersionEvaluations(rule).length > 0 && Boolean(rule.evaluationConsistencyProfile))
      .sort(
        (a, b) =>
          consistencyStatusPriority(b.evaluationConsistencyProfile?.status) - consistencyStatusPriority(a.evaluationConsistencyProfile?.status) ||
          (a.evaluationConsistencyProfile?.score ?? 0) - (b.evaluationConsistencyProfile?.score ?? 0) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
  })

  const replicationMatrixQueue = computed(() => {
    return [...rules.value]
      .filter((rule) => getCurrentVersionEvaluations(rule).length > 0 && Boolean(rule.evaluationReplicationMatrix))
      .sort(
        (a, b) =>
          replicationMatrixStatusPriority(b.evaluationReplicationMatrix?.status) - replicationMatrixStatusPriority(a.evaluationReplicationMatrix?.status) ||
          replicationMaintenanceHealthPriority(b, evaluationSettings.value) - replicationMaintenanceHealthPriority(a, evaluationSettings.value) ||
          replicationMaintenanceOverdueDays(b, evaluationSettings.value) - replicationMaintenanceOverdueDays(a, evaluationSettings.value) ||
          (a.evaluationReplicationMatrix?.score ?? 0) - (b.evaluationReplicationMatrix?.score ?? 0) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
  })

  const replicationMaintenanceInfo = (rule: ExperienceRule) => replicationMaintenanceInfoFor(rule, evaluationSettings.value)
  const replicationSlotMaintenanceInfo = (rule: ExperienceRule, focus: EvaluationPlanFocus) => replicationSlotMaintenanceInfoFor(rule, focus, evaluationSettings.value)
  const replicationMaintenanceHealth = (rule: ExperienceRule) => replicationMaintenanceHealthFor(rule, evaluationSettings.value)

  const replicationMaintenanceBacklog = computed(() => {
    return rules.value
      .flatMap((rule) =>
        (rule.evaluationReplicationMatrix?.slots ?? [])
          .map((slot) => ({
            rule,
            slot,
            focus: slot.focus,
            info: replicationSlotMaintenanceInfo(rule, slot.focus),
            health: replicationMaintenanceHealth(rule),
          }))
          .filter((item) => rule.evaluationReplicationMatrix?.status === 'ready' && item.info.due),
      )
      .sort(
        (a, b) =>
          maintenanceHealthLevelPriority(b.health.level) - maintenanceHealthLevelPriority(a.health.level) ||
          b.info.overdueDays - a.info.overdueDays ||
          b.health.score - a.health.score ||
          focusMaintenancePriority(b.focus) - focusMaintenancePriority(a.focus) ||
          new Date(b.rule.updatedAt).getTime() - new Date(a.rule.updatedAt).getTime(),
      )
  })

  const maintenanceRegressionQueue = computed(() => {
    return rules.value
      .flatMap((rule) =>
        unresolvedMaintenanceRegressions(rule).map((item) => ({
          rule,
          evaluation: item.evaluation,
          focus: item.focus,
          health: replicationMaintenanceHealth(rule),
          resolvedByLatestPass: false,
        })),
      )
      .sort(
        (a, b) =>
          maintenanceOutcomePriority(b.evaluation.outcome) - maintenanceOutcomePriority(a.evaluation.outcome) ||
          new Date(b.evaluation.createdAt).getTime() - new Date(a.evaluation.createdAt).getTime() ||
          maintenanceHealthLevelPriority(b.health.level) - maintenanceHealthLevelPriority(a.health.level) ||
          focusMaintenancePriority(b.focus ?? 'confirmation') - focusMaintenancePriority(a.focus ?? 'confirmation'),
      )
  })

  const regressionRecoveryQueue = computed(() => {
    return rules.value
      .flatMap((rule) => {
        const matrix = rule.evaluationReplicationMatrix
        if (matrix?.status !== 'blocked') return []
        const unresolved = unresolvedMaintenanceRegressions(rule)
        return matrix.conflictingFocuses
          .map((focus) => {
            const latest = latestEvaluationForFocus(rule, focus)
            const hasClosedMaintenanceRegression = hasClosedMaintenanceRegressionForFocus(rule, focus)
            if (!latest || latest.outcome !== 'passed' || !hasClosedMaintenanceRegression) return undefined
            if (unresolved.some((item) => item.focus === focus)) return undefined
            return {
              rule,
              focus,
              latestEvaluation: latest,
              matrix,
              reason: `${planFocusLabel(focus)}槽位最近复测已通过，但历史维护回归仍让矩阵保持阻断，需要复核是否拆分边界或恢复矩阵。`,
            }
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
      })
      .sort(
        (a, b) =>
          new Date(b.latestEvaluation.createdAt).getTime() - new Date(a.latestEvaluation.createdAt).getTime() ||
          focusMaintenancePriority(b.focus) - focusMaintenancePriority(a.focus) ||
          (a.matrix.score ?? 0) - (b.matrix.score ?? 0),
      )
  })

  const replicationMaintenanceStats = computed(() => {
    const readyRules = rules.value.filter((rule) => rule.evaluationReplicationMatrix?.status === 'ready')
    const dueInfos = readyRules.map((rule) => replicationMaintenanceInfo(rule)).filter((info) => info.due)
    const healthProfiles = readyRules.map((rule) => replicationMaintenanceHealth(rule))
    const dueFocusCounts = createFocusCountMap()
    for (const entry of replicationMaintenanceBacklog.value) {
      dueFocusCounts[entry.focus] += 1
    }
    const maintenanceEvaluationCount = rules.value.reduce(
      (total, rule) => total + getCurrentVersionEvaluations(rule).filter((evaluation) => evaluation.cycle === 'maintenance').length,
      0,
    )

    return {
      readyRuleCount: readyRules.length,
      dueRuleCount: dueInfos.length,
      dueSlotCount: replicationMaintenanceBacklog.value.length,
      dueFocuses: EVALUATION_PLAN_FOCUS_VALUES.filter((focus) => replicationMaintenanceBacklog.value.some((entry) => entry.focus === focus)),
      dueFocusCounts,
      overdueMaxDays: dueInfos.reduce((max, info) => Math.max(max, info.overdueDays), 0),
      healthCounts: createMaintenanceHealthCountMap(healthProfiles),
      criticalRuleCount: healthProfiles.filter((profile) => profile.level === 'critical').length,
      riskRuleCount: healthProfiles.filter((profile) => profile.level === 'risk').length,
      regressionCount: maintenanceRegressionQueue.value.length,
      failedRegressionCount: maintenanceRegressionQueue.value.filter((item) => item.evaluation.outcome === 'failed').length,
      uncertainRegressionCount: maintenanceRegressionQueue.value.filter((item) => item.evaluation.outcome === 'uncertain').length,
      recoveryCount: regressionRecoveryQueue.value.length,
      topBacklog: replicationMaintenanceBacklog.value.slice(0, 8).map((item) => ({
        ruleId: item.rule.id,
        ruleTitle: item.rule.title,
        focus: item.focus,
        overdueDays: item.info.overdueDays,
        health: item.health.level,
        healthScore: item.health.score,
        reason: item.info.reason,
      })),
      maintenanceEvaluationCount,
    }
  })

  const protocolExecutionQueue = computed(() => {
    return rules.value
      .flatMap((rule) =>
        getEvaluations(rule)
          .map((evaluation) => ({
            rule,
            evaluation,
            issues: evaluationProtocolIssues(evaluation),
          }))
          .filter((item) => item.issues.length > 0),
      )
      .sort(
        (a, b) =>
          b.issues.length - a.issues.length ||
          new Date(b.evaluation.createdAt).getTime() - new Date(a.evaluation.createdAt).getTime(),
      )
  })

  const boundaryCatalogQueue = computed(() => {
    return rules.value
      .flatMap((rule) =>
        getBoundaryCatalog(rule).map((boundary) => ({
          rule,
          boundary,
        })),
      )
      .sort(
        (a, b) =>
          boundarySeverityPriority(b.boundary.severity) - boundarySeverityPriority(a.boundary.severity) ||
          new Date(b.boundary.createdAt).getTime() - new Date(a.boundary.createdAt).getTime(),
      )
  })

  const revisionDraftQueue = computed(() => {
    return [...rules.value]
      .filter((rule) => Boolean(rule.revisionDraft))
      .sort(
        (a, b) =>
          evaluationPlanPriorityValue(b.revisionDraft?.priority) - evaluationPlanPriorityValue(a.revisionDraft?.priority) ||
          (getBoundaryCatalog(b).length - getBoundaryCatalog(a).length) ||
          new Date(b.revisionDraft?.createdAt ?? b.updatedAt).getTime() - new Date(a.revisionDraft?.createdAt ?? a.updatedAt).getTime(),
      )
  })

  const versionCoverageQueue = computed(() => {
    return [...rules.value]
      .filter((rule) => rule.versionCoverageProfile && rule.versionCoverageProfile.status !== 'covered')
      .sort(
        (a, b) =>
          versionCoveragePriority(b.versionCoverageProfile?.status) - versionCoveragePriority(a.versionCoverageProfile?.status) ||
          (b.versionCoverageProfile?.historicalEvaluationCount ?? 0) - (a.versionCoverageProfile?.historicalEvaluationCount ?? 0) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
  })

  const staleEvaluationRules = computed(() => {
    return [...rules.value]
      .filter((rule) => isEvaluationStale(rule, evaluationSettings.value))
      .sort((a, b) => getLastEvaluationTime(a) - getLastEvaluationTime(b))
  })

  function mapSentiment(direction: ObservationDirection): ObservationSentiment {
    if (direction === 'positive') return 'positive'
    if (direction === 'negative') return 'negative'
    return 'neutral'
  }

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        observations: observations.value,
        rules: rules.value,
        evaluationSettings: evaluationSettings.value,
        insights: insights.value,
        laws: laws.value,
      }),
    )
  }

  // 内部辅助:将 analysis 结果写入已存在的 observation 对象并 upsert rule
  // 调用前 observation 已 push/unshift 进 observations.value
  //
  // 设计说明(sentiment 派生方式):
  //   sentiment 由 inferDirection(observation.text) 在原始文本上运行本地关键词规则得出,
  //   而非取自 AI 分析结果 analysis(AnalysisResult 目前不含 direction 字段)。
  //   category / tags / summary / location 均来自 AI 分析,sentiment 仅来自本地启发式。
  //   这是有意的分层设计,但存在不一致性:AI 对语义的理解远优于短关键词列表。
  //
  //   已知局限:inferDirection 使用短关键词列表,多数真实文本返回 'uncertain' → 'neutral',
  //   导致 sentiment 字段对大多数记录近乎无用;Plan 3 聚类若依赖 sentiment 需先改进推断逻辑。
  async function _writeObservation(observation: Observation, analysis: AnalysisResult, processedAt: string) {
    const rule = upsertRuleFromAnalysis(analysis, observation.id, processedAt)
    Object.assign(observation, {
      category: analysis.category,
      tags: analysis.tags,
      summary: analysis.summary,
      status: 'success' as const,
      processedAt,
      ruleId: rule.id,
      location: analysis.location,
      // sentiment 优先取模型分析的 direction(更准),缺失时回退本地 inferDirection
      sentiment: mapSentiment(analysis.direction ?? inferDirection(observation.text)),
    })
    latestRuleId.value = rule.id
  }

  // clientOverride 仅供测试注入伪模型 client;省略时走 getActiveModelClient()(生产路径不变)
  async function submitObservation(text: string, clientOverride?: ObservationModelClient | null) {
    const content = text.trim()
    if (!content || isAnalyzing.value) return

    // 清空上一次提交残留的决策提醒,避免新提交期间/失败时旧卡片悬挂
    decisionHints.value = []

    const now = new Date().toISOString()
    const observation: Observation = {
      id: createId('obs'),
      text: content,
      category: '其他',
      tags: [],
      summary: '正在提炼经验规则',
      status: 'pending',
      createdAt: now,
    }

    observations.value.unshift(observation)
    isAnalyzing.value = true
    persist()

    try {
      const client = clientOverride !== undefined ? clientOverride : getActiveModelClient()
      const analysis = await analyzeObservationResilient(content, { client })
      const processedAt = new Date().toISOString()
      await _writeObservation(observation, analysis, processedAt)
      // M4 决策辅助:分析完成后召回相关历史规则
      decisionHints.value = recallDecisionHints(content, rules.value, observations.value)
    } catch {
      observation.status = 'failed'
      observation.summary = '结构化校验失败，原始观察已保存。'
    } finally {
      isAnalyzing.value = false
      persist()
    }
  }

  /**
   * M3 规律发现:对当前所有 success 状态的 observations 执行聚类归因
   * 统计基座必做;若有可用模型 client 则做增强
   */
  async function computeInsights(timeWindowLabel = '过去 90 天') {
    if (isComputingInsights.value) return
    isComputingInsights.value = true

    try {
      const successObs = observations.value.filter((o) => o.status === 'success')
      const client = getActiveModelClient()
      const result = await discoverPatterns(successObs, {
        client,
        timeWindowLabel,
        dimensions: ['category', 'tag'],
      })
      insights.value = result
      persist()
    } finally {
      isComputingInsights.value = false
    }
  }

  // V2 规律发现:语义聚类 + 幂等合并进规律库(模型不可用时降级统计,不中断)
  async function scanLaws() {
    if (isScanningLaws.value) return
    isScanningLaws.value = true
    try {
      const successObs = observations.value.filter((o) => o.status === 'success')
      const client = getActiveModelClient()
      laws.value = await discoverLaws(successObs, { client, existingLaws: laws.value })
      persist()
    } finally {
      isScanningLaws.value = false
    }
  }

  // V2 规律生命周期:标记 已复盘 / 已解决 / 已针对它改进(纯函数 markLawStatus)
  function markLaw(lawId: string, status: LawStatus, note?: string) {
    const idx = laws.value.findIndex((l) => l.id === lawId)
    if (idx === -1) return
    laws.value.splice(idx, 1, markLawStatus(laws.value[idx]!, status, new Date().toISOString(), note))
    persist()
  }

  function upsertRuleFromAnalysis(analysis: AnalysisResult, observationId: string, updatedAt: string) {
    const existing = findSimilarRule(analysis)

    if (!existing) {
      const rule: ExperienceRule = {
        id: createId('rule'),
        title: analysis.title,
        category: analysis.category,
        conclusion: analysis.conclusion,
        recommendation: analysis.recommendation,
        conditions: analysis.conditions,
        warnings: analysis.warnings,
        evidenceIds: [observationId],
        reusability: analysis.reusability,
        kind: analysis.kind,
        feedback: 'none',
        reviewStatus: 'unreviewed',
        evaluations: [],
        evaluationVerdict: 'insufficient',
        revisionSuggestion: '',
        updatedAt,
        location: analysis.location,
      }
      rules.value.unshift(rule)
      return rule
    }

    existing.evidenceIds = unique([...existing.evidenceIds, observationId])
    existing.conditions = unique([...existing.conditions, ...analysis.conditions])
    existing.warnings = unique([...existing.warnings, ...analysis.warnings])
    existing.updatedAt = updatedAt
    existing.location = existing.location || analysis.location

    if (existing.reusability === 'watch' && analysis.reusability !== 'watch') {
      existing.reusability = analysis.reusability
    }

    if (existing.evidenceIds.length >= 2 && existing.reusability === 'medium') {
      existing.reusability = 'high'
    }

    return existing
  }

  function findSimilarRule(analysis: AnalysisResult) {
    if (analysis.reusability === 'watch') return undefined

    return rules.value.find((rule) => {
      // kind 必须一致(undefined 视为相同):负向 caution 不能合并进正向 strategy
      const sameKind = analysis.kind === undefined || rule.kind === undefined || analysis.kind === rule.kind
      if (!sameKind) return false

      const sameCategory = rule.category === analysis.category
      const sameTitle = rule.title === analysis.title
      const sameLocation = Boolean(rule.location && analysis.location && rule.location === analysis.location)
      // sameTitle 也要求 sameCategory,防止跨领域同名 title 误合并
      return (sameTitle && sameCategory) || (sameCategory && sameLocation)
    })
  }

  function unique(values: string[]) {
    return uniqueValues(values)
  }

  function setFeedback(ruleId: string, feedback: Feedback) {
    const rule = rules.value.find((item) => item.id === ruleId)
    if (!rule) return
    rule.feedback = feedback
    rule.reviewStatus = reviewStatusFromFeedback(feedback)
    rule.reusability = reusabilityFromFeedback(rule.reusability, feedback)
    rule.updatedAt = new Date().toISOString()
    persist()
  }

  function addEvaluation(
    ruleId: string,
    outcome: EvaluationOutcome,
    note = '',
    observationText = '',
    sourceOrOptions?: EvaluationSource | AddEvaluationOptions,
  ) {
    const rule = rules.value.find((item) => item.id === ruleId)
    if (!rule) return

    const trimmedNote = note.trim()
    const evaluationObservation = createEvaluationObservation(rule, outcome, observationText)
    const options = typeof sourceOrOptions === 'string' ? { source: sourceOrOptions } : (sourceOrOptions ?? {})
    const replicationSlotFocus = options.focus
    const focusedPlan = options.focus ? evaluationPlanForFocus(rule, options.focus) : rule.evaluationPlan
    const focusedProtocol = options.focus ? evaluationProtocolForFocus(rule, options.focus) : rule.evaluationProtocol
    const evaluationSource = options.source ?? (focusedPlan ? 'plan' : 'manual')
    const evaluationCycle = options.cycle
    const createdAt = new Date().toISOString()
    const evaluationNote = trimmedNote || evaluationNoteFromOutcome(outcome, options.focus)
    const planSnapshot = evaluationSource === 'plan' ? createPlanSnapshot(focusedPlan) : undefined
    const protocolSnapshot = createProtocolSnapshot(focusedProtocol)
    const evaluation: RuleEvaluation = {
      id: createId('eval'),
      outcome,
      note: evaluationNote,
      createdAt,
      observationId: evaluationObservation?.id,
      observationText: evaluationObservation?.text,
      source: evaluationSource,
      cycle: evaluationCycle,
      ruleVersion: rule.revisionVersion ?? 0,
      replicationSlotFocus,
      planSnapshot,
      protocolSnapshot,
    }
    evaluation.protocolExecution = createProtocolExecution(evaluation, createdAt)

    if (evaluationObservation) {
      observations.value.unshift(evaluationObservation)
      rule.evidenceIds = unique([...rule.evidenceIds, evaluationObservation.id])
    }

    rule.evaluations = [evaluation, ...getEvaluations(rule)]
    applyEvaluationState(rule)
    rule.lastEvaluatedAt = evaluation.createdAt
    rule.updatedAt = evaluation.createdAt
    persist()
  }

  function attachEvaluationEvidence(ruleId: string, evaluationId: string, observationText: string) {
    const rule = rules.value.find((item) => item.id === ruleId)
    const content = observationText.trim()
    if (!rule || !content) return false

    const evaluation = getEvaluations(rule).find((item) => item.id === evaluationId)
    if (!evaluation) return false

    const evaluationObservation = createEvaluationObservation(rule, evaluation.outcome, content)
    if (!evaluationObservation) return false

    observations.value.unshift(evaluationObservation)
    rule.evidenceIds = unique([...rule.evidenceIds, evaluationObservation.id])
    evaluation.observationId = evaluationObservation.id
    evaluation.observationText = evaluationObservation.text
    evaluation.protocolExecution = createProtocolExecution(evaluation, evaluation.createdAt)
    rule.updatedAt = evaluationObservation.createdAt
    applyEvaluationState(rule)
    persist()
    return true
  }

  function evaluateReplicationSlot(ruleId: string, focus: EvaluationPlanFocus, outcome: EvaluationOutcome) {
    const rule = rules.value.find((item) => item.id === ruleId)
    if (!rule) return false

    const slot = rule.evaluationReplicationMatrix?.slots.find((item) => item.focus === focus)
    if (!slot) return false

    const cycle: EvaluationCycle = rule.evaluationReplicationMatrix?.status === 'ready' ? 'maintenance' : 'fill'
    const note = `${planFocusLabel(focus)}槽位${cycle === 'maintenance' ? '维护抽样' : '复测'}。`
    const prompt = replicationSlotPrompt(rule, focus, slot)
    addEvaluation(ruleId, outcome, note, prompt, { source: 'plan', focus, cycle })
    return true
  }

  function evaluateNextReplicationSlot(ruleId: string, outcome: EvaluationOutcome) {
    const rule = rules.value.find((item) => item.id === ruleId)
    const nextFocus = rule?.evaluationReplicationMatrix?.nextFocus
    if (!nextFocus) return false
    const cycle: EvaluationCycle = rule.evaluationReplicationMatrix?.status === 'ready' ? 'maintenance' : 'fill'
    const slot = rule.evaluationReplicationMatrix?.slots.find((item) => item.focus === nextFocus)
    if (!slot) return false

    const note = `${planFocusLabel(nextFocus)}槽位${cycle === 'maintenance' ? '维护抽样' : '复测'}。`
    const prompt = replicationSlotPrompt(rule, nextFocus, slot)
    addEvaluation(ruleId, outcome, note, prompt, { source: 'plan', focus: nextFocus, cycle })
    return true
  }

  function applyRevisionDraft(ruleId: string) {
    const rule = rules.value.find((item) => item.id === ruleId)
    const draft = rule?.revisionDraft
    if (!rule || !draft) return false

    const appliedAt = new Date().toISOString()
    const nextVersion = (rule.revisionVersion ?? 0) + 1
    const newConditions = uniqueValues([...draft.keptConditions, ...draft.suggestedConstraints])
    const excludedWarnings = draft.excludedScenarios.map((scenario) => `排除场景：${scenario}`)
    const newWarnings = uniqueValues([...rule.warnings, ...excludedWarnings])
    const record: RuleRevisionRecord = {
      id: createId('revision'),
      draftId: draft.id,
      appliedAt,
      version: nextVersion,
      reason: draft.reason,
      previousConclusion: rule.conclusion,
      previousRecommendation: rule.recommendation,
      previousConditions: [...rule.conditions],
      previousWarnings: [...rule.warnings],
      newConclusion: draft.conclusion,
      newRecommendation: draft.recommendation,
      newConditions,
      newWarnings,
      evidenceIds: draft.evidenceIds,
    }

    rule.conclusion = draft.conclusion
    rule.recommendation = draft.recommendation
    rule.conditions = newConditions
    rule.warnings = newWarnings
    rule.revisionVersion = nextVersion
    rule.revisionHistory = [record, ...(rule.revisionHistory ?? [])]
    rule.reviewStatus = 'watching'
    rule.reusability = 'watch'
    rule.updatedAt = appliedAt
    applyEvaluationState(rule)
    persist()
    return true
  }

  function recallEvaluationCandidates(scene: string): EvaluationCandidate[] {
    const content = scene.trim()
    if (!content) return []

    return rules.value
      .map((rule) => scoreEvaluationCandidate(rule, content, observations.value))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }

  // 找经验:按场景召回相关「规律」。复用规则召回同一套 tokenize(中文 2-gram),
  // 匹配 law 的 theme/rootCause/suggestion;按命中数→复发数→id 稳定排序,取前 3。
  function recallRelatedLaws(scene: string): Law[] {
    const content = scene.trim()
    if (!content) return []
    const tokens = tokenize(content)
    if (tokens.length === 0) return []

    return laws.value
      .filter((law) => law.status !== 'resolved')
      .map((law) => {
        const haystack = normalizeText([law.theme, law.rootCause, law.suggestion].filter(Boolean).join(' '))
        const matched = tokens.filter((token) => haystack.includes(token)).length
        return { law, matched }
      })
      .filter((entry) => entry.matched > 0)
      .sort((a, b) => (b.matched - a.matched) || (b.law.recurrence - a.law.recurrence) || a.law.id.localeCompare(b.law.id))
      .slice(0, 3)
      .map((entry) => entry.law)
  }

  function exportEvaluationData() {
    const exportedAt = new Date().toISOString()
    return {
      exportedAt,
      summary: {
        ruleCount: rules.value.length,
        observationCount: observations.value.length,
        evaluationCount: evaluationStats.value.total,
        passed: evaluationStats.value.passed,
        failed: evaluationStats.value.failed,
        uncertain: evaluationStats.value.uncertain,
        manualEvaluationCount: evaluationStats.value.manual,
        recallEvaluationCount: evaluationStats.value.recall,
        plannedEvaluationCount: evaluationStats.value.plan,
        conflictedRuleCount: conflictedRuleCount.value,
        repeatEvaluatedRuleCount: repeatEvaluatedRuleCount.value,
        averageEvaluationScore: evaluationAnalysis.value.averageScore,
        highConfidenceRuleCount: evaluationAnalysis.value.highConfidence,
        decliningRuleCount: evaluationAnalysis.value.declining,
        adoptRuleCount: evaluationAnalysis.value.adoptionCounts.adopt,
        limitedRuleCount: evaluationAnalysis.value.adoptionCounts.limit,
        retestRuleCount: evaluationAnalysis.value.adoptionCounts.retest,
        repairRuleCount: evaluationAnalysis.value.adoptionCounts.repair,
        suspendedRuleCount: evaluationAnalysis.value.adoptionCounts.suspend,
        adoptionDecisionChangeCount: adoptionTimelineQueue.value.length,
        adoptionGateBlockedRuleCount: rules.value.filter((rule) => rule.adoptionGate?.status === 'blocked').length,
        adoptionGateWarningRuleCount: rules.value.filter((rule) => rule.adoptionGate?.status === 'attention').length,
        adoptionGateReadyRuleCount: rules.value.filter((rule) => rule.adoptionGate?.ready).length,
        averageRepeatabilityScore: averageRepeatabilityScore(rules.value),
        weakRepeatabilityRuleCount: rules.value.filter((rule) => rule.repeatabilityProfile?.level === 'weak').length,
        repeatableRuleCount: rules.value.filter((rule) => rule.repeatabilityProfile?.level === 'repeatable').length,
        averageSampleIndependenceScore: averageSampleIndependenceScore(rules.value),
        weakSampleIndependenceRuleCount: rules.value.filter((rule) => rule.sampleIndependenceProfile?.level === 'weak').length,
        clusteredSampleIndependenceRuleCount: rules.value.filter((rule) => rule.sampleIndependenceProfile?.level === 'clustered').length,
        currentVersionCoveredRuleCount: versionCoverageStats.value.coveredRuleCount,
        currentVersionUnretestedRuleCount: versionCoverageStats.value.unretestedRuleCount,
        currentVersionPartialRuleCount: versionCoverageStats.value.partialRuleCount,
        currentVersionBlockedRuleCount: versionCoverageStats.value.blockedRuleCount,
        currentVersionEvaluationCount: versionCoverageStats.value.currentVersionEvaluationCount,
        historicalVersionEvaluationCount: versionCoverageStats.value.historicalEvaluationCount,
        protocolComplianceAlignedRuleCount: rules.value.filter((rule) => rule.protocolComplianceProfile?.status === 'aligned').length,
        protocolComplianceBlockedRuleCount: rules.value.filter((rule) => rule.protocolComplianceProfile?.status === 'blocked').length,
        protocolCompliancePartialRuleCount: rules.value.filter((rule) => rule.protocolComplianceProfile?.status === 'partial').length,
        consistentRuleCount: rules.value.filter((rule) => rule.evaluationConsistencyProfile?.status === 'stable').length,
        consistencyConflictRuleCount: rules.value.filter((rule) => rule.evaluationConsistencyProfile?.status === 'conflicting').length,
        replicationReadyRuleCount: rules.value.filter((rule) => rule.evaluationReplicationMatrix?.status === 'ready').length,
        replicationBlockedRuleCount: rules.value.filter((rule) => rule.evaluationReplicationMatrix?.status === 'blocked').length,
        replicationRecoveredRuleCount: rules.value.filter((rule) => (rule.evaluationReplicationMatrix?.recoveredSlots ?? 0) > 0).length,
        replicationRecoveredSlotCount: rules.value.reduce((total, rule) => total + (rule.evaluationReplicationMatrix?.recoveredSlots ?? 0), 0),
        replicationRecoveryObservationRuleCount: rules.value.filter((rule) => (rule.evaluationReplicationMatrix?.observingRecoveredSlots ?? 0) > 0).length,
        replicationRecoveryObservationSlotCount: rules.value.reduce((total, rule) => total + (rule.evaluationReplicationMatrix?.observingRecoveredSlots ?? 0), 0),
        replicationMaintenanceDueRuleCount: replicationMaintenanceStats.value.dueRuleCount,
        replicationMaintenanceDueSlotCount: replicationMaintenanceStats.value.dueSlotCount,
        replicationMaintenanceDueFocuses: replicationMaintenanceStats.value.dueFocuses,
        replicationMaintenanceDueFocusCounts: replicationMaintenanceStats.value.dueFocusCounts,
        replicationMaintenanceOverdueMaxDays: replicationMaintenanceStats.value.overdueMaxDays,
        replicationMaintenanceHealthCounts: replicationMaintenanceStats.value.healthCounts,
        replicationMaintenanceCriticalRuleCount: replicationMaintenanceStats.value.criticalRuleCount,
        replicationMaintenanceRiskRuleCount: replicationMaintenanceStats.value.riskRuleCount,
        replicationMaintenanceRegressionCount: replicationMaintenanceStats.value.regressionCount,
        replicationMaintenanceFailedRegressionCount: replicationMaintenanceStats.value.failedRegressionCount,
        replicationMaintenanceUncertainRegressionCount: replicationMaintenanceStats.value.uncertainRegressionCount,
        replicationMaintenanceRecoveryCount: replicationMaintenanceStats.value.recoveryCount,
        replicationMaintenanceBacklog: replicationMaintenanceStats.value.topBacklog,
        maintenanceEvaluationCount: replicationMaintenanceStats.value.maintenanceEvaluationCount,
        evaluationProtocolCount: evaluationProtocolQueue.value.length,
        protocolSnapshotEvaluationCount: rules.value.reduce((total, rule) => total + getEvaluations(rule).filter((evaluation) => evaluation.protocolSnapshot).length, 0),
        completeProtocolExecutionCount: evaluationQuality.value.completeProtocolExecution,
        protocolIssueEvaluationCount: protocolExecutionQueue.value.length,
        boundaryCaseCount: boundaryCatalogQueue.value.length,
        criticalBoundaryCaseCount: boundaryCatalogQueue.value.filter((item) => item.boundary.severity === 'critical').length,
        revisionDraftCount: revisionDraftQueue.value.length,
        highPriorityRevisionDraftCount: revisionDraftQueue.value.filter((rule) => rule.revisionDraft?.priority === 'high').length,
        appliedRevisionCount: rules.value.reduce((total, rule) => total + (rule.revisionHistory?.length ?? 0), 0),
        adoptionDecisionQueue: adoptionDecisionQueue.value.map((item) => ({
          decision: item.decision,
          count: item.rules.length,
          ruleIds: item.rules.map((rule) => rule.id),
        })),
        evaluationPlanCount: evaluationPlanQueue.value.length,
        planExecutionRate: evaluationCoverage.value.planExecutionRate,
        coveredEvaluationFocusCount: evaluationCoverage.value.coveredFocusCount,
        missingEvaluationFocuses: evaluationCoverage.value.missingFocuses,
        evaluationQualityScore: evaluationQuality.value.qualityScore,
        weakEvaluationCount: evaluationQuality.value.weakEvaluationCount,
        scenarioTextEvaluationCount: evaluationQuality.value.withScenarioText,
        linkedObservationEvaluationCount: evaluationQuality.value.linkedObservation,
      },
      evaluationSettings: evaluationSettings.value,
      rules: rules.value.map((rule) => ({
        id: rule.id,
        title: rule.title,
        category: rule.category,
        conclusion: rule.conclusion,
        recommendation: rule.recommendation,
        conditions: rule.conditions,
        location: rule.location,
        reusability: rule.reusability,
        reviewStatus: rule.reviewStatus,
        evaluationVerdict: rule.evaluationVerdict,
        evaluationScore: rule.evaluationScore,
        evaluationConfidence: rule.evaluationConfidence,
        evaluationTrend: rule.evaluationTrend,
        nextEvaluationAction: rule.nextEvaluationAction,
        adoptionDecision: rule.adoptionDecision,
        adoptionReason: rule.adoptionReason,
        adoptionTimeline: getAdoptionTimeline(rule),
        adoptionGate: rule.adoptionGate,
        repeatabilityProfile: rule.repeatabilityProfile,
        sampleIndependenceProfile: rule.sampleIndependenceProfile,
        versionCoverageProfile: rule.versionCoverageProfile,
        protocolComplianceProfile: rule.protocolComplianceProfile,
        evaluationConsistencyProfile: rule.evaluationConsistencyProfile,
        evaluationReplicationMatrix: rule.evaluationReplicationMatrix,
        replicationMaintenanceHealth: replicationMaintenanceHealth(rule),
        evaluationProtocol: rule.evaluationProtocol,
        boundaryCatalog: getBoundaryCatalog(rule),
        revisionDraft: rule.revisionDraft,
        revisionVersion: rule.revisionVersion ?? 0,
        revisionHistory: rule.revisionHistory ?? [],
        evaluationPlan: rule.evaluationPlan,
        revisionSuggestion: rule.revisionSuggestion,
        evidenceIds: rule.evidenceIds,
        evaluations: getEvaluations(rule),
        updatedAt: rule.updatedAt,
        lastEvaluatedAt: rule.lastEvaluatedAt,
      })),
      observations: observations.value,
      replicationMaintenanceBacklog: replicationMaintenanceBacklog.value.map((item) => ({
        ruleId: item.rule.id,
        ruleTitle: item.rule.title,
        focus: item.focus,
        overdueDays: item.info.overdueDays,
        elapsedDays: item.info.elapsedDays,
        health: item.health.level,
        healthScore: item.health.score,
        slotSummary: item.slot.summary,
        reason: item.info.reason,
      })),
      maintenanceRegressionQueue: maintenanceRegressionQueue.value.map((item) => ({
        ruleId: item.rule.id,
        ruleTitle: item.rule.title,
        evaluationId: item.evaluation.id,
        outcome: item.evaluation.outcome,
        focus: item.focus,
        health: item.health.level,
        healthScore: item.health.score,
        resolvedByLatestPass: item.resolvedByLatestPass,
        note: item.evaluation.note,
        observationText: item.evaluation.observationText,
        createdAt: item.evaluation.createdAt,
      })),
      regressionRecoveryQueue: regressionRecoveryQueue.value.map((item) => ({
        ruleId: item.rule.id,
        ruleTitle: item.rule.title,
        focus: item.focus,
        latestEvaluationId: item.latestEvaluation.id,
        latestEvaluatedAt: item.latestEvaluation.createdAt,
        matrixStatus: item.matrix.status,
        matrixScore: item.matrix.score,
        reason: item.reason,
      })),
    }
  }

  function exportEvaluationCsv() {
    const rows = [
      [
        'ruleId',
        'ruleTitle',
        'category',
        'reviewStatus',
        'reusability',
        'evaluationVerdict',
        'evaluationScore',
        'evaluationConfidence',
        'evaluationTrend',
        'adoptionDecision',
        'adoptionReason',
        'adoptionTimelineCount',
        'latestAdoptionChange',
        'adoptionGateStatus',
        'adoptionGateReady',
        'adoptionGateBlockers',
        'adoptionGateWarnings',
        'repeatabilityScore',
        'repeatabilityLevel',
        'repeatabilityIssues',
        'nextRepeatableStep',
        'sampleIndependenceScore',
        'sampleIndependenceLevel',
        'sampleIndependenceDays',
        'sampleIndependenceScenarios',
        'sampleIndependenceDuplicateScenarios',
        'sampleIndependenceIssues',
        'nextSampleIndependenceStep',
        'versionCoverageStatus',
        'currentVersion',
        'currentVersionEvaluationCount',
        'historicalVersionEvaluationCount',
        'currentVersionDecisiveCount',
        'versionCoverageIssues',
        'nextVersionStep',
        'protocolComplianceStatus',
        'protocolComplianceScore',
        'protocolCompleteExecutionCount',
        'protocolBlockedExecutionCount',
        'protocolPartialExecutionCount',
        'protocolMissingSnapshotCount',
        'protocolMissingExecutionCount',
        'protocolFocusMismatchCount',
        'protocolComplianceIssues',
        'nextProtocolStep',
        'consistencyStatus',
        'consistencyScore',
        'consistencyAgreementRate',
        'consistencyConflictingFocuses',
        'nextConsistencyStep',
        'replicationMatrixStatus',
        'replicationMatrixScore',
        'replicationMatrixSlots',
        'replicationMatrixMissingFocuses',
        'replicationMatrixConflictingFocuses',
        'replicationMatrixRecoveredSlots',
        'replicationMatrixRecoveryFocuses',
        'replicationMatrixRecoveryObservationSlots',
        'replicationMatrixRecoveryObservationFocuses',
        'replicationMaintenanceDue',
        'replicationMaintenanceOverdueDays',
        'replicationMaintenanceDueSlotCount',
        'replicationMaintenanceDueFocuses',
        'replicationMaintenanceDueFocusCounts',
        'replicationMaintenanceHealth',
        'replicationMaintenanceHealthScore',
        'replicationMaintenanceReason',
        'nextReplicationMatrixStep',
        'evaluationProtocolFocus',
        'evaluationProtocolCadenceDays',
        'evaluationProtocolPassCriteria',
        'evaluationProtocolFailCriteria',
        'evaluationProtocolRequiredEvidence',
        'boundaryCaseCount',
        'latestBoundarySeverity',
        'latestBoundaryHypothesis',
        'latestBoundarySuggestedConstraint',
        'revisionDraftPriority',
        'revisionDraftReason',
        'revisionDraftConclusion',
        'revisionDraftRecommendation',
        'revisionDraftConstraints',
        'revisionDraftExcludedScenarios',
        'revisionVersion',
        'revisionHistoryCount',
        'evaluationPlanPriority',
        'evaluationPlanFocus',
        'evaluationPlanReviewAfterDays',
        'evaluationSource',
        'evaluationCycle',
        'evaluationRuleVersion',
        'maintenanceRegression',
        'maintenanceRegressionFocus',
        'replicationSlotFocus',
        'evaluationPlanSnapshotPriority',
        'evaluationPlanSnapshotFocus',
        'evaluationProtocolSnapshotFocus',
        'evaluationProtocolExecutionStatus',
        'evaluationProtocolExecutionScore',
        'evaluationProtocolExecutionSummary',
        'evaluationProtocolMissingEvidence',
        'evaluationProtocolIssues',
        'evaluationQualityIssues',
        'evaluationId',
        'outcome',
        'note',
        'observationText',
        'createdAt',
        'revisionSuggestion',
      ],
    ]

    for (const rule of rules.value) {
      const evaluations = getEvaluations(rule)
      if (evaluations.length === 0) {
        rows.push([
          rule.id,
          rule.title,
          rule.category,
          rule.reviewStatus ?? '',
          rule.reusability,
          rule.evaluationVerdict ?? '',
          String(rule.evaluationScore ?? 0),
          rule.evaluationConfidence ?? '',
          rule.evaluationTrend ?? '',
          rule.adoptionDecision ?? '',
          rule.adoptionReason ?? '',
          String(getAdoptionTimeline(rule).length),
          adoptionEventLabel(latestAdoptionEvent(rule)),
          rule.adoptionGate?.status ?? '',
          String(rule.adoptionGate?.ready ?? false),
          rule.adoptionGate?.blockers.join(';') ?? '',
          rule.adoptionGate?.warnings.join(';') ?? '',
          String(rule.repeatabilityProfile?.score ?? 0),
          rule.repeatabilityProfile?.level ?? '',
          rule.repeatabilityProfile?.issueSummary.join(';') ?? '',
          rule.repeatabilityProfile?.nextRepeatableStep ?? '',
          String(rule.sampleIndependenceProfile?.score ?? 0),
          rule.sampleIndependenceProfile?.level ?? '',
          String(rule.sampleIndependenceProfile?.independentDayCount ?? 0),
          String(rule.sampleIndependenceProfile?.independentScenarioCount ?? 0),
          String(rule.sampleIndependenceProfile?.duplicateScenarioCount ?? 0),
          rule.sampleIndependenceProfile?.issueSummary.join(';') ?? '',
          rule.sampleIndependenceProfile?.nextIndependenceStep ?? '',
          rule.versionCoverageProfile?.status ?? '',
          String(rule.versionCoverageProfile?.currentVersion ?? rule.revisionVersion ?? 0),
          String(rule.versionCoverageProfile?.currentVersionEvaluationCount ?? 0),
          String(rule.versionCoverageProfile?.historicalEvaluationCount ?? 0),
          String(rule.versionCoverageProfile?.currentVersionDecisiveCount ?? 0),
          rule.versionCoverageProfile?.issueSummary.join(';') ?? '',
          rule.versionCoverageProfile?.nextVersionStep ?? '',
          rule.protocolComplianceProfile?.status ?? '',
          String(rule.protocolComplianceProfile?.score ?? 0),
          String(rule.protocolComplianceProfile?.completeExecutionCount ?? 0),
          String(rule.protocolComplianceProfile?.blockedExecutionCount ?? 0),
          String(rule.protocolComplianceProfile?.partialExecutionCount ?? 0),
          String(rule.protocolComplianceProfile?.missingSnapshotCount ?? 0),
          String(rule.protocolComplianceProfile?.missingExecutionCount ?? 0),
          String(rule.protocolComplianceProfile?.focusMismatchCount ?? 0),
          rule.protocolComplianceProfile?.issueSummary.join(';') ?? '',
          rule.protocolComplianceProfile?.nextProtocolStep ?? '',
          rule.evaluationConsistencyProfile?.status ?? '',
          String(rule.evaluationConsistencyProfile?.score ?? 0),
          String(rule.evaluationConsistencyProfile?.agreementRate ?? 0),
          rule.evaluationConsistencyProfile?.conflictingFocuses.join(';') ?? '',
          rule.evaluationConsistencyProfile?.nextConsistencyStep ?? '',
          rule.evaluationReplicationMatrix?.status ?? '',
          String(rule.evaluationReplicationMatrix?.score ?? 0),
          replicationMatrixSlotsLabel(rule),
          rule.evaluationReplicationMatrix?.missingFocuses.join(';') ?? '',
          rule.evaluationReplicationMatrix?.conflictingFocuses.join(';') ?? '',
          String(rule.evaluationReplicationMatrix?.recoveredSlots ?? 0),
          rule.evaluationReplicationMatrix?.recoveryFocuses.join(';') ?? '',
          String(rule.evaluationReplicationMatrix?.observingRecoveredSlots ?? 0),
          rule.evaluationReplicationMatrix?.recoveryObservationFocuses.join(';') ?? '',
          String(replicationMaintenanceInfo(rule).due),
          String(replicationMaintenanceInfo(rule).overdueDays),
          String(replicationDueSlotFocuses(rule, evaluationSettings.value).length),
          replicationDueSlotFocuses(rule, evaluationSettings.value).join(';'),
          replicationDueFocusCountsLabel(rule, evaluationSettings.value),
          replicationMaintenanceHealth(rule).level,
          String(replicationMaintenanceHealth(rule).score),
          replicationMaintenanceInfo(rule).reason,
          rule.evaluationReplicationMatrix?.nextMatrixStep ?? '',
          rule.evaluationProtocol?.focus ?? '',
          String(rule.evaluationProtocol?.cadenceDays ?? ''),
          rule.evaluationProtocol?.passCriteria.join(';') ?? '',
          rule.evaluationProtocol?.failCriteria.join(';') ?? '',
          rule.evaluationProtocol?.requiredEvidence.join(';') ?? '',
          String(getBoundaryCatalog(rule).length),
          latestBoundaryCase(rule)?.severity ?? '',
          latestBoundaryCase(rule)?.hypothesis ?? '',
          latestBoundaryCase(rule)?.suggestedConstraint ?? '',
          rule.revisionDraft?.priority ?? '',
          rule.revisionDraft?.reason ?? '',
          rule.revisionDraft?.conclusion ?? '',
          rule.revisionDraft?.recommendation ?? '',
          rule.revisionDraft?.suggestedConstraints.join(';') ?? '',
          rule.revisionDraft?.excludedScenarios.join(';') ?? '',
          String(rule.revisionVersion ?? 0),
          String(rule.revisionHistory?.length ?? 0),
          rule.evaluationPlan?.priority ?? '',
          rule.evaluationPlan?.focus ?? '',
          String(rule.evaluationPlan?.reviewAfterDays ?? ''),
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          rule.revisionSuggestion ?? '',
        ])
        continue
      }

      for (const evaluation of evaluations) {
        rows.push([
          rule.id,
          rule.title,
          rule.category,
          rule.reviewStatus ?? '',
          rule.reusability,
          rule.evaluationVerdict ?? '',
          String(rule.evaluationScore ?? 0),
          rule.evaluationConfidence ?? '',
          rule.evaluationTrend ?? '',
          rule.adoptionDecision ?? '',
          rule.adoptionReason ?? '',
          String(getAdoptionTimeline(rule).length),
          adoptionEventLabel(latestAdoptionEvent(rule)),
          rule.adoptionGate?.status ?? '',
          String(rule.adoptionGate?.ready ?? false),
          rule.adoptionGate?.blockers.join(';') ?? '',
          rule.adoptionGate?.warnings.join(';') ?? '',
          String(rule.repeatabilityProfile?.score ?? 0),
          rule.repeatabilityProfile?.level ?? '',
          rule.repeatabilityProfile?.issueSummary.join(';') ?? '',
          rule.repeatabilityProfile?.nextRepeatableStep ?? '',
          String(rule.sampleIndependenceProfile?.score ?? 0),
          rule.sampleIndependenceProfile?.level ?? '',
          String(rule.sampleIndependenceProfile?.independentDayCount ?? 0),
          String(rule.sampleIndependenceProfile?.independentScenarioCount ?? 0),
          String(rule.sampleIndependenceProfile?.duplicateScenarioCount ?? 0),
          rule.sampleIndependenceProfile?.issueSummary.join(';') ?? '',
          rule.sampleIndependenceProfile?.nextIndependenceStep ?? '',
          rule.versionCoverageProfile?.status ?? '',
          String(rule.versionCoverageProfile?.currentVersion ?? rule.revisionVersion ?? 0),
          String(rule.versionCoverageProfile?.currentVersionEvaluationCount ?? 0),
          String(rule.versionCoverageProfile?.historicalEvaluationCount ?? 0),
          String(rule.versionCoverageProfile?.currentVersionDecisiveCount ?? 0),
          rule.versionCoverageProfile?.issueSummary.join(';') ?? '',
          rule.versionCoverageProfile?.nextVersionStep ?? '',
          rule.protocolComplianceProfile?.status ?? '',
          String(rule.protocolComplianceProfile?.score ?? 0),
          String(rule.protocolComplianceProfile?.completeExecutionCount ?? 0),
          String(rule.protocolComplianceProfile?.blockedExecutionCount ?? 0),
          String(rule.protocolComplianceProfile?.partialExecutionCount ?? 0),
          String(rule.protocolComplianceProfile?.missingSnapshotCount ?? 0),
          String(rule.protocolComplianceProfile?.missingExecutionCount ?? 0),
          String(rule.protocolComplianceProfile?.focusMismatchCount ?? 0),
          rule.protocolComplianceProfile?.issueSummary.join(';') ?? '',
          rule.protocolComplianceProfile?.nextProtocolStep ?? '',
          rule.evaluationConsistencyProfile?.status ?? '',
          String(rule.evaluationConsistencyProfile?.score ?? 0),
          String(rule.evaluationConsistencyProfile?.agreementRate ?? 0),
          rule.evaluationConsistencyProfile?.conflictingFocuses.join(';') ?? '',
          rule.evaluationConsistencyProfile?.nextConsistencyStep ?? '',
          rule.evaluationReplicationMatrix?.status ?? '',
          String(rule.evaluationReplicationMatrix?.score ?? 0),
          replicationMatrixSlotsLabel(rule),
          rule.evaluationReplicationMatrix?.missingFocuses.join(';') ?? '',
          rule.evaluationReplicationMatrix?.conflictingFocuses.join(';') ?? '',
          String(rule.evaluationReplicationMatrix?.recoveredSlots ?? 0),
          rule.evaluationReplicationMatrix?.recoveryFocuses.join(';') ?? '',
          String(rule.evaluationReplicationMatrix?.observingRecoveredSlots ?? 0),
          rule.evaluationReplicationMatrix?.recoveryObservationFocuses.join(';') ?? '',
          String(replicationMaintenanceInfo(rule).due),
          String(replicationMaintenanceInfo(rule).overdueDays),
          String(replicationDueSlotFocuses(rule, evaluationSettings.value).length),
          replicationDueSlotFocuses(rule, evaluationSettings.value).join(';'),
          replicationDueFocusCountsLabel(rule, evaluationSettings.value),
          replicationMaintenanceHealth(rule).level,
          String(replicationMaintenanceHealth(rule).score),
          replicationMaintenanceInfo(rule).reason,
          rule.evaluationReplicationMatrix?.nextMatrixStep ?? '',
          rule.evaluationProtocol?.focus ?? '',
          String(rule.evaluationProtocol?.cadenceDays ?? ''),
          rule.evaluationProtocol?.passCriteria.join(';') ?? '',
          rule.evaluationProtocol?.failCriteria.join(';') ?? '',
          rule.evaluationProtocol?.requiredEvidence.join(';') ?? '',
          String(getBoundaryCatalog(rule).length),
          latestBoundaryCase(rule)?.severity ?? '',
          latestBoundaryCase(rule)?.hypothesis ?? '',
          latestBoundaryCase(rule)?.suggestedConstraint ?? '',
          rule.revisionDraft?.priority ?? '',
          rule.revisionDraft?.reason ?? '',
          rule.revisionDraft?.conclusion ?? '',
          rule.revisionDraft?.recommendation ?? '',
          rule.revisionDraft?.suggestedConstraints.join(';') ?? '',
          rule.revisionDraft?.excludedScenarios.join(';') ?? '',
          String(rule.revisionVersion ?? 0),
          String(rule.revisionHistory?.length ?? 0),
          rule.evaluationPlan?.priority ?? '',
          rule.evaluationPlan?.focus ?? '',
          String(rule.evaluationPlan?.reviewAfterDays ?? ''),
          evaluation.source ?? 'manual',
          evaluation.cycle ?? '',
          String(evaluation.ruleVersion ?? 0),
          String(evaluation.cycle === 'maintenance' && evaluation.outcome !== 'passed'),
          evaluation.cycle === 'maintenance' && evaluation.outcome !== 'passed' ? evaluation.replicationSlotFocus ?? evaluation.planSnapshot?.focus ?? evaluation.protocolSnapshot?.focus ?? '' : '',
          evaluation.replicationSlotFocus ?? '',
          evaluation.planSnapshot?.priority ?? '',
          evaluation.planSnapshot?.focus ?? '',
          evaluation.protocolSnapshot?.focus ?? '',
          evaluation.protocolExecution?.status ?? '',
          String(evaluation.protocolExecution?.score ?? ''),
          evaluation.protocolExecution?.summary ?? '',
          evaluation.protocolExecution?.missingEvidence.join(';') ?? '',
          evaluationProtocolIssues(evaluation).join(';'),
          evaluationQualityIssues(evaluation).join(';'),
          evaluation.id,
          evaluation.outcome,
          evaluation.note,
          evaluation.observationText ?? '',
          evaluation.createdAt,
          rule.revisionSuggestion ?? '',
        ])
      }
    }

    return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
  }

  function clearAll() {
    observations.value = []
    rules.value = []
    latestRuleId.value = ''
    insights.value = []
    laws.value = []
    persist()
  }

  // 仅返回 markdown 字符串(services/store 层无 DOM 依赖);下载由 page 层处理
  function exportAsMarkdown(): string {
    return renderExperienceMarkdown(rules.value, observations.value)
  }

  function clearAllData(): { observationCount: number; ruleCount: number } {
    const observationCount = observations.value.length
    const ruleCount = rules.value.length
    clearAll()
    return { observationCount, ruleCount }
  }

  // NOTE(idempotency): loadDemoWorkData 先调 clearAll()（含 insights 清空）再逐条提交。
  // 若用户在 35 次 AI 请求执行期间（35–100 秒）关闭页面，isSeedingDemo 无法持久化，
  // 重开后 isSeedingDemo=false 但 localStorage 中已有部分写入数据（非幂等中间状态）。
  // 用户再次点击会重新 clearAll() 后重跑，行为符合预期，但失败中途不自动恢复。
  // 另：submitObservation 内部有 isAnalyzing=true 守卫，循环期间若用户手动录入将被静默丢弃，
  // 此为已有行为（非本函数引入），但 35 次循环显著拉长了该丢弃窗口，演示时应告知用户勿并发操作。
  async function loadDemoWorkData() {
    if (isAnalyzing.value || isSeedingDemo.value) return

    clearAll()
    isSeedingDemo.value = true

    try {
      for (const item of DEMO_WORK_DATA) {
        await submitObservation(item.text)
      }
    } finally {
      isSeedingDemo.value = false
      persist()
    }
  }

function updateEvaluationSettings(settings: Partial<EvaluationSettings>) {
    evaluationSettings.value = normalizeEvaluationSettings({
      ...evaluationSettings.value,
      ...settings,
    })
    persist()
  }

  function importEvaluationData(raw: unknown): EvaluationImportResult {
    const payload = toRecord(raw)
    if (!payload) {
      throw new Error('导入文件不是有效的评估数据。')
    }

    const importedObservationRecords = readRecordArray(payload.observations)
    const importedRuleRecords = readRecordArray(payload.rules)
    const importedSettings = toRecord(payload.evaluationSettings)

    if (importedObservationRecords.length === 0 && importedRuleRecords.length === 0 && !importedSettings) {
      throw new Error('导入文件缺少 rules、observations 或 evaluationSettings。')
    }

    const result: EvaluationImportResult = {
      importedRules: 0,
      mergedRules: 0,
      importedObservations: 0,
      mergedEvaluations: 0,
      skippedRules: 0,
      skippedObservations: 0,
      skippedEvaluations: 0,
      updatedSettings: false,
    }

    const observationIds = new Set(observations.value.map((item) => item.id))
    for (const item of importedObservationRecords) {
      const observation = normalizeImportedObservation(item)
      if (!observation) {
        result.skippedObservations += 1
        continue
      }

      if (observationIds.has(observation.id)) {
        continue
      }

      observations.value.unshift(observation)
      observationIds.add(observation.id)
      result.importedObservations += 1
    }

    const ruleMap = new Map(rules.value.map((rule) => [rule.id, rule]))
    for (const item of importedRuleRecords) {
      const imported = normalizeImportedRule(item)
      if (!imported) {
        result.skippedRules += 1
        continue
      }

      result.skippedEvaluations += imported.skippedEvaluations
      const existingRule = ruleMap.get(imported.rule.id)
      if (!existingRule) {
        rules.value.unshift(imported.rule)
        ruleMap.set(imported.rule.id, imported.rule)
        result.importedRules += 1
        result.mergedEvaluations += getEvaluations(imported.rule).length
        continue
      }

      const mergeResult = mergeImportedRule(existingRule, imported.rule)
      result.mergedEvaluations += mergeResult.mergedEvaluations
      if (mergeResult.changed) {
        result.mergedRules += 1
      }
    }

    if (importedSettings) {
      const before = JSON.stringify(evaluationSettings.value)
      evaluationSettings.value = normalizeEvaluationSettings({
        ...evaluationSettings.value,
        normalReviewDays: numberValue(importedSettings.normalReviewDays, evaluationSettings.value.normalReviewDays),
        conflictReviewDays: numberValue(importedSettings.conflictReviewDays, evaluationSettings.value.conflictReviewDays),
        replicationMaintenanceDays: numberValue(importedSettings.replicationMaintenanceDays, evaluationSettings.value.replicationMaintenanceDays),
      })
      result.updatedSettings = before !== JSON.stringify(evaluationSettings.value)
    }

    for (const rule of rules.value) {
      applyEvaluationState(rule)
      rule.lastEvaluatedAt = latestEvaluationCreatedAt(rule) ?? rule.lastEvaluatedAt
    }

    latestRuleId.value = rules.value[0]?.id ?? ''
    persist()
    return result
  }

  async function loadDemoData() {
    if (isAnalyzing.value || isSeedingDemo.value) return

    clearAll()
    isSeedingDemo.value = true

    try {
      for (const sample of demoSamples) {
        await submitObservation(sample.text)
      }
    } finally {
      isSeedingDemo.value = false
      persist()
    }
  }

  // ---------------------------------------------------------------------------
  // 批量导入:粘贴多行文本 → 按行拆成多条观察 → 逐条走弹性分析管线 → 写库
  // ---------------------------------------------------------------------------
  async function importObservations(rawText: string): Promise<ImportSummary> {
    // 并发守卫:与 submitObservation(isAnalyzing) 和 loadDemoData(isSeedingDemo) 互斥,
    // 防止批量导入与单条提交或 demo 种子同时运行互相竞争写入 persist()。
    if (isAnalyzing.value || isSeedingDemo.value) {
      return { total: 0, succeeded: 0, failed: 0 }
    }

    const lines = rawText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const summary: ImportSummary = { total: lines.length, succeeded: 0, failed: 0 }
    if (lines.length === 0) return summary

    isSeedingDemo.value = true
    const client = getActiveModelClient()

    try {
      // 在列表顶部按输入顺序插入(与单条 unshift 的"最新在上"一致,且批内保持原顺序)
      let insertAt = 0
      for (const line of lines) {
        const now = new Date().toISOString()
        const observation: Observation = {
          id: createId('obs'),
          text: line,
          category: '其他',
          tags: [],
          summary: '批量导入中',
          status: 'pending',
          createdAt: now,
        }
        observations.value.splice(insertAt, 0, observation)
        insertAt += 1

        try {
          const analysis = await analyzeObservationResilient(line, { client })
          const processedAt = new Date().toISOString()
          await _writeObservation(observation, analysis, processedAt)
          summary.succeeded += 1
        } catch {
          // 每条独立降级:单条失败不中断整体批量导入循环
          observation.status = 'failed'
          observation.summary = '结构化校验失败，原始观察已保存。'
          summary.failed += 1
        }

        persist()
      }
    } finally {
      isSeedingDemo.value = false
    }

    return summary
  }

  // 经后端代理(B1)批量导入:一次请求让服务端提炼(Key 不出浏览器),再本地写入。
  async function importObservationsViaBackend(texts: string[]): Promise<ImportSummary> {
    if (isAnalyzing.value || isSeedingDemo.value) {
      return { total: 0, succeeded: 0, failed: 0 }
    }
    const lines = texts.map((t) => (t ?? '').trim()).filter((t) => t.length > 0)
    const summary: ImportSummary = { total: lines.length, succeeded: 0, failed: 0 }
    if (lines.length === 0) return summary

    const url = getBackendUrl()
    if (!url) throw new Error('后端地址未配置(experience-os:backend)')

    isSeedingDemo.value = true
    try {
      const { results, truncated, maxItems } = await analyzeBatchViaBackend(lines, url) // 一次请求拿全部结果
      if (truncated) {
        summary.total = results.length
        summary.note = `单次最多 ${maxItems} 条,已处理前 ${results.length} 条,其余请分批导入。`
      }
      let insertAt = 0
      for (const item of results) {
        const now = new Date().toISOString()
        const observation: Observation = {
          id: createId('obs'),
          text: item.text,
          category: '其他',
          tags: [],
          summary: '批量导入中',
          status: 'pending',
          createdAt: now,
        }
        observations.value.splice(insertAt, 0, observation)
        insertAt += 1
        try {
          await _writeObservation(observation, item.analysis, new Date().toISOString())
          summary.succeeded += 1
        } catch {
          observation.status = 'failed'
          observation.summary = '结构化校验失败，原始观察已保存。'
        }
        persist()
      }
      summary.failed = summary.total - summary.succeeded
    } finally {
      isSeedingDemo.value = false
      persist()
    }
    return summary
  }

  return {
    observations,
    rules,
    evaluationSettings,
    isAnalyzing,
    isSeedingDemo,
    latestRule,
    latestRuleId,
    rulesByCategory,
    stableRuleCount,
    watchingRuleCount,
    needsFixRuleCount,
    conflictedRuleCount,
    evaluationCount,
    repeatEvaluatedRuleCount,
    evaluationStats,
    evaluationAnalysis,
    versionCoverageStats,
    evaluationCoverage,
    evaluationQuality,
    evaluationQueue,
    evaluationPlanQueue,
    evaluationProtocolQueue,
    protocolExecutionQueue,
    boundaryCatalogQueue,
    revisionDraftQueue,
    versionCoverageQueue,
    adoptionDecisionQueue,
    adoptionTimelineQueue,
    adoptionGateQueue,
    repeatabilityQueue,
    consistencyQueue,
    replicationMatrixQueue,
    replicationMaintenanceStats,
    replicationMaintenanceBacklog,
    maintenanceRegressionQueue,
    regressionRecoveryQueue,
    staleEvaluationRules,
    locationGroups,
    timelineItems,
    submitObservation,
    setFeedback,
    addEvaluation,
    attachEvaluationEvidence,
    evaluateReplicationSlot,
    evaluateNextReplicationSlot,
    replicationMaintenanceInfo,
    replicationSlotMaintenanceInfo,
    replicationMaintenanceHealth,
    applyRevisionDraft,
    recallEvaluationCandidates,
    recallRelatedLaws,
    exportEvaluationData,
    exportEvaluationCsv,
    updateEvaluationSettings,
    importEvaluationData,
    clearAll,
    clearAllData,
    exportAsMarkdown,
    loadDemoData,
    loadDemoWorkData,
    importObservations,
    importObservationsViaBackend,
    insights,
    isComputingInsights,
    computeInsights,
    laws,
    isScanningLaws,
    scanLaws,
    markLaw,
    periodicReview(period: ReviewPeriod = 'week') {
      return buildPeriodicReview(observations.value, period, new Date())
    },
    decisionHints,
    dismissDecisionHint(ruleId: string) {
      decisionHints.value = decisionHints.value.filter((h) => h.ruleId !== ruleId)
    },
  }
})

function toRecord(value: unknown): ImportableRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as ImportableRecord
}

function readRecordArray(value: unknown): ImportableRecord[] {
  if (!Array.isArray(value)) return []
  return value.map(toRecord).filter((item): item is ImportableRecord => Boolean(item))
}

function stringValue(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function optionalString(value: unknown) {
  const text = stringValue(value)
  return text || undefined
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return uniqueValues(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))
}

function numberValue(value: unknown, fallback: number) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value)
  return fallback
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function dateValue(value: unknown, fallback: string) {
  if (typeof value === 'string' && Number.isFinite(new Date(value).getTime())) return value
  return fallback
}

function latestEvaluationCreatedAt(rule: ExperienceRule) {
  return latestEvaluationCreatedAtFrom(getCurrentVersionEvaluations(rule))
}

function latestAnyEvaluationCreatedAt(rule: ExperienceRule) {
  return latestEvaluationCreatedAtFrom(getEvaluations(rule))
}

function latestEvaluationCreatedAtFrom(evaluations: RuleEvaluation[]) {
  const timestamps = evaluations
    .map((evaluation) => evaluation.createdAt)
    .filter((value) => Number.isFinite(new Date(value).getTime()))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  return timestamps[0]
}

function normalizeImportedObservation(input: ImportableRecord): Observation | undefined {
  const id = stringValue(input.id)
  const text = stringValue(input.text)
  if (!id || !text) return undefined

  const now = new Date().toISOString()
  const SENTIMENT_VALUES = ['positive', 'neutral', 'negative'] as const
  return {
    id,
    text,
    category: enumValue(input.category, EXPERIENCE_CATEGORIES, '其他'),
    tags: stringArray(input.tags),
    summary: stringValue(input.summary, '历史导入观察。'),
    status: enumValue(input.status, PROCESS_STATUSES, 'success'),
    createdAt: dateValue(input.createdAt, now),
    processedAt: optionalDate(input.processedAt),
    ruleId: optionalString(input.ruleId),
    location: optionalString(input.location),
    sentiment: SENTIMENT_VALUES.includes(input.sentiment as never)
      ? (input.sentiment as ObservationSentiment)
      : undefined,
  }
}

function normalizeImportedRule(input: ImportableRecord): { rule: ExperienceRule; skippedEvaluations: number } | undefined {
  const id = stringValue(input.id)
  const title = stringValue(input.title)
  if (!id || !title) return undefined

  const evaluationRecords = readRecordArray(input.evaluations)
  const evaluations: RuleEvaluation[] = []
  const evaluationIds = new Set<string>()
  let skippedEvaluations = 0

  for (const item of evaluationRecords) {
    const evaluation = normalizeImportedEvaluation(item)
    if (!evaluation || evaluationIds.has(evaluation.id)) {
      skippedEvaluations += 1
      continue
    }
    evaluations.push(evaluation)
    evaluationIds.add(evaluation.id)
  }

  evaluations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const now = new Date().toISOString()
  const feedback = enumValue(input.feedback, FEEDBACK_VALUES, 'none')
  const lastEvaluationAt = optionalDate(input.lastEvaluatedAt) ?? evaluations[0]?.createdAt
  const updatedAt = dateValue(input.updatedAt, lastEvaluationAt ?? now)
  const evidenceIds = uniqueValues([
    ...stringArray(input.evidenceIds),
    ...evaluations.map((evaluation) => evaluation.observationId ?? '').filter(Boolean),
  ])

  const rule: ExperienceRule = {
    id,
    title,
    category: enumValue(input.category, EXPERIENCE_CATEGORIES, '其他'),
    conclusion: stringValue(input.conclusion, title),
    recommendation: stringValue(input.recommendation, '继续观察后再行动。'),
    conditions: stringArray(input.conditions),
    warnings: stringArray(input.warnings),
    evidenceIds,
    reusability: enumValue(input.reusability, REUSABILITY_VALUES, 'watch'),
    feedback,
    reviewStatus: enumValue(input.reviewStatus, REVIEW_STATUS_VALUES, reviewStatusFromFeedback(feedback)),
    evaluations,
    evaluationVerdict: enumValue(input.evaluationVerdict, EVALUATION_VERDICTS, 'insufficient'),
    evaluationScore: normalizeEvaluationScore(numberValue(input.evaluationScore, 0)),
    evaluationConfidence: enumValue(input.evaluationConfidence, EVALUATION_CONFIDENCES, 'low'),
    evaluationTrend: enumValue(input.evaluationTrend, EVALUATION_TRENDS, 'unknown'),
    nextEvaluationAction: stringValue(input.nextEvaluationAction),
    adoptionDecision: enumValue(input.adoptionDecision, EVALUATION_ADOPTION_DECISIONS, 'retest'),
    adoptionReason: stringValue(input.adoptionReason),
    revisionVersion: Math.max(0, Math.round(numberValue(input.revisionVersion, 0))),
    revisionHistory: normalizeImportedRevisionHistory(readRecordArray(input.revisionHistory)),
    evaluationPlan: normalizeImportedEvaluationPlan(toRecord(input.evaluationPlan)),
    revisionSuggestion: stringValue(input.revisionSuggestion),
    lastEvaluatedAt: lastEvaluationAt,
    updatedAt,
    location: optionalString(input.location),
  }

  return {
    rule: normalizeRule(rule),
    skippedEvaluations,
  }
}

function normalizeImportedEvaluation(input: ImportableRecord): RuleEvaluation | undefined {
  const id = stringValue(input.id)
  const outcome = enumValue(input.outcome, EVALUATION_OUTCOMES, '' as EvaluationOutcome)
  if (!id || !outcome) return undefined

  const now = new Date().toISOString()
  const evaluation: RuleEvaluation = {
    id,
    outcome,
    note: stringValue(input.note, evaluationNoteFromOutcome(outcome)),
    createdAt: dateValue(input.createdAt, now),
    observationId: optionalString(input.observationId),
    observationText: optionalString(input.observationText),
    source: enumValue(input.source, EVALUATION_SOURCES, 'manual'),
    cycle: enumValue(input.cycle, EVALUATION_CYCLES, '' as EvaluationCycle) || undefined,
    ruleVersion: Math.max(0, Math.round(numberValue(input.ruleVersion, 0))),
    replicationSlotFocus: enumValue(input.replicationSlotFocus, EVALUATION_PLAN_FOCUS_VALUES, '' as EvaluationPlanFocus) || undefined,
    planSnapshot: normalizeImportedPlanSnapshot(toRecord(input.planSnapshot)),
    protocolSnapshot: normalizeImportedProtocolSnapshot(toRecord(input.protocolSnapshot)),
  }
  evaluation.protocolExecution = normalizeImportedProtocolExecution(toRecord(input.protocolExecution), evaluation)
  return evaluation
}

function normalizeImportedRevisionHistory(records: ImportableRecord[]): RuleRevisionRecord[] {
  const revisions: RuleRevisionRecord[] = []
  const revisionIds = new Set<string>()

  for (const input of records) {
    const id = stringValue(input.id)
    const draftId = stringValue(input.draftId)
    if (!id || !draftId || revisionIds.has(id)) continue

    const now = new Date().toISOString()
    revisions.push({
      id,
      draftId,
      appliedAt: dateValue(input.appliedAt, now),
      version: Math.max(1, Math.round(numberValue(input.version, 1))),
      reason: stringValue(input.reason, '历史修订记录。'),
      previousConclusion: stringValue(input.previousConclusion),
      previousRecommendation: stringValue(input.previousRecommendation),
      previousConditions: stringArray(input.previousConditions),
      previousWarnings: stringArray(input.previousWarnings),
      newConclusion: stringValue(input.newConclusion),
      newRecommendation: stringValue(input.newRecommendation),
      newConditions: stringArray(input.newConditions),
      newWarnings: stringArray(input.newWarnings),
      evidenceIds: stringArray(input.evidenceIds),
    })
    revisionIds.add(id)
  }

  return revisions.sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime())
}

function createProtocolSnapshot(protocol: EvaluationProtocol | undefined): EvaluationProtocolSnapshot | undefined {
  if (!protocol) return undefined
  return {
    focus: protocol.focus,
    title: protocol.title,
    scenario: protocol.scenario,
    passCriteria: protocol.passCriteria,
    failCriteria: protocol.failCriteria,
    uncertainCriteria: protocol.uncertainCriteria,
    requiredEvidence: protocol.requiredEvidence,
    cadenceDays: protocol.cadenceDays,
  }
}

function createProtocolExecution(evaluation: RuleEvaluation, checkedAt = new Date().toISOString()): EvaluationProtocolExecution {
  const protocol = evaluation.protocolSnapshot
  const checks: EvaluationProtocolExecution['checks'] = []
  const missingEvidence: string[] = []

  if (!protocol) {
    return {
      status: 'blocked',
      score: 0,
      checkedAt,
      matchedCriteria: [],
      missingEvidence: ['复测协议快照'],
      checks: [
        {
          id: 'protocol-snapshot',
          label: '协议快照',
          status: 'blocked',
          detail: '本次评估没有保存复测协议，无法复现判定口径。',
        },
      ],
      summary: '缺少复测协议，不能作为可重复评估样本。',
    }
  }

  const observationText = evaluation.observationText?.trim() ?? ''
  const matchedCriteria = criteriaForOutcome(protocol, evaluation.outcome)

  checks.push({
    id: 'scenario',
    label: '复测场景',
    status: observationText ? 'passed' : 'blocked',
    detail: observationText ? `已记录场景：${observationText}` : '缺少可按协议复核的时间、地点、对象或触发场景。',
  })
  if (!observationText) missingEvidence.push('复测场景')

  checks.push({
    id: 'outcome-criteria',
    label: '结果判定',
    status: matchedCriteria.length > 0 ? 'passed' : 'blocked',
    detail:
      matchedCriteria.length > 0
        ? `本次 ${evaluationLabelForProtocol(evaluation.outcome)} 对应 ${matchedCriteria.length} 条判定标准。`
        : '协议缺少当前结果类型的判定标准。',
  })

  const hasLinkedEvidence = Boolean(evaluation.observationId)
  checks.push({
    id: 'linked-evidence',
    label: '证据绑定',
    status: hasLinkedEvidence ? 'passed' : observationText ? 'warning' : 'blocked',
    detail: hasLinkedEvidence ? '本次评估已绑定观察证据。' : observationText ? '有场景文本，但没有绑定为观察证据。' : '缺少观察证据绑定。',
  })
  if (!hasLinkedEvidence) missingEvidence.push('观察证据绑定')

  const requiredEvidence = protocol.requiredEvidence
  checks.push({
    id: 'required-evidence',
    label: '必填证据',
    status: requiredEvidence.length === 0 || (observationText && hasLinkedEvidence) ? 'passed' : observationText ? 'warning' : 'blocked',
    detail:
      requiredEvidence.length === 0
        ? '协议未声明额外必填证据。'
        : observationText && hasLinkedEvidence
          ? `已用观察证据承载 ${requiredEvidence.length} 项必填证据要求。`
          : `缺少必填证据：${requiredEvidence.join('；')}`,
  })
  if (requiredEvidence.length > 0 && !(observationText && hasLinkedEvidence)) {
    missingEvidence.push(...requiredEvidence)
  }

  checks.push({
    id: 'plan-alignment',
    label: '计划一致性',
    status:
      evaluation.source !== 'plan'
        ? 'passed'
        : !evaluation.planSnapshot
          ? 'warning'
          : evaluation.planSnapshot.focus === protocol.focus
            ? 'passed'
            : 'warning',
    detail:
      evaluation.source !== 'plan'
        ? '本次不是计划复测，不要求计划快照一致。'
        : !evaluation.planSnapshot
          ? '计划复测缺少计划快照。'
          : evaluation.planSnapshot.focus === protocol.focus
            ? '协议焦点与计划快照一致。'
            : '协议焦点与计划快照不一致。',
  })

  if (evaluation.outcome === 'uncertain') {
    const hasSpecificReason = evaluation.note.trim() && evaluation.note.trim() !== evaluationNoteFromOutcome('uncertain')
    checks.push({
      id: 'uncertain-rationale',
      label: '不确定说明',
      status: hasSpecificReason ? 'passed' : 'warning',
      detail: hasSpecificReason ? '已说明不确定原因。' : '不确定结果需要补充具体原因，避免样本无法复核。',
    })
    if (!hasSpecificReason) missingEvidence.push('不确定原因')
  }

  const blockedCount = checks.filter((check) => check.status === 'blocked').length
  const warningCount = checks.filter((check) => check.status === 'warning').length
  const score = Math.round(
    (checks.reduce((total, check) => total + (check.status === 'passed' ? 1 : check.status === 'warning' ? 0.5 : 0), 0) / checks.length) * 100,
  )
  const status: EvaluationProtocolExecutionStatus = blockedCount > 0 ? 'blocked' : warningCount > 0 ? 'partial' : 'complete'

  return {
    status,
    score,
    checkedAt,
    matchedCriteria,
    missingEvidence: uniqueValues(missingEvidence),
    checks,
    summary:
      status === 'complete'
        ? `协议执行完整，匹配 ${matchedCriteria.length} 条判定标准。`
        : status === 'partial'
          ? `协议执行有 ${warningCount} 项提醒，建议补齐后再扩大样本。`
          : `协议执行有 ${blockedCount} 项阻断，不能作为高可信复测样本。`,
  }
}

function criteriaForOutcome(protocol: EvaluationProtocolSnapshot, outcome: EvaluationOutcome) {
  if (outcome === 'passed') return protocol.passCriteria
  if (outcome === 'failed') return protocol.failCriteria
  return protocol.uncertainCriteria
}

function evaluationLabelForProtocol(outcome: EvaluationOutcome) {
  const map: Record<EvaluationOutcome, string> = {
    passed: '有效',
    failed: '无效',
    uncertain: '不确定',
  }
  return map[outcome]
}

function createPlanSnapshot(plan: EvaluationPlan | undefined): EvaluationPlanSnapshot | undefined {
  if (!plan) return undefined
  return {
    priority: plan.priority,
    focus: plan.focus,
    scenarioPrompt: plan.scenarioPrompt,
    evidencePrompt: plan.evidencePrompt,
    reason: plan.reason,
  }
}

function normalizeImportedProtocolSnapshot(input: ImportableRecord | undefined): EvaluationProtocolSnapshot | undefined {
  if (!input) return undefined
  const title = stringValue(input.title)
  const scenario = stringValue(input.scenario)
  const passCriteria = stringArray(input.passCriteria)
  const failCriteria = stringArray(input.failCriteria)
  const uncertainCriteria = stringArray(input.uncertainCriteria)
  const requiredEvidence = stringArray(input.requiredEvidence)
  if (!title || !scenario || passCriteria.length === 0 || failCriteria.length === 0 || uncertainCriteria.length === 0 || requiredEvidence.length === 0) return undefined

  return {
    focus: enumValue(input.focus, EVALUATION_PLAN_FOCUS_VALUES, 'confirmation'),
    title,
    scenario,
    passCriteria,
    failCriteria,
    uncertainCriteria,
    requiredEvidence,
    cadenceDays: clampReviewDays(numberValue(input.cadenceDays, 14)),
  }
}

function normalizeImportedProtocolExecution(input: ImportableRecord | undefined, evaluation: RuleEvaluation): EvaluationProtocolExecution {
  const fallback = createProtocolExecution(evaluation, evaluation.createdAt)
  if (!input) return fallback

  const checks = readRecordArray(input.checks)
    .map((check) => ({
      id: stringValue(check.id),
      label: stringValue(check.label),
      status: enumValue(check.status, ['passed', 'warning', 'blocked'] as const, 'warning'),
      detail: stringValue(check.detail),
    }))
    .filter((check) => check.id && check.label && check.detail)

  if (checks.length === 0) return fallback

  return {
    status: enumValue(input.status, EVALUATION_PROTOCOL_EXECUTION_STATUSES, fallback.status),
    score: normalizeEvaluationScore(numberValue(input.score, fallback.score)),
    checkedAt: dateValue(input.checkedAt, fallback.checkedAt),
    matchedCriteria: stringArray(input.matchedCriteria),
    missingEvidence: stringArray(input.missingEvidence),
    checks,
    summary: stringValue(input.summary, fallback.summary),
  }
}

function normalizeImportedPlanSnapshot(input: ImportableRecord | undefined): EvaluationPlanSnapshot | undefined {
  if (!input) return undefined
  const scenarioPrompt = stringValue(input.scenarioPrompt)
  const evidencePrompt = stringValue(input.evidencePrompt)
  const reason = stringValue(input.reason)
  if (!scenarioPrompt || !evidencePrompt || !reason) return undefined

  return {
    priority: enumValue(input.priority, EVALUATION_PLAN_PRIORITIES, 'medium'),
    focus: enumValue(input.focus, EVALUATION_PLAN_FOCUS_VALUES, 'confirmation'),
    scenarioPrompt,
    evidencePrompt,
    reason,
  }
}

function normalizeImportedEvaluationPlan(input: ImportableRecord | undefined): EvaluationPlan | undefined {
  if (!input) return undefined
  const scenarioPrompt = stringValue(input.scenarioPrompt)
  const evidencePrompt = stringValue(input.evidencePrompt)
  const reason = stringValue(input.reason)
  if (!scenarioPrompt || !evidencePrompt || !reason) return undefined

  return {
    priority: enumValue(input.priority, EVALUATION_PLAN_PRIORITIES, 'medium'),
    focus: enumValue(input.focus, EVALUATION_PLAN_FOCUS_VALUES, 'confirmation'),
    scenarioPrompt,
    evidencePrompt,
    reviewAfterDays: clampReviewDays(numberValue(input.reviewAfterDays, 14)),
    reason,
  }
}

function optionalDate(value: unknown) {
  if (typeof value === 'string' && Number.isFinite(new Date(value).getTime())) return value
  return undefined
}

function createFocusCountMap(): Record<EvaluationPlanFocus, number> {
  return EVALUATION_PLAN_FOCUS_VALUES.reduce(
    (acc, focus) => {
      acc[focus] = 0
      return acc
    },
    {} as Record<EvaluationPlanFocus, number>,
  )
}

function createMaintenanceHealthCountMap(profiles: Array<{ level: EvaluationMaintenanceHealth }>): Record<EvaluationMaintenanceHealth, number> {
  const counts = EVALUATION_MAINTENANCE_HEALTH_LEVELS.reduce(
    (acc, level) => {
      acc[level] = 0
      return acc
    },
    {} as Record<EvaluationMaintenanceHealth, number>,
  )

  for (const profile of profiles) {
    counts[profile.level] += 1
  }

  return counts
}

function createAdoptionCountMap(): Record<EvaluationAdoptionDecision, number> {
  return EVALUATION_ADOPTION_DECISIONS.reduce(
    (acc, decision) => {
      acc[decision] = 0
      return acc
    },
    {} as Record<EvaluationAdoptionDecision, number>,
  )
}

function adoptionDecisionPriorityValue(decision: EvaluationAdoptionDecision | undefined) {
  const map: Record<EvaluationAdoptionDecision, number> = {
    suspend: 50,
    repair: 40,
    retest: 30,
    limit: 20,
    adopt: 10,
  }
  return decision ? map[decision] : 0
}

function adoptionGatePriorityValue(status: EvaluationGateStatus | undefined) {
  const map = {
    blocked: 30,
    attention: 20,
    ready: 10,
  }
  return typeof status === 'string' && status in map ? map[status as keyof typeof map] : 0
}

function versionCoveragePriority(status: EvaluationVersionCoverageStatus | undefined) {
  const map = {
    unretested: 30,
    partial: 20,
    covered: 0,
  }
  return typeof status === 'string' && status in map ? map[status as keyof typeof map] : 0
}

function repeatabilityLevelPriority(level: EvaluationRepeatabilityLevel | undefined) {
  const map = {
    weak: 10,
    developing: 20,
    repeatable: 30,
  }
  return typeof level === 'string' && level in map ? map[level as keyof typeof map] : 0
}

function consistencyStatusPriority(status: EvaluationConsistencyStatus | undefined) {
  const map = {
    conflicting: 40,
    drifting: 30,
    insufficient: 20,
    stable: 10,
  }
  return typeof status === 'string' && status in map ? map[status as keyof typeof map] : 0
}

function replicationMatrixStatusPriority(status: EvaluationReplicationMatrixStatus | undefined) {
  const map = {
    blocked: 40,
    incomplete: 30,
    empty: 20,
    ready: 10,
  }
  return typeof status === 'string' && status in map ? map[status as keyof typeof map] : 0
}

function getAdoptionTimeline(rule: ExperienceRule) {
  return Array.isArray(rule.adoptionTimeline) ? rule.adoptionTimeline : []
}

function latestAdoptionEvent(rule: ExperienceRule): AdoptionDecisionEvent | undefined {
  return [...getAdoptionTimeline(rule)].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
}

function adoptionEventLabel(event: AdoptionDecisionEvent | undefined) {
  if (!event) return ''
  return `${event.decision} after ${event.evaluationCount} evaluations: ${event.reason}`
}

function averageRepeatabilityScore(ruleList: ExperienceRule[]) {
  const scoredRules = ruleList.filter((rule) => rule.repeatabilityProfile)
  if (scoredRules.length === 0) return 0
  return Math.round(scoredRules.reduce((total, rule) => total + (rule.repeatabilityProfile?.score ?? 0), 0) / scoredRules.length)
}

function averageSampleIndependenceScore(ruleList: ExperienceRule[]) {
  const scoredRules = ruleList.filter((rule) => rule.sampleIndependenceProfile)
  if (scoredRules.length === 0) return 0
  return Math.round(scoredRules.reduce((total, rule) => total + (rule.sampleIndependenceProfile?.score ?? 0), 0) / scoredRules.length)
}

function replicationMatrixSlotsLabel(rule: ExperienceRule) {
  return (
    rule.evaluationReplicationMatrix?.slots
      .map((slot) => `${slot.focus}:${slot.status}:${slot.completedCount}/${slot.requiredCount}`)
      .join(';') ?? ''
  )
}

function replicationDueSlotFocuses(rule: ExperienceRule, settings: EvaluationSettings) {
  if (rule.evaluationReplicationMatrix?.status !== 'ready') return []
  return EVALUATION_PLAN_FOCUS_VALUES.filter((focus) => replicationSlotMaintenanceInfoFor(rule, focus, settings).due)
}

function replicationDueFocusCountsLabel(rule: ExperienceRule, settings: EvaluationSettings) {
  if (rule.evaluationReplicationMatrix?.status !== 'ready') return ''
  return EVALUATION_PLAN_FOCUS_VALUES.map((focus) => {
    const due = replicationSlotMaintenanceInfoFor(rule, focus, settings).due ? 1 : 0
    return `${focus}:${due}`
  }).join(';')
}

function getBoundaryCatalog(rule: ExperienceRule) {
  return Array.isArray(rule.boundaryCatalog) ? rule.boundaryCatalog : []
}

function latestBoundaryCase(rule: ExperienceRule): EvaluationBoundaryCase | undefined {
  return [...getBoundaryCatalog(rule)].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
}

function boundarySeverityPriority(severity: EvaluationBoundaryCase['severity'] | undefined) {
  const map: Record<EvaluationBoundaryCase['severity'], number> = {
    critical: 30,
    watch: 20,
    unknown: 10,
  }
  return severity ? map[severity] : 0
}

function evaluationQualityIssues(evaluation: RuleEvaluation) {
  const issues: string[] = []
  if (!evaluation.observationText?.trim()) {
    issues.push('缺少复测场景')
  }
  if (!evaluation.observationId) {
    issues.push('未绑定观察证据')
  }
  if (evaluation.source === 'plan' && !evaluation.planSnapshot) {
    issues.push('缺少计划快照')
  }
  if (!evaluation.protocolSnapshot) {
    issues.push('缺少协议快照')
  }
  if (evaluation.protocolExecution?.status === 'blocked') {
    issues.push('协议执行阻断')
  } else if (evaluation.protocolExecution?.status === 'partial') {
    issues.push('协议执行不完整')
  }
  return issues
}

function evaluationProtocolIssues(evaluation: RuleEvaluation) {
  if (evaluation.protocolExecution) {
    return evaluation.protocolExecution.checks
      .filter((check) => check.status !== 'passed')
      .map((check) => `${check.label}：${check.detail}`)
  }

  const issues: string[] = []
  if (!evaluation.protocolSnapshot) {
    issues.push('缺少协议快照')
  }
  if (!evaluation.observationText?.trim()) {
    issues.push('缺少可按协议复核的场景')
  }
  if (evaluation.source === 'plan' && !evaluation.planSnapshot) {
    issues.push('计划复测缺少计划快照')
  }
  if (evaluation.protocolSnapshot && evaluation.planSnapshot && evaluation.protocolSnapshot.focus !== evaluation.planSnapshot.focus) {
    issues.push('协议焦点与计划快照不一致')
  }
  if (evaluation.outcome === 'uncertain' && !evaluation.note.trim()) {
    issues.push('不确定结果缺少原因说明')
  }
  return issues
}

function mergeImportedRule(target: ExperienceRule, imported: ExperienceRule) {
  let changed = false
  const beforeEvidenceCount = target.evidenceIds.length
  const beforeConditionCount = target.conditions.length
  const beforeWarningCount = target.warnings.length

  target.evidenceIds = uniqueValues([...target.evidenceIds, ...imported.evidenceIds])
  target.conditions = uniqueValues([...target.conditions, ...imported.conditions])
  target.warnings = uniqueValues([...target.warnings, ...imported.warnings])

  changed ||= target.evidenceIds.length !== beforeEvidenceCount
  changed ||= target.conditions.length !== beforeConditionCount
  changed ||= target.warnings.length !== beforeWarningCount

  const existingEvaluationIds = new Set(getEvaluations(target).map((evaluation) => evaluation.id))
  const newEvaluations = getEvaluations(imported).filter((evaluation) => !existingEvaluationIds.has(evaluation.id))

  if (newEvaluations.length > 0) {
    target.evaluations = [...newEvaluations, ...getEvaluations(target)].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    changed = true
  }

  if (isNewerOrSame(imported.updatedAt, target.updatedAt)) {
    target.title = imported.title
    target.category = imported.category
    target.conclusion = imported.conclusion
    target.recommendation = imported.recommendation
    target.location = imported.location ?? target.location
    target.updatedAt = maxDateString(target.updatedAt, imported.updatedAt, latestAnyEvaluationCreatedAt(target))
    changed = true
  } else if (newEvaluations.length > 0) {
    target.updatedAt = maxDateString(target.updatedAt, latestAnyEvaluationCreatedAt(target))
  }

  target.lastEvaluatedAt = latestEvaluationCreatedAt(target) ?? target.lastEvaluatedAt
  applyEvaluationState(target)

  return {
    changed,
    mergedEvaluations: newEvaluations.length,
  }
}

function isNewerOrSame(candidate: string, baseline: string) {
  return new Date(candidate).getTime() >= new Date(baseline).getTime()
}

function maxDateString(...values: Array<string | undefined>) {
  return values
    .filter((value): value is string => typeof value === 'string' && Number.isFinite(new Date(value).getTime()))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
}

function reviewStatusFromFeedback(feedback: Feedback): RuleReviewStatus {
  const map: Record<Feedback, RuleReviewStatus> = {
    useful: 'validated',
    watch: 'watching',
    inaccurate: 'needsFix',
    none: 'unreviewed',
  }
  return map[feedback]
}

function reusabilityFromFeedback(current: Reusability, feedback: Feedback): Reusability {
  if (feedback === 'inaccurate') return 'watch'
  if (feedback === 'watch') return current === 'high' ? 'medium' : 'watch'
  if (feedback === 'useful') {
    if (current === 'watch' || current === 'low') return 'medium'
    return 'high'
  }
  return current
}

function getEvaluations(rule: ExperienceRule) {
  return rule.evaluations ?? []
}

function getCurrentVersionEvaluations(rule: ExperienceRule) {
  const currentVersion = rule.revisionVersion ?? 0
  return getEvaluations(rule).filter((evaluation) => (evaluation.ruleVersion ?? 0) === currentVersion)
}

function evaluationNoteFromOutcome(outcome: EvaluationOutcome, focus?: EvaluationPlanFocus) {
  const map: Record<EvaluationOutcome, string> = {
    passed: '本次复测符合规则预期。',
    failed: '本次复测与规则预期不一致。',
    uncertain: '本次复测结果不明确，需要继续观察。',
  }
  const focusSuffix = focus ? `（${planFocusLabel(focus)}槽位）` : ''
  return `${map[outcome]}${focusSuffix}`
}

function applyEvaluationState(rule: ExperienceRule) {
  Object.assign(rule, deriveEvaluationState(rule))
}

function shouldEvaluate(rule: ExperienceRule, settings: EvaluationSettings) {
  const evaluations = getCurrentVersionEvaluations(rule)
  const matrixStatus = rule.evaluationReplicationMatrix?.status ?? 'empty'
  const consistencyStatus = rule.evaluationConsistencyProfile?.status ?? 'insufficient'
  const versionCoverageStatus = rule.versionCoverageProfile?.status ?? 'covered'
  const maintenanceDue = isReplicationMaintenanceDue(rule, settings)
  const maintenanceRegression = hasMaintenanceRegression(rule)
  const recoveryObservation = hasRecoveryObservation(rule)
  return (
    versionCoverageStatus !== 'covered' ||
    evaluations.length < 2 ||
    rule.reviewStatus === 'watching' ||
    rule.reviewStatus === 'needsFix' ||
    rule.reusability === 'watch' ||
    matrixStatus === 'blocked' ||
    matrixStatus === 'incomplete' ||
    maintenanceRegression ||
    recoveryObservation ||
    maintenanceDue ||
    consistencyStatus === 'conflicting' ||
    consistencyStatus === 'drifting'
  )
}

function evaluationPriority(rule: ExperienceRule, settings: EvaluationSettings) {
  const evaluations = getCurrentVersionEvaluations(rule)
  const matrixStatus = rule.evaluationReplicationMatrix?.status ?? 'empty'
  const consistencyStatus = rule.evaluationConsistencyProfile?.status ?? 'insufficient'
  const versionCoverage = versionCoveragePriority(rule.versionCoverageProfile?.status)
  const maintenanceDue = isReplicationMaintenanceDue(rule, settings)
  const maintenanceRegression = maintenanceRegressionPriority(rule)
  const recoveryObservation = recoveryObservationPriority(rule)
  if (versionCoverage > 0) return 42 + versionCoverage / 10
  if (rule.reviewStatus === 'needsFix') return 40
  if (matrixStatus === 'blocked') return 38
  if (consistencyStatus === 'conflicting') return 36
  if (maintenanceRegression > 0) return maintenanceRegression
  if (recoveryObservation > 0) return recoveryObservation
  if (evaluations.length === 0) return 30
  if (rule.reviewStatus === 'watching' || rule.reusability === 'watch') return 20
  if (maintenanceDue) return maintenancePriorityValue(rule, settings)
  if (evaluations.length < 2) return 10
  if (matrixStatus === 'incomplete') return 8
  if (consistencyStatus === 'drifting') return 6
  return 0
}

function hasMaintenanceRegression(rule: ExperienceRule) {
  return unresolvedMaintenanceRegressions(rule).length > 0
}

function hasRecoveryObservation(rule: ExperienceRule) {
  return (rule.evaluationReplicationMatrix?.observingRecoveredSlots ?? 0) > 0
}

function recoveryObservationPriority(rule: ExperienceRule) {
  const observingSlots = rule.evaluationReplicationMatrix?.slots.filter((slot) => slot.recoveryObservationStatus === 'observing') ?? []
  if (observingSlots.length === 0) return 0
  return 24 + Math.min(4, observingSlots.length) + Math.max(0, ...observingSlots.map((slot) => focusMaintenancePriority(slot.focus) / 20))
}

function maintenanceRegressionPriority(rule: ExperienceRule) {
  const regressions = unresolvedMaintenanceRegressions(rule).map((item) => item.evaluation)
  if (regressions.some((evaluation) => evaluation.outcome === 'failed')) return 34
  if (regressions.some((evaluation) => evaluation.outcome === 'uncertain')) return 32
  return 0
}

function unresolvedMaintenanceRegressions(rule: ExperienceRule) {
  const latestByFocus = new Map<EvaluationPlanFocus, RuleEvaluation>()
  const fallback: Array<{ focus?: EvaluationPlanFocus; evaluation: RuleEvaluation }> = []

  const evaluations = getCurrentVersionEvaluations(rule)
    .map((evaluation, index) => ({ evaluation, index }))
    .sort((a, b) => {
      const timeDiff = new Date(b.evaluation.createdAt).getTime() - new Date(a.evaluation.createdAt).getTime()
      return timeDiff || a.index - b.index
    })

  for (const { evaluation } of evaluations) {
    const focus = evaluation.replicationSlotFocus ?? evaluation.planSnapshot?.focus ?? evaluation.protocolSnapshot?.focus
    if (!focus) {
      if (evaluation.cycle === 'maintenance') fallback.push({ evaluation })
      continue
    }

    if (!latestByFocus.has(focus)) {
      latestByFocus.set(focus, evaluation)
    }
  }

  const unresolved = Array.from(latestByFocus.entries())
    .filter(([, evaluation]) => evaluation.outcome !== 'passed' && hasMaintenanceRegressionSource(rule, evaluation))
    .map(([focus, evaluation]) => ({ focus, evaluation }))

  return [
    ...unresolved,
    ...fallback.filter((item) => item.evaluation.outcome !== 'passed'),
  ]
}

function latestEvaluationForFocus(rule: ExperienceRule, focus: EvaluationPlanFocus) {
  return getCurrentVersionEvaluations(rule)
    .filter((evaluation) => evaluationFocusOf(evaluation) === focus)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
}

function hasClosedMaintenanceRegressionForFocus(rule: ExperienceRule, focus: EvaluationPlanFocus) {
  const latest = latestEvaluationForFocus(rule, focus)
  if (!latest || latest.outcome !== 'passed') return false
  const latestTime = new Date(latest.createdAt).getTime()
  return getCurrentVersionEvaluations(rule).some((evaluation) => {
    if (evaluationFocusOf(evaluation) !== focus || evaluation.cycle !== 'maintenance' || evaluation.outcome === 'passed') return false
    return new Date(evaluation.createdAt).getTime() <= latestTime
  })
}

function evaluationFocusOf(evaluation: RuleEvaluation) {
  return evaluation.replicationSlotFocus ?? evaluation.planSnapshot?.focus ?? evaluation.protocolSnapshot?.focus
}

function hasMaintenanceRegressionSource(rule: ExperienceRule, latestEvaluation: RuleEvaluation) {
  const focus = evaluationFocusOf(latestEvaluation)
  if (!focus) return latestEvaluation.cycle === 'maintenance'
  const latestTime = new Date(latestEvaluation.createdAt).getTime()
  return getCurrentVersionEvaluations(rule).some((evaluation) => {
    const evaluationFocus = evaluationFocusOf(evaluation)
    if (evaluationFocus !== focus || evaluation.cycle !== 'maintenance' || evaluation.outcome === 'passed') return false
    return new Date(evaluation.createdAt).getTime() <= latestTime
  })
}

function createEvaluationObservation(rule: ExperienceRule, outcome: EvaluationOutcome, text: string): Observation | undefined {
  const content = text.trim()
  if (!content) return undefined

  const now = new Date().toISOString()
  return {
    id: createId('obs_eval'),
    text: content,
    category: rule.category,
    tags: ['复测', evaluationLabelFromOutcome(outcome)],
    summary: `用于验证规则“${rule.title}”的复测观察。`,
    status: 'success',
    createdAt: now,
    processedAt: now,
    ruleId: rule.id,
    location: rule.location,
  }
}

function evaluationLabelFromOutcome(outcome: EvaluationOutcome) {
  const map: Record<EvaluationOutcome, string> = {
    passed: '有效',
    failed: '无效',
    uncertain: '不确定',
  }
  return map[outcome]
}

function planFocusLabel(focus: EvaluationPlanFocus) {
  const map: Record<EvaluationPlanFocus, string> = {
    confirmation: '确认',
    boundary: '边界',
    contrast: '对照',
    expansion: '扩展',
  }
  return map[focus]
}

function scoreEvaluationCandidate(rule: ExperienceRule, scene: string, observations: Observation[]): EvaluationCandidate {
  const normalizedScene = normalizeText(scene)
  const sceneTokens = tokenize(scene)
  const currentEvidenceIds = uniqueValues(
    getCurrentVersionEvaluations(rule)
      .map((evaluation) => evaluation.observationId ?? '')
      .filter(Boolean),
  )
  const evidenceTexts = currentEvidenceIds
    .map((id) => observations.find((observation) => observation.id === id)?.text)
    .filter((value): value is string => Boolean(value))

  const fields = [
    { label: '标题', weight: 4, text: rule.title },
    { label: '结论', weight: 3, text: rule.conclusion },
    { label: '推荐行动', weight: 3, text: rule.recommendation },
    { label: '地点', weight: 3, text: rule.location ?? '' },
    { label: '适用条件', weight: 2, text: rule.conditions.join(' ') },
    { label: '证据', weight: 1, text: evidenceTexts.join(' ') },
  ]

  let score = 0
  const reasons: string[] = []

  for (const field of fields) {
    if (!field.text) continue
    const fieldText = normalizeText(field.text)
    const matched = sceneTokens.filter((token) => fieldText.includes(token))
    if (matched.length > 0) {
      score += matched.length * field.weight
      reasons.push(`${field.label}匹配：${uniqueValues(matched).slice(0, 3).join('、')}`)
    }

    if (fieldText && normalizedScene.includes(fieldText)) {
      score += field.weight * 2
    }
  }

  if (rule.reviewStatus === 'needsFix' || rule.evaluationVerdict === 'conflicted') {
    score += 3
    reasons.push('优先复核冲突规则')
  }

  if (getCurrentVersionEvaluations(rule).length < 2) {
    score += 2
    reasons.push('评估次数不足')
  }

  return {
    ruleId: rule.id,
    score,
    reasons: uniqueValues(reasons),
  }
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function tokenize(value: string) {
  const normalized = normalizeText(value)
  const tokens: string[] = normalized.match(/[a-z0-9]+|[\u4e00-\u9fa5]{2,}/g) ?? []
  const chineseChunks = tokens.flatMap((token: string) => {
    if (!/[\u4e00-\u9fa5]/.test(token) || token.length <= 4) return [token]
    const chunks: string[] = []
    for (let index = 0; index <= token.length - 2; index += 1) {
      chunks.push(token.slice(index, index + 2))
    }
    return [token, ...chunks]
  })
  return uniqueValues(chineseChunks.filter((token) => token.length >= 2))
}

function isEvaluationStale(rule: ExperienceRule, settings: EvaluationSettings) {
  if (rule.evaluationVerdict === 'supported' && rule.reusability === 'high') return false
  if (getCurrentVersionEvaluations(rule).length === 0) return true

  const staleDays =
    rule.evaluationVerdict === 'conflicted' || rule.reviewStatus === 'needsFix'
      ? settings.conflictReviewDays
      : settings.normalReviewDays
  const elapsedMs = Date.now() - getLastEvaluationTime(rule)
  return elapsedMs >= staleDays * 24 * 60 * 60 * 1000
}

function isReplicationMaintenanceDue(rule: ExperienceRule, settings: EvaluationSettings) {
  if (rule.evaluationReplicationMatrix?.status !== 'ready') return false
  return Date.now() - getReplicationMaintenanceBaseTime(rule) >= settings.replicationMaintenanceDays * 24 * 60 * 60 * 1000
}

function replicationMaintenanceInfoFor(rule: ExperienceRule, settings: EvaluationSettings) {
  if (rule.evaluationReplicationMatrix?.status !== 'ready') {
    return { due: false, overdueDays: 0, reason: '矩阵尚未就绪，优先补齐或处理阻断槽位。' }
  }

  const elapsedDays = Math.max(0, Math.floor((Date.now() - getReplicationMaintenanceBaseTime(rule)) / (24 * 60 * 60 * 1000)))
  const overdueDays = Math.max(0, elapsedDays - settings.replicationMaintenanceDays)
  const nextFocus = rule.evaluationReplicationMatrix.nextFocus
  const focusLabel = nextFocus ? planFocusLabel(nextFocus) : '推荐'

  if (overdueDays > 0) {
    return {
      due: true,
      overdueDays,
      reason: `矩阵已就绪但超过维护周期 ${overdueDays} 天，下一次抽样${focusLabel}槽位。`,
    }
  }

  return {
    due: false,
    overdueDays: 0,
    reason: `矩阵已就绪，距离下次维护还有 ${settings.replicationMaintenanceDays - elapsedDays} 天。`,
  }
}

function replicationSlotMaintenanceInfoFor(rule: ExperienceRule, focus: EvaluationPlanFocus, settings: EvaluationSettings) {
  const slot = rule.evaluationReplicationMatrix?.slots.find((item) => item.focus === focus)
  if (!slot) return { due: false, elapsedDays: 0, overdueDays: 0, reason: '未找到对应复测槽位。' }
  if (rule.evaluationReplicationMatrix?.status !== 'ready') {
    return {
      due: false,
      elapsedDays: 0,
      overdueDays: 0,
      reason: slot.summary,
    }
  }

  const baseTime = slot.latestEvaluatedAt ? new Date(slot.latestEvaluatedAt).getTime() : getLastEvaluationTime(rule)
  const elapsedDays = Math.max(0, Math.floor((Date.now() - baseTime) / (24 * 60 * 60 * 1000)))
  const overdueDays = Math.max(0, elapsedDays - settings.replicationMaintenanceDays)
  const focusLabel = planFocusLabel(focus)

  if (overdueDays > 0) {
    return {
      due: true,
      elapsedDays,
      overdueDays,
      reason: `${focusLabel}槽位已 ${elapsedDays} 天未维护，超期 ${overdueDays} 天。`,
    }
  }

  return {
    due: false,
    elapsedDays,
    overdueDays: 0,
    reason: `${focusLabel}槽位 ${elapsedDays} 天前维护，${settings.replicationMaintenanceDays - elapsedDays} 天后到期。`,
  }
}

function replicationMaintenanceOverdueDays(rule: ExperienceRule, settings: EvaluationSettings) {
  return replicationMaintenanceInfoFor(rule, settings).overdueDays
}

function maintenancePriorityValue(rule: ExperienceRule, settings: EvaluationSettings) {
  const health = replicationMaintenanceHealthFor(rule, settings)
  if (health.level === 'healthy') return 0
  return 12 + replicationMaintenanceHealthPriority(rule, settings) / 10 + Math.min(6, Math.floor(health.overdueDays / 7))
}

function replicationMaintenanceHealthPriority(rule: ExperienceRule, settings: EvaluationSettings) {
  return maintenanceHealthLevelPriority(replicationMaintenanceHealthFor(rule, settings).level)
}

function maintenanceHealthLevelPriority(level: EvaluationMaintenanceHealth) {
  const map: Record<EvaluationMaintenanceHealth, number> = {
    healthy: 0,
    due: 10,
    risk: 20,
    critical: 30,
  }
  return map[level]
}

function focusMaintenancePriority(focus: EvaluationPlanFocus) {
  const map: Record<EvaluationPlanFocus, number> = {
    boundary: 40,
    contrast: 30,
    expansion: 20,
    confirmation: 10,
  }
  return map[focus]
}

function maintenanceOutcomePriority(outcome: EvaluationOutcome) {
  const map: Record<EvaluationOutcome, number> = {
    failed: 30,
    uncertain: 20,
    passed: 10,
  }
  return map[outcome]
}

function replicationMaintenanceHealthFor(rule: ExperienceRule, settings: EvaluationSettings) {
  const matrix = rule.evaluationReplicationMatrix
  if (matrix?.status !== 'ready') {
    return {
      level: 'healthy' as EvaluationMaintenanceHealth,
      score: 0,
      dueSlotCount: 0,
      overdueDays: 0,
      reason: '矩阵尚未就绪，不进入维护健康分级。',
    }
  }

  const dueSlots = EVALUATION_PLAN_FOCUS_VALUES
    .map((focus) => ({ focus, info: replicationSlotMaintenanceInfoFor(rule, focus, settings) }))
    .filter((item) => item.info.due)
  const info = replicationMaintenanceInfoFor(rule, settings)
  const dueSlotCount = dueSlots.length
  const maxSlotOverdueDays = dueSlots.reduce((max, item) => Math.max(max, item.info.overdueDays), 0)
  const overdueDays = Math.max(info.overdueDays, maxSlotOverdueDays)
  const overdueCycles = settings.replicationMaintenanceDays <= 0 ? 0 : Math.floor(overdueDays / settings.replicationMaintenanceDays)
  const score = Math.min(100, dueSlotCount * 18 + overdueDays * 2 + overdueCycles * 12)
  let level: EvaluationMaintenanceHealth = 'healthy'

  if (dueSlotCount >= 4 || overdueCycles >= 2 || overdueDays >= settings.replicationMaintenanceDays * 2) {
    level = 'critical'
  } else if (dueSlotCount >= 2 || overdueCycles >= 1 || overdueDays >= settings.replicationMaintenanceDays) {
    level = 'risk'
  } else if (info.due || dueSlotCount > 0) {
    level = 'due'
  }

  const dueFocusLabel = dueSlots.map((item) => planFocusLabel(item.focus)).join('、')
  const reason =
    level === 'healthy'
      ? '矩阵维护健康，暂无到期槽位。'
      : `${dueSlotCount} 个槽位到期${dueFocusLabel ? `（${dueFocusLabel}）` : ''}，最大超期 ${overdueDays} 天。`

  return {
    level,
    score,
    dueSlotCount,
    overdueDays,
    reason,
  }
}

function getReplicationMaintenanceBaseTime(rule: ExperienceRule) {
  const nextFocus = rule.evaluationReplicationMatrix?.nextFocus
  const nextSlot = nextFocus ? rule.evaluationReplicationMatrix?.slots.find((slot) => slot.focus === nextFocus) : undefined
  const slotTime = nextSlot?.latestEvaluatedAt ? new Date(nextSlot.latestEvaluatedAt).getTime() : Number.NaN
  return Number.isFinite(slotTime) ? slotTime : getLastEvaluationTime(rule)
}

function getLastEvaluationTime(rule: ExperienceRule) {
  const timestamps = getCurrentVersionEvaluations(rule)
    .map((evaluation) => new Date(evaluation.createdAt).getTime())
    .filter((value) => Number.isFinite(value))

  if (timestamps.length === 0) {
    return new Date(rule.updatedAt).getTime()
  }

  return Math.max(...timestamps)
}

function escapeCsvCell(value: string) {
  const escaped = value.replace(/"/g, '""')
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped
}

function replicationSlotPrompt(rule: ExperienceRule, focus: EvaluationPlanFocus, slot: EvaluationReplicationSlot) {
  const focusMap: Record<EvaluationPlanFocus, string> = {
    confirmation: '确认当前规则在原始前提下是否仍成立。',
    boundary: '验证规则最容易失效的边界条件。',
    contrast: '对照有效与无效场景，找出区分条件。',
    expansion: '验证规则能否扩展到新的时间、地点或对象。',
  }

  const slotHint = slot.status === 'missing' ? '请补一条完整复测场景。' : `当前已完成 ${slot.completedCount}/${slot.requiredCount} 次。`
  const protocolHint = rule.evaluationProtocol ? `按协议焦点“${planFocusLabel(rule.evaluationProtocol.focus)}”执行。` : '先按槽位补足可重复样本。'
  return `${focusMap[focus]} ${slotHint}${protocolHint}`
}
