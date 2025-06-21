import { Entity, Property } from '@';

/**
 * 用户实体
 */
export const User = Entity.create({
  name: 'User',
  properties: [
    // 基本信息
    Property.create({
      name: 'username',
      type: 'string',
    }),
    Property.create({
      name: 'displayName',
      type: 'string',
    }),
    Property.create({
      name: 'avatar',
      type: 'string',
    }),
    Property.create({
      name: 'bio',
      type: 'string',
    }),
    Property.create({
      name: 'email',
      type: 'string',
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'lastActiveAt',
      type: 'string',
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
      type: 'string',
    }),
    Property.create({
      name: 'content',
      type: 'string',
    }),
    Property.create({
      name: 'tags',
      type: 'string',
      collection: true
    }),
    Property.create({
      name: 'mediaUrls',
      type: 'string',
      collection: true
    }),
    
    // 时间信息
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'updatedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'publishedAt',
      type: 'string',
    }),
    
    // 状态信息
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'draft' // draft, published, deleted
    }),
    Property.create({
      name: 'visibility',
      type: 'string',
      defaultValue: () => 'public' // public, friends, private
    }),
    
    // 统计信息 - 这些将通过响应式计算自动维护
    Property.create({
      name: 'viewCount',
      type: 'number',
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
      type: 'string',
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'updatedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean',
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
      type: 'string',
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'pending' // pending, accepted, rejected
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'respondedAt',
      type: 'string',
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
      type: 'string',
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

export const entities = [User, Post, Comment, FriendRequest, Tag];