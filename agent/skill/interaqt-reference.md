# interaqt API Reference

> Compact lookup for API signatures and constraints. No examples — see `interaqt-patterns.md` for usage.

---

## Entity.create

```typescript
Entity.create(args: {
  name: string                        // PascalCase, singular, unique, must match /^[a-zA-Z0-9_]+$/
  properties?: PropertyInstance[]     // Array of Property.create() results (defaults to [])
  computation?: ComputationInstance   // Transform for derived entities
  baseEntity?: EntityInstance | RelationInstance  // For filtered entities
  matchExpression?: MatchExp          // Filter condition for filtered entities
  inputEntities?: EntityInstance[]    // For merged entities
  commonProperties?: PropertyInstance[]  // Shared attributes for merged entities
}): EntityInstance
```

Constraints:
- NEVER pass `uuid` — the framework generates it
- `computation` accepts only Transform (for creating derived entity collections)
- **Filtered entity**: set `baseEntity` + `matchExpression`
- **Merged entity**: set `inputEntities` + `commonProperties` (cannot define own `properties`)

---

## Property.create

```typescript
Property.create(args: {
  name: string                        // Must match /^[a-zA-Z0-9_]+$/
  type: string                        // Required: 'string' | 'number' | 'boolean' | 'object'
  collection?: boolean                // true for array types
  defaultValue?: Function             // Factory function returning default value
  computed?: (record: any) => any     // Computed from same-record fields (not persisted)
  computation?: ComputationInstance   // Reactive: Count, Summation, WeightedSummation, Every, Any, StateMachine, ScopedSequence, Custom
}): PropertyInstance
```

Constraints:
- `type` is REQUIRED — always specify it
- `computed` is for same-record derivations only — NOT persisted
- `computation` results ARE persisted and auto-updated
- Most aggregate/state computations need a `defaultValue`; `ScopedSequence` is an exception because the allocator supplies the value after create
- NEVER use Transform on Property `computation` — Transform belongs on Entity/Relation `computation`

---

## Relation.create

```typescript
Relation.create(args: {
  // Base relation (all required for normal relations):
  name?: string                       // Optional — auto-generated if omitted
  source: EntityInstance | RelationInstance
  sourceProperty: string              // Navigation property on source
  target: EntityInstance | RelationInstance
  targetProperty: string              // Navigation property on target
  type: '1:1' | '1:n' | 'n:1' | 'n:n'
  properties?: PropertyInstance[]     // Relation's own properties
  computation?: ComputationInstance   // Transform for computed relations
  isTargetReliance?: boolean          // Defaults to false

  // Filtered relation:
  baseRelation?: RelationInstance     // Base relation to filter from
  matchExpression?: MatchExp          // Filter condition

  // Merged relation:
  inputRelations?: RelationInstance[] // Relations to merge (must share same source/target)
  commonProperties?: PropertyInstance[]  // Shared attributes for merged relations
}): RelationInstance
```

Constraints:
- `name` is optional — auto-generated as `${source.name}_${sourceProperty}_${targetProperty}_${target.name}`
- ALWAYS specify `type` explicitly for base relations
- Symmetric relations: set `source === target` AND `sourceProperty === targetProperty`
- **Filtered relation**: requires `baseRelation` + `matchExpression` + `sourceProperty` + `targetProperty`
- **Merged relation**: requires `inputRelations` + `sourceProperty` + `targetProperty` (cannot specify `source`/`target`/`properties`)

---

## Interaction.create

```typescript
Interaction.create(args: {
  name: string                        // Interaction identifier
  action: ActionInstance              // Action.create() result (identifier only)
  payload?: PayloadInstance           // Payload.create() result
  conditions?: ConditionsInstance | ConditionInstance  // Execution conditions
  data?: EntityInstance | RelationInstance  // Entity/Relation to query (for data retrieval)
  dataPolicy?: DataPolicyInstance     // Fixed data access constraints
}): InteractionInstance
```

Constraints:
- For data retrieval, use `GetAction` as action and specify `data`
- `conditions` accepts either a single `Condition` or a `Conditions` (combined with BoolExp)

---

## Action.create

```typescript
Action.create(args: {
  name: string                        // Action identifier (no logic)
}): ActionInstance
```

Constraints:
- Action is ONLY an identifier — no `handler`, `execute`, or `callback`
- Use `GetAction` (pre-built) for data retrieval interactions

---

## Payload.create / PayloadItem.create

