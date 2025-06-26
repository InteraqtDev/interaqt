import { atom, RenderContext, Fragment } from 'axii';
import { Button, Input } from 'axii-ui';
import { styleSystem as s } from 'axii-ui-theme-inc';
import { User, DormitoryMember, ScoreRecord, KickRequest } from '../types';
import { interactionSDK } from '../utils/interactionSDK';

// Simple Card component
function Card({ children, style }: { children: any, style?: any }, { createElement }: RenderContext) {
  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: '1px solid #e0e0e0',
      ...style
    }}>
      {children}
    </div>
  );
}

// Simple Modal component
function Modal({ visible, onClose, children }: { visible: boolean, onClose: () => void, children: any }, { createElement }: RenderContext) {
  if (!visible) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90%',
        overflow: 'auto'
      }}>
        {children}
      </div>
    </div>
  );
}

// Simple Table component
function Table({ columns, dataSource }: { columns: any[], dataSource: any[] }, { createElement }: RenderContext) {
  return (
    <div style={{
      border: '1px solid #d9d9d9',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#fafafa' }}>
            {columns.map((col, index) => (
              <th key={index} style={{
                padding: '12px 16px',
                textAlign: 'left',
                borderBottom: '1px solid #d9d9d9',
                fontWeight: 'bold',
                color: s.colors.text.normal()
              }}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataSource.map((row, rowIndex) => (
            <tr key={rowIndex} style={{
              borderBottom: rowIndex < dataSource.length - 1 ? '1px solid #f0f0f0' : 'none'
            }}>
              {columns.map((col, colIndex) => (
                <td key={colIndex} style={{
                  padding: '12px 16px',
                  color: s.colors.text.normal()
                }}>
                  {col.render ? col.render('', row, rowIndex) : row[col.dataIndex || col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MemberManagement({}, { createElement }: RenderContext) {
  const currentUser = atom<User | null>(null);
  const members = atom<DormitoryMember[]>([]);
  const userMembership = atom<DormitoryMember | null>(null);
  const kickRequests = atom<KickRequest[]>([]);
  const loading = atom(true);
  const error = atom<string | null>(null);
  
  const showKickModal = atom(false);
  const showMemberDetailModal = atom(false);
  const selectedMember = atom<DormitoryMember | null>(null);
  const memberScoreRecords = atom<ScoreRecord[]>([]);
  const kickReason = atom('');
  const submitting = atom(false);

  // Load data function
  const loadData = async () => {
    try {
      loading(true);
      error(null);

      // Load current user info
      const user = await interactionSDK.getCurrentUser();
      currentUser(user);

      if (user) {
        // Load all data in parallel
        const [membersData, membershipData, kickRequestsData] = await Promise.all([
          interactionSDK.getAllDormitoryMembers(),
          interactionSDK.getUserMembership(),
          interactionSDK.getAllKickRequests()
        ]);

        members(membersData);
        userMembership(membershipData);
        kickRequests(kickRequestsData);
      }

    } catch (err) {
      console.error('Failed to load member management data:', err);
      error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      loading(false);
    }
  };

  // Load data on component mount
  loadData();

  // Get members based on user role
  const getMembers = () => {
    const user = currentUser();
    const membership = userMembership();
    const allMembers = members().filter(m => m.status === 'active');
    
    if (user?.role === 'student' && membership?.role === 'leader') {
      // 宿舍长只能看到自己宿舍的成员
      return allMembers.filter(m => m.dormitory.id === membership.dormitory.id);
    } else if (user?.role === 'student') {
      // 普通学生不能访问成员管理
      return [];
    }
    
    return allMembers;
  };

  const handleKickMember = (member: DormitoryMember) => {
    selectedMember(member);
    kickReason('');
    showKickModal(true);
  };

  const handleViewMemberDetail = async (member: DormitoryMember) => {
    try {
      selectedMember(member);
      // Load member's score records
      const records = await interactionSDK.getMemberScoreRecords(member.id);
      memberScoreRecords(records);
      showMemberDetailModal(true);
    } catch (err) {
      console.error('Failed to load member details:', err);
      alert('加载成员详情失败');
    }
  };

  const handleSubmitKickRequest = async () => {
    try {
      submitting(true);
      const member = selectedMember();
      const reason = kickReason();
      
      if (!member || !reason.trim()) {
        alert('请填写踢出理由');
        return;
      }

      await interactionSDK.requestKickMember(member.id, reason);
      
      showKickModal(false);
      kickReason('');
      selectedMember(null);
      
      // Reload data to show new kick request
      await loadData();
      
    } catch (err) {
      console.error('Failed to submit kick request:', err);
      alert('提交踢出申请失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      submitting(false);
    }
  };

  const handleProcessKickRequest = async (kickRequest: KickRequest, action: 'approve' | 'reject') => {
    try {
      submitting(true);
      
      if (action === 'approve') {
        await interactionSDK.approveKickRequest(kickRequest.id, '同意踢出申请');
      } else {
        await interactionSDK.rejectKickRequest(kickRequest.id, '拒绝踢出申请');
      }
      
      // Reload data to show updated kick request
      await loadData();
      
    } catch (err) {
      console.error('Failed to process kick request:', err);
      alert('处理踢出申请失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      submitting(false);
    }
  };

  const canKickMember = (member: DormitoryMember) => {
    const user = currentUser();
    const membership = userMembership();
    
    // 不能踢出自己
    if (member.user.id === user?.id) return false;
    
    // 管理员可以踢出任何人
    if (user?.role === 'admin') return true;
    
    // 宿舍长可以踢出本宿舍的普通成员
    if (user?.role === 'student' && membership?.role === 'leader') {
      return member.dormitory.id === membership.dormitory.id && member.role !== 'leader';
    }
    
    return false;
  };

  const getPendingKickRequests = () => {
    return kickRequests().filter(kr => kr.status === 'pending');
  };

  const getCategoryText = (category: string) => {
    switch (category) {
      case 'hygiene': return '卫生';
      case 'discipline': return '纪律';
      case 'activity': return '活动';
      case 'other': return '其他';
      default: return category;
    }
  };

  // Table columns
  const memberColumns = [
    {
      title: '姓名',
      key: 'name',
      render: (_, member) => member.user.name
    },
    {
      title: '学号',
      key: 'studentId',
      render: (_, member) => member.user.studentId
    },
    {
      title: '宿舍',
      key: 'dormitory',
      render: (_, member) => member.dormitory.name
    },
    {
      title: '角色',
      key: 'role',
      render: (_, member) => (
        <div style={{
          padding: '4px 8px',
          fontSize: '12px',
          borderRadius: '4px',
          backgroundColor: member.role === 'leader' ? '#e6f7ff' : '#f6ffed',
          color: member.role === 'leader' ? s.colors.text.info() : s.colors.text.success(),
          display: 'inline-block'
        }}>
          {member.role === 'leader' ? '宿舍长' : '成员'}
        </div>
      )
    },
    {
      title: '床位号',
      dataIndex: 'bedNumber',
      key: 'bedNumber'
    },
    {
      title: '积分',
      key: 'score',
      render: (_, member) => (
        <span style={{
          color: member.score >= 0 ? s.colors.text.success() : s.colors.text.danger(),
          fontWeight: 'bold'
        }}>
          {member.score}
        </span>
      )
    },
    {
      title: '状态',
      key: 'status',
      render: (_, member) => {
        const atRisk = member.score < -50;
        return (
          <div style={{
            padding: '4px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            backgroundColor: atRisk ? '#fff2f0' : '#f6ffed',
            color: atRisk ? s.colors.text.danger() : s.colors.text.success(),
            display: 'inline-block'
          }}>
            {atRisk ? '踢出风险' : '正常'}
          </div>
        );
      }
    },
    {
      title: '入住时间',
      key: 'joinedAt',
      render: (_, member) => new Date(member.joinedAt).toLocaleDateString()
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, member) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button 
            onClick={() => handleViewMemberDetail(member)}
            style={{ fontSize: '12px' }}
          >
            详情
          </Button>
          {canKickMember(member) && (
            <Button 
              onClick={() => handleKickMember(member)}
              style={{ fontSize: '12px', backgroundColor: '#ff4d4f', color: 'white', border: 'none' }}
            >
              踢出
            </Button>
          )}
        </div>
      )
    }
  ];

  const kickRequestColumns = [
    {
      title: '申请时间',
      key: 'createdAt',
      render: (_, request) => new Date(request.createdAt).toLocaleString()
    },
    {
      title: '目标成员',
      key: 'targetMember',
      render: (_, request) => `${request.targetMember.user.name} (${request.targetMember.user.studentId})`
    },
    {
      title: '申请人',
      key: 'requester',
      render: (_, request) => request.requester.name
    },
    {
      title: '理由',
      dataIndex: 'reason',
      key: 'reason'
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, request) => {
        const user = currentUser();
        return user?.role === 'admin' ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button 
              onClick={() => handleProcessKickRequest(request, 'approve')}
              style={{ fontSize: '12px', backgroundColor: '#52c41a', color: 'white', border: 'none' }}
              disabled={submitting()}
            >
              批准
            </Button>
            <Button 
              onClick={() => handleProcessKickRequest(request, 'reject')}
              style={{ fontSize: '12px', backgroundColor: '#ff4d4f', color: 'white', border: 'none' }}
              disabled={submitting()}
            >
              拒绝
            </Button>
          </div>
        ) : (
          <span style={{ color: s.colors.text.normal(false, 'description') }}>等待管理员处理</span>
        );
      }
    }
  ];

  const renderContent = () => {
    if (loading()) {
      return (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '400px',
          color: s.colors.text.normal() 
        }}>
          加载中...
        </div>
      );
    }

    if (error()) {
      return (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '400px',
          gap: '16px'
        }}>
          <div style={{ color: s.colors.text.danger() }}>
            加载数据失败: {error()}
          </div>
          <Button onClick={loadData}>
            重试
          </Button>
        </div>
      );
    }

    const user = currentUser();
    const membership = userMembership();
    
    if (!user) {
      return (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: s.colors.text.normal()
        }}>
          <h3>未找到用户信息</h3>
          <p style={{ color: s.colors.text.normal(false, 'description') }}>
            请确保 URL 中包含有效的 userId 参数
          </p>
        </div>
      );
    }

    if (user.role === 'student' && (!membership || membership.role !== 'leader')) {
      return (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: s.colors.text.normal()
        }}>
          <h3>权限不足</h3>
          <p style={{ color: s.colors.text.normal(false, 'description') }}>
            只有宿舍长和管理员可以管理成员
          </p>
        </div>
      );
    }

    const membersList = getMembers();
    const pendingKickRequests = getPendingKickRequests();

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header */}
        <Card style={{ padding: '20px' }}>
          <div>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: '0 0 8px 0'
            }}>
              成员管理
            </h3>
            <p style={{ color: s.colors.text.normal(false, 'description'), margin: 0 }}>
              {user.role === 'admin' ? '管理所有宿舍成员' : '管理本宿舍成员'}
            </p>
          </div>
        </Card>

        {/* Statistics */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, 1fr)', 
          gap: '16px' 
        }}>
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>总成员数</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.success() }}>
                {membersList.length}
              </div>
            </div>
          </Card>
          
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>宿舍长数</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.info() }}>
                {membersList.filter(m => m.role === 'leader').length}
              </div>
            </div>
          </Card>
          
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>踢出风险</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.danger() }}>
                {membersList.filter(m => m.score < -50).length}
              </div>
            </div>
          </Card>
          
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>平均积分</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.warning() }}>
                {membersList.length > 0 ? 
                  Math.round(membersList.reduce((sum, m) => sum + m.score, 0) / membersList.length) : 0}
              </div>
            </div>
          </Card>
        </div>

        {/* Members List */}
        <Card style={{ padding: '20px' }}>
          <h4 style={{ 
            fontSize: s.sizes.fontSize.heading(4),
            color: s.colors.text.normal(),
            margin: '0 0 16px 0'
          }}>
            成员列表
          </h4>
          <Table 
            dataSource={membersList}
            columns={memberColumns}
          />
        </Card>

        {/* Kick Requests (Admin only) */}
        {user.role === 'admin' && pendingKickRequests.length > 0 && (
          <Card style={{ padding: '20px' }}>
            <h4 style={{ 
              fontSize: s.sizes.fontSize.heading(4),
              color: s.colors.text.normal(),
              margin: '0 0 16px 0'
            }}>
              待处理踢出申请
            </h4>
            <Table 
              dataSource={pendingKickRequests}
              columns={kickRequestColumns}
            />
          </Card>
        )}

        {/* Kick Member Modal */}
        <Modal 
          visible={showKickModal()} 
          onClose={() => showKickModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: 0
            }}>
              申请踢出成员
            </h3>
            
            {selectedMember() && (
              <div style={{
                padding: '12px',
                backgroundColor: '#fff2f0',
                borderRadius: '6px',
                border: '1px solid #ffccc7'
              }}>
                <div style={{ color: s.colors.text.normal() }}>
                  成员: {selectedMember()?.user.name} ({selectedMember()?.user.studentId})
                </div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>
                  宿舍: {selectedMember()?.dormitory.name}
                </div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>
                  当前积分: {selectedMember()?.score}
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: s.colors.text.normal() }}>踢出理由</label>
              <Input
                value={kickReason()}
                onChange={(value) => kickReason(value)}
                placeholder="请详细说明踢出该成员的理由..."
                style={{ minHeight: '80px' }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button onClick={() => showKickModal(false)}>
                取消
              </Button>
              <Button 
                onClick={handleSubmitKickRequest}
                style={{ backgroundColor: '#ff4d4f', color: 'white', border: 'none' }}
                disabled={submitting() || !kickReason().trim()}
              >
                {submitting() ? '提交中...' : '提交申请'}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Member Detail Modal */}
        <Modal 
          visible={showMemberDetailModal()} 
          onClose={() => showMemberDetailModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: 0
            }}>
              成员详细信息
            </h3>
            
            {selectedMember() && (
              <div>
                {/* Basic Info */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(2, 1fr)', 
                  gap: '16px',
                  marginBottom: '20px'
                }}>
                  <div>
                    <div style={{ color: s.colors.text.normal(false, 'description') }}>姓名</div>
                    <div style={{ color: s.colors.text.normal() }}>{selectedMember()?.user.name}</div>
                  </div>
                  <div>
                    <div style={{ color: s.colors.text.normal(false, 'description') }}>学号</div>
                    <div style={{ color: s.colors.text.normal() }}>{selectedMember()?.user.studentId}</div>
                  </div>
                  <div>
                    <div style={{ color: s.colors.text.normal(false, 'description') }}>宿舍</div>
                    <div style={{ color: s.colors.text.normal() }}>{selectedMember()?.dormitory.name}</div>
                  </div>
                  <div>
                    <div style={{ color: s.colors.text.normal(false, 'description') }}>床位号</div>
                    <div style={{ color: s.colors.text.normal() }}>{selectedMember()?.bedNumber}号床</div>
                  </div>
                  <div>
                    <div style={{ color: s.colors.text.normal(false, 'description') }}>角色</div>
                    <div style={{ color: s.colors.text.normal() }}>
                      {selectedMember()?.role === 'leader' ? '宿舍长' : '成员'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: s.colors.text.normal(false, 'description') }}>入住时间</div>
                    <div style={{ color: s.colors.text.normal() }}>
                      {selectedMember() ? new Date(selectedMember()!.joinedAt).toLocaleDateString() : ''}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: s.colors.text.normal(false, 'description') }}>当前积分</div>
                    <div style={{ 
                      fontSize: '20px', 
                      fontWeight: 'bold',
                      color: (selectedMember()?.score || 0) >= 0 ? s.colors.text.success() : s.colors.text.danger()
                    }}>
                      {selectedMember()?.score}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: s.colors.text.normal(false, 'description') }}>状态</div>
                    <div style={{ color: s.colors.text.normal() }}>
                      {(selectedMember()?.score || 0) < -50 ? '⚠️ 踢出风险' : '✅ 正常'}
                    </div>
                  </div>
                </div>

                {/* Score Records */}
                <div>
                  <h4 style={{ 
                    fontSize: s.sizes.fontSize.heading(4),
                    color: s.colors.text.normal(),
                    margin: '0 0 12px 0'
                  }}>
                    积分记录
                  </h4>
                  <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                    {memberScoreRecords().length > 0 ? (
                      memberScoreRecords().map((record, index) => (
                        <div key={index} style={{
                          padding: '8px',
                          border: '1px solid #f0f0f0',
                          borderRadius: '4px',
                          marginBottom: '8px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{
                              color: record.points >= 0 ? s.colors.text.success() : s.colors.text.danger(),
                              fontWeight: 'bold'
                            }}>
                              {record.points > 0 ? '+' : ''}{record.points} 分
                            </span>
                            <span style={{ color: s.colors.text.normal(false, 'description'), fontSize: '12px' }}>
                              {new Date(record.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div style={{ color: s.colors.text.normal(), fontSize: '14px' }}>
                            {record.reason}
                          </div>
                          <div style={{ color: s.colors.text.normal(false, 'description'), fontSize: '12px' }}>
                            类别: {getCategoryText(record.category)} | 记录者: {record.recorder.name}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '20px', 
                        color: s.colors.text.normal(false, 'description') 
                      }}>
                        暂无积分记录
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={() => showMemberDetailModal(false)}>
                关闭
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  };

  return renderContent;
}