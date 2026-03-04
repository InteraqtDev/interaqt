# Test Coverage Improvement Plan (Round 2)

## Current State Overview

- **Test framework:** Vitest + `@vitest/coverage-v8`
- **Test files:** 95 spec files, 1171 tests — all passing
- **Overall `src/` coverage:** 88.8% statements, 86.69% branches, 84.83% functions
- **Configured thresholds:** 85% stmts, 80% branches, 75% funcs, 85% lines — **all passing**

---

## Comparison with Previous Baseline

| Metric | Before (Round 1) | After (Round 2) | Delta |
|--------|------------------|-----------------|-------|
| Test files | 86 | 95 | **+9** |
| Total tests | 959 | 1171 | **+212** |
| Overall Stmts | ~80% | 88.8% | **+~9%** |

### Per-Layer Coverage Comparison

| Layer | Stmts Before | Stmts After | Delta | Status |
|-------|-------------|-------------|-------|--------|
| `src/core/` | 79.26% | 93.10% | **+13.84%** | Excellent |
| `src/runtime/` | 81.28% | 83.45% | +2.17% | Improved |
| `src/runtime/computations/` | 87.12% | 87.01% | -0.11% | Stable |
| `src/runtime/errors/` | 45.02% | 98.75% | **+53.73%** | Excellent |
| `src/builtins/interaction/` | 80.82% | 89.48% | **+8.66%** | Good |
| `src/builtins/interaction/errors/` | 15.06% | 100% | **+84.94%** | Complete |
| `src/storage/` (top-level utils) | 62.71% | 100% | **+37.29%** | Complete |
| `src/storage/erstorage/` | 92.44% | 92.74% | +0.30% | Stable |
| `src/storage/erstorage/util/` | ~54% | 97.93% | **+~44%** | Excellent |
| `src/drivers/` | 51.55% | 51.23% | -0.32% | Unchanged |

### Per-File Improvements (Biggest Gains)

| File | Before | After | Delta |
|------|--------|-------|-------|
| `runtime/util.ts` | 17.64% | 100% | **+82.36%** |
| `core/utils.ts` | 40.65% | 97.61% | **+56.96%** |
| `storage/utils.ts` | 47.61% | 100% | **+52.39%** |
| `runtime/errors/` (all) | 45.02% | 98.75% | **+53.73%** |
| `builtins/interaction/errors/` (all) | 15.06% | 100% | **+84.94%** |
| `storage/erstorage/util/AliasManager.ts` | 53.96% | 100% | **+46.04%** |
| `core/Custom.ts` | 62.99% | 98.42% | **+35.43%** |
| `core/StateMachine.ts` | 61.42% | 97.14% | **+35.72%** |
| `core/Any.ts` | 62.62% | 98.00% | **+35.38%** |
| `core/Every.ts` | 63.00% | 98.01% | **+35.01%** |
| `core/interfaces.ts` | 44.00% | 100% | **+56.00%** |

---

## Previous Plan Phase Completion

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Core serialization | **COMPLETED** | core 79% → 93% |
| Phase 2: Error classes | **COMPLETED** | errors 45% → 99%, builtins errors 15% → 100% |
| Phase 3: Utility functions | **COMPLETED** | all utility files at 97–100% |
| Phase 4: Runtime edge cases | **PARTIAL** | runtime 81% → 83%, some gaps remain |
| Phase 5: Builtins interaction | **PARTIAL** | builtins 81% → 89%, DataAttributives still low |
| Phase 6: Storage utilities | **MOSTLY DONE** | AliasManager at 100%, erstorage util at 98% |
| Phase 7: Driver adapters | **NOT DONE** | MySQL/PostgreSQL still ~14% |
| Phase 8: Coverage config | **COMPLETED** | thresholds and scripts in place |

---

## Remaining Gap Analysis

### Current Coverage Distribution

**Files above 95%** (29 files) — no action needed.

**Files at 85–95%** (17 files) — acceptable, targeted improvement possible.

**Files at 75–85%** (9 files) — moderate gaps, improvement recommended:

| File | Stmts % | Branch % | Funcs % | Key Uncovered Areas |
|------|---------|----------|---------|---------------------|
| `runtime/computations/Custom.ts` | 75.17 | 93.33 | 68.75 | `asyncReturn`, `createState`, `getInitialValue`, `compute` in base class |
| `storage/erstorage/LinkInfo.ts` | 75.00 | 96.15 | 65.62 | `isOneToMany`, `isXToMany`, `sourceRecordInfo`, `getMatchExpression`, `getResolvedMatchExpression`, `getResolvedBaseRecordName` |
| `runtime/Scheduler.ts` | 76.90 | 82.17 | 100 | Error wrapping in `resolveDataDeps`, `setupDictDefaultValue`, some setup paths |
| `runtime/MonoSystem.ts` | 78.60 | 83.05 | 75 | Entity/Relation not found errors, filtered entity/relation root traversal |
| `builtins/interaction/Interaction.ts` | 78.52 | 66.03 | 90 | `checkConcept` recursive logic, `retrieveData` edge paths |
| `storage/erstorage/QueryExecutor.ts` | 78.94 | 84.61 | 100 | Complex query path edge cases |
| `core/Entity.ts` | 82.14 | 100 | 50 | `stringify`, `clone`, `parse` — likely some factory methods |
| `runtime/computations/MathResolver.ts` | 81.32 | 77.19 | 92.85 | Math expression edge cases |
| `runtime/computations/Average.ts` | 82.43 | 66.23 | 80 | Incremental computation paths, branch edge cases |

