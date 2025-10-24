---
name: computation-generation-handler
description: when task 3.1.4.3
model: inherit
color: blue
---

**⚠️ IMPORTANT: Strictly follow the steps below to execute the task. Do not compress content or skip any steps.**


## START: Select Next Uncompleted Item

**📖 FIRST: Determine current module and confirm context.**

**🔴 STEP 0: Determine Current Module**
1. Read module name from `.currentmodule` file in project root
2. If file doesn't exist, STOP and ask user which module to work on
3. Use this module name for all subsequent file operations
4. Module status file location: `docs/{module}.status.json`

**📖 Reference** 
- `./backend/crud.example.ts` + `./tests/crud.example.test.ts` - Simple CRUD operations with state machines, relations, and permissions
- `./backend/versionControl.example.ts` + `./tests/versionControl.example.test.ts` - Version control with soft delete pattern
- `./backend/versionControlHardDelete.example.ts` + `./tests/versionControlHardDelete.example.test.ts` - Version control with hard delete pattern
- `./agentspace/knowledge/generator/computation-implementation.md` - Detailed computation implementation patterns and examples


**🔴 CRITICAL: Module-Based File Naming**
- Read module name from `.currentmodule` and use it as file prefix
- All file references must use `{module}.` prefix format

**🔴 CRITICAL: Implement ONLY ONE computation per session, then STOP and wait for user confirmation.**

1. **Read `docs/{module}.computation-implementation-plan.json`** to find the FIRST item with `completed: false`
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
   - Confirm test expectations match business requirements
   - Review similar successful computations for patterns

