import {EntityToTableMap} from "./EntityToTableMap";
import {assert, setByPath} from "../util";
// @ts-ignore
import {BoolExp, ExpressionData} from '../../shared/BoolExp.ts'
// @ts-ignore
import {Database, EntityIdRef} from '../../runtime/System'
import {FieldMatchAtom, MatchAtom, MatchExp, MatchExpressionData} from "./MatchExp.ts";
import {AttributeQuery, AttributeQueryDataItem} from "./AttributeQuery.ts";
import {LINK_SYMBOL, RecordQuery, RecordQueryTree} from "./RecordQuery.ts";
import {NewRecordData, RawEntityData} from "./NewRecordData.ts";
import {someAsync} from "./util.ts";


export type MutationEvent = {
    type: "create"|'update'|'delete',
    recordName: string,
    id?: string,
    keys?: string[],
    record?: Record
    oldRecord?: Record
}

export type JoinTables = {
    for: any
    joinSource: [string, string]
    joinIdField: [string, string]
    joinTarget: [string, string]
}[]

export type Record = EntityIdRef & {
    [k:string]: any
}

export class RecordQueryAgent {
    constructor(public map: EntityToTableMap, public database: Database) {}
    buildXToOneFindQuery(recordQuery: RecordQuery, prefix='') {
        // 从所有条件里面构建出 join clause
        const fieldQueryTree = recordQuery.attributeQuery!.xToOneQueryTree

        const matchQueryTree = recordQuery.matchExpression.xToOneQueryTree
        const finalQueryTree = fieldQueryTree.merge(matchQueryTree)
        const joinTables = this.getJoinTables(finalQueryTree, [recordQuery.recordName])

        const fieldMatchExp = recordQuery.matchExpression.buildFieldMatchExpression()

        return `
SELECT ${prefix ? '' : 'DISTINCT'}
${this.buildSelectClause(recordQuery.attributeQuery.getValueAndXToOneRecordFields(), prefix)}
FROM
${this.buildFromClause(recordQuery.recordName, prefix)}
${this.buildJoinClause(joinTables, prefix)}
${fieldMatchExp ? `
WHERE
${this.buildWhereClause( 
    this.parseMatchExpressionValue(recordQuery.recordName, fieldMatchExp , recordQuery.contextRootEntity),
    prefix
)}
` : ''}   
`
        // FIXME 添加 modifier
    }
    structureRawReturns(rawReturns: {[k:string]: any}[]) {
        return rawReturns.map(rawReturn => {
            const obj = {}
            Object.entries(rawReturn).forEach(([key, value]) => {
                // CAUTION 注意这里去掉了最开始的 entityName
                setByPath(obj, key.split('.').slice(1, Infinity), value)
            })
            return obj
        })
    }
    // 查 entity 和 查 relation 都是一样的。具体在 entityQuery 里面区别。
    // TODO 为了性能，也可以把信息丢到客户端，然客户端去结构化？？？

    // CAUTION findRelatedRecords 中的递归调用会使得 includeRelationData 变为 true
    async findRecords(entityQuery: RecordQuery, queryName = ''): Promise<Record[]>{
        // findRecords 的一个 join 语句里面只能一次性搞定 x:1 的关联实体，以及关系上的 x:1 关联实体。
        // 1. 这里只通过合表或者 join  处理了 x:1 的关联查询。x:n 的查询是通过二次查询获取的。
        const records = this.structureRawReturns(await this.database.query(this.buildXToOneFindQuery(entityQuery, ''), queryName)) as any[]

        // 2. x:1 上的 关系的x:many关联实体 查询
        // FIXME 没有限制 link.id
        for (let subEntityQuery of entityQuery.attributeQuery.xToOneRecords) {
            // x:1 上的关系
            const subLinkRecordQuery = subEntityQuery.attributeQuery.parentLinkRecordQuery
            if (subLinkRecordQuery) {
                // 关系上的 xToMany 查询
                for(let subEntityQueryOfSubLink of subLinkRecordQuery.attributeQuery.xToManyRecords) {
                    for (let entity of records) {
                        setByPath(
                            entity,
                            [subEntityQuery.attributeName!, LINK_SYMBOL, subEntityQueryOfSubLink.attributeName!],
                            await this.findRecords(subEntityQueryOfSubLink, `finding relation data: ${entityQuery.recordName}.${subEntityQuery.attributeName}.&.${subEntityQueryOfSubLink.attributeName}`)
                        )
                    }
                }
            }
        }


        // 3. x:n 关联实体的查询
        for (let subEntityQuery of entityQuery.attributeQuery.xToManyRecords) {
            // XToMany 的 relationData 是在上面 buildFindQuery 一起查完了的
            if (!subEntityQuery.onlyRelationData) {
                for (let entity of records) {
                    entity[subEntityQuery.attributeName!] = await this.findXToManyRelatedRecords(entityQuery.recordName, subEntityQuery.attributeName!, entity.id, subEntityQuery)
                }
            }
        }
        return records
    }
    // CAUTION 任何两个具体的实体之间只能有一条关系，但是可以在关系上有多条数据。1:n 的数据

