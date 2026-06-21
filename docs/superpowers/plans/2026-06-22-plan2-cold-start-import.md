# Plan 2: 冷启动 + 批量导入 + 情绪字段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Depends on:** Plan 1 (`2026-06-22-real-model-foundation.md`) must be fully merged — `analyzeObservationResilient`, `getActiveModelClient`, `createModelClient` are all assumed present and passing.

**Goal:** 三件事合并落地:① 给 `Observation` 增加可选 `sentiment` 字段(从 `inferDirection` 映射,纯本地,无需模型);② 新增 `importObservations(rawText)` store action(粘贴多行文本 → 拆条 → 逐条走现有弹性分析管线 → 写库),解决演示冷启动痛点;③ `persist` / `readPersisted` / `normalizeImportedObservation` 三处同步支持 `sentiment`,确保 localStorage 序列化/反序列化完整。

**Architecture:** `sentiment` 是纯派生字段:写入时由 `inferDirection` 映射后存进 `Observation`,读取时 `normalizeImportedObservation` 加 fallback 容错。`importObservations` 在 store 内部串行调用 `submitObservation` 的核心写入逻辑(提取为私有辅助 `_processAndStore`)以避免逻辑重复;UI 仅新增一个粘贴框组件,不改动单条录入路径。

**Tech Stack:** Vue 3 + Pinia + Vite + TypeScript;测试为纯 TS,经 `tsconfig.test.json` 编译到 `dist-tests/` 后用 `node` + `node:assert/strict` 运行。

## Global Constraints

- 不重写已完成部分;`submitObservation` 原有路径零改动(仅重构出可复用的内部辅助)。
- `AnalysisResult` 接口不改;`sentiment` 只落在 `Observation` 上。
- `inferDirection` 已存在于 `src/services/analysisContract.ts`,直接 import,不重新实现。
- 映射规则:`positive` → `'positive'`、`negative` → `'negative'`、`mixed`|`uncertain` → `'neutral'`。
- `importObservations` 串行处理(逐条 await),避免并发打爆 API 限速;每条失败独立降级,不中断整体。
- 不新增运行时依赖。
- API Key 只存浏览器本地,**绝不提交进仓库、绝不上云**。
- 测试文件用 `node:assert/strict`,以 `async function` + 末尾 `void run()` 组织,沿用既有风格。
- 新增的 `.test.ts` 必须追加进 `package.json` 的 `test:evaluation` 脚本。

---

## File Structure

- `src/types/experience.ts`(修改):给 `Observation` 接口加 `sentiment?: 'positive' | 'neutral' | 'negative'`。
- `src/stores/experience.ts`(修改):
  - 导入 `inferDirection` from `../services/analysisContract`。
  - 新增内部辅助 `mapSentiment(direction)` 和 `_writeObservation(observation, analysis, processedAt)` 提取自 `submitObservation`。
  - 重构 `submitObservation` 复用 `_writeObservation`。
  - 新增 action `importObservations(rawText: string): Promise<ImportSummary>`。
  - `normalizeImportedObservation` 加 `sentiment` 字段读取/fallback。
  - `persist` 和 `readPersisted` 通过 `Observation` 结构自动携带(无需额外改动,类型已覆盖)。
- `tests/importObservations.test.ts`(新建):覆盖拆行逻辑、空行过滤、批量写库、失败降级。
- `package.json`(修改):`test:evaluation` 脚本末尾追加 `importObservations.test.ts`。
- `src/pages/index/index.vue`(修改):新增批量导入 UI 区块(粘贴框 + 导入按钮 + 进度状态)。

---

## Task 1: 扩展 `Observation` 类型 + 情绪映射工具

**Files:**
- Modify: `src/types/experience.ts`

**Interfaces:**
- 在 `Observation` 接口中新增可选字段 `sentiment?: 'positive' | 'neutral' | 'negative'`。
- 新增类型别名 `export type ObservationSentiment = 'positive' | 'neutral' | 'negative'` 供外部引用。

**TDD 步骤(类型变更无运行时逻辑,直接实现后用 typecheck 验证):**

- [ ] **Step 1: 修改 `src/types/experience.ts`**

  在 `Observation` 接口 `location?: string` 一行**后面**插入新字段:

  ```ts
  // src/types/experience.ts
  export type ObservationSentiment = 'positive' | 'neutral' | 'negative'

  export interface Observation {
    id: string
    text: string
    category: ExperienceCategory
    tags: string[]
    summary: string
    status: ProcessStatus
    createdAt: string
    processedAt?: string
    ruleId?: string
    location?: string
    sentiment?: ObservationSentiment   // 新增:由 inferDirection 映射,可选
  }
  ```

