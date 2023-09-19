import {EntityToTableMap} from "./EntityToTableMap";
import {assert, deepMerge, mapTree, setByPath} from "../util";
import {BoolExpression, BoolExpressionNodeTypes} from "../../types/boolExpression";


type Database = {
    query: (sql: string) => Promise<any[]>
}

// TODO 需要能指定  atom 的类型
export type MatchExpressionData = BoolExpression


export class MatchExpression {
    public entityQueryTree: EntityQueryTree = {}
    constructor(public entityName: string, public map: EntityToTableMap, public data?: MatchExpressionData, public contextRootEntity?: string) {
        this.entityQueryTree = {}
        if (this.data) {
            this.buildEntityQueryTree(this.data, this.entityQueryTree)
        }
    }
    buildEntityQueryTree(data: MatchExpressionData, entityQueryTree: EntityQueryTree) {
        if (data.type === BoolExpressionNodeTypes.group) {
            if (data.left) {
                this.buildEntityQueryTree(data.left, entityQueryTree)
            }

            if (data.right) {
                this.buildEntityQueryTree(data.right, entityQueryTree)
            }
        } else {
            // variable
            const matchAttributePath = (data.key as string).split('.')
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
            fieldValue = `${value[0]} ${isReferenceValue ? this.getReferenceFieldValue(value[1]) : value[1]}`
        } else if(value[0].toLowerCase() === 'in') {
            assert(!isReferenceValue, 'reference value cannot use IN to match')
            fieldValue = `IN [${value[1].join(',')}]`
        } else if(value[0].toLowerCase() === 'between') {
            fieldValue = `BETWEEN ${isReferenceValue ? this.getReferenceFieldValue(value[1][0]) : value[1][0]} AND ${isReferenceValue ? this.getReferenceFieldValue(value[1][1]) : value[1][1]}]`
        } else {
            assert(false, `unknown value expression ${exp.value}`)
        }

        return fieldValue

    }

    buildFieldMatchExpression() : BoolExpression|null {
        if (!this.data) return null
        // 1. 所有 key 要 build 成 field
        // 2. x:n 关系中的 EXIST 要增加查询范围限制，要把 value 中对上层引用也 build 成 field。
        return mapTree(this.data, ['left', 'right'], (exp: BoolExpression) => {
            if (exp.type === BoolExpressionNodeTypes.group) {
                return {...exp}
            } else {
                const matchAttributePath = (exp.key as string).split('.')
                const attributeInfo = this.map.getInfoByPath([this.entityName].concat(matchAttributePath))

                // 如果结尾是 value
                // 如果极为是 entity，那么后面匹配条件目前只能支持 EXIST。
                //  CAUTION 针对关联实体的属性匹配，到这里已经被拍平了，所以结尾是  entity 的情况必定都是函数匹配。

                if (attributeInfo.isValue) {
                    return {
                        ...exp,
                        fieldName: this.getFinalFieldName(matchAttributePath),
                        fieldValue: this.getFinalFieldValue(exp.isReferenceValue, exp.value)
                    }
                } else {
                    // entity
                    const namePath = [this.entityName].concat(matchAttributePath)
                    const [,tableAlias] = this.map.getTableAndAlias(namePath)

                    // CAUTION 函数匹配的情况不管了，因为可能未来涉及到使用 cursor 实现更强的功能，这就涉及到查询计划的修改了。统统扔到上层去做。
                    //  注意，子查询中也可能对上层的引用，这个也放到上层好像能力有点重叠了。
                    return {
                        ...exp,
                        namePath,
                        isFunctionMatch: true,
                        tableAlias
                    }
                }
            }
        })

    }

