import { test } from "node:test"
import assert from "node:assert/strict"
import extension from "../index.mjs"
import { API_KEY_ENV, OFFICIAL_BASE_URL, attributionHeaders } from "../src/config.mjs"
import { clearCatalogCache } from "../src/catalog.mjs"
import { refreshModels } from "../src/register.mjs"

const row = {
  id: "openai/gpt-5.4-mini",
  display_name: "GPT-5.4 Mini",
  capabilities: ["chat", "reasoning", "vision"],
  context_length: 400_000,
  architecture: { input_modalities: ["text", "image"] },
  pricing: { input_per_1m: 0.75, output_per_1m: 4.5, input_cache_read_per_1m: 0.075 },
  top_provider: { max_completion_tokens: 128_000 },
  supported_parameters: ["max_tokens", "tools", "reasoning_effort"],
}

function stubFetch(body) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return { ok: true, status: 200, url: String(url), json: async () => body }
  }
  return {
    calls,
    restore() {
      globalThis.fetch = original
    },
  }
}

test("the extension registers one openai-completions provider on the official root", () => {
  const calls = []
  extension({
    registerProvider(id, config) {
      calls.push({ id, config })
    },
  })
  assert.equal(calls.length, 1)
  const { id, config } = calls[0]
  assert.equal(id, "anyrouter")
  assert.equal(config.name, "AnyRouter")
  assert.equal(config.baseUrl, OFFICIAL_BASE_URL)
  assert.equal(config.api, "openai-completions")
  assert.equal(config.apiKey, `$${API_KEY_ENV}`)
  assert.equal(config.streamSimple, undefined)
  assert.equal(config.models, undefined)
  assert.deepEqual(config.headers, attributionHeaders())
  assert.equal(typeof config.refreshModels, "function")
})

test("an offline refresh does not fetch and does not return an empty list", async () => {
  clearCatalogCache()
  const stub = stubFetch({ data: [row] })
  try {
    const models = await refreshModels({ allowNetwork: false, signal: new AbortController().signal })
    assert.equal(models, undefined)
    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test("a refresh uses the resolved credential rather than the environment", async () => {
  clearCatalogCache()
  const stub = stubFetch({ data: [row] })
  const previous = process.env[API_KEY_ENV]
  process.env[API_KEY_ENV] = "sk-ar-v1-from-env"
  try {
    const models = await refreshModels({
      allowNetwork: true,
      credential: { type: "api_key", key: "sk-ar-v1-stored" },
      signal: new AbortController().signal,
    })
    assert.equal(models[0].id, row.id)
    assert.equal(models[0].compat.maxTokensField, "max_tokens")
    assert.equal(stub.calls[0].init.headers.authorization, "Bearer sk-ar-v1-stored")
    assert.equal(stub.calls[0].url, `${OFFICIAL_BASE_URL}/models`)
  } finally {
    stub.restore()
    if (previous === undefined) delete process.env[API_KEY_ENV]
    else process.env[API_KEY_ENV] = previous
  }
})
