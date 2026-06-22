// Vercel serverless 入口(catch-all):/api/* 全部导到这里,复用 server/app.ts 的 Hono app。
// 环境变量在 Vercel 控制台配置(DEEPSEEK_API_KEY / _BASE_URL / _MODEL / MAX_ITEMS),
// 绝不写进代码、绝不提交。本地常驻入口另见 server/index.ts。
import { handle } from 'hono/vercel'
import app from '../server/app'

export default handle(app)
