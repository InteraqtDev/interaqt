import {EntityQueryHandle} from "../erstorage/ERStorage";
import {expect, test, describe, afterEach, beforeAll, beforeEach} from "bun:test";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import {MatchExp} from "../erstorage/MatchExp.ts";

describe('relation attributes', () => {
    let db: SQLiteDB
    let setup
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB(':memory:', {create:true, readwrite: true})
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('create relation and update attribute on many to many', async () => {
        const userA = await handle.create('User', {
            name: 'aaa',
            age: 17,
            teams: [{
                teamName: 'teamA',
                '&': {
                    role: 'leader'
                }
            }]
        })


        const relationName = handle.getRelationName('User', 'teams')
        const match = MatchExp.atom({ key: 'source.id', value: ['=', userA.id]})
        const findTeamRelation = await handle.findOne(
            relationName,
            match,
            {},
            ['role', ['source', {attributeQuery: ['name', 'age']}], ['target', {attributeQuery: ['teamName']}]]
        )

        expect(findTeamRelation).toMatchObject({
            role: 'leader',
            source:{
                name: 'aaa',
                age:17
            },
            target: {
                teamName: 'teamA'
            }
        })

        await handle.updateRelationByName(relationName, match, { role: 'member'})
        const findTeamRelation2 = await handle.findOne(
            relationName,
            match,
            {},
            ['role', ['source', {attributeQuery: ['name', 'age']}], ['target', {attributeQuery: ['teamName']}]]
        )
        expect(findTeamRelation2).toMatchObject({
            role: 'member',
            source:{
                name: 'aaa',
                age:17
            },
            target: {
                teamName: 'teamA'
            }
        })
    })

    test('create relation attribute on one to many', async () => {
        const rawData = {
            name: 'aaa',
            file: [{
                fileName: 'f1',
                '&': {
                    viewed: 100
                }
            }]
        }
        const userA = await handle.create('User', rawData)
        const findTeamRelation = await handle.findOne(
            handle.getRelationName('User', 'file'),
            MatchExp.atom({ key: 'target.id', value: ['=', userA.id]}),
            {},
            ['viewed', ['source', {attributeQuery: ['fileName']}], ['target', {attributeQuery: ['name']}]]
        )

        expect(findTeamRelation).toMatchObject({
            viewed: 100,
            source:{
                fileName: 'f1',
            },
            target: {
                name: 'aaa'
            }
        })

        const foundUser = await handle.findOne(
            'User',
            MatchExp.atom({key: 'id', value: ['=', userA.id]}),
            undefined,
            [
                'name',
                [
                    'file',
                    {
                        attributeQuery: [
                            'fileName',
                            ['&', {attributeQuery: ['viewed']}]
                        ]
                    }
                ]
            ]
        )

        // console.log(JSON.stringify(foundUser, null, 4))
        expect(foundUser).toMatchObject(rawData)
    })


    // TODO x:1 关系上的 x:n 关联实体
    test.only('create relation attribute on one to one', async () => {
        const rawData = {
            name: 'aaa',
            profile: {
                title: 'p1',
                '&': {
                    viewed: 200
                }
            }
        }
        const userA = await handle.create('User', rawData)

        const findTeamRelation = await handle.findOne(
            handle.getRelationName('User', 'profile'),
            MatchExp.atom({ key: 'target.id', value: ['=', userA.id]}),
            {},
            ['viewed', ['source', {attributeQuery: ['title']}], ['target', {attributeQuery: ['name']}]]
        )

        expect(findTeamRelation).toMatchObject({
            viewed: 200,
            source:{
                title: 'p1',
            },
            target: {
                name: 'aaa'
            }
        })

        // query from entity
        const foundUser = await handle.findOne(
            'User',
            MatchExp.atom({
                key: 'id',
                value: ['=', userA.id]
            }),
            undefined,
            [
                'name',
                ['profile',
                    {
                        attributeQuery: [
                            'title',
                            ['&', {attributeQuery: ['viewed']}]
                        ]
                    }
                ]
            ]
        )

        expect(foundUser).toMatchObject({
            id: userA.id,
            ...rawData
        })

        // query with attribute match
        const foundUser2 = await handle.findOne(
            'User',
            MatchExp.atom({
                key: 'profile.&.viewed',
                value: ['=', 200]
            }),
            undefined,
            [
                'name',
                ['profile',
                    {
                        attributeQuery: [
                            'title',
                            ['&', {attributeQuery: ['viewed']}]
                        ]
                    }
                ]
            ]
        )

        expect(foundUser2).toMatchObject({
            id: userA.id,
            ...rawData
        })
    })


    test('create record relation attribute on many to many', async () => {
        const rawData = {
            name: 'aaa',
            age: 17,
            teams: [{
                teamName: 'teamA',
                '&': {
                    role: 'leader',
                    base: {
                        name: 'zhuzhou'
                    },
                    matches: [{
                        name: 'm1'
                    }, {
                        name: 'm2'
                    }],
                    participates:[{
                        name: 'm3'
                    }, {
                        name: 'm4'
                    }]
                }
            }]
        }
        const userA = await handle.create('User', rawData)


        const findTeamRelation = await handle.findOne(
            handle.getRelationName('User', 'teams'),
            MatchExp.atom({ key: 'source.id', value: ['=', userA.id]}),
            {},
            [
                ['base', {attributeQuery: ['name']}],
                ['matches', {attributeQuery: ['name']}],
                ['participates', {attributeQuery: ['name']}],
                ['source', {attributeQuery: ['name', 'age']}],
                ['target', {attributeQuery: ['teamName']}]
            ]
        )

        expect(findTeamRelation).toMatchObject({
            base: {
                name: 'zhuzhou'
            },
            matches: [{
                name: 'm1',
            }, {
                name: 'm2',
            }],
            participates: [{
                name: 'm3',
            },{
                name: 'm4',
            }],
            source:{
                name: 'aaa',
                age:17
            },
            target: {
                teamName: 'teamA'
            },
        })

        // query relation data with entity
        const foundUser = await handle.findOne(
            'User',
            MatchExp.atom({
                key: 'id',
                value: ['=', userA.id]
            }),
            undefined,
            [
                'name',
                'age',
                [
                    'teams',
                    {
                        attributeQuery: [
                            'teamName',
                            ['&', {attributeQuery: [
                                'role',
                                ['base', { attributeQuery: ['name']}],
                                ['matches', { attributeQuery: ['name']}],
                                ['participates', { attributeQuery: ['name']}],
                            ]}]
                        ]
                    }
                ]
            ]
        )

        expect(foundUser).toMatchObject(rawData)
        // console.log(JSON.stringify(foundUser, null, 4))
    })

    // TODO 更多关系上的测试
})




