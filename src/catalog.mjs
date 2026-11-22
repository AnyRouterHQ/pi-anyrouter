import {
  CATALOG_TTL_MS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  OFFICIAL_BASE_URL,
  OFFICIAL_ORIGIN,
  attributionHeaders,
} from "./config.mjs"

export {
  CATALOG_TTL_MS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  OFFICIAL_BASE_URL,
  OFFICIAL_MESSAGES_URL,
  attributionHeaders,
} from "./config.mjs"

const PI_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]

/** Throw unless the endpoint is the official OpenAI-compatible root. */
export function assertOfficialBaseUrl(baseUrl = OFFICIAL_BASE_URL) {
  if (baseUrl !== OFFICIAL_BASE_URL) {
    throw new Error(`refusing a non-official AnyRouter base URL: ${baseUrl}`)
  }
  return baseUrl
}

function finiteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function positive(value) {
  const parsed = finiteNumber(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

function stringSet(value) {
  return new Set(Array.isArray(value) ? value.filter((item) => typeof item === "string") : [])
}

function price(pricing, key) {
  return finiteNumber(pricing?.[key]) ?? 0
}

/**
 * Pi thinking levels the row actually lists. Unlisted levels are null so the
 * picker hides them. `off` maps to `none` only when the row says so.
 */
export function thinkingLevelMap(levels) {
  const allowed = new Set(levels)
  const map = {}
  for (const level of PI_THINKING_LEVELS) {
    if (level === "off") {
      if (allowed.has("off")) map.off = "off"
      else if (allowed.has("none")) map.off = "none"
      else map.off = null
    } else {
      map[level] = allowed.has(level) ? level : null
    }
  }
  return map
}

/**
 * Catalog row → pi chat model, or null when the row is not a chat model
 * with a usable context window. Embeddings, rerankers and deciders are null.
 *
 * Vision comes from `architecture.input_modalities`. Several Claude rows
 * accept images there and do not list a `vision` capability.
 * Reasoning is sent only as a parameter the row lists. `supported_parameters`
 * is authoritative: a `reasoning` capability does not add a request field.
 * Cost is the top-level rate. Per-upstream `0` on a BYOK route is not a price.
 */
export function mapModel(row) {
  if (!row || typeof row.id !== "string" || row.id.length === 0) return null
  const capabilities = stringSet(row.capabilities)
  if (!capabilities.has("chat")) return null

  const contextWindow = positive(row.context_length) ?? positive(row.top_provider?.context_length)
  if (!contextWindow) return null

  const parameters = stringSet(row.supported_parameters)
  const modalities = Array.isArray(row.architecture?.input_modalities)
    ? row.architecture.input_modalities
    : null
  const seesImages = modalities
    ? modalities.includes("image")
    : capabilities.has("vision")

  const sendsReasoningObject = parameters.has("reasoning") && !parameters.has("reasoning_effort")
  const sendsReasoningEffort = parameters.has("reasoning_effort")
  const levelList = Array.isArray(row.reasoning?.levels)
    ? row.reasoning.levels.filter((level) => typeof level === "string")
    : []
  const canThink =
    capabilities.has("reasoning") ||
    capabilities.has("thinking") ||
    sendsReasoningObject ||
    sendsReasoningEffort ||
    levelList.length > 0

  const pricing = row.pricing ?? {}
  const model = {
    type: "chat",
    id: row.id,
    name: row.display_name ?? row.name ?? row.id,
    reasoning: canThink,
    input: seesImages ? ["text", "image"] : ["text"],
    cost: {
      input: price(pricing, "input_per_1m"),
      output: price(pricing, "output_per_1m"),
      cacheRead: price(pricing, "input_cache_read_per_1m"),
      cacheWrite: price(pricing, "input_cache_write_per_1m"),
    },
    contextWindow,
    maxTokens: positive(row.top_provider?.max_completion_tokens) ?? DEFAULT_MAX_OUTPUT_TOKENS,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: sendsReasoningEffort,
      supportsUsageInStreaming: true,
      supportsLongCacheRetention: false,
      supportsStrictMode: false,
      maxTokensField:
        parameters.has("max_completion_tokens") && !parameters.has("max_tokens")
          ? "max_completion_tokens"
          : "max_tokens",
      thinkingFormat: sendsReasoningObject ? "openrouter" : "openai",
      sendSessionAffinityHeaders: true,
      sessionAffinityFormat: "openrouter",
    },
  }
  if ((sendsReasoningObject || sendsReasoningEffort) && levelList.length > 0) {
    model.thinkingLevelMap = thinkingLevelMap(levelList)
  }
  return model
}

const cache = new Map()

function assertOfficialResponse(response, requestUrl) {
  const finalUrl = new URL(response.url || requestUrl)
  if (finalUrl.origin !== OFFICIAL_ORIGIN || !finalUrl.pathname.startsWith("/api/v1/")) {
    throw new Error(`refusing a catalog response from ${finalUrl.origin}${finalUrl.pathname}`)
  }
}

async function requestCatalog(baseUrl, apiKey, signal) {
  const requestUrl = `${baseUrl}/models`
  const headers = { ...attributionHeaders() }
  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  const response = await fetch(requestUrl, { headers, signal })
  assertOfficialResponse(response, requestUrl)
  if (!response.ok) {
    throw new Error(`AnyRouter catalog failed: HTTP ${response.status}`)
  }
  const body = await response.json()
  if (!Array.isArray(body?.data)) {
    throw new Error("AnyRouter catalog response has no data array")
  }
  return body.data.map(mapModel).filter((model) => model !== null)
}

/**
 * Fetch the live catalog. One in-flight request per API key, reused until
 * `CATALOG_TTL_MS` passes. `force` skips a completed entry. A failure removes
 * the entry so the next call retries. The key is the cache identity because
 * the catalog response varies on Authorization.
 */
export async function fetchCatalog(baseUrl = OFFICIAL_BASE_URL, apiKey = "", signal, options = {}) {
  assertOfficialBaseUrl(baseUrl)
  const now = Date.now()
  const hit = cache.get(apiKey)
  if (hit?.inFlight) return hit.inFlight
  if (!options.force && hit && now - hit.at < CATALOG_TTL_MS) return hit.models

  const inFlight = requestCatalog(baseUrl, apiKey, signal)
  cache.set(apiKey, { at: now, models: null, inFlight })
  try {
    const models = await inFlight
    cache.set(apiKey, { at: Date.now(), models, inFlight: null })
    return models
  } catch (error) {
    cache.delete(apiKey)
    throw error
  }
}

/** Drop cached catalogs so the next refresh is a live fetch. */
export function clearCatalogCache() {
  cache.clear()
}
