export type ExperienceCategory =
  | '饮食'
  | '购物'
  | '出行'
  | '运动'
  | '工作'
  | '生活'
  | '偏好'
  | '其他'

export type ProcessStatus = 'pending' | 'success' | 'failed'
export type Reusability = 'high' | 'medium' | 'low' | 'watch'
export type Feedback = 'useful' | 'watch' | 'inaccurate' | 'none'
export type RuleReviewStatus = 'unreviewed' | 'validated' | 'watching' | 'needsFix'
export type EvaluationOutcome = 'passed' | 'failed' | 'uncertain'
export type EvaluationVerdict = 'insufficient' | 'supported' | 'mixed' | 'conflicted'
export type EvaluationConfidence = 'low' | 'medium' | 'high'
export type EvaluationTrend = 'unknown' | 'improving' | 'declining' | 'flat'
export type EvaluationPlanPriority = 'high' | 'medium' | 'low'
export type EvaluationPlanFocus = 'confirmation' | 'boundary' | 'contrast' | 'expansion'
export type EvaluationSource = 'manual' | 'recall' | 'plan'
export type EvaluationCycle = 'fill' | 'maintenance'
export type EvaluationAdoptionDecision = 'adopt' | 'limit' | 'retest' | 'repair' | 'suspend'
export type EvaluationGateStatus = 'ready' | 'attention' | 'blocked'
export type EvaluationGateCheckStatus = 'passed' | 'warning' | 'blocked'
export type EvaluationRepeatabilityLevel = 'weak' | 'developing' | 'repeatable'
export type EvaluationSampleIndependenceLevel = 'weak' | 'clustered' | 'independent'
export type EvaluationVersionCoverageStatus = 'unretested' | 'partial' | 'covered'
export type EvaluationProtocolComplianceStatus = 'empty' | 'blocked' | 'partial' | 'aligned'
export type EvaluationBoundarySeverity = 'critical' | 'watch' | 'unknown'
export type EvaluationProtocolExecutionStatus = 'complete' | 'partial' | 'blocked'
export type EvaluationConsistencyStatus = 'insufficient' | 'stable' | 'drifting' | 'conflicting'
export type EvaluationReplicationSlotStatus = 'missing' | 'partial' | 'complete' | 'conflicted'
export type EvaluationReplicationMatrixStatus = 'empty' | 'incomplete' | 'ready' | 'blocked'
export type EvaluationMaintenanceHealth = 'healthy' | 'due' | 'risk' | 'critical'

export interface AdoptionDecisionEvent {
  id: string
  evaluationId?: string
  createdAt: string
  decision: EvaluationAdoptionDecision
  reason: string
  evaluationCount: number
}

export interface EvaluationGateCheck {
  id: string
  label: string
  status: EvaluationGateCheckStatus
  detail: string
}

export interface EvaluationAdoptionGate {
  status: EvaluationGateStatus
  ready: boolean
  targetDecision: EvaluationAdoptionDecision
  checks: EvaluationGateCheck[]
  blockers: string[]
  warnings: string[]
}

export interface EvaluationRepeatabilityProfile {
  score: number
  level: EvaluationRepeatabilityLevel
  decisiveRate: number
  evidenceRate: number
  plannedRate: number
  focusCoverage: number
  sampleIndependenceScore: number
  sampleIndependenceLevel: EvaluationSampleIndependenceLevel
  issueSummary: string[]
  nextRepeatableStep: string
}

export interface EvaluationSampleIndependenceProfile {
  score: number
  level: EvaluationSampleIndependenceLevel
  independentDayCount: number
  independentScenarioCount: number
  duplicateScenarioCount: number
  maxSameDayCount: number
  maxSameScenarioCount: number
  issueSummary: string[]
  nextIndependenceStep: string
}

export interface EvaluationVersionCoverageProfile {
  status: EvaluationVersionCoverageStatus
  currentVersion: number
  currentVersionEvaluationCount: number
  historicalEvaluationCount: number
  currentVersionDecisiveCount: number
  issueSummary: string[]
  nextVersionStep: string
}

