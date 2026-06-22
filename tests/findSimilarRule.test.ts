import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// 独立于 Vue/Pinia:镜像 store 内 findSimilarRule 逻辑,验证 kind 一致性守卫
// ---------------------------------------------------------------------------
// 与 stores/experience.ts 中的 findSimilarRule 保持逻辑一致。
// 修复要点:
//   1. kind 不同(strategy vs caution)→ 即使 category+location 相同也不合并
//   2. sameTitle 需同时满足 sameCategory,防止跨领域同名 title 误合并

type ExperienceKind = 'strategy' | 'caution' | 'watch'
type Reusability = 'high' | 'medium' | 'low' | 'watch'
type ExperienceCategory = '饮食' | '购物' | '出行' | '运动' | '工作' | '生活' | '偏好' | '其他'

interface RuleStub {
  title: string
  category: ExperienceCategory
  kind?: ExperienceKind
  location?: string
  reusability: Reusability
}

interface AnalysisStub {
  title: string
  category: ExperienceCategory
  kind?: ExperienceKind
  location?: string
  reusability: Reusability
}

// 镜像 stores/experience.ts findSimilarRule(修复后版本)
function findSimilarRule(analysis: AnalysisStub, rules: RuleStub[]): RuleStub | undefined {
  if (analysis.reusability === 'watch') return undefined

  return rules.find((rule) => {
    // kind 必须一致(undefined 视为相同):负向 caution 不能合并进正向 strategy
    const sameKind =
      analysis.kind === undefined || rule.kind === undefined || analysis.kind === rule.kind
    if (!sameKind) return false

    const sameCategory = rule.category === analysis.category
    const sameTitle = rule.title === analysis.title
    const sameLocation = Boolean(
      rule.location && analysis.location && rule.location === analysis.location,
    )
    // sameTitle 也要求 sameCategory,防止跨领域同名 title 误合并
    return (sameTitle && sameCategory) || (sameCategory && sameLocation)
  })
}

// ---------------------------------------------------------------------------
// 辅助:构造 stub
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<RuleStub> & Pick<RuleStub, 'title' | 'category'>): RuleStub {
  return {
    reusability: 'medium',
    ...overrides,
  }
}

