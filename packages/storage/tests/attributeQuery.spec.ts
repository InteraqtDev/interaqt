import {expect, test, describe} from "bun:test";
import {EntityToTableMap, MapData} from "../erstorage/EntityToTableMap";
import {entityToTableMapData} from './data/mapData'
import {AttributeQuery, AttributeQueryData} from "../erstorage/AttributeQuery.ts";


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
                tableAliasAndField: ["User", "User_id"],
                nameContext: ["User"],
                attribute: "id"
            },
            {
                tableAliasAndField: ["User", "User_name"],
                nameContext: ["User"],
                attribute: "name"
            },
            {
                tableAliasAndField: ["User", "User_age"],
                nameContext: ["User"],
                attribute: "age"
            },
            // 1:1 字段
            {
                tableAliasAndField: ["User", "Profile_id"],
                nameContext: ["User", "profile"],
                attribute: "id"
            },
            {
                tableAliasAndField: ["User", "Profile_title"],
                nameContext: ["User", "profile"],
                attribute: "title"
            },
            // 1:1 字段
            {
                tableAliasAndField: ["User", "Item_id"],
                nameContext: ["User", "item"],
                attribute: "id"
            },
            {
                tableAliasAndField: ["User", "Item_itemName"],
                nameContext: ["User", "item"],
                attribute: "itemName"
            },
            // 1:n 字段
            {
                tableAliasAndField: ["User_leader", "User_id"],
                nameContext: ["User", "leader"],
                attribute: "id"
            },
            {
                tableAliasAndField: ["User_leader", "User_name"],
                nameContext: ["User", "leader"],
                attribute: "name"
            },
            // 1:n:1 字段
            {
                tableAliasAndField: ["User_leader", "Profile_id"],
                nameContext: ["User", "leader", "profile"],
                attribute: "id"
            },
            {
                tableAliasAndField: ["User_leader", "Profile_title"],
                nameContext: ["User", "leader", "profile"],
                attribute: "title"
            }
        ])
    });
})

