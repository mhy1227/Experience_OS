# Plan 4: M4 决策辅助 + API Key 配置 UI + 评估体系降级 + 删死文件

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 四项并行收尾:① M4 决策辅助——录入新观察后主动召回历史规律并提醒用户;② API Key 配置 UI——让用户在设置页填写 provider/model/baseUrl/apiKey;③ 评估体系 UI 折叠降级——隐藏评估工作台入口,折叠进高级面板(不删代码);④ 删除 uni-app 死文件 `src/manifest.json`、`src/pages.json`。

**Architecture:**
- M4 逻辑层:新建纯函数 `recallDecisionHints(text, rules, observations)`,复用 store 内已有的 `scoreEvaluationCandidate` / `tokenize` / `normalizeText` 底层函数,提取到独立 service 便于测试。store 的 `submitObservation` 完成分析后调用该函数,将 reminder 写入响应式状态 `decisionHints`。UI 在输入框下方以可忽略卡片渲染。
- API Key UI:在 `index.vue` 新增"设置"tab/侧边按钮,内嵌 `<ModelConfigPanel>` 组件;组件直接读写 `localStorage['experience-os:model']`,复用 `modelConfig.ts` 已有常量。演示默认 key 由 `main.ts` 注入,不被覆盖。导出/导入排除 `apiKey` 字段。
- 评估降级:把 `index.vue` 中 tab `key: 'evaluations'` 对应的 `<view>` 整体用 `v-if="showAdvancedPanel"` 包裹,并把该 tab 改为"高级"(或从 tabs 数组移除,改为底部一个折叠按钮),`showAdvancedPanel` 默认 `false`。evaluationEngine.ts 代码一行不删。
- 删死文件:先 grep 确认无引用,再 `git rm`。

**Tech Stack:** Vue 3 + Pinia + Vite + TypeScript;测试为纯 TS,经 `tsconfig.test.json` 编译到 `dist-tests/` 后用 `node` + `node:assert/strict` 运行(非 vitest/jest)。

**依赖:** Plan 1(真模型接入)、Plan 2(批量导入)、Plan 3(M3 规律发现)已完成。

---

## Global Constraints

- 不重写已完成部分,只在调用点做最小替换或追加。
- 不新增运行时依赖(仅用 vue/pinia + 浏览器 API)。
- **evaluationEngine.ts 一行不删**;仅隐藏 UI 入口。
- API Key **绝不提交进仓库、绝不上云**;导出数据时 `apiKey` 字段必须排除。
- 测试文件用 `node:assert/strict`,以 `async function` + 末尾 `void run()` 组织(沿用已有测试风格)。
- 大文件(`index.vue`、`experience.ts`)新功能优先拆成独立组件,勿继续膨胀。
- 删死文件前必须先 grep 确认全局无引用。

---

## File Structure

- `src/services/decisionHints.ts`(新建):纯函数 `recallDecisionHints(text, rules, observations, threshold?)` → `DecisionHint[]`。可测。
- `src/components/DecisionHintCard.vue`(新建):展示 hint 提醒卡片,支持 dismiss。
- `src/components/ModelConfigPanel.vue`(新建):API Key 配置面板 UI 组件。
- `src/stores/experience.ts`(修改):追加 `decisionHints` 响应式状态 + `submitObservation` 后置调用 + 导出排除 apiKey。
- `src/pages/index/index.vue`(修改):① 引入 `DecisionHintCard` 渲染 hints;② 引入 `ModelConfigPanel` 作为设置入口;③ 将评估工作台折叠为高级面板。
- `tests/decisionHints.test.ts`(新建)。
- `package.json`(修改):`test:evaluation` 脚本追加新测试。

---

## Task 1: M4 决策辅助——逻辑层

**Files:**
- Create: `src/services/decisionHints.ts`
- Test: `tests/decisionHints.test.ts`

**Interfaces:**
- Consumes: `ExperienceRule`、`Observation` from `../types/experience`。
- Produces:
  ```ts
  export interface DecisionHint {
    ruleId: string
    ruleTitle: string
    conclusion: string
    recommendation: string
    score: number
    matchReasons: string[]
  }
  export function recallDecisionHints(
    text: string,
    rules: ExperienceRule[],
    observations: Observation[],
    threshold?: number,   // 默认 3,过滤低相关度
  ): DecisionHint[]
  ```

