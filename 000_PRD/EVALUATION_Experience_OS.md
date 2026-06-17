# Experience OS 可重复评估需求

## 1. 目标

把 Experience OS 从“结构化记录”推进到“规则可验证”。

一条经验规则不能只因为生成出来就被认为可靠，它必须能在后续相似场景中被反复复测，并通过评估历史更新稳定度。

## 2. 核心对象

### RuleEvaluation

```ts
interface RuleEvaluation {
  id: string
  outcome: 'passed' | 'failed' | 'uncertain'
  note: string
  createdAt: string
  observationId?: string
  observationText?: string
  source?: 'manual' | 'recall' | 'plan'
  cycle?: 'fill' | 'maintenance'
  replicationSlotFocus?: 'confirmation' | 'boundary' | 'contrast' | 'expansion'
  planSnapshot?: EvaluationPlanSnapshot
  protocolSnapshot?: EvaluationProtocolSnapshot
  protocolExecution?: EvaluationProtocolExecution
}
```

每条 `ExperienceRule` 持有自己的 `evaluations` 列表。
评估记录保留来源、复测周期、槽位焦点、当时的复测计划快照和复测协议快照，用于判断评估是否来自手动操作、场景召回、计划执行、矩阵补齐或 ready 后维护抽样，并复盘当时使用的判定口径。

### EvaluationVerdict

```ts
type EvaluationVerdict = 'insufficient' | 'supported' | 'mixed' | 'conflicted'
```

规则根据多次复测结果形成评估结论，并生成下一步修正建议。

### EvaluationAnalysis

```ts
type EvaluationConfidence = 'low' | 'medium' | 'high'
type EvaluationTrend = 'unknown' | 'improving' | 'declining' | 'flat'
type EvaluationAdoptionDecision = 'adopt' | 'limit' | 'retest' | 'repair' | 'suspend'
type EvaluationGateStatus = 'ready' | 'attention' | 'blocked'
type EvaluationGateCheckStatus = 'passed' | 'warning' | 'blocked'
type EvaluationRepeatabilityLevel = 'weak' | 'developing' | 'repeatable'
type EvaluationBoundarySeverity = 'critical' | 'watch' | 'unknown'
```

规则根据评估历史计算稳定分、置信等级、趋势、采用决策和下一步评估动作。

### AdoptionDecisionEvent

```ts
interface AdoptionDecisionEvent {
  id: string
  evaluationId?: string
  createdAt: string
  decision: EvaluationAdoptionDecision
  reason: string
  evaluationCount: number
}
```

系统从规则的评估历史中推导采用决策变化事件，用于复盘规则何时从继续复测、限制使用、可采用或暂停采用之间发生切换。

### EvaluationAdoptionGate

```ts
interface EvaluationGateCheck {
  id: string
  label: string
  status: EvaluationGateCheckStatus
  detail: string
}

interface EvaluationAdoptionGate {
  status: EvaluationGateStatus
  ready: boolean
  targetDecision: EvaluationAdoptionDecision
  checks: EvaluationGateCheck[]
  blockers: string[]
  warnings: string[]
}
```

系统根据样本数、明确结果数、证据完整度、冲突状态、置信等级、稳定分、趋势、计划执行和焦点覆盖推导采用门槛，明确哪些问题会阻断默认采用，哪些问题只是后续增强提醒。

### EvaluationRepeatabilityProfile

```ts
interface EvaluationRepeatabilityProfile {
  score: number
  level: EvaluationRepeatabilityLevel
  decisiveRate: number
  evidenceRate: number
  plannedRate: number
  focusCoverage: number
  issueSummary: string[]
  nextRepeatableStep: string
}
```

系统从复测样本量、明确结果率、证据完整率、计划执行率和焦点覆盖计算规则级可重复性画像，用于判断当前复测流程是否足以被稳定复现。

### EvaluationProtocol

```ts
interface EvaluationProtocol {
  id: string
  focus: EvaluationPlanFocus
  title: string
  scenario: string
  passCriteria: string[]
  failCriteria: string[]
  uncertainCriteria: string[]
  requiredEvidence: string[]
  cadenceDays: number
}
```

系统为每条规则生成标准化复测协议，明确本次复测场景、有效判定、无效判定、不确定判定和必填证据，减少用户每次凭主观感觉标记结果。

### EvaluationConsistencyProfile

