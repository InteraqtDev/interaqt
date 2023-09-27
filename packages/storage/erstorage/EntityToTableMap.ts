import {assert} from "../util";

export class AttributeInfo {
    constructor(public data:EntityValueAttributeMapType|EntityEntityAttributeMapType, public attributeName, public parentEntityName, public map: EntityToTableMap) {
        assert(!!data, 'data can not be null')
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
        assert(this.isEntity, `${this.attributeName} is not a entity`)
        return (this.data as EntityEntityAttributeMapType).entityName
    }
    get table() {
        assert(this.isEntity, `${this.attributeName} is not a entity`)
        return (this.data as EntityEntityAttributeMapType).table
    }
    get field() {
        return (this.data as EntityValueAttributeMapType).field
    }
    get relationName() {
        return (this.data as EntityEntityAttributeMapType).relationName
    }
    isMergedTo(entityToMatch: string) {
        assert(this.isEntity, `${this.attributeName} is not a entity`)
        // CAUTION 如果是同一实体，表相同，但逻辑上不是合表，所以这里要排除掉。
        return this.entityName !== entityToMatch && this.table === this.map.getEntityTable(entityToMatch)
    }
    isMergedToParentEntity() {
        return this.isMergedTo(this.parentEntityName)
    }
    isRelationTableMergedToParentEntity(includeAllCombined: boolean) {
        assert(this.isEntity, `${this.attributeName} is not a entity`)
        const relationData = this.map.getRelationInfoData(this.parentEntityName, this.attributeName)
        // CAUTION 不能简单地用 table 来判断，因为可能 source 和 target 是同一个，自然表也相同。
        if (!relationData.mergedTo) return false
        if (includeAllCombined) {
            if (relationData.mergedTo === 'combined') return true
        } else {
            if (relationData.mergedTo === 'combined') return false
        }

        const mergedToEntity = relationData.mergedTo === 'source' ? relationData.sourceEntity : relationData.targetEntity
        const mergedToAttribute = relationData.mergedTo === 'source' ? relationData.sourceAttribute : relationData.targetAttribute
        return mergedToEntity=== this.parentEntityName && mergedToAttribute === this.attributeName
    }
    isRelationTableMergedToAttributeEntity(includeAllCombined: boolean) {
        assert(this.isEntity, `${this.attributeName} is not a entity`)
        const relationData = this.map.getRelationInfoData(this.parentEntityName, this.attributeName)
        // CAUTION 不能简单地用 table 来判断，因为可能 source 和 target 是同一个，自然表也相同。
        if (!relationData.mergedTo) return false
        if (includeAllCombined) {
            if (relationData.mergedTo === 'combined') return true
        } else {
            if (relationData.mergedTo === 'combined') return false
        }
        const mergedToEntity = relationData.mergedTo === 'source' ? relationData.sourceEntity : relationData.targetEntity
        const mergedToAttribute = relationData.mergedTo === 'source' ? relationData.sourceAttribute : relationData.targetAttribute
        // 走到这里是肯定有合表的情况。因为上面已经处理没合表的情况。所以这里用一下反向判断。
        return !(mergedToEntity=== this.parentEntityName && mergedToAttribute === this.attributeName)
    }
    isParentEntitySource() {
        assert(this.isEntity, `${this.attributeName} is not a entity`)
        const relationData = this.map.getRelationInfoData(this.parentEntityName, this.attributeName)
        if (relationData.mergedTo === 'combined') return false
        // FIXME 没考虑同实体同名关系？
        return this.parentEntityName === relationData.sourceEntity && this.attributeName === relationData.sourceAttribute
    }
    getReverseInfo() {
        return this.map.getInfo(this.entityName, this.map.getReverseAttribute(this.parentEntityName, this.attributeName))
    }
}



export type EntityValueAttributeMapType = {
    //entityType
    type: string,
    // 数据库的 fieldType
    fieldType: string,
    // 没有的话就继承上面的
    table?: string,
    field: string
}



export type EntityEntityAttributeMapType = {
    isEntity: true,
    relType: ['1'|'n', '1'|'n'],
    entityName: string,
    relationName: string,
    isSource? : boolean,
    table: string,
    // 这个 field 是指如果合表了，那么它在实体表里面的名字。
    //  这个是从 EntityMapItemData 的 sourceField 或者 targetField 复制过来的。
    field : string
    fieldType: string,
}

export type EntityMapItemData = {
    // id 所在的 table。不一定有 fields 也在，fields 可能会因为各种优化拆出去。
    table: string,
    attributes: {
        [k:string]: EntityValueAttributeMapType|EntityEntityAttributeMapType
    }
    // relation 模拟的 entity
    isRelation? :boolean
}

type EntityMapData = {
    [k:string]: EntityMapItemData
}

