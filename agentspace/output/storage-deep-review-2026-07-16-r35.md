# Storage deep review r35 — two-phase pagination, EXIST pruning, x:1-trunk batching

Date: 2026-07-16  
Scope: `src/storage/erstorage/` query path (QueryExecutor, SQLBuilder, MatchExp) plus write-path spot checks (RecordQueryAgent, DeletionExecutor, UpdateExecutor, NewRecordData, EntityToTableMap, AttributeQuery).

Focus: recently merged B1 (EXIST join pruning), B2/B4 (two-phase root-id pagination), B5 (x:1-trunk × x:n-branch batched completion).

---

## Findings

### F-1 — FATAL: `NOT (path.with.x:n.exist …)` false-positives when an intermediate segment is x:n

| Field | Detail |
|-------|--------|
| Severity | **fatal** (wrong query results; same match drives update/delete selection) |
| Files | `MatchExp.ts` ~L246–255 (`buildQueryTree` EXIST pruning); `SQLBuilder.ts` ~L536–546 (`parseFunctionMatchAtom` correlation) |
| Status | Confirmed with a minimal PGLite repro (see below) |

**Mechanism**

1. For an EXIST atom whose terminal attribute is x:n, B1 pruning keeps the parent path in the outer JOIN tree (`matchAttributePath.slice(0, -1)`) and drops only the terminal.
2. `parseFunctionMatchAtom` correlates the EXISTS subquery to the **immediate parent** of the terminal (`namePath.slice(1, -1)` + `.id`), not to the root.
3. When that parent path itself contains an x:n segment, the outer query LEFT JOINs that x:n relation. `NOT EXISTS (...)` is then evaluated **per fan-out row**, not per root.
4. A root that has at least one intermediate row for which the subquery is false will keep that row after `WHERE`, survive `dedupeIdenticalRows`, and be returned — even though another intermediate row of the same root would make the existential true.

Positive EXIST over the same shape is fine (any satisfying fan-out row keeps the root). Single-segment `NOT (members exist …)` is also fine after B1 (no outer x:n join; correlation is to the root).

**Minimal trigger**

```text
Org 1─n Group 1─n Member
orgA: G1(user) + G2(admin)
orgB: G3(user)
orgC: (no groups)

find('Org', atom({ key: 'groups.members', value: ['exist', role=admin] }).not())
```

Expected: `[orgB, orgC]`  
Actual: `[orgA, orgB, orgC]` — orgA incorrectly included.

The same match expression is used by `DeletionExecutor.deleteRecord` / `UpdateExecutor.updateRecord` via `findRecords`, so a bulk delete/update with this predicate can mutate the wrong row set.

**Why B1 did not introduce it, but left it live**

The false-positive existed whenever the parent path was joined (pre-B1 joined the terminal too; correlation was already to the parent). B1 correctly removed the terminal join for single-segment EXIST (and that case is now sound under NOT), but for multi-segment paths it **must** still join the parent for the current correlation design — so the NOT × intermediate-x:n cell remains broken. The B1 test suite covers positive EXIST and x:1 prefixes only (`tests/storage/existJoinPruning.spec.ts`); it never asserts `NOT` over an intermediate x:n.

**Fix direction (convergence point)**

Compile multi-segment EXIST so the entire path from the root lives inside one EXISTS (or a nest of EXISTS) with **no** outer JOIN of x:n prefixes. Then `NOT EXISTS` is per-root. Do not patch only the `not` operator — any outer quantification over a joined x:n intermediate has the same shape.

---

### F-2 — Significant (concurrency): two-phase pagination second query drops the original match

| Field | Detail |
|-------|--------|
| Severity | **significant** (wrong query results under concurrent writers; single-threaded reads are fine) |
| File | `QueryExecutor.ts` ~L399–417 |

**Mechanism**

When `usePagedRootIds` is true, phase 1 runs `buildPagedRootIdQuery` with the full match; phase 2 replaces `matchExpression` with `id IN (pageIds)` only (filtered-entity `resolvedMatchExpression` is re-merged by the `MatchExp` constructor). Phase 2 therefore re-fetches page members **without** re-evaluating the business match.

Under READ COMMITTED, a concurrent update between the two statements can make a page id no longer satisfy the original predicate while still being returned. The previous “strip LIMIT + one full query + memory slice” path evaluated match in a single statement.

`forUpdate` does not currently interact with this path (see sound areas).

**Trigger**

`find` with fan-out match + `limit ∈ (1, PAGED_ROOT_ID_MAX_LIMIT]` + concurrent transaction that changes match-relevant fields on a page member between the two queries.

---

## Checklist items (requested) — verdicts

### 1. Two-phase pagination × `forUpdate`

- `forUpdate=true` only enters via `RecordQueryAgent.lockRecords` → `EntityQueryHandle.lock`.
- `lock` never accepts a modifier (`limit`/`offset`), so `paginationOverFanOut` is false and the unlocked page query is never used under lock.
- Runtime `atomic.lockRows` / `lockRecord` use raw `SELECT … FOR UPDATE` by id, not `QueryExecutor.findRecords(..., forUpdate)`.
- **Verdict: sound in the current API.** Latent only if a future caller passes `forUpdate` with `limit>1` and a fan-out match.

