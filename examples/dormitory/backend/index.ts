import { 
  User, 
  Dormitory, 
  Bed, 
  ScoreRecord, 
  KickoutRequest 
} from './entities.js';

import { 
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryLeaderRelation,
  UserScoreRecordRelation,
  KickoutRequestTargetUserRelation,
  KickoutRequestApplicantRelation,
  KickoutRequestProcessorRelation
} from './relations.js';

export const entities = [
  User,
  Dormitory,
  Bed,
  ScoreRecord,
  KickoutRequest
];

export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryLeaderRelation,
  UserScoreRecordRelation,
  KickoutRequestTargetUserRelation,
  KickoutRequestApplicantRelation,
  KickoutRequestProcessorRelation
];

import {
  CreateDormitory,
  AppointDormLeader,
  AssignUserToDormitory,
  ProcessKickoutRequest,
  ViewAllDormitories,
  ViewAllUsers,
  RecordScoreDeduction,
  CreateKickoutRequest,
  ViewDormitoryMembers,
  ViewMyDormitory,
  ViewMyScore,
  ViewMyScoreRecords
} from './interactions.js';

export const activities = []

export const interactions = [
  // 管理员交互
  CreateDormitory,
  AppointDormLeader,
  AssignUserToDormitory,
  ProcessKickoutRequest,
  ViewAllDormitories,
  ViewAllUsers,
  // 宿舍长交互
  RecordScoreDeduction,
  CreateKickoutRequest,
  ViewDormitoryMembers,
  // 普通用户交互
  ViewMyDormitory,
  ViewMyScore,
  ViewMyScoreRecords
];

export const dicts = []
