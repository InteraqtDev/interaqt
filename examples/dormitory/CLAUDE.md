# interaqt Backend Generation Guide

## Overview
This guide provides a comprehensive step-by-step process for generating backend projects based on the interaqt framework.

## Phase 1: Requirements Analysis and Test Case Design

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


## Phase 2: Code Generation

### 🔴 Progressive Implementation Approach
**CRITICAL: Follow a progressive implementation strategy:**

1. **Stage 1 - Core Business Logic Only**
   - Implement basic CRUD operations
   - Focus on entity relationships and computations
   - No permissions or business rules
   - Get all basic functionality working first
   
   **🔴 CRITICAL for Stage 1 Test Cases:**
   - **ALWAYS use correct user roles and valid data** in test cases
   - Even though permissions aren't enforced yet, create users with proper roles (admin, dormHead, student, etc.)
   - Use realistic and valid data that complies with future business rules
   - This ensures Stage 1 tests will continue to pass after Stage 2 implementation
   - Example:
     ```typescript
     // ✅ CORRECT: Use proper role even in Stage 1
     const admin = await system.storage.create('User', {
       name: 'Admin',
       email: 'admin@example.com',
       role: 'admin'  // Specify correct role from the start
     })
     
     // ✅ CORRECT: Use valid data that will pass future business rules
     const result = await controller.callInteraction('CreateDormitory', {
       user: admin,  // Use admin user, not just any user
       payload: { name: 'Dorm A', capacity: 4 }  // Valid capacity (4-6)
     })
     ```

2. **Stage 2 - Add Access Control and Business Rules**
   - Add condition for permission checks
   - Add condition for business rule validations
   - Implement complex validations and constraints
   - Only after Stage 1 is fully working
   
   **🔴 CRITICAL for Stage 2 Implementation:**
   - **DO NOT modify Stage 1 test cases** - they should continue to pass
   - **Write NEW test cases** specifically for permission and business rule validations
   - Stage 1 tests verify core functionality works with valid inputs
   - Stage 2 tests verify invalid inputs are properly rejected
   - **Both test files should pass** after Stage 2 implementation


### 🔴 Recommended: Single File Approach
**To avoid complex circular references between files, it's recommended to generate all backend code in a single file:**

- ✅ Define all entities, relations, interactions, and computations in one file
- ✅ State nodes should be defined first, before entities that use them
- ✅ This prevents circular dependency issues between separate entity/relation/computation files
- ✅ Makes it easier to see all dependencies and ensure proper initialization order
- ✅ Example structure: `backend/index.ts` containing all definitions

**Benefits of single file approach:**
- No circular imports between entity and computation files
- Clear initialization order
- Easier to maintain consistency
- Simpler to debug issues


### 🔴 CRITICAL: Framework Has Complete CRUD Capabilities
**The interaqt framework has COMPLETE capability for all CRUD operations (Create, Read, Update, Delete).**

**DO NOT make these mistakes:**
- ❌ Assuming the framework "doesn't support field updates" 
- ❌ Writing tests that expect no changes after update operations
- ❌ Adding comments like "due to framework limitation"
- ❌ Making tests pass by lowering expectations

**If your update/delete operations aren't working:**
- ✅ Your implementation is incorrect - review the documentation
- ✅ Check if you're using the right computation type (Transform vs StateMachine)
- ✅ Ensure StateMachine transfers are properly configured
- ✅ Verify you're passing the correct payload structure

**Example of WRONG test:**
```typescript
// ❌ WRONG: Cheating to make test pass
test('Update Style', async () => {
  const result = await controller.callInteraction('UpdateStyle', { ... })
  // NOTE: Framework doesn't support updates
  expect(style.label).toBe('Original Label') // Expecting no change!
})
```

**Example of CORRECT test:**
```typescript
// ✅ CORRECT: Test actual functionality
test('Update Style', async () => {
  const result = await controller.callInteraction('UpdateStyle', { ... })
  expect(result.error).toBeUndefined()
  expect(style.label).toBe('Updated Label') // Expecting actual update!
})
```

### 🔴 CRITICAL: Read Complete API Reference First
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
- Incorrect parameter names (e.g., `from/to` vs `current/next` in StateTransfer)
- Missing required parameters (e.g., `attributeQuery` in storage operations)
- Wrong property usage (e.g., `symmetric` doesn't exist in Relation.create)
- Incorrect computation placement (e.g., Transform cannot be used in Property computation)

### 2.1 Entity and Relation Generation
**📖 MUST READ: `./agentspace/knowledge/generator/entity-relation-generation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

- [ ] Generate all entities from use cases
- [ ] Define entity properties
- [ ] Generate all relations from use cases
- [ ] Define relation properties
- [ ] Ensure TypeScript type checking passes

### 2.2 Basic Interaction Generation
**📖 MUST READ: `./agentspace/knowledge/generator/basic-interaction-generation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

- [ ] Generate all interactions from use cases
- [ ] Start with simple payload-only interactions. No condition initially
- [ ] **IMPORTANT**: Focus ONLY on core business logic, DO NOT implement:
  - Permission checks (role-based access control)
  - Business rule validations (e.g., quantity limits, state checks, time restrictions)
  - Complex data validations beyond basic field requirements
- [ ] Ensure TypeScript type checking passes by using `npm run check`

### 2.3 Computation Implementation
**📖 MUST READ: `./agentspace/knowledge/generator/computation-implementation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

- [ ] Apply reactive programming concepts
- [ ] Use interaqt Computations to describe entities, relations, and properties according to specific definitions
- [ ] Ensure TypeScript type checking passes

### 2.4 Initial Test Implementation
**📖 MUST READ: `./agentspace/knowledge/generator/test-implementation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

- [ ] Create test cases for all interactions
- [ ] Verify basic functionality without permissions and business rules
- [ ] **Focus on core business logic only**:
  - Basic CRUD operations work correctly
  - Entity relationships are properly established
  - Computed properties calculate correctly
  - State transitions work as expected
- [ ] **DO NOT test at this stage**:
  - Permission denials
  - Business rule violations
  - Complex validation scenarios
- [ ] Ensure all tests pass

### 2.5 Permission and Business Rules Implementation
**📖 MUST READ: `./agentspace/knowledge/generator/permission-implementation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

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

### 2.6 Permission and Business Rules Test Implementation
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

### 2.7 Complete CRUD Test Example
**📖 Reference: `./tests/crud.example.test.ts`**

For a comprehensive example of CRUD operations with the interaqt framework, refer to the complete test file `./tests/crud.example.test.ts`. This example demonstrates:

- **Entity Definition**: User and Article entities with properties and computations
- **State Management**: Article lifecycle using StateMachine (draft → published → deleted)
- **Relations**: User-Article relationship with automatic article count
- **Filtered Entities**: ActiveArticle entity that excludes deleted articles
- **Interactions**: Complete CRUD operations (Create, Publish, Delete, Restore)
- **Permission System**: 
  - Role-based access control (admin, author, user)
  - Condition for role checking
  - Condition for payload validation
  - Complex permission logic with OR conditions
- **Comprehensive Tests**:
  - Basic CRUD operations
  - State transitions
  - Permission enforcement
  - Edge cases and error handling
  - Complex workflows

This example serves as a practical reference for implementing and testing CRUD functionality in your own interaqt projects.

## Phase 3: Quality Assurance

### 3.1 Code Review Checklist
- [ ] All entities have proper computations
- [ ] All interactions follow best practices
- [ ] Proper error handling

### 3.2 Test Coverage
- [ ] All interactions tested
- [ ] All permissions tested
- [ ] Edge cases covered
- [ ] Performance considerations