### 2. `buildPagedRootIdQuery` DISTINCT × NULL order keys × combined CASE

- `Modifier` fail-fasts x:n orderBy paths; order keys are x:1-only and constant per root under match fan-out.
- Combined-segment CASE gates (`link id IS NOT NULL`) read columns on the same physical/x:1 row; they do not vary across match fan-out duplicates.
- DISTINCT over `(root.id, ord…)` collapses fan-out duplicates; NULL order keys are equal under DISTINCT in SQLite/PG/MySQL — still one row per root id.
- **Verdict: sound** for equivalence with the intended root-grained page (NULLS FIRST/LAST only affects order among NULL keys, same class of non-determinism as before when ties exist).

### 3. EXIST pruning — single-segment alias; multi-segment intermediate x:n

- Single-segment EXIST: nothing added to the outer tree; correlation is `reverse.id = <root>.id`; root alias is always in `FROM`. **Sound** (and NOT EXIST is correct — verified).
- Multi-segment with x:1 prefix: parent join retained; correlation to that alias. Positive EXIST **sound** (covered by `existJoinPruning.spec.ts`).
- Multi-segment with intermediate x:n: parent join retained by design → **F-1** under NOT.

### 4. `findXToManyRelatedRecordsBatched` reverse attr + OR match

- Reverse attribute is appended only when missing; user-requested reverse data is preserved when not using parent-link rewrite (same as the non-batched path when `&` is requested).
- `BoolExp.and` builds a binary tree; `buildWhereClause` emits `(left AND right)` / `(left OR right)` with full parenthesization. Top-level OR user matches become `((A OR B) AND reverse.id IN (...))`.
- **Verdict: sound.**

### 5. `completeXToOneLeftoverRecords` step-2 batching

- `mountedParents` filters null trunks; `canBatchXToManyQuery(..., mountedParents)` length check is on non-null parents.
- Shared n:1 targets: distinct structured objects with the same id make `parentIdsUnique` false → per-record fallback (object-alias boundary honored; covered by `xToOneTrunkBranchBatching.spec.ts`).
- **Verdict: sound.**

### 6. Mutation-event completeness (combined/merged) in RecordQueryAgent

- Spot-checked `flashOutCombinedRecordsAndMergedLinks` / relocate guards and event emission (reliance displacement, non-reliance co-tenant, filtered membership settle, endpoint-complete deletes). No new gap tied to B1/B2/B5.
- Delete/update still select victims via `findRecords` — they inherit **F-1** when the match uses NOT EXIST over intermediate x:n.
- **Verdict: no new event-completeness bug in the write path itself; selection predicate F-1 applies.**

### 7. `dedupeIdenticalRows` / `JSON.stringify`

- Dedup key is sorted `[k, row[k]]` pairs. SELECT always includes record ids at each joined level, so genuinely different roots/relations differ in an id column.
- `undefined` vs `null` would collide in array slots (`JSON.stringify` turns `undefined` array elements into `null`), but drivers return SQL NULL as `null`, not `undefined`.
- `Date` values serialize stably; equal timestamps correctly dedupe fan-out clones.
- **Verdict: sound for the stated purpose** (fan-out clone removal). Not a practical fatal collision under current drivers.

---

## Areas checked and found sound

| Area | Notes |
|------|-------|
| B2/B4 happy path | Sliding windows, x:1 orderBy, LIMIT 0, findOne hot path, fallback above max limit / offset-only — aligned with `paginationPushdown.spec.ts` |
| B1 single-segment / x:1-prefix EXIST | LIMIT pushdown, no outer fan-out, positive semantics |
| B5 batching | O(1) branch queries; n:1 shared-target fallback; null trunk skip |
| `enforceXToOnePredicates` batch vs pair-sensitive | `matchStaysOnRelatedRecord` excludes reverse/`&`/reference/EXIST; batch uses id set membership |
| `pruneUnpairedCombinedReads` | link-id truth source; synthetic `&` stripped; `physicalRowRead` bypass |
| `getFinalFieldValue` null / in / not-in | IS NULL translation, empty-list constants, null-list split, json dialect hooks |
| `convertFilteredRelation` EXIST fold | terminal filtered-relation EXIST folds link predicate into inner match (r25 F-2) |
| Combined orderBy CASE shared with page query | `buildOrderByExpressions` is the single implementation used by modifier clause and paged root query |
| Write executors | No new B1/B2/B5 interaction beyond inheriting match evaluation |

---

## Recommended follow-ups

1. **Fix F-1** at the EXISTS compilation choke point (full path inside EXISTS; no outer x:n prefix joins).
2. Add regression cells: `NOT` × `{single-segment x:n, x:1→x:n, x:n→x:n}` × `{find, update match, delete match}` × drivers; extend `existJoinPruning.spec.ts` / dimension registry.
3. For F-2 (optional hardening): phase-2 keep `originalMatch.and(id IN pageIds)`, or use a single-statement `id IN (paged subquery)` so match and page are one snapshot.
