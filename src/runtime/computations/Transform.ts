import { DataContext, DataDepEventContext, EntityDataContext, EventDep, IncrementalPlan } from "./Computation.js";
import { Transform, TransformInstance, type ComputationRecord } from "@core";
import { Controller } from "../Controller.js";
import { MatchExp } from "@storage";
import { ComputationResultPatch, DataDep, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { EtityMutationEvent } from "../ComputationSourceMap.js";
import { assert } from "../util.js";
import { RequireSerializableRetry } from "../transaction.js";
import { ComputationProtocolError } from "../errors/ComputationErrors.js";
import { validateMutationEventPatternKeys, validateMutationEventPatternSurface } from "./TransitionFinder.js";

// Transform insert may carry a top-level `id` (client-pregenerated or intentional shared identity).
// Duplicate logical ids fail loud via the framework logical-id UNIQUE INDEX (storage invariant).
// Update patches never rewrite identity: applyResultPatch / storage update strip top-level `id`.
// Nested relation refs such as { author: { id } } are unaffected.

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
            // 模式面校验（与 StateMachine trigger 同一声明面、同一实现）：
            //  外层未知字段在注册时被静默丢弃（过滤条件消失 → 静默过触发）；
            //  keys 取值面（非空数组 / 仅 update / 声明过的值属性）与 trigger.keys 同一契约。
            for (const [eventDepName, eventDep] of Object.entries(this.args.eventDeps)) {
                const describeDep = () => `Transform computation of ${this.dataContext.type} "${(this.dataContext.id as { name?: string }).name}": eventDep "${eventDepName}"`
                validateMutationEventPatternSurface(eventDep, { allowPhase: true }, describeDep)
                validateMutationEventPatternKeys(
                    this.controller,
                    eventDep as { recordName?: string, type?: string, keys?: unknown },
                    (message: string) => {
                        throw new ComputationProtocolError(
                            `${describeDep()}: ${message}`,
                            { handleName: 'Transform', computationPhase: 'event-dep-keys-validation' }
                        )
                    }
                )
            }
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
                        // Identity is located by affectedId only; top-level id in update data is stripped at applyResultPatch.
                        const { id: _ignoredId, ...rest } = transformedRecord as Record<string, unknown>
                        results.push({
                            type:'update',
                            data: {
                                ...rest,
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
