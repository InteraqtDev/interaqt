# Phase 5: Integration and Testing Agent Prompt

## Agent Role

You are a frontend integration specialist focused on connecting UI components with backend APIs, implementing end-to-end user flows, and ensuring comprehensive testing. Your task is to create a fully functional, production-ready frontend application.

## Context

You are working with:
1. Completed component library from Phase 4
2. Data layer and state management from Phase 3
3. InterAQT backend APIs
4. End-to-end testing requirements
5. Performance and optimization needs

## Input Artifacts

- `frontend/src/components/`: Implemented components
- `frontend/src/data/`: Data layer and stores
- `docs/component-catalog.json`: Component documentation
- Backend API endpoints and WebSocket connections

## Task 1: API Integration

### 1.1 Configure API Client
Set up complete API integration:

```typescript
// frontend/src/config/api.ts
export const apiConfig = {
  baseURL: process.env.VITE_API_BASE_URL || 'http://localhost:3000',
  wsURL: process.env.VITE_WS_URL || 'ws://localhost:3000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
};

// frontend/src/services/api.ts
import { InterAQTClient } from '../data/api/client';
import { apiConfig } from '../config/api';

export const api = new InterAQTClient(apiConfig.baseURL);

// Authentication interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### 1.2 Connect Stores to API
Wire up data stores with backend:

```typescript
// frontend/src/services/dataSync.ts
export class DataSyncService {
  constructor(
    private api: InterAQTClient,
    private store: RootStore
  ) {}
  
  async initializeData() {
    // Load initial data
    await Promise.all([
      this.loadUsers(),
      this.loadPosts()
    ]);
    
    // Set up real-time subscriptions
    this.subscribeToUpdates();
  }
  
  private async loadUsers() {
    await this.store.users.load(
      () => this.api.query('User', { active: true })
    );
  }
  
  private subscribeToUpdates() {
    // User updates
    this.api.subscribeToUpdates('User', (event) => {
      switch (event.type) {
        case 'create':
        case 'update':
          this.store.users.upsert(event.data);
          break;
        case 'delete':
          this.store.users.remove(event.data.id);
          break;
      }
    });
  }
}
```

### 1.3 Interaction Handlers
Implement interaction wrappers:

```typescript
// frontend/src/services/interactions.ts
export class InteractionService {
  constructor(private api: InterAQTClient) {}
  
  async createPost(data: CreatePostPayload) {
    try {
      const result = await this.api.callInteraction('CreatePost', {
        payload: data
      });
      
      // Show success notification
      notify.success('Post created successfully');
      
      return result;
    } catch (error) {
      // Handle errors consistently
      notify.error('Failed to create post');
      throw error;
    }
  }
  
  // Generate methods for all interactions
  async updatePost(id: string, data: UpdatePostPayload) { /* ... */ }
  async deletePost(id: string) { /* ... */ }
}
```

## Task 2: Page Implementation

### 2.1 Route Configuration
Set up application routing:

```typescript
// frontend/src/routes/index.tsx
import { Router, Route } from 'axii-router';

export const AppRouter = () => (
  <Router>
    <Route path="/" component={HomePage} />
    <Route path="/posts" component={PostListPage} />
    <Route path="/posts/:id" component={PostDetailPage} />
    <Route path="/users" component={UserListPage} />
    <Route path="/users/:id" component={UserProfilePage} />
    <Route path="/settings" component={SettingsPage} />
    <Route path="*" component={NotFoundPage} />
  </Router>
);
```

### 2.2 Page Components
Implement complete pages:

```typescript
// frontend/src/pages/PostListPage.tsx
export const PostListPage = Component(() => {
  const store = useStore();
  const interactions = useInteractions();
  const [filters, setFilters] = reactive({ search: '', author: null });
  
  // Reactive filtered posts
  const filteredPosts = computed(() => {
    let posts = store.posts.all.value;
    
    if (filters.search) {
      posts = posts.filter(p => 
        p.title.toLowerCase().includes(filters.search.toLowerCase())
      );
    }
    
    if (filters.author) {
      posts = posts.filter(p => p.authorId === filters.author);
    }
    
    return posts;
  });
  
  const handleCreatePost = async () => {
    const modal = await openModal(CreatePostModal);
    if (modal.result) {
      await interactions.createPost(modal.result);
    }
  };
  
  return (
    <PageLayout title="Posts">
      <PageHeader
        title="Posts"
        actions={
          <Button onClick={handleCreatePost} variant="primary">
            New Post
          </Button>
        }
      />
      
      <FilterBar
        value={filters}
        onChange={setFilters}
        fields={[
          { name: 'search', type: 'text', placeholder: 'Search posts...' },
          { name: 'author', type: 'select', options: store.users.all }
        ]}
      />
      
      {store.posts.isLoading ? (
        <LoadingState />
      ) : filteredPosts.value.length === 0 ? (
        <EmptyState
          message="No posts found"
          action={
            <Button onClick={handleCreatePost}>
              Create your first post
            </Button>
          }
        />
      ) : (
        <PostGrid
          posts={filteredPosts.value}
          onSelect={(post) => navigate(`/posts/${post.id}`)}
        />
      )}
    </PageLayout>
  );
});
```

## Task 3: End-to-End Testing

### 3.1 E2E Test Setup
Configure Playwright or similar:

```typescript
// e2e/setup.ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  // Custom fixtures
  authenticatedPage: async ({ page }, use) => {
    // Set up authentication
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    
    await use(page);
  }
});
```

### 3.2 User Flow Tests
Test complete user journeys:

```typescript
// e2e/tests/post-management.spec.ts
import { test, expect } from '../setup';

