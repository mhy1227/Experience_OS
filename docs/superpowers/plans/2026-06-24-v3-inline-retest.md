# V3 就地极简复测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已有的验证引擎产品化 —— 在规则卡片上做一行低摩擦"就地复测",并让规则库把"待验证"的规则排前,不新增页、不动引擎。

**Architecture:** 复用 `store.addEvaluation`(已支持 outcome + 可选证据)与 `services/ruleLabels.ts` 的 `trustSignal`。新增一个纯函数 `verificationRank` 给规则库排序;`RuleCard` 渲染函数里加"快速复测条"(常显按钮 + 展开确认 + 复测小结);`RuleLibrary` 用 `verificationRank` 稳定排序并显示"N 条待验证"。黑话面板与引擎完全不动。

**Tech Stack:** Vue 3(`<script lang="ts">` + render 函数 `h()`)、Pinia、SCSS(全局 `styles.scss` + 设计 token)、纯 TS 测试(`tsconfig.test.json` → `node` + `node:assert/strict`)。

## Global Constraints

- **不重写已完成部分,只补缺口**:复用 `addEvaluation`/`trustSignal`/`evaluationSummary`/`createEvaluationObservation`;`evaluationEngine.ts` 一行不改。
- **黑话续藏**:不在主界面显示采用门槛/复制矩阵/样本独立性等;原「展开评估详情」面板保持不动。
- **本地优先**:复测是纯本地同步写入,无模型/网络调用,无降级分支。
- **证据可选不强制**:复测可不填一句;填了走现有 `addEvaluation(observationText)` 路径落成 evidence。
- **compact 卡不加快速复测条**:`props.compact === true`(找经验召回卡)已有结果回填,避免重复入口。
- **新增测试必须追加进 `package.json` 的 `test:evaluation`** 才会被执行。
- 验证命令:`npm run typecheck`(vue-tsc)、`npm run test:evaluation`(编译后 node 跑各 test.js)。
- 设计 token(已存在于 `styles.scss` `:root`):颜色用 `var(--brand|ink|ink-soft|ink-faint|line|line-strong|surface|surface-sunken|ok|warn|info 及其 -wash)`,圆角 `var(--r-sm|r-md)`,等宽 `var(--font-mono)`。**新样式禁止硬编码 hex。**

---

### Task 1: `verificationRank` 纯函数 + 复测写入特征测试

**Files:**
- Modify: `src/services/ruleLabels.ts`(在 `trustSignal` 之后追加 `verificationRank`)
- Create: `tests/quickRetest.test.ts`
- Modify: `package.json`(`test:evaluation` 末尾追加新测试)

**Interfaces:**
- Consumes: `trustSignal(rule): { level: 'trusted'|'caution'|'unproven'; ... }`、`store.submitObservation(text, client)`、`store.addEvaluation(ruleId, outcome, note, observationText, source)`、`store.rules`(Pinia setup store 中已解包为数组)。
- Produces: `verificationRank(rule: ExperienceRule): number` —— `unproven=0`、`caution=1`、`trusted=2`(升序即"待验证在前、可信沉底")。

- [ ] **Step 1: 写失败测试** —— 新建 `tests/quickRetest.test.ts`:

