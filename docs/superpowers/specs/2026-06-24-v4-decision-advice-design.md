# V4 决策辅助 · 决策建议合成 —— 设计文档

> 状态:Draft(brainstorming 产出,待执行)
> 日期:2026-06-24
> 关联:`docs/version-roadmap.md`(V4)、`docs/superpowers/specs/2026-06-24-decision-support-right-half.md`(右半边:找经验/召回/风险/可信度)、`src/services/ruleLabels.ts`(`trustSignal`)、`src/services/recallWithModel.ts`(opt-in 模型 + 防幻觉范式)、`src/services/patternDiscovery.ts`(`validateModelField` 校验)

## 1. 背景与定位

V4 决策辅助的 4 项 roadmap 能力(场景识别 / 风险提醒 / 历史经验召回 / 决策建议)中,前三项右半边已实现:`找经验`(关键词 + 模型语义召回)、caution 风险横幅、`trustSignal` 可信度。**唯一弱项是「决策建议」**:现在只把召回到的经验**列成一堆卡片**让用户自己读,没有合成一条明确结论。

V4 本期补上这一环:在决策点(找经验)把召回经验的**可信度 + 历史战绩**合成一张**决策建议卡** —— 一句结论(倾向采用 / 谨慎 / 证据不足)+ 战绩数字 + 理由。对应 roadmap 的价值例子「这门高价课你过去买过 6 次,完成率仅 25%」(一个可本地计算的统计结论)。

## 2. 范围与非目标

**做:**
- **本地确定性建议合成**:纯函数把找经验召回的规则/规律聚合成一档结论 + 战绩数字 + 一句理由。
- **AI 可选润色**(opt-in):一个按钮让模型把本地结论改写成更顺的一句话;本地结论始终是底座与兜底。
- 建议卡渲染在**找经验结果列表上方**。

**非目标(本期不做):**
- ❌ 提交观察后主动浮现建议卡(合成函数同源,后续想加只是多一个渲染位;本期聚焦决策点)。
- ❌ 改召回算法 / `evaluationEngine`(红线:不重写已完成部分)。
- ❌ AI 自动调用(只 opt-in,杜绝"持续计费")。
- ❌ 把 AI 生成文本写入经验库(红线:模型输出不入库)。

**红线(继承 CLAUDE.md):**
- **本地优先**:建议先由纯本地确定性算出;模型不可用 / 未配 Key / 异常 → 自动用本地那句,功能不中断。
- **模型 opt-in + 过契约**:AI 润色仅在用户点按钮时调用;输出过 `validateModelField`(空 / 超长 / 占位黑名单 → 退回本地),不得编造、不入库。
- **不动引擎与召回**:仅消费 `trustSignal` 与现有 `recalledRules / recalledLaws`。

## 3. 数据模型与合成逻辑

新增纯服务 `src/services/decisionAdvice.ts`。

```ts
export type AdviceVerdict = 'lean' | 'caution' | 'insufficient'

export interface DecisionAdvice {
  verdict: AdviceVerdict
  label: string            // ✅ 倾向采用 / ⚠️ 谨慎 / 🔍 证据不足
  reason: string           // 本地一句理由
  stats: {
    ruleCount: number       // 命中规则数
    trustedCount: number    // 其中可信
    cautionCount: number    // 其中谨慎
    unprovenCount: number   // 其中待验证
    cautionLawCount: number // 命中的避坑类规律数
    passed: number          // 历史复测有效合计
    failed: number          // 历史复测无效合计
    successRate: number | null // passed/(passed+failed),无决断样本时 null
  }
}

export function synthesizeAdvice(
  recalledRules: { rule: ExperienceRule }[],
  recalledLaws: Law[],
): DecisionAdvice | null
```

**聚合(纯本地,确定性):**
- 对每条召回规则取 `trustSignal(rule).level` 计入 trusted/caution/unproven;
- `passed`/`failed` = 累加各规则 `evaluations` 里 `outcome==='passed' / 'failed'` 的次数(`uncertain` 不计入决断);
- `successRate` = `passed/(passed+failed)`,分母 0 → `null`;
- `cautionLawCount` = 召回规律中 `kind==='caution'` 的条数。

**判定(按序,首个命中即结论):**
1. **insufficient**:`trustedCount===0 && (passed+failed) < 2` → "🔍 证据不足 · 线索有限,先当参考"。
2. **caution**:`cautionCount>0 || cautionLawCount>0 || (successRate!==null && successRate < 0.5)` → "⚠️ 谨慎 · 这类你踩过坑,先看可信度"。
3. **lean**:`trustedCount>0 && cautionCount===0 && (successRate===null || successRate >= 0.6)` → "✅ 倾向采用 · 这类经验复测站得住"。
4. **兜底**:其余 → **caution**(保守)。

**空召回**(`recalledRules.length===0 && recalledLaws.length===0`)→ 返回 `null`(不渲染卡,交现有空状态)。

