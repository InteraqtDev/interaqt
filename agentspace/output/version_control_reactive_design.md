# 响应式数据框架中的版本控制设计

## 问题本质

版本控制与响应式数据框架之间存在根本的范式冲突：

- **响应式编程**：声明式地描述数据"是什么"（what），关注数据之间的依赖关系
- **版本控制**：命令式地描述数据"如何变化"（how），关注操作的时序和历史

这种冲突的核心在于：响应式系统倾向于表达当前状态的真相（single source of truth），而版本控制需要维护多个历史状态的真相。

## 理论基础

### 1. 时间作为第一类数据维度

在响应式框架中引入版本控制，本质上是将**时间**作为数据的第一类维度。这符合函数式响应式编程（FRP）的理论基础：

```
Signal a = Time -> a
```

每个数据值不再是简单的值，而是时间的函数。版本控制将这个连续的时间函数离散化为版本序列。

### 2. Event Sourcing 模式

版本控制可以通过 Event Sourcing 模式在响应式框架中实现：

- **事件流**：所有数据变更都是事件
- **快照**：特定时间点的完整状态
- **重放**：通过重放事件序列重建任意版本的状态

### 3. 不可变数据结构

响应式编程的核心原则之一是不可变性。版本控制天然符合这一原则：
- 每个版本都是不可变的快照
- 新版本通过创建新的不可变状态产生
- 历史版本永远不会被修改

## 响应式版本控制模型设计

### 核心概念建模

```typescript
// 1. 版本化实体：将原始实体包装为带版本信息的实体
interface VersionedEntity<T> {
  id: string
  versionId: string
  timestamp: Date
  data: T
  isActive: boolean  // 标识是否为当前活跃版本
}

// 2. 版本快照：表示某个时间点的完整状态
interface Snapshot {
  id: string
  name: string
  timestamp: Date
  description?: string
}

// 3. 版本指针：响应式地指向当前活跃版本
interface VersionPointer {
  entityType: string
  currentSnapshotId: string
}
```

### 响应式数据流设计

```typescript
// 使用 interaqt 框架的示例实现

// 1. 定义版本化的 Product 实体
const VersionedProduct = Entity.create({
  name: 'VersionedProduct',
  properties: [
    Property.create({ name: 'productId', type: 'string' }),
    Property.create({ name: 'versionId', type: 'string' }),
    Property.create({ name: 'snapshotId', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'price', type: 'number' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({ 
      name: 'isActive', 
      type: 'boolean',
      computation: Computation.create({
        // 响应式计算：基于当前快照自动更新
        compute: (product, { context }) => {
          const currentSnapshot = context.versionPointer.currentSnapshotId
          return product.snapshotId === currentSnapshot
        }
      })
    })
  ]
})

// 2. 快照实体
const Snapshot = Entity.create({
  name: 'Snapshot',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'timestamp', type: 'string' }),
    Property.create({ name: 'entityCount', type: 'number' })
  ]
})

// 3. 版本指针（使用 Dictionary 模式）
const VersionPointer = Entity.create({
  name: 'VersionPointer',
  properties: [
    Property.create({ name: 'entityType', type: 'string' }),
    Property.create({ name: 'currentSnapshotId', type: 'string' })
  ]
})
```

### 响应式计算链

```typescript
// 1. 当前活跃产品视图（响应式派生）
const ActiveProductView = Entity.create({
  name: 'ActiveProductView',
  computation: FilteredEntity.create({
    source: VersionedProduct,
    condition: BoolExp.atom({
      key: 'isActive',
      value: ['=', true]
    })
  })
})

// 2. 产品历史追踪（响应式聚合）
const ProductHistory = Entity.create({
  name: 'ProductHistory',
  properties: [
    Property.create({ name: 'productId', type: 'string' }),
    Property.create({ 
      name: 'versionCount', 
      type: 'number',
      computation: Count.create({
        relation: 'productVersions',
        match: MatchExp.atom({
          key: 'productId',
          value: ['=', self => self.productId]
        })
      })
    })
  ]
})
```

### 交互设计

