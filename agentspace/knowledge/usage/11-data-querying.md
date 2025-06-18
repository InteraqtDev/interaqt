# 11. 如何处理数据查询

数据查询是 @interaqt/runtime 框架中的核心功能之一，提供了强大而灵活的数据检索能力。框架支持复杂的查询条件、关联查询、深度查询等高级特性，让开发者能够高效地获取所需的数据。

## 11.1 基本查询操作

### 11.1.1 findOne 查询单条记录

```typescript
import { MatchExp } from '@interaqt/storage';

// 基本的单条查询
const user = await system.storage.findOne(
  'User',                                          // 实体名称
  MatchExp.atom({ key: 'id', value: ['=', 123] }), // 查询条件
  {},                                              // 修饰符（可选）
  ['name', 'email', 'age']                         // 属性查询（可选）
);

// 按用户名查询
const userByName = await system.storage.findOne(
  'User',
  MatchExp.atom({ key: 'username', value: ['=', 'alice'] }),
  {},
  ['id', 'username', 'email', 'isActive']
);

// 按邮箱查询（不区分大小写）
const userByEmail = await system.storage.findOne(
  'User',
  MatchExp.atom({ key: 'email', value: ['like', '%@example.com'] }),
  {},
  ['*'] // 查询所有属性
);

console.log('Found user:', user);
```

### 11.1.2 find 查询多条记录

```typescript
// 查询所有活跃用户
const activeUsers = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'isActive', value: ['=', true] }),
  {},
  ['id', 'username', 'email']
);

// 查询年龄大于18的用户
const adultUsers = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'age', value: ['>', 18] }),
  {},
  ['id', 'username', 'age']
);

// 查询所有用户（无条件）
const allUsers = await system.storage.find(
  'User',
  undefined, // 无查询条件
  {},
  ['id', 'username', 'createdAt']
);

console.log(`Found ${activeUsers.length} active users`);
```

### 11.1.3 使用 MatchExp 构建条件

```typescript
// 创建基本匹配条件
const basicMatch = MatchExp.atom({
  key: 'status',
  value: ['=', 'active']
});

// 从对象创建匹配条件
const objectMatch = MatchExp.fromObject({
  isActive: true,
  role: 'admin'
});

// 使用工厂方法创建
const factoryMatch = system.storage.createMatchFromAtom({
  key: 'createdAt',
  value: ['>', '2023-01-01']
});

// 链式构建复杂条件
const complexMatch = MatchExp.atom({ key: 'age', value: ['>=', 18] })
  .and({ key: 'isActive', value: ['=', true] })
  .and({ key: 'role', value: ['in', ['user', 'admin']] });
```

## 11.2 复杂查询条件

### 11.2.1 比较操作符

```typescript
// 等于
const equalMatch = MatchExp.atom({ key: 'status', value: ['=', 'active'] });

// 不等于
const notEqualMatch = MatchExp.atom({ key: 'status', value: ['!=', 'deleted'] });

// 大于
const greaterMatch = MatchExp.atom({ key: 'age', value: ['>', 18] });

// 大于等于
const greaterEqualMatch = MatchExp.atom({ key: 'score', value: ['>=', 80] });

// 小于
const lessMatch = MatchExp.atom({ key: 'price', value: ['<', 100] });

// 小于等于
const lessEqualMatch = MatchExp.atom({ key: 'discount', value: ['<=', 0.5] });

// 模糊匹配
const likeMatch = MatchExp.atom({ key: 'email', value: ['like', '%@gmail.com'] });

// 范围查询
const betweenMatch = MatchExp.atom({ 
  key: 'createdAt', 
  value: ['between', ['2023-01-01', '2023-12-31']] 
});

// IN 查询
const inMatch = MatchExp.atom({ 
  key: 'category', 
  value: ['in', ['electronics', 'books', 'clothing']] 
});

// 非空检查
const notNullMatch = MatchExp.atom({ key: 'email', value: ['not', null] });
```

### 11.2.2 逻辑组合（AND/OR）

