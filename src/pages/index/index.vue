<template>
  <view class="screen">
    <view class="app-shell">
      <view class="topbar">
        <view>
          <text class="eyebrow">Experience OS</text>
          <text class="title">个人经验规则台</text>
        </view>
        <view class="stat-strip">
          <view>
            <text class="stat-value">{{ store.observations.length }}</text>
            <text class="stat-label">观察</text>
          </view>
          <view>
            <text class="stat-value">{{ store.stableRuleCount }}</text>
            <text class="stat-label">稳定规则</text>
          </view>
          <view>
            <text class="stat-value">{{ store.watchingRuleCount }}</text>
            <text class="stat-label">待观察</text>
          </view>
          <view>
            <text class="stat-value">{{ store.needsFixRuleCount }}</text>
            <text class="stat-label">待修正</text>
          </view>
          <view>
            <text class="stat-value">{{ store.conflictedRuleCount }}</text>
            <text class="stat-label">冲突规则</text>
          </view>
        </view>
      </view>

      <view class="composer">
        <view class="composer-header">
          <view>
            <text class="section-title">快速记录</text>
            <text class="section-meta">8 条样例可直接预置</text>
          </view>
          <view class="utility-actions">
            <button class="ghost-button" :disabled="!canLoadDemo" @click="loadDemoData">
              {{ demoLoadLabel }}
            </button>
            <button class="ghost-button danger" :disabled="store.observations.length === 0" @click="clearData">
              清空
            </button>
          </view>
          <button
            class="primary-button scan-button"
            :disabled="store.observations.filter(o => o.status === 'success').length < 3 || store.isComputingInsights"
            @click="store.computeInsights('过去 90 天')"
          >
            {{ store.isComputingInsights ? '扫描中…' : '扫描我的 90 天' }}
          </button>
        </view>
        <textarea
          v-model="draft"
          class="input"
          auto-height
          maxlength="120"
          placeholder="写一句观察，比如：周末10点健身房人少，器械不用排队"
        />
        <view class="composer-actions">
          <view class="sample-row">
            <button
              v-for="sample in demoSamples"
              :key="sample.label"
              class="sample-chip"
              @click="draft = sample.text"
            >
              {{ sample.label }}
            </button>
          </view>
          <button class="primary-button" :disabled="!canSubmit" @click="submit">
            {{ store.isAnalyzing ? '提炼中' : '生成规则' }}
          </button>
        </view>

        <!-- M4 决策辅助提醒 -->
        <DecisionHintCard
          :hints="store.decisionHints"
          @dismiss="store.dismissDecisionHint"
        />
      </view>

      <!-- 批量导入区块 -->
      <section class="import-section">
        <h3 class="import-title">批量导入</h3>
        <p class="import-hint">粘贴多行文字（每行一条观察），一键导入历史经验</p>
        <textarea
          v-model="importText"
          class="import-textarea"
          placeholder="每行一条，例如：&#10;周末10点健身房人少&#10;工作日早高峰避开8点出门&#10;..."
          :disabled="isImporting"
          rows="6"
        />
        <div class="import-actions">
          <button
            class="import-btn"
            :disabled="!importText.trim() || isImporting"
            @click="handleImport"
          >
            {{ isImporting ? '导入中…' : '批量导入' }}
          </button>
        </div>
        <!-- 结果反馈 -->
        <div v-if="importResult" class="import-result">
          <span>共 {{ importResult.total }} 条 · 成功 {{ importResult.succeeded }} · 失败 {{ importResult.failed }}</span>
        </div>
        <div v-if="isImporting" class="import-progress">
          正在逐条提炼经验，请稍候…
        </div>
      </section>

      <view class="ops-board">
        <view class="ops-item">
          <text class="ops-label">分析模式</text>
          <text class="ops-value">结构化引擎 v1</text>
        </view>
        <view class="ops-item">
          <text class="ops-label">评估次数</text>
          <text class="ops-value">{{ store.evaluationStats.total }}</text>
        </view>
        <view class="ops-item">
          <text class="ops-label">闭环状态</text>
          <text class="ops-value">{{ store.repeatEvaluatedRuleCount }} 条重复评估</text>
        </view>
      </view>

      <view v-if="store.latestRule" class="hero-rule">
        <view class="section-head">
          <text class="section-title">最新策略卡</text>
          <text class="section-meta">下次可用</text>
        </view>
        <RuleCard
          :rule="store.latestRule"
          :evidence="ruleEvidence(store.latestRule)"
          @feedback="store.setFeedback"
          @evaluate="store.addEvaluation"
          @apply-revision="applyRevisionDraft"
        />
      </view>

      <view class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </view>

      <view v-if="activeTab === 'records'" class="panel">
        <view class="section-head">
          <text class="section-title">经验列表</text>
          <text class="section-meta">{{ store.observations.length }} 条观察</text>
        </view>
        <view v-if="store.observations.length === 0" class="empty">还没有观察。先写一句具体经验。</view>
        <view v-for="item in store.observations" :key="item.id" class="record-item">
          <view class="record-top">
            <text class="badge">{{ item.category }}</text>
            <text class="time">{{ formatTime(item.createdAt) }}</text>
          </view>
          <text class="record-text">{{ item.text }}</text>
          <text class="record-summary">{{ item.summary }}</text>
          <view class="tag-row">
            <text v-for="tag in item.tags" :key="tag" class="tag">{{ tag }}</text>
          </view>
        </view>
      </view>

      <view v-if="activeTab === 'rules'" class="panel">
        <view class="section-head">
          <text class="section-title">规则库</text>
          <text class="section-meta">{{ filteredRules.length }} / {{ store.rules.length }} 条规则</text>
        </view>
        <view class="filter-bar">
          <input v-model="ruleQuery" class="search-input" placeholder="搜索规则、地点、行动建议" />
          <button class="ghost-button" @click="resetFilters">重置</button>
        </view>
        <view v-if="categoryTiles.length > 0" class="category-grid">
          <button
            v-for="{ category, count } in categoryTiles"
            :key="category"
            class="category-tile"
            :class="{ selected: selectedCategory === category }"
            @click="toggleCategory(category)"
          >
            <text class="category-name">{{ category }}</text>
            <text class="category-count">{{ count }}</text>
          </button>
        </view>
        <view v-if="store.rules.length === 0" class="empty">策略卡会自动沉淀到这里。</view>
        <view v-else-if="filteredRules.length === 0" class="empty">没有匹配的规则，换个关键词或分类。</view>
        <RuleCard
          v-for="rule in filteredRules"
          :key="rule.id"
          :rule="rule"
          :evidence="ruleEvidence(rule)"
          compact
          @feedback="store.setFeedback"
          @evaluate="store.addEvaluation"
          @apply-revision="applyRevisionDraft"
        />
      </view>

      <view v-if="activeTab === 'evaluations'" class="panel">
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
          v-for="rule in store.evaluationQueue"
          :key="rule.id"
          :rule="rule"
          :evidence="ruleEvidence(rule)"
          compact
          @feedback="store.setFeedback"
          @evaluate="store.addEvaluation"
          @apply-revision="applyRevisionDraft"
        />
      </view>

      <view v-if="activeTab === 'map'" class="panel">
        <view class="section-head">
          <text class="section-title">经验地图</text>
          <text class="section-meta">地点经验视图</text>
        </view>
        <view class="boundary-note">按地点聚合经验，不做导航，也不依赖真实地图。</view>
        <view v-if="store.locationGroups.length === 0" class="empty">带地点的规则会在这里聚合。</view>
        <view v-for="group in store.locationGroups" :key="group.location" class="location-card">
          <view class="location-top">
            <text class="location-name">{{ group.location }}</text>
            <text class="section-meta">{{ group.rules.length }} 条规则 / {{ group.observations.length }} 条证据</text>
          </view>
          <text v-for="rule in group.rules.slice(0, 2)" :key="rule.id" class="location-rule">
            {{ rule.recommendation }}（{{ rule.evidenceIds.length }} 条证据）
          </text>
        </view>
      </view>

      <view v-if="activeTab === 'timeline'" class="panel">
        <view class="section-head">
          <text class="section-title">时间轴</text>
          <text class="section-meta">经验演化</text>
        </view>
        <view class="boundary-note">展示观察如何变成规则，不是日记或流水账。</view>
        <view v-if="store.timelineItems.length === 0" class="empty">提交观察后会形成时间线。</view>
        <view v-for="item in store.timelineItems" :key="item.observation.id" class="timeline-item">
          <view class="timeline-dot" />
          <view class="timeline-content">
            <text class="time">{{ formatTime(item.observation.createdAt) }}</text>
            <text class="record-text">{{ item.observation.text }}</text>
            <text v-if="item.rule" class="record-summary">形成规则：{{ item.rule.title }}</text>
            <text v-if="item.rule" class="record-summary">规则证据数：{{ item.rule.evidenceIds.length }}</text>
            <text v-if="item.rule" class="record-summary">当前反馈：{{ feedbackLabel(item.rule.feedback) }}</text>
          </view>
        </view>
      </view>

      <view v-if="activeTab === 'insights'" class="panel">
        <view class="section-head">
          <text class="section-title">规律发现</text>
          <text class="section-meta">{{ store.insights.length }} 条洞察</text>
        </view>

        <view v-if="store.insights.length === 0 && !store.isComputingInsights" class="empty">
          <text>点击「扫描我的 90 天」开始分析跨记录规律。</text>
          <text class="empty-hint">至少需要 3 条成功处理的观察。</text>
        </view>

        <view v-if="store.isComputingInsights" class="analyzing-hint">
          <text>正在扫描规律中…</text>
        </view>

        <InsightCard
          v-for="insight in store.insights"
          :key="insight.id"
          :insight="insight"
          :observations="store.observations"
        />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue'
