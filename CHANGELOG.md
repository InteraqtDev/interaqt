# Changelog

## [2.0.0-alpha.0](https://github.com/interaqtdev/interaqt/compare/v1.7.0-alpha.0...v2.0.0-alpha.0) (2026-07-09)

### Bug Fixes

* **builtins,drivers:** guard hardening and driver contract fixes ([1c48084](https://github.com/interaqtdev/interaqt/commit/1c48084c582bf6adc560334f88af448e0dc17478))
* **builtins:** activity stateVersion OCC uses the atomic CAS primitive instead of find-then-update (R-1) ([4377415](https://github.com/interaqtdev/interaqt/commit/4377415cdf40f5e00403296bff97165a16d46560))
* **core:** BoolExp.or standardizes ExpressionData like .and; missing right operand fails fast (R-7) ([9825192](https://github.com/interaqtdev/interaqt/commit/9825192d29d7a090d2a74fd612bf62ab2e3d69e0))
* **drivers:** MySQL open() reconnects with the target database and closes the bootstrap connection; SQLite update() returns RETURNING rows (R-3, R-5) ([8ba8c7b](https://github.com/interaqtdev/interaqt/commit/8ba8c7b8ffe6ee87af5f1ab336fc0b809cefba16))
* **runtime,storage:** update events carry changed keys; trigger.keys subset matching; ambiguous transfers throw (F-3, R-4) ([10f8cf4](https://github.com/interaqtdev/interaqt/commit/10f8cf4ab81732612d698456da8623c2d732dc7e))
* **runtime/computations:** empty-set Every, NaN guards, property bound-state resets, RealTime validation ([812e358](https://github.com/interaqtdev/interaqt/commit/812e3586e777ea8c5f59e975c4238ad96dfcf196))
* **runtime/computations:** property aggregation handles fall back to fullRecompute on unknown related events and guard missing relation records (I-1, I-2) ([fa3e5d3](https://github.com/interaqtdev/interaqt/commit/fa3e5d38ea86e34f5ced983f7025be85c1c88f2f))
* **runtime:** clearer incremental-only full-recompute error; RealTime falls back or fails clearly when solve() throws (I-3, I-4) ([7d73e52](https://github.com/interaqtdev/interaqt/commit/7d73e525c4b1a52f84112c6d44b3b77f89f4de7e))
* **runtime:** fail fast on bare property dataDep without attributeQuery (F-2) ([1ab1711](https://github.com/interaqtdev/interaqt/commit/1ab1711bdc9c82964ecc9f1ced3227ec627a1a23))
* **runtime:** filtered predicate changes produce membership diffs, rebuild seeds, and diff review items during migration (F-1) ([13d9ad7](https://github.com/interaqtdev/interaqt/commit/13d9ad74b3136abcc932572ce77a03fe87bfc363))
* **runtime:** function-valued bound-state defaultValue enters the migration state signature (R-8) ([7ffd288](https://github.com/interaqtdev/interaqt/commit/7ffd2880154095e72e0d86da9d283ef4e784ca4c))
* **runtime:** handleAsyncReturn locks the whole freshnessKey row set before the isLatest check; lockRows takes locks in id order (R-2) ([6ff6b08](https://github.com/interaqtdev/interaqt/commit/6ff6b08a93955cc9d2c876325d2ccb9da122fdf9))
* **runtime:** idempotent scheduler setup, serialized single-connection transactions, migration bookkeeping ([2c933d4](https://github.com/interaqtdev/interaqt/commit/2c933d4198e178cde24978d256f624e384d854d4))
* **storage:** NULL matching, fan-out pagination, boolean read normalization ([e07814e](https://github.com/interaqtdev/interaqt/commit/e07814ed6d50cb319d419e79fca878761b93e027))
* **storage:** support self-referencing 1:1 reliance by skipping table combine (F-4) ([eb16dff](https://github.com/interaqtdev/interaqt/commit/eb16dfffb8711d38780eb8600d77297f95f69b96))

## [1.7.0-alpha.0](https://github.com/interaqtdev/interaqt/compare/v1.6.0...v1.7.0-alpha.0) (2026-07-08)

### ⚠ BREAKING CHANGES

* **runtime:** remove legacy computation-id normalization; require explicit computation type names
* **runtime:** reject old-generator manifests instead of adopting them

### Bug Fixes

* **ci:** make PostgreSQL Concurrency workflow actually pass, fixing real bugs it uncovered ([c1617c8](https://github.com/interaqtdev/interaqt/commit/c1617c879458631693fb62732355601795304149))
* resolve fatal issues F1-F7 from core/runtime/builtins review ([db2ee82](https://github.com/interaqtdev/interaqt/commit/db2ee82ac82f33aebd36cb1effe8fd8e235d88d7))
* resolve significant core/builtins issues S9-S17,S19-S23,M-1 from review ([0139685](https://github.com/interaqtdev/interaqt/commit/0139685d546841832a1422676a50477a7c1912b9))
* **runtime:** backfill new fact property defaults, close remaining rebuild-graph gaps, remove physical-move exemption ([1fc4574](https://github.com/interaqtdev/interaqt/commit/1fc457439948597629418ad4684f7b183630a7b5))
* **runtime:** collect StateNode.computeValue / StateTransfer.computeTarget into migration function signatures ([5b1adc2](https://github.com/interaqtdev/interaqt/commit/5b1adc26bb958e59bcac7b87e4379ce9fa1f0597))
* **runtime:** fail fast on missing computeTarget; make initial-value backfill an internal write ([73c79ba](https://github.com/interaqtdev/interaqt/commit/73c79baf90d23eefd18cf85ff827e4369a71b2c4))
* **runtime:** hard-deletion recompute propagates delete events to downstream computations ([2a924e0](https://github.com/interaqtdev/interaqt/commit/2a924e0dcc0ab3d53352f65a46a2ce91e9e70ec0))
* **runtime:** migration rebuild graph misses downstream of relation and filtered-entity outputs ([1f61161](https://github.com/interaqtdev/interaqt/commit/1f61161ae905f4b52b2d511bf2a823a59a3f4066))
* **runtime:** only demand migration handlers for computations whose output is rebuilt ([80a7195](https://github.com/interaqtdev/interaqt/commit/80a71954471c7da1cb0b09a03efb71ba72ec8e31))
* **runtime:** parameterize migration bookkeeping SQL and add migration lock recovery ([f65ac34](https://github.com/interaqtdev/interaqt/commit/f65ac34383ce4df4201ba4746e31e05800b88ef5))
* **runtime:** reset record-bound aggregate state on membership delete events; add regression tests and docs ([dd5feef](https://github.com/interaqtdev/interaqt/commit/dd5feefcceb8c9bfc5abccf520b3a0c81de1ab4d))
* **storage:** add missing MatchExpressionData type import in MergedItemProcessor ([f5654ed](https://github.com/interaqtdev/interaqt/commit/f5654ed3a5f7aa540e7fce1c787b78882e8f991a))
* **storage:** address robustness, performance and code-quality issues from deep analysis ([5906049](https://github.com/interaqtdev/interaqt/commit/59060492701b5b2c0fb6567d88b29f5301243df2))
* **storage:** resolve fatal bugs F1-F8 in erstorage ([4053d13](https://github.com/interaqtdev/interaqt/commit/4053d138582d3168fca59828fea7c0d951de55df))

### Code Refactoring

* **runtime:** reject old-generator manifests instead of adopting them ([3ee7aec](https://github.com/interaqtdev/interaqt/commit/3ee7aecb510d794f81a4cf44204cde4b5074b3f8))
* **runtime:** remove legacy computation-id normalization; require explicit computation type names ([5aa8c46](https://github.com/interaqtdev/interaqt/commit/5aa8c46d905f86d68aa573fc69e41833ab911c8c))

## [1.6.0](https://github.com/InteraqtDev/interaqt/compare/v1.5.9...v1.6.0) (2026-05-29)


### Features

* **runtime:** plan data-based incremental deps ([abd7ce0](https://github.com/InteraqtDev/interaqt/commit/abd7ce0392291244c8bf16bd6870084ad19acc7b))

## [1.5.9](https://github.com/InteraqtDev/interaqt/compare/v1.5.8...v1.5.9) (2026-05-16)


### Features

* add scoped sequence match support ([605dde0](https://github.com/InteraqtDev/interaqt/commit/605dde09c428a3011d11ac5afb9711f27fdbfaa2))

## [1.5.8](https://github.com/InteraqtDev/interaqt/compare/v1.5.7...v1.5.8) (2026-05-15)


### Features

* add scoped sequence computation ([c820513](https://github.com/InteraqtDev/interaqt/commit/c8205133f850f7807471abc11ed772a4172be733))

## [1.5.7](https://github.com/InteraqtDev/interaqt/compare/v1.5.6...v1.5.7) (2026-05-14)


### Bug Fixes

* stabilize migration computation identity ([fd6d5e3](https://github.com/InteraqtDev/interaqt/commit/fd6d5e3da1d83844cbc48299bb4d2c8694c1fb55))

## [1.5.6](https://github.com/InteraqtDev/interaqt/compare/v1.5.5...v1.5.6) (2026-05-14)

## [1.5.5](https://github.com/InteraqtDev/interaqt/compare/v1.5.4...v1.5.5) (2026-05-14)


### Bug Fixes

* support computation takeover migration ([c7fea53](https://github.com/InteraqtDev/interaqt/commit/c7fea538a5ea632772b2adc8f7406eb430119c96))

## [1.5.4](https://github.com/InteraqtDev/interaqt/compare/v1.5.3...v1.5.4) (2026-05-07)


### Bug Fixes

* require rebuild handlers for non-computable migrations ([0966a16](https://github.com/InteraqtDev/interaqt/commit/0966a16ea109b4c4afba1adc08a579dd0c602405))

## [1.5.3](https://github.com/InteraqtDev/interaqt/compare/v1.5.2...v1.5.3) (2026-05-07)


### Bug Fixes

* accept reviewed event rebuild decisions ([775ad5c](https://github.com/InteraqtDev/interaqt/commit/775ad5cb3d728e854873376a7a6a65ec4b845a03))

## [1.5.1](https://github.com/InteraqtDev/interaqt/compare/v1.5.0...vnull) (2026-05-07)


### Bug Fixes

* harden data migration safety gates ([f002598](https://github.com/InteraqtDev/interaqt/commit/f002598ad2a23bbe9e3ebc80942b42ecdafdad9c))

## [1.5.1](https://github.com/InteraqtDev/interaqt/compare/v1.5.0...v1.5.1) (2026-05-07)


### Bug Fixes

* harden data migration safety gates ([f002598](https://github.com/InteraqtDev/interaqt/commit/f002598ad2a23bbe9e3ebc80942b42ecdafdad9c))

## [1.5.0](https://github.com/InteraqtDev/interaqt/compare/v1.4.0...v1.5.0) (2026-05-06)


### Features

* add data migration phase 1 support ([8143a1b](https://github.com/InteraqtDev/interaqt/commit/8143a1b69147e4a275367915130e48e00f60cc23))
* add two-step migration review ([8c14e1b](https://github.com/InteraqtDev/interaqt/commit/8c14e1bf646ea3d80e6048de39817dbdbe5864b1))

## [1.4.0](https://github.com/InteraqtDev/interaqt/compare/v1.3.0...v1.4.0) (2026-05-02)


### Features

* add dispatch transaction contract ([a52dda9](https://github.com/InteraqtDev/interaqt/commit/a52dda917ba26dc58772fb2932303892cf6bcec4))

## [1.3.0](https://github.com/InteraqtDev/interaqt/compare/v1.2.0...v1.3.0) (2026-05-02)


### Features

* add schema-level data constraints ([be0df4c](https://github.com/InteraqtDev/interaqt/commit/be0df4cf0c908683bb44e883e399c99423035b1e))

## [1.2.0](https://github.com/InteraqtDev/interaqt/compare/v1.1.3...v1.2.0) (2026-05-02)


### Bug Fixes

* atomicize reactive computation updates ([88232b2](https://github.com/InteraqtDev/interaqt/commit/88232b2137028afa22d960d636da4b4e25b62697))
* close PostgreSQL computation concurrency gaps ([5c3c27a](https://github.com/InteraqtDev/interaqt/commit/5c3c27a0ef93721c9b9cf367d103d02c1f2cef70))
* externalize node async hooks in build ([0547a24](https://github.com/InteraqtDev/interaqt/commit/0547a24ef7218bd26c4dcf66ca5e530399169ee6))
* isolate dispatch retry arguments ([5683bd6](https://github.com/InteraqtDev/interaqt/commit/5683bd6d331a29f60e96d90ee90b01ffced1b645))


## [1.1.3](https://github.com/InteraqtDev/interaqt/compare/v1.1.2...v1.1.3) (2026-03-22)

## [1.1.2](https://github.com/InteraqtDev/interaqt/compare/v1.1.1...v1.1.2) (2026-03-22)

## [1.1.1](https://github.com/InteraqtDev/interaqt/compare/v1.1.0...v1.1.1) (2026-03-04)


### Bug Fixes

* correct RealTime.is() type check to match actual _type value ([ab1f329](https://github.com/InteraqtDev/interaqt/commit/ab1f329143a263613ff000dc8725ac3ae2fa71d0))
* patch loop early-exit in applyResultPatch and remove incorrect name length constraint ([8eaa422](https://github.com/InteraqtDev/interaqt/commit/8eaa4226025fe13faad07ab41e5f51d0233c8c5b))

## [1.1.0](https://github.com/InteraqtDev/interaqt/compare/v1.0.0...v1.1.0) (2026-02-21)


### Features

* implement interaction context and refactor activity ([1950dca](https://github.com/InteraqtDev/interaqt/commit/1950dcaf7cdb990d8f7ef9792c4c1bff67b84a1c))

## [1.0.0](https://github.com/InteraqtDev/interaqt/compare/v0.9.0...v1.0.0) (2026-02-20)


### Bug Fixes

* use import type for type-only imports in InteractionCall ([2952e4d](https://github.com/InteraqtDev/interaqt/commit/2952e4d4db098b9b2da9a1d09845ff03e83cd480))

## [0.8.15](https://github.com/InteraqtDev/interaqt/compare/v0.8.14...v0.8.15) (2026-01-29)


### Bug Fixes

* use record instead of oldRecord in Count delete event handling ([06375f0](https://github.com/InteraqtDev/interaqt/commit/06375f0aecf43f7bc1abced4362bea15421abb5f))

## [0.8.14](https://github.com/InteraqtDev/interaqt/compare/v0.8.13...v0.8.14) (2026-01-16)


### Bug Fixes

* propagate computed updates to count callbacks ([0875658](https://github.com/InteraqtDev/interaqt/commit/08756583e217d43f50f5fe928f25d8e0ad16a4b9))

## [0.8.12](https://github.com/InteraqtDev/interaqt/compare/v0.8.11...v0.8.12) (2025-11-17)

## [0.8.11](https://github.com/InteraqtDev/interaqt/compare/v0.8.10...v0.8.11) (2025-11-16)

## [0.8.10](https://github.com/InteraqtDev/interaqt/compare/v0.8.8...v0.8.10) (2025-11-09)


### Bug Fixes

* storage assign table and prop name ([7d5b3d5](https://github.com/InteraqtDev/interaqt/commit/7d5b3d541da341b1eeea8349010db90b929dcce4))