```typescript
Payload.create(args: {
  items: PayloadItemInstance[]
}): PayloadInstance

PayloadItem.create(args: {
  name: string                        // Parameter name
  type: string                        // Required: data type
  base?: EntityInstance               // Entity reference for validation
  isRef?: boolean                     // true = reference by ID to existing entity
  required?: boolean                  // true = mandatory parameter
  isCollection?: boolean             // true = array of items
  itemRef?: AttributiveInstance | EntityInstance  // Reference to entities defined in other interactions (for Activity)
}): PayloadItemInstance
```

---

## Count.create

```typescript
Count.create(args: {
  record?: EntityInstance | RelationInstance   // What to count (for entity/global level)
  property?: string                           // Relation property name (for property level)
  direction?: 'source' | 'target'            // For relation counting
  callback?: (record: any) => boolean        // Filter function
  attributeQuery?: AttributeQueryData        // Fields to load for callback
  dataDeps?: DataDependencies                // External data dependencies
}): CountInstance
```

Constraints:
- Use `record` for global/entity-level counting, `property` for property-level counting
- Place on Property `computation` or Dictionary `computation`
- Provide `defaultValue` on the Property when using as property computation

---

## WeightedSummation.create

```typescript
WeightedSummation.create(args: {
  record?: EntityInstance | RelationInstance   // Entity/relation to aggregate (for global level)
  property?: string                           // Relation property name (for property level)
  direction?: 'source' | 'target'            // For relation-based computation
  callback: (record: any) => { weight: number, value: number }
  attributeQuery?: AttributeQueryData
  dataDeps?: DataDependencies
}): WeightedSummationInstance
```

Result: `sum(weight * value) / sum(weight)`

---

## Summation.create

```typescript
Summation.create(args: {
  record?: EntityInstance | RelationInstance   // Entity/relation to sum (for global level)
  property?: string                           // Relation property name (for property level)
  direction?: 'source' | 'target'            // For relation-based summation
  attributeQuery: AttributeQueryData          // Required: specifies field path to sum
}): SummationInstance
```

Sums the field pointed to by the leftmost path in `attributeQuery`. Undefined/null/NaN/Infinity values are treated as 0.

---

## Every.create / Any.create

```typescript
Every.create(args: {
  record?: EntityInstance | RelationInstance   // For global level
  property?: string                           // Relation property name (for property level)
  direction?: 'source' | 'target'
  callback: (record: any) => boolean
  attributeQuery?: AttributeQueryData
  dataDeps?: DataDependencies
  notEmpty?: boolean                          // Return value when collection is empty
}): EveryInstance

Any.create(args: {
  record?: EntityInstance | RelationInstance
  property?: string
  direction?: 'source' | 'target'
  callback: (record: any) => boolean
  attributeQuery?: AttributeQueryData
  dataDeps?: DataDependencies
}): AnyInstance
```

- `Every`: true when ALL related records satisfy callback
- `Any`: true when ANY related record satisfies callback

---

## Transform.create

```typescript
Transform.create(args: {
  // Mode 1: Entity/Relation Transform
  record?: EntityInstance | RelationInstance   // Source data
  attributeQuery?: AttributeQueryData

  // Mode 2: Event-Driven Transform
  eventDeps?: {
    [key: string]: {
      recordName: string
      type: 'create' | 'update' | 'delete'
      record?: Record<string, unknown>
      oldRecord?: Record<string, unknown>
    }
  }

  // Common
  callback: Function                          // (this: Controller, record/mutationEvent) => any | any[] | null
}): TransformInstance
```

Constraints:
- Place on Entity `computation` or Relation `computation`, NEVER on Property
- Return `null`/`undefined` from callback to skip (conditional transformation)
- Return array to create multiple records from one source
- NEVER reference the entity being defined as `record` (circular reference)
- Use `eventDeps` mode for interaction-based transformations (recommended)
- Use `record` mode for deriving entities from other entities
- Transform does not accept `dataDeps`; put cross-source logic in persisted state or a `Custom` computation

---

## Custom.create

```typescript
Custom.create(args: {
  name: string
  dataDeps?: { [key: string]: DataDep }
  compute?: (this: { controller: Controller, state: any }, dataDeps: any, record?: any) => any
  incrementalCompute?: (lastValue: any, event: any, record: any, dataDeps: any) => any
  incrementalPatchCompute?: (lastValue: any, event: any, record: any, dataDeps: any) => ComputationResultPatch | ComputationResultPatch[] | undefined
  incrementalDataDeps?: string[]
  planIncremental?: (event: any, record: any, context: DataDepEventContext) => IncrementalPlan
  useLastValue?: boolean
  concurrency?: 'serializable' | 'atomic-safe'
}): CustomInstance
```