```ts
interface EvaluationConsistencyProfile {
  status: 'insufficient' | 'stable' | 'drifting' | 'conflicting'
  score: number
  agreementRate: number
  scopedEvaluationCount: number
  conflictingFocuses: EvaluationPlanFocus[]
  focusSummaries: EvaluationFocusConsistency[]
  issueSummary: string[]
  nextConsistencyStep: string
}
```

系统按复测焦点聚合同一规则的历史评估，识别同一焦点下有效和无效并存的冲突，计算一致率和一致性分数，避免只看总样本数而忽略重复结果是否稳定。

### EvaluationReplicationMatrix

```ts
interface EvaluationReplicationMatrix {
  status: 'empty' | 'incomplete' | 'ready' | 'blocked'
  score: number
  ready: boolean
  completedSlots: number
  totalSlots: number
  missingFocuses: EvaluationPlanFocus[]
  conflictingFocuses: EvaluationPlanFocus[]
  nextFocus?: EvaluationPlanFocus
  slots: EvaluationReplicationSlot[]
  nextMatrixStep: string
}
```

系统把确认、边界、对照、扩展四类复测拆成规则级验收矩阵。确认槽位要求 2 次明确复测，其他槽位各要求 1 次；同一槽位出现有效和无效并存时矩阵进入阻断状态。`nextFocus` 给出下一次应执行的槽位，工作台可直接按推荐槽位发起有效、无效或不确定复测；矩阵 ready 后不清空推荐，而是选择最久未复测槽位做低频维护抽样。

### EvaluationProtocolSnapshot

```ts
interface EvaluationProtocolSnapshot {
  focus: EvaluationPlanFocus
  title: string
  scenario: string
  passCriteria: string[]
  failCriteria: string[]
  uncertainCriteria: string[]
  requiredEvidence: string[]
  cadenceDays: number
}
```

每次新增评估时保存当时的复测协议快照，避免后续规则状态变化后丢失本次有效、无效或不确定的判定依据。

### EvaluationProtocolExecution

```ts
interface EvaluationProtocolExecution {
  status: 'complete' | 'partial' | 'blocked'
  score: number
  checkedAt: string
  matchedCriteria: string[]
  missingEvidence: string[]
  checks: EvaluationProtocolExecutionCheck[]
  summary: string
}
```

每次新增评估时，系统把本次结果映射到协议判定标准，并检查复测场景、证据绑定、必填证据、计划一致性和不确定说明是否满足，形成可审计的协议执行检查单。

### EvaluationBoundaryCase

```ts
interface EvaluationBoundaryCase {
  id: string
  evaluationId: string
  createdAt: string
  outcome: 'failed' | 'uncertain'
  severity: EvaluationBoundarySeverity
  focus?: EvaluationPlanFocus
  scenario: string
  hypothesis: string
  suggestedConstraint: string
  evidenceStatus: 'complete' | 'incomplete'
}
```

系统从无效和不确定评估中提取反例/边界样本，形成边界假设和建议收窄条件，帮助用户把失败样本转化为下一轮规则修订依据。

### RuleRevisionDraft

```ts
interface RuleRevisionDraft {
  id: string
  createdAt: string
  priority: EvaluationPlanPriority
  reason: string
  title: string
  conclusion: string
  recommendation: string
  keptConditions: string[]
  suggestedConstraints: string[]
  excludedScenarios: string[]
  evidenceIds: string[]
}
```

系统根据冲突结论、采用门槛阻断项和反例边界生成规则修订草案，帮助用户把评估结果转化为新的适用条件、排除场景和推荐行动。

### RuleRevisionRecord

```ts
interface RuleRevisionRecord {
  id: string
  draftId: string
  appliedAt: string
  version: number
  reason: string
  previousConclusion: string
  previousRecommendation: string
  previousConditions: string[]
  previousWarnings: string[]
  newConclusion: string
  newRecommendation: string
  newConditions: string[]
  newWarnings: string[]
  evidenceIds: string[]
}
```

用户应用修订草案后，系统把旧规则和新规则差异固化为修订记录，递增规则版本，并通过 `draftId` 避免同一份草案被重复提示。

### EvaluationPlan

```ts
interface EvaluationPlan {
  priority: 'high' | 'medium' | 'low'
  focus: 'confirmation' | 'boundary' | 'contrast' | 'expansion'
  scenarioPrompt: string
  evidencePrompt: string
  reviewAfterDays: number
  reason: string
}
```

