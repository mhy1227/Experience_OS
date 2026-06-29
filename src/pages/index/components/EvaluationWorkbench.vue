<!-- 高级面板:评估工作台(评估体系 UI)。默认隐藏,自带 store + 评估相关 ref/handler。 -->
<template>
        <view class="advanced-panel-notice">
          <text class="advanced-panel-label">高级面板(评估体系)</text>
          <text class="advanced-panel-desc">该功能已从主路径移至此处,代码完整保留,可继续使用。</text>
        </view>
        <view class="section-head">
          <text class="section-title">评估工作台</text>
          <text class="section-meta">{{ store.evaluationQueue.length }} 条待复测</text>
        </view>
        <view class="utility-actions evaluation-tools">
          <button class="ghost-button" @click="openEvaluationImport">
            导入历史数据
          </button>
          <input
            ref="evaluationFileInput"
            class="file-input"
            type="file"
            accept="application/json,.json"
            @change="handleEvaluationImport"
          />
          <button class="ghost-button" :disabled="store.evaluationStats.total === 0" @click="downloadEvaluationData">
            导出评估数据
          </button>
          <button class="ghost-button" :disabled="store.rules.length === 0" @click="downloadEvaluationCsv">
            导出 CSV
          </button>
        </view>
        <text v-if="evaluationImportMessage" class="import-message">{{ evaluationImportMessage }}</text>
        <view class="review-settings">
          <label class="setting-field">
            <text class="setting-label">普通复查周期</text>
            <input
              class="setting-input"
              type="number"
              :value="store.evaluationSettings.normalReviewDays"
              @input="updateReviewDays('normalReviewDays', $event)"
            />
          </label>
          <label class="setting-field">
            <text class="setting-label">冲突复查周期</text>
            <input
              class="setting-input"
              type="number"
              :value="store.evaluationSettings.conflictReviewDays"
              @input="updateReviewDays('conflictReviewDays', $event)"
            />
          </label>
          <label class="setting-field">
            <text class="setting-label">矩阵维护周期</text>
            <input
              class="setting-input"
              type="number"
              :value="store.evaluationSettings.replicationMaintenanceDays"
              @input="updateReviewDays('replicationMaintenanceDays', $event)"
            />
          </label>
        </view>
        <details class="analytics-fold">
          <summary class="analytics-summary">评估指标与画像（{{ store.rules.length }} 条规则的全量分析，点击展开）</summary>
        <view class="evaluation-dashboard">
          <view>
            <text class="stat-value">{{ store.evaluationAnalysis.averageScore }}</text>
            <text class="stat-label">平均稳定分</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationStats.passed }}</text>
            <text class="stat-label">有效</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationStats.failed }}</text>
            <text class="stat-label">无效</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationStats.uncertain }}</text>
            <text class="stat-label">不确定</text>
          </view>
          <view>
            <text class="stat-value">{{ store.conflictedRuleCount }}</text>
            <text class="stat-label">冲突规则</text>
          </view>
          <view>
            <text class="stat-value">{{ store.staleEvaluationRules.length }}</text>
            <text class="stat-label">需复查</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationAnalysis.highConfidence }}</text>
            <text class="stat-label">高置信</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationAnalysis.declining }}</text>
            <text class="stat-label">趋势走弱</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationAnalysis.actionable }}</text>
            <text class="stat-label">可行动</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationStats.plan }}</text>
            <text class="stat-label">计划执行</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationCoverage.planExecutionRate }}%</text>
            <text class="stat-label">执行率</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationCoverage.coveredFocusCount }}/4</text>
            <text class="stat-label">覆盖焦点</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationQuality.qualityScore }}</text>
            <text class="stat-label">样本质量分</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationQuality.weakEvaluationCount }}</text>
            <text class="stat-label">薄弱评估</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationQuality.completeProtocolExecution }}</text>
            <text class="stat-label">协议完整</text>
          </view>
          <view>
            <text class="stat-value">{{ protocolBlockedRuleCount }}</text>
            <text class="stat-label">协议阻断</text>
          </view>
          <view>
            <text class="stat-value">{{ repeatabilityAverage }}</text>
            <text class="stat-label">可重复分</text>
          </view>
          <view>
            <text class="stat-value">{{ sampleIndependenceAverage }}</text>
            <text class="stat-label">独立样本分</text>
          </view>
          <view>
            <text class="stat-value">{{ weakSampleIndependenceCount }}</text>
            <text class="stat-label">独立性弱</text>
          </view>
          <view>
            <text class="stat-value">{{ store.versionCoverageStats.blockedRuleCount }}</text>
            <text class="stat-label">版本待复测</text>
          </view>
          <view>
            <text class="stat-value">{{ store.versionCoverageStats.historicalEvaluationCount }}</text>
            <text class="stat-label">历史审计样本</text>
          </view>
          <view>
            <text class="stat-value">{{ consistencyConflictCount }}</text>
            <text class="stat-label">一致冲突</text>
          </view>
          <view>
            <text class="stat-value">{{ replicationReadyCount }}</text>
            <text class="stat-label">矩阵就绪</text>
          </view>
          <view>
            <text class="stat-value">{{ store.replicationMaintenanceStats.dueRuleCount }}</text>
            <text class="stat-label">维护到期</text>
          </view>
          <view>
            <text class="stat-value">{{ store.replicationMaintenanceStats.dueSlotCount }}</text>
            <text class="stat-label">到期槽位</text>
          </view>
          <view>
            <text class="stat-value">{{ store.replicationMaintenanceStats.criticalRuleCount }}</text>
            <text class="stat-label">维护严重</text>
          </view>
          <view>
            <text class="stat-value">{{ store.replicationMaintenanceStats.riskRuleCount }}</text>
            <text class="stat-label">维护风险</text>
          </view>
          <view>
            <text class="stat-value">{{ store.replicationMaintenanceStats.maintenanceEvaluationCount }}</text>
            <text class="stat-label">维护样本</text>
          </view>
          <view>
            <text class="stat-value">{{ store.replicationMaintenanceStats.regressionCount }}</text>
            <text class="stat-label">未解决回归</text>
          </view>
          <view>
            <text class="stat-value">{{ store.replicationMaintenanceStats.recoveryCount }}</text>
            <text class="stat-label">恢复复核</text>
          </view>
          <view>
            <text class="stat-value">{{ store.repeatabilityQueue.length }}</text>
            <text class="stat-label">画像规则</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationAnalysis.adoptionCounts.adopt }}</text>
            <text class="stat-label">可采用</text>
          </view>
          <view>
            <text class="stat-value">{{ store.evaluationAnalysis.adoptionCounts.suspend }}</text>
            <text class="stat-label">暂停采用</text>
          </view>
        </view>
        <view v-if="store.adoptionDecisionQueue.length > 0" class="adoption-panel">
          <view class="section-head">
            <text class="section-title">采用决策</text>
            <text class="section-meta">{{ store.rules.length }} 条规则</text>
          </view>
          <view class="adoption-grid">
            <view v-for="group in store.adoptionDecisionQueue" :key="group.decision" class="adoption-group">
              <view class="adoption-group-head">
                <text :class="['adoption-badge', group.decision]">{{ adoptionLabel(group.decision) }}</text>
                <text class="section-meta">{{ group.rules.length }} 条</text>
              </view>
              <view v-for="rule in group.rules.slice(0, 3)" :key="rule.id" class="adoption-rule">
                <text class="adoption-rule-title">{{ rule.title }}</text>
                <text class="adoption-rule-reason">{{ rule.adoptionReason }}</text>
              </view>
            </view>
          </view>
        </view>
        <view v-if="store.adoptionGateQueue.length > 0" class="gate-panel">
          <view class="section-head">
            <text class="section-title">采用门槛</text>
            <text class="section-meta">{{ store.adoptionGateQueue.length }} 条需处理</text>
          </view>
          <view v-for="rule in store.adoptionGateQueue.slice(0, 5)" :key="rule.id" class="gate-item">
            <view class="gate-item-head">
              <view class="gate-badges">
                <text :class="['gate-badge', rule.adoptionGate?.status ?? 'attention']">{{ gateStatusLabel(rule.adoptionGate?.status) }}</text>
                <text :class="['adoption-badge', rule.adoptionDecision ?? 'retest']">{{ adoptionLabel(rule.adoptionDecision) }}</text>
              </view>
              <text class="section-meta">{{ rule.adoptionGate?.blockers.length ?? 0 }} 阻断 / {{ rule.adoptionGate?.warnings.length ?? 0 }} 提醒</text>
            </view>
            <text class="gate-rule-title">{{ rule.title }}</text>
            <text v-for="item in gateIssues(rule).slice(0, 2)" :key="item" class="gate-rule-issue">{{ item }}</text>
          </view>
        </view>
        <view v-if="store.repeatabilityQueue.length > 0" class="repeatability-panel">
          <view class="section-head">
            <text class="section-title">可重复性画像</text>
            <text class="section-meta">低分优先</text>
          </view>
          <view v-for="rule in store.repeatabilityQueue.slice(0, 5)" :key="rule.id" class="repeatability-item">
            <view class="repeatability-head">
              <text :class="['repeatability-badge', rule.repeatabilityProfile?.level ?? 'weak']">
                {{ repeatabilityLevelLabel(rule.repeatabilityProfile?.level) }} {{ rule.repeatabilityProfile?.score ?? 0 }}
              </text>
              <text class="section-meta">
                明确 {{ percentLabel(rule.repeatabilityProfile?.decisiveRate) }} / 独立 {{ rule.sampleIndependenceProfile?.score ?? 0 }}
              </text>
            </view>
            <text class="repeatability-title">{{ rule.title }}</text>
            <text class="repeatability-step">{{ rule.repeatabilityProfile?.nextRepeatableStep }}</text>
            <text v-if="rule.sampleIndependenceProfile?.level !== 'independent'" class="repeatability-issue">
              样本独立性：{{ sampleIndependenceLevelLabel(rule.sampleIndependenceProfile?.level) }}，{{ rule.sampleIndependenceProfile?.nextIndependenceStep }}
            </text>
          </view>
        </view>
        <view v-if="store.consistencyQueue.length > 0" class="consistency-panel">
          <view class="section-head">
            <text class="section-title">一致性画像</text>
            <text class="section-meta">{{ store.consistencyQueue.length }} 条</text>
          </view>
          <view v-for="rule in store.consistencyQueue.slice(0, 5)" :key="rule.id" class="consistency-item">
            <view class="consistency-head">
              <text :class="['consistency-badge', rule.evaluationConsistencyProfile?.status ?? 'insufficient']">
                {{ consistencyStatusLabel(rule.evaluationConsistencyProfile?.status) }} {{ rule.evaluationConsistencyProfile?.score ?? 0 }}
              </text>
              <text class="section-meta">
                一致率 {{ percentLabel(rule.evaluationConsistencyProfile?.agreementRate) }} / 样本 {{ rule.evaluationConsistencyProfile?.scopedEvaluationCount ?? 0 }}
              </text>
            </view>
            <text class="consistency-title">{{ rule.title }}</text>
            <text v-if="(rule.evaluationConsistencyProfile?.conflictingFocuses.length ?? 0) > 0" class="consistency-issue">
              冲突焦点：{{ rule.evaluationConsistencyProfile?.conflictingFocuses.map(planFocusLabel).join('、') }}
            </text>
            <text class="consistency-step">{{ rule.evaluationConsistencyProfile?.nextConsistencyStep }}</text>
          </view>
        </view>
        <view v-if="store.replicationMaintenanceBacklog.length > 0" class="replication-panel">
          <view class="section-head">
            <text class="section-title">维护槽位待办</text>
            <text class="section-meta">{{ store.replicationMaintenanceBacklog.length }} 个槽位</text>
          </view>
          <view v-for="item in store.replicationMaintenanceBacklog.slice(0, 6)" :key="`${item.rule.id}_${item.focus}`" class="replication-item">
            <view class="replication-head">
              <view class="gate-badges">
                <text :class="['replication-maintenance-badge', item.health.level]">{{ maintenanceHealthLabel(item.health.level) }}</text>
                <text :class="['replication-slot', item.slot.status]">{{ planFocusLabel(item.focus) }}</text>
              </view>
              <text class="section-meta">超期 {{ item.info.overdueDays }} 天</text>
            </view>
            <text class="replication-title">{{ item.rule.title }}</text>
            <text class="replication-step">{{ item.info.reason }}</text>
            <text class="replication-slot-summary">{{ item.slot.summary }}</text>
            <view class="replication-slot-actions">
              <button class="evaluation-button passed" @click="store.evaluateReplicationSlot(item.rule.id, item.focus, 'passed')">
                维护有效
              </button>
              <button class="evaluation-button failed" @click="store.evaluateReplicationSlot(item.rule.id, item.focus, 'failed')">
                维护无效
              </button>
              <button class="evaluation-button uncertain" @click="store.evaluateReplicationSlot(item.rule.id, item.focus, 'uncertain')">
                维护不确定
              </button>
            </view>
          </view>
        </view>
        <view v-if="store.maintenanceRegressionQueue.length > 0" class="replication-panel">
          <view class="section-head">
            <text class="section-title">未解决维护回归</text>
            <text class="section-meta">{{ store.maintenanceRegressionQueue.length }} 条待关闭</text>
          </view>
          <view v-for="item in store.maintenanceRegressionQueue.slice(0, 6)" :key="item.evaluation.id" class="replication-item">
            <view class="replication-head">
              <view class="gate-badges">
                <text :class="['evaluation-result-badge', item.evaluation.outcome]">{{ evaluationLabel(item.evaluation.outcome) }}</text>
                <text v-if="item.focus" :class="['replication-slot', 'conflicted']">{{ planFocusLabel(item.focus) }}</text>
              </view>
              <text class="section-meta">{{ formatTime(item.evaluation.createdAt) }}</text>
            </view>
            <text class="replication-title">{{ item.rule.title }}</text>
            <text class="replication-step">{{ item.evaluation.note }}</text>
            <text v-if="item.evaluation.observationText" class="replication-slot-summary">{{ item.evaluation.observationText }}</text>
            <view v-if="item.focus" class="replication-slot-actions">
              <button class="evaluation-button passed" @click="store.evaluateReplicationSlot(item.rule.id, item.focus, 'passed')">
                回归复测有效
              </button>
              <button class="evaluation-button failed" @click="store.evaluateReplicationSlot(item.rule.id, item.focus, 'failed')">
                回归复测无效
              </button>
              <button class="evaluation-button uncertain" @click="store.evaluateReplicationSlot(item.rule.id, item.focus, 'uncertain')">
                回归复测不确定
              </button>
            </view>
          </view>
        </view>
        <view v-if="store.regressionRecoveryQueue.length > 0" class="replication-panel">
          <view class="section-head">
            <text class="section-title">回归恢复复核</text>
            <text class="section-meta">{{ store.regressionRecoveryQueue.length }} 个槽位</text>
          </view>
          <view v-for="item in store.regressionRecoveryQueue.slice(0, 6)" :key="`${item.rule.id}_${item.focus}_${item.latestEvaluation.id}`" class="replication-item">
            <view class="replication-head">
              <view class="gate-badges">
                <text class="replication-maintenance-badge healthy">回归已关闭</text>
                <text :class="['replication-slot', 'conflicted']">{{ planFocusLabel(item.focus) }}</text>
              </view>
              <text class="section-meta">{{ formatTime(item.latestEvaluation.createdAt) }}</text>
            </view>
            <text class="replication-title">{{ item.rule.title }}</text>
            <text class="replication-step">{{ item.reason }}</text>
            <view class="replication-slot-actions">
              <button class="evaluation-button passed" @click="store.evaluateReplicationSlot(item.rule.id, item.focus, 'passed')">
                恢复复核有效
              </button>
              <button class="evaluation-button failed" @click="store.evaluateReplicationSlot(item.rule.id, item.focus, 'failed')">
                仍然无效
              </button>
              <button class="evaluation-button uncertain" @click="store.evaluateReplicationSlot(item.rule.id, item.focus, 'uncertain')">
                继续观察
              </button>
            </view>
          </view>
        </view>
        <view v-if="store.replicationMatrixQueue.length > 0" class="replication-panel">
          <view class="section-head">
            <text class="section-title">复测矩阵</text>
            <text class="section-meta">{{ store.replicationMatrixQueue.length }} 条</text>
          </view>
          <view v-for="rule in store.replicationMatrixQueue.slice(0, 5)" :key="rule.id" class="replication-item">
            <view class="replication-head">
              <text :class="['replication-badge', rule.evaluationReplicationMatrix?.status ?? 'empty']">
                {{ replicationMatrixStatusLabel(rule.evaluationReplicationMatrix?.status) }} {{ rule.evaluationReplicationMatrix?.score ?? 0 }}
              </text>
              <text class="section-meta">
                槽位 {{ rule.evaluationReplicationMatrix?.completedSlots ?? 0 }}/{{ rule.evaluationReplicationMatrix?.totalSlots ?? 4 }}
                <text v-if="(rule.evaluationReplicationMatrix?.recoveredSlots ?? 0) > 0" class="replication-maintenance-badge healthy">
                  恢复 {{ rule.evaluationReplicationMatrix?.recoveredSlots }}
                </text>
                <text v-if="(rule.evaluationReplicationMatrix?.observingRecoveredSlots ?? 0) > 0" class="replication-maintenance-badge due">
                  观察 {{ rule.evaluationReplicationMatrix?.observingRecoveredSlots }}
                </text>
              </text>
            </view>
            <text class="replication-title">{{ rule.title }}</text>
            <view v-if="rule.evaluationReplicationMatrix?.nextFocus" class="replication-next-actions">
              <text class="replication-slot-summary">
                推荐下一槽位：{{ planFocusLabel(rule.evaluationReplicationMatrix.nextFocus) }}
                <text
                  v-if="store.replicationMaintenanceInfo(rule).due"
                  :class="['replication-maintenance-badge', store.replicationMaintenanceHealth(rule).level]"
                >
                  {{ maintenanceHealthLabel(store.replicationMaintenanceHealth(rule).level) }}
                </text>
              </text>
              <text v-if="rule.evaluationReplicationMatrix.status === 'ready'" class="replication-maintenance-reason">
                {{ store.replicationMaintenanceHealth(rule).reason }}
              </text>
              <view class="replication-slot-actions">
                <button class="evaluation-button passed" @click="store.evaluateNextReplicationSlot(rule.id, 'passed')">
                  {{ rule.evaluationReplicationMatrix.status === 'ready' ? '维护有效' : '推荐有效' }}
                </button>
                <button class="evaluation-button failed" @click="store.evaluateNextReplicationSlot(rule.id, 'failed')">
                  {{ rule.evaluationReplicationMatrix.status === 'ready' ? '维护无效' : '推荐无效' }}
                </button>
                <button class="evaluation-button uncertain" @click="store.evaluateNextReplicationSlot(rule.id, 'uncertain')">
                  {{ rule.evaluationReplicationMatrix.status === 'ready' ? '维护不确定' : '推荐不确定' }}
                </button>
              </view>
            </view>
            <view class="replication-slots">
              <text
                v-for="slot in rule.evaluationReplicationMatrix?.slots ?? []"
                :key="slot.focus"
                :class="['replication-slot', slot.status]"
              >
                {{ planFocusLabel(slot.focus) }} {{ slot.completedCount }}/{{ slot.requiredCount }}
              </text>
            </view>
            <view class="replication-actions">
              <view v-for="slot in rule.evaluationReplicationMatrix?.slots ?? []" :key="`${rule.id}_${slot.focus}`" class="replication-slot-card">
                <text class="replication-slot-summary">{{ slot.summary }}</text>
                <text v-if="slot.recoverySummary" class="replication-maintenance-reason">
                  {{ slot.recoverySummary }}
                  <text class="replication-maintenance-badge healthy">冲突已恢复</text>
                </text>
                <text v-if="rule.evaluationReplicationMatrix?.status === 'ready'" class="replication-maintenance-reason">
                  {{ store.replicationSlotMaintenanceInfo(rule, slot.focus).reason }}
                  <text
                    v-if="store.replicationSlotMaintenanceInfo(rule, slot.focus).due"
                    :class="['replication-maintenance-badge', store.replicationMaintenanceHealth(rule).level]"
                  >
                    槽位到期
                  </text>
                </text>
                <view class="replication-slot-actions">
                  <button class="evaluation-button passed" :disabled="rule.evaluationReplicationMatrix?.status !== 'ready' && slot.status === 'complete'" @click="store.evaluateReplicationSlot(rule.id, slot.focus, 'passed')">
                    {{ rule.evaluationReplicationMatrix?.status === 'ready' ? '维护有效' : '复测有效' }}
                  </button>
                  <button class="evaluation-button failed" :disabled="rule.evaluationReplicationMatrix?.status !== 'ready' && slot.status === 'complete'" @click="store.evaluateReplicationSlot(rule.id, slot.focus, 'failed')">
                    {{ rule.evaluationReplicationMatrix?.status === 'ready' ? '维护无效' : '复测无效' }}
                  </button>
                  <button class="evaluation-button uncertain" :disabled="rule.evaluationReplicationMatrix?.status !== 'ready' && slot.status === 'complete'" @click="store.evaluateReplicationSlot(rule.id, slot.focus, 'uncertain')">
                    {{ rule.evaluationReplicationMatrix?.status === 'ready' ? '维护不确定' : '不确定' }}
                  </button>
                </view>
              </view>
            </view>
            <text class="replication-step">{{ rule.evaluationReplicationMatrix?.nextMatrixStep }}</text>
          </view>
        </view>
        <view v-if="store.evaluationProtocolQueue.length > 0" class="protocol-panel">
          <view class="section-head">
            <text class="section-title">复测协议</text>
            <text class="section-meta">{{ store.evaluationProtocolQueue.length }} 条</text>
          </view>
          <view v-for="rule in store.evaluationProtocolQueue.slice(0, 5)" :key="rule.id" class="protocol-item">
            <view class="protocol-head">
              <text :class="['plan-priority', rule.evaluationPlan?.priority ?? 'low']">{{ planPriorityLabel(rule.evaluationPlan?.priority) }}</text>
              <text class="section-meta">{{ planFocusLabel(rule.evaluationProtocol?.focus) }} / {{ rule.evaluationProtocol?.cadenceDays }} 天内</text>
            </view>
            <text class="protocol-title">{{ rule.title }}</text>
            <text class="protocol-line">有效：{{ rule.evaluationProtocol?.passCriteria[0] }}</text>
            <text class="protocol-line">证据：{{ rule.evaluationProtocol?.requiredEvidence[0] }}</text>
          </view>
        </view>
        <view v-if="store.protocolExecutionQueue.length > 0" class="protocol-execution-panel">
          <view class="section-head">
            <text class="section-title">协议执行</text>
            <text class="section-meta">{{ store.protocolExecutionQueue.length }} 条需审计</text>
          </view>
          <view v-for="item in store.protocolExecutionQueue.slice(0, 5)" :key="item.evaluation.id" class="protocol-execution-item">
            <view class="protocol-head">
              <text class="protocol-title">{{ item.rule.title }}</text>
              <view class="protocol-badges">
                <text :class="['protocol-execution-badge', item.evaluation.protocolExecution?.status ?? 'blocked']">
                  {{ protocolExecutionLabel(item.evaluation.protocolExecution?.status) }} {{ item.evaluation.protocolExecution?.score ?? 0 }}
                </text>
                <text class="section-meta">{{ formatTime(item.evaluation.createdAt) }} {{ evaluationLabel(item.evaluation.outcome) }}</text>
              </view>
            </view>
            <text v-if="item.evaluation.protocolExecution" class="protocol-line">{{ item.evaluation.protocolExecution.summary }}</text>
            <text v-if="item.evaluation.replicationSlotFocus" class="protocol-line">
              槽位：{{ planFocusLabel(item.evaluation.replicationSlotFocus) }}
            </text>
            <text class="protocol-line">{{ item.issues.join('；') }}</text>
          </view>
        </view>
        <view v-if="store.boundaryCatalogQueue.length > 0" class="boundary-panel">
          <view class="section-head">
            <text class="section-title">反例边界</text>
            <text class="section-meta">{{ store.boundaryCatalogQueue.length }} 条</text>
          </view>
          <view v-for="item in store.boundaryCatalogQueue.slice(0, 5)" :key="item.boundary.id" class="boundary-item">
            <view class="boundary-head">
              <text :class="['boundary-badge', item.boundary.severity]">{{ boundarySeverityLabel(item.boundary.severity) }}</text>
              <text class="section-meta">{{ formatTime(item.boundary.createdAt) }} {{ evaluationLabel(item.boundary.outcome) }}</text>
            </view>
            <text class="boundary-title">{{ item.rule.title }}</text>
            <text class="boundary-text">{{ item.boundary.hypothesis }}</text>
            <text class="boundary-text">{{ item.boundary.suggestedConstraint }}</text>
          </view>
        </view>
        <view v-if="store.revisionDraftQueue.length > 0" class="revision-panel">
          <view class="section-head">
            <text class="section-title">修订草案</text>
            <text class="section-meta">{{ store.revisionDraftQueue.length }} 条</text>
          </view>
          <view v-for="rule in store.revisionDraftQueue.slice(0, 5)" :key="rule.id" class="revision-item">
            <view class="revision-head">
              <text :class="['plan-priority', rule.revisionDraft?.priority ?? 'low']">{{ planPriorityLabel(rule.revisionDraft?.priority) }}</text>
              <text class="section-meta">v{{ rule.revisionVersion ?? 0 }} / {{ rule.boundaryCatalog?.length ?? 0 }} 条边界</text>
            </view>
            <text class="revision-title">{{ rule.title }}</text>
            <text class="revision-text">{{ rule.revisionDraft?.reason }}</text>
            <text class="revision-text">{{ rule.revisionDraft?.recommendation }}</text>
            <button class="ghost-button revision-apply-button" @click="applyRevisionDraft(rule.id)">应用草案</button>
          </view>
        </view>
        <view v-if="store.adoptionTimelineQueue.length > 0" class="decision-timeline-panel">
          <view class="section-head">
            <text class="section-title">决策变化</text>
            <text class="section-meta">{{ store.adoptionTimelineQueue.length }} 次变化</text>
          </view>
          <view v-for="item in store.adoptionTimelineQueue.slice(0, 6)" :key="item.event.id" class="decision-change">
            <view class="decision-change-head">
              <text :class="['adoption-badge', item.event.decision]">{{ adoptionLabel(item.event.decision) }}</text>
              <text class="section-meta">{{ formatTime(item.event.createdAt) }} / 第 {{ item.event.evaluationCount }} 次评估</text>
            </view>
            <text class="decision-change-title">{{ item.rule.title }}</text>
            <text class="decision-change-reason">{{ item.event.reason }}</text>
          </view>
        </view>
        <view class="coverage-panel">
          <view class="section-head">
            <text class="section-title">复测覆盖度</text>
            <text class="section-meta">{{ coverageGapLabel }}</text>
          </view>
          <view class="coverage-grid">
            <view v-for="focus in planFocuses" :key="focus" class="coverage-item">
              <text class="coverage-name">{{ planFocusLabel(focus) }}</text>
              <text class="coverage-value">
                已执行 {{ store.evaluationCoverage.completedFocusCounts[focus] }} / 计划 {{ store.evaluationCoverage.activePlanFocusCounts[focus] }} / 到期维护 {{ store.replicationMaintenanceStats.dueFocusCounts[focus] }}
              </text>
            </view>
          </view>
        </view>
        <view v-if="store.evaluationQuality.weakEvaluations.length > 0" class="quality-panel">
          <view class="section-head">
            <text class="section-title">样本质量</text>
            <text class="section-meta">需补证据 {{ store.evaluationQuality.weakEvaluationCount }} 条</text>
          </view>
          <view v-for="item in store.evaluationQuality.weakEvaluations" :key="item.evaluationId" class="quality-item">
            <view class="quality-top">
              <text class="quality-rule">{{ item.ruleTitle }}</text>
              <text class="section-meta">{{ formatTime(item.createdAt) }} {{ evaluationLabel(item.outcome) }}</text>
            </view>
            <text class="quality-reason">{{ item.reasons.join('；') }}</text>
            <view v-if="item.reasons.includes('缺少复测场景') || item.reasons.includes('未绑定观察证据')" class="quality-fix">
              <input
                class="quality-input"
                :value="evidenceDrafts[item.evaluationId] ?? ''"
                placeholder="补充这次复测的具体场景"
                @input="updateEvidenceDraft(item.evaluationId, $event)"
              />
              <button class="ghost-button" :disabled="!(evidenceDrafts[item.evaluationId] ?? '').trim()" @click="attachEvaluationEvidence(item.ruleId, item.evaluationId)">
                补证据
              </button>
            </view>
          </view>
        </view>
        <view v-if="store.staleEvaluationRules.length > 0" class="stale-panel">
          <view class="section-head">
            <text class="section-title">复查提醒</text>
            <text class="section-meta">{{ store.staleEvaluationRules.length }} 条</text>
          </view>
          <text v-for="rule in store.staleEvaluationRules.slice(0, 4)" :key="rule.id" class="stale-item">
            {{ rule.title }}：{{ rule.revisionSuggestion || '长期未复测，建议补充一次新场景评估。' }}
          </text>
        </view>
        <view v-if="store.evaluationPlanQueue.length > 0" class="plan-panel">
          <view class="section-head">
            <text class="section-title">复测计划</text>
            <text class="section-meta">{{ store.evaluationPlanQueue.length }} 条</text>
          </view>
          <view v-for="rule in store.evaluationPlanQueue.slice(0, 5)" :key="rule.id" class="plan-item">
            <view class="plan-top">
              <text :class="['plan-priority', rule.evaluationPlan?.priority ?? 'low']">
                {{ planPriorityLabel(rule.evaluationPlan?.priority) }}
              </text>
              <text class="section-meta">{{ rule.evaluationPlan?.reviewAfterDays }} 天内</text>
            </view>
            <text class="plan-title">{{ rule.title }}</text>
            <text class="plan-text">{{ rule.evaluationPlan?.scenarioPrompt }}</text>
            <text class="plan-reason">{{ rule.evaluationPlan?.reason }}</text>
          </view>
        </view>
        <view class="boundary-note">优先复测待观察、待修正、评估少于 2 次的规则。</view>
        </details>
        <view class="recall-box">
          <input v-model="recallScene" class="search-input" placeholder="输入新场景，召回可复测规则" />
          <button class="ghost-button" @click="recallCandidates">匹配规则</button>
        </view>
        <view v-if="recallScene.trim() && recalledRules.length === 0" class="empty">没有召回候选规则。</view>
        <view v-if="recalledRules.length > 0" class="recall-results">
          <view class="section-head">
            <text class="section-title">召回候选</text>
            <text class="section-meta">{{ recalledRules.length }} 条规则</text>
          </view>
          <view v-for="{ rule, candidate } in recalledRules" :key="rule.id" class="recall-card">
            <text class="recall-score">匹配分 {{ candidate.score }}</text>
            <text class="recall-reason">{{ candidate.reasons.join('；') }}</text>
            <view class="recall-actions">
              <button class="evaluation-button passed" @click="evaluateRecalled(rule.id, 'passed')">用此场景标记有效</button>
              <button class="evaluation-button failed" @click="evaluateRecalled(rule.id, 'failed')">用此场景标记无效</button>
              <button class="evaluation-button uncertain" @click="evaluateRecalled(rule.id, 'uncertain')">用此场景标记不确定</button>
            </view>
            <RuleCard
              :rule="rule"
              :evidence="ruleEvidence(rule)"
              compact
              @feedback="store.setFeedback"
              @evaluate="store.addEvaluation"
              @apply-revision="applyRevisionDraft"
            />
          </view>
        </view>
        <view v-if="store.evaluationQueue.length === 0" class="empty">当前没有待复测规则。</view>
        <RuleCard
          v-for="rule in pagedQueue"
          :key="rule.id"
          :rule="rule"
          :evidence="ruleEvidence(rule)"
          compact
          @feedback="store.setFeedback"
          @evaluate="store.addEvaluation"
          @apply-revision="applyRevisionDraft"
        />
        <Pager
          v-model:page="queuePage"
          v-model:page-size="queuePageSize"
          :total-pages="queueTotalPages"
          :total="queueTotal"
          :page-size-options="queuePageSizeOptions"
        />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useExperienceStore } from '../../../stores/experience'
