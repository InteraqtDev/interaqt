# Test Implementation Guide

## Overview
Testing in interaqt focuses on interactions as the primary way to verify business logic. Since all data creation, updates, and deletions flow through interactions, comprehensive interaction testing provides complete coverage.

## 🔴 CRITICAL: Testing Philosophy

### Core Principles
1. **Test Through Interactions Only**: All business logic testing must use `callInteraction()`
2. **Storage APIs Bypass Validation**: `storage.create/update/delete` are ONLY for test setup
3. **No Entity/Relation Unit Tests**: These are implementation details tested through interactions
4. **Error Handling**: interaqt returns errors in result.error, never throws exceptions

### Common Mistakes
```typescript
// ❌ WRONG: These APIs don't exist
controller.run()
controller.execute()
storage.findByProperty()

// ❌ WRONG: Direct storage manipulation for business logic
await storage.create('Style', { ... })  // Bypasses ALL validation!

// ❌ WRONG: Try-catch for errors
try {
  await controller.callInteraction(...)
} catch (e) {
  // interaqt doesn't throw exceptions
}

// ✅ CORRECT: Test through interactions
const result = await controller.callInteraction('CreateStyle', { ... })
expect(result.error).toBeUndefined()
```

## Test Setup Pattern

### Basic Test Structure
```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, PGLiteDB, MatchExp } from 'interaqt'
import { entities, relations, interactions } from '../backend'

describe('Feature Tests', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    // Create fresh system for each test
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller(
      system,
      entities,
      relations,
      [],           // activities (4th parameter)
      interactions, // interactions (5th parameter)
      [],           // global dictionaries (6th parameter)
      []            // side effects (7th parameter)
    )

    await controller.setup(true)
  })
})
```

## 🔴 CRITICAL: Always Specify attributeQuery

When using `findOne` or `find`, you MUST specify which fields to retrieve:

```typescript
// ❌ WRONG: Only returns { id: '...' }
const user = await system.storage.findOne('User',
  MatchExp.atom({ key: 'email', value: ['=', 'test@example.com'] })
)
console.log(user.name)  // undefined!

// ✅ CORRECT: Returns all specified fields
const user = await system.storage.findOne('User',
  MatchExp.atom({ key: 'email', value: ['=', 'test@example.com'] }),
  undefined,  // modifier
  ['id', 'name', 'email', 'role', 'status']  // attributeQuery
)
console.log(user.name)  // 'Test User' ✓
```

## Best Practices

### DO
- Test all business scenarios through interactions
- Use descriptive test names following test case IDs
- Verify both success and error paths
- Check computed values update correctly
- Test edge cases and boundary conditions

### DON'T
- Don't use storage APIs for business logic testing
- Don't test framework mechanics (entity/relation creation)
- Don't use try-catch for error handling
- Don't forget attributeQuery in find operations
- Don't test implementation details

## Validation Checklist
- [ ] All tests use callInteraction for business logic
- [ ] Storage APIs only used for test setup
- [ ] All findOne/find calls include attributeQuery
- [ ] Error checking uses result.error pattern
- [ ] Test covers success and failure scenarios
- [ ] Computed values verified after interactions
- [ ] No try-catch blocks for error handling
