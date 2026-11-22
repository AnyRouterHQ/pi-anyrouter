import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import {
  CATALOG_TTL_MS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  OFFICIAL_BASE_URL,
  OFFICIAL_MESSAGES_URL,
  assertOfficialBaseUrl,
  attributionHeaders,
  clearCatalogCache,
  fetchCatalog,
  mapModel,
  thinkingLevelMap,
} from "../src/catalog.mjs"

/** Shape taken from GET /api/v1/models/anthropic/claude-sonnet-4-6. */
const claude = {
  id: "anthropic/claude-sonnet-4-6",
  display_name: "Claude Sonnet 4.6",
  capabilities: ["chat", "streaming", "function-calling", "coding"],
  context_length: 1_000_000,
  architecture: { input_modalities: ["text", "image", "file"] },
  pricing: {
    input_per_1m: 3,
    output_per_1m: 15,
    input_cache_read_per_1m: 0.3,
    billing: "byok",
    list_pricing: { input_per_1m: 99 },
  },
  top_provider: { max_completion_tokens: 64_000 },
  supported_parameters: [
    "max_tokens",
    "temperature",
    "tools",
    "reasoning",
    "include_reasoning",
    "structured_outputs",
  ],
  per_upstream: [{ pricing: { input_per_1m: 0, input_cache_write_per_1m: 0 } }],
}

const jsonResponse = (body, url = `${OFFICIAL_BASE_URL}/models`) => ({
  ok: true,
  status: 200,
  url,
  json: async () => body,
})

function abortError() {
  return new DOMException("The operation was aborted", "AbortError")
}

function stubFetch(handler) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    const response = handler(calls.length, String(url), init)
    if (!init?.signal) return response
    const aborted = new Promise((_, reject) => {
      if (init.signal.aborted) {
        reject(abortError())
        return
      }
      init.signal.addEventListener("abort", () => reject(abortError()), { once: true })
    })
    return Promise.race([Promise.resolve(response), aborted])
  }
  return {
    calls,
    restore() {
      globalThis.fetch = original
    },
  }
}

test("the chat root is the official one and the messages root is not a chat root", () => {
  assert.equal(OFFICIAL_BASE_URL, "https://anyrouter.dev/api/v1")
  assert.equal(OFFICIAL_MESSAGES_URL, "https://anyrouter.dev/api")
  assert.equal(CATALOG_TTL_MS, 5 * 60 * 1000)
  assert.equal(assertOfficialBaseUrl(), OFFICIAL_BASE_URL)
  assert.throws(() => assertOfficialBaseUrl("https://anyrouter.dev/api"), /non-official/)
  assert.throws(() => assertOfficialBaseUrl("https://example.com/api/v1"), /non-official/)
})

