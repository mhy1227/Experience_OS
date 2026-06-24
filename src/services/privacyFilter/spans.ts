// span 合并去重。移植自 mhy1227/privacy-filter-ts 的 filter.ts:mergeSpans。
// 丢弃无效与重叠区间:按起点升序、同起点取更长者,贪心保留互不重叠的区间。
// (JS Array.sort 自 ES2019 起稳定,等价 Go SliceStable)
import type { Span } from './types'

export function mergeSpans(spans: Span[]): Span[] {
  const valid = spans.filter((s) => s.start >= 0 && s.start < s.end)
  valid.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    return b.end - a.end
  })
  const merged: Span[] = []
  let lastEnd = -1
  for (const s of valid) {
    if (s.start >= lastEnd) {
      merged.push(s)
      lastEnd = s.end
    }
  }
  return merged
}
