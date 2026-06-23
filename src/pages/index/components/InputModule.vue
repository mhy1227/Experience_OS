<!-- 录入模块:快速记录 + 批量导入。导航/筛选/toast 等页面级副作用通过 emit 交回 index.vue。 -->
<template>
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
          <view class="composer-buttons">
            <button
              class="ghost-button find-button"
              :disabled="!draft.trim() || store.rules.length === 0"
              @click="findExperience"
            >
              找经验
            </button>
            <button class="primary-button" :disabled="!canSubmit" @click="submit">
              {{ store.isAnalyzing ? '提炼中' : '生成规则' }}
            </button>
          </view>
        </view>

        <!-- M4 决策辅助提醒 -->
        <DecisionHintCard
          :hints="store.decisionHints"
          @dismiss="store.dismissDecisionHint"
        />
      </view>

      <!-- 找经验:把当前输入当成"我面临的场景",在做决定时浮现相关经验规则 + 规律 -->
      <view v-if="hasSearched" class="recall-results">
        <view class="section-head">
          <text class="section-title">相关经验</text>
          <text class="section-meta">{{ recalledRules.length }} 条规则 / {{ recalledLaws.length }} 条规律</text>
        </view>
        <view v-if="recalledRules.length === 0 && recalledLaws.length === 0" class="empty">
          还没有匹配的经验。多记几条,下次做类似决定时,相关规则会自动浮现在这里。
        </view>
        <view v-if="recalledLaws.length" class="recall-laws">
          <view v-for="law in recalledLaws" :key="law.id" :class="['recall-law', law.kind]">
            <text class="recall-law-badge">{{ law.kind === 'caution' ? '🟥 避坑' : '🟩 成功' }} · {{ confLabel(law.confidence) }}</text>
            <text class="recall-law-theme">{{ law.theme }}</text>
            <text v-if="law.suggestion" class="recall-law-sug">建议:{{ law.suggestion }}</text>
          </view>
        </view>
        <view v-for="item in recalledRules" :key="item.rule.id" class="recall-rule">
          <text class="recall-reason">🔎 {{ item.reasons.join('；') }}</text>
          <RuleCard
            :rule="item.rule"
            :evidence="ruleEvidence(item.rule)"
            compact
            @feedback="store.setFeedback"
            @evaluate="store.addEvaluation"
            @apply-revision="(id) => store.applyRevisionDraft(id)"
          />
        </view>
      </view>

      <!-- 批量导入 + 数据管理:默认折叠,精简首屏 -->
      <details class="more-panel">
        <summary class="more-summary">批量导入 / 数据管理</summary>
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
      </details>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useExperienceStore } from '../../../stores/experience'
import { demoSamples } from '../../../services/aiAnalyzer'
import { getBackendUrl } from '../../../services/backendClient'
import { useToast } from '../../../composables/useToast'
import DecisionHintCard from '../../../components/DecisionHintCard.vue'
import RuleCard from '../../../components/RuleCard.vue'
import type { ImportSummary } from '../../../stores/experience'
import type { ExperienceRule, Law, Observation } from '../../../types/experience'

const store = useExperienceStore()
const router = useRouter()
const { show: showToast } = useToast()

const draft = ref('')
const importText = ref('')
const isImporting = ref(false)
const importResult = ref<ImportSummary | null>(null)

// 找经验:决策时召回相关经验
const hasSearched = ref(false)
const recalledRules = ref<{ rule: ExperienceRule; reasons: string[] }[]>([])
const recalledLaws = ref<Law[]>([])

