# interaqt Backend Generation Guide

## Overview

You are a software expert with the following capabilities:
1. Proficient in requirements analysis methodologies.
2. Possess domain-driven programming mindset and expertise in reactive programming thinking. Capable of system design using reactive programming principles.

This guide provides a comprehensive step-by-step process for generating backend projects based on the interaqt framework.

## 🔴 CRITICAL: Progress Tracking with STATUS.json


**Before starting ANY work, create `docs/STATUS.json` to track your progress:**

```json
{
  "currentTask": "Task 1",
  "completed": false,
  "completedItems": []
}
```

**📌 IMPORTANT: All tasks in this guide use a global unique numbering system (Task x.x.x.x). You can always find your current position by checking `docs/STATUS.json`, which tracks the exact Task number you were working on.**

## Task 1: Requirements Analysis and Test Case Design

**📖 START: Read `docs/STATUS.json` to check current progress before proceeding.**

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1",
  "completed": false
}
```

### Task 1.1: Deep Requirements Analysis

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1.1",
  "completed": false
}
```
- Analyze user business requirements, supplement vague or missing details
- Analyze from data perspective: identify all entities, properties, relationships
- Analyze from interaction perspective: list all user operations, permission requirements, business processes

**🔴 CRITICAL: Entity Design Principle**
- **NEVER include reference IDs as entity properties!**
- ❌ WRONG: Entity has properties like `userId`, `postId`, `requestId`, `dormitoryId`
- ✅ CORRECT: Use Relations to connect entities - Relations define the property names for accessing related entities
- Example:
  ```
  ❌ WRONG:
  PointDeduction entity with property: userId: string

  ✅ CORRECT:
  UserPointDeductionRelation defines:
  - source: User 
  - sourceProperty: 'pointDeductions' (accessed related PointDeduction via property 'pointDeductions')
  - target: PointDeduction 
  - targetProperty: 'user' (accessed via property 'user')
  ```
- Entity properties should ONLY contain:
  - Primitive data specific to that entity (name, status, points, timestamp)
  - NO references to other entities (those belong in Relations)

- Create `requirements/detailed-requirements.md` document

**✅ END Task 1.1: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1.1",
  "completed": true
}
```

### Task 1.2: Test Case Documentation (CRITICAL)

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1.2",
  "completed": false
}
```
Create `requirements/test-cases.md` document with complete test cases:

**🔴 CRITICAL: All test cases MUST be based on Interactions, NOT on Entity/Relation operations**

**Test cases should be organized in phases:**
1. **Core Business Logic Tests** (implement first)
2. **Permission Tests** (implement after core logic works)
3. **Business Rule Tests** (implement after core logic works)

```markdown
## TC001: Create Article (via CreateArticle Interaction)
- Interaction: CreateArticle
- Preconditions: User logged in with publishing permission
- Input Data: title="Tech Sharing", content="Content...", tags=["frontend", "React"]
- Expected Results:
  1. Create new article record
  2. Article status is draft
  3. Creation time is current time
  4. Author linked to current user
  5. User's article count automatically +1
- Post Validation: Article appears in user's article list

## TC002: Create Article with Invalid Data (via CreateArticle Interaction)
- Interaction: CreateArticle
- Preconditions: User logged in with publishing permission
- Input Data: title="", content=""  // Empty required fields
- Expected Results:
  1. Interaction returns error
  2. Error type is "validation failed"
  3. No article record created
  4. User's article count unchanged
- Note: Do NOT test this with storage.create - it bypasses validation!

## TC003: Like Article (via LikeArticle Interaction)
- Interaction: LikeArticle
- Preconditions: Article exists and user hasn't liked it
- Input Data: postId="post123"
- Expected Results:
  1. Create like relationship record
  2. Article's like count automatically +1
  3. User's like list includes this article
- Exception Scenario: Duplicate like should fail at Interaction level

## TC004: Request Leave - Business Rule Test (via RequestLeave Interaction)
- Interaction: RequestLeave
- Test Phase: Business Rules (implement after core logic)
- Preconditions: User has already requested 3 leaves this month
- Input Data: reason="Family matter", days=2
- Expected Results:
  1. Interaction returns error
  2. Error message indicates monthly limit exceeded
  3. No new leave request created
  4. User's leave count remains at 3
- Note: This tests business rule validation, not core functionality
```

