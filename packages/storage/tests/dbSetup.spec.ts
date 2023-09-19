import {expect, test, describe} from "bun:test";
import { Database } from "bun:sqlite";
import fs from 'fs'

import { data } from '../../runtime/tests/data/simpleER2'
import { createInstances } from "../../shared/createClass";
import {Entity, Property, PropertyTypes, Relation} from "../../shared/entity/Entity";
import {DBSetup} from "../erstorage/Setup";
import {EntityQuery, EntityQueryData, QueryAgent} from "../erstorage/ERStorage";
import {EntityToTableMap} from "../erstorage/EntityToTableMap";

const userEntity = Entity.create({ name: 'User' })
const nameProperty = Property.create({ name: 'name', type: PropertyTypes.String })
const ageProperty = Property.create({ name: 'age', type: PropertyTypes.Number })
userEntity.properties.push(nameProperty)
userEntity.properties.push(ageProperty)


const profileEntity = Entity.create({ name: 'Profile'})
const profileNameProperty = Property.create({ name: 'title', type: PropertyTypes.String })
profileEntity.properties.push(profileNameProperty)

const fileEntity = Entity.create({ name: 'File'})
const filenameProperty = Property.create({ name: 'fileName', type: PropertyTypes.String })
fileEntity.properties.push(filenameProperty)


Relation.create({
    entity1: fileEntity,
    targetName1: 'owner',
    entity2: userEntity,
    targetName2: 'file',
    relType: 'n:1'
})

Relation.create({
    entity1: profileEntity,
    targetName1: 'owner',
    entity2: userEntity,
    targetName2: 'profile',
    relType: '1:1'
})


Relation.create({
    entity1: userEntity,
    targetName1: 'leader',
    entity2: userEntity,
    targetName2: 'member',
    relType: 'n:1'
})

Relation.create({
    entity1: userEntity,
    targetName1: 'friends',
    entity2: userEntity,
    targetName2: 'friends',
    relType: 'n:n'
})


const itemEntity = Entity.create({ name: 'Item'})
const itemProperty = Property.create({ name: 'itemName', type: PropertyTypes.String })
itemEntity.properties.push(itemProperty)

Relation.create({
    entity1: userEntity,
    targetName1: 'item',
    entity2: itemEntity,
    targetName2: 'owner',
    relType: '1:1'
})



describe("db setup", () => {
    test('create table', () => {
        const setup = new DBSetup(Entity.instances, Relation.instances)
        const file = "test-create.sqlite"
        if (fs.existsSync(file)) {
            fs.unlinkSync(file)
        }

        const db = new Database(file, {create:true, readwrite: true});
        expect(() => {
            setup.createTableSQL().forEach(sql => {
                const query = db.query(sql)
                query.run()
                query.finalize()
            })
        }).not.toThrow()

        // TODO 查询结构
    })



    test('query test', () => {
        const setup = new DBSetup(Entity.instances, Relation.instances)
        const file = "test.sqlite"
        const db = new Database(file, {create:true, readwrite: true});

        const entityToTableMap = new EntityToTableMap(setup.map)
        const entityQuery = EntityQuery.create('User', entityToTableMap, {
            attributeQuery: [
                'name',
                'age',
                ['profile', {
                    attributeQuery: ['title']
                }],
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
            matchExpression: {
                type: 'group',
                op: '&&',
                // 这里应该是外部添加的关于和 outer 相等的条件
                left: {
                    type: 'variable',
                    name: 'name',
                    key: 'name',
                    value: ['=', '"a"']
                },
                right: {
                    type: 'variable',
                    name: 'file',
                    key: 'file',
                    value: ['exist', {
                        type: 'variable',
                        name: 'fileName',
                        key: 'fileName',
                        value: ['=', '"f3"']
                    },]
                }
            }
        } as EntityQueryData)

        const database = {query: (sql: string) => Promise.resolve([])}
        const queryAgent = new QueryAgent(entityToTableMap, database)
        console.log(queryAgent.buildFindQuery(entityQuery))

        const query = db.query(queryAgent.buildFindQuery(entityQuery))
        expect(query.all().length).toBe(1)
    })
})

