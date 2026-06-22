// Vercel 函数入口的「源」。经 esbuild 预打包成自包含的 api/[...route].js(见 build:api)。
//
// 为什么不用 hono/vercel 的 handle:它返回 Web Response,是给 Edge 运行时用的;
// Vercel 默认是 Node 运行时,按 (req,res) 调用,返回 Response 不写 res 会 504 超时。
// 用 @hono/node-server 的 getRequestListener 把 app.fetch 转成 Node (req,res) 监听器,
// Node 运行时才能正确返回(且 Node 运行时支持 maxDuration 60s,够批量串行提炼)。
import { getRequestListener } from '@hono/node-server'
import app from './app'

export default getRequestListener(app.fetch)
