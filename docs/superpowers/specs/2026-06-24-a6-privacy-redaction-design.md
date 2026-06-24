# A6 隐私脱敏(浏览器端)· 设计文档

> 状态:✅ 已完成(2026-06-24 落地并实机验证;commit 99f1e5f)
> 日期:2026-06-24
> 关联:`docs/algorithm-a6-privacy-redaction-plan.md`(A6 方案)、`docs/privacy-status.md`(补的洞:原文裸发)、上游参考实现 `github.com/mhy1227/privacy-filter`(Go,生产于 packyapi)与 `github.com/mhy1227/privacy-filter-ts`(TS 版,Node 服务向)

## 1. 背景

现状:AI 提炼时观察**原文裸发**云端模型,无脱敏(`privacy-status.md` 自承)。A6 = **发请求前在浏览器里剥离 PII/密钥**,标识符不出设备。

已有两份参考实现(用户自有):Go 版(生产于 packyapi 中继)、TS 版。但 TS 版按 **Node 服务**写(依赖原生 `re2` + `node:fs` 读 gitleaks.toml + grpc),**不能直接进浏览器**。本设计:**把其核心逻辑浏览器原生化后内置(vendor)进本项目**,在模型发送前调用。

## 2. 范围与非目标

**做(本期):**
- 浏览器原生脱敏模块(无 `re2`、无 `fs`、无 grpc),忠实移植参考实现的:
  - **PII**:邮箱、手机(CN)、身份证、IPv4、**银行卡(Luhn 校验)**;含数字边界/SSH 上下文等误报抑制(原样移植 `pii.ts`,正则本就原生兼容)。
  - **密钥**:上下文口令(`密码/密钥/token/api_key … 是/=/: <值>`)+ **香农熵**兜底(高熵随机串)+ 误报抑制(占位符/UUID/纯 hex/模板变量/URL/JSON 噪声)。
- 不可逆类型占位符:`[邮箱] [电话] [身份证] [IP] [银行卡] [密钥]`。
- 接入:模型发送路径在发请求前脱敏;**本地仍存原文**。

> 更新(2026-06-24 收尾):原列为"后续"的两项已完成 —— ① 召回/决策建议的 scene 也脱敏(commit fe2d28a);② 完整 gitleaks 规则已内置(commit 0f0fdbf,221 条里 198 条原生 RegExp 可编译 + 7 内置 = 205 活跃,23 条 RE2 专属语法跳过)。

**非目标(本期不做):**
- ⏭️(已完成,见上)~~222 条 gitleaks 规则~~ → 已以生成的 `gitleaksRules.ts` 内置,编译失败的按 `skipped` 跳过。
- ❌ 服务端服务 / WASM(已论证:服务端破"不出设备",WASM 体积重,见会话讨论)。
- ❌ NER 人名/地名(参考实现也明确不做)。
- ❌ 可逆脱敏 / 自定义规则 UI。

**红线:**
- **客户端执行**(本地优先);纯本地引擎路径本不外发,无需脱敏。
- 占位符**不可逆**(不留映射)。
- 不改 `evaluationEngine` / 召回;只在"文本进模型前"加一道。

## 3. 模块设计

新增 `src/services/privacyFilter/`(纯函数,无 DOM/网络/Node API):

```
types.ts      Entity / Result / Span(移植)
entropy.ts    shannonEntropy —— 用 TextEncoder 取 UTF-8 字节(替 Node Buffer)
regex.ts      原生 RegExp 薄壳:compile(pattern,{indices}) / compileTest / findAllIndex / findAllSubmatch / test
              —— 处理开头 (?i):剥掉并加 'i' flag;base flag 'g'(+ 'd' 取捕获组偏移);compile 失败 try/catch 跳过
pii.ts        detectPII(text): Span[] —— 原样移植(digitBounded/ipBounded/luhnValid/SSH 上下文)
secrets.ts    SecretDetector:上下文口令 + 熵兜底 + 误报抑制(移植,去掉 gitleaks-TOML/fs 路径)
index.ts      redact(text): Result + Filter(编排:detectPII + secrets → mergeSpans → 单遍重建)
```

- 行为对齐参考实现的 `filter.ts`(span 合并去重 + 单遍重建,O(n))。
- `regex.ts` 仅需处理"开头 `(?i)`"(本期内置的所有正则至多用到这个);不引入 222 gitleaks 规则,故无 mid-pattern `(?i)` 等不兼容语法。

## 4. 接入点(模型发送前)

- 入口:观察提炼的模型调用前——在 `analyzeObservationResilient` / 契约 prompt 组装处,对**用户观察文本**先 `redact()` 再拼进 prompt。
- **本地存储不变**:`observations`/`rules` 仍存原文(本地优先,原文不出设备即可);脱敏只作用于"发给模型的副本"。
- 失败兜底:`redact` 是纯本地同步,理论不抛;仍包一层 try/catch,异常时退回原文(不阻断提炼)——但记一条 warn(可选)。
- 可选 UI:提炼时若有命中,toast"已自动打码 N 处敏感信息"(本期可后置)。

## 5. 错误处理与边界

- 空串/纯标点 → 无命中、原样返回。
- 正常文本零误报优先(移植了占位符/UUID/hex/URL 抑制)。
- 幂等:对已脱敏文本再脱敏不应再命中占位符(占位符形态不触发规则)。
- 长文本毫秒级(纯正则 + 线性重建)。

## 6. 测试(纯 TS + node:assert,登记 test:evaluation)

`tests/privacyFilter.test.ts`(用例对拍参考实现):
- PII:各类型命中并替换;**Luhn** 合法卡号命中、随机 16 位非法不误报;数字边界(手机号嵌在长串里不误命中)。
- 密钥:`api_key: <高熵>` 命中;`密码是 hunter2` 命中;高熵串命中、正常长单词不误报。
- 误报抑制:UUID / 纯 hex / `${VAR}` 模板 / `https://…` / 占位符 `YOUR_KEY` 不打码。
- 编排:多类型混合 → span 合并不重叠、重建正确;熵函数(空串=0、随机串高、自然语言低)。
- 边界:空串、纯标点 → 无命中;幂等。
- 接入:`redact` 在提炼前调用(以 fake client 断言发给模型的 userText 已打码、本地存的仍是原文)。

## 7. 验收标准

1. `redact(text)` 对 PII(含 Luhn 卡号)、上下文口令、高熵密钥正确打码为类型占位符;主流误报被抑制。
2. 浏览器可运行(无 `re2`/`fs`/grpc 依赖);零新增部署(随前端打包)。
3. 提炼模型调用发出的文本已脱敏;本地 observations/rules 仍为原文。
4. `evaluationEngine`/召回未改;纯本地引擎路径不受影响。
5. `typecheck` + 全部 `test:evaluation`(含 `privacyFilter`)绿;0 控制台报错。

## 8. 后续(不在本期)

222 条 gitleaks 规则(用 `?raw` 导入 toml + smol-toml 浏览器解析,或服务端补一道)、命中 UI 提示、可逆金库、跨语言 PII。

## 9. 来源 / 许可

核心逻辑移植自用户自有仓库 `mhy1227/privacy-filter`(Go)/ `mhy1227/privacy-filter-ts`(TS);为用户自有代码,内置时在文件头注明出处。
