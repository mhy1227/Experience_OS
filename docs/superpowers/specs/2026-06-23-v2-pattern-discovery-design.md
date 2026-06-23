# V2 经验关联 / 规律发现 —— 设计文档

> 状态:Draft(brainstorming 产出,待执行)
> 分支:`feat/v2-pattern-discovery`
> 日期:2026-06-23
> 关联:`docs/version-roadmap.md`(V2)、`src/services/patternDiscovery.ts`(基础版)、`docs/architecture/target-architecture-blueprint.md`

## 1. 背景与定位

V1 已能把单条口语观察提炼成结构化规则(strategy / caution / watch)。但产品的护城河不在"提炼"(那接近"二次打标签"),而在 **跨记录发现规律 + 让规律成为决策资产**。

现状(V2 基础版 `patternDiscovery.ts`)只按 **category / tag 精确匹配**聚类,产出一次性"洞察卡"。两个根本缺口:
1. **停在标签层**:表面不同但同根因的观察(如"不开对齐会""没定接口约定""需求没同步")tag 各异 → 归不到一起,看不出"前期对齐不足"这条真规律。
2. **规律不是资产**:洞察是每次扫描重算的快照,无法跨时间追踪复发、无法标记"已针对它改进"。

V2 的目标:**让规律越过"打标签"线** —— 模型驱动的语义聚类 + 时间维度 + 持久化生命周期。

## 2. 范围与非目标

**做:**
- 模型驱动**语义聚类**:把同根因不同表述的观察归为一条**规律(Law)**。
- **时间维度**:复发次数、首/末出现时间、趋势(上升/平/下降)。
- 复用 V1 的 **kind 轴**:规律分"高频避坑(caution)"与"高频成功(strategy)"。
- **持久化规律库 + 生命周期**:`active → reviewed → resolved`,可"标记已针对它改进"。

**非目标(本期坚决不做):**
- ❌ **决策召回 / 录入时风险提醒** —— 那是 **V4**,本期不碰。
- ❌ **本地向量检索(embedding)** —— 留 **V4** 技术线;V2 语义聚类用模型实现,不引入向量基建。
- ❌ 团队/组织规律、飞书回写(V5)。

**红线(继承 CLAUDE.md):**
- **本地优先**:规律库存 localStorage;模型不可用时**降级**为统计聚类,功能不中断。
- **模型输出必经校验**:复用 `validateModelField`(空/超长/占位黑名单 → 回退统计),规律不得直接写入未校验的模型文本。
- 不重写已完成部分;`patternDiscovery.ts` 的统计基座**保留并复用**(作降级层),不推倒重来。

## 3. 数据模型

新增 `Law` 实体(`src/types/experience.ts`),与 `observations` / `rules` 同级持久化:

```ts
export type LawKind = 'caution' | 'strategy'
export type LawStatus = 'active' | 'reviewed' | 'resolved'
export type LawTrend = 'rising' | 'flat' | 'falling'

export interface Law {
  id: string
  theme: string                 // 规律主题,如"前期对齐不足导致返工"
  kind: LawKind                 // 复用 V1 轴:高频避坑 / 高频成功
  rootCause: string             // 模型归因(降级时 = 统计描述)
  suggestion: string            // 可执行建议(降级时 = 统计建议)
  memberObservationIds: string[]// 命中的观察
  recurrence: number            // = memberObservationIds.length
  firstSeenAt: string           // 成员最早 createdAt
  lastSeenAt: string            // 成员最晚 createdAt
  trend: LawTrend               // 近 30 天占比 vs 前 60 天
  confidence: InsightConfidence // 复用现有 low/medium/high 阈值
  status: LawStatus
  generatedBy: 'statistical' | 'model'
  createdAt: string
  updatedAt: string
}
```

- 现有 `Insight` 类型**保留**,作为"轻量统计卡"(降级层 / 单次扫描快照)。`Law` 是新的"可沉淀资产",二者并存:统计层产 `Insight`,语义+持久化层产 `Law`。
- 持久化:`PersistedState` 增加 `laws: Law[]`;`experience.ts` store 负责读写(与 observations 一致的持久化路径)。

## 4. 聚类实现:两段式(方案 A)

纯函数 + 服务层,沿用 `services/` 分层,可测。新增 `src/services/lawDiscovery.ts`(不污染现有 `patternDiscovery.ts`)。

**第一段(统计粗分,控 token、可降级):**
- 复用 `clusterObservations` 按 `category` 粗分,限定送模型的范围。

**第二段(模型语义归并):**
- 对每个粗簇(成员 ≥ 2),把成员文本送模型,要求:识别**共同主题/根因**,输出 `theme / kind / rootCause / suggestion`,并指出哪些成员**不属于**该主题(剔除噪声)。
- **跨粗簇合并**:不同 category 但模型给出**相同/相近 theme** 的簇合并为一条 Law(按 theme 归一)。
- prompt 复用现有防注入 + JSON 约束写法;输出过 `validateModelField`。

