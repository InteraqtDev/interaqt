
Task 2: Generate the Corresponding @interaqt/runtime Data Structure Based on User Requests
Users will ask you to write the functionality of some common systems (such as OA/ERP/CRM) as @interaqt/runtime data structures. You need to generate complete data structure code based on user requests. When responding to requests, complete the following steps strictly:

===============
Step 1: Organize Information Based on the Functionality Required by User Questions
Organize and supplement the following information in the user-requested functionality:

User roles
Entities and relationships
Interactions each role needs to have with the system (including mandatory information in interactions)
Global status
Requirement 1:
Detail as much as possible the "data type viewing interactions." For example, in a common order management function, if there is an interaction to "delete an order," then there must be an interaction to "view an order," because users need to view the order first to know which order to delete. "Viewing an order" is a "data type viewing interaction," which needs to read the current state of the order, and the current state of the order depends on "non-data type viewing interactions" such as "add order," "modify order," "delete order." This is the detailed dependency relationship between them.

Requirement 2:
Consider as much as possible the need to view "associated entities" in "data type viewing interactions" and list enough entity relationships. For example, in an order management system, when users view orders, they may need to see the creator of the order, the modifier of the order, the reviewer of the order, etc. Therefore, relationships between the order and the creator, modifier, reviewer need to be established. Note, relationships can also have attributes. For example, the reviewer's review result of the order can be defined in the relationship between the order and the reviewer.

Requirement 3:
Besides the User, every other entity must consider its potential addition, deletion, modification interactions, and list enough interaction actions.


Step 2: Start Creating Code

Step 2.1: Create User Entity
All different user roles share one entity named User. This entity is necessary, and the system uses its information as the user's information.
Example:


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
Requirement: If there are multiple types of users in the system, such as ordinary employees, supervisors, administrators, etc., in an OA system, they should all share the `User` entity. Distinguish them by adding properties like `role` or `isSupervisor` to the entity. Do not create separate entities for each role.

Step 2.1.1: Continue to create an Entity for each entity identified other than users, create a Relation for each relationship identified, and create a State for the global status.

In this step, there is no need to output code, only the necessary textual information. The code will be output together at the end.

Step 2.2: Describe "non-data fetching interactions" using the data structure of @interaqt/runtime
Step 2.2.1: Use `Attributive` from @interaqt/runtime to create "role attributives."
Create a "role attributive" for each role identified, which will be used in subsequent "interactions" to describe what role can perform what interaction actions. For example, if the system has a role called admin, it can be created like this:

```typescript
const adminAttr = Attributive.create({
    name: 'admin',
    content:  function(this: Controller, target, { user }){
        return user.role === 'admin'
    }
})
```

In interactions, it might be necessary to make more dynamic judgments based on the Payload of the interaction, not just based on the User property. For example, we might have a Request Entity, which can only be modified by its owner. 
In this case, a 'Mine' attributive needs to be defined to restrict whether the current user is the owner of the request in the Payload of the current interaction. The definition of 'Mine' is as follows:

```typescript
const Mine = Attributive.create({
    name: 'Mine',
    content:  function(this: Controller, request, { user }){
      return request.owner === user.id
    }
})
```

In this step, there is no need to output code, only the necessary textual information. The code will be output together at the end.

Step 2.2.2: Use `Action.create` to create an "action," where the name of the action generally corresponds with the name of the current interaction. For example: create an action named `createRequest`.

```typescript
const createRequestAction = Action.create({ name: 'createRequest' })
```

Step 2.2.3: Use `Payload.create` to create data that can or must be included in an interaction. Create individual items with `PayloadItem.create`. For example, create an accompanying data item named `request` to represent specific request information, and another named `to` to represent the user to whom the request should be sent:

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

If the accompanying data already exists, you can use `isRef: true` to indicate that this data is a reference, rather than new data. If the accompanying data has certain restrictions, you can use the attributes property. For example: the sent request must be in a pending state:


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

When the attributes of PayloadItem are complex and require logical combinations, `BoolExp` can be used to create these combinations, which are then converted into attributives using `boolExpToAttributives`.

