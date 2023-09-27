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
        // 应该是 三表 合一
        expect(setup.map.entities.User).toBeDefined()
        expect(setup.map.entities.Profile).toBeDefined()
        expect(setup.map.entities.User.table).toBe(setup.map.entities.Profile.table)
        expect(setup.map.entities.User.attributes.profile).toMatchObject({
            isEntity: true,
            relType: ['1', '1'],
            entityName: 'Profile',
            relationName: 'Profile_owner_profile_User',
            isSource:false,
            field: undefined,
            table: setup.map.entities.Profile.table,
        })

        expect(setup.map.entities.Profile.attributes.owner).toMatchObject({
            isEntity: true,
            relType: ['1', '1'],
            entityName: 'User',
            relationName: 'Profile_owner_profile_User',
            isSource:true,
            field: undefined,
            table: setup.map.entities.Profile.table,
        })

        expect(setup.map.relations.Profile_owner_profile_User).toMatchObject({
            table: setup.map.entities.Profile.table,
            attributes: {},
            relType: ['1', '1'],
            sourceEntity: 'Profile',
            sourceAttribute: 'owner',
            targetEntity: 'User',
            targetAttribute: 'profile',
            mergedTo: 'combined',
        })
        expect(setup.map.relations.Profile_owner_profile_User.sourceField).toBeUndefined()
        expect(setup.map.relations.Profile_owner_profile_User.targetField).toBeUndefined()

        // 关系实体化后的字段
        expect(setup.map.entities.Profile_owner_profile_User).toMatchObject({
            // 应该在关系表和实体表合并的时候修改过了。
            table: setup.map.entities.Profile.table,
            isRelation:true,
            attributes: {},
        })

        // 虚拟关系表
        expect(setup.map.relations.Profile_owner_profile_User_source).toMatchObject({
            table: setup.map.entities.Profile.table,
            isSourceRelation: true,
            attributes: {},
            relType: ['1', '1'],
            sourceEntity: 'Profile_owner_profile_User',
            sourceAttribute: 'source',
            targetEntity: 'Profile',
            targetAttribute: undefined,
            mergedTo: 'combined',
        })

        expect(setup.map.relations.Profile_owner_profile_User_target).toMatchObject({
            table: setup.map.entities.Profile.table,
            isSourceRelation: true,
            attributes: {},
            relType: ['1', '1'],
            sourceEntity: 'Profile_owner_profile_User',
            sourceAttribute: 'target',
            targetEntity: 'User',
            targetAttribute: undefined,
            mergedTo: 'combined',
        })
    })

    test('validate n:1 relation map', () => {
        // File & User
        const setup = new DBSetup(entities, relations);
        expect(setup.map.entities.User).toBeDefined()
        expect(setup.map.entities.File).toBeDefined()
        expect(setup.map.entities.User.table).not.toBe(setup.map.entities.File.table)
        expect(setup.map.entities.User.attributes.file).toMatchObject({
            isEntity: true,
            relType: ['1', 'n'],
            entityName: 'File',
            relationName: 'File_owner_file_User',
            isSource:false,
            field: undefined,
            table: setup.map.entities.File.table,
        })

        expect(setup.map.entities.File.attributes.owner).toMatchObject({
            isEntity: true,
            relType: ['n', '1'],
            entityName: 'User',
            relationName: 'File_owner_file_User',
            isSource:true,
            field: 'File_owner',
            table: setup.map.entities.User.table,
        })

        expect(setup.map.relations.File_owner_file_User).toMatchObject({
            // 应该跟 File 合并了
            table: setup.map.entities.File.table,
            attributes: {},
            relType: ['n', '1'],
            sourceEntity: 'File',
            sourceAttribute: 'owner',
            targetEntity: 'User',
            targetAttribute: 'file',
            mergedTo: 'source',
        })

        // 虚拟关系表
        expect(setup.map.relations.File_owner_file_User_source).toMatchObject({
            table: setup.map.entities.File_owner_file_User.table,
            attributes: {},
            relType: ['1', '1'],
            isSourceRelation:true,
            sourceEntity: 'File_owner_file_User',
            sourceAttribute: 'source',
            targetEntity: 'File',
            targetAttribute: undefined,
            mergedTo: 'combined',
        })

        expect(setup.map.relations.File_owner_file_User_target).toMatchObject({
            table: setup.map.entities.File_owner_file_User.table,
            attributes: {},
            relType: ['n', '1'],
            isSourceRelation:true,
            sourceEntity: 'File_owner_file_User',
            sourceAttribute: 'target',
            targetEntity: 'User',
            targetAttribute: undefined,
            mergedTo: 'source',
        })

    })


    test('validate n:n relation map', () => {
        // User & User friends 关系
        const setup = new DBSetup(entities, relations);
        expect(setup.map.entities.User).toBeDefined()
        expect(setup.map.entities.User.attributes.friends).toMatchObject({
            isEntity: true,
            relType: ['n', 'n'],
            entityName: 'User',
            relationName: 'User_friends_friends_User',
            isSource:false,
            field: undefined,
            table: setup.map.entities.User.table,
        })

        expect(setup.map.relations.User_friends_friends_User).toMatchObject({
            // 没合并
            table: setup.map.entities.User_friends_friends_User.table,
            attributes: {},
            relType: ['n', 'n'],
            sourceEntity: 'User',
            sourceAttribute: 'friends',
            targetEntity: 'User',
            targetAttribute: 'friends',
            // FIXME field 的名字到底是谁决定的。如果我们用 虚拟表，那么就应该是虚拟表决定的。
            sourceField: '_source',
            targetField: '_target'
        })
        expect(setup.map.relations.User_friends_friends_User.mergedTo).toBeUndefined()

        // 虚拟关系表
        expect(setup.map.relations.User_friends_friends_User_source).toMatchObject({
            table: setup.map.entities.User_friends_friends_User.table,
            attributes: {},
            relType: ['n', '1'],
            isSourceRelation:true,
            sourceEntity: 'User_friends_friends_User',
            sourceAttribute: 'source',
            targetEntity: 'User',
            targetAttribute: undefined,
            mergedTo: 'source',
        })

        //
        expect(setup.map.relations.User_friends_friends_User_target).toMatchObject({
            table: setup.map.entities.User_friends_friends_User.table,
            attributes: {},
            relType: ['n', '1'],
            isSourceRelation:true,
            sourceEntity: 'User_friends_friends_User',
            sourceAttribute: 'target',
            targetEntity: 'User',
            targetAttribute: undefined,
            mergedTo: 'source',
        })

    })

    test.only('create table', async () => {
        const file = "test-create.sqlite"
        if (fs.existsSync(file)) {
            fs.unlinkSync(file)
        }

        const setup = new DBSetup(entities, relations, new SQLiteDB(file, {create:true, readwrite: true}))
        await setup.createTables()
        // TODO 查询表结构
    })
})


describe('query test', () => {
    test('query test', async () => {
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

