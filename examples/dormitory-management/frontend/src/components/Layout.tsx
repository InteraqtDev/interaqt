/** @jsx createElement */
import { createElement, atom, computed } from 'axii'
import { Button } from './ui'
import { User, PageRoute } from '../types'
import { getCurrentUser } from '../utils/mockData'
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
  const currentUser = getCurrentUser()
  const sidebarCollapsed = atom(false)

  const navItems: NavItem[] = [
    { label: '仪表盘', route: '/dashboard', icon: '📊' },
    { label: '学生门户', route: '/student', icon: '🎓' },
    { label: '宿舍管理', route: '/admin/dormitories', icon: '🏠' },
    { label: '申请管理', route: '/applications', icon: '📝' },
    { label: '成员管理', route: '/members', icon: '👥' },
    { label: '积分管理', route: '/scores', icon: '⭐' },
    { label: '报表中心', route: '/admin/reports', icon: '📈' }
  ]

  const toggleSidebar = () => {
    sidebarCollapsed(!sidebarCollapsed())
  }

  const sidebarClass = computed(() => {
    return `sidebar ${sidebarCollapsed() ? 'sidebar-collapsed' : ''}`
  })

  const navItemClass = (route: PageRoute) => {
    return `sidebar-nav-item ${currentRoute === route ? 'active' : ''}`
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
            {currentUser.name.charAt(0)}
          </div>
          {() => !sidebarCollapsed() && (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{currentUser.name}</div>
              <div className="sidebar-user-role">
                {currentUser.role === 'admin' ? '管理员' : '学生'}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className="sidebar-nav">
          {navItems.map(item => (
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
              {navItems.find(item => item.route === currentRoute)?.label || '宿舍管理系统'}
            </h1>
            
            <div className="header-actions">
              <button className="header-notification">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="notification-badge">3</span>
              </button>
              <div className="header-user">
                <span className="header-user-id">{currentUser.studentId}</span>
                <div className="header-user-avatar">
                  {currentUser.name.charAt(0)}
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