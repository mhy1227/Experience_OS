# V4 决策建议合成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「找经验」结果顶部合成一张决策建议卡(本地确定性算出 倾向采用/谨慎/证据不足 + 战绩数字 + 理由),并提供一个 opt-in 的「🧠 让 AI 说句人话」润色按钮。

**Architecture:** 新增纯函数服务 `decisionAdvice.ts`(`synthesizeAdvice` 聚合召回规则的 `trustSignal` + 评估战绩 → 一档结论)与 `adviceWithModel.ts`(`polishAdvice` opt-in 润色,过 `validateModelField` 校验、失败退本地)。`InputModule.vue` 用 computed 算 advice 并渲染卡片。不动 `evaluationEngine` 与召回逻辑。

**Tech Stack:** TypeScript 纯函数、Vue 3 `<script setup>` + 模板、Pinia(只读 store 召回结果)、SCSS(全局 `styles.scss` + 设计 token)、纯 TS 测试(`tsconfig.test.json` → `node` + `node:assert/strict`)。

## Global Constraints

- **本地优先**:`synthesizeAdvice` 纯本地同步、无网络;模型仅 `polishAdvice` 在用户点按钮时调用,失败/无 client → 返回本地 `advice.reason`,功能不中断。
- **模型 opt-in + 过契约**:润色输出过 `validateModelField`(来自 `src/services/patternDiscovery.ts`,签名 `validateModelField(value: string, fallback: string, maxLen?: number): string`,默认 `maxLen=120`);空/占位/超长 → 退回 fallback。
- **不入库**:润色文本只用于显示,**不写规则库**、不持久化。
- **不动引擎/召回**:只消费 `trustSignal(rule)` 与现有 `recalledRules` / `recalledLaws`。
- **新增测试必须追加进 `package.json` 的 `test:evaluation`**。
- 验证命令:`npm run typecheck`、`npm run test:evaluation`。
- 设计 token(已在 `styles.scss` `:root`):颜色用 `var(--ok|warn|info 及 -wash | ink | ink-soft | line | surface)`,圆角 `var(--r-md)`,阴影 `var(--shadow-1)`,等宽 `var(--font-mono)`。**新样式禁止硬编码 hex。**
- 模型 client 调用形如 `client.completeJson({ systemPrompt, userText })`(见 `recallWithModel.ts`)。

---

### Task 1: `decisionAdvice.ts` 纯合成 + 测试

**Files:**
- Create: `src/services/decisionAdvice.ts`
- Create: `tests/decisionAdvice.test.ts`
- Modify: `package.json`(`test:evaluation` 末尾追加)

**Interfaces:**
- Consumes: `trustSignal(rule): { level: 'trusted'|'caution'|'unproven' }`(`src/services/ruleLabels.ts`)、`ExperienceRule.evaluations: RuleEvaluation[]`(`RuleEvaluation.outcome: 'passed'|'failed'|'uncertain'`)、`Law.kind: 'caution'|'strategy'`。
- Produces:
  - `type AdviceVerdict = 'lean' | 'caution' | 'insufficient'`
  - `interface DecisionAdviceStats { ruleCount; trustedCount; cautionCount; unprovenCount; cautionLawCount; passed; failed; successRate: number | null }`(均 number)
  - `interface DecisionAdvice { verdict: AdviceVerdict; label: string; reason: string; stats: DecisionAdviceStats }`
  - `synthesizeAdvice(recalledRules: { rule: ExperienceRule }[], recalledLaws: Law[]): DecisionAdvice | null`

- [ ] **Step 1: 写失败测试** —— 新建 `tests/decisionAdvice.test.ts`:

