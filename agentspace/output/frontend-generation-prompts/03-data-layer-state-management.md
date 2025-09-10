# Phase 3: Data Layer and State Management Agent Prompt

## Agent Role

You are a frontend data architect specializing in reactive state management. Your task is to design and implement a reactive data layer that seamlessly integrates with InterAQT backend APIs using Axii's reactive patterns.

## Context

You are working with:
1. InterAQT backend with reactive computations
2. Axii frontend framework with reactive state
3. Real-time data synchronization requirements
4. Type-safe integration between frontend and backend

## Input Artifacts

- `docs/frontend-requirements.json`: Requirements specification
- `docs/frontend-design-system.json`: Component architecture
- `backend/entities.ts`: Entity type definitions
- `backend/interactions.ts`: Available interactions
- InterAQT API patterns

## Task 1: Data Model Design

### 1.1 Frontend Model Definitions
Create TypeScript models mirroring backend entities:

```typescript
// Example approach
interface UserModel {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  // Computed from backend
  postCount?: number;
  // UI-specific state
  _selected?: boolean;
  _expanded?: boolean;
}
```

### 1.2 Model Factories
Design factories for creating/updating models:
- From API responses
- With default values
- With UI state preservation

### 1.3 Type Generation Strategy
- Import types from backend when possible
- Generate API response types
- Create UI-augmented types

## Task 2: State Store Architecture

### 2.1 Store Structure Design
Using Axii's reactive patterns:

```typescript
// Example reactive store pattern
class EntityStore<T> {
  items = reactive<Map<string, T>>(new Map());
  
  // Reactive computed values
  list = computed(() => Array.from(this.items.values()));
  count = computed(() => this.items.size);
  
  // Reactive filters
  filtered = computed(() => /* filter logic */);
}
```

### 2.2 Store Hierarchy
- Root store containing all domain stores
- Entity-specific stores
- Relationship management
- UI state stores (selection, filters, etc.)

### 2.3 Subscription Management
- WebSocket connections for real-time updates
- Polling strategies for non-real-time data
- Cleanup and lifecycle management

## Task 3: API Integration Layer

### 3.1 API Client Design
Type-safe client for InterAQT backend:

```typescript
// Example API client structure
class InterAQTClient {
  async callInteraction<T>(
    name: string,
    payload: InteractionPayload
  ): Promise<T>;
  
  async query<T>(
    entity: string,
    filter?: QueryFilter
  ): Promise<T[]>;
}
```

### 3.2 Request/Response Handling
- Request queuing and deduplication
- Optimistic updates
- Error handling and retry logic
- Response caching strategies

### 3.3 Real-time Synchronization
- WebSocket event handling
- State patching from server events
- Conflict resolution strategies

## Task 4: Reactive Data Flow

### 4.1 Data Loading Patterns
Implement reactive loading:
- Initial data fetch
- Incremental loading
- Pagination handling
- Background refresh

### 4.2 Mutation Patterns
Handle data changes reactively:
- Optimistic updates with rollback
- Pending state management
- Batch operations
- Undo/redo capabilities

### 4.3 Computed State Management
Mirror backend computations:
- Client-side counts and aggregations
- Derived state calculations
- Memoization strategies

## Deliverable: Data Layer Implementation

Create `frontend/src/data/`:

### 4.1 `models/index.ts`
```typescript
// Auto-generated from backend entities
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
  updatedAt: string;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
  published: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// UI-augmented models
export interface UserUI extends User {
  _selected?: boolean;
  _editing?: boolean;
  posts?: PostUI[];
  postCount?: number;
}

export interface PostUI extends Post {
  _selected?: boolean;
  _expanded?: boolean;
  author?: UserUI;
  commentCount?: number;
}
```

