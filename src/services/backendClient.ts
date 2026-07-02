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
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return window.location.origin
  }
  return ''
}

export interface BackendBatchResponse {
  results: BatchItemResult[]
  truncated: boolean // 超出服务端单次上限 MAX_ITEMS,多余的未处理
  maxItems: number // 服务端单次上限(供前端提示)
}

/** 调后端 /api/analyze-batch:一次请求,服务端持 Key 批量提炼,返回结构化结果 */
export async function analyzeBatchViaBackend(
  texts: string[],
  baseUrl: string,
): Promise<BackendBatchResponse> {
  const res = await fetch(`${baseUrl}/api/analyze-batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texts }),
  })
  if (!res.ok) throw new Error(`backend HTTP ${res.status}`)
  const data = (await res.json()) as Partial<BackendBatchResponse>
  return {
    results: data.results ?? [],
    truncated: Boolean(data.truncated),
    maxItems: typeof data.maxItems === 'number' ? data.maxItems : (data.results?.length ?? 0),
  }
}
