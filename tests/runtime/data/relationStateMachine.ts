import { Entity, Action, Attributives, BoolAtomData, createUserRoleAttributive, Interaction, Payload, PayloadItem, Property, Relation, StateMachine, StateNode, StateTransfer } from "@shared";
import { OtherAttr } from "./roles";
import { RecordStateMachineHandle } from "@runtime";
import { MatchExp } from "@storage";

export function createData() {
    const UserEntity = Entity.create({
        name: 'User',
        properties: [Property.create({name: 'name', type: 'string'})]
    })
    
    const RequestEntity = Entity.create({
        name: 'Request',
        properties: [
            Property.create({name: 'title', type: 'string'})
        ]
    })

    const sendInteraction = Interaction.create({
        name: 'sendRequest',
        action: Action.create({name: 'sendRequest'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'to',
                    attributives: Attributives.create({
                        content: BoolAtomData.create({data: OtherAttr, type: 'atom'})
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

    // 转移
    const transferReviewersInteraction = Interaction.create({
        name: 'transferReviewer',
        userRef: createUserRoleAttributive({name: '', isRef: true}),
        action: Action.create({name: 'transferReviewer'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'reviewer',
                    attributives: Attributives.create({
                        content: BoolAtomData.create({data: OtherAttr, type: 'atom'})
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

    const isReviewerState = StateNode.create({
        name:'isReviewer',
        computeValue: () => ({})
    })

    const notReviewerState = StateNode.create({
        name:'notReviewer',
        computeValue: () => null
    })

    const sendRequestTransfer = StateTransfer.create({
        trigger: sendInteraction,
        current: notReviewerState,
        next: isReviewerState,
        computeTarget: async function(this: RecordStateMachineHandle, eventArgs) {
            // FIXME 它应该新建，它没有影响任何，这里应该如何表达？
            return {
                source: eventArgs.payload.request,
                target: eventArgs.payload.to
            }
        }
    })
    
    
    const transferToNotReviewerTransfer = StateTransfer.create({
        trigger: transferReviewersInteraction,
        current: isReviewerState,
        next: notReviewerState,
        computeTarget: async function(this: RecordStateMachineHandle,eventArgs) {
            const originRelation = await this.controller.system.storage.findOne(this.dataContext.id.name,
                MatchExp.atom({
                    key:'source.id',
                    value: ['=', eventArgs.payload.request.id]
                }),
                undefined,
                ['*']
            )
            return originRelation
        }
    })

    const transferToReviewerTransfer = StateTransfer.create({
        trigger: transferReviewersInteraction,
        current: notReviewerState,
        next: isReviewerState,
        computeTarget: async function(this: RecordStateMachineHandle,eventArgs) {
            return {
                source: eventArgs.payload.request,
                target: eventArgs.payload.reviewer
            }
        }
    })



    const reviewerRelationSM = StateMachine.create({
        states: [notReviewerState, isReviewerState],
        transfers: [sendRequestTransfer, transferToNotReviewerTransfer,transferToReviewerTransfer],
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
        })]
    })
        

    return {
        relations: [reviewerRelation],
        entities: [RequestEntity, UserEntity],
        interactions: {sendInteraction, transferReviewersInteraction}
    }
}
