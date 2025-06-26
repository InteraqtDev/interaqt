/** @jsx createElement */
import { createElement, atom } from 'axii'
import { Button, Card, CardHeader, CardBody } from '../components/ui'
import { DormitoryMember } from '../types'
import { interactionSDK } from '../utils/interactionSDK'
import './MemberManagement.css'

export function MemberManagement() {
  const members = atom<DormitoryMember[]>([])
  const loading = atom(true)
  const error = atom<string | null>(null)

  const loadData = async () => {
    try {
      loading(true)
      error(null)
      
      const membersData = await interactionSDK.getDormitoryMembers()
      members(membersData)
    } catch (err) {
      console.error('Failed to load members:', err)
      error(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      loading(false)
    }
  }

  loadData()

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

    const groupedMembers = members().reduce((acc, member) => {
      const dormName = member.dormitory.name
      if (!acc[dormName]) {
        acc[dormName] = []
      }
      acc[dormName].push(member)
      return acc
    }, {} as Record<string, DormitoryMember[]>)

    return (
      <div className="member-management">
        <div className="page-header">
          <h2>成员管理</h2>
          <div className="stats">
            总人数: {members().length}
          </div>
        </div>

        <div className="dormitory-groups">
          {Object.entries(groupedMembers).map(([dormName, dormMembers]) => (
            <Card className="dormitory-group">
              <CardHeader>
                <h3>{dormName}</h3>
                <span className="member-count">{dormMembers.length} 人</span>
              </CardHeader>
              <CardBody>
                <div className="member-list">
                  {dormMembers.map(member => (
                    <div className="member-item">
                      <div className="member-info">
                        <h4>{member.user.name}</h4>
                        <p className="member-meta">
                          {member.user.studentId} • 床位 {member.bedNumber} • 积分 {member.score}
                        </p>
                      </div>
                      {member.role === 'leader' && (
                        <span className="leader-badge">宿舍长</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return renderContent
}