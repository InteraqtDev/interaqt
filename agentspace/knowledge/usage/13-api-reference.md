# 第13章：API 参考（API Reference）

本章提供 interaqt 框架所有核心 API 的详细参考文档，包括完整的参数说明、类型定义和使用示例。

## 13.1 实体相关 API

### Entity.create()

创建实体定义，实体是系统中数据的基本单位。

**语法**
```typescript
Entity.create(config: EntityConfig): KlassInstance<typeof Entity>
```

**参数**
- `config.name` (string, required): 实体名称，必须符合 `/^[a-zA-Z0-9_]+$/` 格式
- `config.properties` (Property[], required): 实体的属性列表，默认为空数组
- `config.computedData` (ComputedData[], optional): 实体级别的计算数据
- `config.sourceEntity` (Entity|Relation, optional): 过滤实体的源实体（用于创建过滤实体）
- `config.filterCondition` (MatchExp, optional): 过滤条件（用于创建过滤实体）

**示例**
```typescript
// 创建基本实体
const User = Entity.create({
    name: 'User',
    properties: [
        Property.create({ name: 'username', type: 'string' }),
        Property.create({ name: 'email', type: 'string' })
    ]
})

// 创建过滤实体
const ActiveUser = Entity.create({
    name: 'ActiveUser',
    sourceEntity: User,
    filterCondition: MatchExp.atom({
        key: 'status',
        value: ['=', 'active']
    })
})
```

### Property.create()

创建实体属性定义。

**语法**
```typescript
Property.create(config: PropertyConfig): KlassInstance<typeof Property>
```

**参数**
- `config.name` (string, required): 属性名称，长度必须在1-5个字符之间
- `config.type` (string, required): 属性类型，可选值：'string' | 'number' | 'boolean'
- `config.collection` (boolean, optional): 是否为集合类型
- `config.defaultValue` (function, optional): 默认值函数
- `config.computed` (function, optional): 计算属性函数
- `config.computedData` (ComputedData[], optional): 属性的计算数据

**示例**
```typescript
// 基本属性
const username = Property.create({
    name: 'username',
    type: 'string'
})

// 带默认值的属性
const createdAt = Property.create({
    name: 'createdAt',
    type: 'string',
    defaultValue: () => new Date().toISOString()
})

// 计算属性
const fullName = Property.create({
    name: 'fullName',
    type: 'string',
    computed: function(user) {
        return `${user.firstName} ${user.lastName}`
    }
})

// 带响应式计算的属性
const postCount = Property.create({
    name: 'postCount',
    type: 'number',
    defaultValue: () => 0,  // 必须提供默认值
    computedData: Count.create({
        record: UserPostRelation
    })
})
```

### Relation.create()

创建实体间的关系定义。

**语法**
```typescript
Relation.create(config: RelationConfig): KlassInstance<typeof Relation>
```

**参数**
- `config.source` (Entity|Relation, required): 关系的源实体
- `config.sourceProperty` (string, required): 源实体中的关系属性名
- `config.target` (Entity|Relation, required): 关系的目标实体
- `config.targetProperty` (string, required): 目标实体中的关系属性名
- `config.type` (string, required): 关系类型，可选值：'1:1' | '1:n' | 'n:1' | 'n:n'
- `config.properties` (Property[], optional): 关系自身的属性
- `config.symmetric` (boolean, optional): 是否为对称关系（仅适用于 n:n 关系）
- `config.computedData` (ComputedData[], optional): 关系级别的计算数据

**示例**
```typescript
// 一对多关系
const UserPostRelation = Relation.create({
    source: User,
    sourceProperty: 'posts',
    target: Post,
    targetProperty: 'author',
    type: '1:n'
})

// 多对多关系
const UserTagRelation = Relation.create({
    source: User,
    sourceProperty: 'tags',
    target: Tag,
    targetProperty: 'users',
    type: 'n:n'
})

// 对称关系（好友关系）
const FriendRelation = Relation.create({
    source: User,
    sourceProperty: 'friends',
    target: User,
    targetProperty: 'friends',
    type: 'n:n',
    symmetric: true
})

// 带属性的关系
const UserRoleRelation = Relation.create({
    source: User,
    sourceProperty: 'roles',
    target: Role,
    targetProperty: 'users',
    type: 'n:n',
    properties: [
        Property.create({ name: 'assignedAt', type: 'string' }),
        Property.create({ name: 'isActive', type: 'boolean' })
    ]
})
```