```typescript
// AND 逻辑组合
const andCondition = MatchExp.atom({ key: 'age', value: ['>=', 18] })
  .and({ key: 'isActive', value: ['=', true] })
  .and({ key: 'role', value: ['!=', 'guest'] });

const adultActiveUsers = await system.storage.find(
  'User',
  andCondition,
  {},
  ['id', 'username', 'age', 'role']
);

// OR 逻辑组合（通过多次查询实现）
const adminUsers = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'role', value: ['=', 'admin'] }),
  {},
  ['id', 'username', 'role']
);

const moderatorUsers = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'role', value: ['=', 'moderator'] }),
  {},
  ['id', 'username', 'role']
);

// 合并结果
const privilegedUsers = [...adminUsers, ...moderatorUsers];

// 复杂的嵌套条件
const complexCondition = MatchExp.atom({ key: 'isActive', value: ['=', true] })
  .and(
    MatchExp.atom({ key: 'age', value: ['>=', 18] })
      .and({ key: 'age', value: ['<=', 65] })
  )
  .and({ key: 'email', value: ['not', null] });
```

### 11.2.3 关联查询

```typescript
// 通过关联实体的属性查询
const usersWithGmailProfile = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'profile.email', value: ['like', '%@gmail.com'] }),
  {},
  ['id', 'username', ['profile', { attributeQuery: ['email', 'firstName'] }]]
);

// 通过关联实体的多层属性查询
const usersWithSpecificProfileTitle = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'profile.settings.title', value: ['=', 'VIP'] }),
  {},
  ['id', 'username']
);

// 查询拥有特定标签的用户
const usersWithTags = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'tags.name', value: ['=', 'premium'] }),
  {},
  ['id', 'username', ['tags', { attributeQuery: ['name', 'category'] }]]
);
```

### 11.2.4 嵌套条件

```typescript
// 存在性查询（EXIST）
const usersWithPosts = await system.storage.find(
  'User',
  MatchExp.atom({ 
    key: 'posts', 
    value: ['exist', { key: 'status', value: ['=', 'published'] }] 
  }),
  {},
  ['id', 'username']
);

// 复杂的存在性查询
const usersWithRecentPosts = await system.storage.find(
  'User',
  MatchExp.atom({ 
    key: 'posts', 
    value: ['exist', MatchExp.atom({ key: 'publishedAt', value: ['>', '2023-01-01'] })
      .and({ key: 'status', value: ['=', 'published'] })] 
  }),
  {},
  ['id', 'username', 'email']
);

// 引用值查询（比较同一记录中的不同字段）
const usersWithHighScore = await system.storage.find(
  'User',
  MatchExp.atom({ 
    key: 'currentScore', 
    value: ['>', 'bestScore'], 
    isReferenceValue: true 
  }),
  {},
  ['id', 'username', 'currentScore', 'bestScore']
);
```

## 11.3 修饰符和排序

### 11.3.1 分页查询

```typescript
// 基本分页
const firstPage = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'isActive', value: ['=', true] }),
  { 
    limit: 10,    // 每页10条
    offset: 0     // 从第0条开始
  },
  ['id', 'username', 'email']
);

const secondPage = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'isActive', value: ['=', true] }),
  { 
    limit: 10, 
    offset: 10    // 从第10条开始
  },
  ['id', 'username', 'email']
);

// 分页查询工具函数
async function getPaginatedUsers(page: number, pageSize: number = 10) {
  const offset = (page - 1) * pageSize;
  
  const users = await system.storage.find(
    'User',
    undefined,
    { limit: pageSize, offset },
    ['id', 'username', 'email', 'createdAt']
  );
  
  // 获取总数（需要单独查询）
  const totalUsers = await system.storage.find(
    'User',
    undefined,
    {},
    ['id'] // 只查询ID以提高性能
  );
  
  return {
    data: users,
    pagination: {
      page,
      pageSize,
      total: totalUsers.length,
      totalPages: Math.ceil(totalUsers.length / pageSize)
    }
  };
}

// 使用分页查询
const result = await getPaginatedUsers(1, 20);
console.log(`Page 1 of ${result.pagination.totalPages}, showing ${result.data.length} users`);
```

### 11.3.2 排序

