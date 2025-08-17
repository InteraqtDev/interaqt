# Permission Test Implementation Guide

## Overview
Permission testing verifies that conditions correctly control access to interactions. Tests should cover both allowed and denied scenarios for different user roles and data states.

### Key Testing Pattern
When testing permission failures, always verify:
1. **Error exists**: `expect(result.error).toBeDefined()`
2. **Error type**: `expect(result.error.type).toBe('condition check failed')`
3. **Which condition failed**: `expect(result.error.error.data.name).toBe('ConditionName')`

This detailed verification helps identify exactly which permission check failed, making debugging easier.

## 🔴 CRITICAL: Permission Testing Principles

### Error Handling Pattern
```typescript
// ❌ WRONG: interaqt doesn't throw exceptions
try {
  await controller.callInteraction('DeleteStyle', { 
    user: viewer,
    payload: { style: { id: styleId } }
  })
  fail('Should have thrown')
} catch (e) {
  // This will never execute
}

// ✅ CORRECT: Check error in result with detailed verification
const result = await controller.callInteraction('DeleteStyle', { 
  user: viewer,
  payload: { style: { id: styleId } }
})
expect(result.error).toBeDefined()
expect(result.error.type).toBe('condition check failed')
// Verify which specific condition failed
expect(result.error.error.data.name).toBe('AdminRole')
```

### Common Error Types
- `'no permission'` → Never used (legacy)
- `'condition check failed'` → What you'll actually see

## Testing Permission Patterns

### 1. Role-Based Permission Test

Define permissions:

```typescript
import { Condition, BoolExp, Conditions, Interaction, Action, Payload, PayloadItem, MatchExp } from 'interaqt'

// Step 1: Define Conditions
export const AdminRole = Condition.create({
  name: 'AdminRole',
  content: async function(this: Controller, event) {
    return event.user?.role === 'admin'
  }
})

export const OperatorRole = Condition.create({
  name: 'OperatorRole',
  content: async function(this: Controller, event) {
    return event.user?.role === 'operator'
  }
})

export const StyleNotOffline = Condition.create({
  name: 'StyleNotOffline',
  content: async function(this: Controller, event) {
    const styleId = event.payload?.style?.id
    if (!styleId) return false
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['status']
    )
    
    return style?.status !== 'offline'
  }
})

// Step 2: Create Interaction with Permissions
export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'deleteStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true
      })
    ]
  }),
  conditions: AdminRole  // Only admin can delete
})
```

Test implementation:

```typescript
test('role-based permission', async () => {
  // Step 1: Create test users
  const admin = await system.storage.create('User', {
    name: 'Admin',
    role: 'admin'
  })
  
  const operator = await system.storage.create('User', {
    name: 'Operator',
    role: 'operator'
  })
  
  const viewer = await system.storage.create('User', {
    name: 'Viewer',
    role: 'viewer'
  })
  
  // Step 2: Create test data
  const style = await system.storage.create('Style', {
    label: 'Test Style',
    status: 'published'
  })
  
  // Step 3: Test admin (allowed)
  const adminResult = await controller.callInteraction('DeleteStyle', {
    user: admin,
    payload: { style: { id: style.id } }
  })
  expect(adminResult.error).toBeUndefined()
  
  // Step 4: Test operator (denied)
  const operatorResult = await controller.callInteraction('DeleteStyle', {
    user: operator,
    payload: { style: { id: style.id } }
  })
  expect(operatorResult.error).toBeDefined()
  expect(operatorResult.error.type).toBe('condition check failed')
  expect(operatorResult.error.error.data.name).toBe('AdminRole')
  
  // Step 5: Test viewer (denied)
  const viewerResult = await controller.callInteraction('DeleteStyle', {
    user: viewer,
    payload: { style: { id: style.id } }
  })
  expect(viewerResult.error).toBeDefined()
  expect(viewerResult.error.type).toBe('condition check failed')
  expect(viewerResult.error.error.data.name).toBe('AdminRole')
})
```

### 2. Combined Permission Test

