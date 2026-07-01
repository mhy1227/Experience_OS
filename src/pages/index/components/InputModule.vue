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
            <button
              v-if="hasModel"
              class="ghost-button find-button"
              :disabled="!draft.trim() || store.rules.length === 0 || isModelRecalling"
              @click="findExperienceWithModel"
            >
              {{ isModelRecalling ? '模型找中…' : '🧠 模型精准找' }}
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
        <!-- 规律主动浮现:刚记的这条命中了哪些已沉淀规律 -->
        <view v-if="store.decisionLaws.length" class="decision-laws">
          <text class="decision-laws-title">🔁 这关联到你已沉淀的规律:</text>
          <view v-for="law in store.decisionLaws" :key="law.id" :class="['recall-law', law.kind]">
            <text class="recall-law-badge">{{ law.kind === 'caution' ? '🟥 避坑' : '🟩 成功' }} · {{ confLabel(law.confidence) }}</text>
            <text class="recall-law-theme">{{ law.theme }}</text>
            <text v-if="law.suggestion" class="recall-law-sug">建议:{{ law.suggestion }}</text>
          </view>
        </view>
      </view>

      <!-- 找经验:把当前输入当成"我面临的场景",在做决定时浮现相关经验规则 + 规律 -->
      <view v-if="hasSearched" class="recall-results">
        <view class="section-head">
          <text class="section-title">相关经验</text>
          <text class="section-meta">{{ recalledRules.length }} 条规则 / {{ recalledLaws.length }} 条规律</text>
        </view>
        <!-- V4 决策建议卡:把召回经验的可信度+战绩合成一句结论(本地确定性 + 可选 AI 润色) -->
        <view v-if="advice" :class="['decision-advice', advice.verdict]">
          <text class="advice-label">{{ advice.label }}</text>
          <text class="advice-stats">命中 {{ advice.stats.ruleCount }} 条经验（{{ advice.stats.trustedCount }} 可信 · {{ advice.stats.unprovenCount }} 待验证）· 历史 {{ advice.stats.passed }} 有效 / {{ advice.stats.failed }} 无效<template v-if="advice.stats.successRate !== null">（有效率 {{ pct(advice.stats.successRate) }}%）</template></text>
          <text class="advice-reason">{{ polishedReason || advice.reason }}</text>
          <button v-if="hasModel" class="ghost-button small advice-polish" :disabled="isPolishing" @click="polishCurrentAdvice">
            {{ isPolishing ? '思考中…' : '🧠 让 AI 说句人话' }}
          </button>
        </view>
        <!-- 决策风险前置:召回里有需谨慎/冲突的经验时,先提醒(它们最该在决策时被看见) -->
        <view v-if="cautionCount > 0" class="recall-caution">
          ⚠️ 其中 {{ cautionCount }} 条需谨慎对待(复测冲突/分歧/走弱),采纳前先看可信度标记。
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
            hide-quick-retest
            @feedback="store.setFeedback"
            @evaluate="store.addEvaluation"
            @apply-revision="(id) => store.applyRevisionDraft(id)"
          />
          <!-- 结果回流:用这条做决定后,直接把本场景当复测证据回填,闭环在决策点完成 -->
          <view class="recall-outcome">
            <text class="recall-outcome-label">用了这条?回填结果让它进化:</text>
            <view class="recall-outcome-btns">
              <button class="evaluation-button passed" @click="markUsed(item.rule.id, 'passed')">这次有效</button>
              <button class="evaluation-button failed" @click="markUsed(item.rule.id, 'failed')">这次无效</button>
              <button class="evaluation-button uncertain" @click="markUsed(item.rule.id, 'uncertain')">不确定</button>
            </view>
            <!-- 进化指引:回填后引擎给出的"该怎么改"直接浮到决策点,不必展开评估详情 -->
            <view v-if="item.rule.revisionSuggestion" :class="['recall-evolve', item.rule.evaluationVerdict ?? 'insufficient']">
              <text class="recall-evolve-text">↻ {{ item.rule.revisionSuggestion }}</text>
              <button
                v-if="item.rule.revisionDraft"
                class="ghost-button small"
                @click="store.applyRevisionDraft(item.rule.id)"
              >采用修订</button>
            </view>
          </view>
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

        <section class="feishu-import-section">
          <h3 class="import-title">📧 从飞书多维表格导入</h3>
          <p class="import-hint">粘贴多维表格链接，或手动输入 app_token</p>
          <input
            v-model="feishuLink"
            type="text"
            class="import-textarea"
            placeholder="https://xxx.feishu.cn/base/bascnxxxxxxxxx 或直接输入 app_token"
            :disabled="isFeishuLoading"
          />
          <div v-if="feishuTables.length" class="feishu-table-select">
            <label class="import-md-label">选择表格:</label>
            <select v-model="selectedTableId" :disabled="isFeishuLoading" @change="handleFeishuTableChange">
              <option value="">请选择表格</option>
              <option v-for="t in feishuTables" :key="t.table_id" :value="t.table_id">{{ t.name }}</option>
            </select>
          </div>
          <div v-if="feishuFields.length" class="feishu-field-select">
            <label class="import-md-label">选择文本列:</label>
            <select v-model="selectedField" :disabled="isFeishuLoading">
              <option value="">请选择列</option>
              <option v-for="f in feishuFields" :key="f" :value="f">{{ f }}</option>
            </select>
          </div>
          <div class="import-actions">
            <button
              class="import-btn"
              :disabled="!feishuLink.trim() || isFeishuLoading"
              @click="handleFeishuLoadTables"
            >
              {{ isFeishuLoading ? '加载中…' : '获取表格列表' }}
            </button>
            <button
              v-if="selectedTableId && selectedField"
              class="import-btn primary"
              :disabled="isFeishuLoading"
              @click="handleFeishuImport"
            >
              {{ isFeishuLoading ? '导入中…' : '导入数据' }}
            </button>
          </div>
          <div v-if="feishuResult" class="import-result">
            <span>共 {{ feishuResult.total }} 条 · 成功 {{ feishuResult.succeeded }} · 失败 {{ feishuResult.failed }}</span>
            <span v-if="feishuResult.note" class="import-note">{{ feishuResult.note }}</span>
          </div>
        </section>
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
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useExperienceStore } from '../../../stores/experience'
import { demoSamples } from '../../../services/aiAnalyzer'
import { getBackendUrl } from '../../../services/backendClient'
import { useToast } from '../../../composables/useToast'
import DecisionHintCard from '../../../components/DecisionHintCard.vue'
import RuleCard from '../../../components/RuleCard.vue'
import { getActiveModelClient } from '../../../services/modelConfig'
import { recallRulesWithModel } from '../../../services/recallWithModel'
import { trustSignal } from '../../../services/ruleLabels'
import { synthesizeAdvice } from '../../../services/decisionAdvice'
import { polishAdvice } from '../../../services/adviceWithModel'
import type { ImportSummary } from '../../../stores/experience'
import type { EvaluationOutcome, ExperienceRule, Law, Observation } from '../../../types/experience'

