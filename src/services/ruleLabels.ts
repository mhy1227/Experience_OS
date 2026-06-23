// 规则/评估的纯展示 helper(label 映射 + 格式化 + 纯派生)。从 index.vue 抽出,供 RuleCard.vue 与页面共用。
import type {
  Feedback, RuleReviewStatus, EvaluationOutcome, RuleEvaluation,
  EvaluationProtocolComplianceStatus, EvaluationVerdict, EvaluationConfidence, EvaluationTrend,
  EvaluationAdoptionDecision, EvaluationGateStatus, EvaluationGateCheckStatus,
  EvaluationRepeatabilityLevel, EvaluationSampleIndependenceLevel, EvaluationVersionCoverageStatus,
  EvaluationConsistencyStatus, EvaluationReplicationMatrixStatus, EvaluationReplicationSlotStatus,
  EvaluationMaintenanceHealth, EvaluationBoundarySeverity, EvaluationPlanPriority, EvaluationPlanFocus,
  ExperienceRule, AdoptionDecisionEvent,
} from '../types/experience'

export function formatTime(value: string) {
  const date = new Date(value)
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

export function feedbackLabel(value: Feedback) {
  const map: Record<Feedback, string> = {
    useful: '有用',
    watch: '待观察',
    inaccurate: '不准确',
    none: '未反馈',
  }
  return map[value]
}

export function reviewLabel(value: RuleReviewStatus | undefined) {
  const map: Record<RuleReviewStatus, string> = {
    unreviewed: '未反馈',
    validated: '已验证',
    watching: '继续观察',
    needsFix: '待修正',
  }
  return map[value ?? 'unreviewed']
}

export function evaluationLabel(value: EvaluationOutcome) {
  const map: Record<EvaluationOutcome, string> = {
    passed: '有效',
    failed: '无效',
    uncertain: '不确定',
  }
  return map[value]
}

export function evaluationSourceLabel(value: RuleEvaluation['source']) {
  const map: Record<NonNullable<RuleEvaluation['source']>, string> = {
    manual: '手动',
    recall: '召回',
    plan: '计划',
  }
  return map[value ?? 'manual']
}

export function evaluationCycleLabel(value: RuleEvaluation['cycle']) {
  const map: Record<NonNullable<RuleEvaluation['cycle']>, string> = {
    fill: '补矩阵',
    maintenance: '维护抽样',
  }
  return value ? map[value] : ''
}

export function protocolExecutionLabel(value: NonNullable<RuleEvaluation['protocolExecution']>['status'] | undefined) {
  const map: Record<NonNullable<RuleEvaluation['protocolExecution']>['status'], string> = {
    complete: '完整',
    partial: '待补',
    blocked: '阻断',
  }
  return map[value ?? 'blocked']
}

export function protocolComplianceStatusLabel(value: EvaluationProtocolComplianceStatus | undefined) {
  const map: Record<EvaluationProtocolComplianceStatus, string> = {
    empty: '未执行',
    blocked: '协议阻断',
    partial: '协议待补',
    aligned: '协议一致',
  }
  return map[value ?? 'empty']
}

export function verdictLabel(value: EvaluationVerdict | undefined) {
  const map: Record<EvaluationVerdict, string> = {
    insufficient: '证据不足',
    supported: '已支持',
    mixed: '结果分歧',
    conflicted: '存在冲突',
  }
  return map[value ?? 'insufficient']
}

export function confidenceLabel(value: EvaluationConfidence | undefined) {
  const map: Record<EvaluationConfidence, string> = {
    low: '低置信',
    medium: '中置信',
    high: '高置信',
  }
  return map[value ?? 'low']
}

export function trendLabel(value: EvaluationTrend | undefined) {
  const map: Record<EvaluationTrend, string> = {
    unknown: '趋势不足',
    improving: '趋势增强',
    declining: '趋势走弱',
    flat: '趋势平稳',
  }
  return map[value ?? 'unknown']
}

export function adoptionLabel(value: EvaluationAdoptionDecision | undefined) {
  const map: Record<EvaluationAdoptionDecision, string> = {
    adopt: '可采用',
    limit: '限制使用',
    retest: '继续复测',
    repair: '先补证据',
    suspend: '暂停采用',
  }
  return map[value ?? 'retest']
}

export function gateStatusLabel(value: EvaluationGateStatus | undefined) {
  const map: Record<EvaluationGateStatus, string> = {
    ready: '门槛通过',
    attention: '需要关注',
    blocked: '存在阻断',
  }
  return map[value ?? 'attention']
}

export function gateCheckStatusLabel(value: EvaluationGateCheckStatus | undefined) {
  const map: Record<EvaluationGateCheckStatus, string> = {
    passed: '通过',
    warning: '提醒',
    blocked: '阻断',
  }
  return map[value ?? 'warning']
}

export function repeatabilityLevelLabel(value: EvaluationRepeatabilityLevel | undefined) {
  const map: Record<EvaluationRepeatabilityLevel, string> = {
    weak: '弱复现',
    developing: '建设中',
    repeatable: '可复现',
  }
  return map[value ?? 'weak']
}

export function sampleIndependenceLevelLabel(value: EvaluationSampleIndependenceLevel | undefined) {
  const map: Record<EvaluationSampleIndependenceLevel, string> = {
    weak: '独立性弱',
    clustered: '样本聚集',
    independent: '样本独立',
  }
  return map[value ?? 'weak']
}

export function versionCoverageStatusLabel(value: EvaluationVersionCoverageStatus | undefined) {
  const map: Record<EvaluationVersionCoverageStatus, string> = {
    unretested: '未复测',
    partial: '复测不足',
    covered: '已覆盖',
  }
  return map[value ?? 'covered']
}

export function consistencyStatusLabel(value: EvaluationConsistencyStatus | undefined) {
  const map: Record<EvaluationConsistencyStatus, string> = {
    insufficient: '样本不足',
    stable: '稳定一致',
    drifting: '结果漂移',
    conflicting: '同焦点冲突',
  }
  return map[value ?? 'insufficient']
}

export function replicationMatrixStatusLabel(value: EvaluationReplicationMatrixStatus | undefined) {
  const map: Record<EvaluationReplicationMatrixStatus, string> = {
    empty: '未开始',
    incomplete: '未完成',
    ready: '矩阵就绪',
    blocked: '矩阵阻断',
  }
  return map[value ?? 'empty']
}

export function replicationSlotStatusLabel(value: EvaluationReplicationSlotStatus | undefined) {
  const map: Record<EvaluationReplicationSlotStatus, string> = {
    missing: '缺样本',
    partial: '待补',
    complete: '完成',
    conflicted: '冲突',
  }
  return map[value ?? 'missing']
}

export function maintenanceHealthLabel(value: EvaluationMaintenanceHealth | undefined) {
  const map: Record<EvaluationMaintenanceHealth, string> = {
    healthy: '维护健康',
    due: '维护到期',
    risk: '维护风险',
    critical: '维护严重',
  }
  return map[value ?? 'healthy']
}

export function boundarySeverityLabel(value: EvaluationBoundarySeverity | undefined) {
  const map: Record<EvaluationBoundarySeverity, string> = {
    critical: '关键反例',
    watch: '待收窄',
    unknown: '证据不足',
  }
  return map[value ?? 'unknown']
}

export function percentLabel(value: number | undefined) {
  return `${Math.round((value ?? 0) * 100)}%`
}

export function planPriorityLabel(value: EvaluationPlanPriority | undefined) {
  const map: Record<EvaluationPlanPriority, string> = {
    high: '高优先',
    medium: '中优先',
    low: '低优先',
  }
  return map[value ?? 'low']
}

export function planFocusLabel(value: EvaluationPlanFocus | undefined) {
  const map: Record<EvaluationPlanFocus, string> = {
    confirmation: '确认复测',
    boundary: '边界复测',
    contrast: '对照复测',
    expansion: '扩展复测',
  }
  return map[value ?? 'confirmation']
}

export function scoreClass(value: number | undefined) {
  const score = value ?? 0
  if (score >= 75) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}

export function latestAdoptionEvents(rule: ExperienceRule, limit: number): AdoptionDecisionEvent[] {
  return [...(rule.adoptionTimeline ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit)
}

export function gateIssues(rule: ExperienceRule) {
  return [...(rule.adoptionGate?.blockers ?? []), ...(rule.adoptionGate?.warnings ?? [])]
}

export function evaluationSummary(evaluations: RuleEvaluation[] | undefined) {
  const items = evaluations ?? []
  const passed = items.filter((item) => item.outcome === 'passed').length
  const failed = items.filter((item) => item.outcome === 'failed').length
  const uncertain = items.filter((item) => item.outcome === 'uncertain').length
  return `${items.length} 次评估：${passed} 有效 / ${failed} 无效 / ${uncertain} 不确定`
}
