import assert from 'node:assert/strict'
import { parseMarkdownToObservations } from '../src/services/markdownImport'

async function testListItems() {
  const r = await parseMarkdownToObservations('- 开会前先对齐目标\n- 关键决策人必须到场')
  assert.deepEqual(r.observations, ['开会前先对齐目标', '关键决策人必须到场'])
}

async function testParagraphsAndHeadingSkippedByDefault() {
  const r = await parseMarkdownToObservations('# 标题\n\n第一段内容比较长。\n\n第二段也是内容。')
  assert.deepEqual(r.observations, ['第一段内容比较长。', '第二段也是内容。'])
}

async function testHeadingAsContextPrefix() {
  const r = await parseMarkdownToObservations('# 会议\n\n讨论目标对齐问题', { headingAsContext: true })
  assert.equal(r.observations[0], '会议 — 讨论目标对齐问题')
}

async function testTableTakesLongestCellAndSkipsHeader() {
  const md = '| 日期 | 原文 |\n| --- | --- |\n| 6/22 | 需求中途改方向导致返工 |'
  const r = await parseMarkdownToObservations(md)
  assert.deepEqual(r.observations, ['需求中途改方向导致返工'])
}

async function testStripsInlineAndSkipsCodeAndFrontMatter() {
  const md = '---\ntitle: x\n---\n\n**加粗**的经验项目内容\n\n```\ncode here\n```'
  const r = await parseMarkdownToObservations(md)
  assert.deepEqual(r.observations, ['加粗的经验项目内容'])
}

async function testDedupeMinLengthAndCap() {
  const r = await parseMarkdownToObservations('- 同样的一条\n- 同样的一条\n- ab\n- 有效的另一条经验', { maxItems: 1 })
  assert.equal(r.totalParsed, 2, '去重后 2 条(短条 ab 被过滤)')
  assert.equal(r.observations.length, 1, '受 maxItems=1 截断')
  assert.equal(r.truncated, true)
}

async function run() {
  await testListItems()
  await testParagraphsAndHeadingSkippedByDefault()
  await testHeadingAsContextPrefix()
  await testTableTakesLongestCellAndSkipsHeader()
  await testStripsInlineAndSkipsCodeAndFrontMatter()
  await testDedupeMinLengthAndCap()
  console.log('markdownImport tests passed')
}

void run()
