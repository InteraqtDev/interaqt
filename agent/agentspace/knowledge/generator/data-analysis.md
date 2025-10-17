# Data Analysis Guide for interaqt Projects (v2)

## Overview

This guide explains how to analyze data requirements using the new requirement artifacts (`requirements/{module}.data-concepts.json`, `requirements/{module}.interactions-design.json`, and `requirements/{module}.integration.json`) to produce a comprehensive data design for interaqt implementations. The analysis leverages pre-extracted data concepts, interaction specifications, and external integration requirements to determine entity lifecycles, property dependencies, and computation methods.

**IMPORTANT**: Read the current module name from `.currentmodule` file in project root, and use it to construct the file paths. For example, if `.currentmodule` contains `user-management`, then the paths would be:
- `requirements/user-management.data-concepts.json`
- `requirements/user-management.interactions-design.json`
- `requirements/user-management.integration.json`

## Important Note on Interaction References

**CRITICAL**: Throughout this analysis process, always use **interaction names** (not interaction IDs) when referencing interactions. 

- ✅ Correct: `"creationInteractions": ["CreateUser", "AssignUserToBed"]`
- ❌ Incorrect: `"creationInteractions": ["I101", "I102"]`

This applies to all interaction-related fields including:
- `creationInteractions`
- `deletionInteractions` 
- `interactionDependencies`
- Any other references to interactions in the analysis output

## Input Artifacts

### 1. requirements/{module}.data-concepts.json
Contains pre-extracted data concepts:
- **Entities**: Core business objects with their properties
- **Relations**: Connections between entities 
- **Dictionaries**: Global data and system-wide configurations
- **Views**: Pre-defined data queries and filters

Note: Replace `{module}` with the value from `.currentmodule` file.

### 2. requirements/{module}.interactions-design.json
Contains interaction specifications showing:
- **Data operations**: What each interaction creates, reads, updates, or deletes
- **Data constraints**: How data is modified or created
- **Validation rules**: Business rules and constraints

Note: Replace `{module}` with the value from `.currentmodule` file.

### 3. requirements/{module}.integration.json
Contains external system integration requirements:
- **Integration flows**: Descriptions of interactions with external systems
- **Asynchronous operations**: Payment processing, AIGC generation, file storage, etc.
- **System boundaries**: What happens in current system vs external systems
- **Data flow**: How data moves between systems

Note: Replace `{module}` with the value from `.currentmodule` file. This file is used to identify integration event entities for tracking asynchronous external system responses.

## Analysis Process

### Step 1: Import Core Data Concepts

#### 1.1 Import Entities from requirements/{module}.data-concepts.json

First, read the module name from `.currentmodule` file in project root to get the current module name.

Then read the entities directly from `requirements/{module}.data-concepts.json`. Each entity already includes:
- Name and description
- Properties with types and purposes
- Computed property indicators
- Reference information

**No extraction needed** - the entities are already identified and structured.

#### 1.2 Import Dictionaries

Read dictionaries from `requirements/{module}.data-concepts.json`. These represent:
- System-wide configurations
- Global statistics 
- Shared validation rules
- Cross-entity aggregates

#### 1.3 Identify Integration Event Entities

Read integration requirements from `requirements/{module}.integration.json` (using the module name from `.currentmodule`).

**Identify Asynchronous External Calls:**
For each integration in the file, analyze whether it involves asynchronous responses:
- Webhook callbacks from external systems
- Polling-based status checks
- Delayed processing results (payment confirmations, AIGC generation results, etc.)

**Create Event Entities for Asynchronous Integrations:**
For each asynchronous integration identified, create a corresponding event entity following this pattern:

**Naming Convention:**
- `{IntegrationName}Event` (e.g., `PaymentEvent`, `AIGCEvent`, `FileUploadEvent`)
- Use the integration name from `requirements/{module}.integration.json`

**Event Entity Characteristics:**
- **Immutable**: Can only be created, never updated or deleted
- **Append-only**: New events are added to track state changes
- **Source of Truth**: Business data in the system should be computed based on these events