test("a non-official base URL is refused before any request", async () => {
  clearCatalogCache()
  const stub = stubFetch(() => jsonResponse({ data: [] }))
  try {
    await assert.rejects(() => fetchCatalog("https://example.com/v1", "sk-ar-v1-test"), /non-official/)
    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test("a Claude row takes vision from input modalities, not the capability list", () => {
  const model = mapModel(claude)
  assert.equal(model.id, "anthropic/claude-sonnet-4-6")
  assert.equal(model.name, "Claude Sonnet 4.6")
  assert.deepEqual(model.input, ["text", "image"])
  assert.equal(model.reasoning, true)
  assert.equal(model.contextWindow, 1_000_000)
  assert.equal(model.maxTokens, 64_000)
})

test("cost is the top-level rate, not a BYOK upstream zero or list price", () => {
  const model = mapModel(claude)
  assert.deepEqual(model.cost, { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 })
})

test("reasoning is sent as reasoning.effort when that is the only listed parameter", () => {
  const model = mapModel(claude)
  assert.equal(model.compat.thinkingFormat, "openrouter")
  assert.equal(model.compat.supportsReasoningEffort, false)
})

test("reasoning_effort wins when the row lists both reasoning parameters", () => {
  const model = mapModel({
    ...claude,
    id: "openai/gpt-5.4-mini",
    supported_parameters: ["max_tokens", "reasoning", "reasoning_effort"],
    reasoning: { levels: ["low", "medium", "high", "xhigh", "max"], default: "medium" },
  })
  assert.equal(model.compat.thinkingFormat, "openai")
  assert.equal(model.compat.supportsReasoningEffort, true)
  assert.equal(model.thinkingLevelMap.medium, "medium")
  assert.equal(model.thinkingLevelMap.off, null)
  assert.equal(model.thinkingLevelMap.minimal, null)
  assert.equal(model.thinkingLevelMap.high, "high")
})

test("a reasoning capability without a reasoning parameter does not invent a request field", () => {
  const model = mapModel({
    ...claude,
    id: "cohere/north-mini-code",
    capabilities: ["chat", "reasoning"],
    architecture: { input_modalities: ["text"] },
    supported_parameters: ["max_tokens", "temperature", "tools"],
    reasoning: { levels: ["high"], default: "high" },
  })
  assert.equal(model.reasoning, true)
  assert.equal(model.compat.supportsReasoningEffort, false)
  assert.equal(model.compat.thinkingFormat, "openai")
  assert.equal(model.thinkingLevelMap, undefined)
  assert.deepEqual(model.input, ["text"])
})

test("max_completion_tokens is used only when max_tokens is not a listed parameter", () => {
  const onlyCompletion = mapModel({
    ...claude,
    id: "openai/gpt-5.2-chat",
    supported_parameters: ["max_completion_tokens", "tools"],
  })
  assert.equal(onlyCompletion.compat.maxTokensField, "max_completion_tokens")
  const both = mapModel({
    ...claude,
    supported_parameters: ["max_tokens", "max_completion_tokens"],
  })
  assert.equal(both.compat.maxTokensField, "max_tokens")
})

test("compat stays inside the documented chat fields", () => {
  const model = mapModel(claude)
  assert.equal(model.compat.supportsStore, false)
  assert.equal(model.compat.supportsDeveloperRole, false)
  assert.equal(model.compat.supportsLongCacheRetention, false)
  assert.equal(model.compat.supportsStrictMode, false)
  assert.equal(model.compat.supportsUsageInStreaming, true)
  assert.equal(model.compat.sessionAffinityFormat, "openrouter")
  assert.equal(model.baseUrl, undefined)
})

test("a missing completion cap uses the conservative default", () => {
  const model = mapModel({ ...claude, top_provider: { max_completion_tokens: null } })
  assert.equal(model.maxTokens, DEFAULT_MAX_OUTPUT_TOKENS)
})

test("vision capability is the fallback when modalities are absent", () => {
  const model = mapModel({
    ...claude,
    architecture: undefined,
    capabilities: ["chat", "vision"],
    supported_parameters: ["max_tokens"],
  })
  assert.deepEqual(model.input, ["text", "image"])
  assert.equal(model.reasoning, false)
})

test("embeddings, deciders and a zero context window are not chat models", () => {
  assert.equal(mapModel({ id: "baai/bge-m3", capabilities: ["embedding"], context_length: 8192 }), null)
  assert.equal(mapModel({ id: "anyrouter/decision", capabilities: ["systemone"], context_length: 8192 }), null)
  assert.equal(
    mapModel({ id: "subquadratic/subq-preview", capabilities: ["chat"], context_length: 0, top_provider: { context_length: 0 } }),
    null,
  )
  assert.equal(mapModel({ capabilities: ["chat"], context_length: 1000 }), null)
})

test("thinking levels outside the row are hidden and none can stand in for off", () => {
  const map = thinkingLevelMap(["none", "high"])
  assert.equal(map.off, "none")
  assert.equal(map.high, "high")
  assert.equal(map.low, null)
  assert.equal(map.max, null)
})

test("a fetch sends the key and attribution headers and drops non-chat rows", async () => {
  clearCatalogCache()
  const stub = stubFetch(() =>
    jsonResponse({
      data: [claude, { id: "baai/bge-m3", capabilities: ["embedding"], context_length: 512 }],
    }),
  )
  try {
    const models = await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    assert.deepEqual(models.map((model) => model.id), ["anthropic/claude-sonnet-4-6"])
    assert.equal(stub.calls[0].url, `${OFFICIAL_BASE_URL}/models`)
    assert.equal(stub.calls[0].init.headers.authorization, "Bearer sk-ar-v1-test")
    assert.equal(stub.calls[0].init.headers["X-AnyRouter-Title"], attributionHeaders()["X-AnyRouter-Title"])
    assert.equal(stub.calls[0].init.headers["HTTP-Referer"], "https://anyrouter.dev/")
    assert.equal(stub.calls[0].init.redirect, "error")
  } finally {
    stub.restore()
  }
})

test("an anonymous fetch omits Authorization", async () => {
  clearCatalogCache()
  const stub = stubFetch(() => jsonResponse({ data: [claude] }))
  try {
    await fetchCatalog(OFFICIAL_BASE_URL, "")
    assert.equal(stub.calls[0].init.headers.authorization, undefined)
  } finally {
    stub.restore()
  }
})

test("a catalog response that leaves the official root is refused and not cached", async () => {
  clearCatalogCache()
  let official = false
  const stub = stubFetch(() => {
    if (!official) {
      return jsonResponse({ data: [claude] }, "https://example.com/api/v1/models")
    }
    return jsonResponse({ data: [claude] })
  })
  try {
    await assert.rejects(() => fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test"), /refusing a catalog response/)
    official = true
    const models = await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    assert.equal(stub.calls.length, 2)
    assert.equal(models[0].id, claude.id)
  } finally {
    stub.restore()
  }
})

test("a fresh catalog is served from the cache for the same key only", async () => {
  clearCatalogCache()
  const stub = stubFetch(() => jsonResponse({ data: [claude] }))
  try {
    await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-a")
    await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-a")
    await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-b")
    assert.equal(stub.calls.length, 2)
    assert.equal(stub.calls[1].init.headers.authorization, "Bearer sk-ar-v1-b")
  } finally {
    stub.restore()
  }
})

test("force skips a completed cache entry and joins an in-flight request", async () => {
  clearCatalogCache()
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const stub = stubFetch(() => gate.then(() => jsonResponse({ data: [claude] })))
  try {
    const first = fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    const second = fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test", undefined, { force: true })
    release()
    const [a, b] = await Promise.all([first, second])
    assert.equal(stub.calls.length, 1)
    assert.equal(a[0].id, b[0].id)
    const third = await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test", undefined, { force: true })
    assert.equal(stub.calls.length, 2)
    assert.equal(third[0].id, claude.id)
  } finally {
    stub.restore()
  }
})

test("a failed fetch clears that key so the next call retries", async () => {
  clearCatalogCache()
  let fail = true
  const stub = stubFetch(() => {
    if (fail) return { ok: false, status: 503, url: `${OFFICIAL_BASE_URL}/models`, json: async () => ({}) }
    return jsonResponse({ data: [claude] })
  })
  try {
    await assert.rejects(() => fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test"), /HTTP 503/)
    fail = false
    const models = await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    assert.equal(stub.calls.length, 2)
    assert.equal(models[0].id, claude.id)
  } finally {
    stub.restore()
  }
})

test("a body without a data array is an error, not an empty catalog", async () => {
  clearCatalogCache()
  const stub = stubFetch(() => jsonResponse({ object: "list" }))
  try {
    await assert.rejects(() => fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test"), /no data array/)
  } finally {
    stub.restore()
  }
})

test("aborting the caller aborts the catalog fetch", async () => {
  clearCatalogCache()
  const stub = stubFetch(() => new Promise(() => {}))
  const controller = new AbortController()
  try {
    const pending = fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test", controller.signal)
    assert.equal(stub.calls.length, 1)
    assert.equal(stub.calls[0].init.signal.aborted, false)
    controller.abort()
    assert.equal(stub.calls[0].init.signal.aborted, true)
    await assert.rejects(pending, /aborted/)
  } finally {
    stub.restore()
  }
})

test("an aborted catalog flight is not reused and cannot drop the replacement", async () => {
  clearCatalogCache()
  let releaseFirst
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve
  })
  let phase = "first"
  const stub = stubFetch(() => {
    if (phase === "first") return firstGate.then(() => jsonResponse({ data: [claude] }))
    return jsonResponse({ data: [{ ...claude, id: "openai/gpt-5.4-mini" }] })
  })
  const controller = new AbortController()
  try {
    const first = fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test", controller.signal)
    assert.equal(stub.calls.length, 1)
    controller.abort()
    phase = "second"
    const second = await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test", new AbortController().signal)
    assert.equal(second[0].id, "openai/gpt-5.4-mini")
    assert.equal(stub.calls.length, 2)
    releaseFirst()
    await assert.rejects(first, /aborted/)
    const third = await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    assert.equal(stub.calls.length, 2)
    assert.equal(third[0].id, "openai/gpt-5.4-mini")
  } finally {
    stub.restore()
  }
})

test("a hung catalog request times out and the next call retries", async () => {
  clearCatalogCache()
  let hang = true
  const stub = stubFetch(() => {
    if (hang) return new Promise(() => {})
    return jsonResponse({ data: [claude] })
  })
  // AbortSignal.timeout does not keep the event loop alive. This timer does,
  // so the test runner waits until the catalog signal actually aborts.
  let keepAlive
  const alive = new Promise((resolve) => {
    keepAlive = setTimeout(resolve, 500)
  })
  try {
    const pending = fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test", undefined, { timeoutMs: 20 })
    const signal = stub.calls[0].init.signal
    await Promise.race([
      new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })),
      alive,
    ])
    assert.equal(signal.aborted, true)
    await assert.rejects(pending, /aborted/)
    hang = false
    const models = await fetchCatalog(OFFICIAL_BASE_URL, "sk-ar-v1-test")
    assert.equal(stub.calls.length, 2)
    assert.equal(models[0].id, claude.id)
  } finally {
    clearTimeout(keepAlive)
    stub.restore()
  }
})

test("shipped source names only the official origin", () => {
  const files = ["index.mjs", ...readdirSync(new URL("../src/", import.meta.url)).map((name) => `src/${name}`)]
  const texts = files.map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
  assert.ok(texts.join("\n").includes("https://anyrouter.dev"))
  for (const [file, text] of texts.map((text, index) => [files[index], text])) {
    for (const url of text.match(/https:\/\/[^\s"'`)]+/g) ?? []) {
      assert.equal(new URL(url).origin, "https://anyrouter.dev", `${file} has ${url}`)
    }
  }
})