## 13.2 计算相关 API

### Count.create()

创建计数计算，用于统计记录数量。

**语法**
```typescript
Count.create(config: CountConfig): KlassInstance<typeof Count>
```

**参数**
- `config.record` (Entity|Relation, required): 要计数的实体或关系
- `config.direction` (string, optional): 关系方向，可选值：'source' | 'target'，仅适用于关系计数
- `config.callback` (function, optional): 过滤回调函数，返回布尔值决定是否计入计数
- `config.attributeQuery` (AttributeQueryData, optional): 属性查询配置，优化数据获取
- `config.dataDeps` (object, optional): 数据依赖配置，格式为 `{[key: string]: DataDep}`

**示例**
```typescript
// 基本全局计数
const totalUsers = Count.create({
    record: User
})

// 基本属性计数（用户的帖子数量）
const userPostCount = Property.create({
    name: 'postCount',
    type: 'number',
    defaultValue: () => 0,  // 必须提供默认值
    computedData: Count.create({
        record: UserPostRelation
    })
})

// 带过滤条件的计数（只计算已发布的帖子）
const publishedPostCount = Property.create({
    name: 'publishedPostCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
        record: UserPostRelation,
        attributeQuery: [['target', {attributeQuery: ['status']}]],
        callback: function(relation) {
            return relation.target.status === 'published'
        }
    })
})

// 带数据依赖的计数（基于全局设置的最小分数过滤）
const highScorePostCount = Property.create({
    name: 'highScorePostCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
        record: UserPostRelation,
        attributeQuery: [['target', {attributeQuery: ['score']}]],
        dataDeps: {
            minScore: {
                type: 'global',
                source: Dictionary.create({
                    name: 'minScoreThreshold',
                    type: 'number',
                    collection: false
                })
            }
        },
        callback: function(relation, dataDeps) {
            return relation.target.score >= dataDeps.minScore
        }
    })
})

// 全局计数，带过滤和数据依赖
const activeUsersCount = Dictionary.create({
    name: 'activeUsersCount',
    type: 'number',
    collection: false,
    computedData: Count.create({
        record: User,
        attributeQuery: ['lastLoginDate'],
        dataDeps: {
            activeDays: {
                type: 'global',
                source: Dictionary.create({
                    name: 'userActiveDays',
                    type: 'number',
                    collection: false
                })
            }
        },
        callback: function(user, dataDeps) {
            const daysSinceLogin = (Date.now() - new Date(user.lastLoginDate).getTime()) / (1000 * 60 * 60 * 24)
            return daysSinceLogin <= dataDeps.activeDays
        }
    })
})

// 关系计数带方向参数
const authorPostCount = Property.create({
    name: 'authoredPostCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
        record: UserPostRelation,
        direction: 'target'  // 从用户角度计数关联的帖子
    })
})
```

### WeightedSummation.create()

创建加权求和计算。

**语法**
```typescript
WeightedSummation.create(config: WeightedSummationConfig): KlassInstance<typeof WeightedSummation>
```

**参数**
- `config.record` (Entity|Relation, required): 要计算的实体或关系
- `config.callback` (function, required): 计算权重和值的回调函数，返回 `{weight: number, value: number}`
- `config.attributeQuery` (AttributeQueryData, required): 属性查询配置

**示例**
```typescript
// 计算用户总积分
const userTotalScore = Property.create({
    name: 'totalScore',
    type: 'number',
    defaultValue: () => 0,  // 必须提供默认值
    computedData: WeightedSummation.create({
        record: UserScoreRelation,
        callback: function(scoreRecord) {
            return {
                weight: scoreRecord.multiplier || 1,
                value: scoreRecord.points
            }
        }
    })
})

// 全局加权求和
const globalWeightedScore = WeightedSummation.create({
    record: ScoreRecord,
    callback: function(record) {
        return {
            weight: record.difficulty,
            value: record.score
        }
    }
})
```

### Every.create()

创建全部满足条件的布尔判断计算。

**语法**
```typescript
Every.create(config: EveryConfig): KlassInstance<typeof Every>
```

**参数**
- `config.record` (Entity|Relation, required): 要检查的实体或关系
- `config.callback` (function, required): 条件检查函数，返回布尔值
- `config.attributeQuery` (AttributeQueryData, required): 属性查询配置
- `config.notEmpty` (boolean, optional): 当集合为空时的返回值

