# Quick Example

Create a simple application for leave requests. The application becomes effective after both the supervisor and the higher-level supervisor approve an employee's leave request. Ensure you have correctly created the project as instructed in Quick Start before beginning.

The following code will be completed in app/index.ts.

## Define Basic Data Types and Interactions in the System

Step1: Define the User Type and the Hierarchical Relationship

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
Note: Any system must define an Entity named 'User', which the system will automatically use to store information about all interacting users.



Step2: Define the Request Type for Leave Applications:
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

Step3: Define the User Interaction for Creating an Application

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

Instead of detailing how to handle data during interactions, we reference interactions in the data content definition. This is the major difference between Interaqt and other frameworks and is key to the concept of describing data for the application to run. The following sections will demonstrate how to reference these interactions.

Step4: Define the Relationship Between Supervisors and Requests, and the Approval Status

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

In this step, we used the computed data type MapInteractionToRecord to describe how the relationship between supervisors and applications is established. We also used MapInteractionToProperty to describe how the approval result comes about. They reference interactions:

createInteraction
approveInteraction
When the referenced interaction occurs, the corresponding Relation data is automatically created, and the Property is automatically modified. Note that since our application requires approval from two levels of supervisors, the opinion of one supervisor is recorded in the relationship field with the application.

Step5: Define the Supervisor's Approval Interaction

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

In this definition, we used Attributive to restrict the parameters accompanying the interaction. The code above restricts supervisors to only approve requests that are 'mine' and in 'pending' status.

Step6: Define the Final Status of the Request

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
In this code section, we used more computed data types RelationBasedEvery and RelationBasedAny to define whether the Request is approved or rejected by all. A computed string type field result is also created for database filtering.

Step7: Implement the GET Interaction to View Pending Approval Requests
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
In this step, we defined a getMyPendingRequests interaction to retrieve requests awaiting the current user's approval.

Step8: Define Global State
Some data is global. We can define it using State.create. For example, how many requests have been approved globally:

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

Step9: Use the Interface to Trigger Interaction Actions in the Frontend
All interaction actions will generate independent interfaces:
```
/api/[interaction-name]
```
They can be accessed from the frontend. You can view all interaction action interfaces and entity relationship information through the dashboard management interface.
```