规则根据评估结论、趋势和置信等级生成下一次复测计划。

### EvaluationPlanSnapshot

```ts
interface EvaluationPlanSnapshot {
  priority: 'high' | 'medium' | 'low'
  focus: 'confirmation' | 'boundary' | 'contrast' | 'expansion'
  scenarioPrompt: string
  evidencePrompt: string
  reason: string
}
```

评估执行时保存当时的计划快照，避免后续规则状态变化后丢失本次评估依据。

### EvaluationCandidate

```ts
interface EvaluationCandidate {
  ruleId: string
  score: number
  reasons: string[]
}
```

用户输入新场景后，系统召回可复测规则，并说明匹配原因。

### EvaluationSettings

```ts
interface EvaluationSettings {
  normalReviewDays: number
  conflictReviewDays: number
  replicationMaintenanceDays: number
}
```

用户可配置普通规则、冲突/待修正规则和 ready 矩阵维护抽样的复查周期，配置随本地状态持久化。

## 3. 用户故事

| 编号 | 用户故事 | 验收标准 |
| --- | --- | --- |
| EV01 | 用户看到一条规则后，可以在再次实践后记录结果 | 规则卡提供“复测有效 / 复测无效 / 不确定”三个操作 |
| EV02 | 同一条规则可以被多次评估 | 每次点击都会新增一条带时间的评估记录，不覆盖旧记录 |
| EV03 | 系统能根据多次评估更新规则状态 | 多次有效提升稳定度，多次无效进入待修正，不确定保持继续观察 |
| EV04 | 用户能看见评估历史 | 规则卡展示评估次数、有效/无效/不确定统计和最近评估记录 |
| EV05 | 评估与反馈分离 | “有用/待观察/不准确”是主观反馈；“复测有效/无效/不确定”是实践结果 |
| EV06 | 用户能记录复测备注 | 每次复测前可输入本次场景或结果说明；未输入时使用系统默认说明 |
| EV07 | 用户能集中处理待复测规则 | 评估工作台展示待复测队列，优先包含待观察、待修正、评估少于 2 次的规则 |
| EV08 | 用户能看到整体评估分布 | 评估工作台展示有效、无效、不确定数量 |
| EV09 | 用户能用新观察验证旧规则 | 复测时可输入一条新的复测观察；系统生成观察记录，绑定到评估记录和规则证据链 |
| EV10 | 系统能识别评估冲突 | 同一规则出现至少 2 次无效且无效次数不低于有效次数时，评估结论为“存在冲突” |
| EV11 | 系统能给出下一步修正建议 | 规则卡展示基于评估结论生成的修正建议 |
| EV12 | 用户输入新场景时，系统能召回候选规则 | 评估工作台提供新场景输入；系统返回匹配分和匹配原因 |
| EV13 | 用户能把召回场景直接用于复测 | 召回候选提供“用此场景标记有效/无效/不确定”，并把召回场景写入复测观察 |
| EV14 | 用户能导出评估数据 | 评估工作台提供 JSON 导出，包含规则、观察、评估记录和汇总统计 |
| EV15 | 用户能导出表格分析数据 | 评估工作台提供 CSV 导出，每条评估记录一行 |
| EV16 | 系统能提醒长期未复测规则 | 评估工作台展示需复查规则，冲突/待修正规则按更短周期提醒 |
| EV17 | 用户能配置复查周期 | 评估工作台可设置普通复查周期和冲突复查周期，范围限制在 1-90 天 |
| EV18 | 用户能导入历史评估数据进行批量分析 | 评估工作台支持导入 JSON，按 `id` 合并规则、观察和评估记录，并重新计算评估结论 |
| EV19 | 用户能判断规则当前是否值得继续采用 | 规则卡展示稳定分、置信等级、趋势和下一步评估动作；工作台展示平均稳定分、高置信、趋势走弱和可行动规则数 |
| EV20 | 用户能按计划执行下一次复测 | 系统为每条规则生成复测优先级、复测焦点、建议场景、证据要求和建议间隔；评估工作台展示复测计划队列 |
| EV21 | 用户能复盘评估是否按计划执行 | 每条评估记录保存来源和计划快照；评估历史展示手动、召回、计划来源；导出数据包含计划执行次数 |
| EV22 | 系统能稳定验证评估规则不被回归破坏 | 评估结论、稳定分、趋势、复测计划和优先级排序有独立单元测试覆盖 |
| EV23 | 用户能判断复测样本是否覆盖关键验证焦点 | 评估工作台展示计划执行率、已覆盖焦点数，以及确认、边界、对照、扩展四类复测焦点的已执行/待计划数量 |
| EV24 | 用户能识别评估样本证据是否充分 | 评估工作台展示样本质量分、薄弱评估数量，并列出缺少复测场景、观察证据或计划快照的评估记录 |
| EV25 | 用户能修复历史评估的证据缺口 | 薄弱评估项可补充复测场景，系统生成观察证据、回填评估记录并更新规则证据链 |
| EV26 | 用户能判断规则当前是否可以采用 | 系统根据结论、稳定分、置信、趋势和样本质量给出可采用、限制使用、继续复测、先补证据或暂停采用决策 |
| EV27 | 用户能集中处理不同采用状态的规则 | 评估工作台按可采用、限制使用、继续复测、先补证据、暂停采用分组展示规则队列和采用原因 |
| EV28 | 用户能复盘采用决策如何变化 | 系统从历史评估样本推导采用决策时间线，规则卡展示最近变化，评估工作台展示全局决策变化队列 |
| EV29 | 用户能知道采用前还差什么 | 系统为每条规则生成采用门槛检查，规则卡展示检查项，评估工作台集中展示阻断项和提醒项 |
| EV30 | 用户能判断复测流程是否可复现 | 系统为每条规则生成可重复性画像，展示分数、等级、问题摘要和下一步标准化复测建议 |
| EV31 | 用户能按统一口径执行复测 | 系统为每条规则生成复测协议，展示有效、无效、不确定判定标准和必填证据 |
| EV32 | 用户能审计历史评估是否按协议执行 | 每条评估记录保存协议快照；评估工作台展示缺少协议快照、缺少复核场景或协议焦点不一致的记录 |
| EV33 | 用户能把反例转化为规则边界 | 系统从无效和不确定评估生成反例/边界样本库，展示边界假设、严重度和建议收窄条件 |
| EV34 | 用户能从评估结果得到规则修订草案 | 系统根据冲突、采用阻断和边界样本生成修订草案，展示建议新结论、推荐行动、约束和排除场景 |
| EV35 | 用户能应用规则修订草案 | 应用后更新规则结论、推荐行动、适用条件和排除场景，生成版本号与修订历史，并抑制同一草案重复提示 |
| EV36 | 用户能确认每次复测是否真正按协议执行 | 每条评估生成协议执行检查单，记录执行状态、分数、匹配判定标准和缺失证据；补证据后重新计算执行结果 |
| EV37 | 用户能判断重复复测结果是否一致 | 系统按复测焦点生成一致性画像，展示一致性状态、分数、一致率、冲突焦点和下一步对照复测建议 |
| EV38 | 用户能按矩阵补齐可重复评估 | 系统为每条规则生成确认、边界、对照、扩展四类复测槽位，展示槽位状态、完成度、缺失焦点、冲突焦点和下一步补测建议 |
| EV39 | 用户能直接按槽位执行复测 | 每个矩阵槽位可直接发起有效、无效或不确定复测，系统自动写入槽位焦点对应的计划快照和协议快照 |
| EV40 | 用户能区分矩阵维护风险等级 | 系统按到期槽位数和最大超期天数生成健康、到期、风险、严重四档维护健康画像，并用该等级影响复测矩阵队列和待复测队列排序 |
| EV41 | 用户能直接处理到期维护槽位 | 评估工作台提供槽位级维护待办队列，按健康档位、槽位超期天数和槽位类型排序，并支持从待办项直接写入维护抽样评估 |
| EV42 | 用户能追踪并关闭维护抽样发现的回归 | 维护抽样结果为无效或不确定时进入未解决维护回归队列，阻断默认采用并提升待复测队列优先级；同规则同槽位后续复测通过后自动关闭回归，JSON/CSV 导出可筛选异常维护样本 |
| EV43 | 用户能让历史矩阵冲突进入恢复状态 | 同一槽位历史出现有效/无效冲突后，如果最近连续通过复测达到该槽位要求，系统将槽位标记为已恢复并允许矩阵从阻断恢复；已恢复槽位先进入恢复观察期，不等同于从未冲突，默认采用前先限制使用并在采用门槛中提示观察；观察期内同槽位再连续通过达到该槽位要求后解除限制；如果仍需人工确认，工作台生成恢复复核队列，JSON/CSV 导出恢复槽位数量、观察期数量和焦点 |
| EV44 | 用户能识别复测样本是否独立 | 系统按复测日期和复测场景生成样本独立性画像，识别同日集中点击和重复场景；样本独立性弱时阻断默认采用并进入采用门槛，样本聚集时提示继续换日期/场景复测；JSON/CSV 导出独立性分数、等级、独立日期数、独立场景数和问题摘要 |
| EV45 | 用户能区分修订前后的评估版本 | 应用规则修订后，历史评估保留为审计和边界依据，但不直接支撑新版本的采用、置信、矩阵和复测结论；新评估写入当前 `ruleVersion`，当前版本少于 2 次明确复测时进入“当前版本复测”采用门槛和待复测队列；JSON/CSV 导出当前版本覆盖状态、当前版本样本数和历史版本样本数 |
| EV46 | 用户能判断当前版本复测是否按协议执行 | 系统按当前版本评估生成协议合规画像，统计完整执行、阻断、待补、缺少快照、缺少执行结果和焦点不一致；协议阻断或待补时不能作为高可信可重复样本，并进入采用门槛和可重复性问题摘要；JSON/CSV 导出协议合规状态、分数和缺口计数 |