import { demoSamples, reusabilityLabel } from '../../services/aiAnalyzer'
import { useExperienceStore } from '../../stores/experience'
import InsightCard from './components/InsightCard.vue'
import DecisionHintCard from '../../components/DecisionHintCard.vue'
import type { ImportSummary } from '../../stores/experience'
import type {
  AdoptionDecisionEvent,
  EvaluationBoundarySeverity,
  EvaluationOutcome,
  EvaluationCandidate,
  EvaluationConfidence,
  EvaluationConsistencyStatus,
  EvaluationAdoptionDecision,
  EvaluationGateCheckStatus,
  EvaluationGateStatus,
  EvaluationImportResult,
  EvaluationPlanFocus,
  EvaluationPlanPriority,
  EvaluationMaintenanceHealth,
  EvaluationProtocolComplianceStatus,
  EvaluationReplicationMatrixStatus,
  EvaluationReplicationSlotStatus,
  EvaluationRepeatabilityLevel,
  EvaluationSampleIndependenceLevel,
  EvaluationSettings,
  EvaluationTrend,
  EvaluationVerdict,
  EvaluationVersionCoverageStatus,
  ExperienceCategory,
  ExperienceRule,
  Feedback,
  Observation,
  RuleEvaluation,
  RuleReviewStatus,
} from '../../types/experience'

type TabKey = 'records' | 'rules' | 'evaluations' | 'map' | 'timeline' | 'insights'

const store = useExperienceStore()

const importText = ref('')
const isImporting = ref(false)
const importResult = ref<ImportSummary | null>(null)

async function handleImport() {
  const text = importText.value.trim()
  if (!text || isImporting.value) return
  isImporting.value = true
  importResult.value = null
  try {
    importResult.value = await store.importObservations(text)
  } finally {
    // 无论成功/失败/并发被阻断,均清除输入框,避免旧输入与旧结果摘要同时显示
    importText.value = ''
    isImporting.value = false
  }
}

const draft = ref('')
const activeTab = ref<TabKey>('records')
const ruleQuery = ref('')
const selectedCategory = ref<ExperienceCategory | '全部'>('全部')
const recallScene = ref('')
const recalledCandidates = ref<EvaluationCandidate[]>([])
const evaluationFileInput = ref<HTMLInputElement | null>(null)
const evaluationImportMessage = ref('')
const planFocuses: EvaluationPlanFocus[] = ['confirmation', 'boundary', 'contrast', 'expansion']
const evidenceDrafts = ref<Record<string, string>>({})

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'records', label: '经验' },
  { key: 'rules', label: '规则库' },
  { key: 'evaluations', label: '评估' },
  { key: 'map', label: '地图' },
  { key: 'timeline', label: '时间轴' },
  { key: 'insights', label: '规律发现' },
]

