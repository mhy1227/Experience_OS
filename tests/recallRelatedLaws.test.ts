import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useExperienceStore } from '../src/stores/experience'
import type { Law } from '../src/types/experience'

// ---------------------------------------------------------------------------
// store.recallRelatedLaws(scene):找经验时按场景召回相关「规律」。
// 复用与规则召回同一套 tokenize(中文 2-gram),匹配 theme/rootCause/suggestion。
// 覆盖:命中相关、排除 resolved、空场景、按命中数→复发数排序、取前 3。
// ---------------------------------------------------------------------------

function installLocalStorage() {
  const data = new Map<string, string>()
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size
    },
  } as Storage
}

function makeStore() {
  installLocalStorage()
  setActivePinia(createPinia())
  return useExperienceStore()
}

let seq = 0
function makeLaw(partial: Partial<Law> & { theme: string }): Law {
  seq += 1
  return {
    id: partial.id ?? `law_${seq}`,
    theme: partial.theme,
    kind: partial.kind ?? 'caution',
    rootCause: partial.rootCause ?? '',
    suggestion: partial.suggestion ?? '',
    memberObservationIds: partial.memberObservationIds ?? ['o1', 'o2'],
    recurrence: partial.recurrence ?? 2,
    firstSeenAt: partial.firstSeenAt ?? '2026-01-01T00:00:00.000Z',
    lastSeenAt: partial.lastSeenAt ?? '2026-03-01T00:00:00.000Z',
    trend: partial.trend ?? 'flat',
    confidence: partial.confidence ?? 'medium',
    status: partial.status ?? 'active',
    generatedBy: partial.generatedBy ?? 'statistical',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-03-01T00:00:00.000Z',
  }
}

// 空场景 → 空
{
  const store = makeStore()
  store.laws.push(makeLaw({ theme: '前期对齐不足导致返工' }))
  assert.deepEqual(store.recallRelatedLaws(''), [], '空场景应返回空')
  assert.deepEqual(store.recallRelatedLaws('   '), [], '纯空白应返回空')
}

// 命中相关、排除无关
{
  const store = makeStore()
  store.laws.push(
    makeLaw({ id: 'a', theme: '前期对齐不足导致返工', rootCause: '需求没对齐' }),
    makeLaw({ id: 'b', theme: '周末健身房人少', kind: 'strategy' }),
  )
  const hits = store.recallRelatedLaws('这次又因为需求对齐不足而返工了')
  assert.equal(hits.length, 1, '只应召回 1 条相关规律')
  assert.equal(hits[0].id, 'a', '应召回"对齐不足返工"那条')
}

// 排除已解决(resolved)
{
  const store = makeStore()
  store.laws.push(makeLaw({ id: 'a', theme: '前期对齐不足导致返工', status: 'resolved' }))
  assert.deepEqual(store.recallRelatedLaws('需求对齐不足返工'), [], 'resolved 规律不应被召回')
}

// 同等命中按复发次数优先;最多前 3
{
  const store = makeStore()
  store.laws.push(
    makeLaw({ id: 'low', theme: '需求评审拉测试减少返工', recurrence: 2 }),
    makeLaw({ id: 'high', theme: '需求评审拉测试减少返工', recurrence: 9 }),
    makeLaw({ id: 'mid', theme: '需求评审拉测试减少返工', recurrence: 5 }),
    makeLaw({ id: 'x', theme: '需求评审拉测试减少返工', recurrence: 1 }),
  )
  const hits = store.recallRelatedLaws('下周需求评审要拉测试')
  assert.equal(hits.length, 3, '最多返回前 3 条')
  assert.deepEqual(hits.map((l) => l.id), ['high', 'mid', 'low'], '应按复发次数降序')
}

console.log('recallRelatedLaws tests passed')
