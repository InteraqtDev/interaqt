import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from '@storage'
import { SQLiteDB } from '@drivers';
import { Entity, Property, Relation } from '@core'
describe('cascade filtered relation', () => {
    let db: SQLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle

    beforeEach(async () => {
        db = new SQLiteDB()
        await db.open()
    })

    afterEach(async () => {
        await db.close()
    })

    test('basic cascade filtered relation - two levels', async () => {
        // Define entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'department', type: 'string' }),
                Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' })
            ]
        })

        const Project = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'priority', type: 'string', defaultValue: () => 'normal' }),
                Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' })
            ]
        })

        // Base relation with properties
        const UserProjectRelation = Relation.create({
            name: 'UserProjectRelation',
            source: User,
            sourceProperty: 'projects',
            target: Project,
            targetProperty: 'users',
            type: 'n:n',
            properties: [
                Property.create({ name: 'role', type: 'string' }),
                Property.create({ name: 'startDate', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
            ]
        })

        // First level filtered relation - only active assignments
        const ActiveUserProjectRelation = Relation.create({
            name: 'ActiveUserProjectRelation',
            baseRelation: UserProjectRelation,
            sourceProperty: 'activeProjects',
            targetProperty: 'activeUsers',
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        })

        // Second level filtered relation - only lead roles from active assignments
        const LeadUserProjectRelation = Relation.create({
            name: 'LeadUserProjectRelation',
            baseRelation: ActiveUserProjectRelation,
            sourceProperty: 'leadProjects',
            targetProperty: 'leadUsers',
            matchExpression: MatchExp.atom({
                key: 'role',
                value: ['=', 'lead']
            })
        })

        // Setup database
        setup = new DBSetup(
            [User, Project], 
            [UserProjectRelation, ActiveUserProjectRelation, LeadUserProjectRelation], 
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const alice = await handle.create('User', { name: 'Alice', department: 'Engineering' })
        const bob = await handle.create('User', { name: 'Bob', department: 'Design' })
        const charlie = await handle.create('User', { name: 'Charlie', department: 'Engineering' })

        const project1 = await handle.create('Project', { name: 'Project Alpha', priority: 'high' })
        const project2 = await handle.create('Project', { name: 'Project Beta', priority: 'normal' })
        const project3 = await handle.create('Project', { name: 'Project Gamma', priority: 'low' })

        // Create relations with different combinations
        // Alice - Project Alpha: active lead
        await handle.create('UserProjectRelation', {
            source: { id: alice.id },
            target: { id: project1.id },
            role: 'lead',
            startDate: '2024-01-01',
            isActive: true
        })

        // Alice - Project Beta: inactive lead
        await handle.create('UserProjectRelation', {
            source: { id: alice.id },
            target: { id: project2.id },
            role: 'lead',
            startDate: '2023-01-01',
            isActive: false
        })

        // Bob - Project Alpha: active member
        await handle.create('UserProjectRelation', {
            source: { id: bob.id },
            target: { id: project1.id },
            role: 'member',
            startDate: '2024-02-01',
            isActive: true
        })

        // Charlie - Project Gamma: active lead
        await handle.create('UserProjectRelation', {
            source: { id: charlie.id },
            target: { id: project3.id },
            role: 'lead',
            startDate: '2024-03-01',
            isActive: true
        })

        // Test base relation - should have all 4
        const allRelations = await handle.find(
            'UserProjectRelation',
            undefined,
            undefined,
            ['source', 'target', 'role', 'isActive']
        )
        expect(allRelations.length).toBe(4)

        // Test first level filtered relation - only active (3 relations)
        const activeRelations = await handle.find(
            'ActiveUserProjectRelation',
            undefined,
            undefined,
            ['source', 'target', 'role', 'isActive']
        )
        expect(activeRelations.length).toBe(3)
        expect(activeRelations.every((r: any) => r.isActive)).toBeTruthy()

        // Test second level cascade filtered relation - only active leads (2 relations)
        const leadRelations = await handle.find(
            'LeadUserProjectRelation',
            undefined,
            undefined,
            [
                ['source', {attributeQuery: ['name', 'department']}],
                ['target', {attributeQuery: ['name', 'priority']}],
                'role', 
                'isActive'
            ]
        )
        expect(leadRelations.length).toBe(2)
        expect(leadRelations.every((r: any) => r.isActive && r.role === 'lead')).toBeTruthy()
        
        // Verify the specific leads
        const leadUserNames = leadRelations.map((r: any) => r.source.name).sort()
        expect(leadUserNames).toEqual(['Alice', 'Charlie'])
    })

    test('cascade filtered relation with complex match expressions', async () => {
        // Define entities
        const Employee = Entity.create({
            name: 'Employee',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'level', type: 'number' })
            ]
        })

        const Task = Entity.create({
            name: 'Task',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'priority', type: 'number' }),
                Property.create({ name: 'status', type: 'string' })
            ]
        })

        // Base relation
        const EmployeeTaskRelation = Relation.create({
            name: 'EmployeeTaskRelation',
            source: Employee,
            sourceProperty: 'tasks',
            target: Task,
            targetProperty: 'assignees',
            type: 'n:n',
            properties: [
                Property.create({ name: 'assignmentType', type: 'string' }),
                Property.create({ name: 'hoursAllocated', type: 'number' }),
                Property.create({ name: 'performance', type: 'string' })
            ]
        })

        // First level - high priority tasks (priority > 5)
        const HighPriorityTaskRelation = Relation.create({
            name: 'HighPriorityTaskRelation',
            baseRelation: EmployeeTaskRelation,
            sourceProperty: 'highPriorityTasks',
            targetProperty: 'highPriorityAssignees',
            matchExpression: MatchExp.atom({
                key: 'target.priority',
                value: ['>', 5]
            })
        })

        // Second level - senior employees (level >= 3) on high priority tasks with good performance
        const SeniorHighPriorityRelation = Relation.create({
            name: 'SeniorHighPriorityRelation',
            baseRelation: HighPriorityTaskRelation,
            sourceProperty: 'seniorHighPriorityTasks',
            targetProperty: 'seniorHighPriorityAssignees',
            matchExpression: MatchExp.atom({
                key: 'source.level',
                value: ['>=', 3]
            }).and({
                key: 'performance',
                value: ['=', 'good']
            })
        })

        // Setup database
        setup = new DBSetup(
            [Employee, Task],
            [EmployeeTaskRelation, HighPriorityTaskRelation, SeniorHighPriorityRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const emp1 = await handle.create('Employee', { name: 'Senior Dev', level: 4 })
        const emp2 = await handle.create('Employee', { name: 'Junior Dev', level: 2 })
        const emp3 = await handle.create('Employee', { name: 'Mid Dev', level: 3 })

        const task1 = await handle.create('Task', { title: 'Critical Bug', priority: 8, status: 'open' })
        const task2 = await handle.create('Task', { title: 'Feature', priority: 3, status: 'open' })
        const task3 = await handle.create('Task', { title: 'Security Issue', priority: 9, status: 'open' })

        // Create assignments
        await handle.create('EmployeeTaskRelation', {
            source: { id: emp1.id },
            target: { id: task1.id },
            assignmentType: 'primary',
            hoursAllocated: 20,
            performance: 'good'
        })

        await handle.create('EmployeeTaskRelation', {
            source: { id: emp2.id },
            target: { id: task1.id },
            assignmentType: 'support',
            hoursAllocated: 10,
            performance: 'good'
        })

        await handle.create('EmployeeTaskRelation', {
            source: { id: emp3.id },
            target: { id: task3.id },
            assignmentType: 'primary',
            hoursAllocated: 30,
            performance: 'average'
        })

        await handle.create('EmployeeTaskRelation', {
            source: { id: emp1.id },
            target: { id: task2.id },
            assignmentType: 'primary',
            hoursAllocated: 15,
            performance: 'good'
        })

        // Test cascade filtering
        const seniorHighPriority = await handle.find(
            'SeniorHighPriorityRelation',
            undefined,
            undefined,
            [
                ['source', {attributeQuery: ['name', 'level']}],
                ['target', {attributeQuery: ['title', 'priority']}],
                'performance', 
                'hoursAllocated'
            ]
        )

        // Should only have Senior Dev on Critical Bug (level >= 3, priority > 5, performance = 'good')
        expect(seniorHighPriority.length).toBe(1)
        expect(seniorHighPriority[0].source.name).toBe('Senior Dev')
        expect(seniorHighPriority[0].target.title).toBe('Critical Bug')
        expect(seniorHighPriority[0].performance).toBe('good')
    })

    test('cascade filtered relation CRUD operations', async () => {
        // Define entities
        const Department = Entity.create({
            name: 'Department',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        })

        const Employee = Entity.create({
            name: 'Employee',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'seniority', type: 'string' })
            ]
        })

        // Base relation
        const DepartmentEmployeeRelation = Relation.create({
            name: 'DepartmentEmployeeRelation',
            source: Department,
            sourceProperty: 'employees',
            target: Employee,
            targetProperty: 'department',
            type: '1:n',
            properties: [
                Property.create({ name: 'position', type: 'string' }),
                Property.create({ name: 'isManager', type: 'boolean', defaultValue: () => false })
            ]
        })

        // First level - only managers
        const DepartmentManagerRelation = Relation.create({
            name: 'DepartmentManagerRelation',
            baseRelation: DepartmentEmployeeRelation,
            sourceProperty: 'managers',
            targetProperty: 'managedDepartment',
            matchExpression: MatchExp.atom({
                key: 'isManager',
                value: ['=', true]
            })
        })

        // Second level - only senior managers
        const SeniorManagerRelation = Relation.create({
            name: 'SeniorManagerRelation',
            baseRelation: DepartmentManagerRelation,
            sourceProperty: 'seniorManagers',
            targetProperty: 'seniorManagedDepartment',
            matchExpression: MatchExp.atom({
                key: 'target.seniority',
                value: ['=', 'senior']
            })
        })

        // Setup database
        setup = new DBSetup(
            [Department, Employee],
            [DepartmentEmployeeRelation, DepartmentManagerRelation, SeniorManagerRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const engineering = await handle.create('Department', { name: 'Engineering' })
        const alice = await handle.create('Employee', { name: 'Alice', seniority: 'senior' })
        const bob = await handle.create('Employee', { name: 'Bob', seniority: 'junior' })

        // Create relation - Alice as senior manager
        const aliceRelation = await handle.create('DepartmentEmployeeRelation', {
            source: { id: engineering.id },
            target: { id: alice.id },
            position: 'Engineering Manager',
            isManager: true
        })

        // Verify cascade filtered relation sees Alice
        let seniorManagers = await handle.find(
            'SeniorManagerRelation',
            undefined,
            undefined,
            [
                ['source', {attributeQuery: ['name']}],
                ['target', {attributeQuery: ['name', 'seniority']}],
                'position', 
                'isManager'
            ]
        )
        expect(seniorManagers.length).toBe(1)
        expect(seniorManagers[0].target.name).toBe('Alice')

        // UPDATE: Change Alice to non-manager
        await handle.update(
            'DepartmentEmployeeRelation',
            MatchExp.atom({ key: 'id', value: ['=', aliceRelation.id] }),
            { isManager: false }
        )

        // Verify she's no longer in cascade filtered relation
        seniorManagers = await handle.find(
            'SeniorManagerRelation',
            undefined,
            undefined,
            [
                ['source', {attributeQuery: ['name']}],
                ['target', {attributeQuery: ['name', 'seniority']}],
                'position', 
                'isManager'
            ]
        )
        expect(seniorManagers.length).toBe(0)

        // UPDATE: Make her manager again
        await handle.update(
            'DepartmentEmployeeRelation',
            MatchExp.atom({ key: 'id', value: ['=', aliceRelation.id] }),
            { isManager: true }
        )

        // She should be back
        seniorManagers = await handle.find(
            'SeniorManagerRelation',
            undefined,
            undefined,
            [
                ['source', {attributeQuery: ['name']}],
                ['target', {attributeQuery: ['name', 'seniority']}],
                'position', 
                'isManager'
            ]
        )
        expect(seniorManagers.length).toBe(1)

        // DELETE: Remove the relation
        await handle.delete(
            'DepartmentEmployeeRelation',
            MatchExp.atom({ key: 'id', value: ['=', aliceRelation.id] })
        )

        // Verify cascade filtered relation is empty
        seniorManagers = await handle.find(
            'SeniorManagerRelation',
            undefined,
            undefined,
            [
                ['source', {attributeQuery: ['name']}],
                ['target', {attributeQuery: ['name', 'seniority']}],
                'position', 
                'isManager'
            ]
        )
        expect(seniorManagers.length).toBe(0)
    })

    test('three-level cascade filtered relation', async () => {
        // Define entities
        const Company = Entity.create({
            name: 'Company',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'industry', type: 'string' })
            ]
        })

        const Contract = Entity.create({
            name: 'Contract',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'value', type: 'number' }),
                Property.create({ name: 'status', type: 'string' })
            ]
        })

        // Base relation
        const CompanyContractRelation = Relation.create({
            name: 'CompanyContractRelation',
            source: Company,
            sourceProperty: 'contracts',
            target: Contract,
            targetProperty: 'companies',
            type: 'n:n',
            properties: [
                Property.create({ name: 'contractType', type: 'string' }),
                Property.create({ name: 'signedDate', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
                Property.create({ name: 'region', type: 'string' })
            ]
        })

        // Level 1: Active contracts
        const ActiveContractRelation = Relation.create({
            name: 'ActiveContractRelation',
            baseRelation: CompanyContractRelation,
            sourceProperty: 'activeContracts',
            targetProperty: 'activeCompanies',
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        })

        // Level 2: High-value active contracts (> 1M)
        const HighValueActiveRelation = Relation.create({
            name: 'HighValueActiveRelation',
            baseRelation: ActiveContractRelation,
            sourceProperty: 'highValueActiveContracts',
            targetProperty: 'highValueActiveCompanies',
            matchExpression: MatchExp.atom({
                key: 'target.value',
                value: ['>', 1000000]
            })
        })

        // Level 3: High-value active tech contracts in US region
        const TechHighValueUSRelation = Relation.create({
            name: 'TechHighValueUSRelation',
            baseRelation: HighValueActiveRelation,
            sourceProperty: 'techHighValueUSContracts',
            targetProperty: 'techHighValueUSCompanies',
            matchExpression: MatchExp.atom({
                key: 'source.industry',
                value: ['=', 'tech']
            }).and({
                key: 'region',
                value: ['=', 'US']
            })
        })

        // Setup database
        setup = new DBSetup(
            [Company, Contract],
            [CompanyContractRelation, ActiveContractRelation, HighValueActiveRelation, TechHighValueUSRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const techCorp = await handle.create('Company', { name: 'TechCorp', industry: 'tech' })
        const retailCo = await handle.create('Company', { name: 'RetailCo', industry: 'retail' })
        
        const bigContract = await handle.create('Contract', { 
            title: 'Enterprise Deal', 
            value: 2000000, 
            status: 'signed' 
        })
        const smallContract = await handle.create('Contract', { 
            title: 'Small Deal', 
            value: 50000, 
            status: 'signed' 
        })

        // Create relations - only one should match all cascade filters
        await handle.create('CompanyContractRelation', {
            source: { id: techCorp.id },
            target: { id: bigContract.id },
            contractType: 'enterprise',
            signedDate: '2024-01-01',
            isActive: true,
            region: 'US'
        })

        // This won't match - not tech company
        await handle.create('CompanyContractRelation', {
            source: { id: retailCo.id },
            target: { id: bigContract.id },
            contractType: 'enterprise',
            signedDate: '2024-01-01',
            isActive: true,
            region: 'US'
        })

        // This won't match - not high value
        await handle.create('CompanyContractRelation', {
            source: { id: techCorp.id },
            target: { id: smallContract.id },
            contractType: 'standard',
            signedDate: '2024-01-01',
            isActive: true,
            region: 'US'
        })

        // Test the deepest cascade level
        const techHighValueUS = await handle.find(
            'TechHighValueUSRelation',
            undefined,
            undefined,
            [
                ['source', {attributeQuery: ['name', 'industry']}],
                ['target', {attributeQuery: ['title', 'value']}],
                'contractType', 
                'region'
            ]
        )

        expect(techHighValueUS.length).toBe(1)
        expect(techHighValueUS[0].source.name).toBe('TechCorp')
        expect(techHighValueUS[0].target.title).toBe('Enterprise Deal')
        expect(techHighValueUS[0].region).toBe('US')
    })

    test('cascade filtered relation events on create', async () => {
        const events: any[] = []

        // Define entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'status', type: 'string' })
            ]
        })

        const Task = Entity.create({
            name: 'Task',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'priority', type: 'string' })
            ]
        })

        // Base relation
        const UserTaskRelation = Relation.create({
            name: 'UserTaskRelation',
            source: User,
            sourceProperty: 'tasks',
            target: Task,
            targetProperty: 'assignees',
            type: 'n:n',
            properties: [
                Property.create({ name: 'role', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })

        // Level 1: Active assignments
        const ActiveUserTaskRelation = Relation.create({
            name: 'ActiveUserTaskRelation',
            baseRelation: UserTaskRelation,
            sourceProperty: 'activeTasks',
            targetProperty: 'activeAssignees',
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        })

        // Level 2: Active lead assignments
        const ActiveLeadRelation = Relation.create({
            name: 'ActiveLeadRelation',
            baseRelation: ActiveUserTaskRelation,
            sourceProperty: 'activeLeadTasks',
            targetProperty: 'activeLeads',
            matchExpression: MatchExp.atom({
                key: 'role',
                value: ['=', 'lead']
            })
        })

        // Setup
        setup = new DBSetup(
            [User, Task],
            [UserTaskRelation, ActiveUserTaskRelation, ActiveLeadRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create entities
        const user = await handle.create('User', { name: 'Alice', status: 'active' })
        const task = await handle.create('Task', { title: 'Important Task', priority: 'high' })

        // Clear events
        events.length = 0

        // Create relation that matches all filters
        await handle.create('UserTaskRelation', {
            source: { id: user.id },
            target: { id: task.id },
            role: 'lead',
            isActive: true
        }, events)

        // Should have 3 create events: base relation + 2 filtered relations
        const createEvents = events.filter(e => e.type === 'create')
        expect(createEvents.length).toBe(3)
        
        const eventRecordNames = createEvents.map(e => e.recordName).sort()
        expect(eventRecordNames).toEqual([
            'ActiveLeadRelation',
            'ActiveUserTaskRelation', 
            'UserTaskRelation'
        ])

        // Verify event data
        createEvents.forEach(event => {
            expect(event.record).toMatchObject({
                source: { id: user.id },
                target: { id: task.id },
                role: 'lead',
                isActive: true
            })
        })
    })

    test('cascade filtered relation events on update', async () => {
        const events: any[] = []

        // Define entities
        const Department = Entity.create({
            name: 'Department',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        })

        const Employee = Entity.create({
            name: 'Employee',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'level', type: 'string' })
            ]
        })

        // Base relation
        const DeptEmployeeRelation = Relation.create({
            name: 'DeptEmployeeRelation',
            source: Department,
            sourceProperty: 'employees',
            target: Employee,
            targetProperty: 'department',
            type: '1:n',
            properties: [
                Property.create({ name: 'position', type: 'string' }),
                Property.create({ name: 'isManager', type: 'boolean' })
            ]
        })

        // Level 1: Managers
        const ManagerRelation = Relation.create({
            name: 'ManagerRelation',
            baseRelation: DeptEmployeeRelation,
            sourceProperty: 'managers',
            targetProperty: 'managedDept',
            matchExpression: MatchExp.atom({
                key: 'isManager',
                value: ['=', true]
            })
        })

        // Level 2: Senior managers
        const SeniorManagerRelation = Relation.create({
            name: 'SeniorManagerRelation',
            baseRelation: ManagerRelation,
            sourceProperty: 'seniorManagers',
            targetProperty: 'seniorManagedDept',
            matchExpression: MatchExp.atom({
                key: 'target.level',
                value: ['=', 'senior']
            })
        })

        // Setup
        setup = new DBSetup(
            [Department, Employee],
            [DeptEmployeeRelation, ManagerRelation, SeniorManagerRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create data
        const dept = await handle.create('Department', { name: 'Engineering' })
        const emp = await handle.create('Employee', { name: 'Bob', level: 'senior' })

        // Create relation as non-manager first
        const relation = await handle.create('DeptEmployeeRelation', {
            source: { id: dept.id },
            target: { id: emp.id },
            position: 'Engineer',
            isManager: false
        })

        // Clear events
        events.length = 0

        // Update to manager - should trigger cascade filtered relation creates
        await handle.update(
            'DeptEmployeeRelation',
            MatchExp.atom({ key: 'id', value: ['=', relation.id] }),
            { isManager: true },
            events
        )

        // Should have: 1 update event for base + 2 create events for filtered relations
        const updateEvents = events.filter(e => e.type === 'update')
        const createEvents = events.filter(e => e.type === 'create')
        
        expect(updateEvents.length).toBe(1)
        expect(updateEvents[0].recordName).toBe('DeptEmployeeRelation')
        
        expect(createEvents.length).toBe(2)
        const createRecordNames = createEvents.map(e => e.recordName).sort()
        expect(createRecordNames).toEqual(['ManagerRelation', 'SeniorManagerRelation'])

        // Clear events
        events.length = 0

        // Update back to non-manager - should trigger deletes
        await handle.update(
            'DeptEmployeeRelation',
            MatchExp.atom({ key: 'id', value: ['=', relation.id] }),
            { isManager: false },
            events
        )

        const deleteEvents = events.filter(e => e.type === 'delete')
        expect(deleteEvents.length).toBe(2)
        const deleteRecordNames = deleteEvents.map(e => e.recordName).sort()
        expect(deleteRecordNames).toEqual(['ManagerRelation', 'SeniorManagerRelation'])
    })

    test('cascade filtered relation events on delete', async () => {
        const events: any[] = []

        // Simple setup with 2-level cascade
        const Company = Entity.create({
            name: 'Company',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        })

        const Project = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'status', type: 'string' })
            ]
        })

        // Base relation
        const CompanyProjectRelation = Relation.create({
            name: 'CompanyProjectRelation',
            source: Company,
            sourceProperty: 'projects',
            target: Project,
            targetProperty: 'company',
            type: '1:n',
            properties: [
                Property.create({ name: 'contractType', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })

        // Level 1: Active projects
        const ActiveProjectRelation = Relation.create({
            name: 'ActiveProjectRelation',
            baseRelation: CompanyProjectRelation,
            sourceProperty: 'activeProjects',
            targetProperty: 'activeCompany',
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        })

        // Level 2: Active enterprise projects
        const ActiveEnterpriseRelation = Relation.create({
            name: 'ActiveEnterpriseRelation',
            baseRelation: ActiveProjectRelation,
            sourceProperty: 'activeEnterpriseProjects',
            targetProperty: 'activeEnterpriseCompany',
            matchExpression: MatchExp.atom({
                key: 'contractType',
                value: ['=', 'enterprise']
            })
        })

        // Setup
        setup = new DBSetup(
            [Company, Project],
            [CompanyProjectRelation, ActiveProjectRelation, ActiveEnterpriseRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create data
        const company = await handle.create('Company', { name: 'TechCorp' })
        const project = await handle.create('Project', { name: 'Big Project', status: 'ongoing' })

        // Create relation that matches all filters
        const relation = await handle.create('CompanyProjectRelation', {
            source: { id: company.id },
            target: { id: project.id },
            contractType: 'enterprise',
            isActive: true
        })

        // Verify all filtered relations exist
        const activeProjects = await handle.find('ActiveProjectRelation')
        const activeEnterprise = await handle.find('ActiveEnterpriseRelation')
        expect(activeProjects.length).toBe(1)
        expect(activeEnterprise.length).toBe(1)

        // Clear events
        events.length = 0

        // Delete the base relation
        await handle.delete(
            'CompanyProjectRelation',
            MatchExp.atom({ key: 'id', value: ['=', relation.id] }),
            events
        )

        // Should have 3 delete events: base + 2 filtered
        const deleteEvents = events.filter(e => e.type === 'delete')
        expect(deleteEvents.length).toBe(3)
        
        const deleteRecordNames = deleteEvents.map(e => e.recordName).sort()
        expect(deleteRecordNames).toEqual([
            'ActiveEnterpriseRelation',
            'ActiveProjectRelation',
            'CompanyProjectRelation'
        ])

        // Verify all are gone
        const allRelationsAfter = await handle.find('CompanyProjectRelation')
        const activeProjectsAfter = await handle.find('ActiveProjectRelation')
        const activeEnterpriseAfter = await handle.find('ActiveEnterpriseRelation')
        
        expect(allRelationsAfter.length).toBe(0)
        expect(activeProjectsAfter.length).toBe(0)
        expect(activeEnterpriseAfter.length).toBe(0)
    })

    test('complex cascade filtered relation event propagation', async () => {
        const events: any[] = []

        // Setup a 3-level cascade
        const Organization = Entity.create({
            name: 'Organization',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'type', type: 'string' })
            ]
        })

        const Member = Entity.create({
            name: 'Member',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'level', type: 'string' }),
                Property.create({ name: 'department', type: 'string' })
            ]
        })

        // Base relation
        const OrgMemberRelation = Relation.create({
            name: 'OrgMemberRelation',
            source: Organization,
            sourceProperty: 'members',
            target: Member,
            targetProperty: 'organization',
            type: '1:n',
            properties: [
                Property.create({ name: 'role', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
                Property.create({ name: 'accessLevel', type: 'string' })
            ]
        })

        // Level 1: Active members
        const ActiveMemberRelation = Relation.create({
            name: 'ActiveMemberRelation',
            baseRelation: OrgMemberRelation,
            sourceProperty: 'activeMembers',
            targetProperty: 'activeOrg',
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        })

        // Level 2: Active admins
        const ActiveAdminRelation = Relation.create({
            name: 'ActiveAdminRelation',
            baseRelation: ActiveMemberRelation,
            sourceProperty: 'activeAdmins',
            targetProperty: 'activeAdminOrg',
            matchExpression: MatchExp.atom({
                key: 'role',
                value: ['=', 'admin']
            })
        })

        // Level 3: Active senior tech admins
        const ActiveSeniorTechAdminRelation = Relation.create({
            name: 'ActiveSeniorTechAdminRelation',
            baseRelation: ActiveAdminRelation,
            sourceProperty: 'activeSeniorTechAdmins',
            targetProperty: 'activeSeniorTechAdminOrg',
            matchExpression: MatchExp.atom({
                key: 'target.level',
                value: ['=', 'senior']
            }).and({
                key: 'target.department',
                value: ['=', 'tech']
            })
        })

        // Setup
        setup = new DBSetup(
            [Organization, Member],
            [OrgMemberRelation, ActiveMemberRelation, ActiveAdminRelation, ActiveSeniorTechAdminRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create data
        const org = await handle.create('Organization', { name: 'TechOrg', type: 'technology' })
        const member = await handle.create('Member', { 
            name: 'Alice', 
            level: 'junior',  // Start as junior
            department: 'tech' 
        })

        // Create relation that initially doesn't match all filters (junior, not senior)
        const relation = await handle.create('OrgMemberRelation', {
            source: { id: org.id },
            target: { id: member.id },
            role: 'admin',
            isActive: true,
            accessLevel: 'full'
        }, events)

        // Should create base + first two levels only (not senior level)
        const initialCreateEvents = events.filter(e => e.type === 'create')
        expect(initialCreateEvents.map(e => e.recordName).sort()).toEqual([
            'ActiveAdminRelation',
            'ActiveMemberRelation',
            'OrgMemberRelation'
        ])

        // Clear events
        events.length = 0

        // Update member to senior - should trigger creation of deepest level
        await handle.update(
            'Member',
            MatchExp.atom({ key: 'id', value: ['=', member.id] }),
            { level: 'senior' },
            events
        )

        // Should have member update + creation of senior admin relation
        const memberUpdateEvents = events.filter(e => e.type === 'update' && e.recordName === 'Member')
        const seniorCreateEvents = events.filter(e => e.type === 'create' && e.recordName === 'ActiveSeniorTechAdminRelation')
        
        expect(memberUpdateEvents.length).toBe(1)
        expect(seniorCreateEvents.length).toBe(1)

        // Verify all levels now exist
        const allLevels = await Promise.all([
            handle.find('OrgMemberRelation'),
            handle.find('ActiveMemberRelation'),
            handle.find('ActiveAdminRelation'),
            handle.find('ActiveSeniorTechAdminRelation')
        ])
        
        allLevels.forEach(level => expect(level.length).toBe(1))
    })
}) 