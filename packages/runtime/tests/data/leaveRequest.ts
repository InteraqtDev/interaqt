import {
    Action,
    Attributive,
    Attributives,
    BoolAtomData,
    Controller,
    createUserRoleAttributive,
    Entity,
    Interaction,
    MapInteraction,
    MapInteractionItem,
    Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    Relation,
    RelationBasedAny,
    RelationBasedEvery,
    removeAllInstance,
    StateMachine,
    StateNode,
    StateTransfer,
    stringifyAllInstances,
    USER_ENTITY
} from '@';
import {OtherAttr} from "./roles";

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
                    content: BoolAtomData.create({data: OtherAttr})
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
    relType: 'n:1',
    computedData:  MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: sendInteraction,
                map:function map(event: any){
                    return {
                        source: event.payload.request,
                        target: event.user,
                    }
                }

            })
        ],
        // sourceInteraction: sendInteraction,
        // handle:function map(event: any){
        //     return {
        //         source: event.payload.request,
        //         target: event.user,
        //     }
        // }
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
                    content: BoolAtomData.create({data: MyAttr})
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
                    content: BoolAtomData.create({data: OtherAttr})
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
                    content: BoolAtomData.create({data: OtherAttr})
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
    value: null
})
const isReviewerState = StateNode.create({
    value: {}
})

const sendRequestTransfer = StateTransfer.create({
    triggerInteraction: sendInteraction,
    fromState: notReviewerState,
    toState: isReviewerState,
    handleType: 'computeTarget',
    handle: async function(eventArgs) {
        return {
            source: eventArgs.payload.request,
            target: eventArgs.payload.to
        }
    }

})

const addReviewerTransfer = StateTransfer.create({
    triggerInteraction: addReviewersInteraction,
    fromState: isReviewerState,
    toState: notReviewerState,
    handleType: 'computeTarget',
    handle: async function(eventArgs, activityId) {
        return eventArgs.payload.reviewer.map((reviewer: any) => {
            return {
                source: eventArgs.payload.request,
                target: reviewer
            }
        })
    }

})

const transferReviewerTransfer = StateTransfer.create({
    triggerInteraction: transferReviewersInteraction,
    fromState: isReviewerState,
    toState: notReviewerState,
    handleType: 'computeTarget',
    handle: async function(eventArgs, activityId) {
        return {
            source: eventArgs.payload.request,
            target: eventArgs.payload.reviewer
        }
    }

})

const transferFromReviewerTransfer = StateTransfer.create({
    triggerInteraction: transferReviewersInteraction,
    fromState: notReviewerState,
    toState: isReviewerState,
    handleType: 'computeTarget',
    handle: async function(eventArgs, activityId) {
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
    relType: 'n:1',
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
    // 上面和下面两种写法都可以，机制不同。下面的是在 insert/update 的时候就直接计算了
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
