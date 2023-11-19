import {createUserRoleAttributive, UserAttributive, UserAttributives} from "@shared/user/User";
import {
    Action,
    Activity,
    ActivityGroup,
    Interaction,
    Payload,
    PayloadItem,
    Transfer
} from "@shared/activity/Activity";
import {OtherAttr} from "./roles";
import {Entity, Property, PropertyTypes, Relation} from "@shared/entity/Entity";
import {State} from "@shared/state/State";

import {
    RelationStateMachine,
    RelationStateNode,
    RelationStateTransfer,
    MapActivityToEntity,
    RelationCount,
    Count,
    RelationBasedEvery,
    RelationBasedAny,
    Every,
    Any,
    MapInteractionToRecord,
    MapInteractionToProperty,
    MapInteractionToPropertyItem
} from "@shared/IncrementalComputation";
import {removeAllInstance, stringifyAllInstances} from "@shared/createClass";
import {activity, deleteInteraction} from "./activity";

const UserEntity = Entity.createReactive({ name: 'User' })
const nameProperty = Property.createReactive({ name: 'name', type: PropertyTypes.String })
UserEntity.properties.push(nameProperty)

export const globalUserRole = createUserRoleAttributive({name: 'user'}, {isReactive: true})
const userRefA = createUserRoleAttributive({name: 'A', isRef: true}, {isReactive: true})
export const userRefB = createUserRoleAttributive({name: 'B', isRef: true}, {isReactive: true})

const RequestEntity= Entity.createReactive({
    name: 'Request',
    properties: [Property.createReactive({
        name: 'reason',
        type:'string',
        collection: false,
    })]
})


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
                    content: {
                        type:'atom',
                        data: {
                            key: OtherAttr.name
                        }
                    }
                }),
                base: globalUserRole,
                itemRef: userRefB
            }),
            PayloadItem.createReactive({
                name: 'request',
                base: RequestEntity,
            })
        ]
    })
})


const sendRequestRelation = Relation.createReactive({
    entity1: RequestEntity,
    targetName1: 'from',
    entity2: UserEntity,
    targetName2: 'request',
    relType: 'n:1',
    computedData:  MapInteractionToRecord.createReactive({
        sourceInteraction: sendInteraction,
        handle:`function map(event){
return {
    target: event.user,
    source: event.payload.request,
}
}`
    }),
})






// 同意
export const approveInteraction = Interaction.createReactive({
    name: 'approve',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
    action: Action.createReactive({name: 'approve'}),
    payload: Payload.createReactive({
        items: [
            PayloadItem.createReactive({
                name: 'request',
                // FIXME 增加定语： 我的、未完成的
                base: RequestEntity,
                isRef: true
            })
        ]
    })
})


// 拒绝
const rejectInteraction = Interaction.createReactive({
    name: 'reject',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
    action: Action.createReactive({name: 'reject'}),
    payload: Payload.createReactive({
        items: [
            PayloadItem.createReactive({
                name: 'request',
                // FIXME 增加定语： 我的、未完成的
                base: RequestEntity,
                isRef: true
            })
        ]
    })
})

// 加签
export const addReviewersInteraction = Interaction.createReactive({
    name: 'addReviewers',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
    action: Action.createReactive({name: 'addReviewers'}),
    payload: Payload.createReactive({
        items: [
            PayloadItem.createReactive({
                name: 'reviewers',
                attributives: UserAttributives.createReactive({
                    content: {
                        type:'atom',
                        data: {
                            key: OtherAttr.name
                        }
                    }
                }),
                isCollection: true,
                base: globalUserRole,
            }),
            PayloadItem.createReactive({
                name: 'request',
                // FIXME 增加定语： 我的、未完成的
                base: RequestEntity,
                isRef: true
            })
        ]
    })
})

