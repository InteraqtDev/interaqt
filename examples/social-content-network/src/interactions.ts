import { Interaction, Action, Payload, PayloadItem } from '@/index.js'
import { User, Post, Tag, Category } from './entities-base.js'

// ===== 用户管理交互 =====

// 用户注册
export const RegisterUser = Interaction.create({
  name: 'RegisterUser',
  action: Action.create({
    name: 'registerUser',
    operation: [
      {
        type: 'create',
        entity: 'User',
        payload: {
          username: '$.username',
          email: '$.email',
          displayName: '$.displayName',
          bio: '$.bio',
          avatar: '$.avatar'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'username', 
        type: 'string', 
        required: true,
        minLength: 3,
        maxLength: 30
      }),
      PayloadItem.create({ 
        name: 'email', 
        type: 'string', 
        required: true
      }),
      PayloadItem.create({ 
        name: 'displayName', 
        type: 'string', 
        required: true,
        maxLength: 50
      }),
      PayloadItem.create({ 
        name: 'bio', 
        type: 'string',
        maxLength: 500
      }),
      PayloadItem.create({ 
        name: 'avatar', 
        type: 'string'
      })
    ]
  })
})

// 更新用户档案
export const UpdateUserProfile = Interaction.create({
  name: 'UpdateUserProfile',
  action: Action.create({
    name: 'updateUserProfile',
    operation: [
      {
        type: 'update',
        entity: 'User',
        where: { id: '$.userId' },
        payload: {
          displayName: '$.displayName',
          bio: '$.bio',
          avatar: '$.avatar',
          updatedAt: () => new Date().toISOString()
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'displayName', 
        type: 'string',
        maxLength: 50
      }),
      PayloadItem.create({ 
        name: 'bio', 
        type: 'string',
        maxLength: 500
      }),
      PayloadItem.create({ 
        name: 'avatar', 
        type: 'string'
      })
    ]
  })
})

// ===== 好友关系交互 =====

// 发送好友请求
export const SendFriendRequest = Interaction.create({
  name: 'SendFriendRequest',
  action: Action.create({
    name: 'sendFriendRequest',
    operation: [
      {
        type: 'createRelation',
        relation: 'Friendship',
        source: '$.fromUserId',
        target: '$.toUserId',
        properties: {
          status: 'pending',
          requesterId: '$.fromUserId'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'fromUserId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'toUserId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      })
    ]
  })
})

