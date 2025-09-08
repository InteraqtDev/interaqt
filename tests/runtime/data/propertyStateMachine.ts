import {
    Action,
    Entity,
    Interaction,
    InteractionEventEntity,
    Payload,
    PayloadItem,
    Property,
    StateNode,
    StateTransfer,
    StateMachine
} from 'interaqt';


export function createData() {

    const statusProperty = Property.create({
        name: 'status',
        type: 'string',
    })

     const postEntity = Entity.create({
        name: 'Post',
        properties: [
            statusProperty,
            Property.create({
                name: 'title',
                type: 'string',
                collection: false,
            })
        ]
    })

     const userEntity = Entity.create({
        name: 'User',
        properties: [
            Property.create({
                name: 'name',
                type: 'string',
                collection: false,
            })
        ]
    })

     const draftInteraction = Interaction.create({
        name: 'draft',
        action: Action.create({name: 'draft'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'content',
                    isRef:true,
                    base: postEntity
                })
            ]
        })
    })

     const finalizeInteraction = Interaction.create({
        name: 'finalize',
        action: Action.create({name: 'finalize'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'content',
                    isRef:true,
                    base: postEntity
                })
            ]
        })
    })



     const publishInteraction = Interaction.create({
        name: 'publish',
        action: Action.create({name: 'publish'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'content',
                    isRef:true,
                    base: postEntity
                })
            ]
        })
    })

     const withdrawInteraction = Interaction.create({
        name: 'withdraw',
        action: Action.create({name: 'withdraw'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'content',
                    isRef:true,
                    base: postEntity
                })
            ]
        })
    })

    const draftState = StateNode.create({
        name: 'draft',
    })

    const normalState = StateNode.create({
        name: 'normal',
    })


    const publishedState = StateNode.create({
        name: 'published',
    })

    const draftToNormalTransfer = StateTransfer.create({
        trigger: {
            recordName: InteractionEventEntity.name,
            type: 'create',
            record: {
                interactionName: finalizeInteraction.name
            }
        },
        current: draftState,
        next: normalState,
        computeTarget: (mutationEvent: any) => {
            return {id: mutationEvent.record.payload!.content.id}
        }
    })

    const normalToDraftTransfer = StateTransfer.create({
        trigger: {
            recordName: InteractionEventEntity.name,
            type: 'create',
            record: {
                interactionName: draftInteraction.name
            }
        },
        current: normalState,
        next: draftState,
        computeTarget: (mutationEvent: any) => {
            return {id: mutationEvent.record.payload!.content.id}
        }
    })

    const normalToPublishedTransfer = StateTransfer.create({
        trigger: {
            recordName: InteractionEventEntity.name,
            type: 'create',
            record: {
                interactionName: publishInteraction.name
            }
        },
        current: normalState,
        next: publishedState,
        computeTarget: (mutationEvent: any) => {
            return {id: mutationEvent.record.payload!.content.id}
        }
    })

    const publishedToNormalTransfer = StateTransfer.create({
        trigger: {
            recordName: InteractionEventEntity.name,
            type: 'create',
            record: {
                interactionName: withdrawInteraction.name
            }
        },
        current: publishedState,
        next: normalState,
        computeTarget: (mutationEvent: any) => {
            return {id: mutationEvent.record.payload!.content.id}
        }
    })

    const stateMachine = StateMachine.create({
        states: [draftState, normalState, publishedState],
        transfers: [draftToNormalTransfer, normalToDraftTransfer, normalToPublishedTransfer, publishedToNormalTransfer],
        defaultState: normalState
    })

    statusProperty.computation = stateMachine

    return {
        entities: [postEntity, userEntity],
        relations: [],
        interactions: {draftInteraction, finalizeInteraction, publishInteraction, withdrawInteraction},
    }
}