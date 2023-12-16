import "./user.js";
import "./createFriendRelationActivity.js";
import "./messageEntity.js";
import "./requestEntity.js";
import "./roles.js";
import "./states.js";
import "./friend.js";
import "./post.js"
import {
    Action,
    Activity,
    ActivityGroup,
    Any,
    Attributive,
    BoolExp,
    boolExpToAttributives,
    Controller,
    Count,
    createUserRoleAttributive,
    Entity,
    Every,
    Interaction,
    MapActivity,
    MapActivityItem,
    MapInteraction,
    MapInteractionItem,
    MapRecordMutation,
    Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    RecordMutationEvent,
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
    USER_ENTITY
} from "@interaqt/runtime";

const userRefA = createUserRoleAttributive({name: 'A', isRef: true})

export const data = JSON.parse(stringifyAllInstances())
removeAllInstance()
export const userRefB = createUserRoleAttributive({name: 'B', isRef: true})
export const messageEntity = Entity.create({
    name: 'Message',
    properties: [Property.create({
        name: 'content',
        type: 'string',
        collection: false,
    })]
})
export const OtherAttr = Attributive.create({
    name: 'Other',
    content:
        function Other(targetUser, {user}) {
            return user.id !== targetUser.id
        }
})
export const Admin = createUserRoleAttributive({
    name: 'Admin'
})
export const Anonymous = createUserRoleAttributive({
    name: 'Anonymous'
})
export const globalUserRole = createUserRoleAttributive({})
export const UserEntity = Entity.create({name: USER_ENTITY})
export const nameProperty = Property.create({name: 'name', type: PropertyTypes.String})
export const ageProperty = Property.create({name: 'age', type: PropertyTypes.Number})
export const sendInteraction = Interaction.create({
    name: 'sendRequest',
    userRef: userRefA,
    action: Action.create({name: 'sendRequest'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'to',
                attributives: boolExpToAttributives(BoolExp.atom(OtherAttr)),
                base: UserEntity,
                itemRef: userRefB
            }),
            PayloadItem.create({
                name: 'message',
                base: messageEntity,
            })
        ]
    })
})
export const MyFriend = Attributive.create({
    name: 'MyFriend',
    content:
        async function MyFriend(this: Controller, target, {user}) {
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
export const approveInteraction = Interaction.create({
    name: 'approve',
    userAttributives: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'approve'}),
    payload: Payload.create({})
})
export const rejectInteraction = Interaction.create({
    name: 'reject',
    userAttributives: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'reject'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'reason',
                base: messageEntity,
            })
        ]
    })
})
export const cancelInteraction = Interaction.create({
    name: 'cancel',
    userAttributives: userRefA,
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
export const deleteInteraction = Interaction.create({
    name: 'deleteFriend',
    action: Action.create({name: 'deleteFriend'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'target',
                // attributives: Attributives.create({
                //     content: BoolAtomData.create({data: MyFriend})
                // }),
                // 支持上面这种形式，也支持单独一个 Attributive 写法
                attributives: MyFriend,
                base: UserEntity,
                isRef: true,
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
    handle: async function (this: Controller, eventArgs, activityId) {
        const {BoolExp} = this.globals
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
    handle: async function (eventArgs, activityId) {
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
export const friendRelation = Relation.create({
    source: UserEntity,
    sourceProperty: 'friends',
    target: UserEntity,
    targetProperty: 'friends',
    relType: 'n:n',
    computedData: friendRelationSM
})
export const mapFriendActivityToRequest = MapActivity.create({
    items: [
        MapActivityItem.create({
            activity: createFriendRelationActivity,
            triggerInteractions: [sendInteraction, approveInteraction, rejectInteraction],

            map: (stack) => {
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
    ],

})

export const requestEntity = Entity.create({
    name: 'Request',
    computedData: mapFriendActivityToRequest,
    properties: [Property.create({
        name: 'handled',
        type: 'boolean',
        collection: false,
    })]
})
export const sendRequestRelation = Relation.create({
    source: requestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:1'
})
export const receivedRequestRelation = Relation.create({
    source: requestEntity,
    sourceProperty: 'to',
    target: UserEntity,
    targetProperty: 'receivedRequest',
    relType: 'n:1',
    properties: [Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computedData: MapInteraction.create({
            items: [
                MapInteractionItem.create({
                    interaction: approveInteraction,
                    map: () => 'approved',
                    computeTarget: async function (this: Controller, event, activityId) {
                        const {BoolExp} = this.globals
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
                MapInteractionItem.create({
                    interaction: rejectInteraction,
                    map: () => 'rejected',
                    computeTarget: async function (this: Controller, event, activityId) {
                        const {BoolExp} = this.globals
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
export const messageToRequestRelation = Relation.create({
    source: requestEntity,
    sourceProperty: 'message',
    target: messageEntity,
    targetProperty: 'request',
    relType: '1:1'
})
// 计算 unhandled request 的总数
export const userTotalUnhandledRequest = RelationCount.create({
    relation: receivedRequestRelation,
    relationDirection: 'target',
    match:
        (request) => {
            return !request.handled
        }
    ,
})
UserEntity.properties.push(Property.create({
    name: 'totalUnhandledRequest',
    type: 'number',
    collection: false,
    computedData: userTotalUnhandledRequest
}))

UserEntity.properties.push(Property.create({
    name: 'everySendRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedEvery.create({
        relation: sendRequestRelation,
        relationDirection: 'target',
        match: (request) => request.handled
    })
}))

UserEntity.properties.push(Property.create({
    name: 'anySendRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedAny.create({
        relation: sendRequestRelation,
        relationDirection: 'target',
        match: (request) => request.handled
    })
}))

// 计算 total friend count
const userTotalFriendCount = RelationCount.create({
    relation: friendRelation,
    relationDirection: 'source',
    match: () => true
})

UserEntity.properties.push(Property.create({
    name: 'totalFriendCount',
    type: 'number',
    collection: false,
    computedData: userTotalFriendCount
})) // revision 的实现
export const postEntity = Entity.create({name: 'Post'})
const createPostInteraction = Interaction.create({
    name: 'createPost',
    action: Action.create({name: 'create'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'post',
                base: postEntity,
            }),
        ]
    })
})
export const updatePostInteraction = Interaction.create({
    name: 'updatePost',
    action: Action.create({name: 'update'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'post',
                base: postEntity,
                isRef: true
            }),
        ]
    })
})
export const postRevisionEntity = Entity.create({
    name: 'PostRevision',
    properties: [
        // 这里测试 title 不可更新，所以 revision 里面不记录。
        Property.create({name: 'content', type: PropertyTypes.String})
    ],
    computedData: MapRecordMutation.create({
        map: async function (this: Controller, event: RecordMutationEvent, events: RecordMutationEvent[]) {
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
export const postRevisionRelation = Relation.create({
    source: postEntity,
    sourceProperty: 'revisions',
    target: postRevisionEntity,
    targetProperty: 'current',
    relType: '1:n',
})

postEntity.properties.push(
    Property.create({ name: 'title', type: PropertyTypes.String }),
    Property.create({
        name: 'content',
        type: PropertyTypes.String,
        computedData: MapInteraction.create({
            items: [
                MapInteractionItem.create({
                    interaction: updatePostInteraction,
                    map: (event) => { return event.payload.post.content },
                    computeTarget: async function (this: Controller, event) {
                        return event.payload.post.id
                    }
                }),
            ]
        })
    }),
)
const totalFriendRelationState = State.create({
    name: 'totalFriendRelation',
    type: 'number',
    collection: false,
    computedData: Count.create({
        record: friendRelation,
        match: () => true
    })
})
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
export const states = [
    totalFriendRelationState,
    everyRequestHandledState,
    anyRequestHandledState,
]

UserEntity.properties.push(nameProperty, ageProperty)

requestEntity.properties.push(
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
    }),
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