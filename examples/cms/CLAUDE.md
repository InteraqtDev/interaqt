# Claude Working Guide for interaqt Framework - Test-Case Driven Development

## Overview

This document provides comprehensive guidelines for Claude when working with the interaqt framework. It combines the working standards with detailed test-case driven development workflow to ensure high-quality, consistent outputs that align with the framework's principles.

## Core Principle: Test-Case Driven Development

When using LLM to generate interaqt applications, you must follow **test-case driven** development workflow. This ensures:
1. Generated code has no hallucinations - every feature has clear acceptance criteria
2. All interactions and computations are covered by tests
3. **Perfect frontend-backend alignment: frontend is an exact mapping of backend, no more, no less**
4. All frontend features derive from backend test cases, with no standalone frontend functionality

## I. Pre-Execution Knowledge Loading (MANDATORY)

### 🔴 CRITICAL RULE: Knowledge Base Loading

**Before executing ANY task related to interaqt**, you MUST read and internalize the complete knowledge base located in `agentspace/knowledge/` as your foundation prompt. This is not optional.

### Required Reading Order

1. **Core Philosophy** (MUST READ FIRST):
   ```
   agentspace/knowledge/usage/00-mindset-shift.md
   ```
   - Understand the fundamental shift from "manipulating data" to "declaring data essence"
   - Internalize the reactive programming paradigm

2. **Framework Concepts** (READ SEQUENTIALLY):
   ```
   agentspace/knowledge/usage/01-core-concepts.md
   agentspace/knowledge/usage/02-define-entities-properties.md
   agentspace/knowledge/usage/03-entity-relations.md
   agentspace/knowledge/usage/04-reactive-computations.md
   agentspace/knowledge/usage/05-interactions.md
   agentspace/knowledge/usage/06-attributive-permissions.md
   agentspace/knowledge/usage/07-activities.md
   agentspace/knowledge/usage/08-filtered-entities.md
   agentspace/knowledge/usage/09-async-computations.md
   agentspace/knowledge/usage/10-global-dictionaries.md
   agentspace/knowledge/usage/11-data-querying.md
   agentspace/knowledge/usage/12-testing.md
   agentspace/knowledge/usage/13-api-reference.md
   agentspace/knowledge/usage/14-entity-crud-patterns.md
   agentspace/knowledge/usage/15-frontend-page-design-guide.md
   agentspace/knowledge/usage/16-performance-optimization.md
   ```

3. **Test Cases Learning**:
   ```
   ../../tests/runtime/
   ```
   - Learn comprehensive testing patterns from existing test cases
   - Understand how to test interactions and their effects on data
   - Study integration testing approaches and edge case handling
   - Note: Focus on Interaction tests, not separate Entity/Relation tests


### ⚠️ Knowledge Loading Validation

After reading the knowledge base, you MUST demonstrate understanding by:
1. Acknowledging the reactive programming paradigm
2. Confirming understanding of Entity, Relation, Interaction, and Computation concepts
3. Showing awareness of the test-driven development approach

## II. Backend Generation Process

### Phase 1: Requirements Analysis & Test Case Design

#### 1.1 Deep Requirements Analysis
- Analyze user business requirements, supplement vague or missing details
- Analyze from data perspective: identify all entities, properties, relationships
- Analyze from interaction perspective: list all user operations, permission requirements, business processes
- Create `requirements/detailed-requirements.md` document

#### 1.2 Test Case Documentation (CRITICAL)
Create `requirements/test-cases.md` document with complete test cases:

```markdown
## TC001: Create Article
- Preconditions: User logged in with publishing permission
- Input Data: title="Tech Sharing", content="Content...", tags=["frontend", "React"]
- Expected Results:
  1. Create new article record
  2. Article status is draft
  3. Creation time is current time
  4. Author linked to current user
  5. User's article count automatically +1
- Post Validation: Article appears in user's article list

## TC002: Like Article
- Preconditions: Article exists and user hasn't liked it
- Input Data: postId="post123"
- Expected Results:
  1. Create like relationship record
  2. Article's like count automatically +1
  3. User's like list includes this article
- Exception Scenario: Duplicate like should fail
```

#### 1.3 Interaction Matrix
Create `requirements/interaction-matrix.md` to ensure:
- Every user role has corresponding Interactions for all operations
- Every Interaction has clear permission controls
- Every Interaction has corresponding test cases

### Phase 2: Code Generation & Implementation

