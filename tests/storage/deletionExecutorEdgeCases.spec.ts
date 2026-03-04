import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createCommonData } from "./data/common";
import { SQLiteDB } from '@drivers';
import { EntityToTableMap, MatchExp, EntityQueryHandle, DBSetup } from "@storage";
import { RecordMutationEvent } from "@runtime";
import TestLogger from "./testLogger.js";

describe('DeletionExecutor edge cases', () => {
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

    test('deleteDifferentTableReliance generates correct events with record references', async () => {
        const user = await entityQueryHandle.create('User', {
            name: 'RelOwner',
            age: 30,
            powers: [
                { powerName: 'fly' },
                { powerName: 'speed' },
            ]
        })

        const events: RecordMutationEvent[] = []
        await entityQueryHandle.delete('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), events)

        expect(events.length).toBeGreaterThan(0)

        const powerDeleteEvents = events.filter(e => e.recordName === 'Power' && e.type === 'delete')
        expect(powerDeleteEvents.length).toBe(2)

        const relationDeleteEvents = events.filter(e => 
            e.recordName.includes('Power') && e.recordName.includes('owner') && e.type === 'delete'
        )
        expect(relationDeleteEvents.length).toBeGreaterThan(0)

        const userDeleteEvents = events.filter(e => e.recordName === 'User' && e.type === 'delete')
        expect(userDeleteEvents.length).toBe(1)
        expect(userDeleteEvents[0].record!.id).toBe(user.id)
    })

    test('delete record with same-table reliance cascades correctly', async () => {
        const user = await entityQueryHandle.create('User', { name: 'ItemOwner', age: 25 })
        const item = await entityQueryHandle.create('Item', { itemName: 'Sword', owner: user })

        const events: RecordMutationEvent[] = []
        await entityQueryHandle.delete('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), events)

        const userDeleteEvents = events.filter(e => e.recordName === 'User' && e.type === 'delete')
        expect(userDeleteEvents.length).toBe(1)

        const users = await entityQueryHandle.find('User', undefined, undefined, ['*'])
        expect(users.length).toBe(0)
    })

    test('unlink non-reliance relation removes link record', async () => {
        const user = await entityQueryHandle.create('User', { name: 'Unlinker', age: 22 })
        const team = await entityQueryHandle.create('Team', { name: 'UnlinkTeam' })

        await entityQueryHandle.addRelationByNameById('User_teams_members_Team', user.id, team.id, { role: 'member' })

        let userTeams = await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['*', ['teams', { attributeQuery: ['*'] }]],
        )
        expect(userTeams[0].teams.length).toBe(1)

        const events: RecordMutationEvent[] = []
        await entityQueryHandle.removeRelationByName(
            'User_teams_members_Team',
            MatchExp.atom({ key: 'source.id', value: ['=', user.id] }).and({ key: 'target.id', value: ['=', team.id] }),
            events
        )

        userTeams = await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['*', ['teams', { attributeQuery: ['*'] }]],
        )
        expect(userTeams[0].teams.length).toBe(0)
    })

    test('delete with multiple separate link records generates proper events', async () => {
        const user = await entityQueryHandle.create('User', { name: 'MultiLink', age: 30 })
        const file1 = await entityQueryHandle.create('File', { fileName: 'file1.txt', owner: user })
        const file2 = await entityQueryHandle.create('File', { fileName: 'file2.txt', owner: user })

        const events: RecordMutationEvent[] = []
        await entityQueryHandle.delete('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), events)

        const fileRelEvents = events.filter(e => e.type === 'delete' && e.recordName.includes('File'))
        expect(fileRelEvents.length).toBeGreaterThan(0)
    })

    test('delete entity generates filtered entity delete events', async () => {
        const user = await entityQueryHandle.create('User', { name: 'DeleteWithFiltered', age: 35 })

        const events: RecordMutationEvent[] = []
        await entityQueryHandle.delete('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), events)

        const deleteEvents = events.filter(e => e.type === 'delete')
        expect(deleteEvents.length).toBeGreaterThan(0)
        expect(deleteEvents.some(e => e.recordName === 'User')).toBe(true)
    })

    test('deleteNotReliantSeparateLinkRecords removes non-reliance links', async () => {
        const user1 = await entityQueryHandle.create('User', { name: 'LinkOwner1', age: 20 })
        const user2 = await entityQueryHandle.create('User', { name: 'LinkOwner2', age: 21 })
        const team = await entityQueryHandle.create('Team', { name: 'SharedTeam' })

        await entityQueryHandle.addRelationByNameById('User_teams_members_Team', user1.id, team.id, { role: 'member' })
        await entityQueryHandle.addRelationByNameById('User_teams_members_Team', user2.id, team.id, { role: 'leader' })

        const events: RecordMutationEvent[] = []
        await entityQueryHandle.delete('User', MatchExp.atom({ key: 'id', value: ['=', user1.id] }), events)

        const teamRelEvents = events.filter(e => e.type === 'delete' && e.recordName.includes('Team') && e.recordName.includes('teams'))
        expect(teamRelEvents.length).toBeGreaterThanOrEqual(1)

        const teams = await entityQueryHandle.find('Team', undefined, undefined, ['*'])
        expect(teams.length).toBe(1)
    })

    test('unlink combined 1:1 relation relocates data', async () => {
        const user = await entityQueryHandle.create('User', { name: 'CombinedOwner', age: 28 })
        const profile = await entityQueryHandle.create('Profile', { title: 'Dev', owner: user })

        const userWithProfile = (await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['*', ['profile', { attributeQuery: ['*'] }]],
        ))[0]
        expect(userWithProfile.profile).toBeTruthy()
        expect(userWithProfile.profile.title).toBe('Dev')

        const events: RecordMutationEvent[] = []
        await entityQueryHandle.removeRelationByName(
            'Profile_owner_profile_User',
            MatchExp.atom({ key: 'source.id', value: ['=', profile.id] }),
            events
        )

        const userAfter = (await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['*', ['profile', { attributeQuery: ['*'] }]],
        ))[0]
        expect(userAfter.profile).toBeFalsy()
    })

    test('delete with non-matching condition returns empty and no events', async () => {
        await entityQueryHandle.create('User', { name: 'Existing', age: 30 })

        const events: RecordMutationEvent[] = []
        const result = await entityQueryHandle.delete(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', 'non_existent_id_999'] }),
            events
        )

        expect(result).toEqual([])
        expect(events).toHaveLength(0)
    })

    test('delete User with Profile uses update path for hasSameRowData', async () => {
        const user = await entityQueryHandle.create('User', { name: 'WithProfile', age: 30 })
        const profile = await entityQueryHandle.create('Profile', { title: 'Developer', owner: user })

        const userBefore = (await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['*', ['profile', { attributeQuery: ['*'] }]],
        ))[0]
        expect(userBefore.profile).toBeTruthy()

        const events: RecordMutationEvent[] = []
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            events
        )

        const userDeleteEvents = events.filter(e => e.recordName === 'User' && e.type === 'delete')
        expect(userDeleteEvents.length).toBe(1)

        const profileRelEvents = events.filter(e => e.recordName.includes('Profile') && e.type === 'delete')
        expect(profileRelEvents.length).toBeGreaterThan(0)

        const profiles = await entityQueryHandle.find('Profile', undefined, undefined, ['*'])
        expect(profiles.length).toBe(1)
        expect(profiles[0].title).toBe('Developer')
    })

    test('delete User without Item skips same-table reliance branch', async () => {
        const user = await entityQueryHandle.create('User', { name: 'NoItem', age: 25 })

        const events: RecordMutationEvent[] = []
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            events
        )

        const userDeleteEvents = events.filter(e => e.recordName === 'User' && e.type === 'delete')
        expect(userDeleteEvents.length).toBe(1)
        expect(userDeleteEvents[0].record!.id).toBe(user.id)
    })

    test('unlink reliance relation throws assertion error', async () => {
        const user = await entityQueryHandle.create('User', {
            name: 'RelianceOwner',
            age: 30,
            powers: [{ powerName: 'fly' }]
        })

        await expect(
            entityQueryHandle.removeRelationByName(
                'User_powers_owner_Power',
                MatchExp.atom({ key: 'source.id', value: ['=', user.id] }),
            )
        ).rejects.toThrow(/cannot unlink reliance data/)
    })
})
