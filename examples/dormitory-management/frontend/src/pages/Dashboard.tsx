import { computed, atom, RenderContext, Fragment } from 'axii';
import { Button } from 'axii-ui';
import { styleSystem as s } from 'axii-ui-theme-inc';
import { DashboardStats, PageRoute, User, DormitoryMember, Dormitory, DormitoryApplication } from '../types';
import { interactionSDK } from '../utils/interactionSDK';

interface DashboardProps {
  onNavigate: (route: PageRoute) => void;
}

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

export function Dashboard({ onNavigate }: DashboardProps, { createElement }: RenderContext) {
  const currentUser = atom<User | null>(null);
  const userMembership = atom<DormitoryMember | null>(null);
  const dormitories = atom<Dormitory[]>([]);
  const applications = atom<DormitoryApplication[]>([]);
  const dashboardStats = atom<DashboardStats>({
    totalDormitories: 0,
    totalStudents: 0,
    pendingApplications: 0,
    kickRequests: 0,
    averageScore: 0
  });
  const loading = atom(true);
  const error = atom<string | null>(null);

  // Load data when component mounts
  const loadData = async () => {
    try {
      loading(true);
      error(null);

      // Load current user info
      const user = await interactionSDK.getCurrentUser();
      if (user) {
        currentUser(user);
        
        // Load user's membership info if they're a student
        if (user.role === 'student') {
          const membership = await interactionSDK.getUserMembership();
          userMembership(membership);
        }
      }

      // Load data for stats calculation
      const [dormitoriesData, usersData, applicationsData, kickRequestsData, scoreRecordsData] = await Promise.all([
        interactionSDK.getDormitories(),
        interactionSDK.getUsers(),
        interactionSDK.getApplications(),
        interactionSDK.getKickRequests(),
        interactionSDK.getScoreRecords()
      ]);

      dormitories(dormitoriesData);
      applications(applicationsData);

      // Calculate stats
      const stats: DashboardStats = {
        totalDormitories: dormitoriesData.length,
        totalStudents: usersData.filter(u => u.role === 'student').length,
        pendingApplications: applicationsData.filter(a => a.status === 'pending').length,
        kickRequests: kickRequestsData.filter(k => k.status === 'pending').length,
        averageScore: scoreRecordsData.length > 0 ? 
          Math.round(scoreRecordsData.reduce((sum, record) => sum + record.points, 0) / scoreRecordsData.length) : 0
      };
      
      dashboardStats(stats);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      loading(false);
    }
  };

  // Load data on component mount
  loadData();

  // Admin Dashboard component
  const AdminDashboard = ({ stats, applications }: { stats: DashboardStats, applications: DormitoryApplication[] }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Stats Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '16px' 
      }}>
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>总宿舍数</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.success() }}>
              {stats.totalDormitories}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>总学生数</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.success() }}>
              {stats.totalStudents}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>待处理申请</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.warning() }}>
              {stats.pendingApplications}
            </div>
          </div>
        </Card>
        
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: s.colors.text.normal(false, 'description') }}>踢出申请</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.danger() }}>
              {stats.kickRequests}
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card style={{ padding: '20px' }}>
        <h3 style={{ 
          fontSize: s.sizes.fontSize.heading(3),
          color: s.colors.text.normal(),
          margin: '0 0 16px 0'
        }}>
          快捷操作
        </h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Button onClick={() => onNavigate('/admin/dormitories')}>
            创建宿舍
          </Button>
          <Button onClick={() => onNavigate('/applications')}>
            处理申请
          </Button>
          <Button onClick={() => onNavigate('/admin/reports')}>
            查看报表
          </Button>
        </div>
      </Card>

      {/* Recent Activities */}
      <Card style={{ padding: '20px' }}>
        <h3 style={{ 
          fontSize: s.sizes.fontSize.heading(3),
          color: s.colors.text.normal(),
          margin: '0 0 16px 0'
        }}>
          最近活动
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {applications.slice(0, 3).map((app, index) => (
            <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>学生 {app.applicant.name} 申请加入宿舍 {app.dormitory.name}</span>
              <span style={{ color: s.colors.text.normal(false, 'description') }}>
                {new Date(app.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
          {applications.length === 0 && (
            <div style={{ color: s.colors.text.normal(false, 'description') }}>
              暂无最近活动
            </div>
          )}
        </div>
      </Card>
    </div>
  );

  // Student Dashboard component
  const StudentDashboard = ({ user, membership, dormitories }: { user: User, membership: DormitoryMember | null, dormitories: Dormitory[] }) => {
    const isLeader = membership?.role === 'leader';
    const availableDormitories = dormitories.filter(d => !d.isFull);
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Personal Info Card */}
        <Card style={{ padding: '20px' }}>
          <h3 style={{ 
            fontSize: s.sizes.fontSize.heading(3),
            color: s.colors.text.normal(),
            margin: '0 0 16px 0'
          }}>
            个人信息
          </h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '16px' 
          }}>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>学号</div>
              <div style={{ color: s.colors.text.normal() }}>{user.studentId}</div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>姓名</div>
              <div style={{ color: s.colors.text.normal() }}>{user.name}</div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>当前宿舍</div>
              <div style={{ color: s.colors.text.normal() }}>
                {membership ? membership.dormitory.name : '未分配'}
              </div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>角色</div>
              <div style={{ color: s.colors.text.normal() }}>
                {isLeader ? '宿舍长' : membership ? '成员' : '未分配'}
              </div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>个人积分</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: s.colors.text.success() }}>
                {membership?.score || 0}
              </div>
            </div>
            <div>
              <div style={{ color: s.colors.text.normal(false, 'description') }}>床位号</div>
              <div style={{ color: s.colors.text.normal() }}>
                {membership?.bedNumber || '未分配'}
              </div>
            </div>
          </div>
        </Card>

        {/* Quick Actions */}
        <Card style={{ padding: '20px' }}>
          <h3 style={{ 
            fontSize: s.sizes.fontSize.heading(3),
            color: s.colors.text.normal(),
            margin: '0 0 16px 0'
          }}>
            快捷操作
          </h3>
          <div style={{ display: 'flex', gap: '12px' }}>
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
                <Button onClick={() => onNavigate('/scores')}>
                  记录积分
                </Button>
              </Fragment>
            )}
          </div>
        </Card>

        {/* Available Dormitories (for students without dormitory) */}
        {!membership && (
          <Card style={{ padding: '20px' }}>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: '0 0 16px 0'
            }}>
              可申请宿舍
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {availableDormitories.map(dormitory => (
                <div key={dormitory.id} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center' 
                }}>
                  <div>
                    <div style={{ color: s.colors.text.normal() }}>{dormitory.name}</div>
                    <div style={{ color: s.colors.text.normal(false, 'description') }}>
                      {dormitory.currentOccupancy}/{dormitory.capacity} 人 • {dormitory.building}
                    </div>
                  </div>
                  <Button onClick={() => onNavigate('/student')}>
                    申请
                  </Button>
                </div>
              ))}
              {availableDormitories.length === 0 && (
                <div style={{ color: s.colors.text.normal(false, 'description') }}>
                  暂无可申请的宿舍
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    );
  };

  // Main render function - axii will track this and update when atoms change
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
    if (!user) {
      return (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: s.colors.text.normal()
        }}>
          <h3>未找到用户信息</h3>
          <p style={{ color: s.colors.text.normal(false, 'description') }}>
            请确保 URL 中包含有效的 userId 参数
          </p>
        </div>
      );
    }

    const stats = dashboardStats();
    const membership = userMembership();
    const applicationsData = applications();
    const dormitoriesData = dormitories();

    return (
      <div>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ 
            fontSize: s.sizes.fontSize.heading(2),
            color: s.colors.text.normal(),
            margin: '0 0 8px 0'
          }}>
            欢迎回来，{user.name}
          </h2>
          <p style={{ color: s.colors.text.normal(false, 'description'), margin: 0 }}>
            {user.role === 'admin' ? '管理员控制面板' : '学生工作台'}
          </p>
        </div>
        
        {user.role === 'admin' ? 
          <AdminDashboard stats={stats} applications={applicationsData} /> : 
          <StudentDashboard user={user} membership={membership} dormitories={dormitoriesData} />
        }
      </div>
    );
  };

  return renderContent;
}