    async findXToManyRelatedRecords(recordName: string, attributeName: string, recordId: string, relatedRecordQuery: RecordQuery) {
        const info = this.map.getInfo(recordName, attributeName)
        const reverseAttributeName = info.getReverseInfo()?.attributeName!

        // FIXME 对 n:N 关联实体的查询中，也可能会引用主实体的值，这个时候值已经是确定的了，应该作为 context 传进来，替换掉原本的 matchExpression
        const newMatch = relatedRecordQuery.matchExpression.and({
            key: `${reverseAttributeName}.id`,
            // 这里不能用 EXIST，因为 EXIST 会把 join 变成子查询，而我们还需要关系上的数据，不能用子查询
            value: ['=', recordId]
        })

        // FIXME 改成 create 或者 derive ?
        const newSubQuery = new RecordQuery(
            relatedRecordQuery.recordName,
            relatedRecordQuery.map,
            newMatch,
            relatedRecordQuery.attributeQuery.parentLinkRecordQuery ?
                relatedRecordQuery.attributeQuery.withParentLinkData():
                relatedRecordQuery.attributeQuery,
            relatedRecordQuery.modifier,
            relatedRecordQuery.contextRootEntity
        )


        // CAUTION 注意这里的第二个参数。因为任何两个具体的实体之间只能有一条关系。所以即使是 n:n 和关系表关联上时，也只有一条关系数据，所以这里可以带上 relation data。
        // 1. 查询 x:n 的实体，以及和父亲的关联关系上的 x:1 的数据
        const data = (await this.findRecords(newSubQuery, `finding related record: ${relatedRecordQuery.parentRecord}.${relatedRecordQuery.attributeName}`))
        // 1.1 这里再反向处理一下关系数据。因为在上一步 withParentLinkData 查出来的时候是用的是反向的关系名字
        const records =  relatedRecordQuery.attributeQuery.parentLinkRecordQuery ? data.map(item => {
            let itemWithParentLinkData: Record
            if (!info.isLinkManyToManySymmetric()) {
                itemWithParentLinkData = {
                    ...item,
                    [LINK_SYMBOL]: item[reverseAttributeName][LINK_SYMBOL]
                }
                delete itemWithParentLinkData[reverseAttributeName]
            } else {
                // TODO 是不是有更优雅的判断？？？
                // CAUTION 对称 n:n 关系，和父亲也只有一个方向是有的。
                itemWithParentLinkData = {
                    ...item,
                    [LINK_SYMBOL]: item[`${reverseAttributeName}:source`]?.[LINK_SYMBOL]?.id ?
                        item[`${reverseAttributeName}:source`]?.[LINK_SYMBOL] :
                        item[`${reverseAttributeName}:target`]?.[LINK_SYMBOL]
                }
                delete itemWithParentLinkData[`${reverseAttributeName}:source`]
                delete itemWithParentLinkData[`${reverseAttributeName}:target`]
            }

            return itemWithParentLinkData
        }) : data


        // 1.2 和父亲的关联关系上的 x:n 的数据
        const parentLinkRecordQuery = relatedRecordQuery.attributeQuery.parentLinkRecordQuery
        if (parentLinkRecordQuery) {
            // 关系上的 xToMany 查询
            for(let subEntityQueryOfLink of parentLinkRecordQuery.attributeQuery.xToManyRecords) {
                for (let record of records) {
                    // 应该已经有了和父亲 link 的 id。
                    // CAUTION 注意这里用了上面处理过路径
                    const linkId = record[LINK_SYMBOL].id
                    // 查找这个 link 的 x:n 关联实体
                    setByPath(
                        record,
                        [LINK_SYMBOL, subEntityQueryOfLink.attributeName!],
                        await this.findXToManyRelatedRecords(subEntityQueryOfLink.parentRecord!, subEntityQueryOfLink.attributeName!, linkId, subEntityQueryOfLink)
                    )
                }
            }
        }

        return records
    }
    // 根据 queryTree 来获得 join table 的信息。因为 queryTree 是树形，所以这里也是个递归结构。
    getJoinTables(queryTree: RecordQueryTree, context: string[] = [], parentInfos?: [string, string, string]) :JoinTables {
        // 应该是深度 遍历？
        const result: JoinTables = []
        if (!parentInfos) {
            //  context 里面至少会有 entityName 这一个值。
            const parentNamePath = [context[0]]
            const [parentAlias, parentIdField, parentTable] = this.map.getTableAliasAndFieldName(parentNamePath, 'id')
            parentInfos = [parentIdField, parentTable, parentAlias]
        }

        const [parentIdField, ...parentTableAndAlias] = parentInfos




        queryTree.forEachRecords((subQueryTree) => {

            const entityAttributeName = subQueryTree.attributeName!

            const attributeInfo = subQueryTree.info!
            assert(attributeInfo.isRecord, `${context.concat(entityAttributeName).join('.')} is not a record`)

            const currentNamePath = context.concat(entityAttributeName)
            const {table:currentTable, alias:currentTableAlias, linkTable:relationTable, linkAlias: relationTableAlias} = this.map.getTableAndAliasStack(currentNamePath).at(-1)!
            // CAUTION 特别注意最后一个参数，这是真的要连接实体表的时候就能拿用 shrink 的 id 了。
            const [, idField] = this.map.getTableAliasAndFieldName(currentNamePath, 'id', true)
            // 这里的目的是把 attribute 对应的 record table 找到，并且正确 join 进来。
            // join 本质上是把当前的路径和上一级路径连起来。
            // 这里只处理没有和上一个节点 三表合一 的情况。三表合一的情况不需要 join。复用 alias 就行
            if (!attributeInfo.isMergedWithParent()) {
                if (attributeInfo.isLinkMergedWithParent()) {
                    // CAUTION 如果只要获取 id, 不需要 join, map.getTableAliasAndFieldName 会自动解析到合并后的 field 上。
                    if (subQueryTree.onlyIdField()) return

                    result.push({
                        for: currentNamePath,
                        joinSource: parentTableAndAlias!,
                        joinIdField: [attributeInfo.linkField!, idField],
                        joinTarget: [currentTable, currentTableAlias]
                    })
                } else if (attributeInfo.isLinkMergedWithAttribute()){
                    const reverseAttributeInfo = attributeInfo.getReverseInfo()!
                    // 说明记录在对方的 field 里面
                    assert(!!reverseAttributeInfo.linkField!, `${reverseAttributeInfo.parentEntityName}.${reverseAttributeInfo.attributeName} has no field`)
                    result.push({
                        for: currentNamePath,
                        joinSource: parentTableAndAlias!,
                        // 这里要找当前实体中用什么 attributeName 指向上一个实体
                        joinIdField: [parentIdField, reverseAttributeInfo.linkField!],
                        joinTarget: [currentTable, currentTableAlias]
                    })
                } else {
                    // 说明记录在了 relation record 的 source/target 中
                    const linkInfo = attributeInfo.getLinkInfo()
                    const isCurrentRelationSource =
                        attributeInfo.isLinkManyToManySymmetric() ?
                            (attributeInfo.symmetricDirection === 'source') :
                            linkInfo.isRelationSource(attributeInfo.parentEntityName, attributeInfo.attributeName)
                    // 关系表独立
                    result.push({
                        for: currentNamePath,
                        joinSource: parentTableAndAlias!,
                        // CAUTION sourceField 是用在合并了情况里面的，指的是 target 在 source 里面的名字！所以这里不能用
                        joinIdField: [parentIdField, isCurrentRelationSource ? linkInfo.record.attributes.source.field! : linkInfo.record.attributes.target.field!],
                        joinTarget: [relationTable!, relationTableAlias!]
                    })

                    // CAUTION 只有当还要继续获取除 id 的部分时，才要 join 实体表。
                    if(!subQueryTree.onlyIdField()) {
                        result.push({
                            for: currentNamePath,
                            joinSource: [relationTable!, relationTableAlias!],
                            joinIdField: [isCurrentRelationSource ? linkInfo.record.attributes.target.field! : linkInfo.record.attributes.source.field!, idField],
                            joinTarget: [currentTable, currentTableAlias]
                        })
                    }
                }
            }


            result.push(...this.getJoinTables(subQueryTree, currentNamePath, [idField!, currentTable!, currentTableAlias! ]))

            if (subQueryTree.parentLinkQueryTree) {

            }

            // 处理 link 上的 query。如果只要 id, 那么在上面实体链接的时候就已经有了
            if(subQueryTree.parentLinkQueryTree && !subQueryTree.parentLinkQueryTree.onlyIdField()) {
                // 连接 link 和它的子节点
                const linkNamePath = currentNamePath.concat(LINK_SYMBOL)
                const [, linkIdField] = this.map.getTableAliasAndFieldName(linkNamePath, 'id', true)
                const linkParentInfo: [string, string, string] = [
                    linkIdField!,// link 的 idField
                    relationTable!, // link 的 tableName
                    relationTableAlias!, // link 的 tableAlias
                ]

                result.push(...this.getJoinTables(subQueryTree.parentLinkQueryTree, linkNamePath, linkParentInfo))

                // subQueryTree.parentLinkQueryTree.forEachRecords(linkSubQueryTree => {
                //     console.log(7777777, linkSubQueryTree.recordName, linkSubQueryTree.getData(),  linkNamePath, linkParentInfo)
                // })
            }
        })



        return result
    }
    withPrefix(prefix ='') {
        return prefix? `${prefix}___` : ''
    }
    buildSelectClause(queryFields: ReturnType<AttributeQuery["getValueAndXToOneRecordFields"]>, prefix=''){
        if (!queryFields.length) return '1'
        // CAUTION 所有 entity 都要 select id
        return queryFields.map(({tableAliasAndField, attribute, nameContext}) => (
            `${this.withPrefix(prefix)}${tableAliasAndField[0]}.${tableAliasAndField[1]} AS \`${this.withPrefix(prefix)}${nameContext.join(".")}.${attribute}\``
        )).join(',\n')
    }
    buildFromClause(entityName: string, prefix='') {
        return `${this.map.getRecordTable(entityName)} AS \`${this.withPrefix(prefix)}${entityName}\``
    }
    buildJoinClause(joinTables: JoinTables, prefix='') {
        return joinTables.map(({ joinSource, joinIdField, joinTarget}) => {
            return `LEFT JOIN ${joinTarget[0]} AS 
\`${this.withPrefix(prefix)}${joinTarget[1]}\` ON 
\`${this.withPrefix(prefix)}${joinSource[1]}\`.${joinIdField[0]} = \`${this.withPrefix(prefix)}${joinTarget[1]}\`.${joinIdField[1]}
`
        }).join('\n')
    }
    buildWhereClause(fieldMatchExp: BoolExp<FieldMatchAtom>|null, prefix=''): string {
        if (!fieldMatchExp) return '1=1'

        if (fieldMatchExp.isAtom()) {
            return fieldMatchExp.data.isInnerQuery ? fieldMatchExp.data.fieldValue! : `${this.withPrefix(prefix)}${fieldMatchExp.data.fieldName![0]}.${fieldMatchExp.data.fieldName![1]} ${fieldMatchExp.data.fieldValue}`
        } else {
            if (fieldMatchExp.isAnd()) {
                return `(${this.buildWhereClause(fieldMatchExp.left, prefix)} AND ${this.buildWhereClause(fieldMatchExp.right, prefix)})`
            } else  if (fieldMatchExp.isOr()) {
                return `(${this.buildWhereClause(fieldMatchExp.left, prefix)} OR ${this.buildWhereClause(fieldMatchExp.right, prefix)})`
            } else {
                return `NOT (${this.buildWhereClause(fieldMatchExp.left, prefix)})`
            }
        }
    }

