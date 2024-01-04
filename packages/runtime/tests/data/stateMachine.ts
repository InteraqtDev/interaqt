import {
    Action,
    Entity,
    Interaction,
    InteractionEventArgs,
    Payload,
    PayloadItem,
    Property,
    StateNode,
    StateTransfer,
    StateMachine
} from "@interaqt/runtime";

const statusProperty = Property.create({
    name: 'status',
    type: 'string',
})

export const postEntity = Entity.create({
    name: 'Post',
    properties: [
        statusProperty
    ]
})

export const userEntity = Entity.create({
    name: 'User',
    properties: [
        Property.create({
            name: 'name',
            type: 'string',
            collection: false,
        })
    ]
})

export const draftInteraction = Interaction.create({
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

export const finalizeInteraction = Interaction.create({
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



export const publishInteraction = Interaction.create({
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

export const withdrawInteraction = Interaction.create({
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
    value: 'draft',
})

const normalState = StateNode.create({
    value: 'normal',
})


const publishedState = StateNode.create({
    value: 'published',
})

const draftToNormalTransfer = StateTransfer.create({
    triggerInteraction: finalizeInteraction,
    fromState: draftState,
    toState: normalState,
    handleType: 'computeTarget',
    handle: (event: InteractionEventArgs) => {
        return {id: event.payload!.content.id}
    }
})

const normalToDraftTransfer = StateTransfer.create({
    triggerInteraction: draftInteraction,
    fromState: normalState,
    toState: draftState,
    handleType: 'computeTarget',
    handle: (event: InteractionEventArgs) => {
        return {id: event.payload!.content.id}
    }
})

const normalToPublishedTransfer = StateTransfer.create({
    triggerInteraction: publishInteraction,
    fromState: normalState,
    toState: publishedState,
    handleType: 'computeTarget',
    handle: (event: InteractionEventArgs) => {
        return {id: event.payload!.content.id}
    }
})

const publishedToNormalTransfer = StateTransfer.create({
    triggerInteraction: withdrawInteraction,
    fromState: publishedState,
    toState: normalState,
    handleType: 'computeTarget',
    handle: (event: InteractionEventArgs) => {
        return {id: event.payload!.content.id}
    }
})

const stateMachine = StateMachine.create({
    states: [draftState, normalState, publishedState],
    transfers: [draftToNormalTransfer, normalToDraftTransfer, normalToPublishedTransfer, publishedToNormalTransfer],
    defaultState: normalState
})

statusProperty.computedData = stateMachine

