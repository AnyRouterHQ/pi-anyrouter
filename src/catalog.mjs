import { LOOK_ALIKE_HOSTS, OFFICIAL_BASE_URL } from "./config.mjs"

export { OFFICIAL_BASE_URL, OFFICIAL_MESSAGES_URL } from "./config.mjs"

export function findLookAlikes(text) {
  return LOOK_ALIKE_HOSTS.filter((host) => String(text).includes(host))
}

/** Throw unless the base URL is the official AnyRouter API root. */
export function assertOfficialBaseUrl(baseUrl = OFFICIAL_BASE_URL) {
  if (baseUrl !== OFFICIAL_BASE_URL) {
    throw new Error(`refusing a non-official AnyRouter base URL: ${baseUrl}`)
  }
  const hits = findLookAlikes(baseUrl)
  if (hits.length > 0) {
    throw new Error(`non-official domain in base URL: ${hits.join(", ")}`)
  }
  return baseUrl
}

const num = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * AnyRouter's `/models` row into a pi chat model. Only fields pi needs are
 * mapped; context and output limits fall back when the catalog omits them.
 */
export function mapModel(model) {
  const capabilities = Array.isArray(model.capabilities) ? model.capabilities : []
  const pricing = model.pricing ?? {}
  return {
    type: "chat",
    id: model.id,
    name: model.display_name ?? model.name ?? model.id,
    reasoning: capabilities.includes("reasoning"),
    input: capabilities.includes("vision") ? ["text", "image"] : ["text"],
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

/** Fetch the live catalog and return pi model configs. */
export async function fetchCatalog(
  baseUrl = OFFICIAL_BASE_URL,
  apiKey = process.env.ANYROUTER_API_KEY ?? "",
  signal,
) {
  assertOfficialBaseUrl(baseUrl)
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
