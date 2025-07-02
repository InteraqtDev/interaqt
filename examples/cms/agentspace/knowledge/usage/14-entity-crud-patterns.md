# Reactive Patterns for Entity CRUD Operations

In interaqt, all data operations follow reactive design principles. This chapter will detail how to correctly handle entity creation, update, and deletion operations.

## Core Principles

1. **Creation**: Use Transform to listen to Interaction events to create entities
2. **Deletion**: Use soft delete pattern, manage deletion state through StateMachine
3. **Update**: Reactively update entity state through StateMachine or Transform
4. **Reference**: For entities that support deletion, use Filtered Entity to create "non-deleted" views

## Creating Entities - Using Transform

### Basic Pattern

By using Transform in a Relation's `computedData`, you can listen to interaction events and create entities:

```javascript
import { Entity, Property, Relation, Transform, InteractionEventEntity, Interaction, Action, Payload, PayloadItem } from 'interaqt';

// 1. Define entities
const Article = Entity.create({
  name: 'Article',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'draft' }),
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({ name: 'updatedAt', type: 'string' })
  ]
});

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'username', type: 'string' }),
    Property.create({ name: 'email', type: 'string' })
  ]
});

// 2. Define creation interaction
const CreateArticle = Interaction.create({
  name: 'CreateArticle',
  action: Action.create({ name: 'createArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'authorId', base: User, isRef: true, required: true })
    ]
  })
});

// 3. Define relation with creation logic in computedData
const UserArticleRelation = Relation.create({
  source: Article,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'articles',
  type: 'n:1',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateArticle') {
        // Return relation and entity data to create
        return {
          source: {
            title: event.payload.title,
            content: event.payload.content,
            status: 'draft',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          target: event.payload.authorId
        };
      }
      return null;
    }
  })
});
```

### Creating Entities with Complex Relations

For entities that need to create multiple relations simultaneously, use multiple Transforms:

```javascript
// Create article with tags
const CreateArticleWithTags = Interaction.create({
  name: 'CreateArticleWithTags',
  action: Action.create({ name: 'createArticleWithTags' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'authorId', base: User, isRef: true }),
      PayloadItem.create({ name: 'tagIds', base: Tag, isCollection: true, isRef: true })
    ]
  })
});

// Article-Tag relation
const ArticleTagRelation = Relation.create({
  source: Article,
  sourceProperty: 'tags',
  target: Tag,
  targetProperty: 'articles',
  type: 'n:n',
  properties: [
    Property.create({ name: 'addedAt', type: 'string' })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateArticleWithTags' && event.payload.tagIds) {
        // Need to get the created article ID
        // Usually saved in UserArticleRelation's Transform
        const articleId = event._createdArticleId;
        
        return event.payload.tagIds.map(tagId => ({
          source: articleId,
          target: tagId,
          addedAt: new Date().toISOString()
        }));
      }
      return null;
    }
  })
});
```

## Deleting Entities - Soft Delete Pattern

### Using StateMachine to Manage Deletion State

In reactive systems, soft delete is recommended over physical deletion:

```javascript
import { StateMachine, StateNode, StateTransfer } from 'interaqt';

// 1. Define deletion-related interactions
const DeleteArticle = Interaction.create({
  name: 'DeleteArticle',
  action: Action.create({ name: 'deleteArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'articleId', 
        base: Article,
        isRef: true, 
        required: true 
      })
    ]
  })
});

const RestoreArticle = Interaction.create({
  name: 'RestoreArticle',
  action: Action.create({ name: 'restoreArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'articleId', 
        base: Article,
        isRef: true, 
        required: true 
      })
    ]
  })
});

// 2. Define state nodes
const ActiveState = StateNode.create({ name: 'active' });
const DeletedState = StateNode.create({ name: 'deleted' });

// 3. Create state machine
const ArticleStatusStateMachine = StateMachine.create({
  name: 'ArticleStatus',
  states: [ActiveState, DeletedState],
  defaultState: ActiveState,
  transfers: [
    StateTransfer.create({
      current: ActiveState,
      next: DeletedState,
      trigger: DeleteArticle,
      computeTarget: (event) => ({ id: event.payload.articleId })
    }),
    StateTransfer.create({
      current: DeletedState,
      next: ActiveState,
      trigger: RestoreArticle,
      computeTarget: (event) => ({ id: event.payload.articleId })
    })
  ]
});

// 4. Apply state machine to entity
const Article = Entity.create({
  name: 'Article',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean',
      // Calculate deletion status based on state
      computed: function(article) {
        return article.status === 'deleted';
      }
    }),
    Property.create({
      name: 'status',
      type: 'string',
      computedData: ArticleStatusStateMachine,
      defaultValue: () => ArticleStatusStateMachine.defaultState.name
    }),
    Property.create({
      name: 'deletedAt',
      type: 'string',
      computedData: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'DeleteArticle' && 
              event.payload.articleId === this.id) {
            return new Date().toISOString();
          }
          if (event.interactionName === 'RestoreArticle' && 
              event.payload.articleId === this.id) {
            return null; // Clear deletion time when restoring
          }
          return undefined; // Keep original value
        }
      })
    })
  ]
});
```

