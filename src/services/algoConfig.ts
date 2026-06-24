// 本地语义引擎的集中配置(避免魔数散落)。见 docs/algorithm-evaluation-and-data-plan.md §6。
export const algoConfig = {
  semanticClustering: {
    enabled: true, // 总开关:close 即全用 category 分桶(可后续暴露到「高级」UI)
    minObservations: 30, // 冷启动线:scoped 观察 < 此 → 回退 category 分桶(数据少时 DBSCAN 无意义)
    dbscanEps: 0.6, // 余弦距离邻域;后续可按 k-distance/N 自适应
    dbscanMinPts: 2, // 成簇最小点数
  },
}
