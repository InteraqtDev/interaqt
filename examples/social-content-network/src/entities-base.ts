import { Entity, Property, PropertyTypes } from '@';

/**
 * 用户实体
 */
export const User = Entity.create({
  name: 'User',
  properties: [
    // 基本信息
    Property.create({
      name: 'username',
      type: PropertyTypes.String,
      required: true
    }),
    Property.create({
      name: 'displayName',
      type: PropertyTypes.String,
      required: true
    }),
    Property.create({
      name: 'avatar',
      type: PropertyTypes.String,
      required: false
    }),
    Property.create({
      name: 'bio',
      type: PropertyTypes.String,
      required: false
    }),
    Property.create({
      name: 'email',
      type: PropertyTypes.String,
      required: false
    }),
    Property.create({
      name: 'createdAt',
      type: PropertyTypes.String,
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'lastActiveAt',
      type: PropertyTypes.String,
      defaultValue: () => new Date().toISOString()
    })
  ]
});

/**
 * 内容/帖子实体
 */
export const Post = Entity.create({
  name: 'Post',
  properties: [
    // 基本信息
    Property.create({
      name: 'title',
      type: PropertyTypes.String,
      required: true
    }),
    Property.create({
      name: 'content',
      type: PropertyTypes.String,
      required: true
    }),
    Property.create({
      name: 'tags',
      type: PropertyTypes.String,
      collection: true
    }),
    Property.create({
      name: 'mediaUrls',
      type: PropertyTypes.String,
      collection: true
    }),
    
    // 时间信息
    Property.create({
      name: 'createdAt',
      type: PropertyTypes.String,
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'updatedAt',
      type: PropertyTypes.String,
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'publishedAt',
      type: PropertyTypes.String,
      required: false
    }),
    
    // 状态信息
    Property.create({
      name: 'status',
      type: PropertyTypes.String,
      defaultValue: () => 'draft' // draft, published, deleted
    }),
    Property.create({
      name: 'visibility',
      type: PropertyTypes.String,
      defaultValue: () => 'public' // public, friends, private
    }),
    
    // 统计信息 - 这些将通过响应式计算自动维护
    Property.create({
      name: 'viewCount',
      type: PropertyTypes.Number,
      defaultValue: () => 0
    })
  ]
});

/**
 * 评论实体
 */
export const Comment = Entity.create({
  name: 'Comment',
  properties: [
    Property.create({
      name: 'content',
      type: PropertyTypes.String,
      required: true
    }),
    Property.create({
      name: 'createdAt',
      type: PropertyTypes.String,
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'updatedAt',
      type: PropertyTypes.String,
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'isDeleted',
      type: PropertyTypes.Boolean,
      defaultValue: () => false
    })
  ]
});

/**
 * 好友请求实体
 */
export const FriendRequest = Entity.create({
  name: 'FriendRequest',
  properties: [
    Property.create({
      name: 'message',
      type: PropertyTypes.String,
      required: false
    }),
    Property.create({
      name: 'status',
      type: PropertyTypes.String,
      defaultValue: () => 'pending' // pending, accepted, rejected
    }),
    Property.create({
      name: 'createdAt',
      type: PropertyTypes.String,
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'respondedAt',
      type: PropertyTypes.String,
      required: false
    })
  ]
});

/**
 * 标签实体
 */
export const Tag = Entity.create({
  name: 'Tag',
  properties: [
    Property.create({
      name: 'name',
      type: PropertyTypes.String,
      required: true
    }),
    Property.create({
      name: 'createdAt',
      type: PropertyTypes.String,
      defaultValue: () => new Date().toISOString()
    })
  ]
});

export const entities = [User, Post, Comment, FriendRequest, Tag];