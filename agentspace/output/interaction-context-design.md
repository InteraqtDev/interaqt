# EventSource 重构方案设计

## 1. 问题分析

### 1.1 当前架构的缺陷

interaqt 是一个响应式数据框架。当前架构中，数据变更的唯一驱动来源是 **用户交互事件 (Interaction)**。整个事件流如下：

```
controller.callInteraction(interactionName, {user, payload, query})
  → ActivityManager.callInteraction()
    → InteractionCall.check()  (条件检查、权限检查、payload 验证)
    → InteractionCall.call()   (保存 InteractionEvent → 触发 Computation)
      → Storage mutation events → Scheduler → Computation → applyResult
```

这个设计有一个根本性的问题：**Interaction 同时承担了"事件源定义"和"事件触发入口"两个职责，而 Controller 只为 Interaction 提供了单一的触发入口 `callInteraction`**。

在实际系统中，数据变更的驱动来源远不止用户交互：

- **定时任务**：如每天凌晨结算、定期清理过期数据
- **外部系统回调**：如支付回调、第三方 API webhook
- **Agent 工具调用**：AI agent 通过 tool 触发业务操作
- **系统内部事件**：如级联删除、数据同步

当前如果要支持这些场景，只能将它们伪装成 Interaction，提供一个假的 `user` 参数，这既不优雅也不安全。

### 1.2 当前核心概念梳理

| 概念 | 职责 | 现状 |
|------|------|------|
| **Controller** | 框架入口，管理所有资源，提供事件触发 API | 只有 `callInteraction` 一个入口 |
| **Interaction** | 定义一个用户交互动作 | 包含 action、conditions、userAttributives、payload、data、dataPolicy |
| **Activity** | 编排多个 Interaction 的工作流 | 包含 interactions、gateways、transfers、groups |
| **InteractionCall** | 执行 Interaction 的运行时 | check (条件/权限/payload) + call (保存事件/查询数据) |
| **ActivityCall** | 执行 Activity 的运行时 | 管理 Activity 状态机，按图调度 InteractionCall |
| **ActivityManager** | 管理所有 InteractionCall 和 ActivityCall | 路由调度 + 事务管理 |
| **InteractionEventEntity** | 事件的持久化实体 (`_Interaction_`) | 所有 Computation 监听此实体来响应事件 |
| **Scheduler** | 响应式计算调度器 | 监听 Storage mutation events，触发 Computation |
| **Computation** | 响应式计算 | DataBased / EventBased 两类，监听数据变化执行计算 |

### 1.3 关键洞察

1. **Interaction 的本质是"内置的事件源类型"**，它附带了一套特定的检查机制 (条件检查、用户权限、payload 验证)。
2. **Activity 是 Interaction 的高级编排概念**，它本身不是独立的事件源，而是对 Interaction 这种事件源类型的流程控制。
3. **Computation 真正关心的是 Storage 中的 mutation events**，而不是事件源本身。事件源只是产生这些 mutation 的触发器。
4. **事务管理是 Controller 层面的关注点**，不应该绑定在特定的事件源类型上。

---

## 2. 重构方案

### 2.1 核心设计思想

引入 **EventSource（事件源）** 作为一等公民概念。EventSource 是所有数据变更驱动来源的统一抽象。Interaction 降级为一种内置的 EventSource 类型。

设计原则：
- **统一机制**：所有事件源类型共享同样的注册、触发、事务管理机制
- **类型自治**：每种事件源类型自行定义其检查逻辑 (guard)
- **显式控制**：不做任何隐式补充，所有行为必须显式声明
- **对象引用**：`dispatch` 使用具体事件源的对象引用而非字符串名称

### 2.2 概念体系

#### 2.2.1 EventSource（事件源定义）

EventSource 是一个 **泛型抽象**，表示一种可以触发数据变更的事件来源。

```typescript
interface EventSourceInstance<TArgs = any> extends IInstance {
  name: string
  // 该事件源的事件记录实体，每个事件源拥有独立的事件实体
  record: EntityInstance
  // guard 函数：该事件源类型的校验逻辑，由事件源类型自行负责
  // 如果校验失败，抛出错误；校验通过则返回 void
  guard?: (this: Controller, args: TArgs) => Promise<void>
  // 事件发生时，需要持久化的事件数据转换函数
  // 将原始 args 转换成需要存储到事件记录中的数据
  mapEventData?: (args: TArgs) => Record<string, any>
}
```

