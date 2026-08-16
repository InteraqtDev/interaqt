# Complete API Exports Reference

This document lists all available exports from the 'interaqt' package. Use this as a reference to understand what's available and avoid importing non-existent items.

## Core Exports

```javascript
import {
  // Entity-related
  Entity,
  Property,
  UniqueConstraint,

  // Property type extension (Entity/Relation columns only)
  definePropertyType,
  PropertyTypes,
  ALLOWED_PROPERTY_TYPES,
  // resetPropertyTypeRegistryForTests,  // test-only registry clear
  // isAllowedPropertyType, isBuiltinPropertyType, isExtendedPropertyType,
  // formatAllowedPropertyTypesForError, resolveFieldType, ...
  
  // Relation-related
  Relation,
  
  // Interaction-related
  Interaction,
  Action,
  GetAction,        // the built-in query action constant — required for data/dataPolicy interactions
  Payload,
  PayloadItem,
  
  // Activity-related
  Activity,
  
  // Computation-related
  Count,
  Every,
  Any,
  Average,
  Sum,
  Summation,
  WeightedSummation,
  Transform,
  ScopedSequence,
  StateMachine,
  StateNode,
  StateTransfer,
  RealTime,
  MathResolver,
  
  // Conditions / admission
  Condition,
  Conditions,
  AdmissionSnapshot,       // read-only lock snapshot passed as content's 2nd arg
  // AdmissionLockSpec     // TypeScript type (locks entries on Condition.create)
  
  // Expression and Matching
  BoolExp,
  MatchExp,
  Expression,
  Inequality,
  Equation,
  
  // Storage, Controller, transactions
  Controller,              // dispatch, runInBusinessTransaction, rerunCreateMutationSideEffects, rerunPostCommit
  MonoSystem,
  getActiveBusinessTransaction,
  // BusinessTransactionOptions  // TypeScript type for runInBusinessTransaction options
  NestedDispatchError,
  BusinessTransactionBoundaryError,
  isBusinessTransactionBoundaryError,
  isBusinessTransactionSavepointRetryable,
  isBusinessTransactionConnectionFatal,
  TransactionCapabilityError,
  isTransactionCapabilityError,
  RequireSerializableRetry,
  RetryableWriteConflict,
  runWithTransactionRetry,
  isRetryableTransactionError,
  isRequireSerializableRetry,
  TransactionRetryExhaustedError,
  isTransactionRetryExhaustedError,
  InteractionGuardError,   // condition/payload guard failures (code/details/conditionName) — official
  IdempotencyError,        // IDEMPOTENCY_IN_FLIGHT / IDEMPOTENCY_CONFLICT on declared keys
  isPostCommitPhaseComplete, // stage P ran and succeeded on this response (not historical)
  SideEffectError,         // postCommit / RecordMutationSideEffect failures (not result.error)
  PostCommitRerunError,    // caller errors on rerun APIs (INVALID_INPUT, UNKNOWN_RECORD_NAME, ...)
  ConditionError,          // DEPRECATED historical factory/shape; use InteractionGuardError + .code
  ConstraintViolationError,
  ConstraintSetupError,
  findConstraintViolationError,
  normalizeDatabaseError,
  
  // Dictionary (Global State)
  Dictionary,
  
  // Special Entities
  InteractionEventEntity,  // NOT InteractionEvent
  
  // Class Reference
  KlassByName
  
} from 'interaqt';


### Property type extension exports

Public from the main `interaqt` entry (also re-exported via `@storage` / `@core` path aliases in-repo):

| Export | Role |
|--------|------|
| `definePropertyType` | Register logical extended type + optional per-dialect storage |
| `PropertyTypes` / `ALLOWED_PROPERTY_TYPES` | Builtin logical type enum / list |
| `resetPropertyTypeRegistryForTests` | Clear extension registries between tests |
| `resolveFieldType` / `resolvePropertyTypeStorage` | Storage binding helpers (advanced / adapters) |
| Types: `DefinePropertyTypeInput`, `PropertyTypeStorage`, `PropertyTypeResolveContext`, `PropertyTypeMatchCompiler`, `PropertyTypeDefinition`, … | TypeScript contracts |

Extended types apply to **Property** columns only. Dictionary and PayloadItem keep separate, non-extensible type rules. Match operators on extended columns are opt-in. Drivers no longer accept unknown logical types as raw DDL strings.

// Database drivers are a separate subpath entry (NOT exported from the main package):
import {
  PGLiteDB,
  SQLiteDB,
  PostgreSQLDB,
  MysqlDB,
} from 'interaqt/drivers';
```

## What is NOT Exported

The following are commonly mistaken as exports but do NOT exist:

```javascript
// ❌ These do NOT exist in interaqt:
import {
  User,                // No pre-built User entity
  RelationBasedEvery,  // Only 'Every' exists
  InteractionEvent,    // Correct name is 'InteractionEventEntity'
  FilteredEntity,      // Created via Entity.create with baseEntity
  SideEffect           // Not a direct export
} from 'interaqt';
```

## Common Import Patterns

### Basic Entity Definition
```javascript
import { Entity, Property, UniqueConstraint } from 'interaqt';

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' })
  ],
  constraints: [
    UniqueConstraint.create({
      name: 'User_email_unique',
      properties: ['email']
    })
  ]
});
```

