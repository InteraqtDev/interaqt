import { atom, RenderContext, Fragment } from 'axii';
import { Button, Input } from 'axii-ui';
import { styleSystem as s } from 'axii-ui-theme-inc';
import { 
  getCurrentUser, 
  mockDormitoryMembers,
  mockKickRequests,
  mockScoreRecords,
  getScoreRecordsByMemberId
} from '../utils/mockData';

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
  const currentUser = getCurrentUser();
  const showKickModal = atom(false);
  const showMemberDetailModal = atom(false);
  const selectedMember = atom<any>(null);
  const kickReason = atom('');

  // Get members based on user role
  const getMembers = () => {
    let members = mockDormitoryMembers.filter(m => m.status === 'active');
    
    if (currentUser.role === 'student') {
      // 宿舍长只能看到自己宿舍的成员
      const userMembership = mockDormitoryMembers.find(m => 
        m.user.id === currentUser.id && m.role === 'leader' && m.status === 'active'
      );
      if (userMembership) {
        members = members.filter(m => m.dormitory.id === userMembership.dormitory.id);
      } else {
        members = [];
      }
    }
    
    return members;
  };

  const handleKickMember = (member: any) => {
    selectedMember(member);
    showKickModal(true);
  };

  const handleViewMemberDetail = (member: any) => {
    selectedMember(member);
    showMemberDetailModal(true);
  };

  const handleSubmitKickRequest = () => {
    const member = selectedMember();
    const reason = kickReason();
    
    console.log('Submitting kick request:', {
      memberId: member.id,
      reason,
      requester: currentUser.id
    });

    // Here would integrate with RequestKickMember interaction
    
    showKickModal(false);
    kickReason('');
    selectedMember(null);
  };

  const handleProcessKickRequest = (kickRequest: any, action: 'approve' | 'reject') => {
    console.log('Processing kick request:', {
      kickRequestId: kickRequest.id,
      action,
      processor: currentUser.id
    });

    // Here would integrate with ApproveKickRequest / RejectKickRequest interactions
  };

  const canKickMember = (member: any) => {
    // 宿舍长可以踢出普通成员，管理员可以踢出任何人，但不能踢出自己
    if (member.user.id === currentUser.id) return false;
    
    if (currentUser.role === 'admin') return true;
    
    if (currentUser.role === 'student') {
      const userMembership = mockDormitoryMembers.find(m => 
        m.user.id === currentUser.id && m.role === 'leader' && m.status === 'active'
      );
      return userMembership && 
             member.dormitory.id === userMembership.dormitory.id && 
             member.role !== 'leader';
    }
    
    return false;
  };

  const getMemberScoreRecords = (memberId: string) => {
    return getScoreRecordsByMemberId(memberId);
  };

  const getPendingKickRequests = () => {
    return mockKickRequests.filter(kr => kr.status === 'pending');
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
      render: (_, request) => currentUser.role === 'admin' ? (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button 
            onClick={() => handleProcessKickRequest(request, 'approve')}
            style={{ fontSize: '12px', backgroundColor: '#52c41a', color: 'white', border: 'none' }}
          >
            批准
          </Button>
          <Button 
            onClick={() => handleProcessKickRequest(request, 'reject')}
            style={{ fontSize: '12px', backgroundColor: '#ff4d4f', color: 'white', border: 'none' }}
          >
            拒绝
          </Button>
        </div>
      ) : (
        <span style={{ color: s.colors.text.normal(false, 'description') }}>等待管理员处理</span>
      )
    }
  ];

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
            {currentUser.role === 'admin' ? '管理所有宿舍成员' : '管理本宿舍成员'}
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
              {getMembers().length}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>宿舍长数</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.info() }}>
              {getMembers().filter(m => m.role === 'leader').length}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>踢出风险</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.danger() }}>
              {getMembers().filter(m => m.score < -50).length}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>平均积分</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.warning() }}>
              {getMembers().length > 0 ? 
                Math.round(getMembers().reduce((sum, m) => sum + m.score, 0) / getMembers().length) : 0}
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
          dataSource={getMembers()}
          columns={memberColumns}
        />
      </Card>

      {/* Kick Requests (Admin only) */}
      {currentUser.role === 'admin' && getPendingKickRequests().length > 0 && (
        <Card style={{ padding: '20px' }}>
          <h4 style={{ 
            fontSize: s.sizes.fontSize.heading(4),
            color: s.colors.text.normal(),
            margin: '0 0 16px 0'
          }}>
            待处理踢出申请
          </h4>
          <Table 
            dataSource={getPendingKickRequests()}
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
                成员: {selectedMember().user.name} ({selectedMember().user.studentId})
              </div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>
                宿舍: {selectedMember().dormitory.name}
              </div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>
                当前积分: {selectedMember().score}
              </div>
            </div>
          )}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ color: s.colors.text.normal() }}>踢出理由</label>
            <Input
              value={kickReason}
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
              disabled={!kickReason().trim()}
            >
              提交申请
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
                  <div style={{ color: s.colors.text.normal() }}>{selectedMember().user.name}</div>
                </div>
                <div>
                  <div style={{ color: s.colors.text.normal(false, 'description') }}>学号</div>
                  <div style={{ color: s.colors.text.normal() }}>{selectedMember().user.studentId}</div>
                </div>
                <div>
                  <div style={{ color: s.colors.text.normal(false, 'description') }}>宿舍</div>
                  <div style={{ color: s.colors.text.normal() }}>{selectedMember().dormitory.name}</div>
                </div>
                <div>
                  <div style={{ color: s.colors.text.normal(false, 'description') }}>床位号</div>
                  <div style={{ color: s.colors.text.normal() }}>{selectedMember().bedNumber}号床</div>
                </div>
                <div>
                  <div style={{ color: s.colors.text.normal(false, 'description') }}>角色</div>
                  <div style={{ color: s.colors.text.normal() }}>
                    {selectedMember().role === 'leader' ? '宿舍长' : '成员'}
                  </div>
                </div>
                <div>
                  <div style={{ color: s.colors.text.normal(false, 'description') }}>入住时间</div>
                  <div style={{ color: s.colors.text.normal() }}>
                    {new Date(selectedMember().joinedAt).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: s.colors.text.normal(false, 'description') }}>当前积分</div>
                  <div style={{ 
                    fontSize: '20px', 
                    fontWeight: 'bold',
                    color: selectedMember().score >= 0 ? s.colors.text.success() : s.colors.text.danger()
                  }}>
                    {selectedMember().score}
                  </div>
                </div>
                <div>
                  <div style={{ color: s.colors.text.normal(false, 'description') }}>状态</div>
                  <div style={{ color: s.colors.text.normal() }}>
                    {selectedMember().score < -50 ? '⚠️ 踢出风险' : '✅ 正常'}
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
                  {getMemberScoreRecords(selectedMember().id).length > 0 ? (
                    getMemberScoreRecords(selectedMember().id).map((record, index) => (
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
                          类别: {record.category} | 记录者: {record.recorder.name}
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
}