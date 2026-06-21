# Real Model Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"一句话观察"的分析从本地关键词引擎切换为真模型(DeepSeek)优先、失败自动回退本地引擎,且不引入行为回归。

**Architecture:** 新增一个纯函数式的"弹性分析"编排层 `analyzeObservationResilient`:有可用模型 client 时调模型(复用既有契约/校验/降级链),抛错(网络/解析)时回退本地 `analyzeObservation`。模型 client 用 DeepSeek 的 OpenAI 兼容接口实现 `ObservationModelClient`。store 仅替换一个调用点。

**Tech Stack:** Vue 3 + Pinia + Vite + TypeScript;测试为纯 TS,经 `tsconfig.test.json` 编译到 `dist-tests/` 后用 `node` + `node:assert/strict` 运行。

## Global Constraints

- 不重写已完成部分,只在调用点做最小替换。
- 不新增运行时依赖(仅用 vue/pinia + 浏览器 `fetch`)。
- API Key 只存浏览器本地,**绝不提交进仓库、绝不上云**。
- DeepSeek 走 OpenAI 兼容端点:`POST {baseUrl}/chat/completions`,默认 `baseUrl=https://api.deepseek.com`,`model=deepseek-chat`。
- 复用既有契约层:`createObservationAnalysisPrompt`、`normalizeModelAnalysis`、`OBSERVATION_ANALYSIS_PROMPT`(均已存在)。
- 测试文件用 `node:assert/strict`,以 `async function` + 末尾 `void run()` 组织(沿用 `tests/modelAnalysisAdapter.test.ts` 风格)。

---

## File Structure

- `src/services/modelClient.ts`(新建):`ModelConfig` 类型 + `createModelClient(config)` → 返回 `ObservationModelClient`(DeepSeek fetch 实现)。纯,可测。
- `src/services/resilientAnalysis.ts`(新建):`analyzeObservationResilient(text, { client })` 编排层。纯,可测。
- `src/services/modelConfig.ts`(新建):`getActiveModelClient()` 读 localStorage 配置 → client | null。仅浏览器用,不被测试导入。
- `src/stores/experience.ts`(修改):第 3 行 import + 第 713 行调用点替换。
- `tests/modelClient.test.ts`(新建)、`tests/resilientAnalysis.test.ts`(新建)。
- `package.json`(修改):`test:evaluation` 脚本追加两个新测试文件。

---

### Task 1: DeepSeek 模型 client

**Files:**
- Create: `src/services/modelClient.ts`
- Test: `tests/modelClient.test.ts`

**Interfaces:**
- Consumes: `ObservationModelClient` from `src/services/modelAnalysisAdapter.ts`(`{ completeJson({systemPrompt, userText}): Promise<unknown> }`)。
- Produces: `export interface ModelConfig { provider: 'demo'|'deepseek'|'openai'; apiKey: string; model: string; baseUrl: string }` 和 `export function createModelClient(config: ModelConfig): ObservationModelClient`。

- [ ] **Step 1: Write the failing test**

`tests/modelClient.test.ts`:
```ts
import assert from 'node:assert/strict'
import { createModelClient } from '../src/services/modelClient'

const originalFetch = globalThis.fetch

async function testReturnsParsedJsonContent() {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"title":"超市低峰采购策略"}' } }] }),
  })) as unknown as typeof fetch

  const client = createModelClient({ provider: 'deepseek', apiKey: 'k', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' })
  const out = await client.completeJson({ systemPrompt: 's', userText: 'u' })
  assert.deepEqual(out, { title: '超市低峰采购策略' })
}

async function testThrowsOnHttpError() {
  globalThis.fetch = (async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch
  const client = createModelClient({ provider: 'deepseek', apiKey: 'bad', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' })
  await assert.rejects(() => client.completeJson({ systemPrompt: 's', userText: 'u' }))
}

async function run() {
  try {
    await testReturnsParsedJsonContent()
    await testThrowsOnHttpError()
    console.log('modelClient tests passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

void run()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/modelClient.test.js`
Expected: FAIL (编译报错 `Cannot find module '../src/services/modelClient'`)。

- [ ] **Step 3: Write minimal implementation**

`src/services/modelClient.ts`:
```ts
import type { ObservationModelClient } from './modelAnalysisAdapter'

export type ModelProvider = 'demo' | 'deepseek' | 'openai'

export interface ModelConfig {
  provider: ModelProvider
  apiKey: string
  model: string
  baseUrl: string
}

export function createModelClient(config: ModelConfig): ObservationModelClient {
  return {
    completeJson: async ({ systemPrompt, userText }) => {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      })

      if (!response.ok) {
        throw new Error(`Model request failed: HTTP ${response.status}`)
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> }
      const content = data.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new Error('Model returned no string content')
      }
      return JSON.parse(content)
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/modelClient.test.js`
Expected: PASS,输出 `modelClient tests passed`。

