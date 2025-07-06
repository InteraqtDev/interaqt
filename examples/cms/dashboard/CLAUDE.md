# Axii Framework Guide for LLMs

## Overview
Axii is a reactive frontend framework that provides powerful features without Virtual DOM. This guide helps LLMs understand and correctly use Axii's features.

## Core Concepts

### 1. Reactive Data Structures
Axii provides several reactive data structures:

```typescript
import { atom, RxList, RxMap, RxSet, computed } from 'axii'

// Atomic data - treated as a whole
const count = atom(0)
const name = atom('John')

// Reactive collections
const items = new RxList([1, 2, 3])
const userMap = new RxMap([['id1', { name: 'John' }]])
const tags = new RxSet(['react', 'vue'])

// Computed values - recalculated when dependencies change
const doubled = computed(() => count() * 2)
```

### 2. Component Structure
```typescript
import { RenderContext } from 'axii'

type ComponentProps = {
  title: string
  count: number
}

export function MyComponent(props: ComponentProps, { createElement }: RenderContext) {
  const { title, count } = props
  
  // Component logic here
  
  return <div>{title}: {count}</div>
}
```

## Advanced Style System

### 1. Basic Styling
Axii supports advanced CSS features directly in style objects:

```typescript
const containerStyle = {
  // Standard properties
  margin: 10,
  padding: [10, 20], // Array format: [vertical, horizontal]
  
  // Nested selectors
  '& span': {
    color: 'red'
  },
  
  // Pseudo-classes
  '&:hover': {
    backgroundColor: 'blue'
  },
  
  // Media queries
  '@media (max-width: 600px)': {
    fontSize: 14
  }
}
```

### 2. Dynamic Styles with Reactive Data
```typescript
const isActive = atom(false)

const dynamicStyle = () => ({
  backgroundColor: isActive() ? '#3b82f6' : '#1a1a1a',
  transform: isActive() ? 'scale(1.1)' : 'scale(1)',
  transition: 'all 0.3s ease'
})

// Usage
<div style={dynamicStyle()}>Content</div>
```

### 3. Keyframe Animations
```typescript
const spinnerStyle = {
  '@keyframes': {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(359deg)' }
  },
  animation: '@self 2s linear infinite', // @self references the keyframe
  width: 50,
  height: 50
}
```

### 4. Complex Transitions
```typescript
const transitionStyle = {
  transition: [
    'background-color 0.3s ease',
    'transform 0.2s ease-out',
    'opacity 0.3s ease'
  ],
  '&:hover': {
    backgroundColor: '#60a5fa',
    transform: 'translateY(-2px)',
    opacity: 0.9
  }
}
```

## Router0 - Routing System

### 1. Basic Router Setup
```typescript
import { Router, createMemoryHistory } from 'router0'
import { atom, ContextProvider } from 'axii'

// Define routes
const router = new Router([
  {
    path: '/dashboard',
    handler: DashboardPanel,
  },
  {
    path: '/entities',
    handler: EntityPanel,
  },
  {
    path: '/interactions',
    handler: InteractionsPanel,
  },
  {
    path: '/',
    redirect: '/dashboard', // Default route
  }
], createMemoryHistory())

// Track current path
const currentPath = atom(router.history.location.pathname)

// Listen for route changes
router.history.listen((event) => {
  currentPath(event.location.pathname)
})
```

### 2. Navigation Component
```typescript
function Navigation({ router, currentPath }, { createElement }: RenderContext) {
  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/entities', label: 'Entities & Relations', icon: '🔗' },
    { path: '/interactions', label: 'Interactions', icon: '⚡' }
  ]
  
  const navItemStyle = (isActive: boolean) => ({
    padding: '12px 20px',
    cursor: 'pointer',
    backgroundColor: isActive ? '#3b82f6' : 'transparent',
    color: isActive ? '#fff' : '#9ca3af',
    transition: 'all 0.2s ease',
    '&:hover': {
      backgroundColor: isActive ? '#3b82f6' : '#374151',
      color: '#fff'
    }
  })
  
  return (
    <nav>
      {navItems.map(item => (
        <div
          key={item.path}
          style={navItemStyle(currentPath() === item.path)}
          onClick={() => router.navigate(item.path)}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ))}
    </nav>
  )
}
```

### 3. Route Parameters and Nested Routes
```typescript
// Define parameterized routes
const router = new Router([
  {
    path: '/entity/:id',
    handler: EntityDetail,
  },
  {
    path: '/entity/:id/relations',
    handler: EntityRelations,
  }
])

// Access parameters in component
function EntityDetail({ params }, { createElement }: RenderContext) {
  const entityId = params.id
  // Use entityId to fetch and display entity details
}

// Create nested router
const subRouter = router.derive(router.path())
```

## Reactive Lists and Collections

### 1. RxList Mapping
```typescript
const todos = new RxList([
  { id: 1, text: 'Learn Axii', done: false },
  { id: 2, text: 'Build Dashboard', done: false }
])

// Map to DOM elements
<ul>
  {todos.map(todo => (
    <li key={todo.id}>
      <input 
        type="checkbox" 
        checked={todo.done}
        onChange={(e) => todo.done = e.target.checked}
      />
      {todo.text}
    </li>
  ))}
</ul>
```

### 2. RxList APIs for Incremental Updates
```typescript
// Prefer using RxList APIs for performance
const items = new RxList([1, 2, 3])

// Incremental operations - efficient
items.push(4)
items.splice(1, 1)
items.unshift(0)

// Filter with incremental updates
const filtered = items.filter(item => item > 2)

// Sort with incremental updates
const sorted = items.sort((a, b) => b - a)
```

