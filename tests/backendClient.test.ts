import assert from 'node:assert/strict'
import { analyzeBatchViaBackend } from '../src/services/backendClient'

const originalFetch = globalThis.fetch

async function testReturnsResults() {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      results: [{ text: 'x', ok: true, analysis: { title: '避坑规则' } }],
      truncated: false,
      maxItems: 100,
    }),
  })) as unknown as typeof fetch
  const r = await analyzeBatchViaBackend(['x'], 'http://localhost:8787')
  assert.equal(r.results.length, 1)
  assert.equal(r.results[0].analysis.title, '避坑规则')
  assert.equal(r.truncated, false)
  assert.equal(r.maxItems, 100)
}

async function testReportsTruncation() {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ results: [{ text: 'a', ok: true, analysis: {} }], truncated: true, maxItems: 1 }),
  })) as unknown as typeof fetch
  const r = await analyzeBatchViaBackend(['a', 'b'], 'http://localhost:8787')
  assert.equal(r.truncated, true)
  assert.equal(r.maxItems, 1)
}

async function testThrowsOnHttpError() {
  globalThis.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
  await assert.rejects(() => analyzeBatchViaBackend(['x'], 'http://localhost:8787'))
}

async function run() {
  try {
    await testReturnsResults()
    await testReportsTruncation()
    await testThrowsOnHttpError()
    console.log('backendClient tests passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

void run()