**战绩行文案**(UI 拼,不进规则库):`命中 {ruleCount} 条经验({trustedCount} 可信 · {unprovenCount} 待验证)· 历史 {passed} 有效 / {failed} 无效{successRate!=null ? `(有效率 ${Math.round(successRate*100)}%)` : ''}`。

## 4. AI 可选润色

新增 `src/services/adviceWithModel.ts`(镜像 `recallWithModel.ts` 的 opt-in + 防越界范式):

```ts
export const ADVICE_SYSTEM_PROMPT: string // 约束:只基于给定结论与战绩改写措辞,不得新增事实/建议采用与否之外的内容
export function buildAdviceUserText(scene: string, advice: DecisionAdvice): string
export async function polishAdvice(
  scene: string,
  advice: DecisionAdvice,
  client: ObservationModelClient,
): Promise<string>   // 返回校验后的润色句;空场景/无 advice 短路;失败/占位 → 返回 advice.reason(本地兜底)
```

- 输出过 `validateModelField`(复用 `patternDiscovery.ts` 已导出):空 / 占位字面量 / 超长(>120 字)→ 退回 `advice.reason`。
- **不改变 verdict / stats**,只换 `reason` 的呈现;润色文本不持久化、不写规则库。

## 5. UI 改动(`src/pages/index/components/InputModule.vue`)

- 在 `recall-results` 区、列表**上方**渲染建议卡(`v-if="advice"`):
  - `advice.label`(按 verdict 配色:lean→ok / caution→warn / insufficient→info,复用 token);
  - 战绩行(§3 文案);
  - `reason`(本地;若已润色则显示润色句);
  - `v-if="hasModel"` 的按钮「🧠 让 AI 说句人话」→ 调 `polishAdvice`,把返回值填入显示;调用中禁用 + 文案"思考中…";失败静默退回本地句。
- `advice` 为 computed:`synthesizeAdvice(recalledRules, recalledLaws)`,随召回结果变化;另用一个 `ref` 存"润色后的句子"(点按钮才填,重新召回时清空)。
- 复用现有 `hasModel` 判定与模型 client 获取(与「模型精准找」同源)。

## 6. 错误处理与边界

- 召回为空 → `advice===null` → 不渲染卡。
- 无任何决断样本 → 落 insufficient 档,不硬下结论。
- 未配模型 / 模型异常 / 占位输出 → 润色按钮调用安全退回本地 `reason`;无模型时不显示按钮。
- 纯本地合成同步无网络;仅润色按钮触发一次网络调用(opt-in)。

## 7. 测试策略(纯 TS + `node:assert`,追加进 `package.json` 的 `test:evaluation`)

`tests/decisionAdvice.test.ts`:
- **lean**:全可信规则 + 高有效率 + 无避坑 → `verdict==='lean'`。
- **caution**:含避坑规律 / 命中 caution 规则 / 有效率<50% → `verdict==='caution'`(三种触发各一例)。
- **insufficient**:无可信 + 决断样本<2 → `verdict==='insufficient'`。
- **stats**:passed/failed 累加与 successRate 计算正确;uncertain 不计入决断;空召回 → `null`。

`tests/adviceWithModel.test.ts`:
- 正常:fake client 返回合法句 → 采用润色句。
- 防越界:空 / 占位 / 超长 → 退回 `advice.reason`;空场景不调用 client。

**真机(Playwright):** 找经验后顶部出现建议卡(档位/战绩正确);点「🧠 让 AI 说句人话」→ 句子变化;无模型时按钮不显示;空召回不出卡。

## 8. 风险与取舍

- **建议下错档**:阈值(0.5 / 0.6 / 2 次)是经验值,保守兜底取 caution;用户仍能看到下方逐条经验自行判断。阈值集中在 `decisionAdvice.ts` 顶部常量,便于调。
- **AI 润色幻觉**:prompt 限制"只改写不新增" + `validateModelField` + 本地兜底;不入库。
- **成本**:仅 opt-in 点按钮才调,默认零成本。

## 9. 验收标准

1. 找经验 / 模型精准找有结果时,结果上方出现一张决策建议卡:档位(倾向采用 / 谨慎 / 证据不足)+ 战绩数字 + 一句理由。
2. 三档判定符合 §3 规则;空召回不出卡;无决断样本落"证据不足"。
3. 配了模型时显示「🧠 让 AI 说句人话」,点击后理由句被润色;未配 / 异常时按钮不显示或安全退回本地句。
4. 模型输出过契约校验,不入规则库;`evaluationEngine` 与召回逻辑未改。
5. `typecheck` + 全部 `test:evaluation`(含 `decisionAdvice` / `adviceWithModel`)绿;0 控制台报错;Playwright 实机走查通过。

## 10. 不做清单(YAGNI)

提交后主动浮现建议、AI 自动润色、改召回/引擎、把 AI 文本入库、多档(>3)细分加权、跨设备同步 —— 全部不在本期。