import RuleCard from '../../../components/RuleCard.vue'
import Pager from '../../../components/Pager.vue'
import { usePagination } from '../../../composables/usePagination'
import {
  formatTime, evaluationLabel, protocolExecutionLabel, adoptionLabel, gateStatusLabel,
  repeatabilityLevelLabel, sampleIndependenceLevelLabel, consistencyStatusLabel, replicationMatrixStatusLabel,
  maintenanceHealthLabel, boundarySeverityLabel, percentLabel, planPriorityLabel, planFocusLabel, gateIssues,
} from '../../../services/ruleLabels'
import type {
  EvaluationOutcome, EvaluationCandidate, EvaluationImportResult, EvaluationSettings,
  EvaluationPlanFocus, ExperienceRule, Observation,
} from '../../../types/experience'

const store = useExperienceStore()
function ruleEvidence(rule: ExperienceRule) {
  return rule.evidenceIds.map((id) => store.observations.find((o) => o.id === id)).filter((o): o is Observation => Boolean(o))
}
const evaluationQueue = computed(() => store.evaluationQueue)
const {
  page: queuePage, pageSize: queuePageSize, pageSizeOptions: queuePageSizeOptions,
  totalPages: queueTotalPages, total: queueTotal, paged: pagedQueue,
} = usePagination(evaluationQueue)
const recallScene = ref('')
const recalledCandidates = ref<EvaluationCandidate[]>([])
const evaluationFileInput = ref<HTMLInputElement | null>(null)
const evaluationImportMessage = ref('')
const planFocuses: EvaluationPlanFocus[] = ['confirmation', 'boundary', 'contrast', 'expansion']
const evidenceDrafts = ref<Record<string, string>>({})
function recallCandidates() {
  recalledCandidates.value = store.recallEvaluationCandidates(recallScene.value)
}

