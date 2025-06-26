import { atom, RenderContext } from 'axii';
import { Button, Input, Select } from 'axii-ui';
import { styleSystem as s } from 'axii-ui-theme-inc';
import { CreateDormitoryForm, User, Dormitory, DormitoryMember } from '../types';
import { interactionSDK } from '../utils/interactionSDK';

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
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90%',
        overflow: 'auto'
      }}>
        {children}
      </div>
    </div>
  );
}

// Simple Table component
function Table({ columns, dataSource }: { columns: any[], dataSource: any[] }, { createElement }: RenderContext) {
  return (
    <div style={{
      border: '1px solid #d9d9d9',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#fafafa' }}>
            {columns.map((col, index) => (
              <th key={index} style={{
                padding: '12px 16px',
                textAlign: 'left',
                borderBottom: '1px solid #d9d9d9',
                fontWeight: 'bold',
                color: s.colors.text.normal()
              }}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataSource.map((row, rowIndex) => (
            <tr key={rowIndex} style={{
              borderBottom: rowIndex < dataSource.length - 1 ? '1px solid #f0f0f0' : 'none'
            }}>
              {columns.map((col, colIndex) => (
                <td key={colIndex} style={{
                  padding: '12px 16px',
                  color: s.colors.text.normal()
                }}>
                  {col.render ? col.render('', row, rowIndex) : row[col.dataIndex || col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DormitoryManagement({}, { createElement }: RenderContext) {
  const currentUser = atom<User | null>(null);
  const dormitories = atom<Dormitory[]>([]);
  const allUsers = atom<User[]>([]);
  const dormitoryMembers = atom<DormitoryMember[]>([]);
  const loading = atom(true);
  const error = atom<string | null>(null);
  
  const showCreateModal = atom(false);
  const showAssignLeaderModal = atom(false);
  const showAssignMemberModal = atom(false);
  const selectedDormitoryId = atom('');
  const submitting = atom(false);

  // Form states
  const dormitoryForm = atom<CreateDormitoryForm>({
    name: '',
    building: '',
    roomNumber: '',
    capacity: 4,
    description: ''
  });

  const assignLeaderForm = atom({
    dormitoryId: '',
    userId: ''
  });

  const assignMemberForm = atom({
    dormitoryId: '',
    userId: '',
    bedNumber: 1
  });

  // Load data function
  const loadData = async () => {
    try {
      loading(true);
      error(null);

      // Load current user info
      const user = await interactionSDK.getCurrentUser();
      currentUser(user);

      // Load all data in parallel
      const [dormitoriesData, usersData, membersData] = await Promise.all([
        interactionSDK.getDormitories(),
        interactionSDK.getAllUsers(),
        interactionSDK.getAllDormitoryMembers()
      ]);

      dormitories(dormitoriesData);
      allUsers(usersData);
      dormitoryMembers(membersData);

    } catch (err) {
      console.error('Failed to load dormitory management data:', err);
      error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      loading(false);
    }
  };

  // Load data on component mount
  loadData();

  const resetForms = () => {
    dormitoryForm({
      name: '',
      building: '',
      roomNumber: '',
      capacity: 4,
      description: ''
    });
    assignLeaderForm({
      dormitoryId: '',
      userId: ''
    });
    assignMemberForm({
      dormitoryId: '',
      userId: '',
      bedNumber: 1
    });
  };

  const handleCreateDormitory = async () => {
    try {
      submitting(true);
      const form = dormitoryForm();
      
      if (!form.name || !form.building || !form.roomNumber) {
        alert('请填写完整的宿舍信息');
        return;
      }

      await interactionSDK.createDormitory(form);
      
      showCreateModal(false);
      resetForms();
      
      // Reload data to show new dormitory
      await loadData();
      
    } catch (err) {
      console.error('Failed to create dormitory:', err);
      alert('创建宿舍失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      submitting(false);
    }
  };

  const handleAssignLeader = async () => {
    try {
      submitting(true);
      const form = assignLeaderForm();
      
      if (!form.dormitoryId || !form.userId) {
        alert('请选择宿舍和学生');
        return;
      }

      await interactionSDK.assignDormitoryLeader(form.dormitoryId, form.userId);
      
      showAssignLeaderModal(false);
      resetForms();
      
      // Reload data to show updated leader
      await loadData();
      
    } catch (err) {
      console.error('Failed to assign leader:', err);
      alert('指定宿舍长失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      submitting(false);
    }
  };

  const handleAssignMember = async () => {
    try {
      submitting(true);
      const form = assignMemberForm();
      
      if (!form.dormitoryId || !form.userId || !form.bedNumber) {
        alert('请填写完整的分配信息');
        return;
      }

      await interactionSDK.assignMemberToDormitory(form.dormitoryId, form.userId, form.bedNumber);
      
      showAssignMemberModal(false);
      resetForms();
      
      // Reload data to show updated member
      await loadData();
      
    } catch (err) {
      console.error('Failed to assign member:', err);
      alert('分配成员失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      submitting(false);
    }
  };

  const handleAssignLeaderClick = (dormitoryId: string) => {
    selectedDormitoryId(dormitoryId);
    assignLeaderForm({ ...assignLeaderForm(), dormitoryId });
    showAssignLeaderModal(true);
  };

  const handleAssignMemberClick = (dormitoryId: string) => {
    selectedDormitoryId(dormitoryId);
    assignMemberForm({ ...assignMemberForm(), dormitoryId });
    showAssignMemberModal(true);
  };

  // Get students who don't have active dormitory
  const availableStudents = () => {
    const users = allUsers();
    const members = dormitoryMembers();
    return users.filter(user => 
      user.role === 'student' && 
      !members.some(member => 
        member.user.id === user.id && member.status === 'active'
      )
    );
  };

  // Get dormitory members for each dormitory
  const getDormitoryLeader = (dormitoryId: string) => {
    const members = dormitoryMembers();
    return members.find(member => 
      member.dormitory.id === dormitoryId && 
      member.role === 'leader' && 
      member.status === 'active'
    );
  };

  const getMembersByDormitoryId = (dormitoryId: string) => {
    const members = dormitoryMembers();
    return members.filter(member => 
      member.dormitory.id === dormitoryId && 
      member.status === 'active'
    );
  };

  // Table columns
  const dormitoryColumns = [
    {
      title: '宿舍名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '楼栋',
      dataIndex: 'building',
      key: 'building'
    },
    {
      title: '房间号',
      dataIndex: 'roomNumber',
      key: 'roomNumber'
    },
    {
      title: '容量',
      key: 'capacity',
      render: (_, dormitory) => `${dormitory.currentOccupancy}/${dormitory.capacity}`
    },
    {
      title: '宿舍长',
      key: 'leader',
      render: (_, dormitory) => {
        const leader = getDormitoryLeader(dormitory.id);
        return leader ? leader.user.name : '未指定';
      }
    },
    {
      title: '状态',
      key: 'status',
      render: (_, dormitory) => (
        <div style={{
          padding: '4px 8px',
          fontSize: '12px',
          borderRadius: '4px',
          backgroundColor: (dormitory.currentOccupancy || 0) >= dormitory.capacity ? '#fff2f0' : '#f6ffed',
          color: (dormitory.currentOccupancy || 0) >= dormitory.capacity ? s.colors.text.danger() : s.colors.text.success(),
          display: 'inline-block'
        }}>
          {(dormitory.currentOccupancy || 0) >= dormitory.capacity ? '已满' : '有空位'}
        </div>
      )
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, dormitory) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button 
            onClick={() => handleAssignLeaderClick(dormitory.id)}
            style={{ fontSize: '12px' }}
          >
            指定宿舍长
          </Button>
          <Button 
            onClick={() => handleAssignMemberClick(dormitory.id)}
            style={{ fontSize: '12px' }}
            disabled={(dormitory.currentOccupancy || 0) >= dormitory.capacity}
          >
            分配成员
          </Button>
        </div>
      )
    }
  ];

  const renderContent = () => {
    if (loading()) {
      return (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '400px',
          color: s.colors.text.normal() 
        }}>
          加载中...
        </div>
      );
    }

    if (error()) {
      return (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '400px',
          gap: '16px'
        }}>
          <div style={{ color: s.colors.text.danger() }}>
            加载数据失败: {error()}
          </div>
          <Button onClick={loadData}>
            重试
          </Button>
        </div>
      );
    }

    const user = currentUser();
    if (!user || user.role !== 'admin') {
      return (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: s.colors.text.normal()
        }}>
          <h3>权限不足</h3>
          <p style={{ color: s.colors.text.normal(false, 'description') }}>
            只有管理员可以管理宿舍
          </p>
        </div>
      );
    }

    const dormitoriesList = dormitories();
    const users = allUsers();
    const members = dormitoryMembers();

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header Actions */}
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ 
                fontSize: s.sizes.fontSize.heading(3),
                color: s.colors.text.normal(),
                margin: '0 0 8px 0'
              }}>
                宿舍管理
              </h3>
              <p style={{ color: s.colors.text.normal(false, 'description'), margin: 0 }}>
                创建和管理学校宿舍
              </p>
            </div>
            <Button 
              onClick={() => showCreateModal(true)}
              style={{ backgroundColor: '#1890ff', color: 'white', border: 'none' }}
            >
              创建宿舍
            </Button>
          </div>
        </Card>

        {/* Statistics Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, 1fr)', 
          gap: '16px' 
        }}>
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>总宿舍数</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.success() }}>
                {dormitoriesList.length}
              </div>
            </div>
          </Card>
          
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>已满宿舍</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.danger() }}>
                {dormitoriesList.filter(d => d.isFull).length}
              </div>
            </div>
          </Card>
          
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>总床位数</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.success() }}>
                {dormitoriesList.reduce((sum, d) => sum + d.capacity, 0)}
              </div>
            </div>
          </Card>
          
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>入住率</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.warning() }}>
                {dormitoriesList.length > 0 ? Math.round(
                  (dormitoriesList.reduce((sum, d) => sum + (d.currentOccupancy || 0), 0) /
                  dormitoriesList.reduce((sum, d) => sum + d.capacity, 0)) * 100
                ) : 0}%
              </div>
            </div>
          </Card>
        </div>

        {/* Dormitory List */}
        <Card style={{ padding: '20px' }}>
          <h4 style={{ 
            fontSize: s.sizes.fontSize.heading(4),
            color: s.colors.text.normal(),
            margin: '0 0 16px 0'
          }}>
            宿舍列表
          </h4>
          <Table 
            dataSource={dormitoriesList}
            columns={dormitoryColumns}
          />
        </Card>

        {/* Create Dormitory Modal */}
        <Modal 
          visible={showCreateModal()} 
          onClose={() => showCreateModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: 0
            }}>
              创建新宿舍
            </h3>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)', 
              gap: '16px' 
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: s.colors.text.normal() }}>宿舍名称</label>
                <Input
                  value={dormitoryForm().name}
                  placeholder="例：梅园1号楼101"
                  onChange={(value) => dormitoryForm({ ...dormitoryForm(), name: value })}
                />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: s.colors.text.normal() }}>楼栋</label>
                <Input
                  value={dormitoryForm().building}
                  placeholder="例：梅园1号楼"
                  onChange={(value) => dormitoryForm({ ...dormitoryForm(), building: value })}
                />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: s.colors.text.normal() }}>房间号</label>
                <Input
                  value={dormitoryForm().roomNumber}
                  placeholder="例：101"
                  onChange={(value) => dormitoryForm({ ...dormitoryForm(), roomNumber: value })}
                />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: s.colors.text.normal() }}>容量（床位数）</label>
                <Select
                  value={dormitoryForm().capacity}
                  onChange={(value) => dormitoryForm({ ...dormitoryForm(), capacity: Number(value) })}
                  options={[
                    { label: '4人间', value: 4 },
                    { label: '5人间', value: 5 },
                    { label: '6人间', value: 6 }
                  ]}
                />
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: s.colors.text.normal() }}>宿舍描述</label>
              <Input
                value={dormitoryForm().description}
                placeholder="宿舍特色、设施等描述..."
                style={{ minHeight: '80px' }}
                onChange={(value) => dormitoryForm({ ...dormitoryForm(), description: value })}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button onClick={() => showCreateModal(false)}>
                取消
              </Button>
              <Button 
                onClick={handleCreateDormitory}
                disabled={submitting() || !dormitoryForm().name || !dormitoryForm().building || !dormitoryForm().roomNumber}
                style={{ backgroundColor: '#1890ff', color: 'white', border: 'none' }}
              >
                {submitting() ? '创建中...' : '创建宿舍'}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Assign Leader Modal */}
        <Modal 
          visible={showAssignLeaderModal()} 
          onClose={() => showAssignLeaderModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: 0
            }}>
              指定宿舍长
            </h3>
            
            {selectedDormitoryId() && (
              <div style={{
                padding: '12px',
                backgroundColor: '#f6ffed',
                borderRadius: '6px',
                border: '1px solid #b7eb8f'
              }}>
                <div style={{ color: s.colors.text.normal() }}>
                  宿舍: {dormitoriesList.find(d => d.id === selectedDormitoryId())?.name}
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: s.colors.text.normal() }}>选择学生</label>
              <Select
                value={assignLeaderForm().userId}
                onChange={(value) => assignLeaderForm({ ...assignLeaderForm(), userId: value })}
                options={getMembersByDormitoryId(selectedDormitoryId()).map(member => ({
                  label: `${member.user.name} (${member.user.studentId})`,
                  value: member.user.id
                }))}
                placeholder="选择要指定为宿舍长的学生"
              />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button onClick={() => showAssignLeaderModal(false)}>
                取消
              </Button>
              <Button 
                onClick={handleAssignLeader}
                disabled={submitting() || !assignLeaderForm().userId}
                style={{ backgroundColor: '#1890ff', color: 'white', border: 'none' }}
              >
                {submitting() ? '指定中...' : '指定宿舍长'}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Assign Member Modal */}
        <Modal 
          visible={showAssignMemberModal()} 
          onClose={() => showAssignMemberModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: 0
            }}>
              分配成员到宿舍
            </h3>
            
            {selectedDormitoryId() && (
              <div style={{
                padding: '12px',
                backgroundColor: '#f6ffed',
                borderRadius: '6px',
                border: '1px solid #b7eb8f'
              }}>
                <div style={{ color: s.colors.text.normal() }}>
                  宿舍: {dormitoriesList.find(d => d.id === selectedDormitoryId())?.name}
                </div>
                <div style={{ color: s.colors.text.normal(false, 'description') }}>
                  剩余床位: {(() => {
                    const dorm = dormitoriesList.find(d => d.id === selectedDormitoryId());
                    return dorm ? dorm.capacity - (dorm.currentOccupancy || 0) : 0;
                  })()} 个
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: s.colors.text.normal() }}>选择学生</label>
              <Select
                value={assignMemberForm().userId}
                onChange={(value) => assignMemberForm({ ...assignMemberForm(), userId: value })}
                options={availableStudents().map(student => ({
                  label: `${student.name} (${student.studentId})`,
                  value: student.id
                }))}
                placeholder="选择要分配的学生"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: s.colors.text.normal() }}>床位号</label>
              <Input
                value={assignMemberForm().bedNumber}
                placeholder="1-6"
                onChange={(value) => assignMemberForm({ ...assignMemberForm(), bedNumber: Number(value) })}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button onClick={() => showAssignMemberModal(false)}>
                取消
              </Button>
              <Button 
                onClick={handleAssignMember}
                disabled={submitting() || !assignMemberForm().userId || !assignMemberForm().bedNumber}
                style={{ backgroundColor: '#1890ff', color: 'white', border: 'none' }}
              >
                {submitting() ? '分配中...' : '分配成员'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  };

  return renderContent;
}