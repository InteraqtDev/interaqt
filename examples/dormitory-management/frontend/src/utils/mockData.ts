import { User, Dormitory, DormitoryMember, DormitoryApplication, ScoreRecord, KickRequest } from '../types';

// Mock Users
export const mockUsers: User[] = [
  {
    id: '1',
    name: '张三',
    role: 'admin',
    email: 'admin@university.edu',
    studentId: 'ADMIN001',
    createdAt: '2024-01-01T00:00:00Z',
    isAdmin: true,
    hasActiveDormitory: false,
    totalScore: 0,
    applicationCount: 0
  },
  {
    id: '2',
    name: '李四',
    role: 'student',
    email: 'lisi@student.edu',
    studentId: 'STU20240001',
    createdAt: '2024-01-02T00:00:00Z',
    isAdmin: false,
    hasActiveDormitory: true,
    totalScore: 85,
    applicationCount: 1
  },
  {
    id: '3',
    name: '王五',
    role: 'student',
    email: 'wangwu@student.edu',
    studentId: 'STU20240002',
    createdAt: '2024-01-03T00:00:00Z',
    isAdmin: false,
    hasActiveDormitory: true,
    totalScore: 92,
    applicationCount: 1
  },
  {
    id: '4',
    name: '赵六',
    role: 'student',
    email: 'zhaoliu@student.edu',
    studentId: 'STU20240003',
    createdAt: '2024-01-04T00:00:00Z',
    isAdmin: false,
    hasActiveDormitory: false,
    totalScore: 0,
    applicationCount: 0
  },
  {
    id: '5',
    name: '孙七',
    role: 'student',
    email: 'sunqi@student.edu',
    studentId: 'STU20240004',
    createdAt: '2024-01-05T00:00:00Z',
    isAdmin: false,
    hasActiveDormitory: true,
    totalScore: 78,
    applicationCount: 1
  }
];

// Mock Dormitories
export const mockDormitories: Dormitory[] = [
  {
    id: '1',
    name: '梅园1号楼101',
    building: '梅园1号楼',
    roomNumber: '101',
    capacity: 4,
    description: '南向，采光良好，配备空调和独立卫浴',
    createdAt: '2024-01-01T00:00:00Z',
    totalMemberCount: 3,
    currentOccupancy: 3,
    isFull: false,
    availableBeds: 1,
    hasLeader: true,
    pendingApplicationCount: 1,
    totalScore: 255,
    averageScore: 85,
    allMembersActive: true
  },
  {
    id: '2',
    name: '梅园1号楼102',
    building: '梅园1号楼',
    roomNumber: '102',
    capacity: 4,
    description: '北向，安静环境，适合学习',
    createdAt: '2024-01-01T00:00:00Z',
    totalMemberCount: 4,
    currentOccupancy: 4,
    isFull: true,
    availableBeds: 0,
    hasLeader: true,
    pendingApplicationCount: 0,
    totalScore: 340,
    averageScore: 85,
    allMembersActive: true
  },
  {
    id: '3',
    name: '竹园2号楼201',
    building: '竹园2号楼',
    roomNumber: '201',
    capacity: 6,
    description: '大户型，配备阳台和书桌',
    createdAt: '2024-01-02T00:00:00Z',
    totalMemberCount: 2,
    currentOccupancy: 2,
    isFull: false,
    availableBeds: 4,
    hasLeader: false,
    pendingApplicationCount: 0,
    totalScore: 160,
    averageScore: 80,
    allMembersActive: true
  }
];