3. **Apply Fix Based on Analysis**:
   - **Implementation Issue** → Fix computation code in `backend/{module}.ts` (refer to API reference)
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
   - **📖 MANDATORY SECOND STEP: Completely read `./backend/{module}.ts` to understand all existing implementations from previous tasks**
   - **📖 MANDATORY THIRD STEP: Study the reference example files above to understand the standard code structure and computation patterns**
   - **🔴 CRITICAL: Recognize Split Computation Nodes** - If the current item's ID contains `@InteractionName` (e.g., `Entity@CreateInteraction`, `Entity@UpdateInteraction`):
     - This indicates the entity/relation can be created through multiple interaction paths
     - Multiple nodes with same entity name but different `@InteractionName` suffixes represent ONE unified computation with multiple trigger paths
     - **First node implementation**: Design the Transform to support ALL interactions from the start, even if you're only implementing the first path. Check the plan file for other nodes with the same entity name to see all interaction paths.
     - **Subsequent nodes**: Add new interaction branch to the existing Transform, don't create separate computation
     - Use `event.interactionName` or match conditions to branch between different interaction paths within a single Transform callback
     - All nodes with same entity name share the same `ownerProperties` and `createdWithRelations` - implement them once in the unified Transform
     - Example: `User@CreateUser` and `User@ImportUser` should result in ONE `User.computation` Transform with two branches
   - **🔴 CRITICAL: Check for existing computations** - If the target entity/relation already has computation code:
     - **NEVER overwrite** existing computation logic
     - **ADD branch logic** to handle the new interaction/scenario within existing Transform callback
     - **PRESERVE all existing branches** to ensure previous test cases continue to pass
     - Example: Add `else if` conditions or extend existing conditions in Transform callback
   - **⚠️ Regression Prevention**: All previous tests must continue passing after adding new computation branches
   - **Note**: The backend file is `./backend/{module}.ts` where {module} is from `.currentmodule`
   - **🔴 CRITICAL: NO DATA MUTATIONS IN COMPUTATIONS** - Computations must NEVER directly use `this.system.storage.create()`, `this.system.storage.update()`, or `this.system.storage.delete()`:
     - ❌ **FORBIDDEN**: `await this.system.storage.create('Entity', {...})` in computation code
     - ❌ **FORBIDDEN**: `await this.system.storage.update('Entity', MatchExp..., {...})` in computation code
     - ❌ **FORBIDDEN**: `await this.system.storage.delete('Entity', MatchExp...)` in computation code
     - ✅ **ALLOWED**: `await this.system.storage.find()` or `await this.system.storage.findOne()` to READ data
     - **WHY**: Computations are reactive and should only compute values based on existing data. Data mutations should happen through Interactions or RecordMutationSideEffect, NOT in computations
     - **IF YOU NEED TO MUTATE DATA**: Use Interactions (for user-triggered actions) or RecordMutationSideEffect (for reactive side effects)
   - **🔴 CRITICAL: NO MOCK DATA OR PLACEHOLDERS** - The reactive framework is complete and powerful. Every computation must be fully implemented:
     - ❌ **FORBIDDEN**: `return 100 // TODO: implement later`
     - ❌ **FORBIDDEN**: `return 0 // Placeholder`
     - ❌ **FORBIDDEN**: `if (record.id === 'test') return mockValue`
     - ✅ **REQUIRED**: Complete implementation with real data queries and calculations
     - **IF DATA IS MISSING**: Add it to the data model (entities/relations/properties)
     - **IF CALCULATION IS COMPLEX**: Break it down into steps, but implement all steps
   - **🔴 CRITICAL: NO SIDE EFFECTS IN COMPUTATIONS** - Side effects (email, AI calls, external APIs) must be in integrations:
     - ❌ **FORBIDDEN**: `await sendEmail(...)` in computation code
     - ❌ **FORBIDDEN**: `await callOpenAI(...)` in computation code
     - ❌ **FORBIDDEN**: `await stripeAPI.charge(...)` in computation code
     - ✅ **CORRECT**: Create separate integration (see `implement-integration-handler`)
     - **COMPUTATION ROLE**: Read data → Calculate → Return value (pure reactive computation)
     - **INTEGRATION ROLE**: Handle all side effects triggered by data changes
   - **🔴 CRITICAL: API Call Entity Property Computations** - If implementing Property computation for API Call entities that depend on Integration Event entities:
     - **Key Matching Pattern**: Find the affected API Call record by matching `externalId` fields
     - **Why**: Both API Call entity and Integration Event entity have `externalId` field that records the external API task/job ID
     - **Pattern**: Use `event.externalId` to query and find the corresponding API Call record with matching `externalId`
     - **Example**: When VolcTTSEvent arrives, find the corresponding VolcTTSCall record where `VolcTTSCall.externalId === event.externalId`
     - **🔴 Special Case - externalId Property**:
       - The `externalId` property is computed from the integration event with `eventType: 'initialized'`
       - The 'initialized' event ALWAYS contains both `entityId` (the API Call's id) and `externalId` (from external system)
       - This event establishes the link between API Call entity and external task/job ID
       - Use `event.entityId` to find the API Call record when processing 'initialized' events
       - Subsequent events (processing/completed/failed) use `externalId` for matching
     - This pattern enables reactive updates to API Call status/result properties based on external system events
   - **🔴 CRITICAL: Entity nodes with ownerProperties** - If the current item has `ownerProperties` field:
     - These are `_owner` type properties that must be set in the entity's creation computation
     - Include ALL ownerProperties in the owner entity computation return value when creating the entity
   - **🔴 CRITICAL: Entity nodes with createdWithRelations** - If the current item has `createdWithRelations` field:
     - These are `created-with-entity` type relations that must be created together with the entity
     - Read `docs/{module}.data-design.json` to find the `sourceProperty` or `targetProperty` name for each relation
     - In the entity's computation, return these property names with corresponding data to create relations
     - Framework will automatically create relation records based on these property values. Example:
     ```typescript
     // Entity with createdWithRelations (create relations via property names)
     Order.computation = Transform.create({
      eventDeps: {
        orderInteraction: {
          recordName: InteractionEventEntity.name,
          type: 'create',
          record: {
            interactionName: 'createOrder'
          }
        }
      },
      callback: async function(event) {
        return {
          orderNumber: event.payload.orderNumber,
          owner: event.user // Creates OrderOwner relations via 'owner' sourceProperty
        }
      }
     })
     ```
   - **🔴 SPECIAL CASE 1: `_parent:[parent]` notation**
     - If the computation name contains `_parent:[parent]` (e.g., `_parent:[User]`), this means:
       - You should modify the PARENT entity's computation, not the current entity
       - Example: For `_parent:[User]`, modify the `User` entity's computation that creates Posts
       - This typically occurs when a child entity needs to be created by a parent's Transform computation
       - **📍 Finding the parent entity**: You can find the parent entity name in the current item's `lifecycle.creation.parent` field
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
   - Add computation code using assignment pattern at end of file:
     ```typescript
     // At end of backend/{module}.ts, after exports:
     // Property computation
     const userProperty = User.properties.find(p => p.name === 'postCount')!
     userProperty.computation = Count.create({
       property: 'posts'
     })
   - Remove any `defaultValue` if adding computation to that property
   - Never use Transform in Property computation
   - For `_owner` properties, always set them in the owner's creation/derivation logic

2. **Type Check**
   - Run `npm run check`
   - Fix all type errors before proceeding to tests

3. **Create Test Case Plan**
   - Read item details from `docs/{module}.computation-implementation-plan.json`
   - Check `expandedDependencies` to understand all required dependencies
   - Write test plan comment with: dependencies, test steps, business logic notes
   - Cross-reference with `docs/{module}.data-design.json`
   - **🔴 For split computation nodes** (ID contains `@InteractionName`): Write a separate test for the specific interaction path this node represents, even though the implementation is a unified Transform. Each node's test verifies its particular trigger path works correctly.
   - **🔴 For entity nodes with `ownerProperties`**: Test entity creation AND verify ALL ownerProperties are correctly set
   - **🔴 For entity nodes with `createdWithRelations`**: Test entity creation AND query each relation to verify it was created with correct source/target
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
   
   // For split computation nodes (same entity, different interaction paths):
   test('VolcanoEngineStreamURLCall entity via CreateLivestreamRoom (Node: VolcanoEngineStreamURLCall@CreateLivestreamRoom)', async () => {
     /**
      * Test Plan for: VolcanoEngineStreamURLCall@CreateLivestreamRoom
      * Note: This tests ONE trigger path of the unified Transform computation
      * Steps: 1) Trigger CreateLivestreamRoom 2) Verify VolcanoEngineStreamURLCall created with correct properties
      * Business Logic: API call entity auto-created when room is created
      */
     // Implementation...
   })
   
   test('VolcanoEngineStreamURLCall entity via RetryStreamURLGeneration (Node: VolcanoEngineStreamURLCall@RetryStreamURLGeneration)', async () => {
     /**
      * Test Plan for: VolcanoEngineStreamURLCall@RetryStreamURLGeneration
      * Note: This tests ANOTHER trigger path of the SAME unified Transform computation
      * Steps: 1) Trigger RetryStreamURLGeneration 2) Verify new VolcanoEngineStreamURLCall created
      * Business Logic: New API call created when user retries URL generation
      */
     // Implementation...
   })
   
   // For entity with ownerProperties:
   test('Post entity creation with ownerProperties', async () => {
     /**
      * Test Plan for: Post entity (with ownerProperties: [createdAt, status])
      * This tests the entity creation AND all ownerProperties
      * Steps: 1) Create Post via interaction 2) Verify entity exists 3) Verify ALL ownerProperties are set
      * Business Logic: Post creation sets createdAt timestamp and initial status
      */
     // Implementation...
   })
   
   // For entity with createdWithRelations:
   test('Order entity with createdWithRelations', async () => {
     /**
      * Test Plan for: Order entity (with createdWithRelations: [OrderItemRelation])
      * Steps: 1) Create Order 2) Verify Order exists 3) Query each relation to verify creation
      * Note: Check relation source/target are correctly linked
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
   - Add test to `tests/{module}.business.test.ts` in 'Basic Functionality' describe group
   - Follow the test plan created above
   - **📖 Reference the example test files above for testing patterns and structure**
   - For StateMachine computations, test ALL StateTransfer transitions
   - Test all CRUD operations the computation supports
   
   **🔴 CRITICAL: When querying Relations in tests:**
   - ALWAYS use the relation instance's `.name` property: `storage.find(UserPostRelation.name, ...)`
   - NEVER hardcode relation names: `storage.find('UserPostRelation', ...)` ❌
   - This ensures tests work regardless of whether relation names are manually specified or auto-generated
   
   **⚠️ Testing Integration Event Entity Computations:**
   - When testing computations based on **Integration Event Entities** (NOT InteractionEventEntity):
     - Use `controller.system.storage.create('${EventEntityName}', {...})` to directly create event records
     - Do NOT use `controller.callInteraction()` - integration events are created by external systems
     - Example: For StripePaymentEvent entity, use `controller.system.storage.create(StripePaymentEvent.name, { transactionId: '...', paymentStatus: 'success', ... })`
     - This simulates the webhook/callback from external systems that creates these events
   - When testing computations based on **InteractionEventEntity**:
     - Use `controller.callInteraction()` as normal - these are triggered by user interactions
   
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
   
   test('Post entity with ownerProperties (createdAt, status)', async () => {
     // Create Post - ownerProperties should be set by entity's Transform
     const result = await controller.callInteraction('CreatePost', {
       user: testUser,
       payload: { title: 'Test Post', content: 'Content' }
     })
     
     // Verify entity creation AND all ownerProperties
     const post = await system.storage.findOne(
       'Post',
       MatchExp.atom({ key: 'id', value: ['=', result.data.id] }),
       undefined,
       ['id', 'title', 'createdAt', 'status'] // Include ALL ownerProperties in attributeQuery
     )
     
     expect(post.title).toBe('Test Post')
     expect(post.createdAt).toBeGreaterThan(0) // ownerProperty: createdAt
     expect(post.status).toBe('draft') // ownerProperty: status
   })
   
   test('Order entity with createdWithRelations (OrderItemRelation)', async () => {
     // Create Order with items - relations created automatically via sourceProperty
     const result = await controller.callInteraction('CreateOrder', {
       user: testUser,
       payload: { 
         orderNumber: 'ORD001',
         items: [{ productId: 'P1', quantity: 2 }, { productId: 'P2', quantity: 1 }]
       }
     })
     
     // Verify Order exists
     const order = await system.storage.findOne('Order',
       MatchExp.atom({ key: 'id', value: ['=', result.data.id] }),
       undefined, ['id', 'orderNumber']
     )
     expect(order.orderNumber).toBe('ORD001')
     
     // Verify ALL relations in createdWithRelations are created
     const relations = await system.storage.find(OrderItemRelation.name,
       MatchExp.atom({ key: 'source.id', value: ['=', order.id] }),
       undefined,
       ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id', 'productId'] }]]
     )
     expect(relations.length).toBe(2)
     expect(relations[0].target.productId).toBe('P1')
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
   
   // Example: Testing Integration Event Entity computations
   test('Order.paymentStatus computed from StripePaymentEvent', async () => {
     /**
      * Test Plan: Testing computation based on Integration Event Entity
      * This tests computations triggered by external system events (StripePaymentEvent)
      * Use storage.create() to simulate webhook data, NOT callInteraction()
      */
     
     // Create an order first (via interaction)
     const orderResult = await controller.callInteraction('CreateOrder', {
       user: testUser,
       payload: { orderNumber: 'ORD001', amount: 100 }
     })
     
     // Simulate webhook from payment gateway by directly creating StripePaymentEvent
     // This mimics external system (Stripe/Alipay) sending payment confirmation
     await controller.system.storage.create(StripePaymentEvent.name, {
       transactionId: 'txn_123456',
       paymentStatus: 'success',
       orderId: orderResult.data.id,
       timestamp: Math.floor(Date.now() / 1000)
     })
     
     // Verify the computation triggered by StripePaymentEvent updated Order
     const order = await system.storage.findOne(
       'Order',
       MatchExp.atom({ key: 'id', value: ['=', orderResult.data.id] }),
       undefined,
       ['id', 'paymentStatus']
     )
     
     expect(order.paymentStatus).toBe('paid')
   })
   ```

5. **Type Check Test Code**
   - Run `npm run check` to ensure test code has no type errors
   - Fix any type errors in test code before proceeding
   - Do NOT run actual tests until type checking passes

6. **Run Test**
   - Run full test suite: `npm run test tests/{module}.business.test.ts`
   - Must fix any failures (new tests or regressions) before proceeding
   
   **If test fails:**
   - Review test plan - are dependencies properly set up?
   - Verify against `docs/{module}.data-design.json`
   - Check if test data matches `expandedDependencies`
   - Common issues: missing dependencies, wrong operation order, incorrect expectations
   
   **Error handling:**
   - After 10 fix attempts, STOP IMMEDIATELY and wait for user guidance
   - Create error document in `docs/errors/{module}.{error-name}.md` with test plan, code, error, and attempts
   - Update `lastError` field in `docs/{module}.computation-implementation-plan.json` with error doc path
   - Never skip tests or fake data to pass

7. **Document Progress**
   - **🔴 CRITICAL: Update `docs/{module}.computation-implementation-plan.json` based on test results:**
     - **If ALL tests pass** (`npm run test tests/{module}.business.test.ts` shows ALL tests passing):
       - Set `"completed": true` for the CURRENT node being worked on
       - Remove `lastError` field if it exists
       - **For split computation nodes**: Mark completed only after the specific interaction path is implemented and tested. The unified Transform implementation happens progressively across nodes, but each node tracks completion of its trigger path.
     - **If ANY test fails** (including regression tests):
       - Keep `"completed": false` - the computation is NOT done
       - Add/update `lastError` field with path to error document in `docs/errors/{module}.{error-name}.md`
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