- [ ] **Step 2: 运行类型检查**

  ```bash
  npm run typecheck -- --pretty false
  ```
  Expected: 无错误(现有代码中 `Observation` 的所有构造点均不赋 `sentiment`,可选字段不会报错)。

- [ ] **Step 3: Commit**

  ```bash
  git add src/types/experience.ts
  git commit -m "feat(types): add optional sentiment field to Observation"
  ```

---

## Task 2: store 内部辅助 — 情绪映射 + 写入重构

**Files:**
- Modify: `src/stores/experience.ts`

**Interfaces:**
- Consumes: `inferDirection` from `../services/analysisContract`(已存在,返回 `'positive'|'negative'|'mixed'|'uncertain'`)。
- Produces (内部,不导出):
  - `function mapSentiment(direction: ObservationDirection): ObservationSentiment`
  - `async function _writeObservation(observation: Observation, analysis: AnalysisResult, processedAt: string): Promise<void>` — 从现有 `submitObservation` try 块提取。

- [ ] **Step 1: 添加 import**

  在 `src/stores/experience.ts` 顶部 import 块中追加(紧跟现有 analysisContract 相关 import,若无则新建一行):

  ```ts
  import { inferDirection } from '../services/analysisContract'
  import type { ObservationDirection } from '../services/analysisContract'
  import type { ObservationSentiment } from '../types/experience'
  ```

- [ ] **Step 2: 在 store 函数体内(defineStore 回调中)新增 `mapSentiment` 辅助**

  在 `persist` 函数定义之前插入:

  ```ts
  function mapSentiment(direction: ObservationDirection): ObservationSentiment {
    if (direction === 'positive') return 'positive'
    if (direction === 'negative') return 'negative'
    return 'neutral'
  }
  ```

- [ ] **Step 3: 提取 `_writeObservation` 辅助,并在 `submitObservation` 中复用**

  当前 `submitObservation` 的 try 块(lines 714–729)为:

  ```ts
  try {
    const analysis = await analyzeObservationResilient(content, { client: getActiveModelClient() })
    const processedAt = new Date().toISOString()
    const rule = upsertRuleFromAnalysis(analysis, observation.id, processedAt)

    Object.assign(observation, {
      category: analysis.category,
      tags: analysis.tags,
      summary: analysis.summary,
      status: 'success',
      processedAt,
      ruleId: rule.id,
      location: analysis.location,
    })

    latestRuleId.value = rule.id
  } catch {
    observation.status = 'failed'
    observation.summary = '结构化校验失败，原始观察已保存。'
  }
  ```

  重构为(提取写入部分为 `_writeObservation`,保留 `isAnalyzing` 守卫逻辑在 `submitObservation`):

  ```ts
  // 内部辅助:将 analysis 结果写入已存在的 observation 对象并 upsert rule
  // 调用前 observation 已 push 进 observations.value
  async function _writeObservation(observation: Observation, analysis: AnalysisResult, processedAt: string) {
    const rule = upsertRuleFromAnalysis(analysis, observation.id, processedAt)
    Object.assign(observation, {
      category: analysis.category,
      tags: analysis.tags,
      summary: analysis.summary,
      status: 'success' as const,
      processedAt,
      ruleId: rule.id,
      location: analysis.location,
      sentiment: mapSentiment(inferDirection(observation.text)),
    })
    latestRuleId.value = rule.id
  }

  async function submitObservation(text: string) {
    const content = text.trim()
    if (!content || isAnalyzing.value) return

    const now = new Date().toISOString()
    const observation: Observation = {
      id: createId('obs'),
      text: content,
      category: '其他',
      tags: [],
      summary: '正在提炼经验规则',
      status: 'pending',
      createdAt: now,
    }

    observations.value.unshift(observation)
    isAnalyzing.value = true
    persist()

    try {
      const analysis = await analyzeObservationResilient(content, { client: getActiveModelClient() })
      const processedAt = new Date().toISOString()
      await _writeObservation(observation, analysis, processedAt)
    } catch {
      observation.status = 'failed'
      observation.summary = '结构化校验失败，原始观察已保存。'
    } finally {
      isAnalyzing.value = false
      persist()
    }
  }
  ```

