import { Interaction, Action, Payload, PayloadItem } from 'interaqt';
import { User, Dormitory, Bed, ScoreRecord, KickoutRequest } from './entities.js';
import {
  AdminRole,
  DormLeaderRole,
  StudentRole
} from './permissions-simple.js';

// 管理员交互

// 创建宿舍
export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),      // 宿舍名称
      PayloadItem.create({ name: 'building', required: true }),  // 楼栋
      PayloadItem.create({ name: 'floor', required: true }),     // 楼层
      PayloadItem.create({ name: 'capacity', required: true })   // 床位数量
    ]
  }),
  userAttributives: AdminRole  // 只有管理员可以创建宿舍
});

// 任命宿舍长
export const AppointDormLeader = Interaction.create({
  name: 'AppointDormLeader',
  action: Action.create({ name: 'appointDormLeader' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      })
    ]
  }),
  userAttributives: AdminRole  // 只有管理员可以任命宿舍长
});

// 分配用户到宿舍
export const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assignUserToDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'bedNumber', required: true })  // 床位编号
    ]
  }),
  userAttributives: AdminRole  // 只有管理员可以分配用户
});

// 处理踢出申请
export const ProcessKickoutRequest = Interaction.create({
  name: 'ProcessKickoutRequest',
  action: Action.create({ name: 'processKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'request',
        base: KickoutRequest,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'decision', required: true }),  // approved, rejected
      PayloadItem.create({ name: 'comment' })                   // 处理备注
    ]
  }),
  userAttributives: AdminRole  // 管理员处理踢出申请
});

// 查看所有宿舍
export const ViewAllDormitories = Interaction.create({
  name: 'ViewAllDormitories',
  action: Action.create({ name: 'viewAllDormitories' }),
  payload: Payload.create({
    items: []
  }),
  userAttributives: AdminRole  // 只有管理员可以查看所有宿舍
});

// 查看所有用户
export const ViewAllUsers = Interaction.create({
  name: 'ViewAllUsers',
  action: Action.create({ name: 'viewAllUsers' }),
  payload: Payload.create({
    items: []
  }),
  userAttributives: AdminRole  // 只有管理员可以查看所有用户
});

// 宿舍长交互

// 记录扣分
export const RecordScoreDeduction = Interaction.create({
  name: 'RecordScoreDeduction',
  action: Action.create({ name: 'recordScoreDeduction' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'reason', required: true }),  // 扣分原因
      PayloadItem.create({ name: 'score', required: true })   // 扣分数值
    ]
  }),
  userAttributives: DormLeaderRole  // 宿舍长可以记录用户扣分
});

// 创建踢出申请
export const CreateKickoutRequest = Interaction.create({
  name: 'CreateKickoutRequest',
  action: Action.create({ name: 'createKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'reason', required: true })  // 踢出原因
    ]
  }),
  userAttributives: DormLeaderRole  // 宿舍长可以踢出用户
});

// 查看宿舍成员
export const ViewDormitoryMembers = Interaction.create({
  name: 'ViewDormitoryMembers',
  action: Action.create({ name: 'viewDormitoryMembers' }),
  payload: Payload.create({
    items: []
  }),
  userAttributives: DormLeaderRole  // 宿舍长可以查看成员
});

// 普通用户交互

// 查看我的宿舍
export const ViewMyDormitory = Interaction.create({
  name: 'ViewMyDormitory',
  action: Action.create({ name: 'viewMyDormitory' }),
  payload: Payload.create({
    items: []
  }),
  userAttributives: StudentRole  // 学生可以查看自己的宿舍
});

// 查看我的积分
export const ViewMyScore = Interaction.create({
  name: 'ViewMyScore',
  action: Action.create({ name: 'viewMyScore' }),
  payload: Payload.create({
    items: []
  }),
  userAttributives: StudentRole  // 学生可以查看自己的积分
});

// 查看我的扣分记录
export const ViewMyScoreRecords = Interaction.create({
  name: 'ViewMyScoreRecords',
  action: Action.create({ name: 'viewMyScoreRecords' }),
  payload: Payload.create({
    items: []
  }),
  userAttributives: StudentRole  // 学生可以查看自己的扣分记录
});