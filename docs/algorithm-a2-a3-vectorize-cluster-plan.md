# A2 + A3 实施方案:TF-IDF 向量化 + DBSCAN 聚类

> 日期:2026-06-23 · 状态:✅ 已实现(2026-06-24,`src/services/tfidf.ts` + `src/services/dbscan.ts`;lawDiscovery 集成待数据量/后续)
> 关联:`docs/algorithm-upgrade-plan.md`(A2/A3)、`algorithm-a1-segmentation-plan.md`(上游分词)、`algorithm-evaluation-and-data-plan.md`(评估/参数/冷启动)
> 目标:把分词输出 → **TF-IDF 向量** → **DBSCAN 语义聚类**,让"规律发现"在**无大模型时**也能离线产出。

---

## 0. 在管线里的位置

```
分词(A1) → 【A2 TF-IDF 向量化】 → 【A3 DBSCAN 聚类】 → 候选规律(喂 V2 lawDiscovery 降级层)
```

A2 把词变成数字,A3 把相似的归成堆。两者强耦合,放一份方案。

---

# A2:TF-IDF 向量化

## A2.1 公式
对词 t 在文档 d、语料 D:
- **TF**(词频)= t 在 d 中出现次数 / d 的总词数
- **IDF**(逆文档频率)= `log(|D| / (1 + 含 t 的文档数))`
- **TF-IDF** = TF × IDF —— 一个词在本句多、在别句少 → 权重高(即"关键词")

## A2.2 步骤
1. 对每条观察 `segment()` 分词(A1),去停用词(见 eval-plan §7);
2. 构建全局词表 `vocab`;
3. 算每个词的 IDF(基于当前全部观察);
4. 每条观察 → 稀疏向量 `{ 词: tfidf }`。

## A2.3 相似度
两向量 **余弦相似** = 点积 /(模长积),输出 0~1。

## A2.4 数据结构
- 稀疏表示:`Map<term, number>`(别用稠密大数组,词表大);
- IDF 表:`Map<term, number>`,随观察增量可重算。

## A2.5 边界
- 空文档 / 全停用词 → 空向量,相似度记 0,不崩;
- 单文档时 IDF 退化(分母处理),小数据期由 eval-plan §4 兜底;
- 向量全 0 不参与聚类。

## A2.6 模块
`src/services/tfidf.ts`(纯函数):`buildIdf(docs)`、`toVector(tokens, idf)`、`cosine(a, b)`。

---

# A3:DBSCAN 聚类

## A3.1 概念(为什么选它)
- **核心点**:邻域(距离 ≤ `eps`)内点数 ≥ `minPts`;
- **边界点**:在某核心点邻域内,但自身点不够;
- **噪声点**:都不是 → **天然映射"偶发,不算规律"**;
- **不需预设簇数 k**(对比 K-means 必须先给 k)。

距离用 **余弦距离 = 1 − 余弦相似**。

## A3.2 步骤
1. 对每个未访问点,取其 eps-邻域;
2. 邻域点数 ≥ minPts → 立为核心点,新建簇,广度扩展(把密度可达点纳入);
3. 不足 → 暂标噪声(后续可能被纳入某簇为边界点);
4. 直到所有点访问完。

## A3.3 映射到产品
- **密集簇** = 同根因不同表述的复发 → 一条 **Law**;
- **噪声点** = 一次性观察 → 不产规律(强化"洞察不被单条刷屏");
- 簇成员 → `Law.memberObservationIds`,直接接 `lawDiscovery` 现有合并逻辑。

## A3.4 参数
- `eps` / `minPts`:**不写死**,按 `algorithm-evaluation-and-data-plan.md` §6(k-distance 图 + 随 N 自适应),集中到 config。

## A3.5 备选:层次聚类(凝聚式)
- 自底向上,按相似度阈值合并,产树状图;也无需 k。
- 何时用:想要"可解释的合并过程"或数据极少时。DBSCAN 为主,层次作备选。

## A3.6 接入点
- `services/patternDiscovery.ts` / `lawDiscovery.ts` 的**统计/降级层**:把"category/tag 精确匹配"替换/补充为"TF-IDF + DBSCAN 语义聚类";
- 模型可用时作交叉验证(见 eval-plan §5)。

---

## 测试设计(node:assert,登记 package.json)

新建 `tests/tfidf.test.ts` + `tests/dbscan.test.ts`:

1. **TF-IDF**:常见词权重低、独特词权重高;余弦:相同向量=1、正交=0;空向量不崩;
2. **DBSCAN**:同根因簇聚成 1 个;干扰项判噪声;`eps` 收紧 → 簇变多;`minPts` 调高 → 更多噪声;
3. **幂等**:同输入同结果;
4. **冷启动**:N<minPts 时返回空簇,不抛错;
5. **端到端**:一组合成观察(埋 2 根因 + 噪声)→ 聚成 2 簇 + 噪声正确。

---

## 选型理由(面试可讲)

- **为什么 DBSCAN 不用 K-means?** 不用预设簇数;能识别噪声(偶发观察);对簇形状不敏感。规律数量事先未知,正合适。
- **为什么 TF-IDF 不用纯词频?** 纯词频被"的/了"等高频虚词主导;IDF 压低普遍词、突出关键词。
- **为什么余弦不用欧氏?** 文本向量长度受句长影响,余弦只看方向(语义),抗长度干扰。

---

## YAGNI
不做:稠密大向量、在线增量聚类、HDBSCAN/谱聚类、自动调参。先把 TF-IDF + DBSCAN 这对经典、可测、能讲的落地。

---

> 一句话:**A2 把词变数字、A3 把相似的归堆——这对组合让"规律发现"脱离大模型也能跑,直接强化"本地优先"红线。**
