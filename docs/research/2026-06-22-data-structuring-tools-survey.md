# 调研:数据"梳理"角度的工具/项目

> 日期:2026-06-22 · 状态:**调研(结论待取舍采纳,非已决策)**
> 视角:从"把零散具体数据梳理成结构"这一角度,调研可借鉴的工具/项目,为 Experience OS 的后续取舍提供依据。
> 关联:产品边界见 `../version-roadmap.md`、`001_PRD`(私密);现状见 `../implementation-status.md`。

## 1. 背景与视角

真实使用中,"梳理一堆已有的具体数据(笔记/记录/聊天/日志)"往往比"一条条手动记"占比更大。放回边界链路:

```
(一堆具体数据)
   ↓  梳理 = 经历 → 经验   ← 本调研聚焦的环节(输入端,量最大)
经验 → 规律 → 决策          ← 产品价值点(护城河)
```

**原则提醒**:梳理是手段不是目的。借鉴这些工具的"梳理机制",但**不借它们的"知识/笔记"定位**(边界明确不做知识系统);Experience OS 的梳理必须流向**规律发现 + 决策辅助**。

## 2. 工具景观(按对本项目的相关度)

### 最值得借鉴

| 工具 | 它做得好的(梳理角度) | 对 Experience OS 的相关性 |
|------|------------------------|---------------------------|
| **Tana** ⭐ | **supertags**:打 `#会议` 自动带出字段(日期/参会人/行动项),把自由文本变成**带字段、可查询的结构化对象**,AI 直接在结构上操作 | 与我们"观察→结构化规则(conditions/kind/category 等字段)"同范式,**最值得学"输入即结构化对象"** |
| **Mem** ⭐ | embedding **自动关联**相关笔记,无文件夹;写到某主题时自动浮出过去相关记录 | 对应**规律发现 / 决策召回**:借"免手动整理、AI 自动 surfacing" |
| **Rosebud / Mindsera** | AI journaling,把反思性输入梳理成 insight/模式 | 语义最接近(从记录提炼洞察),但偏情绪反思、**不做决策辅助**——正是我们的差异点 |

### 其他流派(结构化的不同打法)

| 工具 | 特点 | 备注 |
|------|------|------|
| Notion AI | database 驱动(表/字段),重协作 | 结构强但偏团队/知识库 |
| Capacities | typed objects(对象类型化) | 介于 Notion 与 outliner 之间 |
| Obsidian / Logseq | 本地优先 markdown | 契合 Local First |
| Logseq / SiYuan / AnyType | **开源** + 本地优先(部分 AI) | 想看实现/架构可参考 |
| Khoj / Reor | **开源** + 本地优先 + AI 检索/关联 | 借鉴"本地 AI 梳理"架构 |

### 技术侧(若自研"梳理/结构化抽取")

| 项目 | 作用 | 与本项目关系 |
|------|------|--------------|
| instructor | LLM → 强类型 JSON,带 schema 校验/重试 | 与 `analysisContract`(normalize+enforce)同思路,可借校验/重试模式 |
| BAML | 声明式 LLM 函数 + 结构化输出 | 同上,更工程化 |
| LangChain extraction | 抽取链 | 思路参考,依赖偏重 |

## 3. 借鉴矩阵(借什么 / 从谁)

| 借什么 | 从谁 | 落到 Experience OS 哪里 |
|--------|------|--------------------------|
| 输入即结构化对象(字段化) | Tana | 提炼输出的字段设计 / 规则卡 |
| AI 自动关联、免手动整理 | Mem | M3 规律发现 / M4 决策召回 |
| 从反思记录提炼洞察 | Rosebud / Mindsera | M2/M3 的叙事与交互 |
| 本地优先 + 开源实现参考 | Logseq / SiYuan / Khoj | 存储/同步、本地 AI 架构 |
| 结构化抽取工程范式 | instructor / BAML | analysisContract 强化 |

## 4. 候选采纳点(待取舍,逐条带考量)

> 以下是"可能值得采纳"的点,**均未决策**;后续按价值/成本/边界逐条取舍。

1. **字段化结构(Tana 式)**:让提炼输出更"对象化"(明确字段:事件/问题/经验/条件/根因/可信度)。
   - 取舍:利于后续聚类与决策;成本中;**在边界内**。
2. **自动关联/召回增强(Mem 式)**:从关键词召回升级为 embedding 语义召回。
   - 取舍:价值高(决策辅助核心);成本中(需向量,schema 已预留 embedding);属 V4 节奏。
3. **更多"梳理"入口/来源**:md 已做;可加聊天记录/纯文本/更多格式。
   - 取舍:契合"梳理是输入大头";成本低-中;注意每条仍走提炼的 token 成本。
4. **结构化抽取的校验/重试范式(instructor 式)**:给 analysisContract 增加更强的校验-重试。
   - 取舍:提升模型输出鲁棒性(我们已踩过模型漏字段的坑);成本低;**推荐优先级较高**。
5. **本地优先存储升级(Logseq/SiYuan 式)**:localStorage → IndexedDB + 可选同步。
   - 取舍:利于长久使用;成本中;见 `refactor-plan.md` R6。

## 5. 边界红线(取舍时必须守)

- **借机制,不借定位**:上面多数是知识/笔记工具,我们**不做知识系统**。
- **梳理必须有出口**:任何"梳理"功能都要回答"梳理出来给规律/决策用",否则就是在往"整理工具"漂,应否决。

## 6. 一句话

> **Tana 教你把数据梳理成结构,Mem 教你自动关联,但"梳理完用来帮你决策"它们都不做——那是 Experience OS 的位置。**

---

### Sources
- 11 Best AI Second Brain Tools 2026 — Taskade: https://www.taskade.com/blog/ai-second-brain-tools
- 12 Best AI Note-Taking Apps 2026 — Storyflow: https://storyflow.so/blog/best-ai-note-taking-apps-2026
- Best AI Note-Taking Apps 2026 (Notion AI vs Obsidian +4) — alfred_: https://get-alfred.ai/blog/best-ai-note-taking-apps
- Top 10 Mem Alternatives 2026 — Remio: https://www.remio.ai/post/top-10-mem-alternatives-for-note-taking-in-2026
- 标记解析库对比(前一调研):marked / markdown-it / remark(见 `../superpowers/specs/2026-06-22-markdown-import-design.md`)
