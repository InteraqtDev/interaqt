# Filtered Entity 使用指南

## 什么是 Filtered Entity

Filtered Entity 是 interaqt 框架提供的一个强大功能，它允许你创建基于现有实体的条件子集，而无需创建新的数据表。可以将其理解为数据库视图（View）的概念，但具有响应式更新的能力。

## 基本概念

### 定义 Filtered Entity

```typescript
import { Entity, Property, MatchExp } from 'interaqt'

// 1. 定义源实体
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'age', type: 'number' }),
    Property.create({ name: 'status', type: 'string' }),
    Property.create({ name: 'department', type: 'string' })
  ]
})

// 2. 定义 Filtered Entity
const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,                    // 指定源实体
  filterCondition: MatchExp.atom({      // 定义过滤条件
    key: 'status',
    value: ['=', 'active']
  })
})
```

### 复杂过滤条件

```typescript
// 组合条件：活跃的年轻技术部门用户
const ActiveYoungTechUser = Entity.create({
  name: 'ActiveYoungTechUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  }).and({
    key: 'age',
    value: ['<', 30]
  }).and({
    key: 'department',
    value: ['=', 'Tech']
  })
})

// 或条件：VIP用户或管理员
const PrivilegedUser = Entity.create({
  name: 'PrivilegedUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'role',
    value: ['=', 'vip']
  }).or({
    key: 'role',
    value: ['=', 'admin']
  })
})
```

## 使用场景

### 1. 状态分组

```typescript
// 订单状态分组
const PendingOrder = Entity.create({
  name: 'PendingOrder',
  sourceEntity: Order,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'pending']
  })
})

const CompletedOrder = Entity.create({
  name: 'CompletedOrder',
  sourceEntity: Order,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'completed']
  })
})
```

### 2. 权限控制

```typescript
// 用户只能看到自己部门的数据
const MyDepartmentData = Entity.create({
  name: 'MyDepartmentData',
  sourceEntity: Data,
  filterCondition: MatchExp.atom({
    key: 'departmentId',
    value: ['=', getCurrentUserDepartment()]
  })
})
```

### 3. 时间范围过滤

```typescript
// 最近30天的活动日志
const RecentActivityLog = Entity.create({
  name: 'RecentActivityLog',
  sourceEntity: ActivityLog,
  filterCondition: MatchExp.atom({
    key: 'createdAt',
    value: ['>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()]
  })
})
```

## CRUD 操作

### 查询操作

```typescript
// 查询 filtered entity 与查询普通 entity 完全一样
const activeUsers = await controller.find('ActiveUser', 
  undefined, 
  undefined, 
  ['id', 'name', 'age', 'department']
)

// 可以添加额外的查询条件
const youngActiveUsers = await controller.find('ActiveUser',
  MatchExp.atom({ key: 'age', value: ['<', 25] }),
  undefined,
  ['id', 'name', 'age']
)
```

### 创建操作

```typescript
// 注意：不能直接在 filtered entity 上创建记录
// 必须在源实体上创建，系统会自动判断是否属于 filtered entity

// ❌ 错误方式
await controller.create('ActiveUser', { name: 'Alice', status: 'active' })

// ✅ 正确方式
const user = await controller.create('User', { 
  name: 'Alice', 
  age: 25,
  status: 'active',
  department: 'Tech'
})
// 如果满足条件，会自动触发 ActiveUser 的 create 事件
```

### 更新操作

```typescript
// 可以通过 filtered entity 更新记录
await controller.update('ActiveUser',
  MatchExp.atom({ key: 'name', value: ['=', 'Alice'] }),
  { department: 'HR' }
)

// 注意：如果更新后不再满足过滤条件，会触发 delete 事件
await controller.update('ActiveUser',
  MatchExp.atom({ key: 'name', value: ['=', 'Alice'] }),
  { status: 'inactive' }  // 更新后不再是 ActiveUser
)
```

### 删除操作

```typescript
// 通过 filtered entity 删除只会删除满足条件的记录
await controller.delete('ActiveUser',
  MatchExp.atom({ key: 'age', value: ['>', 60] })
)
// 只删除年龄大于60的活跃用户
```

## 与 Computation 结合使用

### Count 计算

```typescript
const ActiveUserCount = Count.create({
  record: ActiveUser,
  match: () => true  // 计算所有 ActiveUser
})
```

### Summation 计算

```typescript
const TotalActiveUserAge = Summation.create({
  record: ActiveUser,
  attributeToSum: 'age',
  match: () => true
})
```

### 在 StateMachine 中使用

