
任务二：根据用户的请求生成对应的 @interaqt/runtime 的数据结构
用户将向你提问，要你将一些常见系统（例如 OA/ERP/CRM）的功能写成 @interaqt/runtime 的数据结构。你需要根据用户的请求，生成完整的数据结构代码。
当响应请求时，按照以下的步骤完成：

第一步：根据用户提问所需要的功能整理信息。
根据用户提问所需要的功能整理信息，整理出用户请求功能中的用户角色、数据实体、每个角色需要与系统进行的交互（包括交互中必须带有的信息）、全局状态。

第二步：使用 @interaqt/runtime 的数据结构描述角色信息
1. 首先创建一个 User 实体，包含常见的属性。用于代表与系统进行交互的用户。必须使用 @interaqt/runtime 中的 `Entity` 类型进行创建。例如：

```typescript
const UserEntity = Entity.create({
    name: 'User',
    properties: [
        Property.create({name: 'name', type: PropertyTypes.String})
    ],
})
```

2. 使用 @interaqt/runtime 中的辅助函数 `createUserRoleAttributive` 创建"角色定语"。
   为刚才整理出的每一个角色都创建一个"角色定语"，它将在后面的"交互"中用于描述什么角色可以执行什么交互动作。例如，如果系统有一个角色叫做 admin，那么可以这样创建：
```typescript
const adminRole = createUserRoleAttributive({ name: 'admin' })
```

第三步：使用 @interaqt/runtime 的数据结构描述"非获取数据类型的交互"
一个交互的基本类型是 `Interaction`，它的具体类型定义在上面提供给你的类型文件中有。
1. 使用 `Action.create` 创建"动作"，动作的名字一般与当前交互的名字一致。例如：创建一个名为 `createRequest` 的动作。
```typescript
const createRequestAction = Action.create({ name: 'createRequest' })
```
2. 使用 `Payload.create` 创建交互中可以附带或者必须附带的数据。用 `PayloadItem.create` 创建其中的单项。例如，创建一个名为 `request` 的附带数据表示具体请求信息，和一个名为 `to`的附带数据表示请求要发送给的用户：

```typescript
const requestPayload = Payload.create({
    items: [
        PayloadItem.create({
            name: 'request',
            base: RequestEntity,
        }),
        PayloadItem.create({
            name: 'to',
            base: UserEntity,
            isRef: true,
        })
    ]
})
```

如果附带的数据是一个已经存在的，那么可以使用 `isRef: true` 来表示这个数据是一个引用，而不是一个新的数据。


3. 使用 `Interaction.create` 创建交互。例如，创建一个名为 `createRequest` 的交互，它的动作是 `createRequestAction`，它的附带数据是 `requestPayload`，它的角色定语是 `adminRole`。
```typescript
const createRequestInteraction = Interaction.create({
    userAttributives: adminRole,
    name: 'createRequest',
    action: createRequestAction,
    payload: requestPayload,

})
```

当角色定语比较复杂时，需要进行逻辑组合时，可以使用 `BoolExp` 来创建逻辑组合，再用 `boolExpToAttributives` 转换成角色定语。
例如，如果要求只有 admin 和 supervisor 才能执行这个交互，那么可以这样写：

```typescript
const supervisorRole = createUserRoleAttributive({ name: 'supervisor' })
const createRequestInteraction = Interaction.create({
    userAttributives: boolExpToAttributives(BoolExp.atom(adminRole).or(BoolExp.atom(supervisorRole))),
    name: 'createRequest',
    action: createRequestAction,
    payload: requestPayload,
})
```

定语使用的文档如下：

