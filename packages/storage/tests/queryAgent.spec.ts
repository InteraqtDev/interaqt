import {expect, test, describe} from "bun:test";
import {
    QueryAgent
} from "../erstorage/ERStorage";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap, MapData} from "../erstorage/EntityToTableMap";
import {entityToTableMapData} from "./data/mapData";
import {MatchExp, MatchExpressionData} from "../erstorage/MatchExp.ts";
import {AttributeQuery, AttributeQueryData} from "../erstorage/AttributeQuery.ts";
import {RecordQueryData, RecordQuery} from "../erstorage/RecordQuery.ts";


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
        const queryAgent = new QueryAgent(entityToTableMap, database)

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
                joinIdField: ["User_id", "_source"],
                joinTarget: ["User_friends_friends_User", "REL__User_friends"]
            },
            // 关系表和 friend join。
            {
                for: ["User", "friends"],
                joinSource: ["User_friends_friends_User", "REL__User_friends"],
                joinIdField: ["_target", "User_id"],
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
        const queryAgent = new QueryAgent(entityToTableMap, database)
        const fieldMatchExp = matchExp.buildFieldMatchExpression()
        const fieldMatchExpWithValue = queryAgent.parseMatchExpressionValue('User', fieldMatchExp!)


        expect(fieldMatchExpWithValue!.left.data).toMatchObject({
            fieldName: [
                "User",
                "User_name"
            ],
            fieldValue: "= \"A\"",
            key: "name",
            value: ['=', 'A']
        })

        expect(fieldMatchExpWithValue!.right.data).toMatchObject({
            isFunctionMatch: true,
            namePath: ['User', 'friends']
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

        expect(fieldMatchExpWithValue!.right.data.fieldValue).toBe(`
EXISTS (
${queryAgent.buildFindQuery(innerEntityQuery, 'User_friends')}
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

        const queryAgent = new QueryAgent(entityToTableMap, database)
        expect(() => queryAgent.buildFindQuery(entityQuery)).not.toThrow()

    })

})

