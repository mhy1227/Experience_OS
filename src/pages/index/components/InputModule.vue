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
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useExperienceStore } from '../../../stores/experience'
import { demoSamples } from '../../../services/aiAnalyzer'
import { getBackendUrl } from '../../../services/backendClient'
import { useToast } from '../../../composables/useToast'
import DecisionHintCard from '../../../components/DecisionHintCard.vue'
import type { ImportSummary } from '../../../stores/experience'

const store = useExperienceStore()
const router = useRouter()
const { show: showToast } = useToast()

const draft = ref('')
const importText = ref('')
const isImporting = ref(false)
const importResult = ref<ImportSummary | null>(null)

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