function makeAnalysis(
  overrides: Partial<AnalysisStub> & Pick<AnalysisStub, 'title' | 'category'>,
): AnalysisStub {
  return {
    reusability: 'medium',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 测试:I2 修复 — 同 category+location 但 kind 不同 → 不合并
// ---------------------------------------------------------------------------

function testSameCategoryLocationDifferentKindShouldNotMerge() {
  const existing = makeRule({
    title: '健身房高峰',
    category: '运动',
    kind: 'strategy',
    location: '健身房',
  })

  const analysis = makeAnalysis({
    title: '健身房高峰',
    category: '运动',
    kind: 'caution',
    location: '健身房',
  })

  const found = findSimilarRule(analysis, [existing])
  assert.equal(
    found,
    undefined,
    '同 category+location 但 kind 不同(strategy vs caution)→ 不应合并',
  )
}

// ---------------------------------------------------------------------------
// 测试:I2 修复 — 同 category+location 且 kind 相同 → 正常合并
// ---------------------------------------------------------------------------

function testSameCategoryLocationSameKindShouldMerge() {
  const existing = makeRule({
    title: '健身房高峰',
    category: '运动',
    kind: 'strategy',
    location: '健身房',
  })

  const analysis = makeAnalysis({
    title: '健身房高峰补充',
    category: '运动',
    kind: 'strategy',
    location: '健身房',
  })

  const found = findSimilarRule(analysis, [existing])
  assert.equal(found, existing, '同 category+location 且 kind 相同 → 应合并')
}

// ---------------------------------------------------------------------------
// 测试:I2 修复 — kind 有一方为 undefined → 视为相同,允许合并
// ---------------------------------------------------------------------------

function testKindUndefinedOnRuleShouldMerge() {
  const existing = makeRule({
    title: '健身房高峰',
    category: '运动',
    // kind 未设置
    location: '健身房',
  })

  const analysis = makeAnalysis({
    title: '健身房高峰补充',
    category: '运动',
    kind: 'strategy',
    location: '健身房',
  })

  const found = findSimilarRule(analysis, [existing])
  assert.equal(found, existing, '已有规则 kind 为 undefined → 宽容合并,不阻断')
}

function testKindUndefinedOnAnalysisShouldMerge() {
  const existing = makeRule({
    title: '健身房高峰',
    category: '运动',
    kind: 'caution',
    location: '健身房',
  })

  const analysis = makeAnalysis({
    title: '健身房高峰补充',
    category: '运动',
    // kind 未设置
    location: '健身房',
  })

  const found = findSimilarRule(analysis, [existing])
  assert.equal(found, existing, '分析结果 kind 为 undefined → 宽容合并,不阻断')
}

// ---------------------------------------------------------------------------
// 测试:M5 修复 — 同名 title 但 category 不同 → 不合并
// ---------------------------------------------------------------------------

function testSameTitleDifferentCategoryShouldNotMerge() {
  const existing = makeRule({
    title: '高峰期避开',
    category: '运动',
    kind: 'strategy',
  })

  const analysis = makeAnalysis({
    title: '高峰期避开',
    category: '出行',
    kind: 'strategy',
  })

  const found = findSimilarRule(analysis, [existing])
  assert.equal(found, undefined, '同名 title 但 category 不同 → 跨领域误合并应被阻止')
}

// ---------------------------------------------------------------------------
// 测试:M5 修复 — 同名 title 且 category 相同 → 正常合并
// ---------------------------------------------------------------------------

function testSameTitleSameCategoryShouldMerge() {
  const existing = makeRule({
    title: '高峰期避开',
    category: '运动',
    kind: 'strategy',
  })

  const analysis = makeAnalysis({
    title: '高峰期避开',
    category: '运动',
    kind: 'strategy',
  })

  const found = findSimilarRule(analysis, [existing])
  assert.equal(found, existing, '同名 title 且同 category → 应合并')
}

// ---------------------------------------------------------------------------
// 测试:reusability 为 watch → 始终不合并
// ---------------------------------------------------------------------------

function testWatchReusabilitySkipsMerge() {
  const existing = makeRule({
    title: '高峰期避开',
    category: '运动',
    kind: 'strategy',
    location: '健身房',
  })

  const analysis = makeAnalysis({
    title: '高峰期避开',
    category: '运动',
    kind: 'strategy',
    location: '健身房',
    reusability: 'watch',
  })

  const found = findSimilarRule(analysis, [existing])
  assert.equal(found, undefined, 'reusability=watch 的分析结果不应触发合并')
}

// ---------------------------------------------------------------------------
// 测试:I2 修复 — caution vs strategy 跨 kind 边界,即使 title 也完全一致
// ---------------------------------------------------------------------------

function testSameTitleSameCategoryDifferentKindShouldNotMerge() {
  const existing = makeRule({
    title: '周末健身房高峰',
    category: '运动',
    kind: 'strategy',
  })

  const analysis = makeAnalysis({
    title: '周末健身房高峰',
    category: '运动',
    kind: 'caution',
  })

  const found = findSimilarRule(analysis, [existing])
  assert.equal(
    found,
    undefined,
    'title+category 均相同但 kind 不同(strategy vs caution) → 不应合并,应另建规则',
  )
}

// ---------------------------------------------------------------------------
// 运行所有测试
// ---------------------------------------------------------------------------

testSameCategoryLocationDifferentKindShouldNotMerge()
testSameCategoryLocationSameKindShouldMerge()
testKindUndefinedOnRuleShouldMerge()
testKindUndefinedOnAnalysisShouldMerge()
testSameTitleDifferentCategoryShouldNotMerge()
testSameTitleSameCategoryShouldMerge()
testWatchReusabilitySkipsMerge()
testSameTitleSameCategoryDifferentKindShouldNotMerge()

console.log('findSimilarRule tests passed')
