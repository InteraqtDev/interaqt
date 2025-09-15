import {afterEach, beforeEach, describe, expect, test} from "vitest";
import {createCommonData} from "./data/common";
import {DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle} from "@storage";
import {SQLiteDB} from '@runtime';

describe('NULL value behavior with different operators', () => {
    let db: SQLiteDB
    let setup
    let entityQueryHandle: EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB(':memory:')
        await db.open()
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        await db.close()
    })

    test('NOT IN operator with NULL values', async () => {
        // Create test data
        const user1 = await entityQueryHandle.create('User', {
            name: 'user1',
            age: 25,
            gender: 'male'
        })

        const user2 = await entityQueryHandle.create('User', {
            name: 'user2',
            age: 30,
            gender: 'female'
        })

        const user3 = await entityQueryHandle.create('User', {
            name: 'user3',
            age: 35,
            gender: null // NULL gender
        })

        // Test NOT IN behavior with NULL
        // In SQL, "gender NOT IN ('male')" will NOT include NULL values
        const notInResult = await entityQueryHandle.find(
            'User',
            MatchExp.atom({ key: 'gender', value: ['in', ['male']]}).not(),
            {},
            ['name', 'gender']
        )

        console.log('NOT IN result:', notInResult.map(u => ({ name: u.name, gender: u.gender })))
        
        // SQL standard: NOT IN does not include NULL values
        const filteredResult = notInResult.filter(u => ['user2', 'user3'].includes(u.name))
        expect(filteredResult).toHaveLength(1) // Only user2, not user3
        expect(filteredResult[0].name).toBe('user2')
    })

    test('Comparison operators (<, >, <=, >=) with NULL values', async () => {
        // Create test data
        const user1 = await entityQueryHandle.create('User', {
            name: 'young',
            age: 20
        })

        const user2 = await entityQueryHandle.create('User', {
            name: 'middle',
            age: 30
        })

        const user3 = await entityQueryHandle.create('User', {
            name: 'nullAge',
            age: null // NULL age
        })

        // Test > operator
        const greaterThan25 = await entityQueryHandle.find(
            'User',
            MatchExp.atom({ key: 'age', value: ['>', 25]}),
            {},
            ['name', 'age']
        )

        console.log('age > 25:', greaterThan25.map(u => ({ name: u.name, age: u.age })))
        
        // NULL > 25 is NULL (not true), so user3 should not be included
        const filteredGT = greaterThan25.filter(u => ['young', 'middle', 'nullAge'].includes(u.name))
        expect(filteredGT).toHaveLength(1)
        expect(filteredGT[0].name).toBe('middle')

        // Test < operator
        const lessThan25 = await entityQueryHandle.find(
            'User',
            MatchExp.atom({ key: 'age', value: ['<', 25]}),
            {},
            ['name', 'age']
        )

        console.log('age < 25:', lessThan25.map(u => ({ name: u.name, age: u.age })))
        
        // NULL < 25 is NULL (not true), so user3 should not be included
        const filteredLT = lessThan25.filter(u => ['young', 'middle', 'nullAge'].includes(u.name))
        expect(filteredLT).toHaveLength(1)
        expect(filteredLT[0].name).toBe('young')

        // Test NOT with comparison
        const notGreaterThan25 = await entityQueryHandle.find(
            'User',
            MatchExp.atom({ key: 'age', value: ['>', 25]}).not(),
            {},
            ['name', 'age']
        )

        console.log('NOT (age > 25):', notGreaterThan25.map(u => ({ name: u.name, age: u.age })))
        
        // NOT (NULL > 25) is NOT (NULL) which is still NULL, so user3 should not be included
        const filteredNot = notGreaterThan25.filter(u => ['young', 'middle', 'nullAge'].includes(u.name))
        expect(filteredNot).toHaveLength(1)
        expect(filteredNot[0].name).toBe('young')
    })

    test('LIKE operator with NULL values', async () => {
        const user1 = await entityQueryHandle.create('User', {
            name: 'john',
            gender: 'male'
        })

        const user2 = await entityQueryHandle.create('User', {
            name: 'jane',
            gender: 'female'
        })

        const user3 = await entityQueryHandle.create('User', {
            name: 'nullGender',
            gender: null
        })

        // Test LIKE operator
        const likeResult = await entityQueryHandle.find(
            'User',
            MatchExp.atom({ key: 'gender', value: ['like', '%ale']}),
            {},
            ['name', 'gender']
        )

        console.log('LIKE %ale:', likeResult.map(u => ({ name: u.name, gender: u.gender })))
        
        // NULL LIKE '%ale' is NULL (not true)
        const filteredLike = likeResult.filter(u => ['john', 'jane', 'nullGender'].includes(u.name))
        expect(filteredLike).toHaveLength(2) // john and jane, not nullGender
        expect(filteredLike.map(u => u.name).sort()).toEqual(['jane', 'john'])

        // Test NOT LIKE
        const notLikeResult = await entityQueryHandle.find(
            'User',
            MatchExp.atom({ key: 'gender', value: ['like', '%ale']}).not(),
            {},
            ['name', 'gender']
        )

        console.log('NOT LIKE %ale:', notLikeResult.map(u => ({ name: u.name, gender: u.gender })))
        
        // NOT (NULL LIKE '%ale') is still NULL
        const filteredNotLike = notLikeResult.filter(u => ['john', 'jane', 'nullGender'].includes(u.name))
        expect(filteredNotLike).toHaveLength(0) // None of them match
    })

    test('BETWEEN operator with NULL values', async () => {
        const user1 = await entityQueryHandle.create('User', {
            name: 'young',
            age: 20
        })

        const user2 = await entityQueryHandle.create('User', {
            name: 'middle',
            age: 30
        })

        const user3 = await entityQueryHandle.create('User', {
            name: 'old',
            age: 40
        })

        const user4 = await entityQueryHandle.create('User', {
            name: 'nullAge',
            age: null
        })

        // Test BETWEEN
        const betweenResult = await entityQueryHandle.find(
            'User',
            MatchExp.atom({ key: 'age', value: ['between', [25, 35]]}),
            {},
            ['name', 'age']
        )

        console.log('BETWEEN 25 AND 35:', betweenResult.map(u => ({ name: u.name, age: u.age })))
        
        // NULL BETWEEN 25 AND 35 is NULL (not true)
        const filteredBetween = betweenResult.filter(u => ['young', 'middle', 'old', 'nullAge'].includes(u.name))
        expect(filteredBetween).toHaveLength(1)
        expect(filteredBetween[0].name).toBe('middle')
    })

    test('Multiple NULL-affected operators in OR conditions', async () => {
        const user1 = await entityQueryHandle.create('User', {
            name: 'user1',
            age: 20,
            gender: 'male'
        })

        const user2 = await entityQueryHandle.create('User', {
            name: 'user2',
            age: null,
            gender: 'female'
        })

        const user3 = await entityQueryHandle.create('User', {
            name: 'user3',
            age: 30,
            gender: null
        })

        // Test: age > 25 OR gender != 'male'
        // Without our fix, this would miss user2 (null age) and user3 (null gender)
        const orResult = await entityQueryHandle.find(
            'User',
            MatchExp.atom({ key: 'age', value: ['>', 25]}).or({ key: 'gender', value: ['!=', 'male']}),
            {},
            ['name', 'age', 'gender']
        )

        console.log('age > 25 OR gender != male:', orResult.map(u => ({ name: u.name, age: u.age, gender: u.gender })))
        
        const filteredOr = orResult.filter(u => ['user1', 'user2', 'user3'].includes(u.name))
        // With our != fix, user3 should be included (gender != 'male' includes NULL)
        // user2 should also be included (gender = 'female')
        expect(filteredOr.map(u => u.name).sort()).toEqual(['user2', 'user3'])
    })
})
