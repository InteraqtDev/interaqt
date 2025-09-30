import {
    Action,
    Entity,
    Interaction,
    InteractionEventEntity,
    Property,
    StateNode,
    StateTransfer,
    StateMachine,
    Dictionary
} from 'interaqt';


export function createData() {

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

    const globalEnabledState = StateNode.create({
        name: 'enabled',
    })

    const globalDisabledState = StateNode.create({
        name: 'disabled',
    })

    const enableInteraction = Interaction.create({
        name: 'enable',
        action: Action.create({name: 'enable'}),
    })

    const disableInteraction = Interaction.create({
        name: 'disable',
        action: Action.create({name: 'disable'}),
    })

    const globalEnabledToDisabledTransfer = StateTransfer.create({
        trigger: {
            recordName: InteractionEventEntity.name,
            type: 'create',
            record: {
                interactionName: disableInteraction.name
            }
        },
        current: globalEnabledState,
        next: globalDisabledState,
    })

    const globalDisabledToEnabledTransfer = StateTransfer.create({
        trigger: {
            recordName: InteractionEventEntity.name,
            type: 'create',
            record: {
                interactionName: enableInteraction.name
            }
        },
        current: globalDisabledState,
        next: globalEnabledState,
    })

    const globalStateMachine = StateMachine.create({
        states: [globalEnabledState, globalDisabledState],
        transfers: [globalEnabledToDisabledTransfer, globalDisabledToEnabledTransfer],
        initialState: globalEnabledState
    })

    const dict = Dictionary.create({
        name: 'globalState',
        type: 'string',
        computation: globalStateMachine,
    })

    return {
        entities: [userEntity],
        relations: [],
        interactions: {enableInteraction, disableInteraction},
        dicts: [dict],
    }
}