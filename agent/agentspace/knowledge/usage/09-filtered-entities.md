# How to Use Filtered Entities

Filtered Entity is an advanced feature in interaqt that allows you to create entity views based on specific conditions. A filtered entity is like a subset of the original entity, containing only records that meet certain conditions, while supporting reactive computations on this subset.

## Understanding Filtered Entities

### What is a Filtered Entity

A filtered entity is a virtual view created based on an existing entity, which:
- **Filters based on conditions**: Only contains records that meet specific conditions
- **Real-time updates**: Automatically updates when original data changes
- **Supports computations**: Can perform reactive computations on filtered data
- **Maintains references**: Records in filtered entities are still references to original entity records

### Use Cases

Filtered entities are particularly suitable for the following scenarios:
- **Status grouping**: Such as published posts, active users, pending orders
- **Permission control**: Such as users can only see their own data
- **Category statistics**: Such as counting products by category
- **Conditional aggregation**: Such as calculating sums or averages under specific conditions

### Filtered Entity vs Regular Queries

```javascript
// Regular query approach: Re-query every time
const getPublishedPosts = async () => {
  return await controller.find('Post', { status: 'published' });
};

const getPublishedPostCount = async () => {
  return await controller.count('Post', { status: 'published' });
};

// Filtered entity approach: Automatically maintained, reactive updates
const PublishedPost = Entity.create({
  name: 'PublishedPost',
  baseEntity: Post,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'published']
  })
});

// Automatically maintained count
const GlobalStats = Entity.create({
  name: 'GlobalStats',
  properties: [
    Property.create({
      name: 'publishedPostCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({
        record: PublishedPost
      })  // Automatically updates
    })
  ]
});
```

## Creating Filtered Entities

### Filtering Based on Properties

```javascript
import { FilteredEntity, Entity, Property } from 'interaqt';

// Original entity
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

// Create filtered entity for published posts
const PublishedPost = Entity.create({
  name: 'PublishedPost',
  baseEntity: Post,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'published']
  })
});

// Create filtered entity for popular posts
const PopularPost = Entity.create({
  name: 'PopularPost',
  baseEntity: Post,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'published']
  }).and({
    key: 'viewCount',
    value: ['>=', 1000]
  })
});

// Create filtered entity for tech posts
const TechPost = Entity.create({
  name: 'TechPost',
  baseEntity: Post,
  filterCondition: MatchExp.atom({
    key: 'category',
    value: ['=', 'technology']
  }).and({
    key: 'status',
    value: ['=', 'published']
  })
});
```

### Filtering Based on Relations

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