const canSubmit = computed(() => draft.value.trim().length > 0 && !store.isAnalyzing && !store.isSeedingDemo)
const canLoadDemo = computed(() => !store.isAnalyzing && !store.isSeedingDemo)
const demoLoadLabel = computed(() => (store.isSeedingDemo ? '载入中' : '载入演示数据'))

const categoryTiles = computed(() => {
  return Object.entries(store.rulesByCategory).map(([category, count]) => ({
    category: category as ExperienceCategory,
    count,
  }))
})

const filteredRules = computed(() => {
  const keyword = ruleQuery.value.trim().toLowerCase()

  return store.rules.filter((rule) => {
    const matchCategory = selectedCategory.value === '全部' || rule.category === selectedCategory.value
    const haystack = [
      rule.title,
      rule.category,
      rule.conclusion,
      rule.recommendation,
      rule.location ?? '',
      ...rule.conditions,
      ...rule.warnings,
    ]
      .join(' ')
      .toLowerCase()
    const matchKeyword = !keyword || haystack.includes(keyword)
    return matchCategory && matchKeyword
  })
})

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

async function submit() {
  const text = draft.value
  draft.value = ''
  await store.submitObservation(text)
}

async function loadDemoData() {
  await store.loadDemoData()
  activeTab.value = 'rules'
}

function clearData() {
  store.clearAll()
  draft.value = ''
  ruleQuery.value = ''
  selectedCategory.value = '全部'
  activeTab.value = 'records'
}

function toggleCategory(category: ExperienceCategory) {
  selectedCategory.value = selectedCategory.value === category ? '全部' : category
}

function resetFilters() {
  selectedCategory.value = '全部'
  ruleQuery.value = ''
}

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