Constraints:
- If `incrementalCompute` or `incrementalPatchCompute` is present, also provide `incrementalDataDeps` or `planIncremental`
- `incrementalDataDeps` lists the data dependency keys the incremental callback needs; use `[]` when it needs none
- `planIncremental` returns `{ type: 'incremental' | 'fullRecompute' | 'skip', ... }`
- Incremental callbacks receive only planned partial `dataDeps`, not all declared deps
- Entity/relation incremental computations that need last output state must use `needsLastValue: { mode: 'fullOutput', reason }`

---

## StateMachine.create

```typescript
StateMachine.create(args: {
  states: StateNodeInstance[]
  transfers: StateTransferInstance[]
  initialState: StateNodeInstance
}): StateMachineInstance
```

Place on Property `computation`. The property value equals the current state node's name (or its `computeValue` result).

---

## StateNode.create

```typescript
StateNode.create(args: {
  name: string
  computeValue?: (this: Controller, lastValue: any, event?: any) => any
}): StateNodeInstance
```

- Without `computeValue`: property value is the state name string
- With `computeValue`: property value is the function's return value
- `lastValue`: previous property value before transition (undefined for initial state)
- `event`: the event record that triggered the transition (undefined during initialization)
  - For interaction triggers: access `event.payload`, `event.user`, `event.interactionName`
- `this` is bound to the Controller instance — async functions can use `this.system.storage`

---

## StateTransfer.create

```typescript
StateTransfer.create(args: {
  current: StateNodeInstance                // From state
  next: StateNodeInstance                   // To state
  trigger: RecordMutationEventPattern       // Pattern to match against mutation events
  computeTarget?: Function                  // Determines which records to transition
}): StateTransferInstance
```

**`trigger`** — a partial pattern object, NOT an Interaction instance:
```typescript
trigger: {
  recordName: string             // e.g. InteractionEventEntity.name
  type: 'create' | 'update' | 'delete'
  record?: Record<string, any>   // deep partial match, e.g. { interactionName: myInteraction.name }
  oldRecord?: Record<string, any>
  keys?: string[]
}
```

**`computeTarget`** — receives the mutation event, returns which record(s) to transition:
- Entity: `{ id: string }` or `{ id: string }[]`
- Relation: `{ source: { id: string }, target: { id: string } }`
- Return `undefined` to skip
- `this` is bound to Controller — async functions can use `this.system.storage`
- Required for property-level StateMachines; omit for global StateMachines

---

## ScopedSequence.create

```typescript
ScopedSequence.create(args: {
  name: string
  scope: Array<
    | { name: string, type: 'string' | 'number' | 'boolean', path: string }
    | { name: string, type: 'ref', base: EntityInstance, path: string }
  >
  initialValue?: number       // Defaults to 0; first automatic value is initialValue + step
  step?: number               // Positive integer, defaults to 1
  allowManualValue?: boolean  // Defaults to false; only for import/backfill paths
  initializeFrom?: {
    record: EntityInstance
    valuePath: string
    scope: Array<{ name: string, path: string }>
    aggregate: 'max'
  }
}): ScopedSequenceInstance
```

Use `ScopedSequence` when a `number` property needs a transactionally allocated, per-scope serial such as `{ project, prefix } -> 1, 2, 3`.

```typescript
const assetSerial = ScopedSequence.create({
  name: 'projectAssetSerial',
  scope: [
    { name: 'project', type: 'ref', base: Project, path: 'project' },
    { name: 'prefix', type: 'string', path: 'prefix' },
  ],
})

const Media = Entity.create({
  name: 'Media',
  properties: [
    Property.create({ name: 'project', type: 'id' }),
    Property.create({ name: 'prefix', type: 'string' }),
    Property.create({
      name: 'serialNumber',
      type: 'number',
      computation: assetSerial,
    }),
  ],
  constraints: [
    UniqueConstraint.create({
      name: 'uniqProjectPrefixSerial',
      properties: ['project', 'prefix', 'serialNumber'],
    }),
  ],
})
```

