# Permission Test Implementation Guide

## Overview
Permission testing verifies that conditions correctly control access to interactions. Tests should cover both allowed and denied scenarios for different user roles and data states.

## 🔴 CRITICAL: Permission Testing Principles

### Error Handling Pattern
```typescript
// ❌ WRONG: interaqt doesn't throw exceptions
try {
  await controller.callInteraction('DeleteStyle', { user: viewer })
  fail('Should have thrown')
} catch (e) {
  // This will never execute
}

// ✅ CORRECT: Check error in result
const result = await controller.callInteraction('DeleteStyle', { 
  user: viewer,
  payload: { style: { id: styleId } }
})
expect(result.error).toBeDefined()
expect(result.error.type).toBe('condition check failed')
```

### Common Error Types
- `'condition check failed'`: condition returned false or threw error

## Complete Setup: Defining Permissions

### 🔴 CRITICAL: Permissions Must Be Explicitly Defined

Permissions are NOT built-in! You must:
1. Define Conditions
2. Apply them to Interactions
3. Then test they work correctly

```typescript
import { Condition, BoolExp, boolExpToConditions, Interaction, Action, Payload, PayloadItem, MatchExp } from 'interaqt'

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
    
    return style && style.status !== 'offline'
  }
})

// Step 2: Apply to Interactions
export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'deleteStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      })
    ]
  }),
  conditions: AdminRole  // Only admin can delete
})

export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'label' }),
      PayloadItem.create({ name: 'description' })
    ]
  }),
  // Multiple conditions
  conditions: boolExpToConditions(
    BoolExp.atom(OperatorRole)
      .or(BoolExp.atom(AdminRole))
      .and(BoolExp.atom(StyleNotOffline))
  )
})

// Step 3: Now you can test these permissions
```

## Permission Test Patterns

### 1. Role-Based Permission Test
```typescript
describe('Role-based permissions', () => {
  let admin: any, operator: any, viewer: any

  beforeEach(async () => {
    // Setup system with interactions that have conditions
    system = new MonoSystem(new PGLiteDB())
    controller = new Controller({
      system,
      entities,
      relations,
      activities: [],
      interactions: [DeleteStyle, UpdateStyle, CreateStyle], // Interactions with conditions
      dict: []
    })
    await controller.setup(true)

    // Create users with different roles
    admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@test.com',
      role: 'admin'
    })
    
    operator = await system.storage.create('User', {
      name: 'Operator',
      email: 'operator@test.com',
      role: 'operator'
    })
    
    viewer = await system.storage.create('User', {
      name: 'Viewer',
      email: 'viewer@test.com',
      role: 'viewer'
    })
  })

  test('admin can delete styles', async () => {
    // Setup: Create a style
    const style = await createTestStyle(operator)

    // Act: Admin deletes
    const result = await controller.callInteraction('DeleteStyle', {
      user: admin,
      payload: { style: { id: style.id } }
    })

    // Assert: Should succeed
    expect(result.error).toBeUndefined()
    
    const deleted = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', style.id] }),
      undefined,
      ['status']
    )
    expect(deleted.status).toBe('offline')
  })

  test('operator cannot delete styles', async () => {
    // Setup: Create a style
    const style = await createTestStyle(operator)

    // Act: Operator tries to delete
    const result = await controller.callInteraction('DeleteStyle', {
      user: operator,
      payload: { style: { id: style.id } }
    })

    // Assert: Should fail with permission error
    expect(result.error).toBeDefined()
    expect(result.error.type).toBe('condition check failed')
    
    // Verify style not deleted
    const current = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', style.id] }),
      undefined,
      ['status']
    )
    expect(current.status).toBe('draft')
  })

  test('viewer cannot create styles', async () => {
    // Act: Viewer tries to create
    const result = await controller.callInteraction('CreateStyle', {
      user: viewer,
      payload: {
        label: 'Test',
        slug: 'test',
        type: 'animation'
      }
    })

    // Assert: Should fail
    expect(result.error).toBeDefined()
    expect(result.error.type).toBe('condition check failed')
  })
})
```

### 2. Data State Permission Test

First define the data state conditions:

