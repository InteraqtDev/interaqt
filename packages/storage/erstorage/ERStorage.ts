import {AttributeInfo, EntityToTableMap} from "./EntityToTableMap";
import {assert, deepMerge, mapTree, setByPath} from "../util";
// @ts-ignore
import {BoolExpression, ExpressionData} from '../../shared/BoolExpression'
// @ts-ignore
import { Database, EntityIdRef } from '../../runtime/System'


export type MatchAtom = {key: string, value: [string, any], isReferenceValue?: boolean}
export type MatchExpressionData = BoolExpression<MatchAtom>

export type FieldMatchAtom = MatchAtom & {
    isInnerQuery?: boolean,
    //  value 类型的
    fieldName?: [string, string],
    fieldValue?: string,
    // entity 类型的
    namePath?: string[],
    isFunctionMatch?: boolean,
    tableAlias?:string,

}

export class MatchExpression {
    public static createFromAtom(value: MatchAtom) {
        return BoolExpression.createFromAtom<MatchAtom>(value)
    }
    public entityQueryTree: EntityQueryTree = {}
    constructor(public entityName: string, public map: EntityToTableMap, public data?: MatchExpressionData, public contextRootEntity?: string, public fromRelation?: boolean) {

        this.entityQueryTree = {}
        if (this.data) {
            assert(this.data instanceof BoolExpression, `match data is not a BoolExpression instance, you passed: ${this.data}`)
            this.buildEntityQueryTree(this.data, this.entityQueryTree)
        }
    }
    buildEntityQueryTree(matchData: MatchExpressionData, entityQueryTree: EntityQueryTree) {
        if (matchData.isExpression()) {
            if (matchData.left) {
                this.buildEntityQueryTree(matchData.left, entityQueryTree)
            }

            if (matchData.right) {
                this.buildEntityQueryTree(matchData.right, entityQueryTree)
            }
        } else {
            // variable
            const matchAttributePath = (matchData.data.key as string).split('.')
            const attributeInfo = this.map.getInfoByPath([this.entityName].concat(matchAttributePath))

            // value 的情况不用管
            //  CAUTION 还有最后路径是 entity 但是  match 值是 EXIST 的不用管，因为会生成 exist 子句。只不过这里也不用特别处理，join 的表没用到会自动数据库忽略。
            if(!(matchAttributePath.length === 1 && attributeInfo.isValue)) {
                if (attributeInfo.isRecord) {
                    setByPath(entityQueryTree, matchAttributePath, {})
                } else {
                    // 最后一个是 attribute，所以不在 entityQueryTree 上。
                    setByPath(entityQueryTree, matchAttributePath.slice(0, matchAttributePath.length -1), {})
                }
            }
        }
    }


    getFinalFieldName(matchAttributePath: string[]) {
        const namePath = [this.entityName].concat(matchAttributePath.slice(0, -1))
        return this.map.getTableAliasAndFieldName(namePath, matchAttributePath.at(-1)!)
    }
    getReferenceFieldValue(valueStr:string) {
        const matchAttributePath = valueStr.split('.')
        const [tableAlias, rawFieldName] = this.map.getTableAliasAndFieldName(
            [this.contextRootEntity||this.entityName].concat(matchAttributePath.slice(0, -1)),
            matchAttributePath.at(-1)!
        )
        return `${tableAlias}.${rawFieldName}`
    }

    getFinalFieldValue(isReferenceValue: boolean, value: [string, any] ) {
        let fieldValue
        const simpleOp = ['=', '>', '<', '<=', '>=', 'like']

        if (simpleOp.includes(value[0])) {
            fieldValue = `${value[0]} ${isReferenceValue ? this.getReferenceFieldValue(value[1]) : JSON.stringify(value[1])}`
        } else if(value[0].toLowerCase() === 'in') {
            assert(!isReferenceValue, 'reference value cannot use IN to match')
            fieldValue = `IN [${value[1].map((x:any) => JSON.stringify(x)).join(',')}]`
        } else if(value[0].toLowerCase() === 'between') {
            fieldValue = `BETWEEN ${isReferenceValue ? this.getReferenceFieldValue(value[1][0]) : JSON.stringify(value[1][0])} AND ${isReferenceValue ? this.getReferenceFieldValue(value[1][1]) : JSON.stringify(value[1][1])}]`
        } else {
            assert(false, `unknown value expression ${JSON.stringify(value)}`)
        }

        return fieldValue
    }

    buildFieldMatchExpression() : BoolExpression<FieldMatchAtom>|null {
        if (!this.data) return null
        // 1. 所有 key 要 build 成 field
        // 2. x:n 关系中的 EXIST 要增加查询范围限制，要把 value 中对上层引用也 build 成 field。
        return this.data.map((exp: MatchExpressionData) => {
            const matchAttributePath = (exp.data.key as string).split('.')
            const attributeInfo = this.map.getInfoByPath([this.entityName].concat(matchAttributePath))

            // 如果结尾是 value
            // 如果极为是 entity，那么后面匹配条件目前只能支持 EXIST。
            //  CAUTION 针对关联实体的属性匹配，到这里已经被拍平了，所以结尾是  entity 的情况必定都是函数匹配。
            if (attributeInfo.isValue) {
                return {
                    ...exp.data,
                    fieldName: this.getFinalFieldName(matchAttributePath),
                    fieldValue: this.getFinalFieldValue(exp.data.isReferenceValue!, exp.data.value)
                }

            } else {
                // entity
                const namePath = [this.entityName].concat(matchAttributePath)
                const [,tableAlias] = this.map.getTableAndAlias(namePath)

                // CAUTION 函数匹配的情况不管了，因为可能未来涉及到使用 cursor 实现更强的功能，这就涉及到查询计划的修改了。统统扔到上层去做。
                //  注意，子查询中也可能对上层的引用，这个也放到上层好像能力有点重叠了。
                return {
                    ...exp.data,
                    namePath,
                    isFunctionMatch: true,
                    tableAlias
                }
            }
        })

    }

    and(condition: MatchAtom): MatchExpression {
        return new MatchExpression(this.entityName, this.map, this.data ? this.data.and(condition) : BoolExpression.createFromAtom<MatchAtom>(condition))
    }
}


type ModifierData = {
    orderBy?: {
        [k: string]: string
    },
    limit?: number,
    offset?: number
}



class Modifier {
    constructor(public entityName: string, public map: EntityToTableMap, public data: ModifierData, public fromRelation?: boolean) {
    }

    derive(overwrite: ModifierData) {
        return new Modifier(this.entityName, this.map, {...this.data, ...overwrite})
    }
}