- [ ] **Step 4: 运行类型检查**

  ```bash
  npm run typecheck -- --pretty false
  ```
  Expected: 无错误。

- [ ] **Step 5: 运行全量测试确认无回归**

  ```bash
  npm run test:evaluation
  ```
  Expected: 全部通过,末行 `resilientAnalysis tests passed`。

- [ ] **Step 6: Commit**

  ```bash
  git add src/stores/experience.ts
  git commit -m "refactor(store): extract _writeObservation helper, add sentiment mapping"
  ```

---

## Task 3: `importObservations` store action + 持久化 sentiment

**Files:**
- Modify: `src/stores/experience.ts`
- Test: `tests/importObservations.test.ts`(新建)
- Modify: `package.json`

**Interfaces:**
- Produces:
  ```ts
  export interface ImportSummary {
    total: number       // 拆出的非空行数
    succeeded: number  // 分析成功条数
    failed: number     // 分析失败条数(已降级保存)
  }

  async function importObservations(rawText: string): Promise<ImportSummary>
  ```
- `normalizeImportedObservation`(现存于 store 下方,lines 1710–1728)需要补 `sentiment` 字段读取。

- [ ] **Step 1: 写失败测试**

  新建 `tests/importObservations.test.ts`:

  ```ts
  import assert from 'node:assert/strict'

  // ---------------------------------------------------------------------------
  // 独立于 Vue/Pinia:仅测试拆行逻辑与 sentiment 映射
  // ---------------------------------------------------------------------------

  // 拆行工具(复制 store 中同款逻辑,便于隔离测试)
  function splitLines(rawText: string): string[] {
    return rawText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }

  // sentiment 映射(复制 store 中 mapSentiment 逻辑)
  type ObservationDirection = 'positive' | 'negative' | 'mixed' | 'uncertain'
  type ObservationSentiment = 'positive' | 'neutral' | 'negative'

  function mapSentiment(direction: ObservationDirection): ObservationSentiment {
    if (direction === 'positive') return 'positive'
    if (direction === 'negative') return 'negative'
    return 'neutral'
  }

  // ---------------------------------------------------------------------------
  // Tests
  // ---------------------------------------------------------------------------

  function testSplitLinesFiltersEmpty() {
    const raw = '\n  \n第一条观察\n\n第二条观察\n  \n'
    const lines = splitLines(raw)
    assert.equal(lines.length, 2)
    assert.equal(lines[0], '第一条观察')
    assert.equal(lines[1], '第二条观察')
  }

  function testSplitLinesSingleLine() {
    const lines = splitLines('周末健身房人少')
    assert.equal(lines.length, 1)
    assert.equal(lines[0], '周末健身房人少')
  }

  function testSplitLinesAllEmpty() {
    const lines = splitLines('  \n  \n  ')
    assert.equal(lines.length, 0)
  }

  function testMapSentimentPositive() {
    assert.equal(mapSentiment('positive'), 'positive')
  }

  function testMapSentimentNegative() {
    assert.equal(mapSentiment('negative'), 'negative')
  }

  function testMapSentimentMixed() {
    assert.equal(mapSentiment('mixed'), 'neutral')
  }

  function testMapSentimentUncertain() {
    assert.equal(mapSentiment('uncertain'), 'neutral')
  }

  async function run() {
    testSplitLinesFiltersEmpty()
    testSplitLinesSingleLine()
    testSplitLinesAllEmpty()
    testMapSentimentPositive()
    testMapSentimentNegative()
    testMapSentimentMixed()
    testMapSentimentUncertain()
    console.log('importObservations tests passed')
  }

  void run()
  ```

- [ ] **Step 2: 运行测试确认失败(文件不存在)**

  ```bash
  npx tsc -p tsconfig.test.json && node dist-tests/tests/importObservations.test.js
  ```
  Expected: FAIL — `Cannot find module` 或编译错误(目标 .js 尚未生成)。

  > 注:这里测试的是纯逻辑函数(拆行+映射),不依赖 Pinia,因此可以在 node 环境中直接运行;store action 本体的集成测试依靠 typecheck + 手动验证(见 Step 6)。

