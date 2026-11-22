# Changelog

## [0.1.2](https://github.com/AnyRouterHQ/pi-anyrouter/compare/pi-v0.1.1...pi-v0.1.2) (2026-11-22)


### Features

* **catalog:** map live AnyRouter rows to pi chat models ([e53e475](https://github.com/AnyRouterHQ/pi-anyrouter/commit/e53e4758e6f65c4bdbc054951ec2d665d803c27d))
* configure the AnyRouter MCP server on install ([0977606](https://github.com/AnyRouterHQ/pi-anyrouter/commit/0977606bd0dd6dfe157d6004212755a694bdaac1))
* **provider:** register anyrouter on the official chat endpoint ([b828af4](https://github.com/AnyRouterHQ/pi-anyrouter/commit/b828af42b811472e388ad4e4c7b00f2801087eea))


### Bug Fixes

* **catalog:** keep a superseded refresh and restore the saved list ([70cf05e](https://github.com/AnyRouterHQ/pi-anyrouter/commit/70cf05e0bf1dcf2e0dd63da8769972ae30c11977))
* **docs:** pi needs the npm: prefix for a registry package ([86a9884](https://github.com/AnyRouterHQ/pi-anyrouter/commit/86a9884b80aa29b232e58c9682681f5aff2a5e60))

## [0.1.1] - 2026-11-22

### Fixed

- A newer model refresh no longer joins a catalog fetch that Pi already aborted.
- Pi's offline refresh restores the last saved catalog instead of an empty list.
