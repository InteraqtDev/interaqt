# Cursor AI Programming Guide for interaqt Framework

## Overview

This document provides comprehensive guidelines for Cursor AI when working on interaqt framework projects. Follow these instructions to ensure high-quality code generation, refactoring, and development practices that align with the framework's reactive programming paradigm.

## I. Pre-Programming Knowledge Loading (MANDATORY)

### 🔴 CRITICAL RULE: Framework Knowledge Loading

**Before writing ANY code for interaqt projects**, you MUST load and understand the complete framework knowledge base located in `agentspace/knowledge/` directory. This ensures all code follows framework best practices.

### Required Knowledge Base

1. **Core Philosophy & Concepts**:
   ```
   agentspace/knowledge/usage/00-mindset-shift.md          # Reactive paradigm shift
   agentspace/knowledge/usage/01-core-concepts.md          # Framework fundamentals
   agentspace/knowledge/usage/02-define-entities-properties.md
   agentspace/knowledge/usage/03-entity-relations.md
   agentspace/knowledge/usage/04-reactive-computations.md
   agentspace/knowledge/usage/05-interactions.md
   agentspace/knowledge/usage/06-attributive-permissions.md
   ```

2. **Development Patterns**:
   ```
   agentspace/knowledge/usage/12-testing.md               # Testing patterns
   agentspace/knowledge/usage/13-api-reference.md         # API usage
   agentspace/knowledge/usage/14-entity-crud-patterns.md  # CRUD patterns
   agentspace/knowledge/development/02-core-implementation.md
   ```

3. **Project Generation Guide** (for new projects):
   ```
   agentspace/llm_generator_guide_en.md                   # Complete project workflow
   ```

### Knowledge Validation Checklist

Before coding, confirm understanding of:
- [ ] Entity definition patterns and property types
- [ ] Relation modeling (OneToOne, OneToMany, ManyToMany)
- [ ] Reactive computation patterns (Count, Transform, StateMachine)
- [ ] Interaction design and permission control
- [ ] Test-driven development approach

## II. Code Generation Standards

### Entity & Property Development

#### Entity Definition Pattern
```typescript
// ✅ Correct Pattern
export const Article = Entity.create({
  name: 'Article',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'draft'
    }),
    Property.create({
      name: 'likeCount',
      type: 'number',
      computedData: Count.create({
        sourceRelation: 'likes',
        filterExpression: BoolExp.atom(Attributive.create({
          name: 'ActiveLike',
          content: (like) => like.status === 'active'
        }))
      })
    })
  ]
});

// ❌ Avoid This
const Article = {  // Don't use plain objects
  title: 'string',
  content: 'string'
};
```

#### Property Types & Validation
```typescript
// ✅ Use Correct Types
Property.create({ name: 'email', type: 'string' })
Property.create({ name: 'age', type: 'number' })
Property.create({ name: 'isActive', type: 'boolean' })
Property.create({ name: 'metadata', type: 'object' })
Property.create({ name: 'tags', type: 'string', collection: true })

// ✅ Add Computed Properties
Property.create({
  name: 'fullName',
  type: 'string',
  computedData: Transform.create({
    sourceProperty: ['firstName', 'lastName'],
    expression: (firstName, lastName) => `${firstName} ${lastName}`
  })
})
```

### Relation Development

#### Relation Definition Patterns
```typescript
// ✅ OneToMany Pattern
export const UserArticles = Relation.create({
  source: User,
  sourceProperty: 'articles',
  target: Article,
  targetProperty: 'author',
  relType: 'oneToMany'
});

// ✅ ManyToMany Pattern
export const ArticleTags = Relation.create({
  source: Article,
  sourceProperty: 'tags',
  target: Tag,
  targetProperty: 'articles',
  relType: 'manyToMany'
});

// ✅ With Relation Attributes
export const UserLikesArticle = Relation.create({
  source: User,
  sourceProperty: 'likedArticles',
  target: Article,
  targetProperty: 'likers',
  relType: 'manyToMany',
  properties: [
    Property.create({ name: 'likedAt', type: 'string' }),
    Property.create({ name: 'status', type: 'string' })
  ]
});
```

### Interaction Development