#### 2.1 Project Structure
```
generated-project/
├── requirements/          # Requirements and test case docs
│   ├── detailed-requirements.md
│   ├── test-cases.md
│   └── interaction-matrix.md
├── backend/               # Backend source code
│   ├── entities/         # Entity definitions (with computation)
│   ├── relations/        # Relation definitions
│   ├── interactions/     # Interaction definitions
│   └── index.ts          # DO NOT instantiate Controller here
├── tests/                 # Test code
└── frontend/             # Frontend code
```

⚠️ **IMPORTANT**: There is NO separate `computations/` directory. All computations (Count, Transform, etc.) are defined within the `computation` field of Entity/Relation/Property definitions.

**Important: Backend Code Organization**
- The `backend/index.ts` file should ONLY export entities, relations, interactions arrays
- DO NOT instantiate Controller in `backend/index.ts`
- Controller should be instantiated in test files or server entry point
- Example of correct `backend/index.ts`:
```typescript
// backend/index.ts
export * from './entities'
export * from './relations'
export * from './interactions'

// Optionally export arrays for convenience
export const entities = [User, Post, Comment]
export const relations = [UserPostRelation, PostCommentRelation]
export const interactions = [CreatePost, UpdatePost, DeletePost]

// Note: NO computations export - computations are defined in computation fields
```

#### 2.2 Implementation Order (STRICTLY FOLLOW)
1. First implement all Entity and Property
   - Include computation (Count, Transform, etc.) in Property definitions where needed
2. Then implement all Relation
   - Include computation in Relation definitions where needed
3. Finally implement all Interaction and Activity
4. Write corresponding tests immediately after completing each module
5. **TypeScript Type Check**: After generating source code, ensure there are NO TypeScript type errors
6. **Test Type Check**: After generating test code, ensure test files also have NO TypeScript type errors

**⚠️ Note about Computations**: Do NOT create separate Computation files or modules. All computations (Count, Transform, WeightedSummation, etc.) must be defined within the `computation` field of the Property/Entity/Relation where they belong.

### Phase 3: Test-Driven Validation (MANDATORY - DO NOT SKIP)

#### ⚠️ CRITICAL TESTING PRINCIPLE in interaqt

In the interaqt framework, **ALL data is derived from interaction events**. This fundamentally changes how we approach testing:

- **Focus on Interaction Testing**: Since all Entity and Relation data are created through Interactions, testing Interactions comprehensively will naturally cover all data structures.
- **No Separate Entity/Relation Tests Needed**: You do NOT need to write separate tests for Entity CRUD or Relation creation/deletion. These are automatically covered when you test the Interactions that create them.
- **Coverage Analysis**: If your test coverage is below 100% after testing all Interactions, it likely means:
  - You're missing some Interaction definitions
  - You haven't tested all edge cases and error scenarios for existing Interactions
  - There might be unused code that should be removed

**Testing Strategy**:
1. Test every Interaction with success cases
2. Test every Interaction with failure/error cases
3. Test edge cases and boundary conditions
4. Verify that computed properties (computation) update correctly after Interactions
5. Ensure permission controls work as expected

#### 3.1 Test Framework Setup
- Use vitest as testing framework
- Configure test database using interaqt's PGLiteDB (NOT raw PGLite)
- Use framework APIs directly in tests (no need for test utilities)
- Import statement should use correct package name: `import { ... } from 'interaqt'`

**Correct test database setup example:**
```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt'
import { entities, relations, interactions, activities } from '../backend'

describe('Test Suite', () => {
  let system: MonoSystem
  let controller: Controller
  
  beforeEach(async () => {
    // ✅ Correct: Use PGLiteDB from interaqt package
    system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    
    controller = new Controller(
      system,
      entities,
      relations,
      activities,
      interactions,
      [],
      []
    )
    
    await controller.setup(true)
  })
  
  // Your tests here...
})
```

**Common mistakes to avoid:**
```typescript
// ❌ Wrong: Don't use raw PGLite
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()

// ❌ Wrong: Don't import from wrong package
import { PGLite } from 'pglite'

// ✅ Correct: Always use PGLiteDB from interaqt
import { PGLiteDB } from 'interaqt'
const system = new MonoSystem(new PGLiteDB())
```

#### 3.2 Test Coverage Requirements (Interaction-Centric)
- **Primary Focus**: All Interactions must have comprehensive test coverage:
  - At least one success case per Interaction
  - At least one failure case per Interaction (invalid inputs, permission denied, etc.)
  - Edge cases and boundary conditions
  - Concurrent operation scenarios where applicable
