import {expect, test, describe, afterEach, beforeAll, beforeEach} from "vitest";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/SQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import {MatchExp} from "../erstorage/MatchExp";
import {EntityQueryHandle} from "../erstorage/EntityQueryHandle";
import {MutationEvent} from "../erstorage/RecordQueryAgent";
import {LINK_SYMBOL} from "../erstorage/RecordQuery";


describe('one to one', () => {
    let db: SQLiteDB
    let setup
    let entityQueryHandle: EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB()
        await db.open()
        setup = new DBSetup(entities, relations, db, ['Profile.owner'])
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('create one to one data:create self on combined table', async () => {
        const events: MutationEvent[] = []
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12}, events)
        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age']
        )

        expect(findUser).toMatchObject({
            name: 'a1',
            age: 12,
        })

        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User",
                record: {
                    name: "a1",
                    age: 12,
                    id: userA.id
                }
            }
        ])
    })


    test('create one to one data:create with new related on combined table', async () => {
        const events: MutationEvent[] = []
        const userA = await entityQueryHandle.create('User', {
            name:'a1',
            age:12,
            profile: {
                title: 'f1'
            }
        }, events)
        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['profile', {attributeQuery: ['title']}]]
        )

        expect(findUser).toMatchObject({
            name: 'a1',
            age: 12,
            profile: {
                title: 'f1'
            }
        })
        console.log(events)
        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "Profile",
                record: {
                    title: "f1",
                    id: userA.profile.id,
                }
            }, {
                type: "create",
                recordName: "Profile_owner_profile_User",
                record: {
                    id: userA.profile[LINK_SYMBOL].id
                }
            }, {
                type: "create",
                recordName: "User",
                record: {
                    name: "a1",
                    age: 12,
                    id: userA.id,
                }
            }
        ])
    })


    test('create one to one data:create with existing related on combined table', async () => {
        const profileA = await entityQueryHandle.create('Profile', {title:'f1'})
        const events: MutationEvent[] = []
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12, profile: profileA}, events)

        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['profile', {attributeQuery: ['title']}]]
        )

        expect(findUser.name).toBe('a1')
        expect(findUser.profile.id).toBe(profileA.id)
        expect(findUser.profile.title).toBe('f1')
        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User",
                record: {
                    name: "a1",
                    age: 12,
                    id: 1
                }
            }, {
                type: "create",
                recordName: "Profile_owner_profile_User",
                record: {
                    id: userA.profile[LINK_SYMBOL]?.id
                }
            }
        ])
    })

    test('delete data:delete self with non same row data', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})
        const profileA = await entityQueryHandle.create('Profile', {title:'f1'})

        const events: MutationEvent[] = []
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            events)

        const findUsers = await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name']
        )

        expect(findUsers.length).toBe(0)

        const findProfile = await entityQueryHandle.findOne('Profile',
            MatchExp.atom({ key: 'id', value: ['=', profileA.id]}),
            {},
            ['title']
        )

        expect(findProfile).toMatchObject({
            title: 'f1'
        })

        expect(events).toMatchObject([
            {
                type: "delete",
                recordName: "User",
                record: {
                    name: "a1",
                    age: 12,
                    id: userA.id,
                }
            }
        ])
    })


    test('delete data:delete self with same row reliance', async () => {
        const userA = await entityQueryHandle.create('User', {
            name:'a1',
            age:12,
            profile: {
                title: 'f1'
            },
            item: {
                itemName: 'item1'
            }
        })

        const events: MutationEvent[] = []
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            events
        )


        const findProfile = await entityQueryHandle.findOne('Profile',
            MatchExp.atom({ key: 'title', value: ['=', 'f1']}),
            {},
            ['title', ['owner', {attributeQuery: ['id']}]]
        )

        expect(findProfile).toMatchObject({
            title: 'f1',
            owner: {
                id: null
            }
        })

        const findItems = await entityQueryHandle.find('Item',
            undefined, {},
            ['itemName']
        )

        // reliance 会被连带删除
        expect(findItems.length).toBe(0)

        expect(events).toMatchObject([
            {
                type: "delete",
                recordName: "User",
                record: {
                    name: "a1",
                    age: 12,
                    id: userA.id,
                }
            }, {
                type: "delete",
                recordName: "User_item_owner_Item",
                record: {
                    id: userA.item[LINK_SYMBOL].id
                }
            }, {
                type: "delete",
                recordName: "Item",
                record: {
                    itemName: "item1",
                    id: userA.item.id,
                }
            }
        ])
    })


    test('update data:update self with new related on combined table', async () => {
        const userA = await entityQueryHandle.create(
            'User', {
                name:'a1',
                age:12,
                profile: {
                    title: 'f1'
                }
            })

        const events: MutationEvent[] = []
        const [updatedUser] = await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            { profile: { title: 'f2'} },
            events
        )

        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['profile', {attributeQuery: ['title']}]]
        )


        expect(findUser.name).toBe('a1')
        expect(findUser.profile.title).toBe('f2')

        const findProfiles = await entityQueryHandle.find('Profile',
            MatchExp.atom({ key: 'title', value: ['=', 'f2']}),
            {},
            ['title', ['owner', {attributeQuery: ['name']}]]
        )
        expect(findProfiles.length).toBe(1)
        expect(findProfiles[0]).toMatchObject({
            title: 'f2',
            owner: {
                name: 'a1'
            }
        })


        // f1 必须还存在，我们只是断开了联系。
        const findProfiles2 = await entityQueryHandle.find('Profile',
            MatchExp.atom({ key: 'title', value: ['=', 'f1']}),
            {},
            ['title', ['owner', {attributeQuery: ['name']}]]
        )

        expect(findProfiles2.length).toBe(1)
        expect(findProfiles2[0]).toMatchObject({
            title: 'f1',
            owner: {
                id: null,
                name: null,
            }
        })

        expect(events).toMatchObject([
            {
                type: "delete",
                recordName: "Profile_owner_profile_User",
                record: {
                    id: userA.profile[LINK_SYMBOL].id
                }
            }, {
                type: "create",
                recordName: "Profile",
                record: {
                    title: "f2",
                    id: 3,
                }
            }, {
                type: "create",
                recordName: "Profile_owner_profile_User",
                record: {
                    id: 2
                }
            }
        ])
    })


    test('update data:update with existing related on combined table', async () => {
        const userA = await entityQueryHandle.create(
            'User', {
                name:'a1',
                age:12,
                profile: {
                    title: 'f1'
                }
            })
        const profileA = await entityQueryHandle.create('Profile', {title:'f2'})

        const events: MutationEvent[] = []
        // 更新 profile 为 f2
        const [updatedUser] = await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            { profile: profileA },
            events
        )

        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['profile', {attributeQuery: ['title']}]]
        )

        expect(findUser.name).toBe('a1')
        expect(findUser.profile.id).toBe(profileA.id)
        expect(findUser.profile.title).toBe('f2')

        const findProfiles = await entityQueryHandle.find('Profile',
            MatchExp.atom({ key: 'title', value: ['=', 'f2']}),
            {},
            ['title', ['owner', {attributeQuery: ['name']}]]
        )
        // f2 应该仍然只有一个，是被移动了的
        expect(findProfiles.length).toBe(1)
        expect(findProfiles[0]).toMatchObject({
            title: 'f2',
            owner: {
                name: 'a1'
            }
        })


        const findProfiles2 = await entityQueryHandle.find('Profile',
            MatchExp.atom({ key: 'title', value: ['=', 'f1']}),
            {},
            ['title', ['owner', {attributeQuery: ['name']}]]
        )

        expect(findProfiles2.length).toBe(1)
        expect(findProfiles2[0]).toMatchObject({
            title: 'f1',
            owner: {
                id: null,
                name: null,
            }
        })

        expect(events).toMatchObject([
            {
                type: "delete",
                recordName: "Profile_owner_profile_User",
                record: {
                    id: userA.profile[LINK_SYMBOL].id
                }
            }, {
                type: "create",
                recordName: "Profile_owner_profile_User",
                record: {
                    id: updatedUser.profile[LINK_SYMBOL].id
                }
            }
        ])

    })
})