export type EntityQueryData = {
    matchExpression?: MatchExpressionData,
    attributeQuery?: AttributeQueryData,
    modifier?: ModifierData
}

export type AttributeQueryDataItem = string|[string, EntityQueryData]

export type AttributeQueryData = AttributeQueryDataItem[]

export type EntityQueryDerivedData = {
    matchExpression? : MatchExpression,
    attributeQuery? :AttributeQuery,
    modifier? : Modifier
}

export class RecordQuery {
    static create(entityName: string, map: EntityToTableMap, data: EntityQueryData, contextRootEntity?: string) {
        return new RecordQuery(
            entityName,
            map,
            new MatchExpression(entityName, map, data.matchExpression, contextRootEntity),
            new AttributeQuery(entityName, map, data.attributeQuery || []),
            new Modifier(entityName, map, data.modifier!),
            contextRootEntity,
        )
    }
    constructor(public entityName: string, public map: EntityToTableMap, public matchExpression: MatchExpression, public attributeQuery: AttributeQuery, public modifier: Modifier, public contextRootEntity?:string) {}
    derive(derived: EntityQueryDerivedData) {
        return new RecordQuery(
            this.entityName,
            this.map,
            derived.matchExpression || this.matchExpression,
            derived.attributeQuery || this.attributeQuery,
            derived.modifier || this.modifier,
            this.contextRootEntity
        )
    }

}


type EntityQueryTree = {
    [k:string] : EntityQueryTree
}

export class AttributeQuery {
    public relatedEntities: {name: string, entityQuery: RecordQuery}[] = []
    public xToManyEntities: {name: string, entityQuery: RecordQuery}[] = []
    public xToOneEntities: {name: string, entityQuery: RecordQuery}[] = []
    public valueAttributes: string[] = []
    public entityQueryTree: EntityQueryTree = {}
    public fullEntityQueryTree: EntityQueryTree = {}
    constructor(public entityName: string, public map: EntityToTableMap, public data: AttributeQueryData = []) {
        data.forEach((item: AttributeQueryDataItem) => {
            const attributeName:string = typeof item=== 'string' ? item : item[0]

            const attributeInfo = this.map.getInfo(this.entityName, attributeName)
            if (attributeInfo.isRecord) {
                const relatedEntity = {
                    name: attributeName,
                    entityQuery: RecordQuery.create(attributeInfo.entityName, this.map, item[1] as EntityQueryData)
                }

                this.relatedEntities.push(relatedEntity)

                if (attributeInfo.isXToMany) {
                    this.xToManyEntities.push(relatedEntity)
                } else if (attributeInfo.isXToOne) {
                    this.xToOneEntities.push(relatedEntity)
                }


            } else {
                this.valueAttributes.push(attributeName)
            }
        })


        this.entityQueryTree = this.buildEntityQueryTree()
        this.fullEntityQueryTree = this.buildFullEntityQueryTree()
    }
    getQueryFields (nameContext = [this.entityName]): {tableAliasAndField: [string, string], nameContext: string[], attribute: string}[] {
        const queryFields = ['id'].concat(this.valueAttributes).map(attributeName => ({
            tableAliasAndField: this.map.getTableAliasAndFieldName(nameContext, attributeName).slice(0, 2) as [string, string],
            nameContext,
            attribute: attributeName
        }))


        this.xToOneEntities.forEach(({ name: entityAttributeName, entityQuery }) => {
            queryFields.push(...entityQuery.attributeQuery!.getQueryFields(nameContext.concat(entityAttributeName)))
        })

        return queryFields
    }
    buildEntityQueryTree() {
        const result: EntityQueryTree = {}
        // CAUTION 我们这里只管 xToOne 的情况，因为其他情况是用 id 去做二次查询得到的。
        this.xToOneEntities.forEach(({ name, entityQuery}) => {
            result[name] = entityQuery.attributeQuery!.entityQueryTree
        })
        return result
    }
    buildFullEntityQueryTree() {
        const result:EntityQueryTree = {}
        // CAUTION 我们这里只管 xToOne 的情况，因为其他情况是用 id 去做二次查询得到的。
        this.relatedEntities.forEach(({ name, entityQuery}) => {
            result[name] = entityQuery.attributeQuery!.entityQueryTree
        })
        return result
    }

}


class QueryContext {

}

type JoinTables = {
    for: any
    joinSource: [string, string]
    joinIdField: [string, string]
    joinTarget: [string, string]
}[]

export class QueryAgent {
    constructor(public map: EntityToTableMap, public database: Database) {}


