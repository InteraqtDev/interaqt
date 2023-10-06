import {AttributeInfo} from "./AttributeInfo.ts";
import {EntityToTableMap, RecordAttribute, RecordMapItem} from "./EntityToTableMap.ts";
import {flatten} from "./util.ts";

export class RecordInfo {
    data: RecordMapItem

    constructor(public name: string, public map: EntityToTableMap) {
        this.data = this.map.data.records[name]!
    }


    get combinedRecords() {
        return Object.keys(this.data.attributes).map(attribute => {
            return new AttributeInfo(this.name, attribute, this.map)
        }).filter(info => info.isRecord && info.isMergedWithParent())
    }

    get table() {
        return this.map.getRecordTable(this.name)
    }

    get idField() {
        return this.data.attributes.id.field
    }

    get sameRowFields() {
        const valueFields = this.valueAttributes.map(info => info.field)

        const linkFields = this.strictRecordAttributes.filter(info => {
            return info.isLinkMergedWithParent()
        }).map(info => {
            console.log(info.attributeName)
            return info.getLinkInfo().recordInfo.sameRowFields
        })

        const relianceFields = this.reliance.filter(info => {
            return info.getRecordInfo().table === this.table
        }).map(info => info.getRecordInfo().sameRowFields)

        return valueFields.concat(...linkFields, ...relianceFields)
    }

    get allFields(): string[] {
        return Object.values(this.data.attributes).map(a => a.field!).filter(x => x)
    }

    get strictRecordAttributes() {
        return Object.keys(this.data.attributes).filter(attribute => {
            const attributeData = this.data.attributes[attribute] as  RecordAttribute
            // CAUTION linkRecord 中有 field 就不能算了。比如 source/target
            return attributeData.isRecord && !attributeData.field
        }).map(attribute => {
            return new AttributeInfo(this.name, attribute, this.map)
        })
    }
    get differentTableRecordAttributes() {
        return this.strictRecordAttributes.filter(info => info.table !== this.table)
    }

    get differentTableRecords() {
        return Object.keys(this.data.attributes).map(attribute => {
            return new AttributeInfo(this.name, attribute, this.map)
        }).filter(info =>
            info.isRecord && !info.isMergedWithParent() && !info.field
        )
    }

    get reliance(): AttributeInfo[] {
        return Object.keys(this.data.attributes).filter(attribute => {
            if (!(this.data.attributes[attribute] as RecordAttribute).isReliance) return false
        }).map(attribute => {
            return new AttributeInfo(this.name, attribute, this.map)
        })
    }

    get notReliantCombined() :AttributeInfo[] {
        return this.combinedRecords.filter(info => {
            return !info.isReliance
        })
    }

    get differentTableReliance(): AttributeInfo[] {
        return this.reliance.filter(info => {
            return info.table !== this.table
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
}