- [ ] **Step 1: 写失败测试**

`tests/decisionHints.test.ts`:
```ts
import assert from 'node:assert/strict'
import { recallDecisionHints } from '../src/services/decisionHints'
import type { ExperienceRule, Observation } from '../src/types/experience'

const baseRule: ExperienceRule = {
  id: 'rule_1',
  title: '周末低峰训练策略',
  category: '运动',
  conclusion: '周末上午10点健身房人少器械空闲',
  recommendation: '把高强度训练排到周末上午',
  conditions: ['周末', '上午10点'],
  warnings: [],
  evidenceIds: ['obs_1'],
  reusability: 'high',
  feedback: 'none',
  reviewStatus: 'validated',
  evaluations: [],
  evaluationVerdict: 'supported',
  revisionSuggestion: '',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const obs: Observation = {
  id: 'obs_1',
  text: '周末10点健身房人少，器械不用排队',
  category: '运动',
  tags: ['健身', '周末'],
  summary: '周末低峰',
  status: 'success',
  createdAt: '2026-01-01T00:00:00.000Z',
}

async function testReturnsHintOnHighRelevance() {
  const hints = recallDecisionHints('周末上午去健身房', [baseRule], [obs])
  assert.ok(hints.length > 0, '相关规则应命中')
  assert.equal(hints[0].ruleId, 'rule_1')
  assert.ok(hints[0].score >= 3, '分数应达到默认阈值')
  assert.ok(hints[0].matchReasons.length > 0, '应有匹配理由')
}

async function testReturnsEmptyForIrrelevantText() {
  const hints = recallDecisionHints('今天吃了一碗面', [baseRule], [obs])
  assert.equal(hints.length, 0, '无关文本不应命中规则')
}

async function testRespectsCustomThreshold() {
  // threshold=999 → 无法命中
  const hints = recallDecisionHints('周末健身房', [baseRule], [obs], 999)
  assert.equal(hints.length, 0, '高阈值不应命中')
}

async function testSortsByScoreDescending() {
  const rule2: ExperienceRule = {
    ...baseRule,
    id: 'rule_2',
    title: '周末超市低峰采购',
    conclusion: '周末上午超市人少',
    recommendation: '周末上午去超市',
  }
  const hints = recallDecisionHints('周末上午', [baseRule, rule2], [obs])
  if (hints.length >= 2) {
    assert.ok(hints[0].score >= hints[1].score, '应按分数降序')
  }
}

async function testExcludesWatchReusability() {
  const watchRule: ExperienceRule = {
    ...baseRule,
    id: 'rule_watch',
    reusability: 'watch',
  }
  const hints = recallDecisionHints('周末健身房', [watchRule], [obs])
  assert.equal(hints.length, 0, 'watch 级别规则不应出现在决策提醒')
}

async function run() {
  await testReturnsHintOnHighRelevance()
  await testReturnsEmptyForIrrelevantText()
  await testRespectsCustomThreshold()
  await testSortsByScoreDescending()
  await testExcludesWatchReusability()
  console.log('decisionHints tests passed')
}

void run()
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/decisionHints.test.js`
Expected: FAIL(`Cannot find module '../src/services/decisionHints'`)。

- [ ] **Step 3: 写最小实现**

