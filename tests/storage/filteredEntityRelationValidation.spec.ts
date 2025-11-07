import { describe, it, expect } from 'vitest';
import { Entity, Relation, Property } from '@shared';
import { DBSetup } from '@storage';
import { MatchExp } from '@storage';
import { PGLiteDB } from '@dbclients';

describe('Filtered Entity Relation Validation', () => {
    it('should allow filtered entity as relation source', async () => {
        const db = new PGLiteDB()
        await db.open()

        // Define base entity
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })

        const Post = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        })

        // Define filtered entity
        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        })

        // Create relation with filtered entity as source - now allowed
        const ActiveUserPostRelation = Relation.create({
            source: ActiveUser, // Now allowed
            sourceProperty: 'posts',
            target: Post,
            targetProperty: 'author',
            type: 'n:1'
        })

        const entities = [User, Post, ActiveUser]
        const relations = [ActiveUserPostRelation]

        // This should work fine now
        const setup = new DBSetup(entities, relations, db)
        await setup.createTables()

        await db.close()
    })

    it('should allow filtered entity as relation target', async () => {
        const db = new PGLiteDB()
        await db.open()

        // Define base entity
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })

        const Post = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        })

        // Define filtered entity
        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        })

        // Create relation with filtered entity as target - now allowed
        const PostActiveUserRelation = Relation.create({
            source: Post,
            sourceProperty: 'author',
            target: ActiveUser, // Now allowed
            targetProperty: 'posts',
            type: '1:n'
        })

        const entities = [User, Post, ActiveUser]
        const relations = [PostActiveUserRelation]

        // This should work fine now
        const setup = new DBSetup(entities, relations, db)
        await setup.createTables()

        await db.close()
    })

    it('should allow relation with base entity', async () => {
        const db = new PGLiteDB()
        await db.open()

        // Define base entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })

        const Post = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        })

        // Define filtered entity
        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        })

        // Create relation with base entities (correct approach)
        const UserPostRelation = Relation.create({
            source: User, // Use base entity
            sourceProperty: 'posts',
            target: Post,
            targetProperty: 'author',
            type: 'n:1'
        })

        const entities = [User, Post, ActiveUser]
        const relations = [UserPostRelation]

        // This should work fine
        const setup = new DBSetup(entities, relations, db)
        await setup.createTables()

        await db.close()
    })

    it('should allow filtered relation (relation as base)', async () => {
        const db = new PGLiteDB()
        await db.open()

        // Define base entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        })

        const Team = Entity.create({
            name: 'Team',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        })

        // Create base relation
        const UserTeamRelation = Relation.create({
            source: User,
            sourceProperty: 'teams',
            target: Team,
            targetProperty: 'members',
            type: 'n:n',
            properties: [
                Property.create({ name: 'role', type: 'string' })
            ]
        })

        // Create filtered entity based on relation (this is allowed)
        const AdminMemberships = Entity.create({
            name: 'AdminMemberships',
            baseEntity: UserTeamRelation,
            matchExpression: MatchExp.atom({
                key: 'role',
                value: ['=', 'admin']
            })
        })

        const entities = [User, Team, AdminMemberships]
        const relations = [UserTeamRelation]

        // This should work fine
        const setup = new DBSetup(entities, relations, db)
        await setup.createTables()

        await db.close()
    })
})