**✅ END Task 1.2: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1.2",
  "completed": true
}
```

### Task 1.3: Interaction Matrix

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1.3",
  "completed": false
}
```
Create `requirements/interaction-matrix.md` to ensure:
- Every user role has corresponding Interactions for all operations
- Every Interaction has clear permission controls or business rule constraints
- Every Interaction has corresponding test cases
- Document both access control requirements AND business logic validations


**✅ END Task 1: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1",
  "completed": true,
  "completedItems": [
    "detailed-requirements.md created",
    "test-cases.md created",
    "interaction-matrix.md created"
  ]
}
```

**🛑 STOP: Task 1 completed. Wait for user instructions before proceeding to Task 2.**

## Task 2: Design and Analysis

**📖 START: Read `docs/STATUS.json` to check current progress before proceeding.**

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2",
  "completed": false
}
```

### 🔴 Document-First Approach
**Task 2 focuses on creating comprehensive design documents before any code generation.**

### Task 2.1: Data Analysis

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2.1",
  "completed": false
}
```
**📖 Follow strictly according to `./agentspace/knowledge/generator/data-analysis.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

**Use the Analysis Documentation Template from `data-analysis.md` to create your `docs/data-design.json`**

**✅ END Task 2.1: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2.1",
  "completed": true
}
```

### Task 2.2: Interaction Analysis

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2.2",
  "completed": false
}
```
**📖 MUST READ: `./agentspace/knowledge/generator/basic-interaction-generation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

**Create `docs/interaction-design.md` documenting:**

- [ ] All interactions identified from use cases
- [ ] For each interaction:
  - Name and purpose
  - Required payload fields
  - Which entities/relations it affects
  - Expected outcomes
  - Permission requirements (for Stage 2)
  - Business rules (for Stage 2)
- [ ] **IMPORTANT**: Design interactions for core business logic first:
  - Basic CRUD operations
  - State transitions
  - Relationship management
- [ ] **Document but don't implement yet**:
  - Permission checks (role-based access control)
  - Business rule validations (e.g., quantity limits, state checks, time restrictions)
  - Complex data validations beyond basic field requirements

**Example structure:**
```markdown
# Interaction Design

## CreateDormitory
- **Purpose**: Create a new dormitory
- **Payload**:
  - name: string (required)
  - capacity: number (required, 4-6)
- **Effects**:
  - Creates new Dormitory entity
  - Initializes with empty beds
- **Stage 2 - Permissions**: Only admin can create
- **Stage 2 - Business Rules**: Capacity must be 4-6

## AssignUserToDormitory
- **Purpose**: Assign a student to a dormitory
- **Payload**:
  - userId: string
  - dormitoryId: string
- **Effects**:
  - Creates UserDormitoryRelation
  - Updates dormitory occupancy count
- **Stage 2 - Permissions**: Admin or dormHead of target dormitory
- **Stage 2 - Business Rules**: 
  - User must not already be assigned
  - Dormitory must have available capacity
```

**✅ END Task 2.2: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2.2",
  "completed": true
}
```

