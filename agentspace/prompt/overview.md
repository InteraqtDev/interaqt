# interaqt 项目概述

## 项目简介

interaqt 是一个创新的后端响应式框架，实现了一种全新的应用开发范式。它可以被理解为 Web Framework + ORM/CMS + BPM Engine 的替代方案。

### 核心理念

框架基于一个简单而强大的范式：
```
data = computation(events)
```

这意味着开发者只需要描述系统中数据的定义和计算规则，数据的具体变化过程由框架自动响应式地处理。

### 主要特性

- **声明式编程**：开发者只需描述数据应该是什么，而不需要编写数据变化的具体逻辑
- **响应式计算**：当事件发生时，相关数据会自动重新计算和更新
- **零手动数据操作**：消除了因人为错误导致的数据不一致问题
- **自动架构适应**：架构可以根据数据量和并发需求自动调整

## 项目架构

项目分为三个核心模块：

### 1. Runtime 模块 (`src/runtime/`)
负责驱动响应式计算的核心引擎。

**核心组件：**
- **System.ts**: 系统的核心接口定义，包含存储、日志、计算状态等
- **MonoSystem.ts**: 单体系统实现
- **Controller.ts**: 控制器，协调各个组件的工作
- **Scheduler.ts**: 调度器，管理响应式计算的执行顺序
- **InteractionCall.ts**: 处理交互调用的逻辑
- **ActivityCall.ts**: 处理活动状态机的调用
- **数据库适配器**: SQLite.ts, PostgreSQL.ts, Mysql.ts, PGLite.ts

**主要功能：**
- 响应式计算引擎
- 事件调度和处理
- 数据库操作抽象
- 交互和活动的执行管理

### 2. Shared 模块 (`src/shared/`)
包含通用的数据结构和概念定义。

**核心概念：**

#### 实体和关系 (`entity/Entity.ts`)
- **Entity**: 定义数据实体，如用户、产品等
- **Property**: 实体的属性定义
- **Relation**: 实体间的关系定义，支持1:1, 1:n, n:n等关系类型

#### 响应式计算 (`computed.ts`)
提供多种计算类型：
- **Count**: 计数器，自动统计实体数量
- **WeightedSummation**: 加权求和
- **Every**: 全部满足条件检查
- **Any**: 任一满足条件检查
- **Transform**: 数据转换
- **StateMachine**: 状态机

#### 活动系统 (`activity/Activity.ts`)
- **Activity**: 活动定义，表示复杂的业务流程
- **Interaction**: 交互定义，表示用户可以执行的操作
- **Payload**: 交互的参数定义
- **Action**: 交互动作类型
- **Transfer**: 活动中的状态转移

#### 其他核心概念
- **Condition**: 状语，用于描述交互动作的约束条件
- **Attributive**: 定语，用于描述实体的特征和约束
- **BoolExp**: 布尔表达式，用于查询条件
- **Dictionary**: 全局字典，存储系统级别的计算数据

### 3. Storage 模块 (`src/storage/`)
类似ORM的数据存储层，提供高级的数据库操作接口。

**核心组件：**
- **EntityToTableMap**: 实体到数据库表的映射
- **DBSetup**: 数据库模式初始化
- **EntityQueryHandle**: 实体查询处理器
- **RecordQueryAgent**: 记录查询代理

**主要功能：**
- 实体关系映射
- 语义化查询接口
- 数据库无关的抽象层
- 复杂关系查询支持

## 核心概念详解

### 1. 响应式计算

框架的核心是响应式计算。例如，在一个内容系统中：

```typescript
// 定义帖子实体
const PostEntity = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    // 点赞总数 - 响应式计算
    Property.create({
      name: 'likeCount',
      type: 'number',
      computation: Count.create({
        record: likeRelation // 引用点赞关系
      })
    })
  ]
});

// 定义点赞关系
const likeRelation = Relation.create({
  source: UserEntity,
  sourceProperty: 'likedPosts',
  target: PostEntity,
  targetProperty: 'likers',
  type: 'n:n'
});
```

当用户点赞时，`likeCount` 会自动增加；取消点赞时会自动减少。

### 2. 活动状态机

活动（Activity）是框架提供的状态机，用于表达复杂的多步骤、多角色交互流程。

**典型场景：请假审批流程**

