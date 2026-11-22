import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  OFFICIAL_BASE_URL,
  OFFICIAL_MESSAGES_URL,
  findLookAlikes,
  assertOfficialBaseUrl,
  mapModel,
} from "../src/catalog.mjs"

test("the provider targets the official AnyRouter API root", () => {
  assert.equal(OFFICIAL_BASE_URL, "https://anyrouter.dev/api/v1")
  assert.equal(OFFICIAL_MESSAGES_URL, "https://anyrouter.dev/api")
  assert.equal(assertOfficialBaseUrl(), OFFICIAL_BASE_URL)
})

test("a look-alike base URL is refused before any request", () => {
  assert.throws(() => assertOfficialBaseUrl("https://anyrouter.top/api/v1"), /non-official/)
  assert.throws(() => assertOfficialBaseUrl("https://any-router.com/api/v1"), /non-official/)
})

test("a catalog row becomes a pi chat model with cost and limits", () => {
  const model = mapModel({
    id: "openai/gpt-6-luna",
    display_name: "GPT-6 Luna",
    capabilities: ["reasoning", "tool-use"],
    context_length: 1000000,
    max_output_tokens: 64000,
    pricing: { input_per_1m: "0.02", output_per_1m: "0.1", input_cache_read_per_1m: "0.002" },
  })
  assert.equal(model.type, "chat")
  assert.equal(model.id, "openai/gpt-6-luna")
  assert.equal(model.name, "GPT-6 Luna")
  assert.equal(model.reasoning, true)
  assert.equal(model.input[0], "text")
  assert.deepEqual(model.cost, { input: 0.02, output: 0.1, cacheRead: 0.002, cacheWrite: 0 })
  assert.equal(model.contextWindow, 1000000)
  assert.equal(model.maxTokens, 64000)
})

test("a model without reasoning or vision flags maps to plain text", () => {
  const model = mapModel({ id: "acme/plain", name: "Plain" })
  assert.equal(model.reasoning, false)
  assert.deepEqual(model.input, ["text"])
  assert.equal(model.contextWindow, 128000)
})

test("the shipped files never name a look-alike domain", () => {
  // src/config.mjs is excluded on purpose: it holds the refuse-list itself.
  const files = ["index.mjs", "README.md", "package.json"]
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
    assert.deepEqual(findLookAlikes(text), [], `${file} mentions a look-alike domain`)
  }
})

test("the extension takes its endpoint from the checked config", () => {
  const source = readFileSync(new URL("../index.mjs", import.meta.url), "utf8")
  assert.ok(source.includes("./src/config.mjs"), "index.mjs must read the endpoint from src/config.mjs")
  const config = readFileSync(new URL("../src/config.mjs", import.meta.url), "utf8")
  assert.ok(config.includes("https://anyrouter.dev/api/v1"), "config must pin the official API root")
})
