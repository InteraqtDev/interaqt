import { expect, test, describe } from "bun:test";
import {QueryAgent, AttributeQuery, AttributeQueryData} from "../erstorage/ERStorage";
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
            table: 'User_Profile',  // 1:1 三表合一
        },
        User_leader_member_User: {
            attributes: {},
            sourceEntity: 'User',
            sourceAttribute: 'leader',
            targetEntity: 'User',
            targetAttribute: 'member',
            relType: ['n', '1'],
            table: 'User_Profile',  // n:1 往 n 方向合表
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
            table: 'LargeItem',  // 特殊的 1:1 关系，表往 target 合并了
        }
    }
}

const database = { query: (sql: string) => Promise.resolve([])}
const entityToTableMap = new EntityToTableMap(entityToTableMapData)

describe('query agent test', () => {
    test("join expression test", () => {

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


        const attributeQuery = new AttributeQuery('User', entityToTableMap, queryData)
        const queryAgent = new QueryAgent(new EntityToTableMap(entityToTableMapData), database)

        const joinExp = queryAgent.getJoinTables(attributeQuery.fullEntityQueryTree, ['User'])
        console.log(joinExp)
        expect(joinExp).toMatchObject([
            // 和 item join，item 中已经有关系表
            {
                for: [ "User", "item" ],
                joinSource: [ "User_Profile", "User" ],
                joinIdField: [ "id", "owner" ],
                joinTarget: [ "LargeItem", "User_item" ]
            },
            // 和自身 join
            {
                for: [ "User", "leader" ],
                joinSource: [ "User_Profile", "User" ],
                joinIdField: [ "leader", "id" ],
                joinTarget: [ "User_Profile", "User_leader" ]
            },
            // 和关系表 join
            {
                for: [ "User", "friends" ],
                joinSource: [ "User_Profile", "User" ],
                joinIdField: [ "id", "$source" ],
                joinTarget: [ "User_friends_friends_User", "REL-User_friends" ]
            },
            // 关系表和 friend join。
            {
                for: [ "User", "friends" ],
                joinSource: [ "User_friends_friends_User", "REL-User_friends" ],
                joinIdField: [ "$target", "id" ],
                joinTarget: [ "User_Profile", "User_friends" ]
            }
        ])


    });
})

