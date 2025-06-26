/** @jsx createElement */
import { createElement, atom } from 'axii'
import { Button, Input, Card, CardHeader, CardBody } from '../components/ui'
import { User, Dormitory, DormitoryApplication, DormitoryMember } from '../types'
import { interactionSDK } from '../utils/interactionSDK'
import './StudentPortal.css'

// Modal component
function Modal({ visible, onClose, children }: { visible: boolean, onClose: () => void, children: any }) {
  if (!visible) return null
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export function StudentPortal() {
  const currentUser = atom<User | null>(null)
  const userMembership = atom<DormitoryMember | null>(null)
  const dormitories = atom<Dormitory[]>([])
  const userApplications = atom<DormitoryApplication[]>([])
  const loading = atom(true)
  const error = atom<string | null>(null)
  
  // Modal and form state
  const showApplyModal = atom(false)
  const selectedDormitory = atom<string>('')
  const applicationMessage = atom('')
  const submitting = atom(false)

  // Load data function
  const loadData = async () => {
    try {
      loading(true)
      error(null)

      // Load current user info
      const user = await interactionSDK.getCurrentUser()
      if (user) {
        currentUser(user)
        
        // Load user's membership info
        const membership = await interactionSDK.getUserMembership()
        userMembership(membership)
        
        // Load user's applications
        const applications = await interactionSDK.getUserApplications()
        userApplications(applications)
      }

      // Load available dormitories
      const dormitoriesData = await interactionSDK.getDormitories()
      dormitories(dormitoriesData)

    } catch (err) {
      console.error('Failed to load student portal data:', err)
      error(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      loading(false)
    }
  }

  // Load data on component mount
  loadData()

  const handleApplyToDormitory = (dormitoryId: string) => {
    selectedDormitory(dormitoryId)
    applicationMessage('')
    showApplyModal(true)
  }

  const handleSubmitApplication = async () => {
    try {
      submitting(true)
      const dormitoryId = selectedDormitory()
      const message = applicationMessage()
      
      if (!dormitoryId || !message.trim()) {
        alert('请填写申请信息')
        return
      }

      await interactionSDK.applyForDormitory(dormitoryId, message)
      
      showApplyModal(false)
      selectedDormitory('')
      applicationMessage('')
      
      // Reload data to show new application
      await loadData()
      
    } catch (err) {
      console.error('Failed to submit application:', err)
      alert('申请提交失败: ' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      submitting(false)
    }
  }

  const handleCancelApplication = async (applicationId: string) => {
    if (!confirm('确定要取消这个申请吗？')) {
      return
    }

    try {
      await interactionSDK.cancelApplication(applicationId)
      await loadData() // Reload data
    } catch (err) {
      console.error('Failed to cancel application:', err)
      alert('取消申请失败: ' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'pending': return 'status-pending'
      case 'leader_approved': return 'status-leader-approved'
      case 'admin_approved': return 'status-approved'
      case 'rejected': return 'status-rejected'
      case 'cancelled': return 'status-cancelled'
      default: return ''
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '等待审批'
      case 'leader_approved': return '宿舍长已批准'
      case 'admin_approved': return '已通过'
      case 'rejected': return '已拒绝'
      case 'cancelled': return '已取消'
      default: return status
    }
  }

  const renderContent = () => {
    if (loading()) {
      return (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      )
    }

    if (error()) {
      return (
        <div className="error-container">
          <div className="error-message">
            加载数据失败: {error()}
          </div>
          <Button onClick={loadData}>重试</Button>
        </div>
      )
    }

    const user = currentUser()
    if (!user) {
      return (
        <div className="error-container">
          <h3>未找到用户信息</h3>
          <p>请确保 URL 中包含有效的 userId 参数</p>
        </div>
      )
    }

    const membership = userMembership()
    const applications = userApplications()
    const availableDormitories = dormitories().filter(d => (d.currentOccupancy || 0) < d.capacity)

    return (
      <div className="student-portal">
        {/* Header */}
        <Card>
          <CardBody>
            <div className="portal-header">
              <h3>学生门户</h3>
              <p>申请宿舍，查看申请状态和个人信息</p>
            </div>
          </CardBody>
        </Card>

        {/* Current Status */}
        <Card>
          <CardHeader>
            <h4>当前状态</h4>
          </CardHeader>
          <CardBody>
            <div className="status-grid">
              <div className="status-item">
                <span className="status-label">姓名</span>
                <span className="status-value">{user.name}</span>
              </div>
              <div className="status-item">
                <span className="status-label">学号</span>
                <span className="status-value">{user.studentId}</span>
              </div>
              <div className="status-item">
                <span className="status-label">当前宿舍</span>
                <span className="status-value">
                  {membership ? membership.dormitory.name : '未分配'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">床位号</span>
                <span className="status-value">
                  {membership ? `${membership.bedNumber}号床` : '未分配'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">个人积分</span>
                <span className={`status-value score ${membership && membership.score >= 0 ? 'positive' : 'negative'}`}>
                  {membership?.score || 0}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">角色</span>
                <span className="status-value">
                  {membership?.role === 'leader' ? '宿舍长' : membership ? '成员' : '未分配'}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Available Dormitories (if no current dormitory) */}
        {!membership && (
          <Card>
            <CardHeader>
              <h4>可申请宿舍</h4>
            </CardHeader>
            <CardBody>
              <div className="dormitory-list">
                {availableDormitories.map(dormitory => (
                  <div key={dormitory.id} className="dormitory-item">
                    <div className="dormitory-info">
                      <h5>{dormitory.name}</h5>
                      <p className="dormitory-meta">
                        {dormitory.building} • {dormitory.currentOccupancy || 0}/{dormitory.capacity} 人 • 剩余 {dormitory.capacity - (dormitory.currentOccupancy || 0)} 床位
                      </p>
                      <p className="dormitory-desc">{dormitory.description}</p>
                    </div>
                    <Button onClick={() => handleApplyToDormitory(dormitory.id)}>
                      申请
                    </Button>
                  </div>
                ))}
                {availableDormitories.length === 0 && (
                  <div className="empty-state">暂无可申请的宿舍</div>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Application History */}
        <Card>
          <CardHeader>
            <h4>我的申请记录</h4>
          </CardHeader>
          <CardBody>
            <div className="application-list">
              {applications.map(application => (
                <div key={application.id} className="application-item">
                  <div className="application-header">
                    <h5>{application.dormitory.name}</h5>
                    <span className={`status-badge ${getStatusClass(application.status)}`}>
                      {getStatusText(application.status)}
                    </span>
                  </div>
                  <p className="application-time">
                    申请时间: {new Date(application.createdAt).toLocaleString()}
                  </p>
                  <p className="application-message">
                    申请留言: {application.message}
                  </p>
                  {application.leaderComment && (
                    <div className="comment-box leader-comment">
                      <strong>宿舍长意见:</strong> {application.leaderComment}
                    </div>
                  )}
                  {application.adminComment && (
                    <div className="comment-box admin-comment">
                      <strong>管理员意见:</strong> {application.adminComment}
                    </div>
                  )}
                  {application.status === 'pending' && (
                    <div className="application-actions">
                      <Button 
                        variant="danger"
                        size="sm"
                        onClick={() => handleCancelApplication(application.id)}
                      >
                        取消申请
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {applications.length === 0 && (
                <div className="empty-state">暂无申请记录</div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Apply Modal */}
        <Modal 
          visible={showApplyModal()} 
          onClose={() => showApplyModal(false)}
        >
          <div className="modal-header">
            <h3>申请加入宿舍</h3>
          </div>
          
          <div className="modal-body">
            {selectedDormitory() && (
              <div className="selected-dormitory">
                <div className="dormitory-name">
                  宿舍: {dormitories().find(d => d.id === selectedDormitory())?.name}
                </div>
                <div className="dormitory-building">
                  楼栋: {dormitories().find(d => d.id === selectedDormitory())?.building}
                </div>
              </div>
            )}
            
            <div className="form-group">
              <label>申请留言</label>
              <textarea
                className="textarea"
                value={applicationMessage()}
                onInput={(e) => applicationMessage((e.target as HTMLTextAreaElement).value)}
                placeholder="请说明您申请加入这个宿舍的理由..."
                rows={4}
              />
            </div>
          </div>
          
          <div className="modal-footer">
            <Button variant="ghost" onClick={() => showApplyModal(false)}>
              取消
            </Button>
            <Button 
              onClick={handleSubmitApplication}
              disabled={submitting() || !applicationMessage().trim()}
              loading={submitting()}
            >
              提交申请
            </Button>
          </div>
        </Modal>
      </div>
    )
  }

  return renderContent
}