核心理念：
- `record` 是该事件源**自己的事件记录实体**。每个事件源拥有独立的实体和表结构，其 properties 由事件源自行定义，精确匹配该类型事件所需的字段。Computation（如 Transform）通过监听特定事件源的 `record` 来响应特定类型的事件。
- `guard` 是每种事件源类型**自行表达**的检查逻辑。对于 Interaction，它包含条件检查、权限检查、payload 验证；对于定时任务，可能是检查是否到了触发时间；对于 webhook，可能是签名验证。
- `mapEventData` 用于从原始参数中提取需要持久化到 `record` 实体中的数据。

#### 2.2.2 EventSource 的两种创建方式

- **通用方式**：`EventSource.create({ name, record, guard, mapEventData, resolve })` — 用户自定义事件源时使用，需要提供独立的 `record` 实体和 `guard` 等函数。
- **内置类型**：`Interaction.create({ name, conditions, payload, ... })` — 用户定义交互事件源时使用。`Interaction.create` 返回的对象满足 `EventSourceInstance` 接口，其 `record`（`InteractionEventEntity`）和 `guard` 由 `create` 内部自动设置。

用户无需感知底层机制。`Interaction.create` 和 `EventSource.create` 产出的都是 `EventSourceInstance`，统一传给 Controller 即可：

```typescript
const sendRequest = Interaction.create({
  name: 'sendRequest',
  conditions: ...,
  userAttributives: ...,
  payload: ...,
})

const CronEventRecord = Entity.create({
  name: '_CronEvent_',
  properties: [
    Property.create({ name: 'triggeredAt', type: 'number' }),
    Property.create({ name: 'scheduleName', type: 'string' }),
  ]
})

const dailySettlement = EventSource.create({
  name: 'dailySettlement',
  record: CronEventRecord,
  guard: ...,
  mapEventData: ...,
})

const controller = new Controller({
  eventSources: [sendRequest, dailySettlement],
  ...
})
```

#### 2.2.3 事件记录实体（每个事件源独立）

每个事件源拥有**自己独立的事件记录实体**，其 properties 精确匹配该事件源所需的字段。Controller 在构造时将所有事件源的 `record` 实体注册到 entities 中。

这种设计的好处：
- **类型精确**：每种事件源的事件记录有自己的 schema，字段明确，不需要用一个宽泛的 `data: object` 来兜底。
- **Computation 精确监听**：Transform 等 Computation 通过监听特定事件源的 `record` 实体来响应特定类型的事件，不需要在 callback 中做 `sourceName` 过滤。
- **与现有模式一致**：当前 Interaction 就有自己的 `InteractionEventEntity`（`_Interaction_`），这种模式自然延续到所有事件源。

### 2.3 Controller 重构

#### 2.3.1 ControllerOptions 变更

```typescript
interface ControllerOptions {
  system: System
  entities?: EntityInstance[]
  relations?: RelationInstance[]
  // 移除 activities 和 interactions，新增 eventSources
  eventSources?: EventSourceInstance[]
  dict?: DictionaryInstance[]
  recordMutationSideEffects?: RecordMutationSideEffect<any>[]
  computations?: (new (...args: any[]) => Computation)[]
  ignoreGuard?: boolean            // 替代 ignorePermission
  forceThrowDispatchError?: boolean  // 替代 forceThrowInteractionError
}
```

关键变更：
- **移除 `activities` 和 `interactions` 参数**：它们不再是 Controller 的直接关注点
- **新增 `eventSources` 参数**：接收所有事件源实例。`Interaction.create` 返回的实例满足 `EventSourceInstance` 接口，可以直接传入；`EventSource.create` 创建的自定义事件源同样直接传入

#### 2.3.2 dispatch API

`callInteraction` 被替换为统一的 `dispatch`：