Constraints:
- Place only on `Property.computation`, and the property must be `type: 'number'`.
- Do not add `defaultValue` or a non-null insert-time constraint to the same property. Allocation is post-create/pre-commit.
- Scope paths read persisted values already present on the created record. Do not use relation traversal, queries, or values produced by another post-create computation.
- Keep the database unique constraint for the same scope fields plus sequence property.
- `allowManualValue: true` preserves imported values and does not advance the counter. Use `initializeFrom` during migration to seed counters from existing data.
- Do not use `initializeFrom.match` for partial seeding of a sequence that will later allocate for all host rows; seed every existing scope that the property will cover.
- PostgreSQL is the production-safe cross-connection driver. PGLite/SQLite are suitable for tests or single-process local use only.

---

## Controller

```typescript
new Controller(args: {
  system: System
  entities?: EntityInstance[]
  relations?: RelationInstance[]
  eventSources?: EventSourceInstance[]       // Interactions, custom EventSources, etc.
  dict?: DictionaryInstance[]               // Global dictionaries
  recordMutationSideEffects?: RecordMutationSideEffect[]
  computations?: (new (...args: any[]) => Computation)[]  // Additional computation handle classes
  ignoreGuard?: boolean                     // Skip guard checks when true
  forceThrowDispatchError?: boolean         // Throw errors instead of returning them
}): Controller

controller.setup(install?: boolean): Promise<void>

controller.dispatch<TArgs, TResult>(
  eventSource: EventSourceInstance<TArgs, TResult>,
  args: TArgs
): Promise<DispatchResponse>

// DispatchResponse = { error?, data?, effects?, sideEffects?, context? }
```

Constraints:
- ALWAYS call `setup(true)` before any `dispatch`
- `dict` is for Dictionary instances ONLY — never pass computations here
- `dispatch` first parameter is the event source object reference, NOT a name string
- `dispatch` NEVER throws by default — errors are in `result.error`
- Set `forceThrowDispatchError: true` to make dispatch throw instead
- Controller automatically registers event source entities (e.g. `InteractionEventEntity`)

---

## MonoSystem

```typescript
new MonoSystem(db: DatabaseDriver): MonoSystem

system.conceptClass = KlassByName    // MUST set before creating Controller
system.storage                        // Access to storage APIs
```

Database drivers: `PGLiteDB` (in-memory/testing), `PostgreSQLDB`, `SQLiteDB`, `MysqlDB`

---

## Storage APIs

```typescript
system.storage.find(
  entityName: string,
  matchExp?: MatchExp,
  modifier?: { limit?: number, offset?: number, orderBy?: Record<string, 'ASC'|'DESC'> },
  attributeQuery?: AttributeQuery
): Promise<any[]>

system.storage.findOne(
  entityName: string,
  matchExp?: MatchExp,
  modifier?: any,
  attributeQuery?: AttributeQuery
): Promise<any>

system.storage.create(entityName: string, data: object): Promise<any>
system.storage.update(entityName: string, matchExp: MatchExp, data: object): Promise<any>
system.storage.delete(entityName: string, matchExp: MatchExp): Promise<void>

// Dictionary-specific API
system.storage.dict.get(key: string): Promise<any>
system.storage.dict.set(key: string, value: any): Promise<void>

// General KV storage
system.storage.get(itemName: string, id: string, initialValue?: any): Promise<any>
system.storage.set(itemName: string, id: string, value: any): Promise<any>
```

Constraints:
- ALWAYS pass `attributeQuery` to `find`/`findOne` — without it, only `id` is returned
- Use `['*']` for all fields
- `create`/`update`/`delete` bypass all validation — use ONLY for test setup
- When querying relations, use dot notation for source/target: `{ key: 'source.id', value: ['=', id] }`

---

## MatchExp

```typescript
MatchExp.atom(args: { key: string, value: [operator, value] }): MatchExp

// Operators: '=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'between', 'not'

// Chaining
matchExp.and(args: { key: string, value: [operator, value] }): MatchExp
matchExp.or(args: { key: string, value: [operator, value] }): MatchExp

// From object (all AND)
MatchExp.fromObject({ status: 'active', age: 25 }): MatchExp

// Nested field access
MatchExp.atom({ key: 'author.name', value: ['=', 'Alice'] })
```

---

## AttributeQuery

```typescript
// Simple fields
['id', 'name', 'email']

// All fields
['*']

// Nested relation data
['id', 'name', ['posts', { attributeQuery: ['id', 'title'] }]]

// Relation properties (the relation record itself)
['id', 'name', ['friends', { attributeQuery: ['id', 'name', ['&', { attributeQuery: ['since'] }]] }]]

// With filter on related data
['id', ['posts', {
  attributeQuery: ['id', 'title'],
  matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'published'] })
}]]
```

