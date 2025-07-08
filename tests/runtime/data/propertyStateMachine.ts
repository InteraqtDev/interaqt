import {
    Action,
    Entity,
    Interaction,
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
        trigger: finalizeInteraction,
        current: draftState,
        next: normalState,
        computeTarget: (event: any) => {
            return {id: event.payload!.content.id}
        }
    })

    const normalToDraftTransfer = StateTransfer.create({
        trigger: draftInteraction,
        current: normalState,
        next: draftState,
        computeTarget: (event: any) => {
            return {id: event.payload!.content.id}
        }
    })

    const normalToPublishedTransfer = StateTransfer.create({
        trigger: publishInteraction,
        current: normalState,
        next: publishedState,
        computeTarget: (event: any) => {
            return {id: event.payload!.content.id}
        }
    })

    const publishedToNormalTransfer = StateTransfer.create({
        trigger: withdrawInteraction,
        current: publishedState,
        next: normalState,
        computeTarget: (event: any) => {
            return {id: event.payload!.content.id}
        }
    })

    const stateMachine = StateMachine.create({
        states: [draftState, normalState, publishedState],
        transfers: [draftToNormalTransfer, normalToDraftTransfer, normalToPublishedTransfer, publishedToNormalTransfer],
        defaultState: normalState
    })

    statusProperty.computation = stateMachine
    statusProperty.defaultValue = () =>stateMachine.defaultState.name

    return {
        entities: [postEntity, userEntity],
        relations: [],
        interactions: {draftInteraction, finalizeInteraction, publishInteraction, withdrawInteraction},
    }
}