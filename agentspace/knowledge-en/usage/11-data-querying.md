# 11. How to Handle Data Querying

Data querying is one of the core functionalities in the InterAQT framework, providing powerful and flexible data retrieval capabilities. The framework supports advanced features such as complex query conditions, relational queries, and deep queries, enabling developers to efficiently obtain the required data.

## 11.1 Basic Query Operations

### 11.1.1 findOne - Query Single Record

```typescript
import { MatchExp } from '@interaqt/storage';

// Basic single record query
const user = await system.storage.findOne(
  'User',                                          // Entity name
  MatchExp.atom({ key: 'id', value: ['=', 123] }), // Query condition
  {},                                              // Modifier (optional)
  ['name', 'email', 'age']                         // Attribute query (optional)
);

// Query by username
const userByName = await system.storage.findOne(
  'User',
  MatchExp.atom({ key: 'username', value: ['=', 'alice'] }),
  {},
  ['id', 'username', 'email', 'isActive']
);

// Query by email (case insensitive)
const userByEmail = await system.storage.findOne(
  'User',
  MatchExp.atom({ key: 'email', value: ['like', '%@example.com'] }),
  {},
  ['*'] // Query all attributes
);

console.log('Found user:', user);
```

### 11.1.2 find - Query Multiple Records

```typescript
// Query all active users
const activeUsers = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'isActive', value: ['=', true] }),
  {},
  ['id', 'username', 'email']
);

// Query users older than 18
const adultUsers = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'age', value: ['>', 18] }),
  {},
  ['id', 'username', 'age']
);

// Query all users (no conditions)
const allUsers = await system.storage.find(
  'User',
  undefined, // No query conditions
  {},
  ['id', 'username', 'createdAt']
);

console.log(`Found ${activeUsers.length} active users`);
```

### 11.1.3 Building Conditions with MatchExp

```typescript
// Create basic match condition
const basicMatch = MatchExp.atom({
  key: 'status',
  value: ['=', 'active']
});

// Create match condition from object
const objectMatch = MatchExp.fromObject({
  isActive: true,
  role: 'admin'
});

// Using factory method
const factoryMatch = system.storage.createMatchFromAtom({
  key: 'createdAt',
  value: ['>', '2023-01-01']
});

// Chain complex conditions
const complexMatch = MatchExp.atom({ key: 'age', value: ['>=', 18] })
  .and({ key: 'isActive', value: ['=', true] })
  .and({ key: 'role', value: ['in', ['user', 'admin']] });
```

## 11.2 Complex Query Conditions

### 11.2.1 Comparison Operators

```typescript
// Equals
const equalMatch = MatchExp.atom({ key: 'status', value: ['=', 'active'] });

// Not equals
const notEqualMatch = MatchExp.atom({ key: 'status', value: ['!=', 'deleted'] });

// Greater than
const greaterMatch = MatchExp.atom({ key: 'age', value: ['>', 18] });

// Greater than or equal
const greaterEqualMatch = MatchExp.atom({ key: 'score', value: ['>=', 80] });

// Less than
const lessMatch = MatchExp.atom({ key: 'price', value: ['<', 100] });

// Less than or equal
const lessEqualMatch = MatchExp.atom({ key: 'discount', value: ['<=', 0.5] });

// Like pattern matching
const likeMatch = MatchExp.atom({ key: 'email', value: ['like', '%@gmail.com'] });

// Range query
const betweenMatch = MatchExp.atom({ 
  key: 'createdAt', 
  value: ['between', ['2023-01-01', '2023-12-31']] 
});

// IN query
const inMatch = MatchExp.atom({ 
  key: 'category', 
  value: ['in', ['electronics', 'books', 'clothing']] 
});

// Not null check
const notNullMatch = MatchExp.atom({ key: 'email', value: ['not', null] });
```

### 11.2.2 Logical Combinations (AND/OR)

```typescript
// AND logical combination
const andCondition = MatchExp.atom({ key: 'age', value: ['>=', 18] })
  .and({ key: 'isActive', value: ['=', true] })
  .and({ key: 'role', value: ['!=', 'guest'] });

const adultActiveUsers = await system.storage.find(
  'User',
  andCondition,
  {},
  ['id', 'username', 'age', 'role']
);

// OR logical combination (implemented through multiple queries)
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

// Merge results
const privilegedUsers = [...adminUsers, ...moderatorUsers];

// Complex nested conditions
const complexCondition = MatchExp.atom({ key: 'isActive', value: ['=', true] })
  .and(
    MatchExp.atom({ key: 'age', value: ['>=', 18] })
      .and({ key: 'age', value: ['<=', 65] })
  )
  .and({ key: 'email', value: ['not', null] });
```

### 11.2.3 Relational Queries

