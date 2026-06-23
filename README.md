# Experience OS 使用与开发指南

**Experience OS —— 个人经验管理与决策辅助引擎。** 把碎片化、口语化的经历自动提炼成可复用经验,并跨记录发现规律、在未来决策时主动召回。一句话:让每一次经历,都变成下一次决策的资产。(H5 原型)

## 项目文档

- 架构
  - [当前架构(As-Is)](docs/architecture/current-architecture.md)
  - [架构设计(原则/边界)](docs/architecture/architecture-design.md)
  - [目标架构蓝图(终局)](docs/architecture/target-architecture-blueprint.md)
  - [决策日志(ADR)](docs/architecture/decision-log.md)
  - [重构规划](docs/architecture/refactor-plan.md)
  - [数据与隐私存储模型](docs/architecture/data-privacy-model.md)
- 产品
  - [实现现状(已实现/验证)](docs/implementation-status.md)
  - [版本规划(V1–V5)](docs/version-roadmap.md)
  - [后端版本规划(B0–B4,按需)](docs/backend-roadmap.md)
  - [需求设计 spec](docs/superpowers/specs/2026-06-22-requirement-restructure-design.md)
  - [V2 规律发现设计 spec](docs/superpowers/specs/2026-06-23-v2-pattern-discovery-design.md)
  - [产品定位分析(与笔记/知识库的差异)](docs/positioning-analysis.md)
  - [实施计划与执行日志](docs/superpowers/plans/)
- 调研
  - [数据"梳理"工具/项目调研(待取舍)](docs/research/2026-06-22-data-structuring-tools-survey.md)
- 工作约定:见 [CLAUDE.md](CLAUDE.md)

## 环境要求

- Node.js 20 或更高版本
- npm

首次拉取或依赖缺失时安装依赖：

```bash
npm install
```

## 本地启动

开发预览：

```bash
npm run dev:h5
```

默认 Vite 会启动在 `http://localhost:5173/`。如果端口被占用，终端会显示新的端口。

生产构建后预览：

```bash
npm run build:h5
npm run preview:h5 -- --port 5173
```

## 测试与校验

核心业务测试：

```bash
npm run test:evaluation
```

覆盖内容包括：

- 一句话观察的本地结构化分析
- 评估结论、稳定分、采用决策
- 复测协议、复测矩阵、维护回归、恢复观察期
- 修订后评估版本隔离和当前版本复测门槛
- 当前版本协议合规画像和协议执行阻断
- 评估 JSON/CSV 导出

类型检查：

```bash
npm run typecheck -- --pretty false
```

H5 构建：

```bash
npm run build:h5
```

当前构建可能出现 Vite CJS Node API 和 Sass `@import` 的弃用警告，这是依赖链路警告，不影响运行。

## 常用操作

- 首页输入一句观察，点击“生成规则”。
- “批量导入”支持多行文本或 `.md`/`.txt` 文件一次性导入历史经验。
- 点击“载入演示数据”可预置样例。
- “经验列表”保留原始观察和结构化摘要。
- “规则库”查看沉淀后的策略卡(策略 / 避坑 / 待观察)。
- **“规律发现”→“规律库”(V2)**:点“扫描我的 90 天”，把同根因不同表述的多条观察归成一条**规律**(带复发次数 / 趋势 / 置信),区分高频避坑与高频成功；每条规律可“标记已复盘 / 已针对它改进 / 已解决”,复发时自动重新激活。同屏还有统计洞察卡与周·月复盘。
- “评估工作台”(高级面板)处理复测队列、复测矩阵、维护回归、导入导出。
- “导出经验资产 (.md)” / “导出评估数据 (JSON)” / “导出 CSV”。

应用规则修订草案后，旧评估会保留为历史审计样本，但不会继续支撑新版本的采用结论。新版本至少需要补足 2 次明确复测；JSON/CSV 导出会包含 `ruleVersion`、当前版本复测覆盖状态、当前版本样本数和历史版本样本数。

当前版本评估还会生成协议合规画像：缺少协议快照、缺少协议执行结果、协议执行阻断或协议焦点不一致时，会进入采用门槛和可重复性问题摘要，不能直接算作高可信样本。

本地状态保存在浏览器 `localStorage`，清空浏览器站点数据或点击页面“清空”会移除当前记录。

## 是否支持简单记录

支持。当前产品入口就是“一句话简单观察”，例如：

```text
周末10点健身房人少，器械不用排队
```

这类输入会生成“周末低峰训练策略”，并进入规则库。

但 Experience OS 不是普通日记工具。它会区分两类输入：

- 可复用观察：包含时间、地点、对象、结果，能生成策略卡。
- 待观察记录：信息有保存价值，但还不足以形成稳定规则。

例如：

```text
周日十点钟去健身房，人很多
```

这条也会被保存为原始观察，但不会被错误包装成“健身房低峰策略”。当前会进入“待观察经验”，提示下次补充更多上下文或再次验证。

类似的反向结果都会按同一规则处理：如果文本命中了某个主题，但结果方向和现有模板结论相反，就不会强行套用正向策略。例如“晚上8点超市排队很长”“下雨天走B口更远”“午休后散步还是犯困”都会先进入待观察，而不是生成低峰、近路或恢复策略。后续如果多次记录同类反例，可以通过复测和评估机制把它沉淀为限制条件或新的规则。

最低建议写法：

```text
时间 + 地点/对象 + 结果
```

示例：