```typescript
class Controller {
  async dispatch<TArgs>(
    eventSource: EventSourceInstance<TArgs>,
    args: TArgs
  ): Promise<DispatchResponse> {
    const effectsContext = { effects: [] as RecordMutationEvent[] }
    
    return asyncEffectsContext.run(effectsContext, async () => {
      // 1. 开启事务
      await this.system.storage.beginTransaction(eventSource.name)
      
      let result: DispatchResponse
      try {
        // 2. 执行 guard 检查（事件源类型自定义的校验）
        if (!this.ignoreGuard && eventSource.guard) {
          await eventSource.guard.call(this, args)
        }
        
        // 3. 持久化事件记录到该事件源自己的 record 实体中
        const eventData = eventSource.mapEventData
          ? eventSource.mapEventData(args)
          : {}
          
        await this.system.storage.create(eventSource.record.name!, eventData)
        
        // 4. 构建结果
        result = { effects: effectsContext.effects, sideEffects: {} }
        
        // 5. 提交事务
        await this.system.storage.commitTransaction(eventSource.name)
      } catch (e) {
        // 6. 回滚事务
        await this.system.storage.rollbackTransaction(eventSource.name)
        
        if (this.forceThrowDispatchError) throw e
        result = {
          error: e,
          effects: [],
          sideEffects: {}
        }
      }
      
      result.effects = effectsContext.effects
      
      // 7. 执行 side effects
      if (!result.error) {
        await this.runRecordChangeSideEffects(result, this.system.logger)
      }
      
      return result
    })
  }
}
```

关键设计决策：
- **第一个参数是对象引用**，而不是字符串名称。这保证了类型安全和明确的指向关系。
- **事务管理是 Controller 的职责**：无论什么事件源类型，Controller 统一管理事务的开启、提交和回滚。
- **guard 检查由事件源自治**：Controller 只负责调用 `guard`，具体的检查逻辑由事件源类型自行定义。

#### 2.3.3 DispatchResponse

```typescript
type DispatchResponse = {
  error?: unknown
  data?: unknown
  effects?: RecordMutationEvent[]
  sideEffects?: { [k: string]: SideEffectResult }
  context?: { [k: string]: unknown }
}
```

### 2.4 Interaction 作为内置 EventSource 类型

Interaction 是一种**内置的事件源类型**。`Interaction.create` 返回的实例满足 `EventSourceInstance<InteractionEventArgs>` 接口，可以直接传给 Controller。

#### 2.4.1 InteractionInstance 接口

`InteractionInstance` 继承 `EventSourceInstance`，在保留原有声明式字段的同时，自动具备 `guard`、`mapEventData`、`resolve`：

```typescript
interface InteractionInstance extends EventSourceInstance<InteractionEventArgs> {
  // 声明式字段（用户填写）
  conditions?: ConditionsInstance | ConditionInstance
  userAttributives?: AttributivesInstance | AttributiveInstance
  userRef?: AttributiveInstance
  action: ActionInstance
  payload?: PayloadInstance
  data?: EntityInstance | RelationInstance
  dataPolicy?: DataPolicyInstance

  // EventSourceInstance 接口字段（由 create 内部自动生成）
  // record: InteractionEventEntity（所有 Interaction 共享同一个事件实体 _Interaction_）
  // guard: 根据 conditions/userAttributives/payload 组装
  // mapEventData: 根据字段自动映射
  // resolve: 如果 action 是 GetAction，自动生成数据查询逻辑
}
```

Interaction 的 `record` 是所有 Interaction 实例共享的 `InteractionEventEntity`（即当前的 `_Interaction_` 实体），保持与现有设计一致。不同 Interaction 产生的事件记录通过 `interactionName` 字段区分。

#### 2.4.2 Interaction.create 的内部实现

`Interaction.create` 在构造实例时，根据声明式字段自动生成 `guard`、`mapEventData`、`resolve`：

```typescript
class Interaction {
  static create(args: InteractionCreateArgs): InteractionInstance {
    const instance = new Interaction(args)

    // record 指向共享的 InteractionEventEntity
    instance.record = InteractionEventEntity

    // 根据声明式字段组装 guard
    instance.guard = async function(this: Controller, eventArgs: InteractionEventArgs) {
      await checkCondition(this, instance, eventArgs)
      await checkUser(this, instance, eventArgs)
      await checkPayload(this, instance, eventArgs)
    }

    // 自动映射事件数据
    instance.mapEventData = (eventArgs) => ({
      interactionName: instance.name,
      interactionId: instance.uuid,
      user: eventArgs.user,
      query: eventArgs.query || {},
      payload: eventArgs.payload || {},
    })

    // 如果是 GetAction，自动生成 resolve
    if (args.action === GetAction) {
      instance.resolve = async function(this: Controller, eventArgs: InteractionEventArgs) {
        return retrieveData(this, instance, eventArgs)
      }
    }

    return instance
  }
}
```

