# Use Computed Data

Computed Data 是 @interaqt/runtime 中的核心概念，@interaqt/runtime 提供了一些列工具来帮助你定义数据内容“是什么”。
定义完成之后，数据应该如何变化就是自动的了。这也是和其他框架最大的区别。
以下是系统提供的所有 computed data 类型。注意下面面的 Record 就是 Entity 和 Relation 的统称。

## 用来表示 Entity/Relation 数据的 computed data

### MapActivity

将每一个 activity 映射成 一个 Entity/Relation/State 或者某一个 Entity/Relation 的 Property。
它通常用于将一个 activity 中的信息都整合起来的场景。
例如：将 "createFriendRelation" 活动中的所有信息整合成一个名为 Request 的实体：
```typescript
export const requestEntity = Entity.create({
    name: 'Request',
    computedData: MapActivity.create({
        items: [
            MapActivityItem.create({
                activity: createFriendRelationActivity,
                triggerInteractions: [sendInteraction, approveInteraction, rejectInteraction],  // 触发数据计算的 interation
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
        ]
    })
})
```

### MapInteraction

将每一个 interaction 映射成一个 Entity/Relation/State 或者某一个 Entity/Relation 的 Property。
通常用于将一个 interaction 中的用户信息和 Payload 关联起来，或者记录 Interaction 中的信息。

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
    computedData: MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: createInteraction,   // 监听的 Interaction
                handle: function map(event: any) {
                    return {
                        source: event.payload.request,
                        createdAt: Date.now().toString(), // 记录在关系上的数据。
                        target: event.user,
                    }
                }
            }),
        ],
    }),
})
```

也可以用于记录 interaction 上 payload 的信息。
示例：一旦用户执行了同意操作，就在用户和申请的 relation 的  result 字段上记录下来
```typescript
Property.create({
    name: 'result',
    type: 'string',
    collection: false,
    computedData: MapInteraction.create({
        items: [                                    // 可以监听多种 Interaction，有多种计算值的方式。
            MapInteractionItem.create({
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

### MapRecordMutation

将 RecordMutation 映射成 一个 Entity/Relation/State 或者某一个 Entity/Relation 的 Property。通常用于记录变更，可以利用它来为变更的记录产生历史版本。
示例：为每次 post 的修改都产生一个历史版本
```typescript
const postRevisionEntity = Entity.create({
    name: 'PostRevision',
    properties: [
        Property.create({ name: 'content', type: PropertyTypes.String })
    ],
    computedData: MapRecordMutation.create({
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
它只能用在 Property 上。
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
它只能用在 Property 上。
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
它只能用在 Property 上。

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
它只能用在 Property 上。


### 用来表示全局字段的 computed data

### Any
是否某种 Record 存在一个数据满足条件。
它只能用在 State 上。

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

### Every`
是否某种 Record 的所有数据都满足条件。
它只能用在 State 上。

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

### Count
统计某种 Record 的总数
它只能用在 State 上。

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
基于所有 Record 的加权计算。
它只能用在 State 上。

示例：假设系统中有一种实体叫 Request，它有 `approved` 和 `rejected` 两个 boolean 属性。我们希望定义个全局叫做 approveX 的值，
它是所有 Request 的加权计算总和，approved 为 true 的 Request 权重为 +2，rejected 为 true 的 Request 权重为 -1。

```typescript
const approveXState = State.create({
    name: 'approveX',
    type: 'number',
    collection: false,
    computedData: WeightedSummation.create({
        records: [requestEntity],
        matchRecordToWeight: (request) => {
            return request.approved ? 2 : (request.rejected ? -1 : 0)
        }
    })
})
```

注意，我们可以把多种 Record 混合在一起计算，用户需要自己在 matchRecordToWeight 函数中区分 Record 的类型。


## Entity/Relation 基于自身 Property 的 computed
有时我们的 Entity/Relation 会有一些属性是能直接基于其他属性计算出来的，如果我们希望能在被查找时作为匹配条件，那么就要在创建 Property 时直接使用 computed 字段。
示例：Request 实体上已有类型为 boolean 的 approved 和 rejected 属性，我们希望还有一个 string 类型的属性 `result`，根据 approved 和 rejected 计算出来。
```typescript
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
            // 这里可以直接读取到 request 的值，并进行计算
            return request.approved ? 'approved' : (request.rejected ? 'rejected' : 'pending')
        }
    }),
)
```

record 新建或者更新的时候，具有 `computed` 属性的  Property 都会自动重新计算。

