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
          <!-- 经验资产管理 -->
          <div class="asset-actions">
            <button class="btn-load-work-demo" :disabled="store.isSeedingDemo" @click="handleLoadDemoWork">
              {{ store.isSeedingDemo ? '载入中…' : '载入演示工作数据' }}
            </button>
            <button class="btn-export-md" @click="handleExportMarkdown" :disabled="store.observations.length === 0">
              导出经验资产 (.md)
            </button>
            <button class="btn-clear-all" @click="handleClearAll">
              一键清空本地数据
            </button>
          </div>
          <button
            class="primary-button scan-button"
            :disabled="store.observations.filter(o => o.status === 'success').length < 3 || isScanningAll"
            @click="handleScan"
          >
            {{ isScanningAll ? '扫描中…' : '扫描我的 90 天' }}
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
        <div class="import-md-row">
          <label class="import-md-label">📄 从 .md / .txt 文件导入
            <input
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              class="import-md-input"
              :disabled="isImporting"
              @change="handleMarkdownFile"
            />
          </label>
        </div>
        <!-- 结果反馈 -->
        <div v-if="importResult" class="import-result">
          <span>共 {{ importResult.total }} 条 · 成功 {{ importResult.succeeded }} · 失败 {{ importResult.failed }}</span>
          <span v-if="importResult.note" class="import-note">{{ importResult.note }}</span>
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
        <button
          class="tab"
          :class="{ active: showAdvancedPanel }"
          @click="showAdvancedPanel = !showAdvancedPanel"
        >
          高级
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

      <view v-if="showAdvancedPanel" class="panel advanced-panel">
        <EvaluationWorkbench />
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

type TabKey = 'records' | 'rules' | 'map' | 'timeline' | 'insights'

const store = useExperienceStore()

const importText = ref('')
const isImporting = ref(false)
const importResult = ref<ImportSummary | null>(null)

// V2 规律库扫描:同时建洞察 + 规律(规律库/复盘的展示与排序已移入 LawLibrary.vue)
const isScanningAll = computed(() => store.isComputingInsights || store.isScanningLaws)
async function handleScan() {
  // 错误隔离:两步各自降级(store 内已不抛),这里再兜一层,避免未捕获 rejection
  try { await store.scanLaws() } catch { /* 已降级 */ }
  try { await store.computeInsights('过去 90 天') } catch { /* 已降级 */ }
}

async function handleImport() {
  const text = importText.value.trim()
  if (!text || isImporting.value) return
  isImporting.value = true
  importResult.value = null
  try {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    importResult.value = getBackendUrl()
      ? await store.importObservationsViaBackend(lines)
      : await store.importObservations(text)
  } finally {
    // 无论成功/失败/并发被阻断,均清除输入框,避免旧输入与旧结果摘要同时显示
    importText.value = ''
    isImporting.value = false
  }
}

// 从 .md/.txt 文件导入:解析内容为候选经验(0 token)→ 确认 → 复用批量导入管线
async function handleMarkdownFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || isImporting.value) return
  try {
    const text = await file.text()
    const { parseMarkdownToObservations } = await import('../../services/markdownImport')
    const parsed = await parseMarkdownToObservations(text)
    if (parsed.observations.length === 0) {
      showToast('未从文件解析出可导入的经验')
      return
    }
    const truncNote = parsed.truncated ? `（已截断，原 ${parsed.totalParsed} 条）` : ''
    const ok = window.confirm(
      `将从「${file.name}」导入 ${parsed.observations.length} 条经验${truncNote}，约需 ${parsed.observations.length} 次模型调用。继续？`,
    )
    if (!ok) return
    isImporting.value = true
    importResult.value = null
    importResult.value = getBackendUrl()
      ? await store.importObservationsViaBackend(parsed.observations)
      : await store.importObservations(parsed.observations.join('\n'))
  } finally {
    isImporting.value = false
    input.value = '' // 允许重选同一文件
  }
}

const draft = ref('')
const activeTab = ref<TabKey>('records')
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
  { key: 'records', label: '经验' },
  { key: 'rules', label: '规则库' },
  { key: 'map', label: '地图' },
  { key: 'timeline', label: '时间轴' },
  { key: 'insights', label: '规律发现' },
]

const showAdvancedPanel = ref(false)

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

function handleExportMarkdown() {
  const md = store.exportAsMarkdown()
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `experience-os-export-${new Date().toISOString().slice(0, 10)}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function handleClearAll() {
  const confirmed = window.confirm(
    `确认清空全部本地数据？\n当前有 ${store.observations.length} 条观察、${store.rules.length} 条规则。\n此操作不可撤销。`
  )
  if (!confirmed) return
  const { observationCount, ruleCount } = store.clearAllData()
  draft.value = ''
  ruleQuery.value = ''
  selectedCategory.value = '全部'
  activeTab.value = 'records'
  showToast(`已清空 ${observationCount} 条观察、${ruleCount} 条规则`)
}

async function handleLoadDemoWork() {
  const confirmed = store.observations.length === 0
    || window.confirm('载入演示数据将清空现有数据，确认继续？')
  if (!confirmed) return
  await store.loadDemoWorkData()
  activeTab.value = 'rules'
  showToast('演示工作数据已载入，共 35 条观察')
}

function toggleCategory(category: ExperienceCategory) {
  selectedCategory.value = selectedCategory.value === category ? '全部' : category
}

function resetFilters() {
  selectedCategory.value = '全部'
  ruleQuery.value = ''
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
.eval-toggle {
  margin-top: 10px;
  align-self: flex-start;
  background: transparent;
  border: 1px dashed #cdd6d2;
  color: #6b7a73;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.eval-toggle:hover { color: #246a53; border-color: #246a53; }
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

.advanced-panel-notice {
  padding: 8px 12px;
  background: #f3f4f6;
  border-radius: 6px;
  margin-bottom: 12px;
}
.advanced-panel-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  display: block;
}
.advanced-panel-desc {
  font-size: 11px;
  color: #9ca3af;
  display: block;
}

.settings-panel {
  padding: 0 16px 16px;
}

.trust-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #f0f9ff;
  border-bottom: 1px solid #bae6fd;
  font-size: 13px;
  color: #0369a1;

  .trust-icon { font-size: 14px; }
  .trust-text { flex: 1; }
}

.asset-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 8px 0;

  .btn-load-work-demo {
    padding: 6px 14px;
    background: #7c3aed;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  .btn-export-md {
    padding: 6px 14px;
    background: #0ea5e9;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
  }

  .btn-clear-all {
    padding: 6px 14px;
    background: white;
    color: #dc2626;
    border: 1px solid #dc2626;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    &:hover { background: #fef2f2; }
  }
}

.toast-notification {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 9999;
  pointer-events: none;
}
</style>

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