```ts
import assert from 'node:assert/strict'
import { synthesizeAdvice } from '../src/services/decisionAdvice'
import type { ExperienceRule, Law } from '../src/types/experience'

// 构造伪规则:trustSignal 取决于 verdict/confidence/score/评估次数
function rule(p: {
  verdict?: ExperienceRule['evaluationVerdict']
  confidence?: ExperienceRule['evaluationConfidence']
  score?: number
  passed?: number
  failed?: number
}): ExperienceRule {
  const evaluations = [
    ...Array.from({ length: p.passed ?? 0 }, () => ({ outcome: 'passed' })),
    ...Array.from({ length: p.failed ?? 0 }, () => ({ outcome: 'failed' })),
  ]
  return {
    evaluationVerdict: p.verdict,
    evaluationConfidence: p.confidence,
    evaluationScore: p.score,
    evaluations,
  } as unknown as ExperienceRule
}
function law(kind: 'caution' | 'strategy'): Law {
  return { kind } as unknown as Law
}

// 可信规则:supported + 高置信 + 复测≥2 → trustSignal=trusted
const trusted = rule({ verdict: 'supported', confidence: 'high', score: 80, passed: 3 })
// 谨慎规则:conflicted → trustSignal=caution
const cautionR = rule({ verdict: 'conflicted', passed: 1, failed: 3 })
// 待验证规则:insufficient + 0 复测 → trustSignal=unproven
const unproven = rule({ verdict: 'insufficient' })

// lean:全可信、无谨慎、有效率高
{
  const a = synthesizeAdvice([{ rule: trusted }], [])!
  assert.equal(a.verdict, 'lean')
  assert.equal(a.stats.trustedCount, 1)
  assert.equal(a.stats.passed, 3)
  assert.equal(a.stats.successRate, 1)
}
// caution:命中谨慎规则
{
  assert.equal(synthesizeAdvice([{ rule: cautionR }], [])!.verdict, 'caution')
}
// caution:命中避坑规律(即使规则可信)
{
  const a = synthesizeAdvice([{ rule: trusted }], [law('caution')])!
  assert.equal(a.verdict, 'caution')
  assert.equal(a.stats.cautionLawCount, 1)
}
// caution:有可信但有效率<50%
{
  const r = rule({ verdict: 'supported', confidence: 'high', score: 80, passed: 2, failed: 3 })
  const a = synthesizeAdvice([{ rule: r }], [])!
  assert.equal(a.verdict, 'caution')
  assert.equal(a.stats.successRate, 0.4)
}
// insufficient:无可信 + 决断样本<2
{
  const a = synthesizeAdvice([{ rule: unproven }], [])!
  assert.equal(a.verdict, 'insufficient')
  assert.equal(a.stats.successRate, null)
}
// 空召回 → null
assert.equal(synthesizeAdvice([], []), null)

console.log('decisionAdvice tests passed')
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/decisionAdvice.test.js`
Expected: 编译报错 `Module '"../src/services/decisionAdvice"' has no exported member 'synthesizeAdvice'`。

- [ ] **Step 3: 实现** —— 新建 `src/services/decisionAdvice.ts`:

```ts
// V4 决策建议合成(纯本地确定性)。把找经验召回的规则/规律聚合成一档结论 + 战绩数字。
// 红线:不调模型、不碰 store、不改引擎;只消费 trustSignal 与评估战绩。
import type { ExperienceRule, Law, RuleEvaluation } from '../types/experience'
import { trustSignal } from './ruleLabels'

export type AdviceVerdict = 'lean' | 'caution' | 'insufficient'

export interface DecisionAdviceStats {
  ruleCount: number
  trustedCount: number
  cautionCount: number
  unprovenCount: number
  cautionLawCount: number
  passed: number
  failed: number
  successRate: number | null
}

export interface DecisionAdvice {
  verdict: AdviceVerdict
  label: string
  reason: string
  stats: DecisionAdviceStats
}

// 阈值集中,便于调
const MIN_DECISIVE = 2 // 决断样本(有效+无效)低于此 → 证据不足
const LOW_SUCCESS = 0.5 // 有效率低于此 → 谨慎
const OK_SUCCESS = 0.6 // 有效率不低于此(或无样本)+ 有可信 → 倾向采用

function countOutcomes(evaluations: RuleEvaluation[] | undefined) {
  let passed = 0
  let failed = 0
  for (const e of evaluations ?? []) {
    if (e.outcome === 'passed') passed++
    else if (e.outcome === 'failed') failed++
  }
  return { passed, failed }
}

export function synthesizeAdvice(
  recalledRules: { rule: ExperienceRule }[],
  recalledLaws: Law[],
): DecisionAdvice | null {
  if (recalledRules.length === 0 && recalledLaws.length === 0) return null

  let trustedCount = 0
  let cautionCount = 0
  let unprovenCount = 0
  let passed = 0
  let failed = 0
  for (const { rule } of recalledRules) {
    const level = trustSignal(rule).level
    if (level === 'trusted') trustedCount++
    else if (level === 'caution') cautionCount++
    else unprovenCount++
    const o = countOutcomes(rule.evaluations)
    passed += o.passed
    failed += o.failed
  }
  const cautionLawCount = recalledLaws.filter((l) => l.kind === 'caution').length
  const decisive = passed + failed
  const successRate = decisive > 0 ? passed / decisive : null

  const stats: DecisionAdviceStats = {
    ruleCount: recalledRules.length,
    trustedCount,
    cautionCount,
    unprovenCount,
    cautionLawCount,
    passed,
    failed,
    successRate,
  }

  let verdict: AdviceVerdict
  let label: string
  let reason: string
  if (trustedCount === 0 && decisive < MIN_DECISIVE) {
    verdict = 'insufficient'
    label = '🔍 证据不足'
    reason = '线索有限,先当参考;用后回填结果,让它长出可信度。'
  } else if (cautionCount > 0 || cautionLawCount > 0 || (successRate !== null && successRate < LOW_SUCCESS)) {
    verdict = 'caution'
    label = '⚠️ 谨慎'
    reason = '这类你踩过坑,采纳前先看下面带⚠️的经验。'
  } else if (trustedCount > 0 && cautionCount === 0 && (successRate === null || successRate >= OK_SUCCESS)) {
    verdict = 'lean'
    label = '✅ 倾向采用'
    reason = '这类经验复测站得住,可放心参考。'
  } else {
    verdict = 'caution'
    label = '⚠️ 谨慎'
    reason = '证据有分歧,采纳前再看下面逐条。'
  }

  return { verdict, label, reason, stats }
}
```

- [ ] **Step 4: 注册测试** —— 修改 `package.json` 的 `test:evaluation`,在末尾 `&& node dist-tests/tests/quickRetest.test.js` 之后追加:

```
 && node dist-tests/tests/decisionAdvice.test.js
```

- [ ] **Step 5: 运行,确认通过**

Run: `npm run test:evaluation`
Expected: 末尾出现 `decisionAdvice tests passed`,全部 24 套通过。

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: 无输出。

- [ ] **Step 7: 提交**

```bash
git add src/services/decisionAdvice.ts tests/decisionAdvice.test.ts package.json
git commit -m "feat(v4): synthesizeAdvice — local deterministic decision verdict"
```

---

### Task 2: `adviceWithModel.ts` opt-in 润色 + 测试

**Files:**
- Create: `src/services/adviceWithModel.ts`
- Create: `tests/adviceWithModel.test.ts`
- Modify: `package.json`(`test:evaluation` 末尾追加)

**Interfaces:**
- Consumes: `DecisionAdvice`(Task 1)、`validateModelField(value, fallback, maxLen?)`(`./patternDiscovery`)、`ObservationModelClient`(`./modelAnalysisAdapter`,`completeJson({ systemPrompt, userText })`)。
- Produces:
  - `ADVICE_SYSTEM_PROMPT: string`
  - `buildAdviceUserText(scene: string, advice: DecisionAdvice): string`
  - `polishAdvice(scene: string, advice: DecisionAdvice, client: ObservationModelClient): Promise<string>` —— 返回校验后的润色句;空场景短路返回 `advice.reason`;模型空/占位/超长 → 退回 `advice.reason`。

