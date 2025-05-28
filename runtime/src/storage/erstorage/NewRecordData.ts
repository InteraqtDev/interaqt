import {EntityToTableMap} from "./EntityToTableMap.js";
import {flatten} from "./util.js";
import {AttributeInfo} from "./AttributeInfo.js";
import {Record} from "./RecordQueryAgent.js";
import {LINK_SYMBOL} from "./RecordQuery.js";

export type RawEntityData = { [k: string]: any }

export type FieldAndValue = {
    field: string,
    value: any,
    fieldType?: string
}

export class NewRecordData {
    // 关系往自身合并的异表新 record
    public mergedLinkTargetNewRecords: NewRecordData[] = []
    // 关系往自身合并的异表老 record
    public mergedLinkTargetRecordIdRefs: NewRecordData[] = []
    // 关系往自身合并的异表 null 值
    public mergedLinkTargetNullRecords: NewRecordData[] = []
    // 自己跟父亲之间的 relation 的数据
    public linkRecordData?: NewRecordData
    // 三表合一的 record
    public combinedNewRecords : NewRecordData[] = []
    // 三表合一的老 record
    public combinedRecordIdRefs : NewRecordData[] = []
    // 三表合一的 null 值
    public combinedNullRecords: NewRecordData[] = []
    // 往属性方向合并的异表 record
    public differentTableMergedLinkNewRecords: NewRecordData[] = []
    public differentTableMergedLinkRecordIdRefs: NewRecordData[] = []
    public differentTableMergedLinkNullRecords: NewRecordData[] = []
    // 完全关系独立的数据
    public isolatedNewRecords: NewRecordData[] = []
    public isolatedRecordIdRefs: NewRecordData[] = []
    public isolatedNullRecords: NewRecordData[] = []
    // 当时 linkRecord 的时候，source/target 就可能出现在下面
    public entityIdAttributes: AttributeInfo[] = []
    // 不包括虚拟 link
    public relatedEntitiesData: NewRecordData[] = []
    public valueAttributes: AttributeInfo[] = []

    // 和当前合表并且是  id 的。说明我们的需要的 row 已经有了，只要update 相应 column 就行了
    public sameRowEntityIdRefs: NewRecordData[] = []
    // recordName 是自己的 recordName，  info 是自己作为父亲的 attribute 的 info.
    constructor(public map: EntityToTableMap, public recordName: string, public rawData: RawEntityData, public info?: AttributeInfo, ) {
        const [valueAttributesInfo, entityAttributesInfo, entityIdAttributes] = this.map.groupAttributes(recordName, rawData ? Object.keys(rawData) : [])
        this.relatedEntitiesData = flatten(entityAttributesInfo.map(info =>
            Array.isArray(rawData[info.attributeName]) ?
                rawData[info.attributeName].map((i: RawEntityData) => new NewRecordData(this.map, info.recordName, i, info)):
                new NewRecordData(this.map, info.recordName, rawData[info.attributeName], info)
        ))

        this.valueAttributes = valueAttributesInfo
        this.entityIdAttributes = entityIdAttributes

        // TODO 要把那些独立出去的 field 排除出去。
        this.relatedEntitiesData.forEach(newRelatedEntityData => {
            // CAUTION 三表合一的情况（需要排除掉关系的 source、target 是同一实体的情况，这种情况下不算合表）
            if (newRelatedEntityData.info!.isMergedWithParent()) {
                // 三表合一的情况。记录合表的数据到底是有 id ，还是新的。如果是有 id ，说明是要  update 某一行。
                if (newRelatedEntityData.isNull()) {
                    this.combinedNullRecords.push(newRelatedEntityData)
                } else if (newRelatedEntityData.isRef()) {
                    this.combinedRecordIdRefs.push(newRelatedEntityData)
                } else {
                    // 全新的同表的数据
                    this.combinedNewRecords.push(newRelatedEntityData)
                }

            } else {

                // FIXME relatedEntitiesData 是不是要限制下，只允许那些自己能管的。
                //  因为 source/target 这样的合并之后就不规自己管了。这里也不应该处理。
                if (newRelatedEntityData.info!.isLinkMergedWithParent()) {
                    if (newRelatedEntityData.isNull()) {
                        this.mergedLinkTargetNullRecords.push(newRelatedEntityData)
                    } else if (newRelatedEntityData.isRef()) {
                        this.mergedLinkTargetRecordIdRefs.push(newRelatedEntityData)
                    } else {
                        this.mergedLinkTargetNewRecords.push(newRelatedEntityData)
                    }

                } else if(newRelatedEntityData.info!.isLinkMergedWithAttribute()) {
                    // 关系往属性方向合并的
                    if( newRelatedEntityData.isNull()) {
                        this.differentTableMergedLinkNullRecords.push(newRelatedEntityData)
                    } else if (newRelatedEntityData.isRef()) {
                        this.differentTableMergedLinkRecordIdRefs.push(newRelatedEntityData)
                    } else {
                        this.differentTableMergedLinkNewRecords.push(newRelatedEntityData)
                    }
                } else {
                    // 关系完全独立的
                    if (newRelatedEntityData.isNull()) {
                        this.isolatedNullRecords.push(newRelatedEntityData)
                    } else if (newRelatedEntityData.isRef()) {
                        this.isolatedRecordIdRefs.push(newRelatedEntityData)
                    } else {
                        this.isolatedNewRecords.push(newRelatedEntityData)
                    }

                }


            }
        })

        if (this.rawData?.[LINK_SYMBOL]) {
            this.linkRecordData = new NewRecordData(this.map, info?.linkName!, this.rawData[LINK_SYMBOL])
        }

    }


