import type { AnalysisResult, DemoSample, ExperienceCategory, Reusability } from '../types/experience'
import { assertValidAnalysis, watchResult } from './analysisContract'

export const demoSamples: DemoSample[] = [
  {
    label: '面包时间',
    text: '工作日上午11点去楼下面包店，吐司刚出炉最好吃',
  },
  {
    label: '健身低峰',
    text: '周末10点健身房人少，器械不用排队',
  },
  {
    label: '雨天路线',
    text: '下雨天走B口到公司更近，还不用绕路',
  },
  {
    label: '宠物用品',
    text: '浅口猫碗比深口猫碗更适合，猫吃得更干净',
  },
  {
    label: '写作时段',
    text: '上午10点写方案最顺，下午3点容易卡住',
  },
  {
    label: '超市低峰',
    text: '工作日晚上8点去小区超市，结账排队明显更短',
  },
  {
    label: '会议准备',
    text: '周二下午项目会提前发议程，讨论更聚焦，跑题更少',
  },
  {
    label: '午后恢复',
    text: '午休后散步10分钟，下午开会不容易犯困',
  },
]

type AnalysisRule = {
  id: string
  category: ExperienceCategory
  triggers: string[]
  tagCandidates: string[]
  outcomeProfile: OutcomeProfile
  result: Omit<AnalysisResult, 'category' | 'tags'>
}

type OutcomeProfile = {
  supportKeywords: string[]
  supportPatterns?: RegExp[]
  contradictionKeywords: string[]
  contradictionPatterns?: RegExp[]
}

type ExtractedSignals = {
  normalized: string
  times: string[]
  locations: string[]
  resultMarkers: string[]
  hasCondition: boolean
  hasOutcome: boolean
}