**降级链:** 模型不可用 / 抛错 → 跳过第二段,直接用第一段统计结果产 `Insight`(现有 `discoverPatterns` 路径),规律库不写 model 字段。**全程不向上抛异常。**

## 5. 触发 / 合并 / 时间维度 / 降级

- **触发**:复用「扫描我的 90 天」按钮 → 全量(近 90 天)语义聚类 → **幂等合并**进规律库。
- **幂等合并**:候选 Law 与已有 Law 的匹配键 = **成员观察重叠优先,主题归一化次之**。即先看候选簇与已有 Law 是否共享 ≥1 条 `memberObservationId`(稳:不受模型每次措辞变化影响);无重叠再比 `theme` 归一化文本(trim+小写)。命中任一即视为同一条 Law:
  - 命中 → 合并成员(去重)、重算 `recurrence / lastSeenAt / trend / confidence`、`updatedAt` 刷新;若该 Law 已 `resolved` 但又有新成员复发 → 回到 `active` 并标记"复发"。
  - 未命中 → 新建 `active` Law。
  - 已被用户标 `resolved/reviewed` 且无新成员 → 状态不变。
- **时间维度**:
  - `recurrence` = 成员数;`firstSeenAt/lastSeenAt` 取成员时间极值。
  - `trend`:近 30 天成员数占比 vs 前 31–90 天;明显升→`rising`、降→`falling`、否则 `flat`(阈值在 `config` 集中,避免魔数)。
  - UI 文案:"过去 90 天:〈theme〉复发 N 次,趋势 ↑/→/↓"。
- **降级**:无模型 → 统计卡(现状),不阻断。

## 6. UI(扩展"规律发现"面板,不新增页)

- 面板顶部新增 **规律库**区:Law 卡片,按 `confidence × recurrence` 降序。
- 卡片含:`kind` 徽标(🟥避坑 / 🟩成功)、theme、"90 天复发 N 次 + 趋势箭头"、置信徽标、证据时间线(复用现有)、rootCause、suggestion。
- **生命周期操作**(卡片内按钮):`标记已复盘` / `标记已解决` / `标记已针对它改进`(后者写一条 note + 置 reviewed)。`resolved` 的 Law 折叠到"已解决"分组。
- 低置信/降级态沿用现有"低置信·仅供参考"标注。
- 现有统计 `Insight` 卡保留在下方(降级或补充视图)。

## 7. 测试策略(沿用纯 TS + node:assert)

新增 `tests/lawDiscovery.test.ts`,并追加进 `package.json` 的 `test:evaluation`:
- **幂等合并**:同一批观察扫描两次,规律库不重复膨胀(成员去重、recurrence 不翻倍)。
- **趋势计算**:构造近/远期成员分布 → 断言 rising/flat/falling。
- **生命周期**:active→reviewed→resolved;resolved 后有新成员复发 → 回 active。
- **降级**:无 client → 走统计,产出 Insight 不抛错;成员 <2 不产 Law。
- **模型字段校验**:复用 `validateModelField`,占位/超长被拦。
- **真机验证**(Playwright,镜像 V1):灌一组同根因不同表述的观察 → 扫描 → 断言归成 1 条 Law(而非多条 tag 卡)、复发计数正确、生命周期按钮生效。

## 8. 风险与取舍

- **token 成本**:两段式已限范围;全量扫描在数据量大时仍增长 → V2 接受"按需扫描"成本,逐条增量留后续。
- **语义合并不稳**:模型可能把不该合的合并/该合的拆开 → 用 theme 归一 + 低置信标注 + 用户可"标记已解决"纠偏;统计层兜底。
- **localStorage 体积**:Law 数量可控(主题级,远少于观察);可接受。
- **与 V3 衔接**:Law 的 `resolved/复发` 天然是 V3"验证"的输入,本期只留字段、不实现验证闭环。

## 9. 验收标准

1. 灌入"对齐会/接口约定/需求同步"等同根因不同表述的观察,扫描后归为 **1 条 Law**(theme≈"前期对齐不足"),而非多条 tag 卡。
2. Law 显示正确的复发次数与趋势;再次扫描**幂等**(不重复膨胀)。
3. 高频成功与高频避坑分别归到 `strategy/caution` 两类。
4. 标记"已解决"后折叠;后续新成员复发能让其回到 active。
5. 关掉模型(或模型异常)时,降级为统计卡,**不报错、不中断**。
6. typecheck + 全部 `test:evaluation` 绿(含新增 lawDiscovery 测试)。

## 10. 不做清单(YAGNI)

逐条增量实时归类、本地向量、决策召回、跨设备同步、团队规律、规律的自动 A/B 验证 —— 全部不在本期。