```typescript
// Define condition that checks style status
export const StyleIsDraft = Condition.create({
  name: 'StyleIsDraft',
  content: async function(this: Controller, event) {
    const styleId = event.payload?.style?.id
    if (!styleId) return false
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['status']
    )
    
    return style && style.status === 'draft'
  }
})

// Apply to publish interaction
export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publishStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      })
    ]
  }),
  conditions: boolExpToConditions(
    BoolExp.atom(OperatorRole)
      .or(BoolExp.atom(AdminRole))
      .and(BoolExp.atom(StyleIsDraft))  // Must be draft
  )
})
```

Then test it:

```typescript
describe('Data state permissions', () => {
  test('cannot update offline style', async () => {
    const operator = await system.storage.create('User', { role: 'operator' })
    
    // Setup: Create and delete style
    const createResult = await controller.callInteraction('CreateStyle', {
      user: operator,
      payload: { label: 'Test', slug: 'test', type: 'animation' }
    })
    
    const style = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'test'] }),
      undefined,
      ['id']
    )

    // Admin deletes it
    const admin = await system.storage.create('User', { role: 'admin' })
    await controller.callInteraction('DeleteStyle', {
      user: admin,
      payload: { style: { id: style.id } }
    })

    // Act: Try to update offline style
    const updateResult = await controller.callInteraction('UpdateStyle', {
      user: operator,
      payload: {
        style: { id: style.id },
        label: 'Updated'
      }
    })

    // Assert: Should fail
    expect(updateResult.error).toBeDefined()
    expect(updateResult.error.message).toContain('cannot update offline')
  })

  test('can only publish draft styles', async () => {
    const operator = await system.storage.create('User', { role: 'operator' })
    
    // Create and publish style
    await controller.callInteraction('CreateStyle', {
      user: operator,
      payload: { label: 'Test', slug: 'test', type: 'animation' }
    })
    
    const style = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'test'] }),
      undefined,
      ['id']
    )

    // First publish should succeed
    const firstPublish = await controller.callInteraction('PublishStyle', {
      user: operator,
      payload: { style: { id: style.id } }
    })
    expect(firstPublish.error).toBeUndefined()

    // Act: Try to publish already published style
    const secondPublish = await controller.callInteraction('PublishStyle', {
      user: operator,
      payload: { style: { id: style.id } }
    })

    // Assert: Should fail
    expect(secondPublish.error).toBeDefined()
    expect(secondPublish.error.message).toContain('already published')
  })
})
```

### 3. Complex Permission Logic Test

Define complex permission logic:

```typescript
// Owner or admin can modify
export const OwnerOrAdmin = Condition.create({
  name: 'OwnerOrAdmin',
  content: async function(this: Controller, event) {
    // Admin always can
    if (event.user?.role === 'admin') return true
    
    // Check if user is owner
    const resourceId = event.payload?.resource?.id
    if (!resourceId) return false
    
    const resource = await this.system.storage.findOne('Resource',
      MatchExp.atom({ key: 'id', value: ['=', resourceId] }),
      undefined,
      ['ownerId']
    )
    
    return resource && resource.ownerId === event.user.id
  }
})

// Active user check
export const ActiveUser = Condition.create({
  name: 'ActiveUser',
  content: async function(this: Controller, event) {
    return event.user?.status === 'active'
  }
})

// Apply complex logic
export const UpdateResource = Interaction.create({
  name: 'UpdateResource',
  action: Action.create({ name: 'updateResource' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'resource',
        base: Resource,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'data' })
    ]
  }),
  conditions: boolExpToConditions(
    BoolExp.atom(ActiveUser)
      .and(BoolExp.atom(OwnerOrAdmin))
  )
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
        isRef: true,
        required: true
      })
    ]
  }),
  conditions: CheckPublishedStyle  // Check style is published
})
```

Test payload conditions:

```typescript
describe('Payload condition permissions', () => {
  test('can only share published styles', async () => {
    const user = await system.storage.create('User', { role: 'operator' })
    
    // Create draft style
    await controller.callInteraction('CreateStyle', {
      user: user,
      payload: { label: 'Draft', slug: 'draft', type: 'animation' }
    })
    
    const draftStyle = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'draft'] }),
      undefined,
      ['id', 'status']
    )

    // Try to share draft style
    const shareDraft = await controller.callInteraction('ShareStyle', {
      user: user,
      payload: { style: { id: draftStyle.id } }
    })
    
    // Should fail
    expect(shareDraft.error).toBeDefined()
    expect(shareDraft.error.type).toBe('condition check failed')

    // Publish the style
    await controller.callInteraction('PublishStyle', {
      user: user,
      payload: { style: { id: draftStyle.id } }
    })

    // Now sharing should work
    const sharePublished = await controller.callInteraction('ShareStyle', {
      user: user,
      payload: { style: { id: draftStyle.id } }
    })
    
    expect(sharePublished.error).toBeUndefined()
  })

  test('collection payload conditions check all items', async () => {
    const user = await system.storage.create('User', { role: 'admin' })
    
    // Define active tag check
    const CheckAllTagsActive = Condition.create({
      name: 'CheckAllTagsActive',
      content: async function(this: Controller, event) {
        const tags = event.payload?.tags
        if (!tags || !Array.isArray(tags)) return false
        
        // Check all tags are active
        for (const tagRef of tags) {
          const tag = await this.system.storage.findOne('Tag',
            MatchExp.atom({ key: 'id', value: ['=', tagRef.id] }),
            undefined,
            ['isActive']
          )
          if (!tag || !tag.isActive) return false
        }
        return true
      }
    })

    // Define interaction with collection condition
    const TagItems = Interaction.create({
      name: 'TagItems',
      action: Action.create({ name: 'tagItems' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ 
            name: 'tags',
            base: Tag,
            isRef: true,
            isCollection: true
          })
        ]
      }),
      conditions: CheckAllTagsActive  // All tags must be active
    })

    // Create tags
    const activeTag1 = await system.storage.create('Tag', {
      name: 'Active1',
      isActive: true
    })
    const activeTag2 = await system.storage.create('Tag', {
      name: 'Active2',
      isActive: true
    })
    const inactiveTag = await system.storage.create('Tag', {
      name: 'Inactive',
      isActive: false
    })

    // Try with all active tags - should pass
    const withActive = await controller.callInteraction('TagItems', {
      user: user,
      payload: {
        tags: [
          { id: activeTag1.id },
          { id: activeTag2.id }
        ]
      }
    })
    expect(withActive.error).toBeUndefined()

    // Try with inactive tag - should fail
    const withInactive = await controller.callInteraction('TagItems', {
      user: user,
      payload: {
        tags: [
          { id: activeTag1.id },
          { id: inactiveTag.id }  // This will fail
        ]
      }
    })
    expect(withInactive.error).toBeDefined()
    expect(withInactive.error.type).toBe('condition check failed')
  })
})
```

### 5. Edge Case Permission Test
```typescript
describe('Permission edge cases', () => {
  test('missing user results in permission denied', async () => {
    // Act: Call without user
    const result = await controller.callInteraction('CreateStyle', {
      user: null,  // No user
      payload: {
        label: 'Test',
        slug: 'test',
        type: 'animation'
      }
    })

    // Assert
    expect(result.error).toBeDefined()
    expect(result.error.type).toBe('condition check failed')
  })

  test('user with undefined role fails permission check', async () => {
    // Create user without role
    const userNoRole = await system.storage.create('User', {
      name: 'No Role User',
      email: 'noRole@test.com'
      // role is undefined
    })

    // Act
    const result = await controller.callInteraction('CreateStyle', {
      user: userNoRole,
      payload: {
        label: 'Test',
        slug: 'test',
        type: 'animation'
      }
    })

    // Assert
    expect(result.error).toBeDefined()
    expect(result.error.type).toBe('condition check failed')
  })

  test('deleted user cannot perform actions', async () => {
    // Define active user check
    const ActiveUser = Condition.create({
      name: 'ActiveUser',
      content: async function(this: Controller, event) {
        return !event.user?.isDeleted
      }
    })

    // Apply to interaction
    const CreateWithActiveCheck = Interaction.create({
      name: 'CreateStyle',
      action: Action.create({ name: 'createStyle' }),
      payload: CreateStyle.payload,  // Reuse payload definition
      conditions: boolExpToConditions(
        BoolExp.atom(ActiveUser)
          .and(BoolExp.atom(OperatorRole))
      )
    })

    // Create and soft-delete user
    const user = await system.storage.create('User', {
      name: 'Deleted User',
      role: 'operator',
      isDeleted: true
    })

    // Act
    const result = await controller.callInteraction('CreateStyle', {
      user: user,
      payload: {
        label: 'Test',
        slug: 'test',
        type: 'animation'
      }
    })

    // Assert: Depends on your ActiveUser condition
    expect(result.error).toBeDefined()
    expect(result.error.type).toBe('condition check failed')
  })
})
```

