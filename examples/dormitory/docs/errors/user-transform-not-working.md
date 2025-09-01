# User Transform Computation Not Working

## Issue Description
The User entity Transform computation is not being triggered when the CreateUser interaction is called. The system creates internal entities (_Activity_, _Interaction_, activityInteraction) but does not create the User entity itself.

## Test Plan
**Dependencies**: User entity, CreateUser interaction
**Steps**: 
1. Call CreateUser interaction with valid payload
2. Verify User entity is created with correct data

**Business Logic**: Transform computation creates User from CreateUser interaction events

## Implementation Attempted
```typescript
// User Entity with Transform computation
export const User = Entity.create({
  name: 'User',
  properties: [
    // ... properties without defaultValue for computed fields
  ],
  // Transform computation to create User entities from CreateUser interactions
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateUser') {
        return {
          username: event.payload.username,
          email: event.payload.email,
          fullName: event.payload.fullName,
          role: event.payload.role,
          currentScore: 100, // default value
          isActive: true, // default value  
          createdAt: Math.floor(Date.now() / 1000) // timestamp in seconds
        }
      }
      return null
    }
  })
})
```

## Error Observed
Test results show only system entities being created:
```
All effects: [
  {
    type: 'create',
    recordName: '_Activity_',
    id: '0199057e-8957-7f72-8252-88d6c4184592'
  },
  {
    type: 'create',
    recordName: '_Interaction_',
    id: '0199057e-8958-7870-9ee6-97e7e24a8935'
  },
  {
    type: 'create',
    recordName: 'activityInteraction',
    id: '0199057e-8958-7870-9ee6-97e860898bb2'
  }
]
```

No User entity creation effect is present.

## Attempts Made
1. ✅ Used Transform with InteractionEventEntity as record
2. ✅ Tried with and without attributeQuery parameter
3. ✅ Tried assigning computation both inline and after entity definition
4. ✅ Tried using `computationTarget` instead of `computation`
5. ✅ Removed defaultValue from properties that are set by computation
6. ✅ Verified similar pattern works in crud.example.test.ts (Article creation)

## Working Reference
The crud.example.test.ts shows a successful Article entity creation with the same pattern:
```typescript
const Article = Entity.create({
  name: 'Article',
  properties: [...],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateArticle') {
        return {
          title: event.payload.title,
          content: event.payload.content,
          createdAt: Math.floor(Date.now()/1000),
          author: event.payload.authorId
        }
      }
      return null
    }
  })
})
```

## Next Steps Needed
1. Investigate why Transform computation is not being triggered for User entity
2. Check if there are missing imports or configuration issues
3. Consider if entity exports order matters
4. Debug the callback function to see if it's being called at all

## Error Category
Transform computation implementation issue - computation not executing despite correct pattern.