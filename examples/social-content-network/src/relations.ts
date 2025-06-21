import { Relation, Property } from '@';
import { User, Post, Comment, FriendRequest, Tag } from './entities-base.js';

/**
 * 用户发布内容关系 (1:n)
 */
export const UserPost = Relation.create({
  source: Post,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'posts',
  type: 'n:1'
});

/**
 * 内容评论关系 (1:n)
 */
export const PostComment = Relation.create({
  source: Comment,
  sourceProperty: 'post',
  target: Post,
  targetProperty: 'comments',
  type: 'n:1'
});

/**
 * 用户评论关系 (1:n)
 */
export const UserComment = Relation.create({
  source: Comment,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'comments',
  type: 'n:1'
});

/**
 * 评论回复关系 (1:n, 自引用)
 */
export const CommentReply = Relation.create({
  source: Comment,
  sourceProperty: 'parentComment',
  target: Comment,
  targetProperty: 'replies',
  type: 'n:1'
});

/**
 * 好友关系 (n:n, 对称)
 */
export const Friendship = Relation.create({
  source: User,
  sourceProperty: 'friends',
  target: User,
  targetProperty: 'friends',
  type: 'n:n',
  properties: [
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

/**
 * 关注关系 (n:n)
 */
export const Follow = Relation.create({
  source: User,
  sourceProperty: 'following',
  target: User,
  targetProperty: 'followers',
  type: 'n:n',
  properties: [
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

/**
 * 好友请求关系
 */
export const UserFriendRequest = Relation.create({
  source: FriendRequest,
  sourceProperty: 'requester',
  target: User,
  targetProperty: 'sentFriendRequests',
  type: 'n:1'
});

export const UserFriendRequestReceived = Relation.create({
  source: FriendRequest,
  sourceProperty: 'receiver',
  target: User,
  targetProperty: 'receivedFriendRequests',
  type: 'n:1'
});

/**
 * 点赞关系 (n:n)
 */
export const Like = Relation.create({
  source: User,
  sourceProperty: 'likedPosts',
  target: Post,
  targetProperty: 'likedBy',
  type: 'n:n',
  properties: [
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

/**
 * 评论点赞关系 (n:n)
 */
export const CommentLike = Relation.create({
  source: User,
  sourceProperty: 'likedComments',
  target: Comment,
  targetProperty: 'likedBy',
  type: 'n:n',
  properties: [
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

/**
 * 内容标签关系 (n:n)
 */
export const PostTag = Relation.create({
  source: Post,
  sourceProperty: 'tagEntities',
  target: Tag,
  targetProperty: 'posts',
  type: 'n:n',
  properties: [
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

export const relations = [
  UserPost,
  PostComment, 
  UserComment,
  CommentReply,
  Friendship,
  Follow,
  UserFriendRequest,
  UserFriendRequestReceived,
  Like,
  CommentLike,
  PostTag
];