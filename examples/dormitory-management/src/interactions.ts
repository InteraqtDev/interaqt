import {
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Attributive,
  BoolExp,
  GetAction,
  Controller,
  boolExpToAttributives
} from '@';
import { User, Dormitory, DormitoryMember, DormitoryApplication, ScoreRecord, KickRequest } from './entities.js';

// ============== 权限定义 ==============

// 管理员权限
const AdminAttributive = Attributive.create({
  name: 'Admin',
  content: function(this: Controller, targetUser, { user }) {
    return user.role === 'admin';
  }
});

// 学生权限
const StudentAttributive = Attributive.create({
  name: 'Student',
  content: function(this: Controller, targetUser, { user }) {
    return user.role === 'student';
  }
});

// 宿舍长权限 - 检查用户是否是某个宿舍的宿舍长
const DormitoryLeaderAttributive = Attributive.create({
  name: 'DormitoryLeader',
  content: async function(this: Controller, targetUser, { user, payload }) {
    const { MatchExp } = this.globals;
    
    // 如果payload中有dormitoryId，检查是否是该宿舍的宿舍长
    if (payload?.dormitoryId) {
      const membership = await this.system.storage.findOne('DormitoryMember',
        MatchExp.atom({ key: 'user.id', value: ['=', user.id] })
          .and({ key: 'dormitory.id', value: ['=', payload.dormitoryId] })
          .and({ key: 'role', value: ['=', 'leader'] })
          .and({ key: 'status', value: ['=', 'active'] })
      );
      return !!membership;
    }
    
    // 否则检查是否是任何宿舍的宿舍长
    const membership = await this.system.storage.findOne('DormitoryMember',
      MatchExp.atom({ key: 'user.id', value: ['=', user.id] })
        .and({ key: 'role', value: ['=', 'leader'] })
        .and({ key: 'status', value: ['=', 'active'] })
    );
    return !!membership;
  }
});

// 宿舍成员权限
const DormitoryMemberAttributive = Attributive.create({
  name: 'DormitoryMemberCheck',
  content: async function(this: Controller, targetUser, { user, payload }) {
    const { MatchExp } = this.globals;
    
    if (payload?.dormitoryId) {
      const membership = await this.system.storage.findOne('DormitoryMember',
        MatchExp.atom({ key: 'user.id', value: ['=', user.id] })
          .and({ key: 'dormitory.id', value: ['=', payload.dormitoryId] })
          .and({ key: 'status', value: ['=', 'active'] })
      );
      return !!membership;
    }
    
    return false;
  }
});

// 没有活跃宿舍的学生
const NoActiveDormitoryAttributive = Attributive.create({
  name: 'NoActiveDormitory',
  content: async function(this: Controller, targetUser, { user }) {
    const { MatchExp } = this.globals;
    
    const membership = await this.system.storage.findOne('DormitoryMember',
      MatchExp.atom({ key: 'user.id', value: ['=', user.id] })
        .and({ key: 'status', value: ['=', 'active'] })
    );
    return !membership;
  }
});

// 宿舍未满
const DormitoryNotFullAttributive = Attributive.create({
  name: 'DormitoryNotFull',
  content: async function(this: Controller, dormitory, { user }) {
    return !dormitory.isFull;
  }
});

// ============== 管理员操作 ==============

// 创建宿舍
export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'name',
        type: 'string'
      }),
      PayloadItem.create({
        name: 'building',
        type: 'string'
      }),
      PayloadItem.create({
        name: 'roomNumber',
        type: 'string'
      }),
      PayloadItem.create({
        name: 'capacity',
        type: 'number'
      }),
      PayloadItem.create({
        name: 'description',
        type: 'string'
      })
    ]
  }),
  userAttributives: AdminAttributive
});

// 指定宿舍长
export const AssignDormitoryLeader = Interaction.create({
  name: 'AssignDormitoryLeader',
  action: Action.create({ name: 'assignDormitoryLeader' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'dormitoryId',
        base: Dormitory,
        isRef: true
      }),
      PayloadItem.create({
        name: 'userId',
        base: User,
        isRef: true
      })
    ]
  }),
  userAttributives: AdminAttributive
});

// 直接分配成员到宿舍
export const AssignMemberToDormitory = Interaction.create({
  name: 'AssignMemberToDormitory',
  action: Action.create({ name: 'assignMemberToDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'dormitoryId',
        base: Dormitory,
        isRef: true,
        attributives: DormitoryNotFullAttributive
      }),
      PayloadItem.create({
        name: 'userId',
        base: User,
        isRef: true
      }),
      PayloadItem.create({
        name: 'bedNumber',
        type: 'number'
      })
    ]
  }),
  userAttributives: AdminAttributive
});

// 审批踢出申请
export const ApproveKickRequest = Interaction.create({
  name: 'ApproveKickRequest',
  action: Action.create({ name: 'approveKickRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'kickRequestId',
        base: KickRequest,
        isRef: true
      }),
      PayloadItem.create({
        name: 'adminComment',
        type: 'string'
      })
    ]
  }),
  userAttributives: AdminAttributive
});

// 拒绝踢出申请
export const RejectKickRequest = Interaction.create({
  name: 'RejectKickRequest',
  action: Action.create({ name: 'rejectKickRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'kickRequestId',
        base: KickRequest,
        isRef: true
      }),
      PayloadItem.create({
        name: 'adminComment',
        type: 'string'
      })
    ]
  }),
  userAttributives: AdminAttributive
});

