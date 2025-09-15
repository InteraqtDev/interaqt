import {afterEach, beforeEach, describe, expect, test} from "vitest";
import {createCommonData} from "./data/common";
import {DBSetup,EntityToTableMap,MatchExp,EntityQueryHandle} from "@storage";
import TestLogger from "./testLogger.js";
import {SQLiteDB} from '@runtime';


describe('create data', () => {
    let db: SQLiteDB
    let setup
    let logger
    let entityQueryHandle: EntityQueryHandle

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

    test('create and query with only value attribute', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17})
        expect(returnUser).toMatchObject({id: 1})
        const findUser = await entityQueryHandle.findOne('User', MatchExp.atom({key:'name', value: ['=', 'aaa']}), {}, ['name', 'age', 'gender'])
        expect(findUser).toMatchObject({
            name: 'aaa',
            age: 17,
            gender: 'male'
        })
    })


    test('create and query with 1:1 related entities', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17, profile: {title: 'aaa-profile'}})
        expect(returnUser.profile?.id).not.toBeUndefined()
        //
        const findUser = await entityQueryHandle.findOne('User', MatchExp.atom({ key:'profile.title', value: ['=', 'aaa-profile']}), {}, ['name', 'age'])
        expect(findUser).toMatchObject({
            name: 'aaa',
            age: 17
        })
    })


    test('create and query with n:n related entities', async () => {
        // Create users with teams (n:n relation)
        const user1 = await entityQueryHandle.create('User', {
            name: 'user1',
            age: 25,
            teams: [{
                name: 'teamA'
            }, {
                name: 'teamB'
            }]
        })
        
        const user2 = await entityQueryHandle.create('User', {
            name: 'user2',
            age: 30,
            teams: [{
                id: user1.teams[0].id // teamA - shared with user1
            }, {
                name: 'teamC'
            }]
        })

        // Query user1 with teams
        const findUser1 = await entityQueryHandle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user1.id]}),
            {},
            ['name', 'age', ['teams', { attributeQuery: ['name']}]]
        )
        
        findUser1.teams = findUser1.teams.sort((a:any, b:any) => a.name > b.name ? 1 : -1)
        expect(findUser1).toMatchObject({
            name: 'user1',
            age: 25,
            teams: [{name: 'teamA'}, {name: 'teamB'}]
        })

        // Query users who belong to teamA
        const usersInTeamA = await entityQueryHandle.find(
            'User',
            MatchExp.atom({ key: 'teams.name', value: ['=', 'teamA']}),
            {},
            ['name']
        )
        expect(usersInTeamA).toHaveLength(2)
        expect(usersInTeamA.map((u:any) => u.name).sort()).toEqual(['user1', 'user2'])

        // Create user with friends (n:n self-relation)
        const user3 = await entityQueryHandle.create('User', {
            name: 'user3',
            age: 35,
            friends: [{
                id: user1.id
            }, {
                id: user2.id
            }]
        })

        const findUser3WithFriends = await entityQueryHandle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user3.id]}),
            {},
            ['name', ['friends', { attributeQuery: ['name']}]]
        )
        
        findUser3WithFriends.friends = findUser3WithFriends.friends.sort((a:any, b:any) => a.name > b.name ? 1 : -1)
        expect(findUser3WithFriends).toMatchObject({
            name: 'user3',
            friends: [{name: 'user1'}, {name: 'user2'}]
        })
    })

})




