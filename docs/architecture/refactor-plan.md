# 重构规划

> 已知技术债与计划重构,按优先级。每条:现状/问题 → 目标 → 影响范围 → 风险。
> 原则:**不为重构而重构**;只在服务当前目标 + 降低维护成本时做;大改前先有测试护栏。

## 已完成(本会话,留痕)
- ✅ 删除死类型 `frequency_pattern`;`exportAsMarkdown` 移除 store 内 DOM(下载下沉到 page);`submitObservation` 清空残留 decisionHints;批量导入改顶部按序插入;修复 2 处弱断言测试;删除 uni-app 死文件。

## P1 — 高优(维护性已受损)

### R1. 拆分 `index.vue`(3595 行)
- **问题**:单文件承载所有面板 + 35+ label 函数 + 大量 v-if;难维护、AI 难以可靠编辑。
- **目标**:按面板/卡片拆独立组件(`components/`)。已拆出 `InsightCard.vue`、`DecisionHintCard.vue`、`ModelConfigPanel.vue`;继续拆 `RuleCard`、各 Tab 面板、复盘面板;label/格式化函数抽到 `utils/labels.ts`。
- **影响**:`src/pages/index/index.vue` + 新增 `src/pages/index/components/*`。
- **风险**:中。无组件级测试,靠 typecheck + build + 手动走查;分批小步拆。

### R2. 拆分 `stores/experience.ts`(2847 行)
- **问题**:数据/持久化/统计/队列/导入导出/动作混在一个 store;computed 相互牵连。
- **目标**:按职责拆模块——`stores/rules`、`stores/insights`、`stores/evaluations`、`services/persistence`(localStorage 读写归一化)。
- **影响**:store + 所有引用方;`experienceStore.test.ts` 需同步。
- **风险**:中高。先补/保留 store 行为测试再拆。

## P2 — 中优(价值/正确性)

### R3. 评估体系"高级面板"化重做
- **现状**:`evaluationEngine`(1714 行)仅从主路径隐藏,未重组。
- **目标**:作为 V3"经验验证"后端——把可信度/成功率/趋势接到 `Insight` 与规则可信度;UI 收敛为一个高级面板。
- **风险**:中。逻辑复杂,改动需评估测试覆盖。

### R4. 提升 sentiment 质量
- **问题**:`sentiment` 来自 `inferDirection` 的短关键词表,多数文本判为 neutral,对聚类价值低。
- **目标**:用模型分析的 direction 作为 sentiment 来源(需把 direction 纳入 `AnalysisResult`),或扩充词表;让情绪维度聚类可用。
- **影响**:`analysisContract`/`aiAnalyzer`/`types`/`store` `_writeObservation`。

### R5. 聚类维度规范化
- **问题**:`patternDiscovery` 默认按 category/tag 聚类,tag 为自由文本,根因聚合不稳;"目标不一致"根因运行时靠模型归因而非稳定 tag。
- **目标**:引入受控主题/根因标签,或让提炼阶段输出标准化根因字段,使统计层也能稳定聚出根因簇。
- **影响**:`patternDiscovery` + 提炼输出契约。

## P3 — 低优(健壮性/可维护)

### R6. 持久化健壮化
- **问题**:`persist()` 同步全量写 localStorage,无防抖、无版本号;结构升级无迁移。
- **目标**:debounce + `schemaVersion` + 迁移钩子;数据量大时迁 IndexedDB(Dexie);为云同步做准备。

### R7. 配置/魔数集中
- **问题**:评估阈值(score≥75、≥2 次复测等)、`MIN_CLUSTER_SIZE`、决策阈值散落多处。
- **目标**:集中到 `config/` 常量,便于调参与一致性。

### R8. 文案/标签集中(i18n 预备)
- **问题**:35+ label map 散落 `index.vue`/engine;改一处文案要改多文件。
- **目标**:集中 label/枚举显示到单一映射(为 i18n 预留)。

## 执行约束
- 每个重构独立 PR/提交,绿色门(typecheck + `test:evaluation` + build)通过才合入。
- 优先 P1(已影响 AI 与人工编辑可靠性);P2 跟随对应版本能力;P3 机会性进行。
