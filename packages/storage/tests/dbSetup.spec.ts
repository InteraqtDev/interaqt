import {expect, test, describe} from "bun:test";
import { Database } from "bun:sqlite";
import fs from 'fs'

import {DBSetup} from "../erstorage/Setup";
import {EntityQuery, EntityQueryData, QueryAgent, MatchExpression} from "../erstorage/ERStorage";
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {createCommonData} from "./data/common";

const { entities, relations } = createCommonData()


describe("db setup", () => {
    test('create table', async () => {

        const file = "test-create.sqlite"
        if (fs.existsSync(file)) {
            fs.unlinkSync(file)
        }

        const setup = new DBSetup(entities, relations, new SQLiteDB(file, {create:true, readwrite: true}))
        await setup.createTables()

        // TODO 查询结构
    })



    test('query test', () => {
        const setup = new DBSetup(entities, relations)
        const file = "test.sqlite"
        const db = new Database(file, {create:true, readwrite: true});

        const entityToTableMap = new EntityToTableMap(setup.map)
        const entityQuery = EntityQuery.create('User', entityToTableMap, {
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

        const database = new SQLiteDB(':memory:')
        const queryAgent = new QueryAgent(entityToTableMap, database)
        // console.log(queryAgent.buildFindQuery(entityQuery))

        const query = db.query(queryAgent.buildFindQuery(entityQuery))
        const result = query.all()
        // console.log(result)
        expect(result.length).toBe(1)
    })
})