---

## Attributive.create

```typescript
Attributive.create(args: {
  name?: string
  content: (record: any, eventArgs: any) => boolean
}): AttributiveInstance
```

Used on Interaction `userAttributives` to validate user context.

---

## BoolExp

```typescript
BoolExp.atom(data: T): BoolExp
boolExp.and(other: BoolExp | T): BoolExp
boolExp.or(other: BoolExp | T): BoolExp
```

Combines multiple Attributives, Conditions, or other expressions for complex logic.

---

## Condition.create / Conditions.create

```typescript
Condition.create(args: {
  name?: string
  content: (this: Controller, event: InteractionEventArgs) => Promise<boolean>
}): ConditionInstance

Conditions.create(args: {
  content: BoolExp<ConditionInstance>     // Combined with AND/OR logic
}): ConditionsInstance
```

- `content` returns `true` to allow, `false` to reject
- `this` is bound to Controller — can access `this.system.storage`
- Failed conditions return `{ error: { type: 'condition check failed' } }`

---

## Dictionary.create

```typescript
Dictionary.create(args: {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object'
  collection?: boolean
  defaultValue?: Function
  computation?: ComputationInstance
}): DictionaryInstance
```

Global state values. Pass to Controller's `dict` parameter. Access via `system.storage.dict.get(name)` / `system.storage.dict.set(name, value)`.

---

## EventSource.create

```typescript
EventSource.create(args: {
  name: string                        // Event source identifier
  entity: EntityInstance              // Entity to persist event records
  guard?: (this: Controller, args: TArgs) => Promise<void>
  mapEventData?: (args: TArgs) => Record<string, any>
  resolve?: (this: Controller, args: TArgs) => Promise<TResult>
  afterDispatch?: (this: Controller, args: TArgs, result: { data?: TResult }) => Promise<Record<string, unknown> | void>
  postCommit?: (this: Controller, args: TArgs, result: { data?: TResult, context?: Record<string, unknown> }) => Promise<Record<string, unknown> | void>
}): EventSourceInstance
```

Custom event source for scheduled tasks, webhooks, or any non-interaction trigger. Dispatch via `controller.dispatch(eventSource, args)`. `afterDispatch` runs inside the retryable transaction; use `postCommit` for external IO that must run only after commit.

---

## HardDeletionProperty.create

```typescript
HardDeletionProperty.create(): PropertyInstance
```

Creates a property named `_isDeleted_`. When its value transitions to `true` (via StateMachine), the Controller physically deletes the record. Use with `DELETED_STATE` / `NON_DELETED_STATE`.

---

## RecordMutationSideEffect.create

```typescript
RecordMutationSideEffect.create(args: {
  name: string
  record: { name: string }            // Entity/relation name to monitor
  content: (this: Controller, event: RecordMutationEvent) => Promise<any>
}): RecordMutationSideEffect
```

Triggers custom logic on record mutations within dispatch context. Results available in `dispatchResult.sideEffects`.

---

## Complete Exports

```typescript
import {
  // Data model
  Entity, Property, Relation,

  // Event sources
  EventSource, Interaction, Action, GetAction, Payload, PayloadItem,
  Activity,

  // Computations
  Count, Every, Any, Summation, WeightedSummation, Average,
  ScopedSequence, Transform, StateMachine, StateNode, StateTransfer,
  RealTime, Custom,

  // Math (for RealTime)
  Expression, Inequality, Equation, MathResolver,

  // Validation & conditions
  Attributive, Attributives,
  Condition, Conditions,

  // Data policy
  DataPolicy,

  // Expressions
  BoolExp, MatchExp,

  // System
  Controller, MonoSystem, Dictionary,
  RecordMutationSideEffect,
  HardDeletionProperty, HARD_DELETION_PROPERTY_NAME,
  NON_DELETED_STATE, DELETED_STATE,

  // Built-in entities
  InteractionEventEntity,

  // Drivers
  PGLiteDB, SQLiteDB, PostgreSQLDB, MysqlDB,

  // Utilities
  KlassByName
} from 'interaqt'
```

Non-existent exports (commonly mistaken):
- `InteractionEvent` → use `InteractionEventEntity`
- `FilteredEntity` → use `Entity.create` with `baseEntity` + `matchExpression`
- `RelationBasedEvery` → use `Every`
- `Sum` → use `Summation`
- `callInteraction` → use `controller.dispatch(eventSource, args)`
- `User`, `Post`, etc. → no pre-built entities exist
