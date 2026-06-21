import { createModelClient, type ModelConfig } from './modelClient'
import type { ObservationModelClient } from './modelAnalysisAdapter'

const STORAGE_KEY = 'experience-os:model'

export function getActiveModelClient(): ObservationModelClient | null {
  const config = readModelConfig()
  if (!config || !config.apiKey) return null
  return createModelClient(config)
}

function readModelConfig(): ModelConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ModelConfig>
    if (!parsed.apiKey) return null
    return {
      provider: parsed.provider ?? 'deepseek',
      apiKey: parsed.apiKey,
      model: parsed.model ?? 'deepseek-chat',
      baseUrl: parsed.baseUrl ?? 'https://api.deepseek.com',
    }
  } catch {
    return null
  }
}