```markdown
## 使用 Attribute

Attributive 可以限制可以执行当前 Interaction 的用户，也可以用来限制 Payload。

### 创建 Attributive

不要在 Attributive 中使用外部变量，应该保持 Attributive 是个纯函数。不然会在序列化和反序列化时失效。

一个声明 “我的” 的 Attributive 如下：

```typescript
const Mine = Attributive.create({
    name: 'Mine',
    content:  function(this: Controller, request, { user }){
      return request.owner === user.id
    }
})
```

在 Interaqt/runtime 中我们为你内置了一个 `createUserRoleAttributive` 函数帮助你快速创建角色定语：
```typescript
const adminRole = createUserRoleAttributive({name: 'admin'})
```
注意，它假定了你的 User Entity 中含有一个 `string[]` 类型的 `roles` 字段。

### 创建通用的 Attributive

可以在业务上规定一些固定的定语，例如上面例子中 “我的”：它会检查实体上的 owner 字段是不是指向当前 interaction 请求的用户。那么只有有 `owner`
字段，并且确实是 UserEntity 类型，就可以使用这个定语。
当然，如果你不想固定用 `owner` 这个名字，但又想使用通用的定语，我们可以把字段信息和相应的实体细心通过 controller.globals 注入到 attributive 中让它动态判断。

### 使用 BoolExp 来连接 Attributive

当定语限制条件比较复杂时，我们可以通过 `BoolExp` 来连接多个定语建立逻辑组合，然后再通过 `boolExpToAttributives` 转化成定语。

```typescript
const MyPending = boolExpToAttributives(
    BoolExp.atom(Mine).and(
        Attributive.create({
            name: 'Pending',
            content: async function(this: Controller, request, { user }){
             return request.result === 'pending'
            }
        })
    )
)
```
```


第四步：使用 @interaqt/runtime 中的数据结构定义"获取数据类型"的交互

当我们要获取数据时，可以通过创建 GET Interaction 来实现。例如，获取我的所有等待中的请求：

```typescript
import {GetAction} from "@interaqt/runtime";

const getMyPendingRequestsInteraction = Interaction.create({
    name: 'getMyPendingRequests',
    action: GetAction,
    dataAttributive: boolExpToAttributives(
        BoolExp.atom(Mine).and(
            Attributive.create({
                name: 'Pending',
                content: async function(this: Controller, request, { user }){
                    return request.result === 'pending'
                }
            })
        )),
    data: RequestEntity,
})
```

注意，它的 action 必须是 import 进来的 GetAction。
它的 data 字段，表示用户获取的数据类型。
它的 dataAttributive，使用来限制用户能获取的数据范围的。

当我们要获取的内容不是一个简单的实体，而是一种计算/组合结果时，我们可以通过定义一个  Computation 来实现：

例如，获取系统中用户平均创建的 Request 数量：

```typescript
const average = Computation.create({
    content: async function() {
        const totalUsers = await this.system.storage.find('User').length
        const totalRequests = await this.system.storage.find('Request').length
        return totalRequests/totalUsers
    }
})

const getMyPendingRequestsInteraction = Interaction.create({
    name: 'getAverage',
    action: GetAction,
    data: averageRequestsCount,
})

```

第五步：使用 @interaqt/runtime 的 Computed Data Type 描述实体、关系、以及它们的属性是什么，已经和系统中的交互的关系。
Computed Data Type 的文档如下：


