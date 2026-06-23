# 前端优化分析(2026-06-23)

> 范围:`src/pages/index/index.vue`、`src/stores/experience.ts`、构建产物、运行时表现。
> 方法:实测行号 / 构建产物体积 / 运行时 console / 代码结构盘点。
> 定位:盘点 + 排优先级,**不在本文动手**;页面"过长"的专项见 [前端瘦身设计](../superpowers/specs/2026-06-23-frontend-slimming-design.md)。

## 实测基线

| 指标 | 值 |
|---|---|
| `index.vue` 行数 | **4068** |
| `stores/experience.ts` 行数 | 3126 |
| `services/evaluationEngine.ts` 行数 | 1714 |
| `index.vue` 内 `h(` 命令式渲染调用 | **142** |
| 已抽出的组件数 | 2(`DecisionHintCard`、`ModelConfigPanel`) |
| 主 bundle | `index-*.js` ≈ 291 KB(gzip ≈ 94 KB) |
| 懒加载 chunk | `marked` 42 KB、`markdownImport` 1 KB(✅ 动态 import) |
| CSS | ≈ 31 KB |
| uni-app 死文件(manifest/pages.json) | ✅ 已删 |
| 运行时 console | 无 JS 错误(仅一条 DOM info:password 字段未包在 form 内) |

## 发现(按维度 + 严重度)

### 🔴 可维护性(最重)
1. **`index.vue` 4068 行 = god component**,几乎所有 UI + 逻辑都在一个文件;只抽出 2 个组件。改一处要在巨石里翻找,冲突概率高,违反 CLAUDE.md"改大文件优先拆分,勿继续膨胀"。
2. **142 处 `h()` 命令式渲染**(`RuleCard`、评估矩阵等用渲染函数手写,而非 `<template>`):可读性极差、难改、易出 key/无障碍问题。这是"难维护"的最硬来源。
3. **`stores/experience.ts` 3126 行 god store**:状态 + 持久化 + 队列 + 写入 + 评估 + 规律扫描全堆一起。
4. **`evaluationEngine.ts` 1714 行过度工程**:CLAUDE.md 要"降级隐藏而非删除",但其 UI 目前在页面全量展开(见瘦身文档)。

### 🟡 性能 / 首屏
5. **主 bundle ≈ 291 KB(gzip 94 KB)** 偏大:`index.vue` + `store` 全进主 chunk,无按 tab/路由的代码分割。可接受但有优化空间。
6. **首屏 DOM 偏重**:`最新策略卡` 始终渲染**完整评估矩阵**(重复评估/复测协议/采用门槛/槽位/画像…),任何 tab 下都挂在 DOM 里 → 节点多、首屏渲染成本高(瘦身方案 A 折叠后可大幅缓解)。
7. **懒加载已做对**:`marked`、`markdownImport` 动态 import 成独立 chunk,主 bundle 不含——这点是正面样板,可推广到其它重模块(如评估工作台、规律库)。

### 🟡 健壮性 / 构建噪音
8. **Sass legacy `@import` 弃用警告** + **Vite CJS Node API 弃用警告**:构建期噪音,Dart Sass 2.0 / Vite 后续版本会移除,需迁移(`@use`/ESM 配置)。
9. **password 字段未包在 `<form>`**:浏览器 DOM 提示(非错误);设置面板里的 API Key 输入框包进 `<form>` 即可消除,且利于密码管理器/可访问性。

### 🟡 语义 / 可访问性
10. **大量 `<view>` / `<text>`(uni-app 残留标签)**而非语义 HTML(`div`/`span`/`section`/`button`):虽能渲染,但语义弱、对屏幕阅读器与 SEO 不友好。组件化时可顺势换成语义标签。
11. 命令式 `h()` 渲染里需自查 `:key`、`aria-*` 缺失。

### 🟢 已做对 / 已处理
- uni-app 死文件已删;`marked`/md 懒加载;V2 规律库已组件化思路(虽仍内联);契约层把模型风险挡在 store 外。

## 优化建议(分优先级,均对齐红线)

**P0(高性价比、低风险,先做)**
- **A. 折叠 + 下沉评估矩阵**(瘦身方案 A):RuleCard 默认精简、评估详情折叠、评估工作台收进「高级」。→ 首屏短 60%+、DOM 轻、落实"评估降级隐藏"。**纯展示层,不碰逻辑。**
- **B. 录入区收敛**(瘦身方案 B)。

**P1(可维护性,单独立项,逐个提)**
- **C. RuleCard 由 142 处 `h()` 命令式渲染 → `<template>` SFC**(含 `RuleEvaluationPanel` 折叠子组件):这是"难维护"的最大单点改善。
- **D. 按能力层组件化拆分 `index.vue`**(见瘦身文档 §6:InputModule/RuleLibrary/LawLibrary/EvaluationWorkbench/…),壳收敛到数百行。
- **E. store 拆分**:按域分(observations 写入 / 评估 / 规律 / 持久化),或抽 composables。

**P2(健壮性 / 卫生,顺手)**
- 迁移 Sass `@use`、修 Vite CJS 配置弃用;API Key 输入包 `<form>`;`<view>/<text>` 换语义标签(随组件化做);重模块(评估工作台/规律库)按 tab 懒加载进一步瘦主 bundle。

## 验证方式(任何一步)
- `npm run typecheck -- --pretty false` + `npm run test:evaluation` 全绿(零行为变更);
- `npm run build:h5` 看主 bundle 体积变化;
- Playwright 真机:首屏高度/DOM 节点数下降、各功能(录入/导入/扫描/规律/复测/反馈)不回归。

## 结论
**最该先做 P0(折叠/下沉评估,落实红线、首屏立竿见影)。** 可维护性的根因是 `index.vue` 4068 行 + 142 处命令式渲染,治本靠 P1(RuleCard 转模板 + 按能力层拆组件),但工程量大、单独立项、逐组件迁移并每步回归。P2 是卫生项,随手清。
