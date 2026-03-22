# interaqt API Reference

> Compact lookup for API signatures and constraints. No examples — see `interaqt-patterns.md` for usage.

---

## Entity.create

```typescript
Entity.create(args: {
  name: string                        // PascalCase, singular, unique
  properties: PropertyInstance[]      // Array of Property.create() results
  computation?: ComputationInstance   // Transform for derived entities
  baseEntity?: EntityInstance         // For filtered entities
  filterCondition?: MatchExp          // For filtered entities
}): EntityInstance
```

Constraints:
- NEVER pass `uuid` — the framework generates it
- `name` must match `/^[a-zA-Z0-9_]+$/`
- `computation` accepts only Transform (for creating derived entity collections)

---

## Property.create

```typescript
Property.create(args: {
  name: string                        // Property name
  type?: 'string' | 'number' | 'boolean' | 'object'
  collection?: boolean                // true for array types
  defaultValue?: any | (() => any)    // Static value or factory function
  getValue?: (record: any) => any     // Computed from same-record fields (not persisted)
  computed?: (record: any) => any     // Alias for getValue
  computation?: ComputationInstance   // Reactive: Count, WeightedSummation, Every, Any, StateMachine
}): PropertyInstance
```

Constraints:
- `getValue`/`computed` are for same-record derivations only — NOT persisted
- `computation` results ARE persisted and auto-updated
- When using `computation`, ALWAYS provide `defaultValue`
- NEVER use Transform on Property `computation` — Transform belongs on Entity `computation`

---

## Relation.create

```typescript
Relation.create(args: {
  source: EntityInstance               // Source entity
  sourceProperty: string              // Navigation property on source
  target: EntityInstance               // Target entity
  targetProperty: string              // Navigation property on target
  type: '1:1' | '1:n' | 'n:1' | 'n:n'
  properties?: PropertyInstance[]     // Relation's own properties
  computation?: ComputationInstance   // Transform for computed relations
}): RelationInstance
```

Constraints:
- NEVER specify `name` — auto-generated from source+target entity names
- ALWAYS specify `type` explicitly
- Symmetric relations: set `source === target` AND `sourceProperty === targetProperty`

---

## Interaction.create

```typescript
Interaction.create(args: {
  name: string                        // Interaction identifier
  action: ActionInstance              // Action.create() result (identifier only)
  payload?: PayloadInstance           // Payload.create() result
  conditions?: ConditionInstance      // Execution conditions
}): InteractionInstance
```

---

## Action.create

```typescript
Action.create(args: {
  name: string                        // Action identifier (no logic)
}): ActionInstance
```

Constraints:
- Action is ONLY an identifier — no `handler`, `execute`, or `callback`

---

## Payload.create / PayloadItem.create

```typescript
Payload.create(args: {
  items: PayloadItemInstance[]
}): PayloadInstance

PayloadItem.create(args: {
  name: string                        // Parameter name
  base?: EntityInstance               // Entity reference for validation
  isRef?: boolean                     // true = reference by ID to existing entity
  required?: boolean                  // true = mandatory parameter
  isCollection?: boolean             // true = array of items
  attributives?: AttributiveInstance  // Validation rules (only works when base is set)
}): PayloadItemInstance
```

Constraints:
- Without `base`: framework only checks required/collection, no concept validation
- With `base` + `isRef: true`: framework verifies entity exists by ID
- With `base` + `attributives`: framework validates data against attributive rules
- `attributives` are checked for EVERY item when `isCollection: true`

---

## Count.create

```typescript
Count.create(args: {
  record: EntityInstance | RelationInstance   // What to count
  direction?: 'source' | 'target'            // For relation counting
  callback?: (record: any) => boolean        // Filter function
  attributeQuery?: AttributeQueryData        // Fields to load for callback
  dataDeps?: DataDepsConfig                  // External data dependencies
}): CountInstance
```

Constraints:
- Place on Property `computation`, not Entity `computation`
- ALWAYS provide `defaultValue` on the Property

---

## WeightedSummation.create

```typescript
WeightedSummation.create(args: {
  record: RelationInstance                   // Relation to aggregate
  callback: (relation: any) => { weight: number, value: number }
  attributeQuery?: AttributeQueryData
  dataDeps?: DataDepsConfig
}): WeightedSummationInstance
```

Result: `sum(weight * value) / sum(weight)`

---

## Every.create / Any.create

```typescript
Every.create(args: {
  record: RelationInstance
  callback: (relation: any) => boolean
  attributeQuery?: AttributeQueryData
}): EveryInstance

Any.create(args: {
  record: RelationInstance
  callback: (relation: any) => boolean
  attributeQuery?: AttributeQueryData
}): AnyInstance
```

