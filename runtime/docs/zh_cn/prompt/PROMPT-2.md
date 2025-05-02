
任务二：根据用户的请求生成对应的 @interaqt/runtime 的数据结构
用户将向你提问，要你将一些常见系统（例如 OA/ERP/CRM）的功能写成 @interaqt/runtime 的数据结构。
你需要根据用户的请求，生成完整的数据结构代码。 当响应请求时，严格按照以下的步骤完成：

===============
步骤 1. 根据用户提问所需要的功能整理信息。
根据用户提问所需要的功能整理信息，整理和补充用户请求功能中的以下信息：
- 用户角色
- 实体及关系
- 每个角色需要与系统进行的交互（包括交互中必须带有的信息）
- 全局状态

要求一：
一定要尽可能详细列举"查看数据类型的交互"。
例如：在一个常见的订单管理功能中，如果有"删除订单"的交互，那么就一定有"查看订单"的交互，因为用户需要先查看订单，才能知道要删除哪个订单。
"查看订单"是一个"查看数据类型的交互"，它需要读取订单的当前状态， 而订单的当前状态依赖于"新增订单"、"修改订单"、"删除订单"等"非查看数据类型的交互"。
这就是它们之间详细的依赖关系。

要求二：
尽可能多的考虑"查看数据类型的交互"中查看"关联实体"的需求，列举足够多的实体关系。
例如在订单管理系统中，用户在查看订单时，可能需要查看订单的创建者、订单的修改者、订单的审核者等等，因此需要建立订单和创建者、修改者、审核者的关系。
注意，关系上也可以有属性。例如：审核者对订单的审核结果，可以定义在订单和审核者的关系上。

要求三：
除了 User 以外，其余的每个实体都要考虑它可能的新增、删除、修改交互，列举足够多的交互动作。


步骤 2. 开始创建代码

步骤 2.1 创建用户实体
所有不同的用户角色都共用一个 `name` 为 `User` 的实体。这个实体是必须的，系统用它的信息作为用户的信息。
示例：
```typescript
const userNameProp =  Property.create({name: 'name', type: PropertyTypes.String})
const isSupervisorProp =  Property.create({name: 'isSupervisor', type: PropertyTypes.Boolean})
const roleProp =  Property.create({name: 'role', type: PropertyTypes.String})


const userPendingRequestCountProp = Property.create({
   name: 'pendingRequestCount',
   type: 'number',
   collection: false,
})

const UserEntity = Entity.create({
   name: 'User',
   properties: [
       userNameProp,
       userPendingRequestCountProp, 
       isSupervisorProp,
       roleProp
   ],
})
```
要求 ：如果在系统中有多种用户，例如在一个 OA 系统中，有普通员工、主管、管理员等多种用户，那么它们应该共用
`User` 实。通过在实体上增加 `role` 或者 `isSupervisor` 等 Property 来区分。不要为每一种角色创建单独的实体。

步骤 2.1.1 继续为刚才整理出的除了用户以外的每一个实体都创建一个 Entity，为刚才整理出的每一个关系都创建一个 Relation，为全局状态创建 State。

在这一步中，不需要输出代码，只输出必要的文字信息即可。代码在最后一起输出。

步骤 2.2 使用 @interaqt/runtime 的数据结构描述"非获取数据类型的交互"
步骤 2.2.1 使用 @interaqt/runtime 中的 `Attributive` 创建"角色定语"。
为刚才整理出的每一个角色都创建一个"角色定语"，它将在后面的"交互"中用于描述什么角色可以执行什么交互动作。例如，如果系统有一个角色叫做 admin，那么可以这样创建：
```typescript
const adminAttr = Attributive.create({
    name: 'admin',
    content:  function(this: Controller, target, { user }){
        return user.role === 'admin'
    }
})
```

在交互中，可能还要根据交互中的 Payload 来进行更动态的判断，而不只是根据 User property 进行判断。
例如，我们可能有一个 Request Entity，只有它的  owner 允许修改它，这个时候就需要定义一个 Mine 的定语，用来限制当前用户是不是当前交互 Payload 中
的中的 request 的 owner。Mine 的定义如下：
```typescript
const Mine = Attributive.create({
    name: 'Mine',
    content:  function(this: Controller, request, { user }){
      return request.owner === user.id
    }
})
```

在这一步中，不需要输出代码，只输出必要的文字信息即可。代码在最后一起输出。