```text
工作日晚上8点去小区超市，结账排队明显更短
下雨天走B口到公司更近，还不用绕路
午休后散步10分钟，下午开会不容易犯困
```

## 当前边界

- **AI 提炼已接入真实模型**(DeepSeek,OpenAI 兼容),走 `analyzeObservationResilient`:模型优先、异常自动降级到本地关键词引擎(`src/services/aiAnalyzer.ts`)。
- 模型抽象在 `src/services/modelAnalysisAdapter.ts` / `modelClient.ts`;prompt 防注入 + 输出校验 + 方向一致性 + 三态降级在 `src/services/analysisContract.ts`。**任何模型输出必须经 `normalizeModelAnalysis()` / 契约层,不能直接写入规则库。**
- **API Key 只存浏览器本地(自配)或经可选后端代理转发,绝不提交、绝不烤进仓库。** 演示可前端直连(BYO/演示 Key)或走 `server/`(Hono)代理。
- 数据存浏览器 `localStorage`(唯一真相源),无账号 / 多端同步;无真实地图 SDK。
- 不把单条模糊记录强行包装成稳定规律;负向经验沉淀为“避坑规则”而非一律降级。
- 规律(V2)稳定性靠复发次数 + 置信 + 生命周期标注逐步确认。

## 后续规划

> 状态更新(2026-06):下方 **P0(真实模型)与 P1(相似聚合 / 规律发现)已完成**,分别对应 V1 真模型提炼与 V2 规律库。完整路线见 [版本规划](docs/version-roadmap.md)。下面保留各阶段目标作为背景。

### ✅ P0 接入真实模型(已完成)

接入火山方舟/豆包等真实模型，但不能让 H5 前端直接持有 API Key。推荐新增服务端代理：

```text
前端一句话观察 -> 后端代理 -> 火山模型 -> 严格 JSON -> schema 校验 -> 方向一致性校验 -> 写入规则或待观察
```

模型输出至少需要包含：

- 主题和分类
- 时间、地点、对象
- 结果方向：正向、反向、不确定
- 结论类型：新规则、反例、限制条件、待观察
- 推荐行动
- 适用条件和排除条件
- 置信说明

模型负责语义理解，业务层负责兜住风险：输出必须经过 `normalizeModelAnalysis()` 或等价校验，不能直接写入规则库。

### ✅ P1 相似记录聚合(已完成 = V2 规律库)

单条观察价值有限，真正有用的是多条相似观察形成趋势。例如：

```text
周日10点健身房人很多
周六10点健身房人少
工作日晚上健身房人少
```

系统应该能判断这不是简单的“周末10点人少”，而是可能需要拆成“周六低峰、周日拥挤、工作日晚间低峰”等更细边界。实现方向：

- 按主题、地点、对象、时间段和结果方向聚类。
- 相似正向记录提升规则置信。
- 相似反向记录进入反例池。
- 正反样本混杂时生成冲突或拆分建议。

### 🟡 P2 反例自动改写规则边界(部分:负向已沉淀为避坑规则;自动改写已有规则边界待做)

反向观察不应该永远只是“待观察”。当反例和已有规则高度相似时，应挂到原规则下：

- 单次反例：生成边界提醒。
- 多次同类反例：写入限制条件或排除条件。
- 强冲突反例：触发规则修订草案或拆分新规则。

例如“下雨天走B口到公司更远”应能修正“雨天走B口更近”的适用范围，而不是只生成一条孤立记录。

### 🟡 P3 简化真实用户体验(评估矩阵已折叠为高级面板;主路径收敛持续进行)

现有评估矩阵适合 Demo 证明流程完整，但真实用户不应该每天处理复杂面板。主体验应收敛成三个入口：

- 记录一句话
- 查看可用经验
- 处理冲突/待确认

复测矩阵、采用门槛、维护回归保留为后台判断或高级面板，不作为主路径负担。

### ⬜ P4 完善演示数据(待办)

补充一组能体现“系统在学习”的样例数据：

- 正向规律
- 反向规律
- 同主题冲突
- 多次记录后趋势形成
- 反例触发边界修正
- 规则从待观察到可采用

这样演示重点会从“页面功能多”转为“系统真的能沉淀和修正规则”。

## 主要目录

- `src/services/analysisContract.ts`:AI 输出安全契约(prompt 防注入 + `normalizeModelAnalysis` + 三态/方向校验 + 降级)。
- `src/services/modelClient.ts` / `modelAnalysisAdapter.ts` / `resilientAnalysis.ts` / `modelConfig.ts`:真模型接入(client 抽象、模型优先+本地兜底、读取本地模型配置)。
- `src/services/aiAnalyzer.ts`:本地关键词分析引擎(现作降级兜底)。
- `src/services/patternDiscovery.ts`:V2 统计聚类 + 模型归因(洞察)。
- `src/services/lawDiscovery.ts`:V2 规律库(语义聚类 + 持久化 Law + 时间维度 + 生命周期)。
- `src/services/periodicReview.ts`:周·月复盘。
- `src/services/evaluationEngine.ts`:评估、采用、复测矩阵等纯业务推导(高级面板)。
- `src/stores/experience.ts`:Pinia 状态、导入导出、规律扫描、队列和写入动作。
- `src/pages/index/index.vue`:H5 页面入口。
- `server/`:可选的极简模型代理(Hono),让 Key 留在服务端;前端不配则直连降级。
- `tests/`:业务回归测试(纯 TS,经 `test:evaluation` 运行)。
- `docs/`:架构 / 版本规划 / 设计 spec(见上方“项目文档”)。
