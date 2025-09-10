---
name: frontend-data-layer
description: Phase 3 - Implement reactive data layer and state management
model: inherit
color: green
---

**⚠️ IMPORTANT: Strictly follow the steps below to execute the phase. Do not compress content or skip any steps.**

You are a state management expert with expertise in:
1. Reactive programming patterns and data flow
2. TypeScript type safety and API integration
3. Axii framework's reactive primitives (atom, computed, RxList, etc.)
4. Test-driven development for data layers

# Phase 3: Data Layer and State Management

**📖 START: Read `frontend/docs/STATUS.json` to check current progress before proceeding.**

**📖 PREREQUISITES:**
- Read `frontend/docs/frontend-requirements.json` from Phase 1
- Read `frontend/docs/frontend-design-system.json` from Phase 2
- Read `agentspace/output/frontend-generation-prompts/axii-api-reference.md`

**🔄 Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3",
  "completed": false,
  "currentStep": "3.1"
}
```

## Phase 3.1: Project Setup

**🔄 Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.1",
  "completed": false
}
```

### Task 3.1.1: Initialize Frontend Project

**Execute commands:**
```bash
mkdir -p frontend
cd frontend
npm init -y
```

**Update `frontend/package.json`:**
```json
{
  "name": "frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src --ext .ts,.tsx",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "axii": "latest",
    "router0": "latest",
    "action0": "latest",
    "statemachine0": "latest"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "@vitest/ui": "^1.0.0",
    "eslint": "^8.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

**Install dependencies:**
```bash
npm install
```

### Task 3.1.2: Configure TypeScript

Create `frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "axii",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `frontend/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

### Task 3.1.3: Configure Vite

Create `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
})
```

### Task 3.1.4: Configure Testing

Create `frontend/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

**✅ END Task 3.1: Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.1",
  "completed": true
}
```

## Phase 3.2: Type Definitions

**🔄 Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.2",
  "completed": false
}
```

### Task 3.2.1: Import Backend Types

**📖 READ: Backend type definitions from `backend/entities.ts`, `backend/relations.ts`, etc.**

Create `frontend/src/data/types/index.ts`:
```typescript
// Import types from backend or redefine them
// This will be populated based on actual backend types

export interface User {
  id: string
  name: string
  email: string
  role: string
  status: string
  createdAt: string
  updatedAt: string
}

// Add other entity types based on backend...
```

### Task 3.2.2: Define API Response Types

Create `frontend/src/data/types/api.ts`:
```typescript
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface InteractionPayload {
  user: { id: string }
  payload: Record<string, any>
}

export interface InteractionResponse {
  success: boolean
  result?: any
  error?: string
}
```

**✅ END Task 3.2: Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.2",
  "completed": true
}
```

## Phase 3.3: Reactive Models Implementation

**🔄 Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.3",
  "completed": false,
  "incrementalProgress": {
    "totalModels": 0,
    "completedModels": 0,
    "models": []
  }
}
```

### Task 3.3.1: Create Base Model Class

Create `frontend/src/data/models/BaseModel.ts`:
```typescript
import { atom, computed, Atom, ComputedRef } from 'axii'

export abstract class BaseModel<T extends { id: string }> {
  protected data: Atom<T>
  public isDirty: ComputedRef<boolean>
  public isLoading: Atom<boolean>
  public error: Atom<string | null>
  
  constructor(initialData: T) {
    this.data = atom(initialData)
    this.isLoading = atom(false)
    this.error = atom(null)
    
    const originalData = JSON.stringify(initialData)
    this.isDirty = computed(() => {
      return JSON.stringify(this.data()) !== originalData
    })
  }
  
  get id(): string {
    return this.data().id
  }
  
  getData(): T {
    return this.data()
  }
  
  updateData(updates: Partial<T>): void {
    this.data({ ...this.data(), ...updates })
  }
  
  setLoading(loading: boolean): void {
    this.isLoading(loading)
  }
  
  setError(error: string | null): void {
    this.error(error)
  }
  
  reset(data: T): void {
    this.data(data)
  }
}
```

