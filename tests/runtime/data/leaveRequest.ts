import {
    Action,
    Any,
    Attributive, BoolExp,
    boolExpToAttributives,
    Controller,
    createUserRoleAttributive,
    Entity,
    Every,
    Interaction,
    InteractionEventEntity, Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    Relation, StateMachine,
    StateNode,
    StateTransfer, Transform,
    USER_ENTITY
} from 'interaqt';
import { OtherAttr } from "./roles";

export function createData() {
    const UserEntity = Entity.create({ name: USER_ENTITY })
const nameProperty = Property.create({ name: 'name', type: PropertyTypes.String })
UserEntity.properties.push(nameProperty)

 const globalUserRole = createUserRoleAttributive({name: 'user'}  )
const userRefA = createUserRoleAttributive({name: 'A', isRef: true})



 const sendInteraction = Interaction.create({
    name: 'sendRequest',
    action: Action.create({name: 'sendRequest'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'to',
                attributives: boolExpToAttributives(BoolExp.atom(OtherAttr)),
                base: UserEntity,
                isRef: true,
            }),
            PayloadItem.create({
                name: 'reason',
            })
        ]
    })
})


const RequestEntity= Entity.create({
    name: 'Request',
    properties: [Property.create({
        name: 'reason',
        type:'string',
        collection: false,
    })],
    computation: Transform.create({
        record: InteractionEventEntity,
        callback: function map(event: any){
            if (event.interactionName === sendInteraction.name) {
                return {
                    reason: event.payload.reason,
                    interaction: {
                        id: event.id,
                    }
                }
            } else {
                return null
            }
        }
    })
})


const requestInteractionRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'interaction',
    target: InteractionEventEntity,
    targetProperty: 'request',
    type: '1:1',
})


const sendRequestRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    type: 'n:1',
    computation:  
    Transform.create({
        callback: async function map(this: Controller,event: any){
            const MatchExp = this.globals.MatchExp
            if (event.interactionName === sendInteraction.name) {
                const request = await this.system.storage.findOne('Request', MatchExp.atom({
                    key: 'interaction.id',
                    value: ['=', event.id]
                }), undefined, ['id'] )

                return {
                    source: request,
                    target: event.user,
                }
            } else {
                return null
            }
        },
        record: InteractionEventEntity,
        attributeQuery: ['*']
    }),
})



const MyAttr = Attributive.create({
    name: 'Mine',
    content:
    async function Mine(this: Controller, request: any, {user}: {user: any}) {
        const {MatchExp}  = this.globals
        const match = MatchExp.atom({
            key: 'id', 
            value: ['=', request.id]
        })
        const {to} = await this.system.storage.findOne('Request',match, undefined, [['to', {attributeQuery: ['id']}]] )

        return user.id === to.id
    }

})


// 同意
 const approveInteraction = Interaction.create({
    name: 'approve',
    action: Action.create({name: 'approve'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'request',
                // FIXME 增加定语： 我的、未完成的
                attributives: boolExpToAttributives(BoolExp.atom(MyAttr)),
                base: RequestEntity,
                isRef: true
            })
        ]
    })
})


// 拒绝
const rejectInteraction = Interaction.create({
    name: 'reject',
    action: Action.create({name: 'reject'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'request',
                // FIXME 增加定语： 我的、未完成的
                base: RequestEntity,
                isRef: true
            })
        ]
    })
})

// 加签
 const addReviewersInteraction = Interaction.create({
    name: 'addReviewers',
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'addReviewers'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'reviewers',
                attributives: boolExpToAttributives(BoolExp.atom(OtherAttr)),
                isCollection: true,
                base: UserEntity,
                isRef:true,
            }),
            PayloadItem.create({
                name: 'request',
                // FIXME 增加定语： 我的、未完成的
                base: RequestEntity,
                isRef: true
            })
        ]
    })
})

// 转移
 const transferReviewersInteraction = Interaction.create({
    name: 'transferReviewer',
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'transferReviewer'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'reviewer',
                attributives: boolExpToAttributives(BoolExp.atom(OtherAttr)),
                base: UserEntity,
                isRef: true
            }),
            PayloadItem.create({
                name: 'request',
                // FIXME 增加定语： 我的、未完成的
                base: RequestEntity,
                isRef: true
            })
        ]
    })
})

