import {describe, test, expect, beforeEach} from "vitest";
import {Controller} from "../Controller";
import {ActivityCall, ActivityGroupNode} from "../AcitivityCall";
import {MonoSystem} from "../MonoSystem";
import {createInstances, getInstance, KlassByName, KlassInstance, removeAllInstance, stringifyAllInstances} from "@shared/createClass";
import { Activity, Interaction } from "@shared/activity/Activity";
import { Entity, Relation } from "@shared/entity/Entity";
import { State } from "@shared/state/State";
import '../computedDataHandles/index'
import {MatchExp} from '@storage/erstorage/MatchExp'

// 里面有所有必须的数据？
type User = {
    id: string,
    roles: string[],
    [k:string]: any
}

describe('map activity', () => {

    let system: MonoSystem
    let sendRequestUUID: string
    let controller: Controller

    let userAId: string
    let userBId: string
    beforeEach(async () => {
        removeAllInstance()
        const {data} = (await import('./data/leaveRequest'))
        createInstances(data, false)

        // createInstances(data, false)
        /**
         * 当前的格式为:
         * New && Other Admin as A
         * sendRequest
         * to: Other Admin isRef
         * message: Message
         */


        system = new MonoSystem()
        system.conceptClass = KlassByName
        controller = new Controller(
            system,
            [...Entity.instances].filter(e => !e.isRef),
            [...Relation.instances],
            [...Activity.instances],
            [...Interaction.instances],
            [...State.instances]
        )
        await controller.setup()
        sendRequestUUID = Interaction.instances!.find(i => i.name === 'sendRequest')!.uuid

        const userARef = await system.storage.create('User', {name: 'A', age: 10})
        userAId = userARef.id

        const userBRef = await system.storage.create('User', {name: 'B', age: 12})
        userBId = userBRef.id
    })

    test('map interaction to relation', async () => {
        // 0. 验证初始数据
        const userA: User = {
            ...await system.storage.findOne('User', MatchExp.atom({
                key: 'id',
                value: ['=', userAId]
            }), undefined, ['*']),
            roles: ['user']
        }

        const userB: User = {
            ...await system.storage.findOne('User', MatchExp.atom({
                key: 'id',
                value: ['=', userBId]
            }), undefined, ['*']),
            roles: ['user']
        }

        // 3. a 发起 sendFriendRequest
        const payload = {
            to: userB,
            request:{
                reason: 'let use make friend'
            }
        }
        const res1 = await controller.callInteraction(sendRequestUUID,  {user: userA, payload})
        expect(res1.error).toBeUndefined()

        const requests1 = await controller.system.storage.find('Request', undefined, undefined, ['*', ['from', {attributeQuery: ["*"]}], ['to', {attributeQuery: ["*"]}]])
        expect(requests1.length).toBe(1)
        expect(requests1[0].to.id).toBe(userBId)
        expect(requests1[0].from.id).toBe(userAId)
        console.log(requests1)

    })
})