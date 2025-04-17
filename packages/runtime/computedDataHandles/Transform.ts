import {Entity, KlassInstance, MapInteraction, Relation, Transform} from "@interaqt/shared";
import {InteractionEventArgs} from "../types/interaction.js";
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {EVENT_RECORD, InteractionEventRecord, RecordMutationEvent} from "../System.js";
import { IncrementalComputedDataHandle, StatePatch } from "./IncrementalComputedDataHandle.js";

type TransformCallback = (event: any) => any


export class TransformHandle extends IncrementalComputedDataHandle {
    transform!: TransformCallback
    // 单独抽出来让下面能覆写
    parseComputedData(){
        const computedData = this.computedData as unknown as KlassInstance<typeof Transform>
        this.transform = computedData.callback!.bind(this.controller) as TransformCallback
    }
    getDefaultValue(newRecordId?: any): any {
        return []
    }
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): KlassInstance<any>|undefined {
        return undefined
    }
    async getLastValue(effect: any, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]) {
    }
    async computePatch(effect: KlassInstance<any>, lastValue: any, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): Promise<StatePatch|StatePatch[]|undefined> {
        if (mutationEvent.type === 'create') {
            const newValue= this.transform(mutationEvent.record)
            return {
                type: 'create',
                value: newValue
            }
        } else if (mutationEvent.type === 'update') {
            const newValue= this.transform(mutationEvent.record)
            return {
                type: 'update',
                value: newValue,
                affectedId: mutationEvent.record!.id
            }
        } else if (mutationEvent.type === 'delete') {
            return {
                type: 'delete',
                affectedId: mutationEvent.record!.id
            }
        }
    }
}

ComputedDataHandle.Handles.set(Transform, {
    global: TransformHandle,
    entity: TransformHandle,
    relation: TransformHandle,
    property: TransformHandle
})