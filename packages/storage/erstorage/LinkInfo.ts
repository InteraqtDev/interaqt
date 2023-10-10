import {RecordInfo} from "./RecordInfo.ts";
import {assert} from "../util.ts";
import {EntityToTableMap, LinkMapItem, RecordMapItem} from "./EntityToTableMap.ts";

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
        return this.isManyToMany || this.isOneToMany
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

    get record(): RecordMapItem {
        return this.map.getRecord(this.name)!
    }
    get recordInfo(): RecordInfo {
        return this.map.getRecordInfo(this.name)
    }

    get table() {
        return this.record?.table
    }

    get isTargetReliance() {
        return this.data.isTargetReliance
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
    isIsolated() {
        return !this.data.mergedTo
    }

    isSymmetric() {
        return this.data.sourceRecord === this.data.targetRecord && this.data.sourceAttribute === this.data.targetAttribute
    }
    isRelationSource(recordName: string, attribute: string) {
        return this.data.sourceRecord === recordName && this.data.sourceAttribute === attribute
    }



    getAttributeName(recordName: string, attribute: string) {
        assert(!!recordName && !!attribute, `${recordName}, ${attribute} cannot be empty`)
        return this.isRelationSource(recordName, attribute) ? ['source', 'target'] : ['target', 'source']
    }
}