function formatTime(value: string) {
  const date = new Date(value)
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

function feedbackLabel(value: Feedback) {
  const map: Record<Feedback, string> = {
    useful: '有用',
    watch: '待观察',
    inaccurate: '不准确',
    none: '未反馈',
  }
  return map[value]
}

function reviewLabel(value: RuleReviewStatus | undefined) {
  const map: Record<RuleReviewStatus, string> = {
    unreviewed: '未反馈',
    validated: '已验证',
    watching: '继续观察',
    needsFix: '待修正',
  }
  return map[value ?? 'unreviewed']
}

function evaluationLabel(value: EvaluationOutcome) {
  const map: Record<EvaluationOutcome, string> = {
    passed: '有效',
    failed: '无效',
    uncertain: '不确定',
  }
  return map[value]
}

function evaluationSourceLabel(value: RuleEvaluation['source']) {
  const map: Record<NonNullable<RuleEvaluation['source']>, string> = {
    manual: '手动',
    recall: '召回',
    plan: '计划',
  }
  return map[value ?? 'manual']
}

function evaluationCycleLabel(value: RuleEvaluation['cycle']) {
  const map: Record<NonNullable<RuleEvaluation['cycle']>, string> = {
    fill: '补矩阵',
    maintenance: '维护抽样',
  }
  return value ? map[value] : ''
}

function protocolExecutionLabel(value: NonNullable<RuleEvaluation['protocolExecution']>['status'] | undefined) {
  const map: Record<NonNullable<RuleEvaluation['protocolExecution']>['status'], string> = {
    complete: '完整',
    partial: '待补',
    blocked: '阻断',
  }
  return map[value ?? 'blocked']
}

function protocolComplianceStatusLabel(value: EvaluationProtocolComplianceStatus | undefined) {
  const map: Record<EvaluationProtocolComplianceStatus, string> = {
    empty: '未执行',
    blocked: '协议阻断',
    partial: '协议待补',
    aligned: '协议一致',
  }
  return map[value ?? 'empty']
}

function verdictLabel(value: EvaluationVerdict | undefined) {
  const map: Record<EvaluationVerdict, string> = {
    insufficient: '证据不足',
    supported: '已支持',
    mixed: '结果分歧',
    conflicted: '存在冲突',
  }
  return map[value ?? 'insufficient']
}

function confidenceLabel(value: EvaluationConfidence | undefined) {
  const map: Record<EvaluationConfidence, string> = {
    low: '低置信',
    medium: '中置信',
    high: '高置信',
  }
  return map[value ?? 'low']
}

function trendLabel(value: EvaluationTrend | undefined) {
  const map: Record<EvaluationTrend, string> = {
    unknown: '趋势不足',
    improving: '趋势增强',
    declining: '趋势走弱',
    flat: '趋势平稳',
  }
  return map[value ?? 'unknown']
}

function adoptionLabel(value: EvaluationAdoptionDecision | undefined) {
  const map: Record<EvaluationAdoptionDecision, string> = {
    adopt: '可采用',
    limit: '限制使用',
    retest: '继续复测',
    repair: '先补证据',
    suspend: '暂停采用',
  }
  return map[value ?? 'retest']
}

function gateStatusLabel(value: EvaluationGateStatus | undefined) {
  const map: Record<EvaluationGateStatus, string> = {
    ready: '门槛通过',
    attention: '需要关注',
    blocked: '存在阻断',
  }
  return map[value ?? 'attention']
}

function gateCheckStatusLabel(value: EvaluationGateCheckStatus | undefined) {
  const map: Record<EvaluationGateCheckStatus, string> = {
    passed: '通过',
    warning: '提醒',
    blocked: '阻断',
  }
  return map[value ?? 'warning']
}

function repeatabilityLevelLabel(value: EvaluationRepeatabilityLevel | undefined) {
  const map: Record<EvaluationRepeatabilityLevel, string> = {
    weak: '弱复现',
    developing: '建设中',
    repeatable: '可复现',
  }
  return map[value ?? 'weak']
}

function sampleIndependenceLevelLabel(value: EvaluationSampleIndependenceLevel | undefined) {
  const map: Record<EvaluationSampleIndependenceLevel, string> = {
    weak: '独立性弱',
    clustered: '样本聚集',
    independent: '样本独立',
  }
  return map[value ?? 'weak']
}

function versionCoverageStatusLabel(value: EvaluationVersionCoverageStatus | undefined) {
  const map: Record<EvaluationVersionCoverageStatus, string> = {
    unretested: '未复测',
    partial: '复测不足',
    covered: '已覆盖',
  }
  return map[value ?? 'covered']
}

function consistencyStatusLabel(value: EvaluationConsistencyStatus | undefined) {
  const map: Record<EvaluationConsistencyStatus, string> = {
    insufficient: '样本不足',
    stable: '稳定一致',
    drifting: '结果漂移',
    conflicting: '同焦点冲突',
  }
  return map[value ?? 'insufficient']
}

function replicationMatrixStatusLabel(value: EvaluationReplicationMatrixStatus | undefined) {
  const map: Record<EvaluationReplicationMatrixStatus, string> = {
    empty: '未开始',
    incomplete: '未完成',
    ready: '矩阵就绪',
    blocked: '矩阵阻断',
  }
  return map[value ?? 'empty']
}

function replicationSlotStatusLabel(value: EvaluationReplicationSlotStatus | undefined) {
  const map: Record<EvaluationReplicationSlotStatus, string> = {
    missing: '缺样本',
    partial: '待补',
    complete: '完成',
    conflicted: '冲突',
  }
  return map[value ?? 'missing']
}

function maintenanceHealthLabel(value: EvaluationMaintenanceHealth | undefined) {
  const map: Record<EvaluationMaintenanceHealth, string> = {
    healthy: '维护健康',
    due: '维护到期',
    risk: '维护风险',
    critical: '维护严重',
  }
  return map[value ?? 'healthy']
}

function boundarySeverityLabel(value: EvaluationBoundarySeverity | undefined) {
  const map: Record<EvaluationBoundarySeverity, string> = {
    critical: '关键反例',
    watch: '待收窄',
    unknown: '证据不足',
  }
  return map[value ?? 'unknown']
}

function percentLabel(value: number | undefined) {
  return `${Math.round((value ?? 0) * 100)}%`
}

function planPriorityLabel(value: EvaluationPlanPriority | undefined) {
  const map: Record<EvaluationPlanPriority, string> = {
    high: '高优先',
    medium: '中优先',
    low: '低优先',
  }
  return map[value ?? 'low']
}

function planFocusLabel(value: EvaluationPlanFocus | undefined) {
  const map: Record<EvaluationPlanFocus, string> = {
    confirmation: '确认复测',
    boundary: '边界复测',
    contrast: '对照复测',
    expansion: '扩展复测',
  }
  return map[value ?? 'confirmation']
}

function scoreClass(value: number | undefined) {
  const score = value ?? 0
  if (score >= 75) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}

function latestAdoptionEvents(rule: ExperienceRule, limit: number): AdoptionDecisionEvent[] {
  return [...(rule.adoptionTimeline ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit)
}

function gateIssues(rule: ExperienceRule) {
  return [...(rule.adoptionGate?.blockers ?? []), ...(rule.adoptionGate?.warnings ?? [])]
}

function evaluationSummary(evaluations: RuleEvaluation[] | undefined) {
  const items = evaluations ?? []
  const passed = items.filter((item) => item.outcome === 'passed').length
  const failed = items.filter((item) => item.outcome === 'failed').length
  const uncertain = items.filter((item) => item.outcome === 'uncertain').length
  return `${items.length} 次评估：${passed} 有效 / ${failed} 无效 / ${uncertain} 不确定`
}

function ruleEvidence(rule: ExperienceRule) {
  return rule.evidenceIds
    .map((id) => store.observations.find((observation) => observation.id === id))
    .filter((item): item is Observation => Boolean(item))
}

const RuleCard = defineComponent({
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
    const evaluationNote = ref('')
    const evaluationObservation = ref('')
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
        h('view', { class: 'evaluation-panel' }, [
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

<style lang="scss">
.screen {
  min-height: 100vh;
  background: #f5f6f1;
}

.app-shell {
  width: min(960px, 100%);
  margin: 0 auto;
  padding: 28px 18px 40px;
}

.topbar,
.composer-header,
.section-head,
.record-top,
.location-top,
.rule-head,
.rule-meta,
.filter-bar,
.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow,
.section-meta,
.time {
  display: block;
  color: #677064;
  font-size: 12px;
}

.title {
  display: block;
  margin-top: 6px;
  color: #252923;
  font-size: 28px;
  font-weight: 800;
}

.stat-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(64px, 1fr));
  gap: 8px;
}

.stat-strip > view,
.evaluation-dashboard > view {
  min-width: 64px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 8px 10px;
  text-align: center;
}

.stat-value,
.stat-label {
  display: block;
}

.stat-value {
  color: #246a53;
  font-size: 20px;
  font-weight: 800;
}

.stat-label {
  margin-top: 3px;
  color: #677064;
  font-size: 12px;
}

.ghost-button,
.primary-button,
.sample-chip,
.tab,
.feedback-button {
  min-height: 36px;
  border-radius: 8px;
  padding: 0 14px;
  font-size: 14px;
}

.ghost-button {
  border: 1px solid #dfe5dc;
  color: #52604f;
  background: #fff;
}

.composer,
.panel,
.hero-rule,
.ops-board {
  margin-top: 18px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 16px;
}

.ops-board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  background: #252923;
}

.ops-item {
  min-width: 0;
  border: 1px solid #3d453c;
  border-radius: 8px;
  padding: 10px 12px;
}

.ops-label,
.ops-value {
  display: block;
}

.ops-label {
  color: #b8c4b6;
  font-size: 12px;
}

.ops-value {
  margin-top: 5px;
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.35;
}

.composer-header {
  margin-bottom: 12px;
}

.input {
  width: 100%;
  min-height: 92px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #f9faf6;
  padding: 12px;
  font-size: 16px;
  line-height: 1.5;
}

.composer-actions {
  margin-top: 12px;
  align-items: flex-end;
}

.sample-row,
.tag-row,
.feedback-row,
.evaluation-row,
.utility-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.utility-actions {
  justify-content: flex-end;
}

.evaluation-tools {
  margin-top: 10px;
}

.file-input {
  display: none;
}

.import-message {
  display: block;
  margin-top: 8px;
  color: #246a53;
  font-size: 13px;
  line-height: 1.5;
}

.review-settings {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.setting-field {
  display: block;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fbfcf8;
  padding: 8px 10px;
}

.setting-label {
  display: block;
  color: #677064;
  font-size: 12px;
}

.setting-input {
  width: 100%;
  height: 32px;
  margin-top: 4px;
  border: 0;
  background: transparent;
  color: #252923;
  font-size: 18px;
  font-weight: 800;
}

.sample-chip {
  background: #eef3ed;
  color: #355646;
}

.primary-button {
  min-width: 112px;
  background: #246a53;
  color: #fff;
  font-weight: 700;
}

.primary-button[disabled] {
  background: #9ca99f;
}

.ghost-button[disabled] {
  color: #97a093;
  background: #f4f5f1;
}

.ghost-button.danger {
  color: #9a4b45;
}

.tabs {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-top: 18px;
}

.tab {
  background: #e7ece4;
  color: #4d5a4e;
}

.tab.active {
  background: #252923;
  color: #fff;
}

.section-title {
  color: #252923;
  font-size: 18px;
  font-weight: 800;
}

.rule-card,
.record-item,
.location-card {
  margin-top: 12px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fbfcf8;
  padding: 14px;
}

.rule-card.compact {
  padding: 12px;
}

.badge,
.tag,
.reuse,
.review-badge,
.verdict-badge,
.score-badge,
.confidence-badge,
.trend-badge,
.adoption-badge,
.gate-badge,
.repeatability-badge,
.consistency-badge,
.replication-badge,
.protocol-execution-badge,
.boundary-badge,
.evidence-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  padding: 0 10px;
  background: #dcebe2;
  color: #246a53;
  font-size: 12px;
  font-weight: 700;
}

.evidence-badge {
  background: #edf0f2;
  color: #35668a;
}

.review-badge {
  background: #edf0f2;
  color: #52604f;
}

.review-badge.validated {
  background: #dcebe2;
  color: #246a53;
}

.review-badge.watching {
  background: #eef0dc;
  color: #8b6a15;
}

.review-badge.needsFix {
  background: #f2e1df;
  color: #a04d5b;
}

.verdict-badge {
  background: #edf0f2;
  color: #52604f;
}

.verdict-badge.supported {
  background: #dcebe2;
  color: #246a53;
}

.verdict-badge.mixed {
  background: #eef0dc;
  color: #8b6a15;
}

.verdict-badge.conflicted {
  background: #f2e1df;
  color: #a04d5b;
}

.score-badge.high,
.confidence-badge.high,
.trend-badge.improving {
  background: #dcebe2;
  color: #246a53;
}

.score-badge.medium,
.confidence-badge.medium,
.trend-badge.flat {
  background: #eef0dc;
  color: #8b6a15;
}

.score-badge.low,
.confidence-badge.low,
.trend-badge.declining {
  background: #f2e1df;
  color: #a04d5b;
}

.trend-badge.unknown {
  background: #edf0f2;
  color: #52604f;
}

.adoption-badge.adopt {
  background: #dcebe2;
  color: #246a53;
}

.adoption-badge.limit,
.adoption-badge.retest {
  background: #eef0dc;
  color: #8b6a15;
}

.adoption-badge.repair,
.adoption-badge.suspend {
  background: #f2e1df;
  color: #a04d5b;
}

.gate-badge.ready {
  background: #dcebe2;
  color: #246a53;
}

.gate-badge.attention {
  background: #eef0dc;
  color: #8b6a15;
}

.gate-badge.blocked {
  background: #f2e1df;
  color: #a04d5b;
}

.repeatability-badge.repeatable {
  background: #dcebe2;
  color: #246a53;
}

.repeatability-badge.developing {
  background: #eef0dc;
  color: #8b6a15;
}

.repeatability-badge.weak {
  background: #f2e1df;
  color: #a04d5b;
}

.consistency-badge.stable {
  background: #dcebe2;
  color: #246a53;
}

.consistency-badge.insufficient,
.consistency-badge.drifting {
  background: #eef0dc;
  color: #8b6a15;
}

.consistency-badge.conflicting {
  background: #f2e1df;
  color: #a04d5b;
}

.replication-badge.ready {
  background: #dcebe2;
  color: #246a53;
}

.replication-badge.empty,
.replication-badge.incomplete {
  background: #eef0dc;
  color: #8b6a15;
}

.replication-badge.blocked {
  background: #f2e1df;
  color: #a04d5b;
}

.protocol-execution-badge.complete {
  background: #dcebe2;
  color: #246a53;
}

.protocol-execution-badge.partial {
  background: #eef0dc;
  color: #8b6a15;
}

.protocol-execution-badge.blocked {
  background: #f2e1df;
  color: #a04d5b;
}

.boundary-badge.critical {
  background: #f2e1df;
  color: #a04d5b;
}

.boundary-badge.watch {
  background: #eef0dc;
  color: #8b6a15;
}

.boundary-badge.unknown {
  background: #edf0f2;
  color: #52604f;
}

.reuse.medium {
  background: #eef0dc;
  color: #8b6a15;
}

.reuse.watch,
.reuse.low {
  background: #f2e1df;
  color: #a04d5b;
}

.rule-title,
.record-text,
.location-name {
  display: block;
  margin-top: 10px;
  color: #252923;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.45;
}

.rule-conclusion,
.record-summary,
.location-rule,
.boundary-note {
  display: block;
  margin-top: 8px;
  color: #52604f;
  font-size: 14px;
  line-height: 1.55;
}

.action-box {
  margin-top: 12px;
  border-left: 4px solid #246a53;
  background: #eef3ed;
  border-radius: 6px;
  padding: 10px 12px;
  color: #252923;
  font-size: 15px;
  line-height: 1.5;
}

.action-label,
.mini-title {
  display: block;
  margin-bottom: 6px;
  color: #246a53;
  font-size: 12px;
  font-weight: 800;
}

.condition-list {
  margin-top: 12px;
}

.evidence-list {
  margin-top: 12px;
  border-top: 1px solid #dfe5dc;
  padding-top: 12px;
}

.evidence-list.compact {
  padding-top: 10px;
}

.evidence-text {
  display: block;
  color: #52604f;
  font-size: 13px;
  line-height: 1.6;
}

.condition {
  display: block;
  color: #343b33;
  font-size: 14px;
  line-height: 1.7;
}

.condition::before {
  content: '- ';
}

.muted {
  color: #677064;
}

.feedback-row {
  margin-top: 12px;
}

.evaluation-panel {
  margin-top: 12px;
  border-top: 1px solid #dfe5dc;
  padding-top: 12px;
}

.evaluation-dashboard {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.adoption-panel,
.gate-panel,
.repeatability-panel,
.consistency-panel,
.replication-panel,
.protocol-panel,
.protocol-execution-panel,
.boundary-panel,
.revision-panel,
.decision-timeline-panel,
.coverage-panel,
.quality-panel,
.stale-panel,
.plan-panel {
  margin-top: 14px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fbfcf8;
  padding: 12px;
}

.adoption-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.adoption-group {
  min-width: 0;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.adoption-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.adoption-rule {
  margin-top: 8px;
  border-top: 1px solid #edf0f2;
  padding-top: 8px;
}

.adoption-rule-title,
.adoption-rule-reason {
  display: block;
  line-height: 1.45;
}

.adoption-rule-title {
  color: #252923;
  font-size: 13px;
  font-weight: 800;
}

.adoption-rule-reason {
  margin-top: 4px;
  color: #52604f;
  font-size: 12px;
}

.gate-item {
  margin-top: 10px;
  border-top: 1px solid #edf0f2;
  padding-top: 10px;
}

.section-head + .gate-item {
  border-top: 0;
  padding-top: 0;
}

.gate-item-head,
.gate-badges,
.gate-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gate-item-head,
.gate-card-head {
  justify-content: space-between;
}

.gate-badges {
  flex-wrap: wrap;
}

.gate-rule-title,
.gate-rule-issue {
  display: block;
  line-height: 1.5;
}

.gate-rule-title {
  margin-top: 6px;
  color: #252923;
  font-size: 13px;
  font-weight: 800;
}

.gate-rule-issue {
  margin-top: 4px;
  color: #52604f;
  font-size: 12px;
}

.repeatability-item {
  margin-top: 10px;
  border-top: 1px solid #edf0f2;
  padding-top: 10px;
}

.consistency-item {
  margin-top: 10px;
  border-top: 1px solid #edf0f2;
  padding-top: 10px;
}

.replication-item {
  margin-top: 10px;
  border-top: 1px solid #edf0f2;
  padding-top: 10px;
}

.section-head + .repeatability-item {
  border-top: 0;
  padding-top: 0;
}

.section-head + .consistency-item {
  border-top: 0;
  padding-top: 0;
}

.section-head + .replication-item {
  border-top: 0;
  padding-top: 0;
}

.repeatability-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.consistency-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.replication-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.repeatability-title,
.repeatability-step,
.repeatability-issue,
.consistency-title,
.consistency-step,
.consistency-issue,
.replication-title,
.replication-step {
  display: block;
  line-height: 1.5;
}

.repeatability-title,
.consistency-title,
.replication-title {
  margin-top: 6px;
  color: #252923;
  font-size: 13px;
  font-weight: 800;
}

.repeatability-step,
.repeatability-issue,
.consistency-step,
.consistency-issue,
.replication-step {
  margin-top: 4px;
  color: #52604f;
  font-size: 12px;
}

.replication-slots {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.replication-actions {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.replication-slot-card {
  border: 1px solid #edf0f2;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
}

.replication-slot-summary {
  display: block;
  color: #52604f;
  font-size: 12px;
  line-height: 1.5;
}

.replication-maintenance-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  margin-left: 6px;
  border-radius: 999px;
  padding: 0 7px;
  background: #eef0dc;
  color: #8b6a15;
  font-size: 11px;
}

.replication-maintenance-badge.risk {
  background: #f3e4c8;
  color: #8a5515;
}

.replication-maintenance-badge.critical {
  background: #f2e1df;
  color: #a04d5b;
}

.replication-maintenance-badge.healthy {
  background: #dcebe2;
  color: #246a53;
}

.replication-maintenance-reason {
  display: block;
  margin-top: 4px;
  color: #6c7768;
  font-size: 12px;
  line-height: 1.5;
}

.replication-slot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.replication-slot {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  padding: 0 9px;
  background: #edf0f2;
  color: #52604f;
  font-size: 12px;
  font-weight: 700;
}

.replication-slot.complete {
  background: #dcebe2;
  color: #246a53;
}

.replication-slot.partial {
  background: #eef0dc;
  color: #8b6a15;
}

.replication-slot.conflicted {
  background: #f2e1df;
  color: #a04d5b;
}

.replication-action {
  min-height: 32px;
  padding: 0 10px;
  font-size: 12px;
}

.protocol-item {
  margin-top: 10px;
  border-top: 1px solid #edf0f2;
  padding-top: 10px;
}

.protocol-execution-item {
  margin-top: 10px;
  border-top: 1px solid #edf0f2;
  padding-top: 10px;
}

.section-head + .protocol-item,
.section-head + .protocol-execution-item {
  border-top: 0;
  padding-top: 0;
}

.protocol-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.protocol-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.protocol-title,
.protocol-line,
.protocol-evidence {
  display: block;
  line-height: 1.5;
}

.protocol-title {
  margin-top: 6px;
  color: #252923;
  font-size: 13px;
  font-weight: 800;
}

.protocol-line,
.protocol-evidence {
  margin-top: 4px;
  color: #52604f;
  font-size: 12px;
}

.boundary-item {
  margin-top: 10px;
  border-top: 1px solid #edf0f2;
  padding-top: 10px;
}

.section-head + .boundary-item {
  border-top: 0;
  padding-top: 0;
}

.boundary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.boundary-title,
.boundary-text {
  display: block;
  line-height: 1.5;
}

.boundary-title {
  margin-top: 6px;
  color: #252923;
  font-size: 13px;
  font-weight: 800;
}

.boundary-text {
  margin-top: 4px;
  color: #52604f;
  font-size: 12px;
}

.revision-item {
  margin-top: 10px;
  border-top: 1px solid #edf0f2;
  padding-top: 10px;
}

.section-head + .revision-item {
  border-top: 0;
  padding-top: 0;
}

.revision-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.revision-title,
.revision-text {
  display: block;
  line-height: 1.5;
}

.revision-title {
  margin-top: 6px;
  color: #252923;
  font-size: 13px;
  font-weight: 800;
}

.revision-text {
  margin-top: 4px;
  color: #52604f;
  font-size: 12px;
}

.decision-change {
  margin-top: 10px;
  border-top: 1px solid #edf0f2;
  padding-top: 10px;
}

.section-head + .decision-change {
  border-top: 0;
  padding-top: 0;
}

.decision-change-head,
.adoption-event-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.decision-change-title,
.decision-change-reason,
.adoption-event-reason {
  display: block;
  line-height: 1.5;
}

.decision-change-title {
  margin-top: 6px;
  color: #252923;
  font-size: 13px;
  font-weight: 800;
}

.decision-change-reason,
.adoption-event-reason {
  margin-top: 4px;
  color: #52604f;
  font-size: 12px;
}

.coverage-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.coverage-item {
  min-width: 0;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.coverage-name,
.coverage-value {
  display: block;
}

.coverage-name {
  color: #252923;
  font-size: 13px;
  font-weight: 800;
}

.coverage-value {
  margin-top: 5px;
  color: #52604f;
  font-size: 12px;
  line-height: 1.45;
}

.quality-item {
  margin-top: 10px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.quality-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.quality-rule,
.quality-reason {
  display: block;
}

.quality-rule {
  min-width: 0;
  color: #252923;
  font-size: 13px;
  font-weight: 800;
}

.quality-reason {
  margin-top: 6px;
  color: #a04d5b;
  font-size: 12px;
  line-height: 1.45;
}

.quality-fix {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.quality-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #f9faf6;
  padding: 0 10px;
  color: #252923;
  font-size: 13px;
}

.stale-item {
  display: block;
  margin-top: 8px;
  color: #52604f;
  font-size: 13px;
  line-height: 1.55;
}

.plan-item,
.rule-plan {
  margin-top: 10px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.rule-plan {
  background: #fbfcf8;
}

.rule-plan.high {
  border-color: #e5bfbd;
}

.rule-plan.medium {
  border-color: #ded6ad;
}

.plan-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.plan-priority {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
}

.plan-priority.high {
  background: #f2e1df;
  color: #a04d5b;
}

.plan-priority.medium {
  background: #eef0dc;
  color: #8b6a15;
}

.plan-priority.low {
  background: #dcebe2;
  color: #246a53;
}

.plan-title,
.plan-text,
.plan-reason,
.plan-evidence {
  display: block;
  line-height: 1.55;
}

.plan-title {
  margin-top: 8px;
  color: #252923;
  font-size: 14px;
  font-weight: 800;
}

.plan-text,
.plan-evidence {
  margin-top: 6px;
  color: #52604f;
  font-size: 13px;
}

.plan-evidence {
  color: #35668a;
}

.plan-reason {
  margin-top: 6px;
  color: #677064;
  font-size: 12px;
}

.evaluation-row {
  margin-top: 8px;
}

.evaluation-note-input {
  width: 100%;
  height: 36px;
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 0 10px;
  color: #252923;
  font-size: 13px;
}

.evaluation-button {
  min-height: 32px;
  border-radius: 8px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid #dfe5dc;
  color: #52604f;
  font-size: 13px;
}

.evaluation-button.passed {
  border-color: #b8d7c6;
  color: #246a53;
}

.evaluation-button.failed {
  border-color: #e5bfbd;
  color: #9a4b45;
}

.evaluation-button.uncertain {
  border-color: #ded6ad;
  color: #806616;
}

.evaluation-summary,
.evaluation-text,
.revision-suggestion,
.adoption-reason,
.next-action {
  display: block;
  color: #52604f;
  font-size: 13px;
  line-height: 1.6;
}

.revision-suggestion {
  margin-top: 8px;
  border-left: 3px solid #dfe5dc;
  background: #f9faf6;
  border-radius: 6px;
  padding: 8px 10px;
}

.revision-suggestion.supported {
  border-left-color: #246a53;
}

.revision-suggestion.mixed {
  border-left-color: #8b6a15;
}

.revision-suggestion.conflicted {
  border-left-color: #a04d5b;
}

.next-action {
  margin-top: 8px;
  border-left: 3px solid #246a53;
  background: #eef3ed;
  border-radius: 6px;
  padding: 8px 10px;
  color: #355646;
}

.next-action.declining {
  border-left-color: #a04d5b;
  background: #f8eeee;
  color: #8f4146;
}

.adoption-reason {
  margin-top: 8px;
  border-left: 3px solid #dfe5dc;
  background: #f9faf6;
  border-radius: 6px;
  padding: 8px 10px;
}

.adoption-reason.adopt {
  border-left-color: #246a53;
}

.adoption-reason.limit,
.adoption-reason.retest {
  border-left-color: #8b6a15;
}

.adoption-reason.repair,
.adoption-reason.suspend {
  border-left-color: #a04d5b;
}

.gate-card {
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.gate-card.blocked {
  border-color: #e5bfbd;
}

.gate-card.ready {
  border-color: #b8d7c6;
}

.gate-check {
  margin-top: 8px;
  border-left: 3px solid #dfe5dc;
  background: #f9faf6;
  border-radius: 6px;
  padding: 7px 9px;
}

.gate-check.passed {
  border-left-color: #246a53;
}

.gate-check.warning {
  border-left-color: #8b6a15;
}

.gate-check.blocked {
  border-left-color: #a04d5b;
}

.gate-check-title,
.gate-check-detail {
  display: block;
  line-height: 1.45;
}

.gate-check-title {
  color: #252923;
  font-size: 12px;
  font-weight: 800;
}

.gate-check-detail {
  margin-top: 3px;
  color: #52604f;
  font-size: 12px;
}

.repeatability-card {
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.repeatability-card.repeatable {
  border-color: #b8d7c6;
}

.repeatability-card.weak {
  border-color: #e5bfbd;
}

.consistency-card {
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.consistency-card.stable {
  border-color: #b8d7c6;
}

.consistency-card.conflicting {
  border-color: #e5bfbd;
}

.version-card {
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.version-card.unretested,
.version-card.partial {
  border-color: #e0c27d;
}

.version-badge {
  display: inline-flex;
  border-radius: 999px;
  padding: 3px 8px;
  background: #eef3ed;
  color: #246a53;
  font-size: 12px;
  font-weight: 800;
}

.version-badge.unretested,
.version-badge.partial {
  background: #f7edcf;
  color: #765b18;
}

.protocol-compliance-card {
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.protocol-compliance-card.blocked {
  border-color: #e5bfbd;
}

.protocol-compliance-card.partial {
  border-color: #e0c27d;
}

.protocol-compliance-badge {
  display: inline-flex;
  border-radius: 999px;
  padding: 3px 8px;
  background: #eef3ed;
  color: #246a53;
  font-size: 12px;
  font-weight: 800;
}

.protocol-compliance-badge.blocked {
  background: #f7dedc;
  color: #89352f;
}

.protocol-compliance-badge.partial {
  background: #f7edcf;
  color: #765b18;
}

.replication-card {
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.replication-card.ready {
  border-color: #b8d7c6;
}

.replication-card.blocked {
  border-color: #e5bfbd;
}

.protocol-card {
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.protocol-card .mini-title {
  margin-top: 8px;
}

.boundary-card {
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.revision-card {
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.revision-card .mini-title {
  margin-top: 8px;
}

.revision-apply-button {
  width: 100%;
  margin-top: 8px;
}

.revision-history {
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.revision-record {
  margin-top: 8px;
  border-top: 1px solid #edf0f2;
  padding-top: 8px;
}

.revision-head + .revision-record {
  border-top: 0;
  padding-top: 0;
}

.boundary-case {
  margin-top: 8px;
  border-top: 1px solid #edf0f2;
  padding-top: 8px;
}

.boundary-head + .boundary-case {
  border-top: 0;
  padding-top: 0;
}

.adoption-timeline {
  margin-top: 8px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.adoption-event {
  margin-top: 8px;
  border-top: 1px solid #edf0f2;
  padding-top: 8px;
}

.mini-title + .adoption-event {
  border-top: 0;
  padding-top: 0;
}

.evaluation-text {
  margin-top: 6px;
}

.evaluation-line,
.evaluation-plan-snapshot {
  display: block;
}

.evaluation-plan-snapshot {
  margin-top: 3px;
  color: #677064;
  font-size: 12px;
}

.protocol-execution-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.evaluation-text.passed {
  color: #246a53;
}

.evaluation-text.failed {
  color: #9a4b45;
}

.evaluation-text.uncertain {
  color: #806616;
}

.feedback-button {
  border: 1px solid #dfe5dc;
  background: #fff;
  color: #52604f;
}

.feedback-button.selected {
  border-color: #246a53;
  background: #246a53;
  color: #fff;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.category-tile {
  text-align: left;
  border-radius: 8px;
  background: #eef3ed;
  padding: 10px;
}

.category-tile.selected {
  background: #246a53;
}

.category-tile.selected .category-name,
.category-tile.selected .category-count {
  color: #fff;
}

.category-name,
.category-count {
  display: block;
}

.category-name {
  color: #52604f;
  font-size: 12px;
}

.category-count {
  margin-top: 4px;
  color: #252923;
  font-size: 20px;
  font-weight: 800;
}

.filter-bar {
  margin-top: 12px;
}

.recall-box {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.recall-results {
  margin-top: 14px;
  border-top: 1px solid #dfe5dc;
  padding-top: 14px;
}

.recall-card {
  margin-top: 12px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #fff;
  padding: 12px;
}

.recall-score,
.recall-reason {
  display: block;
  font-size: 13px;
  line-height: 1.5;
}

.recall-score {
  color: #246a53;
  font-weight: 800;
}

.recall-reason {
  margin-top: 4px;
  color: #52604f;
}

.recall-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  border: 1px solid #dfe5dc;
  border-radius: 8px;
  background: #f9faf6;
  padding: 0 12px;
  color: #252923;
  font-size: 14px;
}

.empty {
  margin-top: 12px;
  border: 1px dashed #cbd5c8;
  border-radius: 8px;
  padding: 18px;
  color: #677064;
  text-align: center;
}

.timeline-item {
  position: relative;
  display: flex;
  gap: 12px;
  margin-top: 14px;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  margin-top: 4px;
  border-radius: 50%;
  background: #246a53;
  flex: 0 0 12px;
}

.timeline-content {
  flex: 1;
  border-bottom: 1px solid #dfe5dc;
  padding-bottom: 14px;
}

@media (max-width: 640px) {
  .app-shell {
    padding: 18px 12px 32px;
  }

  .title {
    font-size: 24px;
  }

  .composer-actions {
    display: block;
  }

  .composer-header {
    display: block;
  }

  .utility-actions {
    margin-top: 10px;
    justify-content: stretch;
  }

  .utility-actions .ghost-button {
    flex: 1;
  }

  .topbar {
    align-items: flex-start;
  }

  .stat-strip {
    grid-template-columns: 1fr;
  }

  .ops-board {
    grid-template-columns: 1fr;
  }

  .primary-button {
    width: 100%;
    margin-top: 12px;
  }

  .filter-bar {
    display: block;
  }

  .recall-box {
    display: block;
  }

  .recall-box .ghost-button {
    width: 100%;
    margin-top: 8px;
  }

  .recall-actions .evaluation-button {
    width: 100%;
  }

  .filter-bar .ghost-button {
    width: 100%;
    margin-top: 8px;
  }

  .tabs {
    gap: 6px;
  }

  .tab {
    padding: 0 4px;
    font-size: 12px;
  }

  .category-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .evaluation-dashboard {
    grid-template-columns: 1fr;
  }

  .coverage-grid {
    grid-template-columns: 1fr;
  }

  .adoption-grid {
    grid-template-columns: 1fr;
  }

  .quality-fix {
    display: block;
  }

  .quality-fix .ghost-button {
    width: 100%;
    margin-top: 8px;
  }

  .review-settings {
    grid-template-columns: 1fr;
  }
}

.import-section {
  margin: 16px 0 24px;
  padding: 16px;
  border: 1px dashed var(--color-border, #ddd);
  border-radius: 8px;
  background: var(--color-bg-soft, #f9f9f9);
}
.import-title { font-size: 14px; font-weight: 600; margin: 0 0 4px; }
.import-hint  { font-size: 12px; color: #888; margin: 0 0 10px; }
.import-textarea {
  width: 100%; box-sizing: border-box;
  padding: 10px; border: 1px solid #ccc; border-radius: 6px;
  font-size: 13px; resize: vertical;
}
.import-actions { margin-top: 8px; }
.import-btn {
  padding: 8px 20px; font-size: 13px;
  background: var(--color-primary, #4a7cf7); color: #fff;
  border: none; border-radius: 6px; cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}
.import-result  { margin-top: 8px; font-size: 13px; color: #333; }
.import-progress { margin-top: 6px; font-size: 12px; color: #888; }

.scan-button {
  margin-top: 12px;
  width: 100%;
}

.empty-hint {
  font-size: 12px;
  color: #94a3b8;
  display: block;
  margin-top: 4px;
}

.analyzing-hint {
  text-align: center;
  padding: 20px;
  color: #64748b;
  font-size: 14px;
}
</style>
