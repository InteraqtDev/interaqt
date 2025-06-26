import { atom, RenderContext, Fragment } from 'axii';
import { Button, Input, Select } from 'axii-ui';
import { styleSystem as s } from 'axii-ui-theme-inc';
import { User, DormitoryApplication, DormitoryMember } from '../types';
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

export function ApplicationManagement({}, { createElement }: RenderContext) {
  const currentUser = atom<User | null>(null);
  const applications = atom<DormitoryApplication[]>([]);
  const userMembership = atom<DormitoryMember | null>(null);
  const loading = atom(true);
  const error = atom<string | null>(null);
  
  const activeTab = atom('pending');
  const showProcessModal = atom(false);
  const selectedApplication = atom<DormitoryApplication | null>(null);
  const processingComment = atom('');
  const processingAction = atom<'approve' | 'reject'>('approve');
  const selectedBedNumber = atom(1);
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
        // Load applications and user membership in parallel
        const [applicationsData, membershipData] = await Promise.all([
          interactionSDK.getAllApplications(),
          interactionSDK.getUserMembership()
        ]);

        applications(applicationsData);
        userMembership(membershipData);
      }

    } catch (err) {
      console.error('Failed to load application management data:', err);
      error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      loading(false);
    }
  };

  // Load data on component mount
  loadData();

  // Filter applications based on user role and tab
  const getFilteredApplications = () => {
    const user = currentUser();
    const membership = userMembership();
    const allApplications = applications();
    
    let filteredApplications = allApplications;
    
    if (user && user.role === 'student' && membership && membership.role === 'leader') {
      // 宿舍长只能看到自己宿舍的申请
      filteredApplications = allApplications.filter(app => 
        app.dormitory.id === membership.dormitory.id
      );
    } else if (user && user.role === 'student') {
      // 普通学生不能访问申请管理
      filteredApplications = [];
    }

    // Filter by tab
    switch (activeTab()) {
      case 'pending':
        return filteredApplications.filter(app => app.status === 'pending');
      case 'leader_approved':
        return filteredApplications.filter(app => app.status === 'leader_approved');
      case 'processed':
        return filteredApplications.filter(app => 
          ['admin_approved', 'rejected', 'cancelled'].includes(app.status)
        );
      default:
        return filteredApplications;
    }
  };

  const handleProcessApplication = (application: DormitoryApplication, action: 'approve' | 'reject') => {
    selectedApplication(application);
    processingAction(action);
    processingComment('');
    selectedBedNumber(1);
    showProcessModal(true);
  };

  const handleSubmitProcess = async () => {
    try {
      submitting(true);
      const app = selectedApplication();
      const action = processingAction();
      const comment = processingComment();
      const user = currentUser();
      
      if (!app || !comment.trim() || !user) {
        alert('请填写处理意见');
        return;
      }

      if (user.role === 'admin') {
        // 管理员最终审批
        if (action === 'approve') {
          await interactionSDK.adminApproveApplication(app.id, comment, selectedBedNumber().toString());
        } else {
          await interactionSDK.adminRejectApplication(app.id, comment);
        }
      } else if (user.role === 'student') {
        // 宿舍长初审
        if (action === 'approve') {
          await interactionSDK.leaderApproveApplication(app.id, comment);
        } else {
          await interactionSDK.leaderRejectApplication(app.id, comment);
        }
      }
      
      showProcessModal(false);
      processingComment('');
      selectedApplication(null);
      
      // Reload data to show updated application
      await loadData();
      
    } catch (err) {
      console.error('Failed to process application:', err);
      alert('处理申请失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      submitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return s.colors.text.warning();
      case 'leader_approved': return s.colors.text.info();
      case 'admin_approved': return s.colors.text.success();
      case 'rejected': return s.colors.text.danger();
      case 'cancelled': return s.colors.text.normal(false, 'description');
      default: return s.colors.text.normal();
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '等待审批';
      case 'leader_approved': return '宿舍长已批准';
      case 'admin_approved': return '已通过';
      case 'rejected': return '已拒绝';
      case 'cancelled': return '已取消';
      default: return status;
    }
  };

  const canProcessApplication = (application: DormitoryApplication) => {
    const user = currentUser();
    const membership = userMembership();
    
    if (user?.role === 'admin') {
      return application.status === 'leader_approved';
    } else if (user?.role === 'student' && membership?.role === 'leader') {
      return application.status === 'pending';
    }
    return false;
  };

  const ApplicationCard = ({ application }: { application: DormitoryApplication }) => (
    <Card style={{ padding: '20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <h4 style={{ 
              fontSize: s.sizes.fontSize.heading(4),
              color: s.colors.text.normal(),
              margin: 0
            }}>
              {application.applicant.name}
            </h4>
            <span style={{ color: s.colors.text.normal(false, 'description') }}>
              ({application.applicant.studentId})
            </span>
            <div style={{
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '4px',
              backgroundColor: '#f0f0f0',
              color: getStatusColor(application.status)
            }}>
              {getStatusText(application.status)}
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '12px' }}>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>目标宿舍</div>
              <div style={{ color: s.colors.text.normal() }}>{application.dormitory.name}</div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>申请时间</div>
              <div style={{ color: s.colors.text.normal() }}>
                {new Date(application.createdAt).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>楼栋房间</div>
              <div style={{ color: s.colors.text.normal() }}>
                {application.dormitory.building} {application.dormitory.roomNumber}
              </div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>宿舍容量</div>
              <div style={{ color: s.colors.text.normal() }}>
                {application.dormitory.currentOccupancy}/{application.dormitory.capacity} 人
              </div>
            </div>
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>申请留言</div>
            <div style={{ 
              color: s.colors.text.normal(),
              padding: '8px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px',
              marginTop: '4px'
            }}>
              {application.message}
            </div>
          </div>
          
          {application.leaderComment && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>宿舍长意见</div>
              <div style={{ 
                color: s.colors.text.normal(),
                padding: '8px',
                backgroundColor: '#e6f7ff',
                borderRadius: '4px',
                marginTop: '4px'
              }}>
                {application.leaderComment}
              </div>
            </div>
          )}
          
          {application.adminComment && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>管理员意见</div>
              <div style={{ 
                color: s.colors.text.normal(),
                padding: '8px',
                backgroundColor: '#f6ffed',
                borderRadius: '4px',
                marginTop: '4px'
              }}>
                {application.adminComment}
              </div>
            </div>
          )}
        </div>
        
        {canProcessApplication(application) && (
          <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
            <Button 
              onClick={() => handleProcessApplication(application, 'approve')}
              style={{ backgroundColor: '#52c41a', color: 'white', border: 'none' }}
            >
              批准
            </Button>
            <Button 
              onClick={() => handleProcessApplication(application, 'reject')}
              style={{ backgroundColor: '#ff4d4f', color: 'white', border: 'none' }}
            >
              拒绝
            </Button>
          </div>
        )}
      </div>
    </Card>
  );

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
            只有宿舍长和管理员可以管理申请
          </p>
        </div>
      );
    }

    const filteredApplications = getFilteredApplications();
    const allApplications = applications();

    const tabItems = [
      {
        key: 'pending',
        label: '待处理申请',
        children: (
          <div>
            {filteredApplications.filter(app => app.status === 'pending').length > 0 ? (
              filteredApplications.filter(app => app.status === 'pending').map(app => (
                <ApplicationCard key={app.id} application={app} />
              ))
            ) : (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px', 
                color: s.colors.text.normal(false, 'description') 
              }}>
                暂无待处理申请
              </div>
            )}
          </div>
        )
      },
      {
        key: 'leader_approved',
        label: user.role === 'admin' ? '宿舍长已批准' : '已批准申请',
        children: (
          <div>
            {filteredApplications.filter(app => app.status === 'leader_approved').length > 0 ? (
              filteredApplications.filter(app => app.status === 'leader_approved').map(app => (
                <ApplicationCard key={app.id} application={app} />
              ))
            ) : (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px', 
                color: s.colors.text.normal(false, 'description') 
              }}>
                暂无此类申请
              </div>
            )}
          </div>
        )
      },
      {
        key: 'processed',
        label: '已处理申请',
        children: (
          <div>
            {filteredApplications.filter(app => 
              ['admin_approved', 'rejected', 'cancelled'].includes(app.status)
            ).length > 0 ? (
              filteredApplications.filter(app => 
                ['admin_approved', 'rejected', 'cancelled'].includes(app.status)
              ).map(app => (
                <ApplicationCard key={app.id} application={app} />
              ))
            ) : (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px', 
                color: s.colors.text.normal(false, 'description') 
              }}>
                暂无已处理申请
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
          <div>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: '0 0 8px 0'
            }}>
              申请管理
            </h3>
            <p style={{ color: s.colors.text.normal(false, 'description'), margin: 0 }}>
              {user.role === 'admin' ? '管理所有宿舍的入住申请' : '管理本宿舍的入住申请'}
            </p>
          </div>
        </Card>

        {/* Statistics */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '16px' 
        }}>
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>待处理申请</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.warning() }}>
                {allApplications.filter(app => app.status === 'pending').length}
              </div>
            </div>
          </Card>
          
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>已通过申请</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.success() }}>
                {allApplications.filter(app => app.status === 'admin_approved').length}
              </div>
            </div>
          </Card>
          
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>总申请数</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.info() }}>
                {allApplications.length}
              </div>
            </div>
          </Card>
        </div>

        {/* Applications List */}
        <Card style={{ padding: '20px' }}>
          <Tabs 
            activeKey={activeTab()}
            onChange={(key) => activeTab(key)}
            items={tabItems}
          />
        </Card>

        {/* Process Modal */}
        <Modal 
          visible={showProcessModal()} 
          onClose={() => showProcessModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: 0
            }}>
              {processingAction() === 'approve' ? '批准申请' : '拒绝申请'}
            </h3>
            
            {selectedApplication() && (
              <div style={{
                padding: '12px',
                backgroundColor: '#f6ffed',
                borderRadius: '6px',
                border: '1px solid #b7eb8f'
              }}>
                <div style={{ color: s.colors.text.normal() }}>
                  申请人: {selectedApplication()?.applicant.name}
                </div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>
                  目标宿舍: {selectedApplication()?.dormitory.name}
                </div>
              </div>
            )}
            
            {user.role === 'admin' && processingAction() === 'approve' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: s.colors.text.normal() }}>分配床位号</label>
                <Select
                  value={selectedBedNumber()}
                  onChange={(value) => selectedBedNumber(Number(value))}
                  options={[
                    { label: '1号床', value: 1 },
                    { label: '2号床', value: 2 },
                    { label: '3号床', value: 3 },
                    { label: '4号床', value: 4 },
                    { label: '5号床', value: 5 },
                    { label: '6号床', value: 6 }
                  ]}
                />
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: s.colors.text.normal() }}>
                {user.role === 'admin' ? '管理员意见' : '宿舍长意见'}
              </label>
              <Input
                value={processingComment()}
                onChange={(value) => processingComment(value)}
                placeholder={`请填写${processingAction() === 'approve' ? '批准' : '拒绝'}理由...`}
                style={{ minHeight: '80px' }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button onClick={() => showProcessModal(false)}>
                取消
              </Button>
              <Button 
                onClick={handleSubmitProcess}
                style={{
                  backgroundColor: processingAction() === 'approve' ? '#52c41a' : '#ff4d4f',
                  color: 'white',
                  border: 'none'
                }}
                disabled={submitting() || !processingComment().trim()}
              >
                {submitting() ? '处理中...' : `确认${processingAction() === 'approve' ? '批准' : '拒绝'}`}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  };

  return renderContent;
}