`src/services/decisionHints.ts`:
```ts
import type { ExperienceRule, Observation } from '../types/experience'

export interface DecisionHint {
  ruleId: string
  ruleTitle: string
  conclusion: string
  recommendation: string
  score: number
  matchReasons: string[]
}

const DEFAULT_THRESHOLD = 3

/**
 * 对新录入文本召回相关历史规则,产出决策提醒列表。
 * 复用 experience.ts 内已有的分词/评分思路,此处为独立纯函数版本,可被测试。
 * - reusability === 'watch' 的规则排除(尚不稳定,不宜作为决策依据)
 * - 按 score 降序,最多返回 3 条
 */
export function recallDecisionHints(
  text: string,
  rules: ExperienceRule[],
  observations: Observation[],
  threshold = DEFAULT_THRESHOLD,
): DecisionHint[] {
  const content = text.trim()
  if (!content) return []

  return rules
    .filter((rule) => rule.reusability !== 'watch')
    .map((rule) => scoreRule(rule, content, observations))
    .filter((hint) => hint.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

// ---------- 内部评分 ----------

function scoreRule(rule: ExperienceRule, text: string, observations: Observation[]): DecisionHint {
  const sceneTokens = tokenize(text)
  const normalizedScene = normalizeText(text)

  const evidenceTexts = rule.evidenceIds
    .map((id) => observations.find((obs) => obs.id === id)?.text)
    .filter((t): t is string => Boolean(t))

  const fields = [
    { label: '标题', weight: 4, text: rule.title },
    { label: '结论', weight: 3, text: rule.conclusion },
    { label: '行动建议', weight: 3, text: rule.recommendation },
    { label: '地点', weight: 3, text: rule.location ?? '' },
    { label: '适用条件', weight: 2, text: rule.conditions.join(' ') },
    { label: '证据', weight: 1, text: evidenceTexts.join(' ') },
  ]

  let score = 0
  const reasons: string[] = []

  for (const field of fields) {
    if (!field.text) continue
    const fieldText = normalizeText(field.text)
    const matched = sceneTokens.filter((token) => fieldText.includes(token))
    if (matched.length > 0) {
      score += matched.length * field.weight
      reasons.push(`${field.label}匹配：${uniqueArr(matched).slice(0, 3).join('、')}`)
    }
    if (fieldText && normalizedScene.includes(fieldText)) {
      score += field.weight * 2
    }
  }

  return {
    ruleId: rule.id,
    ruleTitle: rule.title,
    conclusion: rule.conclusion,
    recommendation: rule.recommendation,
    score,
    matchReasons: uniqueArr(reasons),
  }
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value)
  const tokens: string[] = normalized.match(/[a-z0-9]+|[一-龥]{2,}/g) ?? []
  const chunks = tokens.flatMap((token) => {
    if (!/[一-龥]/.test(token) || token.length <= 4) return [token]
    const result: string[] = []
    for (let i = 0; i <= token.length - 2; i += 1) {
      result.push(token.slice(i, i + 2))
    }
    return [token, ...result]
  })
  return uniqueArr(chunks.filter((t) => t.length >= 2))
}

function uniqueArr<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/decisionHints.test.js`
Expected: PASS,输出 `decisionHints tests passed`。

- [ ] **Step 5: Commit**

```bash
git add src/services/decisionHints.ts tests/decisionHints.test.ts
git commit -m "feat: add M4 decisionHints pure-function recall service"
```

---

## Task 2: M4 决策辅助——Store 接入 + UI 渲染

**Files:**
- Modify: `src/stores/experience.ts`(追加 `decisionHints` 状态 + `submitObservation` 后置调用)
- Create: `src/components/DecisionHintCard.vue`
- Modify: `src/pages/index/index.vue`(渲染 hint 卡片)

**Interfaces:**
- Store 新增导出:`decisionHints: Ref<DecisionHint[]>`、`dismissDecisionHint(ruleId: string): void`
- `submitObservation` 完成提炼后追加一行:`decisionHints.value = recallDecisionHints(content, rules.value, observations.value)`
- `DecisionHintCard.vue`:接收 prop `hints: DecisionHint[]`,emit `dismiss(ruleId: string)`;点击"×"关闭单条,整组为空时自动隐藏

- [ ] **Step 1: 修改 store——追加状态与调用**

在 `src/stores/experience.ts` 中:

1. 顶部 import 追加:
```ts
import { recallDecisionHints, type DecisionHint } from '../services/decisionHints'
```

2. 在 `const isAnalyzing = ref(false)` 附近(已有声明区)追加:
```ts
const decisionHints = ref<DecisionHint[]>([])
```

