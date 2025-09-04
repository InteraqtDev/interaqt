---
name: permission-generation-handler
description: when task 3.2.2
model: inherit
color: red
---

**⚠️ IMPORTANT: Strictly follow the steps below to execute the task. Do not compress content or skip any steps.**

## START: Select Next Uncompleted Item

**📖 MUST READ FIRST:**
- `./agentspace/knowledge/generator/permission-implementation.md`
- `./agentspace/knowledge/generator/permission-test-implementation.md`

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

1. **Select Rule to Implement**
  - [ ] Read `docs/business-rules-and-permission-control-implementation-plan.json`
  - [ ] Select the **FIRST** item with `"completed": false`
  - [ ] **🔴 CRITICAL: Implement ONLY ONE rule at a time - do not select multiple items**
  - [ ] Note the rule ID and description for implementation

2. **Implement the Rule**
  - **📖 MANDATORY FIRST STEP: Completely read `./agentspace/knowledge/generator/api-reference.md` to understand all API usage before writing any code**
  - **📖 MANDATORY SECOND STEP: Completely read `./backend/index.ts` to understand all existing implementations from previous tasks**
  - [ ] **Use assignment pattern (`Interaction.conditions = ...`)** to add conditions at the end of `./backend/index.ts` file
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
           MatchExp.atom({ key: 'userId', value: ['=', event.user.id] })
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

3. **Type Check**
  - [ ] Run `npm run check` to ensure TypeScript compilation passes
  - [ ] Fix ALL type errors before proceeding
  - [ ] Do NOT write tests until type checking passes

4. **Write Focused Test Cases**
  - [ ] Add test cases in `tests/permission.test.ts` under the 'Permission and Business Rules' describe group
  - [ ] Test EVERY scenario listed in the implementation plan
  - [ ] Test both success and failure cases
  - [ ] **🔴 CRITICAL: Always explicitly check `result.error` after `controller.callInteraction`:**
    - For expected success: `expect(result.error).toBeUndefined()`
    - For expected permission failures: `expect(result.error).toBeDefined()`
    - **WHY:** In permission tests, interaction errors are returned as data, not thrown. Without explicit checks, failed interactions could be silently ignored.

5. **Type Check Test Code**
  - Run `npm run check` to ensure test code has no type errors
  - Fix any type errors in test code before proceeding
  - Do NOT run actual tests until type checking passes
   
6. **Run Test**
  - First run type check: `npm run check` to ensure test code has no type errors
  - Run full test suite: `npm run test tests/permission.test.ts`
  - Must fix any failures (new tests or regressions) before proceeding
  
  **If test fails:**
  - Review permission condition logic - is the business rule correctly implemented?
  - Verify user roles and permissions are properly set up in test data
  - Check interaction payload matches expected structure
  - Verify against `requirements/interaction-matrix.md` for correct permission requirements
  - Common issues: incorrect role checks, wrong condition logic
  
  **🔴 CRITICAL: Never cheat to pass tests:**
  - ❌ Do NOT mark tests as `.skip()` or `.todo()`
  - ❌ Do NOT fake/mock data just to make tests pass
  - ❌ Do NOT remove or ignore critical assertions
  
  **Error handling:**
  - After 10 fix attempts, STOP IMMEDIATELY and wait for user guidance
  - Create error document in `docs/errors/` with descriptive filename (e.g., `permission-admin-error.md`)
  - Update `lastError` field in business-rules-and-permission-control-implementation-plan.json with error doc path
  - Never skip tests or fake data to pass

7. **Document Progress**
  - **🔴 CRITICAL: Update `docs/business-rules-and-permission-control-implementation-plan.json` based on test results:**
    - **If ALL tests pass** (`npm run test tests/permission.test.ts` shows ALL tests passing):
      - Set `"completed": true`
      - Remove `lastError` field if it exists
    - **If ANY test fails** (including regression tests):
      - Keep `"completed": false` - the item is NOT done
      - Add/update `lastError` field with path to error document in `docs/errors/`
      - The item remains incomplete and needs fixing

8. **Commit Changes (only if tests pass)**
  - **📝 If rule was successfully implemented:**
    ```bash
    git add .
    git commit -m "feat: Task 3.2.2 - Implement [rule_id] [rule_description]"
    ```
  - Replace `[rule_id]` and `[rule_description]` with actual values from the implementation plan

9. **Complete and Exit**
  - **🛑 MANDATORY STOP: Exit immediately after completing ONE item**
  - Wait for user confirmation before selecting the next item
