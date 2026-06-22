# Markdown 导入 设计(小需求)

> 日期:2026-06-22 · 范围:经验采集(V1 边界内,冷启动/历史导入)

## 背景与目标

当前批量导入只支持"文本粘贴按行拆"。需要支持**从 .md / .txt 文件导入历史经验/笔记**,作为冷启动与长期留存的低摩擦入口。

## 核心原则(决定了实现难度)

1. **解析内容,不解析字段**:md 字段格式千变万化,但所有内容最终都交给 AI 重新提炼(AI 格式无关)。因此**只抽取"内容块"成候选经验文本**,不映射 md 字段。这绕开"字段格式多"的复杂度。
2. **解析 0 token**:md 解析是纯本地字符串处理,不调模型;**消耗只在"提炼"那步**(每条候选 → 一次模型调用)。
3. **复用现有管线**:解析出的 `string[]` 走现有 `importObservations`,不重写提炼/写入逻辑。

## 范围

**做**:
- `.md` / `.txt` / `.markdown` 文件选择器 + 读取(`FileReader.readAsText`)。
- 块级解析:把 md 拆成一条条候选经验文本。
- 导入前**预览条数 + 确认**(含成本提示)。
- 复用 `importObservations` 完成提炼与落库。

**不做(本期)**:
- md 字段 → 规则字段的精确映射(仅"本产品导出格式回灌"可作后续)。
- md 渲染 / MDX / 完整 AST 变换。
- "导入只存、按需提炼"模式(列为后续可选;本期沿用现有"导入即提炼")。

## 方案

### 解析库:`marked`(仅用 lexer,懒加载)

- 用 `marked.lexer(md)` 拿**块级 token**,比手写正则更稳(GFM 表格/嵌套列表/代码围栏由库正确处理)。
- **懒加载**:在导入动作里 `const { marked } = await import('marked')`,不进主 bundle。
- marked 零子依赖、~23KB、自带 TS 类型。

### 新模块(独立纯函数,可测)

`src/services/markdownImport.ts`
```ts
export interface MarkdownParseOptions {
  maxItems?: number          // 上限,默认 50
  headingAsContext?: boolean // 标题作前缀,默认 false
}
export interface MarkdownParseResult {
  observations: string[]     // 候选经验文本(已剥标记、压平内部换行)
  truncated: boolean         // 是否因上限被截断
  totalParsed: number        // 截断前的总条数
}
// 懒加载 marked,解析 md → 候选经验文本
export async function parseMarkdownToObservations(
  md: string,
  options?: MarkdownParseOptions,
): Promise<MarkdownParseResult>
```

### token → 观察文本 的映射规则

| token 类型 | 处理 |
|------------|------|
| `list`(`.items[]`) | 每个 item = 1 条 |
| `paragraph` | 1 条 |
| `table`(`.rows[]`) | 每行:取最长单元格(或所有单元格拼接)= 1 条;表头跳过 |
| `heading` | 默认跳过;`headingAsContext=true` 时作后续条目前缀 |
| `code` / `space` / `hr` | 跳过 |
| front-matter(`---`)| 先用正则剥除,再 lexer |

清洗:剥 `*_>#` 等行内标记、`trim`、内部换行→空格、**过滤长度 < 4 的条目**、**去重**。

### 成本控制(重点)

- 每条候选 = 1 次真模型调用 → 大文件会爆。
- `maxItems`(默认 50)截断;UI 导入前显式确认:**"将导入 N 条,约 N 次模型调用,继续?"**。
- truncated 时提示用户被截断的条数。

### UI(最小)

复用现有批量导入区附近:
- 文件选择器 `accept=".md,.txt,.markdown"` → `FileReader.readAsText`;
- → `parseMarkdownToObservations` → 显示"将导入 N 条" + 确认按钮;
- 确认 → `importObservations(observations.join('\n'))`(候选已压平内部换行,行拆安全)→ 复用现有进度/结果反馈。

## 数据流

```
.md 文件 → FileReader.readAsText → parseMarkdownToObservations(md)  ← 0 token,本地
        → { observations: string[], truncated }
        → 预览条数 + 确认
        → importObservations(join '\n')  ← 每条 1 次模型调用(成本在此)
```

## 测试计划(`tests/markdownImport.test.ts`,纯函数)

- 无序/有序列表 → 每项一条;
- 段落分条;
- 标题默认跳过 / `headingAsContext` 作前缀;
- 表格行拆条、跳表头;
- 代码块/front-matter 跳过;
- 行内标记剥离、内部换行压平、短条过滤、去重;
- `maxItems` 截断 + `truncated` 标志。
(marked 需安装为依赖;测试在 node 下经 dynamic import 加载。)

## 非目标 / 风险

- 不追求 md 语义完整性,只要"拆成一条条经验文本"。
- 表格列映射为"尽力而为"(取内容列),不强求语义。
- 新增运行时依赖 `marked`(懒加载 + 仅导入时使用,影响可控)。
