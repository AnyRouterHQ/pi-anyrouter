import { readFileSync } from "node:fs"

/** Official site. Every API URL in this package is under this origin. */
export const OFFICIAL_ORIGIN = "https://anyrouter.dev"

/** OpenAI-compatible root. Pi appends `/chat/completions`. */
export const OFFICIAL_BASE_URL = `${OFFICIAL_ORIGIN}/api/v1`

/**
 * Anthropic Messages root. The Anthropic SDK appends `/v1/messages`.
 * This provider does not call it. See README Limits.
 */
export const OFFICIAL_MESSAGES_URL = `${OFFICIAL_ORIGIN}/api`

export const PROVIDER_ID = "anyrouter"
export const PROVIDER_NAME = "AnyRouter"
export const API_KEY_ENV = "ANYROUTER_API_KEY"

/** Matches the catalog response `cache-control: max-age=300`. */
export const CATALOG_TTL_MS = 5 * 60 * 1000

/** A hung `GET /models` must not occupy the single-flight slot for the process lifetime. */
export const CATALOG_TIMEOUT_MS = 15_000

/**
 * Used when `top_provider.max_completion_tokens` is null.
 * The catalog documents null as "no upstream declared a cap", not unlimited.
 * AnyRouter clamps a higher `max_tokens`; a finite cap keeps the request bounded.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version
if (typeof version !== "string" || version.length === 0) {
  throw new Error("package.json version is missing")
}

/** Headers AnyRouter uses to attribute traffic. The Referer host is the app id. */
export function attributionHeaders() {
  return {
    "HTTP-Referer": `${OFFICIAL_ORIGIN}/`,
    "X-AnyRouter-Title": "AnyRouter for pi",
    "X-AnyRouter-Source": "cli-agent",
    "X-AnyRouter-Version": version,
    "X-AnyRouter-Categories": "cli-agent",
  }
}