// 转移
export const transferReviewersInteraction = Interaction.createReactive({
    name: 'transferReviewer',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
    action: Action.createReactive({name: 'transferReviewer'}),
    payload: Payload.createReactive({
        items: [
            PayloadItem.createReactive({
                name: 'reviewer',
                attributives: UserAttributives.createReactive({
                    content: {
                        type:'atom',
                        data: {
                            key: OtherAttr.name
                        }
                    }
                }),
                base: globalUserRole,
            }),
            PayloadItem.createReactive({
                name: 'request',
                // FIXME 增加定语： 我的、未完成的
                base: RequestEntity,
                isRef: true
            })
        ]
    })
})

// 是否是 reviewer 的状态机
const notReviewerState = RelationStateNode.createReactive({
    hasRelation: false
})
const isReviewerState = RelationStateNode.createReactive({
    hasRelation: true
})

const sendRequestTransfer = RelationStateTransfer.createReactive({
    triggerInteraction: sendInteraction,
    fromState: notReviewerState,
    toState: isReviewerState,
    handleType: 'computeSource',
    handle: `
async function(eventArgs) {
    return {
        source: eventArgs.payload.request,
        target: eventArgs.payload.to
    }
}
`
})

const addReviewerTransfer = RelationStateTransfer.createReactive({
    triggerInteraction: addReviewersInteraction,
    fromState: isReviewerState,
    toState: notReviewerState,
    handleType: 'computeSource',
    handle: `
async function(eventArgs, activityId) {
    return eventArgs.payload.reviewer.map(reviewer => {
        return {
            source: eventArgs.payload.request,
            target: reviewer
        }
    })
}
`
})

const transferReviewerTransfer = RelationStateTransfer.createReactive({
    triggerInteraction: transferReviewersInteraction,
    fromState: isReviewerState,
    toState: notReviewerState,
    handleType: 'computeSource',
    handle: `
async function(eventArgs, activityId) {
    return {
        source: eventArgs.payload.request,
        target: eventArgs.payload.reviewer
    }
}
`
})

const transferFromReviewerTransfer = RelationStateTransfer.createReactive({
    triggerInteraction: transferReviewersInteraction,
    fromState: notReviewerState,
    toState: isReviewerState,
    handleType: 'computeSource',
    handle: `
async function(eventArgs, activityId) {
    return {
        source: eventArgs.payload.request,
        target: eventArgs.user
    }
}
`
})

const reviewerRelationSM = RelationStateMachine.createReactive({
    states: [notReviewerState, isReviewerState],
    transfers: [sendRequestTransfer, transferReviewerTransfer, addReviewerTransfer, transferFromReviewerTransfer],
    defaultState: notReviewerState
})


// 是否是 reviewer
const reviewerRelation = Relation.createReactive({
    entity1: RequestEntity,
    targetName1: 'to',
    entity2: UserEntity,
    targetName2: 'request',
    relType: 'n:1',
    computedData:  reviewerRelationSM,
    properties: [Property.createReactive({
        name: 'result',
        type: 'string',
        collection: false,
        computedData: MapInteractionToProperty.createReactive({
            items: [
                MapInteractionToPropertyItem.createReactive({
                    interaction: approveInteraction,
                    value: 'approved',
                    computeSource: `(event) => {
                        return {
                            "source.id": event.payload.request.id,
                            "target.id": event.user.id
                        }
                    }`
                }),
                MapInteractionToPropertyItem.createReactive({
                    interaction: rejectInteraction,
                    value: 'rejected',
                    computeSource: `(event) => {
                        return {
                            "source.id": event.payload.request.id,
                            "target.id": event.user.id
                        }
                    }`
                })
            ],
        })
    })]
})

RequestEntity.properties.push(Property.createReactive({
    name: 'approved',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedEvery.createReactive({
        relation: reviewerRelation,
        relationDirection: 'source',
        matchExpression:`
        (_, relation) => {
            return relation.result === 'approved'
        }
`
    })
}), Property.createReactive({
    name: 'rejected',
    type: 'boolean',
    collection: false,
    computedData: RelationBasedAny.createReactive({
        relation: reviewerRelation,
        relationDirection: 'source',
        matchExpression:`
        (_, relation) => {
            return relation.result === 'rejected'
        }
`
    })
})
)

export const data = JSON.parse(stringifyAllInstances())
removeAllInstance()
