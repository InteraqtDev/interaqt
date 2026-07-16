# Deep review r35 — builtins / dispatch / drivers / core declaration

- Date: 2026-07-16
- Baseline: `main` @ `f47a8b3e` (v4.3.0)
- Scope: `src/builtins/`, `Controller.dispatch`, drivers, core Entity/Relation/Property declaration guards
- Method: call-chain reading against the seven checklist items; every candidate verified with a minimal runtime probe (SQLite and/or PGLite)

---

## Verdict

One **fatal** contract hole survived 34 rounds on a sibling of a previously fixed path: `atomic.compareAndSet` for `type:'timestamp'` bypasses the r26 write normalization that `atomic.replace` and storage create/update already apply. Cross-driver behavior splits (SQLite throws or silently loses; PGLite accidentally succeeds). One **significant** Activity/`postCommit` args isolation footgun. The rest of the scoped checklist is sound or already documented.

---

## Findings

### F-1 — `atomic.compareAndSet` skips timestamp normalization (fatal)

| | |
|---|---|
| **Where** | `src/runtime/MonoSystem.ts` ~L1129–1137 (non-json record-target branch) |
| **Sibling that was fixed** | `atomic.replace` at L1065 calls `normalizeRecordFieldParam`; r26 leftovers test covers get/replace only (`tests/runtime/review-fixes-2026-07-13-r26-leftovers.spec.ts` L352–380) |
| **Mechanism** | Expected/next/default are bound raw into `UPDATE … RETURNING` via `db.query`. They never pass `normalizeRecordFieldParam` (Date\|ms\|ISO → dialect form). JSON CAS correctly normalizes; timestamp/boolean/number share the unnormalized branch. |
| **Observed (probed)** | |

| Driver | CAS(ms→ms+1) | CAS(ISO→…) | CAS(Date→…) |
|--------|--------------|------------|-------------|
| SQLite | wins | **silent `false`** (string ≠ INT ms) | **throws** `SQLite3 can only bind…` |
| PGLite | wins | wins (PG coerces text→timestamp) | wins |

