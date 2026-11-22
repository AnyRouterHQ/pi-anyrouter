/** The only valid AnyRouter API root for the OpenAI-compatible protocol. */
export const OFFICIAL_BASE_URL = "https://anyrouter.dev/api/v1"

/** The Anthropic Messages root, for tools that speak that protocol. */
export const OFFICIAL_MESSAGES_URL = "https://anyrouter.dev/api"

export const PROVIDER_ID = "anyrouter"
export const PROVIDER_NAME = "AnyRouter"

/** How long a catalog fetch stays fresh. Refreshes are cheap but not free. */
export const CATALOG_TTL_MS = 5 * 60 * 1000