用户的使用方式完全不变：

```typescript
const sendRequest = Interaction.create({
  name: 'sendRequest',
  action: Action.create({ name: 'sendRequest' }),
  conditions: ...,
  userAttributives: ...,
  payload: ...,
})

// sendRequest 已经是 EventSourceInstance，直接用
await controller.dispatch(sendRequest, { user, payload })
```

#### 2.4.3 GetAction 的处理

当 `action` 为 `GetAction` 时，`Interaction.create` 会自动为实例生成 `resolve` 函数，内部封装了 `data`、`dataPolicy` 相关的查询逻辑。Controller 的 `dispatch` 在保存事件后调用 `resolve`（如果存在），并将结果放入 `DispatchResponse.data`。

### 2.5 Activity 的定位

根据任务要求 (3.1)，Activity 是附属于 Interaction 的高级概念，在 EventSource 层面不需要对应概念。

Activity 仍然可以存在，但它的职责是**编排多个 Interaction 类型事件源的执行流程**。

`Activity.create` 会遍历其包含的 Interaction 实例，为每个 Interaction 的 `guard` 追加 Activity 状态检查逻辑（包装原有 guard），并在 `mapEventData` 中追加 Activity 上下文信息。最终 Activity 产出的仍然是一组 `EventSourceInstance`，用户将它们传给 Controller 即可。

```typescript
const activity = Activity.create({
  name: 'createFriendRelation',
  interactions: [sendRequest, approve, reject],
  transfers: [...],
  groups: [...],
})

// activity.eventSources 是包装后的 EventSourceInstance[]
// 每个实例的 guard 中已包含 Activity 状态检查
const controller = new Controller({
  eventSources: [...activity.eventSources, otherEventSource],
  ...
})

// 触发时传入 activityId
await controller.dispatch(activity.eventSources[0], {
  user,
  payload,
  activityId: '...',
})
```

### 2.6 自定义事件源类型示例

框架用户可以方便地创建自定义事件源类型：

```typescript
// 定时任务事件源

// 1. 定义该事件源独立的事件记录实体
const CronEventRecord = Entity.create({
  name: '_CronEvent_',
  properties: [
    Property.create({ name: 'triggeredAt', type: 'number' }),
    Property.create({ name: 'scheduleName', type: 'string' }),
  ]
})

type CronEventArgs = {
  triggeredAt: number
  scheduleName: string
}

// 2. 创建事件源，指定 record
const dailySettlement = EventSource.create<CronEventArgs>({
  name: 'dailySettlement',
  record: CronEventRecord,
  guard: async function(this: Controller, args) {
    const lastRun = await this.system.storage.dict.get('lastSettlementTime')
    if (lastRun && args.triggeredAt - lastRun < 24 * 60 * 60 * 1000) {
      throw new Error('Settlement already ran today')
    }
  },
  mapEventData: (args) => ({
    triggeredAt: args.triggeredAt,
    scheduleName: args.scheduleName,
  })
})

// 3. Computation 监听该事件源的 record
const lastSettlementTime = Dictionary.create({
  name: 'lastSettlementTime',
  computation: Transform.create({
    record: CronEventRecord,  // 精确监听定时任务事件
    callback: async function(event) {
      return event.triggeredAt
    }
  })
})

// 4. 触发
await controller.dispatch(dailySettlement, {
  triggeredAt: Date.now(),
  scheduleName: 'daily-settlement'
})
```

