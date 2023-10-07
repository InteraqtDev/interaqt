import {assert} from "../util";
import {AttributeInfo} from "./AttributeInfo.ts";
import {RecordInfo} from "./RecordInfo.ts";
import {LinkInfo} from "./LinkInfo.ts";


export type ValueAttribute = {
    //entityType
    type: string,
    // 没有的话就继承上面的
    table?: string,
    field: string
}



export type RecordAttribute = {
    type: 'id',
    isRecord: true,
    linkName: string,
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
}

export type RecordMapItem = {
    // id 所在的 table。不一定有 fields 也在，fields 可能会因为各种优化拆出去。
    table: string,
    attributes: {
        [k:string]: ValueAttribute|RecordAttribute
    }
    isRelation? :boolean
}

type RecordMap = {
    [k:string]: RecordMapItem
}

export type LinkMapItem = {
    relType: [string, string]
    sourceRecord: string,
    sourceAttribute: string,
    targetRecord: string,
    targetAttribute?: string,
    // 用来判断这个 relation 是不是 virtual 的，是的话为 true.
    isSourceRelation?: boolean,
    // 这个 link 是否有个对应的 record. 当这个 link 是根据 Relation 创建的时候就有这个。
    //  它等同于 isSourceRelation 为 true 时 sourceRecord
    recordName?: string,
    mergedTo? : 'source'|'target'|'combined',
    table: string,
    // CAUTION 特别注意，这里的 sourceField 和 targetField 和 sourceAttribute 一样，是指站在 source 的角度去看，存的是关联实体(target)的 id. 不要搞成了自己的 id 。
    //  当发生表合并时，他们表示的是在合并的表里面的 field。根据往合并情况不同，sourceField/targetField 都可能不存在。
    sourceField?: string,
    targetField?: string,
    // 连接两个生命周期依赖的实体的，只能 target 依赖 source。
    isTargetReliance?: boolean
}

type LinkMap = {
    [k:string]: LinkMapItem
}

export type MapData = {
    records: RecordMap
    links: LinkMap
}