3. 在 `submitObservation` 函数的 `try` 块内,`latestRuleId.value = rule.id` 之后追加:
```ts
// M4 决策辅助:分析完成后召回相关历史规则
decisionHints.value = recallDecisionHints(content, rules.value, observations.value)
```

4. 在 store return 对象末尾追加:
```ts
    decisionHints,
    dismissDecisionHint(ruleId: string) {
      decisionHints.value = decisionHints.value.filter((h) => h.ruleId !== ruleId)
    },
```

- [ ] **Step 2: 新建 DecisionHintCard 组件**

`src/components/DecisionHintCard.vue`:
```vue
<template>
  <view v-if="hints.length > 0" class="decision-hint-area">
    <view class="decision-hint-header">
      <text class="decision-hint-title">历史规律提醒</text>
      <text class="decision-hint-meta">{{ hints.length }} 条相关经验</text>
    </view>
    <view v-for="hint in hints" :key="hint.ruleId" class="decision-hint-card">
      <view class="hint-card-head">
        <text class="hint-rule-title">{{ hint.ruleTitle }}</text>
        <button class="hint-dismiss" @click="$emit('dismiss', hint.ruleId)">×</button>
      </view>
      <text class="hint-conclusion">{{ hint.conclusion }}</text>
      <text class="hint-recommendation">建议:{{ hint.recommendation }}</text>
      <view v-if="hint.matchReasons.length > 0" class="hint-reasons">
        <text v-for="reason in hint.matchReasons" :key="reason" class="hint-reason-tag">{{ reason }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { DecisionHint } from '../services/decisionHints'

defineProps<{ hints: DecisionHint[] }>()
defineEmits<{ dismiss: [ruleId: string] }>()
</script>

<style lang="scss" scoped>
.decision-hint-area {
  margin: 12px 0;
  border: 1px solid #f0a500;
  border-radius: 8px;
  overflow: hidden;
}
.decision-hint-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fffbe6;
  border-bottom: 1px solid #f0a500;
}
.decision-hint-title {
  font-size: 13px;
  font-weight: 600;
  color: #b45309;
}
.decision-hint-meta {
  font-size: 11px;
  color: #92400e;
}
.decision-hint-card {
  padding: 10px 12px;
  border-bottom: 1px solid #fde68a;
  background: #fffdf0;
  &:last-child { border-bottom: none; }
}
.hint-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}
.hint-rule-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
  flex: 1;
}
.hint-dismiss {
  background: none;
  border: none;
  font-size: 16px;
  color: #999;
  padding: 0 4px;
  cursor: pointer;
  line-height: 1;
  &:hover { color: #333; }
}
.hint-conclusion {
  font-size: 12px;
  color: #444;
  margin-bottom: 4px;
  display: block;
}
.hint-recommendation {
  font-size: 12px;
  color: #1d6a3e;
  display: block;
  margin-bottom: 6px;
}
.hint-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.hint-reason-tag {
  font-size: 11px;
  color: #92400e;
  background: #fde68a;
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
```

- [ ] **Step 3: 在 index.vue 引入并渲染**

在 `src/pages/index/index.vue` 中:

1. 在 `<script setup>` 顶部追加 import:
```ts
import DecisionHintCard from '../../components/DecisionHintCard.vue'
```

2. 在 composer 区域(`<view class="composer-actions">...</view>` 之后、`<view class="ops-board">` 之前)插入:
```vue
<!-- M4 决策辅助提醒 -->
<DecisionHintCard
  :hints="store.decisionHints"
  @dismiss="store.dismissDecisionHint"
/>
```

- [ ] **Step 4: 类型检查**

Run: `npm run typecheck -- --pretty false`
Expected: 无错误。

- [ ] **Step 5: 手动验证**

Run: `npm run dev:h5`
1. 载入演示数据后,输入与已有规则相关的文本(如"周末上午去健身房")→ 点击"生成规则"。
2. 预期:提炼完成后在输入框下方出现黄色提醒卡片,列出相关历史规则。
3. 点击"×"可逐条关闭。
4. 输入完全无关文本时无卡片出现。

- [ ] **Step 6: Commit**

