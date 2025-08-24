import {AttributeInfo} from "./AttributeInfo.js";
import {EntityToTableMap, RecordAttribute, RecordMapItem, ValueAttribute} from "./EntityToTableMap.js";

export class RecordInfo {
    data: RecordMapItem

    constructor(public name: string, public map: EntityToTableMap) {
        this.data = this.map.data.records[name]!
    }

    get isRelation() {
        return this.data.isRelation
    }

    get combinedRecords() {
        return this.strictRecordAttributes.filter(info => {
            return info.isMergedWithParent()
        })
    }

    get table() {
        return this.data.table
    }

    get idField() {
        return this.data.attributes.id.field
    }

    get JSONFields() {
        return Object.entries(this.data.attributes).filter(([, attribute]) => {
            return !(attribute as RecordAttribute).isRecord && ((attribute as ValueAttribute ).collection || (attribute as ValueAttribute).type === 'object' || (attribute as ValueAttribute).type === 'json')
        }).map(([attributeName]) => attributeName)
    }

    get sameRowFields(): string[] {
        // 自身的value 字段
        const valueFields = this.valueAttributes.map(info => info.field!)

        // 和自己合并的关系字段
        const linkFields = this.strictRecordAttributes.filter(info => {
            return info.isLinkMergedWithParent()
        }).map(info => {
            return info.getLinkInfo().recordInfo.sameRowFields
        })

        // 当自身是一个关系 record 时，它的 source/target 虽然是 record attribute，但字段是由我来管辖的。
        const managedRecordAttributeFields = this.managedRecordAttributes.map(info => {
            return info.linkField!
        })

        const relianceFields = this.sameTableReliance.map(info => {
            return info.getRecordInfo().sameRowFields
        })


        return valueFields.concat(...linkFields, ...managedRecordAttributeFields, ...relianceFields)
    }
    // 合并了 link 字段的 record
    get mergedRecordAttributes() {
        return this.strictRecordAttributes.filter(info => {
            return info.isLinkMergedWithParent()
        })
    }
    get allFields(): string[] {
        return Object.values(this.data.attributes).map(a => a.field!).filter(x => x)
    }

    // 当自身是一个关系 record 时，它的 source/target 虽然是 record attribute，但字段是由我来管辖的。
    get managedRecordAttributes() {
        return Object.keys(this.data.attributes).filter(attribute => {
            const attributeData = this.data.attributes[attribute] as  RecordAttribute
            return attributeData.isRecord && attributeData.field
        }).map(attribute => {
            return new AttributeInfo(this.name, attribute, this.map)
        })
    }

    get strictRecordAttributes() {
        return Object.keys(this.data.attributes).filter(attribute => {
            const attributeData = this.data.attributes[attribute] as  RecordAttribute
            // CAUTION linkRecord 中有 field 就不能算了。比如 source/target
            return attributeData.isRecord && !attributeData.field && !attributeData.isFilteredRelation
        }).map(attribute => {
            return new AttributeInfo(this.name, attribute, this.map)
        })
    }
    get differentTableRecordAttributes() {
        // CAUTION 特别注意不能用 table 判断，因为可能是同一个实体的关系，这种情况 table 会相等，但含义并不是合表
        // return this.strictRecordAttributes.filter(info => info.table !== this.table)
        return this.strictRecordAttributes.filter(info => {
            return !(info.isMergedWithParent() || info.isLinkMergedWithParent())
        })
    }


    get reliance(): AttributeInfo[] {
        return Object.keys(this.data.attributes).filter(attribute => {
            return (this.data.attributes[attribute] as RecordAttribute).isReliance
        }).map(attribute => {
            return new AttributeInfo(this.name, attribute, this.map)
        })
    }

    get notRelianceCombined() :AttributeInfo[] {
        return this.combinedRecords.filter(info => {
            return !info.isReliance
        })
    }

    get differentTableReliance(): AttributeInfo[] {
        return this.reliance.filter(info => {
            return info.table !== this.table
        })
    }

    get sameTableReliance(): AttributeInfo[] {
        return this.reliance.filter(info => {
            return info.table === this.table
        })
    }

    get valueAttributes() {
        return Object.entries(this.data.attributes).filter(([, attribute]) => {
            return !(attribute as RecordAttribute).isRecord
        }).map(([attributeName]) => {
            return new AttributeInfo(this.name, attributeName, this.map)
        })
    }

    getAttributeInfo(attribute: string) {
        return new AttributeInfo(this.name, attribute, this.map)
    }

    get baseRecordName() {
        return this.data.baseRecordName
    }

    get matchExpression() {
        return this.data.matchExpression
    }

    get filteredBy() {
        return this.data.filteredBy?.map(name => new RecordInfo(name, this.map))
    }

    get isFilteredEntity() {
        return this.data?.isFilteredEntity
    }

    get isFilteredRelation() {
        return this.data?.isFilteredRelation
    }

    get baseRelationName() {
        return this.data?.baseRelationName
    }

    get resolvedBaseRecordName() {
        return this.data?.resolvedBaseRecordName
    }

    get resolvedMatchExpression() {
        return this.data?.resolvedMatchExpression
    }
}