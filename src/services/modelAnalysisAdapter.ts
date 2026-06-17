import type { AnalysisResult } from '../types/experience'
import { OBSERVATION_ANALYSIS_PROMPT, normalizeModelAnalysis, watchResult } from './analysisContract'

export interface ObservationModelClient {
  completeJson(input: {
    systemPrompt: string
    userText: string
  }): Promise<unknown>
}

export function createObservationAnalysisPrompt(userText: string) {
  return {
    systemPrompt: OBSERVATION_ANALYSIS_PROMPT,
    userText,
  }
}

export async function analyzeObservationWithModel(text: string, client: ObservationModelClient): Promise<AnalysisResult> {
  const content = text.trim()
  if (content.length < 4) {
    throw new Error('Observation is too short to analyze.')
  }

  try {
    const raw = await client.completeJson(createObservationAnalysisPrompt(content))
    return normalizeModelAnalysis(raw, content)
  } catch {
    return watchResult(content, undefined, undefined, undefined, '模型输出不可用，已降级为待观察。')
  }
}