## Testing Permission Combinations

### BoolExp AND Combinations
```typescript
// Define business hours check
const BusinessHours = Condition.create({
  name: 'BusinessHours',
  content: async function(this: Controller, event) {
    const hour = new Date().getHours()
    return hour >= 9 && hour < 17
  }
})

// System maintenance requires admin AND business hours
const SystemMaintenance = Interaction.create({
  name: 'SystemMaintenance',
  action: Action.create({ name: 'maintenance' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'action', required: true })
    ]
  }),
  conditions: boolExpToConditions(
    BoolExp.atom(AdminRole)
      .and(BoolExp.atom(BusinessHours))
  )
})

test('must satisfy all conditions in AND', async () => {
  // Setup: Need admin AND business hours
  const admin = await system.storage.create('User', { role: 'admin' })
  
  // Mock business hours check
  const isBusinessHours = new Date().getHours() >= 9 && 
                         new Date().getHours() < 17

  const result = await controller.callInteraction('SystemMaintenance', {
    user: admin,
    payload: { action: 'restart' }
  })

  if (isBusinessHours) {
    expect(result.error).toBeUndefined()
  } else {
    expect(result.error).toBeDefined()
    expect(result.error.type).toBe('condition check failed')
  }
})
```

### BoolExp OR Combinations
```typescript
// Content moderation allows admin OR moderator
const ModerateContent = Interaction.create({
  name: 'ModerateContent',
  action: Action.create({ name: 'moderate' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'contentId', required: true })
    ]
  }),
  conditions: boolExpToConditions(
    BoolExp.atom(AdminRole)
      .or(BoolExp.atom(ModeratorRole))
  )
})

test('can satisfy any condition in OR', async () => {
  const admin = await system.storage.create('User', { role: 'admin' })
  const moderator = await system.storage.create('User', { role: 'moderator' })
  const viewer = await system.storage.create('User', { role: 'viewer' })

  // Admin should pass
  const adminResult = await controller.callInteraction('ModerateContent', {
    user: admin,
    payload: { contentId: 'test-123' }
  })
  expect(adminResult.error).toBeUndefined()

  // Moderator should pass
  const modResult = await controller.callInteraction('ModerateContent', {
    user: moderator,
    payload: { contentId: 'test-123' }
  })
  expect(modResult.error).toBeUndefined()

  // Viewer should fail
  const viewerResult = await controller.callInteraction('ModerateContent', {
    user: viewer,
    payload: { contentId: 'test-123' }
  })
  expect(viewerResult.error).toBeDefined()
})
```

## Best Practices

### DO
- Always define conditions explicitly before testing
- Test both success and failure paths for each permission
- Use descriptive test names explaining the permission scenario
- Create helper functions for common setup
- Test edge cases like missing/null users
- Verify error types match expected permission failures

### DON'T
- Don't assume permissions are built-in to the framework
- Don't use try-catch for permission errors
- Don't test framework internals, only your permission logic
- Don't forget to test collection payload conditions
- Don't assume permission checks are synchronous

## Validation Checklist
- [ ] All conditions are explicitly defined
- [ ] Conditions are applied to interactions
- [ ] Test all user roles for each interaction
- [ ] Test data state permissions (draft/published/offline)
- [ ] Test payload conditions with valid/invalid data
- [ ] Test permission combinations (AND/OR)
- [ ] Test edge cases (null user, missing roles)
- [ ] Verify correct error types for each failure
- [ ] Use result.error pattern, not try-catch