const store = useExperienceStore()
const router = useRouter()
const { show: showToast } = useToast()

const draft = ref('')
const importText = ref('')
const isImporting = ref(false)
const importResult = ref<ImportSummary | null>(null)

const feishuLink = ref('')
const feishuTables = ref<{ table_id: string; name: string }[]>([])
const feishuFields = ref<string[]>([])
const selectedTableId = ref('')
const selectedField = ref('')
const isFeishuLoading = ref(false)
const feishuResult = ref<ImportSummary | null>(null)

// 找经验:决策时召回相关经验
const hasSearched = ref(false)
const lastScene = ref('')
const recalledRules = ref<{ rule: ExperienceRule; reasons: string[] }[]>([])
const recalledLaws = ref<Law[]>([])
const isModelRecalling = ref(false)
const hasModel = computed(() => Boolean(getActiveModelClient()))
const cautionCount = computed(() => recalledRules.value.filter((x) => trustSignal(x.rule).level === 'caution').length)

// V4 决策建议:把召回经验合成一档结论(纯本地);AI 润色 opt-in。
const advice = computed(() => synthesizeAdvice(recalledRules.value, recalledLaws.value))
const polishedReason = ref('')
const isPolishing = ref(false)
watch(recalledRules, () => { polishedReason.value = '' })
function pct(rate: number): number {
  return Math.round(rate * 100)
}
async function polishCurrentAdvice() {
  const current = advice.value
  if (!current || isPolishing.value) return
  const client = getActiveModelClient()
  if (!client) return
  isPolishing.value = true
  try {
    polishedReason.value = await polishAdvice(lastScene.value, current, client)
  } catch {
    // 失败保留本地 reason
  } finally {
    isPolishing.value = false
  }
}

