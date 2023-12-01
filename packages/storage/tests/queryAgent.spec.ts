import {expect, test, describe} from "vitest";
import {
    RecordQueryAgent
} from "../erstorage/RecordQueryAgent.js";
import { SQLiteDB } from '../../runtime/SQLite'
import {EntityToTableMap, MapData} from "../erstorage/EntityToTableMap.js";
import {entityToTableMapData} from "./data/mapData";
import {MatchExp, MatchExpressionData} from "../erstorage/MatchExp.js";
import {AttributeQuery, AttributeQueryData} from "../erstorage/AttributeQuery.js";
import {RecordQueryData, RecordQuery} from "../erstorage/RecordQuery.js";


const database = new SQLiteDB()
const entityToTableMap = new EntityToTableMap(entityToTableMapData)

describe('query agent test', () => {
    test("join expression test", () => {

        const queryData: AttributeQueryData = [
            'name',
            'age',
            // 1:1 关系
            ['profile', {
                attributeQuery: ['title']
            }],
            // 不合表的 1:1 关系
            ['item', {
                attributeQuery: ['itemName']
            }],
            // n:1 关系
            ['leader', {
                attributeQuery: [
                    'name',
                    ['profile', {
                        attributeQuery: ['title']
                    }]
                ]
            }],
            // n:n 关系
            ['friends', {
                attributeQuery: [
                    'name',
                    'age',
                    ['profile', {
                        attributeQuery: ['title']
                    }],
                ]
            }]
        ]


        const attributeQuery = new AttributeQuery('User', entityToTableMap, queryData)
        const queryAgent = new RecordQueryAgent(entityToTableMap, database)

        const joinExp = queryAgent.getJoinTables(attributeQuery.fullQueryTree, ['User'])
        expect(joinExp).toMatchObject([
            // 和 item 合一了，不需要join
            // 和自身 join
            {
                for: ["User", "leader"],
                joinSource: ["Profile_User_Item", "User"],
                joinIdField: ["User_leader", "User_id"],
                joinTarget: ["Profile_User_Item", "User_leader"]
            },
            // 和关系表 join
            {
                for: ["User", "friends"],
                joinSource: ["Profile_User_Item", "User"],
                joinIdField: ["User_id", "_target"],
                joinTarget: ["User_friends_friends_User", "REL_User_friends"]
            },
            // 关系表和 friend join。
            {
                for: ["User", "friends"],
                joinSource: ["User_friends_friends_User", "REL_User_friends"],
                joinIdField: ["_source", "User_id"],
                joinTarget: ["Profile_User_Item", "User_friends"]
            }
        ])
    });


    test('where clause test', () => {

        const matchExpData: MatchExpressionData = MatchExp.atom({
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
        const queryAgent = new RecordQueryAgent(entityToTableMap, database)
        const fieldMatchExp = matchExp.buildFieldMatchExpression()
        const fieldMatchExpWithValue = queryAgent.parseMatchExpressionValue('User', fieldMatchExp!)

        const joinExp = queryAgent.getJoinTables(matchExp.xToOneQueryTree, ['User'])
        expect(joinExp).toMatchObject([
            {
                for: [ "User", "friends:source" ],
                joinSource: [ "Profile_User_Item", "User" ],
                joinIdField: [ "User_id", "_source" ],
                joinTarget: [ "User_friends_friends_User", "REL_User_friends_SOURCE" ]
            }, {
                for: [ "User", "friends:source" ],
                joinSource: [ "User_friends_friends_User", "REL_User_friends_SOURCE" ],
                joinIdField: [ "_target", "User_id" ],
                joinTarget: [ "Profile_User_Item", "User_friends_SOURCE" ]
            },
            {
                for: [ "User", "friends:target" ],
                joinSource: [ "Profile_User_Item", "User" ],
                joinIdField: [ "User_id", "_target" ],
                joinTarget: [ "User_friends_friends_User", "REL_User_friends_TARGET" ]
            }, {
                for: [ "User", "friends:target" ],
                joinSource: [ "User_friends_friends_User", "REL_User_friends_TARGET" ],
                joinIdField: [ "_source", "User_id" ],
                joinTarget: [ "Profile_User_Item", "User_friends_TARGET" ]
            }
        ])


        expect(fieldMatchExpWithValue!.left.data).toMatchObject({
            fieldName: [
                "User",
                "User_name"
            ],
            fieldValue: "= \"A\"",
            key: "name",
            value: ['=', 'A']
        })


        // 因为 friend 是 对称关系，所以要分裂成了两个
        expect(fieldMatchExpWithValue!.right.isOr()).toBe(true)

        expect(fieldMatchExpWithValue!.right.left.data).toMatchObject({
            isFunctionMatch: true,
            namePath: ['User', 'friends:source']
        })
        expect(fieldMatchExpWithValue!.right.right.data).toMatchObject({
            isFunctionMatch: true,
            namePath: ['User', 'friends:target']
        })


        // 模拟 inner 的情况
        const innerEntityQuery = RecordQuery.create('User', entityToTableMap, {
            matchExpression: MatchExp.atom({
                // 这里应该是外部添加的关于和 outer 相等的条件
                key: 'friends.id',
                value: ['=', 'id'],
                isReferenceValue: true,
            }).and({
                key: 'age',
                value: ['<', '18']
            })
        } as RecordQueryData)

        console.log(fieldMatchExpWithValue!.right.left.data.fieldValue)
        expect(fieldMatchExpWithValue!.right.left.data.fieldValue).toBe(`
EXISTS (
${queryAgent.buildXToOneFindQuery(innerEntityQuery, 'User_friends_SOURCE')}
)
`)

        expect(fieldMatchExpWithValue!.right.right.data.fieldValue).toBe(`
EXISTS (
${queryAgent.buildXToOneFindQuery(innerEntityQuery, 'User_friends_TARGET')}
)
`)
    })


    test('field and match combined test', () => {

        const entityQuery = RecordQuery.create('User', entityToTableMap, {
            attributeQuery: [
                'name',
                'age',
                ['profile', {
                    attributeQuery: ['title']
                }],
                // 不合表的 1:1 关系
                ['item', {
                    attributeQuery: ['itemName']
                }],
                // n:1 关系
                ['leader', {
                    attributeQuery: [
                        'name',
                        ['profile', {
                            attributeQuery: ['title']
                        }]
                    ]
                }],
            ],
            matchExpression: MatchExp.atom({
                key: 'name',
                value: ['=', 'A']
            }).and({
                key: 'friends',
                value: ['exist',  MatchExp.atom({
                    key: 'age',
                    value: ['<', '18']
                }).and({
                    key: 'name',
                    isReferenceValue: true,
                    value: ['=', 'name']
                })]
            })
        } as RecordQueryData)

        const queryAgent = new RecordQueryAgent(entityToTableMap, database)
        expect(() => queryAgent.buildXToOneFindQuery(entityQuery)).not.toThrow()

    })

})

