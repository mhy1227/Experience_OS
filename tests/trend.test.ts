import assert from 'node:assert/strict'
import { mannKendall } from '../src/services/trend'

// ---------------------------------------------------------------------------
// A7 趋势检验(Mann-Kendall)。按 docs/algorithm-a7-trend-test-plan.md §4。
// S = Σ_{i<j} sign(xj-xi);标准化 Z 判显著 → rising/flat/falling。小样本/全等 → flat。
// ---------------------------------------------------------------------------

// 1. 单调增 → rising;单调减 → falling
assert.equal(mannKendall([1, 2, 3, 4, 5]), 'rising')
assert.equal(mannKendall([5, 4, 3, 2, 1]), 'falling')
assert.equal(mannKendall([2, 4, 5, 9, 12, 14]), 'rising')

// 2. 无序/噪声 → flat(无显著趋势)
assert.equal(mannKendall([3, 1, 4, 1, 5]), 'flat')

// 3. 全相等 → flat(S=0)
assert.equal(mannKendall([4, 4, 4, 4]), 'flat')

// 4. 极小样本(n≤2)→ flat,不抛错
assert.equal(mannKendall([9]), 'flat')
assert.equal(mannKendall([1, 2]), 'flat')
assert.equal(mannKendall([]), 'flat')

console.log('trend tests passed')