- [ ] **Step 5: Commit**

```bash
git add src/services/modelClient.ts tests/modelClient.test.ts
git commit -m "feat: add DeepSeek model client (OpenAI-compatible)"
```

---

### Task 2: 弹性分析编排层

**Files:**
- Create: `src/services/resilientAnalysis.ts`
- Test: `tests/resilientAnalysis.test.ts`

**Interfaces:**
- Consumes: `analyzeObservation` from `./aiAnalyzer`;`createObservationAnalysisPrompt` from `./modelAnalysisAdapter`;`normalizeModelAnalysis` from `./analysisContract`;`ObservationModelClient` from `./modelAnalysisAdapter`;`AnalysisResult` from `../types/experience`。
- Produces: `export function analyzeObservationResilient(text: string, options?: { client?: ObservationModelClient | null }): Promise<AnalysisResult>`。

- [ ] **Step 1: Write the failing test**

`tests/resilientAnalysis.test.ts`:
```ts
import assert from 'node:assert/strict'
import { analyzeObservationResilient } from '../src/services/resilientAnalysis'
import type { ObservationModelClient } from '../src/services/modelAnalysisAdapter'

const throwingClient: ObservationModelClient = {
  completeJson: async () => { throw new Error('network down') },
}

async function testFallsBackToLocalOnClientError() {
  const result = await analyzeObservationResilient('周末10点健身房人少，器械不用排队', { client: throwingClient })
  assert.equal(result.title, '周末低峰训练策略') // 本地引擎产出
}

async function testUsesModelWhenClientWorks() {
  const client: ObservationModelClient = {
    completeJson: async () => ({
      category: '购物', tags: ['工作日'], summary: 's', title: '超市低峰采购策略',
      conclusion: 'c', recommendation: 'r', conditions: ['工作日晚上', '地点是小区超市'],
      warnings: ['w'], reusability: 'medium', direction: 'positive', analysisType: 'rule', confidence: 'medium',
    }),
  }
  const result = await analyzeObservationResilient('工作日晚上8点去小区超市，结账排队明显更短', { client })
  assert.equal(result.title, '超市低峰采购策略')
}

async function testNoClientUsesLocal() {
  const result = await analyzeObservationResilient('周末10点健身房人少，器械不用排队', {})
  assert.equal(result.title, '周末低峰训练策略')
}

async function run() {
  await testFallsBackToLocalOnClientError()
  await testUsesModelWhenClientWorks()
  await testNoClientUsesLocal()
  console.log('resilientAnalysis tests passed')
}

void run()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/resilientAnalysis.test.js`
Expected: FAIL (`Cannot find module '../src/services/resilientAnalysis'`)。

- [ ] **Step 3: Write minimal implementation**

`src/services/resilientAnalysis.ts`:
```ts
import type { AnalysisResult } from '../types/experience'
import { analyzeObservation } from './aiAnalyzer'
import { normalizeModelAnalysis } from './analysisContract'
import { createObservationAnalysisPrompt, type ObservationModelClient } from './modelAnalysisAdapter'

export interface ResilientOptions {
  client?: ObservationModelClient | null
}

export async function analyzeObservationResilient(
  text: string,
  options: ResilientOptions = {},
): Promise<AnalysisResult> {
  const { client } = options

  if (client) {
    try {
      const raw = await client.completeJson(createObservationAnalysisPrompt(text))
      return normalizeModelAnalysis(raw, text)
    } catch {
      // 网络/解析等异常 → 回退本地引擎(契约层的"降级为待观察"是正常结果,不会进这里)
    }
  }

  return analyzeObservation(text)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/resilientAnalysis.test.js`
Expected: PASS,输出 `resilientAnalysis tests passed`。

- [ ] **Step 5: Commit**

```bash
git add src/services/resilientAnalysis.ts tests/resilientAnalysis.test.ts
git commit -m "feat: add resilient analysis orchestrator with local fallback"
```

---

### Task 3: 接入 store + 模型配置读取 + 注册测试

**Files:**
- Create: `src/services/modelConfig.ts`
- Modify: `src/stores/experience.ts:3`(import)、`src/stores/experience.ts:713`(调用点)
- Modify: `package.json`(`test:evaluation` 脚本)

**Interfaces:**
- Consumes: `createModelClient`/`ModelConfig` from `./modelClient`;`ObservationModelClient` from `./modelAnalysisAdapter`;`analyzeObservationResilient` from `../services/resilientAnalysis`。
- Produces: `export function getActiveModelClient(): ObservationModelClient | null`。