    and(condition): MatchExpression {
        return new MatchExpression(this.entityName, this.map, this.data ? {
            type: BoolExpressionNodeTypes.group,
            op: '&&',
            left: condition,
            right: this.data
        } : condition)
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
    getQueryFields (nameContext = [this.entityName]): [string, string][] {
        const queryFields = this.valueAttributes.map(attributeName => this.map.getTableAliasAndFieldName(nameContext, attributeName))

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


    // FIXME 需要增加 prefix，因为自己可能是个 子查询。这意味这下面的所有语句都要增加 prefix。
    buildFindQuery(entityQuery: EntityQuery, prefix='') {
        // 2. 从所有条件里面构建出 join clause
        const fieldQueryTree = entityQuery.attributeQuery!.entityQueryTree
        const matchQueryTree = entityQuery.matchExpression.entityQueryTree
        const finalQueryTree = deepMerge(fieldQueryTree, matchQueryTree)

        const joinTables = this.getJoinTables(finalQueryTree, [entityQuery.entityName])
        return `
SELECT ${prefix ? '' : 'DISTINCT'}
${this.buildSelectClause(entityQuery.attributeQuery.getQueryFields(), prefix)}

FROM
${this.buildFromClause(entityQuery.entityName, prefix)}

${this.buildJoinClause(joinTables, prefix)}

WHERE
${this.buildWhereClause( 
    this.parseMatchExpressionValue(entityQuery.entityName, entityQuery.matchExpression.buildFieldMatchExpression(), entityQuery.contextRootEntity),
    prefix
)}        
`
        // FIXME modifier
    }
    async findEntities(entityQuery:EntityQuery) {
        // 1. 这里只通过合表或者 join  处理了 x:1 的关联查询。x:n 的查询是通过二次查询获取的。
        const data = await this.query(this.buildFindQuery(entityQuery))
        // 2. TODO 关联数据的结构化

        // 3. x:n 关联实体的查询
        if (entityQuery.attributeQuery!.xToManyEntities) {
            for (let {fieldName, entityQuery} of entityQuery.attributeQuery.xToManyEntities) {
                for (let entity of data) {
                    // TODO 构造 context 查询关联实体的 ids，用来限制查找的范围。
                    const ids = await this.findRelatedEntityIds(entityQuery.entityName, entity.id, fieldName)
                    const relatedEntityQuery = entityQuery.derive({
                        matchExpression: entityQuery.matchExpression.and({
                            type: BoolExpressionNodeTypes.variable,
                            name: 'id',
                            key: 'id',
                            value: ['in', ids]
                        })
                    })

                    entity[fieldName] = await this.findEntities(relatedEntityQuery)
                }
            }
        }

        return
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
    buildSelectClause(queryFields: [string, string][], prefix=''){
        if (!queryFields.length) return '1'

        return queryFields.map((queryField) => (
            `${this.withPrefix(prefix)}${queryField[0]}.${queryField[1]} AS \`${this.withPrefix(prefix)}${queryField[0]}.${queryField[1]}\``
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
    buildWhereClause(fieldMatchExp: BoolExpression|null, prefix='') {
        if (!fieldMatchExp) return '1=1'

        if (fieldMatchExp.type === BoolExpressionNodeTypes.variable) {
            return fieldMatchExp.isInnerQuery ? fieldMatchExp.fieldValue : `${this.withPrefix(prefix)}${fieldMatchExp.fieldName[0]}.${fieldMatchExp.fieldName[1]} ${fieldMatchExp.fieldValue}`
        } else {
            if (fieldMatchExp.op === '&&') {
                return `(${this.buildWhereClause(fieldMatchExp.left, prefix)} AND ${this.buildWhereClause(fieldMatchExp.right, prefix)})`
            } else  if (fieldMatchExp.op === '||') {
                return `(${this.buildWhereClause(fieldMatchExp.left, prefix)} OR ${this.buildWhereClause(fieldMatchExp.right, prefix)})`
            } else {
                return `NOT (${this.buildWhereClause(fieldMatchExp.left, prefix)})`
            }
        }

    }
    parseMatchExpressionValue(entityName: string, fieldMatchExp: BoolExpression|null, contextRootEntity? :string) {
        if (!fieldMatchExp) return null

        return mapTree(fieldMatchExp, ['left', 'right'], (exp: BoolExpression, context:string[]) => {
            if (exp.type === BoolExpressionNodeTypes.group) {
                return {
                    ...exp
                }
            } else {
                assert(Array.isArray(exp.value), `match value is not a array ${context.join('.')}`)
                if (exp.isFunctionMatch) {
                    assert(exp.value[0].toLowerCase() === 'exist', `we only support Exist function match on entity for now. yours: ${exp.value[0]}`)

                    const info = this.map.getInfoByPath(exp.namePath)
                    const [, currentAlias] = this.map.getTableAndAlias(exp.namePath)
                    const [, parentAlias] = this.map.getTableAndAlias(exp.namePath.slice(0, -1))
                    const reverseAttributeName = this.map.getReverseAttribute(info.parentEntityName, info.attributeName)


                    const existEntityQuery = EntityQuery.create(info.entityName, this.map, {
                        entityName: info.entityName,
                        matchExpression: {
                            type: BoolExpressionNodeTypes.group,
                            op: '&&',
                            left: {
                                type: BoolExpressionNodeTypes.variable,
                                name: reverseAttributeName,
                                key: `${reverseAttributeName}.id`,
                                value: ['=', `${parentAlias}.id`]
                            },
                            right: exp.value[1]
                        }
                    } as EntityQueryData,
                        // 如果上层还有，就继承上层的，如果没有， context 就只这一层。这个变量是用来给 matchExpression 里面的 value 来引用上层的值的。
                        //  例如查询用户，要求他存在一个朋友的父母的年龄是小于这个用户。对朋友的父母的年龄匹配中，就需要引用最上层的 alias。
                        contextRootEntity||entityName
                    )

                    return {
                        ...exp,
                        isInnerQuery: true,
                        fieldValue: `
EXISTS (
${this.buildFindQuery(existEntityQuery, currentAlias)}
)
`
                    }
                } else {
                    return exp
                }
            }
        })
    }

    stringifyJoinTables() {

    }

    stringifyMatchExpression() {

    }

    stringifyModifier() {

    }

    isRelatedEntityXToOne(entityName: string, fieldName: string) {
        return true
    }
    async query(sql: string) {
        return Promise.resolve()
    }
    getTableAlias(namePath: string[]) {
        // TODO 在这里考虑合表以后得 table alias 的问题。
        return namePath.join('_')
    }
}




export class EntityQueryHandle {
    agent: QueryAgent

    constructor(public map: EntityToTableMap, public database) {
        this.agent = new QueryAgent(map, database)
    }

    async findOne(entityName: string, matchExpression: MatchExpressionData, modifier: ModifierData, attributeQuery: AttributeQueryData, context: QueryContext) {
        const limitedModifier = {
            ...modifier,
            limit: 1
        }

        return (await this.find(entityName, matchExpression, limitedModifier, attributeQuery))[0]
    }

    async find(entityName: string, matchExpressionData: MatchExpressionData, modifierData: ModifierData, attributeQueryData: AttributeQueryData) {
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

    create() {

    }

    update() {

    }

    updateOrCreate() {

    }

    delete() {

    }

    count() {

    }

    hasRelation() {

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