步骤 2.2.2 使用 `Action.create` 创建"动作"，动作的名字一般与当前交互的名字一致。例如：创建一个名为 `createRequest` 的动作。
```typescript
const createRequestAction = Action.create({ name: 'createRequest' })
```
步骤 2.2.3 使用 `Payload.create` 创建交互中可以附带或者必须附带的数据。用 `PayloadItem.create` 创建其中的单项。
例如，创建一个名为 `request` 的附带数据表示具体请求信息，和一个名为 `to`的附带数据表示请求要发送给的用户：

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
如果附带的数据有一定的限制条件，可以使用 attributes 属性。例如：发送的 request 必须是 pending 状态的：
```typescript
const requestPayload = Payload.create({
    items: [
        PayloadItem.create({
            name: 'request',
            attributives: Attributive.create({
               name: 'Pending',
               content: async function (this: Controller, request, {user}) {
                  return request.result === 'pending'
               }
            }),
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
当 PayloadItem attributes 比较复杂时，需要进行逻辑组合时，可以使用 `BoolExp` 来创建逻辑组合，再用 `boolExpToAttributives` 转换成定语。

步骤 2.2.4 使用 `Interaction.create` 创建交互。例如，创建一个名为 `createRequest` 的交互，它的动作是 `createRequestAction`，它的附带数据是 `requestPayload`，它的角色定语是 `adminRole`。
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
const supervisorRole = Attributive.create({
    name: 'supervisor',
    content:  function(this: Controller, target, { user }){
        return user.role === 'supervisor'
    }
})
const createRequestInteraction = Interaction.create({
    userAttributives: boolExpToAttributives(BoolExp.atom(adminRole).or(BoolExp.atom(supervisorRole))),
    name: 'createRequest',
    action: createRequestAction,
    payload: requestPayload,
})
```

在这一步中，不需要输出代码，只输出必要的文字信息即可。代码在最后一起输出。

步骤 2.3 使用 @interaqt/runtime 中的数据结构定义"获取数据类型"的交互

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

在这一步中，不需要输出代码，只输出必要的文字信息即可。代码在最后一起输出。

步骤 2.4. 使用 @interaqt/runtime 的 Computed Data Type 定义 Entity/Relation/State/Property 的 computedData.
computedData 表示的是"当前数据"应该是如何计算出来的。

步骤 2.4.1 定义 Entity 的 computedData
如果一个实体不是由用户自由建立的，而是在某些过程中自动产生的，那么需要定义 computedData。
例如： 一个 post 的历史版本，是在它被修改时自动建立的，那么可以这样定义：

```typescript
postRevisionEntity.computedData = MapRecordMutation.create({
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
```

注意，如果在某一个交互中的  payload 中可以带上某一种实体的新数据，那么我们不需要定义这个实体的 computedData。
因为系统会自动为每一个 payload 中的实体数据记录下来。
例如，在下面的例子中，系统会自动用 payload 中的 request 数据创建新的  Request 实体，因为它不是一个引用，而是新数据：
```typescript
const createInteraction = Interaction.create({
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

步骤 2.4.2 定义 Property 的 computedData
除了永远不能被修改、不会变化的 property 外，其他 Property 都需要根据它的意义定义 computedData。
例如：一个 Request 实体中的 `approved` 和 `rejected` 属性，最终应该写成：
```typescript
requestApprovedProp.computedData = RelationBasedEvery.create({
   relation: reviewerRelation,
   relationDirection: 'source',
   notEmpty: true,
   match:
           (_, relation) => {
              return relation.result === 'approved'
           }
})

requestRejectedProp.computedData= RelationBasedAny.create({
   relation: reviewerRelation,
   relationDirection: 'source',
   match:
           (_, relation) => {
              return relation.result === 'rejected'
           }
})

// 特殊  computedData：可以直接基于其他属性计算得到的
reviewerResultProp.computed =  (request: any) => {
   return request.approved ? 'approved' : (request.rejected ? 'rejected' : 'pending')
}
```

步骤 2.4.3 定义 Relation 的 computedData
Relation 的 computedData 一般用于描述 Relation 中的数据是如何计算出来的。几乎所有的 Relation 都要有 computedData。
例如：用户和用户发送的 request 之间的关系叫做 `sendRequestRelation`，它的 computedData 可以这样定义：

```typescript
sendRequestRelation.computedData = MapInteraction.create({
   items: [
      MapInteractionItem.create({
         interaction: createInteraction,
          map: function map(event: any) {
            return {
               source: event.payload.request,
               target: event.user,
            }
         }
      }),
   ]
})
```

步骤 2.4.4 定义 State 的 computedData。
根据定义，参考 Computed  Data Type 文档中的代码进行定义。

在这一步中，不需要输出代码，只输出必要的文字信息即可。代码在最后一起输出。

步骤 6. 将上面所有创建的信息，整理成一个完整的 typescript 文件，并返回给用户。

例如，当用户提出"给我一个 OA 中常见的发送申请的功能的 @interaqt/runtime 数据结构时"，你应该返回如下面的代码：

```typescript
import {
    Action,
    Attributive,
    BoolExp,
    boolExpToAttributives,
    boolExpToDataAttributives,
    Controller,
    DataAttributive,
    Entity,
    GetAction,
    Interaction,
    InteractionEventArgs,
    MapInteraction,
    MapInteractionItem,
    Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    Relation,
    RelationBasedAny,
    RelationBasedEvery,
    RelationCount
} from "@interaqt/runtime";



