import {
    BoolAtomData,
    createUserRoleAttributive,
    MapInteractionToProperty, MapInteractionToPropertyItem,
    UserAttributive,
    UserAttributives
} from "@interaqt/shared";
import {
    Action,
    Activity,
    ActivityGroup,
    Interaction,
    Payload,
    PayloadItem,
    Transfer
} from "@interaqt/shared";
import {OtherAttr} from "./roles";
import {Entity, Property, PropertyTypes, Relation} from "@interaqt/shared";
import {State} from "@interaqt/shared";

import {
    RelationStateMachine,
    RelationStateNode,
    RelationStateTransfer,
    MapActivityToEntity,
    RelationCount,
    Count,
    RelationBasedEvery, RelationBasedAny, Every, Any
} from "@interaqt/shared";
import {removeAllInstance, stringifyAllInstances} from "@interaqt/shared";
import {Controller} from "../../Controller";

const UserEntity = Entity.createReactive({ name: 'User' })
const nameProperty = Property.createReactive({ name: 'name', type: PropertyTypes.String })
const ageProperty = Property.createReactive({ name: 'age', type: PropertyTypes.Number })
UserEntity.properties.push(nameProperty, ageProperty)

export const Message = Entity.createReactive({
    name: 'Message',
    properties: [Property.create({
        name: 'content',
        type: 'string',
        collection: false,
    })]
})

export const globalUserRole = createUserRoleAttributive({name: 'user'}, {isReactive: true})
const userRefA = createUserRoleAttributive({name: 'A', isRef: true}, {isReactive: true})
export const userRefB = createUserRoleAttributive({name: 'B', isRef: true}, {isReactive: true})
export const sendInteraction = Interaction.createReactive({
    name: 'sendRequest',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: globalUserRole,
    userRef: userRefA,
    action: Action.createReactive({name: 'sendRequest'}),
    payload: Payload.createReactive({
        items: [
            PayloadItem.createReactive({
                name: 'to',
                attributives: UserAttributives.createReactive({
                    content: BoolAtomData.create({data: OtherAttr})
                }),
                base: globalUserRole,
                itemRef: userRefB
            }),
            PayloadItem.createReactive({
                name: 'message',
                base: Message,
                itemRef: Entity.createReactive({name: '', isRef: true}),
            })
        ]
    })
})
export const approveInteraction = Interaction.createReactive({
    name: 'approve',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
    action: Action.createReactive({name: 'approve'}),
    payload: Payload.createReactive({})
})
const rejectInteraction = Interaction.createReactive({
    name: 'reject',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
    action: Action.createReactive({name: 'reject'}),
    payload: Payload.createReactive({
        items: [
            PayloadItem.createReactive({
                name: 'reason',
                base: Message,
                itemRef: Entity.createReactive({name: '', isRef: true}),
            })
        ]
    })
})
const cancelInteraction = Interaction.createReactive({
    name: 'cancel',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: userRefA,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
    action: Action.createReactive({name: 'cancel'}),
    payload: Payload.createReactive({})
})
const responseGroup = ActivityGroup.createReactive({
    type: 'any',
    activities: [
        Activity.createReactive({
            name: "approveFriendRelation",
            interactions: [
                approveInteraction
            ]
        }),
        Activity.createReactive({
            name: "rejectFriendRelation",
            interactions: [
                rejectInteraction
            ]
        }),
        Activity.createReactive({
            name: "cancelFriendRelation",
            interactions: [
                cancelInteraction
            ]
        })
    ],
})
export const activity = Activity.createReactive({
    name: "createFriendRelation",
    interactions: [
        sendInteraction
    ],
    groups: [
        responseGroup
    ],
    transfers: [
        Transfer.createReactive({
            name: 'fromSendToResponse',
            source: sendInteraction,
            target: responseGroup
        })
    ]
})