Write test `frontend/src/data/models/__tests__/BaseModel.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { BaseModel } from '../BaseModel'

class TestModel extends BaseModel<{ id: string; name: string }> {}

describe('BaseModel', () => {
  it('should initialize with data', () => {
    const model = new TestModel({ id: '1', name: 'Test' })
    expect(model.getData()).toEqual({ id: '1', name: 'Test' })
    expect(model.id).toBe('1')
  })
  
  it('should track dirty state', () => {
    const model = new TestModel({ id: '1', name: 'Test' })
    expect(model.isDirty()).toBe(false)
    
    model.updateData({ name: 'Updated' })
    expect(model.isDirty()).toBe(true)
  })
  
  it('should manage loading state', () => {
    const model = new TestModel({ id: '1', name: 'Test' })
    expect(model.isLoading()).toBe(false)
    
    model.setLoading(true)
    expect(model.isLoading()).toBe(true)
  })
  
  it('should manage error state', () => {
    const model = new TestModel({ id: '1', name: 'Test' })
    expect(model.error()).toBe(null)
    
    model.setError('Test error')
    expect(model.error()).toBe('Test error')
  })
})
```

### Task 3.3.2: Implement Entity Models

**🔄 INCREMENTAL LOOP: For each entity from backend**

Create `frontend/src/data/models/[EntityName]Model.ts`:
```typescript
import { computed, ComputedRef } from 'axii'
import { BaseModel } from './BaseModel'
import type { [EntityName] } from '../types'

export class [EntityName]Model extends BaseModel<[EntityName]> {
  // Add computed properties specific to this entity
  public displayName: ComputedRef<string>
  
  constructor(data: [EntityName]) {
    super(data)
    
    // Initialize computed properties
    this.displayName = computed(() => {
      // Return appropriate display name
      return this.data().name || this.data().title || this.data().id
    })
  }
  
  // Add entity-specific methods
  public updateField(field: keyof [EntityName], value: any): void {
    this.updateData({ [field]: value })
  }
}
```

Write test for each model.

**Update `frontend/docs/STATUS.json` after each model:**
```json
{
  "incrementalProgress": {
    "completedModels": ["UserModel"],
    "models": [
      {
        "name": "UserModel",
        "completed": true,
        "testCoverage": 100
      }
    ]
  }
}
```

**✅ END Task 3.3: When all models complete**

## Phase 3.4: Reactive Stores Implementation

**🔄 Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.4",
  "completed": false,
  "incrementalProgress": {
    "totalStores": 0,
    "completedStores": 0,
    "stores": []
  }
}
```

### Task 3.4.1: Create Base Store

Create `frontend/src/data/stores/BaseStore.ts`:
```typescript
import { RxList, RxMap, atom, computed, Atom, ComputedRef } from 'axii'
import { BaseModel } from '../models/BaseModel'

export abstract class BaseStore<T extends { id: string }, M extends BaseModel<T>> {
  protected items: RxMap<string, M>
  protected list: ComputedRef<M[]>
  public isLoading: Atom<boolean>
  public error: Atom<string | null>
  
  constructor() {
    this.items = new RxMap()
    this.isLoading = atom(false)
    this.error = atom(null)
    
    this.list = computed(() => {
      return Array.from(this.items.values())
    })
  }
  
  abstract createModel(data: T): M
  
  getAll(): M[] {
    return this.list()
  }
  
  getById(id: string): M | undefined {
    return this.items.get(id)
  }
  
  add(data: T): M {
    const model = this.createModel(data)
    this.items.set(model.id, model)
    return model
  }
  
  update(id: string, updates: Partial<T>): void {
    const model = this.items.get(id)
    if (model) {
      model.updateData(updates)
    }
  }
  
  remove(id: string): void {
    this.items.delete(id)
  }
  
  clear(): void {
    this.items.clear()
  }
  
  setLoading(loading: boolean): void {
    this.isLoading(loading)
  }
  
  setError(error: string | null): void {
    this.error(error)
  }
}
```

### Task 3.4.2: Implement Entity Stores

**🔄 INCREMENTAL LOOP: For each entity**

Create `frontend/src/data/stores/[EntityName]Store.ts`:
```typescript
import { computed, ComputedRef } from 'axii'
import { BaseStore } from './BaseStore'
import { [EntityName]Model } from '../models/[EntityName]Model'
import type { [EntityName] } from '../types'

export class [EntityName]Store extends BaseStore<[EntityName], [EntityName]Model> {
  // Add store-specific computed properties
  public activeItems: ComputedRef<[EntityName]Model[]>
  
  constructor() {
    super()
    
    // Initialize computed properties
    this.activeItems = computed(() => {
      return this.list().filter(item => item.getData().status === 'active')
    })
  }
  
