# Quick Example

Create a simple leave application.

Employees create a leave request, which becomes effective after approval by both the supervisor and the higher-level supervisor. Before starting this step, ensure that you have correctly created `server.ts` as per the [Quick Start](QuickStart.md).

## Define basic data types and interactions in the system

Step 1: Define the `User` type for employees and the hierarchical relationship.

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

Step 2: Define the Request type for leave applications:

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

Step 3: Define the interaction for users to create requests.

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

Rather than specifying how data should be handled when interactions occur, we reference interaction actions within the definition of the data. This is a significant distinction between Interaqt and other frameworks, enabling the application to function by simply describing the data. We'll see how interactions are referenced in the following sections.

Step 4: Define the relationship between supervisors and requests, as well as the approval status. This can be used for supervisors to access requests that require their approval.

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

In this step, computed data types like MapInteractionToRecord describe how relationships between supervisors and requests are established. Similarly, MapInteractionToProperty is used to describe how approval results are obtained. These references are made to the interactions:

createInteraction
approveInteraction
When the referenced interactions occur, the respective Relation data is automatically created, and Property is modified automatically. Note that because our request requires approval from two levels of supervisors, the approval of one supervisor is recorded in their relationship field with the request.

Step 5: Define the interaction action for supervisor approval.

```typescript
// Approve
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
In this definition, Attibutive is used to limit the parameters accompanying the interaction action. The code restricts supervisors to approve mine requests that are in pending status.

Step 6: Define the final status of Request.

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
In this code segment, RelationBasedEvery and RelationBasedAny through computed data types are used to define if all requests are approved (approved) or if anyone is rejected (rejected). A string type computed field result, usable for database filtering, is created using Property.computed.

Step 7: Implement data API to view pending approval requests.

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

Here, a data API (getPendingRequests) is created using createDataAPI to fetch requests pending approval by a particular supervisor. This API can be accessed via post: /data/getPendingRequests.