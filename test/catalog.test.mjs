import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  CATALOG_TTL_MS,
  OFFICIAL_BASE_URL,
  OFFICIAL_MESSAGES_URL,
  assertOfficialBaseUrl,
  clearCatalogCache,
  fetchCatalog,
  mapModel,
} from "../src/catalog.mjs"

const row = {
  id: "openai/gpt-6-luna",
  display_name: "GPT-6 Luna",
  capabilities: ["reasoning", "tool-use"],
  context_length: 1_000_000,
  max_output_tokens: 64_000,
  pricing: { input_per_1m: "0.02", output_per_1m: "0.1", input_cache_read_per_1m: "0.002" },
}

function stubFetch(handler) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return handler(calls.length)
  }
  return {
    calls,
    restore() {
      globalThis.fetch = original
    },
  }
}

const jsonResponse = (body) => ({ ok: true, json: async () => body })
const catalogBody = { data: [row] }

test("the provider pins the official AnyRouter endpoints", () => {
  assert.equal(OFFICIAL_BASE_URL, "https://anyrouter.dev/api/v1")
  assert.equal(OFFICIAL_MESSAGES_URL, "https://anyrouter.dev/api")
  assert.equal(CATALOG_TTL_MS, 5 * 60 * 1000)
  assert.equal(assertOfficialBaseUrl(), OFFICIAL_BASE_URL)
})

test("a non-official base URL is refused before any request", () => {
  assert.throws(() => assertOfficialBaseUrl("https://example.com/v1"), /non-official/)
  assert.throws(() => assertOfficialBaseUrl("https://anyrouter.dev/api"), /non-official/)
})

test("a catalog row maps to a pi chat model with cost and limits", () => {
  const model = mapModel(row)
  assert.equal(model.type, "chat")
  assert.equal(model.id, "openai/gpt-6-luna")
  assert.equal(model.name, "GPT-6 Luna")
  assert.equal(model.reasoning, true)
  assert.deepEqual(model.input, ["text"])
  assert.deepEqual(model.cost, { input: 0.02, output: 0.1, cacheRead: 0.002, cacheWrite: 0 })
  assert.equal(model.contextWindow, 1_000_000)
  assert.equal(model.maxTokens, 64_000)
})

test("vision and reasoning flags drive the input and reasoning fields", () => {
  const vision = mapModel({ ...row, capabilities: ["vision"] })
  assert.deepEqual(vision.input, ["text", "image"])
  assert.equal(vision.reasoning, false)
})

test("a thin row falls back to safe defaults", () => {
  const model = mapModel({ id: "acme/plain", name: "Plain" })
  assert.equal(model.name, "Plain")
  assert.equal(model.reasoning, false)
  assert.deepEqual(model.input, ["text"])
  assert.equal(model.contextWindow, 128_000)
  assert.equal(model.maxTokens, 8_192)
  assert.deepEqual(model.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
})

test("a fetch sends the key and maps the catalog", async () => {
  clearCatalogCache()
  const stub = stubFetch(() => jsonResponse(catalogBody))
  try {
    const models = await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    assert.equal(models.length, 1)
    assert.equal(models[0].id, "openai/gpt-6-luna")
    assert.equal(stub.calls.length, 1)
    assert.equal(stub.calls[0].url, `${OFFICIAL_BASE_URL}/models`)
    assert.equal(stub.calls[0].init.headers.authorization, "Bearer sk-ar-v1-test")
  } finally {
    stub.restore()
  }
})

test("a fresh catalog is served from the cache without a second request", async () => {
  clearCatalogCache()
  const stub = stubFetch(() => jsonResponse(catalogBody))
  try {
    await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    const second = await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    assert.equal(stub.calls.length, 1)
    assert.equal(second[0].id, "openai/gpt-6-luna")
  } finally {
    stub.restore()
  }
})

test("concurrent refreshes share one request", async () => {
  clearCatalogCache()
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const stub = stubFetch(() =>
    gate.then(() => jsonResponse(catalogBody)),
  )
  try {
    const first = fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    const second = fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    release()
    const [a, b] = await Promise.all([first, second])
    assert.equal(stub.calls.length, 1)
    assert.deepEqual(a, b)
  } finally {
    stub.restore()
  }
})

test("a failed fetch clears the cache so the next call retries", async () => {
  clearCatalogCache()
  let fail = true
  const stub = stubFetch(() => {
    if (fail) {
      return { ok: false, status: 503, json: async () => ({}) }
    }
    return jsonResponse(catalogBody)
  })
  try {
    await assert.rejects(() => fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test"), /HTTP 503/)
    assert.equal(stub.calls.length, 1)
    fail = false
    const models = await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    assert.equal(stub.calls.length, 2)
    assert.equal(models[0].id, "openai/gpt-6-luna")
  } finally {
    stub.restore()
  }
})

test("the shipped files name the official domain", () => {
  for (const file of ["index.mjs", "README.md", "package.json"]) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
    assert.ok(text.includes("anyrouter.dev"), `${file} must name the official domain`)
  }
})
