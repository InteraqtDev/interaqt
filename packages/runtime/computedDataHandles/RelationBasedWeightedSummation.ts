import {IncrementalComputationHandle} from "./IncrementalComputationHandle";
import {RecordMutationEvent} from "../System";
import {IncrementalComputedDataHandle, StatePatch} from "./IncrementalComputedDataHandle";
import {KlassInstanceOf} from "../../shared/createClass";
import {Entity, Relation} from "../../shared/entity/Entity";
import {IncrementalRelationCount} from "../../shared/IncrementalComputation";
import {MatchExp} from '../../storage/erstorage/MatchExp'
import {ComputedDataHandle} from "./ComputedDataHandle";

type RelationChangeEffect = {
    affectedId:string,
    type: 'relation',
    relatedEntityRelationAttribute: string
}


type RelatedRecordChangeEffect = {
    type: 'relatedRecord'
    affectedId: string,
    // FIXME type
    relationRecord: {
        source: any,
        target:any
    }
}

// FIXME 改成真正的加权
export class RelationBasedWeightedSummation extends IncrementalComputedDataHandle {
    entityName: string = ''
    relationName: string = ''
    toCountAttributeName: string= ''
    toCountEntityName: string= ''
    // 自己是 relation 里面的 source 还是 target
    entityRelationAttribute: 'source'|'target' = 'source'
    // 自己是 relation 里面的 target 还是 source
    relatedEntityRelationAttribute: 'source'|'target' = 'target'
    isBidirectional: boolean = false
    matchExpression: (record: KlassInstanceOf<typeof Entity, false>, relation: KlassInstanceOf<typeof Relation, false>) => boolean = () => true
    // 单独抽出来让下面能覆写
    parseComputedData(){
        const computedData = this.computedData as  KlassInstanceOf<typeof IncrementalRelationCount, false>
        this.matchExpression = this.parseMatchRelationFunction(computedData.matchExpression!).bind(this.controller)
        this.toCountAttributeName = computedData.relation![computedData.relationDirection==='source' ? 'targetName1': 'targetName2']!
        this.toCountEntityName = computedData.relation![computedData.relationDirection==='source' ? 'entity2': 'entity1']!.name!
        this.entityRelationAttribute = computedData.relationDirection! as 'source'|'target'
        this.relatedEntityRelationAttribute = computedData.relationDirection === 'source' ? 'target': 'source'
        this.entityName = this.dataContext.host!.name!
        this.isBidirectional = !!computedData.isBidirectional
    }
    getDefaultValue(newRecordId?: any): any {
        return 0
    }
    async setupStates(): Promise<void> {
        this.relationName = this.controller.system.storage.getRelationName(this.entityName, this.toCountAttributeName)
    }