### 3. Selection Pattern
```typescript
import { createSelection } from 'axii'

// Single selection
const list = new RxList(['Option 1', 'Option 2', 'Option 3'])
const selected = atom(null)
const selectable = createSelection(list, selected)

// Multiple selection
const multiSelected = new RxSet([])
const multiSelectable = createSelection(list, multiSelected)
```

## Component Patterns

### 1. Context Usage
```typescript
import { ContextProvider, useContext } from 'axii'

// Define context
const ThemeContext = createContext()

// Provider
function App() {
  const theme = atom('dark')
  
  return (
    <ContextProvider contextType={ThemeContext} value={theme}>
      <Dashboard />
    </ContextProvider>
  )
}

// Consumer
function ThemedButton(props, { createElement, useContext }: RenderContext) {
  const theme = useContext(ThemeContext)
  
  const style = () => ({
    backgroundColor: theme() === 'dark' ? '#1a1a1a' : '#ffffff',
    color: theme() === 'dark' ? '#ffffff' : '#1a1a1a'
  })
  
  return <button style={style()}>Click me</button>
}
```

### 2. Side Effects
```typescript
function DataFetcher(props, { createElement, useLayoutEffect }: RenderContext) {
  const data = atom(null)
  const loading = atom(true)
  
  useLayoutEffect(() => {
    // Fetch data
    fetchData().then(result => {
      data(result)
      loading(false)
    })
    
    // Cleanup
    return () => {
      // Cancel requests, clear timers, etc.
    }
  })
  
  return loading() ? <div>Loading...</div> : <div>{data()}</div>
}
```

### 3. Portal Pattern
```typescript
import { createPortal } from 'axii'

function Modal({ visible, onClose }, { createElement }: RenderContext) {
  if (!visible()) return null
  
  return createPortal(
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <button onClick={onClose}>×</button>
        <div>Modal Content</div>
      </div>
    </div>,
    document.body
  )
}
```

## Best Practices

### 1. State Management
- Use `atom` for primitive values
- Use `RxList/RxMap/RxSet` for collections
- Use `computed` for derived values
- Prefer incremental APIs over full recalculation

### 2. Performance
- Use RxList methods (push, splice, etc.) instead of reassigning
- Use `computed` for expensive calculations
- Use `useLayoutEffect` for DOM measurements

### 3. Styling
- Define styles as objects or functions (for reactive styles)
- Use nested selectors and pseudo-classes
- Leverage keyframe animations with `@self`
- Use array format for multiple transitions

### 4. Routing
- Use router0 for SPA routing
- Track current path with reactive data
- Use nested routers for complex layouts
- Handle route parameters properly

## Common Mistakes to Avoid

### 1. Incorrect Style Usage
```typescript
// ❌ Wrong - using plain string
<div style="color: red">Text</div>

// ✅ Correct - using object
<div style={{ color: 'red' }}>Text</div>

// ❌ Wrong - not using function for reactive styles
<div style={{ color: isActive() ? 'red' : 'blue' }}>Text</div>

// ✅ Correct - using function for reactive styles
<div style={() => ({ color: isActive() ? 'red' : 'blue' })}>Text</div>
```

### 2. Incorrect Reactive Data Usage
```typescript
// ❌ Wrong - directly mutating atom
const count = atom(0)
count++ // Wrong!

// ✅ Correct - calling atom as function
count(count() + 1)

// ❌ Wrong - reassigning RxList
const list = new RxList([1, 2, 3])
list = new RxList([1, 2, 3, 4]) // Wrong!

// ✅ Correct - using RxList methods
list.push(4)
```

### 3. Router Usage
```typescript
// ❌ Wrong - not tracking path reactively
let currentPath = router.history.location.pathname

// ✅ Correct - using reactive atom
const currentPath = atom(router.history.location.pathname)
router.history.listen((event) => {
  currentPath(event.location.pathname)
})
```

## Example: Complete Dashboard Component

```typescript
import { atom, RxList, ContextProvider, RenderContext } from 'axii'
import { Router, createMemoryHistory } from 'router0'

export function Dashboard({ entities, relations }, { createElement }: RenderContext) {
  // Router setup
  const router = new Router([
    { path: '/entities', handler: EntityPanel },
    { path: '/interactions', handler: InteractionPanel },
    { path: '/', redirect: '/entities' }
  ], createMemoryHistory())
  
  const currentPath = atom(router.history.location.pathname)
  router.history.listen(event => currentPath(event.location.pathname))
  
  // Theme
  const isDarkMode = atom(true)
  
  // Styles using advanced features
  const containerStyle = () => ({
    display: 'flex',
    height: '100vh',
    backgroundColor: isDarkMode() ? '#0f0f0f' : '#ffffff',
    color: isDarkMode() ? '#ffffff' : '#0f0f0f',
    transition: 'background-color 0.3s ease, color 0.3s ease'
  })
  
  const sidebarStyle = {
    width: 260,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 20,
    '& nav': {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }
  
  return (
    <div style={containerStyle()}>
      <aside style={sidebarStyle}>
        <Navigation router={router} currentPath={currentPath} />
      </aside>
      <main style={{ flex: 1, padding: 24 }}>
        <RouterView router={router} />
      </main>
    </div>
  )
}
```

This guide provides comprehensive coverage of Axii's features. Always refer to these patterns and best practices when generating Axii code. 