    buildFindQuery(entityQuery: RecordQuery, prefix='') {
        // 从所有条件里面构建出 join clause
        const fieldQueryTree = entityQuery.attributeQuery!.entityQueryTree
        const matchQueryTree = entityQuery.matchExpression.entityQueryTree
        const finalQueryTree = deepMerge(fieldQueryTree, matchQueryTree)

        const joinTables = this.getJoinTables(finalQueryTree, [entityQuery.entityName])

        const fieldMatchExp = entityQuery.matchExpression.buildFieldMatchExpression()

        return `
SELECT ${prefix ? '' : 'DISTINCT'}
${this.buildSelectClause(entityQuery.attributeQuery.getQueryFields(), prefix)}
FROM
${this.buildFromClause(entityQuery.entityName, prefix)}
${this.buildJoinClause(joinTables, prefix)}
${fieldMatchExp ? `
WHERE
${this.buildWhereClause( 
    this.parseMatchExpressionValue(entityQuery.entityName, fieldMatchExp , entityQuery.contextRootEntity),
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
    async findRecords(entityQuery:RecordQuery) : Promise<any[]>{
        // 1. 这里只通过合表或者 join  处理了 x:1 的关联查询。x:n 的查询是通过二次查询获取的。
        const data = this.structureRawReturns(await this.query(this.buildFindQuery(entityQuery))) as any[]
        // 2. TODO 关联数据的结构化。也可以把信息丢到客户端，然客户端去结构化？？？


        // 3. x:n 关联实体的查询
        if (entityQuery.attributeQuery!.xToManyEntities) {
            for (let relatedEntity of entityQuery.attributeQuery.xToManyEntities) {
                const {name: subAttributeName, entityQuery: subEntityQuery} = relatedEntity
                for (let entity of data) {
                    const ids = await this.findRelatedEntityIds(subEntityQuery.entityName, entity.id, subAttributeName)
                    const relatedEntityQuery = subEntityQuery.derive({
                        matchExpression: subEntityQuery.matchExpression.and({
                            key: 'id',
                            value: ['in', ids]
                        })
                    })

                    entity[subAttributeName] = await this.findRecords(relatedEntityQuery)
                }
            }
        }

        return data
    }
    async findRelatedEntityIds(entityName: string, entityId: string, fieldName: string) {
        // TODO
        return []
    }
    // 根据 queryTree 来获得 join table 的信息。因为 queryTree 是树形，所以这里也是个递归结构。

    getJoinTables(queryTree: EntityQueryTree, context: string[] = [], parentInfos?: [string, string, string]) :JoinTables {
        // 应该是深度 遍历？
        const result: JoinTables = []
        if (!parentInfos) {
            //  context 里面至少会有 entityName 这一个值。
            const parentNamePath = [context[0]]
            parentInfos = (this.map.getTableAndAlias(parentNamePath).slice(0, 2))
                .concat(this.map.getTableAliasAndFieldName(parentNamePath, 'id')[1])  as [string, string, string]
        }

        const parentTableAndAlias = parentInfos.slice(0, 2) as [string, string]
        const parentIdField = parentInfos[2]

        Object.entries(queryTree).forEach(([entityAttributeName, subQueryTree]) => {

            const attributeInfo = this.map.getInfoByPath(context.concat(entityAttributeName))

            assert(attributeInfo.isRecord, `${context.concat(entityAttributeName).join('.')} is not a record`)

            const [currentTable, currentTableAlias, /*lastEntityData*/,relationTable, relationTableAlias] = this.map.getTableAndAlias(context.concat(entityAttributeName))
            const [, idField] = this.map.getTableAliasAndFieldName(context.concat(entityAttributeName), 'id')
            // 这里的目的是把 attribute 对应的 record table 找到，并且正确 join 进来。
            // 任何关系都会有一个 中间 record 吗？不会。
            // 这里只处理没有和上一个节点 三表合一 的情况。三表合一的情况不需要 join。复用 alias 就行
            if (!attributeInfo.isMergedWithParent()) {
                // 这里要判断的是 关联 id 是记录在了哪里？
                // 如果 attributeInfo 自己就有 field，说明就是自己记录的
                if (attributeInfo.field) {
                    assert(attributeInfo.isManyToOne, `only many to one can attribute may have field`)
                    result.push({
                        for: context.concat(entityAttributeName),
                        joinSource: parentTableAndAlias!,
                        joinIdField: [attributeInfo.field, idField],
                        joinTarget: [currentTable, currentTableAlias]
                    })
                } else {
                    //
                    const reverseAttributeInfo = attributeInfo.getReverseInfo()
                    // 说明记录在对方的 field 里面
                    if (reverseAttributeInfo && reverseAttributeInfo.field) {
                        result.push({
                            for: context.concat(entityAttributeName),
                            joinSource: parentTableAndAlias!,
                            // 这里要找当前实体中用什么 attributeName 指向上一个实体
                            joinIdField: [parentIdField, reverseAttributeInfo.field],
                            joinTarget: [currentTable, currentTableAlias]
                        })
                    } else {
                        // 说明记录在了 relation record 的 source/target 中
                        const linkInfo = attributeInfo.getLinkInfo()
                        const isCurrentRelationSource = linkInfo.isRecordSource(attributeInfo.parentEntityName)

                        // 关系表独立
                        result.push({
                            for: context.concat(entityAttributeName),
                            joinSource: parentTableAndAlias!,
                            // CAUTION sourceField 是用在合并了情况里面的，指的是 target 在 source 里面的名字！所以这里不能用
                            joinIdField: [parentIdField, isCurrentRelationSource ? linkInfo.record.attributes.source.field! : linkInfo.record.attributes.target.field!],
                            joinTarget: [relationTable, relationTableAlias]
                        })

                        result.push({
                            for: context.concat(entityAttributeName),
                            joinSource: [relationTable, relationTableAlias],
                            joinIdField: [isCurrentRelationSource ? linkInfo.record.attributes.target.field! : linkInfo.record.attributes.source.field!, idField],
                            joinTarget: [currentTable, currentTableAlias]
                        })

                    }

                }
            }
            result.push(...this.getJoinTables(subQueryTree, context.concat(entityAttributeName), [currentTable!, currentTableAlias!, idField!]))
        })

        return result
    }
    withPrefix(prefix ='') {
        return prefix? `${prefix}___` : ''
    }
    buildSelectClause(queryFields: ReturnType<AttributeQuery["getQueryFields"]>, prefix=''){
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
            return `JOIN ${joinTarget[0]} AS 
\`${this.withPrefix(prefix)}${joinTarget[1]}\` ON 
\`${this.withPrefix(prefix)}${joinSource[1]}\`.${joinIdField[0]} = \`${this.withPrefix(prefix)}${joinTarget[1]}\`.${joinIdField[1]}
`
        }).join('\n')
    }
    buildWhereClause(fieldMatchExp: BoolExpression<FieldMatchAtom>|null, prefix=''): string {
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
    parseMatchExpressionValue(entityName: string, fieldMatchExp: BoolExpression<FieldMatchAtom>|null, contextRootEntity? :string): BoolExpression<FieldMatchAtom>|null {
        if (!fieldMatchExp) return null

        return fieldMatchExp.map((exp: BoolExpression<FieldMatchAtom>, context:string[]) => {
            assert(Array.isArray(exp.data.value), `match value is not a array ${context.join('.')}`)
            if (exp.data.isFunctionMatch) {
                assert(exp.data.value[0].toLowerCase() === 'exist', `we only support Exist function match on entity for now. yours: ${exp.data.value[0]}`)

                const info = this.map.getInfoByPath(exp.data.namePath!)
                const [, currentAlias] = this.map.getTableAndAlias(exp.data.namePath!)
                const [, parentAlias] = this.map.getTableAndAlias(exp.data.namePath!.slice(0, -1))
                const reverseAttributeName = this.map.getReverseAttribute(info.parentEntityName, info.attributeName)

                // 注意这里去掉了 namePath 里面根部的 entityName，因为后面计算 referenceValue 的时候会加上。
                const parentAttributeNamePath = exp.data.namePath!.slice(1, -1)

                const existEntityQuery = RecordQuery.create(info.entityName, this.map, {
                        matchExpression: BoolExpression.createFromAtom({
                            key: `${reverseAttributeName}.id`,
                            value: ['=', parentAttributeNamePath.concat('id').join('.')],
                            isReferenceValue: true
                        } as MatchAtom).and(exp.data.value[1] instanceof BoolExpression ? exp.data.value[1] : MatchExpression.createFromAtom(exp.data.value[1]))
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
${this.buildFindQuery(existEntityQuery, currentAlias)}
)
`
                }
            } else {
                return {...exp.data}
            }
        })
    }

    async insertRecordData(newEntityData: NewEntityData): Promise<EntityIdRef> {

        let result: EntityIdRef
        const tableName = this.map.getRecordTable(newEntityData.recordName)

        const newId = await this.database.getAutoId(newEntityData.recordName)
        const newEntityDataWithId = newEntityData.merge({id: newId})

        const sameRowNewIdFields = []
        const newIds: {[k:string]: EntityIdRef} = {}
        // 给 sameRow 的新 entity 也要分配 ID
        for(let sameRowNewEntityData of newEntityData.sameRowNewEntitiesData) {
            const newRelatedId = await this.database.getAutoId(sameRowNewEntityData.info!.entityName!)
            sameRowNewIdFields.push([
                sameRowNewEntityData.getIdField(),
                newRelatedId
            ])
            newIds[sameRowNewEntityData.info!.attributeName] = {id: newRelatedId}
        }

        // CAUTION 判断的时候用这个判断，插入数据的时候才用 newEntityDataWithId！不然 sameRowEntityIdRefs 会判断出错！
        if (!newEntityData.sameRowEntityIdRefs.length) {
            const sameRowFields = newEntityDataWithId.sameRowEntityValuesAndRefFields.concat(sameRowNewIdFields)
            const values = sameRowFields.map(x => JSON.stringify(x[1]))
            const columns = sameRowFields.map(x => JSON.stringify(x[0]))
            result =  await this.database.insert(`
INSERT INTO ${this.map.getRecordTable(newEntityDataWithId.recordName)}
(${columns.join(',')})
VALUES
(${values.join(',')}) 
`) as EntityIdRef

            result!.id = newId
            Object.assign(result, newIds)
            return result!
        }


        /**
         * 已经有行了，更新策略：
         * 1. 选择第一个，移除其他位置
         * 2. 连带插入 当前数据，以及其他同行已有的数据
         */

        const [firstSameRowEntityIdRef, ...restSameRowEntityIdRefs] = newEntityData.sameRowEntityIdRefs
        // 先 unlink 已有的。
        await this.unlinkFromRecord(
            [firstSameRowEntityIdRef.info?.parentEntityName!, firstSameRowEntityIdRef.info?.attributeName!],
            MatchExpression.createFromAtom({
                key: 'id',
                value: ['=', firstSameRowEntityIdRef.getRef().id]
            })
        )

        // 把其他的数据 都 flashOut 出来
        const restSameRowEntitiesData:{[k:string]: RawEntityData} = {}
        for(let restSameRowEntityIdRef of restSameRowEntityIdRefs) {
            const restRecordInfo = restSameRowEntityIdRef.info?.getRecordInfo()!
            const allRelatedRecords = restRecordInfo?.combinedRecords.map(info => info.attributeName!)
            const newMatch =  MatchExpression.createFromAtom({
                key: 'id',
                value: ['=', restSameRowEntityIdRef.getRef().id]
            })
            restSameRowEntitiesData[restSameRowEntityIdRef.info?.attributeName!] = await this.flashOutRecords(restRecordInfo?.record!, newMatch, allRelatedRecords)
        }

        const newEntityDataWithAllCombinedRecordData = newEntityDataWithId.merge(restSameRowEntitiesData)
        const sameRowFields = newEntityDataWithAllCombinedRecordData.sameRowEntityValuesAndRefFields.concat(sameRowNewIdFields)
        const values = sameRowFields.map(x => JSON.stringify(x[1]))
        const columns = sameRowFields.map(x => JSON.stringify(x[0]))
        const [idField, idValue] = firstSameRowEntityIdRef.getIdFieldAndValue()

        assert(!!idValue &&!!idValue, `${idField} ${idValue} can be null`)

        const updated = (await this.database.update(`
UPDATE ${tableName}
SET
${columns.map((column, index) => (`
${column} = ${values[index]}
`)).join(',')
}

WHERE
${idField} = ${idValue}
`))


        assert(updated.length === 1, `update row should be 1 ${updated.length}`)
        result = updated[0] as EntityIdRef

        Object.assign(result, newIds)
        result!.id = newId
        return result!

    }


    /**
     * 助理流程：
     * 1. 新增我依赖的（关系 field 在我这）
     *
     * 2. 新增自己和合表数据（带所有我依赖的 id）
     *
     * 3. 新增依赖我的（带我的 id）
     * 3.1 处理依赖我的 1:x 关系的抢夺问题
     *
     * 4. 新增不相关的
     * 4.1 处理不相关的 1:x 的关系抢夺问题
     */
    async createRecord(newEntityData: NewEntityData) : Promise<EntityIdRef>{
        if (newEntityData.isRef()) return Promise.resolve(newEntityData.rawData as EntityIdRef)

        const newRefIds: {[k:string]: EntityId} = {}

        const holdFieldNewRelatedEntities = newEntityData.holdFieldNewRelatedEntities
        // 1. 新增我依赖的（关系 field 在我这）
        const holdFieldRelatedEntityIdRefs: {[k:string]: EntityIdRef} = {}
        for( let holdFieldNewRelatedEntity of holdFieldNewRelatedEntities) {
            holdFieldRelatedEntityIdRefs[holdFieldNewRelatedEntity.info?.attributeName!] = await this.createRecord(holdFieldNewRelatedEntity)
        }
        // 记录一下，后面一起返回
        Object.assign(newRefIds, holdFieldRelatedEntityIdRefs)
        const wipNewEntityData = newEntityData.merge(holdFieldRelatedEntityIdRefs)


        // 2. 新增自己和合表数据（带所有我依赖的 id）
        const newEntity = await this.insertRecordData(wipNewEntityData)

        // 3. 新增依赖我的（带我的 id） 这种情况关系也更新了。
        for( let holdMyFieldRelatedEntity of newEntityData.holdMyFieldRelatedEntities) {
            const reverseInfo = holdMyFieldRelatedEntity.info!.getReverseInfo()!
            const reverseName = reverseInfo.attributeName!
            if (holdMyFieldRelatedEntity.isRef()) {
                // 3.1 更新数据。会更新或者建立关系
                const idMatch = MatchExpression.createFromAtom({
                    key: 'id',
                    value: ['=', holdMyFieldRelatedEntity.getRef().id]
                })
                this.updateRecord(reverseInfo.parentEntityName, idMatch, new NewEntityData(this.map, reverseInfo.parentEntityName, {[reverseName]: newEntity}))
            } else {
                // 新建数据
                const holdMyFieldRelatedEntityWithMyId = holdMyFieldRelatedEntity.derive({
                    [reverseName]: newEntity
                })
                const newIdRef = await this.createRecord(holdMyFieldRelatedEntityWithMyId)
                // 记录一下，后面一起返回
                newRefIds[holdMyFieldRelatedEntity.info!.attributeName!] = newIdRef
            }
        }

        // 4 处理完全不相关的
        for( let differentTableEntityData of newEntityData.differentTableEntitiesData) {
            let idRef
            if (!differentTableEntityData.isRef()) {
                idRef = await this.createRecord(differentTableEntityData)
                // 记录一下，后面一起返回
                newRefIds[differentTableEntityData.info!.attributeName!] = idRef
            } else {
                idRef = differentTableEntityData.getRef()
            }

            // 4.1. 处理完全不相关的关系问题
            await this.addLinkFromRecord(
                differentTableEntityData.info!.parentEntityName,
                differentTableEntityData.info!.attributeName,
                newEntity.id,
                idRef.id
            )
        }

        Object.assign(newEntity, newRefIds)
        return newEntity
    }



    // CAUTION 除了 1:1 并且合表的关系，不能递归更新 relatedEntity，如果是传入了，说明是建立新的关系。
    async updateRecordData(entityName: string, matchExpressionData: MatchExpressionData, columnAndValue: {field:string, value:string}[])  {
        // TODO 要更新拆表出去的 field
        const matchedEntities = await this.findRecords(RecordQuery.create(entityName, this.map, {
            matchExpression: matchExpressionData,
        }))

        const idField= this.map.getInfo(entityName, 'id').field

// CAUTION update 语句可以有 别名和 join，但似乎 SET 里面不能用主表的 别名!!!
        return this.database.update(`
UPDATE ${this.map.getRecordTable(entityName)}
SET
${columnAndValue.map(({field, value}) => `
${field} = ${value}
`).join(',')}
WHERE ${idField} IN (${matchedEntities.map(i => JSON.stringify(i.id)).join(',')})
`, idField)
    }
    // 只有 1:1 关系可以递归更新实体数据，其他都能改当前实体的数据或者和其他实体关系。
    async updateRecord(entityName: string, matchExpressionData: MatchExpressionData, newEntityData: NewEntityData)  {
        // 先更新自身的 value 和 三表合一 或者 关系表合并的情况
        const columnAndValue = newEntityData.sameRowEntityValuesAndRefFields.map(([field, value]) => (
            {
                field,
                /// TODO value 要考虑引用自身或者 related entity 其他 field 的情况？例如 age+5
                value: JSON.stringify(value)
            }
        ))

        const updatedEntities = await this.updateRecordData(entityName, matchExpressionData, columnAndValue)
        // FIXME 这里验证一下三表合一情况下的数据正确性
        // if(newEntityData.sameRowEntityIds.length) {
        //     assert(updatedEntities.length === 1 && updatedEntities[0].id === newEntityData.reuseEntityId, `updated multiple records with only 1 1:1 related entity, ${updatedEntities[0].id} ${newEntityData.reuseEntityId}` )
        // }

        // 除了一下和其他实体更新关系的情况。
        for(let newRelatedEntityData of newEntityData.differentTableEntitiesData) {
            // 这里只处理没有三表合并的场景。因为三表合并的数据在 sameTableFieldAndValues 已经有了
            // 这里只需要处理 1）关系表独立 或者 2）关系表往另一个方向合了的情况。因为往本方向和的情况已经在前面 updateEntityData 里面处理了

            // 我们永远只允许 1:1 关系创建/更新连带数据。这里验证一下。
            assert(!!(newRelatedEntityData.isRef() || newRelatedEntityData.info?.isOneToOne) , `cannot update/create non-1:1 related ${newRelatedEntityData.info?.attributeName}`)


            if (newRelatedEntityData.info?.isXToMany) {
                // CAUTION  x:n 的情况让用户自己再次调用。因为这里的语义很难确定是要新增，还是 replace 掉原来所有的关系。
                assert(false, 'cannot update x:n relation because of ambiguous goal.')
            }

            // 剩下都是 xToOne 的情况了
            // CAUTION 我们不支持抢夺别人的 1:1 related entity 的情况
            let finalRelatedEntityRef

            if (newRelatedEntityData.isRef()) {
                finalRelatedEntityRef = newRelatedEntityData.getRef()
            } else {
                finalRelatedEntityRef = await this.createRecord(newRelatedEntityData)
            }

            for(let updatedEntity of updatedEntities) {
                await this.addLinkFromRecord(entityName, newRelatedEntityData.info?.attributeName!, updatedEntity.id, finalRelatedEntityRef.id)
            }
        }

        return updatedEntities

    }
    async deleteRecord(recordName:string, matchExp: MatchExpressionData, includeRelatedRecords: string[]= []) {
        const recordInfo = this.map.getRecordInfo(recordName)
        const combinedRecordIdFields = recordInfo.combinedRecords.map(info => {
            return [info.attributeName!, { attributeQuery: ['id']}] as [string, EntityQueryData]
        })
        const records = await this.findRecords(
            RecordQuery.create(recordName, this.map, {
                matchExpression: matchExp,
                attributeQuery: ['id', ...combinedRecordIdFields]
            })
        )


        const deleteRowIds =[]
        const updateRowIds = []
        for(let record of records) {
            const canDeleteRow = recordInfo.combinedRecords.every(info => {
                return !record[info.attributeName].id || includeRelatedRecords.includes(info.attributeName)
            })
            // 如果其他字段都没有，就是删除，如果有，就是 update
            if (canDeleteRow) {
                deleteRowIds.push(record.id)
            } else {
                updateRowIds.push(record.id)
            }
        }

        // 下面的删除会把自己 hold field 的 relatedEntity 都删掉
        if (deleteRowIds.length) {
            await this.database.query(`
DELETE FROM ${this.map.getRecordTable(recordName)}
WHERE
${recordInfo.idField} IN (${deleteRowIds})
`)
        }

        if (updateRowIds.length) {
            const allRelatedRecordFields = includeRelatedRecords.map(includeRelatedRecord => {
                return recordInfo.getAttributeInfo(includeRelatedRecord).getRecordInfo().allFields
            })


            await this.database.query(`
UPDATE ${this.map.getRecordTable(recordName)}

SET ${recordInfo.allFields.concat(...allRelatedRecordFields).map(field => `
${field} = NULL
`)}

WHERE
${recordInfo.idField} IN (${updateRowIds})
`)
        }

        // 获取所有还没处理的关系，连带删除
        for(let attributeInfo of recordInfo.differentTableRecords) {
            const linkInfo = attributeInfo.getLinkInfo()

            const linkMatch = MatchExpression.createFromAtom({
                key: linkInfo?.isRecordSource(recordName) ? 'source.id' : 'target.id',
                value: ['in', deleteRowIds.concat(updateRowIds)]
            })
            await this.unlink(linkInfo?.name!, linkMatch)
        }

        return records
    }
    addLinkFromRecord(entity: string, attribute:string, entityId:string, relatedEntityId: string, attributes: RawEntityData = {}) {
        const linkInfo = this.map.getLinkInfo(entity, attribute)
        const isEntitySource = linkInfo.isRecordSource(entity)

        const sourceId = isEntitySource? entityId : relatedEntityId
        const targetId = isEntitySource? relatedEntityId: entityId

        return this.addLink(linkInfo.name, sourceId, targetId, attributes)
    }
    // FIXME 能不能复用 createRecord？？有没有什么区别
    addLink(linkName: string, sourceId: string, targetId:string, attributes: RawEntityData) {
        const linkInfo = this.map.getLinkInfoByName(linkName)

        if( linkInfo.isMerged()) {
            // 关系表不独立
            // FIXME 一比一关系也要处理
            assert(!linkInfo.isCombined(), `do not use add relation with 1:1 relation. ${linkInfo.sourceRecord} ${linkInfo.sourceAttribute}`)
            const isMergeToSource = linkInfo.isMergedToSource()
            const idValue = isMergeToSource ? sourceId: targetId
            const relatedId = isMergeToSource ? targetId : sourceId
            const idField = this.map.getInfo(isMergeToSource ? linkInfo.sourceRecord : linkInfo.targetRecord, 'id').field

            const relatedField = isMergeToSource ? linkInfo.sourceField : linkInfo.targetField
            const attributePairs = Object.entries(attributes)
            const keyValuePairs = [
                [relatedField, relatedId],
                ...attributePairs
            ]

            return this.query(`
UPDATE ${linkInfo.table}
SET
${keyValuePairs.map(([k,v]) => `
${k} = ${JSON.stringify(v)}
`).join(',')}
WHERE
${idField} = ${idValue}
`)

        } else {
            // 独立关系表
            // FIXME 1:n 关系的抢夺
            const attributeValues = Object.values(attributes)
            const attributeKeys = Object.keys(attributes).map(k => linkInfo.record.attributes[k].field)

            return this.query(`
INSERT INTO ${linkInfo.table}
(${[linkInfo.sourceField, linkInfo.targetField].concat(attributeKeys).join(',')})
VALUES
(${[sourceId, targetId].concat(attributeValues).map(v => JSON.stringify(v)).join(',')})
`)
        }
    }
    async unlinkFromRecord(recordNameAndAttribute: [string, string], matchExpressionData: MatchExpressionData,) {
        const [record, attribute] = recordNameAndAttribute
        const linkInfo = this.map.getLinkInfo(recordNameAndAttribute[0], recordNameAndAttribute[1])
        // 如果是 三表合一，永远都是  move 掉 attribute 方向的数据。
        const moveSource = !linkInfo.isRecordSource(record)
        const newMatch = this.transformMatch(matchExpressionData, record, attribute,true)
        return this.unlink(linkInfo.name, newMatch, moveSource)
    }


    async unlink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false) {
        const linkInfo = this.map.getLinkInfoByName(linkName)
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
            }))

            const toMoveIds = []
            for(let record of records) {
                if( record[toMove].id ) {
                    toMoveIds.push(record[toMove].id)
                }
            }

            // 除了当前 link 以外，所有和 toMove 相关的
            if (toMoveIds.length) {
                await this.moveRecords(
                    toMoveRecordInfo.record,
                    MatchExpression.createFromAtom({
                        key: 'id',
                        value: ['in', toMoveIds]
                    }),
                    [linkName]
                )
            }

            return
        }

        if (linkInfo.isMerged()) {
            // 完全独立，直接删除符合条件的 就行了
            return this.deleteRecord(linkName, matchExpressionData)
        }

        // 剩下的都是 merge 到某一边的
        if (linkInfo) {
            const newMatch = this.transformMatch(matchExpressionData, linkName, linkInfo.isMergedToSource()? 'source': 'target')
            const recordName = linkInfo.isMergedToSource() ? linkInfo.sourceRecord : linkInfo.targetRecord
            const attributeName = linkInfo.isMergedToSource() ? linkInfo.sourceAttribute : linkInfo.targetAttribute!
            const newData = new NewEntityData(this.map,recordName, {[attributeName]: null} )
            return await this.updateRecord(recordName, newMatch, newData)
        }
    }
    // 默认会把连带的都移走
    async moveRecords(recordName:string, matchExpressionData: MatchExpressionData, excludeLinks: string[] = []) {
        const recordInfo = this.map.getRecordInfo(recordName)
        const includeRelated = recordInfo.combinedRecords.filter(info => {
            return !excludeLinks.includes(info.linkName)
        }).map(info => info.attributeName)
        // 所有 1:1 连带数据都要取出
        const records = await this.flashOutRecords(recordName, matchExpressionData, includeRelated)
        const newIds = []
        for( let record of records) {
            newIds.push(await this.createRecord(new NewEntityData(this.map, recordName, record)))
        }
        return newIds
    }
    async flashOutRecords(recordName:string, matchExpressionData: MatchExpressionData, includeRelated: string[] = []) {
        const records = await this.findRecords(RecordQuery.create(recordName, this.map, {
            matchExpression: matchExpressionData,
            // 所有关联数据。fields
            attributeQuery: this.constructorAttributeQueryTree(recordName, includeRelated)
        }))

        // 删除老的
        if (records.length) {
            const ids = records.map(r => r.id)
            await this.deleteRecord(recordName, MatchExpression.createFromAtom({
                key: 'id',
                value: ['in', ids]
            }), includeRelated)
        }


        return records
    }
    constructorAttributeQueryTree(recordName:string, includeAttributes: string[] = []) {
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
                attributeQuery: this.constructorAttributeQueryTree(info.getRecordInfo().record, subRelatedAttributes)
            }] as AttributeQueryDataItem
        })

        return valueAttributes.concat(...relatedRecordsAttributeQuery)
    }
    transformMatch(matchExpressionData: MatchExpressionData, recordName: string, attribute: string, toLinkAngle = false) {
        if (!toLinkAngle) {
            const reverseAttribute = this.map.getReverseAttribute(recordName, attribute)
            // 本质上等于给所有条件的 key 换名字
            return matchExpressionData.map((atom, context) => {
                const {key, value, isReferenceValue} = atom.data
                if (context[0] === attribute) {
                    // 说明是 attribute 下面的，去掉前缀就行了
                    const newKey = key.split('.').slice(1, Infinity).join('.')
                    assert(!!newKey, `${key} has no prefix, something wrong`)
                    // FIXME value 里面有引用，那么也要换。但它可能是表达式，我们这里只是简单处理，可能会对表达式破坏
                    const newValue = isReferenceValue ? value[1].split('.').slice(1, Infinity).join('.') : value[1]
                    return {
                        key: newKey,
                        value: [value[0], newValue]
                    }
                } else {
                    // 说明是 record 的字段
                    // FIXME value 里面有引用，那么也要换。但它可能是表达式，我们这里只是简单处理，可能会对表达式破坏
                    const newValue = isReferenceValue ? `${reverseAttribute}.${value[1]}` : value[1]
                    return {
                        key: `${reverseAttribute}.${key}`,
                        value: [value[0], newValue]
                    }
                }
            })
        }


        // transform 成 link angle 的
        const linkInfo = this.map.getLinkInfo(recordName, attribute)
        const recordPrefix = linkInfo.isRecordSource(recordName) ? 'source' : 'target'
        const attributePrefix = linkInfo.isRecordSource(recordName) ? 'target': 'source'
        // 两边都要加前缀
        return matchExpressionData.map((atom, context) => {
            const {key, value, isReferenceValue} = atom.data
            if (context[0] === attribute) {
                // 说明是 attribute 下面的，替换前缀
                const newKey = [attributePrefix].concat(key.split('.').slice(1, Infinity)).join('.')
                assert(!!newKey, `${key} has no prefix, something wrong`)
                // FIXME value 里面有引用，那么也要换。但它可能是表达式，我们这里只是简单处理，可能会对表达式破坏
                const newValue = isReferenceValue ? [attributePrefix].concat(value[1].split('.').slice(1, Infinity)).join('.') : value[1]
                return {
                    key: newKey,
                    value: [value[0], newValue]
                }
            } else {
                // 说明是 record 的字段，添加前缀
                // FIXME value 里面有引用，那么也要换。但它可能是表达式，我们这里只是简单处理，可能会对表达式破坏
                const newValue = isReferenceValue ? `${recordPrefix}.${value[1]}` : value[1]
                return {
                    key: `${recordPrefix}.${key}`,
                    value: [value[0], newValue]
                }
            }
        })
    }


    // FIXME 能不能复用 delete record
    async removeLink(relationName: string, matchExpressionData: MatchExpressionData,) {
        const relationRecords = await this.findRecords(RecordQuery.create(relationName, this.map, {
            matchExpression: matchExpressionData,
            attributeQuery: [['source', {attributeQuery: ['id']}], ['target', {attributeQuery: ['id']}]]
        } ))

        const linkInfo = this.map.getLinkInfoByName(relationName)
        const idField = this.map.getInfo(relationName, 'id').field

        assert(!linkInfo.isCombined(), `remove 1:1 with combined entity is not implemented yet ${relationName}`)
        if (!linkInfo.isMerged()) {
            // 独立的表
            return this.query(`
DELETE FROM ${this.map.getRecordTable(relationName)}
WHERE ${idField} IN (${relationRecords.map(({id}) => JSON.stringify(id)).join(',')})
`)
        } else {
            // 合并的表
            const table =  this.map.getRecordTable(linkInfo.isMergedToSource() ? linkInfo.sourceRecord : linkInfo.targetRecord)
            // 记录的 field
            const field = linkInfo.isMergedToSource() ? linkInfo.sourceField : linkInfo.targetField
            return this.query(`
UPDATE ${table}
SET
${field} = NULL
WHERE ${idField} IN (${relationRecords.map(({id}) => JSON.stringify(id)).join(',')})
`)
        }

    }

    async query(sql: string) {
        return this.database.query(sql)
    }
}


type RawEntityData = {[k:string]: any}


class NewEntityData {
    // 同表的新数据，或者关系表往这边和了的有 id 的 field,一起记录下来可以一次性插入的。
    public sameRowEntityValuesAndRefFields: [string, string][]
    public sameRowNewEntitiesData: NewEntityData[] = []
    public relatedEntitiesData: NewEntityData[] = []
    public differentTableEntitiesData: NewEntityData[] = []
    public holdFieldNewRelatedEntities: NewEntityData[] = []
    public holdMyFieldRelatedEntities: NewEntityData[] = []
    public valueAttributes: [string, any][]
    // 和当前合表并且是  id 的。说明我们的需要的 row 已经有了，只要update 相应 column 就行了
    public sameRowEntityIdRefs: NewEntityData[] = []
    constructor(public map: EntityToTableMap, public recordName: string, public rawData: RawEntityData, public info?: AttributeInfo) {
        const [valueAttributesInfo, entityAttributesInfo] = this.map.groupAttributes(recordName, Object.keys(rawData))
        this.relatedEntitiesData = entityAttributesInfo.map(info => new NewEntityData(this.map, info.entityName, rawData[info.attributeName], info))

        this.valueAttributes = valueAttributesInfo.map(info => {
            return [info.attributeName!, rawData[info.attributeName]]
        })
        // TODO 要把那些独立出去的 field 排除出去。
        this.sameRowEntityValuesAndRefFields = valueAttributesInfo.map(info => [info.field, rawData[info.attributeName]])
        this.relatedEntitiesData.forEach(newRelatedEntityData => {
            // CAUTION 三表合一的情况（需要排除掉关系的 source、target 是同一实体的情况，这种情况下不算合表）
            if (newRelatedEntityData.info!.isMergedWithParent()) {
                // 三表合一的情况。记录合表的数据到底是有 id ，还是新的。如果是有 id ，说明是要  update 某一行。
                if(newRelatedEntityData.isRef()) {
                    this.sameRowEntityIdRefs.push(newRelatedEntityData)
                } else {
                    this.sameRowNewEntitiesData.push(newRelatedEntityData)
                    // 全新的同表的数据
                    this.sameRowEntityValuesAndRefFields.push(...newRelatedEntityData.sameRowEntityValuesAndRefFields)
                }
            } else {
                // 有 field 说明是关系表合并到了当前实体表，一起处理
                if(newRelatedEntityData.info!.field) {
                    if (newRelatedEntityData.isRef() ) {
                        this.sameRowEntityValuesAndRefFields.push([newRelatedEntityData.info!.field, newRelatedEntityData.getRef().id])
                    } else {
                        // 没有 id 的说明要单独新建
                        this.holdFieldNewRelatedEntities.push(newRelatedEntityData)
                    }
                } else {

                    // 把 hold 我的 field 的 record 识别出来。
                    const linkInfo = newRelatedEntityData.info!.getLinkInfo()
                    if (linkInfo.isRecordSource(this.recordName) ? linkInfo.isMergedToTarget() : linkInfo.isMergedToSource()) {
                        this.holdMyFieldRelatedEntities.push(newRelatedEntityData)
                    } else {
                        // 完全没合表的
                        this.differentTableEntitiesData.push(newRelatedEntityData)
                    }


                }
            }
        })

    }
    derive(newRawData: RawEntityData) {
        return new NewEntityData(this.map, this.recordName, newRawData, this.info)
    }
    merge(partialNewRawData: RawEntityData) {
        return new NewEntityData(this.map, this.recordName, {...this.rawData, ...partialNewRawData }, this.info)
    }
    exclude(attributeNames: string[]) {
        const newRawData = {...this.rawData}
        attributeNames.forEach(name => delete newRawData[name])
        return new NewEntityData(this.map, this.recordName, newRawData, this.info)
    }
    getRef() {
        return {id: this.rawData.id}
    }
    getData() {
        return {...this.rawData}
    }
    isRef() {
        return !!(this.info?.isRecord && this.rawData["id"] !== undefined)
    }
    getIdField() {
        const recordInfo = this.map.getRecordInfo(this.recordName)
        return recordInfo.idField!
    }
    getIdFieldAndValue(): [string, string] {
        assert(this.isRef(), 'is not ref')
        const recordInfo = this.map.getRecordInfo(this.recordName)
        return [recordInfo.idField!, this.rawData.id!]
    }
}



export class EntityQueryHandle {
    agent: QueryAgent

    constructor(public map: EntityToTableMap, public database: Database) {
        this.agent = new QueryAgent(map, database)
    }

    async findOne(entityName: string, matchExpression: MatchExpressionData, modifier: ModifierData = {}, attributeQuery?: AttributeQueryData) {
        const limitedModifier = {
            ...modifier,
            limit: 1
        }

        return (await this.find(entityName, matchExpression, limitedModifier, attributeQuery))[0]
    }

    async find(entityName: string, matchExpressionData?: MatchExpressionData, modifierData?: ModifierData, attributeQueryData: AttributeQueryData = []) {
        const entityQuery = RecordQuery.create(
            entityName,
            this.map,
            {
                matchExpression: matchExpressionData,
                attributeQuery: attributeQueryData,
                modifier: modifierData
            },
        )

        return this.agent.findRecords(entityQuery)
    }

    async create(entityName: string, rawData: RawEntityData ) : Promise<EntityIdRef>{
        const newEntityData = new NewEntityData(this.map, entityName, rawData)
        return this.agent.createRecord(newEntityData)
    }
    // CAUTION 不能递归更新 relate entity 的 value，如果传入了 related entity 的值，说明是建立新的联系。
    async update(entityName: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData) {
        const newEntityData = new NewEntityData(this.map, entityName, rawData)
        return this.agent.updateRecord(entityName, matchExpressionData, newEntityData)
    }



    async createOrUpdate() {

    }

    async delete() {

    }

    async count() {

    }
    async addRelation(relationName: string|string[], sourceEntityId: string,  targetEntityId:string, rawData: RawEntityData) {
        const linkInfo = Array.isArray(relationName) ? this.map.getLinkInfo(relationName[0], relationName[1]) : this.map.getLinkInfoByName(relationName)
        return this.agent.addLinkFromRecord(linkInfo.sourceRecord, linkInfo.sourceAttribute, sourceEntityId, targetEntityId, rawData)
    }
    async updateRelation(relationName:string, matchExpressionData: MatchExpressionData, newData: RawEntityData) {
        // TODO
        return Promise.resolve()
    }
    async findRelation(relationName: string, matchExpressionData?: MatchExpressionData, modifierData?: ModifierData, attributeQueryData: AttributeQueryData = []) {
        return this.find(relationName, matchExpressionData, modifierData, attributeQueryData)
    }
    async findOneRelation(relationName: string, matchExpressionData: MatchExpressionData, modifierData: ModifierData = {}, attributeQueryData: AttributeQueryData = []) {
        const limitedModifier = {
            ...modifierData,
            limit: 1
        }
        return this.findRelation(relationName, matchExpressionData, limitedModifier, attributeQueryData)
    }
    async removeRelation(relationName: string, matchExpressionData: MatchExpressionData) {
        return this.agent.removeLink(relationName, matchExpressionData)
    }
    // TODO 增加 source/target  rename 的能力，不然 Match 的时候还得知道 source/target
    async findRelationFromEntity(inputRelationName: string[], matchExpressionData?: MatchExpressionData, modifierData?: ModifierData, attributeQueryData: AttributeQueryData = []) {
        // FIXME matchExpreesionData 要”转秩“
        const relationName = Array.isArray(inputRelationName) ?
            this.map.getInfo(inputRelationName[0], inputRelationName[1]).linkName :
            inputRelationName as string
        return this.find(relationName, matchExpressionData, modifierData, attributeQueryData)
    }
    async findOneRelationFromEntity(inputRelationName: string[], matchExpressionData: MatchExpressionData, modifierData: ModifierData = {}, attributeQueryData: AttributeQueryData = []) {
        const limitedModifier = {
            ...modifierData,
            limit: 1
        }
        return this.findRelationFromEntity(inputRelationName, matchExpressionData, limitedModifier, attributeQueryData)
    }
    async updateRelationFromEntity(relationName:string[], matchExpressionData: MatchExpressionData, newData: RawEntityData) {
        // TODO
        return Promise.resolve()
    }
    async removeRelationFromEntity(inputRelationName: string[], matchExpressionData: MatchExpressionData) {
        // FIXME matchExpreesionData 要”转秩“
        const relationName = Array.isArray(inputRelationName) ?
            this.map.getInfo(inputRelationName[0], inputRelationName[1]).linkName :
            inputRelationName as string
        return this.agent.removeLink(relationName, matchExpressionData)
    }

}

