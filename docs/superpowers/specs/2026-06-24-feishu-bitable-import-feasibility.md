# 飞书多维表格 → 本地导入 · 可行性调研报告

> 状态:🔬 调研(不实现)。按用户要求"先只调研"。结论:**可行,中等工作量,且不破"本地优先"红线**(单向入站导入,经服务端代理)。
> 日期:2026-06-24
> 关联:`docs/version-roadmap.md`(V5 采集层)、现有导入管线 `src/services/markdownImport.ts` + `src/services/batchAnalysis.ts`、`server/`(hono)、`db/schema.sql`

## 1. 目标(本次调研范围)

把**飞书多维表格(Bitable)**里的记录**拉取到本地**,经现有"批量导入 → 提炼"管线变成经验规则。**单向(飞书 → 本地)**;双向同步/上云**不在范围**。

定位:飞书是**采集层入口**(roadmap 原话"是入口,不是产品"),不是把本地经验库变成多人云平台 —— 所以**不需要账号/RBAC/多用户**,仍是单用户本地。

## 2. 飞书侧机制(已核实)

**鉴权(企业自建应用):**
- 用 `app_id` + `app_secret` 换 `tenant_access_token`:
  `POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal`,JSON body `{"app_id":"…","app_secret":"…"}`。
- token **有效期 2 小时**;失效前 30 分钟可刷新(新旧并存)。
- `app_secret` 是**服务端机密**,绝不能进浏览器(泄露 + CORS)。

**读多维表格记录:**
- `GET https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records`
- Header:`Authorization: Bearer <tenant_access_token>`
- 分页:`page_size`(≤ 500)+ `page_token`(翻页游标)。
- 返回:`{ items: [{ record_id, fields: { 字段名: 值 } }], page_token, has_more }`。
- `app_token` / `table_id` 来自多维表格分享链接(形如 `…/base/<app_token>?table=<table_id>`)。

**权限/前提:**
- 在飞书开放平台建**企业自建应用**,申请 `bitable:app:read`(读)权限。
- 目标多维表格需对该应用**可见**(把应用加为文档协作者 / 在应用可访问范围内)。
- 批量写单次 ≤ 500(本期只读,不涉及)。

来源见文末。

## 3. 映射到本项目的架构

```
飞书 Bitable
   │  (app_secret 仅在服务端)
   ▼
hono server 新增 /api/feishu/records
   - 用 env 里的 app_id/app_secret 换 tenant_access_token(进程内缓存 ~2h)
   - 代理 GET bitable records(分页拉全)
   - 返回规范化后的 { rows: [{ recordId, text, createdAt? }] }
   │  (浏览器只拿到记录文本,拿不到 secret)
   ▼
前端「飞书导入」面板
   - 填:多维表格分享链接(解析出 app_token+table_id)+ 选"哪一列当观察文本"
   - 点「拉取」→ 调 /api/feishu/records → 得到 rows
   ▼
复用现有管线:rows.map(text) → parseMarkdownToObservations / analyzeBatch → 提炼 → localStorage
```

**关键点:**
- **本地优先不破**:最终数据落 localStorage;服务端只做"取数 + 换 token"的无状态代理,不存用户经验数据。这是**入站导入**,不是把本地数据上云。
- **复用导入管线**:`parseMarkdownToObservations` + `analyzeBatch` 已能把"一坨文本"变经验,飞书 rows 只需转成文本喂进去。
- **凭证管理(红线)**:`FEISHU_APP_ID` / `FEISHU_APP_SECRET` 存 `.env.local`(已 gitignore)+ Vercel 环境变量;补 `.env.example` 模板;**绝不提交**。与现有 `VITE_DEEPSEEK_*` 同套做法。

## 4. 需要改动的东西(若将来实现)

| 模块 | 改动 | 量 |
|------|------|----|
| `server/`(hono)| 新增 `/api/feishu/records`:换 token(缓存)+ 代理读记录 + 字段规范化 | 中 |
| 凭证 | `.env.local` + `.env.example` + Vercel env;**注意 `/api` 是 committed esbuild bundle,改 server 后要 `npm run build:api` 重新打包**(见记忆 `vercel-deploy-setup`) | 小 |
| 前端面板 | 「飞书导入」:链接输入 + 字段选择 + 拉取按钮 + 进度;接现有 `analyzeBatch` | 中 |
| 字段映射 | 纯函数:bitable `fields` → 观察文本(先只支持文本/数字/日期类字段;人员/附件/关联等复杂类型跳过或转字符串)| 小 |
| 测试 | 字段规范化纯函数单测 + 代理路由的 mock 测试 | 小 |

**工作量估:约 1–2 个工作日**(不含你在飞书侧建应用 + 授权表格的 ~30 分钟)。

## 5. 风险与坑

- **Vercel serverless 冷启动**:进程内 token 缓存跨冷启动会丢 → 每次冷启动重新换 token(便宜,可接受);或每请求换一次。
- **字段类型复杂**:bitable 单元格值可能是数组/对象(多选、人员、附件、公式)→ 规范化要兜底,首版只稳妥支持文本类。
- **权限/可见性配置**:用户必须把自建应用加到目标多维表格,否则 403;需在 UI 给清晰报错指引。
- **频率限制**:大表分页拉取注意飞书 API 限频;首版限"拉前 N 条 / 单表"。
- **数据隐私**:记录会流经我们服务端(US/Vercel)再回本地。**不持久化到服务端**,但传输路径上经过 → 文档需说明;若敏感,后续可考虑本地代理。
- **`open.feishu.cn` 海外可达性**:Vercel US 区访问飞书国内域名可能慢/不稳;海外版用 `open.larksuite.com`。需按部署区域确认。

## 6. 建议的最小可行切片(若做)

不要一上来做全:
1. **单表、单字段、手动拉取**:填一个多维表格链接 + 选一列文本 + 点「拉取」→ 进现有批量导入预览 → 确认提炼。
2. 不做:自动定时同步、增量去重、多表、写回飞书、机器人推送(这些都是后续)。

这样既验证了通路(建应用 → 换 token → 读表 → 入库),又控制在 1–2 天、不破红线。

## 7. 结论

- **技术上可行**,飞书 OpenAPI 成熟、读记录简单;鉴权/RBAC 不是难点(且本期不需要自建账号体系)。
- **真正成本**在:① 服务端代理 + 凭证管理;② 字段映射 UX;③ 飞书侧应用与授权配置。
- **不破"本地优先"**:单向入站,数据落本地,服务端只代理取数。
- **是否做、何时做**由你定。本报告只调研,未写任何功能代码。

## 来源

- [Get custom app tenant_access_token — 飞书开放平台](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal)
- [多维表格 Server API / 列出记录与常见问题 — 飞书开放平台](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/faq?lang=zh-CN)
- [接入指南 — 飞书 API(apifox 镜像)](https://feishu.apifox.cn/doc-436427)
- [5 分钟集成飞书多维表格 API — 知乎](https://zhuanlan.zhihu.com/p/1962509957896311374)
- [bitable-sdk(社区 SDK,印证应用身份/tenant_access_token 用法)— GitHub](https://github.com/ag9920/bitable-sdk)
