import { assert } from "../utils.js";
import { AttributeInfo } from "./AttributeInfo.js";
import { RecordInfo } from "./RecordInfo.js";
import { LinkInfo } from "./LinkInfo.js";
import { LINK_SYMBOL } from "./RecordQuery.js";
import { MatchExpressionData } from "./MatchExp.js";


export type ValueAttribute = {
    name: string,
    //entityType
    type: string,
    collection?: boolean,

    // 没有的话就继承上面的
    table?: string,
    field: string,
    // 数据库字段类型
    fieldType?: string,
    computed?: (record: any) => any,
    defaultValue?: (record: any, recordName: string) => any
}



export type RecordAttribute = {
    type: 'id',
    isRecord: true,
    linkName: string,
    attributeName: string,
    // 下面三个是为了方便读取的缓存字段
    isSource? : boolean,
    relType: ['1'|'n', '1'|'n'],
    recordName: string,
    // 这个 field 是指如果合表了，那么它在实体表里面的名字。
    //  这个是从 EntityMapItemData 的 sourceField 或者 targetField 复制过来的。
    table?: string,
    field? : string
    // 当attribute是 target，并且关系上有 targetIsReliance 时为 true
    isReliance? : boolean
    // filtered relation 相关
    isFilteredRelation?: boolean,
    matchExpression?: any
    baseRelationAttributeName?: string,
    resolvedMatchExpression?: MatchExpressionData,
    resolvedBaseRecordName?: string
}

export type RecordMapItem = {
    // id 所在的 table。不一定有 fields 也在，fields 可能会因为各种优化拆出去。
    table: string,
    attributes: {
        [k:string]: ValueAttribute|RecordAttribute
    }
    isRelation? :boolean,
    // filtered entity 相关
    isFilteredEntity?: boolean,
    baseRecordName? : string,
    matchExpression?: MatchExpressionData,
    resolvedBaseRecordName?: string,
    resolvedMatchExpression?: MatchExpressionData,
    filteredBy? : string[],
    // filtered relation 相关
    isFilteredRelation?: boolean,
    baseRelationName?: string
}

type RecordMap = {
    [k:string]: RecordMapItem
}

export type LinkMapItem = {
    relType: [string, string]
    sourceRecord: string,
    sourceProperty: string,
    targetRecord: string,
    targetProperty: string|undefined,
    // 用来判断这个 relation 是不是 virtual 的，是的话为 true.
    isSourceRelation?: boolean,
    // 这个 link 是否有个对应的 record. 当这个 link 是根据 Relation 创建的时候就有这个。
    //  它等同于 isSourceRelation 为 true 时 sourceRecord
    recordName?: string,
    mergedTo? : 'source'|'target'|'combined',
    table?: string,
    // CAUTION 特别注意，这里的 sourceField 和 targetField 和 sourceProperty 一样，是指站在 source 的角度去看，存的是关联实体(target)的 id. 不要搞成了自己的 id 。
    //  当发生表合并时，他们表示的是在合并的表里面的 field。根据往合并情况不同，sourceField/targetField 都可能不存在。
    sourceField?: string,
    targetField?: string,
    // 连接两个生命周期依赖的实体的，只能 target 依赖 source。
    isTargetReliance?: boolean
    // filtered relation 相关
    isFilteredRelation?: boolean,
    matchExpression?: any
    baseLinkName?: string,
    resolvedBaseRecordName?: string,
    resolvedMatchExpression?: MatchExpressionData
}

type LinkMap = {
    [k:string]: LinkMapItem
}

export type MapData = {
    records: RecordMap
    links: LinkMap
}

type TableAndAliasStack = {
    table:string,
    alias: string,
    record: RecordMapItem,
    isLinkRecord: boolean,
    linkTable?:string,
    linkAlias?:string,
    link?: LinkMapItem,
    path: string[]
}[]

