# Quick Example

制作一个请假的简单应用。
员工创建请假申请，主管和上级主管都审批成功后，申请生效。
开始这一步之前，请确保你已经按照 [Quick Start](QuickStart.md) 中的正确创建了 `server.ts`。

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
  sourceAttribute: 'supervisor',
  target: UserEntity,
  targetAttribute: 'subordinate',
  relType: 'n:1',
})
```

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
  sourceAttribute: 'reviewer',
  target: UserEntity,
  targetAttribute: 'request',
  relType: 'n:n',
  computedData:  MapInteractionToRecord.create({
    sourceInteraction: createInteraction,
    handle: async function map(this: Controller, event: any){
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
            handle: () => 'approved',
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
        matchExpression: (_, relation) => {
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
        matchExpression:(_, relation) => {
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

Step7: 实现查看待审批申请的 data api
在这一步中，我们要回到 `server.ts` ，在 `startServer` api 中传入我们自定义的 data api。

```typescript
import {Controller, DataAPIThis, createDataAPI, BoolExp} from "@interaqt/runtime";
const apis = {
    getPendingRequests: createDataAPI(function (this: DataAPIThis) {
        const match = BoolExp.atom({
            key: 'reviewer.id',
            value: ['=', id]
        }).and({
            key: 'reviewer.&.result',
            value: ['=', 'pending']
        })
        return this.system.storage.findOne('Request', match, undefined, ['*'])
    })
}

startServer(controller, {
    port,
    parseUserId: async (headers: IncomingHttpHeaders) => {
        // 模拟用户
        return headers['x-user-id'] as string
    }
}, apis)
```

在这里我们通过 `createDataAPI` 创建了一个用于获取 “等待我审批” 的请求的 data api，这个 api 将可以通过
`post: /data/getPendingRequests` 来调用。
