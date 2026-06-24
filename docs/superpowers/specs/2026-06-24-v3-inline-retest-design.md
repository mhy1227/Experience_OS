# V3 经验验证 · 就地极简复测 —— 设计文档

> 状态:✅ 已完成(2026-06-24 落地;实现计划见 `docs/superpowers/plans/2026-06-24-v3-inline-retest.md`)
> 日期:2026-06-24
> 关联:`docs/version-roadmap.md`(V3)、`src/services/evaluationEngine.ts`(已有验证引擎)、`src/services/ruleLabels.ts`(`trustSignal`)、`docs/superpowers/specs/2026-06-24-decision-support-right-half.md`(右半边/结果回填)

## 1. 背景与定位

V3 的 roadmap 能力(验证次数 / 成功率 / 可信度 / 策略演化)**在 `evaluationEngine.ts`(1714 行)里早已实现**,并远不止于此(复测协议、采用门槛、重复性、样本独立性、一致性、复制矩阵、边界目录、维护健康……)。但它**过度工程化**,以"黑话"形态**降级隐藏在「高级」面板**,普通用户用不起来。加上本会话已落地的右半边(找经验召回 / `trustSignal` / 结果回填),"验证"的**引擎与入口都已存在**。

因此 V3 不是从零造验证,而是**把已有验证能力产品化**:让"复测"成为规则卡片上**低摩擦、看得见**的动作,把被动变主动一点,黑话继续藏。

**一句话目标**:让用户用最低成本持续回答"这条经验这次还管用吗",并一眼看到它从"待验证"走向"可信"。

## 2. 范围与非目标

**做:**
- **就地极简复测**:每条规则卡片常显一行「上次管用吗?有效 / 无效 / 不确定」,点后可选写一句,确认即记。
- **复测即时反馈**:复测后 `trustSignal` 实时刷新 + 一行极简小结「复测 N 次 · X 有效 / Y 无效」。
- **待验证优先**:规则库把「待验证 / 谨慎」的规则排前、`trusted` 沉底;顶部一句纯文字「N 条待验证」。

**非目标(本期坚决不做):**
- ❌ 验证收件箱 / 新页面 / 队列(已在 brainstorming 否决)。
- ❌ 改写 `evaluationEngine` 内部;❌ 在主界面显示采用门槛 / 复制矩阵 / 样本独立性等黑话(继续折叠在「高级」与「展开评估详情」)。
- ❌ 规律(Law)验证闭环(留 V3.1)。
- ❌ 删除评估体系(红线:**降级隐藏而非删除**)。

**红线(继承 CLAUDE.md):**
- **不重写已完成部分,只补缺口**:复用 `addEvaluation`、`trustSignal`、`createEvaluationObservation`、`evaluationEngine` 派生;引擎照常计算,只控制"显示什么"。
- **本地优先**:复测是纯本地同步写入,无模型 / 无网络调用,不涉及降级链。
- 证据**可选不强制**;填了就经现有契约落成 evidence,不裸写。

## 3. 组件改动(集中 3 处,均不新增页)

### a. `src/components/RuleCard.vue` —— 快速复测条
- 在卡片动作区(信任芯片下、`feedback-row` 附近)新增**常显**一行:
  - 提示文案「上次管用吗?」+ 三个按钮 `✓ 有效` / `✗ 无效` / `? 不确定`。
- 交互:点任一按钮 → **原地展开**一个可选一行输入(placeholder「这次的情况(可不填)」)+ `确认` / `取消`。
  - `确认` → `addEvaluation(rule.id, outcome, '', line.trim(), 'manual')`,清空并收起。
  - `取消` → 收起,不写入。
  - 设计取舍:采用"展开确认"而非"一键直记",用可选输入那一步天然做二次确认,**防误评**。
- 复测后小结:在快速复测条旁/下显示一行「复测 N 次 · X 有效 / Y 无效」(数据取 `rule.evaluations`,沿用 `evaluationSummary` 同源口径);`trustSignal` 芯片本就随响应式刷新。
- **召回卡不渲染快速复测条**:通过新增 `hideQuickRetest` prop 控制(**不**复用 `compact` —— 实现时发现规则库也用 `compact` 做密度,若按 compact 关闭会误伤规则库这一主验证面;故 InputModule 找经验召回卡设 `hide-quick-retest`,其它一律显示)。召回卡已有"结果回填",避免重复入口。
- 原「展开评估详情(复测 / 采用门槛 / 协议)」面板**完全保留**,折叠给高级用户;其内部旧的复测输入不动。
- 新增状态:`setup` 内用 `ref` 维护"当前展开的 outcome"与"输入值"(单条卡片内,沿用现有 render 函数写法)。

### b. `src/pages/index/components/RuleLibrary.vue` —— 待验证优先
- 在 `filteredRules` 之后插入一层**稳定排序**(不改过滤逻辑):
  - 排序键:`trustSignal(rule).level` → `unproven` (0) < `caution` (1) < `trusted` (2),升序(待验证在前、可信沉底)。
  - 同级保持原顺序(稳定排序:用 `map`+索引或 `Array.prototype.sort` 的稳定性保证)。
  - 排序后再交给 `usePagination`。