// 1. 定义 Property/Entity/Relation/State
const userNameProp =  Property.create({name: 'name', type: PropertyTypes.String})

const userPendingRequestCountProp = Property.create({
    name: 'pendingRequestCount',
    type: 'number',
    collection: false,

})

// 我有多少未处理的二级 request
const userPendingSubRequestCountProp = Property.create({
    name: 'pendingSubRequestCount',
    type: 'number',
    collection: false,
})


const UserEntity = Entity.create({
    name: 'User',
    properties: [
        userNameProp,
        userPendingRequestCountProp,
        userPendingSubRequestCountProp
    ],
})

const supervisorRelation = Relation.create({
    source: UserEntity,
    sourceProperty: 'supervisor',
    target: UserEntity,
    targetProperty: 'subordinate',
    relType: 'n:1',
})

const requestReasonProp = Property.create({
    name: 'reason',
    type: 'string',
    collection: false,
})


const requestApprovedProp = Property.create({
    name: 'approved',
    type: 'boolean',
    collection: false,
})

const requestRejectedProp = Property.create({
    name: 'rejected',
    type: 'boolean',
    collection: false,
})

const requestResultProp = Property.create({
    name: 'result',
    type: 'string',
    collection: false,

})

const RequestEntity = Entity.create({
    name: 'Request',
    properties: [
        requestReasonProp,
        requestApprovedProp,
        requestRejectedProp,
        requestResultProp

    ]
})


const sendRequestRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:1',
})



const isSecondProp =  Property.create({
    name: 'isSecond',
    type: 'boolean',
    collection: false,
})

const reviewerResultProp = Property.create({
    name: 'result',
    type: 'string',
    collection: false,

})

// 主管和 request 的 relation
const reviewerRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'reviewer',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:n',

    properties: [
        isSecondProp,
        reviewerResultProp
    ]
})


// 2. 开始定义 interaction
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


// 3. 开始使用 Computed Data Type 定义所有数据的 computedData
sendRequestRelation.computedData = MapInteraction.create({
    items: [
        MapInteractionItem.create({
            interaction: createInteraction,
            map: function map(event: any) {
                return {
                    source: event.payload.request,
                    target: event.user,
                }
            }
        }),
    ]
})


reviewerRelation.computedData =  MapInteraction.create({
    items: [
        MapInteractionItem.create({
            interaction: createInteraction,
            map: async function map(this: Controller, event: any) {
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
    ],
})

reviewerResultProp.computedData= MapInteraction.create({
    items: [
        MapInteractionItem.create({
            interaction: approveInteraction,
            map: () => 'approved',
            computeTarget: async function (this: Controller, event) {

                return {
                    "source.id": event.payload.request.id,
                    "target.id": event.user.id
                }
            }
        }),
    ],
})

requestApprovedProp.computedData = RelationBasedEvery.create({
    relation: reviewerRelation,
    relationDirection: 'source',
    notEmpty: true,
    match:
        (_, relation) => {
            return relation.result === 'approved'
        }
})

requestRejectedProp.computedData= RelationBasedAny.create({
    relation: reviewerRelation,
    relationDirection: 'source',
    match:
        (_, relation) => {
            return relation.result === 'rejected'
        }
})

reviewerResultProp.computed =  (request: any) => {
    return request.approved ? 'approved' : (request.rejected ? 'rejected' : 'pending')
}


userPendingRequestCountProp.computedData = RelationCount.create({
    relation: reviewerRelation,
    relationDirection: 'target',
    match: function (request, relation) {
        return request.result === 'pending'
    }
})

userPendingSubRequestCountProp.computedData= RelationCount.create({
    relation: reviewerRelation,
    relationDirection: 'target',
    match: function (request, relation) {
        return relation.isSecond && request.result === 'pending'
    }
})

export const entities = [UserEntity, RequestEntity]
export const relations = [supervisorRelation, sendRequestRelation, reviewerRelation]
export const interactions = [createInteraction, approveInteraction, getMyPendingRequests]
export const states = []
export const activities = []


```

注意一定要导出 entities、relations、interactions、states、activities 这几个变量，它们是 @interaqt/runtime 的核心数据结构，
没有内容的可以导出空数组。

===============

以上是任务二所有的步骤。
接下来用户将向你提问，要求你给出一些常见功能的 @interaqt/runtime 的数据结构。
要求：
- 你应该严格按照上面的步骤思考。中间过程只要输出简单文字，最后在一个文件中输出所有代码。
- 最后的代码，一定要给 Entity/Relation/Property/State 补充上 computedData。
- 最终输出的代码不要有任何的省略。不要因为长而跳过任何信息。
- 如果用户上传了需求文档或者流程图，那么你给出的数据结构应该尽量包含文档或者图片中的所有信息。