export class EntityToTableMap {
    constructor(public data: MapData) {}
    getRecord(recordName:string) {
        return this.data.records[recordName]
    }
    getAttributeAndSymmetricDirection(rawAttributeName:string): [string, 'source'|'target'|undefined] {
        return rawAttributeName.includes(':') ? rawAttributeName.split(':') as [string, 'source'|'target'] : [rawAttributeName, undefined]
    }
    getAttributeData(recordName:string, attributeName: string) {
        return this.data.records[recordName].attributes[this.getAttributeAndSymmetricDirection(attributeName)[0]]
    }
    getRecordInfo(recordName:string) {
        return new RecordInfo(recordName, this)
    }
    getInfo(entityName: string, attribute: string) : AttributeInfo{
        const result = this.getInfoByPath([entityName, ...(attribute.split('.'))])

        assert(!!result,
            `cannot find attribute "${attribute}" in "${entityName}". attributes: ${this.data.records[entityName] && Object.keys(this.data.records[entityName]?.attributes)}`
        )
        return result!
    }
    getLinkInfo(recordName: string, rawAttribute: string) {
        const attribute = this.getAttributeAndSymmetricDirection(rawAttribute)[0]
        const {linkName, isSource} = (this.data.records[recordName].attributes[attribute] as RecordAttribute)
        assert(!!linkName, `cannot find relation ${recordName} ${attribute}`)
        return new LinkInfo(linkName, this.data.links[linkName], this, !!isSource)
    }
    getLinkInfoByName(linkName: string) {
        assert(!!this.data.links[linkName], `cannot find link ${linkName}`)
        return new LinkInfo(linkName, this.data.links[linkName], this)
    }

