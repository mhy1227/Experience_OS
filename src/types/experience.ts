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
// 经验种类(与方向正交):正向策略 / 负向避坑 / 信息不足待观察
export type ExperienceKind = 'strategy' | 'caution' | 'watch'
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
  kind?: ExperienceKind
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
  kind?: ExperienceKind
  location?: string
}

export interface DemoSample {
  text: string
  label: string
}

// ─── M3 规律发现 ───────────────────────────────────────────────────────────

/** 洞察维度:按哪个维度聚类产出 */
export type ClusterDimension = 'category' | 'tag' | 'sentiment' | 'rootCause'

/** 洞察类型:描述归因模式的语义分类 */
export type InsightType =
  | 'sentiment_pattern'   // 情绪倾向集中
  | 'root_cause_pattern'  // 共同根因归因
  | 'tag_pattern'         // 标签共现
  | 'category_pattern'    // 分类集中

/** 洞察置信度:由样本量和归因方式决定 */
export type InsightConfidence = 'low' | 'medium' | 'high'

/** InsightStatus:生命周期状态 */
export type InsightStatus = 'active' | 'archived' | 'dismissed'

/**
 * Insight — M3 规律发现的核心产出单元
 * 对应设计文档 §4 exp_insights 表
 */
export interface Insight {
  /** 唯一 ID,格式 ins_{timestamp}_{random} */
  id: string
  /** 洞察维度 */
  dimension: ClusterDimension
  /** 洞察类型 */
  type: InsightType
  /** 一句话标题(统计生成或模型命名) */
  title: string
  /** 摘要描述,支持百分比表述如"38 条里 80% 指向同一根因" */
  summary: string
  /** 归因根因(模型归因时填写,纯统计时为空字符串) */
  rootCause: string
  /** 命中观察数 / 总观察数,如 0.8 */
  percentage: number
  /** 置信度(由 MIN_CLUSTER_SIZE 门槛决定) */
  confidence: InsightConfidence
  /** 支撑证据的 observationId 列表 */
  evidenceObservationIds: string[]
  /** 决策建议(模型生成或统计模板) */
  suggestion: string
  /** 洞察时间窗口描述,如"过去 90 天" */
  timeWindow: string
  /** 生成方式 */
  generatedBy: 'statistical' | 'model_enhanced'
  /** 状态 */
  status: InsightStatus
  /** 生成时间 ISO 字符串 */
  createdAt: string
  /** 聚类键(如具体的 category 值或 tag 值) */
  clusterKey: string
  /** 聚类内观察总数 */
  clusterSize: number
}
