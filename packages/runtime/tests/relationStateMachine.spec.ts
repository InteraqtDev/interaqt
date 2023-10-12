import {beforeEach, describe} from "bun:test";
import {RelationStateMachineHandle} from "../incrementalComputationHandles/RelationStateMachine";
import {MemorySystem} from "../MemorySystem";
import {createInstances, KlassByName, removeAllInstance} from "../../shared/createClass";
import {Controller} from "../Controller";
import {Entity, Relation} from "../../shared/entity/Entity";
import {Activity, Interaction} from "../../shared/activity/Activity";

describe('relation state machine', () => {

    let system
    let controller


    beforeEach(async () => {
        removeAllInstance()
        const { data }  = (await import('./data/activity'))
        createInstances(data, false)
        system = new MemorySystem()
        system.conceptClass = KlassByName
        controller = new Controller(system, [...Entity.instances].filter(e => !e.isRef), [...Relation.instances], [...Activity.instances], [...Interaction.instances])
        await controller.setup()
    })

    // FIXME
    test('from empty to state', async () => {
    })

    test('from state to state with different data', async () => {

    })

    test('from state to empty', async () => {

    })

})