    merge(partialNewRawData: RawEntityData) {
        return new NewRecordData(this.map, this.recordName, {...this.rawData, ...partialNewRawData}, this.info)
    }

    // exclude(attributeNames: string[]) {
    //     const newRawData = {...this.rawData}
    //     attributeNames.forEach(name => delete newRawData[name])
    //     return new NewEntityData(this.map, this.recordName, newRawData, this.info)
    // }

    getRef() {
        return {id: this.rawData.id}
    }


    isRef() {
        return this.rawData?.id !== undefined
    }

    isNull() {
        return this.rawData === null
    }
    getData() : Record{
        return {...this.rawData} as Record
    }

    getSameRowFieldAndValue(oldRecord: Omit<Record, 'id'> = {}) : FieldAndValue[]{

        const newRecord = {...oldRecord, ...this.rawData}

        const result: FieldAndValue[] = this.valueAttributes.map((info) => {
            const value = info.isComputed ? info.computed!({...this.rawData, ...oldRecord}) : this.rawData[info.attributeName]
            return {
                field: info.field!,
                value,
                fieldType: info.fieldType!
            }
        })

        // CAUTION 因为我们没有标记 computed 依赖于哪些字段，所以任何字段的变化这里都要把 computed attribute 重新计算一遍。
        // CAUTION 只有更新自己的字段和递归更新三表合一的字段是需要岛上 oldRecord 的。因为我们只允许递归更新三表合一的 record。
        const recordInfo = this.map.getRecordInfo(this.recordName)
        recordInfo.valueAttributes.forEach(info => {
            if (info.isComputed) {
                const newValue = info.computed!(newRecord)
                if (newValue !== oldRecord[info.attributeName]) {
                    result.push({
                        field: info.field!,
                        value: newValue,
                        fieldType: info.fieldType!
                    })
                }
            }
        })

        // source/target 里面记录的 id
        this.entityIdAttributes.forEach(info => {
            result.push({
                field:info.linkField!,
                value: this.rawData[info.attributeName].id,
            })
        })

        // 往自己合表的关系上的 id 以及关系数据
        this.mergedLinkTargetRecordIdRefs.forEach(recordData => {
            result.push({
                field: recordData.info?.linkField!,
                value: recordData.getRef().id,
            })

            if (recordData.linkRecordData) {
                result.push(...recordData.linkRecordData.getSameRowFieldAndValue())
            }
        })

        // 有 info 说明自己是派生出来的，上层可能在创建的时候通过 & 字段来指定了要创建的关系的 attribute。
        if (this.info && this.linkRecordData && this.info.isLinkMergedWithAttribute()) {
            result.push(...this.linkRecordData.getSameRowFieldAndValue())
        }

        // 三表合一的数据
        this.combinedNewRecords.concat(this.combinedRecordIdRefs).forEach(combinedNewRecord => {
            result.push(...combinedNewRecord.getSameRowFieldAndValue(oldRecord[combinedNewRecord.info?.attributeName!]))
            if (combinedNewRecord.linkRecordData) {
                // CAUTION 外部 updateRecord 声明了只有三表合一的数据允许递归更新。所以也要带上 oldRecord，因为 related record 能也有 computed attribute。
                result.push(...combinedNewRecord.linkRecordData.getSameRowFieldAndValue(oldRecord[combinedNewRecord.info?.attributeName!]?.[LINK_SYMBOL]))
            }
        })

        return result
    }
}