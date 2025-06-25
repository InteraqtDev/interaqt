/**
 * Interaction SDK for Dormitory Management System
 * 
 * 提供统一的调用后端 interaction 的接口
 * 支持通过 URL query 参数进行用户身份模拟
 */

export interface InteractionRequest {
  interaction: string;
  payload?: any;
  query?: any;
}

export interface InteractionResponse<T = any> {
  data?: T;
  result?: any;
  error?: string;
  statusCode?: number;
}

export interface APIConfig {
  baseUrl?: string;
  userId?: string;
  onError?: (error: Error) => void;
}

class InteractionSDK {
  private baseUrl: string;
  private currentUserId: string | null = null;

  constructor(config: APIConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:3000';
    
    // 从 URL query 参数中获取 userId
    const urlParams = new URLSearchParams(window.location.search);
    const urlUserId = urlParams.get('userId');
    
    this.currentUserId = config.userId || urlUserId || null;
    
    if (this.currentUserId) {
      console.log(`🔧 Using mock user ID: ${this.currentUserId}`);
    } else {
      console.warn('⚠️  No user ID provided. Add ?userId=xxx to URL or call setUserId()');
    }
  }

  /**
   * 设置当前用户ID（用于测试）
   */
  setUserId(userId: string) {
    this.currentUserId = userId;
    console.log(`🔧 User ID set to: ${userId}`);
  }

  /**
   * 获取当前用户ID
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * 调用 Interaction
   */
  async callInteraction<T = any>(request: InteractionRequest): Promise<InteractionResponse<T>> {
    if (!this.currentUserId) {
      throw new Error('No user ID set. Please call setUserId() or add ?userId=xxx to URL');
    }

    try {
      const response = await fetch(`${this.baseUrl}/interaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentUserId}`
        },
        body: JSON.stringify(request)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      return result;
    } catch (error) {
      console.error('Interaction call failed:', error);
      throw error;
    }
  }

  /**
   * 获取数据的便捷方法
   */
  async getData<T = any>(entityName: string, query?: any): Promise<T[]> {
    const response = await this.callInteraction<T[]>({
      interaction: `Get${entityName}`,
      query
    });
    
    return response.data || [];
  }

  // ============== 管理员操作 ==============

  /**
   * 创建宿舍
   */
  async createDormitory(dormitoryData: {
    name: string;
    building: string;
    roomNumber: string;
    capacity: number;
    description: string;
  }) {
    return this.callInteraction({
      interaction: 'CreateDormitory',
      payload: dormitoryData
    });
  }

  /**
   * 指定宿舍长
   */
  async assignDormitoryLeader(dormitoryId: string, userId: string) {
    return this.callInteraction({
      interaction: 'AssignDormitoryLeader',
      payload: { dormitoryId, userId }
    });
  }

  /**
   * 直接分配成员到宿舍
   */
  async assignMemberToDormitory(dormitoryId: string, userId: string, bedNumber: string) {
    return this.callInteraction({
      interaction: 'AssignMemberToDormitory',
      payload: { dormitoryId, userId, bedNumber }
    });
  }

  /**
   * 管理员批准申请
   */
  async adminApproveApplication(applicationId: string, adminComment: string, bedNumber: string) {
    return this.callInteraction({
      interaction: 'AdminApproveApplication',
      payload: { applicationId, adminComment, bedNumber }
    });
  }

  /**
   * 管理员拒绝申请
   */
  async adminRejectApplication(applicationId: string, adminComment: string) {
    return this.callInteraction({
      interaction: 'AdminRejectApplication',
      payload: { applicationId, adminComment }
    });
  }

  /**
   * 批准踢出申请
   */
  async approveKickRequest(kickRequestId: string, adminComment: string) {
    return this.callInteraction({
      interaction: 'ApproveKickRequest',
      payload: { kickRequestId, adminComment }
    });
  }

  /**
   * 拒绝踢出申请
   */
  async rejectKickRequest(kickRequestId: string, adminComment: string) {
    return this.callInteraction({
      interaction: 'RejectKickRequest',
      payload: { kickRequestId, adminComment }
    });
  }

  // ============== 宿舍长操作 ==============

  /**
   * 宿舍长批准申请
   */
  async leaderApproveApplication(applicationId: string, leaderComment: string) {
    return this.callInteraction({
      interaction: 'LeaderApproveApplication',
      payload: { applicationId, leaderComment }
    });
  }

  /**
   * 宿舍长拒绝申请
   */
  async leaderRejectApplication(applicationId: string, leaderComment: string) {
    return this.callInteraction({
      interaction: 'LeaderRejectApplication',
      payload: { applicationId, leaderComment }
    });
  }

