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

const feishuAppId = env.FEISHU_APP_ID ?? ''
const feishuAppSecret = env.FEISHU_APP_SECRET ?? ''
let feishuToken: string = ''
let feishuTokenExpireAt = 0

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

async function getFeishuToken(): Promise<string> {
  if (!feishuAppId || !feishuAppSecret) throw new Error('feishu credentials not configured')
  if (Date.now() < feishuTokenExpireAt - 60000 && feishuToken) return feishuToken
  const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: feishuAppId, app_secret: feishuAppSecret }),
  })
  const json = await resp.json()
  if (json.code !== 0) throw new Error(`feishu token error: ${json.msg}`)
  feishuToken = json.tenant_access_token
  feishuTokenExpireAt = Date.now() + json.expire * 1000
  return feishuToken
}

interface FeishuRecord {
  record_id: string
  fields: Record<string, unknown>
}

function normalizeFieldValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    return value.map(v => normalizeFieldValue(v)).join('; ')
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

app.get('/api/feishu/tables', async (c) => {
  if (!feishuAppId || !feishuAppSecret) return c.json({ error: 'feishu credentials not configured' }, 500)
  try {
    const token = await getFeishuToken()
    const { app_token } = c.req.query()
    if (typeof app_token !== 'string') return c.json({ error: 'app_token required' }, 400)
    const resp = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${app_token}/tables`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await resp.json()
    if (json.code !== 0) return c.json({ error: json.msg }, 500)
    const tables = json.data?.items?.map((t: { table_id: string; name: string }) => ({
      table_id: t.table_id,
      name: t.name,
    })) ?? []
    return c.json({ tables })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

app.get('/api/feishu/fields', async (c) => {
  if (!feishuAppId || !feishuAppSecret) return c.json({ error: 'feishu credentials not configured' }, 500)
  try {
    const token = await getFeishuToken()
    const { app_token, table_id } = c.req.query()
    if (typeof app_token !== 'string') return c.json({ error: 'app_token required' }, 400)
    if (typeof table_id !== 'string') return c.json({ error: 'table_id required' }, 400)
    const resp = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/fields`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await resp.json()
    if (json.code !== 0) return c.json({ error: json.msg }, 500)
    const fields = json.data?.items?.map((f: { field_name: string; type: string }) => ({
      field_name: f.field_name,
      type: f.type,
    })) ?? []
    return c.json({ fields })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

app.get('/api/feishu/records', async (c) => {
  if (!feishuAppId || !feishuAppSecret) return c.json({ error: 'feishu credentials not configured' }, 500)
  try {
    const token = await getFeishuToken()
    const { app_token, table_id, field_name } = c.req.query()
    if (typeof app_token !== 'string') return c.json({ error: 'app_token required' }, 400)
    if (typeof table_id !== 'string') return c.json({ error: 'table_id required' }, 400)
    if (typeof field_name !== 'string') return c.json({ error: 'field_name required' }, 400)
    const rows: { recordId: string; text: string }[] = []
    let page_token = ''
    do {
      const resp = await fetch(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/records?page_size=500${page_token ? `&page_token=${page_token}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const json = await resp.json()
      if (json.code !== 0) return c.json({ error: json.msg }, 500)
      const records: FeishuRecord[] = json.data?.items ?? []
      for (const record of records) {
        const text = normalizeFieldValue(record.fields[field_name])
        if (text.trim()) {
          rows.push({ recordId: record.record_id, text: text.trim() })
        }
      }
      page_token = json.data?.page_token ?? ''
    } while (page_token && rows.length < 500)
    return c.json({ rows })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

export default app
