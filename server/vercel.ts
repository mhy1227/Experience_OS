// Vercel 函数入口的「源」。注意:不要放在 /api 下——Vercel 会逐文件转译 /api 里的 .ts,
// 而它对 /api 外部的相对 import 只做文件追踪、不内联,ESM 下又缺 .js 扩展名会运行时报
// ERR_MODULE_NOT_FOUND。所以这里用 esbuild 预打包成单一自包含文件 api/[...route].js
// (见 package.json 的 build:api),把 hono + server/app + src 链全部内联,Vercel 直接跑。
import { handle } from 'hono/vercel'
import app from './app'

export default handle(app)
