// 前端 → 后端模型代理(B1)的薄客户端。
// 配置:localStorage key `experience-os:backend` = 后端地址(空 = 不用后端,走前端直连)。

import type { BatchItemResult } from './batchAnalysis'

const STORAGE_KEY = 'experience-os:backend'

/** 读后端地址;未配置返回空串(调用方据此回退前端直连) */
export function getBackendUrl(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && v.trim()) return v.trim().replace(/\/+$/, '')
  } catch {
    // ignore
  }
  return ''
}

/** 调后端 /api/analyze-batch:一次请求,服务端持 Key 批量提炼,返回结构化结果 */
export async function analyzeBatchViaBackend(
  texts: string[],
  baseUrl: string,
): Promise<BatchItemResult[]> {
  const res = await fetch(`${baseUrl}/api/analyze-batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texts }),
  })
  if (!res.ok) throw new Error(`backend HTTP ${res.status}`)
  const data = (await res.json()) as { results?: BatchItemResult[] }
  return data.results ?? []
}
