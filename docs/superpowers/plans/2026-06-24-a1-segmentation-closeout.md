# A1 中文分词(HMM + Viterbi)· 实现 + 总结

> 状态:✅ 已实现(2026-06-24,commit 40b1b5b / 文档 7223fab)
> 方案:`docs/algorithm-a1-segmentation-plan.md` · 总览:`docs/algorithm-upgrade-plan.md`(技术线 A1)

## 1. 交付

`src/services/segmentation.ts`(纯前端、离线、可测):

| 导出 | 作用 |
|------|------|
| `trainHMM(corpus)` | 已分词语料 → 计数 + 拉普拉斯平滑 + 对数概率(π/转移/发射);非法转移掩码、句首只允许 B/S |
| `segmentByHMM(text, probs)` | Viterbi DP(O(T·S²),S=4),全程对数防下溢,回溯还原 B/M/E/S 序列切词 |
| `segmentByDict(text, dict)` | 词典最大匹配(兜底/baseline) |
| `segment(text)` | 入口:英文/数字整体旁路、标点作分隔、中文段走 HMM,异常 → 词典 → 按字(三级降级) |
| `BUILTIN_CORPUS` / `BUILTIN_DICT` | 内置 demo 语料(常见 + 领域 + 歧义测试词)与派生词典 |

## 2. 算法要点(面试可讲)

- **建模**:分词 = 给每个字打 {B,M,E,S} 的序列标注;遇 E/S 断词。
- **为什么 HMM+Viterbi 不用规则/词典**:规则不解决歧义与未登录词;词典最大匹配是贪心、非全局最优;HMM 用转移+发射概率做**全局最优**序列标注,Viterbi DP 保证最优解,复杂度 O(16T) 极低、纯前端可跑。
- **下溢**:全程对数概率,乘改加。
- **非法转移**:掩码置 -1e10(如 B→B、B→S、E→E…)。

## 3. 验证(TDD,plan §7 八类全过)

基本切分 / 歧义(研究·生命 ≠ 研究生·命)/ 未登录不崩 / 英文数字旁路 / 标点空串→`[]` / 长文本(520 字)无下溢不丢字 / 降级(空表/词典)/ 单词不逐字。
`npm run typecheck` 干净;`npm run test:evaluation` **27 套全绿**(含 `segmentation`)。

## 4. 诚实边界 / 局限

- **概率表 = demo 级**:由内置小语料训练,覆盖常见 + 领域 + 测试词;对语料外字的泛化有限(走平滑/词典兜底)。**生产可换内置 jieba 全量发射表**(像 gitleaks 那样 vendor 一份),留后续。
- **下游未集成**:plan §6 的"接到 `decisionHints` 分词 / `inferDirection`"**本轮未做**——那会动现有召回/情绪逻辑、有回归面。模块本身已完整、可独立测,集成作为单独一步推进。

## 5. 后续

- 下游集成(召回/情绪改用 `segment()`,下游评分契约不动)。
- 可选:换 jieba 全量发射表提升泛化。
- 技术线下一站(性价比):**A8 情绪(朴素贝叶斯)** → A7 趋势;A2/A3 待数据量(见 `docs/algorithm-evaluation-and-data-plan.md` 冷启动分档)。

## 6. 算法技术线进度(截至 2026-06-24)

| 项 | 状态 |
|----|------|
| A6 隐私脱敏 | ✅ 已实现(205 条规则 + PII/Luhn/熵,接全模型调用前) |
| A1 中文分词 | ✅ 已实现(本文) |
| A8 情绪 / A7 趋势 / A2+A3 / A9 / A4 / A5 | 🟡 方案就绪(按优先与数据量推进) |
