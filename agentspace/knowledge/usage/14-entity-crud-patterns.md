# 实体增删改的响应式模式

在 interaqt 中，所有的数据操作都遵循响应式的设计理念。本章将详细介绍如何正确处理实体的创建、更新和删除操作。

## 核心原则

1. **创建**：使用 Transform 监听 Interaction 事件来创建实体
2. **删除**：使用软删除模式，通过 StateMachine 管理删除状态
3. **更新**：通过 StateMachine 或 Transform 来响应式更新实体状态
4. **引用**：对支持删除的实体，使用 Filtered Entity 创建"未删除"视图

## 创建实体 - 使用 Transform

### 基本模式

通过在 Relation 的 `computedData` 中使用 Transform，可以监听交互事件并创建实体：

```javascript
import { Entity, Property, Relation, Transform, InteractionEventEntity, Interaction, Action, Payload, PayloadItem } from 'interaqt';

// 1. 定义实体
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

// 2. 定义创建交互
const CreateArticle = Interaction.create({
  name: 'CreateArticle',
  action: Action.create({ name: 'createArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', type: 'string', required: true }),
      PayloadItem.create({ name: 'content', type: 'string', required: true }),
      PayloadItem.create({ name: 'authorId', type: 'string', isRef: true, refEntity: 'User', required: true })
    ]
  })
});

// 3. 定义关系，并在 computedData 中处理创建逻辑
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
        // 返回要创建的关系和实体数据
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

### 创建带复杂关系的实体

对于需要同时创建多个关系的实体，可以使用多个 Transform：

```javascript
// 创建带标签的文章
const CreateArticleWithTags = Interaction.create({
  name: 'CreateArticleWithTags',
  action: Action.create({ name: 'createArticleWithTags' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', type: 'string', required: true }),
      PayloadItem.create({ name: 'content', type: 'string', required: true }),
      PayloadItem.create({ name: 'authorId', type: 'string', isRef: true, refEntity: 'User' }),
      PayloadItem.create({ name: 'tagIds', type: 'string', collection: true, isRef: true, refEntity: 'Tag' })
    ]
  })
});

// 文章-标签关系
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
        // 需要获取创建的文章ID
        // 通常会在 UserArticleRelation 的 Transform 中保存
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

## 删除实体 - 软删除模式

### 使用 StateMachine 管理删除状态

在响应式系统中，推荐使用软删除而非物理删除：

```javascript
import { StateMachine, StateNode, StateTransfer } from 'interaqt';

// 1. 定义删除相关的交互
const DeleteArticle = Interaction.create({
  name: 'DeleteArticle',
  action: Action.create({ name: 'deleteArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'articleId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Article',
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
        type: 'string', 
        isRef: true, 
        refEntity: 'Article',
        required: true 
      })
    ]
  })
});

// 2. 定义状态节点
const ActiveState = StateNode.create({ name: 'active' });
const DeletedState = StateNode.create({ name: 'deleted' });

// 3. 创建状态机
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

// 4. 将状态机应用到实体
const Article = Entity.create({
  name: 'Article',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean',
      // 基于状态计算是否删除
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
            return null; // 恢复时清除删除时间
          }
          return undefined; // 保持原值
        }
      })
    })
  ]
});
```

## 使用 Filtered Entity 处理未删除实体

对于支持删除的实体，在业务逻辑中通常只需要引用"未删除"的实体。使用 Filtered Entity 可以创建一个自动过滤的视图：

```javascript
// 创建只包含未删除文章的 Filtered Entity
const ActiveArticle = Entity.create({
  name: 'ActiveArticle',
  sourceEntity: Article,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['!=', 'deleted']
  })
  // 或者使用 isDeleted 字段
  // filterCondition: MatchExp.atom({
  //   key: 'isDeleted',
  //   value: ['=', false]
  // })
});

// 使用示例：
// 1. 查询所有活跃文章
const activeArticles = await controller.find('ActiveArticle', undefined, undefined, ['*']);

// 2. 查询特定用户的活跃文章
const userActiveArticles = await controller.find('ActiveArticle', 
  MatchExp.atom({ key: 'author.id', value: ['=', userId] }),
  undefined,
  ['title', 'content', 'createdAt']
);
```

### 重要注意事项

**Relation 不能直接引用 Filtered Entity**。如果需要表达"与未删除实体的关系"，应该：

1. 定义关系时使用完整实体
2. 使用 StateMachine 或条件逻辑控制关系的有效性