```ts
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useExperienceStore } from '../src/stores/experience'
import { verificationRank } from '../src/services/ruleLabels'
import type { ExperienceRule } from '../src/types/experience'
import type { ObservationModelClient } from '../src/services/modelAnalysisAdapter'

// ---------------------------------------------------------------------------
// V3 就地复测:verificationRank 排序(待验证→谨慎→可信)+ addEvaluation 快速复测路径。
// ---------------------------------------------------------------------------

function installLocalStorage() {
  const data = new Map<string, string>()
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size
    },
  } as Storage
}

function makeStore() {
  installLocalStorage()
  setActivePinia(createPinia())
  return useExperienceStore()
}

function makeFakeClient(raw: unknown): ObservationModelClient {
  return { completeJson: async () => raw }
}

function strategyRaw(title: string, category: string) {
  return {
    category,
    tags: ['标签'],
    summary: '摘要',
    title,
    conclusion: '结论说明。',
    recommendation: '可执行的建议。',
    conditions: ['条件一', '条件二'],
    warnings: ['注意'],
    reusability: 'medium',
    direction: 'positive',
    analysisType: 'rule',
    confidence: 'medium',
    location: undefined,
  }
}

// trustSignal 输入字段够用即可的伪规则(镜像 trustSignal.test.ts 写法)
function ruleWith(p: {
  verdict?: ExperienceRule['evaluationVerdict']
  confidence?: ExperienceRule['evaluationConfidence']
  score?: number
  evals?: number
}): ExperienceRule {
  return {
    evaluationVerdict: p.verdict,
    evaluationConfidence: p.confidence,
    evaluationScore: p.score,
    evaluations: Array.from({ length: p.evals ?? 0 }, () => ({})),
  } as unknown as ExperienceRule
}

// verificationRank:三态映射 + 排序
{
  const unproven = ruleWith({ verdict: 'insufficient', evals: 0 })
  const caution = ruleWith({ verdict: 'mixed', evals: 4 })
  const trusted = ruleWith({ verdict: 'supported', confidence: 'high', score: 80, evals: 3 })
  assert.equal(verificationRank(unproven), 0, '待验证应排最前')
  assert.equal(verificationRank(caution), 1)
  assert.equal(verificationRank(trusted), 2, '可信应沉底')
  const sorted = [trusted, unproven, caution].slice().sort((a, b) => verificationRank(a) - verificationRank(b))
  assert.deepEqual(sorted, [unproven, caution, trusted], '排序:待验证→谨慎→可信')
}

async function asyncTests() {
  // 快速复测:一键 + 一句 → evaluations +1,observationText 落成证据
  {
    const store = makeStore()
    await store.submitObservation('工作场景甲一二三', makeFakeClient(strategyRaw('对齐策略', '工作')))
    const id = store.rules[0]!.id
    store.addEvaluation(id, 'passed', '', '这次也按时交付了', 'manual')
    const evals = store.rules[0]!.evaluations ?? []
    assert.equal(evals.length, 1, '快速复测应记一次评估')
    assert.equal(evals[0]!.outcome, 'passed')
    assert.equal(evals[0]!.observationText, '这次也按时交付了', '填的一句应作为证据')
  }

  // 快速复测:一键不填证据 → 仍记一次,不抛错
  {
    const store = makeStore()
    await store.submitObservation('运动场景甲一二三', makeFakeClient(strategyRaw('高峰期避开', '运动')))
    const id = store.rules[0]!.id
    store.addEvaluation(id, 'failed', '', '', 'manual')
    assert.equal((store.rules[0]!.evaluations ?? []).length, 1, '不填证据也应记一次')
  }
}

asyncTests()
  .then(() => console.log('quickRetest tests passed'))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/quickRetest.test.js`
Expected: 编译期报错 `'"../src/services/ruleLabels"' has no exported member 'verificationRank'`(或运行期 `verificationRank is not a function`)。

- [ ] **Step 3: 实现 `verificationRank`** —— 在 `src/services/ruleLabels.ts` 的 `trustSignal` 函数之后追加:

```ts
// 验证优先级:待验证(0)→ 谨慎(1)→ 可信(2)。规则库按此升序,把"该验的"排前。
export function verificationRank(rule: ExperienceRule): number {
  const level = trustSignal(rule).level
  return level === 'unproven' ? 0 : level === 'caution' ? 1 : 2
}
```

- [ ] **Step 4: 注册测试** —— 修改 `package.json` 的 `test:evaluation`,在末尾 `&& node dist-tests/tests/trustSignal.test.js` 之后追加:

```
 && node dist-tests/tests/quickRetest.test.js
```

- [ ] **Step 5: 运行测试,确认通过**