## Using Filtered Entity to Handle Non-Deleted Entities

For entities that support deletion, business logic usually only needs to reference "non-deleted" entities. Using Filtered Entity can create an automatically filtered view:

```javascript
// Create Filtered Entity containing only non-deleted articles
const ActiveArticle = Entity.create({
  name: 'ActiveArticle',
  sourceEntity: Article,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['!=', 'deleted']
  })
  // Or use isDeleted field
  // filterCondition: MatchExp.atom({
  //   key: 'isDeleted',
  //   value: ['=', false]
  // })
});

// Usage examples:
// 1. Query all active articles
const activeArticles = await controller.find('ActiveArticle', undefined, undefined, ['*']);

// 2. Query specific user's active articles
const userActiveArticles = await controller.find('ActiveArticle', 
  MatchExp.atom({ key: 'author.id', value: ['=', userId] }),
  undefined,
  ['title', 'content', 'createdAt']
);
```

### Important Notes

**Relations cannot directly reference Filtered Entities**. If you need to express "relations with non-deleted entities", you should:

1. Use complete entities when defining relations
2. Use StateMachine or conditional logic to control relation validity

```javascript
// ❌ Wrong: Cannot do this
const UserActiveArticleRelation = Relation.create({
  source: User,
  target: ActiveArticle, // Wrong! Cannot use Filtered Entity
  // ...
});

// ✅ Correct: Use complete entity, control through logic
const UserFavoriteRelation = Relation.create({
  source: User,
  sourceProperty: 'favorites',
  target: Article, // Use complete entity
  targetProperty: 'favoritedBy',
  type: 'n:n',
  properties: [
    Property.create({
      name: 'isActive',
      type: 'boolean',
      // Dynamically calculate based on article status
      computed: function(relation) {
        return relation.target.status !== 'deleted';
      }
    })
  ]
});

// Filter when querying
const activeFavorites = await controller.find('UserFavoriteRelation',
  MatchExp.atom({ key: 'source.id', value: ['=', userId] })
    .and({ key: 'target.status', value: ['!=', 'deleted'] }),
  undefined,
  [['target', { attributeQuery: ['title', 'content'] }]]
);
```

## Updating Entities - Reactive Updates

### Using StateMachine to Manage State Changes

```javascript
// Article publishing workflow
const PublishArticle = Interaction.create({
  name: 'PublishArticle',
  action: Action.create({ name: 'publishArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', base: Article, isRef: true })
    ]
  })
});

const UnpublishArticle = Interaction.create({
  name: 'UnpublishArticle',
  action: Action.create({ name: 'unpublishArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', base: Article, isRef: true })
    ]
  })
});

// Publishing state machine
const DraftState = StateNode.create({ name: 'draft' });
const PublishedState = StateNode.create({ name: 'published' });

const ArticlePublishStateMachine = StateMachine.create({
  name: 'ArticlePublishStatus',
  states: [DraftState, PublishedState],
  defaultState: DraftState,
  transfers: [
    StateTransfer.create({
      current: DraftState,
      next: PublishedState,
      trigger: PublishArticle,
      computeTarget: (event) => ({ id: event.payload.articleId })
    }),
    StateTransfer.create({
      current: PublishedState,
      next: DraftState,
      trigger: UnpublishArticle,
      computeTarget: (event) => ({ id: event.payload.articleId })
    })
  ]
});
```

### Using Transform to Record Update History

```javascript
const UpdateArticle = Interaction.create({
  name: 'UpdateArticle',
  action: Action.create({ name: 'updateArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', base: Article, isRef: true }),
      PayloadItem.create({ name: 'title' }),
      PayloadItem.create({ name: 'content' })
    ]
  })
});

// Article update history
const ArticleHistory = Entity.create({
  name: 'ArticleHistory',
  properties: [
    Property.create({ name: 'articleId', type: 'string' }),
    Property.create({ name: 'field', type: 'string' }),
    Property.create({ name: 'oldValue', type: 'string' }),
    Property.create({ name: 'newValue', type: 'string' }),
    Property.create({ name: 'updatedAt', type: 'string' }),
    Property.create({ name: 'updatedBy', type: 'string' })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'UpdateArticle') {
        const changes = [];
        
        if (event.payload.title !== undefined) {
          changes.push({
            articleId: event.payload.articleId,
            field: 'title',
            newValue: event.payload.title,
            updatedAt: new Date().toISOString(),
            updatedBy: event.user.id
          });
        }
        
        if (event.payload.content !== undefined) {
          changes.push({
            articleId: event.payload.articleId,
            field: 'content',
            newValue: event.payload.content,
            updatedAt: new Date().toISOString(),
            updatedBy: event.user.id
          });
        }
        
        return changes;
      }
      return null;
    }
  })
});
```

