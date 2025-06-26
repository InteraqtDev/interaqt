/** @jsx createElement */
import { createElement, atom } from 'axii'
import { Button, Card, CardHeader, CardBody } from '../components/ui'
import { DormitoryMember, User } from '../types'
import { interactionSDK, getCurrentUser } from '../utils/interactionSDK'
import './MemberManagement.css'

export function MemberManagement() {
  const members = atom<DormitoryMember[]>([])
  const loading = atom(true)
  const error = atom<string | null>(null)
  const currentUser = atom<User | null>(null)
  const userMembership = atom<DormitoryMember | null>(null)

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

  const handleAssignLeader = async (dormitoryId: string, userId: string) => {
    if (!confirm('确定要指定该成员为宿舍长吗？')) return
    
    try {
      await interactionSDK.assignDormitoryLeader(dormitoryId, userId)
      alert('指定宿舍长成功')
      await loadData()
    } catch (err) {
      console.error('Failed to assign leader:', err)
      alert('指定宿舍长失败: ' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  const handleKickRequest = async (memberId: string, memberName: string) => {
    const reason = prompt(`请输入申请踢出 ${memberName} 的原因:`)
    if (!reason) return
    
    try {
      await interactionSDK.requestKickMember(memberId, reason)
      alert('踢出申请已提交，等待管理员审批')
      await loadData()
    } catch (err) {
      console.error('Failed to request kick:', err)
      alert('提交踢出申请失败: ' + (err instanceof Error ? err.message : '未知错误'))
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
          <div className="error-message">加载失败: {error()}</div>
          <Button onClick={loadData}>重试</Button>
        </div>
      )
    }

    const user = currentUser()
    const membership = userMembership()
    const isAdmin = user && user.role === 'admin'
    const isLeader = membership && membership.role === 'leader'

    // 根据用户角色过滤成员数据
    let filteredMembers = members()
    if (isLeader && membership) {
      // 宿舍长只能看到本宿舍的成员
      filteredMembers = filteredMembers.filter(m => 
        m.dormitory.id === membership.dormitory.id
      )
    }

    const groupedMembers = filteredMembers.reduce((acc, member) => {
      const dormName = member.dormitory.name
      if (!acc[dormName]) {
        acc[dormName] = {
          dormitoryId: member.dormitory.id,
          members: []
        }
      }
      acc[dormName].members.push(member)
      return acc
    }, {} as Record<string, { dormitoryId: string, members: DormitoryMember[] }>)

    return (
      <div className="member-management">
        <div className="page-header">
          <h2>成员管理</h2>
          <div className="stats">
            总人数: {filteredMembers.length}
          </div>
        </div>

        <div className="dormitory-groups">
          {Object.entries(groupedMembers).map(([dormName, group]) => {
            const hasLeader = group.members.some(m => m.role === 'leader')
            
            return (
              <Card className="dormitory-group">
                <CardHeader>
                  <h3>{dormName}</h3>
                  <span className="member-count">{group.members.length} 人</span>
                </CardHeader>
                <CardBody>
                                  <div className="member-list">
                  {group.members.map(member => {
                    const canKick = isLeader && 
                      membership?.dormitory.id === member.dormitory.id &&
                      member.user.id !== user?.id &&
                      member.score < -50 &&
                      member.status === 'active'
                    
                    return (
                      <div className="member-item">
                        <div className="member-info">
                          <h4>{member.user.name}</h4>
                          <p className="member-meta">
                            {member.user.studentId} • 床位 {member.bedNumber} • 积分 {member.score}
                          </p>
                          {member.score < -50 && member.status === 'active' && (
                            <span className="risk-badge">踢出风险</span>
                          )}
                          {member.status === 'kicked' && (
                            <span className="kicked-badge">已踢出</span>
                          )}
                        </div>
                        <div className="member-actions">
                          {member.role === 'leader' && (
                            <span className="leader-badge">宿舍长</span>
                          )}
                          {isAdmin && member.role !== 'leader' && !hasLeader && member.status === 'active' && (
                            <Button 
                              size="sm"
                              variant="primary"
                              onClick={() => handleAssignLeader(group.dormitoryId, member.user.id)}
                            >
                              指定为宿舍长
                            </Button>
                          )}
                          {canKick && (
                            <Button 
                              size="sm"
                              variant="danger"
                              onClick={() => handleKickRequest(member.id, member.user.name)}
                            >
                              申请踢出
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  return renderContent
}