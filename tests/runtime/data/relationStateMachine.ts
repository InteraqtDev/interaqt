import { Entity, Action, BoolExp, boolExpToAttributives, createUserRoleAttributive, Interaction, Payload, PayloadItem, Property, Relation, StateMachine, StateNode, StateTransfer, Transform, InteractionEventEntity, Controller, HardDeletionProperty, DELETED_STATE, NON_DELETED_STATE } from "interaqt";
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
                    base: RequestEntity,
                    isRef: true
                })
            ]
        })
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
            }),
            HardDeletionProperty.create()
        ],
        // 使用 Transform 从交互事件创建关系
        computation: Transform.create({
            record: InteractionEventEntity,
            callback: async function(this: Controller, eventArgs: any) {
                const MatchExp = this.globals.MatchExp
                
                // 从 sendRequest 创建初始关系
                if (eventArgs.interactionName === sendInteraction.name) {
                    const request = await this.system.storage.findOne(RequestEntity.name, MatchExp.atom({
                        key: 'interaction.id',
                        value: ['=', eventArgs.id]
                    }), undefined, ['id'])
                    if (request) {
                        return {
                            source: request,
                            target: eventArgs.payload.to
                        }
                    }
                }
                
                // 从 transferReviewer 创建新关系
                if (eventArgs.interactionName === transferReviewersInteraction.name) {
                    const reviewer = eventArgs.payload.reviewer
                    // 确保使用正确的对象格式
                    const targetUser = reviewer.id ? { id: reviewer.id } : reviewer
                    return {
                        source: eventArgs.payload.request,
                        target: targetUser
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
                trigger: transferReviewersInteraction,
                current: NON_DELETED_STATE,
                next: DELETED_STATE,
                computeTarget: async function(this: Controller, eventArgs: any) {
                    const MatchExp = this.globals.MatchExp
                    // 转移时删除旧的关系
                    const originRelation = await this.system.storage.findOne(
                        reviewerRelation.name!,
                        MatchExp.atom({
                            key:'source.id',
                            value: ['=', eventArgs.payload.request.id]
                        }).and({
                            key: 'target.id',
                            value: ['!=', eventArgs.payload.reviewer.id]
                        }),
                        undefined,
                        ['id']
                    )
                    return originRelation ? { id: originRelation.id } : undefined
                }
            })
        ],
        defaultState: NON_DELETED_STATE
    })
        

    return {
        relations: [requestInteractionRelation, reviewerRelation],
        entities: [RequestEntity, UserEntity],
        interactions: {sendInteraction, transferReviewersInteraction}
    }
}
