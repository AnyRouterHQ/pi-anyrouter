import { API_KEY_ENV, OFFICIAL_BASE_URL, PROVIDER_ID, PROVIDER_NAME, attributionHeaders } from "./config.mjs"
import { fetchCatalog } from "./catalog.mjs"

/**
 * Legacy `registerProvider(name, config)` form.
 *
 * Pi's custom-provider doc says to reuse a built-in API when the service
 * speaks one, and to use `refreshModels` for a live catalog. AnyRouter's chat
 * endpoint accepts every catalog model id, so one `openai-completions`
 * provider is the whole integration. Pi then owns message conversion, tools,
 * usage and cancellation.
 *
 * Not registered, and why:
 * - `anthropic-messages` would reproduce Claude Code's Messages body at
 *   `OFFICIAL_MESSAGES_URL`, but that client also sends Claude-only fields
 *   (adaptive thinking, signed thinking, betas) that are not verified for
 *   the rest of the catalog. Chat completions already routes those ids.
 * - `openai-codex-responses` speaks to the ChatGPT Codex backend, not this
 *   gateway. `openai-responses` would be the smaller add-on for
 *   `/api/v1/responses` if a row were responses-only. None is.
 */
export function providerConfig() {
  return {
    name: PROVIDER_NAME,
    baseUrl: OFFICIAL_BASE_URL,
    apiKey: `$${API_KEY_ENV}`,
    api: "openai-completions",
    headers: attributionHeaders(),
    refreshModels,
  }
}

export async function refreshModels(context) {
  // Pi calls this once with allowNetwork false to restore a snapshot, then
  // again when a credential resolves. Returning nothing leaves the current
  // list in place. Returning [] would wipe it, because an array is published.
  if (context?.allowNetwork === false) return undefined
  const apiKey =
    context?.credential?.type === "api_key" ? context.credential.key : (process.env[API_KEY_ENV] ?? "")
  return fetchCatalog(OFFICIAL_BASE_URL, apiKey, context?.signal, { force: context?.force === true })
}

export function registerAnyrouter(pi) {
  pi.registerProvider(PROVIDER_ID, providerConfig())
}
