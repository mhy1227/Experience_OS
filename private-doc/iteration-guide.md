# 迭代参考清单 —— Experience OS

> 本地私有备忘(private-doc/,不入库)。每次开工前先扫一眼这里 + `CLAUDE.md` + `docs/version-roadmap.md` + `MEMORY.md`。
> 最后更新:2026-06-25

---

## 0. 一句话

**`CLAUDE.md`(怎么做) + `docs/version-roadmap.md`(做什么的顺序) + `MEMORY.md` 索引的记忆(踩过的坑)** —— 这三处是每次开工前必看。本文件是它们的"导航 + 当前状态"。

---

## 1. 定方向 / 判断该不该做

- **`docs/version-roadmap.md`** —— 版本主线与已推迟项(V5 = 飞书,已调研推迟;向量检索推迟)。判优先级先看这。
- **`CLAUDE.md` 的"方向"段 + 记忆 `product-right-half-loop`** —— 护城河是 `观察 → AI 提炼 → 规律发现 → 决策召回`。
- **判定红线**:任何新需求/功能先问"在不在这条链上";不在的(典型:AI 生图)就是维生素,往后排。
  - 配套铁律:**一张图 / 一个功能必须揭示文字给不了的价值,否则不做**(已写进 `docs/superpowers/specs/2026-06-25-v6-experience-visualization-design.md` §9)。

## 2. 走新功能流程(本仓库既定节奏,别跳过设计)

`brainstorming` skill → spec(`docs/superpowers/specs/`)→ `writing-plans` skill → 计划(`docs/superpowers/plans/`)→ 实现 → typecheck + test → push。

- 样板 spec:
  - `2026-06-22-requirement-restructure-design.md`(需求重构,Plan 1 已完成)
  - `2026-06-25-categories-and-tags-design.md`(含"落地补充"追记写法,值得照抄结构)
  - `2026-06-25-v6-experience-visualization-design.md`(含"决策记录 + 暂缓 + 替代方向 + UML"写法)

## 3. 写代码的约定 / 红线(`CLAUDE.md`)

- 分层 `types → services → stores → pages` 单向依赖;**改大文件(store 2800+ 行 / index.vue 3500+ 行)优先拆组件,别继续膨胀**。
- **模型输出必经契约层**(`src/services/analysisContract.ts` 的 `enforceAnalysisContract` / `normalizeModelAnalysis`),不得直接写规则库。
- **送模型前先脱敏**:复用 `src/services/privacyFilter`(记忆 `a6-privacy-redaction`),别另造轮子。
- 评估体系(`evaluationEngine.ts`,过度工程化)**降级隐藏而非删除**。
- **不重写已完成部分,只补缺口。**
- 敏感信息(API Key、DB 密码、`private-doc/`、`.env.local`、`.mcp.json`、`.codex/config.toml`、`001_PRD/`)**全部 gitignore,绝不提交**。

## 4. UI

- **记忆 `ui-precision-instrument`** + `src/pages/index/styles.scss` 顶部 design tokens —— "精密仪表"风:trust-chip、等宽数字、克制。
- 别回到"九徽章 + 花哨配图";新功能尽量拆组件,勿堆进 index.vue。

## 5. 测试 / 上线

- **测试**:`tsconfig.test.json` 编译到 `dist-tests/` → `node` + `node:assert/strict` 跑(非 vitest/jest)。
  - 新测试文件**必须追加进 `package.json` 的 `test:evaluation`** 才会被执行。
  - 每个文件以 `console.log('xxx tests passed')` 收尾;顶层 `await` 不允许,包进 async IIFE。
  - 命令:`npm run typecheck`、`npm run test:evaluation`。
- **上线**:记忆 `vercel-deploy-setup` —— `git push origin master:main` 触发部署(本地分支 master,生产 main)。
  - 改了 `server/` / `src` 注意 `/api` 是已提交的 esbuild bundle,需 `npm run build:api` 重建。
  - push 偶发 TLS 握手失败,重试即可。
- **中转的坑**:记忆 `packyapi-region-quality` —— Vercel 美区出降质/不稳,**不是代码 bug**,排查前先想到它。

## 6. 当前排期(已锁,见 V6 doc §9.2)

> **P2 反例改写规则边界 ≈ P3 UX 简化 > P4 演示数据 > (可选)规律趋势迷你图 ≫ AI 生图(暂缓)**

- **P2 反例改写规则边界** —— 规则反复打脸时,引擎已生成 `revisionSuggestion`/`revisionDraft`(决策点已浮出,见本会话补强);下一步是让"采用修订"真正收窄条件的链路更完整。
- **P3 简化真实用户体验**、**P4 完善演示数据**(可往上班族 + 学习成长/理财 倾斜)。
- **规律趋势信息图(ECharts,零 API)** —— 想要视觉亮点走这条:数据现成(`Law` 复发数 + `computeTrend` 的 MK 趋势),图见 `private-doc/diagrams/v6-regularity-dataflow.puml`。判定:只画"揭示跨记录模式"的信息图,不画装饰场景图。
- **AI 生图 = 暂缓(parked)**。重启条件:产品验证 PMF 后、或用户主动提需求;届时 V6 doc §1–§8 技术设计(IndexedDB 分层 / 可插拔渠道 / privacyFilter 脱敏)直接复用。

## 7. 本会话已落地(避免重复造)

- 用户标签(`rule.tags` + TagEditor + 规则库筛选 + 自动补全 + AI facet 预填);commit `600b6e2`。
- 新增分类 `学习成长` / `理财`(纯增、零迁移);commit `f8b7521`。
- 决策→验证→进化闭环**确认早已存在**,补"进化指引浮到决策点 + 采用修订";commit `ab44978`。
- V6 经验可视化文档:版本 V5→V6、AI 生图暂缓、替代方向 = 规律趋势可视化 + 两张 PlantUML(`docs/.../diagrams/`,副本在 `private-doc/diagrams/`)。**该文档目前未入库。**

---

## 关键文件速查

| 用途 | 路径 |
|---|---|
| 项目指引 / 红线 | `CLAUDE.md` |
| 版本顺序 | `docs/version-roadmap.md` |
| 记忆索引 | `~/.claude/.../memory/MEMORY.md` |
| 类型总表 | `src/types/experience.ts` |
| AI 契约层 | `src/services/analysisContract.ts` |
| 脱敏 | `src/services/privacyFilter.ts` |
| 评估引擎 | `src/services/evaluationEngine.ts`(降级隐藏中) |
| 主 store | `src/stores/experience.ts` |
| 单页入口 | `src/pages/index/index.vue` |
| 找经验/决策 UI | `src/pages/index/components/InputModule.vue` |
| 设计文档 | `docs/superpowers/specs/` |
| 实施计划 + 执行日志 | `docs/superpowers/plans/` |
