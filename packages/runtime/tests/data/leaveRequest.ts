import {
    Action,
    Any,
    Attributive,
    Attributives,
    BoolAtomData,
    Controller,
    createUserRoleAttributive,
    Entity,
    Every,
    Interaction,
    MapInteraction,
    MapInteractionItem,
    Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    Relation, removeAllInstance,
    StateMachine,
    StateNode,
    StateTransfer,
    stringifyAllInstances,
    Transform,
    USER_ENTITY
} from '@';
import { OtherAttr } from "./roles";

const UserEntity = Entity.create({ name: USER_ENTITY })
const nameProperty = Property.create({ name: 'name', type: PropertyTypes.String })
UserEntity.properties.push(nameProperty)

export const globalUserRole = createUserRoleAttributive({name: 'user'}  )
const userRefA = createUserRoleAttributive({name: 'A', isRef: true})

const RequestEntity= Entity.create({
    name: 'Request',
    properties: [Property.create({
        name: 'reason',
        type:'string',
        collection: false,
    })]
})


export const sendInteraction = Interaction.create({
    name: 'sendRequest',
    action: Action.create({name: 'sendRequest'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'to',
                attributives: Attributives.create({
                    content: BoolAtomData.create({data: OtherAttr, type: 'boolean'})
                }),
                base: UserEntity,
                isRef: true,
            }),
            PayloadItem.create({
                name: 'request',
                base: RequestEntity,
            })
        ]
    })
})


const sendRequestRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    type: 'n:1',
    computedData:  
    Transform.create({
        callback: function map(event: any){
            return {
                source: event.payload.request,
                target: event.user,
            }
        },
        record: RequestEntity,
        attributeQuery: ['*']
    }),
})

const MyAttr = Attributive.create({
    name: 'Mine',
    content:
    async function Mine(this: Controller, request, {user}) {
        const {BoolExp}  = this.globals
        const match = BoolExp.atom({
            key: 'id', 
            value: ['=', request.id]
        })
        const {to} = await this.system.storage.findOne('Request',match, undefined, [['to', {attributeQuery: ['id']}]] )

        return user.id === to.id
    }

})


// 同意
export const approveInteraction = Interaction.create({
    name: 'approve',
    action: Action.create({name: 'approve'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'request',
                // FIXME 增加定语： 我的、未完成的
                attributives: Attributives.create({
                    content: BoolAtomData.create({data: MyAttr, type: 'boolean'})
                }),
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
export const addReviewersInteraction = Interaction.create({
    name: 'addReviewers',
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'addReviewers'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'reviewers',
                attributives: Attributives.create({
                    content: BoolAtomData.create({data: OtherAttr, type: 'boolean'})
                }),
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
export const transferReviewersInteraction = Interaction.create({
    name: 'transferReviewer',
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'transferReviewer'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'reviewer',
                attributives: Attributives.create({
                    content: BoolAtomData.create({data: OtherAttr, type: 'boolean'})
                }),
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
    computeValue:() => ({})
})
const isReviewerState = StateNode.create({
    name: 'isReviewer',
    computeValue: ()=> null
})

const sendRequestTransfer = StateTransfer.create({
    trigger: sendInteraction,
    current: notReviewerState,
    next: isReviewerState,
    computeTarget: async function(eventArgs) {
        return {
            source: eventArgs.payload.request,
            target: eventArgs.payload.to
        }
    }
})

const addReviewerTransfer = StateTransfer.create({
    trigger: addReviewersInteraction,
    current: isReviewerState,
    next: notReviewerState,
    computeTarget: async function(eventArgs) {
        return eventArgs.payload.reviewer.map((reviewer: any) => {
            return {
                source: eventArgs.payload.request,
                target: reviewer
            }
        })
    }
})

const transferReviewerTransfer = StateTransfer.create({
    trigger: transferReviewersInteraction,
    current: isReviewerState,
    next: notReviewerState,
    computeTarget: async function(eventArgs) {
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
    computeTarget: async function(eventArgs) {
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


// 是否是 reviewer
const reviewerRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'to',
    target: UserEntity,
    targetProperty: 'request',
    type: 'n:1',
    computedData:  reviewerRelationSM,
    properties: [Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computedData: MapInteraction.create({
            items: [
                MapInteractionItem.create({
                    interaction: approveInteraction,
                    map: () => 'approved',
                    computeTarget: function(event) {
                        return {
                            "source.id": event.payload.request.id,
                            "target.id": event.user.id
                        }
                    }
                }),
                MapInteractionItem.create({
                    interaction: rejectInteraction,
                    map: () => 'rejected',
                    computeTarget: function(event)  {
                        return {
                            "source.id": event.payload.request.id,
                            "target.id": event.user.id
                        }
                    }
                })
            ],
        })
    })]
})

RequestEntity.properties.push(
    Property.create({
        name: 'approved',
        type: 'boolean',
        collection: false,
        computedData: Every.create({
            record: reviewerRelation,
            notEmpty: true,
            callback:(relation) => {
                return relation.result === 'approved'
            }
        })
    }),
    Property.create({
        name: 'rejected',
        type: 'boolean',
        collection: false,
        computedData: Any.create({
            record: reviewerRelation,
            callback:(relation) => {
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


export const data = JSON.parse(stringifyAllInstances())
removeAllInstance()
