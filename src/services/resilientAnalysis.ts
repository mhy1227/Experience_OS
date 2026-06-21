import type { AnalysisResult } from '../types/experience'
import { analyzeObservation } from './aiAnalyzer'
import { normalizeModelAnalysis } from './analysisContract'
import { createObservationAnalysisPrompt, type ObservationModelClient } from './modelAnalysisAdapter'

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
      const raw = await client.completeJson(createObservationAnalysisPrompt(text))
      return normalizeModelAnalysis(raw, text)
    } catch {
      // 网络/解析等异常 → 回退本地引擎(契约层的"降级为待观察"是正常结果,不会进这里)
    }
  }

  return analyzeObservation(text)
}