## 4. 状态规则

| 条件 | 审核状态 | 可复用度 |
| --- | --- | --- |
| 没有明确有效/无效评估 | 继续观察 | 待观察 |
| 有效 >= 2 且有效 > 无效 | 已验证 | 中 |
| 有效 >= 3 且无效 = 0 | 已验证 | 高 |
| 无效 >= 2 且无效 >= 有效 | 待修正，评估结论为“存在冲突” | 待观察 |
| 其他混合结果 | 继续观察 | 中或待观察 |

稳定分计算原则：

- 有效结果提高分数，无效结果降低分数，不确定结果轻微扣分
- 样本量增加会提高稳定分，但冲突规则分数上限受限
- 置信等级由评估总数和明确有效/无效样本数决定
- 趋势由最近 3 次评估与更早 3 次评估的结果均值对比决定

## 5. 当前实现

- 类型：`src/types/experience.ts`
- 状态：`src/stores/experience.ts`
- 入口：规则卡的“重复评估”区域
- 工作台：首页“评估”Tab
- 证据链：复测观察会生成新的 `Observation`，并写入规则 `evidenceIds`
- 评估结论：规则持有 `evaluationVerdict` 和 `revisionSuggestion`
- 稳定分析：规则持有 `evaluationScore`、`evaluationConfidence`、`evaluationTrend` 和 `nextEvaluationAction`
- 采用决策：规则持有 `adoptionDecision` 和 `adoptionReason`，规则卡展示当前采用建议，工作台通过 `adoptionDecisionQueue` 分组处理
- 决策复盘：规则持有从评估历史推导的 `adoptionTimeline`，规则卡展示最近采用变化，工作台通过 `adoptionTimelineQueue` 展示全局变化队列
- 采用门槛：规则持有 `adoptionGate`，展示默认采用前的阻断项和提醒项，工作台通过 `adoptionGateQueue` 集中处理
- 可重复性画像：规则持有 `repeatabilityProfile`，展示复测流程分数、等级、问题摘要和下一步标准化建议，工作台通过 `repeatabilityQueue` 低分优先处理
- 样本独立性画像：规则持有 `sampleIndependenceProfile`，按明确复测样本的日期和场景去重统计独立日期数、独立场景数、重复场景数、同日最大样本数和同场景最大样本数；同一天连续点击或重复同一场景不能凑成默认采用证据，独立性弱会生成“样本独立性”采用门槛阻断，聚集样本会进入可重复性问题摘要；工作台展示独立样本分和独立性弱规则数，JSON/CSV 导出独立性画像字段
- 修订版本隔离：`RuleEvaluation.ruleVersion` 记录评估对应的规则版本，`versionCoverageProfile` 统计当前版本覆盖状态、当前版本样本数、当前版本明确样本数和历史版本样本数；应用修订后旧版本评估只参与边界审计和修订历史复盘，不再直接支撑当前版本的采用决策、置信、矩阵、可重复性和一致性；当前版本少于 2 次明确复测会生成“当前版本复测”采用门槛阻断，进入 `versionCoverageQueue` 和待复测队列；覆盖率、样本质量、维护回归、复查过期、矩阵维护计数和召回评分均按当前版本样本计算，避免旧版本样本继续抬高新版本优先级；工作台展示版本待复测规则数和历史审计样本数，JSON/CSV 导出版本覆盖字段
- 协议合规画像：规则持有 `protocolComplianceProfile`，按当前版本评估统计协议完整执行、待补、阻断、缺少协议快照、缺少协议执行结果和协议焦点不一致；协议阻断或待补会让采用决策进入修复，采用门槛生成“协议执行一致”阻断项，可重复性画像同步扣分并提示补齐协议证据；工作台展示协议阻断规则数，规则卡展示协议一致/待补/阻断状态，JSON/CSV 导出协议合规字段
- 一致性画像：规则持有 `evaluationConsistencyProfile`，按复测焦点统计重复结果一致率、冲突焦点和下一步对照复测建议，工作台通过 `consistencyQueue` 优先处理同焦点冲突
- 复测矩阵：规则持有 `evaluationReplicationMatrix`，把确认、边界、对照、扩展拆成槽位，工作台通过 `replicationMatrixQueue` 优先处理阻断、未完成矩阵和到期维护矩阵；矩阵阻断会暂停采用，矩阵未完成会阻止默认采用并要求继续复测
- 矩阵维护：`replicationMaintenanceInfo(rule)` 动态计算 ready 矩阵是否超过维护周期、超期天数和维护原因；维护到期以 `nextFocus` 推荐槽位的最近复测时间为基准，而不是规则整体最后评估时间；`replicationMaintenanceHealth(rule)` 按到期槽位数、最大超期天数和超期周期生成 `healthy`、`due`、`risk`、`critical` 四档健康画像，并让严重维护优先于普通到期维护进入矩阵队列和待复测队列；`replicationMaintenanceStats` 汇总 ready 规则数、到期规则数、到期槽位数、到期焦点、到期焦点计数、最大超期天数、健康档位计数、风险/严重规则数和维护样本数；工作台展示维护到期标记、维护风险/严重指标和全局指标，JSON/CSV 导出同步输出维护状态、健康档位、健康分和到期槽位焦点
- 槽位维护：`replicationSlotMaintenanceInfo(rule, focus)` 计算每个 ready 槽位距离上次维护的天数、是否到期和超期天数，矩阵槽位卡直接展示槽位级维护状态；`replicationMaintenanceBacklog` 将所有到期槽位拉平成维护待办队列，按维护健康档位、槽位超期天数、健康分和槽位类型排序，工作台可从待办项直接写入该槽位的维护抽样评估；JSON 导出包含 summary 中的 top backlog 和完整槽位维护 backlog
- 槽位复测：`evaluateReplicationSlot(ruleId, focus, outcome)` 按矩阵槽位写入焦点化计划和协议快照，支持从矩阵面板直接补测；矩阵未 ready 时写入 `fill` 补齐样本，矩阵 ready 后同一槽位按钮写入 `maintenance` 维护抽样样本
- 维护审计：`RuleEvaluation.cycle` 区分 `fill` 和 `maintenance`，推荐槽位在矩阵未完成时写入补齐样本，在矩阵 ready 后写入维护抽样样本，历史列表和 CSV 可区分两类复测；`maintenanceRegressionQueue` 按规则和槽位只保留未解决维护回归，维护抽样中的无效和不确定样本会进入队列，后续同槽位任意复测通过后自动关闭；未解决维护回归会让采用决策转为暂停采用，并在采用门槛中生成“维护回归”阻断项；失败维护优先于普通到期维护进入待复测队列，工作台集中展示未解决异常维护样本并支持按原槽位继续回归复测；JSON 导出包含维护回归队列，CSV 输出 `maintenanceRegression` 和 `maintenanceRegressionFocus`
- 恢复复核：复测槽位记录 `recoveredConflictCount`、`recoveryObservationStatus`、`recoveryObservationPassedCount`、`recoveryObservationRequiredCount` 和 `recoverySummary`，同一槽位历史出现有效/无效冲突后，如果最近连续通过复测达到该槽位要求，槽位可从冲突恢复为完成，矩阵可从阻断恢复；恢复后的矩阵不会直接等同于无冲突矩阵，`observingRecoveredSlots` 和 `recoveryObservationFocuses` 会让采用决策先转为限制使用，并在采用门槛中生成“恢复观察期”提醒；同槽位在观察期内继续连续通过达到该槽位要求后，`recoveryObservationStatus` 转为 `cleared`，恢复观察提醒和限制采用自动解除；`regressionRecoveryQueue` 识别维护回归已关闭但矩阵仍需人工确认的规则槽位，工作台集中展示恢复复核动作，允许继续按原槽位确认有效、标记仍然无效或继续观察；JSON summary 输出恢复复核数量、已恢复槽位统计和观察期统计，完整导出包含恢复复核队列，CSV 输出 `replicationMatrixRecoveredSlots`、`replicationMatrixRecoveryFocuses`、`replicationMatrixRecoveryObservationSlots` 和 `replicationMatrixRecoveryObservationFocuses`
- 槽位追踪：`RuleEvaluation.replicationSlotFocus` 显式保存槽位焦点，历史评估优先按该字段归类，兼容旧数据仍可回退到协议或计划快照
- 队列优先级：矩阵阻断、一致性漂移、ready 矩阵维护到期和待修正规则会重新进入待复测队列；维护规则会按超期天数提高优先级，确保复测工作台优先处理最需要补测或维护抽样的规则
- 复测协议：规则持有 `evaluationProtocol`，展示本次复测的判定标准和必填证据，工作台通过 `evaluationProtocolQueue` 展示协议队列
- 协议执行：`RuleEvaluation` 保存 `protocolSnapshot`，工作台通过 `protocolExecutionQueue` 审计缺少协议快照、缺少复核场景或协议焦点不一致的评估
- 协议检查：`RuleEvaluation` 保存 `protocolExecution`，记录完整/待补/阻断状态、执行分、匹配判定标准、缺失证据和检查项；补证据时同步重算
- 反例边界：规则持有 `boundaryCatalog`，从无效和不确定评估提取边界假设和建议收窄条件，工作台通过 `boundaryCatalogQueue` 按严重度处理
- 修订草案：规则持有 `revisionDraft`，根据冲突、采用阻断和反例边界生成建议结论、推荐行动、约束和排除场景，工作台通过 `revisionDraftQueue` 优先处理
- 修订应用：`applyRevisionDraft(ruleId)` 将草案写回规则结论、推荐行动、条件和排除场景，递增 `revisionVersion`，生成 `revisionHistory`，并通过历史 `draftId` 抑制重复草案；修订后必须补当前版本复测，旧评估不会自动继承为新版本证据
- 复测计划：规则持有 `evaluationPlan`，工作台通过 `evaluationPlanQueue` 展示优先队列
- 计划执行：`RuleEvaluation` 保存 `source` 和 `planSnapshot`，支持复盘评估是否来自复测计划
- 覆盖度：`evaluationCoverage` 统计计划执行率、已覆盖焦点数和四类复测焦点分布
- 样本质量：`evaluationQuality` 统计场景文本、观察证据、计划快照完整度，并列出薄弱评估
- 证据修复：`attachEvaluationEvidence(ruleId, evaluationId, text)` 为历史评估补充观察证据
- 测试：`src/services/evaluationEngine.ts` 提供纯评估引擎，`npm run test:evaluation` 验证核心状态推导
- 召回评估：`recallEvaluationCandidates(scene)` 根据标题、结论、推荐行动、地点、适用条件和证据文本计算候选规则
- 快捷复测：召回候选可直接用当前新场景生成评估和复测观察
- 数据导出：`exportEvaluationData()` 生成评估 JSON
- 表格导出：`exportEvaluationCsv()` 生成评估 CSV
- 复查提醒：`staleEvaluationRules` 展示长期未复测规则
- 复查配置：`evaluationSettings` 保存普通复查、冲突复查和矩阵维护周期，`updateEvaluationSettings()` 更新配置
- 数据导入：`importEvaluationData(raw)` 校验历史 JSON，去重合并规则、观察、评估记录和复查配置
- 存储：随规则一起写入本地 `localStorage`

## 6. 后续增强

- 支持跨设备同步评估历史和规则稳定度
