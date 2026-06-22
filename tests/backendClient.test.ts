import assert from 'node:assert/strict'
import { analyzeBatchViaBackend } from '../src/services/backendClient'

const originalFetch = globalThis.fetch

async function testReturnsResults() {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ results: [{ text: 'x', ok: true, analysis: { title: '避坑规则' } }] }),
  })) as unknown as typeof fetch
  const r = await analyzeBatchViaBackend(['x'], 'http://localhost:8787')
  assert.equal(r.length, 1)
  assert.equal(r[0].analysis.title, '避坑规则')
}

async function testThrowsOnHttpError() {
  globalThis.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
  await assert.rejects(() => analyzeBatchViaBackend(['x'], 'http://localhost:8787'))
}

async function run() {
  try {
    await testReturnsResults()
    await testThrowsOnHttpError()
    console.log('backendClient tests passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

void run()