```markdown
# Use Computed Data

Computed Data 是 @interaqt/runtime 中的核心概念，@interaqt/runtime 提供了一些列工具来帮助你定义数据内容“是什么”。
定义完成之后，数据应该如何变化就是自动的了。这也是和其他框架最大的区别。
以下是系统提供的所有 computed data 类型。注意下面面的 Record 就是 Entity 和 Relation 的统称。

## 用来表示 Entity/Relation 数据的 computed data

### MapActivityToRecord
为每一个的 activity 创建一个 Entity/Relation。通常用于将一个 activity 中的信息都整合起来。
示例：将 "createFriendRelation" 活动中的所有信息整合成一个名为 Request 的实体。
```typescript
export const requestEntity = Entity.create({
    name: 'Request',
    computedData: MapActivityToRecord.create({
        sourceActivity: createFriendRelationActivity,
        triggerInteraction: [sendInteraction, approveInteraction, rejectInteraction],  // 触发数据计算的 interation
        handle: function map(stack) {  // 计算数据的函数
            const sendRequestEvent = stack.find((i: any) => i.interaction.name === 'sendRequest')

            if (!sendRequestEvent) {
                return undefined
            }

            const handled = !!stack.find((i: any) => i.interaction.name === 'approve' || i.interaction.name === 'reject')

            return {
                from: sendRequestEvent.data.user,
                to: sendRequestEvent.data.payload.to,
                message: sendRequestEvent.data.payload.message,
                handled,
            }
        }
    })
})
```

### MapInteractionToRecord
为每一个 interaction 创建一个 Entity/Relation。通常用于将一个 interaction 中的用户信息和 Payload 关联起来。

示例：将发送申请的用户和发送的申请关联起来，创建 relation 数据
```typescript
const sendRequestRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:1',
    properties: [
        Property.create({
            name: 'createdAt',
            type: 'string'
        })
    ],
    computedData: MapInteractionToRecord.create({
        sourceInteraction: createInteraction,
        handle: function map(event: any) {
            return {
                source: event.payload.request,
                createdAt: Date.now().toString(), // 记录在关系上的数据。
                target: event.user,
            }
        }
    }),
})
```

### MapRecordMutationToRecord

将 RecordMutation 转换为 Entity/Relation。通常用于记录变更，可以利用它来为变更的记录产生历史版本。
示例：为每次 post 的修改都产生一个历史版本
```typescript
const postRevisionEntity = Entity.create({
    name: 'PostRevision',
    properties: [
        Property.create({ name: 'content', type: PropertyTypes.String })
    ],
    computedData: MapRecordMutationToRecord.create({
        handle: async function (this: Controller, event:RecordMutationEvent, events: RecordMutationEvent[]) {
            if (event.type === 'update' && event.recordName === 'Post') {
                return {
                    content: event.oldRecord!.content,
                    current: {
                        id: event.oldRecord!.id
                    }
                }
            }
        }
    })
})
```

### RelationStateMachine

利用状态机来表示 relation 的建立/删除/修改。
详情请见 [Use Relation StateMachine](./UseRelationStateMachine.md)


## 用来表示 Entity/Relation 中的字段

### RelationBasedAny

创建一个 bool 字段，用来表示当前实体的某一个 relation 类型的相关实体以及关联关系上的数据是否存在一个满足条件。
示例: “当前申请是否被拒绝”。
```typescript
Property.create({
    name: 'rejected',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedAny.create({
        relation: receivedRequestRelation,
        relationDirection: 'source',
        matchExpression:
            (_, relation) => {
                return relation.result === 'rejected'
            }

    })
})
```

### RelationBasedEvery

创建一个 bool 字段，用来表示当前实体的某一个 relation 类型的相关实体以及关联关系上的数据是否每一个都满足条件。
示例 “当前申请是否通过”。
```typescript
Property.create({
    name: 'approved',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedEvery.create({
        relation: receivedRequestRelation,
        relationDirection: 'source',
        notEmpty: true,
        matchExpression:
            (_, relation) => {
                return relation.result === 'approved'
            }

    })
})
```

### RelationCount
用于计算实体的某个 Relation 的已有数据的总和。
示例：我有多少未处理的请求
```typescript
Property.create({
    name: 'pendingRequestCount',
    type: 'number',
    collection: false,
    computedData: RelationCount.create({
        relation: reviewerRelation,
        relationDirection: 'target',
        matchExpression: function (request, relation) {
            return request.result === 'pending'
        }
    })
})
```

### RelationBasedWeightedSummation
基于某一个 Relation 类型的关联实体和关系上的数据进行加权计算。

### MapInteractionToProperty
将 Interaction 映射成实体上的字段。通常用于记录 interaction 上 payload 的信息。
例如：一旦用户执行了同意操作，就在用户和申请的 relation 的  result 字段上记录下来
```typescript
Property.create({
    name: 'result',
    type: 'string',
    collection: false,
    computedData: MapInteractionToProperty.create({
        items: [                                    // 可以监听多种 Interaction，有多种计算值的方式。
            MapInteractionToPropertyItem.create({
                interaction: approveInteraction,   // 监听的 Interaction
                handle: () => 'approved',          // 监听的 Interaction 触发时，计算得到的 property 值
                computeSource: async function (this: Controller, event) {   // 根据 interaction event 计算出受影响的记录
                    return {
                        "source.id": event.payload.request.id,
                        "target.id": event.user.id
                    }
                }
            }),
        ],
    })
})
```

### 用来表示全局字段的 computed data

### Any
是否某种 Record 存在一个数据满足条件。
示例：全局是否有任何一个申请被处理了：
```typescript
const anyRequestHandledState = State.create({
    name: 'anyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Any.create({
        record: requestEntity,
        matchExpression: (request) => {
            return request.handled
        }
    })
})
```

### Every
是否某种 Record 的所有数据都满足条件。
示例：全局是否所有的申请都被处理了：
```typescript
const everyRequestHandledState = State.create({
    name: 'everyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Every.create({
        record: requestEntity,
        matchExpression: (request) => {
            return request.handled
        }
    })
})
```

### RecordCount
统计某种 Record 的总数
示例：全局所有的朋友关系总数
```typescript
const totalFriendRelationState = State.create({
    name: 'totalFriendRelation',
    type: 'number',
    collection: false,
    computedData: Count.create({
        record: friendRelation,
        matchExpression: () => true
    })
})
```

### WeightedSummation
基于所有 Record 的加权计算

## 自定义 computed data

### ComputedDataHandle
所有的 computed data 都是通过 ComputedDataHandle 来实现的。你可以通过继承 ComputedDataHandle 来实现自己的 computed data。

### IncrementalComputedDataHandle
IncrementalComputedDataHandle 是 ComputedDataHandle 的子类，它提供了一些增量计算的工具来帮助你实现 computed data。
```

