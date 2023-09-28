import { Entity, Relation, Property } from "../../shared/entity/Entity";
import { KlassInstanceOf } from "../../shared/createClass";
import {
    RecordAttribute,
    RecordMapItem,
    ValueAttribute,
    MapData,
    LinkMapItem
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
        columns: {[k:string]: ColumnData},
        hasId?: boolean
    }
}

export const ID_ATTR = 'id'

export class DBSetup {
    public recordToTableMap = new Map<string,string>()
    public tableToRecordsMap = new Map<string, Set<string>>()
    public relationToJoinEntity = new Map<string,string>()
    public tables:TableData = {}
    public map: MapData = { links: {}, records: {}}
    constructor(public entities: KlassInstanceOf<typeof Entity, false>[], public relations: KlassInstanceOf<typeof Relation, false>[], public database?: Database) {
        this.buildMap()
        this.buildTables()
    }
    getRelationName(relation: KlassInstanceOf<typeof Relation, false>) {
        return `${relation.entity1.name}_${relation.targetName1}_${relation.targetName2}_${relation.entity2.name}`
    }

    createRecordToTable(item:string, table:string) {
        this.recordToTableMap.set(item, table)
        assert(!this.tableToRecordsMap.get(table), `create table for ${item} ${table} failed, ${table} already exist.`)
        this.tableToRecordsMap.set(table, new Set([item]))
    }
    // CAUTION 把一个 item 拉过来，等于把它所有同表的 item 拉过来
    joinTables(joinTargetRecord:string, record:string) {
        assert(joinTargetRecord !== record, `join entity should not equal, ${record}`)
        const originTable = this.recordToTableMap.get(record)!
        const tableToJoin = this.recordToTableMap.get(joinTargetRecord)!
        assert(!!originTable  && !!tableToJoin, `table not exists ${originTable} ${tableToJoin}`)
        if (originTable == tableToJoin) return

        const sameTableRecords = this.tableToRecordsMap.get(originTable)
        // 1. 清空原来的
        this.tableToRecordsMap.set(originTable, new Set())
        // 2. 指针也都修改该过来
        sameTableRecords.forEach(sameTableRecord => this.recordToTableMap.set(sameTableRecord, tableToJoin))

        // 3. 新 table 也要合并数据
        const entitiesInTarget = this.tableToRecordsMap.get(tableToJoin)
        this.tableToRecordsMap.set(tableToJoin, new Set([...entitiesInTarget, ...sameTableRecords]))
    }
    renameTableWithJoinedEntities(originTableName) {
        const records = Array.from(this.tableToRecordsMap.get(originTableName))
        if (!records.length) return

        // CAUTION 有合并的情况的话，里面一定有 entity，只用 entity 的名字。除非TableName 始终只用其中 的 entity 名字
        const entities = records.filter(recordName => !this.map.records[recordName].isRelation )

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
    getRelationFieldPrefix(relationData: LinkMapItem) {
        return relationData.mergedTo === 'source' ?
            `${relationData.sourceRecord}_${relationData.sourceAttribute}` :
            `${relationData.targetRecord}_${relationData.targetAttribute}`
    }

    createRecord(entity: KlassInstanceOf<typeof Entity, false>|KlassInstanceOf<typeof Relation, false>, isRelation? :boolean) {
        const attributes = Object.fromEntries(entity.properties.map(property => [
            property.name,
            {
                type: property.type,
            }
        ]))

        // 自动补充
        attributes[ID_ATTR] = {
            type: 'pk'
        }

        if (isRelation) {
            assert(!attributes.source && !attributes.target, 'source and target is reserved name for relation attributes')
        }

        return {
            table: entity.name,
            attributes,
            isRelation,
        } as RecordMapItem
    }
    createLink(relationName: string, relation: KlassInstanceOf<typeof Relation, false>) {
        return {
            table: relationName,
            relType: relation.relType.split(':'),
            sourceRecord: relation.entity1.name,
            sourceAttribute: relation.targetName1,
            targetRecord: relation.entity2.name,
            targetAttribute: relation.targetName2,
            recordName: relationName,
            // sourceField: '_source',
            // targetField: '_target'
        } as LinkMapItem
    }
    createLinkOfRelationAndEntity(relationEntityName: string, relationName: string, relation: KlassInstanceOf<typeof Relation, false>, isSource: boolean) {
        const relationRelType = relation.relType.split(':')
        return {
            table: relationName,
            sourceRecord: relationEntityName,
            sourceAttribute: isSource ? 'source' : 'target',

            targetRecord: isSource ? relation.entity1.name: relation.entity2.name,
            targetAttribute: undefined, // 不能从 entity 来获取关系表
            // source 1:x1 -关联表- x2:1 target
            // 如果是 1: n 关系，x1 是 n，x2 是 1
            // 如果是 n: 1 关系，x1 是 1，x2 是 n
            // 如果是 n: n 关系，x1 是 n，x2 是 n
            // 如果是 1 : 1 关系，x1 是 1，x2 是 1
            relType: [relationRelType[isSource? 1:0], '1'],
            isSourceRelation: true,
            // sourceField: 'source',
            // targetField: undefined, // 虚拟表只往 relation 方向合并。
        } as LinkMapItem
    }
    getRelationNameOfRelationAndEntity(relationName: string, isSource: boolean) {
        return `${relationName}_${isSource? 'source' :'target'}`
    }

    buildMap() {
        // 1. 按照范式生成基础 entity record
        this.entities.forEach(entity => {
            this.map.records[entity.name] = this.createRecord(entity)
            // 记录一下 entity 和 表的关系。后面用于合并的时候做计算。
            this.createRecordToTable(entity.name, entity.name)
        })

        // 2. 生成 relation record 以及所有的 link
        this.relations.forEach(relation => {
            const relationName = this.getRelationName(relation)
            this.map.records[relationName] = this.createRecord(relation, true)
            this.createRecordToTable(relationName, relationName)
            // 记录 relation 里面的  Entity 和 Entity 的关系
            this.map.links[relationName] = this.createLink(relationName, relation)
            // 记录 relation 和实体之间的关系。这个关系是单向的，只能从 relation 发起。
            const virtualSourceRelationName = this.getRelationNameOfRelationAndEntity(relationName, true)
            this.map.links[virtualSourceRelationName] = this.createLinkOfRelationAndEntity(relationName, virtualSourceRelationName, relation, true)
            const virtualTargetRelationName = this.getRelationNameOfRelationAndEntity(relationName, false)
            this.map.links[virtualTargetRelationName] = this.createLinkOfRelationAndEntity(relationName, virtualTargetRelationName, relation, false)
        })

        // 3. 根据 Link 补充 record attribute 到 record 里面。方便之后的查询。
        Object.entries(this.map.links).forEach(([relation, relationData]) => {
            assert(!relationData.isSourceRelation || (relationData.sourceAttribute === 'source' || relationData.sourceAttribute === 'target'), 'virtual relation sourceAttribute should only be source/target')
            this.map.records[relationData.sourceRecord].attributes[relationData.sourceAttribute] = {
                type: 'id',
                isRecord:true,
                relType: relationData.relType,
                recordName: relationData.targetRecord,
                linkName: relation,
                isSource: true,
            } as RecordAttribute

            // CAUTION 关联查询时，不可能出现从实体来获取一个关系的情况，语义不正确。
            assert(!(relationData.isSourceRelation && relationData.targetAttribute), 'virtual relation should not have targetAttribute')
            if (relationData.targetAttribute) {
                this.map.records[relationData.targetRecord].attributes[relationData.targetAttribute] = {
                    type: 'id',
                    isRecord:true,
                    // CAUTION 这里翻转了！在 AttributeInfo 中方便判断。不能用 Array.reverse()，因为不会返回新数组。
                    relType: [relationData.relType[1], relationData.relType[0]],
                    recordName: relationData.sourceRecord,
                    linkName: relation,
                    isSource:false,
                } as RecordAttribute
            }
        })

        this.mergeRecords()
    }
    mergeRecords() {
        // 基本合表策略。合表操作开始，n:n 不合表。 1:1 三表合一 ， 其他往 n 方向合表。
        // 要做两件事:
        // 1) 修改 links 里面的数据。以里面的 mergeTo 作为判断标准
        // 2) 根据 link 情况给 records 分配表，分配 field

        //  TODO 可能有实体声明自己不合并。
        Object.entries(this.map.links).forEach(([relationName, relationData]) => {
            const {relType, sourceRecord, targetRecord, isSourceRelation} = relationData
            // n:n 不合表，先排除
            if (relType.includes('1')) {
                if (relType[0] === '1' && relType[1] === '1') {
                    // 1:1 关系。并且 entity 不同样。真正的三表合一 。往 source 方向合表
                    if (sourceRecord !== targetRecord) {
                        this.joinTables(sourceRecord, targetRecord)
                        this.relationToJoinEntity.set(relationName, sourceRecord)
                        relationData.mergedTo = 'combined'
                        // 这种情况是共用 id 了，而且 mergeTo 其实不区分谁是 source 谁是 target 了。
                    } else {
                        assert(!isSourceRelation, 'virtual relation cannot reach here')
                        // 1:1 关系，entity 相同，无法合表。仍然是 relation 往 source 方向
                        this.relationToJoinEntity.set(relationName, sourceRecord )
                        relationData.mergedTo = 'source'
                    }

                } else if (relType[0] === 'n') {
                    // n:1，合并关系表到 source
                    this.relationToJoinEntity.set(relationName, sourceRecord )
                    relationData.mergedTo = 'source'
                } else {
                    // 1:n 合并关系表到 target
                    assert(!isSourceRelation, `virtual relation can not merge to target, relType: [${relType[0]} : ${relType[1]}]`)
                    this.relationToJoinEntity.set(relationName, targetRecord)
                    relationData.mergedTo = 'target'
                }
            } else {
                assert(!isSourceRelation, 'virtual relation can not be n:n')
            }
        })

        // TODO  独立字段的处理

        // 1. 给所有的 record 分配表（表名重命名过了）
        const originTableNames = Array.from(this.tableToRecordsMap.keys())
        for(let originTableName of originTableNames) {
            this.renameTableWithJoinedEntities(originTableName)
        }

        // 2. 给所有 record 分配 table，给 value 字段分配 field
        Object.entries(this.map.records).forEach(([recordName, record]) => {
            record.table = this.recordToTableMap.get(recordName)!
            Object.entries(record.attributes).forEach(([attributeName, attributeData]) => {
                if ((attributeData as RecordAttribute).isRecord) return

                // valueAttribute 或者 如果这个关系表被合到了这里，并且不是三表合一，我们才给他分配 field
                // attribute 统统加上前缀，这样不管合表没合表，都不会冲突。
                // 如果是 id ，不加前缀，所有合表的实体都共用 id
                attributeData.field = attributeName=== ID_ATTR ? ID_ATTR :`${recordName}_${attributeName}`
            })
        })

        // 3. 开始决定合表后的 source/target 字段分配。这里只要处理作为 relation 的 record 的 source/target 字段
        //  CAUTION  因为后面无论是处理 join 还是其他的，都是从 record 上去找字段。不是从 link 中
        Object.entries(this.map.records).forEach(([recordName, record]) => {
            if( !record.isRelation) return
            const link = this.map.links[recordName]
            if (!link.mergedTo ) {
                record.attributes.source.field = `_source`
                record.attributes.target.field = `_target`
            } else if (link.mergedTo === 'source') {
                // field 名字以 sourceRecord 里面的称呼为主
                const sourceRecord = this.map.records[link.sourceRecord]
                sourceRecord.attributes[link.sourceAttribute].field = `${link.sourceRecord}_${link.sourceAttribute}`
                record.attributes.source.field = ID_ATTR
                record.attributes.target.field = sourceRecord.attributes[link.sourceAttribute].field
            } else if (link.mergedTo === 'target') {
                const targetRecord = this.map.records[link.targetRecord]
                targetRecord.attributes[link.targetAttribute].field = `${link.targetRecord}_${link.targetAttribute}`
                record.attributes.source.field = targetRecord.attributes[link.targetAttribute].field
                record.attributes.target.field = ID_ATTR
            } else {
                // combined 情况
                record.attributes.source.field = ID_ATTR
                record.attributes.target.field = ID_ATTR
            }
        })

    }
    buildTables() {
        // 先添加 valueAttributes 的字段。
        Object.entries(this.map.records).forEach(([recordName, record]) => {
            if (!this.tables[record.table]) {
                this.tables[record.table] = { columns: {}}
            }

            // 有分配 field 的都说明在这张表内
            Object.entries(record.attributes).forEach(([attributeName, attribute]) => {
                if (!attribute.field || this.tables[record.table].columns[attribute.field]) return
                this.tables[record.table].columns[attribute.field] = {
                    name: (attribute as ValueAttribute).field,
                    type: (attribute as ValueAttribute).type
                }
            })
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
${Object.values(this.tables[tableName].columns).map(column => (`
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


