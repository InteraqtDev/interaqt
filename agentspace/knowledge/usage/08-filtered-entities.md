# 如何使用过滤实体（Filtered Entity）

过滤实体（Filtered Entity）是 @interaqt/runtime 中的一个高级特性，它允许你创建基于特定条件的实体视图。过滤实体就像是原始实体的一个子集，只包含满足特定条件的记录，同时支持在这个子集上进行响应式计算。

## 理解过滤实体

### 什么是过滤实体

过滤实体是基于现有实体创建的虚拟视图，它：
- **基于条件过滤**：只包含满足特定条件的记录
- **实时更新**：当原始数据变化时，过滤结果自动更新
- **支持计算**：可以在过滤后的数据上进行响应式计算
- **保持引用**：过滤实体中的记录仍然是原始实体的引用

### 使用场景

过滤实体特别适用于以下场景：
- **状态分组**：如已发布的帖子、活跃用户、待处理订单
- **权限控制**：如用户只能看到自己的数据
- **分类统计**：如按类别统计商品数量
- **条件聚合**：如计算特定条件下的总和或平均值

### 过滤实体 vs 普通查询

```javascript
// 普通查询方式：每次都重新查询
const getPublishedPosts = async () => {
  return await controller.find('Post', { status: 'published' });
};

const getPublishedPostCount = async () => {
  return await controller.count('Post', { status: 'published' });
};

// 过滤实体方式：自动维护，响应式更新
const PublishedPost = Entity.create({
  name: 'PublishedPost',
  sourceEntity: Post,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'published']
  })
});

// 自动维护的计数
const GlobalStats = Entity.create({
  name: 'GlobalStats',
  properties: [
    Property.create({
      name: 'publishedPostCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: PublishedPost
      })  // 自动更新
    })
  ]
});
```

## 创建过滤实体

### 基于属性过滤

```javascript
import { FilteredEntity, Entity, Property } from '@interaqt/runtime';

// 原始实体
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }),
    Property.create({ name: 'category', type: 'string' }),
    Property.create({ name: 'publishedAt', type: 'string' }),
    Property.create({ name: 'viewCount', type: 'number', defaultValue: 0 })
  ]
});

// 创建已发布帖子的过滤实体
const PublishedPost = Entity.create({
  name: 'PublishedPost',
  sourceEntity: Post,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'published']
  })
});

// 创建热门帖子的过滤实体
const PopularPost = Entity.create({
  name: 'PopularPost',
  sourceEntity: Post,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'published']
  }).and({
    key: 'viewCount',
    value: ['>=', 1000]
  })
});

// 创建技术类帖子的过滤实体
const TechPost = Entity.create({
  name: 'TechPost',
  sourceEntity: Post,
  filterCondition: MatchExp.atom({
    key: 'category',
    value: ['=', 'technology']
  }).and({
    key: 'status',
    value: ['=', 'published']
  })
});
```

### 基于关系过滤

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }),
    Property.create({ name: 'lastLoginAt', type: 'string' })
  ]
});

const UserPost = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: '1:n'
});

// 创建活跃用户的过滤实体（最近30天有登录）
const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  }).and({
    key: 'lastLoginAt',
    value: ['>=', (() => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo.toISOString();
    })()]
  })
});

// 创建有帖子的用户过滤实体（需要通过关系查询实现）
const AuthorUser = Entity.create({
  name: 'AuthorUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'id',
    value: ['in', 'SELECT DISTINCT author FROM Post WHERE author IS NOT NULL']
  })
});
```

### 动态过滤条件

```javascript
// 使用函数作为过滤条件，支持动态计算
const RecentPost = FilteredEntity.create({
  name: 'RecentPost',
  baseEntity: Post,
  filter: () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    return {
      status: 'published',
      publishedAt: { $gte: sevenDaysAgo.toISOString() }
    };
  }
});