```typescript
// 1. 创建快照交互
const CreateSnapshot = Interaction.create({
  name: 'CreateSnapshot',
  action: Action.create({
    name: 'createSnapshot',
    perform: async (payload, { storage }) => {
      // 创建快照记录
      const snapshot = await storage.create('Snapshot', {
        name: payload.name,
        timestamp: new Date().toISOString()
      })
      
      // 复制当前所有活跃产品为新版本
      const activeProducts = await storage.find('VersionedProduct', 
        MatchExp.atom({ key: 'isActive', value: ['=', true] })
      )
      
      for (const product of activeProducts) {
        await storage.create('VersionedProduct', {
          ...product,
          versionId: uuid(),
          snapshotId: snapshot.id,
          createdAt: new Date().toISOString()
        })
      }
      
      return snapshot
    }
  })
})

// 2. 回滚交互（响应式更新）
const RollbackToSnapshot = Interaction.create({
  name: 'RollbackToSnapshot',
  action: Action.create({
    name: 'rollback',
    perform: async (payload, { storage }) => {
      // 更新版本指针 - 这会触发所有 isActive 的响应式重计算
      await storage.update('VersionPointer', 
        { entityType: 'Product' },
        { currentSnapshotId: payload.snapshotId }
      )
    }
  })
})
```

## 关键设计模式

### 1. 时态解耦模式（Temporal Decoupling）

将数据的"当前值"与"历史值"解耦：
- **历史数据**：不可变的版本化实体集合
- **当前指针**：可变的版本指针
- **派生视图**：基于指针响应式计算的当前数据视图

### 2. 快照链模式（Snapshot Chain）

版本历史形成一个不可变的链式结构：
```
Snapshot1 -> Snapshot2 -> Snapshot3 -> ... -> Current
```

每个快照包含完整的数据状态，支持 O(1) 的版本切换。

### 3. 响应式投影模式（Reactive Projection）

通过响应式计算自动维护多个数据视图：
- **当前视图**：基于版本指针的活跃数据
- **历史视图**：特定版本的数据快照
- **差异视图**：版本间的变更计算

## 实践建议

### 1. 性能优化

- **增量快照**：只存储变更的数据，而非完整复制
- **懒加载**：按需加载历史版本数据
- **索引优化**：为版本查询建立专门索引

### 2. 存储策略

```typescript
// 使用 interaqt 的 Entity 层次结构
const VersionedData = Entity.create({
  name: 'VersionedData',
  properties: [
    Property.create({ name: 'entityType', type: 'string' }),
    Property.create({ name: 'entityId', type: 'string' }),
    Property.create({ name: 'versionId', type: 'string' }),
    Property.create({ name: 'data', type: 'json' }), // 存储序列化的实体数据
    Property.create({ name: 'metadata', type: 'json' })
  ]
})
```

### 3. 响应式版本比较

```typescript
// 版本差异计算
const VersionDiff = Entity.create({
  name: 'VersionDiff',
  computation: Transform.create({
    sourceEntities: [VersionedProduct],
    computation: async (products) => {
      // 响应式地计算版本间差异
      const grouped = groupBy(products, 'productId')
      return Object.entries(grouped).map(([productId, versions]) => {
        const sorted = sortBy(versions, 'createdAt')
        return {
          productId,
          changes: calculateDiff(sorted)
        }
      })
    }
  })
})
```

## 理论总结

在响应式数据框架中实现版本控制的关键是**将时间维度显式建模为响应式数据结构**。通过以下原则：

1. **不可变性**：每个版本都是不可变的数据快照
2. **响应式派生**：当前数据是基于版本指针的响应式计算
3. **事件驱动**：版本切换通过事件（交互）触发响应式更新
4. **函数式建模**：版本控制操作被建模为纯函数转换

这种设计将命令式的版本控制操作转换为声明式的响应式数据流，既保持了响应式框架的优雅性，又实现了完整的版本控制功能。

## 结论

版本控制在响应式框架中不是反模式，而是需要正确的抽象层次。通过将版本历史作为一等公民的响应式数据结构，我们可以优雅地在响应式范式中表达时间维度的数据变化，实现真正的"响应式版本控制"。
