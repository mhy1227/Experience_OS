import assert from 'node:assert/strict'
import {
  cosineDense,
  recallByEmbedding,
  type Embedder,
} from '../src/services/embeddingRecall'

// ---------------------------------------------------------------------------
// A4 端上 embedding 语义召回(可测核心)。
// 按 docs/algorithm-a4-embedding-recall-plan.md §7 测试设计。
// 用确定性 fake embedder 替身,不依赖真实模型 / transformers.js。
// ---------------------------------------------------------------------------

// fake embedder:把文本映射成确定的 4 维向量。
// 预设「语义维度」词典:命中某主题的词 → 在对应维度累加权重,
// 使「意思近」的两句(共主题、不一定共词)得到相近向量。
const TOPICS: Record<number, string[]> = {
  0: ['对齐', '同步', '沟通', '会'], // 协作主题
  1: ['返工', '延期', '加班', '赶'], // 工期主题
  2: ['人少', '清静', '空', '冷'], // 拥挤主题(少)
  3: ['人多', '排队', '拥挤', '挤'], // 拥挤主题(多)
}

const fakeEmbed = (text: string): number[] => {
  const v = [0, 0, 0, 0]
  for (const [dimStr, words] of Object.entries(TOPICS)) {
    const dim = Number(dimStr)
    for (const w of words) {
      if (text.includes(w)) v[dim] += 1
    }
  }
  return v
}

// 计数器版 embedder:验证「空 query 不调用 embedder」。
const makeCountingEmbedder = () => {
  let calls = 0
  const embedder: Embedder = {
    async embed(text: string) {
      calls += 1
      return fakeEmbed(text)
    },
  }
  return { embedder, getCalls: () => calls }
}

async function main() {
// 1. 与 query 最相近的 item 排在 top(同义不同词:无共词但同主题)。
{
  const { embedder } = makeCountingEmbedder()
  const items = [
    { id: 'crowd', text: '高峰排队拥挤' }, // 主题3,与 query 无共词但同主题
    { id: 'work', text: '项目返工延期' }, // 主题1,无关
    { id: 'collab', text: '团队开会沟通' }, // 主题0,无关
  ]
  const out = await recallByEmbedding('今天人多挤', items, embedder)
  assert.equal(out[0].id, 'crowd', `语义最近应排 top,实际 ${JSON.stringify(out)}`)
  assert.ok(out[0].score > 0, '最近项余弦应 > 0')
}

// 2. 空 items → []。
{
  const { embedder } = makeCountingEmbedder()
  assert.deepEqual(await recallByEmbedding('随便', [], embedder), [])
}

// 3. 空 query → [] 且不调用 embedder(计数器验证);纯空白同样不调用。
{
  const { embedder, getCalls } = makeCountingEmbedder()
  const items = [{ id: 'a', text: '对齐会' }]
  assert.deepEqual(await recallByEmbedding('', items, embedder), [])
  assert.deepEqual(await recallByEmbedding('   ', items, embedder), [])
  assert.equal(getCalls(), 0, '空 query 不应调用 embedder')
}

// 4. topK 生效(限制返回条数)。
{
  const { embedder } = makeCountingEmbedder()
  const items = [
    { id: 'a', text: '人多排队拥挤' },
    { id: 'b', text: '到处都挤' },
    { id: 'c', text: '返工延期' },
    { id: 'd', text: '开会沟通' },
  ]
  const out = await recallByEmbedding('人多挤', items, embedder, 2)
  assert.equal(out.length, 2, `topK=2 应只返回 2 条,实际 ${out.length}`)
  // 默认 topK=5,但 items 只有 4 条 → 返回 4 条。
  const all = await recallByEmbedding('人多挤', items, embedder)
  assert.equal(all.length, 4, '默认 topK 不应超过 items 数')
}

// 5. cosineDense:相同向量≈1、正交=0、空=0。
{
  assert.ok(Math.abs(cosineDense([1, 2, 3], [1, 2, 3]) - 1) < 1e-9, '相同向量应 ≈ 1')
  assert.equal(cosineDense([1, 0], [0, 1]), 0, '正交向量应 = 0')
  assert.equal(cosineDense([], []), 0, '空向量应 = 0')
  assert.equal(cosineDense([0, 0, 0], [1, 2, 3]), 0, '零向量应 = 0')
}

  console.log('embeddingRecall tests passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
