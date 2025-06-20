import {
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Attributive,
  BoolExp,
  GetAction,
  Controller
} from '@';
import { User, Post, Comment, FriendRequest } from './entities-base.js';

// ============== 权限定义 ==============

// 作者权限：只有内容作者可以操作
const PostAuthorAttributive = Attributive.create({
  name: 'PostAuthor',
  content: async function(this: Controller, post, { user }) {
    return post.author && post.author.id === user.id;
  }
});

// 评论作者权限
const CommentAuthorAttributive = Attributive.create({
  name: 'CommentAuthor', 
  content: async function(this: Controller, comment, { user }) {
    return comment.author && comment.author.id === user.id;
  }
});

// 好友关系权限
const FriendAttributive = Attributive.create({
  name: 'Friend',
  content: async function(this: Controller, targetUser, { user }) {
    const { MatchExp } = this.globals;
    const friendship = await this.system.storage.findOneRelationByName(
      'User_friends_friends_User',
      MatchExp.atom({ key: 'source.id', value: ['=', user.id] })
        .and({ key: 'target.id', value: ['=', targetUser.id] })
    );
    return !!friendship;
  }
});

// 不是自己
const NotSelfAttributive = Attributive.create({
  name: 'NotSelf',
  content: function(targetUser, { user }) {
    return targetUser.id !== user.id;
  }
});

// 还不是好友
const NotFriendAttributive = Attributive.create({
  name: 'NotFriend',
  content: async function(this: Controller, targetUser, { user }) {
    const { MatchExp } = this.globals;
    const friendship = await this.system.storage.findOneRelationByName(
      'User_friends_friends_User',
      MatchExp.atom({ key: 'source.id', value: ['=', user.id] })
        .and({ key: 'target.id', value: ['=', targetUser.id] })
    );
    return !friendship;
  }
});

// 已发布的内容
const PublishedPostAttributive = Attributive.create({
  name: 'PublishedPost',
  content: function(post, { user }) {
    return post.status === 'published';
  }
});

// 可见的内容（公开或好友可见且是好友关系）
const VisiblePostAttributive = Attributive.create({
  name: 'VisiblePost',
  content: async function(this: Controller, post, { user }) {
    if (post.visibility === 'public') {
      return true;
    }
    if (post.visibility === 'private') {
      return post.author && post.author.id === user.id;
    }
    if (post.visibility === 'friends') {
      if (post.author && post.author.id === user.id) {
        return true;
      }
      const { MatchExp } = this.globals;
      const friendship = await this.system.storage.findOneRelationByName(
        'User_friends_friends_User',
        MatchExp.atom({ key: 'source.id', value: ['=', user.id] })
          .and({ key: 'target.id', value: ['=', post.author.id] })
      );
      return !!friendship;
    }
    return false;
  }
});

// ============== 用户相关交互 ==============

export const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'createUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'username',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'displayName',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'email',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'avatar',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'bio',
        base: 'string',
        required: false
      })
    ]
  })
});

export const UpdateUserProfile = Interaction.create({
  name: 'UpdateUserProfile',
  action: Action.create({ name: 'updateUserProfile' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        base: User,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(Attributive.create({
          name: 'IsSelf',
          content: function(user, { user: currentUser }) {
            return user.id === currentUser.id;
          }
        }))
      }),
      PayloadItem.create({
        name: 'displayName',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'avatar',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'bio',
        base: 'string',
        required: false
      })
    ]
  })
});

export const GetUserProfile = Interaction.create({
  name: 'GetUserProfile',
  action: GetAction,
  data: User
});

// ============== 好友关系相关交互 ==============

export const SendFriendRequest = Interaction.create({
  name: 'SendFriendRequest',
  action: Action.create({ name: 'sendFriendRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'targetUserId',
        base: User,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(NotSelfAttributive).and(BoolExp.atom(NotFriendAttributive))
      }),
      PayloadItem.create({
        name: 'message',
        base: 'string',
        required: false
      })
    ]
  })
});

export const AcceptFriendRequest = Interaction.create({
  name: 'AcceptFriendRequest',
  action: Action.create({ name: 'acceptFriendRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'requestId',
        base: FriendRequest,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(Attributive.create({
          name: 'RequestReceiver',
          content: async function(this: Controller, request, { user }) {
            return request.receiver && request.receiver.id === user.id && request.status === 'pending';
          }
        }))
      })
    ]
  })
});

export const RejectFriendRequest = Interaction.create({
  name: 'RejectFriendRequest',
  action: Action.create({ name: 'rejectFriendRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'requestId',
        base: FriendRequest,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(Attributive.create({
          name: 'RequestReceiver',
          content: async function(this: Controller, request, { user }) {
            return request.receiver && request.receiver.id === user.id && request.status === 'pending';
          }
        }))
      })
    ]
  })
});

export const RemoveFriend = Interaction.create({
  name: 'RemoveFriend',
  action: Action.create({ name: 'removeFriend' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'friendId',
        base: User,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(NotSelfAttributive).and(BoolExp.atom(FriendAttributive))
      })
    ]
  })
});

export const FollowUser = Interaction.create({
  name: 'FollowUser',
  action: Action.create({ name: 'followUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'targetUserId',
        base: User,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(NotSelfAttributive)
      })
    ]
  })
});

export const UnfollowUser = Interaction.create({
  name: 'UnfollowUser',
  action: Action.create({ name: 'unfollowUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'targetUserId',
        base: User,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(NotSelfAttributive)
      })
    ]
  })
});