    // 把 match 中的 exist 创建成子 sql
    parseMatchExpressionValue(entityName: string, fieldMatchExp: BoolExp<FieldMatchAtom>|null, contextRootEntity? :string): BoolExp<FieldMatchAtom>|null {
        if (!fieldMatchExp) return null

        return fieldMatchExp.map((exp: BoolExp<FieldMatchAtom>, context:string[]) => {
            assert(Array.isArray(exp.data.value), `match value is not a array ${context.join('.')}`)

            if (!exp.data.isFunctionMatch) return { ...exp.data}

            assert(exp.data.value[0].toLowerCase() === 'exist', `we only support Exist function match on entity for now. yours: ${exp.data.key} ${exp.data.value[0]} ${exp.data.value[1]}`)

            const info = this.map.getInfoByPath(exp.data.namePath!)!
            const {alias: currentAlias} = this.map.getTableAndAliasStack(exp.data.namePath!).at(-1)!
            const reverseAttributeName = this.map.getReverseAttribute(info.parentEntityName, info.attributeName)

            // 注意这里去掉了 namePath 里面根部的 entityName，因为后面计算 referenceValue 的时候会加上。
            const parentAttributeNamePath = exp.data.namePath!.slice(1, -1)

            const existEntityQuery = RecordQuery.create(info.recordName, this.map, {
                    matchExpression: BoolExp.atom({
                        key: `${reverseAttributeName}.id`,
                        value: ['=', parentAttributeNamePath.concat('id').join('.')],
                        isReferenceValue: true
                    } as MatchAtom).and(exp.data.value[1] instanceof BoolExp ? exp.data.value[1] : MatchExp.atom(exp.data.value[1]))
                },
                // 如果上层还有，就继承上层的，如果没有， context 就只这一层。这个变量是用来给 matchExpression 里面的 value 来引用上层的值的。
                //  例如查询用户，要求他存在一个朋友的父母的年龄是小于这个用户。对朋友的父母的年龄匹配中，就需要引用最上层的 alias。
                contextRootEntity||entityName
            )

            return {
                ...exp.data,
                isInnerQuery: true,
                fieldValue: `
EXISTS (
${this.buildXToOneFindQuery(existEntityQuery, currentAlias)}
)
`
            }
        })
    }


