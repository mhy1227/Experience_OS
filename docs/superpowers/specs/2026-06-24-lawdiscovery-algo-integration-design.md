# lawDiscovery 算法接入(A7/A2/A3/A9)· 分析与设计

> 状态:Draft(分析 → 待接入)
> 日期:2026-06-24
> 关联:`src/services/lawDiscovery.ts`、`docs/algorithm-a2-a3-vectorize-cluster-plan.md`、`docs/algorithm-a7-trend-test-plan.md`、`docs/algorithm-a8-a9-sentiment-theme-plan.md`、`docs/algorithm-evaluation-and-data-plan.md`(冷启动分档)
> 前置:A2/A3/A7/A9 模块均已实现并单测(`tfidf.ts`/`dbscan.ts`/`trend.ts`/`textrank.ts`),本文只讲"接进 lawDiscovery 而不破坏 V2 现有行为"。

## 1. 现状(discoverLaws 的形状)

```
scoped 观察(90 天 + success)
  → 粗分 buckets:key = `${category}|${kind}`(kind 由 sentiment 正/负 得;中性跳过)
  → 每桶 members≥MIN_LAW_MEMBERS:模型起名 attributeTheme,否则 theme = `${category}·${topTag}`
  → buildCandidate(含 computeTrend(memberDates))
  → dedupeCandidates → mergeLaws(成员重叠优先)
```

测试约束(**不能破**,`tests/lawDiscovery.test.ts`):
- `computeTrend`:5 近日期→rising、5 远日期→falling、3 日期→flat(样本不足)。
- `discoverLaws`(无 client,**小样本 3-6 条**):同 category|kind 的 3 条负向 → 1 条 caution 规律、recurrence 3、generatedBy 'statistical';单条簇/全中性 → 0 条;幂等。
- 无 client 路径**未断言 theme 字符串**(只断言 length/kind/recurrence/generatedBy)。

## 2. 核心设计原则:冷启动门让接入安全

数据量驱动**自动选路**,集中到配置;现有测试都是小样本 → 走回退路径 → 不变。

新增 `src/services/algoConfig.ts`:
```ts
export const algoConfig = {
  semanticClustering: {
    enabled: true,          // 总开关(手动 close 即全用 category 分桶)
    minObservations: 30,    // 冷启动线:scoped 数 < 此 → 回退 category 分桶
    dbscanEps: 0.6,
    dbscanMinPts: 2,
  },
}
```
`discoverLaws` 选路:
```ts
const useSemantic = algoConfig.semanticClustering.enabled
  && scoped.length >= algoConfig.semanticClustering.minObservations
const buckets = useSemantic ? clusterBySemantic(scoped, cfg) : clusterByCategory(scoped)
```
> lawDiscovery.test 注入的是 3-6 条 → `scoped.length < 30` → 永远走 `clusterByCategory`(= 现有逻辑原样抽出)→ **断言全部不变**。语义路径由 `dbscan.test` 独立覆盖。

## 3. 逐项接入方案

### A2+A3 → 语义聚类(替代 category 分桶,冷启动回退)
- 抽出 `clusterByCategory(scoped)`:把现有 `${category}|${kind}` 分桶逻辑原样封装(零行为变化)。
- 新增 `clusterBySemantic(scoped, cfg)`:
  1. 仍先按 **kind(正/负)** 分两组(保持"方向不混簇"红线);中性跳过。
  2. 每组:对观察文本 `segment()` 分词 → `buildIdf` → `toVector` → `dbscan(vectors, eps, minPts)`。
  3. 每个非噪声簇 → 一个 `{ kind, members }` 桶;噪声丢弃(= 偶发观察不成规律)。
  - 产物形状与 `clusterByCategory` 一致(`{ kind, members }[]`),下游 buildCandidate/merge 不动。
- 风险:eps/minPts 为常量(MVP);自适应留后续。

### A9 → 无模型起名(替 `category·topTag`)
- `theme` 兜底从 `${category}·${topTag}` 换成 `extractKeywords(members 的合并 tokens, 3).join('·')`,无结果再回退 topTag。
- 仅影响**无模型**路径的 theme 串;现有测试未断言该串 → 安全。模型路径(attributeTheme)不变。

### A7 → computeTrend 用 Mann-Kendall(❌ 本轮不接,分析后否决)
分析推演结论:**不接**。原因:
- MK 要统计显著性(|Z|>1.96)。一条规律典型才 4–6 个成员、分到几个时间桶 → 数据点太少,MK **几乎永远判 flat**(如 5 个近期日期集中在最新桶 `[0…0,5]`,Z≈0.67 < 1.96 → flat,而现有断言要 rising)。
- 即:MK 把趋势变得**保守**(没足够样本不下结论),与现有"近期占比→急判 rising/falling"语义**直接冲突**;接入会逼着重写断言,且"趋势要不要这么保守"是**产品判断**,不是纯 refactor。
- 决策:`mannKendall` standalone 模块保留;computeTrend **维持现状**。若将来规律成员数普遍变大(数据量上来)再评估。

## 4. 测试策略

- **不改**现有 lawDiscovery.test 的 discoverLaws 断言(冷启动回退保证)。
- `computeTrend` 三条:先按 §3 实现,实跑;通过则不动,否则重写并注明。
- 新增 `tests/lawDiscoveryIntegration.test.ts`:构造 **≥30 条**含 2 个跨类目同根因 + 噪声的观察 → `discoverLaws`(无 client)→ 断言语义聚类把同根因(跨 category)聚成规律、噪声不成规律(验证 useSemantic 路径)。
- 冷启动断言:<30 条时 `discoverLaws` 行为等同现状(已由现有测试覆盖)。

## 5. 风险与回退

- **最大风险**:语义路径在真实数据上聚类质量未经 golden set 验证(评估plan §3 的 `npm run eval` 尚未搭)。→ 用 `enabled` 开关可一键回退;`minObservations` 保守取 30。
- **eps/minPts 魔数**:集中在 algoConfig,后续按 k-distance/N 自适应。
- **computeTrend 桶宽**敏感:实跑校准,留弹性。

## 6. 落地顺序

1. `algoConfig.ts`(配置 + 冷启动门常量)。
2. A9 theme 兜底(最小,先做,验证不破测试)。
3. A2+A3:抽 `clusterByCategory` + 新增 `clusterBySemantic` + 选路;新增集成测试;跑全量。
4. ~~A7~~ 本轮不接(见 §3 分析否决)。
5. 全量 + typecheck 绿 → 提交。

## 7. 不做(YAGNI / 后续)

eps/minPts 自适应、A4 embedding 作聚类特征、golden set 评估脚本、把开关暴露到「高级」UI —— 不在本轮。