    parseMatchRelationFunction(stringContent:string) {
        return new Function('record', `return (${stringContent})(record)`)
    }
    async computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): Promise<RelationChangeEffect[]|RelatedRecordChangeEffect[]|undefined> {
        if (mutationEvent.recordName === this.relationName) {
            const relationEffects: RelationChangeEffect[] = this.isBidirectional ?
                [
                    {
                        affectedId: mutationEvent.record!.target.id,
                        relatedEntityRelationAttribute: 'source',
                        type: 'relation'
                    },
                    {
                        affectedId: mutationEvent.record!.source.id,
                        relatedEntityRelationAttribute: 'target',
                        type: 'relation'
                    }
                ]:
                [
                    {
                        affectedId: mutationEvent.record![this.entityRelationAttribute].id,
                        relatedEntityRelationAttribute: this.relatedEntityRelationAttribute,
                        type: 'relation'
                    }
                ]
            return relationEffects
        } else if( mutationEvent.recordName === this.toCountEntityName && mutationEvent.type === 'update'){
            const affectedRelation = await this.controller.system.storage.findOneRelationByName(this.relationName, MatchExp.atom({
                key: `${this.relatedEntityRelationAttribute}.id`,
                value: ['=', mutationEvent.oldRecord!.id]
            }), undefined, [[this.entityRelationAttribute, { attributeQuery: [this.propertyName]}], [this.relatedEntityRelationAttribute, {attributeQuery: ['id']}]])

            if (affectedRelation) {
                return [{
                    type:'relatedRecord',
                    affectedId: affectedRelation[this.entityRelationAttribute].id,
                    relationRecord:affectedRelation
                }]
            }

        }
    }
    async getLastValue(effect: RelationChangeEffect|RelatedRecordChangeEffect, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]) {
        if (effect.type === 'relation') {
            const match = MatchExp.atom({key: 'id', value: ['=', effect.affectedId]})
            const originEntity = await this.controller.system.storage.findOne(this.entityName!, match, undefined, [this.propertyName])
            return originEntity[this.propertyName!]
        } else {
            return (effect as RelatedRecordChangeEffect).relationRecord[this.entityRelationAttribute]![this.propertyName!]
        }
    }
    async computePatch(effect: RelationChangeEffect|RelatedRecordChangeEffect, originCount: number, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): Promise<StatePatch|StatePatch[]|undefined> {
        let newCount
        let isCurrentMatch = false
        let isOriginMatch = false

        let currentRecord
        let currentRelationRecord
        let oldRecord
        let oldRelationRecord

        // 计算上面的四个值
        // 先找 currentRelationRecord/oldRelationRecord
        if (mutationEvent.recordName === this.relationName ) {
            if (mutationEvent.type === 'create' || mutationEvent.type === 'update' ) {
                currentRelationRecord = await this.controller.system.storage.findOneRelationByName(this.relationName!, MatchExp.atom({
                    key: 'id',
                    value: ['=', mutationEvent.record!.id]
                }), undefined, [[this.relatedEntityRelationAttribute, { attributeQuery: ['*']}]])
            }

            // 针对 update 判断之前是否满足条件
            if (mutationEvent.type === 'update') {
                oldRelationRecord =  mutationEvent.oldRecord as KlassInstanceOf<typeof Relation, false>
            } else if (mutationEvent.type === 'delete'){
                oldRelationRecord = mutationEvent.record as KlassInstanceOf<typeof Relation, false>
            }
        } else {
            currentRelationRecord = (effect as RelatedRecordChangeEffect).relationRecord
            oldRelationRecord = (effect as RelatedRecordChangeEffect).relationRecord
        }

        // 再找 currentRecord。存在 currentRelation 才有必要找 currentRecord
        if (currentRelationRecord ) {
            const recordId = currentRelationRecord[this.relatedEntityRelationAttribute].id
            currentRecord = await this.controller.system.storage.findOne(this.toCountEntityName!, MatchExp.atom({
                key: 'id',
                value: ['=', recordId]
            }), undefined, ['*'])
        }

        // 最后找 oldRecord
        if (oldRelationRecord) {
            if (mutationEvent.recordName === this.relationName ) {
                if (mutationEvent.type === 'delete') {
                    // 先从 mutationEvents 里面找，因为可能在同一个 session 中被删除了。我们确保 record 的关系删除时间一定在 record 自身删除之前。
                    currentRecord = mutationEvents.find(event => {
                        return event.recordName === this.toCountEntityName
                            && event.type === 'delete'
                            && event.record!.id === mutationEvent.record![this.relatedEntityRelationAttribute].id
                    })?.record

                    // 如果没找到，这个 relate entity 记录应该还在数据库里
                    if (!currentRecord) {
                        currentRecord = await this.controller.system.storage.findOne(this.toCountEntityName!, MatchExp.atom({
                            key: 'id',
                            value: ['=', mutationEvent.record![this.relatedEntityRelationAttribute].id]
                        }), undefined, ['*'])
                    }
                } else {
                    oldRecord = currentRecord
                }
            } else {
                if ( mutationEvent.type === 'update' ) {
                    oldRecord = mutationEvent.oldRecord as KlassInstanceOf<typeof Entity, false>
                }
            }
        }


        if (currentRelationRecord) {
            isCurrentMatch = this.matchExpression(currentRecord, currentRelationRecord)
        }

        if (oldRelationRecord) {
            isOriginMatch = this.matchExpression(oldRecord!, oldRelationRecord as KlassInstanceOf<typeof Relation, false>)
        }

        console.log(88888, mutationEvent, isCurrentMatch, isOriginMatch, currentRecord, oldRecord, currentRelationRecord, oldRelationRecord)

        if(isCurrentMatch !== isOriginMatch) {
            newCount = originCount + (isCurrentMatch ? 1 : -1)
            // FIXME 改成引用的形式 ？storage 要支持，现在好像不支持？？？
            return {
                type: 'update',
                affectedId: effect.affectedId,
                value: newCount
            }
        }
    }
}

ComputedDataHandle.Handles.set(IncrementalRelationCount, RelationBasedWeightedSummation)