    async createRecordDependency(newRecordData: NewRecordData, events?: MutationEvent[]) : Promise<NewRecordData>{
        const newRecordDataWithDeps: {[k:string]: EntityIdRef} = {}
        // 处理往自身合并的需要新建的关系和 record
        for( let mergedLinkTargetRecord of newRecordData.mergedLinkTargetNewRecords.concat(newRecordData.mergedLinkTargetRecordIdRefs)) {
            let newDepIdRef
            if (!mergedLinkTargetRecord.isRef()) {
                newDepIdRef = await this.createRecord(mergedLinkTargetRecord, events)
            } else {
                newDepIdRef = mergedLinkTargetRecord.getRef()
            }
            newRecordDataWithDeps[mergedLinkTargetRecord.info!.attributeName] = newDepIdRef

            if (mergedLinkTargetRecord.linkRecordData) {
                // 为 link 也要把 dependency 准备好。
                const newLinkRecordData = mergedLinkTargetRecord.linkRecordData.merge({
                    [mergedLinkTargetRecord.info!.isRecordSource() ? 'target': 'source'] : newDepIdRef
                })
                // 所有 Link dep 也准备好了
                const newLinkRecordDataWithDep = await this.createRecordDependency(newLinkRecordData)

                newRecordDataWithDeps[mergedLinkTargetRecord.info!.attributeName]['&'] = newLinkRecordDataWithDep.getData()
            }
        }

        // 处理和我三表合一的 link record 的 dependency
        for( let combinedRecord of newRecordData.combinedNewRecords.concat(newRecordData.combinedRecordIdRefs)) {
            if (combinedRecord.linkRecordData) {
                const newLinkRecordDataWithDep = await this.createRecordDependency(combinedRecord.linkRecordData, events)
                newRecordDataWithDeps[combinedRecord.info!.attributeName!] = {
                    // 注意这里原本的数据不能丢，因为下面的 merge 不是深度 merge。
                    ...combinedRecord.getData() as EntityIdRef,
                    [LINK_SYMBOL]: newLinkRecordDataWithDep.getData()
                }
            }
        }

        // 返回追备好 link 数据和准备好 record 数据的新 newRecordData
        return newRecordData.merge(newRecordDataWithDeps)
    }

    async createRecord(newEntityData: NewRecordData, events?: MutationEvent[]) : Promise<EntityIdRef>{
        const newEntityDataWithDep = await this.createRecordDependency(newEntityData, events)
        const newRecordIdRef = await this.insertSameRowData(newEntityDataWithDep, events)

        const relianceResult = await this.handleCreationReliance(newEntityDataWithDep.merge(newRecordIdRef), events)

        // 更新 relianceResult 的信息到
        return Object.assign(newRecordIdRef, relianceResult)
    }
    // CAUTION 因为这里分配了 id，并且所有的判断逻辑都在，所以事件也放在这里处理，而不是真实插入或者更新数据的时候。
    async preprocessSameRowData(newEntityData: NewRecordData, isUpdate = false,  events?:  MutationEvent[], oldRecord?: Record): Promise<NewRecordData> {
        const newRawDataWithNewIds = newEntityData.getData()
        // 1. 先为三表合一的新数据分配 id
        for(let record of newEntityData.combinedNewRecords) {
            newRawDataWithNewIds[record.info!.attributeName] = {
                ...newRawDataWithNewIds[record.info!.attributeName],
                id: await this.database.getAutoId(record.info!.recordName!),
            }
            events?.push({
                type:'create',
                recordName:record.recordName,
                record: newRawDataWithNewIds[record.info!.attributeName]
            })
        }

        // 2. 为我要新建 三表合一、或者我 mergedLink 的 的 关系 record 分配 id.
        for(let record of newEntityData.mergedLinkTargetNewRecords.concat(newEntityData.mergedLinkTargetRecordIdRefs, newEntityData.combinedNewRecords)) {
            newRawDataWithNewIds[record.info!.attributeName]['&'] = {
                ...(newRawDataWithNewIds[record.info!.attributeName]['&']||{}),
                id: await this.database.getAutoId(record.info!.linkName!),
            }
            events?.push({
                type:'create',
                recordName:record.info!.linkName,
                record: newRawDataWithNewIds[record.info!.attributeName]['&']
            })
        }

        if (!isUpdate) {
            newRawDataWithNewIds.id = await this.database.getAutoId(newEntityData.recordName)
            events?.push({
                type:'create',
                recordName:newEntityData.recordName,
                record: newRawDataWithNewIds
            })
        } else {
            events?.push({
                type:'update',
                recordName: newEntityData.recordName,
                record: newEntityData.getData()!,
                oldRecord: oldRecord
            })
        }

        const newEntityDataWithIds = newEntityData.merge(newRawDataWithNewIds)

        // 2. 处理需要 flashOut 的数据
        const flashOutRecordRasData:{[k:string]: RawEntityData} = {}
        // CAUTION 这里是从 newEntityData 里读，不是从 newEntityDataWithIds，那里面是刚分配id 的，还没数据。
        for(let combinedRecordIdRef of newEntityData.combinedRecordIdRefs) {
            const combinedRecordInfo = combinedRecordIdRef.info?.getRecordInfo()!
            const reverseAttributeName = combinedRecordIdRef.info?.getReverseInfo()?.attributeName!
            const allRelatedRecords = combinedRecordInfo?.combinedRecords.map(info => info.attributeName!).filter(name => {
                // CAUTION 去掉反向的数据。不然死循环了。
                return name !== reverseAttributeName
            })

            const newMatch =  MatchExp.atom({
                key: 'id',
                value: ['=', combinedRecordIdRef.getRef().id]
            })
            // 这里都是 1:1 关系的。所以 flashOut 对于已经有数据等同于抢夺过来。
            const flashOutCombined = (await this.flashOutRecords(combinedRecordInfo?.name!, newMatch, allRelatedRecords, reverseAttributeName))[0]
            // 如果是抢夺，要记录一下事件。
            if(flashOutCombined[reverseAttributeName]) {
                // 可能查出来个空对象
                if(flashOutCombined[reverseAttributeName]?.[LINK_SYMBOL]?.id){
                    events?.push({
                        type: 'delete',
                        recordName: this.map.getInfo(combinedRecordInfo?.name!, reverseAttributeName).linkName,
                        record: flashOutCombined[reverseAttributeName]?.[LINK_SYMBOL],
                    })
                }

                delete flashOutCombined[reverseAttributeName]
            }
            flashOutRecordRasData[combinedRecordIdRef.info?.attributeName!] = flashOutCombined

            // 相当于新建了关系
            events?.push({
                type:'create',
                recordName:combinedRecordIdRef.info!.linkName,
                record: combinedRecordIdRef.getData()[LINK_SYMBOL]
            })
        }

        return newEntityDataWithIds.merge(flashOutRecordRasData)
    }