**Event Entity Properties:**
Based on the integration's `flow_description` and `current_system_data`, determine what properties the event should capture:
- External system's response data (transaction IDs, status codes, results)
- Timestamp of when the event was received
- Reference to related entities in current system (User.id, Order.id, etc.)
- Any relevant metadata from the external system

**Example:**
```json
// From requirements/{module}.integration.json:
{
  "id": "INT001",
  "name": "PaymentProcessing",
  "external_system": "Stripe",
  "flow_description": "...Stripe processes payment...returns payment result..."
}

// Generated Event Entity:
"PaymentEvent": {
  "purpose": "Records payment status updates received from Stripe",
  "isIntegrationEvent": true,
  "properties": {
    "transactionId": {
      "type": "string",
      "purpose": "External payment transaction ID from Stripe"
    },
    "eventType": {
      "type": "string",
      "purpose": "Type of External payment event type"
    },
    "paymentStatus": {
      "type": "string", 
      "purpose": "Status returned by Stripe (success, failed, pending)"
    },
    "amount": {
      "type": "number",
      "purpose": "Payment amount"
    },
    "timestamp": {
      "type": "date",
      "purpose": "When the payment result was received"
    },
    "userId": {
      "type": "string",
      "purpose": "Reference to User who initiated payment"
    },
    "orderId": {
      "type": "string",
      "purpose": "Reference to Order being paid for"
    }
  }
}
```

**Documentation:**
- Document the relationship between event entities and business entities
- Explain how business data should be computed from these events
- Note that other entities' properties may depend on these event entities

### Step 2: Analyze Entity Lifecycles Using Interactions

For **EACH entity** in `requirements/{module}.data-concepts.json`:

#### 2.1 Determine Creation Pattern

Analyze `requirements/{module}.interactions-design.json` (using the module name from `.currentmodule`) to identify how entities are created:

**Step A: Find Creation Interactions**
1. Search all interactions where the entity appears in `interactions.specification.data.creates`
2. For each creation interaction, capture:
   - Interaction name (not ID)
   - Description from the creates entry
   - Dependencies from the creates entry
3. Store as `creationInteractions` with detailed information for each interaction

**Step B: Determine Creation Type**
Analyze the creation pattern:

- **integration-event**: Entity is an event entity for external system integration
  - Identified in Step 1.3 from `requirements/{module}.integration.json`
  - Created when external system sends asynchronous responses (webhooks, callbacks)
  
- **interaction-created**: Entity is created independently by interactions
  - Entity appears alone in `data.creates` 
  - Or is the primary entity being created
  
- **created-with-parent**: Entity is created as part of another entity's creation
  - Multiple entities appear in same interaction's `data.creates`
  - Check `dataConstraints` for phrases like "automatically create", "create for each"
  - The parent is the primary entity, child entities are secondary
  
- **derived**: Entity is filtered/computed from other entities
  - No interactions directly create it
  - Views in `requirements/{module}.data-concepts.json` are typically derived
  
- **mutation-derived**: Entity is created from record mutation events
  - Not directly in any interaction's `data.creates`
  - Created by reactive computations (e.g., Transform) responding to other entities' creation/update/deletion
  - Check for descriptions mentioning "when X is created/updated/deleted, create Y"
  - Often used for audit logs, history tracking, or event-driven workflows

**Example Analysis**:
```json
// In interaction "CreateDormitory":
"data": {
  "creates": [
    {
      "target": "Dormitory",
      "description": "Create new dormitory with basic info",
      "dependencies": ["DormitoryValidation"]
    },
    {
      "target": "Bed", 
      "description": "Automatically create individual bed entities for each bed",
      "dependencies": ["Dormitory"]
    }
  ]
}
// Result: 
// Dormitory is interaction-created with creation details
// Bed is created-with-parent (parent: Dormitory) with creation details

// For mutation-derived entity (not in any interaction's creates):
// In requirements/{module}.data-concepts.json: "UserActivityLog: Records all user actions"
// In interactions: No interaction directly creates UserActivityLog
// In descriptions: "Activity logs are automatically created when users perform actions"
// Result: UserActivityLog is mutation-derived
```

