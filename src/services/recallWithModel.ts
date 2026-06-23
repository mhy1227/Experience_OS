// 找经验 · 模型语义召回(可选增强)。
//
// 红线:模型只能从「给定候选规则」里挑 id 并给理由,绝不创造规则、绝不写入规则库。
// parseRecallMatches 会丢弃任何不在候选集中的 id(防幻觉)。失败由调用方降级到关键词召回。
// 默认关、按需点 —— 成本只在用户显式触发时产生。
import type { ExperienceRule } from '../types/experience'
import type { ObservationModelClient } from './modelAnalysisAdapter'

export interface ModelRecallMatch {
  id: string
  why: string
}

export const RECALL_SYSTEM_PROMPT = [
  '你是「经验召回」助手。用户会给出当前面临的决策场景,以及一组候选经验规则(每条含 id / 标题 / 结论)。',
  '任务:从候选里挑出与场景【真正相关、能辅助这次决策】的规则,按相关度从高到低排序。',
  '严格要求:',
  '1. 只能选择候选列表中出现过的 id,绝不可编造或改写 id;不相关就不要选。',
  '2. 最多返回 5 条;宁缺毋滥,无相关项时返回空数组。',
  '3. why 用一句中文说明它为何与该场景相关(20 字内)。',
  '只输出 JSON,形如:{"matches":[{"id":"rule_x","why":"…"}]}',
].join('\n')

export function buildRecallUserText(
  scene: string,
  candidates: Array<Pick<ExperienceRule, 'id' | 'title' | 'conclusion'>>,
): string {
  const list = candidates
    .map((rule) => `- id=${rule.id} | 标题:${rule.title} | 结论:${rule.conclusion}`)
    .join('\n')
  return `场景:${scene}\n\n候选规则:\n${list}`
}

// 纯函数:解析模型输出,丢弃不在 validIds 中的 id(防幻觉),去重,保序。
export function parseRecallMatches(raw: unknown, validIds: Set<string>): ModelRecallMatch[] {
  const matches = (raw as { matches?: unknown })?.matches
  if (!Array.isArray(matches)) return []
  const seen = new Set<string>()
  const result: ModelRecallMatch[] = []
  for (const item of matches) {
    const id = typeof (item as { id?: unknown })?.id === 'string' ? (item as { id: string }).id : ''
    if (!id || !validIds.has(id) || seen.has(id)) continue
    const whyRaw = (item as { why?: unknown })?.why
    seen.add(id)
    result.push({ id, why: typeof whyRaw === 'string' && whyRaw.trim() ? whyRaw.trim() : '模型判断与该场景相关' })
    if (result.length >= 5) break
  }
  return result
}

// 调用模型召回。返回有序的 {rule, why};失败抛出由调用方降级。候选裁到前 maxCandidates 条以控 token。
export async function recallRulesWithModel(
  scene: string,
  rules: ExperienceRule[],
  client: ObservationModelClient,
  maxCandidates = 40,
): Promise<Array<{ rule: ExperienceRule; why: string }>> {
  const content = scene.trim()
  if (!content || rules.length === 0) return []

  const candidates = rules.slice(0, maxCandidates)
  const raw = await client.completeJson({
    systemPrompt: RECALL_SYSTEM_PROMPT,
    userText: buildRecallUserText(content, candidates),
  })

  const byId = new Map(candidates.map((rule) => [rule.id, rule]))
  return parseRecallMatches(raw, new Set(byId.keys()))
    .map((match) => ({ rule: byId.get(match.id)!, why: match.why }))
    .filter((entry) => Boolean(entry.rule))
}