```typescript
// Define combined permission
export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true
      })
    ]
  }),
  // Admin OR Operator AND style not offline
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole)
      .or(BoolExp.atom(OperatorRole))
      .and(BoolExp.atom(StyleNotOffline))
  })
})

// Test implementation
test('combined permissions with BoolExp', async () => {
  // Create users
  const admin = await system.storage.create('User', {
    name: 'Admin',
    role: 'admin'
  })
  
  const operator = await system.storage.create('User', {
    name: 'Operator', 
    role: 'operator'
  })
  
  const viewer = await system.storage.create('User', {
    name: 'Viewer',
    role: 'viewer'
  })
  
  // Create styles
  const publishedStyle = await system.storage.create('Style', {
    label: 'Published Style',
    status: 'published'
  })
  
  const offlineStyle = await system.storage.create('Style', {
    label: 'Offline Style',
    status: 'offline'
  })
  
  // Test admin with published style (allowed)
  const result1 = await controller.callInteraction('UpdateStyle', {
    user: admin,
    payload: { style: { id: publishedStyle.id } }
  })
  expect(result1.error).toBeUndefined()
  
  // Test operator with published style (allowed)
  const result2 = await controller.callInteraction('UpdateStyle', {
    user: operator,
    payload: { style: { id: publishedStyle.id } }
  })
  expect(result2.error).toBeUndefined()
  
  // Test viewer with published style (denied)
  const result3 = await controller.callInteraction('UpdateStyle', {
    user: viewer,
    payload: { style: { id: publishedStyle.id } }
  })
  expect(result3.error).toBeDefined()
  expect(result3.error.type).toBe('condition check failed')
  // With combined conditions, the first failing condition is reported
  expect(result3.error.error.data.name).toBeDefined()
  
  // Test admin with offline style (denied - even admin can't update offline)
  const result4 = await controller.callInteraction('UpdateStyle', {
    user: admin,
    payload: { style: { id: offlineStyle.id } }
  })
  expect(result4.error).toBeDefined()
  expect(result4.error.type).toBe('condition check failed')
  expect(result4.error.error.data.name).toBe('StyleNotOffline')
})
```

### 3. Resource-Based Permission Test

```typescript
// Define owner check
export const OwnerOnly = Condition.create({
  name: 'OwnerOnly',
  content: async function(this: Controller, event) {
    const styleId = event.payload?.style?.id
    if (!styleId) return false
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['creator']  // Must specify attributeQuery!
    )
    
    return style?.creator?.id === event.user?.id
  }
})

// Interaction that allows owner or admin
export const DeleteOwnStyle = Interaction.create({
  name: 'DeleteOwnStyle',
  action: Action.create({ name: 'deleteOwnStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true
      })
    ]
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(OwnerOnly).or(BoolExp.atom(AdminRole))
  })
})

// Test
test('resource ownership permission', async () => {
  // Create users
  const owner = await system.storage.create('User', {
    name: 'Owner',
    role: 'user'
  })
  
  const otherUser = await system.storage.create('User', {
    name: 'Other User',
    role: 'user'
  })
  
  const admin = await system.storage.create('User', {
    name: 'Admin',
    role: 'admin'
  })
  
  // Create style with owner
  const style = await system.storage.create('Style', {
    label: 'My Style',
    creator: { id: owner.id }
  })
  
  // Owner can delete (allowed)
  const ownerResult = await controller.callInteraction('DeleteOwnStyle', {
    user: owner,
    payload: { style: { id: style.id } }
  })
  expect(ownerResult.error).toBeUndefined()
  
  // Other user cannot delete (denied)
  const otherResult = await controller.callInteraction('DeleteOwnStyle', {
    user: otherUser,
    payload: { style: { id: style.id } }
  })
  expect(otherResult.error).toBeDefined()
  expect(otherResult.error.type).toBe('condition check failed')
  // Should fail on OwnerOnly condition
  expect(otherResult.error.error.data.name).toBe('OwnerOnly')
  
  // Admin can delete any style (allowed)
  const adminResult = await controller.callInteraction('DeleteOwnStyle', {
    user: admin,
    payload: { style: { id: style.id } }
  })
  expect(adminResult.error).toBeUndefined()
})
```

### 4. Payload Condition Test

Define payload conditions:

```typescript
// Check if style is published
export const CheckPublishedStyle = Condition.create({
  name: 'CheckPublishedStyle',
  content: async function(this: Controller, event) {
    const styleId = event.payload?.style?.id
    if (!styleId) return false
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['status']
    )
    
    return style && style.status === 'published'
  }
})

// Apply to interaction
export const ShareStyle = Interaction.create({
  name: 'ShareStyle',
  action: Action.create({ name: 'shareStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true
      })
    ]
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(CheckPublishedStyle).and(BoolExp.atom(OperatorRole))
  })
})

// Test payload validation
test('payload validation in conditions', async () => {
  const operator = await system.storage.create('User', {
    name: 'Operator',
    role: 'operator'
  })
  
  const publishedStyle = await system.storage.create('Style', {
    label: 'Published',
    status: 'published'
  })
  
  const draftStyle = await system.storage.create('Style', {
    label: 'Draft',
    status: 'draft'
  })
  
  // Published style can be shared (allowed)
  const result1 = await controller.callInteraction('ShareStyle', {
    user: operator,
    payload: { style: { id: publishedStyle.id } }
  })
  expect(result1.error).toBeUndefined()
  
  // Draft style cannot be shared (denied)
  const result2 = await controller.callInteraction('ShareStyle', {
    user: operator,
    payload: { style: { id: draftStyle.id } }
  })
  expect(result2.error).toBeDefined()
  expect(result2.error.type).toBe('condition check failed')
  // Should fail on CheckPublishedStyle condition
  expect(result2.error.error.data.name).toBe('CheckPublishedStyle')
})
```