```typescript
// 单字段排序
const usersSortedByAge = await system.storage.find(
  'User',
  undefined,
  { orderBy: { age: 'ASC' } },
  ['id', 'username', 'age']
);

const usersSortedByNameDesc = await system.storage.find(
  'User',
  undefined,
  { orderBy: { username: 'DESC' } },
  ['id', 'username', 'createdAt']
);

// 多字段排序
const usersSortedMultiple = await system.storage.find(
  'User',
  undefined,
  { 
    orderBy: { 
      isActive: 'DESC',  // 先按活跃状态降序
      age: 'ASC',        // 再按年龄升序
      username: 'ASC'    // 最后按用户名升序
    } 
  },
  ['id', 'username', 'age', 'isActive']
);

// 结合分页和排序
const topUsers = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'score', value: ['>', 0] }),
  { 
    orderBy: { score: 'DESC' },
    limit: 10,
    offset: 0
  },
  ['id', 'username', 'score']
);
```

### 11.3.3 组合修饰符

```typescript
// 完整的查询示例
async function searchUsers(criteria: {
  keyword?: string;
  minAge?: number;
  maxAge?: number;
  isActive?: boolean;
  roles?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}) {
  // 构建查询条件
  let matchCondition = undefined;
  
  if (criteria.keyword) {
    matchCondition = MatchExp.atom({ 
      key: 'username', 
      value: ['like', `%${criteria.keyword}%`] 
    });
  }
  
  if (criteria.minAge !== undefined) {
    const ageCondition = MatchExp.atom({ key: 'age', value: ['>=', criteria.minAge] });
    matchCondition = matchCondition ? matchCondition.and(ageCondition) : ageCondition;
  }
  
  if (criteria.maxAge !== undefined) {
    const ageCondition = MatchExp.atom({ key: 'age', value: ['<=', criteria.maxAge] });
    matchCondition = matchCondition ? matchCondition.and(ageCondition) : ageCondition;
  }
  
  if (criteria.isActive !== undefined) {
    const activeCondition = MatchExp.atom({ key: 'isActive', value: ['=', criteria.isActive] });
    matchCondition = matchCondition ? matchCondition.and(activeCondition) : activeCondition;
  }
  
  if (criteria.roles && criteria.roles.length > 0) {
    const roleCondition = MatchExp.atom({ key: 'role', value: ['in', criteria.roles] });
    matchCondition = matchCondition ? matchCondition.and(roleCondition) : roleCondition;
  }
  
  // 构建修饰符
  const modifier: any = {};
  
  if (criteria.sortBy) {
    modifier.orderBy = { [criteria.sortBy]: criteria.sortOrder || 'ASC' };
  }
  
  if (criteria.page && criteria.pageSize) {
    modifier.limit = criteria.pageSize;
    modifier.offset = (criteria.page - 1) * criteria.pageSize;
  }
  
  // 执行查询
  const users = await system.storage.find(
    'User',
    matchCondition,
    modifier,
    ['id', 'username', 'email', 'age', 'role', 'isActive', 'createdAt']
  );
  
  return users;
}

// 使用搜索函数
const searchResults = await searchUsers({
  keyword: 'john',
  minAge: 18,
  maxAge: 65,
  isActive: true,
  roles: ['user', 'admin'],
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'DESC'
});
```

## 11.4 属性查询

### 11.4.1 基本属性选择

```typescript
// 选择特定属性
const basicUsers = await system.storage.find(
  'User',
  undefined,
  {},
  ['id', 'username', 'email'] // 只返回这些属性
);

// 查询所有属性
const fullUsers = await system.storage.find(
  'User',
  undefined,
  {},
  ['*'] // 返回所有属性
);

// 排除某些敏感属性
const publicUsers = await system.storage.find(
  'User',
  undefined,
  {},
  ['id', 'username', 'avatar', 'createdAt'] // 不包含email、password等敏感信息
);
```

### 11.4.2 嵌套属性选择

```typescript
// 查询用户及其个人资料
const usersWithProfiles = await system.storage.find(
  'User',
  undefined,
  {},
  [
    'id',
    'username',
    ['profile', { 
      attributeQuery: ['firstName', 'lastName', 'avatar'] 
    }]
  ]
);

// 多层嵌套查询
const usersWithDetailedInfo = await system.storage.find(
  'User',
  undefined,
  {},
  [
    'id',
    'username',
    'email',
    ['profile', { 
      attributeQuery: [
        'firstName', 
        'lastName',
        ['settings', { 
          attributeQuery: ['theme', 'language', 'notifications'] 
        }]
      ] 
    }],
    ['posts', { 
      attributeQuery: ['id', 'title', 'publishedAt'] 
    }]
  ]
);

// 条件性嵌套查询
const usersWithPublishedPosts = await system.storage.find(
  'User',
  undefined,
  {},
  [
    'id',
    'username',
    ['posts', { 
      attributeQuery: ['id', 'title', 'content', 'publishedAt'],
      matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'published'] })
    }]
  ]
);
```