## Complete Example: Blog System CRUD Operations

```javascript
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity
} from 'interaqt';

// === Entity Definitions ===
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'username', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({
      name: 'articleCount',
      type: 'number',
      computedData: Count.create({
        record: UserArticleRelation,
        direction: 'target',
        callback: (article) => article.status !== 'deleted'
      })
    })
  ]
});

const Article = Entity.create({
  name: 'Article',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({ name: 'publishedAt', type: 'string' }),
    Property.create({ name: 'deletedAt', type: 'string' }),
    Property.create({
      name: 'status',
      type: 'string',
      computedData: ArticleLifecycleStateMachine,
      defaultValue: () => 'draft'
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean',
      computed: (article) => article.status === 'deleted'
    })
  ]
});

// === Filtered Entities ===
const ActiveArticle = Entity.create({
  name: 'ActiveArticle',
  sourceEntity: Article,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['!=', 'deleted']
  })
});

const PublishedArticle = Entity.create({
  name: 'PublishedArticle',
  sourceEntity: Article,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'published']
  })
});

// === Interaction Definitions ===
const CreateArticle = Interaction.create({
  name: 'CreateArticle',
  action: Action.create({ name: 'createArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'authorId', base: User, isRef: true })
    ]
  })
});

const PublishArticle = Interaction.create({
  name: 'PublishArticle',
  action: Action.create({ name: 'publishArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', base: Article, isRef: true })
    ]
  })
});

const DeleteArticle = Interaction.create({
  name: 'DeleteArticle',
  action: Action.create({ name: 'deleteArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', base: Article, isRef: true })
    ]
  })
});

// === State Machine Definition ===
const DraftState = StateNode.create({ name: 'draft' });
const PublishedState = StateNode.create({ name: 'published' });
const DeletedState = StateNode.create({ name: 'deleted' });

const ArticleLifecycleStateMachine = StateMachine.create({
  name: 'ArticleLifecycle',
  states: [DraftState, PublishedState, DeletedState],
  defaultState: DraftState,
  transfers: [
    StateTransfer.create({
      current: DraftState,
      next: PublishedState,
      trigger: PublishArticle,
      computeTarget: (event) => ({ id: event.payload.articleId })
    }),
    StateTransfer.create({
      current: PublishedState,
      next: DeletedState,
      trigger: DeleteArticle,
      computeTarget: (event) => ({ id: event.payload.articleId })
    }),
    StateTransfer.create({
      current: DraftState,
      next: DeletedState,
      trigger: DeleteArticle,
      computeTarget: (event) => ({ id: event.payload.articleId })
    })
  ]
});

// === Relation Definition ===
const UserArticleRelation = Relation.create({
  source: Article,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'articles',
  type: 'n:1',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateArticle') {
        return {
          source: {
            title: event.payload.title,
            content: event.payload.content,
            createdAt: new Date().toISOString()
          },
          target: event.payload.authorId
        };
      }
      return null;
    }
  })
});

// === Usage Examples ===
// 1. Create article
await controller.callInteraction('CreateArticle', {
  user: { id: 'user123' },
  payload: {
    title: 'My First Article',
    content: 'This is the content...',
    authorId: 'user123'
  }
});

// 2. Publish article
await controller.callInteraction('PublishArticle', {
  user: { id: 'user123' },
  payload: {
    articleId: 'article456'
  }
});

// 3. Query active articles
const activeArticles = await controller.find('ActiveArticle');

// 4. Query published articles
const publishedArticles = await controller.find('PublishedArticle');

// 5. Delete article (soft delete)
await controller.callInteraction('DeleteArticle', {
  user: { id: 'user123' },
  payload: {
    articleId: 'article456'
  }
});
```

## Best Practices

1. **Always Use Soft Delete**: In reactive systems, hard deletion breaks data integrity and historical traceability.

2. **Reasonable Use of Filtered Entities**: For scenarios that frequently query non-deleted data, creating corresponding Filtered Entities can simplify queries.

3. **StateMachine Over Direct Updates**: Using StateMachine to manage entity state is clearer and more controllable than direct field updates.

4. **Record Operation History**: Use Transform to record important operation history for auditing and backtracking.

5. **Consider Relation Validity**: When entities support deletion, related relations also need validity management.

6. **Avoid Cascading Physical Deletion**: Even when "deleting" related data is needed, it should be implemented through marking or state management.

By following these patterns, you can build a robust, traceable, and easily maintainable reactive data system.