type ScoredRule = {
  rule: AnalysisRule
  score: number
  matchedTriggers: string[]
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const rules: AnalysisRule[] = [
  {
    id: 'bakery-time',
    category: '饮食',
    triggers: ['面包', '吐司', '刚出炉', '面包店'],
    tagCandidates: ['工作日', '上午', '11点', '面包', '吐司', '刚出炉'],
    outcomeProfile: {
      supportKeywords: ['刚出炉', '最好吃', '好吃', '新鲜'],
      contradictionKeywords: ['没出炉', '卖完', '不好吃', '冷了', '一般'],
    },
    result: {
      summary: '这条观察包含明确的时间和食物体验，适合沉淀为购买时间策略。',
      title: '面包购买时间策略',
      conclusion: '楼下面包店在工作日上午11点附近更可能遇到刚出炉吐司。',
      recommendation: '下次想买吐司时，优先在工作日10:50-11:20到店。',
      conditions: ['工作日', '上午11点前后', '目标是买到刚出炉吐司'],
      warnings: ['节假日、门店排班或售罄情况可能影响结果'],
      reusability: 'high',
      location: '楼下面包店',
    },
  },
  {
    id: 'gym-offpeak',
    category: '运动',
    triggers: ['健身', '健身房', '器械', '训练', '跑步'],
    tagCandidates: ['周末', '10点', '健身房', '人少', '器械'],
    outcomeProfile: {
      supportKeywords: ['人少', '不用排队', '不用等', '不排队', '低峰', '器械不用排'],
      contradictionKeywords: ['人很多', '人多', '很挤', '排队很久', '排队明显更长', '器械要排队', '器械排队'],
    },
    result: {
      summary: '这条观察包含时间、人流和训练目标，适合沉淀为低峰训练策略。',
      title: '周末低峰训练策略',
      conclusion: '周末10点附近健身房人流较少，器械等待时间更低。',
      recommendation: '周末优先在9:45-10:30到达健身房进行器械训练。',
      conditions: ['周末', '上午10点前后', '目标是减少器械排队'],
      warnings: ['节假日、课程安排或活动促销可能改变人流'],
      reusability: 'high',
      location: '健身房',
    },
  },
  {
    id: 'rain-route',
    category: '出行',
    triggers: ['下雨', '雨天', 'b口', '路线', '通勤'],
    tagCandidates: ['下雨天', 'B口', '公司', '路线', '不用绕路'],
    outcomeProfile: {
      supportKeywords: ['更近', '不用绕路', '不用绕', '少绕路', '更快', '更直接'],
      contradictionKeywords: ['更远', '要绕路', '还要绕', '更慢', '绕路更多', '不近'],
    },
    result: {
      summary: '这条观察包含天气、入口和目的地，适合沉淀为通勤路线策略。',
      title: '雨天通勤入口策略',
      conclusion: '下雨天走B口到公司更直接，能减少绕路和暴露在雨中的时间。',
      recommendation: '雨天通勤优先选择B口，并把它作为默认雨天路线。',
      conditions: ['下雨天', '目的地是公司', '目标是减少绕行'],
      warnings: ['施工、封口或人流管制时需要重新验证'],
      reusability: 'medium',
      location: 'B口',
    },
  },
  {
    id: 'cat-bowl',
    category: '购物',
    triggers: ['猫', '猫碗', '浅口', '深口', '宠物用品'],
    tagCandidates: ['猫碗', '浅口', '深口', '吃得干净'],
    outcomeProfile: {
      supportKeywords: ['更适合', '吃得更干净', '吃得干净', '残留更少', '更顺'],
      contradictionKeywords: ['不适合', '吃不干净', '剩很多', '残留很多', '不爱吃'],
    },
    result: {
      summary: '这条观察体现了具体用品选择和使用结果，适合沉淀为偏好规则。',
      title: '猫碗选择策略',
      conclusion: '浅口猫碗更符合当前宠物进食习惯，食物残留更少。',
      recommendation: '后续购买猫碗时优先选择浅口、宽口、低边设计。',
      conditions: ['当前宠物偏好', '目标是进食更顺畅', '对比对象是深口猫碗'],
      warnings: ['不同猫的脸型、胡须敏感度和食物类型可能影响结果'],
      reusability: 'medium',
      location: '家',
    },
  },
  {
    id: 'supermarket-offpeak',
    category: '购物',
    triggers: ['超市', '结账', '排队', '收银'],
    tagCandidates: ['工作日', '晚上8点', '小区超市', '结账', '排队更短'],
    outcomeProfile: {
      supportKeywords: ['排队明显更短', '排队更短', '不用排队', '结账快', '人少', '等待更短'],
      contradictionKeywords: ['排队很长', '排队更长', '人很多', '人多', '很挤', '等很久', '等待更久'],
    },
    result: {
      summary: '这条观察包含地点、时间和等待成本，适合沉淀为采购低峰策略。',
      title: '超市低峰采购策略',
      conclusion: '工作日晚上8点附近去小区超市，结账等待时间更短。',
      recommendation: '非紧急采购优先安排在工作日20:00前后完成。',
      conditions: ['工作日晚上', '目标是减少结账排队', '地点是小区超市'],
      warnings: ['促销日、节假日前和天气变化可能改变人流'],
      reusability: 'medium',
      location: '小区超市',
    },
  },
  {
    id: 'meeting-agenda',
    category: '工作',
    triggers: ['会议', '议程', '讨论', '跑题', '项目会'],
    tagCandidates: ['周二', '下午', '项目会', '提前发议程', '讨论更聚焦'],
    outcomeProfile: {
      supportKeywords: ['更聚焦', '跑题更少', '减少跑题', '效率更高', '讨论更集中'],
      contradictionKeywords: ['还是跑题', '跑题更多', '没用', '不聚焦', '更散', '讨论发散'],
    },
    result: {
      summary: '这条观察包含会议准备动作和会议效果，适合沉淀为协作策略。',
      title: '会议议程前置策略',
      conclusion: '项目会前提前发出议程，能让讨论更聚焦并减少跑题。',
      recommendation: '每次项目会至少提前半天发出议程和预期结论。',
      conditions: ['多人讨论', '目标是提高会议效率', '议题需要形成结论'],
      warnings: ['紧急会议或信息不完整时，议程需要保留弹性'],
      reusability: 'high',
      location: '会议室',
    },
  },
  {
    id: 'afternoon-recovery',
    category: '生活',
    triggers: ['午休', '散步', '犯困', '恢复', '开会'],
    tagCandidates: ['午休后', '散步10分钟', '下午', '开会', '不容易犯困'],
    outcomeProfile: {
      supportKeywords: ['不容易犯困', '更清醒', '恢复', '精神更好', '不困'],
      contradictionKeywords: ['还是犯困', '更困', '没精神', '没用', '照样犯困'],
    },
    result: {
      summary: '这条观察包含具体恢复动作和下午状态变化，适合沉淀为精力管理策略。',
      title: '午后精力恢复策略',
      conclusion: '午休后短时间散步有助于降低下午会议犯困概率。',
      recommendation: '午休后预留10分钟轻量散步，再进入下午会议或沟通任务。',
      conditions: ['午休后', '下午有会议', '目标是恢复清醒度'],
      warnings: ['天气、身体状态和会议强度会影响效果'],
      reusability: 'medium',
      location: '办公区',
    },
  },
  {
    id: 'writing-focus',
    category: '工作',
    triggers: ['方案', '写方案', '写作', '卡住', '效率'],
    tagCandidates: ['上午10点', '写方案', '下午3点', '卡住'],
    outcomeProfile: {
      supportKeywords: ['上午10点写方案最顺', '上午10点写方案很顺', '上午写方案最顺', '下午3点容易卡住', '下午3点更容易卡住'],
      supportPatterns: [/上午.*写.*(顺|效率高|高效)/, /下午.*(卡住|效率低|不顺)/],
      contradictionKeywords: ['下午3点最顺', '下午3点更顺', '上午10点容易卡住', '上午写方案卡住'],
      contradictionPatterns: [/上午.*写.*(卡住|效率低|不顺)/, /下午.*写.*(顺|效率高|高效)/],
    },
    result: {
      summary: '这条观察包含任务类型和时间状态，适合沉淀为工作安排策略。',
      title: '高专注写作时间策略',
      conclusion: '上午10点更适合处理方案写作，下午3点更容易出现卡顿。',
      recommendation: '把复杂写作任务安排在上午10点前后，下午3点改做整理或沟通类任务。',
      conditions: ['任务是方案写作', '需要高专注', '上午状态较稳定'],
      warnings: ['睡眠、会议安排和截止时间会影响实际状态'],
      reusability: 'high',
      location: '办公区',
    },
  },
]

export async function analyzeObservation(text: string): Promise<AnalysisResult> {
  const content = text.trim()
  if (content.length < 4) {
    throw new Error('Observation is too short to analyze.')
  }

  await wait(260)

  const result = analyzeByStructuredPipeline(content)
  assertValidAnalysis(result)
  return result
}

function analyzeByStructuredPipeline(text: string): AnalysisResult {
  const signals = extractSignals(text)
  const best = scoreRules(signals)[0]

  if (best && best.score >= 3 && outcomeAlignmentFor(best.rule, signals.normalized) === 'supported') {
    return materializeRule(best, signals, text)
  }

  return createWatchResult(text, signals)
}

function extractSignals(text: string): ExtractedSignals {
  const normalized = text.toLowerCase()
  const times = matchAll(text, /(工作日|周末|周[一二三四五六日天]|上午|下午|中午|晚上|早上|午休后|\d{1,2}点(?:半)?|\d{1,2}:\d{2})/g)
  const locations = matchAll(text, /(楼下面包店|小区超市|健身房|B口|公司|会议室|办公区|家)/g)
  const resultMarkers = ['更', '最', '不用', '不容易', '减少', '更短', '更近', '更少', '更干净', '卡住'].filter((item) =>
    text.includes(item),
  )
  const negativeResultMarkers = ['人很多', '人多', '很挤', '排队很久', '排队更长', '更远', '更慢', '不适合', '吃不干净', '还是犯困', '没用'].filter((item) =>
    text.includes(item),
  )

  return {
    normalized,
    times: unique(times),
    locations: unique(locations),
    resultMarkers: unique([...resultMarkers, ...negativeResultMarkers]),
    hasCondition: times.length > 0 || locations.length > 0 || /如果|当|在|去|走|用|提前/.test(text),
    hasOutcome: resultMarkers.length > 0 || negativeResultMarkers.length > 0 || /适合|顺|少|短|近|干净|聚焦|犯困|排队/.test(text),
  }
}

function scoreRules(signals: ExtractedSignals): ScoredRule[] {
  return rules
    .map((rule) => {
      const matchedTriggers = rule.triggers.filter((trigger) => signals.normalized.includes(trigger.toLowerCase()))
      const conditionScore = signals.hasCondition ? 1 : 0
      const outcomeScore = signals.hasOutcome ? 1 : 0
      const score = matchedTriggers.length * 3 + conditionScore + outcomeScore
      return { rule, score, matchedTriggers }
    })
    .filter((item) => item.matchedTriggers.length > 0)
    .sort((a, b) => b.score - a.score)
}

function materializeRule(match: ScoredRule, signals: ExtractedSignals, text: string): AnalysisResult {
  const { rule } = match
  const tags = unique([...pickTags(text, rule.tagCandidates), ...signals.times, ...signals.resultMarkers])
  const result: AnalysisResult = {
    category: rule.category,
    tags,
    ...rule.result,
    kind: 'strategy',
    direction: 'positive',
  }

  if (!result.location && signals.locations.length > 0) {
    result.location = signals.locations[0]
  }

  return withMinimumTags(result)
}

function outcomeAlignmentFor(rule: AnalysisRule, text: string): 'supported' | 'contradicted' | 'missing' {
  const supportCount = countOutcomeMatches(text, rule.outcomeProfile.supportKeywords, rule.outcomeProfile.supportPatterns)
  const contradictionCount = countOutcomeMatches(text, rule.outcomeProfile.contradictionKeywords, rule.outcomeProfile.contradictionPatterns)

  if (contradictionCount > 0) return 'contradicted'
  if (supportCount > 0) return 'supported'
  return 'missing'
}

function countOutcomeMatches(text: string, keywords: string[], patterns: RegExp[] = []) {
  return keywords.filter((keyword) => text.includes(keyword.toLowerCase())).length + patterns.filter((pattern) => pattern.test(text)).length
}

function createWatchResult(text: string, signals: ExtractedSignals): AnalysisResult {
  const category = inferCategory(signals.normalized)
  const tags = unique([...inferTags(text), ...signals.times, ...signals.locations, ...signals.resultMarkers])
  return watchResult(text, category, tags, signals.locations[0])
}

function withMinimumTags(result: AnalysisResult): AnalysisResult {
  return {
    ...result,
    tags: result.tags.length > 0 ? result.tags : ['待观察'],
  }
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()))
}