export class EntityToTableMap {
    constructor(public data: MapData) {}
    getRecordTable(entityName: string) {
        return this.data.records[entityName].table
    }
    getRecord(recordName:string) {
        return this.data.records[recordName]
    }
    getRecordInfo(recordName:string) {
        return new RecordInfo(recordName, this)
    }
    getInfo(entityName: string, attribute: string) : AttributeInfo{
        assert(!!this.data.records[entityName]?.attributes[attribute],
            `cannot find attribute ${attribute} in ${entityName}. attributes: ${this.data.records[entityName] && Object.keys(this.data.records[entityName]?.attributes)}`
        )
        return new AttributeInfo( entityName, attribute, this)
    }
    getLinkInfo(recordName: string, attribute: string) {
        const linkName = (this.data.records[recordName].attributes[attribute] as RecordAttribute).linkName
        assert(!!linkName, `cannot find relation ${recordName} ${attribute}`)
        return new LinkInfo(linkName, this.data.links[linkName], this)
    }
    getLinkInfoByName(linkName: string) {
        assert(!!this.data.links[linkName], `cannot find link ${linkName}`)
        return new LinkInfo(linkName, this.data.links[linkName], this)
    }
    getRelationInfoData(entityName: string, attribute: string) {
        const relationName = (this.data.records[entityName].attributes[attribute] as RecordAttribute).linkName
        assert(!!relationName, `cannot find relation ${entityName} ${attribute}`)
        return this.data.links[relationName]
    }
    getInfoByPath(namePath: string[]): AttributeInfo {
        const [entityName, ...attributivePath] = namePath
        assert(attributivePath.length > 0, 'getInfoByPath should have a name path.')
        let currentEntity = entityName
        let parentEntity
        let currentAttribute
        let lastAttribute
        let attributeData: ValueAttribute|RecordAttribute
        while(currentAttribute = attributivePath.shift()) {
            const data = this.data.records[currentEntity]
            attributeData = data!.attributes[currentAttribute] as RecordAttribute
            parentEntity = currentEntity
            currentEntity = (attributeData as RecordAttribute).isRecord ? (attributeData as RecordAttribute).recordName : ''
            lastAttribute = currentAttribute
        }
        return new AttributeInfo( parentEntity!, lastAttribute!, this)
    }
    getTableAndAlias(namePath: string[]): [string, string, RecordMapItem, string, string, LinkMapItem] {
        const [rootEntityName, ...relationPath] = namePath
        let lastEntityData: RecordMapItem = this.data.records[rootEntityName]
        let lastTable:string = lastEntityData.table
        let lastTableAlias:string = rootEntityName

        let relationTable:string
        let relationTableAlias:string
        let isLastRelationSource = true
        let currentLink: LinkMapItem

        for(let i = 0; i<relationPath.length; i++) {
            const currentAttributeName = relationPath[i]
            const currentEntityAttribute = lastEntityData.attributes[currentAttributeName] as RecordAttribute
            assert(currentEntityAttribute.isRecord, `${relationPath.slice(0, i+1).join('.')} is not a entity attribute`)

            currentLink = this.data.links[currentEntityAttribute.linkName]
            const currentEntityData = this.data.records[currentEntityAttribute.recordName] as RecordMapItem


            // CAUTION 只要不是合表的，就要生成新的 alias.
            if (currentLink.mergedTo !== 'combined') {
                // CAUTION alias name 要用 namePath，把 rootEntityName 也加上
                lastTableAlias = namePath.slice(0, i+2).join('_')
            }
            lastTable = currentEntityData.table
            lastEntityData = currentEntityData

            // TODO 找到 relationTable ，生成 relationTableName
            // relation table 有三种情况： 独立的/往n 方向合表了，与 1:1 合成一张表了。

            relationTable = currentLink.table
            // relationTable 的 alias 始终保持和 tableAlias 一致的规律
            relationTableAlias = `REL__${lastTableAlias}`
            isLastRelationSource = currentLink.targetRecord === currentEntityAttribute.recordName &&
                currentLink.targetAttribute === currentAttributeName
        }


        return [lastTable, lastTableAlias, lastEntityData, relationTable!, relationTableAlias!, currentLink!]
    }
    getTableAliasAndFieldName(namePath: string[], attributeName: string) {
        // 获取 id 时，可以直接从关系表上获得，不需要额外的 table
        const [, lastTableAliasName,lastEntityData] = this.getTableAndAlias(namePath)
        const fieldName = ((lastEntityData as RecordMapItem).attributes[attributeName] as ValueAttribute).field
        return [lastTableAliasName, fieldName]
    }
    getReverseAttribute(entityName: string, attribute: string) : string {
        const relationName = (this.data.records[entityName].attributes[attribute] as RecordAttribute).linkName
        const relationData = this.data.links[relationName]
        if (relationData.sourceRecord === entityName && relationData.sourceAttribute === attribute) {
            return relationData.targetAttribute!
        } else if (relationData.targetRecord === entityName && relationData.targetAttribute === attribute) {
            return relationData.sourceAttribute
        } else {
            assert(false, `wrong relation data ${entityName}.${attribute}`)
            return ''
        }
    }
    groupAttributes(entityName: string, attributeNames: string[]) : [AttributeInfo[], AttributeInfo[], AttributeInfo[]]{
        const valueAttributes: AttributeInfo[] = []
        const entityIdAttributes: AttributeInfo[] = []
        const entityAttributes: AttributeInfo[] = []
        attributeNames.forEach(attributeName => {

            if (this.data.records[entityName].attributes[attributeName]) {
                const info = this.getInfo(entityName, attributeName)
                if (info.isValue  ) {
                    valueAttributes.push(info)
                } else {
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
}