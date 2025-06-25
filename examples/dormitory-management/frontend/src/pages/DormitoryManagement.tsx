import { atom, RenderContext } from 'axii';
import { Button, Input, Select } from 'axii-ui';
import { styleSystem as s } from 'axii-ui-theme-inc';
import { CreateDormitoryForm } from '../types';
import { 
  mockDormitories, 
  mockUsers, 
  mockDormitoryMembers,
  getMembersByDormitoryId 
} from '../utils/mockData';

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
  const showCreateModal = atom(false);
  const showAssignLeaderModal = atom(false);
  const showAssignMemberModal = atom(false);
  const selectedDormitoryId = atom('');

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

  const handleCreateDormitory = () => {
    console.log('Creating dormitory:', dormitoryForm());
    // Here would integrate with CreateDormitory interaction
    showCreateModal(false);
    resetForms();
  };

  const handleAssignLeader = () => {
    console.log('Assigning leader:', assignLeaderForm());
    // Here would integrate with AssignDormitoryLeader interaction
    showAssignLeaderModal(false);
    resetForms();
  };

  const handleAssignMember = () => {
    console.log('Assigning member:', assignMemberForm());
    // Here would integrate with AssignMemberToDormitory interaction
    showAssignMemberModal(false);
    resetForms();
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
  const availableStudents = mockUsers.filter(user => 
    user.role === 'student' && 
    !mockDormitoryMembers.some(member => 
      member.user.id === user.id && member.status === 'active'
    )
  );

  // Get dormitory members for each dormitory
  const getDormitoryLeader = (dormitoryId: string) => {
    const members = getMembersByDormitoryId(dormitoryId);
    return members.find(member => member.role === 'leader');
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
          backgroundColor: dormitory.isFull ? '#fff2f0' : '#f6ffed',
          color: dormitory.isFull ? s.colors.text.danger() : s.colors.text.success(),
          display: 'inline-block'
        }}>
          {dormitory.isFull ? '已满' : '有空位'}
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
            disabled={dormitory.isFull}
          >
            分配成员
          </Button>
        </div>
      )
    }
  ];

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
          <Button onClick={() => showCreateModal(true)}>
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
              {mockDormitories.length}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>已满宿舍</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.danger() }}>
              {mockDormitories.filter(d => d.isFull).length}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>总床位数</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.success() }}>
              {mockDormitories.reduce((sum, d) => sum + d.capacity, 0)}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>入住率</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.warning() }}>
              {Math.round(
                (mockDormitories.reduce((sum, d) => sum + (d.currentOccupancy || 0), 0) /
                mockDormitories.reduce((sum, d) => sum + d.capacity, 0)) * 100
              )}%
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
          dataSource={mockDormitories}
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
                onInput={(e) => dormitoryForm({ ...dormitoryForm(), name: e.target.value })}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: s.colors.text.normal() }}>楼栋</label>
              <Input
                value={dormitoryForm().building}
                placeholder="例：梅园1号楼"
                onInput={(e) => dormitoryForm({ ...dormitoryForm(), building: e.target.value })}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: s.colors.text.normal() }}>房间号</label>
              <Input
                value={dormitoryForm().roomNumber}
                placeholder="例：101"
                onInput={(e) => dormitoryForm({ ...dormitoryForm(), roomNumber: e.target.value })}
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
              onInput={(e) => dormitoryForm({ ...dormitoryForm(), description: e.target.value })}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button onClick={() => showCreateModal(false)}>
              取消
            </Button>
            <Button 
              onClick={handleCreateDormitory}
              disabled={!dormitoryForm().name || !dormitoryForm().building || !dormitoryForm().roomNumber}
            >
              创建宿舍
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
                宿舍: {mockDormitories.find(d => d.id === selectedDormitoryId())?.name}
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
              disabled={!assignLeaderForm().userId}
            >
              指定宿舍长
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
                宿舍: {mockDormitories.find(d => d.id === selectedDormitoryId())?.name}
              </div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>
                剩余床位: {mockDormitories.find(d => d.id === selectedDormitoryId())?.availableBeds} 个
              </div>
            </div>
          )}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ color: s.colors.text.normal() }}>选择学生</label>
            <Select
              value={assignMemberForm().userId}
              onChange={(value) => assignMemberForm({ ...assignMemberForm(), userId: value })}
              options={availableStudents.map(student => ({
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
              onInput={(e) => assignMemberForm({ ...assignMemberForm(), bedNumber: Number(e.target.value) })}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button onClick={() => showAssignMemberModal(false)}>
              取消
            </Button>
            <Button 
              onClick={handleAssignMember}
              disabled={!assignMemberForm().userId || !assignMemberForm().bedNumber}
            >
              分配成员
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}