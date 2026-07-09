import { DataContext, DataDepEventContext, EntityDataContext, EventDep, IncrementalPlan } from "./Computation.js";
import { Transform, TransformInstance, type ComputationRecord } from "@core";
import { Controller } from "../Controller.js";
import { MatchExp } from "@storage";
import { ComputationResultPatch, DataDep, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { EtityMutationEvent } from "../ComputationSourceMap.js";
import { assert } from "../util.js";
import { RequireSerializableRetry } from "../transaction.js";

export class RecordsTransformHandle implements DataBasedComputation {
    static computationType = Transform
    static contextType = ['entity', 'relation'] as const
    transformCallback: (this: Controller, item: any) => any
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = false
    dataDeps: {[key: string]: DataDep} = {}
    primaryDataDepKeys = ['_source']
    eventDeps?: {[key: string]: EventDep}
    constructor(public controller: Controller, public args: TransformInstance, public dataContext: DataContext) {
        assert(!(this.args.record && this.args.eventDeps), 'Transform must have either record or eventDep')
        this.transformCallback = this.args.callback.bind(this.controller)
        
        if (this.args.eventDeps) {
            this.eventDeps = this.args.eventDeps
        } else {
            this.dataDeps = {
                _source: {
                    type: 'records',
                    source: this.args.record as ComputationRecord,
                    attributeQuery: this.args.attributeQuery || ['*']
                }
            }
        }
    }
    
    createState() {
        const sourceRecordId = new RecordBoundState<any>('')
        const transformIndex = new RecordBoundState<number>(0)
        ;(sourceRecordId as any).unique = !this.eventDeps
        return {
            sourceRecordId,
            transformIndex
        }
    }
    
    getInitialValue() {
        return []
    }

    async compute({_source: records}: {_source: any[]}): Promise<any[]> {
        assert(!this.eventDeps, 'Transform compute should not be called with eventDeps')

        const result: ComputationResultPatch[]  = []
        for (const record of records) {
            const returnRecord = await this.transformCallback.call(this.controller, record)
            const transformedRecords = Array.isArray(returnRecord) ? returnRecord : [returnRecord]
            transformedRecords.forEach((transformedRecord, index)=> {
                if (!transformedRecord) return
                result.push({
                    ...transformedRecord,
                    [this.state.sourceRecordId.key]: record.id,
                    [this.state.transformIndex.key]: index
                })
            })
            
        }
        return result
    }
    async computeDirtyRecords(mutationEvent: EtityMutationEvent): Promise<any[]> {
        assert(this.eventDeps, 'computeDirtyRecords should be called with eventDeps')
        return [{}]
    }
    async incrementalPatchCompute(lastValue: any[], mutationEvent: EtityMutationEvent): Promise<ComputationResultPatch | ComputationResultPatch[]|undefined> {
        if (this.eventDeps) {
            return this.eventBasedIncrementalPatchCompute(lastValue, mutationEvent)
        } else {
            return this.dataBasedIncrementalPatchCompute(lastValue, mutationEvent)
        }
    }
    planIncremental(_event: EtityMutationEvent, _record: unknown, context: DataDepEventContext): IncrementalPlan {
        if (context.requiresFullRecompute) {
            return { type: 'fullRecompute', reason: context.reason || 'Transform source requires full recompute' }
        }
        if (context.depRole !== 'primary') {
            return { type: 'fullRecompute', reason: `Transform can only increment from _source events, got ${context.depKey || 'unknown'}` }
        }
        return { type: 'incremental', dataDepKeys: [] }
    }
    async eventBasedIncrementalPatchCompute(lastValue: any[], mutationEvent: EtityMutationEvent): Promise<ComputationResultPatch | ComputationResultPatch[]|undefined> {
        const results: ComputationResultPatch[] = []
        const returnRecord = await this.transformCallback.call(this.controller, mutationEvent)
        const transformedRecords = Array.isArray(returnRecord) ? returnRecord : [returnRecord]
        transformedRecords.forEach((transformedRecord, index) => {
            // 允许返回 Null，表示不插入
            if(transformedRecord) {
                results.push({
                    type:'insert',
                    data: {
                        ...transformedRecord,
                        [this.state.sourceRecordId.key]: mutationEvent.record!.id,
                        [this.state.transformIndex.key]: index
                    }
                })
            }
        })
        return results
    }
    async dataBasedIncrementalPatchCompute(lastValue: any[], mutationEvent: EtityMutationEvent): Promise<ComputationResultPatch | ComputationResultPatch[]|undefined> {
        const dataContext = this.dataContext as EntityDataContext
        const results: ComputationResultPatch[] = []
        if (mutationEvent.type === 'create') {
            const matchSourceRecord = MatchExp.atom({key: 'id', value: ['=', mutationEvent.record!.id]})
            const souceDataDep = this.dataDeps._source as RecordsDataDep
            const sourceRecord = await this.controller.system.storage.findOne(souceDataDep.source.name!, matchSourceRecord, undefined, souceDataDep.attributeQuery)
            const returnRecord = await this.transformCallback.call(this.controller, sourceRecord)
            const transformedRecords = Array.isArray(returnRecord) ? returnRecord : [returnRecord]
            transformedRecords.forEach((transformedRecord, index) => {
                // 允许返回 Null，表示不插入
                if(transformedRecord) {
                    results.push({
                        type:'insert',
                        data: {
                            ...transformedRecord,
                            [this.state.sourceRecordId.key]: mutationEvent.record!.id,
                            [this.state.transformIndex.key]: index
                        }
                    })
                }
            })
        } else {
            // update or delete
            if (this.controller.system.storage.getTransactionIsolation() !== 'SERIALIZABLE') {
                throw new RequireSerializableRetry('data-based Transform update/delete patch')
            }
            const sourceRecordId = mutationEvent.oldRecord?.id ?? mutationEvent.record!.id
            let transformedRecords: any[] = []
            if (mutationEvent.type === 'update') {
                const sourceDataDep = this.dataDeps._source as RecordsDataDep
                const sourceRecord = await this.controller.system.storage.atomic.lockRecord(
                    sourceDataDep.source.name!,
                    sourceRecordId,
                    sourceDataDep.attributeQuery
                )
                // CAUTION 源记录锁不到（事件与 patch 应用之间被并发删除）时不能直接返回空 patch：
                //  那会让已映射的派生行成为孤儿。按 delete 语义继续走下面的流程，
                //  transformedRecords 为空 → 全部既有映射行进入 delete patch（幂等，与 delete 事件路径一致）。
                if (sourceRecord) {
                    const returnRecord = await this.transformCallback.call(this.controller, sourceRecord)
                    transformedRecords = Array.isArray(returnRecord) ? returnRecord : [returnRecord]
                }
            }
            const match = MatchExp.atom({key: this.state.sourceRecordId.key, value: ['=', sourceRecordId]})
            const mappedRecords = await this.controller.system.storage.atomic.lockRows(dataContext.id.name!, match, ['*'])
            

            const mappedRecordsByIndex = mappedRecords.reduce((acc: Record<number, any>, record: any) => {
                acc[Number(record[this.state.transformIndex.key])] = record
                return acc
            }, {} as Record<number, any>)
            
            transformedRecords.forEach((transformedRecord, index) => {
                if (transformedRecord) {
                    if(mappedRecordsByIndex[index]) {
                        results.push({
                            type:'update',
                            data: {
                                ...transformedRecord,
                                [this.state.sourceRecordId.key]: sourceRecordId,
                                [this.state.transformIndex.key]: index
                            },
                            affectedId: (mappedRecordsByIndex[index] as any).id
                        })
                        delete mappedRecordsByIndex[index]
                    } else {
                        results.push({
                            type:'insert',
                            data: {
                                ...transformedRecord,
                                [this.state.sourceRecordId.key]: sourceRecordId,
                                [this.state.transformIndex.key]: index
                            }
                        })
                    }
                }
            })      
            Object.values(mappedRecordsByIndex).forEach((mappedRecord: any  ) => {
                results.push({
                    type:'delete',
                    affectedId: mappedRecord.id
                })
            })
        }
        return results
    }

}


// Export Transform computation handles
export const TransformHandles = [RecordsTransformHandle];
