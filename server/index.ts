// 本地常驻入口(@hono/node-server)。app 本体见 server/app.ts(与 Vercel 入口共用)。
// 运行:npm run dev:server(读 .env.local 的 VITE_DEEPSEEK_* 或 DEEPSEEK_*)
import { serve } from '@hono/node-server'
import app, { apiKey } from './app'

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port })
console.log(`[experience-os] model proxy listening on http://localhost:${port}  (key:${apiKey ? 'set' : 'MISSING'})`)
