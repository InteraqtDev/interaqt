import {AttributeInfo, EntityToTableMap} from "./EntityToTableMap";
import {assert, deepMerge, mapTree, setByPath} from "../util";
import {BoolExpression, ExpressionData} from '../../shared/BoolExpression'
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
    constructor(public entityName: string, public map: EntityToTableMap, public data?: MatchExpressionData, public contextRootEntity?: string) {

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
                if (attributeInfo.isEntity) {
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
        const [tableAlias, rawFieldName] = this.map.getTableAliasAndFieldName([this.contextRootEntity||this.entityName].concat(matchAttributePath.slice(0, -1)), matchAttributePath.at(-1))
        return `${tableAlias}.${rawFieldName}`
    }

    getFinalFieldValue(isReferenceValue: boolean, value: [string, any] ) {
        let fieldValue
        const simpleOp = ['=', '>', '<', '<=', '>=', 'like']

        if (simpleOp.includes(value[0])) {
            fieldValue = `${value[0]} ${isReferenceValue ? this.getReferenceFieldValue(value[1]) : JSON.stringify(value[1])}`
        } else if(value[0].toLowerCase() === 'in') {
            assert(!isReferenceValue, 'reference value cannot use IN to match')
            fieldValue = `IN [${value[1].map(x => JSON.stringify(x)).join(',')}]`
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

    and(condition): MatchExpression {
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
    constructor(public entityName: string, public map: EntityToTableMap, public data: ModifierData) {
    }

    derive(overwrite: ModifierData) {
        return new Modifier(this.entityName, this.map, {...this.data, ...overwrite})
    }
}


export type EntityQueryData = {
    matchExpression?: MatchExpressionData,
    attributeQuery: AttributeQueryData,
    modifier?: ModifierData
}

type AttributeQueryDataItem = string|[string, EntityQueryData]

export type AttributeQueryData = AttributeQueryDataItem[]

export type EntityQueryDerivedData = {
    matchExpression? : MatchExpression,
    attributeQuery? :AttributeQuery,
    modifier? : Modifier
}

export class EntityQuery {
    static create(entityName: string, map: EntityToTableMap, data: EntityQueryData, contextRootEntity?: string) {
        return new EntityQuery(
            entityName,
            map,
            new MatchExpression(entityName, map, data.matchExpression, contextRootEntity),
            new AttributeQuery(entityName, map, data.attributeQuery || []),
            new Modifier(entityName, map, data.modifier),
            contextRootEntity
        )
    }
    constructor(public entityName, public map: EntityToTableMap, public matchExpression: MatchExpression, public attributeQuery: AttributeQuery, public modifier: Modifier, public contextRootEntity?:string) {}
    derive(derived: EntityQueryDerivedData) {
        return new EntityQuery(
            this.entityName,
            this.map,
            derived.matchExpression || this.matchExpression,
            derived.attributeQuery || this.attributeQuery,
            derived.modifier || this.modifier
        )
    }

}


type EntityQueryTree = {
    [k:string] : EntityQueryTree
}

export class AttributeQuery {
    public relatedEntities: {name: string, entityQuery: EntityQuery}[] = []
    public xToManyEntities: {name: string, entityQuery: EntityQuery}[] = []
    public xToOneEntities: {name: string, entityQuery: EntityQuery}[] = []
    public valueAttributes: string[] = []
    public entityQueryTree: EntityQueryTree = {}
    public fullEntityQueryTree: EntityQueryTree = {}
    constructor(public entityName: string, public map: EntityToTableMap, public data: AttributeQueryData = []) {
        data.forEach((item: AttributeQueryDataItem) => {
            const attributeName:string = typeof item=== 'string' ? item : item[0]

            const attributeInfo = this.map.getInfo(this.entityName, attributeName)
            if (attributeInfo.isEntity) {
                this.relatedEntities.push({
                    name: attributeName,
                    entityQuery: EntityQuery.create(attributeInfo.entityName, this.map, item[1] as EntityQueryData)
                })
            } else {
                this.valueAttributes.push(attributeName)
            }
        })

        this.xToManyEntities = this.relatedEntities.filter(({name}) => {
            return this.map.getInfo(this.entityName, name).isXToMany
        })

        this.xToOneEntities = this.relatedEntities.filter(({name}) => {
            return this.map.getInfo(this.entityName, name).isXToOne
        })

        this.entityQueryTree = this.buildEntityQueryTree()
        this.fullEntityQueryTree = this.buildFullEntityQueryTree()
    }
    getQueryFields (nameContext = [this.entityName]): {tableAliasAndField: [string, string], nameContext: string[], attribute: string}[] {
        const queryFields = ['id'].concat(this.valueAttributes).map(attributeName => ({
            tableAliasAndField: this.map.getTableAliasAndFieldName(nameContext, attributeName),
            nameContext,
            attribute: attributeName
        }))



        this.xToOneEntities.forEach(({ name: entityAttributeName, entityQuery }) => {
            queryFields.push(...entityQuery.attributeQuery!.getQueryFields(nameContext.concat(entityAttributeName)))
        })

        return queryFields
    }
    buildEntityQueryTree() {
        const result = {}
        // CAUTION 我们这里只管 xToOne 的情况，因为其他情况是用 id 去做二次查询得到的。
        this.xToOneEntities.forEach(({ name, entityQuery}) => {
            result[name] = entityQuery.attributeQuery!.entityQueryTree
        })
        return result
    }
    buildFullEntityQueryTree() {
        const result = {}
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


    buildFindQuery(entityQuery: EntityQuery, prefix='') {
        // 2. 从所有条件里面构建出 join clause
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
        // FIXME modifier
    }
    async findEntities(entityQuery:EntityQuery) : Promise<any[]>{
        // 1. 这里只通过合表或者 join  处理了 x:1 的关联查询。x:n 的查询是通过二次查询获取的。
        const data = (await this.query(this.buildFindQuery(entityQuery))) as any[]
        // 2. FIXME 关联数据的结构化。也可以把信息丢到客户端，然客户端去结构化？？？
        //  FIXME 结构化的时候要处理 id 的问题


        // 3. x:n 关联实体的查询
        if (entityQuery.attributeQuery!.xToManyEntities) {
            for (let [fieldName, subEntityQuery] of entityQuery.attributeQuery.xToManyEntities) {
                for (let entity of data) {
                    // TODO 构造 context 查询关联实体的 ids，用来限制查找的范围。
                    const ids = await this.findRelatedEntityIds(subEntityQuery.entityName, entity.id, fieldName)
                    const relatedEntityQuery = subEntityQuery.derive({
                        matchExpression: subEntityQuery.matchExpression.and({
                            key: 'id',
                            value: ['in', ids]
                        })
                    })

                    entity[fieldName] = await this.findEntities(relatedEntityQuery)
                }
            }
        }

        return data
    }
    async findRelatedEntityIds(entityName: string, entityId: string, fieldName: string) {
        return []
    }
    // stringifyFieldQuery(namePath: string[], attributeQuery: AttributeQuery ) {
    //
    //     const fields = attributeQuery.valueAttributes.map(attrName => `${this.getTableAlias(namePath)}.${attrName}`)
    //
    //     // TODO 这里没有处理获取关系表上字段的问题
    //     attributeQuery.xToOneEntities.forEach(({ name, attributeQuery: relatedEntityAttributeQuery}) => {
    //         // 这里会产生递归
    //         fields.push(...this.stringifyFieldQuery(namePath.concat(name), relatedEntityAttributeQuery))
    //     })
    // }
    getJoinTables(queryTree: EntityQueryTree, context: string[] = [], lastTableAndAlias?: [string, string]) :JoinTables {
        // 应该是深度 遍历？
        const result = []
        if (!lastTableAndAlias) {
            lastTableAndAlias = this.map.getTableAndAlias([context[0]]).slice(0, 2) as [string, string]
        }
        Object.entries(queryTree).forEach(([entityAttributeName, subQueryTree]) => {
            const [currentTable, currentTableAlias, /*lastEntityData*/,relationTable, relationTableAlias, currentRelationData] = this.map.getTableAndAlias(context.concat(entityAttributeName))
            // 可能会出现和上一个路径一样的情况，因为合表了，实体表都合并了一定是三表合一。这种情况就不需要新的 join 了。
            // 注意，这里只要用 alias 判断就行了，因为 alias 用路径生成的，一定是唯一的。
            if ((currentTableAlias !== lastTableAndAlias![1])) {
                // 剩下都是没有 三表合一 的情况
                const [lastTable] = lastTableAndAlias
                // FIXME 这里这个判断补眼睛，因为 attribute 不管是 source 还是 target name 确实可能相同
                const isCurrentRelationSource = currentRelationData.sourceAttribute === entityAttributeName

                // CAUTION 注意这里有些非常隐性的逻辑关联，关系表要合并的话永远只会往 n 或者 1:1 中往任意方向合并，所以下面通过实际的合并情况判断，实际也要和 n 关系吻合。
                if (relationTable === lastTable) {
                    // 关系表在上一张表中。
                    result.push({
                        for: context.concat(entityAttributeName),
                        joinSource: lastTableAndAlias,
                        joinIdField: [isCurrentRelationSource ? currentRelationData.sourceField : currentRelationData.targetField, 'id'],
                        joinTarget: [currentTable, currentTableAlias]
                    })

                } else if (relationTable === currentTable) {
                    // 关系表合并到 current 表中
                    result.push({
                        for: context.concat(entityAttributeName),
                        joinSource: lastTableAndAlias,
                        // 这里要找当前实体中用什么 attributeName 指向上一个实体
                        joinIdField: ['id', isCurrentRelationSource ? currentRelationData.targetField : currentRelationData.sourceField],
                        joinTarget: [currentTable, currentTableAlias]
                    })
                } else {
                    // 三表独立
                    result.push({
                        for: context.concat(entityAttributeName),
                        joinSource: lastTableAndAlias,
                        joinIdField: ['id', isCurrentRelationSource ? currentRelationData.sourceField : currentRelationData.targetField],
                        joinTarget: [relationTable, relationTableAlias]
                    })

                    result.push({
                        for: context.concat(entityAttributeName),
                        joinSource: [relationTable, relationTableAlias],
                        joinIdField: [isCurrentRelationSource ? currentRelationData.targetField : currentRelationData.sourceField, 'id'],
                        joinTarget: [currentTable, currentTableAlias]
                    })
                }

            }
            result.push(...this.getJoinTables(subQueryTree, context.concat(entityAttributeName), [currentTable!, currentTableAlias!]))
        })

        return result
    }
    withPrefix(prefix ='') {
        return prefix? `${prefix}___` : ''
    }
    buildSelectClause(queryFields: ReturnType<typeof AttributeQuery["getQueryFields"]>, prefix=''){
        if (!queryFields.length) return '1'
        // CAUTION 所有 entity 都要 select id
        return queryFields.map(({tableAliasAndField, attribute, nameContext}) => (
            `${this.withPrefix(prefix)}${tableAliasAndField[0]}.${tableAliasAndField[1]} AS \`${this.withPrefix(prefix)}${nameContext.join(".")}.${attribute}\``
        )).join(',\n')
    }
    buildFromClause(entityName: string, prefix='') {
        return `${this.map.getEntityTable(entityName)} as ${this.withPrefix(prefix)}${entityName}`
    }
    buildJoinClause(joinTables: JoinTables, prefix='') {
        return joinTables.map(({ joinSource, joinIdField, joinTarget}) => {
            return `JOIN ${joinTarget[0]} as 
${this.withPrefix(prefix)}${joinTarget[1]} ON 
${this.withPrefix(prefix)}${joinSource[1]}.${joinIdField[0]} = ${this.withPrefix(prefix)}${joinTarget[1]}.${joinIdField[1]}
`
        }).join('\n')
    }
    buildWhereClause(fieldMatchExp: BoolExpression<FieldMatchAtom>|null, prefix='') {
        if (!fieldMatchExp) return '1=1'

        if (fieldMatchExp.isAtom()) {
            return fieldMatchExp.data.isInnerQuery ? fieldMatchExp.data.fieldValue : `${this.withPrefix(prefix)}${fieldMatchExp.data.fieldName![0]}.${fieldMatchExp.data.fieldName![1]} ${fieldMatchExp.data.fieldValue}`
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

                const existEntityQuery = EntityQuery.create(info.entityName, this.map, {
                        entityName: info.entityName,
                        matchExpression: BoolExpression.createFromAtom({
                            key: `${reverseAttributeName}.id`,
                            value: ['=', `${parentAlias}.id`]
                        }).and(exp.data.value[1] instanceof BoolExpression ? exp.data.value[1] : MatchExpression.createFromAtom(exp.data.value[1]))
                    } as EntityQueryData,
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

    async insertEntityData(entityName: string, sameTableFieldAndValues: [string, string][] ): Promise<EntityIdRef> {

        const values = sameTableFieldAndValues.map(x => JSON.stringify(x[1]))
        const columns = sameTableFieldAndValues.map(x => JSON.stringify(x[0]))

        return this.database.insert(`
INSERT INTO ${this.map.getEntityTable(entityName)}
(${columns.join(',')})
VALUES
(${values.join(',')}) 
`) as EntityIdRef
    }

    // 还少判断了关系表是往
    async createEntity(entityName: string, newEntityData: NewEntityData ) : Promise<EntityIdRef>{
        if (newEntityData.isRef()) return Promise.resolve(newEntityData.rawData as EntityIdRef)

        const entityTable = this.map.getEntityTable(entityName)
        // 1. 先把同一表中的数据全部拿出来
        const sameTableFieldAndValuesWithRelation = [...newEntityData.sameTableFieldAndValues]

        // 2. 优先递归处理 related entity。关键是
        const relatedNewEntities = []
        const sameTableRelatedEntityName = []
        for(let newRelatedEntityData of newEntityData.relatedEntitiesData) {
            // 这里只处理没有三表合并的场景。因为三表合并的数据在 sameTableFieldAndValues 已经有了
            if (entityTable !== newRelatedEntityData.info!.table) {
                const relatedEntityRef = await this.createEntity(newRelatedEntityData.info!.entityName, newRelatedEntityData)

                // 判断关系表。如果和实体表合表了，那么数据就直接扔到 sameTableFieldAndValuesWithRelation 等待一起创建。如果没有，后面还要单独处理关系表
                const relationTable = this.map.getRelationTable(entityName, newRelatedEntityData.info!.attributeName)
                if (relationTable === entityTable) {
                    // 关系表和实体表合并了
                    assert(!!newRelatedEntityData.info!.field, `cannot find field ${newRelatedEntityData.info?.attributeName}`)
                    sameTableFieldAndValuesWithRelation.push([newRelatedEntityData.info!.field, relatedEntityRef.id])
                } else {
                    // 没合并，后面还要单独处理关系表
                    relatedNewEntities.push({
                        attributeInfo: newRelatedEntityData.info,
                        entity:relatedEntityRef
                    })
                }
            } else {
                sameTableRelatedEntityName.push(newRelatedEntityData.info?.attributeName)
            }
        }

        const newEntity = await this.insertEntityData(entityName, sameTableFieldAndValuesWithRelation)

        // 需要单独处理的关系
        for(let relatedNewEntity of relatedNewEntities) {
            await this.addRelation(entityName, relatedNewEntity.attributeInfo?.attributeName, newEntity.id, relatedNewEntity.entity.id)
            if (relatedNewEntity.attributeInfo.isXToOne) {
                newEntity[relatedNewEntity.attributeInfo?.attributeName] = { id: relatedNewEntity.entity.id}
            } else {
                newEntity[relatedNewEntity.attributeInfo?.attributeName] = [{id: relatedNewEntity.entity.id}]
            }
        }

        // 1:1 的 relatedEntity 的id 就是自身
        sameTableRelatedEntityName.forEach(name => {
            newEntity[name] = { id: newEntity.id }
        })

        return Promise.resolve(newEntity)
    }
    addRelation(entity: string, attribute:string, entityId, relatedEntityId, attributes: {} = {}) {
        const relationData = this.map.getRelationInfoData(entity, attribute)
        const isEntitySource = relationData.sourceEntity === entity

        const sourceId = isEntitySource? entityId : relatedEntityId
        const targetId = isEntitySource? relatedEntityId: entityId

        if( relationData.mergedTo ) {

            const isMergeToSource = relationData.mergedTo === 'source'
            const rowId = isMergeToSource ? sourceId: targetId
            const relatedId = isMergeToSource ? targetId : sourceId

            const relatedField = isMergeToSource ? relationData.sourceField : relationData.targetField
            const attributePairs = Object.entries(attributes)
            const keyValuePairs = [
                [relatedField, relatedId],
                ...attributePairs
            ]

            console.log(111, keyValuePairs, relationData, isEntitySource, entity, attribute)

            return this.query(`
UPDATE ${relationData.table}
SET
${keyValuePairs.map(([k,v]) => `
${k} = ${JSON.stringify(v)}
`).join(',')}
WHERE
id = ${rowId}
`)

        } else {
            const attributeValues = Object.values(attributes)
            const attributeKeys = Object.keys(attributes).map(k => relationData.attributes[k].field)


            return this.query(`
INSERT INTO ${relationData.table}
(${[relationData.sourceField, relationData.targetField].concat(attributeKeys).join(',')})
VALUES
(${[sourceId, targetId].concat(attributeValues).map(v => JSON.stringify(v)).join(',')})
`)
        }

    }
    async query(sql: string) {
        return this.database.query(sql)
    }

}


type RawEntityData = {[k:string]: any}


class NewEntityData {
    sameTableFieldAndValues: [string, string][]
    relatedEntitiesData: NewEntityData[]
    constructor(public map: EntityToTableMap, public entityName: string, public rawData: RawEntityData, public info?: AttributeInfo) {
        const currentEntityTable = this.map.getEntityTable(entityName)
        const [valueAttributesInfo, entityAttributesInfo] = this.map.groupAttributes(entityName, Object.keys(rawData))

        // TODO 要把那些独立出去的 field 排除出去。
        this.sameTableFieldAndValues = valueAttributesInfo.map(info => [info.field, rawData[info.attributeName]])

        this.relatedEntitiesData = entityAttributesInfo.map(info => new NewEntityData(this.map, info.entityName, rawData[info.attributeName], info))

        this.relatedEntitiesData.forEach(newRelatedEntityData => {
            if (newRelatedEntityData.info!.table === currentEntityTable) {
                this.sameTableFieldAndValues.push(...newRelatedEntityData.sameTableFieldAndValues)
            }
        })
    }
    isRef() {
        return this.info?.isEntity && this.rawData["id"] !== undefined
    }
}



export class EntityQueryHandle {
    agent: QueryAgent

    constructor(public map: EntityToTableMap, public database) {
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
        const entityQuery = EntityQuery.create(
            entityName,
            this.map,
            {
                matchExpression: matchExpressionData,
                attributeQuery: attributeQueryData,
                modifier: modifierData
            }
        )

        return this.agent.findEntities(entityQuery)
    }

    async create(entityName: string, rawData: RawEntityData ) : Promise<EntityIdRef>{
        const newEntityData = new NewEntityData(this.map, entityName, rawData)
        return this.agent.createEntity(entityName, newEntityData)
    }

    async update() {

    }

    async addRelation(sourceEntity: EntityIdRef, relationName: string, targetEntity: EntityIdRef) {
        return Promise.resolve()
    }

    async createOrUpdate() {

    }

    async delete() {

    }

    async count() {

    }

    async hasRelation() {

    }


}





export class RelationQueryHandle {
    findRelation() {

    }

    createRelation() {

    }

    updateRelation() {

    }

    updateOrCreateRelation() {

    }

    deleteRelation() {

    }

    countRelation() {

    }
}