### Task 2.3: Computation Analysis

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2.3",
  "completed": false
}
```
**📖 PRIMARY GUIDE: `./agentspace/knowledge/generator/computation-selection-guide.md`**
**📖 REFERENCE ONLY: `./agentspace/knowledge/generator/computation-implementation.md`**

⚠️ **CRITICAL: You MUST strictly follow the systematic process in `computation-selection-guide.md`!**

**🔴 MANDATORY PROCESS:**
1. **FIRST**: Read and understand `computation-selection-guide.md` completely
2. **USE PREVIOUS OUTPUTS**: Base your analysis on:
   - `docs/data-design.json` (from Task 2.1)
   - `docs/interaction-design.md` (from Task 2.2)
3. **ANALYZE**: For EVERY entity and EVERY property, follow the step-by-step analysis process
4. **DOCUMENT**: Create `docs/computation-analysis.json` documenting your analysis for each entity/property
5. **REFERENCE**: Use `computation-implementation.md` as a reference for syntax and examples

**Key Steps from computation-selection-guide.md:**
- [ ] Create analysis document at `docs/computation-analysis.json`
- [ ] Analyze each entity systematically (creation source, update requirements, deletion strategy)
- [ ] Analyze each property individually (type, purpose, data source, update frequency)
- [ ] Analyze each relation's complete lifecycle (creation, updates, deletion)
- [ ] Select appropriate computation type based on decision trees
- [ ] Document reasoning for each computation decision
- [ ] Follow the relation decision algorithm EXACTLY for relations

**Remember**: The systematic analysis process ensures you select the RIGHT computation type for each use case. This analysis will guide your implementation in the next phase!

**✅ END Task 2: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2",
  "completed": true,
  "completedItems": [
    "data-design.json created",
    "interaction-design.md created",
    "computation-analysis.json created"
  ]
}
```

**🛑 STOP: Task 2 completed. Wait for user instructions before proceeding to Task 3.**

## Task 3: Code Generation and Progressive Testing

**📖 START: Read `docs/STATUS.json` to check current progress before proceeding.**

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3",
  "completed": false
}
```

**🔄 PROGRESSIVE IMPLEMENTATION STRATEGY**

Task 3 follows a **progressive, test-driven approach**:
1. **Implement incrementally**: Start with entities/relations, then interactions, then computations one by one
2. **Type check immediately**: Run `npm run check` after each implementation step
3. **Test each computation**: Write and run tests for each computation before moving to the next
4. **Fix issues immediately**: Don't accumulate problems - fix them as soon as they appear
5. **Build confidence gradually**: Each passing test confirms your implementation is correct

This approach prevents the accumulation of errors and makes debugging much easier.

### Task 3.1: Code Generation and Implementation

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1",
  "completed": false
}
```
- Clear next steps

**Based on the analysis documents created in Tasks 2.1-2.3, now implement the actual code.**

#### Task 3.1.1: 🔴 CRITICAL: Read Complete API Reference First

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.1",
  "completed": false
}
```
**Before generating ANY code, you MUST thoroughly read `./agentspace/knowledge/generator/api-reference.md`**

This document contains:
- Complete and accurate API syntax and parameters
- Common mistakes and correct usage patterns
- Type definitions and constraints
- Real working examples

**Important Guidelines:**
- ✅ Always refer to the API reference for correct syntax
- ✅ When tests fail, FIRST check the API reference for correct usage
- ✅ Follow the exact parameter names and types shown in the API reference
- ❌ Do NOT rely on memory or assumptions about API usage
- ❌ Do NOT guess parameter names or syntax

Common issues that can be avoided by reading the API reference:
- Missing required parameters (e.g., `attributeQuery` in storage operations)
- Wrong property usage (e.g., `symmetric` doesn't exist in Relation.create)
- Incorrect computation placement (e.g., Transform cannot be used in Property computation)

### 🔴 Recommended: Single File Approach
**To avoid complex circular references between files, it's recommended to generate all backend code in a single file:**

- ✅ Define all entities, relations, interactions, and computations in one file
- ✅ Example structure: `backend/index.ts` containing all definitions

**✅ END Task 3.1.1: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.1",
  "completed": true
}
```

#### Task 3.1.2: Entity and Relation Implementation

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.2",
  "completed": false
}
```
- Clear next steps

- [ ] Generate all entities based on `docs/data-design.json`. **DO NOT define any computations yet**. No `computed` or `computation` on properties
- [ ] Define entity properties with correct types
  - **🔴 CRITICAL: NO reference ID fields in entities!**
    - ❌ NEVER: `userId`, `postId`, `requestId`, `dormitoryId` as properties
    - ✅ Relations will handle all entity connections
  - Only primitive values and entity-specific data (name, status, timestamp, etc.)
  - **IMPORTANT: If a property will have `computed` or `computation`, do NOT set `defaultValue`**
    - The computation will provide the value, defaultValue would conflict
    - Either use defaultValue OR computation, never both
- [ ] Generate all relations with proper cardinality
  - Relations define how entities connect
  - Relations create the property names for accessing related entities
- [ ] Define relation properties
- [ ] **Type Check**: Run `npm run check` to ensure TypeScript compilation passes
  - Fix any type errors before proceeding
  - Do NOT continue until all type errors are resolved

**✅ END Task 3.1.2: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.2",
  "completed": true
}
```