export interface EvaluationProtocolComplianceProfile {
  status: EvaluationProtocolComplianceStatus
  score: number
  currentVersionEvaluationCount: number
  completeExecutionCount: number
  partialExecutionCount: number
  blockedExecutionCount: number
  missingSnapshotCount: number
  missingExecutionCount: number
  focusMismatchCount: number
  issueSummary: string[]
  nextProtocolStep: string
}

export interface EvaluationFocusConsistency {
  focus: EvaluationPlanFocus
  total: number
  passed: number
  failed: number
  uncertain: number
  agreementRate: number
  dominantOutcome?: Extract<EvaluationOutcome, 'passed' | 'failed'>
}

export interface EvaluationConsistencyProfile {
  status: EvaluationConsistencyStatus
  score: number
  agreementRate: number
  scopedEvaluationCount: number
  conflictingFocuses: EvaluationPlanFocus[]
  focusSummaries: EvaluationFocusConsistency[]
  issueSummary: string[]
  nextConsistencyStep: string
}

export interface EvaluationReplicationSlot {
  focus: EvaluationPlanFocus
  requiredCount: number
  completedCount: number
  decisiveCount: number
  completeProtocolCount: number
  status: EvaluationReplicationSlotStatus
  latestEvaluatedAt?: string
  recoveredConflictCount?: number
  recoveryObservationStatus?: 'observing' | 'cleared'
  recoveryObservationPassedCount?: number
  recoveryObservationRequiredCount?: number
  recoverySummary?: string
  summary: string
}

export interface EvaluationReplicationMatrix {
  status: EvaluationReplicationMatrixStatus
  score: number
  ready: boolean
  completedSlots: number
  totalSlots: number
  recoveredSlots: number
  recoveryFocuses: EvaluationPlanFocus[]
  observingRecoveredSlots: number
  recoveryObservationFocuses: EvaluationPlanFocus[]
  missingFocuses: EvaluationPlanFocus[]
  conflictingFocuses: EvaluationPlanFocus[]
  nextFocus?: EvaluationPlanFocus
  slots: EvaluationReplicationSlot[]
  nextMatrixStep: string
}

export interface EvaluationProtocol {
  id: string
  focus: EvaluationPlanFocus
  title: string
  scenario: string
  passCriteria: string[]
  failCriteria: string[]
  uncertainCriteria: string[]
  requiredEvidence: string[]
  cadenceDays: number
}

export interface EvaluationProtocolSnapshot {
  focus: EvaluationPlanFocus
  title: string
  scenario: string
  passCriteria: string[]
  failCriteria: string[]
  uncertainCriteria: string[]
  requiredEvidence: string[]
  cadenceDays: number
}

export interface EvaluationProtocolExecutionCheck {
  id: string
  label: string
  status: EvaluationGateCheckStatus
  detail: string
}

export interface EvaluationProtocolExecution {
  status: EvaluationProtocolExecutionStatus
  score: number
  checkedAt: string
  matchedCriteria: string[]
  missingEvidence: string[]
  checks: EvaluationProtocolExecutionCheck[]
  summary: string
}

export interface EvaluationBoundaryCase {
  id: string
  evaluationId: string
  createdAt: string
  outcome: Extract<EvaluationOutcome, 'failed' | 'uncertain'>
  severity: EvaluationBoundarySeverity
  focus?: EvaluationPlanFocus
  scenario: string
  hypothesis: string
  suggestedConstraint: string
  evidenceStatus: 'complete' | 'incomplete'
}

export interface RuleRevisionDraft {
  id: string
  createdAt: string
  priority: EvaluationPlanPriority
  reason: string
  title: string
  conclusion: string
  recommendation: string
  keptConditions: string[]
  suggestedConstraints: string[]
  excludedScenarios: string[]
  evidenceIds: string[]
}

