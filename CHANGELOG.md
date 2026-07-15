# Changelog

## [4.1.2](https://github.com/interaqtdev/interaqt/compare/v4.1.1...v4.1.2) (2026-07-15)

### Bug Fixes

* **storage:** r28 — combined x:1 reads gate on link-id column (phantom pairing family, query face) ([b152814](https://github.com/interaqtdev/interaqt/commit/b1528147e425ca26c6be42059fddc7066153e65e))
* **storage:** r28 deep review — row-slot exclusivity, migration vs deletion semantics, reliance topology equivalence ([b180749](https://github.com/interaqtdev/interaqt/commit/b1807494e9045552b882089439ec35f297e00ee8))

## [4.1.1](https://github.com/interaqtdev/interaqt/compare/v4.1.0...v4.1.1) (2026-07-14)

### Bug Fixes

* r27 deep review — combined-child nested structure fail-fast, property-dep dedupe, single-sided BoolExp, aggregation XOR, MySQL opkey wiring, StateTransfer deep clone, onlyRelationData reject ([611c6bc](https://github.com/interaqtdev/interaqt/commit/611c6bca876a7fb2332ed98e096d780e4d9dff41))
* **storage:** combined (三表合一) child payloads carrying nested structures now fail fast at the `preprocessSameRowData` convergence point — six shapes previously lost or corrupted data silently (isolated n:n links dropped, nested-new records never created, merged-FK refs without link identity/events, depth-2 grandchildren without ids, nested refs duplicating logical ids); reachable at runtime through plain 1:1 `isTargetReliance` ([611c6bc](https://github.com/interaqtdev/interaqt/commit/611c6bca876a7fb2332ed98e096d780e4d9dff41))
* **runtime:** one mutation event hitting multiple property dataDeps of the same computation now runs it once per (computation, targetPath) — was N times, double-applying `useLastValue` increments and create-time initial computes; live Scheduler and migration chained rebuild share the contract ([611c6bc](https://github.com/interaqtdev/interaqt/commit/611c6bca876a7fb2332ed98e096d780e4d9dff41))
* **core:** single-sided and/or `BoolExpressionData` (legal at declaration since v4.1.0) evaluates as its left operand across all four readers (evaluate/evaluateAsync/map/SQL builder) — was throwing "missing the right operand" on every dispatch; De Morgan inversion intact ([611c6bc](https://github.com/interaqtdev/interaqt/commit/611c6bca876a7fb2332ed98e096d780e4d9dff41))
* **runtime:** the v4.1.0-documented MySQL migration operationKey sha256 surrogate is now actually wired into the MonoStorage read/write choke point (was dead code; >191-char keys silently truncated in the VARCHAR(191) PK under `ANSI_QUOTES`), verified against real MySQL 8 in CI ([611c6bc](https://github.com/interaqtdev/interaqt/commit/611c6bca876a7fb2332ed98e096d780e4d9dff41))
* **storage:** string ids passed through public APIs (whose signatures declare `string`) no longer split JS identity from SQL equality — all eight write-path id identity checks converge on `sameRecordId` (String-normalized); was producing duplicate logical-id rows and lost fields on numeric-id drivers ([481a0d4](https://github.com/interaqtdev/interaqt/commit/481a0d47))
* **storage:** binding a new reliance dependent to an owner that already holds one fails fast on all three producer tracks (addRelation / direct link-record create / create-ref adoption) — was silently destroying the old dependent's row with no delete event; re-parenting a dependent and adopting a free owner remain legal ([481a0d4](https://github.com/interaqtdev/interaqt/commit/481a0d47))
* **storage:** claiming a record as a relation endpoint while it shares its physical row with a cross-relation combined co-tenant fails fast — row migration does not carry `notRelianceCombined` co-tenants, so the co-tenant link was silently destroyed with no delete event; assign merged FKs on combined rows through the update track ([481a0d4](https://github.com/interaqtdev/interaqt/commit/481a0d47))
* **core:** aggregations (Count/Every/Any/Summation/Average/WeightedSummation) reject `record` and `property` both set — `record` was silently ignored at runtime ([611c6bc](https://github.com/interaqtdev/interaqt/commit/611c6bca876a7fb2332ed98e096d780e4d9dff41))
* **core:** `StateTransfer.clone(x, true)` deep-copies `trigger` (was shared by reference — mutating a clone rewrote the original state machine's trigger) ([611c6bc](https://github.com/interaqtdev/interaqt/commit/611c6bca876a7fb2332ed98e096d780e4d9dff41))
* **storage:** the legacy `onlyRelationData` third attributeQuery tuple element is rejected loudly (was silently dropping the whole x:n attribute from results); `.cursor/rules` mis-documentation ("true = is collection") corrected ([611c6bc](https://github.com/interaqtdev/interaqt/commit/611c6bca876a7fb2332ed98e096d780e4d9dff41))

### Features

* **tests:** write-path structural fuzzer (`tests/storage/writePathStructuralFuzz.spec.ts`) — random schemas (physical topologies emerge from declarations) × random nested write sequences (native + string id forms), judged by the event-completeness oracle plus new structural invariants (unique logical ids, no identity-less records); deterministic seeds with full op-log reproduction; caught three fatal bugs on its first run against the 27-round-reviewed codebase ([481a0d4](https://github.com/interaqtdev/interaqt/commit/481a0d47))

### Behavior changes (upgrade notes)

* Combined-topology child payloads carrying relation attributes / nested records fail fast (previously silent data loss or duplicate logical ids); create related records first, then reference by `{ id }`.
* Multiple property dataDeps hit by one mutation event run the computation once (previously N times; first setup after upgrade recomputes stored values).
* Reliance displacement and cross-relation co-tenant endpoint claims fail fast (previously silent row/link destruction).
* Single-sided and/or evaluates as its left operand (previously threw at evaluation); code relying on that error should validate at declaration time instead.
* RealTime docs no longer promise an internal time scheduler: `nextRecomputeTime` is persisted state for external schedulers; recomputation triggers remain dataDeps mutations and migration rebuilds.

## [4.1.0](https://github.com/InteraqtDev/interaqt/compare/v4.0.6...v4.1.0) (2026-07-13)

### Bug Fixes

* r26 deep review — flashOut delete endpoints, Activity guard order, declaration guards, close idempotency ([b39efd2](https://github.com/InteraqtDev/interaqt/commit/b39efd2ec06c7cc072f30c6d82704f079fc5a838))
* **storage:** relation-event endpoint contract enforced across delete/update/view tracks — event oracle rules 6/7 caught and fixed `{id:undefined}` endpoints, a swapped `stolenIsSource` on merged-replace deletes, endpoint-less in-row `&` update oldRecord, and endpoint-less filtered-view delete snapshots ([929b1e0](https://github.com/InteraqtDev/interaqt/commit/929b1e0f), [56b0507](https://github.com/InteraqtDev/interaqt/commit/56b0507c))
* **runtime:** migration `operationKey` is content-addressed (`content#occurrence`) — resume survives plan reorder/insertion; legacy index-keys honored read-only ([946e404](https://github.com/InteraqtDev/interaqt/commit/946e404d))
* **runtime:** `argsSignature` gains Date/Set/Map/RegExp codecs (previously collapsed to `{}`, making value changes migration-invisible); manifest generator `"4"→"5"` — existing deployments re-baseline via the standard gate ([946e404](https://github.com/InteraqtDev/interaqt/commit/946e404d))
* **runtime:** corrupted migration manifest now throws a guided error with the `createMigrationBaseline()` recovery path ([946e404](https://github.com/InteraqtDev/interaqt/commit/946e404d))
* **runtime:** Transform unique-index names use sha1 (collision-resistant); legacy weak-hash indexes are dropped on setup ([946e404](https://github.com/InteraqtDev/interaqt/commit/946e404d))
* **core:** `StateMachine.clone(deep)` performs a real deep clone (isomorphic node mapping, structured-cloned triggers) ([946e404](https://github.com/InteraqtDev/interaqt/commit/946e404d))
* **drivers:** MySQL passes `Date` params natively (was JSON.stringify → NaN reads on TIMESTAMP columns); migration bookkeeping tables are MySQL-compatible (VARCHAR keys, sha256 surrogate operation keys) ([946e404](https://github.com/InteraqtDev/interaqt/commit/946e404d))

### Features

* **core:** unified declaration-time validation — `static.public` required/options/constraints are enforced in every `create()` via the new `validateCreateArgs` (exported from `@core`); wired across Count/Every/Any/Summation/Average/WeightedSummation (record|property either-or), Transform (callback required, record XOR eventDeps), Custom, RealTime, SideEffect, EventSource, StateMachine, Activity, ActivityGroup (type whitelist `any|every|race`) ([946e404](https://github.com/InteraqtDev/interaqt/commit/946e404d))
* **storage:** `type:'timestamp'` cross-driver epoch-ms contract — writes accept `Date | epoch-ms | ISO string`, reads (find/atomic) return `number`, match params (`=`/`in`/`between`) follow the same contract on SQLite/PGLite/PostgreSQL/MySQL ([946e404](https://github.com/InteraqtDev/interaqt/commit/946e404d))

### Behavior changes (upgrade notes)

* `timestamp` reads change from driver-native values (PG returned `Date`) to epoch-ms `number` everywhere.
* Previously-silent invalid declarations now fail at `create()` (e.g. `Count.create({})`, `ActivityGroup.create({type:'sequential'})`, `EventSource.create()` without `entity`).
* Unauthorized activity probes now receive the Condition error without `ActivityStateError.currentState`.
* Migration manifest generator bumped to `"5"`; four-driver `close()` is idempotent.

## [4.0.6](https://github.com/interaqtdev/interaqt/compare/v4.0.5...v4.0.6) (2026-07-13)

### Bug Fixes

* **core:** r25 I-4 wire merged no-properties constraints into create; commonProperties go through name guards ([4a2cd0f](https://github.com/interaqtdev/interaqt/commit/4a2cd0fa1708679b16de786754eef11de11b3f06))
* **drivers:** r25 I-1 dialect entry recognizes type:'json' fieldType case-insensitively ([543d1e5](https://github.com/interaqtdev/interaqt/commit/543d1e5ff7439898f8060aeaa4be389ca94a8e5a))
* **drivers:** r25 I-2 MySQL open() is idempotent - reuse working connection, no leak ([08e270d](https://github.com/interaqtdev/interaqt/commit/08e270de00a26820b2295ec64892b0bb16661aab))
* **runtime:** r25 I-3 record-target atomic write path normalizes json fields ([df45bfe](https://github.com/interaqtdev/interaqt/commit/df45bfe88983fbd2fb5f54b15845b18a6d254562))
* **storage:** r25 F-1 in-row base create events carry default-only fields; F-2 filtered-relation EXIST folds predicate into subquery ([5433cf7](https://github.com/interaqtdev/interaqt/commit/5433cf754161cf623ed42d1170369dbfad900665))

## [4.0.5](https://github.com/interaqtdev/interaqt/compare/v4.0.4...v4.0.5) (2026-07-12)

### Bug Fixes

* **drivers:** PostgreSQL getAutoId returns number — id type split broke merged-link row merging (r24 F-1) ([631a9ac](https://github.com/interaqtdev/interaqt/commit/631a9ac62564aa86c29d60277fc53101cde40f73))
* r23 dual same-target reliance fail-fast; txn rollback phantom events; declaration guards ([e53ef8c](https://github.com/interaqtdev/interaqt/commit/e53ef8c77cd11ad46459a3df372af943576d2dba))
* r23 follow-up — allow id type, drop Dictionary defaultValue guard, update fixtures/docs ([2233f29](https://github.com/interaqtdev/interaqt/commit/2233f298f4fbb791050a77212fd10afe157f1142))
* r24 — atomic read normalization, lockRecord graph lock, migration signature stability ([9677879](https://github.com/interaqtdev/interaqt/commit/96778796349dc17d62d818f0ec09097a55befcdc))

## [4.0.4](https://github.com/interaqtdev/interaqt/compare/v4.0.3...v4.0.4) (2026-07-12)

### Bug Fixes

* **drivers:** SQLite open/openForSchemaRead reuse existing connection (r22 I-5) ([5af1c72](https://github.com/interaqtdev/interaqt/commit/5af1c72f859cea50b863971eaf8ae4b2a11e6d66))
* **runtime,core:** fail fast on event-entity shadowing, unknown listener type, StateMachine graph violations (r22 I-1, I-2) ([e2a7f57](https://github.com/interaqtdev/interaqt/commit/e2a7f576457b2dc12695a6546a903c4fe0a2da62))
* **runtime:** isolate per-attempt events in transaction retry; delete events use event.record as old-state match snapshot (r22 F-2, I-3) ([40b5358](https://github.com/interaqtdev/interaqt/commit/40b5358654d97c6a523f9373765f6cdde7d07165))
* **storage:** resolve filtered-endpoint names in membership hooks; unify inline-link view event defaults (r22 F-1, I-4) ([caa0056](https://github.com/interaqtdev/interaqt/commit/caa005697863e1d5149ea9e0f9689dd341e763ea))

## [4.0.3](https://github.com/interaqtdev/interaqt/compare/v4.0.2...v4.0.3) (2026-07-12)

### Bug Fixes

* **builtins:** PayloadItem.type whitelist + Entity/Relation requires base; Payload rejects duplicate item names (r21 I-2) ([f740ef8](https://github.com/interaqtdev/interaqt/commit/f740ef856e633c72cb434a652c35b9916e579dd0)), closes [#4](https://github.com/interaqtdev/interaqt/issues/4)
* **core:** BoolExp atom handlers must return booleans - fail-closed (r21 I-3) ([0abe114](https://github.com/interaqtdev/interaqt/commit/0abe11407c7d98458679b25b6145ac96c0c36a8f))
* **runtime:** records-match local evaluation mirrors SQL semantics (r21 F-1) ([9e5c56b](https://github.com/interaqtdev/interaqt/commit/9e5c56b576bedca29b749e6604ceb6ff6e11618b))
* **storage:** combined addRelation-steal emits old-owner membership events; between rejects null bounds (r21 F-2, I-1) ([4ebf32a](https://github.com/interaqtdev/interaqt/commit/4ebf32a990940bb0b968e3adf798152cd3a7daca))

## [4.0.2](https://github.com/interaqtdev/interaqt/compare/v4.0.1...v4.0.2) (2026-07-11)

### Bug Fixes

* **core:** reject contradictory type/source/target on filtered/merged relations (r20 I-2) ([68d92fd](https://github.com/interaqtdev/interaqt/commit/68d92fdae193a6b26906a8b4c7f4c6893d622ba0))
* **runtime:** StateMachine trigger.record matches merged current state on update events (r20 F-5) ([abb9143](https://github.com/interaqtdev/interaqt/commit/abb9143436df379723e2f43d2a1b42c9223cbd57))
* **storage:** in-row link/combined writes emit filtered-view membership events; relation endpoints immutable through update; flashOut link create carries endpoints (r20 F-2, F-3, F-4) ([19990ab](https://github.com/interaqtdev/interaqt/commit/19990abf034fd72973e84d11c7062cb3d07fa6e6))
* **storage:** unify isReferenceValue path collection (between refs join the JOIN tree) + split null out of IN/NOT IN lists (r20 F-1, I-1) ([adabd1d](https://github.com/interaqtdev/interaqt/commit/adabd1d0aac9f36530e71fc320ade991de9a284f))

## [4.0.1](https://github.com/interaqtdev/interaqt/compare/v4.0.0...v4.0.1) (2026-07-11)

### Bug Fixes

* **builtins:** reject arrays in entity/relation payload structural check ([7b0adce](https://github.com/interaqtdev/interaqt/commit/7b0adce479bc5a1b2c909cf0487b4e5618b50050))
* **core:** BoolExp NOT propagates inverse through AND/OR (De Morgan) — guard fail-open ([b9a480f](https://github.com/interaqtdev/interaqt/commit/b9a480f1428b1ec7e41035a05c209a00ddb1b7ae))
* **storage:** combined-topology steal re-evaluates old owner's filtered membership ([7508337](https://github.com/interaqtdev/interaqt/commit/750833794a9cf8bb72c0507864fb3cee4377f20e))
* **storage:** hoist EXIST inner isReferenceValue paths into outer JOIN tree ([5b7c245](https://github.com/interaqtdev/interaqt/commit/5b7c24511f1b9bc2d7b2797d93eea0d0cadb3372))
* **storage:** normalize EXIST payload node forms in collectExistReferencePaths ([fc3b411](https://github.com/interaqtdev/interaqt/commit/fc3b411c7d91544ffd64c78dfe66ab8cda01d66c))

## [4.0.0](https://github.com/interaqtdev/interaqt/compare/v3.1.0...v4.0.0) (2026-07-11)

r18 deep review release. Full analysis: `agentspace/output/deep-review-2026-07-11-r18.md` and `agentspace/output/r18-test-blindness-retrospective.md` (PR [#34](https://github.com/InteraqtDev/interaqt/pull/34)).

### ⚠ BREAKING CHANGES

* **runtime:** migration manifest generator version bumped **2 → 3** — computation signatures now include plain-value args (`argsSignature`: StateMachine `trigger.keys`/`trigger.record` patterns and state-graph topology, `Every.notEmpty`, Transform eventDep record patterns, ...). Previously changing any of these produced a **zero-diff migration** and stale data silently sailed through. Manifests written by generator 2 are rejected with guidance: **regenerate your migration baseline after upgrading** (same policy as the 1 → 2 bump).

### ⚠ Behavior tightening (silently-broken declarations now fail fast)

These were previously accepted but produced silent data corruption or permanently-dead reactive behavior; they now throw with guidance:

* **storage+core:** a relation `sourceProperty`/`targetProperty` colliding with a **value property** on the endpoint family (base + filtered variants) fails fast — the relation silently swallowed the value property (scalar writes were expanded as related-record payloads, corrupting data).
* **core:** reserved property names `id`/`_rowId` (plus `source`/`target` on relation properties) and duplicate property names per entity/relation are rejected at `Entity.create`/`Relation.create` (with a `DBSetup` safety net for post-create pushes) — the framework silently overwrote/last-one-won before.
* **runtime:** dataDeps/eventDeps pointing at record names unknown to the storage schema (typos, entities not registered on the Controller, global dictionary names used as `recordName`) fail fast at setup with routing guidance — previously silent dead listeners (computations stayed stale forever with zero warning).
* **runtime:** ScopedSequence scope inputs are immutable after a number is assigned — updating a value-scope field or removing/replacing a ref-scope relation on a numbered record fails fast. Previously the record silently carried its number into another scope (duplicate numbers there; with the documented `UniqueConstraint(scope+number)` the target scope's creates hit the constraint **permanently**, since the counter rolls back with each failed transaction).

### Bug Fixes

* **runtime:** event-driven computations (StateMachine triggers, Transform `eventDeps`) declared with `type: 'update'` on a **filtered entity/relation name** were dead listeners — storage emits field updates under the physical base name only. Event-based update listeners are now normalized onto the physical name (like data-based ones) and routed back through the membership guard with the event's `recordName` rewritten to the view name; enter/exit remain driven by membership create/delete events (no double-firing). ([fdd3cbf](https://github.com/interaqtdev/interaqt/commit/fdd3cbf407b5d5a8b420ffaa454449675fa86d3b))
* **runtime:** view-name → physical-name resolution now comes from the compiled storage schema (`resolvedBaseRecordName`) instead of hand-walking controller-side `baseEntity`/`baseRelation` chains — this killed a sibling bug where **merged input views** (`inputEntities`/`inputRelations`) had dead update listeners on BOTH computation tracks (e.g. a `Summation` over an input view never reacted to member field updates). ([7bfe249](https://github.com/interaqtdev/interaqt/commit/7bfe2492))
* **runtime:** a setup-time **dead-listener invariant** (`assertListenerReachable`) now guards the whole subscription face; `addSourceMap`/`addSourceMaps` route through the same normalize+assert pipeline so no producer can bypass it. It also exposed and removed historically dead registrations on virtual endpoint links (`<relation>_source`/`_target` never emit events). ([7bfe249](https://github.com/interaqtdev/interaqt/commit/7bfe2492))
* **runtime:** `retrieveLastValue` keys on presence (`!== undefined`) instead of truthiness — computed values `0`/`false`/`''` are no longer misread as missing. ([fdd3cbf](https://github.com/interaqtdev/interaqt/commit/fdd3cbf407b5d5a8b420ffaa454449675fa86d3b))
* **tests:** the activity fixture itself carried the value/relation property collision (dead scalar `message` on `Request`) — cleaned up when the new guard caught it.

### Tests & docs

* regressions: `tests/runtime/review-fixes-2026-07-11-r18.spec.ts` (16 cases: F-1 routing incl. enter/no-double-fire, migration argsSignature visibility + cross-process stability, ScopedSequence immutability, merged-input routing, typo/dict-name fail-fast, addSourceMap no-bypass) + `tests/storage/review-fixes-2026-07-11-r18.spec.ts` (9 cases: namespace collisions, reserved/duplicate names)
* dimension registry gains two **mechanism axes** (computation track, listened-name form) and the "enumerate all readers of a declaration surface when fixing routing bugs" checklist (`tests/runtime/WritingComputationTests.md`)
* `AGENTS.md` + always-applied Cursor rule: mandatory systemic bug-fix checklist ("fix the class, not the instance")
* knowledge base: view-name event semantics (usage/09), ScopedSequence scope immutability contract (usage/04), reserved-name and namespace-collision anti-patterns (usage/19)

## [3.1.0](https://github.com/interaqtdev/interaqt/compare/v3.0.2...v3.1.0) (2026-07-11)

r17 deep review release. Full analysis: `agentspace/output/deep-review-2026-07-11-r17.md` and `agentspace/output/r17-test-blindness-retrospective.md` (PR [#33](https://github.com/InteraqtDev/interaqt/pull/33)).

### ⚠ Behavior tightening (silently-broken declarations now fail fast)

These declarations/inputs were previously accepted but produced silent data corruption; they now throw with guidance:

* **core:** symmetric relations (source === target with the same property name) now require `type: 'n:n'` — symmetric 1:1/n:1 only ever wrote one readable side (`A.spouse = B` while `B.spouse` stayed empty). Use distinct property names for directed self-references.
* **core:** `isTargetReliance` now requires `type: '1:1'` or `'1:n'` — with n:1/n:n a shared target was cascade-deleted while other sources still held it.
* **builtins:** payload `type: 'number'` rejects `NaN`/`±Infinity`; `type: 'object'` (non-collection) rejects arrays.
* **storage:** merging duplicate `attributeQuery` keys with conflicting `matchExpression`/`modifier` fails fast (previously the filter was silently dropped, returning unfiltered related records).
* New mutation events (previously incorrectly missing): link `update` events for same-id `&` in-place changes; business-link `delete` events on combined-topology steals. Listeners on these relation events (StateMachine triggers, Transform eventDeps) will now fire where they previously did not.

### Bug Fixes

* **storage+runtime:** r17 fatal fixes ([0118d88](https://github.com/interaqtdev/interaqt/commit/0118d88606b00eaecfb346b0ce5b8575e8dc2311))
  * exclusive 1:1 steal — assigning an already-owned 1:1 target by ref now unlinks the previous owner (create/update/addRelation, merged & isolated topologies; forward/reverse queries no longer contradict)
  * same-id `&` in-place updates emit link update events (reactive computations over link properties no longer go stale); combined topology no longer lets flashOut overwrite the new values with old row data
  * symmetric n:n + per-link item-state aggregations fall back to full recompute (both endpoints count correctly; edge deletion no longer crashes with "count became negative")
  * match paths with multiple consecutive symmetric segments expand ALL segments (cartesian variants) instead of silently returning half results
* **storage:** first-run catches by the new structural test layers ([6510ea6](https://github.com/interaqtdev/interaqt/commit/6510ea6e), [9d1f1f3](https://github.com/interaqtdev/interaqt/commit/9d1f1f32))
  * symmetric fan-out no longer mis-attaches `&` link data to a sibling edge of the far endpoint
  * combined-topology entity delete clears combined-link columns (no more dangling links that were event-deleted but still queryable)
  * combined-link steal via addRelation no longer crashes on OR-matched unrelated rows and emits the business-link delete event
  * combined replace-by-ref no longer drops `&` attributes carried on the ref
* **storage:** symmetric `&` nested endpoint entity attributes (e.g. `friends.&.source.name`) no longer throw raw SQL errors — the JOIN tree now expands direction variants in sync with the SELECT ([ffe0d42](https://github.com/interaqtdev/interaqt/commit/ffe0d428))

### Tests & docs

* structural test layers: event-completeness oracle (storage + runtime variants), write-path × physical-topology matrix, symmetric × all-six-aggregations matrix (naive-recompute oracle), symmetric path matrix, dimension registry with consolidation policy (`tests/runtime/WritingComputationTests.md`)
* point regressions strictly covered by the matrices were consolidated (unique assertions migrated first; detection power re-verified by mutation testing: 12 matrix cases turn red against the pre-fix baseline)
* security docs: `dataPolicy.match` must be paired with `dataPolicy.attributeQuery` (column projection is otherwise caller-controlled)

## [3.0.2](https://github.com/interaqtdev/interaqt/compare/v3.0.1...v3.0.2) (2026-07-10)

### Bug Fixes

* **runtime+storage:** r16 deep review — patch envelope guard, membership create event contract, single-field aggregation, migration chained event-rebuild ([182aa4e](https://github.com/interaqtdev/interaqt/commit/182aa4e5e24ce019e41848a56d13e3bae75c4e1b))

## [3.0.1](https://github.com/interaqtdev/interaqt/compare/v2.0.4...v3.0.1) (2026-07-10)

### ⚠ BREAKING CHANGES

* **builtins+core:** remove the Attributive concept — Condition is the single guard concept

### Bug Fixes

* **runtime+storage+builtins+drivers:** r13 review — guard boolean contract, undefined write-through, transform id collision ([60f7ab5](https://github.com/interaqtdev/interaqt/commit/60f7ab5c92288c19f0b55a6e8a4282ca148cc6f3))
* **runtime+storage+builtins:** r15 deep review — statemachine computeValue contract, migration cross-process resume, ComputationResult envelope guard ([86d1bff](https://github.com/interaqtdev/interaqt/commit/86d1bff6732d5a5996d2a1320fed1852f6df1eae))
* **runtime+storage+drivers:** resolve all r13 significant-improvement items (I-1..I-10) ([52e57fe](https://github.com/interaqtdev/interaqt/commit/52e57fe9bfad08ca471b406d8f4afc94d7b03dd5))

### Code Refactoring

* **builtins+core:** remove the Attributive concept — Condition is the single guard concept ([0c43aee](https://github.com/interaqtdev/interaqt/commit/0c43aee95104f467c61fac3eacbc1b172753b5ba))

## [3.0.0](https://github.com/interaqtdev/interaqt/compare/v2.0.4...v3.0.0) (2026-07-10)

### ⚠ BREAKING CHANGES

* **builtins+core:** remove the Attributive concept — Condition is the single guard concept

### Bug Fixes

* **runtime+storage+builtins+drivers:** r13 review — guard boolean contract, undefined write-through, transform id collision ([60f7ab5](https://github.com/interaqtdev/interaqt/commit/60f7ab5c92288c19f0b55a6e8a4282ca148cc6f3))
* **runtime+storage+drivers:** resolve all r13 significant-improvement items (I-1..I-10) ([52e57fe](https://github.com/interaqtdev/interaqt/commit/52e57fe9bfad08ca471b406d8f4afc94d7b03dd5))

### Code Refactoring

* **builtins+core:** remove the Attributive concept — Condition is the single guard concept ([0c43aee](https://github.com/interaqtdev/interaqt/commit/0c43aee95104f467c61fac3eacbc1b172753b5ba))

## [2.0.4](https://github.com/interaqtdev/interaqt/compare/v2.0.3...v2.0.4) (2026-07-10)

### Bug Fixes

* **runtime+storage+core+builtins+drivers:** r12 review — global patch envelope, reference-value joins, declaration-mode conflicts, json canonical form, driver parity ([3f161e5](https://github.com/interaqtdev/interaqt/commit/3f161e599632a4b35c74c710716b481399e18598))

## [2.0.3](https://github.com/interaqtdev/interaqt/compare/v2.0.2...v2.0.3) (2026-07-10)

### Bug Fixes

* **runtime+storage+builtins:** r11 review — propagation cycle guard, GetAction name binding, json IN/NOT IN, duplicate eventSource names, RealTime zero-trigger fail-fast ([523dc31](https://github.com/interaqtdev/interaqt/commit/523dc31662f0c72cf11f88355c46ea7d1ed05424))
* **runtime:** allow zero-dataDeps global RealTime (migration rebuild is a valid trigger); test matrix corrections for r11 fail-fasts; docs: storage.listen transaction semantics ([02a5ebf](https://github.com/interaqtdev/interaqt/commit/02a5ebfbe38efc18c10b2e14513510607df33cf3))

## [2.0.2](https://github.com/interaqtdev/interaqt/compare/v2.0.1...v2.0.2) (2026-07-09)

### Bug Fixes

* **core+storage+runtime+builtins:** fail-fast for silent-failure paths found in r10 review ([fe67519](https://github.com/interaqtdev/interaqt/commit/fe67519f442e5cebf9b26f427f1ca5f8310425d5))

## [2.0.1](https://github.com/interaqtdev/interaqt/compare/v2.0.0...v2.0.1) (2026-07-09)

### Bug Fixes

* **build:** publish drivers as the interaqt/drivers subpath entry — drivers import shared singletons from the main entry; README quick-start import (F-3) ([de4bca4](https://github.com/interaqtdev/interaqt/commit/de4bca40673474ce19a9628ebf79db5a418fec8e))
* **builtins+storage:** dataPolicy.attributeQuery enforced as fixed projection (policy wins, callers cannot widen); computed properties fail fast on relation access instead of silently corrupting ([dad1260](https://github.com/interaqtdev/interaqt/commit/dad126075b1474326b915d786eaa78c276fbb3de))
* **builtins:** isActivityHead uses the recursion head param — group-head activities no longer stack-overflow; activityId fail-closed (F-1, R-1) ([58f62fe](https://github.com/interaqtdev/interaqt/commit/58f62fe05409fea23a705db69b0188f6c06fcb3c))
* **builtins:** serialization joins the unified core pipeline — Interaction.stringify via stringifyInstance, parse decodes functions and preserves uuid, Transfer/ActivityGroup/Attributives registered (F-2, I-7) ([ffc2393](https://github.com/interaqtdev/interaqt/commit/ffc23936f2cf74503ff363465431c180579108c8))
* **core+builtins:** serialization round-trip completeness — Payload/PayloadItem/DataPolicy via stringifyInstance, EventSource registered with full public schema ([c13bba7](https://github.com/interaqtdev/interaqt/commit/c13bba76f6ea3601d3a694ba7c205ab443f3cec2))
* **drivers:** atomic parameterized id allocation for SQLite/MySQL; safe MySQL database bootstrap; document MySQL transaction limitation ([e6386d0](https://github.com/interaqtdev/interaqt/commit/e6386d0cc069b7bfa54a964296fe9547420b13e7))
* **drivers:** SQLite insert() returns RETURNING rows instead of run() metadata (R-2) ([ce25ed1](https://github.com/interaqtdev/interaqt/commit/ce25ed12de3aeed71e3566712a17ca74ba3e07f0))
* **runtime+storage:** filtered-source aggregations react to in-member field updates; '&' link data survives update/1:1/1:n paths; 1:n ownership steal no longer crashes ([0f3dfb3](https://github.com/interaqtdev/interaqt/commit/0f3dfb3e913e798119842cd81d0ee04a7f2d0026))
* **runtime:** Custom records dataDep requires explicit attributeQuery (F-3) ([f588b7c](https://github.com/interaqtdev/interaqt/commit/f588b7c49f37a9caa7b5683a8a89dee5a617b9f0))
* **runtime:** dedupe the _self host-create listener against dataDep-registered ones — global+property dataDeps no longer double-run the computation (R-3) ([7698b66](https://github.com/interaqtdev/interaqt/commit/7698b664136dd08d7426b16492f82497829679f4))
* **runtime:** filtered membership diff evaluates old members on the old base record (R-9) ([40bec9c](https://github.com/interaqtdev/interaqt/commit/40bec9c5d9580de5e46d05c9e23e8b858109a4f8))
* **runtime:** global dict dataDep events are filtered by key for create and update (F-5) ([41a4c57](https://github.com/interaqtdev/interaqt/commit/41a4c57af772172f01063e325cbb8022783ba05c))
* **runtime:** lifecycle edge hardening — atomic scheduler listener swap, migration filtered-event routing parity, clear recovery guidance ([36e8883](https://github.com/interaqtdev/interaqt/commit/36e888334daaffd51af84db60e258442382382d3))
* **runtime:** PropertyAverage guards against negative count, aligned with PropertyCount (R-6.1) ([a53f14a](https://github.com/interaqtdev/interaqt/commit/a53f14a55f361ba8b33b0fa8327d91928e9c705d))
* **runtime:** PropertyEvery/PropertyAny fall back to fullRecompute on missing relation records (R-3) ([621ca99](https://github.com/interaqtdev/interaqt/commit/621ca990abcfddce4bf8772368519c5f359ec00d))
* **runtime:** StateMachine computeTarget results normalized to {id}[] — {source,target}/pair forms resolve relation records, invalid forms fail fast (R-2) ([f6e7a44](https://github.com/interaqtdev/interaqt/commit/f6e7a44c484001c5290da331e839fb57f4a45334))
* **runtime:** StateMachine trigger.keys validated at setup — relation attributes, unknown properties and empty arrays are rejected (R-1) ([2836635](https://github.com/interaqtdev/interaqt/commit/28366353cbd11bbd721ba1b4eccc300650a7b228))
* **runtime:** Transform update patch cleans up derived rows when the source row is gone (R-7) ([a352260](https://github.com/interaqtdev/interaqt/commit/a352260b2ad8b315e48210dcd6daab8542ae6212))
* **runtime:** trigger.keys validation expands merged entity inputEntities; docs: Custom dataDeps contract notes ([feab45b](https://github.com/interaqtdev/interaqt/commit/feab45be8420cf0152afdc2c04586c2960fe0a9e))
* **storage+builtins:** fail-fast for silently-corrupting declarations — filtered-item own properties, duplicate relation property names, __type discriminator writes; goto cycle detection covers interior cycles; cross-activity activityId validation; document mutation-event snapshot shapes in knowledge base ([bc288d6](https://github.com/interaqtdev/interaqt/commit/bc288d62e72404a4a8ccab4221192e1c15f17d69))
* **storage+builtins:** symmetric relation delete/update covers both endpoint sides; dataPolicy.modifier limit cannot be paginated around; 'program' ActivityGroup fails fast ([50ac850](https://github.com/interaqtdev/interaqt/commit/50ac85018b32f02bd6413e3d8e19f1f048000baf))
* **storage+runtime+core:** honest oldRecord semantics, combined-record event oracle, fromObject contract, cascade event backfill perf, serialization trust boundary docs ([ed806d9](https://github.com/interaqtdev/interaqt/commit/ed806d97058c2f840c0694fd33c8524f7e40b018))
* **storage+runtime:** relations on filtered-entity endpoints survive setup; aggregation create path fetches full record; callback without attributeQuery fails fast ([3628671](https://github.com/interaqtdev/interaqt/commit/362867103c475ca6e5cfb5de6a9802793d74255f))
* **storage:** compound matchExpression merges whole BoolExp on filtered relation attributes (F-2) ([2b2b71b](https://github.com/interaqtdev/interaqt/commit/2b2b71b3d62f3695f27d00196d5c4e08f068747a))
* **storage:** controlled errors for previously-deferred crashes — big IN over driver bind-param limit, duplicate xToMany refs are idempotent (conflicting '&' fails fast), 'contains' on non-collection property ([c00dfbc](https://github.com/interaqtdev/interaqt/commit/c00dfbc92a4ac4f1a3f2c348ff4c0fd0d7469bd7))
* **storage:** filtered membership changedFields uses the actual write set incl. computed columns (F-1) ([4dc16db](https://github.com/interaqtdev/interaqt/commit/4dc16dbedd53a0a84ff872b78d27e6b305e50bcc))
* **storage:** relation-side x:n attributes resolve reverse info; null-link guards in query executor (F-4) ([7247cee](https://github.com/interaqtdev/interaqt/commit/7247cee99dd8431dbd740945d46cb85601e891d3))

## [2.0.0](https://github.com/interaqtdev/interaqt/compare/v2.0.0-alpha.0...v2.0.0) (2026-07-09)

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