| | |
|---|---|
| **Minimal trigger** | Entity with `Property.create({ name: 'at', type: 'timestamp' })`; `storage.create` with a `Date` or ms; then `storage.atomic.compareAndSet({ recordName, id, field: 'at' }, new Date(ms), new Date(ms+1))` on SQLite → throw. Same call with ISO strings → `false` with no update while looking like a lost race. |
| **Why fatal** | r26 public contract is “timestamp writes accept Date\|ms\|ISO on create/update/**atomic**”. replace was fixed and tested; CAS is the sibling reader that escaped. Cross-driver split means PGLite-green tests hide SQLite production failure. Silent `false` on ISO is worse than throw: callers treat it as contention. |
| **Fix direction** | Route `next` / `expected` / `defaultValue` through `normalizeRecordFieldParam` (same as replace). Prefer comparing normalized epoch-ms in JS for timestamp (or bind dialect forms on both sides). Extend the r26 atomic test to CAS with Date and ISO on SQLite + PGLite. |

Escape analysis: r26 tested `atomic.get`/`replace` and left `compareAndSet` uncovered — classic “fix the instance, miss the sibling API cell” (AGENTS.md bug-fix checklist §1/§4).

---

### F-2 — Activity head create: `postCommit` sees args without `activityId` (significant)

| | |
|---|---|
| **Where** | `src/runtime/Controller.ts` L890 / L936–937 / L952; `src/builtins/interaction/activity/ActivityManager.ts` L102–106, L159 |
| **Mechanism** | Each retry attempt clones args (`cloneDispatchArgs`). Head-without-`activityId` sets `attemptArgs.activityId` inside the guard. `afterDispatch` writes `activityId` into `result.context`. After commit, `runPostCommitHook(eventSource, args, …)` passes the **original** caller args, which never received the created id. |
| **Observed (probed)** | Head dispatch of `Flow:Start`: `result.context.activityId === 1`, but `postCommit` callback’s `args.activityId === undefined`. |
| **Minimal trigger** | Activity-wrapped event source; assign `eventSource.postCommit = async (args) => { … args.activityId … }`; dispatch head without `activityId`. |
| **Severity** | Significant — not a transaction/isolation bug (`context` carries the id), but a sharp API footgun for the documented postCommit surface on activity heads. |
| **Fix direction** | Pass `attemptArgs` (or merge committed `context.activityId` into the args object) into `runPostCommitHook`. |

---

## Checklist results (sound unless noted)

### 1. Driver type-conversion asymmetries

| Area | Status |
|------|--------|
| Boolean write (SQLite/MySQL 0/1) vs read (`structureRawReturns` / atomic parse) | Sound |
| JSON create vs match (`canonicalJSONStringify` + dialect `=/!=` / SQLite text fallback) | Sound |
| Timestamp create/update/find/match/atomic.replace | Sound (r26) |
| Timestamp **atomic.compareAndSet** | **F-1** |
| Id types after r24/r28/r32 | Sound for intended dialect split: PG/SQLite/MySQL numeric ids (`Number(nextval)` on PG); PGLite uuidv7 strings; `sameRecordId` / write path use string-normalized identity. `setupRecordSequences` reconciles SQLite/MySQL counters. |
| SQLite insert/update still JSON.stringifies all objects including `Date` (no `!(x instanceof Date)`), unlike PG/MySQL/PGLite | Mitigated for typed timestamp/json by `prepareFieldValue` before the driver; residual only for untyped/raw Date params (related to F-1’s query-path Date). Minor residual. |

### 2. Condition / Attributive fail-closed

Sound. `checkCondition` catches throws → error string; non-boolean returns → error string; `BoolExp.evaluateAsync` treats error strings as failure under any polarity (including `not`); De Morgan `inverse` propagation is present on sync and async paths. Attributive removed at declaration time (fail-fast). `Condition.create` requires function `content`.

### 3. Payload validation / partial writes

Sound for dispatch: `runInteractionGuard` (condition + payload) runs inside the storage transaction before event create / resolve. `isRef` requires `base` at declaration time; existence checked in-guard. Non-object / array payload rejected; optional-field `continue` (not `return`) preserved. MySQL: `transactions: false` → `TransactionCapabilityError` before dispatch writes (no partial dispatch transaction). Empty `isCollection` arrays still vacuous-pass `every` (known r7 weak-validation family; not a new hole).

### 4. Activity instance isolation

Sound. `getActivity` rejects foreign definition uuid; `checkActivityState` rejects unavailable nodes; CAS on `stateVersion` aborts concurrent lost updates; cross-level transfers rejected at `buildGraph`; Gateway rejected; empty/unknown groups fail at definition time. Relation `activityInteraction` **is** written (FK via `mapEventData`’s `activity: { id }`) — r19 “never written” claim is stale. Documented footgun remains: group-as-root second branch head without `activityId` forks a new instance (intentional create semantics).

### 5. Dispatch error / rollback / `forceThrowDispatchError`

Sound. Guard → mapEventData → event create → resolve → afterDispatch all inside `runInTransaction` under `runWithTransactionRetry`; failure rolls back (including activity create + state bump); default `forceThrowDispatchError: false` returns `{ error }` without running postCommit/sideEffects; `true` rethrows. Effects context is fresh per attempt. Nested dispatch throws `NestedDispatchError`.

### 6. SQLite busy / single-process concurrency

Sound for the supported model. `concurrentTransactions: 'unsupported'` → MonoSystem serializes top-level transactions. `SQLITE_BUSY` is in `RETRYABLE_ERROR_CODES`. No `busy_timeout` pragma — multi-connection file DB relies on transaction-level retry only (documented limitation, not a silent corruption path).

### 7. Placeholder generators

Sound. Each SQLBuilder DML/query entrypoint calls `getPlaceholder()` for a fresh generator; EXIST subqueries reuse `parentP` so `$n` stays tree-ordered with param collection. DeletionExecutor one-shot queries create a fresh generator per statement. MonoSystem atomic helpers create a new generator per operation (and a second for follow-up UPDATE when needed).

### Core declaration guards

Sound for filtered/merged mutual exclusion, empty `inputEntities`/`inputRelations`, missing `matchExpression`, merged-without-properties, Property type whitelist, `computed`∩`computation`, non-function `defaultValue`/`computed`, PayloadItem type/`isRef`+`base`, Interaction empty Conditions / legacy Attributive keys / dataPolicy on non-GetAction.

---

## Not re-opened (already recorded / out of fatal bar)

- MySQL `transactions: false` and lack of `UPDATE…RETURNING` / `ON CONFLICT` — entire dispatch + atomic stack unsupported; tracked as MySQL driver upgrade (r27).
- group-as-root activityId fork footgun (r15 O-2 / r33 boundary).
- `checkCondition` before `checkPayload` (r19); Condition authors must not trust raw payload shape.
- `getActivityCall(activityId)` name vs definition-uuid key (r12 I-8).
- Default `forceThrowDispatchError: false` (API contract, not a swallow of rolled-back state).

---

## Suggested next actions

1. Fix F-1 at the MonoSystem CAS convergence point; add Date + ISO CAS probes on SQLite and PGLite (and real PG when available).
2. Fix F-2 by giving postCommit the attempt args (or an args view that includes committed `activityId`).
3. Optionally align SQLite insert/update Date exclusion with the other three drivers for defense in depth.
