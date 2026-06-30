# LLM+提示词 vs 本地算法——哪些算法其实可以扔(本地私有)

> 日期:2026-06-24 · 状态:战略分析(本地私有,已 gitignore)
> 关联:`docs/algorithm-upgrade-plan.md`、`docs/ai-leverage-reflection.md`、`docs/knowledge-base-pivot-analysis.md`、`docs/algorithm-a6-privacy-redaction-plan.md`
> 起因:意识到"经验系统其实可以直接 LLM+提示词得出经验"——那之前规划的一堆算法是不是冗余?

---

## 0. 一句话

> **核心提炼:LLM+提示词就够,分词/情感/主题那几份算法可以扔。**
> **真正不可替代的只有"召回 + 跨记录聚合 + 脱敏";而且数据少时连它们都能缓——先用纯 LLM 把东西做出来。**

---

## 1. 单条提炼:LLM+提示词就够 ✅

"一句话 → 一条经验(方向 / kind / 规则)" —— LLM 本来就会,现有 `analyzeObservationResilient` 干的就是这个。

→ **冗余文档(对产品而言):**
- `algorithm-a1-segmentation-plan.md`(分词)
- `algorithm-a8-a9-sentiment-theme-plan.md`(情感 / 主题)

LLM 早就懂中文、褒贬、主题,再用 HMM / 朴素贝叶斯做一遍 = **重复造轮子**。它们价值只剩**简历 / 学习**,不是产品需要(印证 `ai-leverage-reflection` 的"过度规划")。

---

## 2. 但有一块 prompt 单独搞不定:跨记录 + 召回

不是 LLM 笨,是**塞不下、扛不住**:

| 问题 | 为什么 prompt 不够 |
|---|---|
| **规律发现**(3 个月在沟通栽 5 次) | 要扫**全部**记录;几百上千条塞不进上下文,全量发 = 贵 + 慢 |
| **决策召回**(做决定时调相关经验) | 要先从全库**找出**相关几条,才喂给 LLM |
| **一致性** | LLM 每次聚类 / 计数会飘,不稳定 |
| **隐私(A6)** | 必须在**发给 LLM 之前**脱敏——LLM 帮不了它不该看见的东西 |

---

## 3. 真正的分工:算法是 LLM 的管道(RAG)

> **LLM 管"理解 + 判断";算法管"把对的几条捞出来喂给 LLM(召回)+ 跨记录数数 + 发送前脱敏"。**
> 算法不跟 LLM 抢活,是它周围的**管道**(本质就是 RAG)。

**活下来的算法文档:**
- `algorithm-a2-a3-vectorize-cluster-plan.md`(TF-IDF 召回 + DBSCAN 跨记录聚类)
- `algorithm-a4-embedding-recall-plan.md`(语义召回,重,缓做)
- `algorithm-a6-privacy-redaction-plan.md`(脱敏,**独立于 LLM,必需**)
- `algorithm-a7-trend-test-plan.md`(趋势,锦上添花)

**可以扔的:** A1 分词、A8 情感、A9 主题(产品冗余,仅学习价值)。

---

## 4. 对这个小项目,结论更狠

> **现在就全用 LLM+提示词做 MVP。** 数据少时,连"召回"都能先靠"把全部记录塞进 prompt"糊弄过去。
> **等数据多到一个 prompt 塞不下,再上召回 / 聚类那几个算法**——按需,不按时间(项目自己的原则)。

---

> 收口:**别让算法清单遮住主线。** 经验系统的引擎就是 LLM+提示词;算法只在"数据多到塞不下"时,作为召回 / 聚合 / 脱敏的管道补进来。**先做出来,再按数据量长算法。** 还是那句:挑目标 → 砍最小版 → 做完。
