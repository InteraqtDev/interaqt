import {expect, test, describe} from "bun:test";
import { Database } from "bun:sqlite";
import fs from 'fs'

import {DBSetup} from "../erstorage/Setup";
import {RecordQuery, EntityQueryData, QueryAgent, MatchExpression} from "../erstorage/ERStorage";
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {createCommonData} from "./data/common";

const { entities, relations } = createCommonData()


describe("db setup", () => {
    test('validate 1:1 relation map', () => {
        // Profile & User
        const setup = new DBSetup(entities, relations);
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
            sourceAttribute: 'owner',
            targetRecord: 'User',
            targetAttribute: 'profile',
            mergedTo: 'combined',
        })

        // 关系实体化后的字段
        expect(setup.map.records.Profile_owner_profile_User).toMatchObject({
            // 应该在关系表和实体表合并的时候修改过了。
            table: setup.map.records.Profile.table,
            isRelation:true,
            attributes: {},
        })

        // 虚拟关系表
        expect(setup.map.links.Profile_owner_profile_User_source).toMatchObject({
            isSourceRelation: true,
            relType: ['1', '1'],
            sourceRecord: 'Profile_owner_profile_User',
            sourceAttribute: 'source',
            targetRecord: 'Profile',
            targetAttribute: undefined,
            mergedTo: 'combined',
        })

        expect(setup.map.links.Profile_owner_profile_User_target).toMatchObject({
            isSourceRelation: true,
            relType: ['1', '1'],
            sourceRecord: 'Profile_owner_profile_User',
            sourceAttribute: 'target',
            targetRecord: 'User',
            targetAttribute: undefined,
            mergedTo: 'combined',
        })
    })

    test('validate n:1 relation map', () => {
        // File & User
        const setup = new DBSetup(entities, relations);
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
            field: 'File_owner',
        })

        expect(setup.map.links.File_owner_file_User).toMatchObject({
            relType: ['n', '1'],
            sourceRecord: 'File',
            sourceAttribute: 'owner',
            targetRecord: 'User',
            targetAttribute: 'file',
            mergedTo: 'source',
        })

        // 虚拟关系表
        expect(setup.map.links.File_owner_file_User_source).toMatchObject({
            relType: ['1', '1'],
            isSourceRelation:true,
            sourceRecord: 'File_owner_file_User',
            sourceAttribute: 'source',
            targetRecord: 'File',
            targetAttribute: undefined,
            mergedTo: 'combined',
        })

        expect(setup.map.links.File_owner_file_User_target).toMatchObject({
            relType: ['n', '1'],
            isSourceRelation:true,
            sourceRecord: 'File_owner_file_User',
            sourceAttribute: 'target',
            targetRecord: 'User',
            targetAttribute: undefined,
            mergedTo: 'source',
        })

    })


    test('validate n:n relation map', () => {
        // User & User friends 关系
        const setup = new DBSetup(entities, relations);
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
            sourceAttribute: 'friends',
            targetRecord: 'User',
            targetAttribute: 'friends',
        })
        expect(setup.map.links.User_friends_friends_User.mergedTo).toBeUndefined()

        // 虚拟关系表
        expect(setup.map.links.User_friends_friends_User_source).toMatchObject({

            relType: ['n', '1'],
            isSourceRelation:true,
            sourceRecord: 'User_friends_friends_User',
            sourceAttribute: 'source',
            targetRecord: 'User',
            targetAttribute: undefined,
            mergedTo: 'source',
        })

        //
        expect(setup.map.links.User_friends_friends_User_target).toMatchObject({
            relType: ['n', '1'],
            isSourceRelation:true,
            sourceRecord: 'User_friends_friends_User',
            sourceAttribute: 'target',
            targetRecord: 'User',
            targetAttribute: undefined,
            mergedTo: 'source',
        })

    })

    test('create table', async () => {
        const file = "test-create.sqlite"
        if (fs.existsSync(file)) {
            fs.unlinkSync(file)
        }

        const setup = new DBSetup(entities, relations, new SQLiteDB(file, {create:true, readwrite: true}))
        await setup.createTables()
        // console.log(1111111111, setup.map)
        // console.log(222222222, setup.tables)
        // TODO 查询表结构
    })


    test('query test1111', async () => {
        const database = new SQLiteDB(':memory:')
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
            matchExpression: MatchExpression.createFromAtom({
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

        const queryAgent = new QueryAgent(entityToTableMap, database)
        // console.log(queryAgent.buildFindQuery(entityQuery))
        const result = await database.query(queryAgent.buildFindQuery(entityQuery))
        // console.log(result)
        expect(result.length).toBe(0)
    })
})