#### Interaction Definition Pattern
```typescript
// ✅ Correct Interaction Pattern
export const CreateArticle = Interaction.create({
  name: 'CreateArticle',
  action: Action.create({ name: 'createArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title' }),
      PayloadItem.create({ name: 'content' }),
      PayloadItem.create({ name: 'tags', collection: true })
    ]
  }),
  userAttributives: LoggedInUser  // Permission control
});

// ✅ Query Interaction
export const GetArticles = Interaction.create({
  name: 'GetArticles',
  action: GetAction,
  data: Article
});

// ❌ Avoid Business Logic in Interactions
export const BadCreateArticle = Interaction.create({
  name: 'BadCreateArticle',
  action: Action.create({ 
    name: 'badCreateArticle',
    implementation: async (payload) => {
      // ❌ Don't put business logic here
      if (payload.title.length < 5) {
        throw new Error('Title too short');
      }
      // Business logic belongs in computed properties or activities
    }
  })
});
```

### Test Development Patterns

#### Entity Tests
```typescript
// ✅ Entity CRUD Test Pattern
describe('Article Entity', () => {
  it('should create article with default status', async () => {
    const article = await controller.system.storage.create('Article', {
      title: 'Test Article',
      content: 'Test content'
    });
    
    expect(article.status).toBe('draft');
    expect(article.likeCount).toBe(0);
  });
  
  it('should update computed properties on relation changes', async () => {
    // Test reactive computation
    const user = await createTestUser();
    const article = await createTestArticle();
    
    await controller.callInteraction('LikeArticle', {
      user,
      payload: { articleId: article.id }
    });
    
    const updatedArticle = await getArticle(article.id);
    expect(updatedArticle.likeCount).toBe(1);
  });
});
```

#### Interaction Tests
```typescript
// ✅ Interaction Test Pattern
describe('CreateArticle Interaction', () => {
  it('should create article successfully', async () => {
    const user = await createTestUser();
    const result = await controller.callInteraction('CreateArticle', {
      user,
      payload: {
        title: 'New Article',
        content: 'Article content',
        tags: ['tech', 'programming']
      }
    });
    
    expect(result.error).toBeUndefined();
    expect(result.data.title).toBe('New Article');
    expect(result.data.author.id).toBe(user.id);
  });
  
  it('should fail without permission', async () => {
    const unauthorizedUser = await createTestUser({ role: 'banned' });
    const result = await controller.callInteraction('CreateArticle', {
      user: unauthorizedUser,
      payload: { title: 'Test', content: 'Test' }
    });
    
    expect(result.error).toBeDefined();
  });
});
```

## III. File Structure & Organization

### Project Structure Standards
```
src/
├── entities/
│   ├── User.ts
│   ├── Article.ts
│   └── index.ts
├── relations/
│   ├── UserArticles.ts
│   ├── ArticleTags.ts
│   └── index.ts
├── interactions/
│   ├── article/
│   │   ├── CreateArticle.ts
│   │   ├── UpdateArticle.ts
│   │   └── index.ts
│   └── index.ts
├── activities/
│   └── index.ts
└── index.ts

tests/
├── entities/
├── interactions/
├── relations/
└── e2e/
```

### Import Patterns
```typescript
// ✅ Correct Import Pattern
import { Entity, Property, Relation } from '@';
import { User } from '../entities/User.js';
import { Article } from '../entities/Article.js';

// ✅ Index File Pattern (src/entities/index.ts)
export { User } from './User.js';
export { Article } from './Article.js';
export { Tag } from './Tag.js';
```

## IV. Code Quality Standards

### TypeScript Best Practices

#### Type Safety
```typescript
// ✅ Use Framework Types
import type { Entity, Property, Relation, Interaction } from '@';

// ✅ Define Custom Types for Complex Data
type ArticleStatus = 'draft' | 'published' | 'archived';
type UserRole = 'admin' | 'editor' | 'viewer';

// ✅ Type Payload Items
PayloadItem.create({ 
  name: 'status',
  type: 'string' as const,  // Ensure type literal
  options: ['draft', 'published', 'archived']
})
```

#### Error Handling
```typescript
// ✅ Proper Error Handling in Tests
it('should handle validation errors', async () => {
  const result = await controller.callInteraction('CreateArticle', {
    user: testUser,
    payload: { title: '', content: '' }  // Invalid payload
  });
  
  expect(result.error).toBeDefined();
  expect(result.error).toContain('title is required');
});
```

### Performance Considerations