```bash
git add src/stores/experience.ts src/components/DecisionHintCard.vue src/pages/index/index.vue
git commit -m "feat: wire M4 decision hints into store and render reminder card"
```

---

## Task 3: API Key 配置 UI

**Files:**
- Create: `src/components/ModelConfigPanel.vue`
- Modify: `src/pages/index/index.vue`(增加设置入口)

**关键约束:**
- localStorage key 固定为 `experience-os:model`(与 `modelConfig.ts` 中 `STORAGE_KEY` 一致)
- 存储结构:`{ provider, model, baseUrl, apiKey }` — `ModelConfig` 接口
- 演示默认配置由 `main.ts` 注入(已完成),用户配置后不覆盖
- **导出时必须排除 apiKey**:在现有 `exportEvaluationData` 函数内,若未来有经验资产导出,配置字段只写 `{ provider, model, baseUrl }`,apiKey 永不序列化
- 本 task 不含测试(UI 组件 + localStorage 读写;无可纯函数提取的业务逻辑)

- [ ] **Step 1: 新建 ModelConfigPanel 组件**

`src/components/ModelConfigPanel.vue`:
```vue
<template>
  <view class="model-config-panel">
    <view class="config-section-head">
      <text class="config-title">模型配置</text>
      <text class="config-sub">Key 仅存本地,不上传</text>
    </view>

    <view class="config-field">
      <text class="config-label">Provider</text>
      <select v-model="form.provider" class="config-select" @change="onProviderChange">
        <option value="deepseek">DeepSeek(内置演示默认)</option>
        <option value="openai">OpenAI 兼容端点</option>
      </select>
    </view>

    <view class="config-field">
      <text class="config-label">Model</text>
      <input v-model="form.model" class="config-input" placeholder="deepseek-chat" />
    </view>

    <view class="config-field">
      <text class="config-label">Base URL</text>
      <input v-model="form.baseUrl" class="config-input" placeholder="https://api.deepseek.com" />
    </view>

    <view class="config-field">
      <text class="config-label">API Key</text>
      <input
        v-model="form.apiKey"
        class="config-input"
        :type="showKey ? 'text' : 'password'"
        placeholder="sk-..."
        autocomplete="off"
      />
      <button class="ghost-button small" @click="showKey = !showKey">
        {{ showKey ? '隐藏' : '显示' }}
      </button>
    </view>

    <view class="config-actions">
      <button class="primary-button" @click="save">保存配置</button>
      <button class="ghost-button danger" @click="clear">清除配置</button>
    </view>

    <text v-if="savedMsg" class="config-saved-msg">{{ savedMsg }}</text>

    <view class="config-notice">
      <text class="config-notice-text">演示默认使用内置 DeepSeek Key(由环境变量注入),填写自己的 Key 后生效。Key 只存浏览器 localStorage,不提交、不上云。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { ModelConfig } from '../services/modelClient'

const STORAGE_KEY = 'experience-os:model'

const defaultForm = (): ModelConfig => ({
  provider: 'deepseek',
  apiKey: '',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com',
})

const PROVIDER_DEFAULTS: Record<string, Partial<ModelConfig>> = {
  deepseek: { model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
  openai: { model: 'gpt-4o', baseUrl: 'https://api.openai.com' },
}

const form = ref<ModelConfig>(defaultForm())
const showKey = ref(false)
const savedMsg = ref('')

onMounted(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ModelConfig>
      form.value = {
        provider: parsed.provider ?? 'deepseek',
        apiKey: parsed.apiKey ?? '',
        model: parsed.model ?? 'deepseek-chat',
        baseUrl: parsed.baseUrl ?? 'https://api.deepseek.com',
      }
    }
  } catch {
    // 忽略解析错误
  }
})

function onProviderChange() {
  const defaults = PROVIDER_DEFAULTS[form.value.provider]
  if (defaults) {
    form.value.model = defaults.model ?? form.value.model
    form.value.baseUrl = defaults.baseUrl ?? form.value.baseUrl
  }
}

function save() {
  // 注意:存储时包含 apiKey(本地存储),但导出 JSON 时须排除 apiKey
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    provider: form.value.provider,
    apiKey: form.value.apiKey,
    model: form.value.model,
    baseUrl: form.value.baseUrl,
  }))
  savedMsg.value = '已保存,下次提交观察时生效'
  setTimeout(() => { savedMsg.value = '' }, 3000)
}

function clear() {
  localStorage.removeItem(STORAGE_KEY)
  form.value = defaultForm()
  savedMsg.value = '已清除,将回退演示默认配置'
  setTimeout(() => { savedMsg.value = '' }, 3000)
}
</script>

<style lang="scss" scoped>
.model-config-panel {
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}
.config-section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 16px;
}
.config-title {
  font-size: 15px;
  font-weight: 700;
  color: #111;
}
.config-sub {
  font-size: 11px;
  color: #6b7280;
}
.config-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.config-label {
  font-size: 12px;
  color: #374151;
  width: 72px;
  flex-shrink: 0;
}
.config-input,
.config-select {
  flex: 1;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  background: #fff;
  outline: none;
  &:focus { border-color: #6366f1; }
}
.config-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.config-saved-msg {
  display: block;
  font-size: 12px;
  color: #059669;
  margin-top: 8px;
}
.config-notice {
  margin-top: 12px;
  padding: 8px;
  background: #eff6ff;
  border-radius: 6px;
}
.config-notice-text {
  font-size: 11px;
  color: #1d4ed8;
  line-height: 1.6;
}
.ghost-button.small {
  padding: 4px 8px;
  font-size: 11px;
}
</style>
```