    async insertSameRowData(newEntityData: NewRecordData, events?: MutationEvent[]): Promise<EntityIdRef>{
        // 由于我们可以抢夺别人的关联实体，所以会产生一个 unlink 事件，所以 events 要穿进去。
        const newEntityDataWithIdsWithFlashOutRecords = await this.preprocessSameRowData(newEntityData, false, events)
        // 3. 插入新行。
        const sameRowNewFieldAndValue = newEntityDataWithIdsWithFlashOutRecords.getSameRowFieldAndValue()
        const result = await this.database.insert(`
INSERT INTO ${this.map.getRecordTable(newEntityData.recordName)}
(${sameRowNewFieldAndValue.map(f => f.field).join(',')})
VALUES
(${sameRowNewFieldAndValue.map(f => JSON.stringify(f.value)).join(',')}) 
`) as EntityIdRef

        return Object.assign(result,newEntityDataWithIdsWithFlashOutRecords.getData())
    }


    async handleCreationReliance(newEntityData: NewRecordData, events?: MutationEvent[]): Promise<object> {
        const currentIdRef = newEntityData.getRef()
        const newIdRefs: {[k:string]: EntityIdRef|EntityIdRef[]} = {}
        // 1. 处理关系往 attribute 方向合并的新数据
        for( let record of newEntityData.differentTableMergedLinkNewRecords) {
            const reverseAttribute = record.info?.getReverseInfo()?.attributeName!
            const newRecordDataWithMyId = record.merge({
                [reverseAttribute] : currentIdRef
            })
            const newRecordIdRef = await this.createRecord(newRecordDataWithMyId, events)
            if (record.info!.isXToMany) {
                if (!newIdRefs[record.info!.attributeName]) {
                    newIdRefs[record.info!.attributeName!] = []
                }
                newIdRefs[record.info!.attributeName].push(newRecordIdRef)
            } else {
                newIdRefs[record.info!.attributeName] = newRecordIdRef
            }
        }

        // 2. 处理关系往 attribute 方向合并的老数据
        for( let record of newEntityData.differentTableMergedLinkRecordIdRefs) {
            const reverseInfo = record.info!.getReverseInfo()!
            const idMatch = MatchExp.atom({
                key: 'id',
                value: ['=', record.getRef().id]
            })
            const newData = {
                [reverseInfo!.attributeName]: currentIdRef,
                [LINK_SYMBOL]: record.getData()[LINK_SYMBOL]
            }
            await this.updateRecord(reverseInfo.parentEntityName, idMatch, new NewRecordData(this.map, reverseInfo.parentEntityName, newData), events)
        }

        // 3. 处理完全独立的新数据和关系
        for( let record of newEntityData.isolatedNewRecords) {
            const newRecordIdRef = await this.createRecord(record, events)


            const linkRawData: RawEntityData = record.linkRecordData?.getData() || {}
            Object.assign(linkRawData, {
                source: record.info!.isRecordSource() ? currentIdRef : newRecordIdRef,
                target: record.info!.isRecordSource() ? newRecordIdRef : currentIdRef
            })
            const newLinkData = new NewRecordData(this.map, record.info!.linkName, linkRawData)
            const newLinkRecord = await this.createRecord(newLinkData, events)

            if (record.info!.isXToMany) {
                if (!newIdRefs[record.info!.attributeName]) {
                    newIdRefs[record.info!.attributeName!] = []
                }
                newIdRefs[record.info!.attributeName].push({
                    ...newRecordIdRef,
                    [LINK_SYMBOL]: newLinkRecord
                })
            } else {
                newIdRefs[record.info!.attributeName] = {
                    ...newRecordIdRef,
                    [LINK_SYMBOL]: newLinkRecord
                }
            }
        }

        // 4. 处理完全独立的老数据和的关系。
        for (let key in newEntityData.isolatedRecordIdRefs) {
            const record = newEntityData.isolatedRecordIdRefs[key]
            // 针对 x:1 关系要先删除原来的关系
            if(record.info!.isXToOne) {
                const match = MatchExp.atom({
                    key: record.info?.isRecordSource() ? 'target.id' : 'source.id',
                    value: ['=', record.getRef().id]
                })
                await this.unlink(record.info!.linkName, match, false,'unlink xToOne old link',  events)
            }
            const linkRawData: RawEntityData = record.linkRecordData?.getData() || {}
            Object.assign(linkRawData, {
                source: record.info!.isRecordSource() ? currentIdRef : record.getRef(),
                target: record.info!.isRecordSource() ? record.getRef() : currentIdRef
            })
            const newLinkData = new NewRecordData(this.map, record.info!.linkName, linkRawData)
            const newLinkRecord = await this.createRecord(newLinkData, events)

            if (record.info!.isXToMany) {
                if (!newIdRefs[record.info!.attributeName]) {
                    newIdRefs[record.info!.attributeName!] = []
                }
                (newIdRefs[record.info!.attributeName] as Record[])![key] = {
                    ...record.getData(),
                    [LINK_SYMBOL]: newLinkRecord
                }
            } else {
                newIdRefs[record.info!.attributeName] = {
                    ...record.getData(),
                    [LINK_SYMBOL]: newLinkRecord
                }
            }
        }

        return newIdRefs
    }


