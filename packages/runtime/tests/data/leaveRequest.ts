import {BoolAtomData, createUserRoleAttributive, UserAttributive, UserAttributives} from "@interaqt/shared";
import {Action, Interaction, Payload, PayloadItem} from "@interaqt/shared";
import {OtherAttr} from "./roles";
import {Entity, Property, PropertyTypes, Relation} from "@interaqt/shared";

import {
    ComputedData,
    MapInteractionToProperty,
    MapInteractionToPropertyItem,
    MapInteractionToRecord,
    RelationBasedAny,
    RelationBasedEvery,
    RelationStateMachine,
    RelationStateNode,
    RelationStateTransfer
} from "@interaqt/shared";
import {removeAllInstance, stringifyAllInstances} from "@interaqt/shared";
import {Controller} from "../../Controller";

const UserEntity = Entity.create({ name: 'User' })
const nameProperty = Property.create({ name: 'name', type: PropertyTypes.String })
UserEntity.properties.push(nameProperty)

export const globalUserRole = createUserRoleAttributive({name: 'user'}, {isReactive: true})
const userRefA = createUserRoleAttributive({name: 'A', isRef: true}, {isReactive: true})

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
            }),
            PayloadItem.create({
                name: 'request',
                base: RequestEntity,
            })
        ]
    })
})


const sendRequestRelation = Relation.create({
    entity1: RequestEntity,
    targetName1: 'from',
    entity2: UserEntity,
    targetName2: 'request',
    relType: 'n:1',
    computedData:  MapInteractionToRecord.create({
        sourceInteraction: sendInteraction,
        handle:function map(event: any){
return {
    target: event.user,
    source: event.payload.request,
}
}
    }),
})

const MyAttr = UserAttributive.create({
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
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: globalUserRole,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
    action: Action.create({name: 'approve'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'request',
                // FIXME 增加定语： 我的、未完成的
                attributives: UserAttributives.create({
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
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: globalUserRole,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
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
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: globalUserRole,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
    action: Action.create({name: 'addReviewers'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'reviewers',
                attributives: UserAttributives.create({
                    content: BoolAtomData.create({data: OtherAttr})
                }),
                isCollection: true,
                base: globalUserRole,
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
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: globalUserRole,
    userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
    action: Action.create({name: 'transferReviewer'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'reviewer',
                attributives: UserAttributives.create({
                    content: BoolAtomData.create({data: OtherAttr})
                }),
                base: globalUserRole,
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
const notReviewerState = RelationStateNode.create({
    hasRelation: false
})
const isReviewerState = RelationStateNode.create({
    hasRelation: true
})

const sendRequestTransfer = RelationStateTransfer.create({
    triggerInteraction: sendInteraction,
    fromState: notReviewerState,
    toState: isReviewerState,
    handleType: 'computeSource',
    handle: async function(eventArgs) {
        return {
            source: eventArgs.payload.request,
            target: eventArgs.payload.to
        }
    }

})

const addReviewerTransfer = RelationStateTransfer.create({
    triggerInteraction: addReviewersInteraction,
    fromState: isReviewerState,
    toState: notReviewerState,
    handleType: 'computeSource',
    handle: async function(eventArgs, activityId) {
        return eventArgs.payload.reviewer.map((reviewer: any) => {
            return {
                source: eventArgs.payload.request,
                target: reviewer
            }
        })
    }

})

const transferReviewerTransfer = RelationStateTransfer.create({
    triggerInteraction: transferReviewersInteraction,
    fromState: isReviewerState,
    toState: notReviewerState,
    handleType: 'computeSource',
    handle: async function(eventArgs, activityId) {
        return {
            source: eventArgs.payload.request,
            target: eventArgs.payload.reviewer
        }
    }

})

const transferFromReviewerTransfer = RelationStateTransfer.create({
    triggerInteraction: transferReviewersInteraction,
    fromState: notReviewerState,
    toState: isReviewerState,
    handleType: 'computeSource',
    handle: async function(eventArgs, activityId) {
        return {
            source: eventArgs.payload.request,
            target: eventArgs.user
        }
    }

})

const reviewerRelationSM = RelationStateMachine.create({
    states: [notReviewerState, isReviewerState],
    transfers: [sendRequestTransfer, transferReviewerTransfer, addReviewerTransfer, transferFromReviewerTransfer],
    defaultState: notReviewerState
})


// 是否是 reviewer
const reviewerRelation = Relation.create({
    entity1: RequestEntity,
    targetName1: 'to',
    entity2: UserEntity,
    targetName2: 'request',
    relType: 'n:1',
    computedData:  reviewerRelationSM,
    properties: [Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computedData: MapInteractionToProperty.create({
            items: [
                MapInteractionToPropertyItem.create({
                    interaction: approveInteraction,
                    value: 'approved',
                    computeSource: function(event) {
                        return {
                            "source.id": event.payload.request.id,
                            "target.id": event.user.id
                        }
                    }
                }),
                MapInteractionToPropertyItem.create({
                    interaction: rejectInteraction,
                    value: 'rejected',
                    computeSource: function(event)  {
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
            relation: reviewerRelation,
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

export const data = JSON.parse(stringifyAllInstances())
removeAllInstance()
