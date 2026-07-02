// Vercel 函数入口的「源」。经 esbuild 预打包成自包含的 api/[...route].js(见 build:api)。
//
// 为什么不用 hono/vercel 的 handle:它返回 Web Response,是给 Edge 运行时用的;
// Vercel 默认是 Node 运行时,按 (req,res) 调用,返回 Response 不写 res 会 504 超时。
// 用 @hono/node-server 的 getRequestListener 把 app.fetch 转成 Node (req,res) 监听器,
// Node 运行时才能正确返回(且 Node 运行时支持 maxDuration 60s,够批量串行提炼)。
import { getRequestListener } from '@hono/node-server'
import app from './app'

const vercelApp = new (require('hono').Hono)()

vercelApp.all('/*', async (c) => {
  const pathname = c.req.path
  const query = c.req.query()
  const queryString = Object.keys(query)
    .filter(k => query[k] !== undefined)
    .map(k => {
      const v = query[k]
      return Array.isArray(v) ? v.map(x => `${k}=${encodeURIComponent(x)}`).join('&') : `${k}=${encodeURIComponent(v)}`
    })
    .join('&')
  
  const url = queryString 
    ? `http://localhost/api${pathname}?${queryString}`
    : `http://localhost/api${pathname}`
  
  return app.fetch(new Request(url, {
    method: c.req.method,
    headers: c.req.headers,
    body: c.req.body,
  }))
})

export default getRequestListener(vercelApp.fetch)
