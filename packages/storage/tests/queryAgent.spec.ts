import {expect, test, describe} from "bun:test";
import {
    QueryAgent,
    AttributeQuery,
    AttributeQueryData,
    MatchExpressionData,
    MatchExpression, EntityQuery, EntityQueryData
} from "../erstorage/ERStorage";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap, MapData} from "../erstorage/EntityToTableMap";


const entityToTableMapData: MapData = {
    entities: {
        User: {
            table: 'User_Profile',
            attributes: {
                name: {
                    type: 'string',
                    fieldType: 'text',
                    field: 'user_name'
                },
                age: {
                    type: 'number',
                    fieldType: 'int',
                    field: 'user_age'
                },
                profile: {
                    isEntity: true,
                    relType: ['1', '1'],
                    entityName: 'Profile',
                    relationName: 'User_profile_user_Profile',
                    table: 'User_Profile',
                    field: '',
                },
                leader: {
                    isEntity: true,
                    relType: ['n', '1'],
                    entityName: 'User',
                    relationName: 'User_leader_member_User',
                    table: 'User_Profile',
                    field: 'User_leader'
                },
                friends: {
                    isEntity: true,
                    relType: ['n', 'n'],
                    entityName: 'User',
                    relationName: 'User_friends_friends_User',
                    table: 'User_Profile',
                    field: ''
                },
                item: {
                    isEntity: true,
                    relType: ['1', '1'],
                    entityName: 'LargeItem',
                    relationName: 'User_item_owner_LargeItem',
                    table: 'LargeItem',
                    field: ''
                }
            }
        },
        Profile: {
            table: 'User_Profile',
            attributes: {
                title: {
                    type: 'string',
                    fieldType: 'text',
                    field: 'profile_title'
                },
                owner: {
                    isEntity: true,
                    relType: ['1', '1'],
                    entityName: 'User',
                    relationName: 'User_profile_user_Profile',
                    table: 'User_Profile',
                    field: ''
                }
            }
        },
        // 也是 1:1 关系，但是不合表的情况
        LargeItem: {
            table: 'LargeItem',
            attributes: {
                serialNumber: {
                    type: 'number',
                    fieldType: 'bigInt',
                    field: 'serialNumber'
                },
                owner: {
                    isEntity: true,
                    relType: ['1', '1'],
                    entityName: 'User',
                    relationName: 'User_item_owner_LargeItem',
                    table: 'LargeItem',
                    field: 'LargeItem_owner'
                }
            }
        }
    },
    relations: {
        User_profile_user_Profile: {
            attributes: {},
            sourceEntity: 'User',
            sourceAttribute: 'profile',
            targetEntity: 'Profile',
            targetAttribute: 'owner',
            relType: ['1', '1'],
            table: 'User_Profile',  // 1:1 三表合一,
            mergedTo: 'source',
            sourceField: 'User_profile',
            targetField: 'Profile_owner',
        },
        User_leader_member_User: {
            attributes: {},
            sourceEntity: 'User',
            sourceAttribute: 'leader',
            targetEntity: 'User',
            targetAttribute: 'member',
            relType: ['n', '1'],
            table: 'User_Profile',  // n:1 往 n 方向合表
            mergedTo: 'source',
            sourceField: 'User_leader',
            targetField: '$target',
        },
        User_friends_friends_User: {
            attributes: {},
            sourceEntity: 'User',
            sourceAttribute: 'friends',
            targetEntity: 'User',
            targetAttribute: 'friends',
            relType: ['n', 'n'],
            table: 'User_friends_friends_User',  // n:n 关系，表是独立的
            sourceField: '$source',
            targetField: '$target',
        },
        User_item_owner_LargeItem: {
            attributes: {},
            sourceEntity: 'User',
            sourceAttribute: 'item',
            targetEntity: 'LargeItem',
            targetAttribute: 'owner',
            relType: ['1', '1'],
            table: 'LargeItem',  // 特殊的 1:1 关系，表往 target 合并了
            mergedTo: 'target',
            sourceField: '$source',
            targetField: 'LargeItem_owner',
        }
    }
}

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
                attributeQuery: ['serialNumber']
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

        const joinExp = queryAgent.getJoinTables(attributeQuery.fullEntityQueryTree, ['User'])
        expect(joinExp).toMatchObject([
            // 和 item join，item 中已经有关系表
            {
                for: ["User", "item"],
                joinSource: ["User_Profile", "User"],
                joinIdField: ["id", "LargeItem_owner"],
                joinTarget: ["LargeItem", "User_item"]
            },
            // 和自身 join
            {
                for: ["User", "leader"],
                joinSource: ["User_Profile", "User"],
                joinIdField: ["User_leader", "id"],
                joinTarget: ["User_Profile", "User_leader"]
            },
            // 和关系表 join
            {
                for: ["User", "friends"],
                joinSource: ["User_Profile", "User"],
                joinIdField: ["id", "$source"],
                joinTarget: ["User_friends_friends_User", "REL__User_friends"]
            },
            // 关系表和 friend join。
            {
                for: ["User", "friends"],
                joinSource: ["User_friends_friends_User", "REL__User_friends"],
                joinIdField: ["$target", "id"],
                joinTarget: ["User_Profile", "User_friends"]
            }
        ])
    });


    test('where clause test', () => {

        const matchExpData: MatchExpressionData = MatchExpression.createFromAtom({
            key: 'name',
            value: ['=', 'A']
        }).and({
            key: 'friends',
            value: ['exist', {
                key: 'age',
                value: ['<', '18']
            }]
        })

        const matchExp = new MatchExpression('User', entityToTableMap, matchExpData)
        const queryAgent = new QueryAgent(entityToTableMap, database)
        const fieldMatchExp = matchExp.buildFieldMatchExpression()
        const fieldMatchExpWithValue = queryAgent.parseMatchExpressionValue('User', fieldMatchExp!)


        expect(fieldMatchExpWithValue!.left.data).toMatchObject({
            fieldName: [
                "User",
                "user_name"
            ],
            fieldValue: "= \"A\""
        })

        expect(fieldMatchExpWithValue!.right.data).toMatchObject({
            isFunctionMatch: true,
            namePath: ['User', 'friends']
        })


        // 模拟 inner 的情况
        const innerEntityQuery = EntityQuery.create('User', entityToTableMap, {
            matchExpression: MatchExpression.createFromAtom({
                // 这里应该是外部添加的关于和 outer 相等的条件
                key: 'friends.id',
                value: ['=', 'id'],
                isReferenceValue: true,
            }).and({
                key: 'age',
                value: ['<', '18']
            })
        } as EntityQueryData)

        expect(fieldMatchExpWithValue!.right.data.fieldValue).toBe(`
EXISTS (
${queryAgent.buildFindQuery(innerEntityQuery, 'User_friends')}
)
`)
    })


    test('field and match combined test', () => {

        const entityQuery = EntityQuery.create('User', entityToTableMap, {
            attributeQuery: [
                'name',
                'age',
                ['profile', {
                    attributeQuery: ['title']
                }],
                // 不合表的 1:1 关系
                ['item', {
                    attributeQuery: ['serialNumber']
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
            matchExpression: MatchExpression.createFromAtom({
                key: 'name',
                value: ['=', 'A']
            }).and({
                key: 'friends',
                value: ['exist',  MatchExpression.createFromAtom({
                    key: 'age',
                    value: ['<', '18']
                }).and({
                    key: 'name',
                    isReferenceValue: true,
                    value: ['=', 'name']
                })]
            })
        } as EntityQueryData)

        const queryAgent = new QueryAgent(entityToTableMap, database)
        expect(() => queryAgent.buildFindQuery(entityQuery)).not.toThrow()

    })

})