    // CAUTION 除了 1:1 并且合表的关系，不能递归更新 relatedEntity，如果是传入了，说明是建立新的关系。
    async updateRecordDataById(entityName: string, idRef: EntityIdRef, columnAndValue: {field:string, value:string}[]): Promise<EntityIdRef>  {
        // TODO 要更新拆表出去的 field

        const idField= this.map.getInfo(entityName, 'id').field

        // CAUTION update 语句可以有 别名和 join，但似乎 SET 里面不能用主表的 别名!!!
        if (columnAndValue.length) {
            await this.database.update(`
UPDATE ${this.map.getRecordTable(entityName)}
SET
${columnAndValue.map(({field, value}) => `
${field} = ${value}
`).join(',')}
WHERE ${idField} = (${JSON.stringify(idRef.id)})
`, idField)
        }
        // 注意这里，使用要返回匹配的类，虽然可能没有更新数据。这样才能保证外部的逻辑比较一致。
        return idRef
    }
    async updateSameRowData(entityName: string, matchedEntity: Record,  newEntityDataWithDep:NewRecordData, events?: MutationEvent[]) {
        // 跟自己合表实体的必须先断开关联，也就是移走。不然下面 updateRecordData 的时候就会把数据删除。
        // const sameRoleEntityRefOrNewData = newEntityData.combinedRecordIdRefs.concat(newEntityData.combinedNewRecords)
        const sameRowEntityRefOrNewData = newEntityDataWithDep.combinedRecordIdRefs.concat(newEntityDataWithDep.combinedNewRecords)
        // 1. 删除旧的关系
        for(let newRelatedEntityData of sameRowEntityRefOrNewData) {
            const linkInfo = newRelatedEntityData.info!.getLinkInfo()
            const updatedEntityLinkAttr = linkInfo.isRelationSource(entityName, newRelatedEntityData.info!.attributeName) ? 'source' : 'target'
            await this.unlink(
                linkInfo.name,
                MatchExp.atom({
                    key: `${updatedEntityLinkAttr}.id`,
                    value: ['=', matchedEntity.id],
                }),
                !linkInfo.isRelationSource(entityName, newRelatedEntityData.info!.attributeName),
                `unlink ${newRelatedEntityData.info?.parentEntityName} ${newRelatedEntityData.info?.attributeName} for update ${entityName}`,
                events
            )
        }

        // 2. 分配 id,处理需要 flash out 的数据等，事件也是这里面记录的。这里面会有抢夺关系，所以也可能会有删除事件。
        const newEntityDataWithIdsWithFlashOutRecords = await this.preprocessSameRowData(newEntityDataWithDep, true, events, matchedEntity)
        const allSameRowData = newEntityDataWithIdsWithFlashOutRecords.getSameRowFieldAndValue()
        const columnAndValue = allSameRowData.map(({field, value}: {field:string, value:string}) => (
            {
                field,
                /// TODO value 要考虑引用自身或者 related entity 其他 field 的情况？例如 age+5
                value: JSON.stringify(value)
            }
        ))

        // 3. 真实处理数据，这里面没有记录事件，事件是上面处理的。、
        await this.updateRecordDataById(entityName, matchedEntity, columnAndValue)
        return newEntityDataWithIdsWithFlashOutRecords
    }
    async handleUpdateReliance(entityName:string, matchedEntity: EntityIdRef, newEntityData: NewRecordData, events?: MutationEvent[]) {
        // 这里面都是依赖我的，或者关系数据完全独立的。
        // CAUTION update 里面的表达关联实体的语义统统认为是 replace。如果用户想要表达 xToMany 的情况下新增关系，应该自己拆成两步进行。既先更新数据，再用 addLink 去增加关系。
        // 1. 断开自己和原来关联实体的关系。这里只要处理依赖我的，或者关系独立的，因为我依赖的在应该在 updateSameRowData 里面处理了。
        const otherTableEntitiesData = newEntityData.differentTableMergedLinkRecordIdRefs.concat(
            newEntityData.differentTableMergedLinkNewRecords,
            newEntityData.isolatedRecordIdRefs,
            newEntityData.isolatedNewRecords,
        )

        // CAUTION 由于 xToMany 的数组情况会平铺处理，所以这里可能出现两次，所以这里记录一下排重
        const removedLinkName = new Set()
        for(let relatedEntityData of otherTableEntitiesData) {
            const linkInfo = relatedEntityData.info!.getLinkInfo()
            if (removedLinkName.has(linkInfo.name)) {
                continue
            }

            removedLinkName.add(linkInfo.name)
            const updatedEntityLinkAttr = linkInfo.isRelationSource(entityName, relatedEntityData.info!.attributeName) ? 'source' : 'target'
            await this.unlink(
                linkInfo.name,
                MatchExp.atom({
                    key: `${updatedEntityLinkAttr}.id`,
                    value: ['=', matchedEntity.id],
                }),
                !linkInfo.isRelationSource(entityName, relatedEntityData.info!.attributeName),
                'unlink old reliance for update',
                events,
            )
        }

        const result: Record = {id: matchedEntity.id}
        // 2. 建立新关系
        // 处理和其他实体更新关系的情况。
        for(let newRelatedEntityData of otherTableEntitiesData) {
            // 这里只处理没有三表合并的场景。因为三表合并的数据在 sameTableFieldAndValues 已经有了
            // 这里只需要处理 1）关系表独立 或者 2）关系表往另一个方向合了的情况。因为往本方向和的情况已经在前面 updateEntityData 里面处理了
            let finalRelatedEntityRef

            if (newRelatedEntityData.isRef()) {
                finalRelatedEntityRef = newRelatedEntityData.getRef()
            } else {
                finalRelatedEntityRef = await this.createRecord(newRelatedEntityData, events)
            }

            const linkRecord = await this.addLinkFromRecord(entityName, newRelatedEntityData.info?.attributeName!, matchedEntity.id, finalRelatedEntityRef.id, undefined, events)
            if(newRelatedEntityData.info!.isXToMany) {
                if (!result[newRelatedEntityData.info!.attributeName!]){
                    result[newRelatedEntityData.info!.attributeName!] = []
                }
                result[newRelatedEntityData.info!.attributeName!].push({
                    ...finalRelatedEntityRef,
                    [LINK_SYMBOL]: linkRecord,
                })
            } else {
                result[newRelatedEntityData.info!.attributeName!] = {
                    ...finalRelatedEntityRef,
                    [LINK_SYMBOL]: linkRecord,
                }
            }

        }

        return result
    }
    // 只有 1:1 关系可以递归更新实体数据，其他都能改当前实体的数据或者和其他实体关系。
    // TODO 如果 newEntityData 中只更新自己的字段，那么可以直接 批量更新 加速一下。
    // TODO 支持在 update 字段的同时，使用 null 来删除关系
    async updateRecord(entityName: string, matchExpressionData: MatchExpressionData, newEntityData: NewRecordData, events?: MutationEvent[])  {
        // TODO 数据要做验证，比如 oneToX 的 ref 不能批量更新。
        // CAUTION  因为需要事件，所以找到的数据里面就要带上 newRecordData 里面的所有字段作为 oldValues。
        const matchedEntities = await this.findRecords(RecordQuery.create(entityName, this.map, {
            matchExpression: matchExpressionData,
            // FIXME 这里其实只要查 newEntityData 里面有的字段就可以了。
            attributeQuery: AttributeQuery.getAttributeQueryDataForRecord(entityName, this.map)
        }), `find record for updating ${entityName}`)

        const result: Record[] = []
        for(let matchedEntity of matchedEntities) {
            // 1. 创建我依赖的
            const newEntityDataWithDep = await this.createRecordDependency(newEntityData, events)
            // CAUTION 更新前先找到所有受影响的数据。为什么不直接更新？？？这样不是损失性能吗？？？
            // 2. 把同表的实体移出去，为新同表建立 id；可能有要删除的 reliance
            const newEntityDataWithIdsWithFlashOutRecords = await this.updateSameRowData(entityName, matchedEntity, newEntityDataWithDep, events)
            // 3. 更新依赖我的和关系表独立的
            const relianceUpdatedResult = await this.handleUpdateReliance(entityName, matchedEntity, newEntityData, events)

            result.push({...newEntityData.getData(), ...newEntityDataWithIdsWithFlashOutRecords.getData(), ...relianceUpdatedResult})
        }

        return result
    }

