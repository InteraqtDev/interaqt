import { Attributive, BoolExp, boolExpToAttributives } from 'interaqt';

// 基础角色权限检查
export const AdminRole = Attributive.create({
  name: 'AdminRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'admin';
  }
});

export const DormLeaderRole = Attributive.create({
  name: 'DormLeaderRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'dormLeader';
  }
});

export const StudentRole = Attributive.create({
  name: 'StudentRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'student';
  }
});

// 已分配宿舍的用户
export const AssignedToAnyDormitory = Attributive.create({
  name: 'AssignedToAnyDormitory',
  content: async function(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    
    // 查找用户是否有宿舍分配
    const { UserDormitoryRelation } = await import('./relations.js');
    const assignment = await this.system.storage.findOneRelationByName(
      UserDormitoryRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', eventArgs.user.id] }),
      undefined,
      ['id']
    );
    
    return !!assignment;
  }
});

// 用户积分足够低可以被踢出 (积分低于20)
export const LowScoreForKickout = Attributive.create({
  name: 'LowScoreForKickout',
  content: async function(targetUser, eventArgs) {
    const targetUserId = eventArgs.payload.user?.id;
    if (!targetUserId) return false;
    
    const { MatchExp } = this.globals;
    
    // 查找目标用户当前积分
    const user = await this.system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', targetUserId] }),
      undefined,
      ['score']
    );
    
    return user && user.score < 20;
  }
});

// 宿舍长只能操作同一宿舍的用户
export const SameDormitoryAsUser = Attributive.create({
  name: 'SameDormitoryAsUser',
  content: async function(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const { UserDormitoryRelation } = await import('./relations.js');
    
    // 获取宿舍长的宿舍
    const leaderAssignment = await this.system.storage.findOneRelationByName(
      UserDormitoryRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', eventArgs.user.id] }),
      undefined,
      ['target']
    );
    
    if (!leaderAssignment) return false;
    
    // 获取目标用户的宿舍
    const targetUserId = eventArgs.payload.user?.id;
    if (!targetUserId) return false;
    
    const targetAssignment = await this.system.storage.findOneRelationByName(
      UserDormitoryRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', targetUserId] }),
      undefined,
      ['target']
    );
    
    if (!targetAssignment) return false;
    
    // 检查是否在同一宿舍
    return leaderAssignment.target.id === targetAssignment.target.id;
  }
});

// 宿舍是否已满员
export const DormitoryNotFull = Attributive.create({
  name: 'DormitoryNotFull',
  content: async function(targetUser, eventArgs) {
    const dormitoryId = eventArgs.payload.dormitory?.id;
    if (!dormitoryId) return false;
    
    const { MatchExp } = this.globals;
    
    const dormitory = await this.system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitoryId] }),
      undefined,
      ['capacity', 'currentCount']
    );
    
    return dormitory && dormitory.currentCount < dormitory.capacity;
  }
});

// 床位是否可用
export const BedAvailable = Attributive.create({
  name: 'BedAvailable',
  content: async function(targetUser, eventArgs) {
    const dormitoryId = eventArgs.payload.dormitory?.id;
    const bedNumber = eventArgs.payload.bedNumber;
    
    if (!dormitoryId || !bedNumber) return false;
    
    const { MatchExp } = this.globals;
    const { DormitoryBedRelation } = await import('./relations.js');
    
    // 查找指定床位
    const bedRelation = await this.system.storage.findOneRelationByName(
      DormitoryBedRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', dormitoryId] })
        .and({ key: 'target.number', value: ['=', bedNumber] }),
      undefined,
      [['target', { attributeQuery: ['isOccupied'] }]]
    );
    
    return bedRelation && !bedRelation.target.isOccupied;
  }
});

// 用户未被分配到任何宿舍
export const UserNotAssigned = Attributive.create({
  name: 'UserNotAssigned',
  content: async function(targetUser, eventArgs) {
    const targetUserId = eventArgs.payload.user?.id;
    if (!targetUserId) return false;
    
    const { MatchExp } = this.globals;
    const { UserDormitoryRelation } = await import('./relations.js');
    
    const assignment = await this.system.storage.findOneRelationByName(
      UserDormitoryRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', targetUserId] }),
      undefined,
      ['id']
    );
    
    return !assignment;
  }
});

// 用户在指定宿舍内
export const UserInDormitory = Attributive.create({
  name: 'UserInDormitory',
  content: async function(targetUser, eventArgs) {
    const targetUserId = eventArgs.payload.user?.id;
    const dormitoryId = eventArgs.payload.dormitory?.id;
    
    if (!targetUserId || !dormitoryId) return false;
    
    const { MatchExp } = this.globals;
    const { UserDormitoryRelation } = await import('./relations.js');
    
    const assignment = await this.system.storage.findOneRelationByName(
      UserDormitoryRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', targetUserId] })
        .and({ key: 'target.id', value: ['=', dormitoryId] }),
      undefined,
      ['id']
    );
    
    return !!assignment;
  }
});

// 踢出申请状态为pending
export const KickoutRequestPending = Attributive.create({
  name: 'KickoutRequestPending',
  content: async function(targetUser, eventArgs) {
    const requestId = eventArgs.payload.request?.id;
    if (!requestId) return false;
    
    const { MatchExp } = this.globals;
    
    const request = await this.system.storage.findOne('KickoutRequest',
      MatchExp.atom({ key: 'id', value: ['=', requestId] }),
      undefined,
      ['status']
    );
    
    return request && request.status === 'pending';
  }
});

// 组合权限
export const AdminOrDormLeader = boolExpToAttributives(
  BoolExp.atom(AdminRole).or(DormLeaderRole)
);

export const DormLeaderWithSameDormitory = boolExpToAttributives(
  BoolExp.atom(DormLeaderRole).and(SameDormitoryAsUser)
);

export const StudentWithDormitory = boolExpToAttributives(
  BoolExp.atom(StudentRole).and(AssignedToAnyDormitory)
);

export const AdminForAssignment = boolExpToAttributives(
  BoolExp.atom(AdminRole)
    .and(DormitoryNotFull)
    .and(BedAvailable)
    .and(UserNotAssigned)
    .and(UserInDormitory)
);

export const DormLeaderForScoring = boolExpToAttributives(
  BoolExp.atom(DormLeaderRole).and(SameDormitoryAsUser)
);

export const DormLeaderForKickout = boolExpToAttributives(
  BoolExp.atom(DormLeaderRole)
    .and(SameDormitoryAsUser)
    .and(LowScoreForKickout)
);

export const AdminForKickoutProcessing = boolExpToAttributives(
  BoolExp.atom(AdminRole).and(KickoutRequestPending)
);