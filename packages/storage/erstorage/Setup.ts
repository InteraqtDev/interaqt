import { Entity, Relation, Property } from "../../shared/entity/Entity";
import { KlassInstanceOf } from "../../shared/createClass";
import {
    EntityEntityAttributeMapType,
    EntityMapItemData,
    EntityValueAttributeMapType,
    MapData,
    RelationMapItemData
} from "./EntityToTableMap";
import {assert} from "../util";
import {Database} from "../../runtime/System";

type ColumnData = {
    name:string,
    type:string,
    notNull?: boolean,
}


export type TableData = {
    [k:string]: {
        columns: ColumnData[],
        hasId?: boolean
    }
}


export class DBSetup {
    public entityToTableMap = new Map<string,string>()
    public tableToEntitiesMap = new Map<string, Set<string>>()
    public relationToJoinEntity = new Map<string,string>()
    public tables:TableData = {}
    public map: MapData = { relations: {}, entities: {}}
    constructor(public entities: KlassInstanceOf<typeof Entity, false>[], public relations: KlassInstanceOf<typeof Relation, false>[], public database?: Database) {
        this.buildMap()
        this.buildTables()
    }
    getRelationName(relation: KlassInstanceOf<typeof Relation, false>) {
        return `${relation.entity1.name}_${relation.targetName1}_${relation.targetName2}_${relation.entity2.name}`
    }

    addEntityToTable(item, table) {
        const originTable = this.entityToTableMap.get(item)

        this.entityToTableMap.set(item, table)

        let tableItems = this.tableToEntitiesMap.get(table)
        if (!tableItems) {
            this.tableToEntitiesMap.set(table, (tableItems = new Set()))
        }
        tableItems.add(item)

        // recursive
        const originSameTableItems = originTable ? this.tableToEntitiesMap.get(originTable) : new Set()
        originSameTableItems.forEach(originSameTableItem => this.joinTables(item, originSameTableItem))
    }
    joinTables(joinTargetEntity, entity) {
        assert(joinTargetEntity !== entity, 'join entity should not equal')
        const originTable = this.entityToTableMap.get(entity)!
        this.tableToEntitiesMap.get(originTable).delete(entity)

        const tableToJoin = this.entityToTableMap.get(joinTargetEntity)
        this.addEntityToTable(entity, tableToJoin)
    }
    renameTableWithJoinedEntities(originTableName) {
        const entities = this.tableToEntitiesMap.get(originTableName)
        const newTableName = Array.from(entities).join('_')
        this.tableToEntitiesMap.delete(originTableName)
        this.tableToEntitiesMap.set(newTableName, entities)

        entities.forEach(entity => {
            this.entityToTableMap.set(entity, newTableName)
        })
    }

