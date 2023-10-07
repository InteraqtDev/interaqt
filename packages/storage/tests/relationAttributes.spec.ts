import {EntityQueryHandle} from "../erstorage/ERStorage";
import {expect, test, describe, afterEach, beforeAll, beforeEach} from "bun:test";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import {MatchExpression} from "../erstorage/MatchExpression.ts";

describe('relation attributes', () => {
    let db: SQLiteDB
    let setup
    let entityQueryHandle: EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB(':memory:', {create:true, readwrite: true})
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('create relation attribute on many to many', async () => {
        const userA = await entityQueryHandle.create('User', {
            name: 'aaa',
            age: 17,
            teams: [{
                teamName: 'teamA',
                '&': {
                    role: 'leader'
                }
            }]
        })


        const findTeamRelation = await entityQueryHandle.findOne(
            entityQueryHandle.getRelationName('User', 'teams'),
            MatchExpression.createFromAtom({ key: 'source.id', value: ['=', userA.id]}),
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
    })

    test('create relation attribute on one to many', async () => {
        const userA = await entityQueryHandle.create('User', {
            name: 'aaa',
            file: [{
                fileName: 'f1',
                '&': {
                    viewed: 100
                }
            }]
        })
        const findTeamRelation = await entityQueryHandle.findOne(
            entityQueryHandle.getRelationName('User', 'file'),
            MatchExpression.createFromAtom({ key: 'target.id', value: ['=', userA.id]}),
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
    })


    test('create relation attribute on one to one', async () => {
        const userA = await entityQueryHandle.create('User', {
            name: 'aaa',
            profile: {
                title: 'p1',
                '&': {
                    viewed: 200
                }
            }
        })

        const findTeamRelation = await entityQueryHandle.findOne(
            entityQueryHandle.getRelationName('User', 'profile'),
            MatchExpression.createFromAtom({ key: 'target.id', value: ['=', userA.id]}),
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
    })


    test('create record relation attribute on many to many', async () => {
        const userA = await entityQueryHandle.create('User', {
            name: 'aaa',
            age: 17,
            teams: [{
                teamName: 'teamA',
                '&': {
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
        })


        const findTeamRelation = await entityQueryHandle.findOne(
            entityQueryHandle.getRelationName('User', 'teams'),
            MatchExpression.createFromAtom({ key: 'source.id', value: ['=', userA.id]}),
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
            }
        })
    })

    // TODO 更多关系上的测试
})




