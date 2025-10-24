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

Note: Properties with `controlType: "integration-result"` are NOT marked as `_owner` - they use `StateMachine` to observe and extract values from API Call entity updates.

### 1. Entity-Level Computations

Look at the entity's `lifecycle.creation` and `lifecycle.deletion`:

| Creation Type | Deletion | Computation Decision |
|---------------|----------|---------------------|
| `"integration-event"` | Always `canBeDeleted: false` | `None` - Entity is externally controlled by webhook/callback from external systems |
| `"created-with-parent"` | Any | `_parent:[lifecycle.creation.parent]` (created by parent's computation) |
| `"mutation-derived"` | Any | `Transform` from record mutation events (both interaction-created and entity-created produce mutations) |
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

**🔴 CRITICAL RULE: Properties can NEVER use Transform computation**
- Transform is ONLY for Entity/Relation creation
- Properties must use: _owner, StateMachine, computed, aggregations (Count/Sum/etc.), or Custom
- Even if a property needs to respond to external events (like Integration Events), use StateMachine with appropriate triggers

First check the property's `controlType`, then analyze dependencies if needed:

| Control Type | Computation Decision |
|--------------|---------------------|
| `creation-only` | `_owner` - controlled by entity/relation creation |
| `integration-result` | `StateMachine` - observes API Call entity updates, extracts result from response data |
| `derived-with-parent` | `_owner` - controlled by parent's derivation |
| `independent` | Further analysis needed (see below) |

#### For `independent` Properties

Analyze the property's `dataDependencies`, `interactionDependencies`, and `computationMethod`:

| Condition | Computation Decision |
|-----------|---------------------|
| `calculationMethod` contains "sum of", "count of", "aggregate", or involves Record entities | `Custom` or aggregation (e.g., balance = sum(deposits) - sum(withdrawals)) |
| Has `interactionDependencies` that can modify it | `StateMachine` for state transitions or value updates (even for external events) |
| Has `dataDependencies` with relations/entities (including Integration Events) | `StateMachine` if triggered by events, otherwise aggregation computation |
| `dataDependencies` = self properties only | `computed` function |
| Complex calculation with multiple entities | `Custom` |
| Only has `initialValue`, no dependencies | No computation (use `defaultValue`) |

**Common Pattern - Integration Result Properties:**
- **If `controlType: "integration-result"`** → **Always use `StateMachine`**
- Pattern: Property computed from API Call entity's response data
- Example: `Donation.voiceUrl` computed from `TTSAPICall.responseData`
- Implementation:
  - Trigger: Monitor API Call entity creation/update
  - ComputeTarget: Find the business entity that needs the result
  - ComputeValue: Extract value from API Call entity's response field

**Common Pattern - Integration Event Updates:**
- Property needs to update based on Integration Event (e.g., TTSEvent) → Use `StateMachine`
- Set trigger to monitor the Integration Event Entity creation: `trigger: { recordName: 'TTSEvent', type: 'create' }`
- Use `computeTarget` to find the target entity/relation to update
- Use `computeValue` to extract and return the new value from the event

#### Decision Priority (check in order):

1. **Check `controlType` first**:
   - `creation-only` → **_owner** (property controlled by entity/relation creation)
   - `integration-result` → **StateMachine** (observes API Call entity, extracts from response)
   - `derived-with-parent` → **_owner** (property controlled by parent derivation)
   - `independent` → Continue to step 2

2. **Check `calculationMethod` for aggregate patterns**:
   - Contains "sum of", "count of", "aggregate" keywords → `Custom` or aggregation
   - Involves multiple Record entities (deposits/withdrawals) → `Custom` 
   - Example: balance = sum(RechargeRecord) - sum(DonationRecord) → `Custom`
   - If found, use `Custom` or aggregation, **skip step 3**

3. **If has `interactionDependencies` that can modify**:
   - Property changes in response to interactions → `StateMachine`
   - For timestamps: Use StateMachine with `computeValue`
   - For status fields: Use StateMachine with StateNodes

4. **If has `dataDependencies` (no interactions)**:
   - Check `computationMethod` for aggregation type
   - Relations/entities involved → Use appropriate aggregation

5. **If uses only own entity properties**:
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
   - Then check if `isAPICallEntity: true` → set computation to "Transform" (mutation-derived pattern)
   - Then check lifecycle.creation.type and lifecycle.deletion
   - For entities that can be hard-deleted, use Transform + HardDeletionProperty with StateMachine
2. **For relations**: Check lifecycle.creation.type and lifecycle.deletion
   - For relations that can be hard-deleted, use Transform + HardDeletionProperty with StateMachine
3. **For properties**: Check controlType first (PRIORITY ORDER):
   - If `creation-only` or `derived-with-parent` → use `_owner`
   - **If `integration-result` → DIRECTLY use `StateMachine` (no further analysis)**
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
          "controlType": "<from requirements/{module}.data-design.json: creation-only/integration-result/derived-with-parent/independent>",
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
   ├─ isIntegrationEvent: true? → None (externally controlled)
   ├─ isAPICallEntity: true? → Transform (mutation-derived pattern)
   ├─ lifecycle.creation.type: "created-with-parent"? → _parent:[parent]
   ├─ lifecycle.creation.type: "mutation-derived"? → Transform from record mutation event
   ├─ lifecycle.creation.type: "interaction-created" + canBeDeleted: true (hard)? → Transform + HardDeletionProperty with StateMachine
   ├─ lifecycle.creation.type: "interaction-created" + canBeDeleted: true (soft)? → Transform + status StateMachine
   ├─ lifecycle.creation.type: "interaction-created" + canBeDeleted: false? → Transform with InteractionEventEntity
   └─ lifecycle.creation.type: "derived"? → Transform from source entity
   
2. Relation Lifecycle?
   ├─ lifecycle.creation.type: "created-with-entity"? → _parent:[parent]
   ├─ Can be deleted? → Transform/parent + HardDeletionProperty with StateMachine
   ├─ Needs audit trail? → Transform + status StateMachine (soft delete)
   └─ Never deleted? → Transform (if interaction-created) or _parent:[parent]

3. Property Value? (🔴 NEVER Transform - Transform is ONLY for Entity/Relation)
   ├─ controlType: "creation-only"? → _owner (controlled by entity/relation)
   ├─ controlType: "integration-result"? → StateMachine (observe API Call entity)
   ├─ controlType: "derived-with-parent"? → _owner (controlled by parent)
   ├─ controlType: "independent"?
   │  ├─ calculationMethod has "sum of"/"count of"/"aggregate" or Record entities? → Custom or aggregation
   │  ├─ Has interactionDependencies that can modify? → StateMachine
   │  ├─ Depends on Integration Event? → StateMachine with event trigger
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

### Integration Result Properties
**🔴 DIRECT RULE: `controlType: "integration-result"` → Always `StateMachine`**

Properties with `controlType: "integration-result"` are computed from external API/integration results:
- **Pattern**: Extract values from API Call entity's response data
- **Computation**: Always use `StateMachine`
- **Trigger**: Observe API Call entity creation/update events
- **Logic**: 
  - Use `computeTarget` to find the business entity that owns this property
  - Use `computeValue` to extract the result from API Call entity's response field
  - Typically extract from the LATEST successful API Call (status='completed')

**Example**:
```json
{
  "propertyName": "voiceUrl",
  "controlType": "integration-result",
  "dataDependencies": ["TTSAPICall.responseData", "TTSAPICall.status"],
  "computationDecision": "StateMachine",
  "reasoning": "controlType is 'integration-result' - directly maps to StateMachine to observe API Call entity"
}
```

**Implementation notes**:
- Monitor related API Call entity (via relation) for updates
- Extract result when API Call reaches completed status
- Handle multiple API Call attempts (retries) by using the latest successful one

### Counts and Aggregations
- Simple counts: Use `Count`
- Sums: Use `Summation`
- Calculated totals (price × quantity): Use `WeightedSummation`

### Balance/Accumulation Properties
**🔴 CRITICAL**: Properties that aggregate from transaction records should use `Custom`, NOT `StateMachine`
- Pattern: `balance = sum(deposits) - sum(withdrawals)`
- Examples:
  - `UserGiftProfile.giftBalance = sum(RechargeRecord.amount) - sum(DonationRecord.giftAmount)`
  - `Account.balance = sum(CreditRecord.amount) - sum(DebitRecord.amount)`
  - `Inventory.stockLevel = sum(PurchaseOrder.quantity) - sum(SalesOrder.quantity)`
- **How to identify**: 
  - `calculationMethod` contains "sum of", "aggregate", "increased by", "decreased by"
  - Involves multiple Record entities (entities ending in "Record", "Transaction", "Event")
  - Even if has `interactionDependencies`, prioritize aggregation over StateMachine
- Use `Custom` computation to aggregate from related records reactively

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
1. **🔴 CRITICAL**: NO property has `computationDecision: "Transform"` - Transform is ONLY for Entity/Relation
2. Every entity with `isIntegrationEvent: true` has `computationDecision: "None"` or no computation
3. Every entity with `isAPICallEntity: true` has `computationDecision: "Transform"`
4. Every entity with `interactionDependencies` has appropriate computation:
   - If `canBeDeleted: true` with `hard-delete` → Must use Transform + HardDeletionProperty with StateMachine
   - If `canBeDeleted: false` → Can use Transform (unless `created-with-parent` or `integration-event`)
5. Entities/relations with `lifecycle.creation.type: "created-with-parent/entity"` use `_parent:[ParentName]`
6. Properties with `controlType: "creation-only"` or `"derived-with-parent"` have computation `_owner`
7. Properties with `controlType: "integration-result"` use `StateMachine` to observe API Call entities
8. Properties with `controlType: "independent"` are analyzed for appropriate computation
9. Properties with modifying `interactionDependencies` use StateMachine (if `controlType: "independent"`)
10. Properties that depend on Integration Events use StateMachine with event triggers (NOT Transform)
11. Properties with only `dataDependencies` use data-based computation (if `controlType: "independent"`)
12. All entities or relations with `canBeDeleted:true` and `hard-delete` use Transform + HardDeletionProperty
13. All dependencies are properly formatted with specific properties
14. `InteractionEventEntity` is included when interactions are dependencies
15. The parent name in `_parent:[ParentName]` matches `lifecycle.creation.parent`


## Implementation Checklist

- [ ] Read module name from `.currentmodule` file in project root
- [ ] Parse `requirements/{module}.data-design.json` completely
- [ ] Check for entities with `isIntegrationEvent: true` and set computation to "None"
- [ ] Check for entities with `isAPICallEntity: true` and set computation to "Transform"
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