function evaluateRecalled(ruleId: string, outcome: EvaluationOutcome) {
  const scene = recallScene.value.trim()
  if (!scene) return
  store.addEvaluation(ruleId, outcome, '来自召回场景的一键复测。', scene, 'recall')
  recalledCandidates.value = store.recallEvaluationCandidates(scene)
}

function downloadEvaluationData() {
  const data = store.exportEvaluationData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `experience-os-evaluations-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function downloadEvaluationCsv() {
  const csv = store.exportEvaluationCsv()
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `experience-os-evaluations-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function openEvaluationImport() {
  evaluationFileInput.value?.click()
}

async function handleEvaluationImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const parsed = JSON.parse(await file.text())
    const result = store.importEvaluationData(parsed)
    evaluationImportMessage.value = importResultLabel(result)
    if (recallScene.value.trim()) {
      recalledCandidates.value = store.recallEvaluationCandidates(recallScene.value)
    }
  } catch (error) {
    evaluationImportMessage.value = error instanceof Error ? error.message : '导入失败，无法解析评估数据。'
  } finally {
    input.value = ''
  }
}

function importResultLabel(result: EvaluationImportResult) {
  const skipped = result.skippedRules + result.skippedObservations + result.skippedEvaluations
  const parts = [
    `新增规则 ${result.importedRules}`,
    `合并规则 ${result.mergedRules}`,
    `新增观察 ${result.importedObservations}`,
    `新增评估 ${result.mergedEvaluations}`,
  ]

  if (result.updatedSettings) parts.push('已更新复查周期')
  if (skipped > 0) parts.push(`跳过无效项 ${skipped}`)
  return parts.join(' / ')
}

