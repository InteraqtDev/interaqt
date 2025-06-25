import { atom, RenderContext } from 'axii';
import { Button, Input } from 'axii-ui';
import { styleSystem as s } from 'axii-ui-theme-inc';
import { 
  getCurrentUser, 
  mockDormitories, 
  mockApplications,
  mockDormitoryMembers,
  getApplicationsByUserId
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
  const currentUser = getCurrentUser();
  const showApplyModal = atom(false);
  const selectedDormitory = atom<string>('');
  const applicationMessage = atom('');

  // Get user's current dormitory
  const userMembership = mockDormitoryMembers.find(m => 
    m.user.id === currentUser.id && m.status === 'active'
  );

  // Get user's applications
  const userApplications = getApplicationsByUserId(currentUser.id);

  // Get available dormitories (not full)
  const availableDormitories = mockDormitories.filter(d => !d.isFull);

  const handleApplyToDormitory = (dormitoryId: string) => {
    selectedDormitory(dormitoryId);
    showApplyModal(true);
  };

  const handleSubmitApplication = () => {
    console.log('Submitting application:', {
      dormitoryId: selectedDormitory(),
      message: applicationMessage()
    });
    // Here would integrate with ApplyForDormitory interaction
    showApplyModal(false);
    applicationMessage('');
    selectedDormitory('');
  };

  const handleCancelApplication = (applicationId: string) => {
    console.log('Cancelling application:', applicationId);
    // Here would integrate with CancelApplication interaction
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return s.colors.text.warning();
      case 'leader_approved': return s.colors.text.info();
      case 'admin_approved': return s.colors.text.success();
      case 'rejected': return s.colors.text.danger();
      case 'cancelled': return s.colors.text.normal(false, 'description');
      default: return s.colors.text.normal(false, 'description');
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '等待宿舍长审批';
      case 'leader_approved': return '宿舍长已批准，等待管理员审批';
      case 'admin_approved': return '申请已通过';
      case 'rejected': return '申请被拒绝';
      case 'cancelled': return '申请已取消';
      default: return status;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Personal Status Card */}
      <Card style={{ padding: '20px' }}>
        <h3 style={{ 
          fontSize: s.sizes.fontSize.heading(3),
          color: s.colors.text.normal(),
          margin: '0 0 16px 0'
        }}>
          我的宿舍状态
        </h3>
        {userMembership ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)', 
              gap: '16px' 
            }}>
              <div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>当前宿舍</div>
                <div style={{ color: s.colors.text.normal() }}>{userMembership.dormitory.name}</div>
              </div>
              <div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>楼栋</div>
                <div style={{ color: s.colors.text.normal() }}>{userMembership.dormitory.building}</div>
              </div>
              <div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>床位号</div>
                <div style={{ color: s.colors.text.normal() }}>{userMembership.bedNumber}号床</div>
              </div>
              <div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>角色</div>
                <div style={{ color: s.colors.text.normal() }}>
                  {userMembership.role === 'leader' ? '宿舍长' : '成员'}
                </div>
              </div>
              <div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>个人积分</div>
                <div style={{ 
                  fontSize: '20px', 
                  fontWeight: 'bold',
                  color: userMembership.score >= 0 ? s.colors.text.success() : s.colors.text.danger()
                }}>
                  {userMembership.score}
                </div>
              </div>
              <div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>入住时间</div>
                <div style={{ color: s.colors.text.normal() }}>
                  {new Date(userMembership.joinedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            
            <div style={{ padding: '16px', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '6px' }}>
              <div style={{ color: s.colors.text.normal() }}>✅ 您已成功入住宿舍</div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>宿舍描述：{userMembership.dormitory.description}</div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '16px', backgroundColor: '#fff7e6', border: '1px solid #ffd591', borderRadius: '6px' }}>
            <div style={{ color: s.colors.text.normal() }}>⚠️ 您尚未分配到宿舍</div>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>请从下方可申请宿舍中选择并提交申请</div>
          </div>
        )}
      </Card>

      {/* Available Dormitories - only show if user has no dormitory */}
      {!userMembership && (
        <Card style={{ padding: '20px' }}>
          <h3 style={{ 
            fontSize: s.sizes.fontSize.heading(3),
            color: s.colors.text.normal(),
            margin: '0 0 16px 0'
          }}>
            可申请宿舍
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {availableDormitories.map(dormitory => (
              <div key={dormitory.id} style={{
                border: '1px solid #d9d9d9',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: 'white'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ 
                      fontSize: s.sizes.fontSize.heading(4),
                      color: s.colors.text.normal(),
                      margin: '0 0 8px 0'
                    }}>
                      {dormitory.name}
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ color: s.colors.text.normal(false, 'description') }}>
                        📍 {dormitory.building} {dormitory.roomNumber}
                      </div>
                      <div style={{ color: s.colors.text.normal(false, 'description') }}>
                        👥 当前入住: {dormitory.currentOccupancy}/{dormitory.capacity} 人
                        (剩余 {dormitory.availableBeds} 个床位)
                      </div>
                      <div style={{ color: s.colors.text.normal(false, 'description') }}>
                        {dormitory.description}
                      </div>
                      {dormitory.hasLeader && (
                        <div style={{ color: s.colors.text.normal(false, 'description') }}>
                          ✅ 已有宿舍长
                        </div>
                      )}
                    </div>
                  </div>
                  <Button onClick={() => handleApplyToDormitory(dormitory.id)}>
                    申请入住
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Application History */}
      <Card style={{ padding: '20px' }}>
        <h3 style={{ 
          fontSize: s.sizes.fontSize.heading(3),
          color: s.colors.text.normal(),
          margin: '0 0 16px 0'
        }}>
          我的申请记录
        </h3>
        {userApplications.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {userApplications.map(application => (
              <div key={application.id} style={{
                border: '1px solid #d9d9d9',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: 'white'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <h4 style={{ 
                        fontSize: s.sizes.fontSize.heading(4),
                        color: s.colors.text.normal(),
                        margin: 0
                      }}>
                        {application.dormitory.name}
                      </h4>
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
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                      <div style={{ color: s.colors.text.normal(false, 'description') }}>
                        申请时间: {new Date(application.createdAt).toLocaleString()}
                      </div>
                      <div style={{ color: s.colors.text.normal(false, 'description') }}>
                        申请留言: {application.message}
                      </div>
                      {application.leaderComment && (
                        <div style={{ color: s.colors.text.normal(false, 'description') }}>
                          宿舍长意见: {application.leaderComment}
                        </div>
                      )}
                      {application.adminComment && (
                        <div style={{ color: s.colors.text.normal(false, 'description') }}>
                          管理员意见: {application.adminComment}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {application.status === 'pending' && (
                    <Button onClick={() => handleCancelApplication(application.id)}>
                      取消申请
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            暂无申请记录
          </div>
        )}
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
            申请入住宿舍
          </h3>
          
          {selectedDormitory() && (
            <div style={{
              padding: '12px',
              backgroundColor: '#f6ffed',
              borderRadius: '6px',
              border: '1px solid #b7eb8f'
            }}>
              <div style={{ color: s.colors.text.normal() }}>
                宿舍: {mockDormitories.find(d => d.id === selectedDormitory())?.name}
              </div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>
                {mockDormitories.find(d => d.id === selectedDormitory())?.description}
              </div>
            </div>
          )}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ color: s.colors.text.normal() }}>申请留言</label>
            <Input
              value={applicationMessage}
              placeholder="请简要介绍自己，说明申请理由..."
              style={{ minHeight: '80px' }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button onClick={() => showApplyModal(false)}>
              取消
            </Button>
            <Button 
              onClick={handleSubmitApplication}
              disabled={!applicationMessage().trim()}
            >
              提交申请
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}