#### Efficient Queries
```typescript
// ✅ Use Proper Query Patterns
const articles = await controller.system.storage.find('Article', 
  MatchExp.atom({ key: 'status', value: ['=', 'published'] }),
  undefined,
  ['id', 'title', 'author.name']  // Select only needed fields
);

// ✅ Use Computed Properties for Aggregations
Property.create({
  name: 'articleCount',
  type: 'number',
  computedData: Count.create({
    sourceRelation: 'articles',
    filterExpression: BoolExp.atom({
      key: 'status',
      value: ['=', 'published']
    })
  })
})
```

## V. Debugging & Development Tools

### Common Debugging Patterns

#### Reactive Computation Debugging
```typescript
// ✅ Debug Computed Properties
it('should debug computed property calculations', async () => {
  const user = await createTestUser();
  const article1 = await createTestArticle({ authorId: user.id });
  const article2 = await createTestArticle({ authorId: user.id });
  
  // Check intermediate state
  const userWithCount = await controller.system.storage.findOne('User',
    MatchExp.atom({ key: 'id', value: ['=', user.id] }),
    undefined,
    ['id', 'articleCount']
  );
  
  console.log('Article count:', userWithCount.articleCount);
  expect(userWithCount.articleCount).toBe(2);
});
```

#### Interaction Flow Debugging
```typescript
// ✅ Debug Interaction Calls
const result = await controller.callInteraction('CreateArticle', {
  user: testUser,
  payload: testPayload
});

if (result.error) {
  console.error('Interaction failed:', result.error);
  console.log('Payload:', testPayload);
  console.log('User permissions:', testUser);
}
```

### Testing Utilities

#### Test Data Factories
```typescript
// ✅ Create Test Utilities
export async function createTestUser(overrides = {}) {
  return await controller.system.storage.create('User', {
    name: 'Test User',
    email: 'test@example.com',
    role: 'user',
    ...overrides
  });
}

export async function createTestArticle(overrides = {}) {
  const user = await createTestUser();
  return await controller.system.storage.create('Article', {
    title: 'Test Article',
    content: 'Test content',
    authorId: user.id,
    ...overrides
  });
}
```

## VI. Frontend Integration

### API Client Generation
When working with frontend code, ensure API calls match exactly with backend Interactions:

```typescript
// ✅ API Client Pattern (matches backend Interaction)
export async function createArticle(title: string, content: string, tags: string[]) {
  const response = await fetch('/interaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      interaction: 'CreateArticle',
      payload: { title, content, tags }
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return await response.json();
}
```

## VII. Error Prevention Checklist

### Before Committing Code
- [ ] All entities follow reactive property patterns
- [ ] No business logic in Interaction implementations
- [ ] All computed properties use proper computation types
- [ ] Test coverage includes success and failure cases
- [ ] Relation properties are correctly named and typed
- [ ] Permission attributives are properly defined
- [ ] Import paths use `.js` extensions for ES modules
- [ ] TypeScript types are properly defined and used

### Common Anti-Patterns to Avoid
```typescript
// ❌ Don't mutate data directly
article.likeCount = article.likeCount + 1;

// ✅ Use reactive computations
Property.create({
  name: 'likeCount',
  type: 'number',
  computedData: Count.create({
    sourceRelation: 'likes'
  })
})

// ❌ Don't write imperative business logic
if (user.role === 'admin') {
  // Complex business logic here
}

// ✅ Use declarative attributives
const AdminAttributive = Attributive.create({
  name: 'Admin',
  content: (_, { user }) => user.role === 'admin'
});
```

## VIII. Success Criteria

### Code Quality Metrics
- [ ] All tests pass with 100% coverage
- [ ] No TypeScript errors or warnings
- [ ] All reactive computations work correctly
- [ ] Permission controls function as expected
- [ ] API endpoints match frontend expectations
- [ ] Database queries are efficient and correct

### Framework Compliance
- [ ] Follows reactive programming paradigm
- [ ] Uses proper Entity/Relation/Interaction patterns
- [ ] Implements comprehensive test coverage
- [ ] Maintains clean separation of concerns
- [ ] Uses declarative rather than imperative approaches

## Conclusion

By following this guide, Cursor AI will generate high-quality interaqt framework code that:
- Adheres to reactive programming principles
- Maintains comprehensive test coverage
- Follows framework best practices
- Integrates seamlessly with frontend applications
- Provides maintainable and scalable solutions

**Remember: Always load the knowledge base first, then apply these coding standards consistently throughout the project.** 