    getInfoByPath(namePath: string[]): AttributeInfo|undefined {
        const [entityName, ...attributivePath] = namePath
        assert(this.data.records[entityName], `entity ${entityName} not found`)
        assert(attributivePath.length > 0, 'getInfoByPath should have a name path.')
        let currentEntity = entityName
        let parentEntity: string|undefined
        let lastAttribute: string|undefined
        let attributeData: ValueAttribute|RecordAttribute|undefined

        let rawCurrentAttribute:string
        let lastSymmetricDirection
        const stack = []
        while(rawCurrentAttribute = attributivePath.shift()!) {
            stack.push(rawCurrentAttribute)
            // 路径中可能有 symmetric 的方向
            const [currentAttribute, symmetricDirection] = this.getAttributeAndSymmetricDirection(rawCurrentAttribute)
            lastSymmetricDirection = symmetricDirection

            // 增加了 & 的影响
            if (currentAttribute === LINK_SYMBOL) {
                assert(!!parentEntity && !!lastAttribute, `reading link in wrong path ${stack.join('.')}`)
                parentEntity = (this.data.records[parentEntity!].attributes[lastAttribute!] as RecordAttribute).linkName
                lastAttribute = undefined
                currentEntity = (attributeData! as RecordAttribute).linkName
                attributeData = undefined
            } else {
                let data = this.data.records[currentEntity]
                // 递归查找根源实体
                while (data.isFilteredRelation || data.isFilteredEntity) {
                    if (data.isFilteredRelation) {
                        data = this.data.records[data.baseRelationName!]
                    } else if (data.isFilteredEntity) {
                        data = this.data.records[data.baseRecordName!]
                    }
                }
                attributeData = data!.attributes[currentAttribute!] as RecordAttribute
                assert(!!attributeData, `attribute ${currentAttribute} not found in ${currentEntity}. namePath: ${namePath.join('.')}`)
                parentEntity = currentEntity
                currentEntity = (attributeData as RecordAttribute).isRecord ? (attributeData as RecordAttribute).recordName : ''
                lastAttribute = currentAttribute
            }
        }

        if (!parentEntity || !lastAttribute) return undefined
        return new AttributeInfo( parentEntity!, lastAttribute!, this, lastSymmetricDirection!)
    }
    getTableAndAliasStack(namePath: string[]): TableAndAliasStack {
        const [rootEntityName, ...relationPath] = namePath
        let lastEntityData: RecordMapItem = this.data.records[rootEntityName]
        let lastTable:string = lastEntityData.table
        let lastTableAlias:string = rootEntityName

        let relationTable:string
        let relationTableAlias:string
        let isLinkRecord = false
        let info: AttributeInfo|undefined

        const result: TableAndAliasStack = [{
            // 最后一张表名
            table: lastTable,
            // 最后一张表 alias，
            alias: lastTableAlias,
            // 最后表代表的 entity 数据，
            record: lastEntityData,
            isLinkRecord,
            // 上一张表和最后一张表的关联表（如果是 relation 和  entity 的连接，这个link 就是虚拟的，table 是空，因为肯定是个合并的），
            // linkTable: relationTable,
            // 上一张表和最后一张表的关联表的 alias.
            // linkAlias: relationTableAlias,
            // link: currentLink,
            path: [rootEntityName]
        }]

        for(let i = 0; i<relationPath.length; i++) {
            // 对称关系要说明方向，不然  join 表的时候两个方向都用的同一个 alias，逻辑错误。它的格式是 'xxx:source' 或者 ‘xxx:target’
            const [currentAttributeName, symmetricDirection] = this.getAttributeAndSymmetricDirection(relationPath[i])

            const path = [rootEntityName, ...relationPath.slice(0, i+1)]
            // 如果是读 link 上的数据
            if (currentAttributeName === LINK_SYMBOL) {

                // 先把上一个 Pop 出来。
                const {linkTable, linkAlias, path} = result.pop()!
                assert(!isLinkRecord, `last attribute in path is a link, cannot read link of a link ${path.join('.')}`)
                lastTable = linkTable!
                lastTableAlias = linkAlias!
                lastEntityData = this.data.records[info!.linkName]
                isLinkRecord = true
                relationTable = ''
                relationTableAlias = ''
                info = undefined
            } else {
                info = this.getInfoByPath(path)!
                const currentEntityAttribute = lastEntityData.attributes[currentAttributeName!] as RecordAttribute
                assert(info.isRecord, `${relationPath.slice(0, i+1).join('.')} is not a entity attribute`)

                const currentEntityData = this.data.records[currentEntityAttribute.recordName] as RecordMapItem

                // 处理 symmetric 中的:
                const currentTableAlias = `${lastTableAlias}_${currentAttributeName}${symmetricDirection ? `_${symmetricDirection.toUpperCase()}` : ''}`

                // CAUTION 一定要先处理 linkAlias，因为依赖于上一次 tableAlias。
                if (info.isMergedWithParent() || info.isLinkMergedWithParent()) {
                    // 和上一个表同名。当前表也就是上一个
                    relationTableAlias = lastTableAlias
                    // link 没有合并的情况也要生成新的 alias。否则就和 lastTableAlias 同名
                } else if (info.isLinkIsolated()){
                    // link 表独立，给个新名字
                    // CAUTION symmetric 路径要手动指定关系
                    relationTableAlias = `REL_${currentTableAlias}`
                } else {
                    // link 表合并了，名字和当前一样。
                    relationTableAlias = currentTableAlias
                }


                // CAUTION 只要不是合表的，就要生成新的 alias.
                if (!info.isMergedWithParent()) {
                    lastTableAlias = currentTableAlias
                }

                lastTable = info.table
                lastEntityData = currentEntityData

                // TODO 找到 relationTable ，生成 relationTableName
                // relation table 有三种情况： 独立的/往n 方向合表了，与 1:1 合成一张表了。
                relationTable = info.getLinkInfo()?.table
                // relationTable 的 alias 始终保持和 tableAlias 一致的规律
                isLinkRecord = false
            }

            result.push({
                table: lastTable,
                alias: lastTableAlias,
                record: lastEntityData,
                isLinkRecord,
                linkTable: relationTable,
                linkAlias: relationTableAlias!,
                path
            })
        }

        return result
    }

