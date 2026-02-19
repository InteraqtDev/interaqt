import { describe, expect, it, beforeEach } from 'vitest'
import { Entity, Relation, Property } from '@core'
import TestLogger from './testLogger.js'
import { SQLiteDB } from '@drivers';
import { DBSetup } from '@storage';
import { EntityQueryHandle } from '@storage';
import { EntityToTableMap } from '@storage';
import { MatchExp } from '@storage';

describe('Long column name tests', () => {
    let db: SQLiteDB
    beforeEach(async () => {
        db = new SQLiteDB(':memory:', { logger: new TestLogger() })
        await db.open()
    })

    it('should handle entity with very long property names', async () => {
        // Create entity with very long property names (>63 characters)
        const UserEntity = Entity.create({
            name: 'UserWithVeryLongPropertyNamesForTestingColumnNameShortening',
            properties: [
                Property.create({
                    name: 'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters',
                    type: 'string'
                }),
                Property.create({
                    name: 'anotherExtremelyLongPropertyNameDesignedToTestTheColumnNameShorteningFunctionality',
                    type: 'number'
                }),
                Property.create({
                    name: 'yetAnotherSuperLongPropertyNameToEnsureOurHashBasedShorteningWorksCorrectly',
                    type: 'boolean',
                    defaultValue: () => false
                })
            ]
        })

        const setup = new DBSetup([UserEntity], [], db)
        await setup.createTables()
        
        // Verify that field names are shortened
        const userRecord = setup.map.records.UserWithVeryLongPropertyNamesForTestingColumnNameShortening
        expect(userRecord).toBeDefined()
        
        // Check that fields exist and are shortened
        const longProp1 = userRecord.attributes.thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters
        expect(longProp1).toBeDefined()
        expect(longProp1.field).toBeDefined()
        expect(longProp1.field!.length).toBeLessThan(64)
        
        const longProp2 = userRecord.attributes.anotherExtremelyLongPropertyNameDesignedToTestTheColumnNameShorteningFunctionality
        expect(longProp2).toBeDefined()
        expect(longProp2.field).toBeDefined()
        expect(longProp2.field!.length).toBeLessThan(64)
        
        const longProp3 = userRecord.attributes.yetAnotherSuperLongPropertyNameToEnsureOurHashBasedShorteningWorksCorrectly
        expect(longProp3).toBeDefined()
        expect(longProp3.field).toBeDefined()
        expect(longProp3.field!.length).toBeLessThan(64)
        
        // Verify fields are unique
        const fieldNames = new Set([longProp1.field, longProp2.field, longProp3.field])
        expect(fieldNames.size).toBe(3) // All should be unique
        
        // Verify all field names are under 64 characters
        const allFields = Object.values(userRecord.attributes)
            .filter(attr => attr.field)
            .map(attr => attr.field)
        
        allFields.forEach(fieldName => {
            expect(fieldName!.length).toBeLessThan(64)
        })
    })

    it('should handle relations with very long names', async () => {
        const UserEntity = Entity.create({
            name: 'UserWithExtremelyLongEntityNameForTestingPurposes',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        })
        
        const TeamEntity = Entity.create({
            name: 'TeamWithAnEquallyLongEntityNameToTestRelationNameShortening',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        })
        
        const MembershipRelation = Relation.create({
            name: 'UserWithExtremelyLongEntityNameForTestingPurposes_belongsToWithVeryLongPropertyName_members_TeamWithAnEquallyLongEntityNameToTestRelationNameShortening',
            type: 'n:n',
            source: UserEntity,
            sourceProperty: 'UserWithExtremelyLongEntityNameForTestingPurposes_belongsToWithVeryLongPropertyName_members_TeamWithAnEquallyLongEntityNameToTestRelationNameShortening_source',
            target: TeamEntity,
            targetProperty: 'UserWithExtremelyLongEntityNameForTestingPurposes_belongsToWithVeryLongPropertyName_members_TeamWithAnEquallyLongEntityNameToTestRelationNameShortening_target',
            properties: [
                Property.create({
                    name: 'roleWithAnExtremelyLongPropertyNameInTheRelationToTestFieldShortening',
                    type: 'string'
                })
            ]
        })
        
        const setup = new DBSetup([UserEntity, TeamEntity], [MembershipRelation], db)
        await setup.createTables()
        
        // Verify relation fields are shortened
        const relationRecord = setup.map.records[MembershipRelation.name!]
        expect(relationRecord).toBeDefined()
        
        // Check source and target fields
        const sourceAttr = relationRecord.attributes.source
        const targetAttr = relationRecord.attributes.target
        
        expect(sourceAttr).toBeDefined()
        expect(sourceAttr.field).toBeDefined()
        expect(sourceAttr.field!.length).toBeLessThan(64)
        
        expect(targetAttr).toBeDefined()
        expect(targetAttr.field).toBeDefined()
        expect(targetAttr.field!.length).toBeLessThan(64)
        
        // Check relation property field
        const roleProp = relationRecord.attributes.roleWithAnExtremelyLongPropertyNameInTheRelationToTestFieldShortening
        expect(roleProp).toBeDefined()
        expect(roleProp.field).toBeDefined()
        expect(roleProp.field!.length).toBeLessThan(64)
    })

    it('should generate unique field names for similar long property names', async () => {
        // Create entity with similar long property names to test uniqueness
        const ProductEntity = Entity.create({
            name: 'Product',
            properties: [
                Property.create({
                    name: 'thisIsAVeryLongPropertyNameThatExceedsTheDatabaseLimitAndNeedsShortening',
                    type: 'string'
                }),
                Property.create({
                    name: 'thisIsAVeryLongPropertyNameThatExceedsTheDatabaseLimitAndNeedsShorteningAlso',
                    type: 'string'
                }),
                Property.create({
                    name: 'thisIsAVeryLongPropertyNameThatExceedsTheDatabaseLimitAndNeedsShorteningToo',
                    type: 'string'
                })
            ]
        })

        const setup = new DBSetup([ProductEntity], [], db)
        await setup.createTables()
        
        const productRecord = setup.map.records.Product
        expect(productRecord).toBeDefined()
        
        // Collect all field names
        const fieldNames = Object.values(productRecord.attributes)
            .filter(attr => attr.field)
            .map(attr => attr.field)
        
        // Verify all are unique
        const uniqueFields = new Set(fieldNames)
        expect(uniqueFields.size).toBe(fieldNames.length)
        
        // Verify all are under 64 characters
        fieldNames.forEach(fieldName => {
            expect(fieldName!.length).toBeLessThan(64)
        })
    })

    it('should create valid SQL with shortened column names', async () => {
        const TestEntity = Entity.create({
            name: 'TestEntityWithVeryLongName',
            properties: [
                Property.create({
                    name: 'extremelyLongPropertyNameThatWouldNormallyExceedDatabaseColumnNameLimits',
                    type: 'string',
                    defaultValue: () => 'default'
                })
            ]
        })

        const setup = new DBSetup([TestEntity], [], db)
        
        // Get the SQL statements
        const sqlStatements = setup.createTableSQL()
        expect(sqlStatements).toHaveLength(1)
        
        const sql = sqlStatements[0]
        expect(sql).toContain('CREATE TABLE')
        
        // Verify that the column name in SQL is shortened
        const columnMatch = sql.match(/"([^"]+)" TEXT/)
        expect(columnMatch).toBeTruthy()
        
        const columnName = columnMatch![1]
        expect(columnName.length).toBeLessThan(64)
        
        // Actually create the table to ensure SQL is valid
        await setup.createTables()
    })

    it('should handle CRUD operations with entities having very long property names', async () => {
        // Create entities with very long property names
        const UserEntity = Entity.create({
            name: 'UserWithVeryLongPropertyNamesForCRUDTesting',
            properties: [
                Property.create({
                    name: 'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters',
                    type: 'string'
                }),
                Property.create({
                    name: 'anotherExtremelyLongPropertyNameDesignedToTestTheColumnNameShorteningFunctionality',
                    type: 'number'
                }),
                Property.create({
                    name: 'yetAnotherSuperLongPropertyNameToEnsureOurHashBasedShorteningWorksCorrectly',
                    type: 'boolean',
                    defaultValue: () => false
                })
            ]
        })

        const setup = new DBSetup([UserEntity], [], db)
        await setup.createTables()
        
        const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // CREATE - Test creating entity with long property names
        const userData = {
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 'Test Value',
            anotherExtremelyLongPropertyNameDesignedToTestTheColumnNameShorteningFunctionality: 42,
            yetAnotherSuperLongPropertyNameToEnsureOurHashBasedShorteningWorksCorrectly: true
        }
        
        const createdUser = await entityQueryHandle.create('UserWithVeryLongPropertyNamesForCRUDTesting', userData)
        expect(createdUser).toBeDefined()
        expect(createdUser.id).toBeDefined()

        // READ - Test querying entity with long property names
        const foundUser = await entityQueryHandle.findOne(
            'UserWithVeryLongPropertyNamesForCRUDTesting',
            MatchExp.atom({ 
                key: 'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters', 
                value: ['=', 'Test Value'] 
            }),
            undefined,
            [
                'id',
                'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters',
                'anotherExtremelyLongPropertyNameDesignedToTestTheColumnNameShorteningFunctionality',
                'yetAnotherSuperLongPropertyNameToEnsureOurHashBasedShorteningWorksCorrectly'
            ]
        )
        
        expect(foundUser).toBeDefined()
        expect(foundUser.thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters).toBe('Test Value')
        expect(foundUser.anotherExtremelyLongPropertyNameDesignedToTestTheColumnNameShorteningFunctionality).toBe(42)
        expect(foundUser.yetAnotherSuperLongPropertyNameToEnsureOurHashBasedShorteningWorksCorrectly).toBe(1) // SQLite stores boolean as 1/0

        // UPDATE - Test updating entity with long property names
        const updateData = {
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 'Updated Value',
            anotherExtremelyLongPropertyNameDesignedToTestTheColumnNameShorteningFunctionality: 99,
            yetAnotherSuperLongPropertyNameToEnsureOurHashBasedShorteningWorksCorrectly: false
        }
        
        const updated = await entityQueryHandle.update(
            'UserWithVeryLongPropertyNamesForCRUDTesting',
            MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
            updateData
        )
        
        expect(updated).toHaveLength(1)
        expect(updated[0].id).toBe(createdUser.id)
        
        // Verify update
        const updatedUser = await entityQueryHandle.findOne(
            'UserWithVeryLongPropertyNamesForCRUDTesting',
            MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
            undefined,
            [
                'id',
                'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters',
                'anotherExtremelyLongPropertyNameDesignedToTestTheColumnNameShorteningFunctionality',
                'yetAnotherSuperLongPropertyNameToEnsureOurHashBasedShorteningWorksCorrectly'
            ]
        )
        
        expect(updatedUser.thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters).toBe('Updated Value')
        expect(updatedUser.anotherExtremelyLongPropertyNameDesignedToTestTheColumnNameShorteningFunctionality).toBe(99)
        expect(updatedUser.yetAnotherSuperLongPropertyNameToEnsureOurHashBasedShorteningWorksCorrectly).toBe(0) // SQLite stores boolean as 1/0

        // DELETE - Test deleting entity with long property names
        await entityQueryHandle.delete(
            'UserWithVeryLongPropertyNamesForCRUDTesting',
            MatchExp.atom({ key: 'id', value: ['=', createdUser.id] })
        )
        
        // Verify deletion
        const deletedUser = await entityQueryHandle.findOne(
            'UserWithVeryLongPropertyNamesForCRUDTesting',
            MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
            undefined,
            ['id']
        )
        
        expect(deletedUser).toBeUndefined()
    })

    it('should handle CRUD operations with relations having very long names', async () => {
        // Create entities and relations with very long names
        const UserEntity = Entity.create({
            name: 'UserWithExtremelyLongEntityNameForRelationCRUDTesting',
            properties: [
                Property.create({ name: 'userName', type: 'string' }),
                Property.create({ 
                    name: 'thisIsAVeryLongPropertyNameInTheUserEntityToTestColumnShortening', 
                    type: 'string' 
                })
            ]
        })
        
        const TeamEntity = Entity.create({
            name: 'TeamWithAnEquallyLongEntityNameToTestRelationCRUDOperations',
            properties: [
                Property.create({ name: 'teamName', type: 'string' }),
                Property.create({ 
                    name: 'anotherExtremelyLongPropertyNameInTheTeamEntityForTesting', 
                    type: 'number' 
                })
            ]
        })
        
        const MembershipRelation = Relation.create({
            name: 'UserWithExtremelyLongEntityNameForRelationCRUDTesting_belongsToWithVeryLongPropertyName_members_TeamWithAnEquallyLongEntityNameToTestRelationCRUDOperations',
            type: 'n:n',
            source: UserEntity,
            sourceProperty: 'belongsToTeamsWithVeryLongPropertyNameToTestColumnShortening',
            target: TeamEntity,
            targetProperty: 'membersWithExtremelyLongPropertyNameToTestFieldShortening',
            properties: [
                Property.create({
                    name: 'roleWithAnExtremelyLongPropertyNameInTheRelationToTestFieldShortening',
                    type: 'string'
                }),
                Property.create({
                    name: 'joinDateWithAnotherVeryLongPropertyNameToEnsureProperHandling',
                    type: 'string'
                })
            ]
        })
        
        const setup = new DBSetup([UserEntity, TeamEntity], [MembershipRelation], db)
        await setup.createTables()
        
        const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // CREATE - Create user with related teams
        const userWithTeams = await entityQueryHandle.create('UserWithExtremelyLongEntityNameForRelationCRUDTesting', {
            userName: 'Alice',
            thisIsAVeryLongPropertyNameInTheUserEntityToTestColumnShortening: 'Test Value',
            // Use sourceProperty since we're creating from the User side
            belongsToTeamsWithVeryLongPropertyNameToTestColumnShortening: [
                {
                    teamName: 'Team A',
                    anotherExtremelyLongPropertyNameInTheTeamEntityForTesting: 100
                },
                {
                    teamName: 'Team B',
                    anotherExtremelyLongPropertyNameInTheTeamEntityForTesting: 200
                }
            ]
        })
        
        expect(userWithTeams).toBeDefined()
        expect(userWithTeams.id).toBeDefined()

        // Delete the initially created teams since they don't have relation properties
        await entityQueryHandle.delete(
            'TeamWithAnEquallyLongEntityNameToTestRelationCRUDOperations', 
            MatchExp.atom({ key: 'teamName', value: ['=', 'Team A'] })
        )
        await entityQueryHandle.delete(
            'TeamWithAnEquallyLongEntityNameToTestRelationCRUDOperations', 
            MatchExp.atom({ key: 'teamName', value: ['=', 'Team B'] })
        )
        
        // Recreate teams with relation properties
        const teamAData = await entityQueryHandle.create('TeamWithAnEquallyLongEntityNameToTestRelationCRUDOperations', {
            teamName: 'Team A',
            anotherExtremelyLongPropertyNameInTheTeamEntityForTesting: 100
        })
        
        const teamBData = await entityQueryHandle.create('TeamWithAnEquallyLongEntityNameToTestRelationCRUDOperations', {
            teamName: 'Team B',
            anotherExtremelyLongPropertyNameInTheTeamEntityForTesting: 200
        })

        // Now update user to establish relations with properties
        await entityQueryHandle.update(
            'UserWithExtremelyLongEntityNameForRelationCRUDTesting',
            MatchExp.atom({ key: 'id', value: ['=', userWithTeams.id] }),
            {
                belongsToTeamsWithVeryLongPropertyNameToTestColumnShortening: [
                    {
                        id: teamAData.id,
                        roleWithAnExtremelyLongPropertyNameInTheRelationToTestFieldShortening: 'Leader',
                        joinDateWithAnotherVeryLongPropertyNameToEnsureProperHandling: '2024-01-01'
                    },
                    {
                        id: teamBData.id,
                        roleWithAnExtremelyLongPropertyNameInTheRelationToTestFieldShortening: 'Member',
                        joinDateWithAnotherVeryLongPropertyNameToEnsureProperHandling: '2024-01-02'
                    }
                ]
            }
        )
        
        // READ - Query user with teams
        const foundUser = await entityQueryHandle.findOne(
            'UserWithExtremelyLongEntityNameForRelationCRUDTesting',
            MatchExp.atom({ key: 'id', value: ['=', userWithTeams.id] }),
            undefined,
            [
                'id',
                'userName',
                'thisIsAVeryLongPropertyNameInTheUserEntityToTestColumnShortening',
                ['belongsToTeamsWithVeryLongPropertyNameToTestColumnShortening', {
                    attributeQuery: [
                        'id',
                        'teamName',
                        'anotherExtremelyLongPropertyNameInTheTeamEntityForTesting'
                        // Relation properties will be included automatically in the relation data
                    ]
                }]
            ]
        )
        
        expect(foundUser).toBeDefined()
        expect(foundUser.userName).toBe('Alice')
        expect(foundUser.thisIsAVeryLongPropertyNameInTheUserEntityToTestColumnShortening).toBe('Test Value')
        
        const teams = foundUser.belongsToTeamsWithVeryLongPropertyNameToTestColumnShortening
        expect(teams).toHaveLength(2)
        
        // Sort teams for consistent testing
        teams.sort((a: any, b: any) => a.teamName.localeCompare(b.teamName))
        
        expect(teams[0].teamName).toBe('Team A')
        expect(teams[0].anotherExtremelyLongPropertyNameInTheTeamEntityForTesting).toBe(100)
        // Note: Relation properties are stored in the relation table, not on the entity
        
        expect(teams[1].teamName).toBe('Team B')
        expect(teams[1].anotherExtremelyLongPropertyNameInTheTeamEntityForTesting).toBe(200)

        // UPDATE - Update user and one of the teams
        const teamA = teams[0]
        await entityQueryHandle.update(
            'TeamWithAnEquallyLongEntityNameToTestRelationCRUDOperations',
            MatchExp.atom({ key: 'id', value: ['=', teamA.id] }),
            {
                teamName: 'Team A Updated',
                anotherExtremelyLongPropertyNameInTheTeamEntityForTesting: 150
            }
        )
        
        // Update user property
        await entityQueryHandle.update(
            'UserWithExtremelyLongEntityNameForRelationCRUDTesting',
            MatchExp.atom({ key: 'id', value: ['=', userWithTeams.id] }),
            {
                thisIsAVeryLongPropertyNameInTheUserEntityToTestColumnShortening: 'Updated User Value'
            }
        )
        
        // Verify updates
        const updatedUser = await entityQueryHandle.findOne(
            'UserWithExtremelyLongEntityNameForRelationCRUDTesting',
            MatchExp.atom({ key: 'id', value: ['=', userWithTeams.id] }),
            undefined,
            [
                'id',
                'userName',
                'thisIsAVeryLongPropertyNameInTheUserEntityToTestColumnShortening',
                ['belongsToTeamsWithVeryLongPropertyNameToTestColumnShortening', {
                    attributeQuery: [
                        'id',
                        'teamName',
                        'anotherExtremelyLongPropertyNameInTheTeamEntityForTesting'
                    ]
                }]
            ]
        )
        
        expect(updatedUser.thisIsAVeryLongPropertyNameInTheUserEntityToTestColumnShortening).toBe('Updated User Value')
        
        const updatedTeams = updatedUser.belongsToTeamsWithVeryLongPropertyNameToTestColumnShortening
        updatedTeams.sort((a: any, b: any) => a.teamName.localeCompare(b.teamName))
        
        expect(updatedTeams[0].teamName).toBe('Team A Updated')
        expect(updatedTeams[0].anotherExtremelyLongPropertyNameInTheTeamEntityForTesting).toBe(150)

        // DELETE - Delete one team and then the user
        await entityQueryHandle.delete(
            'TeamWithAnEquallyLongEntityNameToTestRelationCRUDOperations',
            MatchExp.atom({ key: 'id', value: ['=', teamA.id] })
        )
        
        // Verify team deletion
        const userAfterTeamDelete = await entityQueryHandle.findOne(
            'UserWithExtremelyLongEntityNameForRelationCRUDTesting',
            MatchExp.atom({ key: 'id', value: ['=', userWithTeams.id] }),
            undefined,
            [
                'id',
                ['belongsToTeamsWithVeryLongPropertyNameToTestColumnShortening', {
                    attributeQuery: ['id', 'teamName']
                }]
            ]
        )
        
        expect(userAfterTeamDelete.belongsToTeamsWithVeryLongPropertyNameToTestColumnShortening).toHaveLength(1)
        expect(userAfterTeamDelete.belongsToTeamsWithVeryLongPropertyNameToTestColumnShortening[0].teamName).toBe('Team B')
        
        // Delete user (should cascade delete remaining relations)
        await entityQueryHandle.delete(
            'UserWithExtremelyLongEntityNameForRelationCRUDTesting',
            MatchExp.atom({ key: 'id', value: ['=', userWithTeams.id] })
        )
        
        // Verify user deletion
        const deletedUser = await entityQueryHandle.findOne(
            'UserWithExtremelyLongEntityNameForRelationCRUDTesting',
            MatchExp.atom({ key: 'id', value: ['=', userWithTeams.id] }),
            undefined,
            ['id']
        )
        
        expect(deletedUser).toBeUndefined()
        
        // Verify Team B still exists (no cascade from user to team)
        const remainingTeams = await entityQueryHandle.find(
            'TeamWithAnEquallyLongEntityNameToTestRelationCRUDOperations',
            undefined,
            undefined,
            ['id', 'teamName']
        )
        
        expect(remainingTeams).toHaveLength(1)
        expect(remainingTeams[0].teamName).toBe('Team B')
    })

    it('should handle orderBy with very long property names', async () => {
        // Test ordering by long property names
        const UserEntity = Entity.create({
            name: 'UserForOrderByTest',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({
                    name: 'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters',
                    type: 'number'
                })
            ]
        })

        const setup = new DBSetup([UserEntity], [], db)
        await setup.createTables()
        
        const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test users with different values for the long property
        await entityQueryHandle.create('UserForOrderByTest', {
            name: 'Alice',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 30
        })
        
        await entityQueryHandle.create('UserForOrderByTest', {
            name: 'Bob',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 10
        })
        
        await entityQueryHandle.create('UserForOrderByTest', {
            name: 'Charlie',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 20
        })

        // Test ordering by the long property name in ascending order
        const usersAsc = await entityQueryHandle.find(
            'UserForOrderByTest',
            undefined,
            {
                orderBy: {
                    thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 'ASC'
                }
            },
            [
                'name',
                'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters'
            ]
        )
        
        expect(usersAsc).toHaveLength(3)
        expect(usersAsc[0].name).toBe('Bob')
        expect(usersAsc[0].thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters).toBe(10)
        expect(usersAsc[1].name).toBe('Charlie')
        expect(usersAsc[1].thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters).toBe(20)
        expect(usersAsc[2].name).toBe('Alice')
        expect(usersAsc[2].thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters).toBe(30)

        // Test ordering by the long property name in descending order
        const usersDesc = await entityQueryHandle.find(
            'UserForOrderByTest',
            undefined,
            {
                orderBy: {
                    thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 'DESC'
                }
            },
            [
                'name',
                'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters'
            ]
        )
        
        expect(usersDesc).toHaveLength(3)
        expect(usersDesc[0].name).toBe('Alice')
        expect(usersDesc[0].thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters).toBe(30)
        expect(usersDesc[1].name).toBe('Charlie')
        expect(usersDesc[1].thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters).toBe(20)
        expect(usersDesc[2].name).toBe('Bob')
        expect(usersDesc[2].thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters).toBe(10)
    })

    it('should handle orderBy with long property name not in attributeQuery', async () => {
        // This test verifies the bug: orderBy uses a long property name that is NOT in attributeQuery
        const UserEntity = Entity.create({
            name: 'UserForOrderByBugTest',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({
                    name: 'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters',
                    type: 'number'
                })
            ]
        })

        const setup = new DBSetup([UserEntity], [], db)
        await setup.createTables()
        
        const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test users
        await entityQueryHandle.create('UserForOrderByBugTest', {
            name: 'Alice',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 30
        })
        
        await entityQueryHandle.create('UserForOrderByBugTest', {
            name: 'Bob',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 10
        })
        
        await entityQueryHandle.create('UserForOrderByBugTest', {
            name: 'Charlie',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 20
        })

        // BUG TEST: Order by the long property, but DON'T include it in attributeQuery
        // This should fail if the bug exists, because the framework will try to use 
        // the original long field name instead of the shortened one
        const users = await entityQueryHandle.find(
            'UserForOrderByBugTest',
            undefined,
            {
                orderBy: {
                    thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 'ASC'
                }
            },
            ['name'] // Note: NOT including the long property in attributeQuery
        )
        
        expect(users).toHaveLength(3)
        // If the bug exists, this test will fail with a database error about unknown column
        expect(users[0].name).toBe('Bob')
        expect(users[1].name).toBe('Charlie')
        expect(users[2].name).toBe('Alice')
    })

    it('should handle orderBy with relation path (n:1) on long property names', async () => {
        // Test ordering by related entity's long property name
        const UserEntity = Entity.create({
            name: 'UserForRelationOrderByTest',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({
                    name: 'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters',
                    type: 'number'
                })
            ]
        })

        // Create n:1 self-referencing relation
        const LeaderRelation = Relation.create({
            name: 'UserLeaderRelation',
            type: 'n:1',
            source: UserEntity,
            sourceProperty: 'leader',
            target: UserEntity,
            targetProperty: 'members'
        })

        const setup = new DBSetup([UserEntity], [LeaderRelation], db)
        await setup.createTables()
        
        const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create leaders first
        const leader1 = await entityQueryHandle.create('UserForRelationOrderByTest', {
            name: 'Leader1',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 100
        })
        
        const leader2 = await entityQueryHandle.create('UserForRelationOrderByTest', {
            name: 'Leader2',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 50
        })
        
        const leader3 = await entityQueryHandle.create('UserForRelationOrderByTest', {
            name: 'Leader3',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 200
        })

        // Create members with leaders
        await entityQueryHandle.create('UserForRelationOrderByTest', {
            name: 'Member1',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 10,
            leader: { id: leader2.id }
        })
        
        await entityQueryHandle.create('UserForRelationOrderByTest', {
            name: 'Member2',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 20,
            leader: { id: leader1.id }
        })
        
        await entityQueryHandle.create('UserForRelationOrderByTest', {
            name: 'Member3',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 30,
            leader: { id: leader3.id }
        })

        // Test: Order by leader's long property name (ascending)
        const membersOrderedByLeaderScore = await entityQueryHandle.find(
            'UserForRelationOrderByTest',
            MatchExp.atom({
                key: 'leader.id',
                value: ['not', null]
            }),
            {
                orderBy: {
                    'leader.thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters': 'ASC'
                }
            },
            [
                'name',
                'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters',
                ['leader', {
                    attributeQuery: [
                        'name',
                        'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters'
                    ]
                }]
            ]
        )
        
        // Members should be ordered by their leader's score: Leader2(50), Leader1(100), Leader3(200)
        expect(membersOrderedByLeaderScore).toHaveLength(3)
        expect(membersOrderedByLeaderScore[0].name).toBe('Member1')
        expect(membersOrderedByLeaderScore[0].leader.name).toBe('Leader2')
        expect(membersOrderedByLeaderScore[0].leader.thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters).toBe(50)
        
        expect(membersOrderedByLeaderScore[1].name).toBe('Member2')
        expect(membersOrderedByLeaderScore[1].leader.name).toBe('Leader1')
        expect(membersOrderedByLeaderScore[1].leader.thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters).toBe(100)
        
        expect(membersOrderedByLeaderScore[2].name).toBe('Member3')
        expect(membersOrderedByLeaderScore[2].leader.name).toBe('Leader3')
        expect(membersOrderedByLeaderScore[2].leader.thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters).toBe(200)

        // Test: Order by leader's long property name (descending)
        const membersOrderedByLeaderScoreDesc = await entityQueryHandle.find(
            'UserForRelationOrderByTest',
            MatchExp.atom({
                key: 'leader.id',
                value: ['not', null]
            }),
            {
                orderBy: {
                    'leader.thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters': 'DESC'
                }
            },
            ['name']
        )
        
        expect(membersOrderedByLeaderScoreDesc).toHaveLength(3)
        expect(membersOrderedByLeaderScoreDesc[0].name).toBe('Member3')
        expect(membersOrderedByLeaderScoreDesc[1].name).toBe('Member2')
        expect(membersOrderedByLeaderScoreDesc[2].name).toBe('Member1')
    })

    it('should handle orderBy with multi-level relation path on long property names', async () => {
        // Test ordering by related entity's related entity's long property name
        const UserEntity = Entity.create({
            name: 'UserForMultiLevelOrderByTest',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({
                    name: 'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters',
                    type: 'number'
                })
            ]
        })

        // Create n:1 self-referencing relation
        const LeaderRelation = Relation.create({
            name: 'UserMultiLevelLeaderRelation',
            type: 'n:1',
            source: UserEntity,
            sourceProperty: 'leader',
            target: UserEntity,
            targetProperty: 'members'
        })

        const setup = new DBSetup([UserEntity], [LeaderRelation], db)
        await setup.createTables()
        
        const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create top leader
        const topLeader = await entityQueryHandle.create('UserForMultiLevelOrderByTest', {
            name: 'TopLeader',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 1000
        })
        
        // Create mid-level leaders
        const midLeader1 = await entityQueryHandle.create('UserForMultiLevelOrderByTest', {
            name: 'MidLeader1',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 300,
            leader: { id: topLeader.id }
        })
        
        const midLeader2 = await entityQueryHandle.create('UserForMultiLevelOrderByTest', {
            name: 'MidLeader2',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 500,
            leader: { id: topLeader.id }
        })

        // Create bottom-level members
        await entityQueryHandle.create('UserForMultiLevelOrderByTest', {
            name: 'Member1',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 10,
            leader: { id: midLeader2.id }
        })
        
        await entityQueryHandle.create('UserForMultiLevelOrderByTest', {
            name: 'Member2',
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 20,
            leader: { id: midLeader1.id }
        })

        // Test: Order by leader's leader's long property name
        // Both members have the same top leader (score 1000), so we order by direct leader's score
        const membersOrderedByLeaderLeaderScore = await entityQueryHandle.find(
            'UserForMultiLevelOrderByTest',
            MatchExp.atom({
                key: 'leader.leader.id',
                value: ['not', null]
            }),
            {
                orderBy: {
                    'leader.thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters': 'ASC'
                }
            },
            ['name']
        )
        
        // Members should be ordered by their direct leader's score: MidLeader1(300), MidLeader2(500)
        expect(membersOrderedByLeaderLeaderScore).toHaveLength(2)
        expect(membersOrderedByLeaderLeaderScore[0].name).toBe('Member2')
        expect(membersOrderedByLeaderLeaderScore[1].name).toBe('Member1')
    })
}) 