import { Entity, Action, BoolExp, boolExpToAttributives, createUserRoleAttributive, Interaction, Payload, PayloadItem, Property, Relation, StateMachine, StateNode, StateTransfer, Transform, InteractionEventEntity, Controller, NON_EXIST_STATE } from "interaqt";
import { OtherAttr } from "./roles";

export function createData() {
    const UserEntity = Entity.create({
        name: 'User',
        properties: [Property.create({name: 'name', type: 'string'})]
    })
    
    

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
                    name: 'title',
                })
            ]
        })
    })

    const RequestEntity = Entity.create({
        name: 'Request',
        properties: [
            Property.create({name: 'title', type: 'string'})
        ],
        computation: Transform.create({
            record: InteractionEventEntity,
            callback: async function(this: Controller, event: any) {
                if (event.interactionName === sendInteraction.name) {
                    return {
                        title: event.payload.title,
                        interaction: {
                            id: event.id
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

    const isReviewerState = StateNode.create({
        name:'isReviewer',
        computeValue: () => ({})
    })


    const sendRequestTransfer = StateTransfer.create({
        trigger: sendInteraction,
        current: NON_EXIST_STATE,
        next: isReviewerState,
        computeTarget: async function(this: Controller, eventArgs: any) {
            const MatchExp = this.globals.MatchExp
            const request = await this.system.storage.findOne(RequestEntity.name, MatchExp.atom({
                key: 'interaction.id',
                value: ['=', eventArgs.id]
            }), undefined, ['id'])
            return {
                source: request,
                target: eventArgs.payload.to
            }
        }
    })
    
    
    const transferToNotReviewerTransfer = StateTransfer.create({
        trigger: transferReviewersInteraction,
        current: isReviewerState,
        next: NON_EXIST_STATE,
        computeTarget: async function(this: Controller,eventArgs: any) {
            const MatchExp = this.globals.MatchExp
            const originRelation = await this.system.storage.findOne(reviewerRelation.name!,
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
        current: NON_EXIST_STATE,
        next: isReviewerState,
        computeTarget: async function(this: Controller,eventArgs: any) {
            return {
                source: eventArgs.payload.request,
                target: eventArgs.payload.reviewer
            }
        }
    })



    const reviewerRelationSM = StateMachine.create({
        states: [NON_EXIST_STATE, isReviewerState],
        transfers: [sendRequestTransfer, transferToNotReviewerTransfer,transferToReviewerTransfer],
        defaultState: NON_EXIST_STATE
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
        })]
    })
        

    return {
        relations: [requestInteractionRelation, reviewerRelation],
        entities: [RequestEntity, UserEntity],
        interactions: {sendInteraction, transferReviewersInteraction}
    }
}
