import { atom, RenderContext } from 'axii';
import { Button, Input } from 'axii-ui';
import { styleSystem as s } from 'axii-ui-theme-inc';
import { User, Dormitory, DormitoryApplication, DormitoryMember } from '../types';
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
        maxWidth: '500px',
        width: '90%',
        maxHeight: '90%',
        overflow: 'auto'
      }}>
        {children}
      </div>
    </div>
  );
}

export function StudentPortal({}, { createElement }: RenderContext) {
  const currentUser = atom<User | null>(null);
  const userMembership = atom<DormitoryMember | null>(null);
  const dormitories = atom<Dormitory[]>([]);
  const userApplications = atom<DormitoryApplication[]>([]);
  const loading = atom(true);
  const error = atom<string | null>(null);
  
  // Modal and form state
  const showApplyModal = atom(false);
  const selectedDormitory = atom<string>('');
  const applicationMessage = atom('');
  const submitting = atom(false);

  // Load data function
  const loadData = async () => {
    try {
      loading(true);
      error(null);

      // Load current user info
      const user = await interactionSDK.getCurrentUser();
      if (user) {
        currentUser(user);
        
        // Load user's membership info
        const membership = await interactionSDK.getUserMembership();
        userMembership(membership);
        
        // Load user's applications
        const applications = await interactionSDK.getUserApplications();
        userApplications(applications);
      }

      // Load available dormitories
      const dormitoriesData = await interactionSDK.getDormitories();
      dormitories(dormitoriesData);

    } catch (err) {
      console.error('Failed to load student portal data:', err);
      error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      loading(false);
    }
  };

  // Load data on component mount
  loadData();

  const handleApplyToDormitory = (dormitoryId: string) => {
    selectedDormitory(dormitoryId);
    applicationMessage('');
    showApplyModal(true);
  };

  const handleSubmitApplication = async () => {
    try {
      submitting(true);
      const dormitoryId = selectedDormitory();
      const message = applicationMessage();
      
      if (!dormitoryId || !message.trim()) {
        alert('请填写申请信息');
        return;
      }

      await interactionSDK.applyForDormitory(dormitoryId, message);
      
      showApplyModal(false);
      selectedDormitory('');
      applicationMessage('');
      
      // Reload data to show new application
      await loadData();
      
    } catch (err) {
      console.error('Failed to submit application:', err);
      alert('申请提交失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      submitting(false);
    }
  };

  const handleCancelApplication = async (applicationId: string) => {
    if (!confirm('确定要取消这个申请吗？')) {
      return;
    }

    try {
      await interactionSDK.cancelApplication(applicationId);
      await loadData(); // Reload data
    } catch (err) {
      console.error('Failed to cancel application:', err);
      alert('取消申请失败: ' + (err instanceof Error ? err.message : '未知错误'));
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

    const membership = userMembership();
    const applications = userApplications();
    const availableDormitories = dormitories().filter(d => (d.currentOccupancy || 0) < d.capacity);

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
              学生门户
            </h3>
            <p style={{ color: s.colors.text.normal(false, 'description'), margin: 0 }}>
              申请宿舍，查看申请状态和个人信息
            </p>
          </div>
        </Card>

        {/* Current Status */}
        <Card style={{ padding: '20px' }}>
          <h4 style={{ 
            fontSize: s.sizes.fontSize.heading(4),
            color: s.colors.text.normal(),
            margin: '0 0 16px 0'
          }}>
            当前状态
          </h4>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '16px' 
          }}>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>姓名</div>
              <div style={{ color: s.colors.text.normal() }}>{user.name}</div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>学号</div>
              <div style={{ color: s.colors.text.normal() }}>{user.studentId}</div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>当前宿舍</div>
              <div style={{ color: s.colors.text.normal() }}>
                {membership ? membership.dormitory.name : '未分配'}
              </div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>床位号</div>
              <div style={{ color: s.colors.text.normal() }}>
                {membership ? `${membership.bedNumber}号床` : '未分配'}
              </div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>个人积分</div>
              <div style={{ 
                fontSize: '20px', 
                fontWeight: 'bold',
                color: membership && membership.score >= 0 ? s.colors.text.success() : s.colors.text.danger()
              }}>
                {membership?.score || 0}
              </div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>角色</div>
              <div style={{ color: s.colors.text.normal() }}>
                {membership?.role === 'leader' ? '宿舍长' : membership ? '成员' : '未分配'}
              </div>
            </div>
          </div>
        </Card>

        {/* Available Dormitories (if no current dormitory) */}
        {!membership && (
          <Card style={{ padding: '20px' }}>
            <h4 style={{ 
              fontSize: s.sizes.fontSize.heading(4),
              color: s.colors.text.normal(),
              margin: '0 0 16px 0'
            }}>
              可申请宿舍
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {availableDormitories.map(dormitory => (
                <div key={dormitory.id} style={{
                  padding: '16px',
                  border: '1px solid #f0f0f0',
                  borderRadius: '8px',
                  backgroundColor: '#fafafa'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: s.sizes.fontSize.heading(5),
                        color: s.colors.text.normal(),
                        marginBottom: '4px'
                      }}>
                        {dormitory.name}
                      </div>
                      <div style={{ color: s.colors.text.normal(false, 'description'), marginBottom: '8px' }}>
                        {dormitory.building} • {dormitory.currentOccupancy || 0}/{dormitory.capacity} 人 • 剩余 {dormitory.capacity - (dormitory.currentOccupancy || 0)} 床位
                      </div>
                      <div style={{ color: s.colors.text.normal() }}>
                        {dormitory.description}
                      </div>
                    </div>
                    <Button 
                      onClick={() => handleApplyToDormitory(dormitory.id)}
                      style={{ marginLeft: '16px' }}
                    >
                      申请
                    </Button>
                  </div>
                </div>
              ))}
              {availableDormitories.length === 0 && (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '20px', 
                  color: s.colors.text.normal(false, 'description') 
                }}>
                  暂无可申请的宿舍
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Application History */}
        <Card style={{ padding: '20px' }}>
          <h4 style={{ 
            fontSize: s.sizes.fontSize.heading(4),
            color: s.colors.text.normal(),
            margin: '0 0 16px 0'
          }}>
            我的申请记录
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {applications.map(application => (
              <div key={application.id} style={{
                padding: '16px',
                border: '1px solid #f0f0f0',
                borderRadius: '8px',
                backgroundColor: '#fafafa'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 'bold', color: s.colors.text.normal() }}>
                        {application.dormitory.name}
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
                    <div style={{ color: s.colors.text.normal(false, 'description'), marginBottom: '4px' }}>
                      申请时间: {new Date(application.createdAt).toLocaleString()}
                    </div>
                    <div style={{ color: s.colors.text.normal(), marginBottom: '8px' }}>
                      申请留言: {application.message}
                    </div>
                    {application.leaderComment && (
                      <div style={{ 
                        color: s.colors.text.normal(),
                        padding: '8px',
                        backgroundColor: '#e6f7ff',
                        borderRadius: '4px',
                        marginBottom: '4px'
                      }}>
                        宿舍长意见: {application.leaderComment}
                      </div>
                    )}
                    {application.adminComment && (
                      <div style={{ 
                        color: s.colors.text.normal(),
                        padding: '8px',
                        backgroundColor: '#f6ffed',
                        borderRadius: '4px'
                      }}>
                        管理员意见: {application.adminComment}
                      </div>
                    )}
                  </div>
                  {application.status === 'pending' && (
                    <Button 
                      onClick={() => handleCancelApplication(application.id)}
                      style={{ 
                        marginLeft: '16px',
                        backgroundColor: '#ff4d4f',
                        color: 'white',
                        border: 'none'
                      }}
                    >
                      取消申请
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {applications.length === 0 && (
              <div style={{ 
                textAlign: 'center', 
                padding: '20px', 
                color: s.colors.text.normal(false, 'description') 
              }}>
                暂无申请记录
              </div>
            )}
          </div>
        </Card>

        {/* Apply Modal */}
        <Modal 
          visible={showApplyModal()} 
          onClose={() => showApplyModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: 0
            }}>
              申请加入宿舍
            </h3>
            
            {selectedDormitory() && (
              <div style={{
                padding: '12px',
                backgroundColor: '#f6ffed',
                borderRadius: '6px',
                border: '1px solid #b7eb8f'
              }}>
                <div style={{ color: s.colors.text.normal() }}>
                  宿舍: {dormitories().find(d => d.id === selectedDormitory())?.name}
                </div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>
                  楼栋: {dormitories().find(d => d.id === selectedDormitory())?.building}
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: s.colors.text.normal() }}>申请留言</label>
              <Input
                value={applicationMessage()}
                onChange={(value) => applicationMessage(value)}
                placeholder="请说明您申请加入这个宿舍的理由..."
                style={{ minHeight: '80px' }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button onClick={() => showApplyModal(false)}>
                取消
              </Button>
              <Button 
                onClick={handleSubmitApplication}
                style={{ backgroundColor: '#1890ff', color: 'white', border: 'none' }}
                disabled={submitting() || !applicationMessage().trim()}
              >
                {submitting() ? '提交中...' : '提交申请'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  };

  return renderContent;
}