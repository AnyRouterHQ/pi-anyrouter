import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MCP_URL, buildEntry, mergeMcpConfig } from "../mcp-config.mjs"

test("the entry declares the streamable-http transport", () => {
  const entry = buildEntry("sk-ar-v1-test")
  assert.equal(entry.type, "streamable-http")
  assert.equal(entry.url, MCP_URL)
  assert.equal(entry.headers.Authorization, "Bearer sk-ar-v1-test")
})

test("merging keeps other servers and preserves unrelated keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "anyr-mcp-"))
  const path = join(dir, "mcp.json")
  writeFileSync(
    path,
    JSON.stringify({ theme: "dark", mcpServers: { radius: { url: "https://example.com/mcp" } } }),
  )
  try {
    const merged = mergeMcpConfig(path, "sk-ar-v1-test")
    assert.equal(merged.theme, "dark")
    assert.equal(merged.mcpServers.radius.url, "https://example.com/mcp")
    assert.equal(merged.mcpServers.anyrouter.type, "streamable-http")
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), merged)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a malformed config is replaced rather than throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "anyr-mcp-"))
  const path = join(dir, "mcp.json")
  writeFileSync(path, "{not json")
  try {
    const merged = mergeMcpConfig(path, "sk-ar-v1-test")
    assert.equal(merged.mcpServers.anyrouter.url, MCP_URL)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
