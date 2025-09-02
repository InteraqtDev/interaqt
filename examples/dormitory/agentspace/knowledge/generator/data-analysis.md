# Data Analysis Guide for interaqt Projects (v2)

## Overview

This guide explains how to analyze data requirements using the new requirement artifacts (`data-concepts.json` and `interactions-design.json`) to produce a comprehensive data design for interaqt implementations. The analysis leverages pre-extracted data concepts and interaction specifications to determine entity lifecycles, property dependencies, and computation methods.

## Input Artifacts

### 1. data-concepts.json
Contains pre-extracted data concepts:
- **Entities**: Core business objects with their properties
- **Relations**: Connections between entities 
- **Dictionaries**: Global data and system-wide configurations
- **Views**: Pre-defined data queries and filters

### 2. interactions-design.json
Contains interaction specifications showing:
- **Data operations**: What each interaction creates, reads, updates, or deletes
- **Data constraints**: How data is modified or created
- **Validation rules**: Business rules and constraints

## Analysis Process

### Step 1: Import Core Data Concepts

#### 1.1 Import Entities from data-concepts.json

Read the entities directly from `data-concepts.json`. Each entity already includes:
- Name and description
- Properties with types and purposes
- Computed property indicators
- Reference information

**No extraction needed** - the entities are already identified and structured.

#### 1.2 Import Dictionaries

Read dictionaries from `data-concepts.json`. These represent:
- System-wide configurations
- Global statistics 
- Shared validation rules
- Cross-entity aggregates

### Step 2: Analyze Entity Lifecycles Using Interactions

For **EACH entity** in data-concepts.json:

#### 2.1 Determine Creation Pattern

Analyze `interactions-design.json` to identify how entities are created:

**Step A: Find Creation Interactions**
1. Search all interactions where the entity appears in `data.creates`
2. List these as `creationInteractions`

**Step B: Determine Creation Type**
Analyze the creation pattern:

- **interaction-created**: Entity is created independently by interactions
  - Entity appears alone in `data.creates` 
  - Or is the primary entity being created
  
- **created-with-parent**: Entity is created as part of another entity's creation
  - Multiple entities appear in same interaction's `data.creates`
  - Check `dataConstraints` for phrases like "automatically create", "create for each"
  - The parent is the primary entity, child entities are secondary
  
- **derived**: Entity is filtered/computed from other entities
  - No interactions directly create it
  - Views in data-concepts.json are typically derived

**Example Analysis**:
```json
// In interaction I101 (CreateDormitory):
"data": {
  "creates": ["Dormitory", "Bed"]
},
"dataConstraints": [
  "Automatically create individual bed entities for each bed"
]
// Result: Dormitory is interaction-created, Bed is created-with-parent (parent: Dormitory)
```

#### 2.2 Determine Deletion Pattern

Search interactions for deletion operations:
1. Find interactions where entity appears in `data.deletes`
2. Determine deletion type:
   - **hard-delete**: Entity removed from storage
   - **soft-delete**: Entity marked as deleted (status change)
   - **auto-delete**: Deleted when parent/dependency is deleted

### Step 3: Analyze Property Dependencies

For **EACH property** of every entity:

#### 3.1 Identify Data Dependencies

From data-concepts.json, check if property is marked as `computed`:
- If `computed: true`, examine the `computation` field
- List all entities/relations/properties mentioned in `computation.dependencies`
- These become the property's `dataDependencies`

**Important**: Consider if this property could be decomposed:
- Could parts of the computation be extracted as separate properties?
- Are there reusable metrics hidden in the computation?
- Would intermediate properties make the logic clearer?

#### 3.2 Identify Interaction Dependencies

Search interactions-design.json to find which interactions modify this property:
1. Look for entity property in `data.updates` (e.g., "User.behaviorScore")
2. Look for entity in `data.creates` (properties set at creation)
3. List all matching interactions as `interactionDependencies`

#### 3.3 Determine Computation Method

Transform the computation description using semantic best practices:
- **Don't copy directly** from data-concepts.json
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

Read relations from data-concepts.json:
- Source and target entities
- Cardinality
- Relation properties

#### 4.2 Determine Relation Lifecycle

Similar to entities, analyze how relations are created:

**Find Creation Interactions**:
1. Search for relation name in `data.creates`
2. Analyze creation context

**Determine Creation Type**:
- **interaction-created**: Relation created independently
- **created-with-entity**: Created when source/target entity is created
- **derived**: Computed from data conditions

**Example**:
```json
// UserBedAssignment appears in:
// I102: "data": { "creates": ["UserBedAssignment"] }
// Result: interaction-created

// If it appeared with entity creation:
// "data": { "creates": ["Post", "PostAuthorRelation"] }
// Result: PostAuthorRelation is created-with-entity (Post)
```

### Step 5: Transform Dictionaries to Analysis Format

For each dictionary in data-concepts.json:

#### 5.1 Analyze Usage Patterns

Search interactions for dictionary usage:
1. Find where dictionary appears in `data.reads`
2. Find where dictionary values are used in conditions
3. Determine if values are static or computed

#### 5.2 Determine Dependencies

- **Data Dependencies**: If dictionary aggregates from entities
- **Interaction Dependencies**: If interactions update dictionary values
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

### Benefits of This Approach

1. **Clarity**: Each property has a single, clear purpose
2. **Reusability**: Intermediate properties can be used by multiple consumers
3. **Performance**: System can optimize semantic computations
4. **Maintainability**: Changes to business logic are localized
5. **Testability**: Each computation can be validated independently

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
      "purpose": "[From data-concepts.json description]",
      "dataDependencies": "[Dependencies identified in Step 2]",
      "computationMethod": "[Creation pattern description]",
      "lifecycle": {
        "creation": {
          "type": "[interaction-created | derived | created-with-parent]",
          "parent": "[Parent entity name if created-with-parent]",
          "creationInteractions": "[List from Step 2.1]"
        },
        "deletion": {
          "canBeDeleted": "[true/false based on Step 2.2]",
          "deletionType": "[soft-delete | hard-delete | auto-delete]",
          "deletionInteractions": "[List from Step 2.2]"
        }
      },
      "properties": {
        "[propertyName]": {
          "type": "[From data-concepts.json]",
          "purpose": "[From data-concepts.json or inferred]",
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
      "type": "[From data-concepts.json cardinality]",
      "purpose": "[From data-concepts.json description]",
      "sourceEntity": "[From data-concepts.json]",
      "targetEntity": "[From data-concepts.json]",
      "sourceProperty": "[Inferred or specified]",
      "targetProperty": "[Inferred or specified]",
      "dataDependencies": "[Always includes source and target entities]",
      "computationMethod": "[From Step 4.2]",
      "lifecycle": {
        "creation": {
          "type": "[From Step 4.2]",
          "parent": "[If created-with-entity]",
          "creationInteractions": "[From Step 4.2]"
        },
        "deletion": {
          "canBeDeleted": "[Based on analysis]",
          "deletionType": "[Type identified]",
          "deletionInteractions": "[List of interactions]"
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
      "purpose": "[From data-concepts.json description]",
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

## Validation Checklist

- [ ] All entities from data-concepts.json are analyzed
- [ ] All relations from data-concepts.json are analyzed
- [ ] All dictionaries from data-concepts.json are analyzed
- [ ] Creation patterns identified for each entity/relation
- [ ] Interaction dependencies found by searching interactions-design.json
- [ ] Data dependencies match computed property definitions
- [ ] Lifecycle patterns are consistent with business logic
- [ ] Parent-child relationships properly identified
- [ ] All properties have defined control types
- [ ] Computation methods clearly documented