- 顶部小结:在现有 `section-meta` 旁追加一句「N 条待验证」(N = `unproven` 计数);纯文字,**不做按钮 / 跳转 / 队列**。

### c. 轻量「该复测」标记(MVP 可选增强)
- 若 `rule.nextEvaluationAction` 非空(引擎已产出的"下一步复测建议"),在快速复测条上显示一个小提示词(如「该复测了」)。
- 判定为**纯展示**,不改引擎;MVP 阶段可先只靠 (b) 的排序,本项作为锦上添花,失败/为空时静默不显示。

## 4. 数据流

```
卡片点 有效/无效/不确定
  → (可选)填一句「这次的情况」
  → addEvaluation(rule.id, outcome, '', line, 'manual')
      → createEvaluationObservation(...) 落成 evidence(若有 line)
      → evaluationEngine 重算 verdict / score / confidence / trend(照旧)
  → trustSignal(rule) 派生新信号
      → 卡片信任芯片 + 「复测 N 次 · X 有效 / Y 无效」小结刷新
      → RuleLibrary 排序随响应式更新(复测充分的规则自然下沉)
```

- `source` 沿用 `'manual'`(省改动;快速复测与手动复测在数据语义上等价,无需新增 `'quickcheck'`)。
- 不引入新的 store action:直接复用已暴露的 `store.addEvaluation`(RuleCard 已 `@evaluate` emit 到 store)。

## 5. 错误处理与边界

- **不填一句直接确认** → 仍记一次复测(`observationText` 空、`note` 空),走 `addEvaluation` 现有空参路径,不报错。
- **取消** → 不写入、不留痕。
- **防误触** → "展开确认"两步;`确认` 前可改/清空输入。
- **空规则 / 找不到 rule** → `addEvaluation` 内已 `if (!rule) return`,安全。
- **无模型 / 无网络** → 复测全程本地同步,不触发任何模型路径,无降级分支。
- **召回卡(`hide-quick-retest`)** → 不渲染快速复测条,杜绝与结果回填重复。

## 6. 测试策略(纯 TS + `node:assert`,追加进 `package.json` 的 `test:evaluation`)

新增 `tests/quickRetest.test.ts`:
- **一键空证据**:`addEvaluation(id, 'passed', '', '', 'manual')` → `evaluations` +1;引擎派生的 verdict/score 随之更新;不抛错。
- **一键 + 一句**:带 `observationText` → 该句经 `createEvaluationObservation` 落成 evidence(断言 evidence/observation 文本存在)。
- **趋势/可信演化**:连续多次 `passed` → `trustSignal` 由 `unproven` → `trusted`(镜像现有 `trustSignal` 阈值)。
- **规则库排序(纯函数化)**:把排序比较器抽成可测纯函数(或在测试内复用 `trustSignal`),构造 `unproven / caution / trusted` 三态 → 断言待验证在前、`trusted` 沉底、同级稳定。

**真机验证(Playwright,镜像 V1/V2):**
- 规则卡点「有效」→(可选不填)确认 → 芯片/小结刷新;重复数次后芯片变「可信」。
- 规则库:待验证规则置顶;复测充分后下沉;顶部「N 条待验证」计数正确。

## 7. 风险与取舍

- **卡片高度增加**:快速复测条常显会让每张卡变高 → 用紧凑一行 + 仅在展开输入时增高;compact 卡不显示以控制召回列表密度。
- **误评**:用"展开确认"两步缓解;后续如需可加"撤销上次复测"(本期不做)。
- **排序抖动**:复测后规则可能即时下沉造成列表跳动 → 接受(语义正确:验完就该靠后);如体感差,后续可加"本次会话内不重排"(本期不做)。
- **与「展开评估详情」并存**:两个复测入口(快速 + 详情内旧入口)并存,语义一致、数据同源,不冲突;详情面板属高级折叠,普通用户基本不展开。

## 8. 验收标准

1. 规则卡常显「上次管用吗?有效/无效/不确定」;点击 → 可选一句 → 确认即记一次复测,不报错。
2. 不填一句也能记;`取消` 不写入。
3. 复测后信任芯片与「复测 N 次 · X 有效 / Y 无效」小结即时刷新;多次有效后芯片可达「可信」。
4. 规则库「待验证/谨慎」置顶、「可信」沉底,同级稳定;顶部「N 条待验证」计数正确。
5. compact 召回卡不出现快速复测条(仍用结果回填)。
6. 「高级」与「展开评估详情」黑话不外泄到主界面;`evaluationEngine` 未被改写。
7. `typecheck` + 全部 `test:evaluation`(含新增 `quickRetest`)绿;0 控制台报错;Playwright 实机走查通过。

## 9. 不做清单(YAGNI)

验证收件箱 / 队列 / 新页、Law 验证闭环、撤销复测、复测提醒推送、引擎黑话产品化、跨设备同步 —— 全部不在本期。