    async deleteRecord(recordName:string, matchExp: MatchExpressionData, events?: MutationEvent[], inSameRowDataOp = false) {
        const deleteQuery = RecordQuery.create(recordName, this.map, {
            matchExpression: matchExp,
            attributeQuery: AttributeQuery.getAttributeQueryDataForRecord(
                recordName,
                this.map,
                true
            )
        })
        const records = await this.findRecords(deleteQuery)

        if (records.length) {
            // 删除独立表或者关系在另一边的关系数据
            await this.deleteNotReliantSeparateLinkRecords(recordName, records, events)
            // 删除依赖我的实体
            await this.deleteDifferentTableReliance(recordName, records, events)
            // 删除自身以及有生命周期依赖的合表 record
            await this.deleteRecordSameRowData(recordName, records, events, inSameRowDataOp)
        }

        return records
    }

    // 这里会把通表的 reliance，以及 reliance 的 reliance 都删除掉。
    // this method will delete all the reliance of the record, and the reliance of the reliance.
    async deleteRecordSameRowData(recordName: string, records: EntityIdRef[], events?: MutationEvent[], inSameRowDataOp = false) {
        const recordInfo = this.map.getRecordInfo(recordName)

        for(let record of records) {
            if (!inSameRowDataOp) {
                // FIXME 其实可以利用数据库 select * 来加速，怎么看这个问题？？
                const hasSameRowData = recordInfo.notReliantCombined.length && await someAsync(recordInfo.notReliantCombined, async (info) => {
                    const existQuery = RecordQuery.create(
                        recordName,
                        this.map,
                        {
                            matchExpression:MatchExp.atom({
                                key: `id`,
                                value: ['=', record.id]
                            }),
                            attributeQuery:[[info.attributeName, {attributeQuery: ['id']}]],
                            modifier: {limit: 1}
                        }
                    )
                    const result = await this.findRecords(existQuery)
                    return !!result[0]?.[info.attributeName]?.id
                })

                if (hasSameRowData) {
                    // 存在同行 record，只能用 update
                    const fields = recordInfo.sameRowFields
                    return this.database.delete(`
UPDATE ${recordInfo.table}
SET ${fields.map(field => `${field} = NULL`).join(',')}
WHERE ${recordInfo.idField} IN (${records.map(({id}) => JSON.stringify(id)).join(',')})
`, `use update to delete ${recordName} because of sameRowData`)

                } else {
                    // 不存在同行数据 record ，可以 delete row

                    await this.database.delete(`
DELETE FROM ${recordInfo.table}
WHERE ${recordInfo.idField} IN (${records.map(({id}) => JSON.stringify(id)).join(',')})
`, `delete record ${recordInfo.name} as row`)
                }
            }

            events?.push({
                type:'delete',
                recordName: recordName,
                record,
            })

            // 递归处理同表的 reliance tree
            recordInfo.sameTableReliance.forEach(relianceInfo => {
                // 只要真正存在这个数据才要删除
                if(record[relianceInfo.attributeName]!.id){
                    // 和 reliance 的 link record 的事件
                    events?.push({
                        type:'delete',
                        recordName: relianceInfo.linkName,
                        record: record[relianceInfo.attributeName][LINK_SYMBOL],
                    })

                    this.handleDeletedRecordReliance(relianceInfo.recordName, record[relianceInfo.attributeName]!, events)
                }
            })
        }
    }

    async handleDeletedRecordReliance(recordName: string, record: EntityIdRef, events?: MutationEvent[]) {

        // 删除独立表或者关系在另一边的关系数据
        await this.deleteNotReliantSeparateLinkRecords(recordName, [record], events)
        // 删除依赖我的实体
        await this.deleteDifferentTableReliance(recordName, [record], events)
        // 删除自身以及有生命周期依赖的合表 record
        await this.deleteRecordSameRowData(recordName, [record], events, true)
        return record
    }

    async deleteNotReliantSeparateLinkRecords(recordName: string, record: EntityIdRef[], events?: MutationEvent[]) {
        const recordInfo = this.map.getRecordInfo(recordName)
        for(let info of recordInfo.differentTableRecordAttributes) {
            if (!info.isReliance) {

                const key = info.isRecordSource() ? 'source.id' : 'target.id'
                const newMatch = MatchExp.atom({
                    key,
                    value: ['in', record.map(r => r.id)]
                })
                await this.deleteRecord(info.linkName, newMatch, events)
            }
        }
    }

    async deleteDifferentTableReliance(recordName: string, records: EntityIdRef[], events?: MutationEvent[]) {
        const recordInfo = this.map.getRecordInfo(recordName)
        for (let info of recordInfo.differentTableReliance) {
            const matchInIds = MatchExp.atom({
                key: `${info.getReverseInfo()?.attributeName!}.id`,
                value: ['in', records.map(r => r.id)]
            })
            await this.deleteRecord(info.recordName, matchInIds, events)
        }
    }


