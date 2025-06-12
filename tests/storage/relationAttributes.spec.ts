import {afterEach, beforeEach, describe, expect, test} from "vitest";
import {createCommonData} from "./data/common";
import {DBSetup,EntityToTableMap,MatchExp,EntityQueryHandle} from "@storage";
import {SQLiteDB} from '@runtime';

describe('relation attributes', () => {
    let db: SQLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB()
        await db.open()
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
    test('create relation attribute on one to one', async () => {
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

        // query relation data from entity
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

        // query
    })

    test('delete relation by setting relation field to null in x:1 relationship', async () => {
        // Create a user with a profile (one-to-one relationship)
        const user = await handle.create('User', {
            name: 'profileUser',
            age: 30,
            profile: {
                title: 'User Profile'
            }
        });

        // Create a file with an owner (many-to-one relationship)
        const file = await handle.create('File', {
            fileName: 'document.txt',
            owner: {
                name: 'fileOwner',
                age: 25
            }
        });

        // Verify the user has a profile
        let foundUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['name', ['profile', { attributeQuery: ['title'] }]]
        );
        
        expect(foundUser.profile).toBeTruthy();
        expect(foundUser.profile.title).toBe('User Profile');
        
        

        // Verify the file has an owner
        let foundFile = await handle.findOne(
            'File',
            MatchExp.atom({ key: 'id', value: ['=', file.id] }),
            undefined,
            ['fileName', ['owner', { attributeQuery: ['name', 'age'] }]]
        );

        
        
        expect(foundFile.owner).toBeTruthy();
        expect(foundFile.owner.name).toBe('fileOwner');
        
        // Remove profile by setting the relation field to null (one-to-one)
        await handle.update(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            {
                profile: null
            }
        );
        
        
        // Verify profile relationship is removed
        foundUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['name', ['profile', { attributeQuery: ['title'] }]]
        );
        
        expect(foundUser.profile).toBeUndefined();

        // delete many to one relation using null
        await handle.update(
            'File',
            MatchExp.atom({ key: 'id', value: ['=', file.id] }),
            { owner: null }
        );
        
        // Verify owner relationship is removed
        foundFile = await handle.findOne(
            'File',
            MatchExp.atom({ key: 'id', value: ['=', file.id] }),
            undefined,
            ['fileName', ['owner', { attributeQuery: ['name'] }]]
        );
        
        expect(foundFile.owner).toBeUndefined();
    });

    test('delete relation by setting n:n relation field to null', async () => {
        // Create a user with teams
        const user = await handle.create('User', {
            name: 'testUser',
            age: 25,
            teams: [{
                teamName: 'teamA',
                '&': {
                    role: 'member'
                }
            }, {
                teamName: 'teamB',
                '&': {
                    role: 'leader'
                }
            }]
        });

        // Verify the user has two teams
        let foundUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['name', ['teams', { attributeQuery: ['teamName', ['&', { attributeQuery: ['role'] }]] }]]
        );
        
        expect(foundUser.teams.length).toBe(2);
        
        
        // Remove all teams by setting the entire relation field to null
        await handle.update(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            {
                teams: null
            }
        );
        
        // Verify no teams remain
        foundUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['name', ['teams', { attributeQuery: ['teamName'] }]]
        );
        
        expect(foundUser.teams).toEqual([]);
    });

    test('delete all relations by setting x:n relation field to null', async () => {
        // Create a user with multiple teams
        const user = await handle.create('User', {
            name: 'teamUser',
            age: 28,
            teams: [
                { teamName: 'Team A', '&': { role: 'member' } },
                { teamName: 'Team B', '&': { role: 'leader' } },
                { teamName: 'Team C', '&': { role: 'observer' } }
            ]
        });

        // Verify the user has three teams
        let foundUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['name', ['teams', { attributeQuery: ['teamName', ['&', { attributeQuery: ['role'] }]] }]]
        );
        
        expect(foundUser.teams.length).toBe(3);
        
        // Remove all teams by setting the teams field to null
        await handle.update(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            {
                teams: null
            }
        );
        
        // Verify no teams remain
        foundUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['name', ['teams', { attributeQuery: ['teamName'] }]]
        );
        
        expect(foundUser.teams).toEqual([]);
        
        // Create user with both x:1 and x:n relations
        const complexUser = await handle.create('User', {
            name: 'complexUser',
            profile: { title: 'Complex Profile' },
            teams: [
                { teamName: 'Complex Team A' },
                { teamName: 'Complex Team B' }
            ]
        });
        
        // Verify relations exist
        let verifyUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', complexUser.id] }),
            undefined,
            ['name', ['profile', { attributeQuery: ['title'] }], ['teams', { attributeQuery: ['teamName'] }]]
        );
        
        expect(verifyUser.profile).toBeTruthy();
        expect(verifyUser.teams.length).toBe(2);
        
        // Remove both x:1 and x:n relations simultaneously
        await handle.update(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', complexUser.id] }),
            {
                profile: null,
                teams: null
            }
        );
        
        // Verify all relations removed
        verifyUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', complexUser.id] }),
            undefined,
            ['name', ['profile', { attributeQuery: ['title'] }], ['teams', { attributeQuery: ['teamName'] }]]
        );
        
        expect(verifyUser.profile).toBeUndefined();
        expect(verifyUser.teams).toEqual([]);
    });

});




