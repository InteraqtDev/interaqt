import {KlassInstanceOf} from "../../shared/createClass";
import {Controller} from "../Controller";
import {PropertyIncrementalComputationHandle} from "./IncrementalComputationHandle";
import {Entity, Property, Relation} from "../../shared/entity/Entity";
import { MapActivityToEntity, IncrementalRelationCount } from '../../shared/IncrementalComputation'
import {MatchExp} from '../../storage/erstorage/MatchExp'
import {RecordMutationEvent} from "../System";


// 监听某个实体的某个关联实体以及关系上的变化，并自动 count 符合条件的关系
export class IncrementalRelationCountHandle extends PropertyIncrementalComputationHandle {
    matchExpression: (record: KlassInstanceOf<typeof Entity, false>, relation: KlassInstanceOf<typeof Relation, false>) => boolean
    toCountAttributeName: string
    computedData: KlassInstanceOf<typeof IncrementalRelationCount, false>
    propertyName: string
    toCountEntityName: string
    // 自己是 relation 里面的 source 还是 target
    entityRelationAttribute: string
    // 自己是 relation 里面的 target 还是 source
    relatedEntityRelationAttribute: string
    constructor(public controller: Controller, public entity: KlassInstanceOf<typeof Entity, false>|KlassInstanceOf<typeof Relation, false>, public property: KlassInstanceOf<typeof Property, false>) {
        super(controller,entity, property);
        this.propertyName = this.property.name!
        this.computedData = property.computedData as KlassInstanceOf<typeof IncrementalRelationCount, false>
        this.toCountAttributeName = this.computedData.relation![this.computedData.relationDirection==='source' ? 'targetName1': 'targetName2']!
        this.toCountEntityName = this.computedData.relation![this.computedData.relationDirection==='source' ? 'entity2': 'entity1']!.name!
        this.entityRelationAttribute = this.computedData.relationDirection!
        this.relatedEntityRelationAttribute = this.computedData.relationDirection === 'source' ? 'target': 'source'

        this.matchExpression = this.parseMatchRelationFunction(this.computedData.matchExpression!).bind(this.controller)
        this.listenRecordChange()
    }
    parseComputeSourceFunction(stringContent: string) {
        return new Function('mutationEvent', `return (${stringContent})( mutationEvent)`)
    }
    // 用来做全量计算的
    parseMatchRelationFunction(stringContent:string) {
        return new Function('record', `return (${stringContent})(record)`)
    }
    // 全量计算恢复数据
    async recoverComputedData() {
        const entityRecords = await this.controller.system.storage.find(this.entity.name!, undefined, undefined,
            [[this.toCountAttributeName, {attributeQuery:['*']}]])

        for(let entityRecord of entityRecords) {
            await this.controller.system.storage.update(this.entity.name!, entityRecord.id, {[this.propertyName]: entityRecord[this.toCountAttributeName].length})
        }
    }

