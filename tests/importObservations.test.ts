import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// 独立于 Vue/Pinia:仅测试拆行逻辑与 sentiment 映射
// ---------------------------------------------------------------------------

// 拆行工具(复制 store 中同款逻辑,便于隔离测试)
function splitLines(rawText: string): string[] {
  return rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

// sentiment 映射(复制 store 中 mapSentiment 逻辑)
type ObservationDirection = 'positive' | 'negative' | 'mixed' | 'uncertain'
type ObservationSentiment = 'positive' | 'neutral' | 'negative'

function mapSentiment(direction: ObservationDirection): ObservationSentiment {
  if (direction === 'positive') return 'positive'
  if (direction === 'negative') return 'negative'
  return 'neutral'
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testSplitLinesFiltersEmpty() {
  const raw = '\n  \n第一条观察\n\n第二条观察\n  \n'
  const lines = splitLines(raw)
  assert.equal(lines.length, 2)
  assert.equal(lines[0], '第一条观察')
  assert.equal(lines[1], '第二条观察')
}

function testSplitLinesSingleLine() {
  const lines = splitLines('周末健身房人少')
  assert.equal(lines.length, 1)
  assert.equal(lines[0], '周末健身房人少')
}

function testSplitLinesAllEmpty() {
  const lines = splitLines('  \n  \n  ')
  assert.equal(lines.length, 0)
}

function testMapSentimentPositive() {
  assert.equal(mapSentiment('positive'), 'positive')
}

function testMapSentimentNegative() {
  assert.equal(mapSentiment('negative'), 'negative')
}

function testMapSentimentMixed() {
  assert.equal(mapSentiment('mixed'), 'neutral')
}

function testMapSentimentUncertain() {
  assert.equal(mapSentiment('uncertain'), 'neutral')
}

async function run() {
  testSplitLinesFiltersEmpty()
  testSplitLinesSingleLine()
  testSplitLinesAllEmpty()
  testMapSentimentPositive()
  testMapSentimentNegative()
  testMapSentimentMixed()
  testMapSentimentUncertain()
  console.log('importObservations tests passed')
}

void run()