```typescript
// Webhook 事件源

const PaymentEventRecord = Entity.create({
  name: '_PaymentEvent_',
  properties: [
    Property.create({ name: 'orderId', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }),
    Property.create({ name: 'amount', type: 'number' }),
  ]
})

type WebhookEventArgs = {
  signature: string
  body: Record<string, any>
  headers: Record<string, string>
}

const paymentCallback = EventSource.create<WebhookEventArgs>({
  name: 'paymentCallback',
  record: PaymentEventRecord,
  guard: async function(this: Controller, args) {
    const isValid = verifySignature(args.signature, args.body, SECRET)
    if (!isValid) throw new Error('Invalid webhook signature')
  },
  mapEventData: (args) => ({
    orderId: args.body.orderId,
    status: args.body.status,
    amount: args.body.amount,
  })
})

// Computation 监听支付事件
const orderStatusProp = Property.create({
  name: 'status',
  type: 'string',
  collection: false,
  computation: StateMachine.create({
    ...
    transitions: [
      { event: PaymentEventRecord, from: 'pending', to: 'paid' }
    ]
  })
})

// 触发
await controller.dispatch(paymentCallback, {
  signature: req.headers['x-signature'],
  body: req.body,
  headers: req.headers,
})
```

---

## 3. 对 Computation 系统的影响

### 3.1 Computation 监听特定事件源的 record

当前 Computation（特别是 Transform）通过监听 `InteractionEventEntity`（`_Interaction_`）实体的创建事件来响应交互。重构后，这种模式**保持不变**——Interaction 的 `record` 仍然是 `InteractionEventEntity`。

对于自定义事件源，Computation 直接监听该事件源的 `record` 实体即可：

```typescript
// 监听 Interaction 事件（与现有代码完全一致）
const friendRelation = Relation.create({
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: async function(event) {
      if (event.interactionName === 'approve') { ... }
    }
  })
})

// 监听自定义事件源的 record
const settlementResult = Dictionary.create({
  name: 'lastSettlement',
  computation: Transform.create({
    record: CronEventRecord,  // 监听定时任务事件的独立实体
    callback: async function(event) {
      return event.triggeredAt
    }
  })
})
```

每个事件源有独立的 record 实体，Computation 通过指定不同的 `record` 来精确监听感兴趣的事件类型，无需在 callback 中做额外过滤。

### 3.2 对 Scheduler 的影响

Scheduler 不需要结构性变更。它监听的是 Storage 层面的 mutation events，这一层与事件源类型无关。任何事件源的 `record` 实体创建记录时都会产生 mutation event，Scheduler 正常响应即可。

### 3.3 Controller 注册事件源的 record 实体

Controller 在构造时遍历所有 `eventSources`，将每个事件源的 `record` 实体注册到 `this.entities` 中（去重），确保 Storage 层建表时包含这些事件记录表。

---

## 4. 完整的类型定义

```typescript
// ===== EventSource 定义 =====

interface EventSourceInstance<TArgs = any, TResult = void> extends IInstance {
  name: string
  record: EntityInstance
  guard?: (this: Controller, args: TArgs) => Promise<void>
  mapEventData?: (args: TArgs) => Record<string, any>
  resolve?: (this: Controller, args: TArgs) => Promise<TResult>
}

interface EventSourceCreateArgs<TArgs = any, TResult = void> {
  name: string
  record: EntityInstance
  guard?: (this: Controller, args: TArgs) => Promise<void>
  mapEventData?: (args: TArgs) => Record<string, any>
  resolve?: (this: Controller, args: TArgs) => Promise<TResult>
}

class EventSource {
  static create<TArgs = any, TResult = void>(
    args: EventSourceCreateArgs<TArgs, TResult>
  ): EventSourceInstance<TArgs, TResult>
}

// ===== Interaction（内置 EventSource 类型） =====

type InteractionEventArgs = {
  user: EventUser
  query?: EventQuery
  payload?: EventPayload
  activityId?: string
}

// InteractionEventEntity 保持不变，即当前的 _Interaction_ 实体
const InteractionEventEntity = Entity.create({
  name: '_Interaction_',
  properties: [
    Property.create({ name: 'interactionId', type: 'string' }),
    Property.create({ name: 'interactionName', type: 'string' }),
    Property.create({ name: 'payload', type: 'object' }),
    Property.create({ name: 'user', type: 'object' }),
    Property.create({ name: 'query', type: 'object' }),
  ]
})

interface InteractionInstance extends EventSourceInstance<InteractionEventArgs> {
  conditions?: ConditionsInstance | ConditionInstance
  userAttributives?: AttributivesInstance | AttributiveInstance
  userRef?: AttributiveInstance
  action: ActionInstance
  payload?: PayloadInstance
  data?: EntityInstance | RelationInstance
  dataPolicy?: DataPolicyInstance
  // record: InteractionEventEntity（由 create 自动设置）
  // guard, mapEventData, resolve 由 Interaction.create 自动生成
}

class Interaction {
  static create(args: InteractionCreateArgs): InteractionInstance
}

// ===== DispatchResponse =====

type DispatchResponse = {
  error?: unknown
  data?: unknown
  effects?: RecordMutationEvent[]
  sideEffects?: { [k: string]: SideEffectResult }
  context?: { [k: string]: unknown }
}

// ===== Controller =====

interface ControllerOptions {
  system: System
  entities?: EntityInstance[]
  relations?: RelationInstance[]
  eventSources?: EventSourceInstance[]
  dict?: DictionaryInstance[]
  recordMutationSideEffects?: RecordMutationSideEffect<any>[]
  computations?: (new (...args: any[]) => Computation)[]
  ignoreGuard?: boolean
  forceThrowDispatchError?: boolean
}

class Controller {
  dispatch<TArgs, TResult>(
    eventSource: EventSourceInstance<TArgs, TResult>,
    args: TArgs
  ): Promise<DispatchResponse & { data?: TResult }>
}
```