function ruleEvidence(rule: ExperienceRule) {
  return rule.evidenceIds.map((id) => store.observations.find((o) => o.id === id)).filter((o): o is Observation => Boolean(o))
}
function confLabel(c: string): string {
  return c === 'high' ? '高置信' : c === 'medium' ? '中置信' : '低置信·参考'
}
// 用了某条召回规则后,把当前场景作为本次复测证据回填(source=recall),并刷新召回结果
function markUsed(ruleId: string, outcome: EvaluationOutcome) {
  const scene = lastScene.value.trim()
  if (!scene) return
  store.addEvaluation(ruleId, outcome, '来自「找经验」场景的一键回填。', scene, 'recall')
  showToast('已回填结果,这条经验会据此进化')
  refreshRecall(scene)
}

function findExperience() {
  const scene = draft.value.trim()
  if (!scene || store.rules.length === 0) return
  lastScene.value = scene
  refreshRecall(scene)
}

// 可选:模型语义召回。模型只从已有规则里挑 id(防幻觉);失败/无 client 自动降级关键词。
async function findExperienceWithModel() {
  const scene = draft.value.trim()
  if (!scene || store.rules.length === 0 || isModelRecalling.value) return
  const client = getActiveModelClient()
  if (!client) { findExperience(); return }
  lastScene.value = scene
  isModelRecalling.value = true
  try {
    const matched = await recallRulesWithModel(scene, store.rules, client)
    hasSearched.value = true
    recalledRules.value = matched.map((m) => ({ rule: m.rule, reasons: [m.why] }))
    recalledLaws.value = store.recallRelatedLaws(scene)
  } catch {
    showToast('模型召回失败,已按关键词召回')
    refreshRecall(scene)
  } finally {
    isModelRecalling.value = false
  }
}

function refreshRecall(scene: string) {
  hasSearched.value = true
  recalledRules.value = store
    .recallEvaluationCandidates(scene)
    // 召回打分器会给"评估次数不足"等加分(本为挑复测用);找经验只要真正内容命中的(reason 含"匹配")
    .filter((c) => c.reasons.some((r) => r.includes('匹配')))
    .map((c) => ({ rule: store.rules.find((r) => r.id === c.ruleId), reasons: c.reasons.filter((r) => r.includes('匹配')) }))
    .filter((x): x is { rule: ExperienceRule; reasons: string[] } => Boolean(x.rule))
  recalledLaws.value = store.recallRelatedLaws(scene)
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
  showToast(`演示数据已载入，共 ${store.observations.length} 条观察`)
}

