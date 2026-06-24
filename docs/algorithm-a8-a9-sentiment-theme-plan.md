# A8 + A9 实施方案:朴素贝叶斯情绪分类 + TextRank 主题词

> 日期:2026-06-23 · 状态:A8 ✅ 已实现(2026-06-24,`src/services/sentiment.ts`,集成 inferDirection 待后续);A9 ✅ 已实现(2026-06-24,`src/services/textrank.ts`;lawDiscovery 起名集成待后续)
> 关联:`docs/algorithm-upgrade-plan.md`(扩展菜单为 A8/A9)、`stores/experience.ts:inferDirection`、`services/lawDiscovery.ts`(Law.theme)
> 定位:补两个之前没强调的候选算法,各修一个现有真痛。它们扩展总规划 §3 菜单(A8/A9)。

---

# A8:朴素贝叶斯情绪分类

## A8.1 修的痛
`inferDirection` 现在是硬编码关键词表,文档自承"多数真实文本→neutral",导致情绪维度近乎失效(复盘"高频问题"为空、聚类情绪维度无用)。

## A8.2 模型
分类:positive / negative / neutral。朴素贝叶斯:

```
P(类别 | 词们) ∝ P(类别) × Π P(词_i | 类别)
```

- "朴素" = 假设词之间独立(简化,实用够用);
- 取**对数**:`log P(类别) + Σ log P(词_i|类别)`(防连乘下溢);
- 选概率最大的类别。

## A8.3 训练
- 在标注语料上**计数**:每类里各词出现次数 → 归一化为 `P(词|类别)`;
- **拉普拉斯平滑**:分子+1、分母+|vocab|,防"没见过的词"概率为 0;
- 语料来源:合成标注集(eval-plan §1)+ 可选领域语料增量。

## A8.4 否定处理
"没开会"≠"开会":分词后对"没/不/别"后续词做标记(如加前缀 `NOT_`),作为独立特征参与分类。

## A8.5 模块 + 接入
- `src/services/sentiment.ts`(纯函数):`trainNB(corpus)`、`classify(tokens, model)`;
- 接入:`inferDirection` 优先用 NB,失败回退现有关键词表(降级链);
- 注意:现有 `observation.sentiment` 已优先取**模型 direction**,A8 是**纯本地路径**的升级(无模型时才用)。

## A8.6 测试
1. 正向句判 positive、负向句判 negative;
2. 否定翻转("没踩坑"≠"踩坑");
3. 未登录词不崩(平滑生效);
4. 各类 F1(防全判中性,见 eval-plan §2);
5. 降级:空模型 → 回退关键词表不抛错。

## A8.7 选型(面试)
- **为什么 NB 不用关键词表?** 关键词是布尔命中,NB 用概率综合全句、可处理组合与否定,泛化更好。
- **为什么不用神经分类?** 数据量小、要离线可解释,NB 性价比最高(YAGNI)。

---

# A9:TextRank 主题词抽取

## A9.1 修的痛
无大模型时,规律(Law)没法起名(`theme`)。现在降级态只能用统计描述,干巴巴。TextRank 能离线抽出"代表词"。

## A9.2 算法(PageRank 变体)
把词当节点、共现当边,用 PageRank 迭代算"重要度":

```
WS(Vi) = (1-d) + d × Σ_{j∈邻居} ( w_ji / Σ_k w_jk ) × WS(Vj)
```

- `d` 阻尼系数(≈0.85);
- 迭代到收敛 → 取分数 top-N 词作主题词。

## A9.3 步骤
1. 簇内成员文本分词(A1)、去停用词;
2. 滑动窗口(如窗口=2~5)内的词两两连边(共现),累加权重;
3. 初始化各词分数,按上式**迭代**至收敛;
4. 取 top-N 词 → 拼成 `Law.theme`(如"对齐 / 返工 / 接口")。

## A9.4 数据结构
- 词图:邻接表 `Map<term, Map<term, weight>>`;
- 分数:`Map<term, number>`,双缓冲迭代。

## A9.5 接入
- `src/services/textrank.ts`(纯函数):`extractKeywords(tokens, topN)`;
- 接入:`lawDiscovery` 降级层,模型不可用时用它生成 `theme`。

## A9.6 测试
1. 一段含明显主题的文本 → top 词含该主题词;
2. 停用词不入榜;
3. 收敛性(迭代有限步内稳定);
4. 短文本 / 单词不崩;
5. 降级:与模型 theme 对比(非断言,eval 口径)。

## A9.7 选型(面试)
- **为什么 TextRank 不用纯词频 top-N?** 词频只看次数,TextRank 看"和其他重要词的连接"(图中心性),更能抓主题词而非高频虚词。
- **和 PageRank 关系?** 同一思想(投票/中心性),TextRank 是其在词图上的应用。

---

## YAGNI(两者共同)
不做:深度模型情绪、BERT 关键词、自定义词典 UI、跨语言。先把 NB + TextRank 这两个经典、可测、能讲的落地。

---

> 一句话:**A8 用朴素贝叶斯把"情绪判断"从关键词升级为概率分类(修 inferDirection 真痛);A9 用 TextRank 让规律在无模型时也能自动起名。两者都是离线、可测、面试能讲的经典算法。**
