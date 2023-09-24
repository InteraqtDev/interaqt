import {expect, test, describe} from "bun:test";
import {AttributeQuery, AttributeQueryData} from "../erstorage/ERStorage";
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

const entityToTableMap = new EntityToTableMap(entityToTableMapData)

describe('attribute query test', () => {
    test("basic attribute query", () => {

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

        // CAUTION 应该没有 friends 节点，因为 AttributeQuery 只管 x:1 关系，这是能直接获取的
        expect(attributeQuery.entityQueryTree).toMatchObject({
            profile: {},
            item: {},
            leader: {
                profile: {}
            },
        })
        expect(attributeQuery.xToManyEntities.length).toBe(1)
        expect(attributeQuery.xToManyEntities[0].name).toBe('friends')
        expect(attributeQuery.getQueryFields()).toMatchObject([
            // 自己的字段
            //  永远自动加上 id
            {
                tableAliasAndField: ["User", "id"],
                nameContext: ["User"],
                attribute: "id"
            },
            {
                tableAliasAndField: ["User", "user_name"],
                nameContext: ["User"],
                attribute: "name"
            },
            {
                tableAliasAndField: ["User", "user_age"],
                nameContext: ["User"],
                attribute: "age"
            },
            // 1:1 字段
            {
                tableAliasAndField: ["User", "id"],
                nameContext: ["User", "profile"],
                attribute: "id"
            },
            {
                tableAliasAndField: ["User", "profile_title"],
                nameContext: ["User", "profile"],
                attribute: "title"
            },
            // 1:1 字段
            {
                tableAliasAndField: ["User_item", "id"],
                nameContext: ["User", "item"],
                attribute: "id"
            },
            {
                tableAliasAndField: ["User_item", "serialNumber"],
                nameContext: ["User", "item"],
                attribute: "serialNumber"
            },
            // 1:n 字段
            {
                tableAliasAndField: ["User_leader", "id"],
                nameContext: ["User", "leader"],
                attribute: "id"
            },
            {
                tableAliasAndField: ["User_leader", "user_name"],
                nameContext: ["User", "leader"],
                attribute: "name"
            },
            // 1:n:1 字段
            {
                tableAliasAndField: ["User_leader", "id"],
                nameContext: ["User", "leader", "profile"],
                attribute: "id"
            },
            {
                tableAliasAndField: ["User_leader", "profile_title"],
                nameContext: ["User", "leader", "profile"],
                attribute: "title"
            }
        ])
    });
})