function updateEvidenceDraft(evaluationId: string, event: Event) {
  evidenceDrafts.value = {
    ...evidenceDrafts.value,
    [evaluationId]: (event.target as HTMLInputElement).value,
  }
}

function attachEvaluationEvidence(ruleId: string, evaluationId: string) {
  const content = evidenceDrafts.value[evaluationId]?.trim()
  if (!content) return
  if (!store.attachEvaluationEvidence(ruleId, evaluationId, content)) return

  const nextDrafts = { ...evidenceDrafts.value }
  delete nextDrafts[evaluationId]
  evidenceDrafts.value = nextDrafts
}

function applyRevisionDraft(ruleId: string) {
  store.applyRevisionDraft(ruleId)
}

function updateReviewDays(key: keyof EvaluationSettings, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  store.updateEvaluationSettings({ [key]: value })
}

// 高级面板统计 computed(从 index.vue 移入)
const recalledRules = computed(() => {
  return recalledCandidates.value
    .map((candidate) => ({
      candidate,
      rule: store.rules.find((rule) => rule.id === candidate.ruleId),
    }))
    .filter((item): item is { candidate: EvaluationCandidate; rule: ExperienceRule } => Boolean(item.rule))
})

const coverageGapLabel = computed(() => {
  const missing = store.evaluationCoverage.missingFocuses
  if (missing.length === 0) return '四类焦点已覆盖'
  return `缺 ${missing.map(planFocusLabel).join('、')}`
})

