import { Relation, Property } from '@/index.js'
import { User, Post, Tag, Category } from './entities-base.js'

// 好友关系 - 对称的多对多关系
export const Friendship = Relation.create({
  source: User,
  sourceProperty: 'friends',
  target: User,
  targetProperty: 'friends',
  type: 'n:n',
  symmetric: true,  // 标记为对称关系
  properties: [
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'pending'  // pending, accepted, blocked
    }),
    Property.create({ 
      name: 'requesterId', 
      type: 'string',
      required: true  // 发起请求的用户ID
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'acceptedAt', 
      type: 'string'
    })
  ]
})

// 关注关系 - 非对称的多对多关系
export const Follow = Relation.create({
  source: User,
  sourceProperty: 'following',
  target: User,
  targetProperty: 'followers',
  type: 'n:n',
  symmetric: false,  // 非对称关系
  properties: [
    Property.create({ 
      name: 'followedAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'notificationEnabled', 
      type: 'boolean', 
      defaultValue: () => true
    })
  ]
})

// 用户发帖关系 - 一对多关系
export const UserPost = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: '1:n'
})

// 点赞关系 - 多对多关系，包含点赞类型
export const Like = Relation.create({
  source: User,
  sourceProperty: 'likedPosts',
  target: Post,
  targetProperty: 'likers',
  type: 'n:n',
  properties: [
    Property.create({ 
      name: 'likedAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'type', 
      type: 'string', 
      defaultValue: () => 'like'  // like, love, laugh, wow, sad, angry
    })
  ]
})

// 浏览记录关系 - 多对多关系
export const View = Relation.create({
  source: User,
  sourceProperty: 'viewedPosts',
  target: Post,
  targetProperty: 'viewers',
  type: 'n:n',
  properties: [
    Property.create({ 
      name: 'viewedAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'duration', 
      type: 'number',  // 浏览时长（秒）
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'viewSource', 
      type: 'string',  // timeline, search, direct, recommendation
      defaultValue: () => 'direct'
    })
  ]
})

// 帖子标签关系 - 多对多关系
export const PostTag = Relation.create({
  source: Post,
  sourceProperty: 'tags',
  target: Tag,
  targetProperty: 'posts',
  type: 'n:n',
  properties: [
    Property.create({ 
      name: 'addedAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'addedBy', 
      type: 'string',  // 添加者用户ID
      required: true
    })
  ]
})

// 帖子分类关系 - 多对一关系
export const PostCategory = Relation.create({
  source: Post,
  sourceProperty: 'category',
  target: Category,
  targetProperty: 'posts',
  type: 'n:1'
})

// 分类层级关系 - 自关联的一对多关系
export const CategoryHierarchy = Relation.create({
  source: Category,
  sourceProperty: 'subcategories',
  target: Category,
  targetProperty: 'parent',
  type: '1:n'
})

// 分享关系 - 多对多关系（可选扩展）
export const Share = Relation.create({
  source: User,
  sourceProperty: 'sharedPosts',
  target: Post,
  targetProperty: 'sharers',
  type: 'n:n',
  properties: [
    Property.create({ 
      name: 'sharedAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'platform', 
      type: 'string',  // internal, twitter, facebook, etc.
      defaultValue: () => 'internal'
    }),
    Property.create({ 
      name: 'message', 
      type: 'string'  // 分享时的附加消息
    })
  ]
})

// 用户标签偏好关系 - 多对多关系（用于推荐算法）
export const UserTagPreference = Relation.create({
  source: User,
  sourceProperty: 'preferredTags',
  target: Tag,
  targetProperty: 'interestedUsers',
  type: 'n:n',
  properties: [
    Property.create({ 
      name: 'score', 
      type: 'number',  // 偏好分数
      defaultValue: () => 1.0,
      min: 0.0,
      max: 10.0
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'preferenceSource', 
      type: 'string',  // interaction, manual, recommendation
      defaultValue: () => 'interaction'
    })
  ]
})

// 导出所有关系
export const relations = [
  Friendship,
  Follow,
  UserPost,
  Like,
  View,
  PostTag,
  PostCategory,
  CategoryHierarchy,
  Share,
  UserTagPreference
]