```typescript
const leaveRequestActivity = Activity.create({
  name: 'leaveRequest',
  interactions: [
    // 员工提交申请
    Interaction.create({
      name: 'submit',
      action: Action.create({ name: 'submit' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({
            name: 'request',
            base: LeaveRequestEntity
          })
        ]
      })
    }),
    // 主管审批
    Interaction.create({
      name: 'approve',
      action: Action.create({ name: 'approve' }),
      // 限制只有相关主管可以审批
      userAttributives: Attributive.create({
        name: 'Supervisor',
        content: async function(request, { user }) {
          // 检查用户是否为该申请的审批人
        }
      })
    })
  ],
  transfers: [
    // 定义状态转移规则
    Transfer.create({
      source: submitInteraction,
      target: approveInteraction
    })
  ]
});
```

### 3. 数据映射和计算

框架提供了多种数据映射和计算方式：

#### MapInteractionToRecord
将交互事件映射为实体关系：

```typescript
const reviewerRelation = Relation.create({
  source: RequestEntity,
  target: UserEntity,
  computation: MapInteractionToRecord.create({
    sourceInteraction: createRequestInteraction,
    map: async function(event) {
      // 当创建请求时，自动建立请求与审批人的关系
      const supervisor = await this.findSupervisor(event.user);
      return [{
        source: event.payload.request,
        target: supervisor
      }];
    }
  })
});
```

#### MapInteractionToProperty
将交互事件映射为属性值：

```typescript
Property.create({
  name: 'status',
  type: 'string',
  computation: MapInteractionToProperty.create({
    items: [
      MapInteractionToPropertyItem.create({
        interaction: approveInteraction,
        map: () => 'approved'
      }),
      MapInteractionToPropertyItem.create({
        interaction: rejectInteraction,
        map: () => 'rejected'
      })
    ]
  })
})
```

## 使用流程

### 1. 定义数据模型

```typescript
// 定义实体
const UserEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' })
  ]
});

// 定义关系
const friendRelation = Relation.create({
  source: UserEntity,
  sourceProperty: 'friends',
  target: UserEntity,
  targetProperty: 'friends',
  type: 'n:n'
});
```

### 2. 定义交互

```typescript
const addFriendInteraction = Interaction.create({
  name: 'addFriend',
  action: Action.create({ name: 'addFriend' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'friend',
        base: UserEntity,
        isRef: true // 引用已存在的用户
      })
    ]
  })
});
```

### 3. 定义响应式计算

```typescript
// 添加好友数量计算
UserEntity.properties.push(
  Property.create({
    name: 'friendCount',
    type: 'number',
    computation: Count.create({
      record: friendRelation
    })
  })
);
```

### 4. 初始化系统

```typescript
const system = new MonoSystem();
const controller = new Controller(
  system,
  [UserEntity], // 实体列表
  [friendRelation], // 关系列表
  [], // 活动列表
  [addFriendInteraction], // 交互列表
  [], // 字典列表
  [] // 状态列表
);

await controller.setup(true);
```

### 5. 执行交互

```typescript
// 用户添加好友
await controller.callInteraction('addFriend', {
  user: currentUser,
  payload: { friend: targetUser }
});

// 好友数量会自动更新
const updatedUser = await system.storage.findOne('User', 
  BoolExp.atom({ key: 'id', value: ['=', currentUser.id] })
);
console.log(updatedUser.friendCount); // 自动计算的好友数量
```

## 技术特点

### 1. 声明式编程
- 开发者只需描述数据的定义和计算规则
- 框架自动处理数据的变化逻辑
- 减少了手动编写数据操作代码

### 2. 响应式架构
- 事件驱动的数据更新
- 自动依赖追踪和计算
- 保证数据一致性

### 3. 类型安全
- 基于TypeScript构建
- 强类型的实体和关系定义
- 编译时类型检查

### 4. 数据库无关
- 支持多种数据库（SQLite, PostgreSQL, MySQL）
- 统一的查询接口
- 自动的表结构管理

### 5. 状态机支持
- 内置的活动状态机
- 支持复杂的业务流程建模
- 多角色、多步骤交互支持

## 适用场景

1. **内容管理系统**：文章、评论、点赞等响应式计算
2. **审批流程系统**：请假、报销等多步骤审批
3. **社交网络**：好友关系、动态更新等
4. **电商系统**：订单状态、库存管理等
5. **项目管理**：任务分配、进度跟踪等

## 总结

interaqt 通过响应式编程范式，让开发者能够专注于业务逻辑的描述，而不需要关心数据变化的具体实现。这种方式不仅提高了开发效率，还大大减少了因手动数据操作导致的错误，是现代后端开发的一种创新尝试。
