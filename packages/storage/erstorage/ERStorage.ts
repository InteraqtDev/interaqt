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

type AttributeQueryDataItem = string|[string, EntityQueryData]

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

    async insertRecordData(recordName: string, newEntityData: NewEntityData ): Promise<EntityIdRef> {
        const newId = await this.database.getAutoId(recordName)
        const newEntityDataWithId = newEntityData.merge({id: newId})

        const values = newEntityDataWithId.sameRowFieldAndValues.map(x => JSON.stringify(x[1]))
        const columns = newEntityDataWithId.sameRowFieldAndValues.map(x => JSON.stringify(x[0]))

        let result

        if (!newEntityData.sameRowEntityIds.length) {
            result =  await this.database.insert(`
INSERT INTO ${this.map.getRecordTable(recordName)}
(${columns.join(',')})
VALUES
(${values.join(',')}) 
`) as EntityIdRef


        } else {

            result = (await this.database.update(`
UPDATE ${this.map.getRecordTable(recordName)}
SET
${columns.map((column, index) => (`
${column} = ${values[index]}
`)).join(',')
}
 
WHERE
${newEntityData.sameRowEntityIds.map(({field, id}) => `
${field} = ${id}
`).join('AND')}
`))[0] as EntityIdRef
        }

        result.id = newId
        return result
    }


    async createRecord(entityName: string, newEntityData: NewEntityData ) : Promise<EntityIdRef>{
        if (newEntityData.isRef()) return Promise.resolve(newEntityData.rawData as EntityIdRef)



        // 2. 优先递归处理 related entity。如果是要创建的就创建。
        const differentTableRelatedNewEntities: NewEntityData[] = []
        for(let newRelatedEntityData of newEntityData.differentTableEntitiesData) {
            // 这里全都是其他表中的数据，如果不是 ref 就要创建。
            const relatedEntityRef = newRelatedEntityData.isRef() ?
                newRelatedEntityData.getRef() :
                await this.createRecord(newRelatedEntityData.info!.entityName, newRelatedEntityData)

            // 这里肯定要处理关系表，因为唯一不要处理关系表的情况是"数据是 ref，并且关系表合到了实体表里面"，在上面 sameRow 里面已经处理过了。
            differentTableRelatedNewEntities.push(newRelatedEntityData.derive(relatedEntityRef))
        }


        const newEntity = await this.insertRecordData(entityName, newEntityData)

        // 需要单独处理的关系
        for(let relatedNewEntity of differentTableRelatedNewEntities) {
            await this.addLinkFromRecord(entityName, relatedNewEntity.info!.attributeName, newEntity.id, relatedNewEntity.getRef().id)
            if (relatedNewEntity.info!.isXToOne) {
                newEntity[relatedNewEntity.info!.attributeName] = { id: relatedNewEntity.getRef().id}
            } else {
                newEntity[relatedNewEntity.info!.attributeName] = [{id: relatedNewEntity.getRef().id}]
            }
        }

        // 1:1 的 relatedEntity 的id 就是自身。这里也返还一下。
        newEntityData.sameRowEntityAttributes.forEach(name => {
            newEntity[name] = { id: newEntity.id }
        })

        return Promise.resolve(newEntity)
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
        const columnAndValue = newEntityData.sameRowFieldAndValues.map(([field, value]) => (
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
                finalRelatedEntityRef = await this.createRecord(newRelatedEntityData.info!.entityName!, newRelatedEntityData)
            }

            for(let updatedEntity of updatedEntities) {
                await this.addLinkFromRecord(entityName, newRelatedEntityData.info?.attributeName!, updatedEntity.id, finalRelatedEntityRef.id)
            }
        }

        return updatedEntities

    }
    // TODO
    deleteRecord() {
        // TODO 连带删除关系？
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
    public sameRowFieldAndValues: [string, string][]
    public relatedEntitiesData: NewEntityData[]
    public differentTableEntitiesData: NewEntityData[] = []
    public valueAttributes: [string, any][]
    public sameRowEntityAttributes: string[] = []
    // 如果是 data 里面有 ref,并且和当前表是合一的，说明我们的需要的 row 已经有了，只要  update 相应 column 就行了
    public sameRowEntityIds: {field:string, id:string}[] = []
    constructor(public map: EntityToTableMap, public entityName: string, public rawData: RawEntityData, public info?: AttributeInfo) {
        const [valueAttributesInfo, entityAttributesInfo] = this.map.groupAttributes(entityName, Object.keys(rawData))
        this.relatedEntitiesData = entityAttributesInfo.map(info => new NewEntityData(this.map, info.entityName, rawData[info.attributeName], info))

        this.valueAttributes = valueAttributesInfo.map(info => {
            return [info.attributeName!, rawData[info.attributeName]]
        })
        // TODO 要把那些独立出去的 field 排除出去。
        this.sameRowFieldAndValues = valueAttributesInfo.map(info => [info.field, rawData[info.attributeName]])
        this.relatedEntitiesData.forEach(newRelatedEntityData => {
            // CAUTION 三表合一的情况（需要排除掉关系的 source、target 是同一实体的情况，这种情况下不算合表）
            if (newRelatedEntityData.info!.isMergedWithParent()) {
                if(newRelatedEntityData.isRef()) {
                    this.sameRowEntityIds.push({
                        field: newRelatedEntityData.info!.field,
                        id: newRelatedEntityData.getRef().id
                    })
                } else {
                    this.sameRowFieldAndValues.push(...newRelatedEntityData.sameRowFieldAndValues)
                }
                this.sameRowEntityAttributes.push(newRelatedEntityData.info?.attributeName!)
            } else {
                // 只是关系表合并到了当前实体表，并且数据又是个 ref，那么只要把 ref id 记录到实体表中就行了
                if(newRelatedEntityData.isRef() && newRelatedEntityData.info!.field) {
                    this.sameRowFieldAndValues.push([newRelatedEntityData.info!.field, newRelatedEntityData.getRef().id])
                } else {
                    this.differentTableEntitiesData.push(newRelatedEntityData)
                }
            }
        })
    }
    derive(newRawData: RawEntityData) {
        return new NewEntityData(this.map, this.entityName, newRawData, this.info)
    }
    merge(partialNewRawData: RawEntityData) {
        return new NewEntityData(this.map, this.entityName, {...this.rawData, ...partialNewRawData }, this.info)
    }
    getRef() {
        return {id: this.rawData.id}
    }
    isRef() {
        return !!(this.info?.isRecord && this.rawData["id"] !== undefined)
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
        return this.agent.createRecord(entityName, newEntityData)
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