- [ ] **Step 2: 在 index.vue 增加设置入口**

在 `src/pages/index/index.vue` 中:

1. `<script setup>` 追加 import:
```ts
import ModelConfigPanel from '../../components/ModelConfigPanel.vue'
```

2. 在已有响应式变量区追加:
```ts
const showSettings = ref(false)
```

3. 在 topbar 区域(已有的 `<view class="topbar">` 内右侧)追加设置按钮:
```vue
<button class="ghost-button small" @click="showSettings = !showSettings">
  {{ showSettings ? '关闭设置' : '⚙ 设置' }}
</button>
```

4. 在 topbar 之后、composer 之前插入设置面板:
```vue
<!-- 模型设置面板(可折叠) -->
<view v-if="showSettings" class="settings-panel">
  <ModelConfigPanel />
</view>
```

- [ ] **Step 3: 确认导出排除 apiKey**

检查 `src/stores/experience.ts` 中 `exportEvaluationData` 函数:该函数导出的是评估/规则/观察数据,未包含 `localStorage['experience-os:model']`,无需修改。

后续如有"导出经验资产"(Plan 5),须确保配置导出只写 `{ provider, model, baseUrl }`,不含 `apiKey`。在 `ModelConfigPanel.vue` 的 `save()` 函数注释中已标注此规范。

- [ ] **Step 4: 类型检查**

Run: `npm run typecheck -- --pretty false`
Expected: 无错误。

- [ ] **Step 5: 手动验证**

Run: `npm run dev:h5`
1. 点击右上角"⚙ 设置"展开配置面板。
2. 填写 API Key → 点击"保存配置" → 提示"已保存"。
3. 刷新页面 → 再次打开设置 → Key 已回显(密码遮蔽)。
4. 点击"清除配置" → Key 清空,显示"已清除"。
5. 打开 DevTools → Application → localStorage → 确认 `experience-os:model` 中 apiKey 有值但不在任何网络请求 body 之外(仅在 `chat/completions` header 中以 Bearer 形式发出)。

- [ ] **Step 6: Commit**

```bash
git add src/components/ModelConfigPanel.vue src/pages/index/index.vue
git commit -m "feat: add API Key config panel UI (local-only, never uploaded)"
```

---

## Task 4: 评估体系 UI 降级——折叠为高级面板

**Files:**
- Modify: `src/pages/index/index.vue`