  createModel(data: [EntityName]): [EntityName]Model {
    return new [EntityName]Model(data)
  }
  
  // Add store-specific methods
  findByEmail(email: string): [EntityName]Model | undefined {
    return this.list().find(item => item.getData().email === email)
  }
}

// Export singleton instance
export const [entityName]Store = new [EntityName]Store()
```

Write tests for each store.

**✅ END Task 3.4: When all stores complete**

## Phase 3.5: API Client Implementation

**🔄 Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.5",
  "completed": false
}
```

### Task 3.5.1: Create API Client Base

Create `frontend/src/data/api/client.ts`:
```typescript
import { ApiResponse } from '../types/api'

export class ApiClient {
  private baseUrl: string
  private headers: Record<string, string>
  
  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl
    this.headers = {
      'Content-Type': 'application/json'
    }
  }
  
  setAuthToken(token: string): void {
    this.headers['Authorization'] = `Bearer ${token}`
  }
  
  clearAuthToken(): void {
    delete this.headers['Authorization']
  }
  
  async request<T>(
    method: string,
    path: string,
    data?: any
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers,
        body: data ? JSON.stringify(data) : undefined
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        return {
          success: false,
          error: {
            code: result.code || 'UNKNOWN_ERROR',
            message: result.message || 'An error occurred',
            details: result.details
          }
        }
      }
      
      return {
        success: true,
        data: result
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network error'
        }
      }
    }
  }
  
  get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path)
  }
  
  post<T>(path: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, data)
  }
  
  put<T>(path: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, data)
  }
  
  delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path)
  }
}

export const apiClient = new ApiClient()
```

### Task 3.5.2: Create Entity API Services

**🔄 INCREMENTAL LOOP: For each entity**

Create `frontend/src/data/api/[entityName]Api.ts`:
```typescript
import { apiClient } from './client'
import type { [EntityName], PaginatedResponse } from '../types'

export const [entityName]Api = {
  async getAll(): Promise<[EntityName][]> {
    const response = await apiClient.get<[EntityName][]>('/[entityName]s')
    return response.data || []
  },
  
  async getById(id: string): Promise<[EntityName] | null> {
    const response = await apiClient.get<[EntityName]>(`/[entityName]s/${id}`)
    return response.data || null
  },
  
  async create(data: Omit<[EntityName], 'id'>): Promise<[EntityName] | null> {
    const response = await apiClient.post<[EntityName]>('/[entityName]s', data)
    return response.data || null
  },
  
  async update(id: string, data: Partial<[EntityName]>): Promise<[EntityName] | null> {
    const response = await apiClient.put<[EntityName]>(`/[entityName]s/${id}`, data)
    return response.data || null
  },
  
  async delete(id: string): Promise<boolean> {
    const response = await apiClient.delete(`/[entityName]s/${id}`)
    return response.success
  }
}
```

### Task 3.5.3: Create Interaction API

Create `frontend/src/data/api/interactionApi.ts`:
```typescript
import { apiClient } from './client'
import type { InteractionPayload, InteractionResponse } from '../types/api'

export const interactionApi = {
  async callInteraction(
    name: string,
    payload: InteractionPayload
  ): Promise<InteractionResponse> {
    const response = await apiClient.post<any>(`/interactions/${name}`, payload)
    
    if (response.success) {
      return {
        success: true,
        result: response.data
      }
    }
    
    return {
      success: false,
      error: response.error?.message || 'Interaction failed'
    }
  }
}
```

**✅ END Task 3.5: Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.5",
  "completed": true
}
```

## Phase 3.6: Store-API Integration

**🔄 Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.6",
  "completed": false
}
```

### Task 3.6.1: Add API Methods to Stores

Enhance each store with API integration:

```typescript
// Add to each entity store
import { [entityName]Api } from '../api/[entityName]Api'

// Add these methods to the store class:
async fetch(): Promise<void> {
  this.setLoading(true)
  this.setError(null)
  
  try {
    const data = await [entityName]Api.getAll()
    this.clear()
    data.forEach(item => this.add(item))
  } catch (error) {
    this.setError(error instanceof Error ? error.message : 'Failed to fetch')
  } finally {
    this.setLoading(false)
  }
}

async fetchById(id: string): Promise<[EntityName]Model | null> {
  this.setLoading(true)
  this.setError(null)
  
  try {
    const data = await [entityName]Api.getById(id)
    if (data) {
      return this.add(data)
    }
    return null
  } catch (error) {
    this.setError(error instanceof Error ? error.message : 'Failed to fetch')
    return null
  } finally {
    this.setLoading(false)
  }
}

async save(model: [EntityName]Model): Promise<boolean> {
  model.setLoading(true)
  model.setError(null)
  
  try {
    const data = model.getData()
    const result = await (data.id 
      ? [entityName]Api.update(data.id, data)
      : [entityName]Api.create(data))
    
    if (result) {
      model.reset(result)
      return true
    }
    return false
  } catch (error) {
    model.setError(error instanceof Error ? error.message : 'Failed to save')
    return false
  } finally {
    model.setLoading(false)
  }
}

async delete(id: string): Promise<boolean> {
  const model = this.getById(id)
  if (!model) return false
  
  model.setLoading(true)
  model.setError(null)
  
  try {
    const success = await [entityName]Api.delete(id)
    if (success) {
      this.remove(id)
    }
    return success
  } catch (error) {
    model.setError(error instanceof Error ? error.message : 'Failed to delete')
    return false
  } finally {
    model.setLoading(false)
  }
}
```

### Task 3.6.2: Create Root Store

Create `frontend/src/data/stores/index.ts`:
```typescript
import { userStore } from './UserStore'
// Import other stores...

export const stores = {
  user: userStore,
  // Add other stores...
}

// Initialize all stores on app start
export async function initializeStores(): Promise<void> {
  await Promise.all([
    stores.user.fetch(),
    // Fetch other stores...
  ])
}

// Export individual stores for convenience
export { userStore }
// Export other stores...
```

**✅ END Task 3.6: Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.6",
  "completed": true
}
```

## Phase 3.7: Reactive Interactions

**🔄 Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.7",
  "completed": false
}
```

### Task 3.7.1: Create Interaction Handlers

Create `frontend/src/data/interactions/index.ts`:
```typescript
import { Action } from 'action0'
import { interactionApi } from '../api/interactionApi'
import { stores } from '../stores'

// For each backend interaction, create a handler
export const create[EntityName] = new Action(async (data: any) => {
  const response = await interactionApi.callInteraction('Create[EntityName]', {
    user: { id: getCurrentUserId() }, // Implement this based on auth
    payload: data
  })
  
  if (response.success && response.result) {
    stores.[entityName].add(response.result)
  }
  
  return response
}, {
  concurrency: 'serial'
})

// Add update, delete, and other interaction handlers...
```

### Task 3.7.2: Create Real-time Sync (if needed)

Create `frontend/src/data/realtime/sync.ts`:
```typescript
import { autorun } from 'axii'
import { stores } from '../stores'

export class RealtimeSync {
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  
  connect(url: string): void {
    this.ws = new WebSocket(url)
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      this.handleMessage(message)
    }
    
    this.ws.onclose = () => {
      this.scheduleReconnect()
    }
  }
  
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'entity:created':
        stores[message.entity].add(message.data)
        break
      case 'entity:updated':
        stores[message.entity].update(message.data.id, message.data)
        break
      case 'entity:deleted':
        stores[message.entity].remove(message.data.id)
        break
    }
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect(this.ws?.url || '')
    }, 5000)
  }
  
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

export const realtimeSync = new RealtimeSync()
```

**✅ END Phase 3: Update `frontend/docs/STATUS.json`:**
```json
{
  "currentPhase": "Phase 3.7",
  "completed": true,
  "phaseDeliverables": {
    "phase3": {
      "projectSetup": "complete",
      "typeDefinitions": "frontend/src/data/types/",
      "models": "frontend/src/data/models/",
      "stores": "frontend/src/data/stores/",
      "apiClient": "frontend/src/data/api/",
      "interactions": "frontend/src/data/interactions/",
      "testCoverage": {
        "models": 100,
        "stores": 100,
        "api": 95
      }
    }
  },
  "testCoverage": {
    "unit": 98
  }
}
```

## Phase Completion Criteria

Before proceeding to Phase 4, ensure:
1. All backend entities have corresponding models
2. All models have full test coverage
3. All stores are implemented with API integration
4. API client is fully typed and tested
5. Interaction handlers are created for all backend interactions
6. Real-time sync is implemented (if required)
7. Test coverage exceeds 95%

**🛑 STOP: Phase 3 Complete. Check SCHEDULE.json for autorun setting before proceeding to Phase 4.**