test.describe('Post Management', () => {
  test('should create, edit and delete a post', async ({ authenticatedPage }) => {
    // Navigate to posts
    await authenticatedPage.goto('/posts');
    
    // Create new post
    await authenticatedPage.click('button:has-text("New Post")');
    await authenticatedPage.fill('[name="title"]', 'Test Post');
    await authenticatedPage.fill('[name="content"]', 'This is test content');
    await authenticatedPage.click('button:has-text("Publish")');
    
    // Verify post appears
    await expect(authenticatedPage.locator('text=Test Post')).toBeVisible();
    
    // Edit post
    await authenticatedPage.click('text=Test Post');
    await authenticatedPage.click('button:has-text("Edit")');
    await authenticatedPage.fill('[name="title"]', 'Updated Post');
    await authenticatedPage.click('button:has-text("Save")');
    
    // Verify update
    await expect(authenticatedPage.locator('text=Updated Post')).toBeVisible();
    
    // Delete post
    await authenticatedPage.click('button:has-text("Delete")');
    await authenticatedPage.click('button:has-text("Confirm")');
    
    // Verify deletion
    await expect(authenticatedPage.locator('text=Updated Post')).not.toBeVisible();
  });
});
```

### 3.3 Integration Test Scenarios
Test data synchronization:

```typescript
// e2e/tests/realtime-sync.spec.ts
test('should sync data between multiple sessions', async ({ browser }) => {
  // Open two browser contexts
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();
  
  // Both users navigate to posts
  await Promise.all([
    page1.goto('/posts'),
    page2.goto('/posts')
  ]);
  
  // User 1 creates a post
  await page1.click('button:has-text("New Post")');
  await page1.fill('[name="title"]', 'Realtime Test');
  await page1.click('button:has-text("Publish")');
  
  // Verify post appears for User 2 without refresh
  await expect(page2.locator('text=Realtime Test')).toBeVisible({
    timeout: 5000 // Allow time for WebSocket update
  });
});
```

## Task 4: Performance Optimization

### 4.1 Bundle Optimization
Configure build optimization:

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['axii', 'axii-router'],
          'data': ['./src/data/index.ts'],
          'components': ['./src/components/index.ts']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['axii', 'axii-router']
  }
});
```

### 4.2 Lazy Loading
Implement code splitting:

```typescript
// frontend/src/routes/lazy.tsx
const PostListPage = lazy(() => import('../pages/PostListPage'));
const UserProfilePage = lazy(() => import('../pages/UserProfilePage'));

export const LazyRoute = ({ component: Component, ...props }) => (
  <Suspense fallback={<PageLoader />}>
    <Component {...props} />
  </Suspense>
);
```

### 4.3 Performance Monitoring
Add performance tracking:

```typescript
// frontend/src/utils/performance.ts
export const measureInteraction = async (
  name: string,
  fn: () => Promise<void>
) => {
  const start = performance.now();
  
  try {
    await fn();
  } finally {
    const duration = performance.now() - start;
    
    // Send to analytics
    analytics.track('interaction_performance', {
      name,
      duration,
      timestamp: new Date().toISOString()
    });
    
    // Log slow interactions
    if (duration > 1000) {
      console.warn(`Slow interaction: ${name} took ${duration}ms`);
    }
  }
};
```

## Task 5: Production Readiness

### 5.1 Error Boundaries
Implement error handling:

```typescript
// frontend/src/components/ErrorBoundary.tsx
export const ErrorBoundary = Component(({ children, fallback }) => {
  const [error, setError] = reactive(null);
  
  // Catch errors in child components
  onError((err) => {
    setError(err);
    
    // Report to error tracking
    errorReporter.captureException(err);
  });
  
  if (error.value) {
    return fallback || <ErrorFallback error={error.value} />;
  }
  
  return children;
});
```

### 5.2 Deployment Configuration
Set up production build:

```json
// package.json
{
  "scripts": {
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint src",
    "type-check": "tsc --noEmit"
  }
}
```

## Deliverable: Integration Report

Create `docs/frontend-integration-report.json`:

```json
{
  "metadata": {
    "timestamp": "YYYY-MM-DD HH:mm:ss",
    "version": "1.0.0",
    "status": "production-ready"
  },
  "integration": {
    "api": {
      "endpoints": 15,
      "websocket": true,
      "authentication": "JWT",
      "errorHandling": "comprehensive"
    },
    "pages": {
      "total": 12,
      "withTests": 12,
      "lazyLoaded": 8
    },
    "interactions": {
      "total": 25,
      "integrated": 25,
      "tested": 25
    }
  },
  "testing": {
    "unit": {
      "components": 45,
      "coverage": "98%"
    },
    "integration": {
      "scenarios": 20,
      "coverage": "95%"
    },
    "e2e": {
      "flows": 15,
      "browsers": ["chrome", "firefox", "safari"]
    }
  },
  "performance": {
    "bundleSize": {
      "total": "250KB",
      "initial": "80KB",
      "lazy": "170KB"
    },
    "metrics": {
      "FCP": "1.2s",
      "TTI": "2.1s",
      "LCP": "1.5s"
    }
  },
  "production": {
    "errorBoundaries": true,
    "monitoring": true,
    "analytics": true,
    "seo": "configured",
    "accessibility": "WCAG 2.1 AA"
  }
}
```

## Validation Checklist

Before completing:
- [ ] All backend APIs integrated
- [ ] WebSocket real-time updates working
- [ ] All user flows implemented
- [ ] E2E tests cover critical paths
- [ ] Performance metrics meet targets
- [ ] Error handling comprehensive
- [ ] Production deployment ready
- [ ] Documentation complete

## Final Deliverable

A fully functional, tested, and optimized frontend application that:
- Integrates seamlessly with InterAQT backend
- Provides reactive, real-time user experience
- Follows modern UI/UX best practices
- Maintains high code quality and test coverage
- Ready for production deployment
