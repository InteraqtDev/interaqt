import { expect, test, describe } from "bun:test";
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
                },
                leader: {
                    isEntity: true,
                    relType: ['n', '1'],
                    entityName: 'User',
                    relationName: 'User_leader_member_User',
                },
                friends: {
                    isEntity: true,
                    relType: ['n', 'n'],
                    entityName: 'User',
                    relationName: 'User_friends_friends_User',
                },
                item: {
                    isEntity: true,
                    relType: ['1', '1'],
                    entityName: 'LargeItem',
                    relationName: 'User_item_owner_LargeItem',
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
            targetAttribute: 'Profile',
            relType: ['1', '1'],
            table: 'User_Profile'  // 1:1 三表合一
        },
        User_leader_member_User: {
            attributes: {},
            sourceEntity: 'User',
            sourceAttribute: 'leader',
            targetEntity: 'User',
            targetAttribute: 'member',
            relType: ['n', '1'],
            table: 'User_Profile'  // n:1 往 n 方向合表
        },
        User_friends_friends_User: {
            attributes: {},
            sourceEntity: 'User',
            sourceAttribute: 'friends',
            targetEntity: 'User',
            targetAttribute: 'friends',
            relType: ['n', 'n'],
            table: 'User_friends_friends_User'  // n:n 关系，表是独立的
        },
        User_item_owner_LargeItem: {
            attributes: {},
            sourceEntity: 'User',
            sourceAttribute: 'item',
            targetEntity: 'LargeItem',
            targetAttribute: 'owner',
            relType: ['1', '1'],
            table: 'LargeItem'  // 特殊的 1:1 关系，表往 target 合并了
        }
    }
}

const entityToTableMap = new EntityToTableMap(entityToTableMapData)

describe('attribute query test', () => {
    test("basic attribute query", () => {

        const queryData:AttributeQueryData = [
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

        const attributeQuery = new AttributeQuery('User', entityToTableMap , queryData)

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
            [ "User", "user_name" ],
            [ "User", "user_age" ],
            // 合表里面的 profile 的字段
            [ "User", "profile_title" ],
            // 未合表的 1：1 里面的字段
            [ "User_item", "serialNumber"],
            // 指向自身的 1:1 关系字段，也会 join 的。
            [ "User_leader", "user_name" ],
            [ "User_leader", "profile_title"]
        ])
    });
})

