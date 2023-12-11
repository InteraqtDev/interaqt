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

### MapRecordMutationToRecord

将 RecordMutation 转换为 Entity/Relation。通常用于记录变更，可以利用它来为变更的记录产生历史版本。
示例：为每次 post 的修改都产生一个历史版本
```typescript
const postRevisionEntity = Entity.create({
    name: 'PostRevision',
    properties: [
        // 这里测试 title 不可更新，所以 revision 里面不记录。
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