- **Computed Properties**: Verify that properties with computation update correctly after Interactions execute
- **Permission Controls**: Test both positive (allowed) and negative (denied) permission scenarios
- **NO Entity/Relation Unit Tests**: Do not write separate tests for Entity CRUD or Relation operations - these are covered through Interaction tests

#### 3.3 Test Execution (STRICTLY FOLLOW)
After writing each test module, you MUST:
```bash
npx tsc --noEmit           # Check TypeScript types (must pass with no errors)
npm test                    # Run all tests (must pass with no errors)
npm test -- --coverage      # View test coverage (must reach 100%)
```
- If tests fail, fix the implementation immediately
- Do not proceed to next module until current tests pass
- Report test results after each execution

### Phase 4: Documentation Generation

Create `docs/` directory with:
- `architecture.md`: Architecture design from requirements to implementation
- `api-reference.md`: API documentation for all Interactions
- `data-model.md`: Entity relationship diagrams and data dictionary
- `computation-logic.md`: Logic explanation for all reactive computations

### Phase 5: Backend Quality Assurance Checklist

- [ ] All requirements have corresponding test cases (focused on Interactions)
- [ ] All test cases have corresponding test code
- [ ] **No TypeScript type errors in source code** (run `npx tsc --noEmit`)
- [ ] **No TypeScript type errors in test code**
- [ ] All Interaction tests passed (Critical Step)
- [ ] Test coverage reaches 100% through Interaction testing (Critical Step)
- [ ] No fictional non-existent Entity or Interaction
- [ ] All reactive computations trigger correctly when Interactions execute
- [ ] Permission control tests complete for all Interactions
- [ ] All Interactions have success and failure cases
- [ ] All computation properties verified through Interaction side effects
- [ ] test-cases.md document complete and consistent with code
- [ ] interaction-matrix.md covers all user roles and operations
- [ ] Relation cascade behaviors verified through Interaction tests (not separate tests)
- [ ] Package imports use correct name: `interaqt` (not `@interaqt/runtime`)
- [ ] **No separate Entity/Relation unit tests** (all covered through Interactions)

## III. Frontend Generation Process

### Phase 1: Frontend Project Initialization
```bash
cd generated-project
npx create-axii-app frontend
cd frontend
```

### Phase 2: Frontend Test Case Design

**Core Principle: Frontend test cases must completely derive from backend test cases**
- Frontend cannot have functionality that doesn't exist in backend
- Every backend feature must have corresponding interface in frontend
- Frontend test cases are UI manifestations of backend test cases

#### 2.1 Test Case Mapping Analysis
Create `frontend/requirements/backend-frontend-mapping.md`:
```markdown
## Backend to Frontend Test Case Mapping

### TC001: Create Article → UTC001: Article Creation Interface
- Backend Interaction: CreatePost
- Frontend Page: /posts/new
- UI Elements: title input, content editor, tag selector, submit button
- Data Validation: consistent with backend

### TC002: Like Article → UTC002: Like Button
- Backend Interaction: LikePost
- Frontend Location: article detail page, article list item
- UI Elements: like icon, like count display
- State Management: liked/unliked state
```

#### 2.2 Page Planning
Create `frontend/requirements/page-plan.md`:
- Plan pages based on backend Interactions
- Clearly list backend APIs called by each page
- Ensure no fictional features or missing features

#### 2.3 UI Test Cases
Create `frontend/requirements/ui-test-cases.md`:
```markdown
## UTC001: Article Creation Interface (corresponds to TC001)
- Preconditions: User logged in with publishing permission
- Page: /posts/new
- Steps:
  1. Fill title: "Tech Sharing"
  2. Input content: "Content..."
  3. Select tags: "frontend", "React"
  4. Click "Save Draft" button
- Expected Results:
  1. Call CreatePost API
  2. Show loading state
  3. Navigate to article detail page after success
  4. Article status shows "Draft"
- Validation Points: Exactly correspond to TC001 expected results

## UTC002: Like Functionality (corresponds to TC002)
- Preconditions: Viewing unliked article
- Page: /posts/:id
- Steps:
  1. Click like button
- Expected Results:
  1. Call LikePost API
  2. Like count +1
  3. Button state changes to liked
- Exception Test: Repeated clicks should show "Already liked" prompt
```