**严格约束:**
- `src/services/evaluationEngine.ts` **一行代码不删**。
- `src/stores/experience.ts` 中的所有 evaluation 相关函数/computed **一行代码不删**。
- 只操作 `index.vue` 的 UI 层:将"评估"tab 从主路径摘除,其内容折叠在"高级面板"按钮后。
- 实现方式:保留整个 `<view v-if="activeTab === 'evaluations'" class="panel">` 内容块,但把触发 tab 改成"高级"按钮,并用 `v-if="showAdvancedPanel"` 控制显示。

- [ ] **Step 1: 修改 TabKey 类型与 tabs 数组**

在 `src/pages/index/index.vue` 的 `<script setup>` 中:

将:
```ts
type TabKey = 'records' | 'rules' | 'evaluations' | 'map' | 'timeline'
```
改为:
```ts
type TabKey = 'records' | 'rules' | 'map' | 'timeline'
```

将:
```ts
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'records', label: '经验' },
  { key: 'rules', label: '规则库' },
  { key: 'evaluations', label: '评估' },
  { key: 'map', label: '地图' },
  { key: 'timeline', label: '时间轴' },
]
```
改为:
```ts
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'records', label: '经验' },
  { key: 'rules', label: '规则库' },
  { key: 'map', label: '地图' },
  { key: 'timeline', label: '时间轴' },
]
```

在已有响应式变量区追加:
```ts
const showAdvancedPanel = ref(false)
```

- [ ] **Step 2: 在 tabs 栏末尾追加高级面板折叠按钮**

在模板中 `<view class="tabs">` 的 `</view>` 闭合之前追加:
```vue
<button
  class="tab"
  :class="{ active: showAdvancedPanel }"
  @click="showAdvancedPanel = !showAdvancedPanel"
>
  高级
</button>
```

- [ ] **Step 3: 将评估工作台 panel 改为由 showAdvancedPanel 控制**

将:
```vue
<view v-if="activeTab === 'evaluations'" class="panel">
```
改为:
```vue
<view v-if="showAdvancedPanel" class="panel advanced-panel">
```

(仅改条件,保留整个 panel 的所有内部内容——评估工作台、采用决策、门槛、矩阵、协议等全部保留)

在该 panel 顶部(已有 section-head 之前)追加折叠提示:
```vue
<view class="advanced-panel-notice">
  <text class="advanced-panel-label">高级面板(评估体系)</text>
  <text class="advanced-panel-desc">该功能已从主路径移至此处,代码完整保留,可继续使用。</text>
</view>
```

- [ ] **Step 4: 追加高级面板样式**

在 `<style>` 区追加:
```scss
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
```

- [ ] **Step 5: 确认 ops-board 评估统计也不显示(可选)**

检查 `<view class="ops-board">` 区域中已有的"评估次数"和"闭环状态"字段——这两个是 ops 数据,按原样保留即可;它们不是评估工作台的入口,保持现状不改动。

- [ ] **Step 6: 类型检查**

Run: `npm run typecheck -- --pretty false`
Expected: 无错误(`TabKey` 缩窄不影响 evaluations 相关 store 类型)。

- [ ] **Step 7: 手动验证**

Run: `npm run dev:h5`
1. 默认页面顶部 tabs 显示:经验 / 规则库 / 地图 / 时间轴 / 高级(无"评估"tab)。
2. 点击"高级"→ 显示评估工作台完整面板;再次点击折叠。
3. 评估功能(addEvaluation、recallEvaluationCandidates 等)从规则卡上调用时仍正常(store 函数未删)。
4. 检查 evaluationEngine.ts:行数与修改前一致,未被改动。

- [ ] **Step 8: Commit**

```bash
git add src/pages/index/index.vue
git commit -m "feat: collapse evaluation workbench to advanced panel (code kept intact)"
```

---

## Task 5: 删除 uni-app 死文件

**Files:**
- Delete: `src/manifest.json`
- Delete: `src/pages.json`

**前提:**
- 本次计划前已执行 grep 验证(见下方),无任何 src/ 内代码引用这两个文件。
- vite.config.ts 极简(`plugins: [vue()]`),未引用任何 uni-app 配置。
- `tsconfig.test.json` 的 include 范围为 `src/services/**/*.ts`、`src/stores/**/*.ts`、`src/types/**/*.ts`、`tests/**/*.ts`,不含 json 文件。

