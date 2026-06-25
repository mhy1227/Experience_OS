# 迭代指南 —— Experience OS

> 开工前先扫这一份:它是 `CLAUDE.md`、`docs/version-roadmap.md` 与项目记忆的"导航 + 当前状态"。
> 最后更新:2026-06-25

---

## 1. 定方向 / 判断该不该做

- **`docs/version-roadmap.md`** —— 版本主线与已推迟项(V5 = 飞书,已调研推迟;向量检索推迟)。判优先级先看这。
- **`CLAUDE.md` 的"方向"段** —— 护城河是 `观察 → AI 提炼 → 规律发现 → 决策召回`。
- **判定红线**:任何新需求/功能先问"在不在这条链上";不在的(典型:AI 生图)是体验增强(维生素),往后排。
  - 配套铁律:**一个功能/一张图必须提供文字给不了的价值,否则不做**(见 `docs/superpowers/specs/2026-06-25-v6-experience-visualization-design.md` §9)。

## 2. 新功能流程(既定节奏,别跳过设计)

`brainstorming` → spec(`docs/superpowers/specs/`)→ `writing-plans` → 计划(`docs/superpowers/plans/`)→ 实现 → typecheck + test → 上线。

样板 spec:
- `2026-06-22-requirement-restructure-design.md`(需求重构,Plan 1 已完成)
- `2026-06-25-categories-and-tags-design.md`(含"落地补充"追记结构)
- `2026-06-25-v6-experience-visualization-design.md`(含"决策记录 + 暂缓 + 替代方向 + UML"写法)

## 3. 代码约定 / 红线(`CLAUDE.md`)

- 分层 `types → services → stores → pages` 单向依赖;**改大文件(store / index.vue)优先拆组件,勿继续膨胀**。
- **模型输出必经契约层**(`src/services/analysisContract.ts` 的 `enforceAnalysisContract` / `normalizeModelAnalysis`),不得直接写规则库。
- **送模型前先脱敏**:复用 `src/services/privacyFilter`,勿另造。
- 评估体系(`evaluationEngine.ts`)**降级隐藏而非删除**。
- **不重写已完成部分,只补缺口。**
- 敏感信息(API Key、DB 密码、`private-doc/`、`.env.local`、`.mcp.json`、`.codex/config.toml`、`001_PRD/`)全部 gitignore,**绝不提交**。

## 4. UI

- "精密仪表"风:trust-chip、等宽数字、克制留白。design tokens 见 `src/pages/index/styles.scss` 顶部。
- 避免"九徽章 + 花哨配图";新功能尽量拆组件,勿堆进 `index.vue`。

## 5. 测试 / 上线

- **测试**:`tsconfig.test.json` 编译到 `dist-tests/` → `node` + `node:assert/strict`(非 vitest/jest)。
  - 新测试文件**必须追加进 `package.json` 的 `test:evaluation`** 才会执行。
  - 每个文件以 `console.log('xxx tests passed')` 收尾;顶层 `await` 不允许,包进 async IIFE。
  - 命令:`npm run typecheck` / `npm run test:evaluation`。
- **上线**:`git push origin master:main` 触发 Vercel 部署(本地 master,生产 main)。
  - 改了 `server/` / `src` 注意 `/api` 是已提交的 esbuild bundle,需 `npm run build:api` 重建。
- **中转质量**:演示中转在部分区域会出降质/不稳,通常是渠道问题而非代码 bug,排查前先排除它。

## 6. 当前排期(已锁,见 V6 doc §9.2)

> **P2 反例改写规则边界 ≈ P3 UX 简化 > P4 演示数据 > (可选)规律趋势迷你图 ≫ AI 生图(暂缓)**

- **P2 反例改写规则边界** —— 规则反复打脸时引擎已生成 `revisionSuggestion`/`revisionDraft` 并在决策点浮出;下一步让"采用修订"收窄条件的链路更完整。
- **P3 简化真实用户体验**、**P4 完善演示数据**(可往上班族 + 学习成长/理财 倾斜)。
- **规律趋势信息图(ECharts,零 API)** —— 想要视觉亮点走这条:数据现成(`Law` 复发数 + `computeTrend` 的 MK 趋势)。只画"揭示跨记录模式"的信息图,不画装饰场景图。
- **AI 生图 = 暂缓(parked)**。重启条件:产品验证 PMF 后、或用户主动提需求;届时 V6 doc §1–§8 技术设计(IndexedDB 分层 / 可插拔渠道 / privacyFilter 脱敏)直接复用。

## 7. 近期进展(2026-06-25)

- 用户标签:`rule.tags` + 标签编辑 + 规则库筛选 + 自动补全 + AI facet 预填。
- 新增分类 `学习成长` / `理财`(纯增、零迁移)。
- 决策 → 验证 → 进化闭环:确认已存在,补"进化指引浮到决策点 + 采用修订"。
- V6 经验可视化文档:版本 V5→V6、AI 生图暂缓、替代方向定为规律趋势可视化(含两张 PlantUML,见 `docs/superpowers/specs/diagrams/`)。

---

## 关键文件速查

| 用途 | 路径 |
|---|---|
| 项目指引 / 红线 | `CLAUDE.md` |
| 版本顺序 | `docs/version-roadmap.md` |
| 类型总表 | `src/types/experience.ts` |
| AI 契约层 | `src/services/analysisContract.ts` |
| 脱敏 | `src/services/privacyFilter.ts` |
| 评估引擎 | `src/services/evaluationEngine.ts`(降级隐藏中) |
| 主 store | `src/stores/experience.ts` |
| 单页入口 | `src/pages/index/index.vue` |
| 找经验 / 决策 UI | `src/pages/index/components/InputModule.vue` |
| 设计文档 | `docs/superpowers/specs/` |
| 实施计划 + 执行日志 | `docs/superpowers/plans/` |