**Files below 75%** (5 files):

| File | Stmts % | Nature | Action |
|------|---------|--------|--------|
| `builtins/interaction/DataAttributives.ts` | 57.40 | Klass pattern methods | Test `is()`, `check()`, `parse()`, `clone()`, `stringify()` |
| `drivers/Mysql.ts` | 13.46 | Requires running MySQL | Skip (external infra) |
| `drivers/PostgreSQL.ts` | 14.28 | Requires running PostgreSQL | Skip (external infra) |
| `runtime/ExternalSynchronizer.ts` | 0 | Empty stub class (9 lines) | Skip or remove |
| `runtime/types/boolExpression.ts` | 0 | Constants + types (26 lines) | Low impact — skip or add trivial test |

**Type-only files at 0%** (no executable code, exclude from concern):
- `core/Computation.ts` — pure type definitions
- `runtime/types/computation.ts` — pure type definitions
- `runtime/global.d.ts` — declaration file

---

## New Improvement Plan

### Phase A: DataAttributives Klass Methods (Impact: +2% builtins coverage)

**Priority:** HIGH — Lowest-coverage non-driver file at 57.40%.

**Tasks:**

1. Add tests to an existing builtins test file (or create `tests/builtins/dataAttributives.spec.ts`):
   - `DataAttributives.create()` — basic construction, UUID generation
   - `DataAttributives.is()` — positive and negative type guards
   - `DataAttributives.check()` — valid and invalid data
   - `DataAttributives.parse()` / `DataAttributives.stringify()` — round-trip serialization
   - `DataAttributives.clone()` — deep clone with content

**Estimated coverage gain:** DataAttributives 57% → 95%+

---

### Phase B: Custom Computation Handles (Impact: +3% runtime/computations coverage)

**Priority:** HIGH — Key computation type with 75.17% coverage.

**Tasks:**

1. Test `asyncReturn` callback path (lines 101–113):
   - Create a Custom computation with `asyncReturn` defined
   - Verify the async return value is properly forwarded

2. Test `createState` callback path (lines 116–138):
   - Create a Custom computation with `createState`
   - Verify state is initialized and bound to controller

3. Test `getInitialValue` callback path (lines 140–145):
   - Create a Custom computation with `getInitialValue`
   - Verify initial value is returned

4. Test `compute` callback fallback (lines 147–160):
   - Create a Custom computation without `computeCallback`
   - Verify `ComputationResult.skip()` is returned

**Estimated coverage gain:** Custom.ts 75% → 92%+

---

### Phase C: LinkInfo Coverage (Impact: +1% storage coverage)

**Priority:** MEDIUM — Straightforward getter methods.

**Tasks:**

1. Create `tests/storage/linkInfo.spec.ts` (or extend existing storage tests):
   - Test all relation type getters: `isManyToOne`, `isManyToMany`, `isOneToOne`, `isOneToMany`, `isXToOne`, `isOneToX`, `isXToMany`
   - Test `sourceRecordInfo`, `targetRecordInfo` — verify RecordInfo construction
   - Test `getMatchExpression()` — filtered vs non-filtered relation
   - Test `getResolvedMatchExpression()`, `getResolvedBaseRecordName()` — assertion on non-filtered relation
   - Test `getBaseLinkInfo()` — assertion on non-filtered, valid on filtered
   - Test `getAttributeName()` — source vs target resolution
   - Test `isSymmetric()` — same source/target record and property

**Estimated coverage gain:** LinkInfo 75% → 95%+

---

### Phase D: Interaction & MonoSystem Edge Paths (Impact: +3% overall)

**Priority:** MEDIUM — Important for robustness.

**Tasks:**

1. **Interaction.ts** (78.52%):
   - Test `checkConcept` with `DerivedConcept` (has `.base` and `.attributive`)
   - Test `checkConcept` with `ConceptAlias` (has `.for` — multiple concepts)
   - Test `checkConcept` with entity that fails validation → assert error result
   - Test `retrieveData` with function-based `fixedMatch` returning null

2. **MonoSystem.ts** (78.60%):
   - Test `setup()` with `RecordBoundState` referencing a non-existent entity/relation → assert thrown `Error`
   - Test `setup()` with `RecordBoundState` whose `record` is undefined → verify early return
   - Test filtered entity/relation base traversal (`while (rootEntity.baseEntity || ...)`)

3. **Scheduler.ts** (76.90%):
   - Test `resolveDataDeps` with a dataDep that throws a non-`ComputationDataDepError` → verify wrapping
   - Test `resolveDataDeps` with dataDep that throws a `ComputationDataDepError` → verify rethrown as-is
   - Test `setupDictDefaultValue` with dicts that have `defaultValue`