#### Task 3.1.3: Interaction Implementation

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.3",
  "completed": false
}
```
- Clear next step


- [ ] Generate all interactions based on `docs/interaction-design.md`. **DO NOT define any conditions yet** - we will add permissions and business rules later in Task 3.2. No `condition` parameter in Interaction.create()
- [ ] Start with simple payload-only interactions (no conditions initially)
- [ ] Ensure all payloads match the documented fields
- [ ] **Type Check**: Run `npm run check` to ensure TypeScript compilation passes
  - Fix any type errors before proceeding
  - Do NOT continue until all type errors are resolved

**✅ END Task 3.1.3: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.3",
  "completed": true
}
```

#### Task 3.1.4: Progressive Computation Implementation with Testing

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.4",
  "completed": false
}
```
- Clear next step

**📖 MUST READ: `./agentspace/knowledge/generator/test-implementation.md`**


**🔴 CRITICAL: Use Progressive Implementation with Immediate Testing**

This section follows a **test-driven progressive approach** where each computation is implemented and tested individually before moving to the next one.

##### Task 3.1.4.1: Create Test File

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.4.1",
  "completed": false
}
```
- [ ] Copy contents from `tests/basic.template.test.ts` to create `tests/basic.test.ts`. **DO NOT add any test cases yet** - we will add them progressively as we implement each computation
- [ ] This will be your main test file for progressive implementation
- [ ] Import your backend definitions: `import { entities, relations, interactions } from '../backend'`

**✅ END Task 3.1.4.1: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.4.1",
  "completed": true
}
```

##### Task 3.1.4.2: Create Implementation Plan

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.4.2",
  "completed": false
}
```

**📋 Generate the Computation Implementation Plan:**

- [ ] Run the command: `npm run plan`
  - This command analyzes `docs/computation-analysis.json` and automatically generates the implementation plan
  - The plan will be created at `docs/computation-implementation-plan.json`
  - Computations are automatically ordered by dependencies (least to most dependent)

- [ ] **Verify the generated file:**
  - Check that `docs/computation-implementation-plan.json` exists
  - Open the file and confirm it contains:
    - Multiple phases organized by dependency complexity
    - Each computation with its decision, method, and dependencies
    - A logical progression from simple to complex computations

**🔴 CRITICAL: If the command fails or the file is not generated:**
1. Check that `docs/computation-analysis.json` exists and is valid JSON
2. If issues persist, stop and wait for user commands

**🛑 STOP: Computation implementation plan generated. Review `docs/computation-implementation-plan.json` and wait for user instructions before proceeding to Task 3.1.4.3.**

**✅ END Task 3.1.4.2: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.4.2",
  "completed": true
}
```

##### Task 3.1.4.3: Progressive Implementation Loop

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.4.3",
  "completed": false
}
```

**📖 Reference `tests/crud.example.test.ts`** for computation implementation code patterns and best practices

**For EACH computation in your plan, follow this progressive implementation cycle:**

## START: Select Next Computation

1. **Read `docs/computation-implementation-plan.json`** to find the FIRST uncompleted computation
   - ALWAYS select the FIRST uncompleted computation
   - NEVER skip ahead - dependencies must be completed in order
   - Phase 1 must complete before Phase 2, etc.

2. **Check if computation has `lastError` field:**
   - If YES → Execute DEEP DEBUG MODE below
   - If NO → Execute NORMAL IMPLEMENTATION FLOW below

## DEEP DEBUG MODE (when lastError exists):

1. **Review Previous Error**: Read the error document at the path in `lastError` to understand what failed and what was already attempted