export const MyFriend = UserAttributive.createReactive({
    name: 'MyFriend',
    stringContent: `
async function MyFriend(target, { user }){
    const linkInfo = this.system.storage.queryHandle.map.getLinkInfo('User', 'friends')
      
    const match = this.system.storage.queryHandle.createMatchFromAtom({
        key: 'source.id', 
        value: ['=', user.id]
    }).and({
        key: 'target.id', 
        value: ['=', target.id]
    })

    return !!(await this.system.storage.findOneRelationByName(linkInfo.name, match))  
}`
})

export const deleteInteraction = Interaction.createReactive({
    name: 'deleteFriend',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: globalUserRole,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
    action: Action.createReactive({name: 'deleteFriend'}),
    payload: Payload.createReactive({
        items: [
            PayloadItem.createReactive({
                name: 'target',
                attributives: UserAttributives.createReactive({
                    content: BoolAtomData.create({data: MyFriend})
                }),
                base: globalUserRole,
                isRef: true,
                itemRef: Entity.createReactive({name: '', isRef: true}),
            }),
        ]
    })
})


// friend 关系的状态机描述
const notFriendState = RelationStateNode.createReactive({
    hasRelation: false
})
const isFriendState = RelationStateNode.createReactive({
    hasRelation: true
})

const addFriendTransfer = RelationStateTransfer.createReactive({
    sourceActivity: activity,
    triggerInteraction: approveInteraction,
    fromState: notFriendState,
    toState: isFriendState,
    handleType: 'computeSource',
    handle: async function(this: Controller, eventArgs, activityId) {

        const match = this.system.storage.queryHandle.createMatchFromAtom({
            key: 'interactionName',
            value: ['=', 'sendRequest']
        }).and({
            key: 'activityId',
            value: ['=', activityId]
        })

        const sendEvent = (await this.system.getEvent(match))[0]
        return {
            source: sendEvent.args.user,
            target: eventArgs.user
        }
    }

})

const deleteFriendTransfer = RelationStateTransfer.createReactive({
    // sourceActivity: activity,
    triggerInteraction: deleteInteraction,
    fromState: isFriendState,
    toState: notFriendState,
    handleType: 'computeSource',
    handle: async function(eventArgs, activityId) {
        return {
            source: eventArgs.user,
            target: eventArgs.payload.target
        }
    }

})

const friendRelationSM = RelationStateMachine.createReactive({
    states: [notFriendState, isFriendState],
    transfers: [addFriendTransfer, deleteFriendTransfer],
    defaultState: notFriendState
})






const friendRelation = Relation.createReactive({
    entity1: UserEntity,
    targetName1: 'friends',
    entity2: UserEntity,
    targetName2: 'friends',
    relType: 'n:n',
    computedData: friendRelationSM
})



export const mapFriendActivityToRequest = MapActivityToEntity.createReactive({
    sourceActivity: activity,
    triggerInteraction: [sendInteraction, approveInteraction, rejectInteraction],
    handle:function map(stack){
        const sendRequestEvent = stack.find(i => i.interaction.name === 'sendRequest')
        
if (!sendRequestEvent) { 
    return undefined
}

const handled = !!stack.find(i => i.interaction.name === 'approve' || i.interaction.name === 'reject')
        
return {
    from: sendRequestEvent.data.user,
    to: sendRequestEvent.data.payload.to,
    message: sendRequestEvent.data.payload.message,
    handled,
}
}
})

const requestEntity= Entity.createReactive({
    name: 'Request',
    computedData: mapFriendActivityToRequest,
    properties: [Property.createReactive({
        name: 'handled',
        type:'boolean',
        collection: false,
    })]
})

const sendRequestRelation = Relation.createReactive({
    entity1: requestEntity,
    targetName1: 'from',
    entity2: UserEntity,
    targetName2: 'request',
    relType: 'n:1'
})