**Grep 验证结果(执行本 plan 前已确认):**

```
grep -r "manifest\.json" src/   → No matches found
grep -r "pages\.json" src/      → No matches found
grep -r "manifest" vite.config.ts → No matches found
grep -r "pages\.json" vite.config.ts → No matches found
```

- [ ] **Step 1: 再次 grep 确认无引用(执行前必做)**

Run:
```bash
# PowerShell / Git Bash 均可
grep -r "manifest\.json" src/
grep -r "pages\.json" src/
grep -r "manifest" vite.config.ts
```
Expected: 所有命令输出 "No matches found"(或无输出)。

若有输出则**停止操作**,分析引用来源后再决策。

- [ ] **Step 2: 删除文件**

```bash
git rm src/manifest.json src/pages.json
```

- [ ] **Step 3: 构建验证**

Run: `npm run build:h5`
Expected: 构建成功,无报错。

Run: `npm run typecheck -- --pretty false`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete uni-app dead files (manifest.json, pages.json)"
```

---

## Task 6: 注册新测试 + 全量回归

**Files:**
- Modify: `package.json`(`test:evaluation` 脚本)

- [ ] **Step 1: 追加 decisionHints.test.js 到测试脚本**

将 `package.json` 中 `test:evaluation` 改为:
```json
"test:evaluation": "tsc -p tsconfig.test.json && node dist-tests/tests/aiAnalyzer.test.js && node dist-tests/tests/modelAnalysisAdapter.test.js && node dist-tests/tests/evaluationEngine.test.js && node dist-tests/tests/experienceStore.test.js && node dist-tests/tests/modelClient.test.js && node dist-tests/tests/resilientAnalysis.test.js && node dist-tests/tests/decisionHints.test.js"
```

- [ ] **Step 2: 全量测试**

Run: `npm run test:evaluation`
Expected: 所有测试通过,末行输出 `decisionHints tests passed`。

- [ ] **Step 3: 类型检查**

Run: `npm run typecheck -- --pretty false`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "test: register decisionHints test in test:evaluation script"
```

---

## Self-Review(Plan 4)

- **Spec coverage:**
  - 覆盖 spec §2 M4(决策辅助):录入新观察后召回历史规律并提醒,相关度阈值可配置,可忽略(dismiss)。
  - 覆盖 spec §3[增] M5 API Key 配置:填写 provider/model/baseUrl/apiKey,写入 `experience-os:model`,Key 本地只存,导出排除。
  - 覆盖 spec §3[降]评估体系:复测矩阵/采用门槛/维护回归/协议合规等折叠进"高级面板",主路径移除;**evaluationEngine.ts 一行不删**。
  - 覆盖 spec §3[删]死文件:先 grep 确认无引用,再 `git rm src/manifest.json src/pages.json`。

- **Placeholder scan:** 无 TBD/TODO;所有步骤含完整代码或精确改动描述与命令。

- **Type consistency:**
  - `DecisionHint` 在 `decisionHints.ts`(定义)、`experience.ts`(导入使用)、`DecisionHintCard.vue`(prop 类型)三处一致。
  - `ModelConfig` 复用 `modelClient.ts` 已有导出;`ModelConfigPanel.vue` 同一 `STORAGE_KEY`。
  - `TabKey` 缩窄后 `activeTab` 默认值 `'records'` 仍合法;`showAdvancedPanel` 独立 `ref` 不依赖 TabKey。

- **不可逆操作声明:**
  - 死文件删除(Task 5)是唯一不可逆操作;Task 5 Step 1 强制 grep 验证为安全门。
  - evaluationEngine.ts 代码不删,可通过 showAdvancedPanel=true 随时恢复访问。

- **Plan 1/2/3 依赖说明:**
  - Task 1–2 依赖 Plan 1(store 已有 `submitObservation` + `analyzeObservationResilient`);若 Plan 3(规律发现)尚未完成,M4 仍可独立落地(召回的是 `rules`,非 insights)。
  - Task 3 依赖 Plan 1(`modelConfig.ts`、`STORAGE_KEY`)。
  - Task 4/5 无额外依赖。
