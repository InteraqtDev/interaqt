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
import {Database, ID_ATTR, ROW_ID_ATTR} from "../../runtime/System";

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

export type MergeLinks = string[]

export class DBSetup {
    public recordToTableMap = new Map<string,string>()
    public tableToRecordsMap = new Map<string, Set<string>>()
    public mergeLog: any[] = []
    public tables:TableData = {}
    public map: MapData = { links: {}, records: {}}
    constructor(
        public entities: KlassInstanceOf<typeof Entity, false>[],
        public relations: KlassInstanceOf<typeof Relation, false>[],
        public database?: Database,
        public mergeLinks: MergeLinks = []
    ) {
        this.buildMap()
        this.buildTables()
    }
    getRelationName(relation: KlassInstanceOf<typeof Relation, false>) : string{
        return `${Relation.is(relation.entity1) ? this.getRelationName(relation.entity1 as KlassInstanceOf<typeof Relation, false>) : relation.entity1!.name}_${relation.targetName1}_${relation.targetName2}_${relation.entity2!.name}`
    }

    createRecordToTable(item:string, table:string) {
        this.recordToTableMap.set(item, table)
        assert(!this.tableToRecordsMap.get(table), `create table for ${item} ${table} failed, ${table} already exist.`)
        this.tableToRecordsMap.set(table, new Set([item]))
    }
    // CAUTION 把一个 item 拉过来，等于把它所有同表的 item 拉过来
    joinTables(joinTargetRecord:string, record:string, link: string): string[]| undefined {

        assert(joinTargetRecord !== record, `join entity should not equal, ${record}`)
        const moveTable = this.recordToTableMap.get(record)!
        const joinTargetTable = this.recordToTableMap.get(joinTargetRecord)!
        const joinTargetSameTableRecords = this.tableToRecordsMap.get(joinTargetTable)!
        assert(!!moveTable  && !!joinTargetTable, `table not exists for ${record} ${moveTable} to join ${joinTargetRecord} ${joinTargetTable}`)
        if (moveTable == joinTargetTable) return

        const sameTableRecordsToMove = this.tableToRecordsMap.get(moveTable)!

        // 0 检测是否有环。CAUTION 就是检测 joinTargetTable 里面是否已经有了重复的。

        const conflicts: string[] = []
        sameTableRecordsToMove.forEach(sameTableRecordToMove => {
            // TODO 还要提供 merge 的关系信息？
            if (joinTargetSameTableRecords.has(sameTableRecordToMove)) conflicts.push(sameTableRecordToMove)
        })

        if (conflicts.length) {
            this.mergeLog.push({ joinTargetRecord, record, link, conflicts })
            return conflicts
        }


        // 1. 清空原来 table 里的 records
        this.tableToRecordsMap.set(moveTable, new Set())
        // 2. 移除的 record 对 table 的指针也都修改过来
        sameTableRecordsToMove.forEach(sameTableRecord => this.recordToTableMap.set(sameTableRecord, joinTargetTable))

        // 3. 新 table 合并数据

        this.tableToRecordsMap.set(joinTargetTable, new Set([...joinTargetSameTableRecords, ...sameTableRecordsToMove]))

        // 4. 记录 log
        this.mergeLog.push({ joinTargetRecord, record, link })
    }
    combineRecordTable(mergeTarget: string, toMerge: string, link: string,) {
        let linkConflict
        // target/toMerge 一定是不同实体才能merge 所以这里可以用这个判断方向
        const virtualLinkName = (this.map.records[link].attributes.source as RecordAttribute).linkName
        linkConflict = this.joinTables(mergeTarget, link, virtualLinkName)

        if (linkConflict) return linkConflict

        return this.joinTables(mergeTarget, toMerge, link)
    }
    renameTableWithJoinedEntities(originTableName: string) {
        const records = Array.from(this.tableToRecordsMap.get(originTableName)!)
        if (!records.length) return

        // CAUTION 有合并的情况的话，里面一定有 entity，只用 entity 的名字。除非TableName 始终只用其中 的 entity 名字
        const entities = records.filter(recordName => !this.map.records[recordName].isRelation )
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
    // getRelationFieldPrefix(relationData: LinkMapItem) {
    //     return relationData.mergedTo === 'source' ?
    //         `${relationData.sourceRecord}_${relationData.sourceAttribute}` :
    //         `${relationData.targetRecord}_${relationData.targetAttribute}`
    // }

    createRecord(entity: KlassInstanceOf<typeof Entity, false>|KlassInstanceOf<typeof Relation, false>, isRelation? :boolean) {
        const attributes = Object.fromEntries(entity.properties!.map(property => [
            property.name,
            {
                type: property.type,
            }
        ]))

        // 自动补充
        attributes[ID_ATTR] = {
            type: 'id'
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
            relType: relation.relType!.split(':'),
            sourceRecord: this.getRecordName(relation.entity1 as KlassInstanceOf<typeof Entity, false>),
            sourceAttribute: relation.targetName1,
            targetRecord: this.getRecordName(relation.entity2!),
            targetAttribute: relation.targetName2,
            recordName: relationName,
            isTargetReliance: relation.isTargetReliance
        } as LinkMapItem
    }
    getRecordName(rawRecord:KlassInstanceOf<typeof Entity, false>|KlassInstanceOf<typeof Relation, false>): string {
        return Relation.is(rawRecord) ?
            this.getRelationName(rawRecord as KlassInstanceOf<typeof Relation, false>):
            rawRecord.name!
    }
    //虚拟 link
    createLinkOfRelationAndEntity(relationEntityName: string, relationName: string, relation: KlassInstanceOf<typeof Relation, false>, isSource: boolean) {
        const relationRelType = relation.relType!.split(':')
        return {
            table: undefined, // 虚拟 link 没有表
            sourceRecord: relationEntityName,
            sourceAttribute: isSource ? 'source' : 'target',
            targetRecord: isSource ? this.getRecordName(relation.entity1 as KlassInstanceOf<typeof Entity, false>): this.getRecordName(relation.entity2!),
            // targetRecord: isSource ? relation.entity1.name: relation.entity2.name,
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
            this.map.records[entity.name!] = this.createRecord(entity)
            // 记录一下 entity 和 表的关系。后面用于合并的时候做计算。
            this.createRecordToTable(entity.name!, entity.name!)
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
                // CAUTION 这里是表示这个 target 是 reliance
                isReliance: relationData.isTargetReliance
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
        this.assignTables()

    }
    mergeRecords() {
        // 基本合表策略:
        // 1. 从用户指定的 mergeLinks 里面开始合并三表合一
        // 2. reliance 三表合一。这里有一个不能有链的检测。
        // 3. 剩余的 x:1 关系只合并关系表。

        // 合并后要做的事:
        // 1) 修改 links 里面的数据。以里面的 mergeTo 作为判断标准

        //  TODO 可能有 reliance 实体声明自己不合并。
        // 0. 做好数据准备，先把 reliance 关系和 非 reliance 的 xToOne 找出来等待处理。CAUTION oneToOneReliance 肯定不是 symmetric ？
        const oneToOneRelianceLinks = Object.fromEntries(Object.entries(this.map.links).filter(([, linkData]) => {
            return !linkData.isSourceRelation && linkData.relType[0] === '1' && linkData.relType[1] === '1' && linkData.isTargetReliance
        }))

        const xToOneNotRelianceLinks = Object.fromEntries(Object.entries(this.map.links).filter(([, linkData]) => {
            // CAUTION 一定要过滤掉虚拟 link
            return !linkData.isSourceRelation && !linkData.isTargetReliance &&
                (
                    (linkData.relType[0] === '1' && linkData.relType[1] === '1') ||
                    (linkData.relType[0] === 'n' && linkData.relType[1] === '1') ||
                    (linkData.relType[0] === '1' && linkData.relType[1] === 'n')
                )
        }))

        const mergedLinks: LinkMapItem[] = []

        // 1. 遍历用户指定的 merge 路径。
        this.mergeLinks.forEach(path => {
            const [rootRecord, ...attributePath] = path.split('.')
            let currentRecord = rootRecord
            for(let i = 0; i < attributePath.length; i++ ) {
                const currentAttribute = attributePath[i]
                const attributeData = (this.map.records[currentRecord].attributes[currentAttribute]! as RecordAttribute)
                const linkName = attributeData.linkName
                const linkData = this.map.links[linkName]
                const {relType, sourceRecord, targetRecord, isSourceRelation} = linkData
                assert(
                    relType[0] === '1' && relType[1] === '1' && sourceRecord !== targetRecord,
                    `only 1:1 can merge: ${rootRecord}.${attributePath.slice(0, i+1).join('.')}`
                )
                const recordToMove = sourceRecord === currentRecord ? targetRecord : sourceRecord
                const conflicts = this.combineRecordTable(currentRecord, recordToMove, linkName)
                if (conflicts) {
                    throw new Error(`conflict found when join ${linkName}, ${conflicts.join(',')} already merged with ${currentRecord}`)
                }

                // 成功要修改 map 的数据
                linkData.mergedTo = 'combined'
                mergedLinks.push(linkData)
                // 路径下一个
                currentRecord = attributeData.recordName
                // 处理完了 在上面的 links 里面删除这个 link
                delete oneToOneRelianceLinks[linkName]
                delete xToOneNotRelianceLinks[linkName]
            }
        })


        // 2. reliance 三表合一。这里有一个不能有链的检测。
        Object.values(oneToOneRelianceLinks).forEach(linkData => {
            const { sourceRecord, targetRecord, recordName: linkRecord} = linkData
            // 只是尝试。有冲突就不会处理
            const conflicts = this.combineRecordTable(sourceRecord, targetRecord, linkRecord!)
            if (!conflicts) {
                linkData.mergedTo = 'combined'
                mergedLinks.push(linkData)
            } else {
                // 改为 尝试 merge link
                const linkToRecordLinkName = (this.map.records[linkRecord!].attributes.source! as RecordAttribute).linkName
                const linkConflicts = this.joinTables(sourceRecord, linkRecord!, linkToRecordLinkName!)
                if (!linkConflicts) {
                    this.mergeLog.push(conflicts)
                    linkData.mergedTo = 'source'
                    mergedLinks.push(linkData)
                }
            }
        })

        // CAUTION 这些关系里面没有虚拟关系。上面过滤掉了。
        // FIXME 还要加上 reliance 不是 1:1 的？
        // 3. 剩余的 x:1 关系只合并关系表。
        Object.values(xToOneNotRelianceLinks).forEach(linkData => {
            const { relType, sourceRecord, targetRecord, recordName: linkRecord} = linkData
            const mergeWithSource = relType[1] !== 'n'
            const mergeTarget = mergeWithSource ? sourceRecord : targetRecord
            const linkToRecordLinkName = (this.map.records[linkRecord!].attributes[mergeWithSource ? 'source': 'target']! as RecordAttribute).linkName
            // 只是尝试。有冲突就不会处理
            const linkConflicts = this.joinTables(mergeTarget, linkRecord!, linkToRecordLinkName!)
            if (!linkConflicts) {
                linkData.mergedTo = mergeWithSource ? 'source' : 'target'
                mergedLinks.push(linkData)
            }
        })


        // 4. 先给所有的 virtualLink 赋予默认 的 mergeTo，下一步再按照实际情况修改该
        Object.values(this.map.links).forEach(linkData => {
            if (linkData.isSourceRelation) {
                linkData.mergedTo = 'source'
            }
        })

        // 4.1 给 virtualLink 也更新 map
        mergedLinks.forEach(mergedLinkData => {
            if (mergedLinkData.mergedTo === 'combined' || mergedLinkData.mergedTo === 'source') {
                const sourceLinkName = (this.map.records[mergedLinkData.recordName!].attributes.source as RecordAttribute).linkName
                this.map.links[sourceLinkName].mergedTo = 'combined'
            }

            if (mergedLinkData.mergedTo === 'combined' || mergedLinkData.mergedTo === 'target') {
                const sourceLinkName = (this.map.records[mergedLinkData.recordName!].attributes.target as RecordAttribute).linkName
                this.map.links[sourceLinkName].mergedTo = 'combined'
            }
        })

        // Object.entries(this.map.links).forEach(([relationName, relationData]) => {
        //     const {relType, sourceRecord, targetRecord, isSourceRelation} = relationData
        //     // n:n 不合表，先排除
        //     if (relType.includes('1')) {
        //         // FIXME  - 如果 A 和 B 有两个关系的都是 1:1，只能按照其中一个关系三表合一，不然逻辑上有问题。
        //         if (relType[0] === '1' && relType[1] === '1') {
        //             // 1:1 关系。并且 entity 不同样。真正的三表合一 。往 source 方向合表
        //             if (sourceRecord !== targetRecord) {
        //                 this.joinTables(sourceRecord, targetRecord)
        //                 this.relationToJoinEntity.set(relationName, sourceRecord)
        //                 relationData.mergedTo = 'combined'
        //                 // 这种情况是共用 id 了，而且 mergeTo 其实不区分谁是 source 谁是 target 了。
        //             } else {
        //                 assert(!isSourceRelation, 'virtual relation cannot reach here')
        //                 // 1:1 关系，entity 相同，无法合表。仍然是 relation 往 source 方向
        //                 this.relationToJoinEntity.set(relationName, sourceRecord )
        //                 relationData.mergedTo = 'source'
        //             }
        //
        //         } else if (relType[0] === 'n') {
        //             // n:1，合并关系表到 source
        //             this.relationToJoinEntity.set(relationName, sourceRecord )
        //             relationData.mergedTo = 'source'
        //         } else {
        //             // 1:n 合并关系表到 target
        //             assert(!isSourceRelation, `virtual relation can not merge to target, relType: [${relType[0]} : ${relType[1]}]`)
        //             this.relationToJoinEntity.set(relationName, targetRecord)
        //             relationData.mergedTo = 'target'
        //         }
        //     } else {
        //         assert(!isSourceRelation, 'virtual relation can not be n:n')
        //     }
        // })

        // TODO  独立字段的处理
    }
    assignTables() {
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
                attributeData.field = `${recordName}_${attributeName}`
            })
        })

        // 2.1 给所有 links 分配 table
        Object.entries(this.map.links).forEach(([linkName, link]) => {
            link.table = this.recordToTableMap.get(linkName)!
        })

        // 3. 开始决定合表后的 source/target 字段分配。这里只要处理作为 relation 的 record 的 source/target 字段
        //  CAUTION  因为后面无论是处理 join 还是其他的，都是从 record 上去找字段。不是从 link 中
        Object.entries(this.map.records).forEach(([recordName, record]) => {
            if( !record.isRelation) return
            const link = this.map.links[recordName]
            if (!link.mergedTo ) {
                record.attributes.source.field = `${recordName}_source`
                record.attributes.target.field = `${recordName}_target`
            } else if (link.mergedTo === 'source') {
                // field 名字以 sourceRecord 里面的称呼为主
                record.attributes.target.field = `${link.sourceRecord}_${link.sourceAttribute}`
            } else if (link.mergedTo === 'target') {
                record.attributes.source.field = `${link.targetRecord}_${link.targetAttribute}`
            } else {
                // combined 情况
                // const sourceRecord = this.map.records[link.sourceRecord]
                // const targetRecord = this.map.records[link.targetRecord]
                // record.attributes.source.field = sourceRecord.attributes[ID_ATTR].field
                // record.attributes.target.field = targetRecord.attributes[ID_ATTR].field
            }
        })
    }
    buildTables() {
        // 先添加 valueAttributes 的字段。
        Object.entries(this.map.records).forEach(([recordName, record]) => {
            if (!this.tables[record.table]) {
                this.tables[record.table] = { columns: {
                    [ROW_ID_ATTR]: {
                        name: ROW_ID_ATTR,
                        type: 'pk'
                    }
                }}
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
        } else if (type === 'string') {
            return 'TEXT'
        } else if (type === 'boolean') {
            return 'INT(2)'
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