```typescript
// Query through related entity properties
const usersWithGmailProfile = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'profile.email', value: ['like', '%@gmail.com'] }),
  {},
  ['id', 'username', ['profile', { attributeQuery: ['email', 'firstName'] }]]
);

// Query through multi-level related entity properties
const usersWithSpecificProfileTitle = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'profile.settings.title', value: ['=', 'VIP'] }),
  {},
  ['id', 'username']
);

// Query users with specific tags
const usersWithTags = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'tags.name', value: ['=', 'premium'] }),
  {},
  ['id', 'username', ['tags', { attributeQuery: ['name', 'category'] }]]
);
```

### 11.2.4 Nested Conditions

```typescript
// Existence query (EXIST)
const usersWithPosts = await system.storage.find(
  'User',
  MatchExp.atom({ 
    key: 'posts', 
    value: ['exist', { key: 'status', value: ['=', 'published'] }] 
  }),
  {},
  ['id', 'username']
);

// Complex existence query
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

// Reference value query (compare different fields in same record)
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

## 11.3 Modifiers and Sorting

### 11.3.1 Pagination

```typescript
// Basic pagination
const firstPage = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'isActive', value: ['=', true] }),
  { 
    limit: 10,    // 10 records per page
    offset: 0     // Start from record 0
  },
  ['id', 'username', 'email']
);

const secondPage = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'isActive', value: ['=', true] }),
  { 
    limit: 10, 
    offset: 10    // Start from record 10
  },
  ['id', 'username', 'email']
);

// Pagination utility function
async function getPaginatedUsers(page: number, pageSize: number = 10) {
  const offset = (page - 1) * pageSize;
  
  const users = await system.storage.find(
    'User',
    undefined,
    { limit: pageSize, offset },
    ['id', 'username', 'email', 'createdAt']
  );
  
  // Get total count (requires separate query)
  const totalUsers = await system.storage.find(
    'User',
    undefined,
    {},
    ['id'] // Only query ID for performance
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

// Use pagination query
const result = await getPaginatedUsers(1, 20);
console.log(`Page 1 of ${result.pagination.totalPages}, showing ${result.data.length} users`);
```

### 11.3.2 Sorting

```typescript
// Single field sorting
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

// Multi-field sorting
const usersSortedMultiple = await system.storage.find(
  'User',
  undefined,
  { 
    orderBy: { 
      isActive: 'DESC',  // First by active status descending
      age: 'ASC',        // Then by age ascending
      username: 'ASC'    // Finally by username ascending
    } 
  },
  ['id', 'username', 'age', 'isActive']
);

// Combine pagination and sorting
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

### 11.3.3 Combined Modifiers

```typescript
// Complete query example
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
  // Build query conditions
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
  
  // Build modifiers
  const modifier: any = {};
  
  if (criteria.sortBy) {
    modifier.orderBy = { [criteria.sortBy]: criteria.sortOrder || 'ASC' };
  }
  
  if (criteria.page && criteria.pageSize) {
    modifier.limit = criteria.pageSize;
    modifier.offset = (criteria.page - 1) * criteria.pageSize;
  }
  
  // Execute query
  const users = await system.storage.find(
    'User',
    matchCondition,
    modifier,
    ['id', 'username', 'email', 'age', 'role', 'isActive', 'createdAt']
  );
  
  return users;
}

// Use search function
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

## 11.4 Attribute Queries

### 11.4.1 Basic Attribute Selection

```typescript
// Select specific attributes
const basicUsers = await system.storage.find(
  'User',
  undefined,
  {},
  ['id', 'username', 'email'] // Only return these attributes
);

// Query all attributes
const fullUsers = await system.storage.find(
  'User',
  undefined,
  {},
  ['*'] // Return all attributes
);

// Exclude sensitive attributes
const publicUsers = await system.storage.find(
  'User',
  undefined,
  {},
  ['id', 'username', 'avatar', 'createdAt'] // Don't include email, password etc.
);
```

### 11.4.2 Nested Attribute Selection

```typescript
// Query users with their profiles
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

// Multi-level nested queries
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

// Conditional nested queries
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

### 11.4.3 Relationship Attribute Queries

```typescript
// Query user friendship relations
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
        ['&', { attributeQuery: ['since', 'closeness'] }] // Relationship attributes
      ] 
    }]
  ]
);

// Query orders with items
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
        ['&', { attributeQuery: ['quantity', 'unitPrice', 'discount'] }] // Order item attributes
      ] 
    }]
  ]
);

// Complex relationship queries
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
        ['&', { attributeQuery: ['role', 'joinedAt'] }], // Team member relationship attributes
        ['profile', { attributeQuery: ['firstName', 'lastName'] }] // Member profile
      ] 
    }],
    ['projects', { 
      attributeQuery: [
        'id',
        'name',
        'status',
        'deadline',
        ['&', { attributeQuery: ['priority', 'assignedAt'] }] // Project assignment relationship attributes
      ] 
    }]
  ]
);
```

## 11.5 Querying Relationship Data

### 11.5.1 Preloading Related Data

```typescript
// One-to-one relationship preloading
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

// One-to-many relationship preloading
const usersWithPosts = await system.storage.find(
  'User',
  undefined,
  { limit: 10 },
  [
    'id',
    'username',
    ['posts', { 
      attributeQuery: ['id', 'title', 'excerpt', 'publishedAt', 'status'],
      // Can filter related data
      matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'published'] })
    }]
  ]
);

// Many-to-many relationship preloading
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
        ['&', { attributeQuery: ['role', 'joinedAt'] }] // Relationship attributes
      ] 
    }]
  ]
);
```

### 11.5.2 Deep Queries

```typescript
// Multi-level relationship queries
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

// Complex business query: get user's complete social network info
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
          // Limit returned member count
          limit: 10
        }]
      ] 
    }]
  ]
);
```

### 11.5.3 Handling Circular References

```typescript
// Handle potential circular references
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
        // Don't query friends of friends to avoid circular references
        ['&', { attributeQuery: ['since', 'closeness'] }]
      ] 
    }]
  ]
);

// Use depth limits to avoid infinite recursion
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
        // Only query one level of parent to avoid excessive depth
      ] 
    }],
    ['children', { 
      attributeQuery: [
        'id',
        'name',
        // Only query one level of children
      ] 
    }]
  ]
);
```

## 11.6 Advanced Query Techniques

### 11.6.1 Dynamic Query Building

```typescript
// Dynamic query builder
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

// Use query builder
const activeAdultUsers = await new QueryBuilder('User')
  .where('isActive', '=', true)
  .where('age', '>=', 18)
  .whereIn('role', ['user', 'admin'])
  .orderBy('createdAt', 'DESC')
  .limit(20)
  .select('id', 'username', 'email', 'age', 'role')
  .execute();

// Complex dynamic query
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

### 11.6.2 Query Optimization

```typescript
// Index-friendly queries
const optimizedQuery = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'email', value: ['=', 'user@example.com'] }), // Assuming email has index
  {},
  ['id', 'username', 'isActive'] // Only query needed fields
);

