import {RecordMutationEvent} from "../System.js";
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {assert} from "../util.js";

export type StatePatch = {
    type: 'create' | 'update' | 'delete',
    value: any,
    affectedId?: string
}

export class IncrementalComputedDataHandle extends ComputedDataHandle {
    // 需要子类复写
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]) {
        throw new Error('not implemented')
    }
    async recompute(effect: any, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]) {
        return this.incrementalCompute(effect, mutationEvent, mutationEvents)
    }
    async getLastValue(effect: any, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]){
        if (this.computedDataType === 'global') {
            return this.controller.system.storage.get('state', this.dataContext.id as string)
        } else if (this.computedDataType === 'property'){
            const idToLastValue = new Map<string, any>()
            const affectedRecordIds = Array.isArray(effect) ? effect : [effect]
            for(let id of affectedRecordIds){
                const match = MatchExp.atom({key: 'id', value: ['=', id]})
                const lastRecord = await this.controller.system.storage.findOne(this.recordName!, match)
                idToLastValue.set(id, lastRecord[this.propertyName!])
            }
            return idToLastValue
        }
    }
    async incrementalCompute(inputEffect: any, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]) {
        if (this.computedDataType === 'global') {
            const lastValue = await this.getLastValue(inputEffect, mutationEvent, mutationEvents)
            const statePatch = await this.computePatch(true, lastValue, mutationEvent, mutationEvents) as StatePatch
            if (statePatch) {
                await this.patchState(statePatch)
            }

        } else if (this.computedDataType === 'property'){
            const effects = Array.isArray(inputEffect) ? inputEffect : [inputEffect]
            for(let effect of effects){
                const lastValue = await this.getLastValue(effect, mutationEvent, mutationEvents)
                const statePatch = await this.computePatch(effect, lastValue, mutationEvent, mutationEvents) as StatePatch
                if (statePatch) {
                    await this.patchState(statePatch)
                }
            }
        } else if(this.computedDataType === 'entity' || this.computedDataType === 'relation'){
            // 不应该取原来的值，只能从事件中去做增量计算。这里可能生成很多 patch 操作
            const patchResult = await this.computePatch(true, undefined, mutationEvent, mutationEvents) as StatePatch[]
            const statePatches = patchResult ? (Array.isArray(patchResult) ? patchResult : [patchResult]) : []
            for(let statePatch of statePatches){
                await this.patchState(statePatch)
            }
        }
    }
    async computePatch(effect: any, lastValue: any, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): Promise<StatePatch|StatePatch[]|undefined> {
        throw new Error('not implemented')
    }
    async patchState(statePatch: StatePatch) {
        if (this.computedDataType === 'global') {
            // 更新全局 state
            await this.controller.system.storage.set('state', this.dataContext.id as string, statePatch.value)
        } else if (this.computedDataType === 'property'){
            // 其他都是对 record 的操作
            const newData = {
                [this.propertyName!]: statePatch.value
            }
            assert(statePatch.affectedId !== undefined, 'affectedId must be defined')
            const match = MatchExp.atom({key: 'id', value: ['=', statePatch.affectedId]})

            if (statePatch.type === 'create') {
                await this.controller.system.storage.update(this.recordName!, match, newData)
            } else if (statePatch.type === 'update') {
                // if (newData.approved_total_count!==undefined) debugger
                await this.controller.system.storage.update(this.recordName!, match, newData)
            } else if (statePatch.type === 'delete') {
                // 一个 property 的 incremental 计算，不会删除 record
                await this.controller.system.storage.update(this.recordName!, match, {[this.propertyName!]: null})
            }
        } else {
            // entity/relation
            if (statePatch.type === 'create') {
                await this.controller.system.storage.create(this.recordName!, statePatch.value)
            } else if (statePatch.type === 'update') {
                const match = MatchExp.atom({key: 'id', value: ['=', statePatch.affectedId]})
                await this.controller.system.storage.update(this.recordName!, match, statePatch.value)
            }else if(statePatch.type === 'delete'){
                const match = MatchExp.atom({key: 'id', value: ['=', statePatch.affectedId]})
                await this.controller.system.storage.delete(this.recordName!, match)
            }
        }
    }
}