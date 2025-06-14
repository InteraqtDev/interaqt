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