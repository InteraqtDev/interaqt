import {RecordMutationEvent} from "../System.js";
import {IncrementalComputedDataHandle, StatePatch} from "./IncrementalComputedDataHandle.js";
import {Entity, KlassInstance, Relation, RelationBasedWeightedSummation} from "@interaqt/shared";
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle} from "./ComputedDataHandle.js";

type RelationChangeEffect = {
    affectedId:string,
    type: 'relation',
    info: WeightedSummationRelation
    relatedEntityRelationAttribute: string
}


type RelatedRecordChangeEffect = {
    type: 'relatedRecord'
    affectedId: string,
    info: WeightedSummationRelation
    // FIXME type
    relationRecord: {
        source: any,
        target:any
    }
}

type WeightedSummationRelation = {
    relationName: string
    toCountAttributeName: string
    toCountEntityName: string
    // 自己是 relation 里面的 source 还是 target
    entityRelationAttribute: 'source'|'target'
    // 自己是 relation 里面的 target 还是 source
    relatedEntityRelationAttribute: 'source'|'target'
    isBidirectional: boolean
}


// CAUTION 只支持 computedDataType 为 property
//  我们加权的权重必须是固定的，不能有条件判断，不然就必须每次重算。
export class RelationBasedWeightedSummationHandle extends IncrementalComputedDataHandle {
    entityName!: string
    relationInfos!: WeightedSummationRelation[]
    relations!: KlassInstance<typeof RelationBasedWeightedSummation, false>["relations"]
    mapRelationToWeight!: (record: KlassInstance<typeof Entity, false>, relation: KlassInstance<typeof Relation, false>) => number
    // 单独抽出来让下面能覆写
    parseComputedData(){
        const computedData = this.computedData as unknown as KlassInstance<typeof RelationBasedWeightedSummation, false>
        this.mapRelationToWeight = computedData.matchRelationToWeight!.bind(this.controller)
        this.entityName = this.dataContext.host!.name!
        this.relations = computedData.relations
    }
    getDefaultValue(newRecordId?: any): any {
        return 0
    }
    async setupStates(): Promise<void> {
        this.relationInfos = this.relations!.map(({relation, relationDirection}) => {
            const toCountAttributeName = relation![relationDirection==='source' ? 'sourceProperty': 'targetProperty']!
            return {
                relationName: this.controller.system.storage.getRelationName(this.entityName, toCountAttributeName),
                toCountAttributeName,
                toCountEntityName: relation![relationDirection==='source' ? 'target': 'source']!.name!,
                entityRelationAttribute : relationDirection! as 'source'|'target',
                relatedEntityRelationAttribute: relationDirection === 'source' ? 'target': 'source',
                isBidirectional : relation?.source === relation?.target && relation?.sourceProperty === relation?.targetProperty
            }
        })
    }

