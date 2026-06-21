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

async function run() {
  try {
    await testReturnsParsedJsonContent()
    await testThrowsOnHttpError()
    console.log('modelClient tests passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

void run()