### 11.4.3 关系属性查询

```typescript
// 查询用户的好友关系
const usersWithFriends = await system.storage.find(
  'User',
  undefined,
  {},
  [
    'id',
    'username',
    ['friends', { 
      attributeQuery: [
        'id', 
        'username', 
        'avatar',
        ['&', { attributeQuery: ['since', 'closeness'] }] // 关系属性
      ] 
    }]
  ]
);

// 查询订单及其商品
const ordersWithItems = await system.storage.find(
  'Order',
  undefined,
  {},
  [
    'id',
    'orderNumber',
    'totalAmount',
    'status',
    ['items', { 
      attributeQuery: [
        ['product', { attributeQuery: ['name', 'price', 'category'] }],
        ['&', { attributeQuery: ['quantity', 'unitPrice', 'discount'] }] // 订单项属性
      ] 
    }]
  ]
);

// 复杂的关系查询
const teamProjectInfo = await system.storage.find(
  'Team',
  undefined,
  {},
  [
    'id',
    'name',
    'description',
    ['members', { 
      attributeQuery: [
        'id',
        'username',
        'email',
        ['&', { attributeQuery: ['role', 'joinedAt'] }], // 团队成员关系属性
        ['profile', { attributeQuery: ['firstName', 'lastName'] }] // 成员的个人资料
      ] 
    }],
    ['projects', { 
      attributeQuery: [
        'id',
        'name',
        'status',
        'deadline',
        ['&', { attributeQuery: ['priority', 'assignedAt'] }] // 项目分配关系属性
      ] 
    }]
  ]
);
```

## 11.5 关系数据的查询

### 11.5.1 预加载关联数据

```typescript
// 一对一关系预加载
const usersWithProfiles = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'isActive', value: ['=', true] }),
  {},
  [
    'id',
    'username',
    'email',
    ['profile', { 
      attributeQuery: ['firstName', 'lastName', 'bio', 'avatar'] 
    }]
  ]
);

// 一对多关系预加载
const usersWithPosts = await system.storage.find(
  'User',
  undefined,
  { limit: 10 },
  [
    'id',
    'username',
    ['posts', { 
      attributeQuery: ['id', 'title', 'excerpt', 'publishedAt', 'status'],
      // 可以对关联数据进行过滤
      matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'published'] })
    }]
  ]
);

// 多对多关系预加载
const usersWithTeams = await system.storage.find(
  'User',
  undefined,
  {},
  [
    'id',
    'username',
    ['teams', { 
      attributeQuery: [
        'id',
        'name',
        'description',
        ['&', { attributeQuery: ['role', 'joinedAt'] }] // 关系属性
      ] 
    }]
  ]
);
```

### 11.5.2 深度查询