const repeatabilityAverage = computed(() => {
  const profiles = store.rules.map((rule) => rule.repeatabilityProfile).filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
  if (profiles.length === 0) return 0
  return Math.round(profiles.reduce((total, profile) => total + profile.score, 0) / profiles.length)
})

const sampleIndependenceAverage = computed(() => {
  const profiles = store.rules.map((rule) => rule.sampleIndependenceProfile).filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
  if (profiles.length === 0) return 0
  return Math.round(profiles.reduce((total, profile) => total + profile.score, 0) / profiles.length)
})

const weakSampleIndependenceCount = computed(() => {
  return store.rules.filter((rule) => rule.sampleIndependenceProfile?.level === 'weak').length
})

const consistencyConflictCount = computed(() => {
  return store.rules.filter((rule) => rule.evaluationConsistencyProfile?.status === 'conflicting').length
})

const replicationReadyCount = computed(() => {
  return store.rules.filter((rule) => rule.evaluationReplicationMatrix?.ready).length
})

const protocolBlockedRuleCount = computed(() => {
  return store.rules.filter((rule) => rule.protocolComplianceProfile?.status === 'blocked' || rule.protocolComplianceProfile?.status === 'partial').length
})
</script>

<style scoped>
.analytics-fold {
  margin: 8px 0 16px;
  border: 1px dashed var(--line, #c8d2cb);
  border-radius: 10px;
  padding: 10px 14px;
  background: var(--surface-sunken, #fafcfa);
}
.analytics-summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-soft, #5a6b62);
}
.analytics-fold[open] .analytics-summary { margin-bottom: 12px; }
</style>