例如现在要建立用户（User）和用户执行的申请交互(createRequestInteraction) 中附带的请求（Request）之间的关系，那么这个关系应该写成

```typescript
const sendRequestRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:1',
    computedData: MapInteractionToRecord.create({
        sourceInteraction: createInteraction,
        handle: function map(event: any) {
            return {
                source: event.payload.request,
                target: event.user,
            }
        }
    }),
})
```

它的 computedData 字段就是用来描述这个 Relation 的数据是从何而来的。


第六步：将上面所有创建的信息，整理成一个完整的 typescript 文件，并返回给用户。

例如，当用户提出"给我一个 OA 中常见的发送申请的功能的 @interaqt/runtime 数据结构时"，你应该返回如下面的代码：

```typescript
import {Controller, Action,
    Attributive,
    BoolExp,
    boolExpToAttributives,
    boolExpToDataAttributives,
    createUserRoleAttributive,
    DataAttributive,
    Entity,
    GetAction,
    Interaction,
    MapInteractionToProperty,
    MapInteractionToPropertyItem,
    MapInteractionToRecord,
    Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    Relation,
    RelationBasedAny,
    RelationBasedEvery,
    RelationCount} from "@interaqt/runtime";

export const globalUserRole = createUserRoleAttributive({})


const UserEntity = Entity.create({
    name: 'User',
    properties: [
        Property.create({name: 'name', type: PropertyTypes.String})
    ],
})

const supervisorRelation = Relation.create({
    source: UserEntity,
    sourceProperty: 'supervisor',
    target: UserEntity,
    targetProperty: 'subordinate',
    relType: 'n:1',
})


const RequestEntity = Entity.create({
    name: 'Request',
    properties: [Property.create({
        name: 'reason',
        type: 'string',
        collection: false,
    })]
})


export const createInteraction = Interaction.create({
    name: 'createRequest',
    action: Action.create({name: 'createRequest'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'request',
                base: RequestEntity,
            })
        ]
    })
})


// 同意
export const approveInteraction = Interaction.create({
    name: 'approve',
    action: Action.create({name: 'approve'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'request',
                base: RequestEntity,
                isRef: true,
                attributives: boolExpToAttributives(BoolExp.atom(Attributive.create({
                    name: 'Mine',
                    content: async function (this: Controller, request, {user}) {
                        const relationName = this.system.storage.getRelationName('User', 'request')
                        const {BoolExp} = this.globals
                        const match = BoolExp.atom({
                            key: 'source.id',
                            value: ['=', request.id]
                        }).and({
                            key: 'target.id',
                            value: ['=', user.id]
                        })
                        const relation = await this.system.storage.findOneRelationByName(relationName, match)
                        // CAUTION 不能 return undefined，会被忽略
                        return !!relation
                    }
                })).and(Attributive.create({
                    name: 'Pending',
                    content: async function (this: Controller, request, {user}) {
                        return request.result === 'pending'
                    }
                })))
            })
        ]
    })
})


const sendRequestRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:1',
    computedData: MapInteractionToRecord.create({
        sourceInteraction: createInteraction,
        handle: function map(event: any) {
            return {
                source: event.payload.request,
                target: event.user,
            }
        }
    }),
})

// 主管和 request 的 relation
const reviewerRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'reviewer',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:n',
    computedData: MapInteractionToRecord.create({
        sourceInteraction: createInteraction,
        handle: async function map(this: Controller, event: any) {
            const {BoolExp} = this.globals

            const match = BoolExp.atom({
                key: 'id',
                value: ['=', event.user.id]
            })

            const {supervisor} = await this.system.storage.findOne(
                'User',
                match,
                undefined,
                [
                    ['supervisor', {attributeQuery: [['supervisor', {attributeQuery: ['*']}]]}],
                ]
            )

            return [{
                source: event.payload.request,
                target: supervisor,
            }, {
                source: event.payload.request,
                isSecond: true,
                target: supervisor.supervisor,
            }]
        }
    }),
    properties: [
        Property.create({
            name: 'isSecond',
            type: 'boolean',
            collection: false,
        }),
        Property.create({
            name: 'result',
            type: 'string',
            collection: false,
            computedData: MapInteractionToProperty.create({
                items: [
                    MapInteractionToPropertyItem.create({
                        interaction: approveInteraction,
                        handle: () => 'approved',
                        computeSource: async function (this: Controller, event) {

                            return {
                                "source.id": event.payload.request.id,
                                "target.id": event.user.id
                            }
                        }
                    }),
                ],
            })
        })
    ]
})


RequestEntity.properties.push(
    Property.create({
        name: 'approved',
        type: 'boolean',
        collection: false,
        computedData: RelationBasedEvery.create({
            relation: reviewerRelation,
            relationDirection: 'source',
            notEmpty: true,
            matchExpression:
                (_, relation) => {
                    return relation.result === 'approved'
                }
        })
    }),
    Property.create({
        name: 'rejected',
        type: 'boolean',
        collection: false,
        computedData: RelationBasedAny.create({
            relation: reviewerRelation,
            relationDirection: 'source',
            matchExpression:
                (_, relation) => {
                    return relation.result === 'rejected'
                }
        })
    }),
    Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computed: (request: any) => {
            return request.approved ? 'approved' : (request.rejected ? 'rejected' : 'pending')
        }
    }),
)

// 我有多少未处理的
UserEntity.properties.push(
    Property.create({
        name: 'pendingRequestCount',
        type: 'number',
        collection: false,
        computedData: RelationCount.create({
            relation: reviewerRelation,
            relationDirection: 'target',
            matchExpression: function (request, relation) {
                return request.result === 'pending'
            }
        })
    })
)

// 我有多少未处理的二级 request
UserEntity.properties.push(
    Property.create({
        name: 'pendingSubRequestCount',
        type: 'number',
        collection: false,
        computedData: RelationCount.create({
            relation: reviewerRelation,
            relationDirection: 'target',
            matchExpression: function (request, relation) {
                return relation.isSecond && request.result === 'pending'
            }
        })
    })
)

const MineDataAttr = DataAttributive.create({
    name: 'MyData',
    content: (event) => {
        return {
            key: 'reviewer.id',
            value: ['=', event.user.id]
        }
    }
})

const PendingDataAttr = DataAttributive.create({
    name: 'PendingData',
    content: (event) => {
        return {
            key: 'result',
            value: ['=', 'pending']
        }
    }
})

// 查看 我的、未处理的 request
const getMyPendingRequests = Interaction.create({
    name: 'getMyPendingRequests',
    action: GetAction,
    dataAttributives: boolExpToDataAttributives(BoolExp.atom(MineDataAttr).and(PendingDataAttr)),
    data: RequestEntity,
})

export const entities = [UserEntity, RequestEntity]
export const relations = [supervisorRelation, sendRequestRelation, reviewerRelation]
export const interactions = [createInteraction, approveInteraction, getMyPendingRequests]
export const states = []
export const activities = []

```

