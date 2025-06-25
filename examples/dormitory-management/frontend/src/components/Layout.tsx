import { atom, RenderContext } from 'axii';
import { Button } from 'axii-ui';
import { styleSystem as s } from 'axii-ui-theme-inc';
import { User, PageRoute } from '../types';
import { getCurrentUser } from '../utils/mockData';

interface LayoutProps {
  currentRoute: PageRoute;
  onNavigate: (route: PageRoute) => void;
  children: any;
}

export function Layout({ currentRoute, onNavigate, children }: LayoutProps, { createElement }: RenderContext) {
  const currentUser = getCurrentUser();
  const sidebarCollapsed = atom(false);

  const getMenuItems = (user: User) => {
    const items = [
      { route: '/dashboard' as PageRoute, label: '仪表板', icon: '📊' }
    ];

    if (user.role === 'admin') {
      items.push(
        { route: '/admin/dormitories' as PageRoute, label: '宿舍管理', icon: '🏠' },
        { route: '/applications' as PageRoute, label: '申请管理', icon: '📋' },
        { route: '/members' as PageRoute, label: '成员管理', icon: '👥' },
        { route: '/admin/reports' as PageRoute, label: '报表中心', icon: '📈' }
      );
    } else if (user.role === 'student') {
      // Check if student is a dormitory leader
      const isLeader = true; // This should be determined from the data
      
      items.push({ route: '/student' as PageRoute, label: '学生门户', icon: '🎓' });
      
      if (isLeader) {
        items.push(
          { route: '/applications' as PageRoute, label: '申请管理', icon: '📋' },
          { route: '/members' as PageRoute, label: '成员管理', icon: '👥' },
          { route: '/scores' as PageRoute, label: '积分管理', icon: '⭐' }
        );
      }
    }

    return items;
  };

  const menuItems = getMenuItems(currentUser);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      height: '100vh'
    }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarCollapsed() ? '60px' : '240px',
        backgroundColor: '#001529',
        color: 'white',
        padding: '16px 0',
        transition: 'width 0.3s',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Logo and Toggle */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 16px',
          marginBottom: '24px'
        }}>
          {!sidebarCollapsed() && (
            <div style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>
              宿舍管理系统
            </div>
          )}
          <Button
            onClick={() => sidebarCollapsed(!sidebarCollapsed())}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            {sidebarCollapsed() ? '→' : '←'}
          </Button>
        </div>

        {/* User Info */}
        <div style={{
          padding: '0 16px',
          marginBottom: '24px',
          borderBottom: '1px solid #ffffff20',
          paddingBottom: '16px'
        }}>
          {!sidebarCollapsed() && (
            <div>
              <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                {currentUser.name}
              </div>
              <div style={{ fontSize: '12px', color: '#ffffff80' }}>
                {currentUser.role === 'admin' ? '管理员' : '学生'}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <div style={{ flex: 1 }}>
          {menuItems.map(item => (
            <div
              key={item.route}
              onClick={() => onNavigate(item.route)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                backgroundColor: currentRoute === item.route ? '#1890ff' : 'transparent',
                borderRadius: currentRoute === item.route ? '6px' : '0',
                margin: currentRoute === item.route ? '0 8px' : '0',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.3s'
              }}
            >
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              {!sidebarCollapsed() && (
                <span style={{ fontSize: '14px' }}>{item.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          height: '64px',
          backgroundColor: 'white',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px'
        }}>
          <div style={{ 
            fontSize: s.sizes.fontSize.heading(3),
            color: s.colors.text.normal() 
          }}>
            {menuItems.find(item => item.route === currentRoute)?.label || '宿舍管理系统'}
          </div>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <span style={{ color: s.colors.text.normal(false, 'description') }}>
              {currentUser.studentId}
            </span>
            <Button>
              退出登录
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div style={{
          flex: 1,
          padding: '24px',
          backgroundColor: '#f5f5f5',
          overflow: 'auto'
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}