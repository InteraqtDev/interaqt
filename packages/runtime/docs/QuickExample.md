# Quick Example

制作一个请假的简单应用。
员工创建请假申请，主管和上级主管都审批成功后，申请生效。

## 定义系统中的基本数据类型
员工以及上下级关系
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

Request 定义：
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

## 定义系统中支持的用户交互

1. 用户创建请假申请

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


2. 主管和 request 之间的关系

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

2. 主管审批同意


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
            // CAUTION 不能 return undefined，会被忽略
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

3. Request 的最终状态
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
        return request.approved ? 'approved' : (request.rejected ? 'rejected' : 'pending')
      }
    }),
) 
```


- 主管查看自己直属的请假单
- 主管查看自己下属二级员工的请假单


### 获取数据