    getTableAliasAndFieldName(namePath: string[], attributeName: string, dontShrink = false): [string, string,string] {
        const stack = this.getTableAndAliasStack(namePath)
        const {table, alias, record, path, linkAlias, linkTable, isLinkRecord} = stack.at(-1)!

        const attrInfo = (!isLinkRecord && stack.length > 1) ? this.getInfoByPath(path) : null
        const canShrinkIdPath =
            !dontShrink &&
            attributeName === 'id' &&
            !isLinkRecord &&
            namePath.length > 1 &&
            (attrInfo?.isLinkMergedWithParent() || attrInfo?.isLinkIsolated())

        // 获取 id 时，可以直接从关系表上获得，不需要额外的 table
        if (canShrinkIdPath) {
            if (attrInfo?.isLinkMergedWithParent()) {
                // 和父亲合并了，应该用父亲的 alias 和 表上用于记录关系 id 的 field
                const {alias: parentAlias, table: parentTable} = stack.at(-2)!
                return [parentAlias, attrInfo!.linkField!, parentTable]
            } else {
                // isolated。应该用关系表上的记录 id 的 source/target 字段
                const linkInfoRecord = attrInfo!.getLinkInfo().record
                const fieldName = attrInfo?.isLinkManyToManySymmetric() ?
                    (attrInfo?.symmetricDirection === 'source' ? linkInfoRecord?.attributes.target!.field! : linkInfoRecord?.attributes.source!.field!) :
                    (attrInfo!.isRecordSource() ? linkInfoRecord?.attributes.target!.field! : linkInfoRecord?.attributes.source!.field!)

                return [linkAlias!, fieldName, linkTable!]
            }
        } else {
            const fieldName = record.attributes[this.getAttributeAndSymmetricDirection(attributeName)[0]].field
            return [alias, fieldName!, table]
        }
    }
    findManyToManySymmetricPath( namePath: string[]): string[]|undefined {
        const result = [namePath[0]]
        let found = false
        // 注意是从 1 开始的。
        for(let i = 1; i< namePath.length; i++) {
            result.push(namePath[i])
            const info = this.getInfoByPath(namePath.slice(0, i+1))
            if (info?.isRecord && info.isLinkManyToManySymmetric()) {
                found = true
                break
            }
        }

        // 用 found 来判断，这样即使是最后一个也算找到了。
        return found ? result: undefined
    }
    spawnManyToManySymmetricPath( namePath: string[] ): [string[], string[]] | undefined {
        const foundPath = this.findManyToManySymmetricPath(namePath)
        if (!foundPath) return undefined
        const head = foundPath.slice(0, -1)
        const splitPoint = foundPath.at(-1)
        const rest = namePath.slice(foundPath.length, Infinity)

        return [
            [...head, `${splitPoint}:source`, ...rest],
            [...head, `${splitPoint}:target`, ...rest],
        ]
    }

