import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

/** The AnyRouter MCP gateway. Pi appends nothing, so this is the whole path. */
export const MCP_URL = "https://anyrouter.dev/api/v1/mcp"

export const MCP_CONFIG_PATH =
  process.env.ANYROUTER_MCP_CONFIG_PATH ?? join(homedir(), ".pi", "agent", "mcp.json")

/** The entry pi needs. `type` is stated because pi validates the transport. */
export function buildEntry(apiKey) {
  return {
    type: "streamable-http",
    url: MCP_URL,
    headers: { Authorization: `Bearer ${apiKey}` },
  }
}

/**
 * Merge the AnyRouter entry into `~/.pi/agent/mcp.json`, preserving every other
 * server. A malformed file is replaced rather than crashing the session.
 */
export function mergeMcpConfig(
  configPath = MCP_CONFIG_PATH,
  apiKey = process.env.ANYROUTER_API_KEY,
) {
  let existing = {}
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, "utf8"))
      if (parsed && typeof parsed === "object") existing = parsed
    } catch {
      // Malformed config: start fresh so pi can load the session.
    }
  }
  const merged = {
    ...existing,
    mcpServers: { ...(existing.mcpServers ?? {}), anyrouter: buildEntry(apiKey) },
  }
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8")
  return merged
}

/** Pi loads this as an extension. It does nothing until a key is present. */
export default function () {
  if (!process.env.ANYROUTER_API_KEY) return
  mergeMcpConfig()
}