  /**
   * 记录积分
   */
  async recordScore(memberId: string, points: number, reason: string, category: string) {
    return this.callInteraction({
      interaction: 'RecordScore',
      payload: { memberId, points, reason, category }
    });
  }

  /**
   * 申请踢出成员
   */
  async requestKickMember(memberId: string, reason: string) {
    return this.callInteraction({
      interaction: 'RequestKickMember',
      payload: { memberId, reason }
    });
  }

  // ============== 学生操作 ==============

  /**
   * 申请加入宿舍
   */
  async applyForDormitory(dormitoryId: string, message: string) {
    return this.callInteraction({
      interaction: 'ApplyForDormitory',
      payload: { dormitoryId, message }
    });
  }

  /**
   * 取消申请
   */
  async cancelApplication(applicationId: string) {
    return this.callInteraction({
      interaction: 'CancelApplication',
      payload: { applicationId }
    });
  }

  // ============== 查询操作 ==============

  /**
   * 获取宿舍列表
   */
  async getDormitories(query?: any) {
    return this.getData('Dormitories', query);
  }

  /**
   * 获取用户列表
   */
  async getUsers(query?: any) {
    return this.getData('Users', query);
  }

  /**
   * 获取宿舍成员
   */
  async getDormitoryMembers(query?: any) {
    return this.getData('DormitoryMembers', query);
  }

  /**
   * 获取申请列表
   */
  async getApplications(query?: any) {
    return this.getData('Applications', query);
  }

  /**
   * 获取积分记录
   */
  async getScoreRecords(query?: any) {
    return this.getData('ScoreRecords', query);
  }

  /**
   * 获取踢出申请
   */
  async getKickRequests(query?: any) {
    return this.getData('KickRequests', query);
  }

  // ============== 高级查询方法 ==============

  /**
   * 获取当前用户信息
   */
  async getCurrentUser() {
    if (!this.currentUserId) return null;
    
    const users = await this.getUsers({
      where: { id: this.currentUserId }
    });
    
    return users.length > 0 ? users[0] : null;
  }

  /**
   * 获取用户的宿舍成员身份
   */
  async getUserMembership(userId?: string) {
    const targetUserId = userId || this.currentUserId;
    if (!targetUserId) return null;

    const memberships = await this.getDormitoryMembers({
      where: { 
        'user.id': targetUserId,
        status: 'active'
      }
    });

    return memberships.length > 0 ? memberships[0] : null;
  }

  /**
   * 获取用户的申请记录
   */
  async getUserApplications(userId?: string) {
    const targetUserId = userId || this.currentUserId;
    if (!targetUserId) return [];

    return this.getApplications({
      where: { 'applicant.id': targetUserId },
      orderBy: [['createdAt', 'desc']]
    });
  }

  /**
   * 获取宿舍的成员列表
   */
  async getDormitoryMembersByDormitoryId(dormitoryId: string) {
    return this.getDormitoryMembers({
      where: { 
        'dormitory.id': dormitoryId,
        status: 'active'
      }
    });
  }

  /**
   * 获取宿舍的申请列表
   */
  async getDormitoryApplications(dormitoryId: string) {
    return this.getApplications({
      where: { 'dormitory.id': dormitoryId },
      orderBy: [['createdAt', 'desc']]
    });
  }

  /**
   * 获取成员的积分记录
   */
  async getMemberScoreRecords(memberId: string) {
    return this.getScoreRecords({
      where: { 'member.id': memberId },
      orderBy: [['createdAt', 'desc']]
    });
  }

  // ============== 工具方法 ==============

  /**
   * 健康检测
   */
  async ping() {
    try {
      const response = await fetch(`${this.baseUrl}/ping`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 设置基础 URL
   */
  setBaseUrl(url: string) {
    this.baseUrl = url;
  }
}

// 创建单例实例
export const interactionSDK = new InteractionSDK();

// 导出类以支持创建多个实例
export { InteractionSDK };

// 导出常用方法的快捷访问
export const {
  setUserId,
  getCurrentUserId,
  callInteraction,
  getCurrentUser,
  getDormitories,
  getUsers,
  getDormitoryMembers,
  getApplications,
  getScoreRecords,
  getKickRequests,
  createDormitory,
  assignDormitoryLeader,
  assignMemberToDormitory,
  adminApproveApplication,
  adminRejectApplication,
  leaderApproveApplication,
  leaderRejectApplication,
  recordScore,
  requestKickMember,
  applyForDormitory,
  cancelApplication,
  ping
} = interactionSDK;