// 基于上下文的过滤（如用户权限）
const createUserVisiblePosts = (userId) => {
  return FilteredEntity.create({
    name: `UserVisiblePosts_${userId}`,
    baseEntity: Post,
    filter: async (context) => {
      const user = await context.findOne('User', { id: userId });
      
      if (user.role === 'admin') {
        // 管理员可以看到所有帖子
        return {};
      }
      
      if (user.role === 'moderator') {
        // 版主可以看到已发布和待审核的帖子
        return {
          status: { $in: ['published', 'pending_review'] }
        };
      }
      
      // 普通用户只能看到已发布的帖子
      return {
        status: 'published'
      };
    }
  });
};
```

### 复杂过滤条件

```javascript
// 使用复杂的查询条件
const AdvancedFilteredPost = FilteredEntity.create({
  name: 'AdvancedFilteredPost',
  baseEntity: Post,
  filter: {
    $and: [
      { status: 'published' },
      {
        $or: [
          { category: 'technology' },
          { category: 'science' }
        ]
      },
      {
        $expr: {
          $gt: [
            '$viewCount',
            { $multiply: ['$likeCount', 10] }
          ]
        }
      }
    ]
  }
});

// 基于日期范围的过滤
const MonthlyPost = FilteredEntity.create({
  name: 'MonthlyPost',
  baseEntity: Post,
  filter: (context) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    return {
      status: 'published',
      publishedAt: {
        $gte: startOfMonth.toISOString(),
        $lte: endOfMonth.toISOString()
      }
    };
  }
});
```

## 在过滤实体上操作

### 查询过滤后的数据

```javascript
// 查询过滤实体就像查询普通实体一样
const publishedPosts = await controller.find('PublishedPost');
console.log('已发布的帖子:', publishedPosts);

// 在过滤实体上进行进一步过滤
const recentPublishedPosts = await controller.find('PublishedPost', {
  publishedAt: {
    $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  }
});

// 查询单条记录
const firstPublishedPost = await controller.findOne('PublishedPost', {
  category: 'technology'
});

// 计数查询
const publishedPostCount = await controller.count('PublishedPost');
```

### 更新过滤后的数据

```javascript
// 更新过滤实体中的记录
await controller.update('PublishedPost', 
  { category: 'technology' },
  { 
    updatedAt: new Date().toISOString(),
    tags: ['tech', 'programming']
  }
);

// 批量更新
await controller.updateMany('PublishedPost',
  { viewCount: { $lt: 100 } },
  { 
    $inc: { viewCount: 10 }  // 给低浏览量的帖子增加10个浏览量
  }
);

// 更新单条记录
const post = await controller.findOne('PublishedPost', { id: 'post123' });
if (post) {
  await controller.update('PublishedPost',
    { id: post.id },
    { 
      title: '更新后的标题',
      content: '更新后的内容'
    }
  );
}
```

### 删除过滤后的数据

```javascript
// 删除过滤实体中的记录
await controller.delete('PublishedPost', { 
  category: 'outdated',
  publishedAt: {
    $lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()  // 一年前的过时内容
  }
});

// 软删除（更新状态而不是真正删除）
await controller.update('PublishedPost',
  { id: 'post123' },
  { status: 'archived' }  // 这会导致记录从 PublishedPost 中消失
);
```

## 过滤实体与响应式计算

### 在计算中使用过滤实体

```javascript
// 使用过滤实体进行计算
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    
    // 计算用户发布的帖子数量
    Property.create({
      name: 'publishedPostCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserPublishedPosts
      })
    }),
    
    // 计算用户热门帖子数量
    Property.create({
      name: 'popularPostCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserPopularPosts
      })
    }),
    
    // 计算用户帖子的总浏览量
    Property.create({
      name: 'totalViews',
      type: 'number',
      defaultValue: () => 0,
      computedData: WeightedSummation.create({
        record: UserPublishedPosts,
        callback: (relation) => ({
          weight: 1,
          value: relation.target.viewCount
        })
      })
    }),
    
    // 计算用户是否为活跃作者
    Property.create({
      name: 'isActiveAuthor',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Transform.create({
        record: UserRecentPosts,
        callback: (recentPosts) => recentPosts.length >= 3  // 最近有3篇以上帖子
      })
    })
  ]
});
```

### 全局统计计算

```javascript
const GlobalStats = Entity.create({
  name: 'GlobalStats',
  properties: [
    // 各种帖子统计
    Property.create({
      name: 'totalPublishedPosts',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: PublishedPost
      })
    }),
    
    Property.create({
      name: 'totalPopularPosts',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: PopularPost
      })
    }),
    
    Property.create({
      name: 'totalTechPosts',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: TechPost
      })
    }),
    
    // 用户统计
    Property.create({
      name: 'activeUserCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: ActiveUser
      })
    }),
    
    Property.create({
      name: 'authorCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: AuthorUser
      })
    }),
    
    // 复合统计
    Property.create({
      name: 'averageViewsPerPost',
      type: 'number',
      defaultValue: () => 0,
      computedData: Transform.create({
        record: PublishedPost,
        callback: (posts) => {
          if (posts.length === 0) return 0;
          const totalViews = posts.reduce((sum, post) => sum + post.viewCount, 0);
          return totalViews / posts.length;
        }
      })
    }),
    
    // 检查是否所有热门帖子都有标签
    Property.create({
      name: 'allPopularPostsTagged',
      type: 'boolean',
      computation: new Every(PopularPost, null, {
        'tags.length': { $gt: 0 }
      })
    })
  ]
});
```

### 分类统计

```javascript
// 为每个类别创建过滤实体
const categories = ['technology', 'science', 'business', 'lifestyle'];

