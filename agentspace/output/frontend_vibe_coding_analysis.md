# 前端 Vibe Coding Agent Prompt 分析与建议

## 方案分析

### 核心理念评估

你提出的方案具有以下特点：

1. **数据与视图分离**：这是一个成熟的架构模式，有利于关注点分离
2. **全局数据树**：类似 Redux/MobX 的单一数据源思想
3. **数据修改集中化**：所有数据操作通过 model 进行，保证数据流的可追踪性
4. **灵活的更新策略**：允许根据业务场景选择不同的数据同步方式

### 潜在问题与建议

#### 1. 性能考虑
- **问题**：全局数据树可能导致不必要的重渲染
- **建议**：
  - 实现精细的订阅机制，组件只订阅需要的数据片段
  - 考虑使用 immutable 数据结构或 proxy-based 响应式系统
  - 引入 selector 模式来优化数据读取

#### 2. 数据同步复杂性
- **问题**：三种更新策略（接口返回、重新获取、本地计算）可能导致状态不一致
- **建议**：
  - 建立清晰的同步策略选择指南
  - 实现乐观更新（Optimistic UI）机制
  - 添加冲突解决策略

#### 3. 类型安全
- **问题**：全局数据树可能失去 TypeScript 的类型推导优势
- **建议**：
  - 使用强类型的 store 定义
  - 生成类型安全的 selector 和 action
  - 考虑使用 code generation 生成类型定义

#### 4. 开发体验
- **问题**：数据和视图分离可能增加开发时的心智负担
- **建议**：
  - 提供清晰的文件组织结构
  - 创建开发者工具（DevTools）支持
  - 建立命名约定和最佳实践

## 相关开源方案参考

### 1. 整体架构方案

#### Redux Toolkit + RTK Query
- **特点**：成熟的全局状态管理 + 数据获取方案
- **优势**：
  - 标准化的数据流
  - 内置缓存和同步机制
  - 优秀的 TypeScript 支持
- **参考点**：slice 模式、normalized state、query 缓存策略

#### MobX + MobX State Tree
- **特点**：响应式编程模型 + 结构化状态树
- **优势**：
  - 自动追踪依赖
  - 强大的类型系统
  - 内置 snapshot 和 time-travel
- **参考点**：model 定义方式、action 组织、computed 值

#### Zustand
- **特点**：轻量级状态管理
- **优势**：
  - 简单的 API
  - 无需 Provider
  - 支持中间件
- **参考点**：store 创建模式、selector 优化

### 2. 数据层方案

#### TanStack Query (React Query)
- **特点**：专注于服务端状态管理
- **优势**：
  - 自动缓存和同步
  - 乐观更新支持
  - 请求去重和后台刷新
- **参考点**：缓存策略、mutation 处理、查询键设计

#### SWR
- **特点**：数据获取库，强调 stale-while-revalidate 策略
- **优势**：
  - 简单的 API
  - 内置错误重试
  - 焦点时重新验证
- **参考点**：数据同步策略、缓存失效机制

### 3. 模型层方案

#### Rematch
- **特点**：基于 Redux 的增强框架
- **优势**：
  - 减少样板代码
  - 内置副作用处理
  - 插件系统
- **参考点**：model 组织方式、effects 处理

#### Valtio
- **特点**：基于 Proxy 的状态管理
- **优势**：
  - 可变式 API
  - 自动优化渲染
  - 简单直观
- **参考点**：proxy-based 响应式实现

### 4. 组件状态方案

#### Jotai
- **特点**：原子化状态管理
- **优势**：
  - 细粒度响应式
  - 无需 Provider
  - 支持 Suspense
- **参考点**：原子化设计、依赖追踪

#### Recoil
- **特点**：Facebook 的实验性状态管理
- **优势**：
  - 原子和选择器模式
  - 异步支持
  - 时间旅行调试
- **参考点**：selector 模式、异步数据流

## 改进建议的 Agent Prompt 框架

基于以上分析，建议的 vibe coding agent prompt 可以包含以下要素：

### 1. 数据层设计原则
```typescript
// Model 定义示例
interface DataModel<T> {
  // 状态定义
  state: T
  
  // 查询方法（只读）
  selectors: {
    getById: (id: string) => T[keyof T]
    getFiltered: (filter: FilterFn) => T[]
  }
  
  // 修改方法（带副作用）
  actions: {
    create: (data: Partial<T>) => Promise<T>
    update: (id: string, data: Partial<T>) => Promise<T>
    delete: (id: string) => Promise<void>
  }
  
  // 同步策略
  syncStrategies: {
    optimistic: boolean
    refetchOnSuccess: boolean
    localComputation: ComputeFn
  }
}
```

### 2. 组件使用模式
```typescript
// 组件只负责展示和调用
function TodoList() {
  // 从全局 store 订阅数据
  const todos = useSelector(todoModel.selectors.getAll)
  const { createTodo, updateTodo } = useActions(todoModel.actions)
  
  // 组件不持有业务数据，只处理 UI 状态
  const [isCreating, setIsCreating] = useState(false)
  
  return (
    // 纯展示逻辑
  )
}
```

### 3. 文件组织结构
```
src/
  models/           # 数据模型层
    todo/
      model.ts      # 模型定义
      actions.ts    # 业务逻辑
      selectors.ts  # 数据查询
      types.ts      # 类型定义
  
  views/           # 视图层
    TodoList/
      index.tsx    # 组件实现
      hooks.ts     # 自定义 hooks
      styles.css   # 样式
  
  services/        # API 服务层
    todoApi.ts     # 接口定义
  
  store/           # 全局状态配置
    index.ts       # store 初始化
    middleware.ts  # 中间件配置
```

### 4. 最佳实践指南

1. **数据标准化**：使用 normalized 结构存储关系型数据
2. **缓存策略**：实现智能缓存失效和更新机制
3. **错误处理**：统一的错误边界和恢复策略
4. **性能优化**：使用 memo、lazy loading、虚拟列表等技术
5. **开发工具**：集成 DevTools 支持状态调试

## 总结

你的方案核心思想是正确的，符合现代前端架构的最佳实践。主要需要注意的是：

1. **性能优化**：避免全局数据树带来的性能问题
2. **类型安全**：保持 TypeScript 的类型推导能力
3. **开发体验**：提供良好的工具链和约定
4. **灵活性**：允许在必要时打破规则（如局部状态）

建议参考上述开源方案的优秀实践，结合项目实际需求，构建一套既规范又灵活的前端架构体系。
