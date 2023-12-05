import {
    Action,
    Activity,
    ActivityGroup,
    Any,
    BoolAtomData,
    Count,
    createUserRoleAttributive,
    Entity,
    Every,
    Interaction,
    MapActivityToRecord,
    MapInteractionToProperty,
    MapInteractionToPropertyItem,
    Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    Relation,
    RelationBasedAny,
    RelationBasedEvery,
    RelationCount,
    RelationStateMachine,
    RelationStateNode,
    RelationStateTransfer,
    removeAllInstance,
    State,
    stringifyAllInstances,
    Transfer,
    UserAttributive,
    UserAttributives,
    BoolExp
} from "@interaqt/shared";
import { MatchAtom} from "@interaqt/storage";
import {OtherAttr} from "./roles";
import {Controller} from "../../Controller";

const userEntity = Entity.create({ name: 'User' })
const nameProperty = Property.create({ name: 'name', type: PropertyTypes.String })
const ageProperty = Property.create({ name: 'age', type: PropertyTypes.Number })
userEntity.properties.push(nameProperty, ageProperty)

export const messageEntity = Entity.create({
    name: 'Message',
    properties: [Property.create({
        name: 'content',
        type: 'string',
        collection: false,
    })]
})

export const globalUserRole = createUserRoleAttributive({})
const userRefA = createUserRoleAttributive({name: 'A', isRef: true})
export const userRefB = createUserRoleAttributive({name: 'B', isRef: true})
export const sendInteraction = Interaction.create({
    name: 'sendRequest',
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: globalUserRole,
    userRef: userRefA,
    action: Action.create({name: 'sendRequest'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'to',
                attributives: UserAttributives.create({
                    content: BoolAtomData.create({data: OtherAttr})
                }),
                base: globalUserRole,
                itemRef: userRefB
            }),
            PayloadItem.create({
                name: 'message',
                base: messageEntity,
                itemRef: Entity.create({name: '', isRef: true}),
            })
        ]
    })
})
export const approveInteraction = Interaction.create({
    name: 'approve',
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'approve'}),
    payload: Payload.create({})
})
const rejectInteraction = Interaction.create({
    name: 'reject',
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'reject'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'reason',
                base: messageEntity,
                itemRef: Entity.create({name: '', isRef: true}),
            })
        ]
    })
})
const cancelInteraction = Interaction.create({
    name: 'cancel',
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: userRefA,
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'cancel'}),
    payload: Payload.create({})
})
const responseGroup = ActivityGroup.create({
    type: 'any',
    activities: [
        Activity.create({
            name: "approveFriendRelation",
            interactions: [
                approveInteraction
            ]
        }),
        Activity.create({
            name: "rejectFriendRelation",
            interactions: [
                rejectInteraction
            ]
        }),
        Activity.create({
            name: "cancelFriendRelation",
            interactions: [
                cancelInteraction
            ]
        })
    ],
})
export const createFriendRelationActivity = Activity.create({
    name: "createFriendRelation",
    interactions: [
        sendInteraction
    ],
    groups: [
        responseGroup
    ],
    transfers: [
        Transfer.create({
            name: 'fromSendToResponse',
            source: sendInteraction,
            target: responseGroup
        })
    ]
})

export const MyFriend = UserAttributive.create({
    name: 'MyFriend',
    content:
async function MyFriend(this: Controller, target, { user }){
    const relationName = this.system.storage.getRelationName('User', 'friends')
    const {BoolExp} = this.globals
    const match = BoolExp.atom({
        key: 'source.id', 
        value: ['=', user.id]
    }).and({
        key: 'target.id', 
        value: ['=', target.id]
    })

    return !!(await this.system.storage.findOneRelationByName(relationName, match))
}
})

export const deleteInteraction = Interaction.create({
    name: 'deleteFriend',
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: globalUserRole,
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'deleteFriend'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'target',
                attributives: UserAttributives.create({
                    content: BoolAtomData.create({data: MyFriend})
                }),
                base: globalUserRole,
                isRef: true,
                itemRef: Entity.create({name: '', isRef: true}),
            }),
        ]
    })
})


// friend 关系的状态机描述
const notFriendState = RelationStateNode.create({
    hasRelation: false
})
const isFriendState = RelationStateNode.create({
    hasRelation: true
})