// Batch query optimization
async function getUsersByIds(userIds: string[]) {
  // Use IN query instead of multiple individual queries
  return await system.storage.find(
    'User',
    MatchExp.atom({ key: 'id', value: ['in', userIds] }),
    {},
    ['id', 'username', 'email', 'avatar']
  );
}

// Pagination query optimization
async function getOptimizedPaginatedUsers(page: number, pageSize: number) {
  // Use cursor-based pagination instead of offset pagination (for large datasets)
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

// Preloading optimization
async function getUsersWithOptimizedRelations(userIds: string[]) {
  // Get users and related data in one go, avoid N+1 problem
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
        limit: 5 // Limit related data count
      }]
    ]
  );
}
```

### 11.6.3 Caching Query Results

```typescript
// Query result caching
class CachedQueryService {
  private cache = new Map<string, { data: any, timestamp: number }>();
  private ttl = 300000; // 5-minute TTL
  
  private generateCacheKey(entityName: string, matchCondition: any, modifier: any, attributes: any): string {
    return JSON.stringify({ entityName, matchCondition, modifier, attributes });
  }
  
  private isCacheValid(cacheEntry: { data: any, timestamp: number }): boolean {
    return Date.now() - cacheEntry.timestamp < this.ttl;
  }
  
  async find(entityName: string, matchCondition?: any, modifier: any = {}, attributes?: any): Promise<any[]> {
    const cacheKey = this.generateCacheKey(entityName, matchCondition, modifier, attributes);
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      console.log('Cache hit');
      return cached.data;
    }
    
    // Execute query
    console.log('Cache miss, executing query');
    const result = await system.storage.find(entityName, matchCondition, modifier, attributes);
    
    // Store in cache
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

// Use cached query service
const cachedQuery = new CachedQueryService();

// First query will execute actual query
const users1 = await cachedQuery.find('User', undefined, {}, ['id', 'username']);

// Second query will use cache
const users2 = await cachedQuery.find('User', undefined, {}, ['id', 'username']);

// When user data changes, clear related cache
// Can be integrated into data change events
async function onUserDataChanged() {
  cachedQuery.invalidateCache('User');
}
```

Data querying is key to building efficient applications. By mastering the query capabilities provided by the InterAQT framework, developers can flexibly obtain required data while maintaining good performance. Proper use of query conditions, attribute selection, relationship preloading, and caching strategies can significantly improve application response speed and user experience.