// Create filtered entity for active users (logged in within the last 30 days)
const ActiveUser = Entity.create({
  name: 'ActiveUser',
  baseEntity: User,
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

// Create filtered entity for users with posts (needs to be implemented through relation queries)
const AuthorUser = Entity.create({
  name: 'AuthorUser',
  baseEntity: User,
  filterCondition: MatchExp.atom({
    key: 'id',
    value: ['in', 'SELECT DISTINCT author FROM Post WHERE author IS NOT NULL']
  })
});
```

### Dynamic Filter Conditions

```javascript
// Use functions as filter conditions, supporting dynamic computation
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

// Context-based filtering (such as user permissions)
const createUserVisiblePosts = (userId) => {
  return FilteredEntity.create({
    name: `UserVisiblePosts_${userId}`,
    baseEntity: Post,
    filter: async (context) => {
      const user = await context.findOne('User', { id: userId });
      
      if (user.role === 'admin') {
        // Admins can see all posts
        return {};
      }
      
      if (user.role === 'moderator') {
        // Moderators can see published and pending review posts
        return {
          status: { $in: ['published', 'pending_review'] }
        };
      }
      
      // Regular users can only see published posts
      return {
        status: 'published'
      };
    }
  });
};
```

### Complex Filter Conditions

```javascript
// Use complex query conditions
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

// Date range-based filtering
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

## Operating on Filtered Entities

### Querying Filtered Data

```javascript
// Query filtered entities just like regular entities
const publishedPosts = await controller.find('PublishedPost');
console.log('Published posts:', publishedPosts);

// Further filtering on filtered entities
const recentPublishedPosts = await controller.find('PublishedPost', {
  publishedAt: {
    $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  }
});

// Query single record
const firstPublishedPost = await controller.findOne('PublishedPost', {
  category: 'technology'
});

// Count query
const publishedPostCount = await controller.count('PublishedPost');
```

### Updating Filtered Data

```javascript
// Update records in filtered entities
await controller.update('PublishedPost', 
  { category: 'technology' },
  { 
    updatedAt: new Date().toISOString(),
    tags: ['tech', 'programming']
  }
);

// Batch update
await controller.updateMany('PublishedPost',
  { viewCount: { $lt: 100 } },
  { 
    $inc: { viewCount: 10 }  // Add 10 views to low-view posts
  }
);

// Update single record
const post = await controller.findOne('PublishedPost', { id: 'post123' });
if (post) {
  await controller.update('PublishedPost',
    { id: post.id },
    { 
      title: 'Updated Title',
      content: 'Updated Content'
    }
  );
}
```

### Deleting Filtered Data

```javascript
// Delete records in filtered entities
await controller.delete('PublishedPost', { 
  category: 'outdated',
  publishedAt: {
    $lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()  // Outdated content from a year ago
  }
});

// Soft delete (update status instead of actual deletion)
await controller.update('PublishedPost',
  { id: 'post123' },
  { status: 'archived' }  // This will cause the record to disappear from PublishedPost
);
```

## Filtered Entities and Reactive Computations

### Using Filtered Entities in Computations

```javascript
// Use filtered entities for computations
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    
    // Calculate the number of published posts by user
    Property.create({
      name: 'publishedPostCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({
        record: UserPublishedPosts
      })
    }),
    
    // Calculate the number of popular posts by user
    Property.create({
      name: 'popularPostCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({
        record: UserPopularPosts
      })
    }),
    
    // Calculate total views of user's posts
    Property.create({
      name: 'totalViews',
      type: 'number',
      defaultValue: () => 0,
      computation: WeightedSummation.create({
        record: UserPublishedPosts,
        callback: (relation) => ({
          weight: 1,
          value: relation.target.viewCount
        })
      })
    }),
    
    // Calculate if user is an active author
    Property.create({
      name: 'isActiveAuthor',
      type: 'boolean',
      defaultValue: () => false,
      computed: function(user) {
        // Assuming user has a recentPosts property that's an array
        const recentPosts = user.recentPosts || [];
        return recentPosts.length >= 3;  // Has 3 or more recent posts
      }
    })
  ]
});
```

### Global Statistics Computation

```javascript
const GlobalStats = Entity.create({
  name: 'GlobalStats',
  properties: [
    // Various post statistics
    Property.create({
      name: 'totalPublishedPosts',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({
        record: PublishedPost
      })
    }),
    
    Property.create({
      name: 'totalPopularPosts',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({
        record: PopularPost
      })
    }),
    
    Property.create({
      name: 'totalTechPosts',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({
        record: TechPost
      })
    }),
    
    // User statistics
    Property.create({
      name: 'activeUserCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({
        record: ActiveUser
      })
    }),
    
    Property.create({
      name: 'authorCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({
        record: AuthorUser
      })
    }),
    
    // Check if all popular posts have tags
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

### Category Statistics

```javascript
// Create filtered entities for each category
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

// Create category statistics entity
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
    
    // Most popular category
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

## Real-time Updates and Event Handling

### Automatic Update Mechanism

```javascript
// When original data changes, filtered entities automatically update
const createPost = async (postData) => {
  // Create new post
  const post = await controller.create('Post', {
    ...postData,
    status: 'draft'  // Initial status is draft
  });
  
  // At this point, PublishedPost won't include this post
  
  // Publish the post
  await controller.update('Post', 
    { id: post.id },
    { status: 'published', publishedAt: new Date().toISOString() }
  );
  
  // Now PublishedPost will automatically include this post
  // Related computations (like publishedPostCount) will also update automatically
};
```

### Listening to Filtered Entity Changes

```javascript
// Listen to filtered entity change events
controller.on('filteredEntityChange', (event) => {
  console.log('Filtered entity change:', {
    entityName: event.entityName,
    changeType: event.changeType,  // 'added', 'removed', 'updated'
    recordId: event.recordId,
    oldData: event.oldData,
    newData: event.newData
  });
  
  // Custom logic can be executed here
  if (event.entityName === 'PublishedPost' && event.changeType === 'added') {
    // Handle logic when new post is published
    notifySubscribers(event.newData);
  }
});

// Listen to specific filtered entity changes
controller.on('PublishedPost:added', (post) => {
  console.log('New published post:', post);
  // Send notifications, update cache, etc.
});

controller.on('ActiveUser:removed', (user) => {
  console.log('User became inactive:', user);
  // Handle user inactivity logic
});
```

## Performance Optimization

### Index Optimization

```javascript
// Add indexes for fields used in filter conditions
const OptimizedPost = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ 
      name: 'status', 
      type: 'string',
      index: true  // Add index for status field
    }),
    Property.create({ 
      name: 'category', 
      type: 'string',
      index: true  // Add index for category field
    }),
    Property.create({ 
      name: 'publishedAt', 
      type: 'string',
      index: true  // Add index for published time
    }),
    Property.create({ 
      name: 'viewCount', 
      type: 'number',
      index: true  // Add index for view count
    })
  ]
});

// Composite indexes
const PostWithCompositeIndex = Entity.create({
  name: 'Post',
  properties: [
    // ... other properties
  ],
  indexes: [
    { fields: ['status', 'category'] },  // Composite index
    { fields: ['status', 'publishedAt'] },
    { fields: ['category', 'viewCount'] }
  ]
});
```

### Caching Strategy

```javascript
// Configure caching strategy for filtered entities
const CachedFilteredEntity = FilteredEntity.create({
  name: 'CachedPublishedPost',
  baseEntity: Post,
  filter: { status: 'published' },
  cache: {
    enabled: true,
    ttl: 300,  // Cache for 5 minutes
    invalidateOnChange: true  // Automatically invalidate cache on data changes
  }
});
```

### Pagination and Limits

```javascript
// Use pagination when querying filtered entities
const getPublishedPostsPaginated = async (page = 1, limit = 20) => {
  return await controller.find('PublishedPost', {}, {
    offset: (page - 1) * limit,
    limit: limit,
    orderBy: [{ field: 'publishedAt', direction: 'desc' }]
  });
};

// Limit the amount of data used in computations
const TopPost = FilteredEntity.create({
  name: 'TopPost',
  baseEntity: Post,
  filter: { status: 'published' },
  options: {
    orderBy: [{ field: 'viewCount', direction: 'desc' }],
    limit: 100  // Only consider top 100 posts with highest view count
  }
});
```

## Best Practices

### 1. Design Filter Conditions Properly

```javascript
// ✅ Efficient filter conditions
const EfficientFilter = FilteredEntity.create({
  name: 'EfficientFilter',
  baseEntity: Post,
  filter: {
    status: 'published',  // Simple equality condition
    category: { $in: ['tech', 'science'] }  // Use index-friendly operations
  }
});

// ❌ Inefficient filter conditions
const InefficientFilter = FilteredEntity.create({
  name: 'InefficientFilter',
  baseEntity: Post,
  filter: {
    $where: function() {
      // Avoid using $where, it cannot use indexes
      return this.title.toLowerCase().includes('javascript');
    }
  }
});
```

### 2. Avoid Over-filtering

```javascript
// ✅ Reasonable filtering granularity
const PublishedPost = FilteredEntity.create({
  name: 'PublishedPost',
  baseEntity: Post,
  filter: { status: 'published' }
});

const TechPost = FilteredEntity.create({
  name: 'TechPost',
  baseEntity: PublishedPost,  // Based on existing filtered entity
  filter: { category: 'technology' }
});

// ❌ Over-segmented filtered entities
const TechPostOnMonday = FilteredEntity.create({
  name: 'TechPostOnMonday',
  baseEntity: Post,
  filter: {
    category: 'technology',
    status: 'published',
    $expr: {
      $eq: [{ $dayOfWeek: '$publishedAt' }, 2]  // Too specific condition
    }
  }
});
```

### 3. Use Computations Appropriately

```javascript
// ✅ Appropriate computations on filtered entities
const UserStats = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'publishedPostCount',
      type: 'number',
      computation: new Count(PublishedPost, 'author')  // Simple counting
    })
  ]
});

// ❌ Complex computations on filtered entities
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
          // Avoid complex data processing in computations
          return posts.reduce((score, post) => {
            return score + (post.viewCount * 0.1 + post.likeCount * 0.5);
          }, 0);
        }
      )
    })
  ]
});
```

### 4. Monitor Performance

```javascript
// Monitor filtered entity performance
const monitorFilteredEntity = (entityName) => {
  controller.on(`${entityName}:query`, (event) => {
    console.log(`Query ${entityName}:`, {
      duration: event.duration,
      resultCount: event.resultCount,
      filter: event.filter
    });
    
    if (event.duration > 1000) {  // Query takes more than 1 second
      console.warn(`${entityName} query performance warning:`, event);
    }
  });
};

monitorFilteredEntity('PublishedPost');
monitorFilteredEntity('ActiveUser');
```

Filtered entities provide powerful data viewing and computation capabilities for interaqt. By using filtered entities appropriately, you can create efficient, real-time updating data statistics and analysis systems while maintaining code clarity and maintainability. 