2. **Analyze Root Cause**:
   - Verify implementation code correctness
   - Check all `expandedDependencies` are properly handled
   - Cross-reference with `requirements/interaction-matrix.md` for business logic
   - Confirm test expectations match business requirements
   - Review similar successful computations for patterns

3. **Apply Fix Based on Analysis**:
   - **Implementation Issue** → Fix computation code in backend/index.ts
   - **Test Issue** → Fix test case logic or expectations
   - **Dependency Issue** → Fix data creation order
   - **Business Logic Issue** → Re-read requirements and adjust

4. **Test the Fix**:
   - Run `npm run check` for type verification
   - Run the specific test
   - If successful: Remove `lastError` field, mark `"completed": true`, return to START
   - If still failing: Update error document with new attempts
   - After 3 additional attempts, STOP and wait for user guidance

## NORMAL IMPLEMENTATION FLOW (when no lastError):

1. **Implement the Computation**
   - Add computation code using assignment pattern at end of file:
     ```typescript
     // At end of backend/index.ts, after exports:
     User.properties.find(p => p.name === 'postCount').computation = Count.create({
       property: 'posts'
     })
     ```
   - Remove any `defaultValue` if adding computation to that property
   - Never use Transform in Property computation

2. **Type Check**
   - Run `npm run check`
   - Fix all type errors before proceeding to tests

3. **Create Test Case Plan**
   - Read computation details from `docs/computation-implementation-plan.json`
   - Check `expandedDependencies` to understand all required dependencies
   - Write test plan comment with: dependencies, test steps, business logic notes
   - Cross-reference with `requirements/interaction-matrix.md` and `docs/data-design.json`
   
   ```typescript
   test('User.dormitoryCount computation', async () => {
     /**
      * Test Plan for: User.dormitoryCount
      * Dependencies: User entity, UserDormitoryRelation
      * Steps: 1) Create user 2) Create dormitories 3) Create relations 4) Verify count
      * Business Logic: Count of dormitories user is assigned to
      */
     // Implementation...
   })
   ```

4. **Write Test Implementation**
   - Add test to `tests/basic.test.ts` in 'Basic Functionality' describe group
   - Follow the test plan created above
   - For StateMachine computations, test ALL StateTransfer transitions
   - Test all CRUD operations the computation supports
   
   Example patterns:
   ```typescript
   test('User.status has correct default value', async () => {
     const user = await system.storage.create('User', {
       name: 'Test User',
       email: 'test@example.com'
     })
     
     const foundUser = await system.storage.findOne(
       'User',
       MatchExp.atom({ key: 'id', value: ['=', user.id] }),
       undefined,
       ['id', 'status'] // Remember attributeQuery!
     )
     
     expect(foundUser.status).toBe('active')
   })
   
   test('Article.state transitions correctly', async () => {
     // Create article in draft state
     const result = await controller.callInteraction('CreateArticle', {
       user: testUser,
       payload: { title: 'Test', content: 'Content' }
     })
     
     // Verify state is draft
     const article = await system.storage.findOne(
       'Article',
       MatchExp.atom({ key: 'id', value: ['=', result.data.id] }),
       undefined,
       ['id', 'state']
     )
     expect(article.state).toBe('draft')
     
     // Transition to published
     await controller.callInteraction('PublishArticle', {
       user: testUser,
       payload: { id: article.id }
     })
     
     // Verify state changed
     const published = await system.storage.findOne(
       'Article',
       MatchExp.atom({ key: 'id', value: ['=', article.id] }),
       undefined,
       ['id', 'state']
     )
     expect(published.state).toBe('published')
   })
   ```

5. **Run Test**
   - Run full test suite: `npm run test tests/basic.test.ts`
   - Must fix any failures (new tests or regressions) before proceeding
   
   **If test fails after type check passes:**
   - Review test plan - are dependencies properly set up?
   - Verify against `requirements/interaction-matrix.md` and `docs/data-design.json`
   - Check if test data matches `expandedDependencies`
   - Common issues: missing dependencies, wrong operation order, incorrect expectations
   
   **Error handling:**
   - After 10 fix attempts, STOP and wait for user guidance
   - Create error document in `docs/errors/` with test plan, code, error, and attempts
   - Update `lastError` field in computation-implementation-plan.json with error doc path
   - Never skip tests or fake data to pass

