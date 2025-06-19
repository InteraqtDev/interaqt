import { Property, Count, WeightedSummation } from '@/index.js'
import { User as UserBase, Post as PostBase, Tag as TagBase, Category as CategoryBase } from './entities-base.js'
import { 
  Friendship, 
  Follow, 
  UserPost, 
  Like, 
  View, 
  PostTag, 
  PostCategory 
} from './relations.js'

// 为用户实体添加响应式计算属性
UserBase.properties.push(
  Property.create({
    name: 'friendCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: Friendship,
      attributeQuery: ['status'],
      callback: (relation: any) => relation.status === 'accepted'
    })
  }),
  
  Property.create({
    name: 'followerCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: Follow,
      where: (relation: any) => relation.target.id === 'current_user_id'
    })
  }),
  
  Property.create({
    name: 'followingCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: Follow,
      where: (relation: any) => relation.source.id === 'current_user_id'
    })
  }),
  
  Property.create({
    name: 'postCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: UserPost,
      attributeQuery: [['target', { attributeQuery: ['status'] }]],
      callback: (relation: any) => relation.target.status === 'published'
    })
  }),

  // 活跃度分数的复合计算 - 使用 WeightedSummation 替代 Transform
  Property.create({
    name: 'activityScore',
    type: 'number',
    defaultValue: () => 0,
    computedData: WeightedSummation.create({
      record: UserPost,
      attributeQuery: [['target', { attributeQuery: ['status'] }]],
      callback: (relation: any) => {
        // 基于发布帖子计算活跃度分数
        return {
          weight: 1,
          value: relation.target.status === 'published' ? 10 : 0
        }
      }
    })
  })
)

// 为帖子实体添加响应式计算属性
PostBase.properties.push(

  // 响应式计算属性
  Property.create({
    name: 'likeCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: Like
    })
  }),

  Property.create({
    name: 'viewCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: View
    })
  }),

  // 互动分数（加权计算）
  Property.create({
    name: 'engagementScore',
    type: 'number',
    defaultValue: () => 0,
    computedData: WeightedSummation.create({
      record: Like,
      attributeQuery: ['type'],
      callback: (like: any) => {
        const weights: Record<string, number> = {
          'like': 1,
          'love': 2,
          'laugh': 1.5,
          'wow': 1.5,
          'sad': 1,
          'angry': 0.5
        }
        return {
          weight: 1,
          value: weights[like.type] || 1
        }
      }
    })
  }),

)

// 为标签实体添加响应式计算属性
TagBase.properties.push(
  // 使用该标签的帖子数量
  Property.create({
    name: 'postCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: PostTag
    })
  }),

  // 受欢迎程度（基于使用该标签的帖子的互动数据）
  Property.create({
    name: 'popularityScore',
    type: 'number',
    defaultValue: () => 0,
    computedData: WeightedSummation.create({
      record: PostTag,
      attributeQuery: [['source', { attributeQuery: ['likeCount', 'viewCount'] }]],
      callback: (relation: any) => {
        const post = relation.source
        return {
          weight: 1,
          value: (post.likeCount || 0) * 2 + (post.viewCount || 0) * 0.1
        }
      }
    })
  })
)

// 为分类实体添加响应式计算属性
CategoryBase.properties.push(
  // 该分类下的帖子数量
  Property.create({
    name: 'postCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: PostCategory
    })
  }),

  // 已发布的帖子数量
  Property.create({
    name: 'activePostCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: PostCategory,
      attributeQuery: [['source', { attributeQuery: ['status'] }]],
      callback: (relation: any) => relation.source.status === 'published'
    })
  })
)

// 导出增强后的实体
export const User = UserBase
export const Post = PostBase  
export const Tag = TagBase
export const Category = CategoryBase

// 导出所有实体
export const entities = [User, Post, Tag, Category]