#### 2.4 Feature Completeness Check
Create `frontend/requirements/completeness-check.md`:
```markdown
## Backend Feature Coverage Checklist

### Interactions
- [ ] CreatePost → New article page
- [ ] UpdatePost → Edit article page
- [ ] DeletePost → Delete button
- [ ] LikePost → Like button
- [ ] GetPosts → Article list page
- [ ] GetPostDetail → Article detail page

### Computed Properties
- [ ] postCount → User profile page display
- [ ] likeCount → Article card display
- [ ] isLiked → Like button state

### Confirmations
- [ ] No functionality that doesn't exist in backend
- [ ] No missing backend functionality
- [ ] All data display comes from backend APIs
```

### Phase 3: Frontend Implementation

1. **Mock Data First**:
   - First implement all pages using mock data
   - Ensure complete UI interaction flow
   - Verify all test cases can be completed

2. **Integrate Real APIs**:
   - Create API client wrapper
   - Replace mock data with real backend calls
   - Handle loading states and error scenarios

3. **Frontend Testing**:
   - Use vitest for component testing
   - Use @testing-library/user-event to simulate user interactions
   - Ensure all UI test cases pass

### Phase 4: Frontend Quality Assurance Checklist

- [ ] **Every backend Interaction has exactly one corresponding UI entry point**
- [ ] **Every frontend feature can find corresponding Interaction in backend**
- [ ] All data display corresponds to real Entity/Relation
- [ ] Error handling and loading states complete
- [ ] All UI test cases pass
- [ ] No calls to non-existent APIs
- [ ] **All items in completeness-check.md are checked**
- [ ] Backend test-cases.md and frontend ui-test-cases.md have one-to-one correspondence
- [ ] backend-frontend-mapping.md complete and accurate
- [ ] No frontend-only features (e.g., frontend validation must match backend)
- [ ] No backend features missing in frontend
- [ ] API parameters and return values exactly match frontend usage
- [ ] Permission control logic exactly consistent between frontend and backend

## IV. Integration Testing & Acceptance

### Integration Testing
- Frontend-backend integration testing
- End-to-end business process testing
- Performance and stress testing

### Integration Checklist
- [ ] Frontend-backend data models consistent
- [ ] API call parameters match
- [ ] Permission controls consistent between frontend and backend
- [ ] End-to-end test cases pass
- [ ] All business processes can be completed
- [ ] Error handling mechanisms complete

## V. Communication Protocol

### Before Starting Any Task
```
I am loading the interaqt knowledge base from agentspace/knowledge/...
[Demonstrate understanding of key concepts]
Now proceeding with your request using the interaqt framework principles.
```

### For Project Generation Requests
```
I will follow the test-case driven development workflow:
1. Loading complete knowledge base
2. Analyzing requirements and creating test cases
3. Implementing backend with full test coverage
4. Running tests to ensure all pass
5. Creating aligned frontend based on backend test cases
6. Ensuring perfect frontend-backend mapping
```

## VI. Common Errors to Avoid

### Framework Understanding
- ❌ Don't treat interaqt like traditional MVC frameworks
- ❌ Don't write imperative business logic in Interactions
- ❌ Don't use `@interaqt/runtime` as package name
- ❌ Don't create separate Computation modules or pass them to Controller
- ✅ Embrace reactive, declarative programming
- ✅ Use Computations to declare data relationships within `computation` fields
- ✅ Use correct package name: `interaqt`

### Computation Usage
- ❌ Don't create Transform.create() as standalone entities
- ❌ Don't pass computations array to Controller constructor
- ❌ Don't create a separate computations/ directory
- ❌ Don't use function form for record parameter
- ✅ Define all computations in the `computation` field of Properties
- ✅ Always use direct references for record parameter
- ✅ Example:
  ```typescript
  Property.create({
    name: 'postCount',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: UserPostRelation  // Direct reference, not () => UserPostRelation
    })
  })
  ```

### Test-Driven Development
- ❌ Don't start coding without complete test cases
- ❌ Don't create features without test coverage
- ❌ Don't skip test execution
- ✅ Test case driven, tests first
- ✅ Run tests and ensure they pass
- ✅ Achieve 100% test coverage

### Frontend-Backend Alignment
- ❌ Don't create frontend features independently
- ❌ Don't miss backend features in frontend
- ❌ Don't add features in frontend that don't exist in backend
- ✅ Perfect alignment through test case mapping
- ✅ Frontend features strictly derive from backend test cases
- ✅ Frontend validation rules must match backend exactly

