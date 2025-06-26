/** @jsx createElement */
import { createElement, atom } from 'axii'
import { Button, Card, CardHeader, CardBody } from '../components/ui'
import { DormitoryApplication } from '../types'
import { interactionSDK } from '../utils/interactionSDK'
import './ApplicationManagement.css'

export function ApplicationManagement() {
  const applications = atom<DormitoryApplication[]>([])
  const loading = atom(true)
  const error = atom<string | null>(null)

  const loadData = async () => {
    try {
      loading(true)
      error(null)
      
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

  const handleApprove = async (applicationId: string) => {
    try {
      await interactionSDK.adminApproveApplication(applicationId, '批准', '1')
      await loadData()
    } catch (err) {
      console.error('Failed to approve application:', err)
      alert('批准申请失败')
    }
  }

  const handleReject = async (applicationId: string) => {
    try {
      await interactionSDK.adminRejectApplication(applicationId, '拒绝')
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

    const pendingApplications = applications().filter(app => app.status === 'pending')

    return (
      <div className="application-management">
        <div className="page-header">
          <h2>申请管理</h2>
          <div className="stats">
            待处理: {pendingApplications.length}
          </div>
        </div>

        <div className="application-list">
          {pendingApplications.map(app => {
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
                  </div>
                  <div className="application-actions">
                    <Button 
                      variant="primary"
                      onClick={() => handleApprove(app.id)}
                    >
                      批准
                    </Button>
                    <Button 
                      variant="danger"
                      onClick={() => handleReject(app.id)}
                    >
                      拒绝
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )
          })}
          {pendingApplications.length === 0 && (
            <div className="empty-state">暂无待处理的申请</div>
          )}
        </div>
      </div>
    )
  }

  return renderContent
}