// 共享的 Hono app(B1 模型代理):服务端持 Key、转发模型、复用契约层。
// 不做 DB / 鉴权 / 向量 / 同步。被两个入口复用:
//   - server/index.ts  本地常驻(@hono/node-server)
//   - api/index.ts     Vercel serverless 函数
// 数量上限 MAX_ITEMS 由环境变量控制:Vercel 免费版函数超时(≤60s)下设小一点
// (如 3),避免 N 条串行提炼被掐断;本地默认 100。

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createModelClient, type ModelProvider } from '../src/services/modelClient'
import { analyzeBatch } from '../src/services/batchAnalysis'

const env = process.env
const apiKey = env.DEEPSEEK_API_KEY ?? env.VITE_DEEPSEEK_API_KEY ?? ''
const model = env.DEEPSEEK_MODEL ?? env.VITE_DEEPSEEK_MODEL ?? 'deepseek-chat'
const baseUrl = env.DEEPSEEK_BASE_URL ?? env.VITE_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
const provider = (env.MODEL_PROVIDER ?? 'deepseek') as ModelProvider
const MAX_ITEMS = Math.max(1, Number(env.MAX_ITEMS ?? 100))

export { apiKey, model, MAX_ITEMS }

const app = new Hono()
app.use('/api/*', cors())

const health = (c: import('hono').Context) =>
  c.json({ ok: true, hasKey: Boolean(apiKey), model, maxItems: MAX_ITEMS })
app.get('/health', health) // 本地常驻用
app.get('/api/health', health) // Vercel catch-all(/api/*)用

// 单条:{ text } → { result }
app.post('/api/analyze', async (c) => {
  if (!apiKey) return c.json({ error: 'server model key not configured' }, 500)
  const body = await c.req.json().catch(() => null)
  const text = body?.text
  if (typeof text !== 'string') return c.json({ error: 'text must be string' }, 400)
  const client = createModelClient({ provider, apiKey, model, baseUrl })
  const [result] = await analyzeBatch([text], client)
  return c.json({ result: result ?? null })
})

// 批量:{ texts: string[] } → { results, truncated }
app.post('/api/analyze-batch', async (c) => {
  if (!apiKey) return c.json({ error: 'server model key not configured' }, 500)
  const body = await c.req.json().catch(() => null)
  const texts = body?.texts
  if (!Array.isArray(texts)) return c.json({ error: 'texts must be string[]' }, 400)
  const client = createModelClient({ provider, apiKey, model, baseUrl })
  const results = await analyzeBatch(texts.slice(0, MAX_ITEMS), client)
  return c.json({ results, truncated: texts.length > MAX_ITEMS, maxItems: MAX_ITEMS })
})

export default app
