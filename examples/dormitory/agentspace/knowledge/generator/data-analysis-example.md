# Data Analysis Example: Dormitory System

This example demonstrates how to use the new data analysis process with the dormitory system's requirement artifacts.

## Example 1: Analyzing the Bed Entity

### Step 1: Import from data-concepts.json
```json
{
  "name": "Bed",
  "description": "Individual bed spaces within dormitories",
  "properties": [
    {
      "name": "number",
      "type": "string",
      "required": true,
      "computed": false
    },
    {
      "name": "isOccupied",
      "type": "boolean",
      "required": true,
      "computed": true,
      "computation": {
        "method": "existence_check",
        "description": "True if there is an active UserBedAssignment for this bed",
        "dependencies": ["UserBedAssignment"]
      }
    }
  ]
}
```

### Step 2: Analyze Creation Pattern from interactions-design.json

Search for "Bed" in all interactions' `data.creates`:

**Found in I101 (CreateDormitory)**:
```json
{
  "name": "CreateDormitory",
  "data": {
    "creates": ["Dormitory", "Bed"]
  },
  "dataConstraints": [
    "Automatically create individual bed entities for each bed",
    "Generate unique bed numbers within dormitory"
  ]
}
```

**Analysis**: 
- Bed is created together with Dormitory
- dataConstraints confirm automatic creation
- **Result**: created-with-parent (parent: Dormitory)

### Step 3: Analyze Property Dependencies

**For property "isOccupied"**:
1. **Data Dependencies**: From computation.dependencies = ["UserBedAssignment"]
2. **Interaction Dependencies**: 
   - Search for "Bed.isOccupied" in data.updates
   - Found in I102 (AssignUserToBed): updates "Bed.isOccupied"
   - Found in I103 (RemoveUserFromDormitory): updates "Bed.isOccupied"
3. **Computation Method**: 
   - Original from data-concepts: "True if there is an active UserBedAssignment for this bed"
   - **Apply Best Practices**: Transform to semantic computation
   - Result: "Any(UserBedAssignment where target = this bed and status = 'active')"
   - Note: Although interactions update it, the computation provides the canonical value
4. **Control Type**: independent (has separate update logic)

### Step 4: Generate Output
```json
"Bed": {
  "purpose": "Individual bed spaces within dormitories",
  "dataDependencies": ["Dormitory"],
  "computationMethod": "Created automatically when Dormitory is created, one Bed entity per bed count specified",
  "lifecycle": {
    "creation": {
      "type": "created-with-parent",
      "parent": "Dormitory",
      "creationInteractions": ["CreateDormitory"]
    },
    "deletion": {
      "canBeDeleted": false,
      "deletionType": "auto-delete",
      "deletionInteractions": []
    }
  },
  "properties": {
    "number": {
      "type": "string",
      "purpose": "Unique bed identifier within dormitory",
      "controlType": "creation-only",
      "dataDependencies": [],
      "interactionDependencies": ["CreateDormitory"],
      "computationMethod": "Generated sequentially when CreateDormitory creates beds",
      "initialValue": "Auto-generated (e.g., '001', '002')"
    },
    "isOccupied": {
      "type": "boolean",
      "purpose": "Whether bed is currently assigned",
      "controlType": "independent",
      "dataDependencies": ["UserBedAssignment"],
      "interactionDependencies": ["AssignUserToBed", "RemoveUserFromDormitory"],
      "computationMethod": "Any(UserBedAssignment where target = this bed and status = 'active')",
      "initialValue": false
    }
  }
}
```

## Example 2: Analyzing UserBedAssignment Relation

### Step 1: Import from data-concepts.json
```json
{
  "name": "UserBedAssignment",
  "from": "User",
  "to": "Bed",
  "cardinality": "many-to-one",
  "properties": [
    {
      "name": "assignmentDate",
      "type": "date",
      "required": true
    },
    {
      "name": "status",
      "type": "string",
      "required": true
    }
  ]
}
```

### Step 2: Analyze Creation Pattern

Search for "UserBedAssignment" in data.creates:
- Found in I102 (AssignUserToBed): creates ["UserBedAssignment"]
- Not created with any entity

**Result**: interaction-created

### Step 3: Analyze Deletion Pattern

Search for "UserBedAssignment" in data.deletes:
- Found in I103 (RemoveUserFromDormitory): deletes ["UserBedAssignment"]

**Result**: Can be deleted, hard-delete type

