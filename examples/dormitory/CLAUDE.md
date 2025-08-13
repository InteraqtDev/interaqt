# interaqt Backend Generation Guide

## Overview

You are a software expert with the following capabilities:
1. Proficient in requirements analysis methodologies.
2. Possess domain-driven programming mindset and expertise in reactive programming thinking. Capable of system design using reactive programming principles.

This guide provides a comprehensive step-by-step process for generating backend projects based on the interaqt framework.

## 🔴 CRITICAL: Progress Tracking with STATUS.md

**Before starting ANY work, create `docs/STATUS.md` to track your progress:**

```markdown
# Project Implementation Status

## Current Phase
Phase 1: Requirements Analysis

## Current Step
Not started

## Completed Items
- [ ] STATUS.md created

## Next Actions
1. Start with Phase 1: Requirements Analysis
2. Perform deep requirements analysis
3. Create test case documentation

## Notes
- Project just initialized
- Following progressive implementation approach

## Last Updated
[timestamp]
```

**MANDATORY: Throughout the implementation:**
- **MUST read `docs/STATUS.md`** at the start of EVERY phase and major loop
- **MUST update `docs/STATUS.md`** at the end of EVERY phase and major loop
- Include specific next steps based on current progress
- Record any blockers or important decisions

## Phase 1: Requirements Analysis and Test Case Design

**📖 START: Read `docs/STATUS.md` to check current progress before proceeding.**

### 1.1 Deep Requirements Analysis
- Analyze user business requirements, supplement vague or missing details
- Analyze from data perspective: identify all entities, properties, relationships
- Analyze from interaction perspective: list all user operations, permission requirements, business processes
- Create `requirements/detailed-requirements.md` document

### 1.2 Test Case Documentation (CRITICAL)
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

### 1.3 Interaction Matrix
Create `requirements/interaction-matrix.md` to ensure:
- Every user role has corresponding Interactions for all operations
- Every Interaction has clear permission controls or business rule constraints
- Every Interaction has corresponding test cases
- Document both access control requirements AND business logic validations

**✅ END Phase 1: Update `docs/STATUS.md` with:**
- Mark Phase 1 as complete
- List all created documents
- Set current phase to "Phase 2: Design and Analysis"
- Specify next steps: "Begin Phase 2: Design and Analysis"

## Phase 2: Design and Analysis

**📖 START: Read `docs/STATUS.md` to check current progress before proceeding.**

### 🔴 Document-First Approach
**Phase 2 focuses on creating comprehensive design documents before any code generation.**

### 2.1 Entity and Relation Analysis
**📖 MUST READ: `./agentspace/knowledge/generator/entity-relation-generation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

**Create `docs/entity-relation-design.md` documenting:**

- [ ] All entities identified from use cases
- [ ] Each entity's properties with types and purposes
- [ ] All relations between entities
- [ ] Relation properties and cardinality (1:1, 1:n, n:n)
- [ ] Document the business meaning of each entity and relation
- [ ] Include data flow diagrams if helpful

**🔴 CRITICAL: Entity Property Design Rules**
- **NEVER include reference ID fields in entity properties!**
  - ❌ WRONG: User entity with `dormitoryId` property
  - ❌ WRONG: Article entity with `authorId` property
  - ✅ CORRECT: Define these as Relations instead
- **Relationships are defined through Relation definitions ONLY**
- **The property name to access related entities is defined in the Relation**
  - Example: `UserDormitoryRelation` might create `user.dormitory` and `dormitory.users`
- **Entity properties should only contain:**
  - Primitive values (string, number, boolean)
  - Computed values based on the entity itself
  - Embedded data structures (objects/arrays) that are part of the entity
- **All inter-entity connections MUST use Relations**

**Example structure:**
```markdown
# Entity and Relation Design

## Entities