## Best Practices for Permission Testing

### 1. Test All Branches
```typescript
test('comprehensive permission coverage', async () => {
  // Test all roles
  const roles = ['admin', 'operator', 'viewer', 'user']
  
  for (const role of roles) {
    const user = await system.storage.create('User', {
      name: `${role} user`,
      role: role
    })
    
    const result = await controller.callInteraction('AdminOnlyAction', {
      user: user
    })
    
    if (role === 'admin') {
      expect(result.error).toBeUndefined()
    } else {
      expect(result.error).toBeDefined()
      expect(result.error.type).toBe('condition check failed')
      expect(result.error.error.data.name).toBe('AdminRole')
    }
  }
})
```

### 2. Test Edge Cases
```typescript
test('edge cases in permissions', async () => {
  // Test with null user
  const result1 = await controller.callInteraction('RequireAuth', {
    user: null
  })
  expect(result1.error).toBeDefined()
  
  // Test with missing payload data
  const user = await system.storage.create('User', { role: 'admin' })
  const result2 = await controller.callInteraction('UpdateStyle', {
    user: user,
    payload: {} // Missing style
  })
  expect(result2.error).toBeDefined()
  
  // Test with non-existent resource
  const result3 = await controller.callInteraction('UpdateStyle', {
    user: user,
    payload: { style: { id: 'non-existent-id' } }
  })
  expect(result3.error).toBeDefined()
})
```

### 3. Test Complex Conditions
```typescript
test('complex permission logic', async () => {
  // Define time-based condition
  const BusinessHours = Condition.create({
    name: 'BusinessHours',
    content: async function(this: Controller, event) {
      const hour = new Date().getHours()
      return hour >= 9 && hour < 17
    }
  })
  
  // Active user check
  const ActiveUser = Condition.create({
    name: 'ActiveUser',
    content: async function(this: Controller, event) {
      return event.user?.status === 'active'
    }
  })
  
  // Complex interaction
  const SensitiveAction = Interaction.create({
    name: 'SensitiveAction',
    action: Action.create({ name: 'sensitive' }),
    conditions: Conditions.create({
      content: BoolExp.atom(AdminRole)
        .and(BoolExp.atom(ActiveUser))
        .and(BoolExp.atom(BusinessHours))
    })
  })
  
  // Test all combinations
  const activeAdmin = await system.storage.create('User', {
    role: 'admin',
    status: 'active'
  })
  
  const inactiveAdmin = await system.storage.create('User', {
    role: 'admin',
    status: 'inactive'
  })
  
  // Mock time if needed for consistent tests
  // ... test logic
})
```

### 4. Verify Detailed Error Information
```typescript
test('verify detailed condition error information', async () => {
  // When a condition fails, verify all error details
  const result = await controller.callInteraction('AdminOnlyAction', {
    user: normalUser
  })
  
  // Basic error checks
  expect(result.error).toBeDefined()
  expect(result.error.type).toBe('condition check failed')
  
  // Detailed error verification - identify which condition failed
  expect(result.error.error.data.name).toBe('AdminRole')
  
  // For combined conditions, test each failure scenario
  const complexResult = await controller.callInteraction('ComplexAction', {
    user: unverifiedAdmin  // Admin but not verified
  })
  expect(complexResult.error).toBeDefined()
  expect(complexResult.error.type).toBe('condition check failed')
  // Should report the specific condition that failed
  expect(complexResult.error.error.data.name).toBe('EmailVerified')
})

test('meaningful error messages', async () => {
  // Define condition with custom error
  const CustomError = Condition.create({
    name: 'CustomError',
    content: async function(this: Controller, event) {
      if (!event.user) {
        event.error = 'User authentication required'
        return false
      }
      if (event.user.credits < 10) {
        event.error = 'Insufficient credits (minimum: 10)'
        return false
      }
      return true
    }
  })
  
  // Test error messages
  const poorUser = await system.storage.create('User', {
    credits: 5
  })
  
  const result = await controller.callInteraction('PremiumAction', {
    user: poorUser
  })
  
  expect(result.error).toBeDefined()
  expect(result.error.type).toBe('condition check failed')
  expect(result.error.error.data.name).toBe('CustomError')
  expect(result.error.message).toContain('Insufficient credits')
})
```

