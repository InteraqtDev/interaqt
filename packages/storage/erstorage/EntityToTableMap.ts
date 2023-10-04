import {assert} from "../util";

export class RecordInfo {
    data: RecordMapItem
    constructor(public record: string, public map: EntityToTableMap) {
        this.data = this.map.data.records[record]!
    }
    get combinedRecords() {
        return Object.keys(this.data.attributes).map(attribute => {
            return new AttributeInfo(this.record, attribute, this.map)
        }).filter(info => info.isRecord && info.isMergedWithParent())
    }

    get table() {
        return this.map.getRecordTable(this.record)
    }
    get idField() {
        return this.data.attributes.id.field
    }
    get allFields(): string[] {
        return Object.values(this.data.attributes).map(a => a.field!).filter(x => x)
    }
    get allLinks() {
        return Object.keys(this.data.attributes).map(attribute => {
            const attr = new AttributeInfo(this.record, attribute, this.map)
            return attr.isRecord ? attr.getLinkInfo() : null
        }).filter(x => x)
    }
    get differentTableRecords() {
        return Object.keys(this.data.attributes).map(attribute => {
            return new AttributeInfo(this.record, attribute, this.map)
        }).filter(info =>
            info.isRecord && !info.isMergedWithParent() && !info.field
        )
    }
    getAttributeInfo(attribute:string) {
        return new AttributeInfo(this.record, attribute, this.map)
    }
    get valueAttributes() {
        return Object.entries(this.data.attributes).filter(([, attribute]) => {
            return !(attribute as RecordAttribute).isRecord
        }).map(([attributeName]) => {
            return new AttributeInfo(this.record, attributeName, this.map)
        })
    }
}

export class AttributeInfo {
    public data:ValueAttribute|RecordAttribute
    constructor(public parentEntityName: string, public attributeName: string, public map: EntityToTableMap) {
        this.data =  this.map.data.records[parentEntityName].attributes[attributeName]
        assert(!!this.data, `${parentEntityName} has no ${attributeName}`)
    }
    get isRecord() {
        return (this.data as RecordAttribute).isRecord
    }
    get isValue() {
        return !(this.data as RecordAttribute).isRecord
    }
    get isManyToOne() {
        if (!this.isRecord) throw new Error('not a entity')
        const data = (this.data as RecordAttribute)
        return data.relType[0] === 'n' && data.relType[1] === '1'
    }
    get isManyToMany() {
        if (!this.isRecord) throw new Error('not a entity')
        const data = (this.data as RecordAttribute)
        return data.relType[0] === 'n' && data.relType[1] === 'n'
    }
    get isOneToOne() {
        if (!this.isRecord) throw new Error('not a entity')
        const data = (this.data as RecordAttribute)
        return data.relType[0] === '1' && data.relType[1] === '1'
    }
    get isOneToMany() {
        if (!this.isRecord) throw new Error('not a entity')
        const data = (this.data as RecordAttribute)
        return data.relType[0] === '1' && data.relType[1] === 'n'
    }
    get isXToOne() {
        return this.isManyToOne || this.isOneToOne
    }
    get isOneToX() {
        return this.isOneToMany || this.isOneToOne
    }
    get isXToMany() {
        return this.isManyToMany||this.isOneToMany
    }
    get entityName() {
        assert(this.isRecord, `${this.attributeName} is not a entity`)
        return (this.data as RecordAttribute).recordName
    }
    get table() {
        assert(this.isRecord, `${this.attributeName} is not a entity`)
        return this.map.getRecord((this.data as RecordAttribute).recordName).table
    }
    get field() {
        return (this.data as ValueAttribute).field
    }
    get linkName() {
        return (this.data as RecordAttribute).linkName
    }
    isMergedTo(entityToMatch: string) {
        assert(this.isRecord, `${this.attributeName} is not a entity`)
        // CAUTION 如果是同一实体，表相同，但逻辑上不是合表，所以这里要排除掉。
        return this.entityName !== entityToMatch && this.table === this.map.getRecordTable(entityToMatch)
    }
    isMergedWithParent() {
        return this.isMergedTo(this.parentEntityName)
    }
    getReverseInfo() {
        const reverseAttribute = this.map.getReverseAttribute(this.parentEntityName, this.attributeName)
        if (!reverseAttribute) return undefined
        return this.map.getInfo(this.entityName, reverseAttribute)
    }
    getLinkInfo() {
        assert(this.isRecord, `only record attribute can get linkInfo`)
        return this.map.getLinkInfo(this.parentEntityName, this.attributeName)
    }
    getRecordInfo() {
        assert(this.isRecord, `only record attribute can get linkInfo`)
        return this.map.getRecordInfo(this.entityName)
    }
}



