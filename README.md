# pi-anyrouter

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Official [AnyRouter](https://anyrouter.dev) provider for the
[pi coding agent](https://github.com/earendil-works/pi). One `sk-ar-v1-` key
reaches the chat models in the catalog. AnyRouter routes and fails over.

The extension registers a single `anyrouter` provider with pi's built-in
`openai-completions` implementation and refreshes models from
`GET /api/v1/models`. Pi keeps message conversion, tool calls, usage and
cancellation. The package sets the compat flags pi would otherwise guess from
the URL, because that guess treats an unknown host as OpenAI
(`store`, `developer` role, `max_completion_tokens`, 24h prompt cache).

## Install

Two options. Use the extension when you want the live catalog and the compatibility flags. Use the AnyRouter CLI when you want the shortest path, and the launcher writes the provider, sets the key and starts pi.

Extension, from npm (published under the `@anyr` scope):

```bash
pi install @anyr/pi
```

Extension, from git:

```bash
pi install git:github.com/AnyRouterHQ/pi-anyrouter
```

Or the AnyRouter CLI:

```bash
curl -fsSL https://anyr.dev/cli.sh | bash
anyr pi
```

Then:

```bash
export ANYROUTER_API_KEY="sk-ar-v1-..."
pi --provider anyrouter --model openai/gpt-5.4-mini
```

`/model` lists the chat rows from the live catalog. Model ids are the catalog
ids, such as `anthropic/claude-sonnet-4-6` or `anyrouter/free`.

## What a catalog row becomes

- Chat rows only. Embeddings, rerankers and deciders are left out. A row with
  no positive context window is left out.
- Image input follows `architecture.input_modalities`, then a `vision`
  capability.
- Reasoning is sent only when the row lists the parameter: `reasoning_effort`,
  or `reasoning: { effort }` when `reasoning` is listed and `reasoning_effort`
  is not. A reasoning capability on its own does not add a field. Listed
  `reasoning.levels` hide the pi thinking levels the model does not have.
- Output cap is `top_provider.max_completion_tokens`. When that is null, the
  cap is 8192. The catalog uses null for "no upstream declared a cap".
- Price is the top-level per-million rate. A BYOK upstream priced at 0 is not
  the price.
- Requests send `max_tokens`, unless the row lists `max_completion_tokens` and
  not `max_tokens`. They do not send `store`, a `developer` role, or
  `prompt_cache_retention`. Session affinity is the `x-session-id` header.
- Attribution headers identify the app as AnyRouter for pi.

The catalog is cached for five minutes per API key, which matches the
response `max-age`. A live refresh is saved for Pi's offline pass. That
pass restores the saved list and does not hit the network.

## Limits

Chat completions is the protocol this provider speaks. That is the endpoint
AnyRouter documents for every catalog model, and the one in AnyRouter's Pi
guide.

Claude Code's request shape is Anthropic Messages at `https://anyrouter.dev/api`
(the SDK appends `/v1/messages`): a split system prompt, signed thinking
blocks, `cache_control`, and `anthropic-beta`. Pi's `anthropic-messages`
client can emit that shape, and it also emits Claude-only fields that are not
verified for the rest of this catalog. Chat completions already accepts Claude
model ids, so this package does not register a second provider.

Codex's request shape is the Responses API at
`https://anyrouter.dev/api/v1/responses`. Pi's `openai-codex-responses` client
is the ChatGPT Codex backend (a different host, websockets, compressed
bodies), so it is the wrong client here. Pi's `openai-responses` client would
be the smallest addition, on this same base URL, for a model that cannot be
called with chat completions. The catalog does not mark a chat model as
responses-only.

## Verify

```bash
npm test
```

The tests refuse any chat base URL other than `https://anyrouter.dev/api/v1`,
refuse a catalog response that leaves that root, and map catalog rows the way
the live `/models` payload is shaped.

## Notes

- Free models are `$0` per token on Go and up, with no daily cap. The Free plan
  gets a 5-request trial.
- Bring-your-own-key routes through your own provider keys at `$0` markup.
  Pi then shows a zero AnyRouter price, which is what the account is charged.

## Publishing

The package publishes as `@anyr/pi`. Put an npm access token for the `@anyr`
scope in `.env.local` (copied from `.env.example`, never committed), then:

```bash
set -a
source .env.local
set +a
npm run publish:local
```

`.npmrc` reads `NPM_TOKEN` from the environment, so the token stays out of the
shell history and out of git. Release and publish automation lives in
[AGENTS.md](AGENTS.md).
