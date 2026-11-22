import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))

test("the package stays in the 0.1.x line", () => {
  assert.match(pkg.version, /^0\.1\.\d+(?:[-+].*)?$/, `${pkg.version} is outside 0.1.x`)
})

test("the package is publishable as @anyr/pi", () => {
  assert.equal(pkg.name, "@anyr/pi")
  assert.notEqual(pkg.private, true)
  assert.equal(pkg.publishConfig?.access, "public")
})
