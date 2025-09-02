# Data Analysis Guide for interaqt Projects

## Analysis Process

### Step 1: Extract Core Business Objects

#### 1.1 Identify Entities from Use Cases

**Extract nouns** as potential entities from requirements:
- "User creates style" → User, Style
- "Admin publishes version" → User (with admin role), Version
- "Style has versions" → Style, Version

**Key Questions:**
- What are the main business objects?
- What needs to be tracked and persisted?
- What has a unique identity and lifecycle?

#### 1.2 Entity Lifecycle Analysis

For **EACH entity**, determine its lifecycle pattern:

**Creation Patterns**:
Identify how the entity comes into existence:
- **interaction-created**: Created independently by specific interactions
- **derived**: Automatically derived from other data (follows source data lifecycle)
- **created-with-parent**: Created together with another entity (e.g., audit log with transaction)

**For interaction-created entities**:
- List all interactions that can create this entity in `lifecycle.creation.creationInteractions`
- Document any prerequisites in `dataDependencies` (entities that must exist first)
- Describe creation logic in `computationMethod`

**For derived entities**:
- List source data in `dataDependencies`
- Leave `lifecycle.creation.creationInteractions` empty or minimal
- Describe derivation rules in `computationMethod`
- These entities appear/disappear automatically with their source data

**For created-with-parent entities**:
- List parent entity in `dataDependencies`
- Include parent's creation interactions in `lifecycle.creation.creationInteractions`
- **CRITICAL**: The creation logic is NOT in this entity's own computation, but in the parent entity's computation
- Must clearly state in `computationMethod`: "Created by [ParentEntity]'s computation when [condition]"
- Example: AuditLog's `computationMethod` should be "Created by Transaction's computation when Transaction is created or updated"

**Deletion Patterns**:
Only relevant for interaction-created entities:
- **Can be deleted**: true/false
- **Deletion type**: 
  - `soft-delete`: Entity marked as deleted but preserved in storage
  - `hard-delete`: Entity completely removed from storage
  - `auto-delete`: Automatically deleted when parent/dependency is deleted
- **Deletion interactions**: List interactions that trigger deletion

**🔴 IMPORTANT: Updates Analysis at Property Level**
Entity updates should NOT be analyzed at the entity level. Instead, analyze updates for each individual property in the Property Analysis section. This granular approach provides clearer understanding of data flow and enables precise computation selection.

#### 1.3 Identify Global Data (Dictionaries)

**Look for system-wide data that:**
- Doesn't belong to any specific entity instance
- Represents global statistics or aggregates
- Tracks system-wide settings or configurations
- Examples: total user count, system status, global configurations

**Dictionary Criteria:**
- Data that spans across all instances
- System-level metrics and counters
- Global lookup tables or mappings
- Shared configuration values

**Dictionary Analysis:**
For each dictionary, analyze using the same pattern as entity properties:
- **Data Dependencies**: List entities or relations it aggregates from (as string array)
- **Interaction Dependencies**: List interactions that directly modify it (as string array)
- **Computation Method**: Describe in one place how it's calculated or updated
- **Type**: The data type stored (number, string, object, etc.)
- **Purpose**: What global data this tracks

Dictionaries follow the same dependency pattern as properties:
- Can be purely computed from entity/relation data
- Can be purely interaction-driven (manual counters)
- Can be mixed (computed but overridable)

### Step 2: Property Analysis

**🔴 CRITICAL PRINCIPLE: Analyze Updates at Property Level**
All update behaviors MUST be analyzed at the individual property level, NOT at the entity or relation level. This means:
- Document which interactions can modify each specific property
- Specify update constraints for each property individually
- Identify whether each property is mutable or immutable
- Track dependencies separately for each property

This granular approach is essential because:
- Different properties have different mutability rules
- A single interaction may update some properties but not others
- Each property may have unique validation rules
- This precision enables optimal computation selection

For **EACH property** of every entity, analyze:

#### 2.1 Basic Property Information
- **Name**: Property identifier
- **Type**: string, number, boolean, object, or collection
- **Purpose**: Business meaning and usage
- **Required**: Is this property mandatory?

#### 2.2 Data Source Analysis

Analyze the source of data for each property by identifying dependencies:

**Data Dependencies** (for computed properties):
- List all data sources this property depends on as a simple string array
- Include other properties in the same entity, properties from related entities, or global data from dictionaries
- Just list the names, don't describe how they're used

**Interaction Dependencies** (for event-driven properties):
- List all interactions that can modify this property as a simple string array
- Include interactions that set the initial value and those that update it later
- Just list the interaction names

**Computation Method**:
- Describe in one place how the property is computed or modified
- For computed properties: explain the calculation logic (e.g., "Count of UserPostRelation where target = this user")
- For interaction-driven properties: explain how interactions change the value (e.g., "Direct assignment from CreateUser and UpdateUserProfile")
- For mixed dependencies: explain both the computation and how interactions can override it

**Key Questions**:
- Is this property computed from other data (data dependency)?
- Is this property modified by interactions (interaction dependency)?
- What is the initial value or creation logic?

**Note**: Some properties may have both types of dependencies. For example, a property might be computed from other data but can also be overridden by specific interactions. Document both arrays and explain the combined behavior in the computationMethod field.

#### 2.3 Property Control Type

Determine how each property's value is controlled:

**Control Types**:
- **creation-only**: Set during entity/relation creation and never modified separately
  - Examples: creation timestamps, immutable IDs, business constants
  - These don't need separate computation control
  - Logic is embedded in the entity/relation creation process
  
- **derived-with-parent**: Property belongs to a derived entity/relation and is computed as part of the parent's overall derivation
  - Maintains strong consistency with parent computation
  - Cannot be modified independently of parent's computation rules
  - Examples: all properties of a filtered/derived entity
  
- **independent**: Requires separate computation control
  - Can be modified after creation
  - Has its own update logic separate from entity/relation creation
  - Examples: status fields, counters, mutable business data

**Key Questions**:
- Is this property only set at creation and never changed?
- Is this property part of a derived entity/relation's computation?
- Does this property need independent update control?

### Step 3: Relation Analysis

#### 3.1 Identify Relations from Interactions

**Analyze verb phrases** to find relationships:
- "User creates Style" → UserStyleRelation (n:1)
- "Style has Versions" → StyleVersionRelation (1:n)
- "User publishes Version" → UserVersionRelation (n:1)

#### 3.2 Relation Lifecycle Analysis

For **EACH relation**, determine its lifecycle pattern:

**Creation Patterns**:
Relations follow similar patterns to entities:
- **interaction-created**: Created independently by specific interactions (e.g., "Follow" relation)
- **derived**: Automatically derived from conditions (e.g., "Manager" relation from org hierarchy)
- **created-with-entity**: Created when source or target entity is created (e.g., author relation with post)

**Dependencies**:
- **dataDependencies**: Always includes source and target entities, plus any other required data
- **lifecycle.creation.creationInteractions**: Interactions that create this relation
- **computationMethod**: Describes how and when the relation is established

**Deletion Patterns**:
- **Can be deleted**: true/false
- **Deletion type**:
  - `hard-delete`: Relation removed from storage
  - `auto-delete`: Automatically deleted when source or target entity is deleted
  - `soft-delete`: Rarely used for relations
- **Deletion interactions**: List interactions that remove the relation

**Examples**:
- **UserFollowRelation**: interaction-created by Follow/Unfollow interactions
- **PostAuthorRelation**: created-with-entity when Post is created
- **ManagerEmployeeRelation**: derived from User.managerId field

**🔴 IMPORTANT: Updates Analysis at Property Level**
Relation updates should NOT be analyzed at the relation level. Analyze updates for each individual relation property separately. This granular approach enables better computation selection and clearer dependency tracking.

#### 3.3 Relation Properties