// Mock Dormitory Members
export const mockDormitoryMembers: DormitoryMember[] = [
  {
    id: '1',
    role: 'leader',
    score: 92,
    joinedAt: '2024-01-10T00:00:00Z',
    status: 'active',
    bedNumber: 1,
    user: mockUsers[1],
    dormitory: mockDormitories[0],
    isLeader: true,
    isActive: true,
    scoreRecordCount: 5,
    atKickRisk: false
  },
  {
    id: '2',
    role: 'member',
    score: 85,
    joinedAt: '2024-01-11T00:00:00Z',
    status: 'active',
    bedNumber: 2,
    user: mockUsers[2],
    dormitory: mockDormitories[0],
    isLeader: false,
    isActive: true,
    scoreRecordCount: 3,
    atKickRisk: false
  },
  {
    id: '3',
    role: 'member',
    score: 78,
    joinedAt: '2024-01-12T00:00:00Z',
    status: 'active',
    bedNumber: 3,
    user: mockUsers[4],
    dormitory: mockDormitories[0],
    isLeader: false,
    isActive: true,
    scoreRecordCount: 4,
    atKickRisk: false
  }
];

// Mock Applications
export const mockApplications: DormitoryApplication[] = [
  {
    id: '1',
    status: 'pending',
    message: '希望能够加入这个宿舍，我是一个爱干净、作息规律的学生。',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    applicant: mockUsers[3],
    dormitory: mockDormitories[0]
  },
  {
    id: '2',
    status: 'leader_approved',
    message: '我想申请加入这个宿舍，可以和室友们一起学习进步。',
    leaderComment: '申请人表现良好，同意加入。',
    createdAt: '2024-01-14T00:00:00Z',
    updatedAt: '2024-01-16T00:00:00Z',
    applicant: mockUsers[3],
    dormitory: mockDormitories[2],
    leaderApprover: mockUsers[1]
  }
];

// Mock Score Records
export const mockScoreRecords: ScoreRecord[] = [
  {
    id: '1',
    points: 10,
    reason: '宿舍卫生检查优秀',
    category: 'hygiene',
    createdAt: '2024-01-20T00:00:00Z',
    member: mockDormitoryMembers[0],
    recorder: mockUsers[1]
  },
  {
    id: '2',
    points: -5,
    reason: '晚归违规',
    category: 'discipline',
    createdAt: '2024-01-21T00:00:00Z',
    member: mockDormitoryMembers[1],
    recorder: mockUsers[1]
  },
  {
    id: '3',
    points: 15,
    reason: '参加宿舍文化节活动',
    category: 'activity',
    createdAt: '2024-01-22T00:00:00Z',
    member: mockDormitoryMembers[2],
    recorder: mockUsers[1]
  }
];

// Mock Kick Requests
export const mockKickRequests: KickRequest[] = [
  {
    id: '1',
    reason: '经常深夜聚会，影响室友休息，多次提醒无效。',
    status: 'pending',
    createdAt: '2024-01-25T00:00:00Z',
    targetMember: mockDormitoryMembers[2],
    requester: mockUsers[1]
  }
];

// Current user simulation (can be changed for testing different roles)
export const getCurrentUser = (): User => {
  // Change this to test different user roles
  // return mockUsers[0]; // Admin
  return mockUsers[1]; // Student (Dormitory Leader)
  // return mockUsers[3]; // Student (No Dormitory)
};

// Utility functions for mock data
export const getDormitoryById = (id: string): Dormitory | undefined => {
  return mockDormitories.find(d => d.id === id);
};

export const getUserById = (id: string): User | undefined => {
  return mockUsers.find(u => u.id === id);
};

export const getMembersByDormitoryId = (dormitoryId: string): DormitoryMember[] => {
  return mockDormitoryMembers.filter(m => m.dormitory.id === dormitoryId);
};

export const getApplicationsByUserId = (userId: string): DormitoryApplication[] => {
  return mockApplications.filter(a => a.applicant.id === userId);
};

export const getApplicationsByDormitoryId = (dormitoryId: string): DormitoryApplication[] => {
  return mockApplications.filter(a => a.dormitory.id === dormitoryId);
};

export const getScoreRecordsByMemberId = (memberId: string): ScoreRecord[] => {
  return mockScoreRecords.filter(s => s.member.id === memberId);
};