#### 2.2 Determine Deletion Pattern

Search interactions for deletion operations:
1. Find interactions where entity appears in `data.deletes`
2. For each deletion interaction, capture:
   - Interaction name (not ID)
   - Description from the deletes entry
   - Dependencies from the deletes entry
3. Determine deletion type:
   - **hard-delete**: Entity removed from storage
   - **soft-delete**: Entity marked as deleted (status change)
   - **auto-delete**: Deleted when parent/dependency is deleted

### Step 3: Analyze Property Dependencies

For **EACH property** of every entity:

#### 3.1 Identify Data Dependencies

From `requirements/{module}.data-concepts.json`, check if property is marked as `computed`:
- If `computed: true`, examine the `computation` field
- List all entities/relations/properties mentioned in `computation.dependencies`
- These become the property's `dataDependencies`

**Important**: Consider if this property could be decomposed:
- Could parts of the computation be extracted as separate properties?
- Are there reusable metrics hidden in the computation?
- Would intermediate properties make the logic clearer?

#### 3.2 Identify Interaction Dependencies

Search `requirements/{module}.interactions-design.json` (using the module name from `.currentmodule`) to find which interactions modify this property:
1. Look for entity property in `data.updates` (e.g., "User.behaviorScore")
2. Look for entity in `data.creates` (properties set at creation)
3. List all matching interactions as `interactionDependencies` (use interaction **names**, not IDs)

#### 3.3 Determine Computation Method

Transform the computation description using semantic best practices:
- **Don't copy directly** from `requirements/{module}.data-concepts.json`
- Apply the "Best Practices for Computation Design" principles
- Use semantic computations (Count, Every, Any, Summation, etc.) where possible
- Decompose complex calculations into intermediate properties
- Make the computation intent clear and implementation-ready

#### 3.4 Determine Control Type

Based on the analysis:
- **creation-only**: Only set when entity is created (no updates found)
- **derived-with-parent**: Property of a derived entity
- **independent**: Has separate update logic (found in `data.updates`)

### Step 4: Analyze Relations

#### 4.1 Import Relation Structure

Read relations from `requirements/{module}.data-concepts.json` (using the module name from `.currentmodule`):
- Source and target entities
- Cardinality
- Relation properties

#### 4.2 Determine Relation Lifecycle

Similar to entities, analyze how relations are created:

**Find Creation Interactions**:
1. Search for relation name in `data.creates`
2. For each creation interaction, capture:
   - Interaction name (not ID)
   - Description from the creates entry
   - Dependencies from the creates entry
3. Analyze creation context

**Determine Creation Type - MANDATORY ALGORITHM**:

**🔴 CRITICAL: Follow this exact decision algorithm for EACH relation:**

```
FOR each Relation found in interaction's data.creates:

STEP 1: Check if relation NOT in any interaction's data.creates
  → IF TRUE: Type = "mutation-derived"
  → STOP

STEP 2: Check the SAME interaction's data.creates array
  → Find all Entities in the same creates array
  
STEP 3: Check relation's dependencies field
  → IF dependencies contains ANY Entity from STEP 2:
    → Type = "created-with-entity"
    → parent = that Entity name
    → STOP
    
STEP 4: Check description for keywords
  → IF description contains "newly created" OR "just created" OR "connecting to created":
    → Type = "created-with-entity"
    → parent = the Entity being referenced
    → STOP

STEP 5: Default case (relation only, no entity in same creates)
  → Type = "interaction-created"
  → parent = null
```

**Type Definitions**:
- **integration-event**: Relation created from external system events (rare, most integration events are entities)
  - Would be identified if a relation needs to track external system relationships
  - Immutable and append-only like integration-event entities
  
