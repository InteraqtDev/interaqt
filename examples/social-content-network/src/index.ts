import { MonoSystem, Controller, Activity, MapInteractionToRecord } from '@';
import { entities, allEntities, filteredEntities } from './entities.js';
import { relations } from './relations.js';
import { interactions } from './interactions.js';

// 创建系统实例
export const system = new MonoSystem();

// 添加所有实体
allEntities.forEach(entity => {
  system.addEntity(entity);
});

// 添加所有关系
relations.forEach(relation => {
  system.addRelation(relation);
});

// 添加所有交互
interactions.forEach(interaction => {
  system.addInteraction(interaction);
});

// 创建活动定义
const activities = [
  // 用户注册活动
  Activity.create({
    name: 'UserRegistration',
    interactions: [
      {
        interaction: system.interactions.CreateUser,
        map: (payload) => MapInteractionToRecord.create({
          User: [{
            username: payload.username,
            displayName: payload.displayName,
            email: payload.email,
            avatar: payload.avatar,
            bio: payload.bio
          }]
        })
      }
    ]
  }),

  // 发布内容活动
  Activity.create({
    name: 'ContentPublishing',
    interactions: [
      {
        interaction: system.interactions.CreatePost,
        map: (payload, { user }) => MapInteractionToRecord.create({
          Post: [{
            title: payload.title,
            content: payload.content,
            tags: payload.tags || [],
            mediaUrls: payload.mediaUrls || [],
            visibility: payload.visibility || 'public',
            author: user
          }]
        })
      },
      {
        interaction: system.interactions.PublishPost,
        map: (payload) => {
          const post = payload.postId;
          post.status = 'published';
          post.publishedAt = new Date().toISOString();
          return MapInteractionToRecord.create({
            Post: [post]
          });
        }
      }
    ]
  }),

  // 建立好友关系活动
  Activity.create({
    name: 'FriendshipBuilding',
    interactions: [
      {
        interaction: system.interactions.SendFriendRequest,
        map: (payload, { user }) => MapInteractionToRecord.create({
          FriendRequest: [{
            requester: user,
            receiver: payload.targetUserId,
            message: payload.message,
            status: 'pending'
          }]
        })
      },
      {
        interaction: system.interactions.AcceptFriendRequest,
        map: (payload, { user }) => {
          const request = payload.requestId;
          request.status = 'accepted';
          request.respondedAt = new Date().toISOString();
          
          return MapInteractionToRecord.create({
            FriendRequest: [request],
            // 创建双向好友关系
            User_friends_friends_User: [
              {
                source: request.requester,
                target: request.receiver,
                createdAt: new Date().toISOString()
              },
              {
                source: request.receiver,
                target: request.requester,
                createdAt: new Date().toISOString()
              }
            ]
          });
        }
      }
    ]
  }),

  // 社交互动活动
  Activity.create({
    name: 'SocialInteraction',
    interactions: [
      {
        interaction: system.interactions.LikePost,
        map: (payload, { user }) => MapInteractionToRecord.create({
          User_likedPosts_likedBy_Post: [{
            source: user,
            target: payload.postId,
            createdAt: new Date().toISOString()
          }]
        })
      },
      {
        interaction: system.interactions.CreateComment,
        map: (payload, { user }) => MapInteractionToRecord.create({
          Comment: [{
            content: payload.content,
            author: user,
            post: payload.postId,
            parentComment: payload.parentCommentId
          }]
        })
      },
      {
        interaction: system.interactions.ViewPost,
        map: (payload) => {
          const post = payload.postId;
          post.viewCount = (post.viewCount || 0) + 1;
          return MapInteractionToRecord.create({
            Post: [post]
          });
        }
      }
    ]
  })
];

// 添加活动到系统
activities.forEach(activity => {
  system.addActivity(activity);
});

// 创建控制器
export const controller = new Controller(system);

// 导出系统组件供测试使用
export {
  entities,
  allEntities,
  filteredEntities,
  relations,
  interactions,
  activities
};

// 启动系统的辅助函数
export async function startSystem() {
  await system.start();
  return { system, controller };
}

// 停止系统的辅助函数
export async function stopSystem() {
  await system.stop();
}