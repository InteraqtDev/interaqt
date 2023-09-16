import {assert} from "../util";

export class AttributeInfo {
    constructor(public data:EntityValueAttributeMapType|EntityEntityAttributeMapType) {

    }
    get isEntity() {
        return (this.data as EntityEntityAttributeMapType).isEntity
    }
    get isValue() {
        return !(this.data as EntityEntityAttributeMapType).isEntity
    }
    get isManyToOne() {
        if (!this.isEntity) throw new Error('not a entity')
        const data = (this.data as EntityEntityAttributeMapType)
        return data.relType[0] === 'n' && data.relType[1] === '1'

    }
    get isManyToMany() {
        if (!this.isEntity) throw new Error('not a entity')
        const data = (this.data as EntityEntityAttributeMapType)
        return data.relType[0] === 'n' && data.relType[1] === 'n'
    }
    get isOneToOne() {
        if (!this.isEntity) throw new Error('not a entity')
        const data = (this.data as EntityEntityAttributeMapType)
        return data.relType[0] === '1' && data.relType[1] === '1'
    }
    get isOneToMany() {
        if (!this.isEntity) throw new Error('not a entity')
        const data = (this.data as EntityEntityAttributeMapType)
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
        if (!this.isEntity) throw new Error('not a entity')
        return (this.data as EntityEntityAttributeMapType).entityName
    }
}


type EntityValueAttributeMapType = {
    //entityType
    type: string,
    // 数据库的 fieldType
    fieldType: string,
    // 没有的话就继承上面的
    table?: string,
    field: string
}

type EntityEntityAttributeMapType = {
    isEntity: true,
    relType: ['1'|'n', '1'|'n'],
    entityName: string,
    relationName: string,
}

type EntityMapItemData = {
    // id 所在的 table。不一定有 fields 也在，fields 可能会因为各种优化拆出去。
    table: string,
    attributes: {
        [k:string]: EntityValueAttributeMapType|EntityEntityAttributeMapType
    }
}

type EntityMapData = {
    [k:string]: EntityMapItemData
}

type RelationMapItemData = {
    attributes: {
        [k:string]: EntityValueAttributeMapType
    },
    relType: [string, string]
    sourceEntity: string,
    sourceAttribute: string,
    targetEntity: string,
    targetAttribute: string,
    table: string,
}
type RelationMapData = {
    [k:string]: RelationMapItemData
}

export type MapData = {
    entities: EntityMapData
    relations: RelationMapData
}

export class EntityToTableMap {
    constructor(public data: MapData) {
    }
    isAttributeEntity(entityName: string, attribute: string) {
        return true
    }
    getInfo(entityName: string, attribute: string) : AttributeInfo{
        assert(!!this.data.entities[entityName]!.attributes[attribute], `cant find attribute ${attribute} in ${entityName}`)
        return new AttributeInfo(this.data.entities[entityName]!.attributes[attribute]!)
    }
    getInfoByPath(namePath: string[]): AttributeInfo {
        const [entityName, ...attributivePath] = namePath
        let lastEntity = entityName
        let currentAttribute
        let attributeData
        while(currentAttribute = attributivePath.shift()) {
            const data = this.data.entities[lastEntity]
            attributeData = data!.attributes[currentAttribute] as EntityEntityAttributeMapType
            lastEntity = attributeData.isEntity ? attributeData.entityName : ''
        }

        return new AttributeInfo(attributeData)
    }
    getTableAndAlias(namePath: string[]): [string, string, EntityMapItemData, string, string, RelationMapItemData] {
        const [rootEntityName, ...relationPath] = namePath
        let lastEntityData: EntityMapItemData = this.data.entities[rootEntityName]
        let lastTable:string = lastEntityData.table
        let lastTableAlias:string = rootEntityName

        let relationTable:string
        let relationTableAlias:string
        let isLastRelationSource = true
        let currentRelationData: RelationMapItemData

        for(let i = 0; i<relationPath.length; i++) {
            const currentAttributeName = relationPath[i]
            const currentEntityAttribute = lastEntityData.attributes[currentAttributeName] as EntityEntityAttributeMapType
            assert(currentEntityAttribute.isEntity, `${relationPath.slice(0, i+1).join('.')} is not a entity attribute`)

            const currentEntityData = this.data.entities[currentEntityAttribute.entityName] as EntityMapItemData

            // CAUTION 如果表不相同（说明没有合表），就有新的 join，就能取新名字。或者 实体相同，说明关系指向了同一种实体，这是无法合表的，也按照 join 处理。
            if (currentEntityData === lastEntityData || currentEntityData.table !== lastTable) {
                // CAUTION alias name 要用 namePath，把 rootEntityName 也加上
                lastTableAlias = namePath.slice(0, i+2).join('_')
            }
            lastTable = currentEntityData.table
            lastEntityData = currentEntityData

            // TODO 找到 relationTable ，生成 relationTableName
            // relation table 有三种情况： 独立的/往n 方向合表了，与 1:1 合成一张表了。
            currentRelationData = this.data.relations[currentEntityAttribute.relationName]
            relationTable = currentRelationData.table
            // relationTable 的 alias 始终保持和 tableAlias 一致的规律
            relationTableAlias = `REL-${lastTableAlias}`
            isLastRelationSource = currentRelationData.targetEntity === currentEntityAttribute.entityName &&
                currentRelationData.targetAttribute === currentAttributeName
        }


        return [lastTable, lastTableAlias, lastEntityData, relationTable, relationTableAlias, currentRelationData]
    }
    getTableAliasAndFieldName(namePath: string[], attributeName: string) {
        const [, lastTableAliasName,lastEntityData] = this.getTableAndAlias(namePath)
        const fieldName = ((lastEntityData as EntityMapItemData).attributes[attributeName] as EntityValueAttributeMapType).field
        return [lastTableAliasName, fieldName]
    }
}