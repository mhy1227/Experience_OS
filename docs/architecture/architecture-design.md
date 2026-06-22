# 架构设计(目标态与原则)

> 描述**应该如何**组织系统(原则、边界、扩展点)。现状见 `current-architecture.md`,决策见 `decision-log.md`。

## 1. 产品架构:两层

```
采集层 Capture        飞书 / 微信 / 浏览器插件 / App / Web 输入框
   │  (只负责"记录",是入口,不是产品)
   ▼
智能层 Intelligence   Experience OS
                      提炼 → 关联(规律发现) → 验证 → 决策辅助
```

**护城河在智能层**。采集层可替换、可扩展;智能层是产品本身。

## 2. 设计原则

- **Experience First**:沉淀经验(规律),不只是记录事件。
- **Local First**:数据默认归用户、存本机;云为可选同步。**API Key 永不上云**。
- **Model Agnostic**:模型可换(内置演示 + 用户自配),业务层不绑定厂商。
- **AI Assisted**:AI 负责提炼/归纳,不替代用户判断;**任何模型输出必须过契约层校验**,不得直接落库。

## 3. 分层与边界

单向依赖 `types → services → stores → pages`,每层职责明确:

| 层 | 允许 | 禁止 |
|----|------|------|
| `services/` | 纯函数、业务逻辑、可独立测试 | **DOM**、Pinia、Vue 运行时 |
| `stores/` | 状态、持久化、动作编排 | DOM(如下载交给 page) |
| `pages/`·`components/` | UI、DOM 副作用、用户交互 | 业务规则(应下沉到 services) |

**文件大小是信号**:文件过大(如 index.vue / store)说明职责过多,应拆分(见重构规划)。新功能优先拆独立组件/服务,勿继续堆积。

## 4. 关键抽象

- **模型抽象点 `ObservationModelClient`**:任何厂商实现 `completeJson({systemPrompt,userText})` 即可接入。新增厂商 = 新增一个 client 实现,业务零改动。
- **契约层 `analysisContract` 是安全闸门**:`normalize → enforce(状态机) → assert`,模型无关。所有模型/本地输出统一经此,失败统一降级。**绕过契约层写库是架构违规**。
- **经验分类正交轴**:
  - `direction`(positive/negative/mixed/uncertain)——事实极性,决定 **kind**;
  - `kind`(strategy/caution/watch)——经验种类;
  - `reusability`(high/medium/low)——质量,**与 kind 正交**。
  迁移判据是**类型 + 结构**,不是方向(负向经验同样可成"避坑规则")。

## 5. 扩展点(随版本演进)

| 演进 | 扩展点 | 设计预留 |
|------|------|------|
| 多模型 | `createModelClient` 工厂 + provider 配置 | 已抽象,加 client 实现即可 |
| 采集层(飞书/插件) | 入口写入 → 复用 `analyzeObservationResilient` 同一管线 | 智能层与入口解耦 |
| 经验验证(V3) | `evaluationEngine` 作可信度/成功率后端 | 引擎已存在,接 `Insight`/规则可信度 |
| 向量检索(V4) | `exp_rules.embedding` 列 + 相似召回 | schema 已预留 embedding |
| 云同步(后置) | `exp_` schema 双端同构 + 增量 upsert(id 幂等) | 表结构已就绪;localStorage 为当前真相源 |

## 6. 数据模型意图

- **运行时**:localStorage(单租户、本地优先)。
- **未来后端**:`db/schema.sql` 的 7 张 `exp_` 表(实体用列、易变派生画像用 JSON、`note_md` 存 markdown 正文、`embedding` 预留);云 MySQL 现仅工具/开发用途。
- **同步策略(后置)**:客户端可生成 id(uuid/nanoid)→ 幂等 upsert;`created_at`/`updated_at` 支撑增量;敏感数据(Key)不入云。
