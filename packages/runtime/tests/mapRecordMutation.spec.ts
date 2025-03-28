import {beforeEach, describe, expect, test} from "vitest";
import {Controller} from "../Controller.js";
import {MonoSystem} from "../MonoSystem.js";
import {
    Activity,
    BoolExp,
    createInstances,
    Entity,
    Interaction,
    KlassByName,
    Relation,
    removeAllInstance,
    State
} from '@';

// 里面有所有必须的数据？
type User = {
    id: string,
    roles: string[],
    [k:string]: any
}

describe('map interaction', () => {

    let system: MonoSystem
    let createPostUUID: string
    let updatePostUUID: string
    let controller: Controller

    let userAId: string
    let userBId: string
    let userCId: string
    beforeEach(async () => {
        removeAllInstance()
        const {data} = (await import('./data/activity/index.js'))
        createInstances(data)

        // createInstances(data)
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
            [...Entity.instances].filter(e => !(e as any).isRef),
            [...Relation.instances],
            [...Activity.instances],
            [...Interaction.instances],
            [...State.instances]
        )
        await controller.setup(true)
        createPostUUID = Interaction.instances!.find(i => i.name === 'createPost')!.uuid
        updatePostUUID = Interaction.instances!.find(i => i.name === 'updatePost')!.uuid

        const userARef = await system.storage.create('User', {name: 'A', age: 10})
        userAId = userARef.id

    })

    test('map interaction to relation', async () => {
        // 0. 验证初始数据
        const userA: User = {
            ...await system.storage.findOne('User', BoolExp.atom({
                key: 'id',
                value: ['=', userAId]
            }), undefined, ['*']),
            roles: ['user']
        }

        // 3. a 发起 sendFriendRequest
        const payload = {
            post : {
                title: 'test title',
                content: 'test content',
            }
        }
        const res1 = await controller.callInteraction(createPostUUID,  {user: userA, payload})
        expect(res1.error).toBeUndefined()

        const requests1 = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(requests1.length).toBe(1)
        expect(requests1[0].title).toBe(payload.post.title)
        expect(requests1[0].content).toBe(payload.post.content)


        const postId = requests1[0].id
        const payload2 = {
            post : {
                id: postId,
                // CAUTION 注意，在我们的测试数据库，特意设计了 title 不能改！这里是用来测试的。
                title: 'test title 2',
                content: 'test content 2',
            }
        }

        const res2 = await controller.callInteraction(updatePostUUID,  {user: userA, payload: payload2})
        expect(res2.error).toBeUndefined()
        const posts = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(posts.length).toBe(1)
        // CAUTION 注意，在我们的测试数据库，特意设计了 title 不能改！
        expect(posts[0].title).toBe(payload.post.title)
        expect(posts[0].content).toBe(payload2.post.content)

        const revisions = await controller.system.storage.find('PostRevision', undefined, undefined, ['*', ['current', {attributeQuery: ['*']}]])
        expect(revisions.length).toBe(1)
        expect(revisions[0].current.id).toBe(postId)
        expect(revisions[0].content).toBe(payload.post.content)

        const payload3 = {
            post : {
                id: postId,
                content: 'test content 3',
            }
        }

        const res3 = await controller.callInteraction(updatePostUUID,  {user: userA, payload: payload3})
        const revisions3 = await controller.system.storage.find('PostRevision', undefined, undefined, ['*', ['current', {attributeQuery: ['*']}]])
        expect(revisions3.length).toBe(2)
        expect(revisions3[1].current.id).toBe(postId)
        expect(revisions3[1].content).toBe(payload2.post.content)
    })
})