import {AttributeInfo, EntityToTableMap} from "./EntityToTableMap";
import {assert} from "../util.ts";
import {flatten} from "./util.ts";

export type RawEntityData = { [k: string]: any }

export class NewEntityData {
    // 同表的新数据，或者关系表往这边和了的有 id 的 field,一起记录下来可以一次性插入的。
    public sameRowEntityValuesAndRefFields: [string, string][]
    public sameRowNewEntitiesData: NewEntityData[] = []
    public relatedEntitiesData: NewEntityData[] = []
    public differentTableEntitiesData: NewEntityData[] = []
    public holdFieldNewRelatedEntities: NewEntityData[] = []
    public holdMyFieldRelatedEntities: NewEntityData[] = []
    public valueAttributes: [string, any][]
    // 和当前合表并且是  id 的。说明我们的需要的 row 已经有了，只要update 相应 column 就行了
    public sameRowEntityIdRefs: NewEntityData[] = []

    constructor(public map: EntityToTableMap, public recordName: string, public rawData: RawEntityData, public info?: AttributeInfo) {
        const [valueAttributesInfo, entityAttributesInfo] = this.map.groupAttributes(recordName, Object.keys(rawData))
        this.relatedEntitiesData = flatten(entityAttributesInfo.map(info =>
            Array.isArray(rawData[info.attributeName]) ?
                rawData[info.attributeName].map(i => new NewEntityData(this.map, info.entityName, i, info)):
                new NewEntityData(this.map, info.entityName, rawData[info.attributeName], info)
        ))

        this.valueAttributes = valueAttributesInfo.map(info => {
            return [info.attributeName!, rawData[info.attributeName]]
        })
        // TODO 要把那些独立出去的 field 排除出去。
        this.sameRowEntityValuesAndRefFields = valueAttributesInfo.map(info => [info.field, rawData[info.attributeName]])
        this.relatedEntitiesData.forEach(newRelatedEntityData => {
            // CAUTION 三表合一的情况（需要排除掉关系的 source、target 是同一实体的情况，这种情况下不算合表）
            if (newRelatedEntityData.info!.isMergedWithParent()) {
                // 三表合一的情况。记录合表的数据到底是有 id ，还是新的。如果是有 id ，说明是要  update 某一行。
                if (newRelatedEntityData.isRef()) {
                    this.sameRowEntityIdRefs.push(newRelatedEntityData)
                } else {
                    this.sameRowNewEntitiesData.push(newRelatedEntityData)
                    // 全新的同表的数据
                    this.sameRowEntityValuesAndRefFields.push(...newRelatedEntityData.sameRowEntityValuesAndRefFields)
                }
            } else {
                // 有 field 说明是关系表合并到了当前实体表，一起处理
                if (newRelatedEntityData.info!.field) {
                    if (newRelatedEntityData.isRef()) {
                        this.sameRowEntityValuesAndRefFields.push([newRelatedEntityData.info!.field, newRelatedEntityData.getRef().id])
                    } else {
                        // 没有 id 的说明要单独新建
                        this.holdFieldNewRelatedEntities.push(newRelatedEntityData)
                    }
                } else {

                    // 把 hold 我的 field 的 record 识别出来。
                    const linkInfo = newRelatedEntityData.info!.getLinkInfo()
                    if (linkInfo.isRecordSource(this.recordName) ? linkInfo.isMergedToTarget() : linkInfo.isMergedToSource()) {
                        this.holdMyFieldRelatedEntities.push(newRelatedEntityData)
                    } else {
                        // 完全没合表的
                        this.differentTableEntitiesData.push(newRelatedEntityData)
                    }


                }
            }
        })

    }

    derive(newRawData: RawEntityData) {
        return new NewEntityData(this.map, this.recordName, newRawData, this.info)
    }

    merge(partialNewRawData: RawEntityData) {
        return new NewEntityData(this.map, this.recordName, {...this.rawData, ...partialNewRawData}, this.info)
    }

    exclude(attributeNames: string[]) {
        const newRawData = {...this.rawData}
        attributeNames.forEach(name => delete newRawData[name])
        return new NewEntityData(this.map, this.recordName, newRawData, this.info)
    }

    getRef() {
        return {id: this.rawData.id}
    }

    getData() {
        return {...this.rawData}
    }

    isRef() {
        return !!(this.info?.isRecord && this.rawData["id"] !== undefined)
    }

    getIdField() {
        const recordInfo = this.map.getRecordInfo(this.recordName)
        return recordInfo.idField!
    }

    getIdFieldAndValue(): [string, string] {
        assert(this.isRef(), 'is not ref')
        const recordInfo = this.map.getRecordInfo(this.recordName)
        return [recordInfo.idField!, this.rawData.id!]
    }
}