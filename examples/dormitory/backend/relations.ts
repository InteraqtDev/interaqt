import { Relation, Property, Transform, InteractionEventEntity } from 'interaqt';
import { User, Dormitory, Bed, ScoreRecord, KickoutRequest } from './entities.js';

// 用户-宿舍关系 (一个用户只能分配到一个宿舍)
export const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory, 
  targetProperty: 'residents',
  type: 'n:1',  // 多个用户对应一个宿舍
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)  // Unix timestamp in seconds
    }),
    Property.create({ name: 'assignedBy', type: 'string' })  // 分配人ID
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'AssignUserToDormitory') {
        return {
          source: event.payload.user,
          target: event.payload.dormitory,
          assignedAt: Math.floor(Date.now() / 1000),
          assignedBy: event.user.id
        };
      }
      return null;
    }
  })
});

// 用户-床位关系 (一个用户只能分配到一个床位)
export const UserBedRelation = Relation.create({
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'occupant', 
  type: '1:1',  // 一对一关系
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)  // Unix timestamp in seconds
    })
  ]
});

// 宿舍-床位关系 (一个宿舍包含多个床位)
export const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n'  // 一个宿舍对应多个床位
});

// 宿舍-宿舍长关系 (一个宿舍只有一个宿舍长)
export const DormitoryLeaderRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'leader',
  target: User,
  targetProperty: 'managedDormitory',
  type: '1:1',  // 一对一关系
  properties: [
    Property.create({ 
      name: 'appointedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)  // Unix timestamp in seconds
    }),
    Property.create({ name: 'appointedBy', type: 'string' })  // 任命人ID
  ]
});

// 用户-扣分记录关系 (一个用户可以有多条扣分记录)
export const UserScoreRecordRelation = Relation.create({
  source: User,
  sourceProperty: 'scoreRecords',
  target: ScoreRecord,
  targetProperty: 'user',
  type: '1:n',  // 一个用户对应多条扣分记录
  properties: [
    Property.create({ name: 'recordedBy', type: 'string' })  // 记录人ID
  ]
});

// 踢出申请-被踢用户关系
export const KickoutRequestTargetUserRelation = Relation.create({
  source: KickoutRequest,
  sourceProperty: 'targetUser',
  target: User,
  targetProperty: 'kickoutRequests',
  type: 'n:1'  // 多个踢出申请可以针对同一个用户
});

// 踢出申请-申请人关系
export const KickoutRequestApplicantRelation = Relation.create({
  source: KickoutRequest,
  sourceProperty: 'applicant',
  target: User,
  targetProperty: 'submittedKickoutRequests',
  type: 'n:1'  // 多个踢出申请可以由同一个申请人提交
});

// 踢出申请-处理人关系
export const KickoutRequestProcessorRelation = Relation.create({
  source: KickoutRequest,
  sourceProperty: 'processor',
  target: User,
  targetProperty: 'processedKickoutRequests',
  type: 'n:1'  // 多个踢出申请可以由同一个处理人处理
});