### Code Organization
- ❌ Don't instantiate Controller in backend/index.ts
- ❌ Don't create test utility functions or setup files
- ✅ Export only definitions from backend/index.ts
- ✅ Instantiate Controller in test files
- ✅ Use framework APIs directly in tests

### Database Usage
- ❌ Don't use raw PGLite from '@electric-sql/pglite'
- ❌ Don't import database from external packages
- ❌ Don't configure database manually
- ✅ Always use PGLiteDB from 'interaqt' package
- ✅ Create system with: `new MonoSystem(new PGLiteDB())`
- ✅ Let interaqt handle all database configuration

### Module Organization and Forward References
- ❌ Don't use arrow functions to solve forward reference issues
  ```typescript
  // WRONG: This is not how to handle forward references
  computation: Count.create({
    record: () => StyleVersionRelation
  })
  ```
- ❌ Don't reference the entity being defined in its own Transform
  ```typescript
  // WRONG: Circular reference
  const Version = Entity.create({
    name: 'Version',
    properties: [
      Property.create({
        name: 'nextVersion',
        computation: Transform.create({
          record: Version  // Circular reference!
        })
      })
    ]
  })
  ```
- ✅ Organize imports properly to avoid forward references
  ```typescript
  // entities/Version.ts
  import { StyleVersionRelation } from '../relations/StyleVersionRelation'
  
  export const Version = Entity.create({
    properties: [
      Property.create({
        name: 'styleCount',
        computation: Count.create({
          record: StyleVersionRelation  // Direct reference
        })
      })
    ]
  })
  ```
- ✅ If circular dependencies exist, define basic structure first, add computed properties later

### Test API Usage
- ❌ Don't use non-existent Controller methods
  ```typescript
  // WRONG: These methods don't exist
  controller.run(...)          // ❌
  controller.execute(...)      // ❌
  controller.dispatch(...)     // ❌
  ```
- ❌ Don't use non-existent Storage methods
  ```typescript
  // WRONG: This method doesn't exist
  storage.findByProperty('Entity', 'field', value)  // ❌
  ```
- ✅ Use correct Controller API
  ```typescript
  // CORRECT: Use callInteraction
  const result = await controller.callInteraction('InteractionName', {
    user: { id: 'userId', role: 'user' },  // Required user object
    payload: { /* data */ }
  })
  ```
- ✅ Use correct Storage API with MatchExp
  ```typescript
  // CORRECT: Use findOne/find with MatchExp
  const record = await system.storage.findOne(
    'EntityName',
    MatchExp.atom({ key: 'field', value: ['=', value] })
  )
  ```
- ✅ Always check for UUID package when needed
  ```typescript
  // If tests need UUID generation
  import { v4 as uuid } from 'uuid'  // Must install: npm install uuid @types/uuid
  ```

## VII. Emergency Protocols

### If You're Unsure About Framework Concepts
1. **STOP** and re-read relevant knowledge base sections
2. Ask for clarification while demonstrating current understanding
3. Reference specific documentation sections
4. Do not proceed with incorrect assumptions

### If Requirements Are Unclear
1. Analyze requirements using framework perspective
2. Ask specific questions about entities, relations, and interactions
3. Propose test cases for validation
4. Do not make assumptions about business logic

### If Tests Fail
1. Read error messages carefully
2. Fix the implementation, not the test
3. Re-run tests until they pass
4. Do not proceed with failing tests

## VIII. Success Criteria

### For Any interaqt Task
- [ ] Knowledge base completely loaded and understood
- [ ] Framework principles correctly applied
- [ ] Reactive programming paradigm followed
- [ ] High-quality, maintainable code produced

### For Project Generation
- [ ] Complete test-case driven workflow followed
- [ ] Backend implementation with 100% test coverage
- [ ] All tests executed and passing
- [ ] Frontend perfectly aligned with backend
- [ ] All documentation requirements met
- [ ] Integration testing completed successfully

## Conclusion

This guide ensures that Claude consistently delivers high-quality interaqt applications that:
- Follow framework best practices
- Maintain perfect frontend-backend alignment
- Achieve comprehensive test coverage with all tests passing
- Respect the reactive programming paradigm
- Use correct package names and imports

**Remember: Knowledge base loading is MANDATORY before any interaqt-related task. Test execution is MANDATORY after implementation. There are no exceptions to these rules.**