```typescript
// 多层关系查询
const deepRelationQuery = await system.storage.find(
  'User',
  undefined,
  { limit: 5 },
  [
    'id',
    'username',
    ['posts', { 
      attributeQuery: [
        'id',
        'title',
        'content',
        ['comments', { 
          attributeQuery: [
            'id',
            'content',
            'createdAt',
            ['author', { 
              attributeQuery: ['id', 'username', 'avatar'] 
            }],
            ['replies', { 
              attributeQuery: [
                'id',
                'content',
                ['author', { attributeQuery: ['username'] }]
              ] 
            }]
          ] 
        }],
        ['tags', { 
          attributeQuery: ['name', 'category'] 
        }]
      ] 
    }]
  ]
);

// 复杂的业务查询：获取用户的完整社交网络信息
const socialNetworkInfo = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'id', value: ['=', userId] }),
  {},
  [
    'id',
    'username',
    'email',
    ['profile', { 
      attributeQuery: ['firstName', 'lastName', 'bio', 'location'] 
    }],
    ['friends', { 
      attributeQuery: [
        'id',
        'username',
        ['profile', { attributeQuery: ['firstName', 'lastName'] }],
        ['&', { attributeQuery: ['since', 'closeness'] }]
      ] 
    }],
    ['posts', { 
      attributeQuery: [
        'id',
        'title',
        'content',
        'publishedAt',
        ['likes', { 
          attributeQuery: [
            ['user', { attributeQuery: ['username'] }],
            ['&', { attributeQuery: ['likedAt'] }]
          ] 
        }],
        ['comments', { 
          attributeQuery: [
            'content',
            'createdAt',
            ['author', { attributeQuery: ['username'] }]
          ] 
        }]
      ],
      matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'published'] })
    }],
    ['groups', { 
      attributeQuery: [
        'id',
        'name',
        'description',
        ['&', { attributeQuery: ['role', 'joinedAt'] }],
        ['members', { 
          attributeQuery: ['username'],
          // 限制返回的成员数量
          limit: 10
        }]
      ] 
    }]
  ]
);
```

### 11.5.3 循环引用处理

```typescript
// 处理可能的循环引用
const usersWithLimitedFriends = await system.storage.find(
  'User',
  undefined,
  { limit: 10 },
  [
    'id',
    'username',
    ['friends', { 
      attributeQuery: [
        'id',
        'username',
        // 不再查询朋友的朋友，避免循环引用
        ['&', { attributeQuery: ['since', 'closeness'] }]
      ] 
    }]
  ]
);

// 使用深度限制避免无限递归
const limitedDepthQuery = await system.storage.find(
  'Category',
  undefined,
  {},
  [
    'id',
    'name',
    ['parent', { 
      attributeQuery: [
        'id',
        'name',
        // 只查询一层父级，避免深度过大
      ] 
    }],
    ['children', { 
      attributeQuery: [
        'id',
        'name',
        // 只查询一层子级
      ] 
    }]
  ]
);
```

## 11.6 高级查询技巧

### 11.6.1 动态查询构建

```typescript
// 动态查询构建器
class QueryBuilder {
  private matchCondition?: MatchExpressionData;
  private modifier: any = {};
  private attributes: string[] = [];
  
  constructor(private entityName: string) {}
  
  where(key: string, operator: string, value: any): this {
    const condition = MatchExp.atom({ key, value: [operator, value] });
    this.matchCondition = this.matchCondition ? this.matchCondition.and(condition) : condition;
    return this;
  }
  
  whereIn(key: string, values: any[]): this {
    return this.where(key, 'in', values);
  }
  
  whereLike(key: string, pattern: string): this {
    return this.where(key, 'like', pattern);
  }
  
  whereBetween(key: string, min: any, max: any): this {
    return this.where(key, 'between', [min, max]);
  }
  
  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.modifier.orderBy = { ...this.modifier.orderBy, [field]: direction };
    return this;
  }
  
  limit(count: number): this {
    this.modifier.limit = count;
    return this;
  }
  
  offset(count: number): this {
    this.modifier.offset = count;
    return this;
  }
  
  select(...attributes: string[]): this {
    this.attributes = attributes;
    return this;
  }
  
  async execute(): Promise<any[]> {
    return await system.storage.find(
      this.entityName,
      this.matchCondition,
      this.modifier,
      this.attributes.length > 0 ? this.attributes : ['*']
    );
  }
  
  async first(): Promise<any> {
    this.limit(1);
    const results = await this.execute();
    return results[0] || null;
  }
}

// 使用查询构建器
const activeAdultUsers = await new QueryBuilder('User')
  .where('isActive', '=', true)
  .where('age', '>=', 18)
  .whereIn('role', ['user', 'admin'])
  .orderBy('createdAt', 'DESC')
  .limit(20)
  .select('id', 'username', 'email', 'age', 'role')
  .execute();

// 复杂的动态查询
const searchResults = await new QueryBuilder('Product')
  .where('isActive', '=', true)
  .whereLike('name', '%laptop%')
  .whereBetween('price', 500, 2000)
  .whereIn('category', ['electronics', 'computers'])
  .orderBy('price', 'ASC')
  .orderBy('rating', 'DESC')
  .limit(50)
  .select('id', 'name', 'price', 'category', 'rating', 'description')
  .execute();
```

