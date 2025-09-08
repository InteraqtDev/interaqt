import { DataContext, EntityDataContext, EventDep } from "./Computation.js";
import { Transform, TransformInstance, EntityInstance, RelationInstance, ActivityInstance, InteractionInstance } from "@shared";
import { Controller } from "../Controller.js";
import { MatchExp } from "@storage";
import { ComputationResultPatch, DataDep, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { EtityMutationEvent } from "../ComputationSourceMap.js";
import { assert } from "../util.js";

export class RecordsTransformHandle implements DataBasedComputation {
    static computationType = Transform
    static contextType = ['entity', 'relation'] as const
    transformCallback: (this: Controller, item: any) => any
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    eventDeps?: {[key: string]: EventDep}
    constructor(public controller: Controller, public args: TransformInstance, public dataContext: DataContext) {
        assert(!(this.args.record && this.args.eventDeps), 'Transform must have either record or eventDep')
        this.transformCallback = this.args.callback.bind(this.controller)
        
        if (this.args.eventDeps) {
            this.eventDeps = this.args.eventDeps
        } else {
            this.dataDeps = {
                main: {
                    type: 'records',
                    source: this.args.record as EntityInstance|RelationInstance|ActivityInstance|InteractionInstance,
                    attributeQuery: this.args.attributeQuery || ['*']
                }
            }
        }
    }
    
    createState() {
        return {
            sourceRecordId: new RecordBoundState<any>(''),
            transformIndex: new RecordBoundState<number>(0)
        }
    }
    
    getDefaultValue() {
        return []
    }

    async compute({main: records}: {main: any[]}): Promise<any[]> {
        assert(!this.eventDeps, 'Transform compute should not be called with eventDeps')

        const result: ComputationResultPatch[]  = []
        for (const record of records) {
            const returnRecord = await this.transformCallback.call(this.controller, record)
            const transformedRecords = Array.isArray(returnRecord) ? returnRecord : [returnRecord]
            transformedRecords.forEach((transformedRecord, index)=> {
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
            const souceDataDep = this.dataDeps.main as RecordsDataDep
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
            const sourceRecordId = mutationEvent.oldRecord?.id ?? mutationEvent.record!.id
            const match = MatchExp.atom({key: this.state.sourceRecordId.key, value: ['=', sourceRecordId]})
            const mappedRecords = await this.controller.system.storage.find(dataContext.id.name!, match, undefined, ['*'])
            

            const mappedRecordsByIndex = mappedRecords.reduce((acc, record) => {
                acc[record[this.state.transformIndex.key]] = record
                return acc
            }, {} as Record<number, any>)
            
            let transformedRecords: any[] = []
            if (mutationEvent.type === 'update') {
                const matchSourceRecord = MatchExp.atom({key: 'id', value: ['=', sourceRecordId]})
                const sourceRecord = await this.controller.system.storage.findOne((this.dataDeps.main as RecordsDataDep).source.name!, matchSourceRecord, undefined, (this.dataDeps.main as RecordsDataDep).attributeQuery)
                const returnRecord = await this.transformCallback.call(this.controller, sourceRecord)
                transformedRecords = Array.isArray(returnRecord) ? returnRecord : [returnRecord]
            }
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
                            affectedId: mappedRecordsByIndex[index].id
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