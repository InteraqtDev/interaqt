# Reactive Patterns for Entity CRUD Operations

In interaqt, all data operations follow reactive design principles. This chapter will detail how to correctly handle entity creation, update, and deletion operations.

## Core Principles

1. **Creation**: Use Transform to listen to Interaction events to create entities
2. **Deletion**: Use soft delete pattern, manage deletion state through StateMachine
3. **Update**: Reactively update entity state through StateMachine or Transform
4. **Reference**: For entities that support deletion, use Filtered Entity to create "non-deleted" views

## Transform Usage Guidelines

Understanding where to place Transform is crucial:

1. **Entity's computation + Transform**: Use when you need to create new entities from interaction events
   - The entity listens to InteractionEventEntity
   - Returns entity data to be created
   - Related entities can be referenced directly in the returned data

2. **Relation's computation + Transform**: Use when you need to create relations between existing entities
   - The relation listens to InteractionEventEntity
   - Returns relation data (source, target, and any relation properties)
   - Both source and target entities must already exist

3. **Property's computation + Transform**: Use when you need to transform data from other entities/relations
   - Should reference different, already-defined entities
   - Never reference the entity being defined (use getValue for same-entity computations)

## Creating Entities - Using Transform

### Basic Pattern

By using Transform in an Entity's `computation`, you can listen to interaction events and create entities. When creating an entity that needs relations, include the related entity reference directly in the creation data:

```javascript
import { Entity, Property, Relation, Transform, InteractionEventEntity, Interaction, Action, Payload, PayloadItem } from 'interaqt';

// 1. Define entities
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'username', type: 'string' }),
    Property.create({ name: 'email', type: 'string' })
  ]
});

const Article = Entity.create({
  name: 'Article',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'draft' }),
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({ name: 'updatedAt', type: 'string' })
  ],
  // Transform in Entity's computation listens to interactions to create entities
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateArticle') {
        // Return entity data with relation reference
        // The relation will be created automatically
        return {
          title: event.payload.title,
          content: event.payload.content,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: {id: event.payload.authorId}  // Direct reference to User entity
        };
      }
      return null;
    }
  })
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

// 3. Define relation - no computation needed for creation
const UserArticleRelation = Relation.create({
  source: Article,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'articles',
  type: 'n:1'
});
```

### Creating Relations Between Existing Entities

When you need to create relations between already existing entities, use Transform in Relation's `computation`:

```javascript
// Define interaction to add article to favorites
const AddToFavorites = Interaction.create({
  name: 'AddToFavorites',
  action: Action.create({ name: 'addToFavorites' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', base: Article, isRef: true, required: true })
    ]
  })
});

// Favorite relation with Transform in computation
const UserFavoriteRelation = Relation.create({
  source: User,
  sourceProperty: 'favorites',
  target: Article,
  targetProperty: 'favoritedBy',
  type: 'n:n',
  properties: [
    Property.create({ name: 'addedAt', type: 'string' })
  ],
  // Transform creates relation between existing entities
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'AddToFavorites') {
        return {
          source: event.user,  // Current user
          target: {id:event.payload.articleId},  // Article to favorite
          addedAt: new Date().toISOString()
        };
      }
      return null;
    }
  })
});
```

### Creating Entities with Complex Relations

For entities that need to create multiple relations simultaneously, you can reference multiple entities in the creation data:

```javascript
// Define Tag entity
const Tag = Entity.create({
  name: 'Tag',
  properties: [
    Property.create({ name: 'name', type: 'string' })
  ]
});

// Update Article entity to handle creation with tags
const Article = Entity.create({
  name: 'Article',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'draft' }),
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({ name: 'updatedAt', type: 'string' })
  ],
  // Transform creates article and its relations
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateArticle') {
        return {
          title: event.payload.title,
          content: event.payload.content,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: {id:event.payload.authorId}
        };
      }
      if (event.interactionName === 'CreateArticleWithTags') {
        return {
          title: event.payload.title,
          content: event.payload.content,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: {id:event.payload.authorId},
          tags: event.payload.tagIds.map(id=> {id})  // Multiple relations
        };
      }
      return null;
    }
  })
});

// Create article with tags interaction
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

// Article-Tag relation - no computation needed for initial creation
const ArticleTagRelation = Relation.create({
  source: Article,
  sourceProperty: 'tags',
  target: Tag,
  targetProperty: 'articles',
  type: 'n:n',
  properties: [
    Property.create({ name: 'addedAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
});

// If you need to add tags to existing articles later, use Transform in relation
const AddTagsToArticle = Interaction.create({
  name: 'AddTagsToArticle',
  action: Action.create({ name: 'addTagsToArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', base: Article, isRef: true, required: true }),
      PayloadItem.create({ name: 'tagIds', base: Tag, isCollection: true, isRef: true })
    ]
  })
});

// Add Transform to handle adding tags to existing articles
ArticleTagRelation.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'AddTagsToArticle') {
      return event.payload.tagIds.map(tagId => ({
        source: {id:event.payload.articleId},
        target: {id:tagId},
        addedAt: new Date().toISOString()
      }));
    }
    return null;
  }
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
      computation: ArticleStatusStateMachine,
      defaultValue: () => ArticleStatusStateMachine.defaultState.name
    }),
    Property.create({
      name: 'deletedAt',
      type: 'string',
      computation: Transform.create({
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
  computation: Transform.create({
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
      computation: Count.create({
        record: UserArticleRelation,
        direction: 'target',
        callback: (relation) => relation.source.status !== 'deleted'
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
      computation: ArticleLifecycleStateMachine,
      defaultValue: () => 'draft'
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean',
      computed: (article) => article.status === 'deleted'
    })
  ],
  // Transform to create articles from interactions
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateArticle') {
        return {
          title: event.payload.title,
          content: event.payload.content,
          createdAt: new Date().toISOString(),
          author: {id:event.payload.authorId } // Relation created automatically
        };
      }
      return null;
    }
  })
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
  type: 'n:1'
  // No computation needed - relation is created automatically when Article is created with author reference
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