- [ ] **Step 1: 新建模型配置读取(无 import.meta,避免 CJS 测试编译报错)**

`src/services/modelConfig.ts`:
```ts
import { createModelClient, type ModelConfig } from './modelClient'
import type { ObservationModelClient } from './modelAnalysisAdapter'

const STORAGE_KEY = 'experience-os:model'

export function getActiveModelClient(): ObservationModelClient | null {
  const config = readModelConfig()
  if (!config || !config.apiKey) return null
  return createModelClient(config)
}

function readModelConfig(): ModelConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ModelConfig>
    if (!parsed.apiKey) return null
    return {
      provider: parsed.provider ?? 'deepseek',
      apiKey: parsed.apiKey,
      model: parsed.model ?? 'deepseek-chat',
      baseUrl: parsed.baseUrl ?? 'https://api.deepseek.com',
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 2: 替换 store 的 import(第 3 行)**

把:
```ts
import { analyzeObservation, demoSamples } from '../services/aiAnalyzer'
```
改为:
```ts
import { demoSamples } from '../services/aiAnalyzer'
import { analyzeObservationResilient } from '../services/resilientAnalysis'
import { getActiveModelClient } from '../services/modelConfig'
```

- [ ] **Step 3: 替换调用点(第 713 行)**

把:
```ts
      const analysis = await analyzeObservation(content)
```
改为:
```ts
      const analysis = await analyzeObservationResilient(content, { client: getActiveModelClient() })
```

- [ ] **Step 4: 在 package.json 注册两个新测试**

把 `test:evaluation` 脚本结尾追加两个文件,改为:
```json
    "test:evaluation": "tsc -p tsconfig.test.json && node dist-tests/tests/aiAnalyzer.test.js && node dist-tests/tests/modelAnalysisAdapter.test.js && node dist-tests/tests/evaluationEngine.test.js && node dist-tests/tests/experienceStore.test.js && node dist-tests/tests/modelClient.test.js && node dist-tests/tests/resilientAnalysis.test.js"
```

- [ ] **Step 5: 类型检查 + 全量测试**

Run: `npm run typecheck -- --pretty false && npm run test:evaluation`
Expected: typecheck 无错;所有测试通过,末行 `resilientAnalysis tests passed`。

- [ ] **Step 6: 手动验证真模型(可选,需有效 DeepSeek Key)**

Run: `npm run dev:h5`,浏览器控制台执行:
```js
localStorage.setItem('experience-os:model', JSON.stringify({ provider: 'deepseek', apiKey: '你的DeepSeekKey', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' }))
```
刷新后输入一句观察,Network 面板应看到对 `api.deepseek.com/chat/completions` 的请求;断网或填错 Key 时仍能生成(回退本地引擎)。

- [ ] **Step 7: Commit**

```bash
git add src/services/modelConfig.ts src/stores/experience.ts package.json
git commit -m "feat: wire resilient model analysis into observation submit"
```

---

## 后续计划路线图(每个独立成 plan,按需展开)

- **Plan 2(D2)冷启动 + 批量导入 + 情绪字段**:粘贴文本→拆条→逐条走 `analyzeObservationResilient`;`Observation`/`exp_observations` 增 `sentiment`;强化 demo 数据载入。
- **Plan 3(D3)M3 规律发现**:统计聚类(category/tag/sentiment/根因)+ 对达标簇调模型做归因/命名/建议 + 最小样本门槛 + 纯统计兜底;「扫描 90 天」归因卡组件。
- **Plan 4(D4)M4 决策辅助 + Key 配置 UI + 评估降级 + 删死文件**:录入命中历史模式提醒;设置页填 Key/选 Provider(写入 `experience-os:model`,含内置 DeepSeek 演示 Key);评估工作台折叠隐藏;删除 `src/manifest.json`、`src/pages.json`。
- **Plan 5(D5)M5 信任产品化 + 种子数据 + 彩排**:界面明示"数据只在本机"、导出经验资产(markdown)、一键清空;预置埋根因的 ~35 条工作观察;演示彩排。

---

## Self-Review(Plan 1)

- **Spec coverage**:本 plan 覆盖 spec §5(AI 流水线第 1 件:DeepSeek client + store 接入 + 失败回退)与 §0(DeepSeek 内置、Key 不上云)。规律发现/导入/UI 在 Plan 2–5。
- **Placeholder scan**:无 TBD/TODO,所有步骤含完整代码与命令。
- **Type consistency**:`ModelConfig`、`createModelClient`、`analyzeObservationResilient`、`getActiveModelClient` 在各任务签名一致;复用的 `ObservationModelClient`/`AnalysisResult`/`normalizeModelAnalysis`/`createObservationAnalysisPrompt` 均为既有导出。
