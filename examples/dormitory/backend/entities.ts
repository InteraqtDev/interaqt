import { Entity, Property, Transform, InteractionEventEntity, StateMachine, StateNode, StateTransfer } from 'interaqt';

// 用户实体
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'phone', type: 'string' }),
    Property.create({ 
      name: 'role', 
      type: 'string',
      defaultValue: () => 'student'  // admin, dormLeader, student
    }),
    Property.create({ 
      name: 'score', 
      type: 'number',
      defaultValue: () => 100  // 默认积分100
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)  // Unix timestamp in seconds
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)  // Unix timestamp in seconds
    })
  ]
});

// 宿舍实体
export const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'building', type: 'string' }),
    Property.create({ name: 'floor', type: 'number' }),
    Property.create({ 
      name: 'capacity', 
      type: 'number',
      defaultValue: () => 4  // 默认4个床位
    }),
    Property.create({ 
      name: 'currentCount', 
      type: 'number',
      defaultValue: () => 0  // 当前入住人数
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)  // Unix timestamp in seconds
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)  // Unix timestamp in seconds
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          building: event.payload.building,
          floor: event.payload.floor,
          capacity: event.payload.capacity || 4,
          currentCount: 0,
          createdAt: Math.floor(Date.now() / 1000),
          updatedAt: Math.floor(Date.now() / 1000)
        };
      }
      return null;
    }
  })
});

// 床位实体
export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'number', type: 'number' }),  // 床位编号
    Property.create({ 
      name: 'isOccupied', 
      type: 'boolean',
      defaultValue: () => false  // 是否被占用
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)  // Unix timestamp in seconds
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)  // Unix timestamp in seconds
    })
  ]
  // Note: Beds will be created by a side effect when dormitory is created
  // We cannot use Transform here to create multiple entities from single event
});

// 扣分记录实体
export const ScoreRecord = Entity.create({
  name: 'ScoreRecord',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),  // 扣分原因
    Property.create({ name: 'score', type: 'number' }),   // 扣分数值
    Property.create({ 
      name: 'recordedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)  // Unix timestamp in seconds
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'RecordScoreDeduction') {
        return {
          reason: event.payload.reason,
          score: event.payload.score,
          recordedAt: Math.floor(Date.now() / 1000)
        };
      }
      return null;
    }
  })
});

// 踢出申请实体
export const KickoutRequest = Entity.create({
  name: 'KickoutRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),  // 申请原因
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending'  // pending, approved, rejected
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)  // Unix timestamp in seconds
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'number'  // 处理时间，可为空
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateKickoutRequest') {
        return {
          reason: event.payload.reason,
          status: 'pending',
          createdAt: Math.floor(Date.now() / 1000)
        };
      }
      // Note: ProcessKickoutRequest updates are handled via manual storage update
      // since Transform.create cannot update existing entities by ID
      return null;
    }
  })
});