再例如，当用户提出"给我一个社交网站中交友功能的 @interaqt/runtime 数据结构时"，你应该返回如下面的代码：

```typescript

import {
    Action,
    Activity,
    ActivityGroup,
    Any,
    Attributive,
    BoolExp,
    boolExpToAttributives,
    Controller,
    Count,
    createUserRoleAttributive,
    Entity,
    Every,
    Interaction,
    MapActivityToRecord,
    MapInteractionToProperty,
    MapInteractionToPropertyItem,
    MapRecordMutationToRecord,
    Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    RecordMutationEvent,
    Relation,
    RelationBasedAny,
    RelationBasedEvery,
    RelationCount,
    RelationStateMachine,
    RelationStateNode,
    RelationStateTransfer,
    State,
    Transfer,
    USER_ENTITY
} from "@interaqt/runtime";

const userRefA = createUserRoleAttributive({name: 'A', isRef: true})

export const userRefB = createUserRoleAttributive({name: 'B', isRef: true})
export const messageEntity = Entity.create({
    name: 'Message',
    properties: [Property.create({
        name: 'content',
        type: 'string',
        collection: false,
    })]
})
export const OtherAttr = Attributive.create({
    name: 'Other',
    content:
        function Other(targetUser, {user}) {
            return user.id !== targetUser.id
        }
})
export const Admin = createUserRoleAttributive({
    name: 'Admin'
})
export const Anonymous = createUserRoleAttributive({
    name: 'Anonymous'
})
export const globalUserRole = createUserRoleAttributive({})
export const UserEntity = Entity.create({name: USER_ENTITY})
export const nameProperty = Property.create({name: 'name', type: PropertyTypes.String})
export const ageProperty = Property.create({name: 'age', type: PropertyTypes.Number})
export const sendInteraction = Interaction.create({
    name: 'sendRequest',
    userRef: userRefA,
    action: Action.create({name: 'sendRequest'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'to',
                attributives: boolExpToAttributives(BoolExp.atom(OtherAttr)),
                base: UserEntity,
                itemRef: userRefB,
                isRef: true
            }),
            PayloadItem.create({
                name: 'message',
                base: messageEntity,
            })
        ]
    })
})
export const MyFriend = Attributive.create({
    name: 'MyFriend',
    content:
        async function MyFriend(this: Controller, target, {user}) {
            const relationName = this.system.storage.getRelationName('User', 'friends')
            const {BoolExp} = this.globals
            const match = BoolExp.atom({
                key: 'source.id',
                value: ['=', user.id]
            }).and({
                key: 'target.id',
                value: ['=', target.id]
            })

            return !!(await this.system.storage.findOneRelationByName(relationName, match))
        }
})
export const approveInteraction = Interaction.create({
    name: 'approve',
    userAttributives: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'approve'}),
    payload: Payload.create({})
})
export const rejectInteraction = Interaction.create({
    name: 'reject',
    userAttributives: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'reject'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'reason',
                base: messageEntity,
            })
        ]
    })
})
export const cancelInteraction = Interaction.create({
    name: 'cancel',
    userAttributives: userRefA,
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'cancel'}),
    payload: Payload.create({})
})
const responseGroup = ActivityGroup.create({
    type: 'any',
    activities: [
        Activity.create({
            name: "approveFriendRelation",
            interactions: [
                approveInteraction
            ]
        }),
        Activity.create({
            name: "rejectFriendRelation",
            interactions: [
                rejectInteraction
            ]
        }),
        Activity.create({
            name: "cancelFriendRelation",
            interactions: [
                cancelInteraction
            ]
        })
    ],
})
export const createFriendRelationActivity = Activity.create({
    name: "createFriendRelation",
    interactions: [
        sendInteraction
    ],
    groups: [
        responseGroup
    ],
    transfers: [
        Transfer.create({
            name: 'fromSendToResponse',
            source: sendInteraction,
            target: responseGroup
        })
    ]
})
export const deleteInteraction = Interaction.create({
    name: 'deleteFriend',
    action: Action.create({name: 'deleteFriend'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'target',
                // attributives: Attributives.create({
                //     content: BoolAtomData.create({data: MyFriend})
                // }),
                // 支持上面这种形式，也支持单独一个 Attributive 写法
                attributives: MyFriend,
                base: UserEntity,
                isRef: true,
            }),
        ]
    })
})
// friend 关系的状态机描述
const notFriendState = RelationStateNode.create({
    hasRelation: false
})
const isFriendState = RelationStateNode.create({
    hasRelation: true
})
const addFriendTransfer = RelationStateTransfer.create({
    sourceActivity: createFriendRelationActivity,
    triggerInteraction: approveInteraction,
    fromState: notFriendState,
    toState: isFriendState,
    handleType: 'computeSource',
    handle: async function (this: Controller, eventArgs, activityId) {
        const {BoolExp} = this.globals
        const match = BoolExp.atom({
            key: 'interactionName',
            value: ['=', 'sendRequest']
        }).and({
            key: 'activityId',
            value: ['=', activityId]
        })

        const sendEvent = (await this.system.getEvent(match))[0]
        return {
            source: sendEvent.args.user,
            target: eventArgs.user
        }
    }

})
const deleteFriendTransfer = RelationStateTransfer.create({
    // sourceActivity: activity,
    triggerInteraction: deleteInteraction,
    fromState: isFriendState,
    toState: notFriendState,
    handleType: 'computeSource',
    handle: async function (eventArgs, activityId) {
        return {
            source: eventArgs.user,
            target: eventArgs.payload.target
        }
    }

})
const friendRelationSM = RelationStateMachine.create({
    states: [notFriendState, isFriendState],
    transfers: [addFriendTransfer, deleteFriendTransfer],
    defaultState: notFriendState
})
export const friendRelation = Relation.create({
    source: UserEntity,
    sourceProperty: 'friends',
    target: UserEntity,
    targetProperty: 'friends',
    relType: 'n:n',
    computedData: friendRelationSM
})
export const mapFriendActivityToRequest = MapActivityToRecord.create({
    sourceActivity: createFriendRelationActivity,
    triggerInteraction: [sendInteraction, approveInteraction, rejectInteraction],
    handle: function map(stack) {
        const sendRequestEvent = stack.find((i: any) => i.interaction.name === 'sendRequest')

        if (!sendRequestEvent) {
            return undefined
        }

        const handled = !!stack.find((i: any) => i.interaction.name === 'approve' || i.interaction.name === 'reject')

        return {
            from: sendRequestEvent.data.user,
            to: sendRequestEvent.data.payload.to,
            message: sendRequestEvent.data.payload.message,
            handled,
        }
    }
})

export const requestEntity = Entity.create({
    name: 'Request',
    computedData: mapFriendActivityToRequest,
    properties: [Property.create({
        name: 'handled',
        type: 'boolean',
        collection: false,
    })]
})
export const sendRequestRelation = Relation.create({
    source: requestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:1'
})
export const receivedRequestRelation = Relation.create({
    source: requestEntity,
    sourceProperty: 'to',
    target: UserEntity,
    targetProperty: 'receivedRequest',
    relType: 'n:1',
    properties: [Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computedData: MapInteractionToProperty.create({
            items: [
                MapInteractionToPropertyItem.create({
                    interaction: approveInteraction,
                    handle: () => 'approved',
                    computeSource: async function (this: Controller, event, activityId) {
                        const {BoolExp} = this.globals
                        const match = BoolExp.atom({
                            key: 'activity.id',
                            value: ['=', activityId]
                        })

                        const request = await this.system.storage.findOne('Request', match)
                        return {
                            "source.id": request.id,
                            "target.id": event.user.id
                        }
                    }
                }),
                MapInteractionToPropertyItem.create({
                    interaction: rejectInteraction,
                    handle: () => 'rejected',
                    computeSource: async function (this: Controller, event, activityId) {
                        const {BoolExp} = this.globals
                        const match = BoolExp.atom({
                            key: 'activity.id',
                            value: ['=', activityId]
                        })

                        const request = await this.system.storage.findOne('Request', match)

                        return {
                            "source.id": request.id,
                            "target.id": event.user.id
                        }
                    }
                })
            ],
        })
    })]
})
export const messageToRequestRelation = Relation.create({
    source: requestEntity,
    sourceProperty: 'message',
    target: messageEntity,
    targetProperty: 'request',
    relType: '1:1'
})
// 计算 unhandled request 的总数
export const userTotalUnhandledRequest = RelationCount.create({
    relation: receivedRequestRelation,
    relationDirection: 'target',
    matchExpression:
        (request) => {
            return !request.handled
        }
    ,
})
UserEntity.properties.push(Property.create({
    name: 'totalUnhandledRequest',
    type: 'number',
    collection: false,
    computedData: userTotalUnhandledRequest
}))

UserEntity.properties.push(Property.create({
    name: 'everySendRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedEvery.create({
        relation: sendRequestRelation,
        relationDirection: 'target',
        matchExpression: (request) => request.handled
    })
}))

UserEntity.properties.push(Property.create({
    name: 'anySendRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedAny.create({
        relation: sendRequestRelation,
        relationDirection: 'target',
        matchExpression: (request) => request.handled
    })
}))

// 计算 total friend count
const userTotalFriendCount = RelationCount.create({
    relation: friendRelation,
    relationDirection: 'source',
    matchExpression: () => true
})

UserEntity.properties.push(Property.create({
    name: 'totalFriendCount',
    type: 'number',
    collection: false,
    computedData: userTotalFriendCount
})) // revision 的实现
export const postEntity = Entity.create({name: 'Post'})
const createPostInteraction = Interaction.create({
    name: 'createPost',
    action: Action.create({name: 'create'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'post',
                base: postEntity,
            }),
        ]
    })
})
export const updatePostInteraction = Interaction.create({
    name: 'updatePost',
    action: Action.create({name: 'update'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'post',
                base: postEntity,
                isRef: true
            }),
        ]
    })
})
export const postRevisionEntity = Entity.create({
    name: 'PostRevision',
    properties: [
        // 这里测试 title 不可更新，所以 revision 里面不记录。
        Property.create({name: 'content', type: PropertyTypes.String})
    ],
    computedData: MapRecordMutationToRecord.create({
        handle: async function (this: Controller, event: RecordMutationEvent, events: RecordMutationEvent[]) {
            if (event.type === 'update' && event.recordName === 'Post') {
                return {
                    content: event.oldRecord!.content,
                    current: {
                        id: event.oldRecord!.id
                    }
                }
            }
        }
    })
})
export const postRevisionRelation = Relation.create({
    source: postEntity,
    sourceProperty: 'revisions',
    target: postRevisionEntity,
    targetProperty: 'current',
    relType: '1:n',
})

postEntity.properties.push(
    Property.create({ name: 'title', type: PropertyTypes.String }),
    Property.create({
        name: 'content',
        type: PropertyTypes.String,
        computedData: MapInteractionToProperty.create({
            items: [
                MapInteractionToPropertyItem.create({
                    interaction: updatePostInteraction,
                    handle: (event) => { return event.payload.post.content },
                    computeSource: async function (this: Controller, event) {
                        return event.payload.post.id
                    }
                }),
            ]
        })
    }),
)
const totalFriendRelationState = State.create({
    name: 'totalFriendRelation',
    type: 'number',
    collection: false,
    computedData: Count.create({
        record: friendRelation,
        matchExpression: () => true
    })
})
const everyRequestHandledState = State.create({
    name: 'everyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Every.create({
        record: requestEntity,
        matchExpression: (request) => {
            return request.handled
        }
    })
})
const anyRequestHandledState = State.create({
    name: 'anyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Any.create({
        record: requestEntity,
        matchExpression: (request) => {
            return request.handled
        }
    })
})


UserEntity.properties.push(nameProperty, ageProperty)

requestEntity.properties.push(
    Property.create({
        name: 'approved',
        type: 'boolean',
        collection: false,
        computedData: RelationBasedEvery.create({
            relation: receivedRequestRelation,
            relationDirection: 'source',
            notEmpty: true,
            matchExpression:
                (_, relation) => {
                    return relation.result === 'approved'
                }

        })
    }),
    Property.create({
        name: 'rejected',
        type: 'boolean',
        collection: false,
        computedData: RelationBasedAny.create({
            relation: receivedRequestRelation,
            relationDirection: 'source',
            matchExpression:
                (_, relation) => {
                    return relation.result === 'rejected'
                }

        })
    }),
    Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computed: (request: any) => {
            return request.approved ? 'approved' : (request.rejected ? 'rejected' : 'pending')
        }
    }),
)

export const entities = [UserEntity, requestEntity, messageEntity, postEntity, postRevisionEntity]
export const relations = [...Relation.instances]
export const interactions = [...Interaction.instances]
export const states = [...State.instances]
export const activities = [...Activity.instances]
```

注意一定要导出 entities、relations、interactions、states、activities 这几个变量，它们是 @interaqt/runtime 的核心数据结构，
没有内容的可以导出空数组。

现在，当你学会了，就说"我学会了"，然后等待用户提问。