- [ ] **Step 3: 实现 `importObservations` action**

  在 `src/stores/experience.ts` 的 store 函数体内,在 `loadDemoData` 定义**后**、`return` 语句**前**插入:

  ```ts
  // ---------------------------------------------------------------------------
  // 批量导入:粘贴多行文本 → 按行拆成多条观察 → 逐条走弹性分析管线 → 写库
  // ---------------------------------------------------------------------------
  async function importObservations(rawText: string): Promise<ImportSummary> {
    const lines = rawText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const summary: ImportSummary = { total: lines.length, succeeded: 0, failed: 0 }
    if (lines.length === 0) return summary

    const client = getActiveModelClient()

    for (const line of lines) {
      const now = new Date().toISOString()
      const observation: Observation = {
        id: createId('obs'),
        text: line,
        category: '其他',
        tags: [],
        summary: '批量导入中',
        status: 'pending',
        createdAt: now,
      }
      observations.value.push(observation)

      try {
        const analysis = await analyzeObservationResilient(line, { client })
        const processedAt = new Date().toISOString()
        await _writeObservation(observation, analysis, processedAt)
        summary.succeeded += 1
      } catch {
        observation.status = 'failed'
        observation.summary = '结构化校验失败，原始观察已保存。'
        summary.failed += 1
      }

      persist()
    }

    return summary
  }
  ```

  同时在 store return 对象中追加 `importObservations` 和 `ImportSummary` 类型(类型在文件顶部或 store 外部定义):

  ```ts
  // 在 PersistedState 等类型定义附近(defineStore 外)添加:
  export interface ImportSummary {
    total: number
    succeeded: number
    failed: number
  }
  ```

  在 `return { ... }` 块中追加:
  ```ts
  importObservations,
  ```

- [ ] **Step 4: 补全 `normalizeImportedObservation` 的 sentiment 字段**

  找到现有函数 `normalizeImportedObservation`(约 line 1710),在 return 对象末尾追加:

  ```ts
  return {
    id,
    text,
    category: enumValue(input.category, EXPERIENCE_CATEGORIES, '其他'),
    tags: stringArray(input.tags),
    summary: stringValue(input.summary, '历史导入观察。'),
    status: enumValue(input.status, PROCESS_STATUSES, 'success'),
    createdAt: dateValue(input.createdAt, now),
    processedAt: optionalDate(input.processedAt),
    ruleId: optionalString(input.ruleId),
    location: optionalString(input.location),
    sentiment: enumValue(input.sentiment, ['positive', 'neutral', 'negative'] as const, undefined as unknown as 'neutral'),
    // 兼容写法:若字段缺失则不设(保持 undefined,符合 optional 语义)
  }
  ```

  更简洁的写法(推荐):

  ```ts
  const SENTIMENT_VALUES = ['positive', 'neutral', 'negative'] as const
  // ... 在 return 中:
  sentiment: (['positive', 'neutral', 'negative'] as const).includes(input.sentiment as never)
    ? (input.sentiment as ObservationSentiment)
    : undefined,
  ```

- [ ] **Step 5: 在 `package.json` 注册新测试**

  把 `test:evaluation` 脚本末尾追加 `importObservations.test.js`:

  ```json
  "test:evaluation": "tsc -p tsconfig.test.json && node dist-tests/tests/aiAnalyzer.test.js && node dist-tests/tests/modelAnalysisAdapter.test.js && node dist-tests/tests/evaluationEngine.test.js && node dist-tests/tests/experienceStore.test.js && node dist-tests/tests/modelClient.test.js && node dist-tests/tests/resilientAnalysis.test.js && node dist-tests/tests/importObservations.test.js"
  ```

- [ ] **Step 6: 类型检查 + 全量测试**

  ```bash
  npm run typecheck -- --pretty false && npm run test:evaluation
  ```
  Expected: typecheck 无错;全部通过,末行 `importObservations tests passed`。

- [ ] **Step 7: Commit**

  ```bash
  git add src/stores/experience.ts tests/importObservations.test.ts package.json
  git commit -m "feat(store): add importObservations action with sentiment, batch line split"
  ```

---

## Task 4: 批量导入 UI 组件

**Files:**
- Modify: `src/pages/index/index.vue`

**Interfaces:**
- Consumes: `useExperienceStore().importObservations(rawText)` → `Promise<ImportSummary>`。
- UI 状态: `isImporting: boolean`, `importResult: ImportSummary | null`, `importText: string`。

> UI 部分不含业务逻辑,无需 TDD 测试文件;用 typecheck 验证类型,手动验证交互。

**关键结构与代码:**