export class LinkInfo {
    constructor(public name: string, public data: LinkMapItem, public map: EntityToTableMap) {
    }

    get isManyToOne() {
        return this.data.relType[0] === 'n' && this.data.relType[1] === '1'
    }
    get isManyToMany() {
        return this.data.relType[0] === 'n' && this.data.relType[1] === 'n'
    }
    get isOneToOne() {
        return this.data.relType[0] === '1' && this.data.relType[1] === '1'
    }
    get isOneToMany() {
        return this.data.relType[0] === '1' && this.data.relType[1] === 'n'
    }
    get isXToOne() {
        return this.isManyToOne || this.isOneToOne
    }
    get isOneToX() {
        return this.isOneToMany || this.isOneToOne
    }
    get isXToMany() {
        return this.isManyToMany||this.isOneToMany
    }
    get sourceRecord() {
        return this.data.sourceRecord
    }
    get sourceRecordInfo() {
        return new RecordInfo(this.data.sourceRecord, this.map)
    }
    get targetRecordInfo() {
        return new RecordInfo(this.data.targetRecord, this.map)
    }
    get targetRecord() {
        return this.data.targetRecord
    }
    get sourceAttribute() {
        return this.data.sourceAttribute
    }
    get targetAttribute() {
        return this.data.targetAttribute
    }
    get record() : RecordMapItem {
        return this.map.getRecord(this.name)!
    }
    get table (){
        return this.record.table
    }
    // CAUTION sourceField 指的的是 target 在source 表中的名字！
    get sourceField() {
        return this.record.attributes.target.field
    }
    // CAUTION sourceField 指的的是 target 在source 表中的名字！
    get targetField() {
        return this.record.attributes.source.field
    }
    get sourceAttrField() {
        return this.record.attributes.source.field
    }
    get targetAttrField() {
        return this.record.attributes.target.field
    }
    isMerged() {
        return !!this.data.mergedTo
    }
    isMergedToSource() {
        return this.data.mergedTo === 'source'
    }
    isMergedToTarget() {
        return this.data.mergedTo === 'target'
    }
    isCombined() {
        return this.data.mergedTo === 'combined'
    }
    isRecordSource(recordName:string) {
        return this.data.sourceRecord === recordName
    }
    getAttributeName(recordName: string) {
        return this.isRecordSource(recordName) ? ['source', 'target'] : ['target', 'source']
    }
}



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
        let currentRelationData: LinkMapItem

        for(let i = 0; i<relationPath.length; i++) {
            const currentAttributeName = relationPath[i]
            const currentEntityAttribute = lastEntityData.attributes[currentAttributeName] as RecordAttribute
            assert(currentEntityAttribute.isRecord, `${relationPath.slice(0, i+1).join('.')} is not a entity attribute`)

            const currentEntityData = this.data.records[currentEntityAttribute.recordName] as RecordMapItem

            // CAUTION 如果表不相同（说明没有合表），就有新的 join，就能取新名字。或者 实体相同，说明关系指向了同一种实体，这是无法合表的，也按照 join 处理。
            if (currentEntityData === lastEntityData || currentEntityData.table !== lastTable) {
                // CAUTION alias name 要用 namePath，把 rootEntityName 也加上
                lastTableAlias = namePath.slice(0, i+2).join('_')
            }
            lastTable = currentEntityData.table
            lastEntityData = currentEntityData

            // TODO 找到 relationTable ，生成 relationTableName
            // relation table 有三种情况： 独立的/往n 方向合表了，与 1:1 合成一张表了。
            currentRelationData = this.data.links[currentEntityAttribute.linkName]
            relationTable = currentRelationData.table
            // relationTable 的 alias 始终保持和 tableAlias 一致的规律
            relationTableAlias = `REL__${lastTableAlias}`
            isLastRelationSource = currentRelationData.targetRecord === currentEntityAttribute.recordName &&
                currentRelationData.targetAttribute === currentAttributeName
        }


        return [lastTable, lastTableAlias, lastEntityData, relationTable!, relationTableAlias!, currentRelationData!]
    }
    getTableAliasAndFieldName(namePath: string[], attributeName: string) {
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
    groupAttributes(entityName: string, attributeNames: string[]) : [AttributeInfo[], AttributeInfo[]]{
        const valueAttributes: AttributeInfo[] = []
        const entityAttributes: AttributeInfo[] = []
        attributeNames.forEach(attributeName => {
            if (this.data.records[entityName].attributes[attributeName]) {
                const info = this.getInfo(entityName, attributeName)
                if (info.isValue) {
                    valueAttributes.push(info)
                } else {
                    entityAttributes.push(info)
                }
            }
        })

        return [valueAttributes, entityAttributes]
    }
}