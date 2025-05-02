import {
    Action,
    Entity,
    Interaction, Property,
    StateNode,
    StateTransfer,
    StateMachine,
    Dictionary
} from '@';


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
        trigger: disableInteraction,
        current: globalEnabledState,
        next: globalDisabledState,
    })

    const globalDisabledToEnabledTransfer = StateTransfer.create({
        trigger: enableInteraction,
        current: globalDisabledState,
        next: globalEnabledState,
    })

    const globalStateMachine = StateMachine.create({
        states: [globalEnabledState, globalDisabledState],
        transfers: [globalEnabledToDisabledTransfer, globalDisabledToEnabledTransfer],
        defaultState: globalEnabledState
    })

    const dict = Dictionary.create({
        name: 'globalState',
        type: 'string',
        computedData: globalStateMachine,
    })

    return {
        entities: [userEntity],
        relations: [],
        interactions: {enableInteraction, disableInteraction},
        dicts: [dict],
    }
}