    listenRecordChange(){
        this.controller.system.storage.listen(this.onRecordChange)
    }
    async insertDefaultValue(newRecord: any) {
        const match = MatchExp.atom({key: 'id', value: ['=', newRecord.id]})
        return this.controller.system.storage.update(this.entity.name!, match, {[this.propertyName]: 0})
    }
    async updateCountForRelationChange(mutationEvent: RecordMutationEvent,mutationEvents: RecordMutationEvent[]) {
        const toCountRelationName = this.controller.system.storage.getRelationName(this.entity.name, this.toCountAttributeName)
        // 1. 用 computeSource 判断是否引发增量计算，并计算影响的记录。它一定要返回真实受影响的。如果没返回说明没有受影响。
        console.log(44444, mutationEvent)
        const affectedIds = this.computedData.isBidirectional ?
            [ { affectedId: mutationEvent.record!.target.id, relatedEntityRelationAttribute: 'source' }, { affectedId: mutationEvent.record!.source.id, relatedEntityRelationAttribute: 'target' }]:
            [ { affectedId: mutationEvent.record![this.entityRelationAttribute].id, relatedEntityRelationAttribute: this.relatedEntityRelationAttribute }]

        for(let {affectedId, relatedEntityRelationAttribute} of affectedIds) {
            const match = MatchExp.atom({key: 'id', value: ['=', affectedId]})
            const originEntity = await this.controller.system.storage.findOne(this.entity!.name!, match, undefined, [this.propertyName])
            const originCount = originEntity[this.propertyName]
            let newCount

            let isCurrentMatch = false
            let isOriginMatch = false
            // 如果是关系的新增和删除
            if (mutationEvent.type === 'create' || mutationEvent.type === 'update') {

                const relationRecord = await this.controller.system.storage.findOneRelationByName(toCountRelationName!, MatchExp.atom({
                    key: 'id',
                    value: ['=', mutationEvent.record!.id]
                }), undefined, [[relatedEntityRelationAttribute, { attributeQuery: ['*']}]])

                // 如果更新后的 record 记录是符合条件的，那么 count+1，否则 count-1
                const relatedRecord = relationRecord[relatedEntityRelationAttribute]
                isCurrentMatch = this.matchExpression(relatedRecord, relationRecord)

                // 针对 update 判断之前是否满足条件
                if (mutationEvent.type === 'update') {
                    isOriginMatch = this.matchExpression(relatedRecord, mutationEvent.oldRecord as KlassInstanceOf<typeof Relation, false>)
                }
            }

            // 判断 delete 之前的是否满足
            if (mutationEvent.type === 'delete') {
                let relatedRecord
                // 先从 mutationEvents 里面找，因为可能在同一个 session 中被删除了。我们确保 record 的关系删除时间一定在 record 自身删除之前。
                relatedRecord = mutationEvents.find(event => {
                    return event.recordName === this.toCountEntityName
                        && event.type === 'delete'
                        && event.record!.id === mutationEvent.record![relatedEntityRelationAttribute].id
                })?.record

                // 如果没找到，这个 relate entity 记录应该还在数据库里
                if (!relatedRecord) {
                    relatedRecord = await this.controller.system.storage.findOne(this.toCountEntityName!, MatchExp.atom({
                        key: 'id',
                        value: ['=', mutationEvent.record![relatedEntityRelationAttribute].id]
                    }), undefined, ['*'])
                }

                if (!relatedRecord) throw new Error('找不到关联记录')
                isOriginMatch = this.matchExpression(relatedRecord, mutationEvent.record as KlassInstanceOf<typeof Relation, false>)
            }

            if(isCurrentMatch !== isOriginMatch) {
                newCount = originCount + (isCurrentMatch ? 1 : -1)
                // FIXME 改成引用的形式 ？storage 要支持，现在好像不支持？？？
                await this.controller.system.storage.update(this.entity.name!, match, {[this.propertyName]: newCount})
            }
        }

    }
    async updateCountForRelatedRecordChange(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]) {
        // 只处理关联实体的更新事件，它的删除等事件和我不相关，相关的是关系的删除事件
        if (mutationEvent.type === 'update') {
            const toCountRelationName = this.controller.system.storage.getRelationName(this.entity.name, this.toCountAttributeName)

            const affectedRelation = await this.controller.system.storage.findOneRelationByName(toCountRelationName, MatchExp.atom({
                key: `${this.relatedEntityRelationAttribute}.id`,
                value: ['=', mutationEvent.oldRecord!.id]
            }), undefined, [[this.entityRelationAttribute, { attributeQuery: [this.propertyName]}]])

            const isCurrentMatch = this.matchExpression(mutationEvent.record! as KlassInstanceOf<typeof Entity, false>, affectedRelation)
            const isOriginMatch = this.matchExpression(mutationEvent.oldRecord! as KlassInstanceOf<typeof Entity, false>, affectedRelation)

            if(isCurrentMatch !== isOriginMatch) {
                const originCount = affectedRelation[this.entityRelationAttribute][this.propertyName]
                const newCount = originCount + (isCurrentMatch ? 1 : -1)
                // FIXME 改成引用的形式 ？storage 要支持，现在好像不支持？？？
                await this.controller.system.storage.update(this.entity.name!, MatchExp.atom({key: 'id', value: ['=', affectedRelation[this.entityRelationAttribute].id]}), {[this.propertyName]: newCount})
            }
        }
    }
    // 这里监听了的事件：
    //   关联实体&关系的更新
    //   关联关系的新增
    //   关联关系的删除
    // 无法监听关联实体的子孙关联实体的变化，如果需要，应该把他们都通过 computedData 写到当前的关联实体上
    onRecordChange = async (mutationEvents:RecordMutationEvent[]) => {
        const toCountRelationName = this.controller.system.storage.getRelationName(this.entity.name, this.toCountAttributeName)

        for(let mutationEvent of mutationEvents) {
            if (mutationEvent.recordName === this.entity.name && mutationEvent.type === 'create') {
                await this.insertDefaultValue(mutationEvent.record)
            } else if (mutationEvent.recordName === toCountRelationName) {
                await this.updateCountForRelationChange(mutationEvent, mutationEvents)
            } else if( mutationEvent.recordName === this.toCountEntityName){
                await this.updateCountForRelatedRecordChange(mutationEvent, mutationEvents)
            }
        }
    }
}
PropertyIncrementalComputationHandle.Handles.set(IncrementalRelationCount, IncrementalRelationCountHandle)