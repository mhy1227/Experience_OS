# 当前架构(As-Is)

> 截至 2026-06-22。描述系统**现状**(含技术债),目标态见 `architecture-design.md`。

## 概览

H5 单页应用,纯前端 + 浏览器本地存储,无后端。

- **栈**:Vue 3(`<script setup>`)+ Pinia + Vite + TypeScript + SCSS
- **存储**:浏览器 `localStorage`(唯一运行时真相源)
- **AI**:前端直连 OpenAI 兼容模型(DeepSeek / 中转站),失败回退本地关键词引擎
- **测试**:纯 TS,经 `tsconfig.test.json` 编译到 `dist-tests/` 后用 `node` + `node:assert/strict` 运行

## 分层(单向依赖)

```
types/  →  services/  →  stores/  →  pages/(视图)
```

| 层 | 目录 | 职责 | 备注 |
|----|------|------|------|
| 类型 | `src/types/experience.ts` | 全部类型(枚举 30+、接口 30+) | 374 行 |
| 服务 | `src/services/*` | 纯业务逻辑,可测,**无 DOM** | 见下 |
| 状态 | `src/stores/experience.ts` | Pinia 状态 + 持久化 + 队列 + 写入动作 | **2847 行(偏大,债)** |
| 视图 | `src/pages/index/index.vue` + `src/components/*` | UI、DOM、下载等副作用 | **index.vue 3595 行(偏大,债)** |

## 服务模块清单

| 文件 | 职责 |
|------|------|
| `aiAnalyzer.ts` | 本地关键词分析引擎(8 条硬编码规则),现为**降级兜底** + demoSamples |
| `analysisContract.ts` | **AI 输出安全契约**:prompt(防注入)、`normalizeModelAnalysis`、`enforceAnalysisContract`(分类状态机)、`assertValidAnalysis`、`watchResult` |
| `modelAnalysisAdapter.ts` | `ObservationModelClient` 接口(模型抽象点)+ `analyzeObservationWithModel` |
| `modelClient.ts` | DeepSeek/OpenAI 兼容 client(`createModelClient`,fetch) |
| `modelConfig.ts` | 读 localStorage 模型配置 → `getActiveModelClient()`(仅浏览器) |
| `resilientAnalysis.ts` | `analyzeObservationResilient`:模型优先,异常回退本地引擎 |
| `patternDiscovery.ts` | M3 规律发现:统计聚类 + 模型归因增强 + 最小样本门槛(`MIN_CLUSTER_SIZE=3`) |
| `decisionHints.ts` | M4 决策辅助:对新录入文本召回历史规则(纯函数) |
| `periodicReview.ts` | V1 周·月复盘:时间窗内记录数 + 高频问题/成功 + 一句话建议(纯函数) |
| `markdownExport.ts` | 导出"经验资产"为 markdown(纯函数,返回字符串) |
| `demoWorkData.ts` | 演示工作种子数据(埋共同根因) |
| `evaluationEngine.ts` | 评估/复测/采用门槛/可信度(1714 行)。**已折叠为"高级面板",未删** |

## 关键数据流

**录入提炼**(`submitObservation`):
```
文本 → analyzeObservationResilient(text, { client: getActiveModelClient() })
     → 有 client: client.completeJson(prompt) → normalizeModelAnalysis → enforceAnalysisContract
     → 异常: 回退本地 analyzeObservation
     → AnalysisResult → upsertRuleFromAnalysis → rules/observations → persist(localStorage)
     → recallDecisionHints(...) 产出决策提醒
```

**规律发现**(`computeInsights`):`discoverPatterns(observations)` → 多维聚类(category/tag)+ 达标簇模型归因 → `Insight[]` →「扫描 90 天」归因卡。

**决策辅助**:录入后 `recallDecisionHints` 召回相关历史规则 → 提醒卡。

## AI 分类状态机(契约层核心)

`enforceAnalysisContract` 把模型输出按**类型 + 结构**(非方向)分流到三态:

| kind | 条件 | 结果 |
|------|------|------|
| `strategy` 策略 | 正向 + rule + ≥2 条件 | 正向可复用规则 |
| `caution` 避坑 | 负向/混合 + counterexample/constraint + ≥2 条件 | 真规则,保留模型标题、reusability medium/high |
| `watch` 待观察 | 方向不明 / 无条件 / 低置信 | 信息不足 |

保留拦截:**负向伪装正向 → 拒绝**(防造假)。`kind` 与 `reusability`(质量)正交。

## 存储

- **localStorage(运行时真相源)**:经验数据;模型配置 key=`experience-os:model`(含 Key,**仅本地**)。
- **云 MySQL(SQLPub,仅开发/工具用)**:`db/schema.sql`,7 张 `exp_` 前缀表;**未与 app 同步**;通过项目级 MCP(`.mcp.json`/`.codex/config.toml`,含密码,均 gitignore)访问。
- 演示默认模型配置由 `src/main.ts` 启动时从 `VITE_DEEPSEEK_*`(`.env.local`,gitignore)注入。

## 构建与测试

- `npm run dev:h5` / `build:h5`(Vite)
- `npm run typecheck`(vue-tsc)
- `npm run test:evaluation`(11 套纯 TS 测试,新增测试须登记进该脚本)

## 已知技术债(详见 `refactor-plan.md`)

- `index.vue`(3595)、`store`(2847)过大;评估体系仅隐藏未重做;sentiment 来自弱关键词;localStorage 无版本/防抖;魔数与 label 散落。
