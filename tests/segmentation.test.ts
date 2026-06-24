import assert from 'node:assert/strict'
import { segment, segmentByDict, segmentByHMM, trainHMM, BUILTIN_DICT } from '../src/services/segmentation'

// ---------------------------------------------------------------------------
// A1 中文分词(HMM + Viterbi)。按 docs/algorithm-a1-segmentation-plan.md §7。
// 概率表由内置小语料训练(option B/C);未登录走平滑 + 词典/按字降级。
// ---------------------------------------------------------------------------

const join = (xs: string[]) => xs.join('')

// 1. 基本切分:多字词不被拆成单字
{
  const out = segment('周末十点健身房人少')
  assert.ok(out.includes('健身房'), `健身房应成词,实际 ${JSON.stringify(out)}`)
  assert.ok(out.includes('周末'), '周末应成词')
  assert.equal(join(out), '周末十点健身房人少', '不应丢字')
}

// 2. 歧义:研究/生命 而非 研究生/命
{
  const out = segment('研究生命的起源')
  assert.equal(join(out), '研究生命的起源')
  assert.ok(out.includes('生命'), `应切出"生命",实际 ${JSON.stringify(out)}`)
}

// 3. 未登录词:不崩、不丢字、非空
{
  const out = segment('魑魅魍魉出没山林')
  assert.ok(out.length > 0)
  assert.equal(join(out), '魑魅魍魉出没山林')
}

// 4. 英文/数字旁路:整体成 token
{
  const out = segment('开 PR review 会')
  assert.ok(out.includes('PR'), `PR 应整体保留,实际 ${JSON.stringify(out)}`)
  assert.ok(out.includes('review'), 'review 应整体保留')
}

// 5. 标点 / 空串 → []
{
  assert.deepEqual(segment(''), [])
  assert.deepEqual(segment('。。。!!!,,'), [])
}

// 6. 对数无下溢:长文本(>500 字)结果有限、非空、不丢字
{
  const long = '周末十点健身房人少不用排队'.repeat(40) // 520 字
  const out = segment(long)
  assert.ok(out.length > 0)
  assert.equal(join(out), long, '长文本不应丢字')
}

// 7. 降级:词典最大匹配可用;空概率表的 HMM 不崩
{
  const dictOut = segmentByDict('周末健身房人少', BUILTIN_DICT)
  assert.equal(join(dictOut), '周末健身房人少')
  assert.ok(dictOut.includes('健身房'))
  // 空概率表 → segmentByHMM 不应抛错(走平滑,可能退化为按字)
  const empty = trainHMM([])
  const hmmOut = segmentByHMM('健身房', empty)
  assert.equal(join(hmmOut), '健身房', '空表也不应丢字/抛错')
}

// 8. 召回价值(对照按字):单词成整体而非逐字
{
  assert.deepEqual(segment('健身房'), ['健身房'], '应为一个词,而非 健/身/房')
}

console.log('segmentation tests passed')
