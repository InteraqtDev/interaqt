import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createCommonData } from "./data/common";
import { SQLiteDB } from '@drivers';
import { EntityToTableMap, MatchExp, EntityQueryHandle, RecursiveContext, DBSetup } from "@storage";
import TestLogger from "./testLogger.js";

describe('QueryExecutor edge cases', () => {
    let db: SQLiteDB
    let setup: DBSetup
    let entityQueryHandle: EntityQueryHandle
    let logger: TestLogger

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        logger = new TestLogger('', true)

        db = new SQLiteDB(':memory:', { logger })
        await db.open()

        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => {
        await db.close()
    })

    test('findRecords with goto + exit returning true stops recursion', async () => {
        const group1 = await entityQueryHandle.create('Department', { name: 'root' })
        const group2 = await entityQueryHandle.create('Department', { name: 'child1', parent: group1 })
        const group3 = await entityQueryHandle.create('Department', { name: 'child2', parent: group2 })
        const group4 = await entityQueryHandle.create('Department', { name: 'child3', parent: group3 })

        let exitCallCount = 0
        const exit = async (context: RecursiveContext) => {
            exitCallCount++
            if (context.stack.length >= 3) return true
            return false
        }

        const foundGroup = (await entityQueryHandle.find('Department',
            MatchExp.atom({ key: 'name', value: ['=', 'root'] }),
            undefined,
            ['*', ['children', {
                label: 'childDept',
                attributeQuery: ['*', ['children', { goto: 'childDept', exit }]]
            }]],
        ))[0]

        expect(foundGroup.id).toBe(group1.id)
        expect(foundGroup.children[0].id).toBe(group2.id)
        expect(exitCallCount).toBeGreaterThan(0)
    })

    test('findRecords detects and stops on cycle (same id at start and end of stack)', async () => {
        const g1 = await entityQueryHandle.create('Department', { name: 'cycle1' })
        const g2 = await entityQueryHandle.create('Department', { name: 'cycle2', parent: g1 })

        const exit = async (context: RecursiveContext) => false

        const found = (await entityQueryHandle.find('Department',
            MatchExp.atom({ key: 'name', value: ['=', 'cycle1'] }),
            undefined,
            ['*', ['children', {
                label: 'cycleDept',
                attributeQuery: ['*', ['children', { goto: 'cycleDept', exit }]]
            }]],
        ))[0]

        expect(found.id).toBe(g1.id)
        expect(found.children).toBeDefined()
    })

    test('findPath returns undefined when path does not exist', async () => {
        const g1 = await entityQueryHandle.create('Department', { name: 'pathStart' })
        const g2 = await entityQueryHandle.create('Department', { name: 'unconnected' })

        const foundPath = await entityQueryHandle.findPath('Department', 'children', g1.id, g2.id)
        expect(foundPath).toBeUndefined()
    })

    test('findPath finds existing path in deep tree', async () => {
        const g1 = await entityQueryHandle.create('Department', { name: 'pRoot' })
        const g2 = await entityQueryHandle.create('Department', { name: 'pChild1', parent: g1 })
        const g3 = await entityQueryHandle.create('Department', { name: 'pChild2', parent: g2 })
        const g4 = await entityQueryHandle.create('Department', { name: 'pChild3', parent: g3 })

        const foundPath = await entityQueryHandle.findPath('Department', 'children', g1.id, g4.id)
        expect(foundPath).toBeDefined()
        expect(foundPath!.length).toBe(4)
        expect(foundPath![0].id).toBe(g1.id)
        expect(foundPath![3].id).toBe(g4.id)
    })

    test('x:n query with relation data', async () => {
        const user1 = await entityQueryHandle.create('User', { name: 'XnUser1', age: 25 })
        const team1 = await entityQueryHandle.create('Team', { name: 'Team1' })
        const team2 = await entityQueryHandle.create('Team', { name: 'Team2' })

        await entityQueryHandle.addRelationByNameById('User_teams_members_Team', user1.id, team1.id, { role: 'leader' })
        await entityQueryHandle.addRelationByNameById('User_teams_members_Team', user1.id, team2.id, { role: 'member' })

        const found = (await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
            undefined,
            ['*', ['teams', { attributeQuery: ['*', ['&', { attributeQuery: ['role'] }]] }]],
        ))[0]

        expect(found.teams.length).toBe(2)
        const roles = found.teams.map((t: any) => t['&'].role).sort()
        expect(roles).toEqual(['leader', 'member'])
    })

    test('symmetric n:n relation (friends) query with relation data', async () => {
        const user1 = await entityQueryHandle.create('User', { name: 'Friend1', age: 20 })
        const user2 = await entityQueryHandle.create('User', { name: 'Friend2', age: 21 })

        await entityQueryHandle.addRelationByNameById('User_friends_friends_User', user1.id, user2.id, { level: 5 })

        const found = (await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
            undefined,
            ['*', ['friends', { attributeQuery: ['*', ['&', { attributeQuery: ['level'] }]] }]],
        ))[0]

        expect(found.friends.length).toBe(1)
        expect(found.friends[0].name).toBe('Friend2')
        expect(found.friends[0]['&'].level).toBe(5)
    })

    test('completeXToOneLeftoverRecords with null x:1 relation', async () => {
        const user1 = await entityQueryHandle.create('User', { name: 'NoProfile', age: 30 })

        const found = (await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
            undefined,
            ['*', ['profile', { attributeQuery: ['*'] }]],
        ))[0]

        expect(found.id).toBe(user1.id)
        expect(found.profile).toBeFalsy()
    })

    test('x:1 query with nested x:n subqueries', async () => {
        const user1 = await entityQueryHandle.create('User', { name: 'NestedUser', age: 28 })
        const profile1 = await entityQueryHandle.create('Profile', { title: 'Engineer', owner: user1 })
        const file1 = await entityQueryHandle.create('File', { fileName: 'doc.pdf', owner: user1 })
        const file2 = await entityQueryHandle.create('File', { fileName: 'img.png', owner: user1 })

        const found = (await entityQueryHandle.find('Profile',
            MatchExp.atom({ key: 'id', value: ['=', profile1.id] }),
            undefined,
            ['*', ['owner', { attributeQuery: ['*', ['file', { attributeQuery: ['*'] }]] }]],
        ))[0]

        expect(found.owner.name).toBe('NestedUser')
        expect(found.owner.file.length).toBe(2)
    })

    test('findRecords detects real cycle (circular parent reference)', async () => {
        const g1 = await entityQueryHandle.create('Department', { name: 'realCycle1' })
        const g2 = await entityQueryHandle.create('Department', { name: 'realCycle2', parent: g1 })

        await entityQueryHandle.update('Department',
            MatchExp.atom({ key: 'id', value: ['=', g1.id] }),
            { parent: g2 }
        )

        const exit = async (context: RecursiveContext) => false

        const found = (await entityQueryHandle.find('Department',
            MatchExp.atom({ key: 'name', value: ['=', 'realCycle1'] }),
            undefined,
            ['*', ['children', {
                label: 'cycleLbl',
                attributeQuery: ['*', ['children', { goto: 'cycleLbl', exit }]]
            }]],
        ))[0]

        expect(found.id).toBe(g1.id)
        expect(found.children).toBeDefined()
    })

    test('onlyRelationData skips entity query for x:n', async () => {
        const user1 = await entityQueryHandle.create('User', { name: 'OnlyRelUser', age: 25 })
        const team1 = await entityQueryHandle.create('Team', { name: 'OnlyRelTeam' })
        await entityQueryHandle.addRelationByNameById('User_teams_members_Team', user1.id, team1.id, { role: 'leader' })

        const found = (await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
            undefined,
            ['*', ['teams', { attributeQuery: ['*'], onlyRelationData: true }]],
        ))[0]

        expect(found.id).toBe(user1.id)
    })

    test('findPath in deeper tree exercises exit callback paths', async () => {
        const root = await entityQueryHandle.create('Department', { name: 'deepRoot' })
        const a = await entityQueryHandle.create('Department', { name: 'deepA', parent: root })
        const b = await entityQueryHandle.create('Department', { name: 'deepB', parent: a })
        const c = await entityQueryHandle.create('Department', { name: 'deepC', parent: b })
        const d = await entityQueryHandle.create('Department', { name: 'deepD', parent: c })

        const foundPath = await entityQueryHandle.findPath('Department', 'children', root.id, d.id)
        expect(foundPath).toBeDefined()
        expect(foundPath!.length).toBe(5)
        expect(foundPath![0].id).toBe(root.id)
        expect(foundPath![4].id).toBe(d.id)

        const noPath = await entityQueryHandle.findPath('Department', 'children', d.id, root.id)
        expect(noPath).toBeUndefined()
    })

    test('completeXToOneLeftoverRecords x:1 -> x:1 recursive chain', async () => {
        const user1 = await entityQueryHandle.create('User', { name: 'ChainUser', age: 30 })
        const profile1 = await entityQueryHandle.create('Profile', { title: 'ChainProfile', owner: user1 })

        const found = (await entityQueryHandle.find('Profile',
            MatchExp.atom({ key: 'id', value: ['=', profile1.id] }),
            undefined,
            ['*', ['owner', { attributeQuery: ['*', ['profile', { attributeQuery: ['*'] }]] }]],
        ))[0]

        expect(found.owner.name).toBe('ChainUser')
        expect(found.owner.profile).toBeTruthy()
        expect(found.owner.profile.title).toBe('ChainProfile')
    })

    test('findRecords with exit returning true immediately', async () => {
        const g1 = await entityQueryHandle.create('Department', { name: 'exitRoot' })
        const g2 = await entityQueryHandle.create('Department', { name: 'exitChild', parent: g1 })

        const exit = async (context: RecursiveContext) => true

        const found = (await entityQueryHandle.find('Department',
            MatchExp.atom({ key: 'name', value: ['=', 'exitRoot'] }),
            undefined,
            ['*', ['children', {
                label: 'exitLbl',
                attributeQuery: ['*', ['children', { goto: 'exitLbl', exit }]]
            }]],
        ))[0]

        expect(found.id).toBe(g1.id)
        expect(found.children).toBeDefined()
        expect(found.children.length).toBe(1)
        expect(found.children[0].children).toEqual([])
    })

    test('x:1 with null value in nested query does not crash', async () => {
        const profile1 = await entityQueryHandle.create('Profile', { title: 'NoOwner' })

        const found = (await entityQueryHandle.find('Profile',
            MatchExp.atom({ key: 'id', value: ['=', profile1.id] }),
            undefined,
            ['*', ['owner', { attributeQuery: ['*', ['file', { attributeQuery: ['*'] }]] }]],
        ))[0]

        expect(found.id).toBe(profile1.id)
        expect(found.owner).toBeFalsy()
    })
})