- **created-with-entity**: Relation created together with an entity in the SAME interaction
  - **Key signal**: Relation's dependencies include an Entity that is ALSO in the same `data.creates` array
  - **Key signal**: Description mentions "newly created" or "connecting to created" entity
  - The relation should be created automatically by the entity's Transform computation
  - Set `parent` to the entity name
  
- **interaction-created**: Relation created independently (no entity being created in same interaction)
  - **Key signal**: Relation is the ONLY item in `data.creates`, or
  - **Key signal**: All entities in dependencies already exist (not being created in same interaction)
  - The relation needs its own Transform computation
  
- **derived**: Computed from data conditions
  
- **mutation-derived**: Created from record mutation events
  - Not directly in any interaction's `data.creates`
  - Created by reactive computations responding to entity/relation changes
  - Common for maintaining referential integrity or creating audit trails

**Examples with Algorithm Applied**:

```json
// Example 1: interaction-created
// "AssignUserToBed": "data": { 
//   "creates": [{
//     "target": "UserBedAssignment",
//     "description": "Create assignment between user and bed",
//     "dependencies": ["User", "Bed", "AvailabilityCheck"]
//   }]
// }
// Analysis:
// - STEP 2: Same creates array has: [] (no entities)
// - STEP 3: Dependencies ["User", "Bed"] are NOT in creates array
// - STEP 5: Result = interaction-created

// Example 2: created-with-entity
// "CreatePost": "data": { 
//   "creates": [
//     {"target": "Post", "description": "Create new post", "dependencies": ["User"]},
//     {"target": "PostAuthorRelation", "description": "Link post to author", "dependencies": ["Post", "User"]}
//   ]
// }
// Analysis for PostAuthorRelation:
// - STEP 2: Same creates array has: ["Post"]
// - STEP 3: Dependencies contain "Post" which IS in creates array
// - Result = created-with-entity (parent: "Post")

// Example 3: created-with-entity (donate module case)
// "RechargeGifts": "data": { 
//   "creates": [
//     {"target": "RechargeRecord", "description": "Create new recharge record...", "dependencies": []},
//     {"target": "UserRechargeRelation", "description": "Create relation connecting current User to the newly created RechargeRecord", "dependencies": ["User", "RechargeRecord"]}
//   ]
// }
// Analysis for UserRechargeRelation:
// - STEP 2: Same creates array has: ["RechargeRecord"]
// - STEP 3: Dependencies contain "RechargeRecord" which IS in creates array
// - STEP 4: Description contains "newly created"
// - Result = created-with-entity (parent: "RechargeRecord")

// Example 4: mutation-derived
// UserFollowRelation not in any interaction's creates
// Description: "Automatically created when user likes multiple posts by same author"
// Analysis:
// - STEP 1: NOT in any creates array
// - Result = mutation-derived
```

### Step 5: Transform Dictionaries to Analysis Format

For each dictionary in `requirements/{module}.data-concepts.json` (using the module name from `.currentmodule`):

#### 5.1 Analyze Usage Patterns

Search interactions for dictionary usage:
1. Find where dictionary appears in `data.reads` (record interaction **names**, not IDs)
2. Find where dictionary values are used in conditions
3. Determine if values are static or computed

#### 5.2 Determine Dependencies

- **Data Dependencies**: If dictionary aggregates from entities
- **Interaction Dependencies**: If interactions update dictionary values (use interaction **names**, not IDs)
- **Computation Method**: How the value is calculated or maintained

## Best Practices for Computation Design

### Prioritize Semantic Computations

To ensure data clarity, follow these principles:

1. **Use System-Provided Semantic Computations First**
   - Prefer built-in computations over custom implementations:
     - `Count` - Count entities or relations
     - `Every` - Check if all items meet a condition
     - `Any` - Check if at least one item meets a condition
     - `Summation` - Sum numeric values across relations
     - `Average` - Calculate average of numeric values
     - `WeightedSummation` - Calculate weighted sum with custom weights
   - These provide better performance and clearer intent
   - Examples:
     - Use `Count` for counting relations instead of custom counter logic
     - Use `Every` for "all items meet condition" instead of custom validation
     - Use `Any` for "at least one item meets condition" instead of custom checks
     - Use `Summation` for totaling values (e.g., order totals, scores)
     - Use `Average` for calculating means (e.g., average rating, average price)
     - Use `WeightedSummation` for weighted calculations (e.g., GPA, weighted scores)

2. **Decompose Complex Calculations with Intermediate Data Concepts**
   - When custom calculations are necessary, identify reusable parts
   - Extract these parts as intermediate computed properties using semantic computations
   - Reference intermediate properties in final custom calculations
   - This approach:
     - Reduces complexity of custom logic
     - Improves reusability
     - Makes data dependencies clearer
     - Enables better optimization

### Example: Order Fulfillment Status

Instead of a complex custom calculation:

```json
// ❌ Complex custom calculation mixing multiple concerns
"fulfillmentStatus": {
  "type": "string",
  "purpose": "Overall order fulfillment status",
  "dataDependencies": ["OrderItemRelation", "Item.status", "Item.shippedDate"],
  "interactionDependencies": [],
  "computationMethod": "Custom: Loop through all items, check each status, count shipped, check dates, determine overall status"
}
```

Decompose into intermediate semantic computations:

```json
// ✅ Better: Use intermediate properties with semantic computations
"properties": {
  "totalItems": {
    "type": "number",
    "purpose": "Total number of items in order",
    "dataDependencies": ["OrderItemRelation"],
    "interactionDependencies": [],
    "computationMethod": "Count of OrderItemRelation"
  },
  "shippedItems": {
    "type": "number",
    "purpose": "Number of shipped items",
    "dataDependencies": ["OrderItemRelation", "Item.status"],
    "interactionDependencies": [],
    "computationMethod": "Count of OrderItemRelation where Item.status = 'shipped'"
  },
  "allItemsShipped": {
    "type": "boolean",
    "purpose": "Whether all items are shipped",
    "dataDependencies": ["OrderItemRelation", "Item.status"],
    "interactionDependencies": [],
    "computationMethod": "Every(item => item.status === 'shipped')"
  },
  "fulfillmentStatus": {
    "type": "string",
    "purpose": "Overall order fulfillment status",
    "dataDependencies": ["allItemsShipped", "shippedItems", "totalItems"],
    "interactionDependencies": [],
    "computationMethod": "Custom: if (allItemsShipped) return 'complete'; if (shippedItems > 0) return 'partial'; return 'pending'"
  }
}
```

### When to Create Intermediate Properties

Create intermediate computed properties when you find yourself:
- Counting or aggregating within custom logic
- Checking conditions across collections
- Repeatedly calculating the same sub-values
- Combining multiple data sources in complex ways

Remember: It's better to have several simple, semantic computations than one complex custom calculation.

## Output Generation

### Generate Analysis JSON

Transform the analyzed data into the standard output format:

```json
{
  "entities": {
    "[EntityName]": {
      "purpose": "[From requirements/{module}.data-concepts.json description]",
      "isIntegrationEvent": "[true if this is an integration event entity, false otherwise]",
      "dataDependencies": "[Dependencies identified in Step 2]",
      "computationMethod": "[Creation pattern description]",
      "lifecycle": {
        "creation": {
          "type": "[integration-event | interaction-created | derived | created-with-parent | mutation-derived]",
          "parent": "[Parent entity name if created-with-parent]",
          "creationInteractions": [
            {
              "name": "[Interaction name]",
              "description": "[Description from creates entry]",
              "dependencies": "[Dependencies from creates entry]"
            }
          ]
        },
        "deletion": {
          "canBeDeleted": "[true/false based on Step 2.2, always false for integration-event entities]",
          "deletionType": "[soft-delete | hard-delete | auto-delete | none for integration-event]",
          "deletionInteractions": [
            {
              "name": "[Interaction name]",
              "description": "[Description from deletes entry]",
              "dependencies": "[Dependencies from deletes entry]"
            }
          ]
        }
      },
      "properties": {
        "[propertyName]": {
          "type": "[From requirements/{module}.data-concepts.json]",
          "purpose": "[From requirements/{module}.data-concepts.json or inferred]",
          "controlType": "[From Step 3.4]",
          "dataDependencies": "[From Step 3.1]",
          "interactionDependencies": "[From Step 3.2]",
          "computationMethod": "[From Step 3.3]",
          "initialValue": "[Default or creation logic]"
        }
      }
    }
  },
  "relations": {
    "[RelationName]": {
      "type": "[From requirements/{module}.data-concepts.json cardinality]",
      "purpose": "[From requirements/{module}.data-concepts.json description]",
      "sourceEntity": "[From requirements/{module}.data-concepts.json]",
      "targetEntity": "[From requirements/{module}.data-concepts.json]",
      "sourceProperty": "[Inferred or specified]",
      "targetProperty": "[Inferred or specified]",
      "dataDependencies": "[Always includes source and target entities]",
      "computationMethod": "[From Step 4.2]",
      "lifecycle": {
        "creation": {
          "type": "[integration-event | interaction-created | created-with-entity | derived | mutation-derived]",
          "parent": "[If created-with-entity]",
          "creationInteractions": [
            {
              "name": "[Interaction name]",
              "description": "[Description from creates entry]",
              "dependencies": "[Dependencies from creates entry]"
            }
          ]
        },
        "deletion": {
          "canBeDeleted": "[Based on analysis]",
          "deletionType": "[Type identified]",
          "deletionInteractions": [
            {
              "name": "[Interaction name]",
              "description": "[Description from deletes entry]",
              "dependencies": "[Dependencies from deletes entry]"
            }
          ]
        }
      },
      "properties": {
        "[propertyName]": {
          // Same structure as entity properties
        }
      }
    }
  },
  "dictionaries": {
    "[DictionaryName]": {
      "purpose": "[From requirements/{module}.data-concepts.json description]",
      "type": "[object with key types]",
      "dataDependencies": "[From Step 5.2]",
      "interactionDependencies": "[From Step 5.2]",
      "computationMethod": "[From Step 5.2]"
    }
  }
}
```

## Best Practices for Analysis

### 1. Cross-Reference Data Operations

Always verify entity/property modifications by:
- Checking all interactions that mention the entity
- Looking for indirect updates through relations
- Identifying cascade effects in dataConstraints

### 2. Identify Computation Patterns

When analyzing computed properties:
- Look for standard patterns (Count, Sum, Average, etc.)
- Identify if computation can use built-in interaqt computations
- Document complex custom logic clearly

### 3. Track Dependency Chains

Ensure all dependencies are identified:
- Direct data dependencies from computation logic
- Indirect dependencies through relations
- Interaction chains that affect the data

### 4. Validate Lifecycle Consistency

Verify that:
- Creation patterns match the business logic
- Deletion handling preserves data integrity
- Parent-child relationships are properly maintained

## Common Analysis Patterns

### 1. Aggregation Properties
Properties that count or sum related data:
```json
"currentOccupancy": {
  "dataDependencies": ["Bed", "UserBedAssignment"],
  "computationMethod": "Count of occupied beds (Bed.isOccupied = true)"
}
```

### 2. Status-Driven Properties
Properties that change based on interactions:
```json
"status": {
  "interactionDependencies": ["CreateUser", "ActivateUser", "DeactivateUser"],
  "computationMethod": "Set by interactions, defaults to 'active' on creation"
}
```

### 3. Cascading Updates
Properties affected by multiple sources:
```json
"behaviorScore": {
  "dataDependencies": ["BehaviorViolation"],
  "interactionDependencies": ["ModifyBehaviorScore"],
  "computationMethod": "Base score minus sum of violations, can be overridden by admin"
}
```