```javascript
// ❌ 错误：不能这样定义
const UserActiveArticleRelation = Relation.create({
  source: User,
  target: ActiveArticle, // 错误！不能使用 Filtered Entity
  // ...
});

// ✅ 正确：使用完整实体，通过逻辑控制
const UserFavoriteRelation = Relation.create({
  source: User,
  sourceProperty: 'favorites',
  target: Article, // 使用完整实体
  targetProperty: 'favoritedBy',
  type: 'n:n',
  properties: [
    Property.create({
      name: 'isActive',
      type: 'boolean',
      // 根据文章状态动态计算
      computed: function(relation) {
        return relation.target.status !== 'deleted';
      }
    })
  ]
});

// 查询时可以过滤
const activeFavorites = await controller.find('UserFavoriteRelation',
  MatchExp.atom({ key: 'source.id', value: ['=', userId] })
    .and({ key: 'target.status', value: ['!=', 'deleted'] }),
  undefined,
  [['target', { attributeQuery: ['title', 'content'] }]]
);
```

## 更新实体 - 响应式更新

### 使用 StateMachine 管理状态变化

```javascript
// 文章发布流程
const PublishArticle = Interaction.create({
  name: 'PublishArticle',
  action: Action.create({ name: 'publishArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', type: 'string', isRef: true, refEntity: 'Article' })
    ]
  })
});

const UnpublishArticle = Interaction.create({
  name: 'UnpublishArticle',
  action: Action.create({ name: 'unpublishArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', type: 'string', isRef: true, refEntity: 'Article' })
    ]
  })
});

// 发布状态机
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

### 使用 Transform 记录更新历史

```javascript
const UpdateArticle = Interaction.create({
  name: 'UpdateArticle',
  action: Action.create({ name: 'updateArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', type: 'string', isRef: true, refEntity: 'Article' }),
      PayloadItem.create({ name: 'title', type: 'string' }),
      PayloadItem.create({ name: 'content', type: 'string' })
    ]
  })
});

// 文章更新历史
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

## 完整示例：博客系统的增删改

```javascript
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity
} from 'interaqt';

// === 实体定义 ===
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'username', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({
      name: 'articleCount',
      type: 'number',
      computedData: Count.create({
        relation: UserArticleRelation,
        relationDirection: 'target',
        match: (article) => article.status !== 'deleted'
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

// === Filtered Entity ===
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

// === 交互定义 ===
const CreateArticle = Interaction.create({
  name: 'CreateArticle',
  action: Action.create({ name: 'createArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', type: 'string', required: true }),
      PayloadItem.create({ name: 'content', type: 'string', required: true }),
      PayloadItem.create({ name: 'authorId', type: 'string', isRef: true, refEntity: 'User' })
    ]
  })
});

const PublishArticle = Interaction.create({
  name: 'PublishArticle',
  action: Action.create({ name: 'publishArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', type: 'string', isRef: true, refEntity: 'Article' })
    ]
  })
});

const DeleteArticle = Interaction.create({
  name: 'DeleteArticle',
  action: Action.create({ name: 'deleteArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'articleId', type: 'string', isRef: true, refEntity: 'Article' })
    ]
  })
});

// === 状态机定义 ===
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

// === 关系定义 ===
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

// === 使用示例 ===
// 1. 创建文章
await controller.callInteraction('CreateArticle', {
  user: { id: 'user123' },
  payload: {
    title: 'My First Article',
    content: 'This is the content...',
    authorId: 'user123'
  }
});

// 2. 发布文章
await controller.callInteraction('PublishArticle', {
  user: { id: 'user123' },
  payload: {
    articleId: 'article456'
  }
});

// 3. 查询活跃文章
const activeArticles = await controller.find('ActiveArticle');

// 4. 查询已发布文章
const publishedArticles = await controller.find('PublishedArticle');

// 5. 删除文章（软删除）
await controller.callInteraction('DeleteArticle', {
  user: { id: 'user123' },
  payload: {
    articleId: 'article456'
  }
});
```

## 最佳实践

1. **始终使用软删除**：在响应式系统中，硬删除会破坏数据的完整性和历史追溯能力。

2. **合理使用 Filtered Entity**：对于需要频繁查询未删除数据的场景，创建对应的 Filtered Entity 可以简化查询。

3. **状态机优于直接更新**：使用 StateMachine 管理实体状态比直接更新字段更加清晰和可控。

4. **记录操作历史**：使用 Transform 记录重要的操作历史，便于审计和回溯。

5. **注意关系的有效性**：当实体支持删除时，相关的关系也需要考虑有效性管理。

6. **避免级联物理删除**：即使需要"删除"相关数据，也应该通过标记或状态管理来实现。

通过遵循这些模式，你可以构建一个健壮、可追溯、易于维护的响应式数据系统。 