6. **Document Progress**
   - Update computation in `docs/computation-implemention-plan.json`:
     - Set `"completed": true`
     - Remove `lastError` field if it exists

7. **Loop Back**
   - Return to START to select next uncompleted computation
   - STOP after each computation for user confirmation before continuing

**🛑 STOP GATE: DO NOT proceed to Task 3.1.4.4 until ALL computations in `docs/computation-implementation-plan.json` are marked as complete with passing tests.**

**✅ END Task 3.1.4.3: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.4.3",
  "completed": true
}
```

##### Task 3.1.4.4: Completion Checklist

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.4.4",
  "completed": false
}
```
- [ ] All computations from `docs/computation-analysis.json` are implemented
- [ ] Each computation has at least one passing test
- [ ] All type checks pass (`npm run check`)
- [ ] All tests pass (`npm run test tests/basic.test.ts`)


**✅ END Task 3.1: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1",
  "completed": true
}
```

### Task 3.2: Progressive Permission and Business Rules Implementation with Testing

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.2",
  "completed": false
}
```

#### Task 3.2.1: Create Implementation Plan

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.2.1",
  "completed": false
}
```

**📋 Create the Permission and Business Rules Implementation Plan:**

- [ ] Create `docs/business-rules-and-permission-control-implementation-plan.json` based on:
  - `docs/interaction-design.md` (Stage 2 requirements)
  - `requirements/interaction-matrix.md` (permission requirements)
  - `requirements/test-cases.md` (business rule scenarios)

- [ ] **Structure the plan with progressive phases:**
  ```json
  {
    "phases": [
      {
        "phase": 1,
        "name": "Basic Permissions",
        "rules": [
          {
            "id": "P001",
            "interaction": "CreateDormitory",
            "type": "permission",
            "description": "Only admin can create dormitories",
            "condition": "user.role === 'admin'",
            "testScenarios": [
              "Admin can create dormitory",
              "Non-admin cannot create dormitory"
            ],
            "completed": false
          }
        ]
      },
      {
        "phase": 2,
        "name": "Simple Business Rules",
        "rules": [
          {
            "id": "BR001",
            "interaction": "CreateDormitory",
            "type": "business_rule",
            "description": "Dormitory capacity must be 4-6",
            "condition": "payload.capacity >= 4 && payload.capacity <= 6",
            "testScenarios": [
              "Can create with capacity 4",
              "Can create with capacity 6",
              "Cannot create with capacity 3",
              "Cannot create with capacity 7"
            ],
            "completed": false
          }
        ]
      },
      {
        "phase": 3,
        "name": "Complex Business Rules",
        "rules": [
          {
            "id": "BR002",
            "interaction": "RequestLeave",
            "type": "business_rule",
            "description": "Cannot request more than 3 leaves per month",
            "condition": "Check user's leave count for current month < 3",
            "dependencies": ["Needs to query existing leave requests"],
            "testScenarios": [
              "Can request first leave",
              "Can request third leave",
              "Cannot request fourth leave in same month",
              "Can request leave in new month"
            ],
            "completed": false
          }
        ]
      }
    ]
  }
  ```

- [ ] **Organize rules by complexity:**
  - Phase 1: Simple role-based permissions
  - Phase 2: Simple payload validations
  - Phase 3: Rules requiring database queries
  - Phase 4: Complex multi-condition rules

**✅ END Task 3.2.1: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.2.1",
  "completed": true
}
```

