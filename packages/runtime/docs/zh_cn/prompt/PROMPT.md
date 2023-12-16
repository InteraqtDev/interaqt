你先在作为我的编程助手，你现在的任务有两个：
任务一：学习 @interaqt/runtime
@interaqt/runtime 是一个后端框架。它定义了一种数据数据，用户只需要把应用的业务逻辑写成这种数据结构，框架就可以自动生成应用。你要学会如何写成这种数据结构。

附件中是 @interaqt/runtime 中的所有类型定义，请学习。
要求：在下面的学习和问题中，都要严格遵守类型定义。


@interaqt/runtime 的示例文档如下:

=================
```markdown
# Quick Example

制作一个请假的简单应用。
员工创建请假申请，主管和上级主管都审批成功后，申请生效。
开始这一步之前，请确保你已经按照 [Quick Start](../QuickStart.md) 中的正确创建了项目。

接下来步骤中的代码都将在 `app/index.ts` 中完成。

## 定义系统中的基本数据类型和交互动作

Step1: 定义员工`User`类型以及上下级关系   

```typescript
const UserEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: PropertyTypes.String })
  ],
})

const supervisorRelation = Relation.create({
  source: UserEntity,
  sourceProperty: 'supervisor',
  target: UserEntity,
  targetProperty: 'subordinate',
  relType: 'n:1',
})
```

注意，任何系统都一定要定义一个 name 为 'User' 的 Entity，系统将自动使用这个 Entity 类型来存储所有发生交互的用户的信息。

Step2: 定义请假申请`Request`类型：
```typescript
const RequestEntity= Entity.create({
    name: 'Request',
    properties: [Property.create({
        name: 'reason',
        type:'string',
        collection: false,
    })]
})
```

Step3: 定义用户创建申请的交互动作

```typescript
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
```

我们不需要在交互发生时应该如何处理数据，而是在数据内容的定义中引用交互动作。
这是 Interaqt 和其他框架最大的区别，也正是通过这样来实现支线只要描述数据应用就能运行了。
在下面的内容中我们将看到如何引用交互动作。


Step4: 定义主管和请求之间的关系，以及审批状态。可用于让主管获取自己需要审批的申请。

```typescript
const reviewerRelation = Relation.create({
  source: RequestEntity,
  sourceProperty: 'reviewer',
  target: UserEntity,
  targetProperty: 'request',
  relType: 'n:n',
  computedData:  MapInteractionToRecord.create({
    sourceInteraction: createInteraction,
      map: async function map(this: Controller, event: any){
      const { BoolExp} = this.globals

      const match = BoolExp.atom({
        key: 'id',
        value: ['=', event.user.id]
      })

      const { supervisor } = await this.system.storage.findOne(
              'User',
              match,
              undefined,
              [
                ['supervisor', { attributeQuery: [['supervisor', { attributeQuery: ['*']}]]}],
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
              map: () => 'approved',
            computeSource: async function(this: Controller, event) {
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
```

在这一步中我们使用 computed data type `MapInteractionToRecord` 来描述主管和申请之间的关系是怎么建立的。
同时还是用了 `MapInteractionToProperty` 来描述审批的结果是怎么来的。它们分别引用了交互：

- `createInteraction`
- `approveInteraction`

当被引用的交互发生时，相应的 Relation 数据就会自动创建，Property 会自动修改。
注意，因为我们的申请需要两级主管审批，所以某一个主管的审批意见是记录在他和申请的关系字段上的。

Step5: 定义主管审批同意交互动作

```typescript
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
          content: async function(this: Controller, request, { user }){
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
            return !!relation
          }
        })).and(Attributive.create({
          name: 'Pending',
          content: async function(this: Controller, request, { user }){
            return request.result === 'pending'
          }
        })))
      })
    ]
  })
})
```

在这个定义中，我们第一用到了 `Attibutive` 来限制交互动作中附带的参数。上面的代码中限制了主管只能审批 **mine** 并且是 **pending** 状态的申请。

Step6: 定义 Request 的最终状态
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
        match: (_, relation) => {
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
        match:(_, relation) => {
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
```
在这段代码中，我们通过更多的 computed data 类型 `RelationBasedEvery` 和 `RelationBasedAny` 来定义了 Request
是否都被同意`approved`，或者有人拒绝`rejected`，并通过 `Property.computed` 创建了一个 string 类型、可用于数据库筛选的计算字段 `result`。

Step7: 实现查看待审批申请的 GET Interaction
```typescript
const MineDataAttr = DataAttributive.create({
    name: 'MyData',
    content: (event: InteractionEventArgs) => {
        return {
            key: 'reviewer.id',
            value: ['=', event.user.id]
        }
    }
})

const PendingDataAttr = DataAttributive.create({
    name: 'PendingData',
    content: (event: InteractionEventArgs) => {
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
```
在这一步中我们顶一个 getMyPendingRequests 交互动作，用于获取等待当前用户审批的申请。

Step8: 定义全局状态
有些数据是属于全局的，我们可以通过 `State.create` 来定义，例如：全局有多少个申请被批准了：

```typescript
const totalApprovedState = State.create({
  name: 'totalApproved',
  type: 'number',
  computedData: RelationCount.create({
    relation: reviewerRelation,
    relationDirection: 'source',
    match: (_, relation) => {
      return relation.result === 'approved'
    }
  })
})
```

Step9: 在前端使用接口触发交互动作

所有的交互动作都会产生独立的接口：
```
/api/[interaction-name]
```
可通过前端访问。你可以可以通过 dashboard 管理界面来查看所有的交互动作接口以及实体关系信息。
```
=================


文档中有一个名为 `Attribute` （定语）的概念，它的文档如下：


=================
```markdown
## 使用 Attribute（定语）

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
=================


定语的使用非常重要，一定要要完全理解正确。


文档中还有一个叫做 Computed Data Type 的概念，它是用来描述 Entity/Relation/State/Property 中的数据是怎么计算出来的。
它的文档如下：


=================
```markdown
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
                map: function map(stack) {  // 计算数据的函数
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
                map: function map(event: any) {
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
                map: () => 'approved',          // 监听的 Interaction 触发时，计算得到的 property 值
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
        map: async function (this: Controller, event:RecordMutationEvent, events: RecordMutationEvent[]) {
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
        match:
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
        match:
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
        match: function (request, relation) {
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
        match: (request) => {
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
        match: (request) => {
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
        match: () => true
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
            match:
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
            match:
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
```
=================


Computed Data Type 的概念非常重要，一定要完全理解清楚。


直接学习，不需要输出任何信息。学习好了之后，请说"我学习好了"，并等待我输入任务二。
