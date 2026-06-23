<script lang="ts">
import { defineComponent, h, ref } from 'vue'
import { useExperienceStore } from '../stores/experience'
import { reusabilityLabel } from '../services/aiAnalyzer'
import {
  formatTime, reviewLabel, evaluationLabel, evaluationSourceLabel, evaluationCycleLabel,
  protocolExecutionLabel, protocolComplianceStatusLabel, verdictLabel, confidenceLabel, trendLabel,
  adoptionLabel, gateStatusLabel, gateCheckStatusLabel, repeatabilityLevelLabel, sampleIndependenceLevelLabel,
  versionCoverageStatusLabel, consistencyStatusLabel, replicationMatrixStatusLabel, replicationSlotStatusLabel,
  maintenanceHealthLabel, boundarySeverityLabel, percentLabel, planPriorityLabel, planFocusLabel, scoreClass,
  latestAdoptionEvents, evaluationSummary,
} from '../services/ruleLabels'
import type { ExperienceRule, Observation, Feedback, EvaluationOutcome } from '../types/experience'

export default defineComponent({
  props: {
    rule: {
      type: Object as () => ExperienceRule,
      required: true,
    },
    evidence: {
      type: Array as () => Observation[],
      default: () => [],
    },
    compact: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['feedback', 'evaluate', 'apply-revision'],
  setup(props, { emit }) {
    const store = useExperienceStore()
    const evaluationNote = ref('')
    const evaluationObservation = ref('')
    const expanded = ref(false) // 评估矩阵默认折叠(复测/采用门槛/协议…),按需展开,首屏更短
    const button = (label: string, value: Feedback) =>
      h(
        'button',
        {
          class: ['feedback-button', props.rule.feedback === value ? 'selected' : ''],
          onClick: () => emit('feedback', props.rule.id, value),
        },
        label,
      )

    const evaluationButton = (label: string, value: EvaluationOutcome) =>
      h(
        'button',
        {
          class: ['evaluation-button', value],
          onClick: () => {
            emit('evaluate', props.rule.id, value, evaluationNote.value, evaluationObservation.value)
            evaluationNote.value = ''
            evaluationObservation.value = ''
          },
        },
        label,
      )

    return () =>
      h('view', { class: ['rule-card', props.compact ? 'compact' : ''] }, [
        h('view', { class: 'rule-head' }, [
          h('text', { class: 'badge' }, props.rule.category),
          h('view', { class: 'rule-meta' }, [
            h('text', { class: ['reuse', props.rule.reusability] }, `可复用度 ${reusabilityLabel(props.rule.reusability)}`),
            h('text', { class: ['review-badge', props.rule.reviewStatus ?? 'unreviewed'] }, reviewLabel(props.rule.reviewStatus)),
            h('text', { class: ['verdict-badge', props.rule.evaluationVerdict ?? 'insufficient'] }, verdictLabel(props.rule.evaluationVerdict)),
            h('text', { class: ['score-badge', scoreClass(props.rule.evaluationScore)] }, `稳定分 ${props.rule.evaluationScore ?? 0}`),
            h('text', { class: ['confidence-badge', props.rule.evaluationConfidence ?? 'low'] }, confidenceLabel(props.rule.evaluationConfidence)),
            h('text', { class: ['trend-badge', props.rule.evaluationTrend ?? 'unknown'] }, trendLabel(props.rule.evaluationTrend)),
            h('text', { class: ['adoption-badge', props.rule.adoptionDecision ?? 'retest'] }, adoptionLabel(props.rule.adoptionDecision)),
            h('text', { class: 'evidence-badge' }, `${props.rule.evidenceIds.length} 条证据`),
            h('text', { class: 'evidence-badge' }, `${props.rule.evaluations?.length ?? 0} 次评估`),
          ]),
        ]),
        h('text', { class: 'rule-title' }, props.rule.title),
        h('text', { class: 'rule-conclusion' }, props.rule.conclusion),
        h('view', { class: 'action-box' }, [h('text', { class: 'action-label' }, '推荐行动'), h('text', props.rule.recommendation)]),
        !props.compact &&
          h('view', { class: 'condition-list' }, [
            h('text', { class: 'mini-title' }, '适用条件'),
            ...props.rule.conditions.map((item) => h('text', { class: 'condition' }, item)),
          ]),
        !props.compact &&
          h('view', { class: 'condition-list' }, [
            h('text', { class: 'mini-title' }, '注意事项'),
            ...props.rule.warnings.map((item) => h('text', { class: 'condition muted' }, item)),
          ]),
        props.evidence.length > 0 &&
          h('view', { class: ['evidence-list', props.compact ? 'compact' : ''] }, [
            h('text', { class: 'mini-title' }, '证据记录'),
            ...props.evidence.slice(0, props.compact ? 1 : 3).map((item) =>
              h('text', { class: 'evidence-text' }, `${formatTime(item.createdAt)} ${item.text}`),
            ),
          ]),
        h(
          'button',
          { class: 'eval-toggle', onClick: () => { expanded.value = !expanded.value } },
          expanded.value ? '收起评估详情 ▲' : '展开评估详情(复测 / 采用门槛 / 协议)▼',
        ),
        expanded.value && h('view', { class: 'evaluation-panel' }, [
          h('text', { class: 'mini-title' }, '重复评估'),
          h('text', { class: 'evaluation-summary' }, evaluationSummary(props.rule.evaluations)),
          props.rule.repeatabilityProfile &&
            h('view', { class: ['repeatability-card', props.rule.repeatabilityProfile.level] }, [
              h('view', { class: 'repeatability-head' }, [
                h('text', { class: ['repeatability-badge', props.rule.repeatabilityProfile.level] }, `${repeatabilityLevelLabel(props.rule.repeatabilityProfile.level)} ${props.rule.repeatabilityProfile.score}`),
                h('text', { class: 'section-meta' }, `焦点 ${props.rule.repeatabilityProfile.focusCoverage}/4 / 独立 ${props.rule.sampleIndependenceProfile?.score ?? 0}`),
              ]),
              h('text', { class: 'repeatability-step' }, props.rule.repeatabilityProfile.nextRepeatableStep),
              props.rule.sampleIndependenceProfile &&
                props.rule.sampleIndependenceProfile.level !== 'independent' &&
                h('text', { class: 'repeatability-issue' }, `样本独立性：${sampleIndependenceLevelLabel(props.rule.sampleIndependenceProfile.level)}，${props.rule.sampleIndependenceProfile.nextIndependenceStep}`),
              ...props.rule.repeatabilityProfile.issueSummary.slice(0, props.compact ? 1 : 3).map((issue) =>
                h('text', { class: 'repeatability-issue' }, issue),
              ),
            ]),
          props.rule.evaluationConsistencyProfile &&
            h('view', { class: ['consistency-card', props.rule.evaluationConsistencyProfile.status] }, [
              h('view', { class: 'consistency-head' }, [
                h(
                  'text',
                  { class: ['consistency-badge', props.rule.evaluationConsistencyProfile.status] },
                  `${consistencyStatusLabel(props.rule.evaluationConsistencyProfile.status)} ${props.rule.evaluationConsistencyProfile.score}`,
                ),
                h('text', { class: 'section-meta' }, `一致率 ${percentLabel(props.rule.evaluationConsistencyProfile.agreementRate)} / 样本 ${props.rule.evaluationConsistencyProfile.scopedEvaluationCount}`),
              ]),
              h('text', { class: 'consistency-step' }, props.rule.evaluationConsistencyProfile.nextConsistencyStep),
              ...props.rule.evaluationConsistencyProfile.issueSummary.slice(0, props.compact ? 1 : 3).map((issue) =>
                h('text', { class: 'consistency-issue' }, issue),
              ),
            ]),
          props.rule.versionCoverageProfile &&
            h('view', { class: ['version-card', props.rule.versionCoverageProfile.status] }, [
              h('view', { class: 'repeatability-head' }, [
                h(
                  'text',
                  { class: ['version-badge', props.rule.versionCoverageProfile.status] },
                  `${versionCoverageStatusLabel(props.rule.versionCoverageProfile.status)} v${props.rule.versionCoverageProfile.currentVersion}`,
                ),
                h(
                  'text',
                  { class: 'section-meta' },
                  `当前 ${props.rule.versionCoverageProfile.currentVersionEvaluationCount} / 历史 ${props.rule.versionCoverageProfile.historicalEvaluationCount}`,
                ),
              ]),
              h('text', { class: 'repeatability-step' }, props.rule.versionCoverageProfile.nextVersionStep),
              ...props.rule.versionCoverageProfile.issueSummary.slice(0, props.compact ? 1 : 3).map((issue) =>
                h('text', { class: 'repeatability-issue' }, issue),
              ),
            ]),
          props.rule.protocolComplianceProfile &&
            h('view', { class: ['protocol-compliance-card', props.rule.protocolComplianceProfile.status] }, [
              h('view', { class: 'repeatability-head' }, [
                h(
                  'text',
                  { class: ['protocol-compliance-badge', props.rule.protocolComplianceProfile.status] },
                  `${protocolComplianceStatusLabel(props.rule.protocolComplianceProfile.status)} ${props.rule.protocolComplianceProfile.score}`,
                ),
                h(
                  'text',
                  { class: 'section-meta' },
                  `完整 ${props.rule.protocolComplianceProfile.completeExecutionCount} / 阻断 ${props.rule.protocolComplianceProfile.blockedExecutionCount}`,
                ),
              ]),
              h('text', { class: 'repeatability-step' }, props.rule.protocolComplianceProfile.nextProtocolStep),
              ...props.rule.protocolComplianceProfile.issueSummary.slice(0, props.compact ? 1 : 3).map((issue) =>
                h('text', { class: 'repeatability-issue' }, issue),
              ),
            ]),
          props.rule.evaluationReplicationMatrix &&
            h('view', { class: ['replication-card', props.rule.evaluationReplicationMatrix.status] }, [
              h('view', { class: 'replication-head' }, [
                h(
                  'text',
                  { class: ['replication-badge', props.rule.evaluationReplicationMatrix.status] },
                  `${replicationMatrixStatusLabel(props.rule.evaluationReplicationMatrix.status)} ${props.rule.evaluationReplicationMatrix.score}`,
                ),
                h(
                  'text',
                  { class: 'section-meta' },
                  `槽位 ${props.rule.evaluationReplicationMatrix.completedSlots}/${props.rule.evaluationReplicationMatrix.totalSlots}${
                    props.rule.evaluationReplicationMatrix.recoveredSlots > 0 ? ` / 恢复 ${props.rule.evaluationReplicationMatrix.recoveredSlots}` : ''
                  }${
                    props.rule.evaluationReplicationMatrix.observingRecoveredSlots > 0 ? ` / 观察 ${props.rule.evaluationReplicationMatrix.observingRecoveredSlots}` : ''
                  }`,
                ),
              ]),
              h('view', { class: 'replication-slots' }, [
                ...props.rule.evaluationReplicationMatrix.slots.map((slot) =>
                  h(
                    'text',
                    { class: ['replication-slot', slot.status] },
                    `${planFocusLabel(slot.focus)} ${slot.completedCount}/${slot.requiredCount} ${
                      slot.recoveryObservationStatus === 'observing'
                        ? '观察中'
                        : slot.recoverySummary
                          ? '已恢复'
                          : replicationSlotStatusLabel(slot.status)
                    }`,
                  ),
                ),
              ]),
              props.rule.evaluationReplicationMatrix.nextFocus &&
                h('text', { class: 'replication-step' }, `推荐下一槽位：${planFocusLabel(props.rule.evaluationReplicationMatrix.nextFocus)}`),
              props.rule.evaluationReplicationMatrix.status === 'ready' &&
                store.replicationMaintenanceInfo(props.rule).due &&
                h(
                  'text',
                  { class: ['replication-maintenance-badge', store.replicationMaintenanceHealth(props.rule).level] },
                  maintenanceHealthLabel(store.replicationMaintenanceHealth(props.rule).level),
                ),
              props.rule.evaluationReplicationMatrix.status === 'ready' &&
                h('text', { class: 'replication-maintenance-reason' }, store.replicationMaintenanceHealth(props.rule).reason),
              h('text', { class: 'replication-step' }, props.rule.evaluationReplicationMatrix.nextMatrixStep),
            ]),
          props.rule.evaluationProtocol &&
            h('view', { class: 'protocol-card' }, [
              h('view', { class: 'protocol-head' }, [
                h('text', { class: ['plan-priority', props.rule.evaluationPlan?.priority ?? 'low'] }, planPriorityLabel(props.rule.evaluationPlan?.priority)),
                h('text', { class: 'section-meta' }, `${planFocusLabel(props.rule.evaluationProtocol.focus)} / ${props.rule.evaluationProtocol.cadenceDays} 天内`),
              ]),
              h('text', { class: 'mini-title' }, '复测协议'),
              h('text', { class: 'protocol-line' }, `有效：${props.rule.evaluationProtocol.passCriteria[0]}`),
              h('text', { class: 'protocol-line' }, `无效：${props.rule.evaluationProtocol.failCriteria[0]}`),
              h('text', { class: 'protocol-line' }, `不确定：${props.rule.evaluationProtocol.uncertainCriteria[0]}`),
              ...props.rule.evaluationProtocol.requiredEvidence.slice(0, props.compact ? 1 : 3).map((item) =>
                h('text', { class: 'protocol-evidence' }, `证据：${item}`),
              ),
            ]),
          (props.rule.boundaryCatalog?.length ?? 0) > 0 &&
            h('view', { class: 'boundary-card' }, [
              h('view', { class: 'boundary-head' }, [
                h('text', { class: ['boundary-badge', props.rule.boundaryCatalog?.[0]?.severity ?? 'unknown'] }, boundarySeverityLabel(props.rule.boundaryCatalog?.[0]?.severity)),
                h('text', { class: 'section-meta' }, `${props.rule.boundaryCatalog?.length ?? 0} 条反例/边界`),
              ]),
              ...[...(props.rule.boundaryCatalog ?? [])].slice(0, props.compact ? 1 : 3).map((boundary) =>
                h('view', { class: 'boundary-case' }, [
                  h('text', { class: 'boundary-text' }, boundary.hypothesis),
                  h('text', { class: 'boundary-text' }, boundary.suggestedConstraint),
                ]),
              ),
            ]),
          props.rule.revisionDraft &&
            h('view', { class: 'revision-card' }, [
              h('view', { class: 'revision-head' }, [
                h('text', { class: ['plan-priority', props.rule.revisionDraft.priority] }, planPriorityLabel(props.rule.revisionDraft.priority)),
                h('text', { class: 'section-meta' }, `v${props.rule.revisionVersion ?? 0} / ${props.rule.revisionDraft.suggestedConstraints.length} 条约束`),
              ]),
              h('text', { class: 'mini-title' }, '修订草案'),
              h('text', { class: 'revision-text' }, props.rule.revisionDraft.reason),
              h('text', { class: 'revision-text' }, `结论：${props.rule.revisionDraft.conclusion}`),
              h('text', { class: 'revision-text' }, `行动：${props.rule.revisionDraft.recommendation}`),
              ...props.rule.revisionDraft.suggestedConstraints.slice(0, props.compact ? 1 : 3).map((constraint) =>
                h('text', { class: 'revision-text' }, `约束：${constraint}`),
              ),
              h(
                'button',
                {
                  class: 'ghost-button revision-apply-button',
                  onClick: () => emit('apply-revision', props.rule.id),
                },
                '应用草案',
              ),
            ]),
          (props.rule.revisionHistory?.length ?? 0) > 0 &&
            h('view', { class: 'revision-history' }, [
              h('view', { class: 'revision-head' }, [
                h('text', { class: 'mini-title' }, '修订历史'),
                h('text', { class: 'section-meta' }, `当前 v${props.rule.revisionVersion ?? 0}`),
              ]),
              ...[...(props.rule.revisionHistory ?? [])].slice(0, props.compact ? 1 : 2).map((record) =>
                h('view', { class: 'revision-record' }, [
                  h('text', { class: 'revision-text' }, `v${record.version} ${formatTime(record.appliedAt)}：${record.reason}`),
                  h('text', { class: 'revision-text muted' }, `行动：${record.newRecommendation}`),
                ]),
              ),
            ]),
          props.rule.revisionSuggestion &&
            h('text', { class: ['revision-suggestion', props.rule.evaluationVerdict ?? 'insufficient'] }, props.rule.revisionSuggestion),
          props.rule.nextEvaluationAction &&
            h('text', { class: ['next-action', props.rule.evaluationTrend ?? 'unknown'] }, props.rule.nextEvaluationAction),
          props.rule.adoptionReason &&
            h('text', { class: ['adoption-reason', props.rule.adoptionDecision ?? 'retest'] }, props.rule.adoptionReason),
          props.rule.adoptionGate &&
            h('view', { class: ['gate-card', props.rule.adoptionGate.status] }, [
              h('view', { class: 'gate-card-head' }, [
                h('text', { class: ['gate-badge', props.rule.adoptionGate.status] }, gateStatusLabel(props.rule.adoptionGate.status)),
                h('text', { class: 'section-meta' }, `${props.rule.adoptionGate.blockers.length} 阻断 / ${props.rule.adoptionGate.warnings.length} 提醒`),
              ]),
              ...props.rule.adoptionGate.checks.slice(0, props.compact ? 2 : 5).map((check) =>
                h('view', { class: ['gate-check', check.status] }, [
                  h('text', { class: 'gate-check-title' }, `${check.label} / ${gateCheckStatusLabel(check.status)}`),
                  h('text', { class: 'gate-check-detail' }, check.detail),
                ]),
              ),
            ]),
          (props.rule.adoptionTimeline?.length ?? 0) > 0 &&
            h('view', { class: 'adoption-timeline' }, [
              h('text', { class: 'mini-title' }, '采用变化'),
              ...latestAdoptionEvents(props.rule, props.compact ? 1 : 3).map((event) =>
                h('view', { class: 'adoption-event' }, [
                  h('view', { class: 'adoption-event-head' }, [
                    h('text', { class: ['adoption-badge', event.decision] }, adoptionLabel(event.decision)),
                    h('text', { class: 'section-meta' }, `${formatTime(event.createdAt)} / 第 ${event.evaluationCount} 次评估`),
                  ]),
                  h('text', { class: 'adoption-event-reason' }, event.reason),
                ]),
              ),
            ]),
          props.rule.evaluationPlan &&
            h('view', { class: ['rule-plan', props.rule.evaluationPlan.priority] }, [
              h('view', { class: 'plan-top' }, [
                h('text', { class: ['plan-priority', props.rule.evaluationPlan.priority] }, planPriorityLabel(props.rule.evaluationPlan.priority)),
                h('text', { class: 'section-meta' }, `${planFocusLabel(props.rule.evaluationPlan.focus)} / ${props.rule.evaluationPlan.reviewAfterDays} 天内`),
              ]),
              h('text', { class: 'plan-text' }, props.rule.evaluationPlan.scenarioPrompt),
              h('text', { class: 'plan-evidence' }, props.rule.evaluationPlan.evidencePrompt),
            ]),
          h('input', {
            class: 'evaluation-note-input',
            value: evaluationObservation.value,
            placeholder: '写本次复测观察，比如：这周六10点健身房仍然不用排队',
            onInput: (event: Event) => {
              evaluationObservation.value = (event.target as HTMLInputElement).value
            },
          }),
          h('input', {
            class: 'evaluation-note-input',
            value: evaluationNote.value,
            placeholder: '补充说明，比如：节假日人流异常',
            onInput: (event: Event) => {
              evaluationNote.value = (event.target as HTMLInputElement).value
            },
          }),
          h('view', { class: 'evaluation-row' }, [
            evaluationButton('复测有效', 'passed'),
            evaluationButton('复测无效', 'failed'),
            evaluationButton('不确定', 'uncertain'),
          ]),
          ...(props.rule.evaluations ?? []).slice(0, props.compact ? 1 : 3).map((item) =>
            h(
              'view',
              { class: ['evaluation-text', item.outcome] },
              [
                h(
                  'text',
                  { class: 'evaluation-line' },
                  `${formatTime(item.createdAt)} ${evaluationLabel(item.outcome)} / ${[evaluationSourceLabel(item.source), evaluationCycleLabel(item.cycle)].filter(Boolean).join(' / ')}：${item.observationText ? item.observationText + '；' : ''}${item.note}`,
                ),
                item.planSnapshot &&
                  h(
                    'text',
                    { class: 'evaluation-plan-snapshot' },
                    `${planFocusLabel(item.planSnapshot.focus)}：${item.planSnapshot.reason}`,
                  ),
                item.protocolSnapshot &&
                  h(
                    'text',
                    { class: 'evaluation-plan-snapshot' },
                    `协议：${planFocusLabel(item.protocolSnapshot.focus)} / ${item.protocolSnapshot.title}`,
                  ),
                item.protocolExecution &&
                  h('view', { class: 'protocol-execution-summary' }, [
                    h(
                      'text',
                      { class: ['protocol-execution-badge', item.protocolExecution.status] },
                      `${protocolExecutionLabel(item.protocolExecution.status)} ${item.protocolExecution.score}`,
                    ),
                    h('text', { class: 'evaluation-plan-snapshot' }, item.protocolExecution.summary),
                  ]),
                item.replicationSlotFocus &&
                  h('text', { class: 'evaluation-plan-snapshot' }, `槽位：${planFocusLabel(item.replicationSlotFocus)}`),
              ],
            ),
          ),
        ]),
        h('view', { class: 'feedback-row' }, [
          button('有用', 'useful'),
          button('待观察', 'watch'),
          button('不准确', 'inaccurate'),
        ]),
      ])
  },
})
</script>