// ============== 内容相关交互 ==============

export const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'title',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'content',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'tags',
        base: 'string',
        isCollection: true,
        required: false
      }),
      PayloadItem.create({
        name: 'mediaUrls',
        base: 'string',
        isCollection: true,
        required: false
      }),
      PayloadItem.create({
        name: 'visibility',
        base: 'string',
        required: false
      })
    ]
  })
});

export const UpdatePost = Interaction.create({
  name: 'UpdatePost',
  action: Action.create({ name: 'updatePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'postId',
        base: Post,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(PostAuthorAttributive)
      }),
      PayloadItem.create({
        name: 'title',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'content',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'tags',
        base: 'string',
        isCollection: true,
        required: false
      }),
      PayloadItem.create({
        name: 'visibility',
        base: 'string',
        required: false
      })
    ]
  })
});

export const PublishPost = Interaction.create({
  name: 'PublishPost',
  action: Action.create({ name: 'publishPost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'postId',
        base: Post,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(PostAuthorAttributive).and(BoolExp.atom(Attributive.create({
          name: 'IsDraft',
          content: function(post) {
            return post.status === 'draft';
          }
        })))
      })
    ]
  })
});

export const UnpublishPost = Interaction.create({
  name: 'UnpublishPost',
  action: Action.create({ name: 'unpublishPost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'postId',
        base: Post,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(PostAuthorAttributive).and(BoolExp.atom(PublishedPostAttributive))
      })
    ]
  })
});

export const DeletePost = Interaction.create({
  name: 'DeletePost',
  action: Action.create({ name: 'deletePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'postId',
        base: Post,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(PostAuthorAttributive)
      })
    ]
  })
});

export const ViewPost = Interaction.create({
  name: 'ViewPost',
  action: Action.create({ name: 'viewPost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'postId',
        base: Post,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(VisiblePostAttributive)
      })
    ]
  })
});

export const GetPosts = Interaction.create({
  name: 'GetPosts',
  action: GetAction,
  data: Post
});

export const GetUserPosts = Interaction.create({
  name: 'GetUserPosts',
  action: GetAction,
  data: Post,
  dataAttributives: Attributive.create({
    name: 'UserPostsFilter',
    content: function({ query }) {
      const userId = query?.userId;
      if (userId) {
        return {
          key: 'author.id',
          value: ['=', userId]
        };
      }
      return null;
    }
  })
});

// ============== 点赞相关交互 ==============

export const LikePost = Interaction.create({
  name: 'LikePost',
  action: Action.create({ name: 'likePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'postId',
        base: Post,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(VisiblePostAttributive).and(BoolExp.atom(PublishedPostAttributive))
      })
    ]
  })
});

export const UnlikePost = Interaction.create({
  name: 'UnlikePost',
  action: Action.create({ name: 'unlikePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'postId',
        base: Post,
        isRef: true,
        required: true
      })
    ]
  })
});

// ============== 评论相关交互 ==============

export const CreateComment = Interaction.create({
  name: 'CreateComment',
  action: Action.create({ name: 'createComment' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'postId',
        base: Post,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(VisiblePostAttributive).and(BoolExp.atom(PublishedPostAttributive))
      }),
      PayloadItem.create({
        name: 'content',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'parentCommentId',
        base: Comment,
        isRef: true,
        required: false
      })
    ]
  })
});

export const UpdateComment = Interaction.create({
  name: 'UpdateComment',
  action: Action.create({ name: 'updateComment' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'commentId',
        base: Comment,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(CommentAuthorAttributive)
      }),
      PayloadItem.create({
        name: 'content',
        base: 'string',
        required: true
      })
    ]
  })
});

export const DeleteComment = Interaction.create({
  name: 'DeleteComment',
  action: Action.create({ name: 'deleteComment' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'commentId',
        base: Comment,
        isRef: true,
        required: true,
        attributives: BoolExp.atom(CommentAuthorAttributive)
      })
    ]
  })
});

export const LikeComment = Interaction.create({
  name: 'LikeComment',
  action: Action.create({ name: 'likeComment' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'commentId',
        base: Comment,
        isRef: true,
        required: true
      })
    ]
  })
});

export const UnlikeComment = Interaction.create({
  name: 'UnlikeComment',
  action: Action.create({ name: 'unlikeComment' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'commentId',
        base: Comment,
        isRef: true,
        required: true
      })
    ]
  })
});

export const GetComments = Interaction.create({
  name: 'GetComments',
  action: GetAction,
  data: Comment,
  dataAttributives: Attributive.create({
    name: 'PostCommentsFilter',
    content: function({ query }) {
      const postId = query?.postId;
      if (postId) {
        return {
          key: 'post.id',
          value: ['=', postId]
        };
      }
      return null;
    }
  })
});

// 导出所有交互
export const interactions = [
  // 用户相关
  CreateUser,
  UpdateUserProfile,
  GetUserProfile,
  
  // 好友关系相关
  SendFriendRequest,
  AcceptFriendRequest,
  RejectFriendRequest,
  RemoveFriend,
  FollowUser,
  UnfollowUser,
  
  // 内容相关
  CreatePost,
  UpdatePost,
  PublishPost,
  UnpublishPost,
  DeletePost,
  ViewPost,
  GetPosts,
  GetUserPosts,
  
  // 点赞相关
  LikePost,
  UnlikePost,
  
  // 评论相关
  CreateComment,
  UpdateComment,
  DeleteComment,
  LikeComment,
  UnlikeComment,
  GetComments
];