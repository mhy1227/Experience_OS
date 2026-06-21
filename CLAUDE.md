# CLAUDE.md

本文件为 Claude Code 在本仓库工作时的指引。

## 项目是什么

**Experience OS** —— 个人经验自动结构化系统。把用户一句话的口语化观察(如"周末10点健身房人少")提炼成可复用的"经验规则",并在此基础上做**跨记录的规律发现**与**决策辅助**。定位:不是日记(记录事件),而是沉淀规律、辅助决策。

H5 原型,纯前端 + 浏览器本地存储(localStorage)。

## 技术栈

- Vue 3(`<script setup>`)+ Pinia + Vite + TypeScript + SCSS
- 无后端;数据存浏览器 `localStorage`
- 测试:纯 TS,经 `tsconfig.test.json` 编译到 `dist-tests/` 后用 `node` + `node:assert/strict` 运行(非 vitest/jest)

> 注意:`src/manifest.json`、`src/pages.json` 是 uni-app 残留**死文件**,本项目是纯 Vite(入口 `src/main.ts` 直接 `createApp(App).mount`),它们不参与构建,计划删除。

## 常用命令

```bash
npm run dev:h5          # 本地开发(Vite,默认 5173)
npm run build:h5        # 生产构建
npm run typecheck       # vue-tsc 类型检查(可加 -- --pretty false)
npm run test:evaluation # 业务回归测试(编译 + 跑各 test.js)
```

新增测试文件后,必须把它追加进 `package.json` 的 `test:evaluation` 脚本才会被执行。

## 架构分层(单向依赖)

```
types/ → services/ → stores/ → pages/(视图)
```

- `src/types/experience.ts` —— 全部类型(枚举 36+,接口 30+)
- `src/services/` —— 纯业务逻辑(可测)
  - `aiAnalyzer.ts` —— 本地关键词分析引擎(8 条硬编码规则),现作**降级兜底**
  - `analysisContract.ts` —— **AI 输出安全契约**:prompt(防注入)+ `normalizeModelAnalysis` + `enforceAnalysisContract`(方向一致性,防"幻觉成规律")+ 降级链。接真模型务必复用,勿绕过。
  - `modelAnalysisAdapter.ts` —— `ObservationModelClient` 接口(模型抽象点)
  - `modelClient.ts` —— DeepSeek/OpenAI 兼容 client(`createModelClient`)
  - `resilientAnalysis.ts` —— `analyzeObservationResilient`:模型优先,异常回退本地引擎
  - `modelConfig.ts` —— 读 localStorage 的模型配置(`getActiveModelClient`)
  - `evaluationEngine.ts` —— 评估/复测/采用门槛(1714 行,**过度工程化,正逐步降级隐藏**)
- `src/stores/experience.ts` —— Pinia 状态、持久化、队列、写入(2847 行,偏大)
- `src/pages/index/index.vue` —— H5 单页入口(3595 行,偏大;新功能尽量拆组件,勿继续堆砌)

## AI 模型接入(已落地)

- 录入提炼走 `analyzeObservationResilient(text, { client: getActiveModelClient() })`(`experience.ts` 内 `submitObservation`)。
- 配置模型:浏览器 `localStorage` key = `experience-os:model`,形如 `{ provider, apiKey, model, baseUrl }`。
- 演示默认配置:`src/main.ts` 启动时从 `VITE_DEEPSEEK_*` 环境变量注入(用户已配则不覆盖)。
- **API Key 只存浏览器本地,绝不提交、绝不上云**。本地用 `.env.local`(已 gitignore),模板见 `.env.example`。
- 任何模型输出必须经契约层校验/降级,不得直接写入规则库。

## 数据库(可选,非主存储)

- 当前主存储是 localStorage。云端 MySQL(SQLPub,共享库)仅作工具/开发用途,**未做同步**。
- 表结构:`db/schema.sql`,全部 `exp_` 前缀(与共享库内其他项目隔离)。
- MCP:项目级 `.mcp.json`(Claude)/ `.codex/config.toml`(Codex)指向该库,**含密码,均已 gitignore**。

## 约定与红线

- **敏感信息**:DB 密码、API Key、`private-doc/`、`.env.local`、`.mcp.json`、`.codex/config.toml`、`001_PRD/` 全部已 gitignore,**绝不提交**。
- **方向**:产品优先,从"记录+评估"转向"经验提炼 + 规律发现 + 决策辅助";本地优先 + 模型无关(内置演示模型 + 用户自配 Key)。
- **不重写已完成部分**,只补缺口;评估体系**降级隐藏而非删除**。
- 改大文件(store / index.vue)优先拆分,勿继续膨胀。

## 关键文档

- 需求设计:`docs/superpowers/specs/2026-06-22-requirement-restructure-design.md`
- 实施计划:`docs/superpowers/plans/`(Plan 1 已完成;执行日志 `2026-06-22-execution-log.md`)
- 私密工作副本 / ChatGPT 建议:`private-doc/`、`001_PRD/`(均不入库)
