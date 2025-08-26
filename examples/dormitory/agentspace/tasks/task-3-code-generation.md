# Task 3: Code Generation and Progressive Testing

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

## Task 3.1: Code Generation and Implementation

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1",
  "completed": false
}
```
- Clear next steps

**Based on the analysis documents created in Tasks 2.1-2.3, now implement the actual code.**

### Task 3.1.1: 🔴 CRITICAL: Read Complete API Reference First

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
- Hardcoded relation names (always use `RelationInstance.name` when querying relations)

## 🔴 Recommended: Single File Approach
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

### Task 3.1.2: Entity and Relation Implementation

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

### Task 3.1.3: Interaction Implementation

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

### Task 3.1.4: Progressive Computation Implementation with Testing

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

#### Task 3.1.4.1: Create Test File

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

#### Task 3.1.4.2: Create Implementation Plan

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

#### Task 3.1.4.3: Progressive Implementation Loop

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
   - **Implementation Issue** → Fix computation code in backend/index.ts (refer to API reference)
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

1. **Implement the Computation** (following API Reference)
   - **📖 CRITICAL: Implementation MUST follow patterns from `./agentspace/knowledge/generator/api-reference.md`**. Read FIRST.
   - **🔴 SPECIAL CASE: `_parent:[parent]` notation**
     - If the computation name contains `_parent:[parent]` (e.g., `_parent:[User]`), this means:
       - You should modify the PARENT entity's computation, not the current entity
       - Example: For `_parent:[User]`, modify the `User` entity's computation that creates Posts
       - This typically occurs when a child entity needs to be created by a parent's Transform computation
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
   - **🔴 For `_parent:[parent]` computations**: Test the parent entity's behavior that creates/manages the child entities
   
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
   
   // For _parent:[parent] computations:
   test('Post creation through User Transform (_parent:[User])', async () => {
     /**
      * Test Plan for: _parent:[User]
      * This tests the User's Transform computation that creates Posts
      * Steps: 1) Trigger interaction that creates User 2) Verify Posts are created
      * Business Logic: User's Transform creates related Posts
      */
     // Implementation...
   })
   ```

4. **Write Test Implementation**
   - Add test to `tests/basic.test.ts` in 'Basic Functionality' describe group
   - Follow the test plan created above
   - For StateMachine computations, test ALL StateTransfer transitions
   - Test all CRUD operations the computation supports
   
   **🔴 CRITICAL: When querying Relations in tests:**
   - ALWAYS use the relation instance's `.name` property: `storage.find(UserPostRelation.name, ...)`
   - NEVER hardcode relation names: `storage.find('UserPostRelation', ...)` ❌
   - This ensures tests work regardless of whether relation names are manually specified or auto-generated
   
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
   
   // Example: Querying Relations (if needed in tests)
   test('User-Post relation exists after creation', async () => {
     // Import the relation instance
     import { UserPostRelation } from '../backend'
     
     // Query using relation instance name
     const relations = await system.storage.find(
       UserPostRelation.name,  // ✅ CORRECT: Use instance name
       MatchExp.atom({ key: 'source.id', value: ['=', userId] }),
       undefined,
       [
         'id',
         ['source', { attributeQuery: ['id', 'name'] }],
         ['target', { attributeQuery: ['id', 'title'] }]
       ]
     )
     
     expect(relations.length).toBe(1)
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
   - STOP after each computation for user confirmation before continuing

**🛑 STOP GATE: DO NOT proceed to Task 3.1.4.4 until ALL computations in `docs/computation-implementation-plan.json` are marked as complete with passing tests.**

**✅ END Task 3.1.4.3: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.1.4.3",
  "completed": true
}
```

#### Task 3.1.4.4: Completion Checklist

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

## Task 3.2: Progressive Permission and Business Rules Implementation with Testing

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.2",
  "completed": false
}
```

### Task 3.2.0: Create Permission Test File

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.2.0",
  "completed": false
}
```

**📋 Set up dedicated test file for permissions and business rules:**

- [ ] Copy contents from `tests/permission.template.test.ts` to create `tests/permission.test.ts`
  - This template is specifically designed for permission and business rule testing
  - **DO NOT add any test cases yet** - we will add them progressively as we implement each rule
- [ ] This will be your dedicated test file for all permission and business rule tests
- [ ] Import your backend definitions: `import { entities, relations, interactions } from '../backend'`
- [ ] Verify the file structure includes the 'Permission and Business Rules' describe group

**✅ END Task 3.2.0: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 3.2.0",
  "completed": true
}
```

### Task 3.2.1: Create Implementation Plan

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

### Task 3.2.2: Progressive Implementation Loop

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
     
     // Note: If checking relations in conditions, use relation instance name:
     // const relations = await this.system.storage.find(
     //   UserLeaveRelation.name,  // ✅ Use instance name
     //   MatchExp.atom({ key: 'source.id', value: ['=', event.user.id] })
     // )
     
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
   - [ ] Add test cases in `tests/permission.test.ts` under the 'Permission and Business Rules' describe group
   - [ ] Test EVERY scenario listed in the implementation plan
   - [ ] Test both success and failure cases
   
4. **Run Test**
   - [ ] **🔴 CRITICAL: Run BOTH test suites every time** to ensure no regression:
     - Run permission tests: `npm run test tests/permission.test.ts`
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

### Task 3.2.3: Completion Checklist

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
- [ ] All permission tests pass (`npm run test tests/permission.test.ts`)
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
    "Permission test file created from template",
    "All permissions implemented with tests in permission.test.ts",
    "All business rules implemented with tests in permission.test.ts",
    "business-rules-and-permission-control-implementation-plan.json completed",
    "Both test suites passing (basic.test.ts and permission.test.ts)"
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
