// A7 趋势检验(Mann-Kendall)。按 docs/algorithm-a7-trend-test-plan.md。
// 非参趋势检验:小样本、不要求正态,适合"复发次数"这类离散少量数据。
// S = Σ_{i<j} sign(xj-xi);标准化 Z 判显著(默认 95%,|Z|>1.96)→ rising/flat/falling。
// 接入:可替换 lawDiscovery 里 Law.trend 的阈值比(本轮只交付纯函数,集成待后续)。

export type Trend = 'rising' | 'flat' | 'falling'

export function mannKendall(series: number[], zCritical = 1.96): Trend {
  const n = series.length
  if (n < 3) return 'flat' // 样本不足,不下趋势结论

  let s = 0
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = series[j]! - series[i]!
      s += d > 0 ? 1 : d < 0 ? -1 : 0
    }
  }
  if (s === 0) return 'flat'

  // 方差(无并列校正的标准式):Var(S) = n(n-1)(2n+5)/18
  const varS = (n * (n - 1) * (2 * n + 5)) / 18
  // 连续性校正:S>0 用 S-1,S<0 用 S+1
  const z = s > 0 ? (s - 1) / Math.sqrt(varS) : (s + 1) / Math.sqrt(varS)

  if (z > zCritical) return 'rising'
  if (z < -zCritical) return 'falling'
  return 'flat'
}