function parseFeishuLink(link: string): { app_token: string; table_id?: string } | null {
  const baseMatch = link.match(/base\/([^/?#]+)/)
  if (baseMatch) {
    const app_token = baseMatch[1]
    const tableMatch = link.match(/[?&]table=([^&]+)/)
    return { app_token, table_id: tableMatch?.[1] }
  }

  if (link.length > 0 && !link.includes('http')) {
    return { app_token: link.trim() }
  }

  return null
}

async function handleFeishuLoadTables() {
  const link = feishuLink.value.trim()
  if (!link || isFeishuLoading.value) return
  const parsed = parseFeishuLink(link)
  if (!parsed) {
    showToast('无法解析飞书链接，请粘贴完整的多维表格分享链接')
    return
  }
  isFeishuLoading.value = true
  try {
    const backendUrl = getBackendUrl()
    if (!backendUrl) {
      showToast('需要配置后端地址才能使用飞书导入')
      return
    }
    const resp = await fetch(`${backendUrl}/api/feishu/tables?app_token=${parsed.app_token}`)
    const json = await resp.json()
    if (json.error) {
      showToast(`获取表格失败: ${json.error}`)
      return
    }
    feishuTables.value = json.tables || []
    feishuFields.value = []
    selectedTableId.value = parsed.table_id || ''
    if (selectedTableId.value) {
      await handleFeishuLoadFields(parsed.app_token, selectedTableId.value)
    }
    if (feishuTables.value.length === 0) {
      showToast('未找到表格，请确保应用已被授权访问该多维表格')
    }
  } catch (e) {
    showToast(`获取表格失败: ${(e as Error).message}`)
  } finally {
    isFeishuLoading.value = false
  }
}

async function handleFeishuLoadFields(app_token: string, table_id: string) {
  const backendUrl = getBackendUrl()
  if (!backendUrl) return
  const resp = await fetch(`${backendUrl}/api/feishu/fields?app_token=${app_token}&table_id=${table_id}`)
  const json = await resp.json()
  if (json.error) return
  feishuFields.value = (json.fields || []).map((f: { field_name: string }) => f.field_name)
}

async function handleFeishuTableChange() {
  const link = feishuLink.value.trim()
  if (!link || !selectedTableId.value) return
  const parsed = parseFeishuLink(link)
  if (!parsed) return
  await handleFeishuLoadFields(parsed.app_token, selectedTableId.value)
}

async function handleFeishuImport() {
  const link = feishuLink.value.trim()
  if (!link || !selectedTableId.value || !selectedField.value || isFeishuLoading.value) return
  const parsed = parseFeishuLink(link)
  if (!parsed) {
    showToast('无法解析飞书链接')
    return
  }
  isFeishuLoading.value = true
  try {
    const backendUrl = getBackendUrl()
    if (!backendUrl) {
      showToast('需要配置后端地址才能使用飞书导入')
      return
    }
    const resp = await fetch(`${backendUrl}/api/feishu/records?app_token=${parsed.app_token}&table_id=${selectedTableId.value}&field_name=${encodeURIComponent(selectedField.value)}`)
    const json = await resp.json()
    if (json.error) {
      showToast(`导入失败: ${json.error}`)
      return
    }
    const rows = json.rows || []
    if (rows.length === 0) {
      showToast('未找到数据')
      return
    }
    const texts = rows.map((r: { text: string }) => r.text)
    const ok = window.confirm(`将从飞书导入 ${rows.length} 条经验，约需 ${rows.length} 次模型调用。继续？`)
    if (!ok) return
    feishuResult.value = await store.importObservationsViaBackend(texts)
    showToast(`已导入 ${feishuResult.value.succeeded} 条经验`)
  } catch (e) {
    showToast(`导入失败: ${(e as Error).message}`)
  } finally {
    isFeishuLoading.value = false
  }
}
</script>

<style scoped>
.more-panel { margin-top: 12px; border: 1px dashed var(--line-strong); border-radius: var(--r-sm); padding: 8px 12px; }
.more-summary { cursor: pointer; font-size: 13px; color: var(--ink-faint); font-weight: 600; }
.more-panel[open] .more-summary { margin-bottom: 8px; }

.composer-buttons { display: flex; gap: 8px; align-items: center; }
.find-button { white-space: nowrap; }

.recall-results { margin-top: 16px; }
.recall-caution {
  margin: 6px 0 4px;
  padding: 8px 12px;
  background: var(--warn-wash);
  border: 1px solid rgba(168, 103, 31, 0.28);
  border-radius: var(--r-sm);
  color: var(--warn);
  font-size: 13px;
}
.recall-laws { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.recall-law {
  border: 1px solid var(--line);
  border-left: 3px solid var(--brand);
  border-radius: var(--r-sm);
  padding: 10px 12px;
  background: var(--surface-sunken);
}
.recall-law.caution { border-left-color: var(--warn); }
.recall-law-badge { display: block; font-size: 12px; color: var(--ink-faint); margin-bottom: 4px; }
.recall-law-theme { display: block; font-size: 14px; font-weight: 600; color: var(--ink); }
.recall-law-sug { display: block; font-size: 13px; color: var(--ink-soft); margin-top: 4px; }
.decision-laws { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.decision-laws-title { font-size: 13px; font-weight: 600; color: var(--ink-soft); }
.recall-rule { margin-top: 8px; }
.recall-reason { display: block; font-size: 12px; color: var(--ink-faint); margin-bottom: 2px; }
.recall-outcome {
  margin-top: 6px;
  padding: 8px 10px;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
}
.recall-outcome-label { display: block; font-size: 12px; color: var(--ink-faint); margin-bottom: 6px; }
.recall-outcome-btns { display: flex; gap: 8px; }
.recall-evolve {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: var(--r-sm);
  background: var(--surface);
  border-left: 3px solid var(--line);
}
.recall-evolve.conflicted { border-left-color: var(--danger, #c0392b); }
.recall-evolve.mixed { border-left-color: var(--warn, #c9871f); }
.recall-evolve.supported { border-left-color: var(--brand); }
.recall-evolve-text { flex: 1; font-size: 12px; line-height: 1.5; color: var(--ink-soft); }

.feishu-import-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.feishu-table-select,
.feishu-field-select {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.feishu-table-select select,
.feishu-field-select select {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
  font-size: 13px;
}
.import-btn.primary {
  background: var(--brand);
  color: white;
}
</style>
