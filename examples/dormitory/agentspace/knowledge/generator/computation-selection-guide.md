# Computation Selection Guide v2 - Streamlined Version

## Overview

This guide helps you select the appropriate computation type for each entity, property, relation, and dictionary based on the structured information in `data-design.json` and `interaction-design.md`.


## Input Files

You will receive two input files:
1. **data-design.json**: Contains structured data dependencies and lifecycle information
2. **interaction-design.md**: Describes all interactions and their effects

## Direct Mapping Rules

### 1. Entity-Level Computations

Look at the entity's `interactionDependencies` and `lifecycle.creation`:

| Condition | Computation Decision |
|-----------|---------------------|
| `interactionDependencies` includes a create interaction | `Transform` with `InteractionEventEntity` |
| `dataDependencies` includes other entities | `Transform` from source entity |
| `lifecycle.creation: "created-with-parent"` | No computation needed (automatic) |
| `lifecycle.creation: "interaction-created"` | `Transform` with `InteractionEventEntity` |

### 2. Relation-Level Computations

Check `lifecycle.creation` and `lifecycle.deletion`:

| Creation | Deletion | Computation Decision |
|----------|----------|---------------------|
| `"created-with-entity"` | `canBeDeleted: false` | No computation needed |
| `"interaction-created"` | `canBeDeleted: false` | `Transform` with `InteractionEventEntity` |
| `"interaction-created"` | `canBeDeleted: true` | `StateMachine` only (hard delete) |
| Any | `deletionType: "soft-delete"` | `Transform` + status property with `StateMachine` |

**Critical Rule**: Transform can ONLY create, NEVER delete. If deletion is needed, you MUST use StateMachine.

### 3. Property-Level Computations

Analyze the property's `dataDependencies`, `interactionDependencies`, and `computationMethod`:

| Condition | Computation Decision |
|-----------|---------------------|
| Set at entity/relation creation, never modified | No computation (None) - controlled by entity/relation |
| Has `interactionDependencies` that can modify it | `StateMachine` for state transitions or value updates |
| Has `dataDependencies` with relations/entities | Aggregation computation based on `computationMethod` |
| `dataDependencies` = self properties only | `computed` function |
| Complex calculation with multiple entities | `Custom` |
| Only has `initialValue`, no dependencies | No computation (use `defaultValue`) |

#### Decision Priority (check in order):

1. **If property is set only at creation time**:
   - Check if `interactionDependencies` only includes the create interaction
   - If no other interactions can modify it → **None** (property controlled by entity/relation)
   - Examples: bedNumber in Bed, assignedBy in relations

2. **If has `interactionDependencies` that can modify**:
   - Property changes in response to interactions → `StateMachine`
   - For timestamps: Use StateMachine with `computeValue`
   - For status fields: Use StateMachine with StateNodes

3. **If has `dataDependencies` (no interactions)**:
   - Check `computationMethod` for aggregation type
   - Relations/entities involved → Use appropriate aggregation

4. **If uses only own entity properties**:
   - Simple derivation → `computed` function
   - Better performance than Custom

#### Aggregation Type Selection

Based on the `computationMethod` description:
- Contains "count of" → `Count`
- Contains "sum of" → `Summation` 
- Contains "weighted sum" or "× price" → `WeightedSummation`
- Contains "all" or "every" → `Every`
- Contains "any" or "at least one" → `Any`
- Contains "percentage" or complex logic → `Custom`
- Time-based comparisons → `RealTime`

### 4. Dictionary-Level Computations

Based on `computationMethod` description:
- "Count of all" → `Count`
- "Sum of" → `Summation`
- "Count where condition" → `Count` with filter callback
- Complex aggregation → `Custom`

## Automated Decision Process

### Step 1: Parse Input Files
Read `data-design.json` and extract:
- Entity definitions with their properties
- Relation definitions
- Dictionary definitions

### Step 2: Apply Mapping Rules
For each element, apply the rules above to determine computation type.

### Step 3: Generate Output Document

Create `docs/computation-analysis.json` with this structure:

```json
{
  "entities": [
    {
      "name": "<from data-design.json>",
      "entityLevelAnalysis": {
        "purpose": "<from data-design.json>",
        "creationSource": "<from lifecycle.creation>",
        "updateRequirements": "<from interaction-design.md effects>",
        "deletionStrategy": "<from lifecycle.deletion.deletionType>"
      },
            "propertyAnalysis": [
        {
          "propertyName": "<property name>",
          "type": "<from data-design.json>",
          "purpose": "<from data-design.json>",
          "dataSource": "<from computationMethod>",
          "computationDecision": "<None/StateMachine/Count/etc. based on rules>",
          "reasoning": "<automated based on rules>",
          "dependencies": <convert dataDependencies to proper format>,
          "interactionDependencies": <from data-design.json>,
          "calculationMethod": "<from computationMethod>"
        }
      ],
      "entityComputationDecision": {
        "type": "<Transform or None based on rules>",
        "reasoning": "<automated based on lifecycle>",
        "dependencies": <add InteractionEventEntity if needed>,
        "interactionDependencies": <from data-design.json>,
        "calculationMethod": "<from computationMethod>"
      }
    }
  ],
  "relations": [
    {
      "name": "<from data-design.json>",
      "relationAnalysis": {
        "purpose": "<from data-design.json>",
        "creation": "<from lifecycle.creation>",
        "deletionRequirements": "<from lifecycle.deletion>",
        "computationDecision": "<apply relation rules>",
        "reasoning": "<automated based on lifecycle>",
        "dependencies": <format properly>,
        "interactionDependencies": <from data-design.json>,
        "calculationMethod": "<from computationMethod>"
      }
    }
  ],
  "dictionaries": [
    {
      "name": "<from data-design.json>",
      "dictionaryAnalysis": {
        "purpose": "<from data-design.json>",
        "type": "<from data-design.json>",
        "collection": "<determine from type>",
        "computationDecision": "<apply dictionary rules>",
        "reasoning": "<automated based on computationMethod>",
        "dependencies": <format properly>,
        "interactionDependencies": <from data-design.json>,
        "calculationMethod": "<from computationMethod>"
      }
    }
  ]
}
```

## Dependency Formatting Rules

When converting `dataDependencies` to `dependencies`:

1. **Entity/Relation properties**: Format as `EntityName.propertyName`
2. **Self properties**: Convert to `_self.propertyName`
3. **Relations without properties**: Use relation name directly
4. **Dictionaries**: Use dictionary name without dot notation
5. **InteractionEventEntity**: Add when `interactionDependencies` exists

Examples:
- `["User", "Dormitory"]` → `["User.id", "Dormitory.id"]` (specify actual properties used)
- `["UserDormitoryRelation"]` → `["UserDormitoryRelation"]`
- Self-reference → `["_self.capacity", "_self.occupancy"]`

## Quick Decision Flowchart

```
1. Entity Creation?
   └─ Has interactionDependencies? → Transform with InteractionEventEntity
   
2. Relation Lifecycle?
   ├─ Can be deleted? → StateMachine (hard delete)
   ├─ Needs audit trail? → Transform + status StateMachine (soft delete)
   └─ Never deleted? → Transform (if interaction-created)

3. Property Value?
   ├─ Set only at creation, never modified? → None (controlled by entity/relation)
   ├─ Has interactionDependencies that can modify? → StateMachine
   ├─ Has dataDependencies with relations? → Aggregation computation
   ├─ Only uses own properties? → computed
   └─ Complex with multiple entities? → Custom

4. Dictionary Aggregation?
   └─ Check computationMethod → Map to Count/Summation/Custom
```

## Implementation Checklist

- [ ] Parse `data-design.json` completely
- [ ] Apply mapping rules for every entity
- [ ] Apply mapping rules for every property
- [ ] Apply mapping rules for every relation
- [ ] Apply mapping rules for every dictionary
- [ ] Format all dependencies correctly
- [ ] Separate `dependencies` and `interactionDependencies`
- [ ] Add `InteractionEventEntity` when needed
- [ ] Verify no Transform is used for deletable relations
- [ ] Generate complete `computation-analysis.json`

## Common Patterns

### Timestamps
- Creation timestamps (`createdAt`): Use `defaultValue: () => Math.floor(Date.now()/1000)`
- Update timestamps (`updatedAt`, `processedAt`): Use StateMachine with `computeValue`

### Status Fields
- With defined transitions: Use StateMachine with StateNodes
- Example: pending → approved/rejected

### Counts and Aggregations
- Simple counts: Use `Count`
- Sums: Use `Summation`
- Calculated totals (price × quantity): Use `WeightedSummation`

### Deletion Patterns
- Hard delete (no history): StateMachine only with `computeValue: () => null`
- Soft delete (audit trail): Transform for creation + status property with StateMachine

## Validation

Before finalizing, verify:
1. Every entity with `interactionDependencies` has entity-level Transform
2. Properties set only at creation time have computation "None"
3. Properties with modifying `interactionDependencies` use StateMachine
4. Properties with only `dataDependencies` use data-based computation
5. No relations with `canBeDeleted:true` use Transform alone
6. All dependencies are properly formatted with specific properties
7. `InteractionEventEntity` is included when interactions are dependencies
