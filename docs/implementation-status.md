# 实现现状(Implementation Status)

> 截至 2026-06-22。**已实现并验证**的功能清单(规划见 `version-roadmap.md`,设计见 `architecture/`)。
> 验证口径:**单测** = `npm run test:evaluation`(12 套);**真机** = Playwright + 真模型(DeepSeek/packyapi)走查。

## 总览

V1 能力**全部实现并真机验收通过**,并已含 V2(规律发现)、V4(决策辅助)基础版。栈:Vue3 + Pinia + Vite + TS,数据存 localStorage,前端直连模型 + 本地兜底。

## 功能矩阵

| 能力 | 实现位置 | 状态 | 验证 |
|------|----------|:--:|------|
| 一句话录入 → 提炼 | `stores/experience.ts:submitObservation` → `services/resilientAnalysis.ts` | ✅ | 单测 + 真机 |
| 真模型(DeepSeek/OpenAI 兼容) | `services/modelClient.ts` + `services/modelConfig.ts` | ✅ | 单测 + 真机(200) |
| 失败回退本地引擎 | `services/resilientAnalysis.ts` + `services/aiAnalyzer.ts` | ✅ | 单测 |
| AI 安全契约(防注入/方向一致/降级) | `services/analysisContract.ts` | ✅ | 单测 |
| **经验三态分类(策略/避坑/待观察)** | `analysisContract.enforceAnalysisContract`(kind 轴) | ✅ | 单测 + 真机(负向→避坑) |
| 自动标签/分类/情绪 | 模型输出 + `observation.sentiment` 取模型 `direction` | ✅ | 真机(sentiment=negative) |
| 批量导入(冷启动) | `stores:importObservations` + 首页批量导入区 | ✅ | 单测 + 真机(7/7) |
| **规律发现(M3)** | `services/patternDiscovery.ts`(统计聚类 + 模型归因 + 最小样本门槛 + 单簇过滤) | ✅ | 单测 + 真机(归因卡) |
| 扫描 90 天 / 归因卡 | `stores:computeInsights` + `pages/index/components/InsightCard.vue` | ✅ | 真机 |
| **决策辅助(M4)** | `services/decisionHints.ts` + `components/DecisionHintCard.vue` | ✅ | 单测 + 真机(召回提醒) |
| **周期复盘(周/月)** | `services/periodicReview.ts` + 首页复盘块 | ✅ | 单测 + 真机(高频问题/成功) |
| API Key 配置 UI | `components/ModelConfigPanel.vue`(写 `experience-os:model`) | ✅ | 真机 |
| 演示默认模型注入 | `src/main.ts` ← `VITE_DEEPSEEK_*`(`.env.local`) | ✅ | 真机 |
| 信任产品化(本地优先可见) | 首页信任条 + 导出经验资产(.md)+ 一键清空 | ✅ | 真机 |
| 导出经验资产(markdown) | `services/markdownExport.ts`(纯函数)+ page 层下载 | ✅ | 单测 + 真机 |
| 演示工作种子数据 | `services/demoWorkData.ts`(埋共同根因) | ✅ | 单测 |
| 评估体系(复测/采用/可信度) | `services/evaluationEngine.ts` | 🟡 **降级隐藏**(折叠"高级"面板,代码保留) | 单测 |

## AI 分类状态机(契约层)

按**类型 + 结构**(非方向)分流;`kind` 与 `reusability`(质量)正交:

| kind | 触发 | 结果 |
|------|------|------|
| `strategy` | 正向 + rule + ≥2 条件 | 正向可复用规则 |
| `caution` | 负向/混合 + counterexample/constraint + ≥2 条件 | 避坑规则,保留模型标题、reusability medium/high |
| `watch` | 方向不明 / 无条件 / 低置信 | 待观察 |

拦截保留:负向伪装正向 → 拒绝。Prompt 已强制模型输出 `confidence` 与合法 `reusability`(真机验证负向能稳定落成避坑规则)。

## 数据与存储

- **localStorage 为唯一真相源**:key `experience-os-state-v1`(经验数据)、`experience-os:model`(模型配置,**仅本地**)。
- 云 MySQL(SQLPub,`db/schema.sql` 的 7 张 `exp_` 表)仅开发/工具用途,**未与 app 同步**。

## 测试清单(12 套,`test:evaluation`)

aiAnalyzer · modelAnalysisAdapter · evaluationEngine · experienceStore · modelClient · resilientAnalysis · importObservations · patternDiscovery · decisionHints · markdownExport · demoWorkData · periodicReview

## 实现轨迹

- Plan 1–5 + 修复:见 `docs/superpowers/plans/2026-06-22-execution-log.md`(逐提交记录)。
- 关键决策:见 `architecture/decision-log.md`(ADR-001~007)。
- 关键里程碑提交:Plan1 地基 → kind 拆轴(`d6e477c`)→ 提示词修复(`5f22bdf`)→ 周期复盘(`1f5e144`)→ 洞察过滤 + sentiment 取 direction(`c92aa69`)。

## 已知遗留(非阻断,详见 `architecture/refactor-plan.md`)

- `index.vue`(~3600 行)、`store`(~2900 行)待拆分(R1/R2)。
- 评估体系仅隐藏未重组为 V3 可信度后端(R3)。
- `inferDirection` 本地兜底仍弱(sentiment 已优先取模型 direction,纯本地路径除外)。
- 洞察排序/Top-N 展示可优化;`deepseek-v4-flash` 为推理模型,单条提炼 ~10-20s(演示留够等待或换非推理模型)。
