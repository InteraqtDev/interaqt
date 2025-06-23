import { Activity, Transfer, ActivityGroup } from '@';
import {
  ApplyForDormitory,
  LeaderApproveApplication,
  LeaderRejectApplication,
  AdminApproveApplication,
  AdminRejectApplication,
  CancelApplication,
  RequestKickMember,
  ApproveKickRequest,
  RejectKickRequest
} from './interactions.js';

// ============== 活动说明 ==============

/**
 * 在宿舍管理系统中，我们有两个主要的业务流程：
 * 
 * 1. 入住申请流程
 *    - 学生申请加入宿舍 (ApplyForDormitory)
 *    - 宿舍长审批 (LeaderApproveApplication/LeaderRejectApplication)
 *    - 管理员最终审批 (AdminApproveApplication/AdminRejectApplication)
 *    - 学生可以随时取消 (CancelApplication)
 * 
 * 2. 踢出成员流程
 *    - 宿舍长申请踢出成员 (RequestKickMember)
 *    - 管理员审批 (ApproveKickRequest/RejectKickRequest)
 * 
 * 由于这些交互之间的关系不是严格的线性流程，而是基于状态和权限的独立操作，
 * 所以我们不使用 Activity 来管理流程，而是通过以下方式实现：
 * 
 * 1. 使用实体的状态属性（如 DormitoryApplication.status）来跟踪流程状态
 * 2. 使用 Attributive 权限系统来控制谁可以在什么时候执行哪些操作
 * 3. 在交互的实现中检查前置条件
 * 
 * 这种方式更加灵活，符合实际业务需求。
 */

// 导出空的活动数组
export const activities = []; 