---

## 5. 迁移计划

### 5.1 迁移步骤

1. **创建 EventSource 基础设施**
   - 实现 `EventSource` 类 (`src/shared/EventSource.ts`)，接口中包含 `record` 字段

2. **重构 Controller**
   - 修改 `ControllerOptions`：新增 `eventSources`，保留但标记废弃 `activities` / `interactions`
   - 实现 `dispatch` 方法
   - `callInteraction` 内部改为创建临时 EventSourceInstance 并调用 `dispatch`（过渡期兼容）

3. **重构 Interaction 为 EventSource 类型**
   - `InteractionInstance` 继承 `EventSourceInstance<InteractionEventArgs>`
   - `Interaction.create` 内部根据声明式字段自动生成 `guard`、`mapEventData`、`resolve`
   - 提取 `InteractionCall` 中的检查逻辑为独立函数供 `guard` 调用
   - `Activity.create` 包装其 Interaction 的 `guard`，追加状态检查

4. **重构 Computation 层**
   - Interaction 的 Computation 保持监听 `InteractionEventEntity` 不变
   - Controller 构造时收集所有事件源的 `record` 实体，注册到 entities 中

5. **更新测试**
   - 现有测试逐步迁移到使用 `dispatch` API
   - 新增自定义事件源类型的测试

### 5.2 兼容性策略

过渡期可以保留 `callInteraction` 方法作为语法糖：

```typescript
class Controller {
  /** @deprecated 使用 dispatch() 替代 */
  async callInteraction(
    interactionName: string,
    args: InteractionEventArgs,
    activityName?: string,
    activityId?: string
  ): Promise<DispatchResponse> {
    const eventSource = this.findEventSourceByName(interactionName)
    return this.dispatch(eventSource, args)
  }
}
```

---

## 6. 架构对比

### 重构前

```
Controller
  ├── callInteraction(name, args)        ← 唯一入口
  ├── ActivityManager
  │   ├── InteractionCall[]              ← 紧耦合
  │   └── ActivityCall[]                 ← 紧耦合
  ├── Scheduler
  │   └── listens to Storage mutations
  └── InteractionEventEntity (_Interaction_)  ← 特定实体
```

### 重构后

```
Controller
  ├── dispatch(eventSource, args)        ← 统一入口
  ├── Scheduler
  │   └── listens to Storage mutations   ← 不变
  └── eventSources[]                     ← 可扩展，每个有独立 record 实体
      ├── Interaction 类型 (内置)
      │   ├── record: _Interaction_
      │   └── guard: checkCondition + checkUser + checkPayload
      ├── CronJob 类型 (用户自定义)
      │   ├── record: _CronEvent_
      │   └── guard: checkSchedule
      └── Webhook 类型 (用户自定义)
          ├── record: _PaymentEvent_
          └── guard: verifySignature
```

### 核心改进

1. **开放-封闭原则**：新增事件源类型不需要修改 Controller
2. **统一机制**：所有事件源共享 dispatch → guard → save → compute 流程
3. **关注点分离**：事务管理在 Controller，类型检查在 EventSource
4. **类型安全**：dispatch 使用对象引用 + 泛型，编译期类型检查
5. **可扩展性**：任何系统都可以成为数据变更的驱动来源