### 4.2 `stores/entityStore.ts`
```typescript
import { reactive, computed } from 'axii';

export class EntityStore<T extends { id: string }> {
  private items = reactive(new Map<string, T>());
  private loading = reactive(false);
  private error = reactive<Error | null>(null);
  
  // Reactive accessors
  get all() {
    return computed(() => Array.from(this.items.values()));
  }
  
  get count() {
    return computed(() => this.items.size);
  }
  
  get isLoading() {
    return this.loading;
  }
  
  // CRUD operations
  async load(fetcher: () => Promise<T[]>) {
    this.loading.value = true;
    try {
      const items = await fetcher();
      items.forEach(item => this.items.set(item.id, item));
    } catch (error) {
      this.error.value = error as Error;
    } finally {
      this.loading.value = false;
    }
  }
  
  upsert(item: T) {
    this.items.set(item.id, item);
  }
  
  remove(id: string) {
    this.items.delete(id);
  }
  
  clear() {
    this.items.clear();
  }
}
```

### 4.3 `stores/rootStore.ts`
```typescript
import { EntityStore } from './entityStore';
import { UserUI, PostUI } from '../models';

export class RootStore {
  users = new EntityStore<UserUI>();
  posts = new EntityStore<PostUI>();
  
  // Relationship management
  linkUserPosts() {
    // Reactive computation to link posts to users
    return computed(() => {
      const users = this.users.all.value;
      const posts = this.posts.all.value;
      
      // Create user->posts mapping
      const userPosts = new Map<string, PostUI[]>();
      posts.forEach(post => {
        if (!userPosts.has(post.authorId)) {
          userPosts.set(post.authorId, []);
        }
        userPosts.get(post.authorId)!.push(post);
      });
      
      // Update user objects with posts
      users.forEach(user => {
        user.posts = userPosts.get(user.id) || [];
        user.postCount = user.posts.length;
      });
    });
  }
}
```

### 4.4 `api/client.ts`
```typescript
import { InteractionPayload, QueryFilter } from './types';

export class InterAQTClient {
  constructor(private baseURL: string) {}
  
  async callInteraction<T = any>(
    name: string,
    payload: InteractionPayload
  ): Promise<T> {
    const response = await fetch(`${this.baseURL}/api/interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, payload })
    });
    
    if (!response.ok) {
      throw new Error(`Interaction failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  async query<T = any>(
    entity: string,
    filter?: QueryFilter
  ): Promise<T[]> {
    const params = filter ? new URLSearchParams(filter as any) : '';
    const response = await fetch(
      `${this.baseURL}/api/query/${entity}?${params}`
    );
    
    if (!response.ok) {
      throw new Error(`Query failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  subscribeToUpdates(
    entity: string,
    callback: (event: any) => void
  ): () => void {
    const ws = new WebSocket(`${this.baseURL}/ws`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.entity === entity) {
        callback(data);
      }
    };
    
    return () => ws.close();
  }
}
```

### 4.5 Configuration Document

Create `docs/data-layer-config.json`:

```json
{
  "metadata": {
    "timestamp": "YYYY-MM-DD HH:mm:ss",
    "version": "1.0.0"
  },
  "stores": {
    "entities": {
      "User": {
        "store": "users",
        "model": "UserUI",
        "realtime": true,
        "computedFields": ["postCount"],
        "relationships": {
          "posts": { "type": "1:n", "target": "Post" }
        }
      },
      "Post": {
        "store": "posts", 
        "model": "PostUI",
        "realtime": true,
        "computedFields": ["commentCount"],
        "relationships": {
          "author": { "type": "n:1", "target": "User" },
          "comments": { "type": "1:n", "target": "Comment" }
        }
      }
    }
  },
  "api": {
    "baseURL": "/api",
    "websocket": "/ws",
    "authentication": "bearer-token",
    "retry": {
      "attempts": 3,
      "backoff": "exponential"
    }
  },
  "caching": {
    "strategy": "memory",
    "ttl": 300,
    "invalidation": "event-based"
  },
  "optimizations": {
    "batchRequests": true,
    "debounceMs": 300,
    "optimisticUpdates": true
  }
}
```

## Validation Checklist

Before completing:
- [ ] All backend entities have frontend models
- [ ] Type safety maintained throughout
- [ ] Reactive stores implement CRUD operations
- [ ] API client handles all interaction types
- [ ] Real-time synchronization implemented
- [ ] Relationship management automated
- [ ] Error handling comprehensive
- [ ] Performance optimizations in place

## Next Phase

Output will be used by Phase 4 (Component Implementation) to build UI components with reactive data bindings.
