import {
    Action,
    Any,
    Attributive, BoolExp,
    boolExpToAttributives,
    Controller,
    createUserRoleAttributive,
    Custom,
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
    USER_ENTITY,
    HardDeletionProperty, DELETED_STATE, NON_DELETED_STATE
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

// result 状态机定义

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
    trigger: {
        recordName: InteractionEventEntity.name,
        type: 'create',
        record: {
            interactionName: approveInteraction.name
        }
    },
    current: pendingStateNode,
    next: approvedStateNode,
    computeTarget: async function(mutationEvent: any) {
        return {
            id: mutationEvent.record.payload.request.id,
        }
    }
})

const pendingToRejectedTransfer = StateTransfer.create({
    trigger: {
        recordName: InteractionEventEntity.name,
        type: 'create',
        record: {
            interactionName: rejectInteraction.name
        }
    },
    current: pendingStateNode,
    next: rejectedStateNode,
    computeTarget: async function(mutationEvent: any) {
        return {
            id: mutationEvent.record.payload.request.id,
        }
    }
})

const resultSM = StateMachine.create({
    states: [pendingStateNode, approvedStateNode, rejectedStateNode],
    transfers: [pendingToApprovedTransfer, pendingToRejectedTransfer],
    defaultState: pendingStateNode
})



// 是否是 reviewer - 使用 Transform 创建关系
const reviewerRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'to',
    target: UserEntity,
    targetProperty: 'request',
    type: 'n:1',
    properties: [
        Property.create({
            name: 'result',
            type: 'string',
            collection: false,
            computation: resultSM
        }),
        HardDeletionProperty.create()
    ],
    // 使用 Transform 从交互事件创建关系
    computation: Transform.create({
        record: InteractionEventEntity,
        callback: async function(this: Controller, event: any) {
            const MatchExp = this.globals.MatchExp
            
            // 从 sendRequest 创建初始关系
            if (event.interactionName === sendInteraction.name) {
                const request = await this.system.storage.findOne('Request', MatchExp.atom({
                    key: 'interaction.id',
                    value: ['=', event.id]
                }), undefined, ['id'])
                if (request) {
                    return {
                        source: request,
                        target: event.payload.to
                    }
                }
            }
            
            // 从 addReviewers 创建新关系
            if (event.interactionName === addReviewersInteraction.name) {
                return event.payload.reviewers.map((reviewer: any) => {
                    return {
                        source: event.payload.request,
                        target: reviewer
                    }
                })
            }
            
            // 从 transferReviewer 创建新关系
            if (event.interactionName === transferReviewersInteraction.name) {
                return {
                    source: event.payload.request,
                    target: event.payload.reviewer
                }
            }
            
            return null
        }
    })
})

// 为转移创建删除状态机
const deletionProperty = reviewerRelation.properties!.find(p => p.name === '_isDeleted_')!
deletionProperty.computation = StateMachine.create({
    states: [NON_DELETED_STATE, DELETED_STATE],
    transfers: [
        StateTransfer.create({
            trigger: {
                recordName: InteractionEventEntity.name,
                type: 'create',
                record: {
                    interactionName: transferReviewersInteraction.name
                }
            },
            current: NON_DELETED_STATE,
            next: DELETED_STATE,
            computeTarget: async function(this: Controller, mutationEvent: any) {
                const MatchExp = this.globals.MatchExp
                // 转移时删除旧的关系  
                const existingRelation = await this.system.storage.findOne(
                    reviewerRelation.name!,
                    MatchExp.atom({
                        key: 'source.id',
                        value: ['=', mutationEvent.record.payload.request.id]
                    }),
                    undefined,
                    ['id']
                )
                return existingRelation ? { id: existingRelation.id } : undefined
            }
        })
    ],
    defaultState: NON_DELETED_STATE
})

RequestEntity.properties.push(
    Property.create({
        name: 'approved',
        type: 'boolean',
        collection: false,
        computation: Custom.create({
            name: 'approved',
            dataDeps: {
                self: {
                    type: 'property',
                    attributeQuery: [['to', {attributeQuery: [['&', {attributeQuery: ['result']}]]}]]
                }
            },
            compute: async function(this: Controller, dataDeps: any) {
                return dataDeps.self.to['&'].result === 'approved'
            }
        })
    }),
    Property.create({
        name: 'rejected',
        type: 'boolean',
        collection: false,
        computation: Custom.create({
            name: 'rejected',
            dataDeps: {
                self: {
                    type: 'property',
                    attributeQuery: [['to', {attributeQuery: [['&', {attributeQuery: ['result']}]]}]]
                }
            },
            compute: async function(this: Controller, dataDeps: any) {
                return dataDeps.self.to['&'].result === 'rejected'
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