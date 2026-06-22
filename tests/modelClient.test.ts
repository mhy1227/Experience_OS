import assert from 'node:assert/strict'
import { createModelClient } from '../src/services/modelClient'

const originalFetch = globalThis.fetch

async function testReturnsParsedJsonContent() {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"title":"超市低峰采购策略"}' } }] }),
  })) as unknown as typeof fetch

  const client = createModelClient({ provider: 'deepseek', apiKey: 'k', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' })
  const out = await client.completeJson({ systemPrompt: 's', userText: 'u' })
  assert.deepEqual(out, { title: '超市低峰采购策略' })
}

async function testThrowsOnHttpError() {
  globalThis.fetch = (async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch
  const client = createModelClient({ provider: 'deepseek', apiKey: 'bad', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' })
  await assert.rejects(() => client.completeJson({ systemPrompt: 's', userText: 'u' }))
}

async function testThrowsOnMalformedJsonContent() {
  // 模型返回的 content 是非 JSON 字符串(如纯文本或截断响应)
  // completeJson 应当抛错,而非静默返回垃圾数据
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'This is not JSON at all!!!' } }] }),
  })) as unknown as typeof fetch

  const client = createModelClient({ provider: 'deepseek', apiKey: 'k', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' })
  await assert.rejects(
    () => client.completeJson({ systemPrompt: 's', userText: 'u' }),
    (err: unknown) => err instanceof SyntaxError,
    'content 非 JSON 时 completeJson 必须抛出 SyntaxError',
  )
}

async function run() {
  try {
    await testReturnsParsedJsonContent()
    await testThrowsOnHttpError()
    await testThrowsOnMalformedJsonContent()
    console.log('modelClient tests passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

void run()
