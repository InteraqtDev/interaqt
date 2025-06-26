/** @jsx createElement */
import { createElement, atom, Fragment } from 'axii'
import { Button, Card, CardHeader, CardBody } from '../components/ui'
import { DashboardStats, PageRoute, User, DormitoryMember, Dormitory, DormitoryApplication } from '../types'
import { interactionSDK } from '../utils/interactionSDK'
import './Dashboard.css'

interface DashboardProps {
  onNavigate: (route: PageRoute) => void
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const currentUser = atom<User | null>(null)
  const userMembership = atom<DormitoryMember | null>(null)
  const dormitories = atom<Dormitory[]>([])
  const applications = atom<DormitoryApplication[]>([])
  const dashboardStats = atom<DashboardStats>({
    totalDormitories: 0,
    totalStudents: 0,
    pendingApplications: 0,
    kickRequests: 0,
    averageScore: 0
  })
  const loading = atom(true)
  const error = atom<string | null>(null)

  // Load data when component mounts
  const loadData = async () => {
    try {
      loading(true)
      error(null)

      // Load current user info
      const user = await interactionSDK.getCurrentUser()
      if (user) {
        currentUser(user)
        
        // Load user's membership info if they're a student
        if (user.role === 'student') {
          const membership = await interactionSDK.getUserMembership()
          userMembership(membership)
        }
      }

      // Load data for stats calculation
      const [dormitoriesData, usersData, applicationsData, kickRequestsData, scoreRecordsData] = await Promise.all([
        interactionSDK.getDormitories(),
        interactionSDK.getUsers(),
        interactionSDK.getApplications(),
        interactionSDK.getKickRequests(),
        interactionSDK.getScoreRecords()
      ])

      dormitories(dormitoriesData)
      applications(applicationsData)

      // Calculate stats
      const stats: DashboardStats = {
        totalDormitories: dormitoriesData.length,
        totalStudents: usersData.filter(u => u.role === 'student').length,
        pendingApplications: applicationsData.filter(a => a.status === 'pending').length,
        kickRequests: kickRequestsData.filter(k => k.status === 'pending').length,
        averageScore: scoreRecordsData.length > 0 ? 
          Math.round(scoreRecordsData.reduce((sum, record) => sum + record.points, 0) / scoreRecordsData.length) : 0
      }
      
      dashboardStats(stats)
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
      error(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      loading(false)
    }
  }

  // Load data on component mount
  loadData()

  // Admin Dashboard component
  const AdminDashboard = ({ stats, applications }: { stats: DashboardStats, applications: DormitoryApplication[] }) => (
    <div className="dashboard-grid">
      {/* Stats Cards */}
      <div className="stats-grid">
        <Card className="stat-card stat-card-primary">
          <CardBody>
            <div className="stat-icon">🏠</div>
            <div className="stat-content">
              <div className="stat-label">总宿舍数</div>
              <div className="stat-value">{stats.totalDormitories}</div>
            </div>
          </CardBody>
        </Card>
        
        <Card className="stat-card stat-card-success">
          <CardBody>
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <div className="stat-label">总学生数</div>
              <div className="stat-value">{stats.totalStudents}</div>
            </div>
          </CardBody>
        </Card>
        
        <Card className="stat-card stat-card-warning">
          <CardBody>
            <div className="stat-icon">📋</div>
            <div className="stat-content">
              <div className="stat-label">待处理申请</div>
              <div className="stat-value">{stats.pendingApplications}</div>
            </div>
          </CardBody>
        </Card>
        
        <Card className="stat-card stat-card-danger">
          <CardBody>
            <div className="stat-icon">⚠️</div>
            <div className="stat-content">
              <div className="stat-label">踢出申请</div>
              <div className="stat-value">{stats.kickRequests}</div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="quick-actions-card">
        <CardHeader>
          <h3>快捷操作</h3>
        </CardHeader>
        <CardBody>
          <div className="button-group">
            <Button onClick={() => onNavigate('/admin/dormitories')}>
              创建宿舍
            </Button>
            <Button variant="secondary" onClick={() => onNavigate('/applications')}>
              处理申请
            </Button>
            <Button variant="secondary" onClick={() => onNavigate('/admin/reports')}>
              查看报表
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Recent Activities */}
      <Card className="activities-card">
        <CardHeader>
          <h3>最近活动</h3>
        </CardHeader>
        <CardBody>
          <div className="activity-list">
            {applications.slice(0, 5).map((app, index) => (
              <div key={index} className="activity-item">
                <div className="activity-content">
                  <span className="activity-user">{app.applicant.name}</span>
                  <span className="activity-action">申请加入</span>
                  <span className="activity-target">{app.dormitory.name}</span>
                </div>
                <span className="activity-time">
                  {new Date(app.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
            {applications.length === 0 && (
              <div className="empty-state">暂无最近活动</div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  )

  // Student Dashboard component
  const StudentDashboard = ({ user, membership, dormitories }: { user: User, membership: DormitoryMember | null, dormitories: Dormitory[] }) => {
    const isLeader = membership?.role === 'leader'
    const availableDormitories = dormitories.filter(d => !d.isFull)
    
    return (
      <div className="dashboard-grid">
        {/* Personal Info Card */}
        <Card className="info-card">
          <CardHeader>
            <h3>个人信息</h3>
          </CardHeader>
          <CardBody>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">学号</span>
                <span className="info-value">{user.studentId}</span>
              </div>
              <div className="info-item">
                <span className="info-label">姓名</span>
                <span className="info-value">{user.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">当前宿舍</span>
                <span className="info-value">
                  {membership ? membership.dormitory.name : '未分配'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">角色</span>
                <span className="info-value">
                  {isLeader ? '宿舍长' : membership ? '成员' : '未分配'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">个人积分</span>
                <span className="info-value score">{membership?.score || 0}</span>
              </div>
              <div className="info-item">
                <span className="info-label">床位号</span>
                <span className="info-value">
                  {membership?.bedNumber || '未分配'}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Quick Actions */}
        <Card className="quick-actions-card">
          <CardHeader>
            <h3>快捷操作</h3>
          </CardHeader>
          <CardBody>
            <div className="button-group">
              {!membership && (
                <Button onClick={() => onNavigate('/student')}>
                  申请宿舍
                </Button>
              )}
              {isLeader && (
                <Fragment>
                  <Button onClick={() => onNavigate('/applications')}>
                    处理申请
                  </Button>
                  <Button variant="secondary" onClick={() => onNavigate('/scores')}>
                    记录积分
                  </Button>
                </Fragment>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Available Dormitories (for students without dormitory) */}
        {!membership && (
          <Card className="dormitories-card">
            <CardHeader>
              <h3>可申请宿舍</h3>
            </CardHeader>
            <CardBody>
              <div className="dormitory-list">
                {availableDormitories.map(dormitory => (
                  <div key={dormitory.id} className="dormitory-item">
                    <div className="dormitory-info">
                      <h4>{dormitory.name}</h4>
                      <p>{dormitory.currentOccupancy}/{dormitory.capacity} 人 • {dormitory.building}</p>
                    </div>
                    <Button size="sm" onClick={() => onNavigate('/student')}>
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
      </div>
    )
  }

  // Main render function
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

    const stats = dashboardStats()
    const membership = userMembership()
    const applicationsData = applications()
    const dormitoriesData = dormitories()

    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <h2>欢迎回来，{user.name}</h2>
          <p>{user.role === 'admin' ? '管理员控制面板' : '学生工作台'}</p>
        </div>
        
        {user.role === 'admin' ? 
          <AdminDashboard stats={stats} applications={applicationsData} /> : 
          <StudentDashboard user={user} membership={membership} dormitories={dormitoriesData} />
        }
      </div>
    )
  }

  return renderContent
}