**示例**
```typescript
// 检查用户是否完成所有必修课程
const completedAllRequired = Property.create({
    name: 'completedAllRequired',
    type: 'boolean',
    defaultValue: () => false,  // 必须提供默认值
    computedData: Every.create({
        record: UserCourseRelation,
        callback: function(courseRelation) {
            return courseRelation.status === 'completed'
        },
        notEmpty: false
    })
})
```

### Any.create()

创建任一满足条件的布尔判断计算。

**语法**
```typescript
Any.create(config: AnyConfig): KlassInstance<typeof Any>
```

**参数**
- `config.record` (Entity|Relation, required): 要检查的实体或关系
- `config.callback` (function, required): 条件检查函数，返回布尔值
- `config.attributeQuery` (AttributeQueryData, required): 属性查询配置

**示例**
```typescript
// 检查用户是否有任何待处理的任务
const hasPendingTasks = Property.create({
    name: 'hasPendingTasks',
    type: 'boolean',
    defaultValue: () => false,  // 必须提供默认值
    computedData: Any.create({
        record: UserTaskRelation,
        callback: function(taskRelation) {
            return taskRelation.status === 'pending'
        }
    })
})
```

### Transform.create()

创建自定义转换计算。

**语法**
```typescript
Transform.create(config: TransformConfig): KlassInstance<typeof Transform>
```

**参数**
- `config.record` (Entity|Relation, required): 要转换的实体或关系
- `config.callback` (function, required): 转换函数
- `config.attributeQuery` (AttributeQueryData, required): 属性查询配置

**示例**
```typescript
// 生成用户摘要信息
const userSummary = Property.create({
    name: 'summary',
    type: 'string',
    defaultValue: () => '',  // 必须提供默认值
    computedData: Transform.create({
        record: User,
        callback: function(user) {
            return `${user.username} (${user.email}) - ${user.posts?.length || 0} posts`
        }
    })
})
```

### StateMachine.create()

创建状态机计算。

**语法**
```typescript
StateMachine.create(config: StateMachineConfig): KlassInstance<typeof StateMachine>
```

**参数**
- `config.states` (StateNode[], required): 状态节点列表
- `config.transfers` (StateTransfer[], required): 状态转移列表
- `config.defaultState` (StateNode, required): 默认状态

**示例**
```typescript
// 订单状态机
const OrderStateMachine = StateMachine.create({
    states: [
        StateNode.create({ name: 'pending' }),
        StateNode.create({ name: 'confirmed' }),
        StateNode.create({ name: 'shipped' }),
        StateNode.create({ name: 'delivered' })
    ],
    transfers: [
        StateTransfer.create({
            current: StateNode.create({ name: 'pending' }),
            next: StateNode.create({ name: 'confirmed' }),
            trigger: ConfirmOrderInteraction
        })
    ],
    defaultState: StateNode.create({ name: 'pending' })
})
```

## 13.3 交互相关 API

### Interaction.create()

创建用户交互定义。

**语法**
```typescript
Interaction.create(config: InteractionConfig): KlassInstance<typeof Interaction>
```

**参数**
- `config.name` (string, required): 交互名称
- `config.action` (Action, required): 交互动作
- `config.payload` (Payload, optional): 交互参数
- `config.userAttributives` (Attributive|Attributives, optional): 用户权限定语
- `config.conditions` (Condition|Conditions, optional): 执行条件
- `config.sideEffects` (SideEffect[], optional): 副作用处理
- `config.data` (Entity|Relation, optional): 关联的数据实体
- `config.dataAttributives` (DataAttributive|DataAttributives, optional): 数据权限定语

**示例**
```typescript
// 创建帖子交互
const CreatePostInteraction = Interaction.create({
    name: 'createPost',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'postData',
                base: Post,
                required: true
            })
        ]
    }),
    userAttributives: Attributive.create({
        name: 'AuthenticatedUser',
        content: function(target, { user }) {
            return user.id !== undefined
        }
    })
})
```

### Action.create()

创建交互动作。

**语法**
```typescript
Action.create(config: ActionConfig): KlassInstance<typeof Action>
```

**参数**
- `config.name` (string, required): 动作名称

**示例**
```typescript
const CreateAction = Action.create({ name: 'create' })
const UpdateAction = Action.create({ name: 'update' })
const DeleteAction = Action.create({ name: 'delete' })
```

