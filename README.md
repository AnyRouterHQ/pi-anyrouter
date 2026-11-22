# pi-anyrouter

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Official [AnyRouter](https://anyrouter.dev) provider for the
[pi coding agent](https://github.com/earendil-works/pi). One `sk-ar-v1-` key
reaches every model in the catalog, with routing and failover handled by
AnyRouter.

The provider delegates request conversion and streaming to pi's built-in
`openai-completions` implementation. It only owns the endpoint, the key and the
live catalog, so it inherits pi's message conversion, tool handling, usage
accounting and cancellation.

The only valid AnyRouter domain is `https://anyrouter.dev` (short link
`https://anyr.dev` for social posts). Any other domain using the AnyRouter name
is not affiliated with this project, and the catalog fetch refuses one. Note
that an unrelated third-party package also publishes under the `pi-anyrouter`
name and points at a different host; this repository is the official one.

## Install

```bash
pi install git:github.com/AnyRouterHQ/pi-anyrouter
```

Or from a local checkout:

```bash
git clone https://github.com/AnyRouterHQ/pi-anyrouter.git
pi install ./pi-anyrouter
```

Then export your key and start pi:

```bash
export ANYROUTER_API_KEY="sk-ar-v1-..."
pi
```

The provider registers `anyrouter` and refreshes its models from the live
catalog, so `/models` lists what AnyRouter can route that day. Pick one with the
model id from the catalog, for example `anyrouter/free` for the best free model
at that moment.

## Verify

```bash
npm test
```

The tests assert the provider points at `https://anyrouter.dev/api/v1`, that a
look-alike base URL is refused, and that a catalog row maps to a pi chat model
with cost and limits.

## Notes

- Free models are `$0` per token on Go and up, with no daily cap. The Free plan
  gets a 5-request trial.
- Bring-your-own-key routes through your own provider keys at `$0` markup.
- The Anthropic Messages endpoint, for tools that speak it, is
  `https://anyrouter.dev/api`.