    // TODO 应该和数据库有关，应该能配置更多地参数
    getFieldType(property: KlassInstanceOf<typeof Property, false>) {
        if (property.type === 'string') {
            return 'TEXT'
        } else if (property.type === 'number') {
            return 'INT'
        } else if (property.type === 'boolean') {
            return 'SMALLINT'
        } else {
            assert(false, `unknown type: ${property.type}`)
        }
    }
    getRelationFieldPrefix(relationData: RelationMapItemData) {
        return relationData.mergedTo === 'source' ?
            `${relationData.sourceEntity}_${relationData.sourceAttribute}` :
            `${relationData.targetEntity}_${relationData.targetAttribute}`
    }
    buildMap() {
        // 1. 按照范式生成基础 entity relation table 和 field 信息
        this.entities.forEach(entity => {
            this.map.entities[entity.name] = {
                table: entity.name,
                attributes: Object.fromEntries(entity.properties.map(property => [
                    property.name,
                    {
                        type: property.type,
                        fieldType: this.getFieldType(property),
                        field: `${entity.name}_${property.name}`
                    }
                ]))
            } as EntityMapItemData

            this.addEntityToTable(entity.name, entity.name)
        })

        this.relations.forEach(relation => {
            const relationName = this.getRelationName(relation)

            this.map.relations[relationName] = {
                table: relationName,
                attributes: Object.fromEntries(relation.properties.map(property => [
                    property.name,
                    {
                        type: property.type,
                        fieldType: this.getFieldType(property),
                        field: property.name
                    }
                ])),
                relType: relation.relType.split(':'),
                sourceEntity: relation.entity1.name,
                sourceAttribute: relation.targetName1,
                sourceField: '_source',
                targetEntity: relation.entity2.name,
                targetAttribute: relation.targetName2,
                targetField: '_target'
            } as RelationMapItemData
        })

        // 2. 按照规则往 n 方向合表
        //  TODO 可能有实体生命自己不合并。
        Object.entries(this.map.relations).forEach(([relationName, relationData]) => {
            const {relType, sourceEntity, targetEntity} = relationData
            if (relType.includes('1')) {
                if (relType[0] === '1' && relType[1] === '1') {
                    // 三表合一 。往 source 方向合表
                    if (sourceEntity !== targetEntity) {
                        this.joinTables(sourceEntity, targetEntity)
                    }
                    this.relationToJoinEntity.set(relationName, sourceEntity)

                    relationData.mergedTo = 'source'
                    relationData.sourceField = `${relationData.sourceEntity}_${relationData.sourceAttribute}`
                    delete relationData.targetField
                } else if (relType[0] === 'n') {
                    // n:1，只合并关系表
                    this.relationToJoinEntity.set(relationName, sourceEntity )
                    relationData.mergedTo = 'source'
                    relationData.sourceField = `${relationData.sourceEntity}_${relationData.sourceAttribute}`
                    delete relationData.targetField
                } else {
                    // 1:n 只合并关系表
                    this.relationToJoinEntity.set(relationName, targetEntity)
                    relationData.mergedTo = 'target'
                    relationData.targetField = `${relationData.targetEntity}_${relationData.targetAttribute}`
                    delete relationData.sourceField
                }
            }
        })

        // TODO 3. 字段独立

        // 4. 按照和明后的情况，重命名 table
        const originTableNames = Array.from(this.tableToEntitiesMap.keys())
        for(let originTableName of originTableNames) {
            this.renameTableWithJoinedEntities(originTableName)
        }


        // 5. 重新修改 entity map 里面的 table 的名字。
        //  CAUTION field 因为默认就加了前缀，所以不用管。
        this.entityToTableMap.forEach((tableName, entity) => {
            this.map.entities[entity].table = tableName
        })

        // 6. relation map 里面的 table 和 field 信息都要改
        this.relationToJoinEntity.forEach((entity, relationName) => {
            const relationData = this.map.relations[relationName]
            relationData.table = this.map.entities[entity].table

            // 这里的 field 要加前缀
            const relationAttributePrefix = this.getRelationFieldPrefix(relationData)

            // relation 的 attributeData 是手动加的前缀，因为一开始不确定会往哪里合并，所以不能默认处理。
            Object.entries(relationData.attributes).forEach(([attribute, attributeData]) => {
                attributeData.field = `${relationAttributePrefix}_${attribute}`
            })
        })

        // 7. 补充 relation 的辅助字段到 entity attribute 里面
        Object.entries(this.map.relations).forEach(([relation, relationData]) => {
            this.map.entities[relationData.sourceEntity].attributes[relationData.sourceAttribute] = {
                isEntity:true,
                relType: relationData.relType,
                entityName: relationData.targetEntity,
                relationName: relation,
                isSource: true,
                table: this.map.entities[relationData.targetEntity].table,
                // 这个 field 是指如果合表了，那么它在实体表里面的名字。
                field: relationData.mergedTo ?
                    (relationData.mergedTo === 'source' ? relationData.sourceField : relationData.targetField) :
                    ''
            } as EntityEntityAttributeMapType


            this.map.entities[relationData.targetEntity].attributes[relationData.targetAttribute] = {
                isEntity:true,
                // CAUTION 这里翻转了！在 AttributeInfo 中方便判断。不能用 Array.reverse()，因为不会返回新数组。
                relType: [relationData.relType[1], relationData.relType[0]],
                entityName: relationData.sourceEntity,
                relationName: relation,
                isSource:false,
                table: this.map.entities[relationData.sourceEntity].table,
                field: relationData.mergedTo ?
                    (relationData.mergedTo === 'target' ? relationData.targetField : relationData.sourceField) :
                    ''
            } as EntityEntityAttributeMapType
        })

    }
    buildTables() {

        Object.entries(this.map.entities).forEach(([entity, entityData]) => {
            if (!this.tables[entityData.table]) {
                this.tables[entityData.table] = { columns: [], hasId:true }
                this.tables[entityData.table].columns.push({
                    name: 'id',
                    type: 'pk',
                })
            }


            this.tables[entityData.table].columns.push(...Object.entries(entityData.attributes).filter(([,x]) => !x.isEntity).map(([attribute, attributeData]) => {
                return {
                    name: (attributeData as EntityValueAttributeMapType).field,
                    type: (attributeData as EntityValueAttributeMapType).fieldType,
                }
            }))


        })


        Object.entries(this.map.relations).forEach(([relation, relationData]) => {
            if (!this.tables[relationData.table]) this.tables[relationData.table] = { columns: [] }
            this.tables[relationData.table].columns.push(...Object.entries(relationData.attributes).map(([attribute, attributeData]) => {
                return {
                    name: attributeData.field,
                    type: attributeData.fieldType,
                }
            }))

            // 没合并的情况
            if (!relationData.mergedTo) {
                // 三表合一，共用 id
                this.tables[relationData.table].columns.push({
                    name: relationData.sourceField,
                    type: 'id'
                })

                this.tables[relationData.table].columns.push({
                    name: relationData.targetField,
                    type: 'id'
                })
            } else if(!(
                relationData.table === this.map.entities[relationData.sourceEntity].table &&
                relationData.table === this.map.entities[relationData.targetEntity].table &&
                relationData.relType[0] === '1' && relationData.relType[1] === '1'
            )){
                // 有合并的情况，但是不是1：1 的三表合一。三表合一都是公用 id，不需要记录了。
                if (relationData.mergedTo === 'source') {
                    this.tables[relationData.table].columns.push({
                        name: relationData.sourceField,
                        type: 'id'
                    })
                } else {
                    this.tables[relationData.table].columns.push({
                        name: relationData.targetField,
                        type: 'id'
                    })
                }
            }
        })
    }
    getDBFieldType(type: string) {
        if (type === 'pk') {
            // TODO 不同的引擎不同，这里是 sqlite 的写法
            return 'INTEGER PRIMARY KEY'
        } else if (type === 'id') {
            return 'INT'
        } else {
            return type
        }
    }
    createTableSQL() {
        return Object.keys(this.tables).map(tableName => (
            `
CREATE TABLE ${tableName} (
${this.tables[tableName].columns.map(column => (`
    ${column.name} ${this.getDBFieldType(column.type)}`)).join(',')}
)

`
        ))
    }
    createTables() {
        return Promise.all(this.createTableSQL().map(sql => {
            return this.database!.scheme(sql)
        }))
    }
}


