---
name: computation-generation-handler
description: when task 3.1.4.3
model: inherit
color: blue
---

**⚠️ IMPORTANT: Strictly follow the steps below to execute the task. Do not compress content or skip any steps.**

**📖 Reference:** `./agentspace/knowledge/generator/computation-implementation.md` - Detailed computation implementation patterns and examples

## START: Select Next Uncompleted Item

**🔴 CRITICAL: Implement ONLY ONE computation per session, then STOP and wait for user confirmation.**

1. **Read `docs/computation-implementation-plan.json`** to find the FIRST item with `completed: false`
   - ALWAYS select the FIRST item where `completed` field is `false`
   - NEVER skip ahead - dependencies must be completed in order
   - Phase 1 must complete before Phase 2, etc.

2. **Check if item has `lastError` field:**
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

**🔴 CRITICAL: You MUST strictly follow the steps below to update the todo list and strictly adhere to each step's requirements and standards. Do not skip or modify any step.**

1. **Implement the Computation** (following API Reference)
   - **📖 MANDATORY FIRST STEP: Completely read `./agentspace/knowledge/generator/api-reference.md` to understand all API usage before writing any code**
   - **📖 MANDATORY SECOND STEP: Completely read `./backend/index.ts` to understand all existing implementations from previous tasks**
   - **🔴 SPECIAL CASE 1: `_parent:[parent]` notation**
     - If the computation name contains `_parent:[parent]` (e.g., `_parent:[User]`), this means:
       - You should modify the PARENT entity's computation, not the current entity
       - Example: For `_parent:[User]`, modify the `User` entity's computation that creates Posts
       - This typically occurs when a child entity needs to be created by a parent's Transform computation
       - **How to create child entities**: Use the relation's source/target property name in the parent's Transform return value
       - Example: If `OrderItemRelation` has `sourceProperty: 'items'`, then in Order's Transform:
         ```typescript
         Order.computation = Transform.create({
           record: InteractionEventEntity,
           callback: function(event) {
             if (event.interactionName === 'CreateOrder') {
               return {
                 orderNumber: event.payload.orderNumber,
                 customerName: event.payload.customerName,
                 items: event.payload.items // Creates OrderItem entities via 'items' relation property
               };
             }
             return null;
           }
         });
         ```
   - **🔴 SPECIAL CASE 2: `_owner` notation**
     - If the computation decision is `_owner`, this means:
       - The property's value is fully controlled by its owner entity/relation's computation
       - You should modify the OWNER entity/relation's creation or derivation logic, not add a separate property computation
       - For `controlType: "creation-only"`: Add the property assignment logic in the entity/relation's creation Transform or StateMachine
       - For `controlType: "derived-with-parent"`: The property is part of the parent's derivation computation
       - Example: For a `createdAt` property with `_owner`, add timestamp assignment in the entity's Transform that creates it
   - Add computation code using assignment pattern at end of file:
     ```typescript
     // At end of backend/index.ts, after exports:
     
     // Normal property computation
     User.properties.find(p => p.name === 'postCount').computation = Count.create({
       property: 'posts'
     })
     
     // For _owner properties, modify the owner entity's computation instead:
     Post.computationTarget = Transform.create({
       items: [
         TransformItem.create({
           from: 'InteractionEventEntity',
           name: 'event',
           transform: async function(this: Controller, event: InteractionEventEntity) {
             if (event.interaction === 'CreatePost') {
               // Create the Post entity with _owner properties
               return {
                 title: event.payload.title,
                 content: event.payload.content,
                 createdAt: Math.floor(Date.now() / 1000), // _owner property set here
                 status: 'draft' // _owner property set here
               }
             }
             return null
           }
         })
       ]
     })
     ```
   - Remove any `defaultValue` if adding computation to that property
   - Never use Transform in Property computation
   - For `_owner` properties, always set them in the owner's creation/derivation logic

2. **Type Check**
   - Run `npm run check`
   - Fix all type errors before proceeding to tests

3. **Create Test Case Plan**
   - Read item details from `docs/computation-implementation-plan.json`
   - Check `expandedDependencies` to understand all required dependencies
   - Write test plan comment with: dependencies, test steps, business logic notes
   - Cross-reference with `requirements/interaction-matrix.md` and `docs/data-design.json`
   - **🔴 For `_parent:[parent]` computations**: Test the parent entity's behavior that creates/manages the child entities
   - **🔴 For `_owner` computations**: Test that the property is correctly set when the owner entity/relation is created
   
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
   
   // For _owner computations:
   test('Post.createdAt set by owner computation (_owner)', async () => {
     /**
      * Test Plan for: _owner
      * This tests that createdAt is properly set when Post is created
      * Steps: 1) Trigger interaction that creates Post 2) Verify createdAt is set
      * Business Logic: Post's creation computation sets createdAt timestamp
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

5. **Type Check Test Code**
   - Run `npm run check` to ensure test code has no type errors
   - Fix any type errors in test code before proceeding
   - Do NOT run actual tests until type checking passes

6. **Run Test**
   - Run full test suite: `npm run test tests/basic.test.ts`
   - Must fix any failures (new tests or regressions) before proceeding
   
   **If test fails:**
   - Review test plan - are dependencies properly set up?
   - Verify against `requirements/interaction-matrix.md` and `docs/data-design.json`
   - Check if test data matches `expandedDependencies`
   - Common issues: missing dependencies, wrong operation order, incorrect expectations
   
   **Error handling:**
   - After 10 fix attempts, STOP IMMEDIATELY and wait for user guidance
   - Create error document in `docs/errors/` with test plan, code, error, and attempts
   - Update `lastError` field in computation-implementation-plan.json with error doc path
   - Never skip tests or fake data to pass

7. **Document Progress**
   - **🔴 CRITICAL: Update `docs/computation-implementation-plan.json` based on test results:**
     - **If ALL tests pass** (`npm run test tests/basic.test.ts` shows ALL tests passing):
       - Set `"completed": true`
       - Remove `lastError` field if it exists
     - **If ANY test fails** (including regression tests):
       - Keep `"completed": false` - the computation is NOT done
       - Add/update `lastError` field with path to error document in `docs/errors/`
       - The computation remains incomplete and needs fixing

8. **Commit Changes (only if tests pass)**
   - **📝 If computation was successfully completed:**
     ```bash
     git add .
     git commit -m "feat: Task 3.1.4.3 - Implement [computation_name] computation with tests"
     ```
   - Replace `[computation_name]` with the actual computation name from the plan

9. **Complete and Exit**
   - **🛑 MANDATORY STOP: Exit immediately after completing ONE computation**
   - Wait for user confirmation before selecting the next computation
