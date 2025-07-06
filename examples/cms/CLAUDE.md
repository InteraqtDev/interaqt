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
```

### 1.3 Interaction Matrix
Create `requirements/interaction-matrix.md` to ensure:
- Every user role has corresponding Interactions for all operations
- Every Interaction has clear permission controls
- Every Interaction has corresponding test cases


## Phase 2: Code Generation

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
- [ ] Start with simple payload-only interactions. No userAttributive or dataAttributive initially
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
- [ ] Verify basic functionality without permissions
- [ ] Ensure all tests pass

### 2.5 Permission Implementation
**📖 MUST READ: `./agentspace/knowledge/generator/permission-implementation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

- [ ] Add userAttributive to interactions
- [ ] Add dataAttributive where needed
- [ ] Implement role-based access control
- [ ] Ensure TypeScript type checking passes

### 2.6 Permission Test Implementation
**📖 MUST READ: `./agentspace/knowledge/generator/permission-test-implementation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

- [ ] Add permission test cases
- [ ] Test permission access scenarios
- [ ] Test permission denial cases
- [ ] Ensure all tests pass

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
  - User attributives for role checking
  - Data attributives for payload validation
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