**Estimated coverage gain:** runtime 83% → 88%+

---

### Phase E: Computation Incremental Paths (Impact: +2% computations coverage)

**Priority:** MEDIUM — Covers rarely-tested incremental computation paths.

**Tasks:**

1. **Transform.ts** (83%):
   - Test `createState()` returns expected state shape
   - Test `getInitialValue()` returns empty array
   - Test `compute()` with multi-record transformation
   - Test `computeDirtyRecords()` — event-based path

2. **Average.ts** (82.43%):
   - Test incremental compute with edge cases (empty dataset, single item)
   - Test branch paths for different `dataDep.type` values

3. **MathResolver.ts** (81.32%):
   - Test complex math expression edge cases
   - Test error paths for invalid expressions

4. **Summation.ts** (86.01%) / **WeightedSummation.ts** (85.88%):
   - Test incremental compute edge cases
   - Test branch paths for missing/null values

**Estimated coverage gain:** computations 87% → 92%+

---

### Phase F: Entity & Relation Factory Methods (Impact: +1% core coverage)

**Priority:** LOW — Core is already at 93%, but Entity (82%) and Relation (83%) have gaps.

**Tasks:**

1. **Entity.ts** (82.14%):
   - Test `Entity.stringify()` and `Entity.parse()` round-trip (likely already partially covered in types.spec.ts, extend if needed)
   - Test `Entity.clone()` for deep cloning with properties
   - Test unused static methods if any

2. **Relation.ts** (83.26%):
   - Test `Relation.stringify()` and `Relation.parse()` round-trip
   - Test `Relation.clone()`
   - Test branch for relation types (1:1, 1:n, n:1, n:n)

**Estimated coverage gain:** core 93% → 95%+

---

### Phase G: Driver Adapters (Optional — Requires External Infra)

**Priority:** LOW — Requires running database instances.

| File | Current | Target | Requirement |
|------|---------|--------|-------------|
| `Mysql.ts` | 13.46% | 90%+ | Running MySQL instance |
| `PostgreSQL.ts` | 14.28% | 90%+ | Running PostgreSQL instance |
| `PGLite.ts` | 83.73% | 95%+ | In-process (no external deps) |

**Recommendation:** Use Docker-based test infrastructure (docker-compose or testcontainers). Tag these tests as `test:integration` so they don't run in normal CI.

---

### Phase H: Cleanup & Configuration

**Priority:** LOW — Housekeeping items.

**Tasks:**

1. **Remove or mark dead code:**
   - `ExternalSynchronizer.ts` — empty stub, 0% coverage, 9 lines. Remove if unused or mark as intentionally excluded.
   
2. **Exclude type-only files from coverage:**
   - Add to `vitest.config.ts` exclude: `'src/core/Computation.ts'`, `'src/runtime/types/**'`, `'src/runtime/global.d.ts'`, `'src/runtime/ExternalSynchronizer.ts'`
   - This will remove noise from the coverage report and raise the overall percentage by ~0.5%

3. **Consider raising thresholds** after completing Phases A–E:
   - Statements: 85% → 88%
   - Branches: 80% → 85%
   - Functions: 75% → 82%
   - Lines: 85% → 88%

---

## Priority Roadmap

| Phase | Effort | Coverage Impact | Priority |
|-------|--------|-----------------|----------|
| Phase A: DataAttributives | 0.5 day | +2% builtins | **HIGH** |
| Phase B: Custom computation | 0.5 day | +3% computations | **HIGH** |
| Phase C: LinkInfo | 0.5 day | +1% storage | **MEDIUM** |
| Phase D: Interaction & MonoSystem edge paths | 1 day | +3% runtime | **MEDIUM** |
| Phase E: Computation incremental paths | 1 day | +2% computations | **MEDIUM** |
| Phase F: Entity & Relation factory methods | 0.5 day | +1% core | **LOW** |
| Phase G: Driver adapters | 2–3 days | +35% drivers | **LOW** |
| Phase H: Cleanup & config | 0.5 day | Infrastructure | **LOW** |

**Completing Phases A–E** would bring overall `src/` coverage from **88.8% to an estimated 92–93%**, with the most significant remaining gaps fully addressed.

**Completing Phases A–F + H** would bring overall coverage to an estimated **93–94%**, with only driver adapters (requiring external infrastructure) remaining as the primary gap.

---

## Summary

The first round of coverage improvements was highly successful:
- **+212 tests** added across **+9 new test files**
- **Overall coverage: ~80% → 88.8%** (+9 percentage points)
- **Error classes:** 15–45% → 98–100% (biggest single improvement)
- **Utility functions:** 17–48% → 97–100% (all fully covered)
- **Core serialization:** 62–79% → 93–98% (systematic gap closed)
- All configured coverage thresholds are now **passing**

The remaining gaps are more targeted and involve:
1. One uncovered Klass (DataAttributives — 57%)
2. Runtime computation edge paths (Custom, Transform, Average — 75–83%)
3. Storage query internals (LinkInfo, QueryExecutor — 75–79%)
4. Interaction/MonoSystem error paths (78–79%)
5. Driver adapters requiring external databases (13–14%)
