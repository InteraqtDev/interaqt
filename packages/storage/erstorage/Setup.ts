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
    public recordToTableMap = new Map<string,string>()
    public tableToRecordsMap = new Map<string, Set<string>>()
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

    createRecordToTable(item, table) {
        this.recordToTableMap.set(item, table)
        assert(!this.tableToRecordsMap.get(table), `create table for ${item} ${table} failed, ${table} already exist.`)
        this.tableToRecordsMap.set(table, new Set([item]))
    }
    // CAUTION 把一个 item 拉过来，等于把它所有同表的 item 拉过来
    joinTables(joinTargetEntity, entity) {
        assert(joinTargetEntity !== entity, `join entity should not equal, ${entity}`)
        const originTable = this.recordToTableMap.get(entity)
        const tableToJoin = this.recordToTableMap.get(joinTargetEntity)
        if (originTable == tableToJoin) return

        const sameTableEntities = this.tableToRecordsMap.get(originTable)
        // 1. 清空原来的
        this.tableToRecordsMap.set(originTable, new Set())
        // 2. 指针也都修改该过来
        sameTableEntities.forEach(sameTableEntity => this.recordToTableMap.set(sameTableEntity, tableToJoin))

        // 3. 新 table 也要合并数据
        const entitiesInTarget = this.tableToRecordsMap.get(tableToJoin)
        this.tableToRecordsMap.set(tableToJoin, new Set([...entitiesInTarget, ...sameTableEntities]))
    }
    renameTableWithJoinedEntities(originTableName) {
        const records = Array.from(this.tableToRecordsMap.get(originTableName))
        if (!records.length) return

        // CAUTION 有合并的情况的话，里面一定有 entity，只用 entity 的名字。除非TableName 始终只用其中 的 entity 名字
        const entities = records.filter(recordName => !this.map.entities[recordName].isRelation )

        assert(!!entities.length || records.length === 1, `find merged records, but no entity inside, ${entities.length}, ${records.length}`)
        const newTableName = entities.length ? entities.join('_') : originTableName


        this.tableToRecordsMap.delete(originTableName)
        this.tableToRecordsMap.set(newTableName, new Set(records))

        records.forEach(record => {
            this.recordToTableMap.set(record, newTableName)
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

    mapEntityOrRelationToMapData(entity: KlassInstanceOf<typeof Entity, false>|KlassInstanceOf<typeof Relation, false>, isRelation? :boolean) {
        const attributes = Object.fromEntries(entity.properties.map(property => [
            property.name,
            {
                type: property.type,
                fieldType: this.getFieldType(property),
                field: `${entity.name}_${property.name}`
            }
        ]))

        if (isRelation) {
            assert(!attributes.source && !attributes.target, 'source and target is reserved name for relation attributes')
        }

        return {
            table: entity.name,
            attributes,
            isRelation,
        } as EntityMapItemData
    }
    mapRelationToMapData(relationName: string, relation: KlassInstanceOf<typeof Relation, false>) {
        return {
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
    }
    createVirtualRelationMapData(relationEntityName: string, relationName: string, relation: KlassInstanceOf<typeof Relation, false>, isSource: boolean) {
        const relationRelType = relation.relType.split(':')
        return {
            table: relationName,
            attributes: {},
            sourceEntity: relationEntityName,
            sourceAttribute: isSource ? 'source' : 'target',
            sourceField: 'source',
            targetEntity: isSource ? relation.entity1.name: relation.entity2.name,
            targetAttribute: undefined, // 不能从 entity 来获取关系表
            targetField: undefined, // 虚拟表只往 relation 方向合并。
            // source 1:x1 -关联表- x2:1 target
            // 如果是 1: n 关系，x1 是 n，x2 是 1
            // 如果是 n: 1 关系，x1 是 1，x2 是 n
            // 如果是 n: n 关系，x1 是 n，x2 是 n
            // 如果是 1 : 1 关系，x1 是 1，x2 是 1
            relType: [relationRelType[isSource? 1:0], '1'],
            isSourceRelation: true
        } as RelationMapItemData
    }
    getVirtualRelationName(relationName: string, isSource: boolean) {
        return `${relationName}_${isSource? 'source' :'target'}`
    }
    buildMap() {
        // 1. 按照范式生成基础 entity relation table 和 field 信息
        this.entities.forEach(entity => {
            this.map.entities[entity.name] = this.mapEntityOrRelationToMapData(entity)
            // 记录一下 entity 和 表的关系。后面用于合并的时候做计算。
            this.createRecordToTable(entity.name, entity.name)
        })


        this.relations.forEach(relation => {
            const relationName = this.getRelationName(relation)
            this.map.relations[relationName] = this.mapRelationToMapData(relationName, relation)
            // CAUTION relation 的实体化
            this.map.entities[relationName] = this.mapEntityOrRelationToMapData(relation, true)
            this.createRecordToTable(relationName, relationName)

            // relation 和实体之间的 虚拟关系
            const virtualSourceRelationName = this.getVirtualRelationName(relationName, true)
            this.map.relations[virtualSourceRelationName] = this.createVirtualRelationMapData(relationName, virtualSourceRelationName, relation, true)
            const virtualTargetRelationName = this.getVirtualRelationName(relationName, false)
            this.map.relations[virtualTargetRelationName] = this.createVirtualRelationMapData(relationName, virtualTargetRelationName, relation, false)
        })

        // 2. 基本合表策略。合表操作开始，n:n 不合表。 1:1 三表合一 ， 其他往 n 方向合表。
        //   CAUTION 这里面的处理既有 virtualRelation 也有实际的 Relation。
        //  TODO 可能有实体声明自己不合并。
        Object.entries(this.map.relations).forEach(([relationName, relationData]) => {
            const {relType, sourceEntity, targetEntity, isSourceRelation} = relationData
            // n:n 不合表，先排除
            if (relType.includes('1')) {
                if (relType[0] === '1' && relType[1] === '1') {
                    // 1:1 关系。并且 entity 不同样。真正的三表合一 。往 source 方向合表
                    if (sourceEntity !== targetEntity) {
                        this.joinTables(sourceEntity, targetEntity)
                        this.relationToJoinEntity.set(relationName, sourceEntity)
                        relationData.mergedTo = 'combined'
                        // 这种情况是共用 id 了，而且 mergeTo 其实不区分谁是 source 谁是 target 了。
                        // relationData.sourceField = `${relationData.sourceEntity}_${relationData.sourceAttribute}`
                        delete relationData.sourceField
                        delete relationData.targetField
                    } else {
                        assert(!isSourceRelation, 'virtual relation cannot reach here')
                        // 1:1 关系，entity 相同，无法合表。仍然是 relation 往 source 方向
                        this.relationToJoinEntity.set(relationName, sourceEntity )
                        relationData.mergedTo = 'source'
                        relationData.sourceField = `${relationData.sourceEntity}_${relationData.sourceAttribute}`
                        delete relationData.targetField
                    }

                } else if (relType[0] === 'n') {
                    // n:1，合并关系表到 source
                    this.relationToJoinEntity.set(relationName, sourceEntity )
                    relationData.mergedTo = 'source'
                    relationData.sourceField = `${relationData.sourceEntity}_${relationData.sourceAttribute}`
                    delete relationData.targetField
                } else {
                    // 1:n 合并关系表到 target
                    assert(!isSourceRelation, `virtual relation can not merge to target, relType: [${relType[0]} : ${relType[1]}]`)
                    this.relationToJoinEntity.set(relationName, targetEntity)
                    relationData.mergedTo = 'target'
                    relationData.targetField = `${relationData.targetEntity}_${relationData.targetAttribute}`
                    delete relationData.sourceField
                }
            } else {
                assert(!isSourceRelation, 'virtual relation can not be n:n')
            }
        })

        // TODO 3. 字段独立

        // 4. 先处理所有 record 的 table 名
        // 4.1 按照合并后的情况，重命名 table
        const originTableNames = Array.from(this.tableToRecordsMap.keys())
        for(let originTableName of originTableNames) {
            this.renameTableWithJoinedEntities(originTableName)
        }

        // 4.2 重新修改 map 里面的所有 record 的 table 的名字。
        //  CAUTION field 因为默认就加了前缀，所以不用管。
        this.recordToTableMap.forEach((tableName, entity) => {
            this.map.entities[entity].table = tableName
        })

        // 6. relation map 里面的 table 和 attributes 的 field 信息都要改。
        //  这里面既有真实关系，也有虚拟关系
        this.relationToJoinEntity.forEach((entityName, relationName) => {
            const relationData = this.map.relations[relationName]
            relationData.table = this.map.entities[entityName].table

            // 虚拟关系不可能有 attributes。
            if (!relationData.isSourceRelation) {
                // 这里的 field 要加前缀
                const relationAttributePrefix = this.getRelationFieldPrefix(relationData)

                // relation 的 attributeData 是手动加的前缀，因为一开始不确定会往哪里合并，所以不能默认处理。
                Object.entries(relationData.attributes).forEach(([attribute, attributeData]) => {
                    attributeData.field = `${relationAttributePrefix}_${attribute}`
                })
            }
        })

        // 7. 补充 relation 的字段到 entity attribute 里面。这里既会把 relate entity 作为 attribute 补充到 entity 里面。也会把 source/target 补充到 relation 的 attributes 里面
        Object.entries(this.map.relations).forEach(([relation, relationData]) => {

            assert(!relationData.isSourceRelation || (relationData.sourceAttribute === 'source' || relationData.sourceAttribute === 'target'), 'virtual relation sourceAttribute should only be source/target')
            this.map.entities[relationData.sourceEntity].attributes[relationData.sourceAttribute] = {
                isEntity:true,
                relType: relationData.relType,
                entityName: relationData.targetEntity,
                relationName: relation,
                isSource: true,
                table: this.map.entities[relationData.targetEntity].table,
                // 这个 field 是指如果关系表合过来了，那么它在实体表里面用于记录 id 的名字。
                // FIXME 好像这里不应该由 relation 来决定，应该由 entity 来决定。既然合表到我这里了，当然以我的 attribute name 来称呼。

                field: (relationData.mergedTo === 'source' ? relationData.sourceField : undefined)
            } as EntityEntityAttributeMapType

            // CAUTION 关联查询时，不可能出现从实体来获取一个关系的情况，语义不正确。
            assert(!(relationData.isSourceRelation && relationData.targetAttribute), 'virtual relation should not have targetAttribute')
            if (!relationData.isSourceRelation) {
                this.map.entities[relationData.targetEntity].attributes[relationData.targetAttribute] = {
                    isEntity:true,
                    // CAUTION 这里翻转了！在 AttributeInfo 中方便判断。不能用 Array.reverse()，因为不会返回新数组。
                    relType: [relationData.relType[1], relationData.relType[0]],
                    entityName: relationData.sourceEntity,
                    relationName: relation,
                    isSource:false,
                    table: this.map.entities[relationData.sourceEntity].table,
                    field: relationData.mergedTo === 'target' ? relationData.targetField : undefined
                } as EntityEntityAttributeMapType
            }
        })

    }
    buildTables() {
        // 先添加 valueAttributes 的字段。
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


        // 然后再根据 relation 的合并字段添加 column
        Object.entries(this.map.relations).forEach(([relation, relationData]) => {
            assert(!relationData.isSourceRelation || !!relationData.mergedTo, 'virtual relation should always be merged')
            // 虚拟关系表没有属性，并且合并了也不应该有单独的 table，他肯定合并了。
            // 这里如果是虚拟表，除了往 关系表 里面插入 source/target 的 id 字段以外，什么都不能干。
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
            } else if(relationData.mergedTo !== 'combined'){
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