### Data Constraints
```javascript
import {
  UniqueConstraint,
  ConstraintViolationError,
  ConstraintSetupError,
  findConstraintViolationError,
  normalizeDatabaseError
} from 'interaqt';
```

`UniqueConstraint` declares persistent database uniqueness at Entity or Relation level. Runtime duplicate writes are reported with `ConstraintViolationError`; setup/index creation problems are reported with `ConstraintSetupError`. Use `findConstraintViolationError(error)` when the top-level error may be a wrapped computation error.

### Complete CRUD Setup
```javascript
import { 
  Entity, 
  Property, 
  Relation, 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  Transform,
  InteractionEventEntity 
} from 'interaqt';
```

### Computation Setup
```javascript
import { 
  Count, 
  Every, 
  Any, 
  Summation,
  WeightedSummation,
  Transform,
  ScopedSequence,
  StateMachine,
  StateNode,
  StateTransfer
} from 'interaqt';
```

### Controller Setup
```javascript
import { 
  Controller, 
  MonoSystem, 
  KlassByName 
} from 'interaqt';
import { PGLiteDB } from 'interaqt/drivers';

const system = new MonoSystem(new PGLiteDB());
system.conceptClass = KlassByName;
const controller = new Controller({

  system: system,

  entities: entities,

  relations: relations,

  activities: activities,

  interactions: interactions,

  dict: dictionaries,

  recordMutationSideEffects: []

});
```

## Important Notes

1. **No Built-in Entities**: interaqt does not provide any pre-built entities like User, Post, etc. You must define all entities yourself.

2. **Entity References in Imports**: When you see `base: User` in examples, User is not imported from interaqt but defined in your application.

3. **Special Entity Names**: `InteractionEventEntity` is the only pre-defined entity, used for listening to interaction events.

4. **Filtered Entities**: Created using `Entity.create()` with `baseEntity` and `filterCondition`, not a separate import.

5. **Database Drivers**: Imported from the `interaqt/drivers` subpath (not the main package). Choose one based on your needs - PGLiteDB for in-memory testing, PostgreSQLDB for production, etc. `ScopedSequence` is production-safe for cross-connection/cross-process allocation on PostgreSQL; PGLiteDB and SQLiteDB are local/test-level only for scoped sequence concurrency.

6. **Transaction helpers**: `runWithTransactionRetry`, `isRetryableTransactionError`, and `isRequireSerializableRetry` are exported for advanced runtime integrations and tests. Most application code should use `Controller.dispatch()` for single interactions, and `Controller.runInBusinessTransaction()` when storage writes must share one atomic boundary with sequential dispatches. Do **not** call `controller.dispatch` inside a bare `storage.runInTransaction` — that is a hard runtime error (`BusinessTransactionBoundaryError` / `DISPATCH_IN_NON_BT_TRANSACTION`). Pure storage `runInTransaction` without `dispatch` remains legal.

7. **Business transactions & nested dispatch**: `NestedDispatchError` rejects dispatch-inside-dispatch. `BusinessTransactionBoundaryError` rejects: BT started inside an existing storage transaction (`NESTED_STORAGE_TRANSACTION`), BT re-entry (`REENTRANT`), missing SAVEPOINT support (`SAVEPOINT_UNSUPPORTED`), `dispatch` after BT abort (`ABORTED`), and **`dispatch` inside a non-BT active storage transaction (`DISPATCH_IN_NON_BT_TRANSACTION`)**. Inside BT, only write-conflict codes are SAVEPOINT-retried (`isBusinessTransactionSavepointRetryable`); connection-fatal codes fail fast (`isBusinessTransactionConnectionFatal`); `RequireSerializableRetry` is fail-fast (open BT with `isolation: 'SERIALIZABLE'` when needed). See [06-attributive-permissions.md](./06-attributive-permissions.md).

8. **Condition admission & typed rejection**: `Condition.locks` + `AdmissionSnapshot`, structured `{ allowed, code }` results, and `InteractionGuardError.code` / `details` / `conditionName` are the official surfaces. Do not hand-write dialect row locks in Condition content; do not mutate `payload` / `event.error` to pass admission context (use `{ allowed: true, context }` → `event.context.admission`). `ConditionError` is historical/deprecated — still exported, but branch on `InteractionGuardError.code`, not duck-typed `type` alone.

9. **Constraint helpers**: `UniqueConstraint`, `ConstraintViolationError`, `ConstraintSetupError`, `findConstraintViolationError`, and `normalizeDatabaseError` are exported for schema-level uniqueness and stable duplicate handling.

10. **Scoped serial allocation**: `ScopedSequence` is exported for number property computations that allocate per-scope serials. Always pair it with a `UniqueConstraint` over the scope fields plus the sequence property.

11. **Stage P completion**: `result.error` is the fact transaction only. Obligation-sensitive callers use `isPostCommitPhaseComplete(result)` (and `result.postCommitPhase`). Recover create mutation side effects with `controller.rerunCreateMutationSideEffects({ recordName, id })` and `postCommit` with `controller.rerunPostCommit(eventSource, args, { data, context })`. `SideEffectError` wraps hook failures; `PostCommitRerunError` is for illegal rerun input (not a side-effect failure). Do not treat `outcome: 'replayed'` or a duplicate admit error as obligation success. Update/delete mutation side effects cannot be reconstructed.