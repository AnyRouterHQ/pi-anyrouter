import { CATALOG_TTL_MS, OFFICIAL_BASE_URL } from "./config.mjs"

export { CATALOG_TTL_MS, OFFICIAL_BASE_URL, OFFICIAL_MESSAGES_URL } from "./config.mjs"

const num = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Throw unless the endpoint is the official AnyRouter API root. */
export function assertOfficialBaseUrl(baseUrl = OFFICIAL_BASE_URL) {
  if (baseUrl !== OFFICIAL_BASE_URL) {
    throw new Error(`refusing a non-official AnyRouter base URL: ${baseUrl}`)
  }
  return baseUrl
}

/** AnyRouter's `/models` row into a pi chat model. */
export function mapModel(model) {
  const capabilities = model.capabilities
  const supports = (name) => Array.isArray(capabilities) && capabilities.includes(name)
  const pricing = model.pricing ?? {}
  return {
    type: "chat",
    id: model.id,
    name: model.display_name ?? model.name ?? model.id,
    reasoning: supports("reasoning"),
    input: supports("vision") ? ["text", "image"] : ["text"],
    cost: {
      input: num(pricing.input_per_1m),
      output: num(pricing.output_per_1m),
      cacheRead: num(pricing.input_cache_read_per_1m),
      cacheWrite: 0,
    },
    contextWindow: model.context_length ?? model.context_window ?? 128000,
    maxTokens: model.max_output_tokens ?? model.max_tokens ?? 8192,
  }
}

let cache = null

async function requestCatalog(baseUrl, apiKey, signal) {
  const response = await fetch(`${baseUrl}/models`, {
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    signal,
  })
  if (!response.ok) {
    throw new Error(`AnyRouter catalog failed: HTTP ${response.status}`)
  }
  const body = await response.json()
  const rows = Array.isArray(body?.data) ? body.data : []
  return rows.map(mapModel)
}

/**
 * Fetch the live catalog, reusing a fresh result and one request per refresh.
 * A failed fetch clears the cache so the next call retries instead of serving
 * a stale failure.
 */
export async function fetchCatalog(
  baseUrl = OFFICIAL_BASE_URL,
  apiKey = process.env.ANYROUTER_API_KEY ?? "",
  signal,
) {
  assertOfficialBaseUrl(baseUrl)
  const now = Date.now()
  if (cache && now - cache.at < CATALOG_TTL_MS) {
    return cache.inFlight ?? cache.models
  }
  const inFlight = requestCatalog(baseUrl, apiKey, signal)
  cache = { at: now, models: null, inFlight }
  try {
    const models = await inFlight
    cache = { at: Date.now(), models, inFlight: null }
    return models
  } catch (error) {
    cache = null
    throw error
  }
}

/** Drop the cache so the next refresh is a live fetch. */
export function clearCatalogCache() {
  cache = null
}