    parseMapRelationFunction(content:string) {
        return new Function('record','relation', `return (${content})(record,relation)`)
    }
    // 这里不管是 relation 的变化，还是 relatedRecord 的变化，都会应该触发相应的 relation 重新计算权重差量
    async computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): Promise<RelationChangeEffect[]|RelatedRecordChangeEffect[]|undefined> {
        const matchedRelation = this.relationInfos.find(({relationName}) => relationName === mutationEvent.recordName)
        if (matchedRelation) {
            const infoRecord = mutationEvent.type === 'update' ? mutationEvent.oldRecord! : mutationEvent.record!
            const relationEffects: RelationChangeEffect[] = matchedRelation.isBidirectional ?
                [
                    {
                        affectedId: infoRecord.target.id,
                        relatedEntityRelationAttribute: 'source',
                        info: matchedRelation,
                        type: 'relation'
                    },
                    {
                        affectedId: infoRecord.source.id,
                        relatedEntityRelationAttribute: 'target',
                        info: matchedRelation,
                        type: 'relation'
                    }
                ]:
                [
                    {
                        affectedId: infoRecord[matchedRelation.entityRelationAttribute].id,
                        relatedEntityRelationAttribute: matchedRelation.relatedEntityRelationAttribute,
                        info: matchedRelation,
                        type: 'relation'
                    }
                ]
            return relationEffects
        }

        // 对 relatedRecord 只判断 update 事件就够了
        if (mutationEvent.type === 'update') {
            const matchedRecordRelationInfo = this.relationInfos.find(({toCountEntityName}) => toCountEntityName === mutationEvent.recordName)
            if (matchedRecordRelationInfo) {
                const affectedRelation = await this.controller.system.storage.findOneRelationByName(matchedRecordRelationInfo.relationName, MatchExp.atom({
                    key: `${matchedRecordRelationInfo.relatedEntityRelationAttribute}.id`,
                    value: ['=', mutationEvent.oldRecord!.id]
                }), undefined, [[matchedRecordRelationInfo.entityRelationAttribute, { attributeQuery: [this.propertyName]}], [matchedRecordRelationInfo.relatedEntityRelationAttribute, {attributeQuery: ['id']}]])

                if (affectedRelation) {
                    return [{
                        type:'relatedRecord',
                        info: matchedRecordRelationInfo,
                        affectedId: affectedRelation[matchedRecordRelationInfo.entityRelationAttribute].id,
                        relationRecord:affectedRelation
                    }]
                }
            }
        }
    }
    async getLastValue(effect: RelationChangeEffect|RelatedRecordChangeEffect, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]) {
        if (effect.type === 'relation') {
            const match = MatchExp.atom({key: 'id', value: ['=', effect.affectedId]})
            const originEntity = await this.controller.system.storage.findOne(this.entityName!, match, undefined, [this.propertyName!])
            return originEntity[this.propertyName!]
        } else {
            // 因为 effect 里面查过一次了，所以这里节约性能直接获取就行了。
            return (effect as RelatedRecordChangeEffect).relationRecord[effect.info.entityRelationAttribute]![this.propertyName!]
        }
    }
    async computePatch(effect: RelationChangeEffect|RelatedRecordChangeEffect, lastSummation: number, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): Promise<StatePatch|StatePatch[]|undefined> {
        let currentWeight = 0
        let originWeight = 0

        let currentRecord
        let currentRelationRecord
        let oldRecord
        let oldRelationRecord

        const { entityRelationAttribute, relatedEntityRelationAttribute, relationName, toCountAttributeName, toCountEntityName, isBidirectional } = effect.info

        const a = await this.controller.system.storage.find('Request', undefined, undefined, ['*'])
        // 计算上面的四个值，构建成 isCurrentMatch/isOriginMatch 的计算参数
        // 先找 currentRelationRecord/oldRelationRecord
        if (mutationEvent.recordName === relationName ) {

            if (mutationEvent.type === 'create' || mutationEvent.type === 'update' ) {
                const infoRecord = mutationEvent.type === 'update' ? mutationEvent.oldRecord! : mutationEvent.record!

                currentRelationRecord = await this.controller.system.storage.findOneRelationByName(relationName!, MatchExp.atom({
                    key: 'id',
                    value: ['=', infoRecord.id]
                }), undefined, ['*', [relatedEntityRelationAttribute, { attributeQuery: ['*']}]])
            }

            // 针对 update 判断之前是否满足条件
            if (mutationEvent.type === 'update') {
                oldRelationRecord =  mutationEvent.oldRecord as KlassInstance<typeof Relation, false>
            } else if (mutationEvent.type === 'delete'){
                oldRelationRecord = mutationEvent.record as KlassInstance<typeof Relation, false>
            }
        } else if(mutationEvent.recordName === toCountEntityName && mutationEvent.type === 'update'){
            currentRelationRecord = (effect as RelatedRecordChangeEffect).relationRecord
            oldRelationRecord = (effect as RelatedRecordChangeEffect).relationRecord
        }

        // 再找 currentRecord。存在 currentRelation 才有必要找 currentRecord
        if (currentRelationRecord ) {
            const recordId = currentRelationRecord[relatedEntityRelationAttribute].id
            currentRecord = await this.controller.system.storage.findOne(toCountEntityName!, MatchExp.atom({
                key: 'id',
                value: ['=', recordId]
            }), undefined, ['*'])
        }

        // 最后找 oldRecord
        if (oldRelationRecord) {
            if (mutationEvent.recordName === relationName ) {
                if (mutationEvent.type === 'delete') {
                    // 先从 mutationEvents 里面找，因为可能在同一个 session 中被删除了。我们确保 record 的关系删除时间一定在 record 自身删除之前。
                    oldRecord = mutationEvents.find(event => {
                        return event.recordName === toCountEntityName
                            && event.type === 'delete'
                            && event.record!.id === mutationEvent.record![relatedEntityRelationAttribute].id
                    })?.record

                    // 如果没找到，这个 relate entity 记录应该还在数据库里
                    if (!oldRecord) {
                        oldRecord = await this.controller.system.storage.findOne(toCountEntityName!, MatchExp.atom({
                            key: 'id',
                            value: ['=', mutationEvent.record![relatedEntityRelationAttribute].id]
                        }), undefined, ['*'])
                    }
                } else {
                    oldRecord = currentRecord
                }
            } else {
                if ( mutationEvent.type === 'update' ) {
                    oldRecord = mutationEvent.oldRecord as KlassInstance<typeof Entity, false>
                }
            }
        }


        if (currentRelationRecord) {
            currentWeight = this.mapRelationToWeight(currentRecord, currentRelationRecord)
        }

        if (oldRelationRecord) {
            originWeight = this.mapRelationToWeight(oldRecord!, oldRelationRecord as KlassInstance<typeof Relation, false>)
        }

        if(currentWeight !== originWeight) {
            // FIXME 改成引用的形式, 例如 “+1” 这样就不用获取上一次的值了 ？storage 要支持，现在好像不支持？？？
            return {
                type: 'update',
                affectedId: effect.affectedId,
                value: lastSummation + (currentWeight - originWeight)
            }
        }
    }
}

ComputedDataHandle.Handles.set(RelationBasedWeightedSummation, RelationBasedWeightedSummationHandle)