### User
- **Purpose**: System users with different roles
- **Properties**:
  - id: string (system-generated)
  - name: string (user's display name)
  - email: string (unique identifier)
  - role: string (admin/dormHead/student)

### Dormitory
- **Purpose**: Dormitory buildings
- **Properties**:
  - id: string
  - name: string
  - capacity: number (4-6 beds)
  
❌ **Common Mistake to Avoid:**
```typescript
// WRONG: Don't add ID references as properties
const User = Entity.create({
  properties: [
    Property.create({ name: 'dormitoryId', type: 'string' }), // ❌ NO!
    Property.create({ name: 'supervisorId', type: 'string' })  // ❌ NO!
  ]
})

// CORRECT: Use Relations instead
const UserDormitoryRelation = Relation.create({
  source: User,
  target: Dormitory,
  sourceProperty: 'dormitory',  // Creates user.dormitory
  targetProperty: 'users',      // Creates dormitory.users
  type: 'n:1'
})
```

## Relations

### UserDormitoryRelation
- **Type**: n:1 (many users to one dormitory)
- **Purpose**: Assigns students to dormitories
- **Source Property**: `dormitory` (on User entity)
- **Target Property**: `users` (on Dormitory entity)
- **Properties**: 
  - assignedAt: number (timestamp)
  - status: string (active/inactive)

Note: The relation creates `user.dormitory` to access the assigned dormitory and `dormitory.users` to access all users in that dormitory. No ID fields are needed in the entities.
```

### 2.2 Interaction Analysis
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

### 2.3 Computation Analysis
**📖 PRIMARY GUIDE: `./agentspace/knowledge/generator/computation-selection-guide.md`**
**📖 REFERENCE ONLY: `./agentspace/knowledge/generator/computation-implementation.md`**

⚠️ **CRITICAL: You MUST strictly follow the systematic process in `computation-selection-guide.md`!**

**🔴 MANDATORY PROCESS:**
1. **FIRST**: Read and understand `computation-selection-guide.md` completely
2. **USE PREVIOUS OUTPUTS**: Base your analysis on:
   - `docs/entity-relation-design.md` (from step 2.1)
   - `docs/interaction-design.md` (from step 2.2)
3. **ANALYZE**: For EVERY entity and EVERY property, follow the step-by-step analysis process
4. **DOCUMENT**: Create `docs/computation-analysis.md` documenting your analysis for each entity/property
5. **REFERENCE**: Use `computation-implementation.md` as a reference for syntax and examples

**Key Steps from computation-selection-guide.md:**
- [ ] Create analysis document at `docs/computation-analysis.md`
- [ ] Analyze each entity systematically (creation source, update requirements, deletion strategy)
- [ ] Analyze each property individually (type, purpose, data source, update frequency)
- [ ] Analyze each relation's complete lifecycle (creation, updates, deletion)
- [ ] Select appropriate computation type based on decision trees
- [ ] Document reasoning for each computation decision
- [ ] Follow the relation decision algorithm EXACTLY for relations

**Remember**: The systematic analysis process ensures you select the RIGHT computation type for each use case. This analysis will guide your implementation in the next phase!

**✅ END Phase 2: Update `docs/STATUS.md` with:**
- Mark Phase 2 as complete
- List all design documents created
- Set current phase to "Phase 3: Code Generation and Progressive Testing"
- Specify next steps: "Begin Phase 3: Code Generation and Progressive Testing"

## Phase 3: Code Generation and Progressive Testing

**📖 START: Read `docs/STATUS.md` to check current progress before proceeding.**

**🔄 PROGRESSIVE IMPLEMENTATION STRATEGY**

Phase 3 follows a **progressive, test-driven approach**:
1. **Implement incrementally**: Start with entities/relations, then interactions, then computations one by one
2. **Type check immediately**: Run `npm run check` after each implementation step
3. **Test each computation**: Write and run tests for each computation before moving to the next
4. **Fix issues immediately**: Don't accumulate problems - fix them as soon as they appear
5. **Build confidence gradually**: Each passing test confirms your implementation is correct

This approach prevents the accumulation of errors and makes debugging much easier.

### 3.1 Code Generation and Implementation
**Based on the analysis documents created in steps 2.1-2.3, now implement the actual code.**

#### 3.1.1 🔴 CRITICAL: Read Complete API Reference First
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


#### 3.1.2 Entity and Relation Implementation
- [ ] Generate all entities based on `docs/entity-relation-design.md`. **DO NOT define any computations yet**. No `computed` or `computation` on properties
- [ ] Define entity properties with correct types
  - **Remember: NO reference ID fields in entities!**
  - Only primitive values and entity-specific data
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

#### 3.1.3 Interaction Implementation
- [ ] Generate all interactions based on `docs/interaction-design.md`. **DO NOT define any conditions yet** - we will add permissions and business rules later in section 3.2. No `condition` parameter in Interaction.create()
- [ ] Start with simple payload-only interactions (no conditions initially)
- [ ] Ensure all payloads match the documented fields
- [ ] **Type Check**: Run `npm run check` to ensure TypeScript compilation passes
  - Fix any type errors before proceeding
  - Do NOT continue until all type errors are resolved

#### 3.1.4 Progressive Computation Implementation with Testing

**📖 MUST READ: `./agentspace/knowledge/generator/test-implementation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

**🔴 CRITICAL: Use Progressive Implementation with Immediate Testing**

This section follows a **test-driven progressive approach** where each computation is implemented and tested individually before moving to the next one.

##### Step 1: Create Test File
- [ ] Copy contents from `tests/basic.template.test.ts` to create `tests/basic.test.ts`. **DO NOT add any test cases yet** - we will add them progressively as we implement each computation
- [ ] This will be your main test file for progressive implementation
- [ ] Import your backend definitions: `import { entities, relations, interactions } from '../backend'`


##### Step 2: Create Implementation Plan
- [ ] Based on `docs/computation-analysis.md`, analyze computation dependencies (which computations depend on other entities/relations)
- [ ] Order computations from least dependent to most dependent. Start with computations that only depend on InteractionEventEntity
- [ ] Create `docs/computation-implementation-plan.md`. **Write the plan in checklist format** for easy progress tracking. **MUST include ALL computations from `docs/computation-analysis.md` - do not skip any!**

**Template for `docs/computation-implementation-plan.md`:**
```markdown
# Computation Implementation Plan

## Phase 1: Self-Dependent Property Computations
*Properties with computed values that only depend on their own entity's fields, no external dependencies*

- [ ] User.displayName (computed from firstName + lastName)
- [ ] Article.slug (computed from title)
- [ ] Product.discountedPrice (computed from price and discountRate)

## Phase 2: InteractionEventEntity-Dependent Computations
*Computations that only depend on InteractionEventEntity, typically for logging or activity tracking*

- [ ] ActivityLog entity creation (Transform on InteractionEventEntity)
- [ ] User.lastActivityTime (StateMachine triggered by any interaction)
- [ ] SystemStats.totalInteractions (Count of InteractionEventEntity)

## Phase 3: Single Entity/Relation Dependencies
*Computations that depend on one other entity or relation*

- [ ] User.postCount (Count of UserPost relation)
- [ ] Category.articleCount (Count of articles in category)
- [ ] Order.totalAmount (Summation of OrderItem amounts)

## Phase 4: Multiple Dependencies
*Computations that depend on multiple entities or relations*

- [ ] Dashboard.stats (depends on User, Post, Comment entities)
- [ ] Notification creation (Transform depending on User and various state changes)
- [ ] RecommendationScore (computed from User preferences and Product features)

## Phase 5: Complex Chain Dependencies
*Computations that depend on other computed values*

- [ ] User.reputation (depends on postCount, commentCount, likeCount - all computed)
- [ ] Product.popularityScore (depends on orderCount and averageRating - both computed)

## Notes
- Start implementation from Phase 1 and proceed sequentially
- Complete ALL computations in a phase before moving to the next
- Run tests after each computation implementation
- Document any blockers or issues in `docs/errors/`
```

##### Step 3: Progressive Implementation Loop

**📖 LOOP START: Read `docs/STATUS.md` to see which computations are completed and what's next.**

**For EACH computation in your plan, follow this cycle:**

1. **Implement the Computation**
   - [ ] Add the computation code to your entity/relation/property
   - [ ] **Use assignment pattern to add computations** to avoid complex reference issues
   - [ ] If adding computation to a property that has `defaultValue`, remove the `defaultValue` (computation will provide the default)
   - [ ] Verify no Transform is used in Property computation

2. **Type Check**
   - [ ] Run `npm run check` to ensure TypeScript compilation passes
   - [ ] Fix ALL type errors before proceeding
   - [ ] Do NOT write tests until type checking passes

3. **Write Focused Test Case**
   - [ ] Add a new test case in `tests/basic.test.ts` specifically for this computation (write all test cases in the 'Basic Functionality' describe group)
   - [ ] Test name should clearly indicate what computation is being tested
   - [ ] Test should verify the computation works correctly
   - [ ] Test should cover all CRUD operations the computation supports (Create, Read, Update, Delete - if applicable)
   - [ ] If the computation is a StateMachine, test should cover EVERY StateTransfer defined
   
   **Example test structure:**
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

4. **Run Test**
   - [ ] Run `npm run test tests/basic.test.ts` to test only this file
   - [ ] Fix any test failures
   - [ ] Do NOT proceed to next computation until current test passes

5. **Document Progress**
   - [ ] **MUST** check off completed computation in `docs/computation-implementation-plan.md`
   - [ ] Create new documents in `docs/errors/` to record any errors encountered
   - [ ] **Update `docs/STATUS.md`** with:
     - Current computation completed
     - Next computation to implement
     - Any blockers or issues

**🛑 STOP GATE: DO NOT proceed to Step 4 until ALL computations in `docs/computation-implementation-plan.md` are checked off as complete with passing tests.**

##### Step 4: Completion Checklist
- [ ] All computations from `docs/computation-analysis.md` are implemented
- [ ] Each computation has at least one passing test
- [ ] All type checks pass (`npm run check`)
- [ ] All tests pass (`npm run test tests/basic.test.ts`)
- [ ] **Update `docs/STATUS.md`** to reflect:
  - All computations implemented successfully
  - All basic tests passing
  - Ready to proceed to "3.2 Permission and Business Rules Implementation"


### 3.2 Permission and Business Rules Implementation
**📖 MUST READ: `./agentspace/knowledge/generator/permission-implementation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

**🔴 IMPORTANT: All test cases for permissions and business rules should be written in `tests/basic.test.ts` under the 'Permission and Business Rules' describe group.**

**After core business logic is working correctly, add access control and business rules:**

#### Permission Implementation
- [ ] Add condition to interactions for role-based access control
- [ ] Implement permission checks based on user roles
- [ ] Control who can perform which operations

#### Business Rules Implementation
- [ ] Add condition for business rule validations
- [ ] Implement common business rules:
  - **Quantity limits**: e.g., "Cannot request leave more than 3 times per month"
  - **State checks**: e.g., "Cannot edit published articles"
  - **Time restrictions**: e.g., "Cannot book rooms more than 7 days in advance"
  - **Relationship constraints**: e.g., "Cannot delete user with active orders"
  - **Balance checks**: e.g., "Cannot withdraw more than account balance"
- [ ] Ensure TypeScript type checking passes

### 3.3 Permission and Business Rules Test Implementation
**📖 MUST READ: `./agentspace/knowledge/generator/permission-test-implementation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

#### Permission Tests
- [ ] Add permission test cases
- [ ] Test permission access scenarios
- [ ] Test permission denial cases

#### Business Rules Tests
- [ ] Test business rule validations
- [ ] Test boundary conditions (e.g., exactly at limit)
- [ ] Test rule violations with appropriate error messages
- [ ] Test complex scenarios with multiple rules
- [ ] Ensure all tests pass

**Note on Error Messages:**
Since permissions and business rules are now unified in the `condition` API, the framework will return a generic error when the condition fails. Consider:
- Structuring your BoolExpression atoms with descriptive keys that indicate the type of failure
- Testing both permission failures and business rule violations to ensure proper error handling
- Documenting expected error scenarios for each Interaction

**✅ END Phase 3: Update `docs/STATUS.md` with:**
- Mark Phase 3 as complete
- List all implemented components (entities, relations, interactions, computations)
- List all tests created and passing
- Set current phase to "Phase 4: Complete Functional Testing"
- Specify next steps: "Begin Phase 4: Complete Functional Testing"

## Phase 4: Complete Functional Testing

**📖 START: Read `docs/STATUS.md` to check current progress before proceeding.**

**🎯 Goal: Implement and pass ALL test cases defined in `requirements/test-cases.md`**

This phase ensures your implementation meets all business requirements through comprehensive testing.

### 4.1 Prepare for Complete Testing

#### Step 1: Create Test Organization
- [ ] Copy content from `tests/business.template.test.ts` to create `tests/business.test.ts` for comprehensive functional tests


#### Step 2: Test Case Mapping
- [ ] Review ALL test cases in `requirements/test-cases.md`
- [ ] Create `docs/test-implementation-plan.md` with checklist of all test cases
- [ ] Group test cases by dependencies and complexity
- [ ] Identify any test data or setup requirements

### 4.2 Progressive Test Implementation

**📖 LOOP START: Read `docs/STATUS.md` to see which test cases are completed and what's next.**

**For EACH test case in `requirements/test-cases.md`, follow this cycle:**

#### Step 1: Implement Test Case
- [ ] Write the test case exactly as specified in requirements
- [ ] Include all preconditions, inputs, and expected results
- [ ] Use descriptive test names that match the requirement ID (e.g., "TC001: Create Article")
- [ ] Example structure:
  ```typescript
  test('TC001: Create Article (via CreateArticle Interaction)', async () => {
    // Preconditions
    const user = await controller.storage.create('User', {name:'Jane'})
    
    // Execute
    const result = await controller.callInteraction('CreateArticle', {
      user,
      payload: { 
        title: 'Tech Sharing', 
        content: 'Content...', 
        tags: ['frontend', 'React'] 
      }
    })
    
    // Verify ALL expected results
    expect(result.error).toBeUndefined()
    expect(result.data.status).toBe('draft')
    expect(result.data.createdAt).toBeDefined()
    
    // Post validation
    const userArticles = await getUserArticles(user.id)
    expect(userArticles).toContainEqual(result.data)
  })
  ```

#### Step 2: Run and Fix
- [ ] Run the specific test: `npm run test tests/complete.test.ts -t "TC001"`
- [ ] If test fails, analyze the failure:
  - Is it an implementation issue? Fix in backend code
  - Is it a test setup issue? Fix test preconditions
  - Is it a requirement misunderstanding? Clarify and document
- [ ] **DO NOT modify the test to make it pass** - fix the implementation
- [ ] Document any fixes in `docs/errors/test-failures.md`

#### Step 3: Verify No Regression
- [ ] After fixing, run ALL previous tests: `npm run test`
- [ ] Ensure no existing tests are broken by your fix
- [ ] If regression occurs, find a solution that satisfies both requirements

#### Step 4: Update Progress
- [ ] Check off completed test case in `docs/test-implementation-plan.md`
- [ ] Update test count in your progress tracking
- [ ] Commit your changes with clear message: "Implement TC001: Create Article"
- [ ] **Update `docs/STATUS.md`** with:
  - Current test case completed
  - Next test case to implement
  - Running total of tests passed
  - Any issues or blockers encountered

### 4.3 Completion Criteria

**🛑 STOP GATE: Do NOT consider the project complete until:**

- [ ] **100% of test cases** from `requirements/test-cases.md` are implemented
- [ ] **ALL tests pass** without any failures or skips
- [ ] **No console errors** during test execution
- [ ] Final test run output shows:
  ```
  ✓ Complete Functional Tests (X tests)
    ✓ Core Business Logic (X tests)
    ✓ User Workflows (X tests)
    ✓ Edge Cases (X tests)
    ✓ Integration Scenarios (X tests)
  
  Test Suites: X passed, X total
  Tests: X passed, X total
  ```
- [ ] Create final report in `docs/test-completion-report.md` with:
  - Total test count
  - Coverage statistics
  - Any known limitations
  - Performance metrics

**Remember: The goal is to have a production-ready implementation that passes ALL business requirements, not just to make tests pass.**

**✅ PROJECT COMPLETE: Final update to `docs/STATUS.md`:**
- Mark all phases as complete
- List final statistics:
  - Total entities/relations/interactions/computations implemented
  - Total test cases passed
  - Any known limitations or future improvements
- Set status to "COMPLETE"
- Add final timestamp
