# 决策支持 · 产品「右半边」设计与落地记录

日期:2026-06-24
状态:已实现并上线(生产 `experience-os-rose.vercel.app`),22 套测试绿,核心路径 Playwright 实机验证。

## 1. 动机:产品缺的是「右半边」

Experience OS 的价值闭环是:**记录 → 提炼(规则)→ 规律 → 决策辅助**。

改造前,产品把**左半边(记 → 提炼)**做得很完整(录入、AI 契约提炼、规则库、V2 规律发现),但**右半边(用 → 验证 → 进化)缺失或藏在「高级」里**:

- 召回(输入场景 → 浮现相关经验)埋在「高级」面板,需手动触发。
- 规则/规律的**可信度**(复测过没、稳不稳)对普通用户不可读(头部 9 个黑话 badge)。
- 用了经验后的**结果**没有低成本回填入口 → 规则停在"提炼那一刻的猜测",不进化。

后果:经验库变成「只写不读的坟墓」,体验上与「带标签的笔记」无异——而右半边正是二者的分野。

## 2. 已实现的能力(6 块)

| # | 能力 | 入口 | 实现要点 |
|---|------|------|----------|
| ① | 决策召回(关键词) | 记录页「找经验」 | 复用已测 `store.recallEvaluationCandidates`;只保留内容命中(reason 含「匹配」),滤掉"评估次数不足"等复测向加分 |
| ② | 可信度信号 | 每张 RuleCard 首位 | `trustSignal()` 收敛判定/置信/稳定分/趋势/评估次数 → ✅可信 / ⚠️谨慎 / 🔍待验证 + 一句理由 |
| ③ | 规律主动浮现 | 记录提交后 | `store.decisionLaws = recallRelatedLaws(content)`,复用规则召回同一套 tokenize;渲染在 DecisionHintCard 下 |
| ④ | 结果回填 | 「找经验」每条结果 | 这次有效/无效/不确定 → `addEvaluation(id, outcome, …, scene, 'recall')`,场景即证据;规则当场进化(实测 稳定分 45→67) |
| ⑤ | 模型语义召回 | 「🧠 模型精准找」(模型已配置时显示) | `recallWithModel.ts`:模型**只从候选 id 里挑**并给理由;默认走关键词,opt-in 才调,失败/无 client 自动降级 |
| #7 | 风险前置 | 「找经验」结果顶部 | 召回含 `trustSignal` 为 caution 的规则时,顶部横幅提醒"先看可信度" |

## 3. 数据流

```
记录页输入 ──┬─[生成规则]→ submitObservation → 提炼写库 → (同时) decisionHints + decisionLaws 主动浮现
            │
            ├─[找经验]──→ recallEvaluationCandidates(关键词) ─┐
            │                                                ├→ 相关经验列表(规则+规律,带 trustSignal + 风险横幅)
            └─[🧠 模型精准找]→ recallRulesWithModel(语义) ───┘        │
                                                                      └─[这次有效/无效]→ addEvaluation(source=recall) → 规则进化 → 刷新召回
```

## 4. 安全红线(务必维持)

- **模型绝不写入规则库**:语义召回里模型只能输出候选集中的 id;`parseRecallMatches` 丢弃任何不在候选集的 id(防幻觉)。规则的产生仍只走 `analysisContract` 契约层。
- **模型成本仅按需**:`找经验` 默认关键词(零成本);模型调用只在用户点「🧠」时发生;空场景/无规则短路、不调用。
- **本地优先**:全部基于 localStorage,无新增上云路径。

## 5. 测试覆盖(新增)

- `tests/recallRelatedLaws.test.ts` — 规律召回:相关命中、排除 resolved、空场景、按复发排序、取前 3。
- `tests/recallWithModel.test.ts` — 纯解析(防幻觉 id、去重、坏形状)+ 端到端(fake client,幻觉丢弃、保序、空输入不调用)。
- `tests/trustSignal.test.ts` — 全分支与优先级。

## 6. 仍未做 —— 需产品决策(不在本轮自主范围)

- **冷启动 / 数据稀疏**:单用户记录少,规律到不了"复发 N 次"阈值。是否降阈值 / 让模型对单条也给建议?
- **模型用更深**:把模型用于规律聚类、个性化决策建议(更大改动 + 持续成本)。
- **评估体系(高级)真正拆分**:当前 828 行 EvaluationWorkbench 仅做了 `<details>` 折叠(治标),未按面板拆子组件。
- **样式就近化**:`styles.scss` 仍 ~2062 行全局,新组件用 scoped、旧的未回填。

参见 [[product-right-half-loop]](记忆)与 `docs/superpowers/specs/2026-06-23-v2-pattern-discovery-design.md`(V2 规律发现)。