### Payload.create()

创建交互参数定义。

**语法**
```typescript
Payload.create(config: PayloadConfig): KlassInstance<typeof Payload>
```

**参数**
- `config.items` (PayloadItem[], required): 参数项列表，默认为空数组

**示例**
```typescript
const CreateUserPayload = Payload.create({
    items: [
        PayloadItem.create({
            name: 'userData',
            base: User,
            required: true
        }),
        PayloadItem.create({
            name: 'profileData',
            base: Profile,
            required: false
        })
    ]
})
```

### PayloadItem.create()

创建交互参数项。

**语法**
```typescript
PayloadItem.create(config: PayloadItemConfig): KlassInstance<typeof PayloadItem>
```

**参数**
- `config.name` (string, required): 参数名称
- `config.base` (Entity, required): 参数的实体类型
- `config.isRef` (boolean, optional): 是否为引用类型，默认 false
- `config.required` (boolean, optional): 是否必需，默认 false
- `config.isCollection` (boolean, optional): 是否为集合类型，默认 false
- `config.attributives` (Attributive|Attributives, optional): 参数权限定语

**示例**
```typescript
// 引用现有用户
const userRef = PayloadItem.create({
    name: 'user',
    base: User,
    isRef: true,
    required: true
})

// 创建新的帖子数据
const postData = PayloadItem.create({
    name: 'postData',
    base: Post,
    required: true,
    attributives: Attributive.create({
        name: 'ValidPost',
        content: function(post) {
            return post.title && post.content
        }
    })
})
```

## 13.4 活动相关 API

### Activity.create()

创建业务活动定义。

**语法**
```typescript
Activity.create(config: ActivityConfig): KlassInstance<typeof Activity>
```

**参数**
- `config.name` (string, required): 活动名称
- `config.interactions` (Interaction[], optional): 活动中的交互列表
- `config.transfers` (Transfer[], optional): 状态转移列表
- `config.groups` (ActivityGroup[], optional): 活动组列表
- `config.gateways` (Gateway[], optional): 网关列表
- `config.events` (Event[], optional): 事件列表

**示例**
```typescript
const OrderProcessActivity = Activity.create({
    name: 'OrderProcess',
    interactions: [
        CreateOrderInteraction,
        ConfirmOrderInteraction,
        PayOrderInteraction,
        ShipOrderInteraction
    ],
    transfers: [
        Transfer.create({
            name: 'createToConfirm',
            source: CreateOrderInteraction,
            target: ConfirmOrderInteraction
        }),
        Transfer.create({
            name: 'confirmToPay',
            source: ConfirmOrderInteraction,
            target: PayOrderInteraction
        })
    ]
})
```

### Transfer.create()

创建活动状态转移。

**语法**
```typescript
Transfer.create(config: TransferConfig): KlassInstance<typeof Transfer>
```

**参数**
- `config.name` (string, required): 转移名称
- `config.source` (Interaction|ActivityGroup|Gateway, required): 源节点
- `config.target` (Interaction|ActivityGroup|Gateway, required): 目标节点

**示例**
```typescript
const ApprovalTransfer = Transfer.create({
    name: 'submitToApprove',
    source: SubmitApplicationInteraction,
    target: ApproveApplicationInteraction
})
```

### Condition.create()

创建活动执行条件。

**语法**
```typescript
Condition.create(config: ConditionConfig): KlassInstance<typeof Condition>
```

**参数**
- `config.name` (string, required): 条件名称
- `config.content` (function, required): 条件判断函数

**示例**
```typescript
const OrderValueCondition = Condition.create({
    name: 'highValueOrder',
    content: function(order) {
        return order.totalAmount > 1000
    }
})
```

## 13.5 系统相关 API

### Controller

系统控制器，协调各个组件的工作。

**构造函数**
```typescript
new Controller(
    system: System,
    entities: KlassInstance<typeof Entity>[],
    relations: KlassInstance<typeof Relation>[],
    activities: KlassInstance<typeof Activity>[],
    interactions: KlassInstance<typeof Interaction>[],
    dict?: KlassInstance<typeof Property>[],
    recordMutationSideEffects?: RecordMutationSideEffect[]
)
```

**主要方法**

#### setup(install?: boolean)
初始化系统。
```typescript
await controller.setup(true) // 创建数据库表
```