Run: `npm run test:evaluation`
Expected: 末尾出现 `quickRetest tests passed`,全部 23 套通过。

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: 无输出(0 错)。

- [ ] **Step 7: 提交**

```bash
git add src/services/ruleLabels.ts tests/quickRetest.test.ts package.json
git commit -m "feat(v3): verificationRank + quick-retest store-path tests"
```

---

### Task 2: 规则库待验证优先排序 + "N 条待验证"

**Files:**
- Modify: `src/pages/index/components/RuleLibrary.vue`(script 段:引入 `verificationRank`,新增 `sortedRules`/`unprovenCount`,`usePagination` 改吃 `sortedRules`;template 段:`section-meta` 追加计数)

**Interfaces:**
- Consumes: `verificationRank`(Task 1)、现有 `filteredRules`(computed)、`usePagination(source)`。
- Produces: 无对外接口(页面内部)。

- [ ] **Step 1: 引入 `verificationRank` 并新增排序/计数** —— 在 `src/pages/index/components/RuleLibrary.vue` 的 `<script setup>` 中,把现有

```ts
const filteredRules = computed(() => {
  // ...（保持不变）
})

const { page, pageSize, pageSizeOptions, totalPages, total, paged: pagedRules, reset } = usePagination(filteredRules)
```

改为(在 `filteredRules` 之后、`usePagination` 之前插入排序与计数,并把分页源换成 `sortedRules`):

```ts
const filteredRules = computed(() => {
  // ...（保持不变）
})

// V3:待验证(0)→谨慎(1)→可信(2)稳定排序,把"该验的"排前(Array.sort 在 Node20 稳定)
const sortedRules = computed(() =>
  filteredRules.value.slice().sort((a, b) => verificationRank(a) - verificationRank(b)),
)
const unprovenCount = computed(() => filteredRules.value.filter((r) => verificationRank(r) === 0).length)

const { page, pageSize, pageSizeOptions, totalPages, total, paged: pagedRules, reset } = usePagination(sortedRules)
```

并在该文件 import 区追加(与现有 `import { ... } from '../../../services/ruleLabels'` 合并;若无该 import 则新增一行):

```ts
import { verificationRank } from '../../../services/ruleLabels'
```

- [ ] **Step 2: template 显示"N 条待验证"** —— 把 `section-head` 里的

```html
<text class="section-meta">{{ filteredRules.length }} / {{ store.rules.length }} 条规则</text>
```

改为:

```html
<text class="section-meta">
  {{ filteredRules.length }} / {{ store.rules.length }} 条规则<template v-if="unprovenCount > 0"> · {{ unprovenCount }} 条待验证</template>
</text>
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 无输出(0 错)。若报 `pagedRules`/`filteredRules` 相关未使用错误,确认 `pagedRules` 仍用于列表渲染、`filteredRules` 仍被 `sortedRules`/`unprovenCount`/`section-meta` 使用(均应仍在用)。

- [ ] **Step 4: 实机验证(Playwright,需 dev server)**

Run(若未起):`npm run dev:h5`
打开 `http://localhost:5173/#/rules`(建议先在记录页「载入演示数据」或对若干规则复测制造三态)。
Expected: 列表中「🔍待验证 / ⚠️谨慎」的规则排在「✅可信」之前;标题区出现「… 条规则 · N 条待验证」。

- [ ] **Step 5: 提交**

```bash
git add src/pages/index/components/RuleLibrary.vue
git commit -m "feat(v3): rule library sorts 待验证 first + count hint"
```

---

### Task 3: RuleCard 快速复测条 + 复测小结 + 样式

**Files:**
- Modify: `src/components/RuleCard.vue`(`setup` 内新增状态与渲染;render 在 `feedback-row` 前插入快速复测条,仅 `!compact`)
- Modify: `src/pages/index/styles.scss`(新增 `.quick-retest*` 样式,用 token)

