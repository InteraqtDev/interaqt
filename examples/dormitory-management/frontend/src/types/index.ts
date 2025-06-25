// 用户类型
export interface User {
  id: string;
  name: string;
  role: 'admin' | 'student';
  email: string;
  studentId: string;
  createdAt: string;
  // 计算属性
  isAdmin?: boolean;
  hasActiveDormitory?: boolean;
  totalScore?: number;
  applicationCount?: number;
}

// 宿舍类型
export interface Dormitory {
  id: string;
  name: string;
  building: string;
  roomNumber: string;
  capacity: number;
  description: string;
  createdAt: string;
  // 计算属性
  totalMemberCount?: number;
  currentOccupancy?: number;
  isFull?: boolean;
  availableBeds?: number;
  hasLeader?: boolean;
  pendingApplicationCount?: number;
  totalScore?: number;
  averageScore?: number;
  allMembersActive?: boolean;
}

// 宿舍成员类型
export interface DormitoryMember {
  id: string;
  role: 'leader' | 'member';
  score: number;
  joinedAt: string;
  status: 'active' | 'kicked';
  bedNumber: number;
  user: User;
  dormitory: Dormitory;
  // 计算属性
  isLeader?: boolean;
  isActive?: boolean;
  scoreRecordCount?: number;
  atKickRisk?: boolean;
}

// 入住申请类型
export interface DormitoryApplication {
  id: string;
  status: 'pending' | 'leader_approved' | 'admin_approved' | 'rejected' | 'cancelled';
  message: string;
  leaderComment?: string;
  adminComment?: string;
  createdAt: string;
  updatedAt: string;
  applicant: User;
  dormitory: Dormitory;
  leaderApprover?: User;
  adminApprover?: User;
}

// 积分记录类型
export interface ScoreRecord {
  id: string;
  points: number;
  reason: string;
  category: 'hygiene' | 'discipline' | 'activity' | 'other';
  createdAt: string;
  member: DormitoryMember;
  recorder: User;
}

// 踢出申请类型
export interface KickRequest {
  id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  adminComment?: string;
  createdAt: string;
  processedAt?: string;
  targetMember: DormitoryMember;
  requester: User;
  processor?: User;
}

// 应用状态类型
export interface AppState {
  currentUser: User | null;
  loading: boolean;
  error: string | null;
}

// 表单类型
export interface CreateDormitoryForm {
  name: string;
  building: string;
  roomNumber: string;
  capacity: number;
  description: string;
}

export interface ApplyDormitoryForm {
  dormitoryId: string;
  message: string;
}

export interface RecordScoreForm {
  memberId: string;
  points: number;
  reason: string;
  category: 'hygiene' | 'discipline' | 'activity' | 'other';
}

export interface KickMemberForm {
  memberId: string;
  reason: string;
}

// 统计数据类型
export interface DashboardStats {
  totalDormitories: number;
  totalStudents: number;
  pendingApplications: number;
  kickRequests: number;
  averageScore: number;
}

// 页面路由类型
export type PageRoute = 
  | '/dashboard'
  | '/admin/dormitories'
  | '/applications'
  | '/members'
  | '/scores'
  | '/student'
  | '/admin/reports';