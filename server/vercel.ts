// Vercel 函数入口的「源」。经 esbuild 预打包成自包含的 api/[...route].js(见 build:api)。
//
// 为什么不用 hono/vercel 的 handle:它返回 Web Response,是给 Edge 运行时用的;
// Vercel 默认是 Node 运行时,按 (req,res) 调用,返回 Response 不写 res 会 504 超时。
// 用 @hono/node-server 的 getRequestListener 把 app.fetch 转成 Node (req,res) 监听器,
// Node 运行时才能正确返回(且 Node 运行时支持 maxDuration 60s,够批量串行提炼)。
import { getRequestListener } from '@hono/node-server'
import app from './app'

function buildQuery(query: Record<string, string | string[] | undefined>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`)
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    }
  }
  return parts.join('&')
}

const vercelApp = new (require('hono').Hono)()

vercelApp.all('/health', async (c) => {
  return app.fetch(new Request('http://localhost/api/health', { method: 'GET', headers: c.req.headers }))
})

vercelApp.all('/feishu/tables', async (c) => {
  const query = buildQuery(c.req.query())
  const url = query ? `http://localhost/api/feishu/tables?${query}` : 'http://localhost/api/feishu/tables'
  return app.fetch(new Request(url, { method: 'GET', headers: c.req.headers }))
})

vercelApp.all('/feishu/fields', async (c) => {
  const query = buildQuery(c.req.query())
  const url = query ? `http://localhost/api/feishu/fields?${query}` : 'http://localhost/api/feishu/fields'
  return app.fetch(new Request(url, { method: 'GET', headers: c.req.headers }))
})

vercelApp.all('/feishu/records', async (c) => {
  const query = buildQuery(c.req.query())
  const url = query ? `http://localhost/api/feishu/records?${query}` : 'http://localhost/api/feishu/records'
  return app.fetch(new Request(url, { method: 'GET', headers: c.req.headers }))
})

vercelApp.all('/analyze', async (c) => {
  const body = await c.req.text()
  return app.fetch(new Request('http://localhost/api/analyze', { method: 'POST', headers: c.req.headers, body }))
})

vercelApp.all('/analyze-batch', async (c) => {
  const body = await c.req.text()
  return app.fetch(new Request('http://localhost/api/analyze-batch', { method: 'POST', headers: c.req.headers, body }))
})

export default getRequestListener(vercelApp.fetch)
