import { ComputedDataHandle, DataContext, EntityDataContext } from "./ComputedDataHandle.js";
import { Transform, KlassInstance, Relation, Entity, Activity, Interaction, BoolExp } from "@interaqt/shared";
import { Controller } from "../Controller.js";
import { ComputeResultPatch, DataDep, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { ERRecordMutationEvent } from "../Scheduler.js";

export class RecordsTransformHandle implements DataBasedComputation {
    transformCallback: (this: Controller, item: any) => any
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    
    constructor(public controller: Controller, args: KlassInstance<typeof Transform>, public dataContext: DataContext) {
        this.transformCallback = args.callback.bind(this)
        
        this.dataDeps = {
            main: {
                type: 'records',
                source: args.record as KlassInstance<typeof Entity>|KlassInstance<typeof Relation>|KlassInstance<typeof Activity>|KlassInstance<typeof Interaction>,
                attributeQuery: args.attributeQuery || ['*']
            }
        }
    }
    
    createState() {
        return {
            sourceRecordId: new RecordBoundState<any>(''),
        }
    }
    
    getDefaultValue() {
        return []
    }

    async compute({main: records}: {main: any[]}): Promise<any[]> {
        const transformedRecords = [];
        
        return records.map((record) => {
            return {
                ...this.transformCallback.call(this.controller, record),
                [this.state.sourceRecordId.key]: record.id
            }
        });
    }

    async incrementalPatchCompute(lastValue: any[], mutationEvent: ERRecordMutationEvent): Promise<ComputeResultPatch | ComputeResultPatch[]|undefined> {
        const dataContext = this.dataContext as EntityDataContext
        
        if (mutationEvent.type === 'create') {
            const matchSourceRecord = BoolExp.atom({key: 'id', value: ['=', mutationEvent.record.id]})
            const souceDataDep = this.dataDeps.main as RecordsDataDep
            const sourceRecord = await this.controller.system.storage.findOne(souceDataDep.source.name, matchSourceRecord, undefined, souceDataDep.attributeQuery)
            const transformedRecord = {
                ...this.transformCallback.call(this.controller, sourceRecord),
                [this.state.sourceRecordId.key]: mutationEvent.record.id
            }
            return {
                type:'insert',
                data: transformedRecord
            }
        } else if (mutationEvent.type === 'update'||mutationEvent.type === 'delete') {
            const sourceRecordId = mutationEvent.oldRecord?.id ?? mutationEvent.record!.id
            const match = BoolExp.atom({key: this.state.sourceRecordId.key, value: ['=', sourceRecordId]})
            const mappedRecord = await this.controller.system.storage.findOne(dataContext.id.name, match, undefined, ['*'])
            if (mutationEvent.type === 'delete') {
                return {
                    type:'delete',
                    affectedId: mappedRecord.id
                }
            } else {
                const matchSourceRecord = BoolExp.atom({key: 'id', value: ['=', sourceRecordId]})
                const sourceRecord = await this.controller.system.storage.findOne((this.dataDeps.main as RecordsDataDep).source.name, matchSourceRecord, undefined, (this.dataDeps.main as RecordsDataDep).attributeQuery)
                const transformedRecord = {
                    ...this.transformCallback.call(this.controller, sourceRecord),
                    [this.state.sourceRecordId.key]: sourceRecord.id
                }
                return {
                    type:'update',
                    data: transformedRecord,
                    affectedId: mappedRecord.id
                }
            }
        }
        
    }
}


// Register the Transform with ComputedDataHandle
ComputedDataHandle.Handles.set(Transform, {
    entity: RecordsTransformHandle,
    relation: RecordsTransformHandle
});