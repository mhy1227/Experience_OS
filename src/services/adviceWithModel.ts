// V4 决策建议 · AI 可选润色(opt-in)。
// 红线:只把本地已算好的结论换种说法,不得改变结论方向/新增事实;过 validateModelField 校验;
// 失败/占位 → 退回本地 advice.reason;不入库;只在用户点按钮时调用。
import type { ObservationModelClient } from './modelAnalysisAdapter'
import type { DecisionAdvice } from './decisionAdvice'
import { validateModelField } from './patternDiscovery'

export const ADVICE_SYSTEM_PROMPT = [
  '你是「决策建议」润色助手。用户会给出当前决策场景、一个已算好的结论档(倾向采用/谨慎/证据不足)、本地理由与历史战绩数字。',
  '任务:只把这个结论用一句更自然、口语的中文重新说一遍,帮用户更快理解。',
  '严格要求:',
  '1. 不得改变结论方向,不得新增任何事实或数字,不得编造经验。',
  '2. 只输出一句话,40 字内。',
  '只输出 JSON,形如:{"advice":"…"}',
].join('\n')

export function buildAdviceUserText(scene: string, advice: DecisionAdvice): string {
  const s = advice.stats
  const rate = s.successRate !== null ? `(有效率${Math.round(s.successRate * 100)}%)` : ''
  return [
    `场景:${scene}`,
    `结论档:${advice.label}`,
    `本地理由:${advice.reason}`,
    `战绩:命中${s.ruleCount}条经验(${s.trustedCount}可信/${s.cautionCount}谨慎/${s.unprovenCount}待验证),历史${s.passed}有效/${s.failed}无效${rate}`,
  ].join('\n')
}

export async function polishAdvice(
  scene: string,
  advice: DecisionAdvice,
  client: ObservationModelClient,
): Promise<string> {
  const content = scene.trim()
  if (!content) return advice.reason
  const raw = await client.completeJson({
    systemPrompt: ADVICE_SYSTEM_PROMPT,
    userText: buildAdviceUserText(content, advice),
  })
  const value = typeof (raw as { advice?: unknown })?.advice === 'string' ? (raw as { advice: string }).advice : ''
  return validateModelField(value, advice.reason)
}
