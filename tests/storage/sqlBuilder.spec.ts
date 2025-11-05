import { describe, it, expect, beforeEach } from 'vitest'
import { SQLBuilder } from '../../src/storage/erstorage/SQLBuilder.js'
import { EntityToTableMap, MapData } from '../../src/storage/erstorage/EntityToTableMap.js'
import { RecordQuery } from '../../src/storage/erstorage/RecordQuery.js'
import { MatchExp } from '../../src/storage/erstorage/MatchExp.js'
import { AttributeQuery, AttributeQueryData } from '../../src/storage/erstorage/AttributeQuery.js'
import { PGLiteDB } from '../../src/dbclients/PGLite.js'

describe('SQLBuilder', () => {
    let map: EntityToTableMap
    let database: PGLiteDB
    let sqlBuilder: SQLBuilder

    beforeEach(async () => {
        // 创建一个简单的测试用 MapData
        const mapData: MapData = {
            records: {
                User: {
                    table: 'users',
                    attributes: {
                        id: {
                            name: 'id',
                            type: 'string',
                            field: 'id',
                            fieldType: 'string'
                        },
                        name: {
                            name: 'name',
                            type: 'string',
                            field: 'name',
                            fieldType: 'string'
                        },
                        age: {
                            name: 'age',
                            type: 'number',
                            field: 'age',
                            fieldType: 'number'
                        }
                    }
                }
            },
            links: {}
        }

        map = new EntityToTableMap(mapData)
        database = new PGLiteDB(':memory:')
        await database.open(true) // forceDrop = true
        
        // 创建测试表
        await database.query(`
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                name TEXT,
                age INTEGER
            )
        `, [])

        sqlBuilder = new SQLBuilder(map, database)
    })

    describe('buildFromClause', () => {
        it('should build FROM clause correctly', () => {
            const result = sqlBuilder.buildFromClause('User')
            expect(result).toBe('"users" AS "User"')
        })

        it('should build FROM clause with prefix', () => {
            const result = sqlBuilder.buildFromClause('User', 'sub')
            expect(result).toBe('"users" AS "sub___User"')
        })
    })

    describe('buildSelectClause', () => {
        it('should build SELECT clause for simple fields', () => {
            const query = RecordQuery.create('User', map, {
                matchExpression: MatchExp.atom({ key: 'id', value: ['=', '1'] }),
                attributeQuery: ['id', 'name']
            })

            const fields = query.attributeQuery.getValueAndXToOneRecordFields()
            const [sql, fieldAliasMap] = sqlBuilder.buildSelectClause(fields)

            expect(sql).toContain('"User"."id"')
            expect(sql).toContain('"User"."name"')
            expect(fieldAliasMap).toBeDefined()
        })

        it('should return "1" for empty fields', () => {
            const [sql, fieldAliasMap] = sqlBuilder.buildSelectClause([])
            expect(sql).toBe('1')
            expect(fieldAliasMap).toBeDefined()
        })
    })

    describe('buildWhereClause', () => {
        it('should build simple WHERE clause with pre-built field match', () => {
            // 直接创建一个 FieldMatchAtom 来测试
            const p = database.getPlaceholder!()
            const fieldMatch = {
                type: 'atom',
                data: {
                    key: 'name',
                    value: ['=', 'Alice'],
                    fieldName: ['User', 'name'],
                    fieldValue: `= ${p()}`,
                    fieldParams: ['Alice']
                },
                isAtom: () => true
            } as any
            
            const [sql, params] = sqlBuilder.buildWhereClause(fieldMatch, '', p)

            expect(sql).toContain('"User"."name"')
            expect(params).toContain('Alice')
        })

        it('should return default clause for null match', () => {
            const p = database.getPlaceholder!()
            const [sql, params] = sqlBuilder.buildWhereClause(null, '', p)

            expect(sql).toContain('1=')
            expect(params).toEqual([1])
        })
    })

    describe('buildModifierClause', () => {
        it('should build ORDER BY clause', () => {
            const query = RecordQuery.create('User', map, {
                matchExpression: MatchExp.atom({ key: 'id', value: ['=', '1'] }),
                attributeQuery: ['id', 'name'],
                modifier: {
                    orderBy: { name: 'ASC' }
                }
            })

            const fields = query.attributeQuery.getValueAndXToOneRecordFields()
            const [, fieldAliasMap] = sqlBuilder.buildSelectClause(fields)
            const result = sqlBuilder.buildModifierClause(query.modifier, '', fieldAliasMap)

            expect(result).toContain('ORDER BY')
            expect(result).toContain('ASC')
        })

        it('should build LIMIT clause', () => {
            const query = RecordQuery.create('User', map, {
                matchExpression: MatchExp.atom({ key: 'id', value: ['=', '1'] }),
                attributeQuery: ['id', 'name'],
                modifier: {
                    limit: 10
                }
            })

            const fields = query.attributeQuery.getValueAndXToOneRecordFields()
            const [, fieldAliasMap] = sqlBuilder.buildSelectClause(fields)
            const result = sqlBuilder.buildModifierClause(query.modifier, '', fieldAliasMap)

            expect(result).toContain('LIMIT 10')
        })

        it('should build OFFSET clause', () => {
            const query = RecordQuery.create('User', map, {
                matchExpression: MatchExp.atom({ key: 'id', value: ['=', '1'] }),
                attributeQuery: ['id', 'name'],
                modifier: {
                    offset: 20
                }
            })

            const fields = query.attributeQuery.getValueAndXToOneRecordFields()
            const [, fieldAliasMap] = sqlBuilder.buildSelectClause(fields)
            const result = sqlBuilder.buildModifierClause(query.modifier, '', fieldAliasMap)

            expect(result).toContain('OFFSET 20')
        })
    })

    describe('buildInsertSQL', () => {
        it('should build INSERT statement', () => {
            const [sql, params] = sqlBuilder.buildInsertSQL('User', [
                { field: 'id', value: '1', fieldType: 'string' },
                { field: 'name', value: 'Alice', fieldType: 'string' },
                { field: 'age', value: 25, fieldType: 'number' }
            ])

            expect(sql).toContain('INSERT INTO')
            expect(sql).toContain('"users"')
            expect(sql).toContain('"id"')
            expect(sql).toContain('"name"')
            expect(sql).toContain('"age"')
            expect(params).toEqual(['1', 'Alice', 25])
        })

        it('should handle JSON field type', () => {
            const [sql, params] = sqlBuilder.buildInsertSQL('User', [
                { field: 'data', value: { key: 'value' }, fieldType: 'json' }
            ])

            expect(params[0]).toBe('{"key":"value"}')
        })
    })

    describe('buildUpdateSQL', () => {
        it('should build UPDATE statement', () => {
            const [sql, params] = sqlBuilder.buildUpdateSQL(
                'User',
                { id: '1' },
                [
                    { field: 'name', value: 'Bob' },
                    { field: 'age', value: 30 }
                ]
            )

            expect(sql).toContain('UPDATE')
            expect(sql).toContain('"users"')
            expect(sql).toContain('SET')
            expect(sql).toContain('WHERE')
            expect(params).toEqual(['Bob', 30, '1'])
        })

        it('should return empty for no columns', () => {
            const [sql, params] = sqlBuilder.buildUpdateSQL('User', { id: '1' }, [])
            expect(sql).toBe('')
            expect(params).toEqual([])
        })
    })

    describe('buildDeleteSQL', () => {
        it('should build DELETE statement', () => {
            const [sql, params] = sqlBuilder.buildDeleteSQL('User', 'id', '1')

            expect(sql).toContain('DELETE FROM')
            expect(sql).toContain('"users"')
            expect(sql).toContain('WHERE')
            expect(params).toEqual(['1'])
        })
    })

    describe('withPrefix', () => {
        it('should add prefix with separator', () => {
            const result = sqlBuilder.withPrefix('sub')
            expect(result).toBe('sub___')
        })

        it('should return empty for no prefix', () => {
            const result = sqlBuilder.withPrefix()
            expect(result).toBe('')
        })
    })

    describe('prepareFieldValue', () => {
        it('should stringify JSON values', () => {
            const result = sqlBuilder.prepareFieldValue({ key: 'value' }, 'json')
            expect(result).toBe('{"key":"value"}')
        })

        it('should keep other values as is', () => {
            const result = sqlBuilder.prepareFieldValue('test', 'string')
            expect(result).toBe('test')
        })
    })

    describe('integration - buildXToOneFindQuery', () => {
        it('should build complete SELECT query', () => {
            const query = RecordQuery.create('User', map, {
                matchExpression: MatchExp.atom({ key: 'name', value: ['=', 'Alice'] }),
                attributeQuery: ['id', 'name', 'age']
            })

            const [sql, params, fieldAliasMap] = sqlBuilder.buildXToOneFindQuery(query)

            expect(sql).toContain('SELECT')
            expect(sql).toContain('FROM')
            expect(sql).toContain('WHERE')
            expect(params).toContain('Alice')
            expect(fieldAliasMap).toBeDefined()
        })
    })
})