export interface RuleRevisionRecord {
  id: string
  draftId: string
  appliedAt: string
  version: number
  reason: string
  previousConclusion: string
  previousRecommendation: string
  previousConditions: string[]
  previousWarnings: string[]
  newConclusion: string
  newRecommendation: string
  newConditions: string[]
  newWarnings: string[]
  evidenceIds: string[]
}

export interface EvaluationPlanSnapshot {
  priority: EvaluationPlanPriority
  focus: EvaluationPlanFocus
  scenarioPrompt: string
  evidencePrompt: string
  reason: string
}

export interface RuleEvaluation {
  id: string
  outcome: EvaluationOutcome
  note: string
  createdAt: string
  observationId?: string
  observationText?: string
  source?: EvaluationSource
  cycle?: EvaluationCycle
  ruleVersion?: number
  replicationSlotFocus?: EvaluationPlanFocus
  planSnapshot?: EvaluationPlanSnapshot
  protocolSnapshot?: EvaluationProtocolSnapshot
  protocolExecution?: EvaluationProtocolExecution
}

export interface EvaluationCandidate {
  ruleId: string
  score: number
  reasons: string[]
}

export interface EvaluationSettings {
  normalReviewDays: number
  conflictReviewDays: number
  replicationMaintenanceDays: number
}

export interface EvaluationImportResult {
  importedRules: number
  mergedRules: number
  importedObservations: number
  mergedEvaluations: number
  skippedRules: number
  skippedObservations: number
  skippedEvaluations: number
  updatedSettings: boolean
}

export interface EvaluationPlan {
  priority: EvaluationPlanPriority
  focus: EvaluationPlanFocus
  scenarioPrompt: string
  evidencePrompt: string
  reviewAfterDays: number
  reason: string
}

export type ObservationSentiment = 'positive' | 'neutral' | 'negative'

export interface Observation {
  id: string
  text: string
  category: ExperienceCategory
  tags: string[]
  summary: string
  status: ProcessStatus
  createdAt: string
  processedAt?: string
  ruleId?: string
  location?: string
  sentiment?: ObservationSentiment   // 由 inferDirection 映射,可选
}

export interface ExperienceRule {
  id: string
  title: string
  category: ExperienceCategory
  conclusion: string
  recommendation: string
  conditions: string[]
  warnings: string[]
  evidenceIds: string[]
  reusability: Reusability
  feedback: Feedback
  reviewStatus?: RuleReviewStatus
  evaluations?: RuleEvaluation[]
  evaluationVerdict?: EvaluationVerdict
  evaluationScore?: number
  evaluationConfidence?: EvaluationConfidence
  evaluationTrend?: EvaluationTrend
  nextEvaluationAction?: string
  adoptionDecision?: EvaluationAdoptionDecision
  adoptionReason?: string
  adoptionTimeline?: AdoptionDecisionEvent[]
  adoptionGate?: EvaluationAdoptionGate
  repeatabilityProfile?: EvaluationRepeatabilityProfile
  sampleIndependenceProfile?: EvaluationSampleIndependenceProfile
  versionCoverageProfile?: EvaluationVersionCoverageProfile
  protocolComplianceProfile?: EvaluationProtocolComplianceProfile
  evaluationConsistencyProfile?: EvaluationConsistencyProfile
  evaluationReplicationMatrix?: EvaluationReplicationMatrix
  evaluationProtocol?: EvaluationProtocol
  boundaryCatalog?: EvaluationBoundaryCase[]
  revisionDraft?: RuleRevisionDraft
  revisionHistory?: RuleRevisionRecord[]
  revisionVersion?: number
  evaluationPlan?: EvaluationPlan
  revisionSuggestion?: string
  lastEvaluatedAt?: string
  updatedAt: string
  location?: string
}

export interface AnalysisResult {
  category: ExperienceCategory
  tags: string[]
  summary: string
  title: string
  conclusion: string
  recommendation: string
  conditions: string[]
  warnings: string[]
  reusability: Reusability
  location?: string
}

export interface DemoSample {
  text: string
  label: string
}