function pickTags(text: string, candidates: string[]) {
  return candidates.filter((tag) => text.includes(tag) || text.toLowerCase().includes(tag.toLowerCase()))
}

function inferCategory(text: string): ExperienceCategory {
  if (hasAny(text, ['买', '购物', '适合', '超市', '结账'])) return '购物'
  if (hasAny(text, ['路', '车', '地铁', '走', '通勤'])) return '出行'
  if (hasAny(text, ['健身', '跑步', '训练'])) return '运动'
  if (hasAny(text, ['工作', '会议', '方案', '写'])) return '工作'
  if (hasAny(text, ['午休', '散步', '睡眠', '犯困'])) return '生活'
  if (hasAny(text, ['喜欢', '舒服', '偏好'])) return '偏好'
  return '其他'
}

function inferTags(text: string) {
  const tags: string[] = []
  if (/\d+点/.test(text)) tags.push('时间')
  if (text.includes('周末')) tags.push('周末')
  if (text.includes('工作日')) tags.push('工作日')
  if (text.includes('下雨') || text.includes('雨天')) tags.push('天气')
  return tags
}

function matchAll(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern), (match) => match[0])
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

export function reusabilityLabel(value: Reusability) {
  const map: Record<Reusability, string> = {
    high: '高',
    medium: '中',
    low: '低',
    watch: '待观察',
  }
  return map[value]
}
