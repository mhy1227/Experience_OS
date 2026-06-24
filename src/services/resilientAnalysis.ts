import type { AnalysisResult } from '../types/experience'
import { analyzeObservation } from './aiAnalyzer'
import { normalizeModelAnalysis } from './analysisContract'
import { createObservationAnalysisPrompt, type ObservationModelClient } from './modelAnalysisAdapter'
import { redact } from './privacyFilter'

export interface ResilientOptions {
  client?: ObservationModelClient | null
}

export async function analyzeObservationResilient(
  text: string,
  options: ResilientOptions = {},
): Promise<AnalysisResult> {
  const { client } = options

  if (client) {
    try {
      // A6 红线:文本进云端模型前先脱敏(PII/密钥不出设备)。失败兜底回退原文,不阻断提炼。
      let safeText = text
      try {
        safeText = redact(text).redacted
      } catch {
        safeText = text
      }
      const raw = await client.completeJson(createObservationAnalysisPrompt(safeText))
      // 用模型实际看到的(脱敏后)文本做契约归一,保持方向一致性判定与输入一致。
      return normalizeModelAnalysis(raw, safeText)
    } catch {
      // 网络/解析等异常 → 回退本地引擎(契约层的"降级为待观察"是正常结果,不会进这里)
    }
  }

  // 纯本地引擎:不外发,无需脱敏,用原文。
  return analyzeObservation(text)
}
