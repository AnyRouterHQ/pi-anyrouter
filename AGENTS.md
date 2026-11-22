# AGENTS.md — pi-anyrouter

Official AnyRouter provider extension for the pi coding agent. Published to npm
as `@anyr/pi`.

## Version rule

- The package stays in the `0.1.x` line.
- `test/version.test.mjs` fails on any version outside `0.1.x`. Never edit the
  version by hand.
- release-please sets `bump-minor-pre-major`, so a breaking change bumps
  `0.2.0`, not `1.0.0`.

## Release and publish

- `.github/workflows/release-please.yml` opens a release pull request on every
  push to `main`.
- `.github/workflows/publish.yml` runs the tests and publishes when a `v0.1.*`
  tag is pushed, using the `NPM_TOKEN` repository secret.
- Cut a release by hand with `npm version 0.1.1 && git push origin main --follow-tags`.
- Publish locally with `set -a; source .env.local; set +a; npm run publish:local`.

## Code rules

- `https://anyrouter.dev/api/v1` is the only valid base URL. Check equality; do
  not keep a list of other hosts.
- No code from third-party AnyRouter pi packages. The implementation is original.
- The tests must fail when the base URL is not the official root.
