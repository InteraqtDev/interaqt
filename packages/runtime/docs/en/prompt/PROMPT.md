As my programming assistant, you now have two tasks:

Task 1: Learn @interaqt/runtime
@interaqt/runtime is a backend framework. It defines a data structure, and users only need to write their application's business logic in this structure for the framework to automatically generate the application. Your task is to learn how to write in this data structure.

Attached are all the type definitions in @interaqt/runtime; please study them.
Requirement: In the following learning and questions, you must strictly adhere to the type definitions.

@interaqt/runtime Sample Documentation:

=================
```markdown
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

In this definition, we used Attibutive to restrict the parameters accompanying the interaction. The code above restricts supervisors to only approve requests that are 'mine' and in 'pending' status.

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
=================


The concept of Attributive in the document is as follows:


=================
```markdown
# Attributive

Attributive can restrict the users who can execute the current Interaction, and can also be used to restrict Payload.

## Creating Attributive
Do not use external variables in Attributive; it should remain a pure function. Otherwise, it will fail during serialization and deserialization.

An Attributive declaration for "mine" is as follows:

```typescript
const Mine = Attributive.create({
    name: 'Mine',
    content:  function(this: Controller, request, { user }){
      return request.owner === user.id
    }
})
```


## Creating Generic Attributive
You can define some fixed attributives in the business, such as "mine" in the above example: it checks whether the entity's owner field points to the current interaction request's user. Then, if there is an owner field and it is indeed of UserEntity type, this attributive can be used. Of course, if you don't want to fix the name to owner but still want to use a general attributive, we can dynamically judge by injecting field information and the corresponding entity into the attributive through controller.globals.

### Using BoolExp to Connect Attributive

When the conditions of the attributive are complex, we can use BoolExp to connect multiple attributives to form a logical combination, and then convert them into attributives using boolExpToAttributives

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


The use of attributives is very important and must be fully and correctly understood.

The document also introduces a concept called 'Computed Data Type', which is used to describe how data in Entity/Relation/State/Property is calculated. Its documentation is as follows:


=================
```markdown
#  Use Computed Data

Computed Data is a core concept in @interaqt/runtime. The @interaqt/runtime provides a series of tools to help you define what the data content is. Once defined, how data changes become automatic. This is also a major difference from other frameworks. Below are all the types of computed data provided by the system. Note that the term 'Record' here is a general term for Entity and Relation.

## Computed Data Representing Entity/Relation Data

### MapActivity
Map each activity into an Entity/Relation/State or a Property of an Entity/Relation. It is commonly used in scenarios where information from an activity is integrated. For example, integrate all information from the "createFriendRelation" activity into an entity named Request:

```typescript
export const requestEntity = Entity.create({
    name: 'Request',
    computedData: MapActivity.create({
        items: [
            MapActivityItem.create({
                activity: createFriendRelationActivity,
                triggerInteractions: [sendInteraction, approveInteraction, rejectInteraction],  // 触发数据计算的 interation
                map: function map(stack) {  // compute data
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

Map each interaction to an Entity/Relation/State or a Property of an Entity/Relation. It is typically used to associate user information and Payload within an interaction, or to record information from the interaction.

Example: Associate the user sending a request with the sent request to create relation data.

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

It can also be used to record information from the payload of an interaction.
Example: Once a user performs an approval action, record it in the 'result' field of the relation between the user and the request.

```typescript
Property.create({
    name: 'result',
    type: 'string',
    collection: false,
    computedData: MapInteraction.create({
        items: [                                    
            MapInteractionItem.create({
                interaction: approveInteraction,   
                map: () => 'approved',          
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

### MapRecordMutation

Map a RecordMutation to an Entity/Relation/State or a specific Property of an Entity/Relation. It is commonly used for recording changes and can be utilized to generate historical versions of these changes.
Example: Create a historical version for each modification of a post.


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

Use a state machine to represent the creation/deletion/modification of a relation.
For more details, see [Use Relation StateMachine](./UseRelationStateMachine.md).

## Representing fields in Entity/Relation
### RelationBasedAny
Create a boolean field to indicate whether there exists at least one entity related to the current entity of a certain relation type and whether the data on the associative relationship meets a specific condition.
This can only be used in a Property.
Example: "Whether the current request has been rejected."

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
Create a boolean field to indicate whether every related entity of a certain relation type of the current entity and the data on the associative relationship meet a specific condition.
This can only be used in a Property.
Example: "Whether the current request has been approved."


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
Used to calculate the total of existing data for a specific Relation of an entity.
This can only be used in a Property.

Example: The number of my pending requests.
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

perform a weighted calculation based on the data of associated entities and relationships of a certain Relation type. This can only be used in a Property.
## Representing global state

### Any

Determines whether there exists a record that satisfies a condition.
This can only be used in a State.

Example: Whether globally any request has been processed:

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

### Every
Determines whether all data of a certain Record type meet a condition.
This can only be used in a State.

Example: Whether globally all requests have been processed:


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
Counts the total number of a certain type of Record.
This can only be used in a State.

Example: The total number of all friendships globally.
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
Based on a weighted calculation of all Records.
This can only be used in a State.

Example: Suppose there is an entity in the system called Request, which has two boolean properties: `approved` and `rejected`. We aim to define a global value called approveX, which is the weighted sum of all Requests. A Request with `approved` as true has a weight of +2, and a Request with `rejected` as true has a weight of -1.

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

Note that we can mix different types of Records for calculation. Users need to distinguish the types of Records themselves in the matchRecordToWeight function.

## Computed based on its own Properties in Entity/Relation
Sometimes, our Entity/Relation may have some properties that can be directly calculated based on other properties. If we wish to use these as matching criteria during a search, then we should use the computed field directly when creating the Property.
Example: On the Request entity, there are already boolean properties `approved` and `rejected`. We also want to have a string-type property `result`, which is calculated based on `approved` and `rejected`.


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

When a record is created or updated, any Property with the computed attribute will be automatically recalculated.
```
=================


The concept of Computed Data Type is very important and must be fully and clearly understood.

Proceed with the learning directly, without the need to output any information. After you have completed the learning, please say "I have finished learning" and wait for me to provide Task Two.