export type RelationMapItemData = {
    attributes: {
        [k:string]: EntityValueAttributeMapType|EntityEntityAttributeMapType
    },
    relType: [string, string]
    sourceEntity: string,
    sourceAttribute: string,
    targetEntity: string,
    targetAttribute: string,
    table: string,
    // CAUTION 特别注意，这里的 sourceField 和 targetField 和 sourceAttribute 一样，是指站在 source 的角度去看，存的是关联实体(target)的 id. 不要搞成了自己的 id 。
    //  当发生表合并时，他们表示的是在合并的表里面的 field。根据往合并情况不同，sourceField/targetField 都可能不存在。
    sourceField: string,
    targetField: string,
    mergedTo? : 'source'|'target'|'combined',
    isSourceRelation?: boolean
}
type RelationMapData = {
    [k:string]: RelationMapItemData
}

export type MapData = {
    entities: EntityMapData
    relations: RelationMapData
}


const ID_ATTRIBUTE = {
    type: 'id',
    fieldType: 'id',
    field: 'id'
}

export class EntityToTableMap {
    constructor(public data: MapData) {}
    isAttributeEntity(entityName: string, attribute: string) {
        return true
    }
    getEntityTable(entityName: string) {
        return this.data.entities[entityName].table
    }
    getRelationTable(entityName: string, attribute: string) {
        return this.data.relations[(this.data.entities[entityName].attributes[attribute] as EntityEntityAttributeMapType).relationName].table
    }
    getReverseRelatedName(entityName: string, attribute: string) {
        const relationData = this.data.relations[(this.data.entities[entityName].attributes[attribute] as EntityEntityAttributeMapType).relationName]
        return relationData.sourceEntity === entityName ? relationData.targetAttribute : relationData.sourceAttribute
    }
    getInfo(entityName: string, attribute: string) : AttributeInfo{
        if (!this.data.entities[entityName]!.attributes[attribute]) debugger
        assert(!!this.data.entities[entityName]!.attributes[attribute],
            `cannot find attribute ${attribute} in ${entityName}. attributes: ${Object.keys(this.data.entities[entityName]!.attributes)}`
        )
        return new AttributeInfo(this.data.entities[entityName]!.attributes[attribute]!, attribute, entityName, this)
    }
    getRelationInfoData(entityName: string, attribute: string) {
        const relationName = (this.data.entities[entityName].attributes[attribute] as EntityEntityAttributeMapType).relationName
        assert(!!relationName, `cannot find relation ${entityName} ${attribute}`)
        return this.data.relations[relationName]
    }
    getInfoByPath(namePath: string[]): AttributeInfo {
        const [entityName, ...attributivePath] = namePath
        assert(attributivePath.length > 0, 'getInfoByPath should have a name path.')
        let currentEntity = entityName
        let parentEntity
        let currentAttribute
        let lastAttribute
        let attributeData
        while(currentAttribute = attributivePath.shift()) {
            const data = this.data.entities[currentEntity]
            attributeData = currentAttribute === 'id' ? ID_ATTRIBUTE : data!.attributes[currentAttribute] as EntityEntityAttributeMapType
            parentEntity = currentEntity
            currentEntity = attributeData.isEntity ? attributeData.entityName : ''
            lastAttribute = currentAttribute
        }
        return new AttributeInfo(attributeData, lastAttribute, parentEntity, this)
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
            relationTableAlias = `REL__${lastTableAlias}`
            isLastRelationSource = currentRelationData.targetEntity === currentEntityAttribute.entityName &&
                currentRelationData.targetAttribute === currentAttributeName
        }


        return [lastTable, lastTableAlias, lastEntityData, relationTable, relationTableAlias, currentRelationData]
    }
    getTableAliasAndFieldName(namePath: string[], attributeName: string) {
        const [, lastTableAliasName,lastEntityData] = this.getTableAndAlias(namePath)
        const fieldName = attributeName === 'id' ? 'id' : ((lastEntityData as EntityMapItemData).attributes[attributeName] as EntityValueAttributeMapType).field
        return [lastTableAliasName, fieldName]
    }
    getReverseAttribute(entityName: string, attribute: string) : string {
        const relationName = (this.data.entities[entityName].attributes[attribute] as EntityEntityAttributeMapType).relationName
        const relationData = this.data.relations[relationName]
        if (relationData.sourceEntity === entityName && relationData.sourceAttribute === attribute) {
            return relationData.targetAttribute
        } else if (relationData.targetEntity === entityName && relationData.targetAttribute === attribute) {
            return relationData.sourceAttribute
        } else {
            assert(false, `wrong relation data ${entityName}.${attribute}`)
        }
    }
    groupAttributes(entityName: string, attributeNames: string[]) : [AttributeInfo[], AttributeInfo[]]{
        const valueAttributes = []
        const entityAttributes = []
        attributeNames.forEach(attributeName => {
            if (this.data.entities[entityName].attributes[attributeName]) {
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