const categoryEntities = categories.map(category => 
  FilteredEntity.create({
    name: `${category.charAt(0).toUpperCase() + category.slice(1)}Post`,
    baseEntity: Post,
    filter: {
      category: category,
      status: 'published'
    }
  })
);

// 创建分类统计实体
const CategoryStats = Entity.create({
  name: 'CategoryStats',
  properties: [
    ...categories.map(category => 
      Property.create({
        name: `${category}Count`,
        type: 'number',
        computation: new Count(
          categoryEntities.find(e => e.name.toLowerCase().startsWith(category))
        )
      })
    ),
    
    // 最受欢迎的类别
    Property.create({
      name: 'mostPopularCategory',
      type: 'string',
      computation: new Transform(
        categoryEntities,
        null,
        (allCategoryData) => {
          let maxCount = 0;
          let mostPopular = '';
          
          categories.forEach(category => {
            const categoryData = allCategoryData.find(data => 
              data.entityName.toLowerCase().startsWith(category)
            );
            if (categoryData && categoryData.count > maxCount) {
              maxCount = categoryData.count;
              mostPopular = category;
            }
          });
          
          return mostPopular;
        }
      )
    })
  ]
});
```

## 实时更新和事件处理

### 自动更新机制

```javascript
// 当原始数据发生变化时，过滤实体会自动更新
const createPost = async (postData) => {
  // 创建新帖子
  const post = await controller.create('Post', {
    ...postData,
    status: 'draft'  // 初始状态为草稿
  });
  
  // 此时 PublishedPost 中不会包含这篇帖子
  
  // 发布帖子
  await controller.update('Post', 
    { id: post.id },
    { status: 'published', publishedAt: new Date().toISOString() }
  );
  
  // 现在 PublishedPost 会自动包含这篇帖子
  // 相关的计算（如 publishedPostCount）也会自动更新
};
```

### 监听过滤实体变化

```javascript
// 监听过滤实体的变化事件
controller.on('filteredEntityChange', (event) => {
  console.log('过滤实体变化:', {
    entityName: event.entityName,
    changeType: event.changeType,  // 'added', 'removed', 'updated'
    recordId: event.recordId,
    oldData: event.oldData,
    newData: event.newData
  });
  
  // 可以在这里执行自定义逻辑
  if (event.entityName === 'PublishedPost' && event.changeType === 'added') {
    // 新帖子发布时的处理逻辑
    notifySubscribers(event.newData);
  }
});

// 监听特定过滤实体的变化
controller.on('PublishedPost:added', (post) => {
  console.log('新发布的帖子:', post);
  // 发送通知、更新缓存等
});

controller.on('ActiveUser:removed', (user) => {
  console.log('用户变为非活跃:', user);
  // 处理用户非活跃的逻辑
});
```

## 性能优化

### 索引优化

```javascript
// 为过滤条件中的字段添加索引
const OptimizedPost = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ 
      name: 'status', 
      type: 'string',
      index: true  // 为状态字段添加索引
    }),
    Property.create({ 
      name: 'category', 
      type: 'string',
      index: true  // 为类别字段添加索引
    }),
    Property.create({ 
      name: 'publishedAt', 
      type: 'string',
      index: true  // 为发布时间添加索引
    }),
    Property.create({ 
      name: 'viewCount', 
      type: 'number',
      index: true  // 为浏览量添加索引
    })
  ]
});