### Step 4: Generate Output
```json
"UserBedAssignment": {
  "type": "n:1",
  "purpose": "Links users to their assigned beds",
  "sourceEntity": "User",
  "targetEntity": "Bed",
  "sourceProperty": "bed",
  "targetProperty": "occupant",
  "dataDependencies": ["User", "Bed"],
  "computationMethod": "Independently created by AssignUserToBed interaction when administrator assigns a user to an available bed",
  "lifecycle": {
    "creation": {
      "type": "interaction-created",
      "parent": null,
      "creationInteractions": ["AssignUserToBed"]
    },
    "deletion": {
      "canBeDeleted": true,
      "deletionType": "hard-delete",
      "deletionInteractions": ["RemoveUserFromDormitory"]
    }
  },
  "properties": {
    "assignmentDate": {
      "type": "date",
      "purpose": "When the assignment was made",
      "controlType": "creation-only",
      "dataDependencies": [],
      "interactionDependencies": ["AssignUserToBed"],
      "computationMethod": "Set to current timestamp when AssignUserToBed creates the relation",
      "initialValue": "Current timestamp"
    },
    "status": {
      "type": "string",
      "purpose": "Current status of the assignment",
      "controlType": "creation-only",
      "dataDependencies": [],
      "interactionDependencies": ["AssignUserToBed"],
      "computationMethod": "Set to 'active' when created by AssignUserToBed",
      "initialValue": "active"
    }
  }
}
```

## Example 3: Analyzing SystemConfig Dictionary

### Step 1: Import from data-concepts.json
```json
{
  "name": "SystemConfig",
  "description": "Global system configuration parameters",
  "keys": [
    {
      "key": "evictionScoreThreshold",
      "type": "number",
      "description": "Minimum behavior score required to avoid eviction eligibility"
    }
  ]
}
```

### Step 2: Analyze Usage in Interactions

Search for "SystemConfig" in interactions:
- I101 uses SystemConfig in conditions (bedCount validation)
- I401 uses SystemConfig.evictionScoreThreshold in conditions
- No interactions update SystemConfig values

**Result**: Read-only configuration, no interaction dependencies

### Step 3: Generate Output
```json
"SystemConfig": {
  "purpose": "Global system configuration parameters",
  "type": "object",
  "dataDependencies": [],
  "interactionDependencies": [],
  "computationMethod": "Static configuration values set by system administrators outside of normal interactions"
}
```

## Example 4: Decomposing Complex Computations - User behaviorScore

### From data-concepts.json:
```json
{
  "name": "behaviorScore",
  "type": "number",
  "computed": true,
  "computation": {
    "method": "aggregation",
    "description": "Sum of all behavior violation score deductions from base score",
    "dependencies": ["BehaviorViolation"]
  }
}
```

### Apply Best Practices - Decompose the Computation:

Instead of a single complex computation, create intermediate properties:

```json
"properties": {
  "totalViolationDeductions": {
    "type": "number",
    "purpose": "Sum of all violation score deductions",
    "controlType": "independent",
    "dataDependencies": ["BehaviorViolation.scoreDeduction"],
    "interactionDependencies": [],
    "computationMethod": "Summation of BehaviorViolation.scoreDeduction where userId = this user",
    "initialValue": 0
  },
  "hasRecentViolations": {
    "type": "boolean",
    "purpose": "Whether user has violations in last 30 days",
    "controlType": "independent",
    "dataDependencies": ["BehaviorViolation.timestamp"],
    "interactionDependencies": [],
    "computationMethod": "Any(BehaviorViolation where userId = this user and timestamp > (now - 30 days))",
    "initialValue": false
  },
  "violationCount": {
    "type": "number",
    "purpose": "Total number of violations",
    "controlType": "independent",
    "dataDependencies": ["BehaviorViolation"],
    "interactionDependencies": [],
    "computationMethod": "Count of BehaviorViolation where userId = this user",
    "initialValue": 0
  },
  "behaviorScore": {
    "type": "number",
    "purpose": "Current behavior score (100 minus deductions)",
    "controlType": "independent",
    "dataDependencies": ["totalViolationDeductions"],
    "interactionDependencies": ["ModifyBehaviorScore"],
    "computationMethod": "Custom: 100 - totalViolationDeductions, but can be directly set by ModifyBehaviorScore admin action",
    "initialValue": 100
  }
}
```

This decomposition provides:
- **Clearer semantics**: Each property has a specific purpose
- **Reusable metrics**: violationCount, hasRecentViolations can be used elsewhere
- **Simpler logic**: behaviorScore computation is now trivial
- **Better performance**: System can optimize the semantic computations

## Key Differences from Old Process

1. **No Manual Extraction**: Entities, relations, and properties are pre-extracted in data-concepts.json
2. **Direct Interaction Mapping**: Use interactions-design.json to find exact data operations
3. **Clearer Creation Patterns**: dataConstraints explicitly state when entities are created together
4. **Precise Dependency Tracking**: data.updates/creates/deletes provide exact modification points
5. **Structured Input**: Both artifacts follow consistent JSON schemas for reliable parsing
6. **Semantic Transformation**: Apply best practices to transform generic descriptions into semantic computations