// 接受好友请求
export const AcceptFriendRequest = Interaction.create({
  name: 'AcceptFriendRequest',
  action: Action.create({
    name: 'acceptFriendRequest',
    operation: [
      {
        type: 'updateRelation',
        relation: 'Friendship',
        where: { 
          source: '$.userId',
          target: '$.friendId'
        },
        payload: {
          status: 'accepted',
          acceptedAt: () => new Date().toISOString()
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'friendId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      })
    ]
  })
})

// 拒绝好友请求
export const RejectFriendRequest = Interaction.create({
  name: 'RejectFriendRequest',
  action: Action.create({
    name: 'rejectFriendRequest',
    operation: [
      {
        type: 'removeRelation',
        relation: 'Friendship',
        where: { 
          source: '$.userId',
          target: '$.friendId'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'friendId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      })
    ]
  })
})

// 删除好友
export const RemoveFriend = Interaction.create({
  name: 'RemoveFriend',
  action: Action.create({
    name: 'removeFriend',
    operation: [
      {
        type: 'removeRelation',
        relation: 'Friendship',
        where: { 
          source: '$.userId',
          target: '$.friendId'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'friendId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      })
    ]
  })
})

// ===== 关注交互 =====

// 关注用户
export const FollowUser = Interaction.create({
  name: 'FollowUser',
  action: Action.create({
    name: 'followUser',
    operation: [
      {
        type: 'createRelation',
        relation: 'Follow',
        source: '$.followerId',
        target: '$.followeeId',
        properties: {
          notificationEnabled: '$.notificationEnabled'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'followerId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'followeeId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'notificationEnabled', 
        type: 'boolean',
        defaultValue: () => true
      })
    ]
  })
})

// 取消关注
export const UnfollowUser = Interaction.create({
  name: 'UnfollowUser',
  action: Action.create({
    name: 'unfollowUser',
    operation: [
      {
        type: 'removeRelation',
        relation: 'Follow',
        where: { 
          source: '$.followerId',
          target: '$.followeeId'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'followerId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'followeeId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      })
    ]
  })
})

// ===== 内容管理交互 =====

// 创建帖子
export const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({
    name: 'createPost',
    operation: [
      {
        type: 'create',
        entity: 'Post',
        payload: {
          title: '$.title',
          content: '$.content',
          status: '$.status',
          author: '$.authorId',
          publishedAt: (payload: any) => payload.status === 'published' ? new Date().toISOString() : null
        },
        resultKey: 'post'
      },
      // 如果指定了分类，创建分类关系
      {
        type: 'createRelation',
        relation: 'PostCategory',
        source: (payload: any, results: any) => results.post.id,
        target: '$.categoryId',
        condition: (payload: any) => !!payload.categoryId
      },
      // 为每个标签创建关系
      {
        type: 'createMultiple',
        entity: 'PostTag',
        payload: (payload: any, results: any) => {
          if (!payload.tags || payload.tags.length === 0) return []
          
          return payload.tags.map((tagId: string) => ({
            source: results.post.id,
            target: tagId,
            addedBy: payload.authorId
          }))
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'title', 
        type: 'string', 
        required: true,
        maxLength: 200
      }),
      PayloadItem.create({ 
        name: 'content', 
        type: 'string', 
        required: true
      }),
      PayloadItem.create({ 
        name: 'authorId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'status', 
        type: 'string',
        enum: ['draft', 'published'],
        defaultValue: () => 'draft'
      }),
      PayloadItem.create({ 
        name: 'categoryId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Category'
      }),
      PayloadItem.create({ 
        name: 'tags', 
        type: 'string',
        collection: true,
        defaultValue: () => []
      })
    ]
  })
})

// 编辑帖子
export const EditPost = Interaction.create({
  name: 'EditPost',
  action: Action.create({
    name: 'editPost',
    operation: [
      {
        type: 'update',
        entity: 'Post',
        where: { id: '$.postId' },
        payload: {
          title: '$.title',
          content: '$.content',
          updatedAt: () => new Date().toISOString()
        }
      },
      // 更新分类关系
      {
        type: 'removeRelation',
        relation: 'PostCategory',
        where: { source: '$.postId' }
      },
      {
        type: 'createRelation',
        relation: 'PostCategory',
        source: '$.postId',
        target: '$.categoryId',
        condition: (payload: any) => !!payload.categoryId
      },
      // 更新标签关系
      {
        type: 'removeRelation',
        relation: 'PostTag',
        where: { source: '$.postId' }
      },
      {
        type: 'createMultiple',
        entity: 'PostTag',
        payload: (payload: any) => {
          if (!payload.tags || payload.tags.length === 0) return []
          
          return payload.tags.map((tagId: string) => ({
            source: payload.postId,
            target: tagId,
            addedBy: payload.userId
          }))
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'postId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Post',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'userId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'title', 
        type: 'string',
        maxLength: 200
      }),
      PayloadItem.create({ 
        name: 'content', 
        type: 'string'
      }),
      PayloadItem.create({ 
        name: 'categoryId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Category'
      }),
      PayloadItem.create({ 
        name: 'tags', 
        type: 'string',
        collection: true,
        defaultValue: () => []
      })
    ]
  })
})

// 发布帖子
export const PublishPost = Interaction.create({
  name: 'PublishPost',
  action: Action.create({
    name: 'publishPost',
    operation: [
      {
        type: 'update',
        entity: 'Post',
        where: { id: '$.postId' },
        payload: {
          status: 'published',
          publishedAt: () => new Date().toISOString()
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'postId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Post',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'userId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      })
    ]
  })
})

// 删除帖子
export const DeletePost = Interaction.create({
  name: 'DeletePost',
  action: Action.create({
    name: 'deletePost',
    operation: [
      // 删除相关的点赞
      {
        type: 'removeRelation',
        relation: 'Like',
        where: { target: '$.postId' }
      },
      // 删除相关的浏览记录
      {
        type: 'removeRelation',
        relation: 'View',
        where: { target: '$.postId' }
      },
      // 删除相关的分享记录
      {
        type: 'removeRelation',
        relation: 'Share',
        where: { target: '$.postId' }
      },
      // 删除相关的标签关系
      {
        type: 'removeRelation',
        relation: 'PostTag',
        where: { source: '$.postId' }
      },
      // 删除相关的分类关系
      {
        type: 'removeRelation',
        relation: 'PostCategory',
        where: { source: '$.postId' }
      },
      // 最后删除帖子本身
      {
        type: 'delete',
        entity: 'Post',
        where: { id: '$.postId' }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'postId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Post',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'userId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      })
    ]
  })
})

// ===== 互动交互 =====

// 点赞帖子
export const LikePost = Interaction.create({
  name: 'LikePost',
  action: Action.create({
    name: 'likePost',
    operation: [
      {
        type: 'createRelation',
        relation: 'Like',
        source: '$.userId',
        target: '$.postId',
        properties: {
          type: '$.type'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'postId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Post',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'type', 
        type: 'string',
        enum: ['like', 'love', 'laugh', 'wow', 'sad', 'angry'],
        defaultValue: () => 'like'
      })
    ]
  })
})

// 取消点赞
export const UnlikePost = Interaction.create({
  name: 'UnlikePost',
  action: Action.create({
    name: 'unlikePost',
    operation: [
      {
        type: 'removeRelation',
        relation: 'Like',
        where: { 
          source: '$.userId',
          target: '$.postId'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'postId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Post',
        required: true 
      })
    ]
  })
})

// 浏览帖子
export const ViewPost = Interaction.create({
  name: 'ViewPost',
  action: Action.create({
    name: 'viewPost',
    operation: [
      {
        type: 'createRelation',
        relation: 'View',
        source: '$.userId',
        target: '$.postId',
        properties: {
          duration: '$.duration',
          viewSource: '$.source'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'postId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Post',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'duration', 
        type: 'number',
        defaultValue: () => 0,
        min: 0
      }),
      PayloadItem.create({ 
        name: 'source', 
        type: 'string',
        enum: ['timeline', 'search', 'direct', 'recommendation'],
        defaultValue: () => 'direct'
      })
    ]
  })
})

// ===== 标签和分类管理交互 =====

// 创建标签
export const CreateTag = Interaction.create({
  name: 'CreateTag',
  action: Action.create({
    name: 'createTag',
    operation: [
      {
        type: 'create',
        entity: 'Tag',
        payload: {
          name: '$.name',
          description: '$.description',
          color: '$.color'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        type: 'string', 
        required: true,
        maxLength: 50
      }),
      PayloadItem.create({ 
        name: 'description', 
        type: 'string',
        maxLength: 200
      }),
      PayloadItem.create({ 
        name: 'color', 
        type: 'string',
        defaultValue: () => '#666666'
      })
    ]
  })
})

// 创建分类
export const CreateCategory = Interaction.create({
  name: 'CreateCategory',
  action: Action.create({
    name: 'createCategory',
    operation: [
      {
        type: 'create',
        entity: 'Category',
        payload: {
          name: '$.name',
          description: '$.description',
          parentId: '$.parentId',
          order: '$.order'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        type: 'string', 
        required: true,
        maxLength: 100
      }),
      PayloadItem.create({ 
        name: 'description', 
        type: 'string',
        maxLength: 500
      }),
      PayloadItem.create({ 
        name: 'parentId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Category'
      }),
      PayloadItem.create({ 
        name: 'order', 
        type: 'number',
        defaultValue: () => 0
      })
    ]
  })
})

// 导出所有交互
export const interactions = [
  RegisterUser,
  UpdateUserProfile,
  SendFriendRequest,
  AcceptFriendRequest,
  RejectFriendRequest,
  RemoveFriend,
  FollowUser,
  UnfollowUser,
  CreatePost,
  EditPost,
  PublishPost,
  DeletePost,
  LikePost,
  UnlikePost,
  ViewPost,
  CreateTag,
  CreateCategory
]