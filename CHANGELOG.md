# Changelog

## [2.0.1](https://github.com/zirkelc/ai-stream-utils/compare/v2.0.0...v2.0.1) (2026-02-17)


### Bug Fixes

* carry narrowed types through the chain ([aa569dd](https://github.com/zirkelc/ai-stream-utils/commit/aa569dde40f29f4ecea0475cffa55f69c45ca4d1))

## [2.0.0](https://github.com/zirkelc/ai-stream-utils/compare/v1.6.0...v2.0.0) (2026-02-17)


### ⚠ BREAKING CHANGES

* add `pipe()` function for composable stream transformation ([#14](https://github.com/zirkelc/ai-stream-utils/issues/14))

### Features

* add `pipe()` function for composable stream transformation ([#14](https://github.com/zirkelc/ai-stream-utils/issues/14)) ([2e6158c](https://github.com/zirkelc/ai-stream-utils/commit/2e6158c3631856598c3f8da9ba4a738ec13aaa3a))
* add partyType type guard ([4f0e06a](https://github.com/zirkelc/ai-stream-utils/commit/4f0e06a957b90a3dfd6aaade105c952ebecd9d4a))
* let pipe() accept AsyncIterable ([d37f33d](https://github.com/zirkelc/ai-stream-utils/commit/d37f33d3ff111b8e70ebc3697ae14c4834e95c8a))


### Bug Fixes

* use convertAsyncIterableToStream instead of ai-sdk/provider-utils ([7757113](https://github.com/zirkelc/ai-stream-utils/commit/775711322bb820065a576a4efdbbfb4e655e1bdb))

## [1.6.0](https://github.com/zirkelc/ai-stream-utils/compare/v1.5.0...v1.6.0) (2026-02-11)

### Features

- add `consumeUIMessageStream` utility ([#11](https://github.com/zirkelc/ai-stream-utils/issues/11)) ([290f418](https://github.com/zirkelc/ai-stream-utils/commit/290f41827cc4762356a3d3f79f8bc0a16b684564))

## [1.5.0](https://github.com/zirkelc/ai-stream-utils/compare/v1.4.2...v1.5.0) (2026-01-29)

### Features

- add conversion function for SSE ([b1e1d3d](https://github.com/zirkelc/ai-stream-utils/commit/b1e1d3d9d213c277058167fd9d8f3c040dc03377))

## [1.4.2](https://github.com/zirkelc/ai-stream-utils/compare/v1.4.1...v1.4.2) (2026-01-21)

### Bug Fixes

- hanging stream with data chunks interleaved in tool calls ([2200dcf](https://github.com/zirkelc/ai-stream-utils/commit/2200dcf61493a981de2fbb0ab915fab468a65bcc))

## [1.4.1](https://github.com/zirkelc/ai-stream-utils/compare/v1.4.0...v1.4.1) (2026-01-21)

### Bug Fixes

- package json url ([98e3303](https://github.com/zirkelc/ai-stream-utils/commit/98e33037734c6bc95c6f396203a4a2977e27c098))

## [1.4.0](https://github.com/zirkelc/ai-stream-utils/compare/v1.3.1...v1.4.0) (2026-01-20)

### Features

- add stream utils ([8f6f77a](https://github.com/zirkelc/ai-stream-utils/commit/8f6f77a94996a9ef15d2c7f84019e9bd6336bf2a))

## [1.3.1](https://github.com/zirkelc/ai-stream-utils/compare/v1.3.0...v1.3.1) (2025-12-23)

### Bug Fixes

- add support for AI SDK v6 ([5e67112](https://github.com/zirkelc/ai-stream-utils/commit/5e67112c81ab941058331ff71818e4e277327c7d))

## [1.3.0](https://github.com/zirkelc/ai-stream-utils/compare/v1.2.0...v1.3.0) (2025-12-21)

### Features

- allow retuning multiple parts from flatmap ([4ca0ea1](https://github.com/zirkelc/ai-stream-utils/commit/4ca0ea19f96ae59b1f880f7fe23795ef2ace5074))

### Bug Fixes

- clinet-side tools without execute function were never flushed ([81e838b](https://github.com/zirkelc/ai-stream-utils/commit/81e838b06250feaa899d2e11c5d169e16ad466ac))
- lint ([8367768](https://github.com/zirkelc/ai-stream-utils/commit/8367768866e1246a17cadf95abf5415d59087d34))

## [1.2.0](https://github.com/zirkelc/ai-stream-utils/compare/v1.1.0...v1.2.0) (2025-12-18)

### Features

- allow returning multiple chunks from map function ([bff5bc5](https://github.com/zirkelc/ai-stream-utils/commit/bff5bc5e10f18eaa4adfb36f93453876530c8050))

## [1.1.0](https://github.com/zirkelc/ai-stream-utils/compare/v1.0.0...v1.1.0) (2025-12-09)

### Features

- remove chunk buffering in map and filter functions ([f652d35](https://github.com/zirkelc/ai-stream-utils/commit/f652d35537133a92ede46e57461c6a1ce9deba9b))

## 1.0.0 (2025-12-05)

### Features

- rewrite map and flatMap using readUIMessageStream ([cfb204f](https://github.com/zirkelc/ai-stream-utils/commit/cfb204f52119a5c32546ce5c7091f1055ba24415))

### Bug Fixes

- buffering issue ([26c0a22](https://github.com/zirkelc/ai-stream-utils/commit/26c0a22233a3e52cd65834c982ed88f8e3afe9cc))
- lockfile ([e4bdde5](https://github.com/zirkelc/ai-stream-utils/commit/e4bdde59214873c84e285fa6de2354e61b01f871))
- remove chunks from flatMap input ([6ef0895](https://github.com/zirkelc/ai-stream-utils/commit/6ef0895dd4130d9d4e50edfa7ad5b9e73a7009eb))
- rename types and signature ([7797506](https://github.com/zirkelc/ai-stream-utils/commit/7797506b27315e9e419125edfeb482474b8038c7))
