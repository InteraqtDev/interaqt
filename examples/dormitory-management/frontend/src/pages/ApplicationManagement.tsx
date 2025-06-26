/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment, atom, computed } from 'axii'
import { Button, Card, CardHeader, CardBody, Select } from '../components/ui'
import { DormitoryApplication, User, DormitoryMember } from '../types'
import { interactionSDK, getCurrentUser } from '../utils/interactionSDK'
import './ApplicationManagement.css'

export function ApplicationManagement() {
  const applications = atom<DormitoryApplication[]>([])
  const loading = atom(true)
  const error = atom<string | null>(null)
  const currentUser = atom<User | null>(null)
  const userMembership = atom<DormitoryMember | null>(null)
  const statusFilter = atom<string>('all')

  const loadData = async () => {
    try {
      loading(true)
      error(null)
      
      // 获取当前用户信息
      const user = await getCurrentUser()
      currentUser(user)
      
      // 获取用户的宿舍成员身份
      if (user) {
        const membership = await interactionSDK.getUserMembership(user.id)
        userMembership(membership)
      }
      
      const applicationsData = await interactionSDK.getApplications()
      applications(applicationsData)
    } catch (err) {
      console.error('Failed to load applications:', err)
      error(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      loading(false)
    }
  }

  loadData()

  // 判断用户是否是宿舍长
  const isLeader = computed(() => {
    const membership = userMembership()
    return membership && membership.role === 'leader'
  })

  // 根据用户角色和状态过滤申请
  const filteredApplications = computed(() => {
    let filtered = applications()
    const membership = userMembership()
    
    // 如果是宿舍长，只显示本宿舍的申请
    if (isLeader() && membership) {
      filtered = filtered.filter(app => 
        app.dormitory.id === membership.dormitory.id
      )
    }
    
    // 状态过滤
    if (statusFilter() !== 'all') {
      filtered = filtered.filter(app => app.status === statusFilter())
    }
    
    return filtered
  }) as () => DormitoryApplication[]

  const handleAdminApprove = async (applicationId: string) => {
    const bedNumber = prompt('请输入床位号:')
    if (!bedNumber) return
    
    try {
      await interactionSDK.adminApproveApplication(applicationId, '批准', bedNumber)
      await loadData()
    } catch (err) {
      console.error('Failed to approve application:', err)
      alert('批准申请失败')
    }
  }

  const handleAdminReject = async (applicationId: string) => {
    const comment = prompt('请输入拒绝原因:') || '不符合条件'
    
    try {
      await interactionSDK.adminRejectApplication(applicationId, comment)
      await loadData()
    } catch (err) {
      console.error('Failed to reject application:', err)
      alert('拒绝申请失败')
    }
  }

  const handleLeaderApprove = async (applicationId: string) => {
    const comment = prompt('请输入审批意见:') || '同意'
    
    try {
      await interactionSDK.leaderApproveApplication(applicationId, comment)
      await loadData()
    } catch (err) {
      console.error('Failed to approve application:', err)
      alert('审批申请失败')
    }
  }

  const handleLeaderReject = async (applicationId: string) => {
    const comment = prompt('请输入拒绝原因:') || '不符合条件'
    
    try {
      await interactionSDK.leaderRejectApplication(applicationId, comment)
      await loadData()
    } catch (err) {
      console.error('Failed to reject application:', err)
      alert('拒绝申请失败')
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { text: string; className: string }> = {
      pending: { text: '待审批', className: 'status-pending' },
      leader_approved: { text: '宿舍长已批准', className: 'status-leader-approved' },
      admin_approved: { text: '已通过', className: 'status-approved' },
      rejected: { text: '已拒绝', className: 'status-rejected' },
      cancelled: { text: '已取消', className: 'status-cancelled' }
    }
    return statusMap[status] || { text: status, className: '' }
  }

  const renderActions = (app: DormitoryApplication) => {
    const user = currentUser()
    if (!user) return null

    // 管理员操作
    if (user.role === 'admin') {
      if (app.status === 'leader_approved') {
        return (
          <>
            <Button 
              variant="primary"
              onClick={() => handleAdminApprove(app.id)}
            >
              最终批准
            </Button>
            <Button 
              variant="danger"
              onClick={() => handleAdminReject(app.id)}
            >
              拒绝
            </Button>
          </>
        )
      } else if (app.status === 'pending') {
        return (
          <>
            <Button 
              variant="primary"
              onClick={() => handleAdminApprove(app.id)}
            >
              直接批准
            </Button>
            <Button 
              variant="danger"
              onClick={() => handleAdminReject(app.id)}
            >
              拒绝
            </Button>
          </>
        )
      }
    }
    
    // 宿舍长操作
    if (isLeader() && app.status === 'pending') {
      return (
        <>
          <Button 
            variant="primary"
            onClick={() => handleLeaderApprove(app.id)}
          >
            初审通过
          </Button>
          <Button 
            variant="danger"
            onClick={() => handleLeaderReject(app.id)}
          >
            拒绝
          </Button>
        </>
      )
    }
    
    return null
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
          <div className="error-message">加载失败: {error()}</div>
          <Button onClick={loadData}>重试</Button>
        </div>
      )
    }

    const filtered = filteredApplications()

    return (
      <div className="application-management">
        <div className="page-header">
          <h2>申请管理</h2>
          <div className="header-actions">
            <Select 
              value={statusFilter()}
              onChange={(value) => statusFilter(value)}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'pending', label: '待审批' },
                { value: 'leader_approved', label: '宿舍长已批准' },
                { value: 'admin_approved', label: '已通过' },
                { value: 'rejected', label: '已拒绝' },
                { value: 'cancelled', label: '已取消' }
              ]}
            />
            <div className="stats">
              显示 {filtered.length} 条
            </div>
          </div>
        </div>

        <div className="application-list">
          {filtered.map(app => {
            const status = getStatusBadge(app.status)
            return (
              <Card className="application-card">
                <CardHeader>
                  <div className="application-header">
                    <h3>{app.applicant.name} 申请加入 {app.dormitory.name}</h3>
                    <span className={`status-badge ${status.className}`}>
                      {status.text}
                    </span>
                  </div>
                </CardHeader>
                <CardBody>
                  <div className="application-info">
                    <p><strong>申请时间:</strong> {new Date(app.createdAt).toLocaleString()}</p>
                    <p><strong>申请留言:</strong> {app.message}</p>
                    {app.leaderComment && (
                      <p><strong>宿舍长意见:</strong> {app.leaderComment}</p>
                    )}
                    {app.adminComment && (
                      <p><strong>管理员意见:</strong> {app.adminComment}</p>
                    )}
                  </div>
                  <div className="application-actions">
                    {renderActions(app)}
                  </div>
                </CardBody>
              </Card>
            )
          })}
          {filtered.length === 0 && (
            <div className="empty-state">暂无申请记录</div>
          )}
        </div>
      </div>
    )
  }

  return renderContent
}