### 4. Derived Entities
Entities filtered from base entities:
```json
"ActiveUser": {
  "computationMethod": "Derived from User where lastLoginDate > (now - 30 days)",
  "lifecycle": {
    "creation": {
      "type": "derived",
      "parent": null,
      "creationInteractions": []
    }
  }
}
```

### 5. Multiple Creation Interactions
Entity created by different interactions with different logic:
```json
"Style": {
  "lifecycle": {
    "creation": {
      "type": "interaction-created",
      "parent": null,
      "creationInteractions": [
        {
          "name": "CreateStyle",
          "description": "Create new Style entity with provided data, automatically setting status to 'draft', generating slug if not provided, and setting timestamps",
          "dependencies": ["SlugUniquenessCheck"]
        },
        {
          "name": "RestoreToVersion", 
          "description": "Recreate Style entities from version snapshot data",
          "dependencies": ["StyleVersion.snapshotData"]
        }
      ]
    }
  }
}
```

### 6. Integration Event Entity
Event entity for tracking asynchronous external system responses:
```json
"PaymentEvent": {
  "purpose": "Records payment status updates received from Stripe payment gateway",
  "isIntegrationEvent": true,
  "dataDependencies": [],
  "computationMethod": "Created when webhook receives payment status from Stripe",
  "lifecycle": {
    "creation": {
      "type": "integration-event",
      "parent": null,
      "creationInteractions": []
    },
    "deletion": {
      "canBeDeleted": false,
      "deletionType": "none",
      "deletionInteractions": []
    }
  },
  "properties": {
    "transactionId": {
      "type": "string",
      "purpose": "External payment transaction ID from Stripe",
      "controlType": "creation-only",
      "dataDependencies": [],
      "interactionDependencies": [],
      "computationMethod": "Set from Stripe webhook payload",
      "initialValue": "From external system response"
    },
    "paymentStatus": {
      "type": "string",
      "purpose": "Payment status (success, failed, pending)",
      "controlType": "creation-only",
      "dataDependencies": [],
      "interactionDependencies": [],
      "computationMethod": "Set from Stripe webhook payload",
      "initialValue": "From external system response"
    },
    "timestamp": {
      "type": "date",
      "purpose": "When the payment event was received",
      "controlType": "creation-only",
      "dataDependencies": [],
      "interactionDependencies": [],
      "computationMethod": "Current server timestamp when event is created",
      "initialValue": "now()"
    }
  }
}
```

Note: Other business entities (like `Order.paymentStatus`, `User.premiumUntil`) should be computed based on these event entities to maintain reactive consistency.

## Validation Checklist

- [ ] Read module name from `.currentmodule` file in project root
- [ ] All entities from `requirements/{module}.data-concepts.json` are analyzed
- [ ] All relations from `requirements/{module}.data-concepts.json` are analyzed
- [ ] All dictionaries from `requirements/{module}.data-concepts.json` are analyzed
- [ ] Integration event entities identified from `requirements/{module}.integration.json`
- [ ] Event entities properly marked with `isIntegrationEvent: true`
- [ ] Event entities have lifecycle.creation.type set to "integration-event"
- [ ] Event entities have deletion.canBeDeleted set to false
- [ ] Creation patterns identified for each entity/relation
- [ ] **🔴 CRITICAL: For EACH relation, executed the 5-step algorithm in Step 4.2 to determine lifecycle type**
- [ ] **🔴 CRITICAL: For relations with type "created-with-entity", verified parent field is set correctly**
- [ ] **🔴 CRITICAL: For relations in same creates array as entities, checked dependencies to identify created-with-entity pattern**
- [ ] Interaction dependencies found by searching `requirements/{module}.interactions-design.json`
- [ ] Data dependencies match computed property definitions
- [ ] Lifecycle patterns are consistent with business logic
- [ ] Parent-child relationships properly identified
- [ ] All properties have defined control types
- [ ] Computation methods clearly documented
