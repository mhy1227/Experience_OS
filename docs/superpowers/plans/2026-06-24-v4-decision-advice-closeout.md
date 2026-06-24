# V4 决策辅助 · 决策建议合成 —— 结案报告

> 状态:✅ 已结案(实现 + 测试 + 实机验证 + 上线)
> 日期:2026-06-24
> 设计:`docs/superpowers/specs/2026-06-24-v4-decision-advice-design.md`
> 计划:`docs/superpowers/plans/2026-06-24-v4-decision-advice.md`
> 远端:已推送至 `main`(`2b3ff25..4d30725`),Vercel 自动构建

## 1. 交付内容

把 V4 roadmap 最弱的「决策建议」补齐:在「找经验」决策点,把召回经验的**可信度 + 历史战绩**合成一句明确结论。

| 模块 | 文件 | 职责 |
|------|------|------|
| 本地合成 | `src/services/decisionAdvice.ts` | `synthesizeAdvice(recalledRules, recalledLaws)` → `DecisionAdvice \| null`:三档结论(`lean`/`caution`/`insufficient`)+ 战绩 stats。纯函数、确定性、零网络。 |
| AI 润色 | `src/services/adviceWithModel.ts` | `polishAdvice(scene, advice, client)`:opt-in 把本地结论换种说法;过 `validateModelField`;空/占位/超长/异常 → 退回 `advice.reason`。 |
| UI | `src/pages/index/components/InputModule.vue` | 找经验结果**顶部**建议卡(按档配色)+「🧠 让 AI 说句人话」按钮(`v-if="hasModel"`)。 |
| 样式 | `src/pages/index/styles.scss` | `.decision-advice*`,全 token,无硬编码 hex。 |
| 测试 | `tests/decisionAdvice.test.ts`、`tests/adviceWithModel.test.ts` | 已注册进 `test:evaluation`。 |

## 2. 三档判定(阈值集中在 `decisionAdvice.ts` 常量)

1. **🔍 证据不足**:无可信规则 且 决断样本(有效+无效)< 2。
2. **⚠️ 谨慎**:命中谨慎规则 / 命中避坑类规律 / 有效率 < 50% / 证据分歧(兜底)。
3. **✅ 倾向采用**:有可信规则 且 无谨慎 且(无样本或有效率 ≥ 60%)。

战绩行:`命中 N 条经验(X 可信 · Y 待验证)· 历史 P 有效 / Q 无效(有效率 Z%)` —— 对应 roadmap 价值例子「买过 6 次,完成率 25%」的可计算版本。

## 3. 验收(对照设计 §9)

| # | 验收标准 | 结果 | 证据 |
|---|----------|------|------|
| 1 | 有结果时顶部出建议卡(档位 + 战绩 + 理由) | ✅ | 实机:「评审会」场景 → ⚠️谨慎「命中 3 条(2 可信·1 待验证)· 历史 4 有效/0 无效(100%)」 |
| 2 | 三档判定符合规则;空召回不出卡;无样本落证据不足 | ✅ | `decisionAdvice.test.ts` 全分支 + 空→null + 无样本→insufficient |
| 3 | 配模型显示润色按钮,点击后理由被润色;未配/异常安全退本地 | ✅ | `adviceWithModel.test.ts`(fake client 正常/占位/坏形状/空场景);实机点击遇中继故障 → `try/catch` 退本地、按钮复位 |
| 4 | 模型输出过契约、不入库;引擎/召回未改 | ✅ | `validateModelField` 兜底;`decisionAdvice/adviceWithModel` 不 import store/engine;`git diff` 未触 `evaluationEngine`/召回 |
| 5 | typecheck + 全部 test:evaluation 绿;0 控制台报错;Playwright 通过 | ✅(见下注) | typecheck 干净;25 套全绿;实机走查通过 |

> **§5 控制台注**:实机点 AI 润色时出现 1 条 `net::ERR_CONNECTION_CLOSED @ packyapi.com`——是 opt-in 模型中继(packyapi)网络故障(已知问题,见记忆 `packyapi-region-quality`),非本功能代码缺陷;`polishAdvice` 异常被 UI `try/catch` 兜住,降级到本地结论。属设计内的优雅降级。

## 4. 红线遵守

- **本地优先**:建议先本地确定性算出;模型仅 opt-in,失败不阻断。
- **模型不入库**:润色文本只用于显示,不持久化、不写规则库。
- **不重写已完成部分**:`evaluationEngine`、召回逻辑、`trustSignal` 均未改,只消费。
- **零自动成本**:模型只在用户点按钮时调用一次。

## 5. 提交链

`8089585` spec → `2aee023` plan → `ad74d86` Task1(synthesizeAdvice)→ `5168600` Task2(polishAdvice)→ `9031f7d` Task3(建议卡 UI)→ `4d30725` 文档收口。已上线 `main`。

## 6. 已知限制 / 后续(不在本期)

- **提交后主动浮现**:本期只在「找经验」顶部;录入提交后也冒一条只需多一个渲染位(复用 `synthesizeAdvice`),留作 V4.1 易扩点。
- **UI 无自动回归测试**:建议卡的渲染/按钮交互用 Playwright 手验;纯逻辑(`synthesizeAdvice`/`polishAdvice`)有单测。项目无组件测试框架(无 vitest),补 UI 回归需先引栈。
- **阈值为经验值**:0.5 / 0.6 / 2 次保守兜底取 caution;集中成常量便于后续按真实数据调。
- **模型中继可靠性**:packyapi 中继偶发连接失败 → 已优雅降级;若要稳定的润色体验,需换更可靠的模型出口(与 V4 代码无关)。

## 7. 结论

V4「决策建议合成」已实现、测试、实机验证、上线。至此 **V1→V4 基础闭环全部落地**:记录 → 提炼(V1)→ 规律(V2 语义版)→ 验证(V3 就地复测)→ 决策建议(V4)。