const addFriendTransfer = RelationStateTransfer.create({
    sourceActivity: createFriendRelationActivity,
    triggerInteraction: approveInteraction,
    fromState: notFriendState,
    toState: isFriendState,
    handleType: 'computeSource',
    handle: async function(this: Controller, eventArgs, activityId) {
        const { BoolExp } = this.globals
        const match = BoolExp.atom({
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

const deleteFriendTransfer = RelationStateTransfer.create({
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

const friendRelationSM = RelationStateMachine.create({
    states: [notFriendState, isFriendState],
    transfers: [addFriendTransfer, deleteFriendTransfer],
    defaultState: notFriendState
})






const friendRelation = Relation.create({
    source: userEntity,
    sourceAttribute: 'friends',
    target: userEntity,
    targetAttribute: 'friends',
    relType: 'n:n',
    computedData: friendRelationSM
})



export const mapFriendActivityToRequest = MapActivityToRecord.create({
    sourceActivity: createFriendRelationActivity,
    triggerInteraction: [sendInteraction, approveInteraction, rejectInteraction],
    handle:function map(stack){
        const sendRequestEvent = stack.find((i:any) => i.interaction.name === 'sendRequest')
        
if (!sendRequestEvent) { 
    return undefined
}

const handled = !!stack.find((i:any) => i.interaction.name === 'approve' || i.interaction.name === 'reject')
        
return {
    from: sendRequestEvent.data.user,
    to: sendRequestEvent.data.payload.to,
    message: sendRequestEvent.data.payload.message,
    handled,
}
}
})

const requestEntity= Entity.create({
    name: 'Request',
    computedData: mapFriendActivityToRequest,
    properties: [Property.create({
        name: 'handled',
        type:'boolean',
        collection: false,
    })]
})

const sendRequestRelation = Relation.create({
    source: requestEntity,
    sourceAttribute: 'from',
    target: userEntity,
    targetAttribute: 'request',
    relType: 'n:1'
})

const receivedRequestRelation = Relation.create({
    source: requestEntity,
    sourceAttribute: 'to',
    target: userEntity,
    targetAttribute: 'receivedRequest',
    relType: 'n:1',
    properties: [Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computedData: MapInteractionToProperty.create({
            items: [
                MapInteractionToPropertyItem.create({
                    interaction: approveInteraction,
                    handle: () => 'approved',
                    computeSource: async function(this:  Controller, event, activityId) {
                        const { BoolExp } = this.globals
                        const match = BoolExp.atom({
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
                    handle: () => 'rejected',
                    computeSource: async function(this:  Controller,event, activityId)  {
                        const { BoolExp } = this.globals
                        const match = BoolExp.atom({
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
    Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computed: (request: any) => {
            return request.approved ? 'approved' : (request.rejected ? 'rejected' : 'pending')
        }
    }),
)

const messageToRequestRelation = Relation.create({
    source: requestEntity,
    sourceAttribute: 'message',
    target: messageEntity,
    targetAttribute: 'request',
    relType: '1:1'
})

// 计算 unhandled request 的总数
const userTotalUnhandledRequest = RelationCount.create({
    relation: receivedRequestRelation,
    relationDirection: 'target',
    matchExpression:
(request) => {
    return !request.handled
}
    ,
})

userEntity.properties.push(Property.create({
    name: 'totalUnhandledRequest',
    type: 'number',
    collection: false,
    computedData: userTotalUnhandledRequest
}))

userEntity.properties.push(Property.create({
    name: 'everySendRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedEvery.create({
        relation: sendRequestRelation,
        relationDirection: 'target',
        matchExpression: (request) => request.handled
    })
}))

userEntity.properties.push(Property.create({
    name: 'anySendRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedAny.create({
        relation: sendRequestRelation,
        relationDirection: 'target',
        matchExpression: (request) => request.handled
    })
}))

// 计算 total friend count
const userTotalFriendCount = RelationCount.create({
    relation: friendRelation,
    relationDirection: 'source',
    matchExpression: () => true
})

userEntity.properties.push(Property.create({
    name: 'totalFriendCount',
    type: 'number',
    collection: false,
    computedData: userTotalFriendCount
}))


const totalFriendRelationState = State.create({
    name: 'totalFriendRelation',
    type: 'number',
    collection: false,
    computedData: Count.create({
        record: friendRelation,
        matchExpression: () => true
    })
})

const everyRequestHandledState = State.create({
    name: 'everyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Every.create({
        record: requestEntity,
        matchExpression: (request) => {
        return request.handled
        }
    })
})

const anyRequestHandledState = State.create({
    name: 'anyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Any.create({
        record: requestEntity,
        matchExpression: (request) => {
        return request.handled
        }
    })
})

export const data = JSON.parse(stringifyAllInstances())
removeAllInstance()