function ruleEvidence(rule: ExperienceRule) {
  return rule.evidenceIds.map((id) => store.observations.find((o) => o.id === id)).filter((o): o is Observation => Boolean(o))
}
function confLabel(c: string): string {
  return c === 'high' ? '高置信' : c === 'medium' ? '中置信' : '低置信·参考'
}
// 中文无分词:用 2-gram 子串重合做轻量相关性判断
function shareKeyword(a: string, b: string): boolean {
  const clean = (s: string) => s.toLowerCase().replace(/[\s,.。，、!！?？;；:：「」""''()（）]/g, '')
  const x = clean(a)
  const y = clean(b)
  if (!x || !y) return false
  for (let i = 0; i + 2 <= x.length; i++) {
    if (y.includes(x.slice(i, i + 2))) return true
  }
  return false
}
function findExperience() {
  const scene = draft.value.trim()
  if (!scene || store.rules.length === 0) return
  hasSearched.value = true
  recalledRules.value = store
    .recallEvaluationCandidates(scene)
    // 召回打分器会给"评估次数不足"等加分(本为挑复测用);找经验只要真正内容命中的(reason 含"匹配")
    .filter((c) => c.reasons.some((r) => r.includes('匹配')))
    .map((c) => ({ rule: store.rules.find((r) => r.id === c.ruleId), reasons: c.reasons.filter((r) => r.includes('匹配')) }))
    .filter((x): x is { rule: ExperienceRule; reasons: string[] } => Boolean(x.rule))
  recalledLaws.value = store.laws
    .filter((l) => l.status !== 'resolved' && [l.theme, l.rootCause, l.suggestion].some((t) => t && shareKeyword(scene, t)))
    .sort((a, b) => b.recurrence - a.recurrence)
    .slice(0, 3)
}

const canSubmit = computed(() => draft.value.trim().length > 0 && !store.isAnalyzing && !store.isSeedingDemo)
const canLoadDemo = computed(() => !store.isAnalyzing && !store.isSeedingDemo)
const demoLoadLabel = computed(() => (store.isSeedingDemo ? '载入中' : '载入演示数据'))
const isScanningAll = computed(() => store.isComputingInsights || store.isScanningLaws)

async function submit() {
  const text = draft.value
  draft.value = ''
  await store.submitObservation(text)
}

async function handleScan() {
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
    importText.value = ''
    isImporting.value = false
  }
}

async function handleMarkdownFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || isImporting.value) return
  try {
    const text = await file.text()
    const { parseMarkdownToObservations } = await import('../../../services/markdownImport')
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
    input.value = ''
  }
}

async function loadDemoData() {
  await store.loadDemoData()
  router.push('/rules')
}

function clearData() {
  store.clearAll()
  draft.value = ''
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
    `确认清空全部本地数据？\n当前有 ${store.observations.length} 条观察、${store.rules.length} 条规则。\n此操作不可撤销。`,
  )
  if (!confirmed) return
  const { observationCount, ruleCount } = store.clearAllData()
  draft.value = ''
  showToast(`已清空 ${observationCount} 条观察、${ruleCount} 条规则`)
}

async function handleLoadDemoWork() {
  const confirmed = store.observations.length === 0 || window.confirm('载入演示数据将清空现有数据，确认继续？')
  if (!confirmed) return
  await store.loadDemoWorkData()
  router.push('/rules')
  showToast('演示工作数据已载入，共 35 条观察')
}
</script>

<style scoped>
.more-panel { margin-top: 12px; border: 1px dashed #d6ddd6; border-radius: 8px; padding: 8px 12px; }
.more-summary { cursor: pointer; font-size: 13px; color: #6b7a73; font-weight: 600; }
.more-panel[open] .more-summary { margin-bottom: 8px; }

.composer-buttons { display: flex; gap: 8px; align-items: center; }
.find-button { white-space: nowrap; }

.recall-results { margin-top: 16px; }
.recall-laws { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.recall-law {
  border: 1px solid #dfe5dc;
  border-left: 4px solid #9bb39e;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fbfcf8;
}
.recall-law.caution { border-left-color: #d98b8b; }
.recall-law-badge { display: block; font-size: 12px; color: #6b7a73; margin-bottom: 4px; }
.recall-law-theme { display: block; font-size: 14px; font-weight: 600; color: #252923; }
.recall-law-sug { display: block; font-size: 13px; color: #4d5a4e; margin-top: 4px; }
.recall-rule { margin-top: 8px; }
.recall-reason { display: block; font-size: 12px; color: #6b7a73; margin-bottom: 2px; }
</style>
