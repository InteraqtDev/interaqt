import { atom, RenderContext, Fragment } from 'axii';
import { Button, Input, Select } from 'axii-ui';
import { styleSystem as s } from 'axii-ui-theme-inc';
import { RecordScoreForm } from '../types';
import { 
  getCurrentUser, 
  mockDormitoryMembers,
  mockScoreRecords,
  getScoreRecordsByMemberId,
  getMembersByDormitoryId
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

// Simple Tabs component
function Tabs({ activeKey, onChange, items }: { activeKey: string, onChange: (key: string) => void, items: any[] }, { createElement }: RenderContext) {
  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid #d9d9d9' }}>
        {items.map(item => (
          <div
            key={item.key}
            onClick={() => onChange(item.key)}
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              borderBottom: activeKey === item.key ? '2px solid #1890ff' : '2px solid transparent',
              color: activeKey === item.key ? '#1890ff' : s.colors.text.normal(),
              fontWeight: activeKey === item.key ? 'bold' : 'normal'
            }}
          >
            {item.label}
          </div>
        ))}
      </div>
      <div style={{ padding: '16px 0' }}>
        {items.find(item => item.key === activeKey)?.children}
      </div>
    </div>
  );
}

export function ScoreManagement({}, { createElement }: RenderContext) {
  const currentUser = getCurrentUser();
  const activeTab = atom('overview');
  const showRecordModal = atom(false);
  
  // Form state
  const scoreForm = atom<RecordScoreForm>({
    memberId: '',
    points: 0,
    reason: '',
    category: 'other'
  });

  // Get current user's dormitory members (for dormitory leaders)
  const getCurrentUserDormitoryMembers = () => {
    if (currentUser.role === 'student') {
      const userMembership = mockDormitoryMembers.find(m => 
        m.user.id === currentUser.id && m.role === 'leader' && m.status === 'active'
      );
      if (userMembership) {
        return getMembersByDormitoryId(userMembership.dormitory.id);
      }
    }
    return [];
  };

  // Get all score records for the user's dormitory
  const getDormitoryScoreRecords = () => {
    const members = getCurrentUserDormitoryMembers();
    const memberIds = members.map(m => m.id);
    return mockScoreRecords.filter(record => 
      memberIds.includes(record.member.id)
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  // Calculate statistics
  const getStatistics = () => {
    const members = getCurrentUserDormitoryMembers();
    const records = getDormitoryScoreRecords();
    
    return {
      totalMembers: members.length,
      totalRecords: records.length,
      averageScore: members.length > 0 ? 
        Math.round(members.reduce((sum, m) => sum + m.score, 0) / members.length) : 0,
      atRiskMembers: members.filter(m => m.score < -50).length,
      recentRecords: records.slice(0, 10),
      categoryStats: {
        hygiene: records.filter(r => r.category === 'hygiene').length,
        discipline: records.filter(r => r.category === 'discipline').length,
        activity: records.filter(r => r.category === 'activity').length,
        other: records.filter(r => r.category === 'other').length
      }
    };
  };

  const handleRecordScore = () => {
    const form = scoreForm();
    console.log('Recording score:', {
      ...form,
      recorder: currentUser.id
    });

    // Here would integrate with RecordScore interaction
    
    showRecordModal(false);
    scoreForm({
      memberId: '',
      points: 0,
      reason: '',
      category: 'other'
    });
  };

  const resetForm = () => {
    scoreForm({
      memberId: '',
      points: 0,
      reason: '',
      category: 'other'
    });
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

  const statistics = getStatistics();
  const members = getCurrentUserDormitoryMembers();

  // Check if current user is a dormitory leader
  const isDormitoryLeader = currentUser.role === 'student' && 
    mockDormitoryMembers.some(m => 
      m.user.id === currentUser.id && m.role === 'leader' && m.status === 'active'
    );

  const renderContent = () => {
    if (!isDormitoryLeader && currentUser.role !== 'admin') {
      return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <h3 style={{ color: s.colors.text.normal() }}>权限不足</h3>
          <p style={{ color: s.colors.text.normal(false, 'description') }}>
            只有宿舍长可以管理积分
          </p>
        </div>
      );
    }

  const tabItems = [
    {
      key: 'overview',
      label: '积分概览',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Member Score Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '16px' 
          }}>
            {members.map(member => (
              <Card key={member.id} style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ 
                      fontSize: s.sizes.fontSize.heading(4),
                      color: s.colors.text.normal(),
                      margin: '0 0 8px 0'
                    }}>
                      {member.user.name}
                    </h4>
                    <div style={{ color: s.colors.text.normal(false, 'description'), marginBottom: '8px' }}>
                      {member.user.studentId} • {member.bedNumber}号床
                    </div>
                    <div style={{ 
                      fontSize: '24px', 
                      fontWeight: 'bold',
                      color: member.score >= 0 ? s.colors.text.success() : s.colors.text.danger()
                    }}>
                      {member.score} 分
                    </div>
                    {member.score < -50 && (
                      <div style={{ 
                        fontSize: '12px', 
                        color: s.colors.text.danger(),
                        marginTop: '4px'
                      }}>
                        ⚠️ 踢出风险
                      </div>
                    )}
                  </div>
                  <div style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    backgroundColor: member.role === 'leader' ? '#e6f7ff' : '#f6ffed',
                    color: member.role === 'leader' ? s.colors.text.info() : s.colors.text.success()
                  }}>
                    {member.role === 'leader' ? '宿舍长' : '成员'}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Category Statistics */}
          <Card style={{ padding: '20px' }}>
            <h4 style={{ 
              fontSize: s.sizes.fontSize.heading(4),
              color: s.colors.text.normal(),
              margin: '0 0 16px 0'
            }}>
              积分类别统计
            </h4>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: '16px' 
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: s.colors.text.success() }}>
                  {statistics.categoryStats.hygiene}
                </div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>卫生</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: s.colors.text.warning() }}>
                  {statistics.categoryStats.discipline}
                </div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>纪律</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: s.colors.text.info() }}>
                  {statistics.categoryStats.activity}
                </div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>活动</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: s.colors.text.normal() }}>
                  {statistics.categoryStats.other}
                </div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>其他</div>
              </div>
            </div>
          </Card>
        </div>
      )
    },
    {
      key: 'records',
      label: '积分记录',
      children: (
        <div>
          {statistics.recentRecords.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {statistics.recentRecords.map((record, index) => (
                <Card key={index} style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold', color: s.colors.text.normal() }}>
                          {record.member.user.name}
                        </span>
                        <span style={{
                          color: record.points >= 0 ? s.colors.text.success() : s.colors.text.danger(),
                          fontWeight: 'bold',
                          fontSize: '16px'
                        }}>
                          {record.points > 0 ? '+' : ''}{record.points} 分
                        </span>
                        <div style={{
                          padding: '2px 6px',
                          fontSize: '10px',
                          borderRadius: '4px',
                          backgroundColor: '#f0f0f0',
                          color: s.colors.text.normal(false, 'description')
                        }}>
                          {getCategoryText(record.category)}
                        </div>
                      </div>
                      <div style={{ color: s.colors.text.normal(), marginBottom: '4px' }}>
                        {record.reason}
                      </div>
                      <div style={{ color: s.colors.text.normal(false, 'description'), fontSize: '12px' }}>
                        记录者: {record.recorder.name} • {new Date(record.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px', 
              color: s.colors.text.normal(false, 'description') 
            }}>
              暂无积分记录
            </div>
          )}
        </div>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <Card style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: '0 0 8px 0'
            }}>
              积分管理
            </h3>
            <p style={{ color: s.colors.text.normal(false, 'description'), margin: 0 }}>
              管理宿舍成员积分，记录加分扣分情况
            </p>
          </div>
          <Button 
            onClick={() => showRecordModal(true)}
            style={{ backgroundColor: '#1890ff', color: 'white', border: 'none' }}
          >
            记录积分
          </Button>
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
            <div style={{ color: s.colors.text.normal(false, 'description') }}>宿舍成员</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.success() }}>
              {statistics.totalMembers}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>平均积分</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.info() }}>
              {statistics.averageScore}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>踢出风险</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.danger() }}>
              {statistics.atRiskMembers}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>总记录数</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.warning() }}>
              {statistics.totalRecords}
            </div>
          </div>
        </Card>
      </div>

      {/* Content Tabs */}
      <Card style={{ padding: '20px' }}>
        <Tabs 
          activeKey={activeTab()}
          onChange={(key) => activeTab(key)}
          items={tabItems}
        />
      </Card>

      {/* Record Score Modal */}
      <Modal 
        visible={showRecordModal()} 
        onClose={() => showRecordModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
          <h3 style={{ 
            fontSize: s.sizes.fontSize.heading(3),
            color: s.colors.text.normal(),
            margin: 0
          }}>
            记录积分
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ color: s.colors.text.normal() }}>选择成员</label>
            <Select
              value={scoreForm().memberId}
              onChange={(value) => scoreForm({ ...scoreForm(), memberId: value })}
              options={members.map(member => ({
                label: `${member.user.name} (${member.user.studentId})`,
                value: member.id
              }))}
              placeholder="选择要记录积分的成员"
            />
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '16px' 
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: s.colors.text.normal() }}>积分值</label>
              <Input
                value={scoreForm().points}
                placeholder="正数为加分，负数为扣分"
                onInput={(e) => scoreForm({ ...scoreForm(), points: Number(e.target.value) })}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: s.colors.text.normal() }}>类别</label>
              <Select
                value={scoreForm().category}
                onChange={(value) => scoreForm({ ...scoreForm(), category: value as any })}
                options={[
                  { label: '卫生', value: 'hygiene' },
                  { label: '纪律', value: 'discipline' },
                  { label: '活动', value: 'activity' },
                  { label: '其他', value: 'other' }
                ]}
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ color: s.colors.text.normal() }}>详细原因</label>
            <Input
              value={scoreForm().reason}
              placeholder="请详细说明加分或扣分的原因..."
              style={{ minHeight: '80px' }}
              onInput={(e) => scoreForm({ ...scoreForm(), reason: e.target.value })}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button onClick={() => showRecordModal(false)}>
              取消
            </Button>
            <Button 
              onClick={handleRecordScore}
              style={{ backgroundColor: '#1890ff', color: 'white', border: 'none' }}
              disabled={!scoreForm().memberId || !scoreForm().reason.trim() || scoreForm().points === 0}
            >
              记录积分
            </Button>
          </div>
        </div>
      </Modal>
    </div>
    );
  };

  return renderContent;
}