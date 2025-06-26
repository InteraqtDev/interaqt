/** @jsx createElement */
import { createElement, atom } from 'axii'
import { Button, Input, Select, Card, CardHeader, CardBody, Textarea } from '../components/ui'
import { Dormitory, User } from '../types'
import { interactionSDK } from '../utils/interactionSDK'
import './DormitoryManagement.css'

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

export function DormitoryManagement() {
  const dormitories = atom<Dormitory[]>([])
  const users = atom<User[]>([])
  const loading = atom(true)
  const error = atom<string | null>(null)
  
  // Modal states
  const showCreateModal = atom(false)
  const showAssignModal = atom(false)
  const selectedDormitory = atom<Dormitory | null>(null)
  
  // Form states
  const createForm = atom({
    name: '',
    building: '',
    roomNumber: '',
    capacity: 4,
    description: ''
  })
  
  const assignForm = atom({
    dormitoryId: '',
    userId: '',
    bedNumber: 1
  })

  // Load data
  const loadData = async () => {
    try {
      loading(true)
      error(null)
      
      const [dormitoriesData, usersData] = await Promise.all([
        interactionSDK.getDormitories(),
        interactionSDK.getUsers()
      ])
      
      dormitories(dormitoriesData)
      users(usersData)
    } catch (err) {
      console.error('Failed to load data:', err)
      error(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      loading(false)
    }
  }

  // Load data on mount
  loadData()

  // Create dormitory
  const handleCreateDormitory = async () => {
    try {
      const form = createForm()
      await interactionSDK.createDormitory(form)
      
      showCreateModal(false)
      createForm({
        name: '',
        building: '',
        roomNumber: '',
        capacity: 4,
        description: ''
      })
      
      await loadData()
    } catch (err) {
      console.error('Failed to create dormitory:', err)
      alert('创建宿舍失败: ' + (err instanceof Error ? err.message : '未知错误'))
    }
  }



  // Assign member
  const handleAssignMember = async () => {
    try {
      const form = assignForm()
      await interactionSDK.assignMemberToDormitory(
        form.dormitoryId,
        form.userId,
        form.bedNumber.toString()
      )
      
      showAssignModal(false)
      assignForm({
        dormitoryId: '',
        userId: '',
        bedNumber: 1
      })
      
      await loadData()
    } catch (err) {
      console.error('Failed to assign member:', err)
      alert('分配成员失败: ' + (err instanceof Error ? err.message : '未知错误'))
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

    const availableStudents = users().filter(u => 
      u.role === 'student' && !u.hasActiveDormitory
    )

    return (
      <div className="dormitory-management">
        {/* Header */}
        <div className="page-header">
          <h2>宿舍管理</h2>
          <Button onClick={() => showCreateModal(true)}>
            创建宿舍
          </Button>
        </div>

        {/* Dormitory List */}
        <div className="dormitory-grid">
          {dormitories().map(dormitory => (
            <Card className="dormitory-card">
              <CardHeader>
                <h3>{dormitory.name}</h3>
                <div className="dormitory-actions">
                  <Button size="sm" onClick={() => {
                    selectedDormitory(dormitory)
                    assignForm({ ...assignForm(), dormitoryId: dormitory.id })
                    showAssignModal(true)
                  }}>
                    分配学生
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                <div className="dormitory-info">
                  <div className="info-item">
                    <span className="info-label">楼栋</span>
                    <span className="info-value">{dormitory.building}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">房间号</span>
                    <span className="info-value">{dormitory.roomNumber}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">容量</span>
                    <span className="info-value">{dormitory.currentOccupancy}/{dormitory.capacity}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">状态</span>
                    <span className={`status-badge ${dormitory.isFull ? 'status-full' : 'status-available'}`}>
                      {dormitory.isFull ? '已满' : '可入住'}
                    </span>
                  </div>
                </div>
                {dormitory.description && (
                  <p className="dormitory-description">{dormitory.description}</p>
                )}
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Create Modal */}
        <Modal
          visible={showCreateModal()}
          onClose={() => showCreateModal(false)}
          title="创建宿舍"
        >
          <div className="form-group">
            <label>宿舍名称</label>
            <Input
              value={createForm().name}
              onChange={(value) => createForm({ ...createForm(), name: value })}
              placeholder="如：梅园1号楼101"
            />
          </div>
          <div className="form-group">
            <label>楼栋</label>
            <Input
              value={createForm().building}
              onChange={(value) => createForm({ ...createForm(), building: value })}
              placeholder="如：梅园1号楼"
            />
          </div>
          <div className="form-group">
            <label>房间号</label>
            <Input
              value={createForm().roomNumber}
              onChange={(value) => createForm({ ...createForm(), roomNumber: value })}
              placeholder="如：101"
            />
          </div>
          <div className="form-group">
            <label>容量</label>
            <Input
              type="number"
              value={createForm().capacity.toString()}
              onChange={(value) => createForm({ ...createForm(), capacity: parseInt(value) || 4 })}
            />
          </div>
          <div className="form-group">
            <label>描述</label>
            <Textarea
              value={createForm().description}
              onChange={(value) => createForm({ ...createForm(), description: value })}
              placeholder="可选的宿舍描述"
              rows={3}
            />
          </div>
          <div className="modal-footer">
            <Button variant="ghost" onClick={() => showCreateModal(false)}>
              取消
            </Button>
            <Button onClick={handleCreateDormitory}>
              创建
            </Button>
          </div>
        </Modal>



        {/* Assign Modal */}
        <Modal
          visible={showAssignModal()}
          onClose={() => showAssignModal(false)}
          title="分配学生"
        >
          <div className="form-group">
            <label>选择学生</label>
            <Select
              value={assignForm().userId}
              onChange={(value) => assignForm({ ...assignForm(), userId: value })}
              options={availableStudents.map(u => ({
                value: u.id,
                label: `${u.name} (${u.studentId})`
              }))}
              placeholder="请选择学生"
            />
          </div>
          <div className="form-group">
            <label>床位号</label>
            <Input
              type="number"
              value={assignForm().bedNumber.toString()}
              onChange={(value) => assignForm({ ...assignForm(), bedNumber: parseInt(value) || 1 })}
              placeholder="1-4"
            />
          </div>
          <div className="modal-footer">
            <Button variant="ghost" onClick={() => showAssignModal(false)}>
              取消
            </Button>
            <Button onClick={handleAssignMember}>
              分配
            </Button>
          </div>
        </Modal>
      </div>
    )
  }

  return renderContent
}