    getReverseAttribute(entityName: string, attribute: string) : string {
        assert(this.data.records[entityName], `entity ${entityName} not found`)
        const record = this.data.records[entityName]
        if (record.isRelation) {
            assert(attribute ==='source' || attribute ==='target', `wrong attribute ${attribute} for relation ${entityName}`)
            const linkData = this.data.links[entityName]
            if (attribute === 'source') {
                return `${linkData.sourceProperty!}.&`
            } else {
                return `${linkData.targetProperty!}.&`
            }
        } else {
            const relationName = (this.data.records[entityName].attributes[attribute] as RecordAttribute).linkName
            const relationData = this.data.links[relationName]
            if (relationData.sourceRecord === entityName && relationData.sourceProperty === attribute) {
                return relationData.targetProperty!
            } else if (relationData.targetRecord === entityName && relationData.targetProperty === attribute) {
                return relationData.sourceProperty
            } else {
                assert(false, `wrong relation data ${entityName}.${attribute}`)
                return ''
            }
        }
        
    }
    getReversePath(namePath: string[]): string[] {
        const namePaths = new Array(namePath.length-1).fill(0).map((_, i) => namePath.slice(0, i+2))
        const attributeInfos = namePaths.map(p => this.getInfoByPath(p)).reverse()

        assert(attributeInfos[0]?.isRecord, `last attribute in path is not a record ${namePath.join('.')}`)
        // 考虑了路径上有 & 的问题
        const result:string[] = [attributeInfos[0]!.recordName!]
        let linkSymbolOccur = false
        for (const info of attributeInfos) {
            if (linkSymbolOccur) {
                result.push(info!.isRecordSource() ? 'source' : 'target')
                linkSymbolOccur = false
            } else {
                if (info) {
                    result.push(info!.getReverseInfo()!.attributeName)
                } else {
                    // FIXME 这里判断非常不严谨。目前只有 & 出现的时候，才会出现 undefined。
                    linkSymbolOccur = true
                }
            }
        }
        return result
    }
    groupAttributes(entityName: string, attributeNames: string[]) : [AttributeInfo[], AttributeInfo[], AttributeInfo[]]{
        assert(this.data.records[entityName], `entity ${entityName} not found`)
        const valueAttributes: AttributeInfo[] = []
        const entityIdAttributes: AttributeInfo[] = []
        const entityAttributes: AttributeInfo[] = []
        attributeNames.forEach(attributeName => {
            if (this.data.records[entityName].attributes[attributeName]) {
                const info = this.getInfo(entityName, attributeName)
                if (info.isValue  ) {
                    valueAttributes.push(info)
                } else {
                    // link record 的 source/target 字段有 field
                    // if (info.isLinkSourceRelation()) {
                    if (this.data.records[entityName].attributes[attributeName].field) {
                        entityIdAttributes.push(info)
                    } else {
                        entityAttributes.push(info)
                    }
                }
            }
        })

        return [valueAttributes, entityAttributes, entityIdAttributes]
    }
    // 获取压缩后的路径
    getShrinkedAttribute(entityName:string, attributeName: string):string {
        // 将路径分割成数组
        const pathParts = attributeName.split('.');
        const result: string[] = [];
        let currentEntity = entityName;
        let previousEntity = entityName; // 保存前一个实体名称
        let i = 0;
        
        while (i < pathParts.length) {
            const part = pathParts[i];
            
            // 如果当前部分是 & 符号
            if (part === LINK_SYMBOL && i > 0 && i < pathParts.length - 1) {
                const previousAttr = result[result.length - 1];
                const nextPart = pathParts[i + 1];
                
                // 如果下一个部分是 source 或 target
                if (nextPart === 'source' || nextPart === 'target') {
                        // 使用前一个实体来获取关系信息
                        const relationInfo = this.getInfo(previousEntity, previousAttr);
                        
                        if (relationInfo.isRecord) {
                            // 获取关系的详细信息
                            const linkInfo = relationInfo.getLinkInfo().data;
                            
                            // 确定关系属性指向的实体
                            let relationPointsTo: string;
                            if (relationInfo.isRecordSource()) {
                                // 如果是 source，则指向关系的 target
                                relationPointsTo = linkInfo.targetRecord;
                            } else {
                                // 如果不是 source，则指向关系的 source
                                relationPointsTo = linkInfo.sourceRecord;
                            }
                            
                            // 确定 source/target 指向的实体
                            let sourceTargetPointsTo: string;
                            if (nextPart === 'source') {
                                sourceTargetPointsTo = linkInfo.sourceRecord;
                            } else {
                                sourceTargetPointsTo = linkInfo.targetRecord;
                            }
                            
                            // 如果两者指向相同的实体，可以压缩
                            if (relationPointsTo === sourceTargetPointsTo) {
                                // 跳过 & 和 source/target
                                i += 2;
                                // currentEntity 保持为 relationPointsTo
                                // previousEntity 不变，因为我们没有添加新的属性到结果
                                continue;
                            } else {
                                // 如果不能压缩，更新 currentEntity 为 source/target 指向的实体
                                currentEntity = sourceTargetPointsTo;
                                previousEntity = currentEntity; // 更新 previousEntity
                                currentEntity = '';
                                previousEntity = ''; // 更新 previousEntity
                                result.push(part);
                                result.push(nextPart);
                                i += 2;
                                continue;
                            }
                        }
                } else {
                    currentEntity = '';
                    previousEntity = ''; 
                }
                
                // 如果不能压缩，保留 & 符号
                result.push(part);
                i++;
            } else if (part !== LINK_SYMBOL) {
                // 保存当前实体作为前一个实体
                previousEntity = currentEntity;
                
                // 更新当前实体
                if(currentEntity) {
                    const info = this.getInfo(currentEntity, part);
                    if (info.isRecord) {
                        currentEntity = info.recordName;
                    }
                }
                // try {
                //     const info = this.getInfo(currentEntity, part);
                //     if (info.isRecord) {
                //         currentEntity = info.recordName;
                //     }
                // } catch (e) {
                //     // 忽略错误
                // }
                
                result.push(part);
                i++;
            } else {
                // 其他情况（比如 & 在开头或结尾）
                result.push(part);
                i++;
            }
        }
        
        return result.join('.');
    }
}