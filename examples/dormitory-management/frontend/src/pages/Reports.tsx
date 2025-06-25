import { atom, RenderContext, Fragment } from 'axii';
import { Button } from 'axii-ui';
import { styleSystem as s } from 'axii-ui-theme-inc';
import { 
  getCurrentUser, 
  mockDormitories,
  mockUsers,
  mockDormitoryMembers,
  mockApplications,
  mockScoreRecords
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

// Simple Chart component (simulated)
function BarChart({ data, title }: { data: any[], title: string }, { createElement }: RenderContext) {
  const maxValue = Math.max(...data.map(item => item.value));
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h4 style={{ 
        fontSize: s.sizes.fontSize.heading(4),
        color: s.colors.text.normal(),
        margin: 0
      }}>
        {title}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {data.map((item, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '80px', 
              fontSize: '12px',
              color: s.colors.text.normal(false, 'description')
            }}>
              {item.name}
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                height: '20px',
                backgroundColor: item.color || '#1890ff',
                width: `${(item.value / maxValue) * 100}%`,
                minWidth: '2px',
                borderRadius: '2px'
              }} />
              <span style={{ fontSize: '12px', color: s.colors.text.normal() }}>
                {item.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Simple Line Chart component (simulated)
function LineChart({ data, title }: { data: any[], title: string }, { createElement }: RenderContext) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h4 style={{ 
        fontSize: s.sizes.fontSize.heading(4),
        color: s.colors.text.normal(),
        margin: 0
      }}>
        {title}
      </h4>
      <div style={{ 
        height: '150px', 
        display: 'flex', 
        alignItems: 'end', 
        gap: '8px',
        padding: '10px',
        border: '1px solid #f0f0f0',
        borderRadius: '4px'
      }}>
        {data.map((item, index) => (
          <div key={index} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flex: 1
          }}>
            <div style={{
              height: `${Math.max(item.value / Math.max(...data.map(d => d.value)) * 120, 5)}px`,
              width: '20px',
              backgroundColor: '#52c41a',
              borderRadius: '2px 2px 0 0'
            }} />
            <div style={{
              fontSize: '10px',
              color: s.colors.text.normal(false, 'description'),
              marginTop: '4px',
              textAlign: 'center'
            }}>
              {item.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Reports({}, { createElement }: RenderContext) {
  const currentUser = getCurrentUser();

  const renderContent = () => {
    // Check if user is admin
    if (currentUser.role !== 'admin') {
      return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <h3 style={{ color: s.colors.text.normal() }}>权限不足</h3>
          <p style={{ color: s.colors.text.normal(false, 'description') }}>
            只有管理员可以查看报表中心
          </p>
        </div>
      );
    }

  // Calculate statistics
  const getStatistics = () => {
    const totalDormitories = mockDormitories.length;
    const totalStudents = mockUsers.filter(u => u.role === 'student').length;
    const totalMembers = mockDormitoryMembers.filter(m => m.status === 'active').length;
    const totalApplications = mockApplications.length;
    const totalScoreRecords = mockScoreRecords.length;
    
    const occupancyRate = totalDormitories > 0 ? 
      Math.round((mockDormitories.reduce((sum, d) => sum + d.currentOccupancy, 0) / 
      mockDormitories.reduce((sum, d) => sum + d.capacity, 0)) * 100) : 0;

    const pendingApplications = mockApplications.filter(a => a.status === 'pending').length;
    const approvedApplications = mockApplications.filter(a => a.status === 'admin_approved').length;
    const averageScore = totalMembers > 0 ? 
      Math.round(mockDormitoryMembers.filter(m => m.status === 'active')
        .reduce((sum, m) => sum + m.score, 0) / totalMembers) : 0;

    return {
      totalDormitories,
      totalStudents,
      totalMembers,
      totalApplications,
      totalScoreRecords,
      occupancyRate,
      pendingApplications,
      approvedApplications,
      averageScore
    };
  };

  // Get dormitory occupancy data
  const getDormitoryOccupancyData = () => {
    return mockDormitories.map(d => ({
      name: d.name.split('楼')[1] || d.name,
      value: Math.round((d.currentOccupancy / d.capacity) * 100),
      color: d.currentOccupancy === d.capacity ? '#ff4d4f' : 
             d.currentOccupancy / d.capacity > 0.8 ? '#faad14' : '#52c41a'
    }));
  };

  // Get score distribution data
  const getScoreDistributionData = () => {
    const ranges = [
      { name: '≥90分', min: 90, max: Infinity, color: '#52c41a' },
      { name: '70-89分', min: 70, max: 89, color: '#1890ff' },
      { name: '50-69分', min: 50, max: 69, color: '#faad14' },
      { name: '0-49分', min: 0, max: 49, color: '#ff7a45' },
      { name: '负分', min: -Infinity, max: -1, color: '#ff4d4f' }
    ];

    const activeMembers = mockDormitoryMembers.filter(m => m.status === 'active');
    
    return ranges.map(range => ({
      name: range.name,
      value: activeMembers.filter(m => m.score >= range.min && m.score <= range.max).length,
      color: range.color
    }));
  };

  // Get application trend data (simulated monthly data)
  const getApplicationTrendData = () => {
    return [
      { name: '1月', value: 12 },
      { name: '2月', value: 8 },
      { name: '3月', value: 15 },
      { name: '4月', value: 20 },
      { name: '5月', value: 18 },
      { name: '6月', value: 10 }
    ];
  };

  // Get score category data
  const getScoreCategoryData = () => {
    const categories = ['hygiene', 'discipline', 'activity', 'other'];
    const categoryNames = { hygiene: '卫生', discipline: '纪律', activity: '活动', other: '其他' };
    const colors = { hygiene: '#52c41a', discipline: '#faad14', activity: '#1890ff', other: '#722ed1' };
    
    return categories.map(category => ({
      name: categoryNames[category],
      value: mockScoreRecords.filter(r => r.category === category).length,
      color: colors[category]
    }));
  };

  const handleExportData = (type: string) => {
    console.log(`Exporting ${type} data...`);
    // Here would implement actual export functionality
    alert(`导出${type}数据功能将在后续版本中实现`);
  };

  const statistics = getStatistics();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <Card style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ 
              fontSize: s.sizes.fontSize.heading(3),
              color: s.colors.text.normal(),
              margin: '0 0 8px 0'
            }}>
              报表中心
            </h3>
            <p style={{ color: s.colors.text.normal(false, 'description'), margin: 0 }}>
              宿舍管理系统数据统计与分析报表
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button 
              onClick={() => handleExportData('统计')}
              style={{ backgroundColor: '#52c41a', color: 'white', border: 'none' }}
            >
              导出统计数据
            </Button>
            <Button 
              onClick={() => handleExportData('详细')}
              style={{ backgroundColor: '#1890ff', color: 'white', border: 'none' }}
            >
              导出详细报表
            </Button>
          </div>
        </div>
      </Card>

      {/* Overview Statistics */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(5, 1fr)', 
        gap: '16px' 
      }}>
        <Card style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.success(), marginBottom: '8px' }}>
            {statistics.totalDormitories}
          </div>
          <div style={{ color: s.colors.text.normal(false, 'description') }}>总宿舍数</div>
        </Card>
        
        <Card style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.info(), marginBottom: '8px' }}>
            {statistics.totalStudents}
          </div>
          <div style={{ color: s.colors.text.normal(false, 'description') }}>总学生数</div>
        </Card>
        
        <Card style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.warning(), marginBottom: '8px' }}>
            {statistics.occupancyRate}%
          </div>
          <div style={{ color: s.colors.text.normal(false, 'description') }}>入住率</div>
        </Card>
        
        <Card style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.danger(), marginBottom: '8px' }}>
            {statistics.pendingApplications}
          </div>
          <div style={{ color: s.colors.text.normal(false, 'description') }}>待处理申请</div>
        </Card>
        
        <Card style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.colors.text.normal(), marginBottom: '8px' }}>
            {statistics.averageScore}
          </div>
          <div style={{ color: s.colors.text.normal(false, 'description') }}>平均积分</div>
        </Card>
      </div>

      {/* Charts Section */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: '20px' 
      }}>
        {/* Dormitory Occupancy */}
        <Card style={{ padding: '20px' }}>
          <BarChart 
            data={getDormitoryOccupancyData()}
            title="宿舍入住率统计"
          />
        </Card>

        {/* Score Distribution */}
        <Card style={{ padding: '20px' }}>
          <BarChart 
            data={getScoreDistributionData()}
            title="学生积分分布"
          />
        </Card>

        {/* Application Trend */}
        <Card style={{ padding: '20px' }}>
          <LineChart 
            data={getApplicationTrendData()}
            title="申请处理趋势 (近6个月)"
          />
        </Card>

        {/* Score Category */}
        <Card style={{ padding: '20px' }}>
          <BarChart 
            data={getScoreCategoryData()}
            title="积分记录类别统计"
          />
        </Card>
      </div>

      {/* Detailed Statistics */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: '20px' 
      }}>
        {/* Application Statistics */}
        <Card style={{ padding: '20px' }}>
          <h4 style={{ 
            fontSize: s.sizes.fontSize.heading(4),
            color: s.colors.text.normal(),
            margin: '0 0 16px 0'
          }}>
            申请处理统计
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: s.colors.text.normal(false, 'description') }}>总申请数</span>
              <span style={{ color: s.colors.text.normal(), fontWeight: 'bold' }}>{statistics.totalApplications}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: s.colors.text.normal(false, 'description') }}>已通过</span>
              <span style={{ color: s.colors.text.success(), fontWeight: 'bold' }}>{statistics.approvedApplications}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: s.colors.text.normal(false, 'description') }}>待处理</span>
              <span style={{ color: s.colors.text.warning(), fontWeight: 'bold' }}>{statistics.pendingApplications}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: s.colors.text.normal(false, 'description') }}>通过率</span>
              <span style={{ color: s.colors.text.info(), fontWeight: 'bold' }}>
                {statistics.totalApplications > 0 ? 
                  Math.round((statistics.approvedApplications / statistics.totalApplications) * 100) : 0}%
              </span>
            </div>
          </div>
        </Card>

        {/* Member Statistics */}
        <Card style={{ padding: '20px' }}>
          <h4 style={{ 
            fontSize: s.sizes.fontSize.heading(4),
            color: s.colors.text.normal(),
            margin: '0 0 16px 0'
          }}>
            成员管理统计
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: s.colors.text.normal(false, 'description') }}>活跃成员</span>
              <span style={{ color: s.colors.text.normal(), fontWeight: 'bold' }}>{statistics.totalMembers}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: s.colors.text.normal(false, 'description') }}>宿舍长数量</span>
              <span style={{ color: s.colors.text.info(), fontWeight: 'bold' }}>
                {mockDormitoryMembers.filter(m => m.role === 'leader' && m.status === 'active').length}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: s.colors.text.normal(false, 'description') }}>踢出风险</span>
              <span style={{ color: s.colors.text.danger(), fontWeight: 'bold' }}>
                {mockDormitoryMembers.filter(m => m.score < -50 && m.status === 'active').length}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: s.colors.text.normal(false, 'description') }}>积分记录数</span>
              <span style={{ color: s.colors.text.warning(), fontWeight: 'bold' }}>{statistics.totalScoreRecords}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Building Statistics */}
      <Card style={{ padding: '20px' }}>
        <h4 style={{ 
          fontSize: s.sizes.fontSize.heading(4),
          color: s.colors.text.normal(),
          margin: '0 0 16px 0'
        }}>
          楼栋分布统计
        </h4>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px' 
        }}>
          {Array.from(new Set(mockDormitories.map(d => d.building))).map(building => {
            const buildingDormitories = mockDormitories.filter(d => d.building === building);
            const totalCapacity = buildingDormitories.reduce((sum, d) => sum + d.capacity, 0);
            const totalOccupancy = buildingDormitories.reduce((sum, d) => sum + d.currentOccupancy, 0);
            const occupancyRate = Math.round((totalOccupancy / totalCapacity) * 100);
            
            return (
              <div key={building} style={{
                padding: '16px',
                border: '1px solid #f0f0f0',
                borderRadius: '8px',
                backgroundColor: '#fafafa'
              }}>
                <div style={{ 
                  color: s.colors.text.normal(),
                  fontWeight: 'bold',
                  marginBottom: '8px'
                }}>
                  {building}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: s.colors.text.normal(false, 'description') }}>宿舍数</span>
                    <span>{buildingDormitories.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: s.colors.text.normal(false, 'description') }}>入住率</span>
                    <span style={{ 
                      color: occupancyRate > 80 ? s.colors.text.success() : s.colors.text.warning() 
                    }}>
                      {occupancyRate}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: s.colors.text.normal(false, 'description') }}>入住人数</span>
                    <span>{totalOccupancy}/{totalCapacity}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
    );
  };

  return renderContent;
}