// 是否是 reviewer 的状态机
const notReviewerState = StateNode.create({
    name: 'notReviewer',
    computeValue:() => null
})
const isReviewerState = StateNode.create({
    name: 'isReviewer',
    computeValue: ()=> ({})
})

const sendRequestTransfer = StateTransfer.create({
    trigger: sendInteraction,
    current: notReviewerState,
    next: isReviewerState,
    computeTarget: async function(this: Controller, event: any) {
        const MatchExp = this.globals.MatchExp
        const request = await this.system.storage.findOne('Request', MatchExp.atom({
            key: 'interaction.id',
            value: ['=', event.id]
        }), undefined, ['id'] )
        return {
            source: request,
            target: event.payload.to
        }
    }
})

const addReviewerTransfer = StateTransfer.create({
    trigger: addReviewersInteraction,
    current: isReviewerState,
    next: notReviewerState,
    computeTarget: async function(event: any) {
        return event.payload.reviewer.map((reviewer: any) => {
            return {
                source: event.payload.request,
                target: reviewer
            }
        })
    }
})

const transferReviewerTransfer = StateTransfer.create({
    trigger: transferReviewersInteraction,
    current: isReviewerState,
    next: notReviewerState,
    computeTarget: async function(eventArgs: any) {
        return {
            source: eventArgs.payload.request,
            target: eventArgs.payload.reviewer
        }
    }

})

const transferFromReviewerTransfer = StateTransfer.create({
    trigger: transferReviewersInteraction,
    current: notReviewerState,
    next: isReviewerState,
    computeTarget: async function(eventArgs: any) {
        return {
            source: eventArgs.payload.request,
            target: eventArgs.user
        }
    }
})

const reviewerRelationSM = StateMachine.create({
    states: [notReviewerState, isReviewerState],
    transfers: [sendRequestTransfer, transferReviewerTransfer, addReviewerTransfer, transferFromReviewerTransfer],
    defaultState: notReviewerState
})

const pendingStateNode = StateNode.create({
    name: 'pending'
})

const approvedStateNode = StateNode.create({
    name: 'approved'
})

const rejectedStateNode = StateNode.create({
    name: 'rejected'
})

const pendingToApprovedTransfer = StateTransfer.create({
    trigger: approveInteraction,
    current: pendingStateNode,
    next: approvedStateNode,
    computeTarget: async function(eventArgs: any) {
        return {
            id: eventArgs.payload.request.id,
        }
    }
})

const pendingToRejectedTransfer = StateTransfer.create({
    trigger: rejectInteraction,
    current: pendingStateNode,
    next: rejectedStateNode,
    computeTarget: async function(eventArgs: any) {
        return {
            id: eventArgs.payload.request.id,
        }
    }
})

const resultSM = StateMachine.create({
    states: [pendingStateNode, approvedStateNode, rejectedStateNode],
    transfers: [pendingToApprovedTransfer, pendingToRejectedTransfer],
    defaultState: pendingStateNode
})



// 是否是 reviewer
const reviewerRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'to',
    target: UserEntity,
    targetProperty: 'request',
    type: 'n:1',
    computation:  reviewerRelationSM,
    properties: [Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computation: resultSM
    })]
})

RequestEntity.properties.push(
    Property.create({
        name: 'approved',
        type: 'boolean',
        collection: false,
        computation: Every.create({
            record: reviewerRelation,
            attributeQuery: ['result'],
            notEmpty: true,
            callback:(relation: any) => {
                return relation.result === 'approved'
            }
        })
    }),
    Property.create({
        name: 'rejected',
        type: 'boolean',
        collection: false,
        computation: Any.create({
            record: reviewerRelation,
            attributeQuery: ['result'],
            callback:(relation: any) => {
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

    return {
        entities: [UserEntity, RequestEntity],
        interactions: [sendInteraction, approveInteraction, rejectInteraction, addReviewersInteraction, transferReviewersInteraction],
        relations: [requestInteractionRelation, sendRequestRelation, reviewerRelation]
    }
}