// ============== 宿舍长操作 ==============

// 审批入住申请（宿舍长）
export const LeaderApproveApplication = Interaction.create({
  name: 'LeaderApproveApplication',
  action: Action.create({ name: 'leaderApproveApplication' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'applicationId',
        base: DormitoryApplication,
        isRef: true
      }),
      PayloadItem.create({
        name: 'leaderComment',
        type: 'string'
      })
    ]
  }),
  userAttributives: DormitoryLeaderAttributive
});

// 拒绝入住申请（宿舍长）
export const LeaderRejectApplication = Interaction.create({
  name: 'LeaderRejectApplication',
  action: Action.create({ name: 'leaderRejectApplication' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'applicationId',
        base: DormitoryApplication,
        isRef: true
      }),
      PayloadItem.create({
        name: 'leaderComment',
        type: 'string'
      })
    ]
  }),
  userAttributives: DormitoryLeaderAttributive
});

// 给成员加分/扣分
export const RecordScore = Interaction.create({
  name: 'RecordScore',
  action: Action.create({ name: 'recordScore' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'memberId',
        base: DormitoryMember,
        isRef: true
      }),
      PayloadItem.create({
        name: 'points',
        type: 'number'
      }),
      PayloadItem.create({
        name: 'reason',
        type: 'string'
      }),
      PayloadItem.create({
        name: 'category',
        type: 'string'
      })
    ]
  }),
  userAttributives: DormitoryLeaderAttributive
});

// 申请踢出成员
export const RequestKickMember = Interaction.create({
  name: 'RequestKickMember',
  action: Action.create({ name: 'requestKickMember' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'memberId',
        base: DormitoryMember,
        isRef: true
      }),
      PayloadItem.create({
        name: 'reason',
        type: 'string'
      })
    ]
  }),
  userAttributives: DormitoryLeaderAttributive
});

// ============== 学生操作 ==============

// 申请加入宿舍
export const ApplyForDormitory = Interaction.create({
  name: 'ApplyForDormitory',
  action: Action.create({ name: 'applyForDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'dormitoryId',
        base: Dormitory,
        isRef: true,
        attributives: DormitoryNotFullAttributive
      }),
      PayloadItem.create({
        name: 'message',
        type: 'string'
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(StudentAttributive).and(BoolExp.atom(NoActiveDormitoryAttributive))
  )
});

// 取消申请
export const CancelApplication = Interaction.create({
  name: 'CancelApplication',
  action: Action.create({ name: 'cancelApplication' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'applicationId',
        base: DormitoryApplication,
        isRef: true
      })
    ]
  }),
  userAttributives: StudentAttributive
});

// ============== 查询操作 ==============

// 查看宿舍列表
export const GetDormitories = Interaction.create({
  name: 'GetDormitories',
  action: GetAction,
  data: Dormitory
});

// 查看用户信息
export const GetUsers = Interaction.create({
  name: 'GetUsers',
  action: GetAction,
  data: User
});

// 查看宿舍成员
export const GetDormitoryMembers = Interaction.create({
  name: 'GetDormitoryMembers',
  action: GetAction,
  data: DormitoryMember
});

// 查看申请列表
export const GetApplications = Interaction.create({
  name: 'GetApplications',
  action: GetAction,
  data: DormitoryApplication
});

// 查看积分记录
export const GetScoreRecords = Interaction.create({
  name: 'GetScoreRecords',
  action: GetAction,
  data: ScoreRecord
});

// 查看踢出申请
export const GetKickRequests = Interaction.create({
  name: 'GetKickRequests',
  action: GetAction,
  data: KickRequest
});

// ============== 管理员审批入住申请 ==============

// 管理员最终审批入住申请
export const AdminApproveApplication = Interaction.create({
  name: 'AdminApproveApplication',
  action: Action.create({ name: 'adminApproveApplication' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'applicationId',
        base: DormitoryApplication,
        isRef: true
      }),
      PayloadItem.create({
        name: 'adminComment',
        type: 'string'
      }),
      PayloadItem.create({
        name: 'bedNumber',
        type: 'number'
      })
    ]
  }),
  userAttributives: AdminAttributive
});

// 管理员拒绝入住申请
export const AdminRejectApplication = Interaction.create({
  name: 'AdminRejectApplication',
  action: Action.create({ name: 'adminRejectApplication' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'applicationId',
        base: DormitoryApplication,
        isRef: true
      }),
      PayloadItem.create({
        name: 'adminComment',
        type: 'string'
      })
    ]
  }),
  userAttributives: AdminAttributive
});

// 导出所有交互
export const interactions = [
  // 管理员操作
  CreateDormitory,
  AssignDormitoryLeader,
  AssignMemberToDormitory,
  ApproveKickRequest,
  RejectKickRequest,
  AdminApproveApplication,
  AdminRejectApplication,
  
  // 宿舍长操作
  LeaderApproveApplication,
  LeaderRejectApplication,
  RecordScore,
  RequestKickMember,
  
  // 学生操作
  ApplyForDormitory,
  CancelApplication,
  
  // 查询操作
  GetDormitories,
  GetUsers,
  GetDormitoryMembers,
  GetApplications,
  GetScoreRecords,
  GetKickRequests
]; 