const receivedRequestRelation = Relation.createReactive({
    entity1: requestEntity,
    targetName1: 'to',
    entity2: UserEntity,
    targetName2: 'receivedRequest',
    relType: 'n:1',
    properties: [Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computedData: MapInteractionToProperty.create({
            items: [
                MapInteractionToPropertyItem.create({
                    interaction: approveInteraction,
                    value: 'approved',
                    computeSource: async function(this:  Controller, event, activityId) {
                        
                        const match = this.system.storage.queryHandle.createMatchFromAtom({
                            key: 'activity.id',
                            value: ['=', activityId]
                        })
                        
                        const request = await this.system.storage.findOne('Request', match)
                        return {
                            "source.id": request.id,
                            "target.id": event.user.id
                        }
                    }
                }),
                MapInteractionToPropertyItem.create({
                    interaction: rejectInteraction,
                    value: 'rejected',
                    computeSource: async function(this:  Controller,event, activityId)  {
                        
                        const match = this.system.storage.queryHandle.createMatchFromAtom({
                            key: 'activity.id',
                            value: ['=', activityId]
                        })
                        
                        const request = await this.system.storage.findOne('Request', match)
                            
                        return {
                            "source.id": request.id,
                            "target.id": event.user.id
                        }
                    }
                })
            ],
        })
    })]
})

requestEntity.properties.push(
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
    }),
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
    }),
    // Property.create({
    //         name: 'result',
    //         type: 'string',
    //         collection: false,
    //         computedData: ComputedData.create({
    //             computeEffect: `
    //         (mutationEvent) => {
    //             if(
    //                 mutationEvent.type === 'update'
    //                 &&
    //                 mutationEvent.recordName === 'Request' &&
    //                 (mutationEvent.record.approved !== undefined || mutationEvent.record.rejected !== undefined)
    //             ){
    //                 return mutationEvent.oldRecord.id
    //             }
    //
    //         }
    //         `,
    //             computation:`
    //         async (requestId) => {
    //             const match = this.system.storage.queryHandle.createMatchFromAtom({
    //                 key: 'id',
    //                 value: ['=', requestId]
    //             })
    //
    //             const request = await this.system.storage.findOne('Request', match, undefined, ['approved', 'rejected'])
    //             return request.approved ? 'approved' : (request.rejected ? 'rejected' : 'pending')
    //         }
    // `
    //     })
    // }),
    // 上面和下面两种写法都可以，机制不同。下面的实在 insert/update 的时候就直接计算了
    Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computed: (request: any) => {
            return request.approved ? 'approved' : (request.rejected ? 'rejected' : 'pending')
        }
    }),
)

Relation.createReactive({
    entity1: requestEntity,
    targetName1: 'message',
    entity2: Message,
    targetName2: 'request',
    relType: '1:1'
})

// 计算 unhandled request 的总数
const userTotalUnhandledRequest = RelationCount.createReactive({
    relation: receivedRequestRelation,
    relationDirection: 'target',
    matchExpression:
(request) => {
    return !request.handled
}
    ,
})

UserEntity.properties.push(Property.createReactive({
    name: 'totalUnhandledRequest',
    type: 'number',
    collection: false,
    computedData: userTotalUnhandledRequest
}))

UserEntity.properties.push(Property.createReactive({
    name: 'everySendRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedEvery.createReactive({
        relation: sendRequestRelation,
        relationDirection: 'target',
        matchExpression: (request) => request.handled
    })
}))

UserEntity.properties.push(Property.createReactive({
    name: 'anySendRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedAny.createReactive({
        relation: sendRequestRelation,
        relationDirection: 'target',
        matchExpression: (request) => request.handled
    })
}))

// 计算 total friend count
const userTotalFriendCount = RelationCount.createReactive({
    relation: friendRelation,
    relationDirection: 'source',
    matchExpression: () => true
})

UserEntity.properties.push(Property.createReactive({
    name: 'totalFriendCount',
    type: 'number',
    collection: false,
    computedData: userTotalFriendCount
}))


State.createReactive({
    name: 'totalFriendRelation',
    type: 'number',
    collection: false,
    computedData: Count.createReactive({
        record: friendRelation,
        matchExpression: () => true
    })
})

State.createReactive({
    name: 'everyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Every.createReactive({
        record: requestEntity,
        matchExpression: (request) => {
        return request.handled
        }
    })
})

State.createReactive({
    name: 'anyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Any.createReactive({
        record: requestEntity,
        matchExpression: (request) => {
        return request.handled
        }
    })
})

export const data = JSON.parse(stringifyAllInstances())
removeAllInstance()