**Interfaces:**
- Consumes: `emit('evaluate', ruleId, outcome, note, observationText, source)`(RuleCard 现有 `@evaluate` 已在各页绑定 `store.addEvaluation`)、`evaluationSummary(evaluations)`(已 import)、`EvaluationOutcome` 类型(已 import)。
- Produces: 无对外接口。

- [ ] **Step 1: 新增快速复测状态与构造器** —— 在 `src/components/RuleCard.vue` 的 `setup(props, { emit }) {` 内,`const expanded = ref(false)` 之后追加:

```ts
    // V3 就地极简复测:常显 有效/无效/不确定;点后展开可选一句 + 确认(防误评)
    const quickOutcome = ref<EvaluationOutcome | null>(null)
    const quickLine = ref('')
    const quickBtn = (label: string, value: EvaluationOutcome) =>
      h(
        'button',
        {
          class: ['quick-btn', value, quickOutcome.value === value ? 'active' : ''],
          onClick: () => {
            quickOutcome.value = quickOutcome.value === value ? null : value
          },
        },
        label,
      )
    const submitQuick = (outcome: EvaluationOutcome) => {
      emit('evaluate', props.rule.id, outcome, '', quickLine.value.trim(), 'manual')
      quickOutcome.value = null
      quickLine.value = ''
    }
```

- [ ] **Step 2: 在 render 中插入快速复测条** —— 在 `return h('view', { class: ['rule-card', ...] }, [ ... ])` 的子节点数组里,把结尾的

```ts
        h('view', { class: 'feedback-row' }, [
          button('有用', 'useful'),
          button('待观察', 'watch'),
          button('不准确', 'inaccurate'),
        ]),
```

改为(在 `feedback-row` 之前插入快速复测条,仅非 compact 渲染):

```ts
        !props.compact &&
          h('view', { class: 'quick-retest' }, [
            h('view', { class: 'quick-retest-head' }, [
              h('text', { class: 'quick-retest-q' }, '上次管用吗?'),
              evalCount > 0 && h('text', { class: 'quick-retest-summary' }, evaluationSummary(props.rule.evaluations)),
            ]),
            h('view', { class: 'quick-retest-btns' }, [
              quickBtn('✓ 有效', 'passed'),
              quickBtn('✗ 无效', 'failed'),
              quickBtn('? 不确定', 'uncertain'),
            ]),
            quickOutcome.value &&
              h('view', { class: 'quick-retest-confirm' }, [
                h('input', {
                  class: 'quick-retest-input',
                  value: quickLine.value,
                  placeholder: '这次的情况(可不填)',
                  onInput: (e: Event) => {
                    quickLine.value = (e.target as HTMLInputElement).value
                  },
                }),
                h('button', { class: 'primary-button quick-confirm', onClick: () => submitQuick(quickOutcome.value!) }, '确认'),
                h(
                  'button',
                  {
                    class: 'ghost-button quick-cancel',
                    onClick: () => {
                      quickOutcome.value = null
                      quickLine.value = ''
                    },
                  },
                  '取消',
                ),
              ]),
          ]),
        h('view', { class: 'feedback-row' }, [
          button('有用', 'useful'),
          button('待观察', 'watch'),
          button('不准确', 'inaccurate'),
        ]),
```

(`evalCount` 已在 render 顶部定义:`const evalCount = props.rule.evaluations?.length ?? 0`。)

- [ ] **Step 3: 新增样式** —— 在 `src/pages/index/styles.scss` 末尾追加:

```scss
/* V3 就地极简复测:常显一行 + 展开确认。黑话仍在「展开评估详情」里。 */
.quick-retest {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.quick-retest-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.quick-retest-q {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-soft);
}
.quick-retest-summary {
  font-size: 12px;
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}
.quick-retest-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.quick-btn {
  min-height: 34px;
  padding: 0 14px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-soft);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.quick-btn:hover {
  border-color: var(--line-strong);
  background: var(--surface-sunken);
}
.quick-btn.active.passed {
  background: var(--ok-wash);
  border-color: var(--ok);
  color: var(--ok);
}
.quick-btn.active.failed {
  background: var(--warn-wash);
  border-color: var(--warn);
  color: var(--warn);
}
.quick-btn.active.uncertain {
  background: var(--info-wash);
  border-color: var(--info);
  color: var(--info);
}
.quick-retest-confirm {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.quick-retest-input {
  flex: 1;
  min-width: 160px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface-sunken);
  color: var(--ink);
  font-size: 14px;
}
.quick-confirm,
.quick-cancel {
  min-height: 36px;
}
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 无输出(0 错)。

- [ ] **Step 5: 实机验证(Playwright)**

打开 `http://localhost:5173/#/`(记录页最新策略卡)或 `#/rules`。
Expected:
- 非 compact 卡片底部出现「上次管用吗? ✓有效 / ✗无效 / ?不确定」。
- 点「✓有效」→ 该按钮高亮(绿)+ 下方出现一行可选输入与「确认/取消」。
- 「确认」→ 卡片信任芯片刷新、出现/更新「N 次评估:X 有效 / Y 无效」小结;多次有效后芯片趋向「✅可信」。
- 找经验召回里的 compact 卡**不出现**快速复测条。

- [ ] **Step 6: 提交**

```bash
git add src/components/RuleCard.vue src/pages/index/styles.scss
git commit -m "feat(v3): inline quick-retest row on RuleCard (expand-to-confirm)"
```

---

### Task 4: 全量验证 + 收尾

**Files:** 无(仅验证/提交)

- [ ] **Step 1: typecheck + 全量测试**

Run: `npm run typecheck && npm run test:evaluation`
Expected: typecheck 0 错;测试末尾 `quickRetest tests passed`,23 套全绿。

- [ ] **Step 2: 实机走查(Playwright,移动宽 414px)**

- 记录页:对最新策略卡点「✓有效」(不填)→ 确认 → 芯片/小结刷新,无控制台报错。
- 规则库:待验证规则置顶;复测充分后下沉;「N 条待验证」计数随之变化。
- 找经验:召回 compact 卡无快速复测条、结果回填仍在。
- 控制台 error 级消息为 0。

- [ ] **Step 3: 若有零散修复,补提交**

```bash
git add -A
git commit -m "fix(v3): polish quick-retest per live walkthrough"
```

(无修复则跳过。)

---

## Self-Review(已执行)

**Spec coverage:**
- §3a 快速复测条 → Task 3。§3b 待验证优先 + 计数 → Task 2。§3c「该复测」标记 → spec 标为 MVP 可选,本计划**未纳入**(YAGNI;排序已覆盖发现性)。
- §4 数据流(addEvaluation manual + 可选证据)→ Task 3 Step 1-2 + Task 1 特征测试。
- §5 边界(不填/取消/compact 不渲染)→ Task 3(取消按钮、`!props.compact`)+ Task 1(空证据测试)。
- §6 测试 → Task 1(verificationRank 排序 + addEvaluation 两条路径);规则库排序的纯函数化即 `verificationRank`,已单测。
- §8 验收 1-7 → Task 1-4 覆盖;§8.3 多次有效→可信由 Task 3 Step 5 实机确认(`trustSignal` 阈值已在 `trustSignal.test.ts` 单测,不重复)。

**Placeholder scan:** 无 TBD/TODO;每个改代码的 Step 均给出完整代码。

**Type consistency:** `verificationRank(rule): number` 在 Task 1 定义、Task 2 消费,签名一致;`submitQuick`/`quickBtn`/`quickOutcome`/`quickLine` 命名贯穿 Task 3;`emit('evaluate', id, outcome, '', line, 'manual')` 参数顺序与 `addEvaluation(ruleId, outcome, note, observationText, source)` 对齐。

**说明:** §3c「该复测」小标记本期不做(spec 已标可选/MVP);如需,后续单开小任务接 `rule.nextEvaluationAction`。