- [ ] **Step 1: 写失败测试** —— 新建 `tests/adviceWithModel.test.ts`:

```ts
import assert from 'node:assert/strict'
import { polishAdvice, buildAdviceUserText } from '../src/services/adviceWithModel'
import type { DecisionAdvice } from '../src/services/decisionAdvice'
import type { ObservationModelClient } from '../src/services/modelAnalysisAdapter'

function fakeClient(raw: unknown): ObservationModelClient {
  return { completeJson: async () => raw }
}

const advice: DecisionAdvice = {
  verdict: 'lean',
  label: '✅ 倾向采用',
  reason: '这类经验复测站得住,可放心参考。',
  stats: { ruleCount: 2, trustedCount: 2, cautionCount: 0, unprovenCount: 0, cautionLawCount: 0, passed: 5, failed: 1, successRate: 5 / 6 },
}

// userText 含场景与战绩
{
  const t = buildAdviceUserText('要不要接急活', advice)
  assert.ok(t.includes('要不要接急活'))
  assert.ok(t.includes('命中2条') || t.includes('命中 2'))
}

async function asyncTests() {
  // 正常润色 → 采用模型句
  {
    const out = await polishAdvice('要不要接急活', advice, fakeClient({ advice: '这类活你过去基本都搞定了,可以接。' }))
    assert.equal(out, '这类活你过去基本都搞定了,可以接。')
  }
  // 空白 → 退回本地
  {
    const out = await polishAdvice('场景', advice, fakeClient({ advice: '   ' }))
    assert.equal(out, advice.reason)
  }
  // 坏形状(无 advice 字段)→ 退回本地
  {
    const out = await polishAdvice('场景', advice, fakeClient({}))
    assert.equal(out, advice.reason)
  }
  // 空场景 → 不调用 client、退回本地
  {
    let called = false
    const watch: ObservationModelClient = { completeJson: async () => { called = true; return { advice: 'x' } } }
    const out = await polishAdvice('   ', advice, watch)
    assert.equal(out, advice.reason)
    assert.equal(called, false, '空场景不应触发模型调用')
  }
}

asyncTests()
  .then(() => console.log('adviceWithModel tests passed'))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/adviceWithModel.test.js`
Expected: 编译报错 `has no exported member 'polishAdvice'`。

- [ ] **Step 3: 实现** —— 新建 `src/services/adviceWithModel.ts`:

```ts
// V4 决策建议 · AI 可选润色(opt-in)。
// 红线:只把本地已算好的结论换种说法,不得改变结论方向/新增事实;过 validateModelField 校验;
// 失败/占位 → 退回本地 advice.reason;不入库;只在用户点按钮时调用。
import type { ObservationModelClient } from './modelAnalysisAdapter'
import type { DecisionAdvice } from './decisionAdvice'
import { validateModelField } from './patternDiscovery'

export const ADVICE_SYSTEM_PROMPT = [
  '你是「决策建议」润色助手。用户会给出当前决策场景、一个已算好的结论档(倾向采用/谨慎/证据不足)、本地理由与历史战绩数字。',
  '任务:只把这个结论用一句更自然、口语的中文重新说一遍,帮用户更快理解。',
  '严格要求:',
  '1. 不得改变结论方向,不得新增任何事实或数字,不得编造经验。',
  '2. 只输出一句话,40 字内。',
  '只输出 JSON,形如:{"advice":"…"}',
].join('\n')

export function buildAdviceUserText(scene: string, advice: DecisionAdvice): string {
  const s = advice.stats
  const rate = s.successRate !== null ? `(有效率${Math.round(s.successRate * 100)}%)` : ''
  return [
    `场景:${scene}`,
    `结论档:${advice.label}`,
    `本地理由:${advice.reason}`,
    `战绩:命中${s.ruleCount}条经验(${s.trustedCount}可信/${s.cautionCount}谨慎/${s.unprovenCount}待验证),历史${s.passed}有效/${s.failed}无效${rate}`,
  ].join('\n')
}

export async function polishAdvice(
  scene: string,
  advice: DecisionAdvice,
  client: ObservationModelClient,
): Promise<string> {
  const content = scene.trim()
  if (!content) return advice.reason
  const raw = await client.completeJson({
    systemPrompt: ADVICE_SYSTEM_PROMPT,
    userText: buildAdviceUserText(content, advice),
  })
  const value = typeof (raw as { advice?: unknown })?.advice === 'string' ? (raw as { advice: string }).advice : ''
  return validateModelField(value, advice.reason)
}
```

