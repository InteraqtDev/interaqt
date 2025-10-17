# Computation Selection Guide v2 - Streamlined Version

## Overview

This guide helps you select the appropriate computation type for each entity, property, relation, and dictionary based on the structured information in `requirements/{module}.data-design.json` and `requirements/{module}.interaction-design.md`.

**IMPORTANT**: First read the current module name from `.currentmodule` file in project root, and use it to construct the file paths. For example, if `.currentmodule` contains `user-management`, then the paths would be:
- `requirements/user-management.data-design.json`
- `requirements/user-management.interaction-design.md`


## Input Files

You will receive two input files:
1. **requirements/{module}.data-design.json**: Contains structured data dependencies and lifecycle information
2. **requirements/{module}.interaction-design.md**: Describes all interactions and their effects

Note: Replace `{module}` with the value from `.currentmodule` file.

## Direct Mapping Rules

### Special Notations

#### _parent:[ParentName]
The `_parent:[ParentName]` notation indicates that this entity or relation is created by its parent's computation, not by its own computation. This occurs when `lifecycle.creation.type` is `"created-with-parent"` (for entities) or `"created-with-entity"` (for relations). The parent entity's computation is responsible for creating this child entity/relation.

Example: If an AuditLog has `lifecycle.creation.type: "created-with-parent"` and `lifecycle.creation.parent: "Transaction"`, its computationDecision would be `"_parent:Transaction"`.

#### _owner
The `_owner` notation indicates that this property's value is fully controlled by its owner entity or relation's computation. This applies when:
- `controlType` is `"creation-only"`: Property is set during entity/relation creation and never modified separately
- `controlType` is `"derived-with-parent"`: Property belongs to a derived entity/relation and is computed as part of the parent's overall derivation

Properties marked with `_owner` don't need separate computation control - their logic is embedded in the owner's creation or derivation process.

### 1. Entity-Level Computations

Look at the entity's `lifecycle.creation` and `lifecycle.deletion`:

| Creation Type | Deletion | Computation Decision |
|---------------|----------|---------------------|
| `"integration-event"` | Always `canBeDeleted: false` | `None` - Entity is externally controlled by webhook/callback from external systems |
| `"created-with-parent"` | Any | `_parent:[lifecycle.creation.parent]` (created by parent's computation) |
| `"interaction-created"` | `canBeDeleted: false` | `Transform` with `InteractionEventEntity` |
| `"interaction-created"` | `canBeDeleted: true` with `hard-delete` | `Transform` + `HardDeletionProperty` with `StateMachine` |
| `"interaction-created"` | `canBeDeleted: true` with `soft-delete` | `Transform` + status property with `StateMachine` |
| `"derived"` | Any | `Transform` from source entity |

**Critical Rule**: Transform can ONLY create, NEVER delete. For hard deletion:
- Use `Transform` for entity/relation creation
- Add `HardDeletionProperty` to the entity/relation
- Use `StateMachine` on the `HardDeletionProperty` to manage deletion

### 2. Relation-Level Computations

Check `lifecycle.creation` and `lifecycle.deletion`:

| Creation Type | Deletion | Computation Decision |
|---------------|----------|---------------------|
| `"created-with-entity"` | `canBeDeleted: false` | `_parent:[lifecycle.creation.parent]` (created by parent entity's computation) |
| `"created-with-entity"` | `canBeDeleted: true` | `_parent:[lifecycle.creation.parent]` + `HardDeletionProperty` with `StateMachine` for deletion |
| `"interaction-created"` | `canBeDeleted: false` | `Transform` with `InteractionEventEntity` |
| `"interaction-created"` | `canBeDeleted: true` | `Transform` + `HardDeletionProperty` with `StateMachine` |
| `"derived"` | Any | `Transform` from source conditions |
| Any | `deletionType: "soft-delete"` | Original computation + status property with `StateMachine` |

**Critical Rule**: Transform can ONLY create, NEVER delete. For hard deletion, add `HardDeletionProperty` and use `StateMachine` on it.

### 3. Property-Level Computations

First check the property's `controlType`, then analyze dependencies if needed:

| Control Type | Computation Decision |
|--------------|---------------------|
| `creation-only` | `_owner` - controlled by entity/relation creation |
| `derived-with-parent` | `_owner` - controlled by parent's derivation |
| `independent` | Further analysis needed (see below) |

#### For `independent` Properties

Analyze the property's `dataDependencies`, `interactionDependencies`, and `computationMethod`:

| Condition | Computation Decision |
|-----------|---------------------|
| Has `interactionDependencies` that can modify it | `StateMachine` for state transitions or value updates |
| Has `dataDependencies` with relations/entities | Aggregation computation based on `computationMethod` |
| `dataDependencies` = self properties only | `computed` function |
| Complex calculation with multiple entities | `Custom` |
| Only has `initialValue`, no dependencies | No computation (use `defaultValue`) |

#### Decision Priority (check in order):

1. **Check `controlType` first**:
   - `creation-only` → **_owner** (property controlled by entity/relation creation)
   - `derived-with-parent` → **_owner** (property controlled by parent derivation)
   - `independent` → Continue to step 2

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
First, read the module name from `.currentmodule` file in project root to get the current module name.

Then read `requirements/{module}.data-design.json` and extract:
- Entity definitions with their properties and lifecycle (creation and deletion)
- Relation definitions with their lifecycle
- Dictionary definitions

### Step 2: Apply Mapping Rules
For each element:
1. **For entities**: Check in this priority order:
   - First check if `isIntegrationEvent: true` → set computation to "None" (externally controlled)
   - Then check lifecycle.creation.type and lifecycle.deletion
   - For entities that can be hard-deleted, use Transform + HardDeletionProperty with StateMachine
2. **For relations**: Check lifecycle.creation.type and lifecycle.deletion
   - For relations that can be hard-deleted, use Transform + HardDeletionProperty with StateMachine
3. **For properties**: Check controlType first:
   - If `creation-only` or `derived-with-parent` → use `_owner`
   - If `independent` → apply standard dependency analysis rules

### Step 3: Generate Output Document

Create `requirements/{module}.computation-analysis.json` (using the module name from `.currentmodule`) with this structure:

```json
{
  "entities": [
    {
      "name": "<from requirements/{module}.data-design.json>",
      "entityAnalysis": {
        "purpose": "<from requirements/{module}.data-design.json>",
        "lifecycle": "<directly copy from lifecycle field in requirements/{module}.data-design.json>",
        "computationDecision": "<Transform/_parent:[ParentName]/None based on rules>",
        "reasoning": "<automated based on lifecycle and deletion capability>",
        "calculationMethod": "<from computationMethod>"
      },
      "propertyAnalysis": [
        {
          "propertyName": "<property name>",
          "type": "<from requirements/{module}.data-design.json>",
          "purpose": "<from requirements/{module}.data-design.json>",
          "controlType": "<from requirements/{module}.data-design.json: creation-only/derived-with-parent/independent>",
          "dataSource": "<from computationMethod>",
          "computationDecision": "<_owner/StateMachine/Count/etc. based on controlType and rules>",
          "reasoning": "<automated based on controlType and rules>",
          "dependencies": <convert dataDependencies to proper format>,
          "interactionDependencies": <from requirements/{module}.data-design.json>,
          "calculationMethod": "<from computationMethod>"
        }
      ]
    }
  ],
  "relations": [
    {
      "name": "<from requirements/{module}.data-design.json>",
      "relationAnalysis": {
        "purpose": "<from requirements/{module}.data-design.json>",
        "lifecycle": "<directly copy from lifecycle field in requirements/{module}.data-design.json>",
        "computationDecision": "<Transform/_parent:[ParentName] based on rules>",
        "reasoning": "<automated based on lifecycle>",
        "calculationMethod": "<from computationMethod>"
      }
    }
  ],
  "dictionaries": [
    {
      "name": "<from requirements/{module}.data-design.json>",
      "dictionaryAnalysis": {
        "purpose": "<from requirements/{module}.data-design.json>",
        "type": "<from requirements/{module}.data-design.json>",
        "collection": "<determine from type>",
        "computationDecision": "<apply dictionary rules>",
        "reasoning": "<automated based on computationMethod>",
        "dependencies": <format properly>,
        "interactionDependencies": <from requirements/{module}.data-design.json>,
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
1. Entity Lifecycle?
   ├─ lifecycle.creation.type: "integration-event"? → None (externally controlled)
   ├─ lifecycle.creation.type: "created-with-parent"? → _parent:[parent]
   ├─ lifecycle.creation.type: "interaction-created" + canBeDeleted: true (hard)? → Transform + HardDeletionProperty with StateMachine
   ├─ lifecycle.creation.type: "interaction-created" + canBeDeleted: true (soft)? → Transform + status StateMachine
   ├─ lifecycle.creation.type: "interaction-created" + canBeDeleted: false? → Transform with InteractionEventEntity
   └─ lifecycle.creation.type: "derived"? → Transform from source entity
   └─ lifecycle.creation.type: "mutation-derived"? → Transform from record mutation event
   
2. Relation Lifecycle?
   ├─ lifecycle.creation.type: "created-with-entity"? → _parent:[parent]
   ├─ Can be deleted? → Transform/parent + HardDeletionProperty with StateMachine
   ├─ Needs audit trail? → Transform + status StateMachine (soft delete)
   └─ Never deleted? → Transform (if interaction-created) or _parent:[parent]

3. Property Value?
   ├─ controlType: "creation-only"? → _owner (controlled by entity/relation)
   ├─ controlType: "derived-with-parent"? → _owner (controlled by parent)
   ├─ controlType: "independent"?
   │  ├─ Has interactionDependencies that can modify? → StateMachine
   │  ├─ Has dataDependencies with relations? → Aggregation computation
   │  ├─ Only uses own properties? → computed
   │  └─ Complex with multiple entities? → Custom
   └─ Only has initialValue? → defaultValue

4. Dictionary Aggregation?
   └─ Check computationMethod → Map to Count/Summation/Custom
```

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

#### For Entities:
- **Hard delete** (no history): Transform + HardDeletionProperty with StateMachine
  - Creation: Transform creates entity from interaction
  - Deletion: HardDeletionProperty with StateMachine triggers physical deletion
- **Soft delete** (audit trail): Transform for creation + status property with StateMachine
  - Creation: Transform creates entity
  - Deletion: StateMachine updates status to "deleted"

#### For Relations:
- **Hard delete**: Transform + HardDeletionProperty with StateMachine
- **Soft delete**: Original creation computation + status property with StateMachine
- **Created-with-entity + deletable**: `_parent` for creation + HardDeletionProperty with StateMachine for deletion

## Validation

Before finalizing, verify:
1. Every entity with `lifecycle.creation.type: "integration-event"` has `computationDecision: "None"` or no computation
2. Every entity with `interactionDependencies` has appropriate computation:
   - If `canBeDeleted: true` with `hard-delete` → Must use Transform + HardDeletionProperty with StateMachine
   - If `canBeDeleted: false` → Can use Transform (unless `created-with-parent` or `integration-event`)
3. Entities/relations with `lifecycle.creation.type: "created-with-parent/entity"` use `_parent:[ParentName]`
4. Properties with `controlType: "creation-only"` or `"derived-with-parent"` have computation `_owner`
5. Properties with `controlType: "independent"` are analyzed for appropriate computation
6. Properties with modifying `interactionDependencies` use StateMachine (if `controlType: "independent"`)
7. Properties with only `dataDependencies` use data-based computation (if `controlType: "independent"`)
8. All entities or relations with `canBeDeleted:true` and `hard-delete` use Transform + HardDeletionProperty
9. All dependencies are properly formatted with specific properties
10. `InteractionEventEntity` is included when interactions are dependencies
11. The parent name in `_parent:[ParentName]` matches `lifecycle.creation.parent`


## Implementation Checklist

- [ ] Read module name from `.currentmodule` file in project root
- [ ] Parse `requirements/{module}.data-design.json` completely
- [ ] Check for entities with `isIntegrationEvent: true` and set computation to "None"
- [ ] Apply mapping rules for every entity (check deletion capability)
- [ ] Check `controlType` for every property first
- [ ] Apply mapping rules for properties based on `controlType`
- [ ] Apply mapping rules for every relation
- [ ] Apply mapping rules for every dictionary
- [ ] Format all dependencies correctly
- [ ] Separate `dependencies` and `interactionDependencies`
- [ ] Add `InteractionEventEntity` when needed
- [ ] Verify properties with `controlType: "creation-only"` or `"derived-with-parent"` use `_owner`
- [ ] Verify entities with `lifecycle.creation.type: "integration-event"` have no computation
- [ ] Verify Transform + HardDeletionProperty is used for deletable entities (hard-delete)
- [ ] Verify Transform + HardDeletionProperty is used for deletable relations (hard-delete)
- [ ] Generate complete `requirements/{module}.computation-analysis.json`