/** @jsx createElement */
import { createElement, atom, computed } from 'axii'
import { Button } from './ui'
import { User, PageRoute, DormitoryMember } from '../types'
import { interactionSDK } from '../utils/interactionSDK'
import './Layout.css'

interface LayoutProps {
  currentRoute: PageRoute
  onNavigate: (route: PageRoute) => void
  children: any
}

interface NavItem {
  label: string
  route: PageRoute
  icon: string
}

export function Layout({ currentRoute, onNavigate, children }: LayoutProps) {
  const currentUser = atom<User | null>(null)
  const userMembership = atom<DormitoryMember | null>(null)
  const sidebarCollapsed = atom(false)
  const loading = atom(true)

  // 获取当前用户信息
  const loadUserData = async () => {
    try {
      loading(true)
      const userId = interactionSDK.getCurrentUserId()
      
      if (!userId) {
        console.error('No user ID found in URL')
        return
      }

      // 从后端获取用户信息
      const users = await interactionSDK.getUsers({ 
        where: { id: userId }
      })
      if (users.length > 0) {
        currentUser(users[0])
        
        // 获取用户的宿舍成员身份
        try {
          const membership = await interactionSDK.getUserMembership(users[0].id)
          userMembership(membership)
        } catch (err) {
          console.error('Failed to get user membership:', err)
        }
      } else {
        console.error('User not found:', userId)
      }
    } catch (err) {
      console.error('Failed to load user data:', err)
    } finally {
      loading(false)
    }
  }
  
  // 立即加载用户数据
  loadUserData()

  const isLeader = computed(() => {
    const membership = userMembership()
    return membership && membership.role === 'leader'
  })

  const navItems = computed(() => {
    const user = currentUser()
    if (!user) return []
    
    const commonItems: NavItem[] = [
      { label: '仪表盘', route: '/dashboard', icon: '📊' },
      { label: '学生门户', route: '/student', icon: '🎓' },
    ]
    
    if (user.role === 'admin') {
      return [
        ...commonItems,
        { label: '宿舍管理', route: '/admin/dormitories', icon: '🏠' },
        { label: '申请管理', route: '/applications', icon: '📝' },
        { label: '成员管理', route: '/members', icon: '👥' },
        { label: '积分管理', route: '/scores', icon: '⭐' },
        { label: '报表中心', route: '/admin/reports', icon: '📈' }
      ]
    }
    
    // 宿舍长菜单
    if (isLeader()) {
      return [
        ...commonItems,
        { label: '申请管理', route: '/applications', icon: '📝' },
        { label: '成员管理', route: '/members', icon: '👥' },
        { label: '积分管理', route: '/scores', icon: '⭐' },
      ]
    }
    
    // 普通学生菜单
    return commonItems
  }) as () => NavItem[]

  const toggleSidebar = () => {
    sidebarCollapsed(!sidebarCollapsed())
  }

  const sidebarClass = computed(() => {
    return `sidebar ${sidebarCollapsed() ? 'sidebar-collapsed' : ''}`
  })

  const navItemClass = (route: PageRoute) => {
    return `sidebar-nav-item ${currentRoute === route ? 'active' : ''}`
  }

  const renderContent = () => {
    const user = currentUser()
    
    if (loading()) {
      return (
        <div className="layout-loading">
          <div className="loading-spinner"></div>
        </div>
      )
    }
    
    if (!user) {
      return (
        <div className="layout-error">
          <p>无法加载用户信息，请确保URL中包含userId参数</p>
        </div>
      )
    }

    return (
      <div className="layout">
        {/* Sidebar */}
        <aside className={() => sidebarClass()}>
          {/* Logo and Toggle */}
          <div className="sidebar-header">
            {() => !sidebarCollapsed() && (
              <div className="sidebar-logo">
                <span className="sidebar-logo-icon">🏠</span>
                <span className="sidebar-logo-text">宿舍管理系统</span>
              </div>
            )}
            <button
              className="sidebar-toggle"
              onClick={toggleSidebar}
            >
              ☰
            </button>
          </div>

          {/* User Info */}
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {user.name?.charAt(0)}
            </div>
            {() => !sidebarCollapsed() && (
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user.name}</div>
                <div className="sidebar-user-role">
                  {() => {
                    if (user.role === 'admin') return '管理员'
                    if (isLeader()) return '宿舍长'
                    return '学生'
                  }}
                </div>
              </div>
            )}
          </div>

          {/* Navigation Menu */}
          <nav className="sidebar-nav">
            {() => navItems().map(item => (
              <button
                key={item.route}
                className={navItemClass(item.route)}
                onClick={() => onNavigate(item.route)}
              >
                <span className="sidebar-nav-icon">{item.icon}</span>
                {() => !sidebarCollapsed() && (
                  <span className="sidebar-nav-label">{item.label}</span>
                )}
                {() => item.route === '/applications' && !sidebarCollapsed() && (
                  <span className="sidebar-nav-badge">3</span>
                )}
              </button>
            ))}
          </nav>

          {/* Logout */}
          <div className="sidebar-footer">
            {() => !sidebarCollapsed() && (
              <div className="sidebar-footer-content">
                <button className="sidebar-logout">
                  <span>🚪</span>
                  <span>退出登录</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <div className="main-content">
          {/* Header */}
          <header className="header">
            <div className="header-content">
              <h1 className="header-title">
                {() => navItems().find(item => item.route === currentRoute)?.label || '宿舍管理系统'}
              </h1>
              
              <div className="header-actions">
                <button className="header-notification">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="notification-badge">3</span>
                </button>
                <div className="header-user">
                  <span className="header-user-id">{user.studentId}</span>
                  <div className="header-user-avatar">
                    {user.name?.charAt(0)}
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Content Area */}
          <main className="content">
            <div className="content-wrapper animate-fadeIn">
              {children}
            </div>
          </main>
        </div>
      </div>
    )
  }

  return renderContent
}