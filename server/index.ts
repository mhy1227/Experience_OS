// 最简模型代理(B1):服务端持 Key、转发模型、复用契约层。
// 不做 DB / 鉴权 / 向量 / 同步。前端可选用它,不用也能独立跑(BYO-key 直连)。
// 运行:npm run dev:server(读 .env.local 的 VITE_DEEPSEEK_* 或 DEEPSEEK_*)

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createModelClient, type ModelProvider } from '../src/services/modelClient'
import { analyzeBatch } from '../src/services/batchAnalysis'

const env = process.env
const apiKey = env.DEEPSEEK_API_KEY ?? env.VITE_DEEPSEEK_API_KEY ?? ''
const model = env.DEEPSEEK_MODEL ?? env.VITE_DEEPSEEK_MODEL ?? 'deepseek-chat'
const baseUrl = env.DEEPSEEK_BASE_URL ?? env.VITE_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
const provider = (env.MODEL_PROVIDER ?? 'deepseek') as ModelProvider
const MAX_ITEMS = 100
const port = Number(env.PORT ?? 8787)

const app = new Hono()
app.use('/api/*', cors())

app.get('/health', (c) => c.json({ ok: true, hasKey: Boolean(apiKey), model }))

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
  return c.json({ results, truncated: texts.length > MAX_ITEMS })
})

serve({ fetch: app.fetch, port })
console.log(`[experience-os] model proxy listening on http://localhost:${port}  (key:${apiKey ? 'set' : 'MISSING'})`)
