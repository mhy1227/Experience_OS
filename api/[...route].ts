// Vercel serverless 入口(catch-all):/api/* 全部导到这里,复用 server/app.ts 的 Hono app。
// 单括号 catch-all 是 Vercel 函数原生支持的写法(双括号是 Next.js 约定,纯 /api 不认)。
// 环境变量在 Vercel 控制台配置(DEEPSEEK_API_KEY / _BASE_URL / _MODEL / MAX_ITEMS),
// 绝不写进代码、绝不提交。本地常驻入口另见 server/index.ts。
import { handle } from 'hono/vercel'
import app from '../server/app'

export default handle(app)
