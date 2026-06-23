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
        <button class="ghost-button small" @click="showSettings = !showSettings">
          {{ showSettings ? '关闭设置' : '⚙ 设置' }}
        </button>
      </view>

      <!-- 模型设置面板(可折叠) -->
      <view v-if="showSettings" class="settings-panel">
        <ModelConfigPanel />
      </view>

      <!-- Trust Banner:本地优先可见化 -->
      <div class="trust-banner">
        <span class="trust-icon">🔒</span>
        <span class="trust-text">数据只在本机 — 零云端上传，随时可导出或清空</span>
      </div>

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
        <button
          class="tab"
          :class="{ active: showAdvancedPanel }"
          @click="showAdvancedPanel = !showAdvancedPanel"
        >
          高级
        </button>
      </view>

      <view v-if="activeTab === 'compose'" class="panel">
        <InputModule @navigate="activeTab = $event" @reset-filters="afterClear" @toast="showToast" />
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
        <view class="ops-board">
          <view class="ops-item"><text class="ops-label">分析模式</text><text class="ops-value">结构化引擎 v1</text></view>
          <view class="ops-item"><text class="ops-label">评估次数</text><text class="ops-value">{{ store.evaluationStats.total }}</text></view>
          <view class="ops-item"><text class="ops-label">闭环状态</text><text class="ops-value">{{ store.repeatEvaluatedRuleCount }} 条重复评估</text></view>
        </view>
      </view>

      <view v-if="activeTab === 'records'" class="panel">
        <ExperienceList />
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

      <view v-if="showAdvancedPanel" class="panel advanced-panel">
        <EvaluationWorkbench />
      </view>

      <view v-if="activeTab === 'map'" class="panel">
        <ExperienceMap />
      </view>

      <view v-if="activeTab === 'timeline'" class="panel">
        <Timeline />
      </view>

      <view v-if="activeTab === 'insights'" class="panel">
        <LawLibrary />
      </view>
    </view>
    <!-- Toast 提示 -->
    <div v-if="toastMessage" class="toast-notification">{{ toastMessage }}</div>
  </view>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue'
import { demoSamples, reusabilityLabel } from '../../services/aiAnalyzer'
import { useExperienceStore } from '../../stores/experience'
import { getBackendUrl } from '../../services/backendClient'
import LawLibrary from './components/LawLibrary.vue'
import EvaluationWorkbench from './components/EvaluationWorkbench.vue'
import ExperienceList from './components/ExperienceList.vue'
import ExperienceMap from './components/ExperienceMap.vue'
import Timeline from './components/Timeline.vue'
import InputModule from './components/InputModule.vue'
import DecisionHintCard from '../../components/DecisionHintCard.vue'
import ModelConfigPanel from '../../components/ModelConfigPanel.vue'
import RuleCard from '../../components/RuleCard.vue'
import {
  formatTime, feedbackLabel, evaluationLabel, protocolExecutionLabel, adoptionLabel,
  gateStatusLabel, repeatabilityLevelLabel, sampleIndependenceLevelLabel, consistencyStatusLabel,
  replicationMatrixStatusLabel, maintenanceHealthLabel, boundarySeverityLabel, percentLabel,
  planPriorityLabel, planFocusLabel, gateIssues,
} from '../../services/ruleLabels'
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

type TabKey = 'compose' | 'records' | 'rules' | 'map' | 'timeline' | 'insights'

const store = useExperienceStore()



const activeTab = ref<TabKey>('compose')
const showSettings = ref(false)
const toastMessage = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(message: string) {
  toastMessage.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMessage.value = '' }, 3000)
}
const ruleQuery = ref('')
const selectedCategory = ref<ExperienceCategory | '全部'>('全部')

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'compose', label: '记录' },
  { key: 'records', label: '经验' },
  { key: 'rules', label: '规则库' },
  { key: 'map', label: '地图' },
  { key: 'timeline', label: '时间轴' },
  { key: 'insights', label: '规律发现' },
]

const showAdvancedPanel = ref(false)


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

function toggleCategory(category: ExperienceCategory) {
  selectedCategory.value = selectedCategory.value === category ? '全部' : category
}

function resetFilters() {
  selectedCategory.value = '全部'
  ruleQuery.value = ''
}

// InputModule 清空/一键清空后:重置筛选 + 回到经验 tab(由 @reset-filters 触发)
function afterClear() {
  resetFilters()
  activeTab.value = 'compose'
}

function applyRevisionDraft(ruleId: string) {
  store.applyRevisionDraft(ruleId)
}



function ruleEvidence(rule: ExperienceRule) {
  return rule.evidenceIds
    .map((id) => store.observations.find((observation) => observation.id === id))
    .filter((item): item is Observation => Boolean(item))
}

</script>

<style lang="scss" src="./styles.scss"></style>

<style scoped>
.review-block { margin-top: 16px; border-top: 1px solid #eee; padding-top: 12px; }
.review-tabs { display: flex; gap: 8px; }
.review-tab { padding: 2px 10px; border: 1px solid #ddd; border-radius: 12px; background: #fff; font-size: 12px; cursor: pointer; }
.review-tab.active { background: #2f6feb; color: #fff; border-color: #2f6feb; }
.review-card { margin-top: 8px; background: #f7f9fc; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.review-total { font-weight: 600; }
.review-row { display: flex; gap: 8px; font-size: 13px; }
.review-label { color: #888; min-width: 56px; }
.review-suggestion { font-size: 13px; color: #2f6feb; }

/* V2 规律库 */
.law-library { margin-bottom: 16px; }
.law-card { border-radius: 10px; padding: 12px 14px; margin-top: 10px; border: 1px solid #eee; display: flex; flex-direction: column; gap: 6px; }
.law-card.caution { background: #fff6f5; border-color: #f3d6d2; }
.law-card.strategy { background: #f3faf4; border-color: #cfe9d6; }
.law-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.law-badge { font-size: 12px; font-weight: 600; }
.law-recur { font-size: 12px; color: #444; }
.law-conf { font-size: 11px; color: #888; margin-left: auto; }
.law-theme { font-size: 15px; font-weight: 600; color: #1c1c1e; }
.law-line { font-size: 13px; color: #555; }
.law-flag { font-size: 12px; color: #2f6feb; }
.law-actions { display: flex; gap: 8px; margin-top: 4px; }
.law-btn { font-size: 12px; padding: 4px 10px; border-radius: 6px; border: 1px solid #ccd; background: #fff; cursor: pointer; }
.law-resolved { margin-top: 12px; padding-top: 8px; border-top: 1px dashed #ddd; }
.law-resolved-title { font-size: 12px; color: #999; }
.law-resolved-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #888; margin-top: 4px; }
</style>

<style scoped>
.import-md-row { margin-top: 10px; }
.import-md-label { font-size: 13px; color: #555; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.import-md-input { font-size: 12px; }
</style>
