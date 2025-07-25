import {expect, test, describe} from "vitest";
import {existsSync, unlinkSync} from 'fs'
import {DBSetup,RecordQueryAgent,EntityToTableMap,MatchExp,RecordQuery} from "@storage";
import { PGLiteDB, SQLiteDB } from 'interaqt'
import {createCommonData} from "./data/common";

const { entities, relations } = createCommonData()


describe("db setup", () => {    
    test('validate 1:1 relation map', async () => {
        const db = new PGLiteDB()
        await db.open()
        // Profile & User
        const clues = [
            'Profile.owner',
        ]
        const setup = new DBSetup(entities, relations, db, clues);
        // console.log(JSON.stringify(setup.map, null, 4))
        // 应该是 三表 合一
        expect(setup.map.records.User).toBeDefined()
        expect(setup.map.records.Profile).toBeDefined()
        expect(setup.map.records.User.table).toBe(setup.map.records.Profile.table)
        expect(setup.map.records.User.attributes.profile).toMatchObject({
            type: 'id',
            isRecord: true,
            relType: ['1', '1'],
            recordName: 'Profile',
            linkName: 'Profile_owner_profile_User',
            isSource:false,
        })
        expect(setup.map.records.User.attributes.profile.field).toBeUndefined()

        // 三表合一的 reliance 有 reliance 标记
        expect(setup.map.links.User_item_owner_Item).toMatchObject({
            table: 'Profile_User_Item',
            mergedTo: 'combined',
            relType: ['1','1'],
            sourceRecord: 'User',
            sourceProperty: 'item',
            targetRecord: 'Item',
            targetProperty: 'owner',
            recordName: 'User_item_owner_Item',
            isTargetReliance: true
        })

        expect(setup.map.records.User.attributes.item).toMatchObject({
            type: 'id',
            isRecord: true,
            relType: ['1', '1'],
            recordName: 'Item',
            linkName: 'User_item_owner_Item',
            isSource:true,
            isReliance: true
        })

        expect(setup.map.records.Profile.attributes.owner).toMatchObject({
            type: 'id',
            isRecord: true,
            relType: ['1', '1'],
            recordName: 'User',
            linkName: 'Profile_owner_profile_User',
            isSource:true,
        })
        expect(setup.map.records.Profile.attributes.owner.field).toBeUndefined()

        expect(setup.map.links.Profile_owner_profile_User).toMatchObject({
            relType: ['1', '1'],
            sourceRecord: 'Profile',
            sourceProperty: 'owner',
            targetRecord: 'User',
            targetProperty: 'profile',
            mergedTo: 'combined',
        })




        // 关系实体化后的字段
        expect(setup.map.records.Profile_owner_profile_User).toMatchObject({
            // 应该在关系表和实体表合并的时候修改过了。
            table: setup.map.records.Profile.table,
            isRelation:true,
        })
        // Check that id field exists but don't check exact name
        expect(setup.map.records.Profile_owner_profile_User.attributes.id).toBeDefined()
        expect(setup.map.records.Profile_owner_profile_User.attributes.id.type).toBe("id")
        expect(setup.map.records.Profile_owner_profile_User.attributes.id.field).toBeDefined()
        
        expect(setup.map.records.Profile_owner_profile_User.attributes).toMatchObject({
            source: {
                isRecord: true,
                relType: ['1', '1'],
                recordName: 'Profile',
                linkName: 'Profile_owner_profile_User_source',
                isSource:true,
                type: 'id',
            },
            target: {
                isRecord: true,
                relType: ['1', '1'],
                recordName: 'User',
                isSource:true,
                linkName: 'Profile_owner_profile_User_target',
                type: 'id',
            }
        })
        // 三表合一没有 field
        expect(setup.map.records.Profile_owner_profile_User.attributes.source.field).toBeUndefined()
        expect(setup.map.records.Profile_owner_profile_User.attributes.target.field).toBeUndefined()

        // 虚拟关系表
        expect(setup.map.links.Profile_owner_profile_User_source).toMatchObject({
            isSourceRelation: true,
            relType: ['1', '1'],
            sourceRecord: 'Profile_owner_profile_User',
            sourceProperty: 'source',
            targetRecord: 'Profile',
            targetProperty: undefined,
            mergedTo: 'combined',
        })

        expect(setup.map.links.Profile_owner_profile_User_target).toMatchObject({
            isSourceRelation: true,
            relType: ['1', '1'],
            sourceRecord: 'Profile_owner_profile_User',
            sourceProperty: 'target',
            targetRecord: 'User',
            targetProperty: undefined,
            mergedTo: 'combined',
        })



    })

    test('validate n:1 relation map', async () => {
        const clues = [
            'Profile.owner',
        ]
        const db = new SQLiteDB()
        await db.open()
        // File & User
        const setup = new DBSetup(entities, relations, db, clues);
        expect(setup.map.records.User).toBeDefined()
        expect(setup.map.records.File).toBeDefined()
        expect(setup.map.records.User.table).not.toBe(setup.map.records.File.table)
        expect(setup.map.records.User.attributes.file).toMatchObject({
            isRecord: true,
            relType: ['1', 'n'],
            recordName: 'File',
            linkName: 'File_owner_file_User',
            isSource:false,
        })
        expect(setup.map.records.User.attributes.file.field).toBeUndefined()


        expect(setup.map.records.File.attributes.owner).toMatchObject({
            type:'id',
            isRecord: true,
            relType: ['n', '1'],
            recordName: 'User',
            linkName: 'File_owner_file_User',
            isSource:true,
        })

        expect(setup.map.records.File_owner_file_User.attributes.source.field).toBeUndefined()
        // Check that target field exists but don't check exact name - it's now shortened
        expect(setup.map.records.File_owner_file_User.attributes.target.field).toBeDefined()
        expect(typeof setup.map.records.File_owner_file_User.attributes.target.field).toBe('string')

        expect(setup.map.links.File_owner_file_User).toMatchObject({
            relType: ['n', '1'],
            sourceRecord: 'File',
            sourceProperty: 'owner',
            targetRecord: 'User',
            targetProperty: 'file',
            mergedTo: 'source',
        })
        // 虚拟关系表
        expect(setup.map.links.File_owner_file_User_source).toMatchObject({
            relType: ['1', '1'],
            isSourceRelation:true,
            sourceRecord: 'File_owner_file_User',
            sourceProperty: 'source',
            targetRecord: 'File',
            targetProperty: undefined,
            mergedTo: 'combined',
        })

        expect(setup.map.links.File_owner_file_User_target).toMatchObject({
            relType: ['n', '1'],
            isSourceRelation:true,
            sourceRecord: 'File_owner_file_User',
            sourceProperty: 'target',
            targetRecord: 'User',
            targetProperty: undefined,
            mergedTo: 'source',
        })

    })


    test('validate n:n relation map', async () => {
        // User & User friends 关系
        const db = new SQLiteDB()
        await db.open()
        const setup = new DBSetup(entities, relations, db);
        expect(setup.map.records.User).toBeDefined()
        expect(setup.map.records.User.attributes.friends).toMatchObject({
            isRecord: true,
            relType: ['n', 'n'],
            recordName: 'User',
            linkName: 'User_friends_friends_User',
            isSource:false,
        })
        expect(setup.map.records.User.attributes.friends.field).toBeUndefined()

        expect(setup.map.links.User_friends_friends_User).toMatchObject({
            // 没合并
            table: setup.map.records.User_friends_friends_User.table,
            relType: ['n', 'n'],
            sourceRecord: 'User',
            sourceProperty: 'friends',
            targetRecord: 'User',
            targetProperty: 'friends',
        })
        // Check that source and target fields exist but don't check exact names - they're now shortened
        expect(setup.map.records.User_friends_friends_User.attributes.source.field).toBeDefined()
        expect(typeof setup.map.records.User_friends_friends_User.attributes.source.field).toBe('string')
        expect(setup.map.records.User_friends_friends_User.attributes.target.field).toBeDefined()
        expect(typeof setup.map.records.User_friends_friends_User.attributes.target.field).toBe('string')
        expect(setup.map.links.User_friends_friends_User.mergedTo).toBeUndefined()

        // 虚拟关系表
        expect(setup.map.links.User_friends_friends_User_source).toMatchObject({

            relType: ['n', '1'],
            isSourceRelation:true,
            sourceRecord: 'User_friends_friends_User',
            sourceProperty: 'source',
            targetRecord: 'User',
            targetProperty: undefined,
            mergedTo: 'source',
        })

        //
        expect(setup.map.links.User_friends_friends_User_target).toMatchObject({
            relType: ['n', '1'],
            isSourceRelation:true,
            sourceRecord: 'User_friends_friends_User',
            sourceProperty: 'target',
            targetRecord: 'User',
            targetProperty: undefined,
            mergedTo: 'source',
        })

    })

    test('create table', async () => {
        const file = "test-create.sqlite"
        if (existsSync(file)) {
            unlinkSync(file)
        }

        // @ts-ignore
        const db = new SQLiteDB(file)
        await db.open()
        const setup = new DBSetup(entities, relations, db )
        await setup.createTables()
        // TODO 查询表结构
    })


    test('query test', async () => {
        const database = new SQLiteDB(':memory:')
        await database.open()
        const setup = new DBSetup(entities, relations, database);
        await setup.createTables()


        const entityToTableMap = new EntityToTableMap(setup.map)
        const entityQuery = RecordQuery.create('User', entityToTableMap, {
            attributeQuery: [
                'name',
                'age',
                ['profile', {
                    attributeQuery: ['title']
                }],
                ['item', {
                    attributeQuery: ['itemName']
                }],
                // n:1 关系
                ['leader', {
                    attributeQuery: [
                        'name',
                        ['profile', {
                            attributeQuery: ['title']
                        }]
                    ]
                }],
            ],
            matchExpression: MatchExp.atom({
                key: 'name',
                value: ['=', 'a']
            }).and({
                key: 'file',
                value: ['exist', {
                    key: 'fileName',
                    value: ['=', 'f1']
                }]
            })
        })

        const queryAgent = new RecordQueryAgent(entityToTableMap, database)
        // console.log(JSON.stringify(queryAgent.buildFindQuery(entityQuery) as any))
        const [sql, params] = queryAgent.buildXToOneFindQuery(entityQuery)
        const result = await database.query(sql, params)
        // console.log(result)
        expect(result.length).toBe(0)
    })
})



