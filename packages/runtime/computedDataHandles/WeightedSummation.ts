import {EntityIdRef, RecordMutationEvent} from "../System.js";
import {IncrementalComputedDataHandle, StatePatch} from "./IncrementalComputedDataHandle.js";
import {Entity, KlassInstance, Relation, WeightedSummation} from "@interaqt/shared";
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle} from "./ComputedDataHandle.js";

type RecordChangeEffect = {
    affectedId: string,
    recordName: string
    info: KlassInstance<any>
}

type MapRecordToWeight = (record: EntityIdRef, info: KlassInstance<any>) => number

export class WeightedSummationHandle extends IncrementalComputedDataHandle {
    records!: KlassInstance<typeof WeightedSummation>['records']
    mapRecordToWeight!: MapRecordToWeight
    // 单独抽出来让下面能覆写
    parseComputedData(){
        const computedData = this.computedData as unknown as KlassInstance<typeof WeightedSummation>
        this.mapRecordToWeight = computedData.matchRecordToWeight!.bind(this.controller) as MapRecordToWeight
        this.records = computedData.records
    }
    getDefaultValue(newRecordId?: any): any {
        return 0
    }
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): KlassInstance<any>|undefined {
        // FIXME type
        // @ts-ignore
        return this.records.find((record: any) => {
            return (record.name) === mutationEvent.recordName
        })
    }
    async getLastValue(effect: RecordChangeEffect, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]) {
        return this.controller.system.storage.get('state', this.stateName!)
    }
    async computePatch(effect: KlassInstance<any>, lastSummation: number, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): Promise<StatePatch|StatePatch[]|undefined> {
        let currentWeight = 0
        let originWeight = 0

        let currentRecord
        let oldRecord


        const isRelation = effect instanceof Relation
        const affectedId = mutationEvent.record?.id ?? mutationEvent.oldRecord?.id
        const recordName = mutationEvent.recordName

        if (mutationEvent.type === 'create' || mutationEvent.type === 'update') {
            const match = MatchExp.atom({key: 'id', value: ['=', affectedId]})
            if (isRelation) {
                currentRecord = await this.controller.system.storage.findOneRelationByName(recordName, match)
            } else {
                currentRecord = await this.controller.system.storage.findOne(recordName, match)
            }

            if (currentRecord) {
                currentWeight = this.mapRecordToWeight(currentRecord, effect)
            }
        }

        if (mutationEvent.type === 'update' || mutationEvent.type === 'delete') {
            oldRecord = mutationEvent.oldRecord
            if (oldRecord) {
                originWeight = this.mapRecordToWeight(oldRecord, effect)
            }
        }

        const delta = currentWeight - originWeight
        if (delta === 0) return undefined

        return {
            type: 'update',
            value: lastSummation + delta
        }
    }
}

ComputedDataHandle.Handles.set(WeightedSummation, WeightedSummationHandle)