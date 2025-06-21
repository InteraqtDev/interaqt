import { Property, Count, Any } from '@';
import { User, Post, Comment, FriendRequest, Tag } from './entities-base.js';
import {
  UserPost,
  PostComment,
  UserComment, 
  Friendship, 
  Like,
  CommentReply,
  CommentLike,
  PostTag
} from './relations.js';

// 为 User 实体添加响应式计算属性 - 暂时移除所有computedData以调试Activity重复问题
User.properties.push(
  // 好友数量
  Property.create({
    name: 'friendCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: Friendship
    })
  }),
  
  // 发布的内容数量
  Property.create({
    name: 'postCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: UserPost
    })
  }),
  
  // 评论数量
  Property.create({
    name: 'commentCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: UserComment
    })
  }),
  
  // 活跃度分数 (简化版本)
  Property.create({
    name: 'activityScore',
    type: 'number',
    defaultValue: () => 0,
    computed: (user) => {
      const postScore = (user.postCount || 0) * 2;
      const commentScore = (user.commentCount || 0) * 1;
      return postScore + commentScore;
    }
  })
);

// 为 Post 实体添加响应式计算属性 - 暂时移除所有computedData以调试Activity重复问题
Post.properties.push(
  // 点赞数量
  Property.create({
    name: 'likeCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: Like
    })
  }),
  
  // 评论数量
  Property.create({
    name: 'commentCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: PostComment
    })
  }),
  
  // 热度分数 (简化版本)
  Property.create({
    name: 'hotScore',
    type: 'number',
    defaultValue: () => 0,
    computed: (post) => {
      const likeScore = (post.likeCount || 0) * 2;
      const commentScore = (post.commentCount || 0) * 3;
      const viewScore = (post.viewCount || 0) * 0.1;
      return Math.floor(likeScore + commentScore + viewScore);
    }
  }),
  
  // 是否已发布
  Property.create({
    name: 'isPublished',
    type: 'boolean',
    computed: (post) => post.status === 'published'
  }),
  
  // 是否已删除
  Property.create({
    name: 'isDeleted',
    type: 'boolean',
    computed: (post) => post.status === 'deleted'
  }),
  
  // 是否可编辑 (草稿或已发布状态)
  Property.create({
    name: 'isEditable',
    type: 'boolean',
    computed: (post) => post.status === 'draft' || post.status === 'published'
  })
);

// 为 Comment 实体添加响应式计算属性
Comment.properties.push(
  // 回复数量
  Property.create({
    name: 'replyCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: CommentReply
    })
  }),
  
  // 点赞数量
  Property.create({
    name: 'likeCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: CommentLike
    })
  }),
  
  // 是否有回复
  Property.create({
    name: 'hasReplies',
    type: 'boolean',
    defaultValue: () => false,
    computedData: Any.create({
      record: CommentReply,
      callback: () => true
    })
  })
);

// 为 Tag 实体添加响应式计算属性
Tag.properties.push(
  // 使用该标签的内容数量
  Property.create({
    name: 'postCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: PostTag
    })
  }),
  
  // 热门程度 (使用次数)
  Property.create({
    name: 'popularity',
    type: 'number',
    defaultValue: () => 0,
    computed: (tag) => tag.postCount || 0
  })
);

// 导出所有实体 (移除过滤实体以避免 Activity 重复问题)
export const entities = [User, Post, Comment, FriendRequest, Tag];
export const allEntities = entities;
export const filteredEntities = [];