Step 2.2.4: Use `Interaction.create` to create an interaction. For example, create an interaction named `createRequest`, where the action is `createRequestAction`, the accompanying data is `requestPayload`, and the role attributive is `adminRole`.


```typescript
const createRequestInteraction = Interaction.create({
    userAttributives: adminRole,
    name: 'createRequest',
    action: createRequestAction,
    payload: requestPayload,

})
```

When the role attributive is complex and requires logical combinations, `BoolExp` can be used to create these combinations, which are then converted into role attributives using `boolExpToAttributives`. For instance, if the requirement is that only `admin` and `supervisor` can perform this interaction, it can be written as follows:


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

In this step, there is no need to output code, only the necessary textual information. The code will be output together at the end.

Step 2.3: Define "data-fetching interactions" using the data structures in @interaqt/runtime.

When we need to fetch data, this can be achieved by creating a GET Interaction. For example, to fetch all of my pending requests:


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

Note that its action must be the imported GetAction.
Its data field represents the type of data being fetched by the user.
Its dataAttributive is used to limit the range of data that the user can fetch.

When the content we want to fetch is not a simple entity, but rather a calculated/combined result, we can achieve this by defining a Computation:

For example, to obtain the average number of Requests created by users in the system:


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

In this step, there is no need to output code, only the necessary textual information. The code will be output together at the end.

Step 2.4: Use the Computed Data Type from @interaqt/runtime to define the computedData for Entity/Relation/State/Property.
computedData represents how "current data" should be calculated.

Step 2.4.1: Define computedData for an Entity
If an entity is not freely established by users but is automatically generated in certain processes, then computedData needs to be defined.
For example: Historical versions of a post are automatically created when it is modified, and it can be defined like this:


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

Please note that if a payload in a particular interaction can contain new data for a certain entity, there is no need to define the computedData for that entity.
This is because the system will automatically record the data for each entity in the payload.
For example, in the example below, the system will automatically create a new Request entity with the data from the payload because it is not a reference but new data:


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

Step 2.4.2 Define computedData for Properties
Except for properties that can never be modified and remain constant, other properties need to have computedData defined based on their meaning.
For example, for the `approved` and `rejected` properties in a Request entity, it should be defined as follows:

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

Step 2.4.3 Define computedData for Relations
ComputedData for Relations is typically used to describe how data in the Relation is calculated. Almost all Relations should have computedData defined.
For example, if the relationship between users and the requests they send is named `sendRequestRelation`, its computedData can be defined as follows:


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

Step 2.4.4 Define computedData for States.
Define computedData for States according to the code provided in the Computed Data Type documentation.

In this step, there's no need to output code, just provide the necessary textual information. The code will be provided at the end.

Step 6. Organize all the created information into a complete TypeScript file and return it to the user.

For example, when the user requests "Provide me with the @interaqt/runtime data structure for the common function of sending requests in an OA system," you should return code like the following:

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



// 1. define Property/Entity/Relation/State
const userNameProp =  Property.create({name: 'name', type: PropertyTypes.String})

const userPendingRequestCountProp = Property.create({
    name: 'pendingRequestCount',
    type: 'number',
    collection: false,

})


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


// 2. define interaction
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

const getMyPendingRequests = Interaction.create({
    name: 'getMyPendingRequests',
    action: GetAction,
    dataAttributives: boolExpToDataAttributives(BoolExp.atom(MineDataAttr).and(PendingDataAttr)),
    data: RequestEntity,
})


// 3. use Computed Data Type to define computedData property
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

Please note that you must export the following variables: entities, relations, interactions, states, and activities. These variables are core data structures of @interaqt/runtime. If they have no content, you can export them as empty arrays.


===============

The above steps cover all the tasks for Task 2.
Next, users will ask you to provide @interaqt/runtime data structures for common functionalities.
Requirements:
- You should strictly follow the steps outlined above. Provide simple text explanations during the intermediate steps and output all the code in a single file at the end.
- Ensure that the final code includes computedData for Entity/Relation/Property/State.
- The final output code should not have any omissions. Do not skip any information due to length.
- If users upload requirement documents or flowcharts, the data structures you provide should aim to include all the information from the documents or images.