#### Task 3.2.2: Progressive Implementation Loop

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.2.2",
  "completed": false
}
```

**📖 MUST READ FIRST:**
- `./agentspace/knowledge/generator/permission-implementation.md`
- `./agentspace/knowledge/generator/permission-test-implementation.md`

**🔴 CRITICAL: Use Progressive Implementation with Immediate Testing**

This task follows the **same progressive approach as Task 3.1** - each permission/business rule is implemented and tested individually before moving to the next one.

**MUST Read `docs/business-rules-and-permission-control-implementation-plan.json` to see which rules are completed and what's next.**

**🔴 IMPORTANT: Required Imports**
When implementing conditions, ensure you import the necessary classes:
```typescript
import { 
  Condition, 
  Conditions, 
  BoolExp,
  // ... other imports
} from 'interaqt'
```

**For EACH rule in your plan, follow this cycle:**

1. **Implement the Rule**
   - [ ] **Use assignment pattern (`Interaction.conditions = ...`)** to add conditions at the end of file
   - [ ] Use Condition.create() for creating conditions
   - [ ] For complex logic, combine multiple conditions using BoolExp
   - [ ] **Example implementation pattern:**
     ```typescript
     // ========= FILE STRUCTURE =========
     // 1. First section: All entity and relation definitions
     const User = Entity.create({ name: 'User', properties: [...] })
     const Dormitory = Entity.create({ name: 'Dormitory', properties: [...] })
     
     // 2. Second section: All interaction definitions WITHOUT conditions
     const CreateDormitory = Interaction.create({
       name: 'CreateDormitory',
       payload: Payload.create({
         items: [
           PayloadItem.create({ name: 'name', type: 'string' }),
           PayloadItem.create({ name: 'capacity', type: 'number' })
         ]
       })
       // NO conditions here initially
     })
     
     const RequestLeave = Interaction.create({
       name: 'RequestLeave',
       payload: Payload.create({
         items: [
           PayloadItem.create({ name: 'reason', type: 'string' }),
           PayloadItem.create({ name: 'days', type: 'number' })
         ]
       })
       // NO conditions here initially
     })
     
     // 3. Export section (this section stays at the end before conditions)
     export const entities = [User, Dormitory]
     export const interactions = [CreateDormitory, RequestLeave]
     
     // ========= ADD CONDITIONS BELOW THIS LINE (append to file) =========
     // DO NOT modify any code above this line
     // All conditions are added via assignment pattern below
     // Simple permission check
     const isAdmin = Condition.create({
       name: 'isAdmin',
       content: function(this: Controller, event: any) {
         return event.user.role === 'admin'
       }
     })
     
     // Assign condition to existing interaction
     CreateDormitory.conditions = isAdmin
     
     // Complex business rule with async check
     const canRequestLeave = Condition.create({
       name: 'canRequestLeave',
       content: async function(this: Controller, event: any) {
         // Check monthly leave count
         const currentMonth = new Date().getMonth()
         const currentYear = new Date().getFullYear()
         const existingLeaves = await this.system.storage.find(
           'LeaveRequest',
           BoolExp.atom({ key: 'userId', value: ['=', event.user.id] })
             .and({ key: 'month', value: ['=', currentMonth] })
             .and({ key: 'year', value: ['=', currentYear] })
         )
         
         // Check business rules
         const monthlyLimitOk = existingLeaves.length < 3
         const daysLimitOk = event.payload.days <= 7
         
         return monthlyLimitOk && daysLimitOk
       }
     })
     
     // Assign condition to existing interaction
     RequestLeave.conditions = canRequestLeave
     
     // For combining multiple conditions
     const isAdminOrManager = Condition.create({
       name: 'isAdminOrManager',
       content: function(this: Controller, event: any) {
         return event.user.role === 'admin' || event.user.role === 'manager'
       }
     })
     
     const hasValidCapacity = Condition.create({
       name: 'hasValidCapacity',
       content: function(this: Controller, event: any) {
         const capacity = event.payload.capacity
         return capacity >= 4 && capacity <= 6
       }
     })
     
     // Assign combined conditions using BoolExp
     CreateDormitory.conditions = Conditions.create({
       content: BoolExp.atom(isAdminOrManager).and(hasValidCapacity)
     })
     ```

2. **Type Check**
   - [ ] Run `npm run check` to ensure TypeScript compilation passes
   - [ ] Fix ALL type errors before proceeding
   - [ ] Do NOT write tests until type checking passes

3. **Write Focused Test Cases**
   - [ ] Add test cases in `tests/basic.test.ts` under the 'Permission and Business Rules' describe group
   - [ ] Test EVERY scenario listed in the implementation plan
   - [ ] Test both success and failure cases
   
4. **Run Test**
   - [ ] **🔴 CRITICAL: Run FULL test suite every time** to ensure no regression: `npm run test tests/basic.test.ts`
     - This runs ALL tests in the file, not just the new ones
     - Ensures new rules don't break existing functionality
     - If ANY test fails (new or existing), must fix before proceeding
   - [ ] Fix any test failures (both new tests and any regressions)
   - [ ] **🔴 CRITICAL: NEVER cheat to pass tests!**
     - ❌ Do NOT mark tests as `.skip()` or `.todo()`
     - ❌ Do NOT fake/mock data just to make tests pass
     - ❌ Do NOT remove or ignore critical assertions
     - ✅ Actually fix the implementation until tests genuinely pass
   - [ ] If test still fails after 10 fix attempts, STOP and wait for user guidance
   - [ ] **MUST record all encountered errors** in `docs/errors/` directory with descriptive filenames (e.g., `permission-admin-error.md`)
   - [ ] Do NOT proceed to next rule until ALL tests pass (both new and existing)

5. **Document Progress**
   - [ ] **MUST** update the completed rule status in `docs/business-rules-and-permission-control-implementation-plan.json` (mark as `"completed": true`)
   - [ ] Create new documents in `docs/errors/` to record any errors encountered
   - [ ] Add comments in code explaining complex conditions

**🛑 STOP: Current rule implementation completed. Wait for user instructions before proceeding to the next rule.**

**After receiving user confirmation, repeat steps 1-5 for the next uncompleted rule in `docs/business-rules-and-permission-control-implementation-plan.json`.**

**🛑 STOP GATE: DO NOT proceed to Task 3.2.3 until ALL rules in `docs/business-rules-and-permission-control-implementation-plan.json` are marked as complete with passing tests.**

**✅ END Task 3.2.2: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.2.2",
  "completed": true
}
```