#### callInteraction(interactionId: string, args: InteractionEventArgs)
调用交互。
```typescript
const result = await controller.callInteraction('createPost', {
    user: { id: 'user1' },
    payload: { postData: { title: 'Hello', content: 'World' } }
})
```

#### callActivityInteraction(activityCallId: string, interactionCallId: string, activityId: string, args: InteractionEventArgs)
调用活动中的交互。
```typescript
const result = await controller.callActivityInteraction(
    'activity-call-1',
    'interaction-call-1',
    'OrderProcess',
    { user: { id: 'user1' }, payload: { orderData: {...} } }
)
```

### System

系统抽象接口，定义了存储和日志等基础服务。

**接口定义**
```typescript
interface System {
    conceptClass: Map<string, ReturnType<typeof createClass>>
    storage: Storage
    logger: SystemLogger
    setup: (entities: Entity[], relations: Relation[], states: ComputationState[], install?: boolean) => Promise<any>
}
```

### Storage

存储层接口，提供数据持久化功能。

**主要方法**

#### Entity/Relation 操作
```typescript
// 创建记录
await storage.create('User', { username: 'john', email: 'john@example.com' })

// 查找单条记录
const user = await storage.findOne('User', MatchExp.atom({
    key: 'username',
    value: ['=', 'john']
}))

// 查找多条记录
const users = await storage.find('User', MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
}))

// 更新记录
await storage.update('User', MatchExp.atom({
    key: 'id',
    value: ['=', 'user1']
}), { status: 'inactive' })

// 删除记录
await storage.delete('User', MatchExp.atom({
    key: 'id',
    value: ['=', 'user1']
}))
```

#### KV 存储操作
```typescript
// 设置值
await storage.set('config', 'maxUsers', 1000)

// 获取值
const maxUsers = await storage.get('config', 'maxUsers', 100) // 默认值 100
```

## 13.6 工具函数 API

### MatchExp

查询表达式构建器，用于构建复杂的查询条件。

#### MatchExp.atom(condition: MatchAtom)
创建原子查询条件。

**参数**
- `condition.key` (string): 字段名，支持点号路径如 'user.profile.name'
- `condition.value` ([string, any]): 操作符和值的数组
- `condition.isReferenceValue` (boolean, optional): 是否为引用值

**支持的操作符**
- `['=', value]`: 等于
- `['!=', value]`: 不等于
- `['>', value]`: 大于
- `['<', value]`: 小于
- `['>=', value]`: 大于等于
- `['<=', value]`: 小于等于
- `['like', pattern]`: 模糊匹配
- `['in', array]`: 在数组中
- `['between', [min, max]]`: 在范围内
- `['not', null]`: 不为空

**示例**
```typescript
// 基本条件
const condition1 = MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
})

// 范围查询
const condition2 = MatchExp.atom({
    key: 'age',
    value: ['between', [18, 65]]
})

// 关联查询
const condition3 = MatchExp.atom({
    key: 'user.profile.city',
    value: ['=', 'Beijing']
})

// 组合条件
const complexCondition = MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
}).and({
    key: 'age',
    value: ['>', 18]
}).or({
    key: 'vip',
    value: ['=', true]
})
```

#### MatchExp.fromObject(condition: Object)
从对象创建查询条件（所有条件用 AND 连接）。

```typescript
const condition = MatchExp.fromObject({
    status: 'active',
    age: 25,
    city: 'Beijing'
})
// 等价于: status='active' AND age=25 AND city='Beijing'
```

### Attributive.create()

创建权限定语，用于控制访问权限。

**语法**
```typescript
Attributive.create(config: AttributiveConfig): KlassInstance<typeof Attributive>
```

**参数**
- `config.name` (string, optional): 定语名称
- `config.content` (function, required): 权限判断函数
- `config.isRef` (boolean, optional): 是否为引用

**示例**
```typescript
// 管理员权限
const AdminAttributive = Attributive.create({
    name: 'Admin',
    content: function(target, { user }) {
        return user.role === 'admin'
    }
})

// 资源所有者权限
const OwnerAttributive = Attributive.create({
    name: 'Owner',
    content: function(target, { user }) {
        return target.userId === user.id
    }
})

// 组合权限（使用 BoolExp）
const AdminOrOwnerAttributives = boolExpToAttributives(
    BoolExp.atom(AdminAttributive).or(OwnerAttributive)
)
```

