import {afterEach, beforeEach, describe, expect, test} from "vitest";
import {createCommonData} from "./data/common";
import {DBSetup} from "../src/erstorage/Setup.js";
import {SQLiteDB} from '../../runtime/src/SQLite'
import {EntityToTableMap} from "../src/erstorage/EntityToTableMap.js";
import {MatchExp} from "../src/erstorage/MatchExp.js";
import {EntityQueryHandle} from "../src/erstorage/EntityQueryHandle.js";
import {RecursiveContext} from "../src/erstorage/RecordQueryAgent.js";
import TestLogger from "./testLogger.js";

describe('group tree', () => {
    let db: SQLiteDB
    let setup: DBSetup
    let entityQueryHandle: EntityQueryHandle
    let logger

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        logger = new TestLogger('', true)

        // @ts-ignore
        db = new SQLiteDB(':memory:', {logger})
        await db.open()

        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })


    test("check if ancestor group", async () => {
        const group1 = await entityQueryHandle.create('Department', {
            name: 'group1'
        })
        const group2 = await entityQueryHandle.create('Department', {
            name: 'group2',
            parent: group1
        })
        const group3 = await entityQueryHandle.create('Department', {
            name: 'group3',
            parent: group2
        })

        const group4 = await entityQueryHandle.create('Department', {
            name: 'group4',
            parent: group3
        })

        const group41 = await entityQueryHandle.create('Department', {
            name: 'group41',
            parent: group3
        })

        const group5 = await entityQueryHandle.create('Department', {
            name: 'group5',
            parent: group4
        })

        const group51 = await entityQueryHandle.create('Department', {
            name: 'group51',
            parent: group4
        })

        const exit = async (context: RecursiveContext) => {}

        const foundGroup = (await entityQueryHandle.find('Department',
            MatchExp.atom({key: 'name', value: ['=', 'group1']}),
            undefined,
            ['*', ['children', {
                label: 'childDept',
                attributeQuery: ['*', ['children', { goto: 'childDept', exit}]]
            }]],
        ))[0]


        expect(foundGroup.id).toBe(group1.id)
        expect(foundGroup.children[0].id).toBe(group2.id)
        expect(foundGroup.children[0].children[0].id).toBe(group3.id)
        expect(foundGroup.children[0].children[0].children[0].id).toBe(group4.id)
        expect(foundGroup.children[0].children[0].children[1].id).toBe(group41.id)
        expect(foundGroup.children[0].children[0].children[0].children[0].id).toBe(group5.id)
        expect(foundGroup.children[0].children[0].children[0].children[1].id).toBe(group51.id)


        const foundPath = await entityQueryHandle.findPath('Department','children', group1.id, group5.id)

        expect(foundPath!.length).toBe(5)
        expect(foundPath![0]!.id).toBe(group1.id)
        expect(foundPath![4].id).toBe(group5.id)
    })

})




