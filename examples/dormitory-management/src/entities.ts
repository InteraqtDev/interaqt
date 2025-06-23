import { Entity, Property } from '@';

// 用户实体
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string'
    }),
    Property.create({ 
      name: 'role', 
      type: 'string',
      defaultValue: () => 'student' // student, admin
    }),
    Property.create({ 
      name: 'email', 
      type: 'string'
    }),
    Property.create({ 
      name: 'studentId', 
      type: 'string'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

// 宿舍实体
export const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string'
    }),
    Property.create({ 
      name: 'building', 
      type: 'string'
    }),
    Property.create({ 
      name: 'roomNumber', 
      type: 'string'
    }),
    Property.create({ 
      name: 'capacity', 
      type: 'number' // 4-6个床位
    }),
    Property.create({ 
      name: 'description', 
      type: 'string'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

// 宿舍成员实体
export const DormitoryMember = Entity.create({
  name: 'DormitoryMember',
  properties: [
    Property.create({ 
      name: 'role', 
      type: 'string',
      defaultValue: () => 'member' // leader, member
    }),
    Property.create({ 
      name: 'score', 
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'joinedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active' // active, kicked
    }),
    Property.create({ 
      name: 'bedNumber', 
      type: 'number'
    })
  ]
});

// 入住申请实体
export const DormitoryApplication = Entity.create({
  name: 'DormitoryApplication',
  properties: [
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending' // pending, leader_approved, admin_approved, rejected, cancelled
    }),
    Property.create({ 
      name: 'message', 
      type: 'string'
    }),
    Property.create({ 
      name: 'leaderComment', 
      type: 'string'
    }),
    Property.create({ 
      name: 'adminComment', 
      type: 'string'
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
    })
  ]
});

// 积分记录实体
export const ScoreRecord = Entity.create({
  name: 'ScoreRecord',
  properties: [
    Property.create({ 
      name: 'points', 
      type: 'number' // 正数为加分，负数为扣分
    }),
    Property.create({ 
      name: 'reason', 
      type: 'string'
    }),
    Property.create({ 
      name: 'category', 
      type: 'string',
      defaultValue: () => 'other' // hygiene, discipline, activity, other
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

// 踢出申请实体
export const KickRequest = Entity.create({
  name: 'KickRequest',
  properties: [
    Property.create({ 
      name: 'reason', 
      type: 'string'
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending' // pending, approved, rejected
    }),
    Property.create({ 
      name: 'adminComment', 
      type: 'string'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'string'
    })
  ]
});

// 导出所有实体
export const entities = [
  User,
  Dormitory,
  DormitoryMember,
  DormitoryApplication,
  ScoreRecord,
  KickRequest
]; 