// 复合索引
const PostWithCompositeIndex = Entity.create({
  name: 'Post',
  properties: [
    // ... 其他属性
  ],
  indexes: [
    { fields: ['status', 'category'] },  // 复合索引
    { fields: ['status', 'publishedAt'] },
    { fields: ['category', 'viewCount'] }
  ]
});
```

### 缓存策略

```javascript
// 配置过滤实体的缓存策略
const CachedFilteredEntity = FilteredEntity.create({
  name: 'CachedPublishedPost',
  baseEntity: Post,
  filter: { status: 'published' },
  cache: {
    enabled: true,
    ttl: 300,  // 缓存5分钟
    invalidateOnChange: true  // 数据变化时自动失效缓存
  }
});
```

### 分页和限制

```javascript
// 查询过滤实体时使用分页
const getPublishedPostsPaginated = async (page = 1, limit = 20) => {
  return await controller.find('PublishedPost', {}, {
    offset: (page - 1) * limit,
    limit: limit,
    orderBy: [{ field: 'publishedAt', direction: 'desc' }]
  });
};

// 限制计算中使用的数据量
const TopPost = FilteredEntity.create({
  name: 'TopPost',
  baseEntity: Post,
  filter: { status: 'published' },
  options: {
    orderBy: [{ field: 'viewCount', direction: 'desc' }],
    limit: 100  // 只考虑前100篇浏览量最高的帖子
  }
});
```

## 最佳实践

### 1. 合理设计过滤条件

```javascript
// ✅ 高效的过滤条件
const EfficientFilter = FilteredEntity.create({
  name: 'EfficientFilter',
  baseEntity: Post,
  filter: {
    status: 'published',  // 简单的等值条件
    category: { $in: ['tech', 'science'] }  // 使用索引友好的操作
  }
});

// ❌ 低效的过滤条件
const InefficientFilter = FilteredEntity.create({
  name: 'InefficientFilter',
  baseEntity: Post,
  filter: {
    $where: function() {
      // 避免使用 $where，它无法使用索引
      return this.title.toLowerCase().includes('javascript');
    }
  }
});
```

### 2. 避免过度过滤

```javascript
// ✅ 合理的过滤粒度
const PublishedPost = FilteredEntity.create({
  name: 'PublishedPost',
  baseEntity: Post,
  filter: { status: 'published' }
});

const TechPost = FilteredEntity.create({
  name: 'TechPost',
  baseEntity: PublishedPost,  // 基于已有的过滤实体
  filter: { category: 'technology' }
});

// ❌ 过度细分的过滤实体
const TechPostOnMonday = FilteredEntity.create({
  name: 'TechPostOnMonday',
  baseEntity: Post,
  filter: {
    category: 'technology',
    status: 'published',
    $expr: {
      $eq: [{ $dayOfWeek: '$publishedAt' }, 2]  // 过于具体的条件
    }
  }
});
```

### 3. 合理使用计算

```javascript
// ✅ 在过滤实体上进行合适的计算
const UserStats = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'publishedPostCount',
      type: 'number',
      computation: new Count(PublishedPost, 'author')  // 简单计数
    })
  ]
});

// ❌ 在过滤实体上进行复杂计算
const ComplexUserStats = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'complexScore',
      type: 'number',
      computation: new Transform(
        PublishedPost,
        'author',
        (posts) => {
          // 避免在计算中进行复杂的数据处理
          return posts.reduce((score, post) => {
            return score + (post.viewCount * 0.1 + post.likeCount * 0.5);
          }, 0);
        }
      )
    })
  ]
});
```

### 4. 监控性能

```javascript
// 监控过滤实体的性能
const monitorFilteredEntity = (entityName) => {
  controller.on(`${entityName}:query`, (event) => {
    console.log(`查询 ${entityName}:`, {
      duration: event.duration,
      resultCount: event.resultCount,
      filter: event.filter
    });
    
    if (event.duration > 1000) {  // 查询超过1秒
      console.warn(`${entityName} 查询性能警告:`, event);
    }
  });
};

monitorFilteredEntity('PublishedPost');
monitorFilteredEntity('ActiveUser');
```

过滤实体为 @interaqt/runtime 提供了强大的数据视图和计算能力。通过合理使用过滤实体，可以创建高效、实时更新的数据统计和分析系统，同时保持代码的清晰和可维护性。 