- `Every`: true when ALL related records satisfy callback
- `Any`: true when ANY related record satisfies callback

---

## Transform.create

```typescript
Transform.create(args: {
  record: EntityInstance | RelationInstance   // Source data
  callback: (record: any, dataDeps?: any) => any | null
  attributeQuery?: AttributeQueryData
  dataDeps?: DataDepsConfig
}): TransformInstance
```

Constraints:
- Place on Entity `computation` or Relation `computation`, NEVER on Property
- Return `null` from callback to skip (conditional transformation)
- NEVER reference the entity being defined as `record` (circular reference)

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
  computeValue?: (lastValue: any) => any    // Dynamic value when entering this state
}): StateNodeInstance
```

- Without `computeValue`: property value is the state name string
- With `computeValue`: property value is the function's return value

---

## StateTransfer.create

```typescript
StateTransfer.create(args: {
  current: StateNodeInstance                // From state
  next: StateNodeInstance                   // To state
  trigger: InteractionInstance              // Interaction that causes transition
  computeTarget: (event: any) => { id: any }  // Identifies which record to transition
}): StateTransferInstance
```

`computeTarget` extracts the target entity ID from the interaction event payload.

---

## Controller

```typescript
new Controller(args: {
  system: MonoSystem
  entities: EntityInstance[]
  relations: RelationInstance[]
  activities: ActivityInstance[]
  interactions: InteractionInstance[]
  dict: DictionaryInstance[]               // Global dictionaries, NOT computations
  recordMutationSideEffects?: any[]
}): Controller

controller.setup(install: boolean): Promise<void>
controller.callInteraction(name: string, args: {
  user: { id: string, [key: string]: any }
  payload?: { [key: string]: any }
}): Promise<{ error?: { message: string, [key: string]: any }, [key: string]: any }>
```

Constraints:
- ALWAYS call `setup(true)` before any `callInteraction`
- `dict` is for Dictionary instances ONLY — never pass computations here
- `callInteraction` NEVER throws — errors are in `result.error`

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
  matchExp: MatchExp,
  modifier?: any,
  attributeQuery?: AttributeQuery
): Promise<any>

system.storage.create(entityName: string, data: object): Promise<any>
system.storage.update(entityName: string, matchExp: MatchExp, data: object): Promise<void>
system.storage.delete(entityName: string, matchExp: MatchExp): Promise<void>
```

Constraints:
- ALWAYS pass `attributeQuery` to `find`/`findOne` — without it, only `id` is returned
- Use `['*']` for all fields
- `create`/`update`/`delete` bypass all validation — use ONLY for test setup

---

## MatchExp

```typescript
MatchExp.atom(args: { key: string, value: [operator, value] }): MatchExp

// Operators: '=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'between', 'not', 'exist'

// Chaining
matchExp.and(args: { key: string, value: [operator, value] }): MatchExp
matchExp.or(args: { key: string, value: [operator, value] }): MatchExp

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
  name: string
  content: (record: any, eventArgs: any) => boolean
}): AttributiveInstance
```

Used on PayloadItem `attributives` to validate referenced entities.

---

## BoolExp

```typescript
BoolExp.atom(attributive: AttributiveInstance): BoolExp
boolExp.and(other: BoolExp): BoolExp
boolExp.or(other: BoolExp): BoolExp
```

Combines multiple Attributives for complex validation logic.

---

## Dictionary.create

```typescript
Dictionary.create(args: {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object'
  collection?: boolean
  defaultValue?: any | (() => any)
  computation?: ComputationInstance
}): DictionaryInstance
```

Global state values. Pass to Controller's `dict` parameter. Access via `system.storage.get('state', name)`.

---

## Complete Exports

```typescript
import {
  Entity, Property, Relation,
  Interaction, Action, Payload, PayloadItem,
  Activity,
  Count, Every, Any, Sum, Summation, WeightedSummation, Average,
  Transform, StateMachine, StateNode, StateTransfer,
  RealTime, Expression, Inequality, Equation, MathResolver,
  Attributive, Attributives, Condition, Conditions,
  BoolExp, MatchExp,
  Controller, MonoSystem, Dictionary,
  InteractionEventEntity,
  PGLiteDB, SQLiteDB, PostgreSQLDB, MysqlDB,
  KlassByName
} from 'interaqt'
```

Non-existent exports (commonly mistaken):
- `InteractionEvent` → use `InteractionEventEntity`
- `FilteredEntity` → use `Entity.create` with `baseEntity` + `filterCondition`
- `RelationBasedEvery` → use `Every`
- `User`, `Post`, etc. → no pre-built entities exist
