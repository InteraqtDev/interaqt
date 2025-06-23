import { Relation, Property } from '@';
import { User, Dormitory, DormitoryMember, DormitoryApplication, ScoreRecord, KickRequest } from './entities.js';

/**
 * 用户与宿舍成员关系 (1:n)
 * 一个用户可以有多个宿舍成员记录（历史记录）
 */
export const UserDormitoryMember = Relation.create({
  source: DormitoryMember,
  sourceProperty: 'user',
  target: User,
  targetProperty: 'dormitoryMemberships',
  type: 'n:1'
});

/**
 * 宿舍与宿舍成员关系 (1:n)
 * 一个宿舍有多个成员
 */
export const DormitoryDormitoryMember = Relation.create({
  source: DormitoryMember,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'members',
  type: 'n:1'
});

/**
 * 用户与入住申请关系 (1:n)
 * 用户可以发起多个申请
 */
export const UserDormitoryApplication = Relation.create({
  source: DormitoryApplication,
  sourceProperty: 'applicant',
  target: User,
  targetProperty: 'dormitoryApplications',
  type: 'n:1'
});

/**
 * 宿舍与入住申请关系 (1:n)
 * 一个宿舍可以收到多个申请
 */
export const DormitoryDormitoryApplication = Relation.create({
  source: DormitoryApplication,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'applications',
  type: 'n:1'
});

/**
 * 宿舍成员与积分记录关系 (1:n)
 * 成员有多条积分记录
 */
export const DormitoryMemberScoreRecord = Relation.create({
  source: ScoreRecord,
  sourceProperty: 'member',
  target: DormitoryMember,
  targetProperty: 'scoreRecords',
  type: 'n:1'
});

/**
 * 用户（记录者）与积分记录关系 (1:n)
 * 记录是谁给的加分/扣分
 */
export const UserScoreRecord = Relation.create({
  source: ScoreRecord,
  sourceProperty: 'recorder',
  target: User,
  targetProperty: 'recordedScores',
  type: 'n:1'
});

/**
 * 宿舍成员与踢出申请关系 (1:n)
 * 成员可能有踢出申请
 */
export const DormitoryMemberKickRequest = Relation.create({
  source: KickRequest,
  sourceProperty: 'targetMember',
  target: DormitoryMember,
  targetProperty: 'kickRequests',
  type: 'n:1'
});

/**
 * 用户（申请人）与踢出申请关系 (1:n)
 * 记录是谁发起的踢出申请
 */
export const UserKickRequest = Relation.create({
  source: KickRequest,
  sourceProperty: 'requester',
  target: User,
  targetProperty: 'initiatedKickRequests',
  type: 'n:1'
});

/**
 * 用户（处理人）与踢出申请关系 (1:n)
 * 记录是哪个管理员处理的申请
 */
export const UserProcessedKickRequest = Relation.create({
  source: KickRequest,
  sourceProperty: 'processor',
  target: User,
  targetProperty: 'processedKickRequests',
  type: 'n:1'
});

/**
 * 用户（审批人）与入住申请关系 - 宿舍长审批 (1:n)
 */
export const UserLeaderApprovedApplication = Relation.create({
  source: DormitoryApplication,
  sourceProperty: 'leaderApprover',
  target: User,
  targetProperty: 'leaderApprovedApplications',
  type: 'n:1'
});

/**
 * 用户（审批人）与入住申请关系 - 管理员审批 (1:n)
 */
export const UserAdminApprovedApplication = Relation.create({
  source: DormitoryApplication,
  sourceProperty: 'adminApprover',
  target: User,
  targetProperty: 'adminApprovedApplications',
  type: 'n:1'
});

// 导出所有关系
export const relations = [
  UserDormitoryMember,
  DormitoryDormitoryMember,
  UserDormitoryApplication,
  DormitoryDormitoryApplication,
  DormitoryMemberScoreRecord,
  UserScoreRecord,
  DormitoryMemberKickRequest,
  UserKickRequest,
  UserProcessedKickRequest,
  UserLeaderApprovedApplication,
  UserAdminApprovedApplication
]; 