// ============ 从 queryAgent.spec.ts 迁移的复杂测试场景 ============

describe('SQLBuilder - Complex Scenarios (migrated from queryAgent.spec.ts)', () => {
    let database: PGLiteDB
    let entityToTableMap: EntityToTableMap
    let sqlBuilder: SQLBuilder

    beforeEach(async () => {
        const { entityToTableMapData } = await import('./data/mapData.js')
        database = new PGLiteDB(':memory:')
        await database.open(true)
        entityToTableMap = new EntityToTableMap(entityToTableMapData)
        sqlBuilder = new SQLBuilder(entityToTableMap, database)
    })

    describe('getJoinTables - complex relations', () => {
        it('should calculate JOIN tables for complex query tree', () => {
            const queryData: AttributeQueryData = [
                'name',
                'age',
                ['profile', { attributeQuery: ['title'] }],
                ['item', { attributeQuery: ['itemName'] }],
                ['leader', {
                    attributeQuery: [
                        'name',
                        ['profile', { attributeQuery: ['title'] }]
                    ]
                }],
                ['friends', {
                    attributeQuery: [
                        'name',
                        'age',
                        ['profile', { attributeQuery: ['title'] }]
                    ]
                }]
            ]

            const attributeQuery = new AttributeQuery('User', entityToTableMap, queryData)
            const joinExp = sqlBuilder.getJoinTables(attributeQuery.fullQueryTree, ['User'])
            
            expect(joinExp).toMatchObject([
                {
                    for: ["User", "leader"],
                    joinSource: ["Profile_User_Item", "User"],
                    joinIdField: ["User_leader", "User_id"],
                    joinTarget: ["Profile_User_Item", "User_leader"]
                },
                {
                    for: ["User", "friends"],
                    joinSource: ["Profile_User_Item", "User"],
                    joinIdField: ["User_id", "_target"],
                    joinTarget: ["User_friends_friends_User", "REL_User_friends"]
                },
                {
                    for: ["User", "friends"],
                    joinSource: ["User_friends_friends_User", "REL_User_friends"],
                    joinIdField: ["_source", "User_id"],
                    joinTarget: ["Profile_User_Item", "User_friends"]
                }
            ])
        })
    })

    describe('parseMatchExpressionValue - EXIST subquery', () => {
        it('should parse EXIST function match correctly', () => {
            const matchExpData = MatchExp.atom({
                key: 'name',
                value: ['=', 'A']
            }).and({
                key: 'friends',
                value: ['exist', {
                    key: 'age',
                    value: ['<', '18']
                }]
            })

            const matchExp = new MatchExp('User', entityToTableMap, matchExpData)
            const fieldMatchExp = matchExp.buildFieldMatchExpression(() => '?', database)
            const fieldMatchExpWithValue = sqlBuilder.parseMatchExpressionValue('User', fieldMatchExp!, undefined, () => '?')

            expect(fieldMatchExpWithValue!.left.data).toMatchObject({
                fieldName: ["User", "User_name"],
                fieldValue: "= ?",
                fieldParams: ['A'],
                key: "name",
                value: ['=', 'A']
            })

            // 因为 friend 是对称关系，所以要分裂成了两个
            expect(fieldMatchExpWithValue!.right!.isOr()).toBe(true)
            expect(fieldMatchExpWithValue!.right!.left!.data).toMatchObject({
                isFunctionMatch: true,
                namePath: ['User', 'friends:source']
            })
            expect(fieldMatchExpWithValue!.right!.right!.data).toMatchObject({
                isFunctionMatch: true,
                namePath: ['User', 'friends:target']
            })
        })

        it('should generate correct EXIST subquery SQL', () => {
            const matchExpData = MatchExp.atom({
                key: 'name',
                value: ['=', 'A']
            }).and({
                key: 'friends',
                value: ['exist', {
                    key: 'age',
                    value: ['<', '18']
                }]
            })

            const matchExp = new MatchExp('User', entityToTableMap, matchExpData)
            const fieldMatchExp = matchExp.buildFieldMatchExpression(() => '?', database)
            const fieldMatchExpWithValue = sqlBuilder.parseMatchExpressionValue('User', fieldMatchExp!, undefined, () => '?')

            // 验证 EXIST 子查询生成
            expect(fieldMatchExpWithValue!.right!.left.data.fieldValue).toContain('EXISTS')
            expect(fieldMatchExpWithValue!.right!.left.data.isInnerQuery).toBe(true)
        })
    })

    describe('buildXToOneFindQuery - complex scenarios', () => {
        it('should handle query with EXIST condition', () => {
            const entityQuery = RecordQuery.create('User', entityToTableMap, {
                attributeQuery: [
                    'name',
                    'age',
                    ['profile', { attributeQuery: ['title'] }],
                    ['item', { attributeQuery: ['itemName'] }],
                    ['leader', {
                        attributeQuery: [
                            'name',
                            ['profile', { attributeQuery: ['title'] }]
                        ]
                    }],
                ],
                matchExpression: MatchExp.atom({
                    key: 'name',
                    value: ['=', 'A']
                }).and({
                    key: 'friends',
                    value: ['exist', MatchExp.atom({
                        key: 'age',
                        value: ['<', '18']
                    }).and({
                        key: 'name',
                        isReferenceValue: true,
                        value: ['=', 'name']
                    })]
                })
            })

            // 测试不应该抛出异常
            expect(() => sqlBuilder.buildXToOneFindQuery(entityQuery)).not.toThrow()
            
            const [sql, params, fieldAliasMap] = sqlBuilder.buildXToOneFindQuery(entityQuery)
            
            expect(sql).toContain('SELECT')
            expect(sql).toContain('EXISTS')
            expect(fieldAliasMap).toBeDefined()
        })
    })
})