#### Task 3.2.3: Completion Checklist

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.2.3",
  "completed": false
}
```

- [ ] All permissions from `docs/interaction-design.md` are implemented
- [ ] All business rules from requirements are implemented
- [ ] Each rule has comprehensive test coverage (success and failure cases)
- [ ] All type checks pass (`npm run check`)
- [ ] All tests pass (`npm run test tests/basic.test.ts`)
- [ ] Error scenarios are properly documented

**Note on Error Messages:**
Since permissions and business rules are unified in the `conditions` API, the framework returns a generic error when conditions fail:
- The error type will be `'condition check failed'` for all condition failures
- You cannot distinguish between different types of failures in the error message
- Best practices:
  - Use descriptive Condition names (e.g., 'isAdmin', 'hasValidCapacity')
  - Document expected error scenarios for each Interaction
  - Test both permission failures and business rule violations separately
  - Consider logging more detailed information within the condition's content function for debugging

**✅ END Task 3.2.3: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.2.3",
  "completed": true
}
```

**✅ END Task 3.2: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.2",
  "completed": true,
  "completedItems": [
    "All permissions implemented with tests",
    "All business rules implemented with tests",
    "business-rules-and-permission-control-implementation-plan.json completed"
  ]
}
```


**✅ END Task 3: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3",
  "completed": true,
  "completedItems": [
    "All entities and relations implemented",
    "All interactions implemented",
    "All computations implemented with tests",
    "Permissions and business rules implemented and tested"
  ]
}
```

**✅ PROJECT COMPLETE: Final update to `docs/STATUS.json`:**
```json
{
  "currentTask": "COMPLETE",
  "completed": true,
  "completedItems": [
    "Task 1: Requirements Analysis - COMPLETE",
    "Task 2: Design and Analysis - COMPLETE",
    "Task 3: Code Generation and Progressive Testing - COMPLETE",
    "All tests passing",
    "Project ready for production"
  ]
}
```
