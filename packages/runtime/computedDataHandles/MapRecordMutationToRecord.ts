import {ComputedData, Entity, Interaction, KlassInstance, MapRecordMutationToRecord} from "@interaqt/shared";
import {Controller} from "../Controller.js";
import {ComputedDataHandle, DataContext} from "./ComputedDataHandle.js";
import {RecordMutationEvent} from "../System.js";
import {IncrementalComputedDataHandle, StatePatch} from "./IncrementalComputedDataHandle.js";

export class MapInteractionToRecordHandle extends IncrementalComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItem!: (mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]) => any
    constructor(controller: Controller , computedData: KlassInstance<typeof ComputedData, false> , dataContext:  DataContext) {
        super(controller, computedData, dataContext);
    }
    parseComputedData() {
        const computedData = this.computedData as unknown as  KlassInstance<typeof MapRecordMutationToRecord, false>
        this.data = this.dataContext.id as KlassInstance<typeof Entity, false>
        this.mapItem = (computedData.handle! as (mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]) => any ).bind(this.controller)
    }
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {
        return true
    }

    async computePatch(effect: any, lastValue: any, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): Promise<StatePatch | StatePatch[] | undefined> {
        const record = await this.mapItem(mutationEvent, mutationEvents)
        if (record !== undefined) {
            return {
                type: record.id? 'update':'create',
                value: record,
                affectedId: record.id
            } as StatePatch
        }
    }

}

ComputedDataHandle.Handles.set(MapRecordMutationToRecord, MapInteractionToRecordHandle)