    addLinkFromRecord(entity: string, attribute:string, entityId:string, relatedEntityId: string, attributes: RawEntityData = {}, events?: MutationEvent[]) {
        const linkInfo = this.map.getLinkInfo(entity, attribute)
        const isEntitySource = linkInfo.isRelationSource(entity, attribute)

        const sourceId = isEntitySource? entityId : relatedEntityId
        const targetId = isEntitySource? relatedEntityId: entityId

        return this.addLink(linkInfo.name, sourceId, targetId, attributes, !linkInfo.isRelationSource(entity, attribute), events )
    }

    async addLink(linkName: string, sourceId: string, targetId:string, attributes: RawEntityData = {}, moveSource = false, events?: MutationEvent[]) {
        const existRecord = (await this.findRecords(RecordQuery.create(linkName, this.map, {
            matchExpression: MatchExp.atom({key: 'source.id', value: ['=', sourceId]}).and({key: 'target.id', value: ['=', targetId]}),
            modifier: {
                limit: 1
            }
        })))[0]

        assert(!existRecord, `cannot create ${linkName} for ${sourceId} ${targetId}, link already exist`)

        const linkInfo = this.map.getLinkInfoByName(linkName)
        if (!linkInfo.isCombined() && !linkInfo.isMerged() && (linkInfo.isManyToOne || linkInfo.isOneToMany)) {
            // n 方向要 unlink ?
            const unlinkAttr = linkInfo.isManyToOne ? 'source.id' : 'target.id'
            const unlinkId = linkInfo.isManyToOne? sourceId: targetId
            const match = MatchExp.atom({
                key: unlinkAttr,
                value: ['=', unlinkId]
            })
            await this.unlink(linkName, match, false, 'unlink combined record for add new link', events)
        }

        const newLinkData = new NewRecordData(this.map, linkInfo.name, {
            source: {id: sourceId},
            target: {id: targetId},
            ...attributes
        })

        return this.createRecord(newLinkData, events)
    }


    async unlink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, reason = '', events?:MutationEvent[]) {
        const linkInfo = this.map.getLinkInfoByName(linkName)
        assert(!linkInfo.isTargetReliance, `cannot unlink reliance data, you can only delete record, ${linkName}`)

        const toMoveRecordInfo = moveSource ? linkInfo.sourceRecordInfo : linkInfo.targetRecordInfo
        const toMove = moveSource  ? 'source': 'target'
        if (linkInfo.isCombined()) {
            // 根据 Keep 决定是  source 还是 target 换位置
            const records = await this.findRecords(RecordQuery.create(linkName, this.map, {
                matchExpression: matchExpressionData,
                attributeQuery: [
                    ['source', {attributeQuery: ['id']}],
                    ['target', {attributeQuery: ['id']}]
                ]
            }), reason)

            const toMoveIds = []
            for(let record of records) {
                if( record[toMove].id ) {
                    toMoveIds.push(record[toMove].id)
                }
            }


            // 除了当前 link 以外，所有和 toMove 相关的
            if (toMoveIds.length) {
                await this.moveRecords(
                    toMoveRecordInfo.name,
                    MatchExp.atom({
                        key: 'id',
                        value: ['in', toMoveIds]
                    }),
                    [linkName]
                )
            }

            return
        }

        return this.deleteRecord(linkName, matchExpressionData, events)

    }
    // 默认会把连带的都移走
    async moveRecords(recordName:string, matchExpressionData: MatchExpressionData, excludeLinks: string[] = []) {
        const recordInfo = this.map.getRecordInfo(recordName)
        const includeRelated = recordInfo.combinedRecords.filter(info => {
            return !excludeLinks.includes(info.linkName)
        }).map(info => info.attributeName)

        // 所有 1:1 连带数据都要取出。始终只带出同表数据！！！！
        const records = await this.flashOutRecords(recordName, matchExpressionData, includeRelated)

        const newIds = []
        for( let record of records) {
            newIds.push(await this.createRecord(new NewRecordData(this.map, recordName, record)))
        }
        return newIds
    }
    async flashOutRecords(recordName:string, matchExpressionData: MatchExpressionData, includeRelated: string[],fromAttribute?: string): Promise<Record[]> {
        const attributeQuery = this.constructAttributeQueryTree(recordName, includeRelated)
        const records = await this.findRecords(RecordQuery.create(recordName, this.map, {
            matchExpression: matchExpressionData,
            // 所有关联数据。fields
            // attributeQuery
            // FIXME 这里要获取所有关系上的同行数据。
            attributeQuery: fromAttribute?
                attributeQuery.concat([[fromAttribute!, {attributeQuery:[['&', {attributeQuery:['id']}]]}]]):
                attributeQuery

    }), `finding ${recordName} for flash out`)


        // 删除老的
        // FIXME 要包括所有 includeRelated 以及关系数据，但不包括 fromAttribute，那个是只要查询！！！
        if (records.length) {
            const ids = records.map(r => r.id)
            await this.deleteRecord(recordName, MatchExp.atom({
                key: 'id',
                value: ['in', ids]
            }))
        }

        return records
    }
    // FIXME 还有关联的 relation 的 attribute
    constructAttributeQueryTree(recordName:string, includeAttributes: string[] = []) {
        const recordInfo = this.map.getRecordInfo(recordName)
        const valueAttributes: AttributeQueryDataItem[] = recordInfo.valueAttributes.map(info => info.attributeName)
        const relatedCombinedInfos = includeAttributes.map(r => {
            return recordInfo.getAttributeInfo(r)
        })
        const relatedRecordsAttributeQuery: AttributeQueryDataItem[] = relatedCombinedInfos.map(info => {
            const linkName = info.getLinkInfo().name
            const subRecordInfo = info.getRecordInfo()
            // CAUTION 一定要排除当前的，不然死循环了
            const subRelatedAttributes = subRecordInfo.combinedRecords.filter(subInfo => {
                return subInfo.linkName !== linkName
            }).map(subInfo => subInfo.attributeName)

            return [info.attributeName, {
                attributeQuery: this.constructAttributeQueryTree(info.getRecordInfo().name, subRelatedAttributes)
            }] as AttributeQueryDataItem
        })

        return valueAttributes.concat(relatedRecordsAttributeQuery)
    }
}



