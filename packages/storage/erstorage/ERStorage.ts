import {EntityToTableMap} from "./EntityToTableMap";
import {assert, setByPath} from "../util";
import {BoolExpression, BoolExpressionNodeTypes} from "../../types/boolExpression";


type Database = {
    query: (sql: string) => Promise<any[]>
}

// TODO 需要能指定  atom 的类型
type MatchExpressionData = BoolExpression


class MatchExpression {
    public entityQueryTree: EntityQueryTree = {}
    constructor(public entityName: string, public map: EntityToTableMap, public data: MatchExpressionData) {
        this.entityQueryTree = {}
        this.buildEntityQueryTree(this.data, this.entityQueryTree)
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
            if (attributeInfo.isEntity) {
                setByPath(entityQueryTree, matchAttributePath, {})
            } else {
                // 最后一个是 attribute，所以不在 entityQueryTree 上。
                setByPath(entityQueryTree, matchAttributePath.slice(0, matchAttributePath.length -1), {})
            }
        }
    }
    and(condition): MatchExpression {
        // TODO
        return new MatchExpression(this.entityName, this.map, {...this.data, ...condition})
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

class EntityQuery {
    static create(entityName: string, map: EntityToTableMap, data: EntityQueryData) {
        return new EntityQuery(
            entityName,
            map,
            new MatchExpression(entityName, map, data.matchExpression),
            new AttributeQuery(entityName, map, data.attributeQuery),
            new Modifier(entityName, map, data.modifier)
        )
    }
    constructor(public entityName, public map: EntityToTableMap, public matchExpression?: MatchExpression, public attributeQuery?: AttributeQuery, public modifier?: Modifier) {}
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
    constructor(public entityName: string, public map: EntityToTableMap, public data: AttributeQueryData) {
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
    getQueryFields (nameContext = [this.entityName]) {
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
    isRelationSource: boolean
    lastEntityTable: [string, string]
    relationTable: [string, string]
    entityTable: [string, string]
}[]

export class QueryAgent {
    constructor(public map: EntityToTableMap, public database: Database) {}
    buildFindQuery(entityQuery: EntityQuery) {
        // 2. 从所有条件里面构建出 join clause
        // const joinTables = this.getJoinTables(matchExpression, modifier, attributeQuery)
        // const joinTables = this.getJoinTables(entityQuery.attributeQuery.entityQueryTree)
        // 3. 构建 match expression

        // 4. 构建 modifier
        return ''

//         return `
// SELECT
// // ${this.stringifyFieldQuery([entityName], attributeQuery)}
// // ${this.stringifyJoinTables(joinTables)}
// ${this.stringifyMatchExpression(matchExpression)}
// ${this.stringifyModifier(modifier)}
// `
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
                        matchExpression: entityQuery.matchExpression.and('id', 'in', ids)
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
                const isCurrentRelationSource = currentRelationData.sourceAttribute === entityAttributeName

                // CAUTION 注意这里有些非常隐性的逻辑关联，关系表要合并的话永远只会往 n 或者 1:1 中往任意方向合并，所以下面通过实际的合并情况判断，实际也要和 n 关系吻合。
                if (relationTable === lastTable) {
                    result.push({
                        for: context.concat(entityAttributeName),
                        joinSource: lastTableAndAlias,
                        joinIdField: [entityAttributeName, 'id'],
                        joinTarget: [currentTable, currentTableAlias]
                    })

                } else if (relationTable === currentTable) {
                    // 关系表合并到 current 表中
                    result.push({
                        for: context.concat(entityAttributeName),
                        joinSource: lastTableAndAlias,
                        // 这里要找当前实体中用什么 attributeName 指向上一个实体
                        joinIdField: ['id', isCurrentRelationSource ? currentRelationData.targetAttribute : entityAttributeName],
                        joinTarget: [currentTable, currentTableAlias]
                    })
                } else {
                    // 三表独立
                    result.push({
                        for: context.concat(entityAttributeName),
                        joinSource: lastTableAndAlias,
                        joinIdField: ['id', isCurrentRelationSource ? '$source' : '$target'],
                        joinTarget: [relationTable, relationTableAlias]
                    })

                    result.push({
                        for: context.concat(entityAttributeName),
                        joinSource: [relationTable, relationTableAlias],
                        joinIdField: [isCurrentRelationSource ? '$target' : '$source', 'id'],
                        joinTarget: [currentTable, currentTableAlias]
                    })
                }

                // console.log(lastTableAlias, currentTableAlias, relationTableAlias)
            }
            result.push(...this.getJoinTables(subQueryTree, context.concat(entityAttributeName), [currentTable!, currentTableAlias!]))
        })

        return result
    }
    buildJoinExpression(joinTables: JoinTables) {
        return joinTables.map(({currentRelationData, lastEntityTable, relationTable, entityTable}) => {
            // TODO

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