### 5. Test State-Dependent Permissions
```typescript
test('state-dependent permissions', async () => {
  // User must have verified email
  const VerifiedEmail = Condition.create({
    name: 'VerifiedEmail',
    content: async function(this: Controller, event) {
      return event.user?.emailVerified === true
    }
  })
  
  // User must not be banned
  const NotBanned = Condition.create({
    name: 'NotBanned',
    content: async function(this: Controller, event) {
      return event.user?.banned !== true
    }
  })
  
  // Apply multiple state checks
  const PostComment = Interaction.create({
    name: 'PostComment',
    action: Action.create({ name: 'postComment' }),
    conditions: Conditions.create({
      content: BoolExp.atom(VerifiedEmail).and(BoolExp.atom(NotBanned))
    })
  })
  
  // Test various user states
  const verifiedUser = await system.storage.create('User', {
    emailVerified: true,
    banned: false
  })
  
  const unverifiedUser = await system.storage.create('User', {
    emailVerified: false,
    banned: false
  })
  
  const bannedUser = await system.storage.create('User', {
    emailVerified: true,
    banned: true
  })
  
  // Only verified, non-banned user can post
  const result1 = await controller.callInteraction('PostComment', {
    user: verifiedUser
  })
  expect(result1.error).toBeUndefined()
  
  const result2 = await controller.callInteraction('PostComment', {
    user: unverifiedUser
  })
  expect(result2.error).toBeDefined()
  
  const result3 = await controller.callInteraction('PostComment', {
    user: bannedUser
  })
  expect(result3.error).toBeDefined()
})
```

### 6. Test Conditional Updates
```typescript
test('conditional state updates', async () => {
  // User can only delete if not deleted
  const NotDeleted = Condition.create({
    name: 'NotDeleted',
    content: async function(this: Controller, event) {
      const styleId = event.payload?.style?.id
      if (!styleId) return false
      
      const style = await this.system.storage.findOne('Style',
        MatchExp.atom({ key: 'id', value: ['=', styleId] }),
        undefined,
        ['isDeleted']
      )
      
      return style && !style.isDeleted
    }
  })
  
  const DeleteStyle = Interaction.create({
    name: 'DeleteStyle',
    action: Action.create({ name: 'deleteStyle' }),
    conditions: Conditions.create({
      content: BoolExp.atom(AdminRole).and(BoolExp.atom(NotDeleted))
    })
  })
  
  const admin = await system.storage.create('User', { role: 'admin' })
  const style = await system.storage.create('Style', {
    label: 'Test',
    isDeleted: false
  })
  
  // First delete succeeds
  const result1 = await controller.callInteraction('DeleteStyle', {
    user: admin,
    payload: { style: { id: style.id } }
  })
  expect(result1.error).toBeUndefined()
  
  // Update style to deleted
  await system.storage.update('Style', style.id, { isDeleted: true })
  
  // Second delete fails
  const result2 = await controller.callInteraction('DeleteStyle', {
    user: admin,
    payload: { style: { id: style.id } }
  })
  expect(result2.error).toBeDefined()
})
```

## Testing Checklist
- [ ] Test all user roles (admin, operator, viewer, etc.)
- [ ] Test allowed and denied scenarios
- [ ] Test with missing/invalid payload data
- [ ] Test resource state conditions
- [ ] Test combined permissions (AND/OR logic)
- [ ] Test edge cases (null user, non-existent resources)
- [ ] Verify error types are 'condition check failed'
- [ ] Verify specific failed condition name with `error.error.data.name`
- [ ] Test custom error messages if used
- [ ] Cover all branches in condition logic
- [ ] Test time/state dependent conditions

## Common Testing Mistakes

### 1. Missing attributeQuery
```typescript
// ❌ WRONG: Without attributeQuery, only returns { id }
const style = await system.storage.findOne('Style',
  MatchExp.atom({ key: 'id', value: ['=', styleId] })
)
// style.creator is undefined!

// ✅ CORRECT: Specify needed fields
const style = await system.storage.findOne('Style',
  MatchExp.atom({ key: 'id', value: ['=', styleId] }),
  undefined,
  ['id', 'creator', 'status']  // Include all needed fields
)
```

### 2. Wrong Error Expectations
```typescript
// ❌ WRONG: Expecting wrong error type or incomplete verification
expect(result.error.type).toBe('no permission')

// ❌ INCOMPLETE: Only checking error type
expect(result.error).toBeDefined()
expect(result.error.type).toBe('condition check failed')

// ✅ CORRECT: Complete error verification including which condition failed
expect(result.error).toBeDefined()
expect(result.error.type).toBe('condition check failed')
expect(result.error.error.data.name).toBe('AdminRole')  // Verify specific condition
```

### 3. Incomplete Test Coverage
```typescript
// ❌ WRONG: Only testing happy path
test('admin can delete', async () => {
  // Only tests admin success
})

// ✅ CORRECT: Test all scenarios
test('delete permissions', async () => {
  // Test admin: allowed
  // Test operator: denied
  // Test viewer: denied
  // Test null user: denied
  // Test with deleted style: denied
})
```
