import type { ObservationModelClient } from './modelAnalysisAdapter'

export type ModelProvider = 'demo' | 'deepseek' | 'openai'

export interface ModelConfig {
  provider: ModelProvider
  apiKey: string
  model: string
  baseUrl: string
}

export function createModelClient(config: ModelConfig): ObservationModelClient {
  return {
    completeJson: async ({ systemPrompt, userText }) => {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      })

      if (!response.ok) {
        throw new Error(`Model request failed: HTTP ${response.status}`)
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> }
      const content = data.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new Error('Model returned no string content')
      }
      return JSON.parse(content)
    },
  }
}
