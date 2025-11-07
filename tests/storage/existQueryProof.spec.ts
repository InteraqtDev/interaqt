import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from '@shared';
import { PGLiteDB } from '@dbclients';
import { beforeEach, describe, expect, test, afterEach } from "vitest";

/**
 * EXIST 查询功能证明
 * 
 * 本测试文件证明 interaqt 框架支持 SQL EXISTS 子查询
 */
describe('EXIST Query - Proof of Support', () => {
    let db: PGLiteDB
    let setup: DBSetup
    let entityQueryHandle: EntityQueryHandle

    beforeEach(async () => {
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'age', type: 'number' })
            ]
        })

        const userMemberRelation = Relation.create({
            source: User,
            sourceProperty: 'leader',
            target: User,
            targetProperty: 'member',
            type: '1:n'
        })

        db = new PGLiteDB()
        await db.open()

        setup = new DBSetup([User], [userMemberRelation], db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => {
        await db.close()
    })

    test('✅ 支持 EXIST 查询：查找有满足特定条件的关联实体的记录', async () => {
        // 创建测试数据
        await entityQueryHandle.create('User', {
            name: 'Parent with Young Child',
            age: 40,
            member: [{ name: 'Child', age: 15 }]
        })

        await entityQueryHandle.create('User', {
            name: 'Parent with Adult Child',
            age: 45,
            member: [{ name: 'Adult', age: 30 }]
        })

        await entityQueryHandle.create('User', {
            name: 'No Children',
            age: 35
        })

        // 使用 EXIST 查询：查找有年龄小于20的成员的用户
        // 语法：value: ['exist', <条件表达式>]
        const result = await entityQueryHandle.find('User',
            MatchExp.atom({
                key: 'member',
                value: ['exist', MatchExp.atom({ key: 'age', value: ['<', 20] })]
            }),
            undefined,
            ['name', 'age']
        )

        // 验证结果
        expect(result).toHaveLength(1)
        expect(result[0].name).toBe('Parent with Young Child')
    })

    test('✅ 支持 EXIST 与普通条件组合查询', async () => {
        // 创建测试数据
        await entityQueryHandle.create('User', {
            name: 'Young Parent',
            age: 28,
            member: [{ name: 'Child', age: 5 }]
        })

        await entityQueryHandle.create('User', {
            name: 'Old Parent',
            age: 50,
            member: [{ name: 'Child', age: 20 }]
        })

        await entityQueryHandle.create('User', {
            name: 'Young without Children',
            age: 25
        })

        // 组合查询：年龄 < 30 AND 有成员
        const result = await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'age', value: ['<', 30] })
                .and({
                    key: 'member',
                    value: ['exist', MatchExp.atom({ key: 'name', value: ['not', null] })]
                }),
            undefined,
            ['name', 'age']
        )

        // 验证结果
        expect(result).toHaveLength(1)
        expect(result[0].name).toBe('Young Parent')
    })
})

