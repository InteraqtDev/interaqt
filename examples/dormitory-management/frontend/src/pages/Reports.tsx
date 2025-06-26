/** @jsx createElement */
import { createElement, atom, computed } from 'axii'
import { Card, CardHeader, CardBody, Button } from '../components/ui'
import { Dormitory, DormitoryMember, DormitoryApplication, ScoreRecord } from '../types'
import { interactionSDK } from '../utils/interactionSDK'
import './Reports.css'

export function Reports() {
  const dormitories = atom<Dormitory[]>([])
  const members = atom<DormitoryMember[]>([])
  const applications = atom<DormitoryApplication[]>([])
  const scoreRecords = atom<ScoreRecord[]>([])
  const loading = atom(true)
  const error = atom<string | null>(null)

  const loadData = async () => {
    try {
      loading(true)
      error(null)
      
      const [dormitoriesData, membersData, applicationsData, scoreRecordsData] = await Promise.all([
        interactionSDK.getDormitories(),
        interactionSDK.getDormitoryMembers(),
        interactionSDK.getApplications(),
        interactionSDK.getScoreRecords()
      ])
      
      dormitories(dormitoriesData)
      members(membersData)
      applications(applicationsData)
      scoreRecords(scoreRecordsData)
    } catch (err) {
      console.error('Failed to load report data:', err)
      error(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      loading(false)
    }
  }

  loadData()

  // 计算宿舍入住率
  const occupancyRate = computed(() => {
    const dorms = dormitories()
    if (dorms.length === 0) return 0
    
    const totalCapacity = dorms.reduce((sum, d) => sum + d.capacity, 0)
    const totalOccupancy = dorms.reduce((sum, d) => sum + d.currentOccupancy, 0)
    
    return totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0
  })

  // 计算平均积分
  const averageScore = computed(() => {
    const activeMembers = members().filter(m => m.status === 'active')
    if (activeMembers.length === 0) return 0
    
    const totalScore = activeMembers.reduce((sum, m) => sum + m.score, 0)
    return Math.round(totalScore / activeMembers.length)
  })

  // 计算本月申请数量
  const monthlyApplications = computed(() => {
    const apps = applications()
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    
    return apps.filter(app => {
      const appDate = new Date(app.createdAt)
      return appDate.getMonth() === currentMonth && appDate.getFullYear() === currentYear
    }).length
  })

  // 计算活跃宿舍数（有成员的宿舍）
  const activeDormitories = computed(() => {
    const dorms = dormitories()
    return dorms.filter(d => d.currentOccupancy > 0).length
  })

  // 计算更多统计数据
  const totalStudents = computed(() => members().filter(m => m.status === 'active').length)
  const totalDormitories = computed(() => dormitories().length)
  const pendingApplications = computed(() => applications().filter(a => a.status === 'pending').length)
  const leaderApprovedApplications = computed(() => applications().filter(a => a.status === 'leader_approved').length)

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

    return (
      <div className="reports">
        <div className="page-header">
          <h2>数据报表</h2>
          <Button size="sm" variant="ghost" onClick={loadData}>
            刷新数据
          </Button>
        </div>

        <div className="report-grid">
          <Card>
            <CardHeader>
              <h3>宿舍入住率</h3>
            </CardHeader>
            <CardBody>
              <div className="stat-value">{occupancyRate()}%</div>
              <p className="stat-desc">当前入住率</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3>平均积分</h3>
            </CardHeader>
            <CardBody>
              <div className="stat-value">{averageScore()}</div>
              <p className="stat-desc">所有成员平均积分</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3>本月申请</h3>
            </CardHeader>
            <CardBody>
              <div className="stat-value">{monthlyApplications()}</div>
              <p className="stat-desc">本月新申请数量</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3>活跃宿舍</h3>
            </CardHeader>
            <CardBody>
              <div className="stat-value">{activeDormitories()}</div>
              <p className="stat-desc">有成员的宿舍数</p>
            </CardBody>
          </Card>
        </div>

        <div className="report-grid">
          <Card>
            <CardHeader>
              <h3>总学生数</h3>
            </CardHeader>
            <CardBody>
              <div className="stat-value">{totalStudents()}</div>
              <p className="stat-desc">活跃学生总数</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3>总宿舍数</h3>
            </CardHeader>
            <CardBody>
              <div className="stat-value">{totalDormitories()}</div>
              <p className="stat-desc">宿舍总数</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3>待处理申请</h3>
            </CardHeader>
            <CardBody>
              <div className="stat-value">{pendingApplications()}</div>
              <p className="stat-desc">等待宿舍长审批</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3>待最终审批</h3>
            </CardHeader>
            <CardBody>
              <div className="stat-value">{leaderApprovedApplications()}</div>
              <p className="stat-desc">等待管理员审批</p>
            </CardBody>
          </Card>
        </div>

        <Card className="chart-card">
          <CardHeader>
            <h3>详细统计</h3>
          </CardHeader>
          <CardBody>
            <div className="detail-stats">
              <div className="stat-row">
                <span>宿舍满员率</span>
                <span>{(() => {
                  const dorms = dormitories()
                  const fullDorms = dorms.filter(d => d.isFull).length
                  return dorms.length > 0 ? Math.round((fullDorms / dorms.length) * 100) : 0
                })()}%</span>
              </div>
              <div className="stat-row">
                <span>有宿舍长的宿舍</span>
                <span>{dormitories().filter(d => d.hasLeader).length} 个</span>
              </div>
              <div className="stat-row">
                <span>高风险成员（积分&lt;-50）</span>
                <span>{members().filter(m => m.status === 'active' && m.score < -50).length} 人</span>
              </div>
              <div className="stat-row">
                <span>本月积分记录</span>
                <span>{(() => {
                  const now = new Date()
                  const currentMonth = now.getMonth()
                  const currentYear = now.getFullYear()
                  
                  return scoreRecords().filter(record => {
                    const recordDate = new Date(record.createdAt)
                    return recordDate.getMonth() === currentMonth && recordDate.getFullYear() === currentYear
                  }).length
                })()}条</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  return renderContent
}