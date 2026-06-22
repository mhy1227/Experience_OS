// 批量分析核心(供后端模型代理复用):逐条走契约层,单条失败降级为待观察。
// 纯逻辑、可测;不含 HTTP/Key——Key 由调用方(后端)注入到 client。

import type { AnalysisResult } from '../types/experience'
import { createObservationAnalysisPrompt, type ObservationModelClient } from './modelAnalysisAdapter'
import { normalizeModelAnalysis, watchResult } from './analysisContract'

export interface BatchItemResult {
  text: string
  ok: boolean
  analysis: AnalysisResult
}

/**
 * 对一批文本逐条提炼(模型 → 契约层 normalize/enforce)。
 * - 空白行跳过;
 * - 单条异常(网络/解析)降级为待观察,不中断整批。
 */
export async function analyzeBatch(
  texts: string[],
  client: ObservationModelClient,
): Promise<BatchItemResult[]> {
  const results: BatchItemResult[] = []
  for (const raw of texts) {
    const text = (raw ?? '').trim()
    if (!text) continue
    try {
      const modelRaw = await client.completeJson(createObservationAnalysisPrompt(text))
      results.push({ text, ok: true, analysis: normalizeModelAnalysis(modelRaw, text) })
    } catch {
      results.push({ text, ok: false, analysis: watchResult(text) })
    }
  }
  return results
}
