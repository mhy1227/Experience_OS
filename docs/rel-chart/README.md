# 流程图 / rel-chart

Experience OS 核心流程的 PlantUML 图集,**均基于真实源码绘制**,统一黑白工业风(纯白底、无阴影、`Microsoft YaHei`)。

> 定位回顾:Experience OS 把用户一句口语观察提炼成可复用「经验规则」,并做跨记录规律发现与决策辅助。下列图覆盖从「录入」到「沉淀规则」再到「复测采用」的主干。

## 图集索引

按「总览 / 流程 / 结构」分三组,共 9 张。

### 总览
| 图 | 文件 | 类型 | 对应代码 |
|----|------|------|---------|
| 架构分层(单向依赖) | [`architecture.puml`](./architecture.puml) | 包图 | `CLAUDE.md` + `src/services/*` |
| 用户能力用例 | [`usecase.puml`](./usecase.puml) | 用例图 | 整体产品能力 |
| 核心数据模型 | [`data-model.puml`](./data-model.puml) | ER 图 | `types/experience.ts` |

### 流程
| 图 | 文件 | 类型 | 对应代码 |
|----|------|------|---------|
| 观察提炼主流程 | [`observation-pipeline.puml`](./observation-pipeline.puml) | 活动图 | `stores/experience.ts` `submitObservation` / `services/analysisContract.ts` |
| AI 模型接入时序 | [`model-integration.puml`](./model-integration.puml) | 时序图 | `resilientAnalysis.ts` / `modelConfig.ts` / `modelClient.ts` / `analysisContract.ts` |
| 批量导入观察 | [`import-observations.puml`](./import-observations.puml) | 活动图 | `stores/experience.ts` `importObservations` |
| 规律发现 | [`pattern-discovery.puml`](./pattern-discovery.puml) | 活动图 | `stores/experience.ts` `computeInsights` / `services/patternDiscovery.ts` `discoverPatterns` |

### 结构 / 状态
| 图 | 文件 | 类型 | 对应代码 |
|----|------|------|---------|
| 复测与采用门槛 | [`rule-evaluation.puml`](./rule-evaluation.puml) | 活动图 | `services/evaluationEngine.ts` 评估链 |
| 规则生命周期 | [`rule-lifecycle.puml`](./rule-lifecycle.puml) | 状态图 | `evaluationEngine.ts` `adoptionDecisionFor` / 枚举 |

## 各图要点

### 0. architecture — 架构分层(单向依赖)
`types/ → services/ → stores/ → pages/` 四层包图,上层依赖下层。services 层列出 13 个真实文件并按职责分组(AI 接入 / 规律发现 / 评估降级 / 导入导出),`resilientAnalysis`、`analysisContract`、`patternDiscovery` 等关键件附职责 note;stores 写入 `localStorage` 作为持久化端点。

### 0b. data-model — 核心数据模型(ER)
6 个实体:`Observation`、`ExperienceRule`、`RuleEvaluation`、`AnalysisResult`、`ModelAnalysisResult`(继承 AnalysisResult)、`Insight`。关系:`Observation }o--|| ExperienceRule`(ruleId 多对一)、`ExperienceRule ||--o{ Observation`(evidenceIds 一对多)、`ExperienceRule ||--o{ RuleEvaluation`、Observation→AnalysisResult→Rule 的提炼写入链、Observation×Insight 聚类多对多。枚举字段(status/sentiment/reusability/kind/feedback/reviewStatus/verdict/confidence/adoptionDecision…)均以 note 列出取值。

### 0c. model-integration — AI 模型接入时序
`submitObservation → getActiveModelClient → analyzeObservationResilient → completeJson / normalizeModelAnalysis + enforceAnalysisContract / 异常回退 analyzeObservation → _writeObservation`。用 `alt 模型可用 / else 异常回退` 表达降级链,`group 契约校验` 包住契约层,强调**模型输出必须经契约校验后才落库**。

### 1. observation-pipeline — 观察提炼主流程
口语观察 → 结构化规则的核心链路,四层 partition 对应真实分层:

- **录入侧** `submitObservation`:空/正在分析守卫 → 创建 pending 观察 → persist。
- **分析引擎** `analyzeObservationResilient`:模型优先,异常回退本地关键词引擎(`aiAnalyzer` 8 条规则)。
- **安全契约层** `enforceAnalysisContract`:5 分支降级路由 —— 负向伪装正向拦截 / 信息不足 / 有效条件 < 2 / 正向+rule→策略 / 负向+counterexample→避坑 / 其它兜底待观察。
- **写入侧** `upsertRuleFromAnalysis`:`findSimilarRule`(同 kind + 同标题同类 / 同类同地点)合并或新建,回填 ruleId/sentiment,召回决策提示。

### 2. usecase — 用户能力用例
用户可做:录入观察、批量导入、规律发现、查看决策辅助、规则反馈/复测、配置模型 Key。模型服务为外部 actor;`安全契约校验` 为 `<<include>>`(必经),`本地引擎兜底` 为 `<<extend>>`(异常触发)。

### 3. import-observations — 批量导入
- **并发锁**:用 `isSeedingDemo` 作批量锁,与 `submitObservation`(isAnalyzing)、`loadDemoData` 互斥。
- 文本分行解析,**有效行数为 0 提前返回**。
- 逐条调用 `analyzeObservationResilient`,成功 `_writeObservation` 并 succeeded+1,异常降级为 failed 并 failed+1,**单条失败不中断整批**,每条独立 persist。
- 返回 `ImportSummary(total / succeeded / failed)`。

### 4. pattern-discovery — 规律发现
- 并发守卫 `isComputingInsights`;筛选 `success` 状态观察,空数据提前返回 `[]`。
- **双层循环**(维度 category/tag × 簇),含 `dedupKey 去重` 与 `簇成员 < 2 跳过` 两道过滤。
- **统计基座必做**:按样本量+占比算 confidence(low/medium/high)。
- **模型增强可选**:仅当「有 client 且 confidence ≠ low」才走 `enrichClusterWithModel`,模型出错/命中占位则**静默回退**统计描述。
- 按 percentage 降序写入 `insights`。

### 5. rule-evaluation — 复测与采用门槛
- **结论四态**:`insufficient`(样本<2)/ `conflicted`(failed≥2 且≥passed)/ `supported`(passed≥2 且>failed)/ `mixed`。
- **采用决策有序闸门链**:冲突/维护回归/矩阵冲突 → `suspend`;版本未覆盖 → `retest`;协议/证据缺口 → `repair`;独立性/样本/矩阵不足 → `retest`;观察期/趋势走弱 → `limit`;仅 `supported && score≥75 && 高置信` → `adopt`,否则退化 `limit`。
- **门槛**:仅「目标决策=adopt 且无 blocker」为 `ready`,有 blocker 为 `blocked`,仅 warning 为 `attention`。

> 注:评估体系按项目约定「降级隐藏而非删除」,本图用于理解既有逻辑,非鼓励继续扩张。

### 6. rule-lifecycle — 规则生命周期(状态图)
一条规则的状态机:`新建(unreviewed/未复测)→ 复测中 → 按代码闸门顺序分流`。闸门优先级忠于 `adoptionDecisionFor`:`suspend > retest > repair > limit > adopt`。`retest/repair/suspend` 可回流复测,`suspend` 可弃用终止,`adopt` 可沉淀终止。与 `rule-evaluation` 互补——后者是单次评估的判定逻辑,本图是规则跨多次复测的状态演进。

## 如何渲染

**方式一 — VS Code 插件(推荐预览)**
安装 `PlantUML` 扩展(jebbs.plantuml),打开任一 `.puml`,`Alt+D` 预览。需本地有 Java + Graphviz,或在插件设置里指向 PlantUML 在线服务器。

**方式二 — 命令行导出 PNG/SVG**
```bash
# 需 Java;首次会用到 plantuml.jar
npx plantuml docs/rel-chart/*.puml -tsvg      # 导出 SVG
npx plantuml docs/rel-chart/*.puml -tpng      # 导出 PNG
```
或下载 `plantuml.jar` 后:`java -jar plantuml.jar -tsvg docs/rel-chart/*.puml`

**方式三 — 在线**
将 `.puml` 内容粘贴到 https://www.plantuml.com/plantuml 即时渲染。

## 维护约定

- 这些图随核心流程演进,**改了 `submitObservation` / 契约层 / `evaluationEngine` 等主干逻辑后,请同步更新对应 `.puml`**。
- 保持黑白工业风:不加颜色/渐变/阴影,header 配置勿改。