### BoolExp

布尔表达式构建器，用于构建复杂的逻辑表达式。

#### BoolExp.atom(data: T)
创建原子表达式。

```typescript
const expr1 = BoolExp.atom({ condition: 'isActive' })
const expr2 = BoolExp.atom({ condition: 'isAdmin' })

// 组合表达式
const combined = expr1.and(expr2).or({ condition: 'isOwner' })
```

## 类型定义

### 核心类型

```typescript
// 实体实例类型
type EntityInstance = KlassInstance<typeof Entity>
type RelationInstance = KlassInstance<typeof Relation>
type InteractionInstance = KlassInstance<typeof Interaction>
type ActivityInstance = KlassInstance<typeof Activity>

// 交互事件参数
type InteractionEventArgs = {
    user: { id: string, [key: string]: any }
    payload?: { [key: string]: any }
    [key: string]: any
}

// 记录变更事件
type RecordMutationEvent = {
    recordName: string
    type: 'create' | 'update' | 'delete'
    record?: EntityIdRef & { [key: string]: any }
    oldRecord?: EntityIdRef & { [key: string]: any }
}

// 实体引用
type EntityIdRef = {
    id: string
    _rowId?: string
    [key: string]: any
}

// 属性查询数据
type AttributeQueryData = (string | [string, { attributeQuery?: AttributeQueryData }])[]
```

### 计算相关类型

```typescript
// 计算上下文
type DataContext = {
    type: 'global' | 'entity' | 'relation' | 'property'
    id: string | Entity | Relation
    host?: Entity | Relation
}

// 计算依赖
type DataDep = {
    type: 'records' | 'property'
    source?: Entity | Relation
    attributeQuery?: AttributeQueryData
}

// 计算结果
type ComputationResult = any
type ComputationResultPatch = {
    type: 'insert' | 'update' | 'delete'
    data?: any
    affectedId?: string
}
```

## 使用示例

### 完整的博客系统示例

```typescript
import { Entity, Property, Relation, Interaction, Activity, Controller } from 'interaqt'

// 1. 定义实体
const User = Entity.create({
    name: 'User',
    properties: [
        Property.create({ name: 'username', type: 'string' }),
        Property.create({ name: 'email', type: 'string' }),
        Property.create({
            name: 'postCount',
            type: 'number',
            computedData: Count.create({ record: UserPostRelation })
        })
    ]
})

const Post = Entity.create({
    name: 'Post',
    properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({ name: 'content', type: 'string' }),
        Property.create({
            name: 'likeCount',
            type: 'number',
            computedData: Count.create({ record: PostLikeRelation })
        })
    ]
})

// 2. 定义关系
const UserPostRelation = Relation.create({
    source: User,
    sourceProperty: 'posts',
    target: Post,
    targetProperty: 'author',
    type: '1:n'
})

const PostLikeRelation = Relation.create({
    source: Post,
    sourceProperty: 'likes',
    target: User,
    targetProperty: 'likedPosts',
    type: 'n:n'
})

// 3. 定义交互
const CreatePostInteraction = Interaction.create({
    name: 'createPost',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'postData',
                base: Post,
                required: true
            })
        ]
    }),
    userAttributives: Attributive.create({
        name: 'AuthenticatedUser',
        content: function(target, { user }) {
            return user.id !== undefined
        }
    })
})

const LikePostInteraction = Interaction.create({
    name: 'likePost',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'post',
                base: Post,
                isRef: true,
                required: true
            })
        ]
    })
})

// 4. 创建控制器并初始化系统
const controller = new Controller(
    system, // 系统实现
    [User, Post], // 实体
    [UserPostRelation, PostLikeRelation], // 关系
    [], // 活动
    [CreatePostInteraction, LikePostInteraction] // 交互
)

await controller.setup(true)

// 5. 使用 API
// 创建帖子
const result = await controller.callInteraction('createPost', {
    user: { id: 'user1' },
    payload: {
        postData: {
            title: 'Hello World',
            content: 'This is my first post!'
        }
    }
})

// 点赞帖子
await controller.callInteraction('likePost', {
    user: { id: 'user2' },
    payload: {
        post: { id: result.recordId }
    }
})
```

这个 API 参考文档涵盖了 interaqt 框架的所有核心 API，提供了完整的参数说明和实际使用示例。开发者可以根据这个文档快速上手并深入使用框架的各种功能。 