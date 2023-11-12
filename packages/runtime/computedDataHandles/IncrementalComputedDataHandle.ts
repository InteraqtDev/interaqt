import {RecordMutationEvent} from "../System";
import {MatchExp} from '../../storage/erstorage/MatchExp'
import {ComputedDataHandle} from "./ComputedDataHandle";

export type StatePatch = {
    type: 'create' | 'update' | 'delete',
    value: any,
    affectedId: string
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
            const statePatches = await this.computePatch(true, undefined, mutationEvent, mutationEvents) as StatePatch[]
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
        } else {
            // 其他都是对 record 的操作
            const newData = {
                [this.propertyName!]: statePatch.value
            }
            if (statePatch.type === 'create') {
                await this.controller.system.storage.create(this.recordName!, newData)
            } else if (statePatch.type === 'update') {
                const match = MatchExp.atom({key: 'id', value: ['=', statePatch.affectedId]})
                await this.controller.system.storage.update(this.recordName!, match, newData)
            } else if (statePatch.type === 'delete') {
                const match = MatchExp.atom({key: 'id', value: ['=', statePatch.affectedId]})
                await this.controller.system.storage.delete(this.recordName!, match)
            }

        }
    }
}