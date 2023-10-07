import {assert} from "../util.ts";
import {EntityToTableMap, RecordAttribute, ValueAttribute} from "./EntityToTableMap.ts";

export class AttributeInfo {
    public data: ValueAttribute | RecordAttribute

    constructor(public parentEntityName: string, public attributeName: string, public map: EntityToTableMap) {
        this.data = this.map.data.records[parentEntityName].attributes[attributeName]
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
        return this.isManyToMany || this.isOneToMany
    }

    get isReliance() {
        return (this.data as RecordAttribute).isReliance
    }

    get recordName() {
        assert(this.isRecord, `${this.attributeName} is not a entity`)
        return (this.data as RecordAttribute).recordName
    }

    get table() {
        assert(this.isRecord, `${this.attributeName} is not a entity`)
        return this.map.getRecord((this.data as RecordAttribute).recordName).table
    }

    // FIXME 改好
    get field() {
        if (this.isValue) {
            return (this.data as ValueAttribute).field
        } else {
            if (this.isManyToOne && this.isLinkMergedWithParent()) {
                if (this.data.field) return this.data.field
                const linkInfoRecord = this.getLinkInfo().record
                return this.isRecordSource() ? linkInfoRecord.attributes.target.field : linkInfoRecord.attributes.source.field
            }
        }
    }

    get linkField() {
        if (this.isRecord && this.isManyToOne && this.isLinkMergedWithParent()) {
            // 如果parent 是 linkRecord， source/target 这样的 field 就是 attribute 上面在管。
            if (this.data.field) return this.data.field

            const linkInfoRecord = this.getLinkInfo().record
            return this.isRecordSource() ? linkInfoRecord?.attributes.target.field : linkInfoRecord?.attributes.source.field
        }
    }

    get linkName() {
        return (this.data as RecordAttribute).linkName
    }

    isMergedWithParent() {
        return this.getLinkInfo().isCombined()
    }

    isLinkMergedWithParent() {
        const linkInfo = this.getLinkInfo()
        return linkInfo.isRelationSource(this.parentEntityName, this.attributeName) ? linkInfo.isMergedToSource() : linkInfo.isMergedToTarget()
    }

    isLinkMergedWithAttribute() {
        const linkInfo = this.getLinkInfo()
        return linkInfo.isRelationSource(this.parentEntityName, this.attributeName) ? linkInfo.isMergedToTarget() : linkInfo.isMergedToSource()
    }

    isRecordSource() {
        return this.getLinkInfo().isRelationSource(this.parentEntityName, this.attributeName)
    }

    getReverseInfo() {
        const reverseAttribute = this.map.getReverseAttribute(this.parentEntityName, this.attributeName)
        if (!reverseAttribute) return undefined
        return this.map.getInfo(this.recordName, reverseAttribute)
    }

    getLinkInfo() {
        assert(this.isRecord, `only record attribute can get linkInfo`)
        return this.map.getLinkInfo(this.parentEntityName, this.attributeName)
    }

    getRecordInfo() {
        assert(this.isRecord, `only record attribute can get linkInfo`)
        return this.map.getRecordInfo(this.recordName)
    }
}