- [ ] **Step 1: 在 `<script setup>` 中添加批量导入状态与 handler**

  在 `index.vue` 的 `<script setup>` 中,紧跟 `const store = useExperienceStore()` 之后添加:

  ```ts
  import type { ImportSummary } from '../../stores/experience'

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
      importText.value = ''
    } finally {
      isImporting.value = false
    }
  }
  ```

- [ ] **Step 2: 在模板中添加批量导入区块**

  在单条录入区块(`<textarea>` + 提交按钮)之后、经验列表之前插入:

  ```html
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
  ```

- [ ] **Step 3: 样式(追加至 `<style lang="scss" scoped>` 末尾)**

  ```scss
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
  ```

- [ ] **Step 4: 类型检查**

  ```bash
  npm run typecheck -- --pretty false
  ```
  Expected: 无错误。

- [ ] **Step 5: 手动验证(需 `npm run dev:h5`)**

  1. 打开 http://localhost:5173。
  2. 粘贴 3 行文本进导入框,点「批量导入」。
  3. 观察到「导入中…」状态,完成后显示「共 3 条 · 成功 X · 失败 Y」。
  4. 经验列表出现新条目,每条 `sentiment` 字段可在 DevTools localStorage 中看到(`experience-os-state-v1`)。
  5. 刷新页面后数据仍在(persist 验证)。

- [ ] **Step 6: Commit**

  ```bash
  git add src/pages/index/index.vue
  git commit -m "feat(ui): add bulk import textarea with progress feedback"
  ```

---

## 后续计划路线图

- **Plan 3(D3)M3 规律发现**:统计聚类(category/tag/sentiment/根因)+ 对达标簇调模型做归因/命名/建议 + 最小样本门槛 + 纯统计兜底;「扫描 90 天」归因卡组件。`sentiment` 字段将在此作为聚类维度直接使用。
- **Plan 4(D4)M4 决策辅助 + Key 配置 UI + 评估降级 + 删死文件**。
- **Plan 5(D5)M5 信任产品化 + 种子数据 + 彩排**:种子数据里预置 ~35 条跨 90 天观察,借助 `importObservations` 一键载入。

---

## Self-Review(Plan 2)

### Spec Coverage

| Spec 要求 | 覆盖位置 |
|-----------|----------|
| `Observation` 加 `sentiment` 字段(§4) | Task 1:类型扩展 |
| `sentiment` 由 `inferDirection` 映射(§3/§5) | Task 2:`mapSentiment` + `_writeObservation` |
| 批量导入:粘贴→拆条→逐条 `analyzeObservationResilient`(§3/§6演示) | Task 3:`importObservations` |
| 复用现有写入逻辑,避免重复(需求约束) | Task 2:提取 `_writeObservation`,两处复用 |
| localStorage 持久化带上 sentiment(§4) | Task 3:`normalizeImportedObservation` 补字段;`persist` 通过 `Observation` 类型自动携带 |
| 新增测试追加进 `test:evaluation`(CLAUDE.md) | Task 3 Step 5 |
| 批量导入 UI — 演示冷启动(§6演示台本) | Task 4 |
| 依赖 Plan 1 已就绪 | 文件头 Depends on 声明 |

### Placeholder Scan

- 无 TBD / TODO / placeholder;所有步骤含完整代码与命令。
- `normalizeImportedObservation` 的 sentiment 读取给出了两种写法并注明推荐写法。

### Type Consistency

| 符号 | 定义位置 | 使用位置 | 一致性 |
|------|----------|----------|--------|
| `ObservationSentiment` | `types/experience.ts` | `stores/experience.ts`、`tests/importObservations.test.ts` | ✓ |
| `ImportSummary` | `stores/experience.ts`(export) | `pages/index/index.vue` import | ✓ |
| `mapSentiment` | store 内部 | `_writeObservation` 内调用 | ✓ |
| `_writeObservation` | store 内部 | `submitObservation`、`importObservations` | ✓ |
| `inferDirection` | `services/analysisContract.ts`(既有) | `stores/experience.ts` import + `mapSentiment` 输入 | ✓ |
| `ObservationDirection` | `services/analysisContract.ts`(既有) | `mapSentiment` 参数类型 | ✓ |
| `analyzeObservationResilient` | `services/resilientAnalysis.ts`(Plan 1) | `importObservations` 内调用 | ✓ |
| `getActiveModelClient` | `services/modelConfig.ts`(Plan 1) | `importObservations` 内调用 | ✓ |
