import {EntityToTableMap} from "./EntityToTableMap";
import {assert} from "../util.ts";
import {flatten} from "./util.ts";
import {AttributeInfo} from "./AttributeInfo.ts";

export type RawEntityData = { [k: string]: any }

export class NewRecordData {
    // 关系往自身合并的异表新 record
    public mergedLinkTargetNewRecords: NewRecordData[] = []
    // 关系往自身合并的异表老 record
    public mergedLinkTargetRecordIdRefs: NewRecordData[] = []
    // 自己跟父亲之间的 relation 的数据
    public linkRecordData: NewRecordData
    // 三表合一的 record
    public combinedNewRecords : NewRecordData[] = []
    // 三表合一的老 record
    public combinedRecordIdRefs : NewRecordData[] = []
    // 往属性方向合并的异表 record
    public differentTableMergedLinkNewRecords: NewRecordData[] = []
    public differentTableMergedLinkRecordIdRefs: NewRecordData[] = []
    // 完全关系独立的数据
    public isolatedNewRecords: NewRecordData[] = []
    public isolatedRecordIdRefs: NewRecordData[] = []
    // 当时 linkRecord 的时候，source/target 就可能出现在下面
    public entityIdAttributes: AttributeInfo[] = []

    public relatedEntitiesData: NewRecordData[] = []
    public valueAttributes: AttributeInfo[]

    // 和当前合表并且是  id 的。说明我们的需要的 row 已经有了，只要update 相应 column 就行了
    public sameRowEntityIdRefs: NewRecordData[] = []

    constructor(public map: EntityToTableMap, public recordName: string, public rawData: RawEntityData, public info?: AttributeInfo, ) {
        const [valueAttributesInfo, entityAttributesInfo, entityIdAttributes] = this.map.groupAttributes(recordName, rawData ? Object.keys(rawData) : [])
        this.relatedEntitiesData = flatten(entityAttributesInfo.map(info =>
            Array.isArray(rawData[info.attributeName]) ?
                rawData[info.attributeName].map(i => new NewRecordData(this.map, info.recordName, i, info)):
                new NewRecordData(this.map, info.recordName, rawData[info.attributeName], info)
        ))

        this.valueAttributes = valueAttributesInfo
        this.entityIdAttributes = entityIdAttributes

        // TODO 要把那些独立出去的 field 排除出去。
        this.relatedEntitiesData.forEach(newRelatedEntityData => {
            // CAUTION 三表合一的情况（需要排除掉关系的 source、target 是同一实体的情况，这种情况下不算合表）
            if (newRelatedEntityData.info!.isMergedWithParent()) {
                // 三表合一的情况。记录合表的数据到底是有 id ，还是新的。如果是有 id ，说明是要  update 某一行。
                if (newRelatedEntityData.isRef()) {
                    this.combinedRecordIdRefs.push(newRelatedEntityData)
                } else {
                    // 全新的同表的数据
                    this.combinedNewRecords.push(newRelatedEntityData)
                }

            } else {

                // FIXME relatedEntitiesData 是不是要限制下，只允许那些自己能管的。
                //  因为 source/target 这样的合并之后就不规自己管了。这里也不应该处理。
                if (newRelatedEntityData.info!.isLinkMergedWithParent()) {
                    if (newRelatedEntityData.isRef()) {
                        this.mergedLinkTargetRecordIdRefs.push(newRelatedEntityData)
                    } else {
                        this.mergedLinkTargetNewRecords.push(newRelatedEntityData)
                    }

                } else if(newRelatedEntityData.info!.isLinkMergedWithAttribute()) {
                    // 关系往属性方向合并的
                    if( newRelatedEntityData.isRef()) {
                        this.differentTableMergedLinkRecordIdRefs.push(newRelatedEntityData)
                    } else {
                        this.differentTableMergedLinkNewRecords.push(newRelatedEntityData)
                    }
                } else {
                    // 关系完全独立的
                    if (newRelatedEntityData.isRef()) {
                        this.isolatedRecordIdRefs.push(newRelatedEntityData)
                    } else {
                        this.isolatedNewRecords.push(newRelatedEntityData)
                    }

                }


            }
        })

        if (this.rawData?.['&']) {
            this.linkRecordData = new NewRecordData(this.map, info?.linkName, this.rawData['&'])
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
    getData() {
        return {...this.rawData}
    }

    getSameRowFieldAndValue() : {field:string, value:any}[]{
        // 自身的 attribute
        const result: {field:string, value:any}[] = this.valueAttributes.map((info) => ({
            field: info.field,
            value: this.rawData[info.attributeName]
        }))

        // source/target 里面记录的 id
        this.entityIdAttributes.forEach(info => {
            result.push({
                field:info.field,
                value: this.rawData[info.attributeName].id
            })
        })

        // 往自己合表的关系上的 id 以及关系数据
        this.mergedLinkTargetRecordIdRefs.forEach(recordData => {
            result.push({
                field: recordData.info?.linkField,
                value: recordData.getRef().id
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
            result.push(...combinedNewRecord.getSameRowFieldAndValue())
            if (combinedNewRecord.linkRecordData) {
                result.push(...combinedNewRecord.linkRecordData.getSameRowFieldAndValue())
            }
        })


        return result
    }
}