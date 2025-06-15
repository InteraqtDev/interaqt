import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Entity, Relation, Property, BoolExp } from '@shared'
import { PGLiteDB } from '@runtime'
import { EntityToTableMap, DBSetup, RecordQueryAgent, EntityQueryHandle, MatchExp } from '@storage'

describe('Filtered Entity with Relation as Source', () => {
    let db: PGLiteDB
    let map: EntityToTableMap
    let recordQueryAgent: RecordQueryAgent
    let entityQueryHandle: EntityQueryHandle

    // Define entities
    const User = Entity.create({
        name: 'User',
        properties: [
            Property.create({ name: 'name', type: 'string' }),
            Property.create({ name: 'email', type: 'string' }),
            Property.create({ name: 'isActive', type: 'boolean' })
        ]
    })

    const Team = Entity.create({
        name: 'Team',
        properties: [
            Property.create({ name: 'name', type: 'string' }),
            Property.create({ name: 'description', type: 'string' })
        ]
    })

    const Project = Entity.create({
        name: 'Project',
        properties: [
            Property.create({ name: 'name', type: 'string' }),
            Property.create({ name: 'status', type: 'string' })
        ]
    })

    // Define relations
    const UserTeamRelation = Relation.create({
        source: User,
        sourceProperty: 'teams',
        target: Team,
        targetProperty: 'members',
        relType: 'n:n',
        type: 'relation',
        properties: [
            Property.create({ name: 'role', type: 'string' }),
            Property.create({ name: 'joinedAt', type: 'string' })
        ]
    })

    const UserProjectRelation = Relation.create({
        source: User,
        sourceProperty: 'projects',
        target: Project,
        targetProperty: 'users',
        relType: 'n:n',
        type: 'relation',
        properties: [
            Property.create({ name: 'role', type: 'string' }),
            Property.create({ name: 'assignedAt', type: 'string' })
        ]
    })

    // Define filtered entities based on relations
    // TODO 暂时不支持，后面需要增加级联机算法才能支持。
    // const ActiveMemberships = Entity.create({
    //     name: 'ActiveMemberships',
    //     sourceEntity: UserTeamRelation,
    //     filterCondition: MatchExp.atom({
    //         key: 'source.isActive',
    //         value: ['=', true]
    //     })
    // })

    const AdminMemberships = Entity.create({
        name: 'AdminMemberships',
        sourceEntity: UserTeamRelation,
        filterCondition: MatchExp.atom({
            key: 'role',
            value: ['=', 'admin']
        })
    })

    const ProjectLeads = Entity.create({
        name: 'ProjectLeads',
        sourceEntity: UserProjectRelation,
        filterCondition: MatchExp.atom({
            key: 'role',
            value: ['=', 'lead']
        })
    })

    const SeniorAdminMemberships = Entity.create({
        name: 'SeniorAdminMemberships',
        sourceEntity: UserTeamRelation,
        filterCondition: MatchExp.atom({
            key: 'role',
            value: ['=', 'admin']
        }).and({
            key: 'joinedAt',
            value: ['<', '2024-06-01']
        })
    })

    beforeEach(async () => {
        db = new PGLiteDB()
        await db.open()

        // Create entity to table map using Setup
        // const entities = [User, Team, Project, ActiveMemberships, AdminMemberships, ProjectLeads]
        const entities = [User, Team, Project, AdminMemberships, ProjectLeads, SeniorAdminMemberships]
        const relations = [UserTeamRelation, UserProjectRelation]
        
        const setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        map = new EntityToTableMap(setup.map)

        recordQueryAgent = new RecordQueryAgent(map, db)
        entityQueryHandle = new EntityQueryHandle(map, db)
    })

    afterEach(async () => {
        await db.close()
    })

    it('should support relations as sourceEntity for filtered entities', async () => {
        // Create users
        const user1 = await entityQueryHandle.create('User', {
            name: 'Alice',
            email: 'alice@example.com',
            isActive: true
        })

        const user2 = await entityQueryHandle.create('User', {
            name: 'Bob',
            email: 'bob@example.com',
            isActive: false
        })

        // Create teams
        const team1 = await entityQueryHandle.create('Team', {
            name: 'Engineering',
            description: 'Engineering team'
        })

        const team2 = await entityQueryHandle.create('Team', {
            name: 'Marketing',
            description: 'Marketing team'
        })

        // Create project
        const project1 = await entityQueryHandle.create('Project', {
            name: 'Project Alpha',
            status: 'active'
        })

        // Create relations
        const membership1 = await entityQueryHandle.addRelationByNameById('User_teams_members_Team', 
            user1.id, 
            team1.id, 
            {
                role: 'admin',
                joinedAt: '2024-01-01'
            }
        )

        const membership2 = await entityQueryHandle.addRelationByNameById('User_teams_members_Team', 
            user2.id, 
            team1.id, 
            {
                role: 'member',
                joinedAt: '2024-01-02'
            }
        )

        const membership3 = await entityQueryHandle.addRelationByNameById('User_teams_members_Team', 
            user1.id, 
            team2.id, 
            {
                role: 'member',
                joinedAt: '2024-01-03'
            }
        )

        const projectAssignment1 = await entityQueryHandle.addRelationByNameById('User_projects_users_Project', 
            user1.id, 
            project1.id, 
            {
                role: 'lead',
                assignedAt: '2024-01-01'
            }
        )

        // Query filtered entities - just check counts
        // const activeMemberships = await entityQueryHandle.find('ActiveMemberships')
        // expect(activeMemberships.length).toBe(2) // Alice's two memberships (she's active)
        
        const adminMemberships = await entityQueryHandle.find('AdminMemberships')
        expect(adminMemberships.length).toBe(1) // Only one admin membership
        
        const projectLeads = await entityQueryHandle.find('ProjectLeads')
        expect(projectLeads.length).toBe(1) // Only one project lead
    })

    it('should emit correct events for filtered entities based on relations', async () => {
        const events: any[] = []

        // Create active user
        const user1 = await entityQueryHandle.create('User', {
            name: 'Alice',
            email: 'alice@example.com',
            isActive: true
        }, events)

        // Create team
        const team1 = await entityQueryHandle.create('Team', {
            name: 'Engineering',
            description: 'Engineering team'
        }, events)

        // Clear previous events
        events.length = 0

        // Create admin membership (should trigger both relation and filtered entity events)
        const membership1 = await entityQueryHandle.addRelationByNameById('User_teams_members_Team', 
            user1.id, 
            team1.id, 
            {
                role: 'admin',
                joinedAt: '2024-01-01'
            },
            events
        )

        // Should have events for:
        // 1. User_teams_members_Team create
        // 2. ActiveMemberships create (because user is active)
        // 3. AdminMemberships create (because role is admin)
        const createEvents = events.filter(e => e.type === 'create')
        expect(createEvents.length).toBe(3)
        expect(createEvents.some(e => e.recordName === 'User_teams_members_Team')).toBe(true)
        // expect(createEvents.some(e => e.recordName === 'ActiveMemberships')).toBe(true)
        expect(createEvents.some(e => e.recordName === 'AdminMemberships')).toBe(true)

        // Clear events
        events.length = 0

        // Update role to member (should trigger AdminMemberships delete)
        await entityQueryHandle.update('User_teams_members_Team', 
            MatchExp.atom({ key: 'id', value: ['=', membership1.id] }),
            { role: 'member' },
            events
        )

        const updateEvents = events.filter(e => e.type === 'update')
        const deleteEvents = events.filter(e => e.type === 'delete')
        
        expect(updateEvents.some(e => e.recordName === 'User_teams_members_Team')).toBe(true)
        expect(deleteEvents.some(e => e.recordName === 'AdminMemberships')).toBe(true)
        // ActiveMemberships should still exist
        // expect(deleteEvents.some(e => e.recordName === 'ActiveMemberships')).toBe(false)

        // Clear events
        events.length = 0

        // Update user to inactive (should trigger ActiveMemberships delete)
        await entityQueryHandle.update('User', 
            MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
            { isActive: false },
            events
        )

        // Wait a bit for events to propagate
        await new Promise(resolve => setTimeout(resolve, 100))

        // Should have ActiveMemberships delete event
        // const activeMembershipDeleteEvents = events.filter(e => 
        //     e.type === 'delete' && e.recordName === 'ActiveMemberships'
        // )
        // expect(activeMembershipDeleteEvents.length).toBe(1)
    })

    it('should handle complex filter conditions on relations', async () => {
        // Create test data
        const user1 = await entityQueryHandle.create('User', {
            name: 'Alice',
            email: 'alice@example.com',
            isActive: true
        })

        const team1 = await entityQueryHandle.create('Team', {
            name: 'Engineering',
            description: 'Engineering team'
        })

        // Create memberships with different dates
        await entityQueryHandle.addRelationByNameById('User_teams_members_Team',
            user1.id,
            team1.id,
            {
                role: 'admin',
                joinedAt: '2024-01-01' // Senior admin
            }
        )

        // Query senior admin memberships
        const seniorAdmins = await entityQueryHandle.find('SeniorAdminMemberships', undefined, undefined, ['*'])
        expect(seniorAdmins.length).toBe(1)
        expect(seniorAdmins[0].role).toBe('admin')
        expect(seniorAdmins[0].joinedAt).toBe('2024-01-01')
    })
}) 