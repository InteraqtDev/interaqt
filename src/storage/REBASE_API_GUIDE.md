# MatchExp Rebase API Guide

## Overview

The `rebase` method on `MatchExp` allows you to transform match conditions from one entity's perspective to a related entity's perspective. It supports both path shrinking (parent to child) and path expansion (child to parent).

## Syntax

```typescript
matchExp.rebase(attributeName: string): MatchExp
```

## Parameters

- `attributeName`: The name of an entity relation attribute to rebase to. This must be a relation (not a value attribute).

## Description

The `rebase` method handles two scenarios:

1. **Path Shrinking**: When the current entity has a relation attribute pointing to the target entity, and conditions start with that attribute name, the method removes the attribute prefix.

2. **Path Expansion**: When the current entity has a relation attribute pointing to the target entity, but no conditions start with that attribute name, the method adds the reverse relation as a prefix to all conditions.

## Examples

### Path Shrinking (Parent to Child)

```typescript
// Original: User perspective with condition on profile
const userMatch = new MatchExp('User', entityMap, 
    MatchExp.atom({
        key: 'profile.title',
        value: ['=', 'Manager']
    })
);

// Rebase to Profile perspective
const profileMatch = userMatch.rebase('profile');
// Result: Profile perspective with condition: title = 'Manager'
```

### Path Expansion (Child to Parent)

```typescript
// Original: Profile perspective with condition
const profileMatch = new MatchExp('Profile', entityMap,
    MatchExp.atom({
        key: 'id',
        value: ['=', 1]
    })
);

// Rebase to User perspective through 'owner' relation
const userMatch = profileMatch.rebase('owner');
// Result: User perspective with condition: profile.id = 1
```

### Multiple Conditions

```typescript
// User perspective with multiple profile conditions
const userMatch = new MatchExp('User', entityMap,
    MatchExp.atom({
        key: 'profile.title',
        value: ['=', 'Manager']
    }).and({
        key: 'profile.id',
        value: ['>', 10]
    })
);

// Rebase to profile perspective
const profileMatch = userMatch.rebase('profile');
// Result: Profile perspective with: title = 'Manager' AND id > 10
```

### Mixed Conditions with Path Expansion

```typescript
// User perspective with condition not related to profile
const userMatch = new MatchExp('User', entityMap,
    MatchExp.atom({
        key: 'name',
        value: ['=', 'Alice']
    })
);

// Rebase to profile perspective
const profileMatch = userMatch.rebase('profile');
// Result: Profile perspective with: owner.name = 'Alice'
// (Path expansion adds 'owner.' prefix since Profile.owner points to User)
```

### Nested Paths

```typescript
// User perspective with nested path
const userMatch = new MatchExp('User', entityMap,
    MatchExp.atom({
        key: 'profile.owner.name',
        value: ['=', 'John']
    })
);

// Rebase to profile perspective
const profileMatch = userMatch.rebase('profile');
// Result: Profile perspective with: owner.name = 'John'
```

### Self-References

```typescript
// User perspective with self-reference
const userMatch = new MatchExp('User', entityMap,
    MatchExp.atom({
        key: 'leader.name',
        value: ['=', 'Boss']
    })
);

// Rebase to leader perspective (still User entity)
const leaderMatch = userMatch.rebase('leader');
// Result: User perspective with: name = 'Boss'
```

### Round Trip Example

```typescript
// Start with User perspective
const userMatch = new MatchExp('User', entityMap,
    MatchExp.atom({
        key: 'profile.title',
        value: ['=', 'Manager']
    })
);

// Shrink path: rebase to Profile
const profileMatch = userMatch.rebase('profile');
// Result: title = 'Manager'

// Expand path: rebase back to User
const userMatchAgain = profileMatch.rebase('owner');
// Result: profile.title = 'Manager' (back to original)
```

## Error Handling

The method will throw an error if:
- The specified attribute doesn't exist on the entity
- The specified attribute is not an entity relation (e.g., it's a value attribute)
- No valid relation can be found for rebasing

## Use Cases

1. **Query Transformation**: Transform queries from one entity's perspective to another for reuse
2. **Subquery Generation**: Generate subqueries for related entities based on parent entity conditions
3. **Filter Propagation**: Propagate filter conditions through entity relationships
4. **Dynamic Query Building**: Build queries that can work from different entity perspectives

## Implementation Details

- The method first attempts path shrinking by checking if the current entity has the specified attribute
- If no matching conditions are found for path shrinking, it performs path expansion using the reverse relation
- The method recursively processes the entire boolean expression tree
- Empty expressions (no data) are preserved as undefined
- Reference values (isReferenceValue) are preserved during transformation
- The method uses `getReverseAttribute` to find the reverse relation for path expansion 