Analyze properties that belong to the relation itself:
- Timestamps (createdAt, updatedAt)
- Status or state information
- Metadata about the relationship

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
  "totalValue": {
    "type": "number",
    "purpose": "Total value of all items",
    "dataDependencies": ["OrderItemRelation.item.price", "OrderItemRelation.quantity"],
    "interactionDependencies": [],
    "computationMethod": "Summation of (item.price * quantity) across all OrderItemRelation"
  },
  "averageItemPrice": {
    "type": "number",
    "purpose": "Average price per item type",
    "dataDependencies": ["OrderItemRelation.item.price"],
    "interactionDependencies": [],
    "computationMethod": "Average of item.price across all OrderItemRelation"
  },
  "allItemsShipped": {
    "type": "boolean",
    "purpose": "Whether all items are shipped",
    "dataDependencies": ["OrderItemRelation", "Item.status"],
    "interactionDependencies": [],
    "computationMethod": "Every(item => item.status === 'shipped')"
  },
  "hasDelayedItems": {
    "type": "boolean",
    "purpose": "Whether any items are delayed",
    "dataDependencies": ["OrderItemRelation", "Item.expectedDate", "Item.status"],
    "interactionDependencies": [],
    "computationMethod": "Any(item => item.expectedDate < now && item.status !== 'delivered')"
  },
  "fulfillmentStatus": {
    "type": "string",
    "purpose": "Overall order fulfillment status",
    "dataDependencies": ["allItemsShipped", "hasDelayedItems", "shippedItems", "totalItems"],
    "interactionDependencies": [],
    "computationMethod": "Custom: if (allItemsShipped) return 'complete'; if (hasDelayedItems) return 'delayed'; if (shippedItems > 0) return 'partial'; return 'pending'"
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

### Additional Example: Student GPA Calculation

Using `WeightedSummation` for weighted calculations:

```json
"properties": {
  "totalCredits": {
    "type": "number",
    "purpose": "Total credit hours",
    "dataDependencies": ["StudentCourseRelation.course.credits"],
    "interactionDependencies": [],
    "computationMethod": "Summation of course.credits across all StudentCourseRelation"
  },
  "totalGradePoints": {
    "type": "number",
    "purpose": "Total grade points (grade * credits)",
    "dataDependencies": ["StudentCourseRelation.grade", "StudentCourseRelation.course.credits"],
    "interactionDependencies": [],
    "computationMethod": "WeightedSummation(grade, course.credits) across all StudentCourseRelation"
  },
  "gpa": {
    "type": "number",
    "purpose": "Grade Point Average",
    "dataDependencies": ["totalGradePoints", "totalCredits"],
    "interactionDependencies": [],
    "computationMethod": "Custom: totalGradePoints / totalCredits"
  }
}
```

This example shows how `WeightedSummation` simplifies weighted calculations that would otherwise require complex custom logic.

## Analysis Documentation Template

Use this JSON template to document your analysis results.

**Key Principles of the Simplified Structure**:
1. **All dependencies are string arrays**: List names only, describe usage in `computationMethod`
2. **Lifecycle is structured**: Creation is an object with `type` (interaction-created, derived, or created-with-parent/entity), `parent` (entity name when type is created-with-*), and `creationInteractions` (list of interactions that create the entity/relation)
3. **Updates are property-level**: Never analyze updates at entity/relation level
4. **Creation patterns are clear**: interaction-created, derived, or created-with-parent/entity
5. **Deletion is straightforward**: Can delete? Type? Which interactions?

```json
{
  "entities": {
    "[entityName]": {
      "purpose": "[Business purpose and meaning]",
      "dataDependencies": ["dependency1", "dependency2"],
      "computationMethod": "[How this entity is created: 'interaction-created' | 'derived from X' | 'created with parent entity Y']",
      "lifecycle": {
        "creation": {
          "type": "[interaction-created | derived | created-with-parent]",
          "parent": "[ParentEntityName if type is created-with-parent, null otherwise]",
          "creationInteractions": ["interaction1", "interaction2"]
        },
        "deletion": {
          "canBeDeleted": true,
          "deletionType": "[soft-delete | hard-delete]",
          "deletionInteractions": ["DeleteEntity", "PurgeEntity"]
        }
      },
      "properties": {
        "id": {
          "type": "string",
          "purpose": "System-generated unique identifier",
          "controlType": "creation-only",
          "dataDependencies": null,
          "interactionDependencies": null,
          "initialValue": "auto-generated"
        },
        "[propertyName]": {
          "type": "[string/number/boolean/object]",
          "purpose": "[What this property represents]",
          "controlType": "[creation-only | derived-with-parent | independent]",
          "dataDependencies": ["dependency1", "dependency2"],
          "interactionDependencies": ["interaction1", "interaction2"],
          "computationMethod": "[how this property is computed from data dependencies OR how interactions modify it]",
          "initialValue": "[default or creation logic]"
        }
      }
    }

    "user": {
      "purpose": "System users with different roles",
      "dataDependencies": [],
      "computationMethod": "Independently created by CreateUser, BulkImportUsers, or RegisterUser interactions",
      "lifecycle": {
        "creation": {
          "type": "interaction-created",
          "parent": null,
          "creationInteractions": ["CreateUser", "BulkImportUsers", "RegisterUser"]
        },
        "deletion": {
          "canBeDeleted": true,
          "deletionType": "soft-delete",
          "deletionInteractions": ["DeleteUser", "BanUser"]
        }
      },
      "properties": {
        "id": {
          "type": "string",
          "purpose": "System-generated unique identifier",
          "controlType": "creation-only",
          "dataDependencies": null,
          "interactionDependencies": null,
          "initialValue": "auto-generated"
        },
        "name": {
          "type": "string",
          "purpose": "User's display name",
          "controlType": "independent",
          "dataDependencies": [],
          "interactionDependencies": ["CreateUser", "UpdateUserProfile"],
          "computationMethod": "Direct assignment from interactions",
          "initialValue": "Required at creation"
        },
        "email": {
          "type": "string",
          "purpose": "Unique identifier and contact",
          "controlType": "creation-only",
          "dataDependencies": [],
          "interactionDependencies": ["CreateUser"],
          "computationMethod": "Set once at creation, immutable thereafter",
          "initialValue": "Required at creation"
        },
        "postCount": {
          "type": "number",
          "purpose": "Total posts created by user",
          "controlType": "independent",
          "dataDependencies": ["UserPostRelation"],
          "interactionDependencies": [],
          "computationMethod": "Count of UserPostRelation where target = this user",
          "initialValue": 0
        },
        "status": {
          "type": "string",
          "purpose": "User account status (example of mixed dependencies)",
          "controlType": "independent",
          "dataDependencies": ["lastLoginDate"],
          "interactionDependencies": ["CreateUser", "ActivateUser", "DeactivateUser", "BanUser"],
          "computationMethod": "Set to 'inactive' if lastLoginDate > 90 days ago, but can be overridden by direct interaction updates",
          "initialValue": "active"
        }
      }
    }
  },

  "relations": {
    "[relationName]": {
      "type": "[1:1/1:n/n:1/n:n]",
      "purpose": "[Business meaning of the relationship]",
      "sourceEntity": "[EntityName]",
      "targetEntity": "[EntityName]",
      "sourceProperty": "[property name on source entity]",
      "targetProperty": "[property name on target entity]",
      "dataDependencies": ["sourceEntity", "targetEntity"],
      "computationMethod": "[How this relation is created: 'interaction-created' | 'derived from conditions' | 'created with entity X']",
      "lifecycle": {
        "creation": {
          "type": "[interaction-created | derived | created-with-entity]",
          "parent": "[ParentEntityName if type is created-with-entity, null otherwise]",
          "creationInteractions": ["interaction1", "interaction2"]
        },
        "deletion": {
          "canBeDeleted": true,
          "deletionType": "[soft-delete | hard-delete | auto-delete]",
          "deletionInteractions": ["DeleteRelation", "UnlinkEntities"]
        }
      },
      "properties": {
        "[propertyName]": {
          "type": "[string/number/boolean]",
          "purpose": "[meaning in the relationship context]",
          "controlType": "[creation-only | derived-with-parent | independent]",
          "dataDependencies": ["dependency1", "dependency2"],
          "interactionDependencies": ["interaction1", "interaction2"],
          "computationMethod": "[how this property is computed from data dependencies OR how interactions modify it]",
          "initialValue": "[default or creation logic]"
        }
      }
    },

    "userPostRelation": {
      "type": "n:1",
      "purpose": "Links posts to their authors",
      "sourceEntity": "Post",
      "targetEntity": "User",
      "sourceProperty": "author",
      "targetProperty": "posts",
      "dataDependencies": ["Post", "User"],
      "computationMethod": "Created together with Post entity by CreatePost or ImportPost interactions",
      "lifecycle": {
        "creation": {
          "type": "created-with-entity",
          "parent": "Post",
          "creationInteractions": ["CreatePost", "ImportPost"]
        },
        "deletion": {
          "canBeDeleted": true,
          "deletionType": "auto-delete",
          "deletionInteractions": ["DeletePost", "PurgeUserContent"]
        }
      },
      "properties": {
        "createdAt": {
          "type": "number",
          "purpose": "Timestamp of post creation",
          "controlType": "creation-only",
          "dataDependencies": [],
          "interactionDependencies": ["CreatePost"],
          "computationMethod": "Set to current timestamp when CreatePost creates the relation",
          "initialValue": "Current timestamp at creation"
        }
      }
    },

    "dormitoryAssignmentRelation": {
      "type": "n:1",
      "purpose": "Assigns students to dormitory rooms",
      "sourceEntity": "User",
      "targetEntity": "Dormitory",
      "sourceProperty": "dormitory",
      "targetProperty": "residents",
      "dataDependencies": ["User", "Dormitory"],
      "computationMethod": "Independently created by AssignDormitory or BulkAssignStudents when User.role='student' and Dormitory has capacity",
      "lifecycle": {
        "creation": {
          "type": "interaction-created",
          "parent": null,
          "creationInteractions": ["AssignDormitory", "BulkAssignStudents"]
        },
        "deletion": {
          "canBeDeleted": true,
          "deletionType": "hard-delete",
          "deletionInteractions": ["UnassignDormitory", "GraduateStudent", "TransferDormitory"]
        }
      },
      "properties": {
        "assignedAt": {
          "type": "number",
          "purpose": "Timestamp of assignment",
          "controlType": "creation-only",
          "dataDependencies": [],
          "interactionDependencies": ["AssignDormitory"],
          "computationMethod": "Set to current timestamp when AssignDormitory creates the relation",
          "initialValue": "Current timestamp"
        },
        "status": {
          "type": "string",
          "purpose": "Assignment status",
          "controlType": "independent",
          "dataDependencies": ["User.enrollmentStatus"],
          "interactionDependencies": ["CheckInStudent", "CheckOutStudent"],
          "computationMethod": "Set to 'inactive' if User.enrollmentStatus is not 'enrolled', can be directly set to 'checked-in' or 'checked-out' by interactions",
          "initialValue": "pending"
        }
      }
    },
    
    "activeUser": {
      "purpose": "Users who have logged in within last 30 days (example of derived entity)",
      "dataDependencies": ["User", "User.lastLoginDate"],
      "computationMethod": "Derived from User where lastLoginDate > (now - 30 days)",
      "lifecycle": {
        "creation": {
          "type": "derived",
          "parent": null,
          "creationInteractions": []
        },
        "deletion": {
          "canBeDeleted": false,
          "deletionType": "auto-delete",
          "deletionInteractions": []
        }
      },
      "properties": {
        "id": {
          "type": "string",
          "purpose": "User's ID (inherited)",
          "controlType": "derived-with-parent",
          "dataDependencies": ["User.id"],
          "interactionDependencies": [],
          "computationMethod": "Inherited from User entity during derivation",
          "initialValue": "from User"
        },
        "name": {
          "type": "string",
          "purpose": "User's name (inherited)",
          "controlType": "derived-with-parent",
          "dataDependencies": ["User.name"],
          "interactionDependencies": [],
          "computationMethod": "Inherited from User entity during derivation",
          "initialValue": "from User"
        },
        "lastLoginDate": {
          "type": "number",
          "purpose": "Last login timestamp (inherited)",
          "controlType": "derived-with-parent",
          "dataDependencies": ["User.lastLoginDate"],
          "interactionDependencies": [],
          "computationMethod": "Inherited from User entity during derivation",
          "initialValue": "from User"
        }
      }
    },
    
    "auditLog": {
      "purpose": "Audit trail for important operations (example of created-with-parent)",
      "dataDependencies": ["Transaction"],
      "computationMethod": "Created by Transaction's computation when Transaction is created or updated (NOT by AuditLog's own computation)",
      "lifecycle": {
        "creation": {
          "type": "created-with-parent",
          "parent": "Transaction",
          "creationInteractions": ["CreateTransaction", "UpdateTransaction"]
        },
        "deletion": {
          "canBeDeleted": false,
          "deletionType": "none",
          "deletionInteractions": []
        }
      },
      "properties": {
        "action": {
          "type": "string",
          "purpose": "The action performed",
          "controlType": "creation-only",
          "dataDependencies": [],
          "interactionDependencies": ["CreateTransaction", "UpdateTransaction"],
          "computationMethod": "Set based on the triggering interaction type",
          "initialValue": "Required at creation"
        }
      }
    }
  },
  "dictionaries": {
    "[dictionaryName]": {
      "purpose": "[What global data this tracks]",
      "type": "[data type stored]",
      "dataDependencies": ["dependency1", "dependency2"],
      "interactionDependencies": ["interaction1", "interaction2"],
      "computationMethod": "[how this dictionary value is computed from data OR modified by interactions]"
    },
    "systemUserCount": {
      "purpose": "Track total number of users in the system",
      "type": "number",
      "dataDependencies": [],
      "interactionDependencies": ["CreateUser", "DeleteUser", "BulkImportUsers"],
      "computationMethod": "Incremented by 1 on CreateUser, decremented by 1 on DeleteUser, incremented by import count on BulkImportUsers"
    },
    "totalRevenue": {
      "purpose": "Total revenue across all orders",
      "type": "number",
      "dataDependencies": ["Order.totalAmount"],
      "interactionDependencies": [],
      "computationMethod": "Summation of Order.totalAmount where Order.status = 'completed'"
    }
  }
}
```



## Common Patterns to Look For

1. **Counters and Aggregations**
   - User post counts, comment counts
   - Category item counts
   - Total system metrics

2. **Status/State Tracking**
   - Draft → Published → Archived workflows
   - Active/Inactive states
   - Multi-step approval processes

3. **Temporal Data**
   - Creation/modification timestamps
   - Scheduled events
   - Time-based state changes

4. **Hierarchical Relationships**
   - Parent-child structures
   - Category trees
   - Organizational hierarchies

5. **Many-to-Many Relationships**
   - User-Role assignments
   - Tag associations
   - Group memberships

## Validation Checklist

- [ ] Every entity has documented data dependencies and creation interactions in lifecycle.creation.creationInteractions
- [ ] Every relation has documented data dependencies and creation interactions in lifecycle.creation.creationInteractions
- [ ] Every entity property has clear dependency documentation
- [ ] All computed properties list complete data dependencies with computation methods
- [ ] Event-driven properties specify all interaction dependencies with change patterns
- [ ] Entity lifecycle constraints are clearly specified
- [ ] Relation lifecycle constraints are clearly specified
- [ ] Relations document complete lifecycle (create/update/delete)
- [ ] Dictionaries are identified for global data
- [ ] No circular dependencies without resolution strategy

```