- [ ] **Step 4: 注册测试** —— `package.json` 的 `test:evaluation` 末尾 `&& node dist-tests/tests/decisionAdvice.test.js` 之后追加:

```
 && node dist-tests/tests/adviceWithModel.test.js
```

- [ ] **Step 5: 运行,确认通过**

Run: `npm run test:evaluation`
Expected: 末尾 `adviceWithModel tests passed`,25 套全过。

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: 无输出。

- [ ] **Step 7: 提交**

```bash
git add src/services/adviceWithModel.ts tests/adviceWithModel.test.ts package.json
git commit -m "feat(v4): polishAdvice — opt-in AI rephrase with contract fallback"
```

---

### Task 3: InputModule 建议卡 + 润色按钮 + 样式

**Files:**
- Modify: `src/pages/index/components/InputModule.vue`(script:import + advice computed + 润色状态/函数 + watch 重置;template:recall-results 顶部插入建议卡)
- Modify: `src/pages/index/styles.scss`(`.decision-advice*` 样式)

**Interfaces:**
- Consumes: `synthesizeAdvice`(Task 1)、`polishAdvice`(Task 2)、现有 `recalledRules` / `recalledLaws` / `lastScene` / `hasModel` / `getActiveModelClient`。
- Produces: 无对外接口。

- [ ] **Step 1: script —— 引入 + advice computed + 润色状态/函数** —— 在 `src/pages/index/components/InputModule.vue`:

(a) 把 `import { ref, computed } from 'vue'` 改为:

```ts
import { ref, computed, watch } from 'vue'
```

(b) 新增两个 import(放在 `import { trustSignal } from '../../../services/ruleLabels'` 之后):

```ts
import { synthesizeAdvice } from '../../../services/decisionAdvice'
import { polishAdvice } from '../../../services/adviceWithModel'
```

(c) 在 `const cautionCount = computed(...)` 之后新增 advice computed、润色状态与函数,并在召回结果变化时清空润色句:

```ts
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
```

- [ ] **Step 2: template —— recall-results 顶部插入建议卡** —— 在 `<view v-if="hasSearched" class="recall-results">` 内、`<view class="section-head">…</view>` 之后、`<view v-if="cautionCount > 0" class="recall-caution">` 之前,插入:

```html
        <view v-if="advice" :class="['decision-advice', advice.verdict]">
          <text class="advice-label">{{ advice.label }}</text>
          <text class="advice-stats">命中 {{ advice.stats.ruleCount }} 条经验（{{ advice.stats.trustedCount }} 可信 · {{ advice.stats.unprovenCount }} 待验证）· 历史 {{ advice.stats.passed }} 有效 / {{ advice.stats.failed }} 无效<template v-if="advice.stats.successRate !== null">（有效率 {{ pct(advice.stats.successRate) }}%）</template></text>
          <text class="advice-reason">{{ polishedReason || advice.reason }}</text>
          <button v-if="hasModel" class="ghost-button small advice-polish" :disabled="isPolishing" @click="polishCurrentAdvice">
            {{ isPolishing ? '思考中…' : '🧠 让 AI 说句人话' }}
          </button>
        </view>
```

- [ ] **Step 3: 样式** —— 在 `src/pages/index/styles.scss` 末尾追加:

```scss
/* V4 决策建议卡:找经验结果顶部,按结论档配色(本地确定性 + 可选 AI 润色) */
.decision-advice {
  margin: 6px 0 10px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  border-left: 3px solid var(--info);
  background: var(--surface);
  box-shadow: var(--shadow-1);
}
.decision-advice.lean { border-left-color: var(--ok); background: var(--ok-wash); }
.decision-advice.caution { border-left-color: var(--warn); background: var(--warn-wash); }
.decision-advice.insufficient { border-left-color: var(--info); background: var(--info-wash); }
.advice-label { display: block; font-size: 15px; font-weight: 700; }
.decision-advice.lean .advice-label { color: var(--ok); }
.decision-advice.caution .advice-label { color: var(--warn); }
.decision-advice.insufficient .advice-label { color: var(--info); }
.advice-stats {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
}
.advice-reason {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  color: var(--ink);
  line-height: 1.5;
}
.advice-polish { margin-top: 8px; }
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 无输出。

- [ ] **Step 5: 实机验证(Playwright,需 dev server)**

打开 `http://localhost:5173/#/`,输入一个与已有规则相关的场景 → 点「找经验」。
Expected:
- 结果列表上方出现建议卡:档位徽标(✅/⚠️/🔍)+ 战绩行(命中 N 条…历史 X 有效/Y 无效)+ 一句理由。
- 配了模型时显示「🧠 让 AI 说句人话」;点击 → 文案变"思考中…" → 理由句被替换(失败则保持本地句)。
- 清空 / 重新召回后,润色句清空、卡片随新结果刷新。
- 空召回(无匹配)→ 不出建议卡。

- [ ] **Step 6: 提交**

```bash
git add src/pages/index/components/InputModule.vue src/pages/index/styles.scss
git commit -m "feat(v4): decision-advice card at recall top + opt-in AI polish button"
```

---

### Task 4: 全量验证 + 收尾

**Files:** 无(仅验证/提交)

- [ ] **Step 1: typecheck + 全量测试**

Run: `npm run typecheck && npm run test:evaluation`
Expected: typecheck 无输出;末尾 `decisionAdvice tests passed` 与 `adviceWithModel tests passed`,25 套全绿。

- [ ] **Step 2: 实机走查(Playwright,移动宽 414px)**

- 找经验得到结果 → 顶部建议卡档位/战绩正确;无模型时不显示润色按钮。
- 召回为空 → 无建议卡。
- 控制台 error 级消息为 0。

- [ ] **Step 3: 若有零散修复,补提交**(无则跳过)

```bash
git add -A && git commit -m "fix(v4): polish decision-advice per live walkthrough"
```

---

## Self-Review(已执行)

**Spec coverage:**
- §3 合成逻辑 + 三档判定 + 战绩 → Task 1(`synthesizeAdvice` + 全分支测试)。
- §4 AI 可选润色 + `validateModelField` + 兜底 → Task 2(`polishAdvice` + 防越界测试)。
- §5 UI 建议卡 + 润色按钮 + `hasModel` 判定 → Task 3。
- §6 边界(空召回 null / 无样本 insufficient / 模型失败退本地 / 空场景不调用)→ Task 1(null、insufficient)、Task 2(退本地、空场景不调用)、Task 3(`v-if="advice"`、`v-if="hasModel"`)。
- §7 测试 → `decisionAdvice.test.ts` + `adviceWithModel.test.ts`,均注册。
- §9 验收 1-5 → Task 1-4;§9.3 润色实机 → Task 3 Step 5。

**Placeholder scan:** 无 TBD/TODO;每个改代码的 Step 均含完整代码。

**Type consistency:** `DecisionAdvice`/`DecisionAdviceStats`/`AdviceVerdict` 在 Task 1 定义,Task 2/3 消费;`synthesizeAdvice(recalledRules, recalledLaws)` 与 InputModule 的 `recalledRules: { rule; reasons }[]`(结构含 `rule`)兼容(函数只取 `{ rule }`);`polishAdvice(scene, advice, client)` 三参一致;`validateModelField(value, fallback)` 与 patternDiscovery 实际签名一致。
