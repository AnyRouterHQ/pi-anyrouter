import { OFFICIAL_BASE_URL, PROVIDER_ID, PROVIDER_NAME } from "./src/config.mjs"
import { fetchCatalog } from "./src/catalog.mjs"

/**
 * Official AnyRouter provider for the pi coding agent.
 *
 * AnyRouter speaks OpenAI Chat Completions, so the provider delegates request
 * conversion and streaming to pi's built-in `openai-completions` implementation
 * and only owns the endpoint, the key and the live catalog. The base URL is the
 * official domain; the catalog fetch refuses any other host.
 */
export default function (pi) {
  pi.registerProvider(PROVIDER_ID, {
    name: PROVIDER_NAME,
    baseUrl: OFFICIAL_BASE_URL,
    apiKey: "$ANYROUTER_API_KEY",
    api: "openai-completions",
    refreshModels: async (context) =>
      fetchCatalog(OFFICIAL_BASE_URL, process.env.ANYROUTER_API_KEY ?? "", context?.signal),
  })
}
