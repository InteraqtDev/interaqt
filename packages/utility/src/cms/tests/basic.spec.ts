import {beforeEach, describe, expect, test} from 'vitest'
import {
    BoolExp,
    boolExpToAttributives,
    boolExpToConditions,
    Condition,
    Controller,
    Entity,
    InteractionEventArgs,
    KlassByName,
    MonoSystem,
    Property,
    PropertyTypes,
    Relation,
    removeAllInstance
} from '@interaqt/runtime'
import {createContent, createRequiredAttributive, createUniquePropertyAttributive} from "../index.js";
import {MatchAtom} from "@interaqt/storage";


describe('basic test', () => {

    beforeEach(async () => {
        removeAllInstance()
    })

    test('create content', async () => {
        let system: MonoSystem
        let controller: Controller

        const userEntity = Entity.create({
            name: 'User',
        })

        // supervisor relation
        const supervisorRelation = Relation.create({
            name: 'supervisor',
            source: userEntity,
            target: userEntity,
            sourceProperty: 'supervisor',
            targetProperty: 'subordinates',
            relType: 'n:1'
        })

        const titleProp = Property.create({
            name: 'title',
            type: PropertyTypes.String,
        })

        const bodyProp = Property.create({
            name: 'body',
            type: PropertyTypes.String,
        })

        const infoProp = Property.create({
            name: 'info',
            type: PropertyTypes.String,
        })

        const { contentEntity, ownerRelation, interactions} = createContent(
            'Post',
            [titleProp, bodyProp, infoProp],
            userEntity
        )

        system = new MonoSystem()
        system.conceptClass = KlassByName
        controller = new Controller(
            system,
            [contentEntity, userEntity],
            [ownerRelation, supervisorRelation],
            [],
            [interactions.create, interactions.update, interactions.delete, interactions.list, interactions.readOne],
            []
        )
        await controller.setup(true)

        const userARef = await system.storage.create('User', {name: 'A'})
        const userBRef = await system.storage.create('User', {name: 'B'})
        const userCRef = await system.storage.create('User', {name: 'C', subordinates: [userARef]})
        const userDRef = await system.storage.create('User', {name: 'D', subordinates: [userCRef]})


        // 限制
        // 1. title required & 不能重复
        // 2. body required
        const titleRequired = createRequiredAttributive('title')
        const titleUnique = createUniquePropertyAttributive('Post', 'title')
        const bodyRequired = createRequiredAttributive('body')

        interactions.create.payload!.items[0].attributives = boolExpToAttributives(BoolExp.and(titleRequired, titleUnique, bodyRequired))
        // title undefined
        const payloadWithoutTitle = {
            content: {
                body: 'b1',
            }
        }
        const errorRes1 = await controller.callInteraction(
            interactions.create.uuid,
            {user: userARef, payload: payloadWithoutTitle}
        )
        expect(errorRes1.error).toBeDefined()
        const payloadWithoutBody = {
            content: {
                title: 't1',
            }
        }
        const errorRes2 = await controller.callInteraction(
            interactions.create.uuid,
            {user: userARef, payload: payloadWithoutBody}
        )
        expect(errorRes2.error).toBeDefined()

        const payload = {
            content: {
                title: 't1',
                body: 'b1',
            }
        }
        const res1 = await controller.callInteraction(
            interactions.create.uuid,
            {user: userARef, payload: payload}
        )
        expect(res1.error).toBeUndefined()
        const contentId = res1.event!.args.payload!.content.id

        // 3. owner 只可以 update info
        const ownerUpdateInfoCondition = Condition.create({
            name: 'ownerUpdateInfo',
            content: async function(this: Controller, event: any) {
                const BoolExp = this.globals.BoolExp
                const match = BoolExp.atom({key: 'id', value: ['=', event.payload.content.id]}).and({
                    key: 'owner.id',
                    value: ['=', event.user.id]
                })
                const isOwner = await this.system.storage.findOne('Post', match)
                const allowKeys = ['id', 'info']
                const updateKeys = Object.keys(event.payload.content)
                return !!isOwner && updateKeys.every(key => allowKeys.includes(key))
            }
        })

        // 5. supervisor 可以 update title/body
        const supervisorUpdateTitleBodyCondition = Condition.create({
            name: 'supervisorUpdateTitleBody',
            content: async function(this: Controller, event: any) {
                const BoolExp = this.globals.BoolExp
                const match = BoolExp.atom({key: 'id', value: ['=', event.payload.content.id]})
                const content = await this.system.storage.findOne('Post', match, undefined, ['*', ['owner', {attributeQuery: ['*']}]])
                const contentOwner = content.owner
                const ownerWithSupervisors = await this.system.storage.findOne(
                    'User',
                    BoolExp.atom({key: 'id', value: ['=', contentOwner.id]}),
                    undefined,
                    ['*', ['supervisor', {
                        label: 'supervisor',
                        attributeQuery: ['*', ['supervisor', { goto: 'supervisor'}]]
                    }]]
                )

                const allSupervisors = []
                let root = ownerWithSupervisors
                while(root.supervisor) {
                    allSupervisors.push(root.supervisor)
                    root = root.supervisor
                }

                const isSupervisor = allSupervisors.some((supervisor: any) => supervisor.id === event.user.id)
                const allowKeys = ['id', 'title', 'body']
                const updateKeys = Object.keys(event.payload.content)
                return isSupervisor && updateKeys.every(key => allowKeys.includes(key))
            }
        })

        interactions.update.conditions = boolExpToConditions(BoolExp.or(ownerUpdateInfoCondition, supervisorUpdateTitleBodyCondition))
        // owner 错误修改了 title
        const errorRes3 = await controller.callInteraction(
            interactions.update.uuid,
            {user: userARef, payload: {content: {id: contentId, title: 't2'}}}
        )
        expect(errorRes3.error).toBeDefined()
        // 不是 owner 修改了 info
        const errorRes4 = await controller.callInteraction(
            interactions.update.uuid,
            {user: userBRef, payload: {content: {id: contentId, info: 'i2'}}}
        )
        expect(errorRes4.error).toBeDefined()

        // owner 自己修改了 info
        const res2 = await controller.callInteraction(
            interactions.update.uuid,
            {user: userARef, payload: {content: {id: contentId, info: 'i2'}}}
        )
        expect(res2.error).toBeUndefined()

        // supervisor c 修改了 body
        const res3 = await controller.callInteraction(
            interactions.update.uuid,
            {user: userCRef, payload: {content: {id: contentId, body: 'b2'}}}
        )

        // 重新获取 content 检查一下 info 和 body
        const content = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', contentId]}), undefined, ['*'])
        expect(content.body).toBe('b2')
        expect(content.info).toBe('i2')

        // 4. owner 可以 获取所有的字段.其他人只能获取 title。
        const ownerReadAllCondition = Condition.create({
            name: 'ownerReadAll',
            content: async function(this: Controller, event: any) {
                const BoolExp = this.globals.BoolExp
                if (!event.query?.match) return false
                const queryMatch = BoolExp.fromValue<MatchAtom>(event.query.match)
                const idMatch = queryMatch.find((data: MatchAtom) => data.key === 'id', [])
                if (!idMatch) return false
                const contentId = idMatch.value[1]

                const match = BoolExp.atom({key: 'id', value: ['=', contentId]}).and({
                    key: 'owner.id',
                    value: ['=', event.user.id]
                })
                const isOwner = await this.system.storage.findOne('Post', match)
                return !!isOwner
            }
        })

        const otherReadTitleCondition = Condition.create({
            name: 'otherReadTitle',
            content: async function(this: Controller, event: InteractionEventArgs) {
                const attributeQuery = event.query?.attributeQuery || []
                const allowKeys = ['title']
                return attributeQuery.every((key: string) => allowKeys.includes(key))
            }
        })

        interactions.readOne.conditions = boolExpToConditions(BoolExp.or(ownerReadAllCondition, otherReadTitleCondition))
        // 其他用户错误都了 body 等字段
        const contentMatch = BoolExp.atom({
            key: 'id',
            value: ['=', contentId]
        })
        const res4 = await controller.callInteraction(
            interactions.readOne.uuid,
            {user: userBRef, query: {match: contentMatch.toValue(), attributeQuery: ['body']}}
        )
        expect(res4.error).toBeDefined()

        // owner 可以读取所有字段
        const res5 = await controller.callInteraction(
            interactions.readOne.uuid,
            {user: userARef, query: {match: contentMatch.toValue()}}
        )
        expect(res5.error).toBeUndefined()


    })
})