describe('update data', () => {
    let db: SQLiteDB
    let setup
    let entityQueryHandle : EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB()
        await db.open()
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('update self value', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17})
        const updated = await entityQueryHandle.update('User', MatchExp.atom({ key: 'name', value: ['=', 'aaa']}), {name: 'bbb', age: 18})
        expect(updated.length).toBe(1)
        expect(updated[0].id).toBe(returnUser.id)
        const findUser = await entityQueryHandle.findOne('User', MatchExp.atom({ key: 'name', value: ['=', 'bbb']}), {}, ['name', 'age'] )
        expect(findUser.id).toBe(returnUser.id)
        expect(findUser.name).toBe('bbb')
        expect(findUser.age).toBe(18)
    })

    test('update self value with related entity as match', async () => {
        const leader = await entityQueryHandle.create('User', {name: 'elader', age: 17})
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17, leader})
        const updated = await entityQueryHandle.update('User', MatchExp.atom({ key: 'leader.id', value: ['=', leader.id]}), {name: 'bbb', age: 18})
        expect(updated.length).toBe(1)
        expect(updated[0].id).toBe(returnUser.id)
        const findUser = await entityQueryHandle.findOne('User', MatchExp.atom({ key: 'name', value: ['=', 'bbb']}), {}, ['name', 'age'] )
        expect(findUser.id).toBe(returnUser.id)
        expect(findUser.name).toBe('bbb')
        expect(findUser.age).toBe(18)
    })

    test('update value with 1:1 table merged related entity', async () => {
        // Create a user with an item (1:1 isTargetReliance relation)
        const user = await entityQueryHandle.create('User', {
            name: 'userWithItem',
            age: 25,
            item: {
                itemName: 'originalItem'
            }
        })

        // Update the user
        const updated = await entityQueryHandle.update(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id]}),
            {
                name: 'updatedUser',
                age: 26
            }
        )
        
        expect(updated.length).toBe(1)
        expect(updated[0].id).toBe(user.id)

        // For isTargetReliance entities, we need to update the item separately
        const updatedItem = await entityQueryHandle.update(
            'Item',
            MatchExp.atom({ key: 'id', value: ['=', user.item.id]}),
            {
                itemName: 'updatedItem'
            }
        )
        
        expect(updatedItem.length).toBe(1)

        // Verify the user and item were updated
        const findUser = await entityQueryHandle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id]}),
            {},
            ['name', 'age', ['item', { attributeQuery: ['itemName']}]]
        )
        
        expect(findUser).toMatchObject({
            name: 'updatedUser',
            age: 26,
            item: {
                itemName: 'updatedItem'
            }
        })
    })

    test('update value with 1:1 table not merged related entity', async () => {
        // Create a profile first
        const profile = await entityQueryHandle.create('Profile', {
            title: 'originalProfile'
        })

        // Create a user with the profile (1:1 non-merged relation)
        const user = await entityQueryHandle.create('User', {
            name: 'userWithProfile',
            age: 30,
            profile: {
                id: profile.id
            }
        })

        // Update to link a different profile
        const newProfile = await entityQueryHandle.create('Profile', {
            title: 'newProfile'
        })

        const updated = await entityQueryHandle.update(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id]}),
            {
                name: 'updatedUserWithNewProfile',
                profile: {
                    id: newProfile.id
                }
            }
        )
        
        expect(updated.length).toBe(1)
        expect(updated[0].id).toBe(user.id)

        // Verify the user now has the new profile
        const findUser = await entityQueryHandle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id]}),
            {},
            ['name', 'age', ['profile', { attributeQuery: ['title']}]]
        )
        
        expect(findUser).toMatchObject({
            name: 'updatedUserWithNewProfile',
            age: 30,
            profile: {
                title: 'newProfile'
            }
        })

        // The original profile should still exist independently
        const originalProfileStillExists = await entityQueryHandle.findOne(
            'Profile',
            MatchExp.atom({ key: 'id', value: ['=', profile.id]}),
            {},
            ['title']
        )
        expect(originalProfileStillExists).toMatchObject({
            title: 'originalProfile'
        })
    })

    test('update value with x:1 table related entity', async () => {
        const userA = await entityQueryHandle.create('User', {name: 'aaa', age: 17})
        const userB = await entityQueryHandle.create('User', {name: 'bbb', age: 18})
        // const userC = await entityQueryHandle.create('User', {name: 'ccc', age: 18})

        const updated = await entityQueryHandle.update('User', MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {name: 'a1', leader: userB})
        expect(updated.length).toBe(1)
        expect(updated[0].id).toBe(userA.id)

        const findUser = await entityQueryHandle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {}, ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]] )
        expect(findUser).toMatchObject({
            name:'a1',
            leader: {
                name: 'bbb'
            }
        })

        // TODO 更复杂的情况
    })

    test('update value with new relation with non-1:1 related entity', async () => {
        // Create initial users and teams
        const team1 = await entityQueryHandle.create('Team', { name: 'team1' })
        const team2 = await entityQueryHandle.create('Team', { name: 'team2' })
        
        const user = await entityQueryHandle.create('User', {
            name: 'userA',
            age: 25,
            teams: [{
                id: team1.id
            }]
        })

        // Update user to add another team (n:n relation)
        const updated = await entityQueryHandle.update(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id]}),
            {
                name: 'userA-updated',
                teams: [{
                    id: team2.id
                }]
            }
        )

        expect(updated.length).toBe(1)
        expect(updated[0].id).toBe(user.id)

        // Query to verify - note that update with teams replaces the relation, doesn't add to it
        const findUser = await entityQueryHandle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id]}),
            {},
            ['name', 'age', ['teams', { attributeQuery: ['name']}]]
        )

        // The user should now be connected to team2
        expect(findUser).toMatchObject({
            name: 'userA-updated',
            age: 25,
            teams: [{name: 'team2'}]
        })

        // Create files for 1:n relation test
        const fileUser = await entityQueryHandle.create('User', {
            name: 'fileOwner',
            age: 30
        })

        const file1 = await entityQueryHandle.create('File', {
            fileName: 'doc1.txt',
            owner: { id: fileUser.id }
        })

        const file2 = await entityQueryHandle.create('File', {
            fileName: 'doc2.txt'
        })

        // Update file2 to assign owner (n:1 relation)
        const updatedFile = await entityQueryHandle.update(
            'File',
            MatchExp.atom({ key: 'id', value: ['=', file2.id]}),
            {
                fileName: 'doc2-updated.txt',
                owner: { id: fileUser.id }
            }
        )

        expect(updatedFile.length).toBe(1)

        // Verify both files now belong to the user
        const userFiles = await entityQueryHandle.find(
            'File',
            MatchExp.atom({ key: 'owner.id', value: ['=', fileUser.id]}),
            {},
            ['fileName']
        )

        expect(userFiles).toHaveLength(2)
        expect(userFiles.map((f:any) => f.fileName).sort()).toEqual(['doc1.txt', 'doc2-updated.txt'])
    })
})

describe('query data', () => {
    let db: SQLiteDB
    let setup
    let entityQueryHandle : EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB()
        await db.open()
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('query n:1:n data', async () => {

        const user1 = await entityQueryHandle.create('User', {
            name: 'leader1', 
            age: 17,
            teams: [{
                name: 'team1',
            }, {
                name: 'team2',
            }]
        })

        const user2 = await entityQueryHandle.create('User', {
            name: 'member1', 
            age: 18,
            leader: user1
        })

        const foundUser = await entityQueryHandle.findOne('User', 
            MatchExp.atom({key: 'id', value: ['=', user2.id]}), {}, 
            [
                'name', 
                [
                    'leader', {attributeQuery: [
                        'name',
                        ['teams', {attributeQuery: ['name']}]
                    ]}
                ]
            ]
        )
        expect(foundUser).toMatchObject({
            name: 'member1',
            leader: {
                name: 'leader1',
                teams: [{name: 'team1'}, {name: 'team2'}]
            }
        })
        
        
    })

    
})