```typescript
const activeState = StateNode.create({ name: 'active' });
const inactiveState = StateNode.create({ name: 'inactive' });

const statusProperty = Property.create({
  name: 'status',
  type: 'string',
  computation: StateMachine.create({
    states: [activeState, inactiveState],
    defaultState: inactiveState,
    transfers: [
      StateTransfer.create({
        current: inactiveState,
        next: activeState,
        trigger: {
          recordName: InteractionEventEntity.name,
          record: {
            interactionName: ActivateUser.name
          }
        },
        computeTarget: (event) => ({ id: event.payload.userId })
        // 状态变化会自动更新 filtered entity
      })
    ]
  })
})
```

## 事件系统

Filtered Entity 完全集成到事件系统中：

```typescript
// 监听 filtered entity 的事件
system.addEventListener('ActiveUser', 'create', (event) => {
  console.log('新的活跃用户:', event.record)
})

system.addEventListener('ActiveUser', 'delete', (event) => {
  console.log('用户不再活跃:', event.record)
})
```

## 最佳实践

### 1. 命名规范

- 使用描述性名称：`ActiveUser` 而不是 `UserFiltered1`
- 体现过滤特征：`PublishedPost`、`PendingOrder`、`ExpiredSubscription`

### 2. 性能优化

```typescript
// 为经常用于过滤的字段创建索引
await db.execute(`
  CREATE INDEX idx_user_status ON "User" (status);
  CREATE INDEX idx_user_age ON "User" (age);
  CREATE INDEX idx_user_department ON "User" (department);
`)
```

### 3. 避免过度使用

```typescript
// ❌ 不好的做法：为每个可能的组合创建 filtered entity
const ActiveYoungMaleEngineerInShanghaiWithHighSalary = Entity.create({...})

// ✅ 好的做法：使用通用的 filtered entity + 查询时的额外条件
const activeUsers = await controller.find('ActiveUser', 
  MatchExp.atom({ key: 'city', value: ['=', 'Shanghai'] })
    .and({ key: 'salary', value: ['>', 10000] })
)
```

### 4. 处理边界情况

```typescript
// 考虑空结果集
const rareUsers = await controller.find('RareUser')
if (rareUsers.length === 0) {
  // 处理没有符合条件的记录的情况
}

// 考虑全部满足
const allActiveUsers = await controller.find('User', 
  MatchExp.atom({ key: 'status', value: ['=', 'active'] })
)
// 如果所有用户都是活跃的，ActiveUser 和 User 结果相同
```

## 高级用法

### 1. 基于 Relation 的 Filtered Entity

```typescript
const Friendship = Relation.create({
  name: 'Friendship',
  source: User,
  target: User,
  properties: [
    Property.create({ name: 'status', type: 'string' }),
    Property.create({ name: 'since', type: 'string' })
  ]
})

const ActiveFriendship = Entity.create({
  name: 'ActiveFriendship',
  sourceEntity: Friendship,  // 源是 Relation
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
})
```

### 2. 动态过滤条件（通过重新定义）

```typescript
// 虽然过滤条件是静态的，但可以通过重新定义实体来实现"动态"效果
function createUserFilteredByAge(minAge: number) {
  return Entity.create({
    name: `UserAbove${minAge}`,
    sourceEntity: User,
    filterCondition: MatchExp.atom({
      key: 'age',
      value: ['>=', minAge]
    })
  })
}
```

## 常见问题

### Q: 为什么不能直接在 filtered entity 上创建记录？

A: Filtered entity 是一个视图，不是实际的数据表。创建记录必须在源实体上进行，系统会自动判断新记录是否满足各个 filtered entity 的条件。

### Q: 更新操作会影响 filtered entity 的成员资格吗？

A: 是的。如果更新后记录不再满足过滤条件，会触发 filtered entity 的 delete 事件；反之，如果更新后新满足条件，会触发 create 事件。

### Q: Filtered entity 支持嵌套吗？

A: 当前版本不支持。不能创建基于 filtered entity 的 filtered entity。

### Q: 性能影响如何？

A: Filtered entity 的查询性能与源实体相当，因为本质上是在源实体上添加额外的过滤条件。主要的性能开销在于写操作时需要更新 `__filtered_entities` 标记。

### Q: 如何处理大量的 filtered entities？

A: 
1. 避免创建过多细粒度的 filtered entities
2. 为 `__filtered_entities` 字段创建 GIN 索引（PostgreSQL）
3. 考虑使用查询时的动态过滤而不是预定义的 filtered entity

## 总结

Filtered Entity 是 interaqt 框架中一个强大的功能，它提供了：

- **数据视图**：无需复制数据即可创建条件子集
- **响应式更新**：自动跟踪成员资格变化
- **事件集成**：完全集成到事件系统
- **性能优化**：避免数据冗余，减少存储开销

合理使用 Filtered Entity 可以让你的应用更加灵活和高效。 