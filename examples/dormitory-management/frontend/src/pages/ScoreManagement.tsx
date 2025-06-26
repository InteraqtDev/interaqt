/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment, atom } from 'axii'
import { Button, Card, CardHeader, CardBody, Input, Select, Textarea } from '../components/ui'
import { ScoreRecord, User, DormitoryMember } from '../types'
import { interactionSDK, getCurrentUser } from '../utils/interactionSDK'
import './ScoreManagement.css'

// Modal component
function Modal({ visible, onClose, title, children }: { visible: boolean, onClose: () => void, title: string, children: any }) {
  if (!visible) return null
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  )
}

export function ScoreManagement() {
  const scoreRecords = atom<ScoreRecord[]>([])
  const loading = atom(true)
  const error = atom<string | null>(null)
  const currentUser = atom<User | null>(null)
  const userMembership = atom<DormitoryMember | null>(null)
  const dormitoryMembers = atom<DormitoryMember[]>([])
  
  // Modal state
  const showRecordModal = atom(false)
  const recordForm = atom({
    memberId: '',
    points: 0,
    reason: '',
    category: 'other'
  })

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
        
        // 如果是宿舍长，获取本宿舍成员列表
        if (membership && membership.role === 'leader') {
          const members = await interactionSDK.getDormitoryMembersByDormitoryId(membership.dormitory.id)
          dormitoryMembers(members)
        }
      }
      
      const records = await interactionSDK.getScoreRecords()
      scoreRecords(records)
    } catch (err) {
      console.error('Failed to load score records:', err)
      error(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      loading(false)
    }
  }

  loadData()

  const handleRecordScore = async () => {
    try {
      const form = recordForm()
      if (!form.memberId || !form.reason) {
        alert('请填写完整信息')
        return
      }
      
      await interactionSDK.recordScore(
        form.memberId,
        form.points,
        form.reason,
        form.category
      )
      
      alert('积分记录成功')
      showRecordModal(false)
      recordForm({
        memberId: '',
        points: 0,
        reason: '',
        category: 'other'
      })
      
      await loadData()
    } catch (err) {
      console.error('Failed to record score:', err)
      alert('记录积分失败: ' + (err instanceof Error ? err.message : '未知错误'))
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

    const membership = userMembership()
    const isLeader = membership && membership.role === 'leader'

    return (
      <div className="score-management">
        <div className="page-header">
          <h2>积分管理</h2>
          <div className="header-actions">
            {isLeader && (
              <Button onClick={() => showRecordModal(true)}>
                记录积分
              </Button>
            )}
            <div className="stats">
              总记录: {scoreRecords().length}
            </div>
          </div>
        </div>

        <div className="score-records">
          {scoreRecords().map(record => (
            <Card className="score-record">
              <CardBody>
                <div className="record-header">
                  <div className="record-info">
                    <h4>{record.member.user.name}</h4>
                    <p className="record-meta">
                      {record.member.dormitory.name} • {new Date(record.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className={`points ${record.points >= 0 ? 'positive' : 'negative'}`}>
                    {record.points > 0 ? '+' : ''}{record.points}
                  </div>
                </div>
                <p className="record-reason">{record.reason}</p>
                <div className="record-footer">
                  <span className="category">{record.category}</span>
                  <span className="recorder">记录者: {record.recorder.name}</span>
                </div>
              </CardBody>
            </Card>
          ))}
          {scoreRecords().length === 0 && (
            <div className="empty-state">暂无积分记录</div>
          )}
        </div>

        {/* Record Score Modal */}
        <Modal
          visible={showRecordModal()}
          onClose={() => showRecordModal(false)}
          title="记录积分"
        >
          <div className="form-group">
            <label>选择成员</label>
            <Select
              value={recordForm().memberId}
              onChange={(value) => recordForm({ ...recordForm(), memberId: value })}
              options={dormitoryMembers()
                .filter(m => m.user.id !== currentUser()?.id) // 不能给自己记录积分
                .map(m => ({
                  value: m.id,
                  label: `${m.user.name} (床位 ${m.bedNumber}, 当前积分: ${m.score})`
                }))}
              placeholder="请选择成员"
            />
          </div>
          <div className="form-group">
            <label>积分值</label>
            <Input
              type="number"
              value={recordForm().points.toString()}
              onChange={(value) => recordForm({ ...recordForm(), points: parseInt(value) || 0 })}
              placeholder="正数加分，负数扣分"
            />
          </div>
          <div className="form-group">
            <label>类别</label>
            <Select
              value={recordForm().category}
              onChange={(value) => recordForm({ ...recordForm(), category: value })}
              options={[
                { value: 'hygiene', label: '卫生' },
                { value: 'discipline', label: '纪律' },
                { value: 'activity', label: '活动' },
                { value: 'other', label: '其他' }
              ]}
            />
          </div>
          <div className="form-group">
            <label>原因</label>
            <Textarea
              value={recordForm().reason}
              onChange={(value) => recordForm({ ...recordForm(), reason: value })}
              placeholder="请输入加分或扣分的具体原因"
              rows={3}
            />
          </div>
          <div className="modal-footer">
            <Button variant="ghost" onClick={() => showRecordModal(false)}>
              取消
            </Button>
            <Button onClick={handleRecordScore}>
              确定
            </Button>
          </div>
        </Modal>
      </div>
    )
  }

  return renderContent
}