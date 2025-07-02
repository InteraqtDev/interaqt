# LLM Generator Guide - Test-Case Driven interaqt Application Generation

## Core Principle: Test-Case Driven Development

When using LLM to generate interaqt applications, you must follow **test-case driven** development workflow. This ensures:
1. Generated code has no hallucinations - every feature has clear acceptance criteria
2. All interactions and computations are covered by tests
3. **Perfect frontend-backend alignment: frontend is an exact mapping of backend, no more, no less**
4. All frontend features derive from backend test cases, with no standalone frontend functionality

## I. Backend Generation Process

### 1. Deep Framework Learning (Required)
1. **Understand Core Philosophy**: Read `agentspace/knowledge/usage/00-mindset-shift.md` thoroughly to understand the shift from "manipulating data" to "declaring data essence"
2. **Learn Framework Concepts**: Study all documents under `agentspace/knowledge` to master Entity, Relation, Interaction, Computation and other core concepts
3. **Study Example Code**: Learn from source code in `tests` and `examples` to understand practical applications of reactive computations

### 2. Requirements Analysis & Test Case Design (Critical Step)
1. **Requirements Analysis**:
   - Analyze user business requirements, supplement vague or missing details
   - Analyze from data perspective: identify all entities, properties, relationships
   - Analyze from interaction perspective: list all user operations, permission requirements, business processes
   - Create `requirements/detailed-requirements.md` document

2. **Test Case Documentation** (New Critical Step):
   - Create `requirements/test-cases.md` document
   - Write complete CRUD test cases for each entity
   - Write complete test scenarios for each interaction
   - Write validation cases for each computed property
   - Write end-to-end cases for each business process
   - Example format:
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

3. **Interaction Matrix** (Ensure Completeness):
   Create `requirements/interaction-matrix.md` to ensure:
   - Every user role has corresponding Interactions for all operations
   - Every Interaction has clear permission controls
   - Every Interaction has corresponding test cases

### 3. Code Generation & Implementation
1. **Project Structure**:
   ```
   generated-project/
   ├── requirements/          # Requirements and test case docs
   │   ├── detailed-requirements.md
   │   ├── test-cases.md
   │   └── interaction-matrix.md
   ├── backend/                   # Backend source code
   │   ├── entities/
   │   ├── relations/
   │   ├── interactions/
   │   ├── computations/
   │   └── index.ts
   ├── tests/                 # Test code
   │   ├── interactions/
   │   ├── computations/
   │   └── e2e/
   └── frontend/             # Frontend code
   ```

2. **Implementation Order** (Strictly Follow):
   - First implement all Entity and Property
   - Then implement all Relation
   - Next implement all Computation (Count, Transform, etc.)
   - Finally implement all Interaction and Activity
   - Write corresponding tests immediately after completing each module
   - **TypeScript Type Check**: After generating source code, ensure there are NO TypeScript type errors (run `npx tsc --noEmit`)
   - **Test Type Check**: After generating test code, ensure test files also have NO TypeScript type errors

### 4. Test-Driven Validation (Critical Step)
1. **Test Framework Setup**:
   - Use vitest as testing framework
   - Configure test database (use PGLite memory mode)
   - Create test utility functions and data factories

2. **Test Coverage Requirements**:
   - All Interactions must have at least one success case and one failure case
   - All properties with computation must verify auto-calculation logic
   - All permission controls must have positive and negative tests

3. **Test Execution** (Strictly Follow):
   ```bash
   npx tsc --noEmit           # Check TypeScript types (must pass with no errors)
   npm test                    # Run all tests (must pass with no errors)
   npm test -- --coverage      # View test coverage (must 100% coverage)
   ```

### 5. Documentation Generation
Create `docs/` directory with:
- `architecture.md`: Architecture design from requirements to implementation
- `api-reference.md`: API documentation for all Interactions
- `data-model.md`: Entity relationship diagrams and data dictionary
- `computation-logic.md`: Logic explanation for all reactive computations

### 6. Backend Quality Assurance Checklist

- [ ] All requirements have corresponding test cases
- [ ] All test cases have corresponding test code
- [ ] **No TypeScript type errors in source code** (run `npx tsc --noEmit`)
- [ ] **No TypeScript type errors in test code**
- [ ] All test cases passed (Critical Step)
- [ ] Test coverage reaches 100% (Critical Step)
- [ ] No fictional non-existent Entity or Interaction
- [ ] All reactive computations trigger correctly
- [ ] Permission control tests complete
- [ ] All Interactions have success and failure cases
- [ ] All computation properties verify auto-calculation logic
- [ ] test-cases.md document complete and consistent with code
- [ ] interaction-matrix.md covers all user roles and operations
- [ ] All relations have correct cascade behavior tests

## II. Frontend Generation Process

### 1. Frontend Project Initialization
```bash
cd generated-project
npx create-axii-app frontend
cd frontend
```

### 2. Learn Frontend Framework
- Carefully read axii framework guidance in `frontend/cursor.json`
- Understand axii's reactive UI programming model
- Don't use experience from other frameworks - axii is unique

### 3. Frontend Test Case Design (Critical Step)

**Core Principle: Frontend test cases must completely derive from backend test cases**
- Frontend cannot have functionality that doesn't exist in backend
- Every backend feature must have corresponding interface in frontend
- Frontend test cases are UI manifestations of backend test cases

1. **Test Case Mapping Analysis**:
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

2. **Page Planning**:
   Create `frontend/requirements/page-plan.md`:
   - Plan pages based on backend Interactions
   - Clearly list backend APIs called by each page
   - Ensure no fictional features or missing features

3. **UI Test Cases**:
   Create `frontend/requirements/ui-test-cases.md`:
   - **Must be based on backend test cases in `test-cases.md`**
   - Every backend test case must have corresponding UI test case
   - Cannot add functionality tests that don't exist in backend
   
   Example:
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

4. **Feature Completeness Check**:
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

### 4. Frontend Implementation
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

### 5. Frontend Quality Assurance Checklist

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

## III. Integration Testing & Acceptance

### 1. Integration Testing
- Frontend-backend integration testing
- End-to-end business process testing
- Performance and stress testing

### 2. Integration Checklist
- [ ] Frontend-backend data models consistent
- [ ] API call parameters match
- [ ] Permission controls consistent between frontend and backend
- [ ] End-to-end test cases pass
- [ ] All business processes can be completed
- [ ] Error handling mechanisms complete

## IV. Common Error Prevention

1. **Avoid Imperative Thinking**:
   - ❌ Don't write business logic in Interactions
   - ✅ Use Computations to declare data relationships

2. **Avoid Fictional Features**:
   - ❌ Don't create APIs that don't exist in backend
   - ✅ Strictly implement based on test-cases.md

3. **Avoid Over-Engineering**:
   - ❌ Don't create features not in test cases
   - ✅ Implement strictly according to test cases, no more, no less

4. **Avoid Test Gaps**:
   - ❌ Don't write code first then add tests
   - ✅ Test case driven, tests first

5. **Avoid Frontend-Backend Disconnection**:
   - ❌ Don't add features in frontend that don't exist in backend (like local filtering, sorting)
   - ❌ Don't miss UI implementation of backend features
   - ❌ Don't do data validation in frontend that's inconsistent with backend
   - ✅ Frontend features strictly derive from backend test cases
   - ✅ Use backend-frontend-mapping.md to ensure alignment
   - ✅ Frontend validation rules must match backend exactly

By strictly following this test-case driven process and ensuring frontend features completely derive from backend test cases, you can generate feature-complete, highly aligned frontend-backend, and reliable quality interaqt applications. 