### 11.6.2 查询优化

```typescript
// 索引友好的查询
const optimizedQuery = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'email', value: ['=', 'user@example.com'] }), // 假设email有索引
  {},
  ['id', 'username', 'isActive'] // 只查询需要的字段
);

// 批量查询优化
async function getUsersByIds(userIds: string[]) {
  // 使用IN查询而不是多次单独查询
  return await system.storage.find(
    'User',
    MatchExp.atom({ key: 'id', value: ['in', userIds] }),
    {},
    ['id', 'username', 'email', 'avatar']
  );
}

// 分页查询优化
async function getOptimizedPaginatedUsers(page: number, pageSize: number) {
  // 使用游标分页而不是偏移分页（当数据量很大时）
  const lastUserId = page > 1 ? await getLastUserIdFromPreviousPage(page - 1, pageSize) : null;
  
  let matchCondition = undefined;
  if (lastUserId) {
    matchCondition = MatchExp.atom({ key: 'id', value: ['>', lastUserId] });
  }
  
  return await system.storage.find(
    'User',
    matchCondition,
    { 
      orderBy: { id: 'ASC' },
      limit: pageSize 
    },
    ['id', 'username', 'email', 'createdAt']
  );
}

// 预加载优化
async function getUsersWithOptimizedRelations(userIds: string[]) {
  // 一次性获取用户和关联数据，避免N+1问题
  return await system.storage.find(
    'User',
    MatchExp.atom({ key: 'id', value: ['in', userIds] }),
    {},
    [
      'id',
      'username',
      'email',
      ['profile', { 
        attributeQuery: ['firstName', 'lastName', 'avatar'] 
      }],
      ['posts', { 
        attributeQuery: ['id', 'title', 'publishedAt'],
        matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'published'] }),
        limit: 5 // 限制关联数据数量
      }]
    ]
  );
}
```

### 11.6.3 缓存查询结果

```typescript
// 查询结果缓存
class CachedQueryService {
  private cache = new Map<string, { data: any, timestamp: number }>();
  private ttl = 300000; // 5分钟TTL
  
  private generateCacheKey(entityName: string, matchCondition: any, modifier: any, attributes: any): string {
    return JSON.stringify({ entityName, matchCondition, modifier, attributes });
  }
  
  private isCacheValid(cacheEntry: { data: any, timestamp: number }): boolean {
    return Date.now() - cacheEntry.timestamp < this.ttl;
  }
  
  async find(entityName: string, matchCondition?: any, modifier: any = {}, attributes?: any): Promise<any[]> {
    const cacheKey = this.generateCacheKey(entityName, matchCondition, modifier, attributes);
    
    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      console.log('Cache hit');
      return cached.data;
    }
    
    // 执行查询
    console.log('Cache miss, executing query');
    const result = await system.storage.find(entityName, matchCondition, modifier, attributes);
    
    // 存入缓存
    this.cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    return result;
  }
  
  async findOne(entityName: string, matchCondition?: any, modifier: any = {}, attributes?: any): Promise<any> {
    const results = await this.find(entityName, matchCondition, { ...modifier, limit: 1 }, attributes);
    return results[0] || null;
  }
  
  clearCache(): void {
    this.cache.clear();
  }
  
  invalidateCache(pattern?: string): void {
    if (!pattern) {
      this.clearCache();
      return;
    }
    
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

// 使用缓存查询服务
const cachedQuery = new CachedQueryService();

// 第一次查询会执行实际查询
const users1 = await cachedQuery.find('User', undefined, {}, ['id', 'username']);

// 第二次查询会使用缓存
const users2 = await cachedQuery.find('User', undefined, {}, ['id', 'username']);

// 当用户数据发生变化时，清除相关缓存
// 可以集成到数据变更事件中
async function onUserDataChanged() {
  cachedQuery.invalidateCache('User');
}
```

数据查询是构建高效应用的关键。通过掌握 @interaqt/runtime 框架提供的查询能力，开发者可以灵活地获取所需数据，同时保持良好的性能。合理使用查询条件、属性选择、关系预加载和缓存策略，能够显著提升应用的响应速度和用户体验。