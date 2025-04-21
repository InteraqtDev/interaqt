import { ComputedDataHandle, DataContext, PropertyDataContext } from "./ComputedDataHandle.js";
import { Count, KlassInstance, Relation, Entity } from "@interaqt/shared";
import { Controller } from "../Controller.js";
import { DataDep, GlobalBoundState, RecordBoundState } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { ERRecordMutationEvent } from "../Scheduler.js";
import { MatchExp } from "@interaqt/storage";

export class GlobalCountHandle implements DataBasedComputation {
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    record: KlassInstance<typeof Entity|typeof Relation>

    constructor(public controller: Controller, args: KlassInstance<typeof Count>, public dataContext: DataContext) {
        this.record = args.record
        
        this.dataDeps = {
            main: {
                type: 'records',
                source: this.record
            }
        }
    }
    
    createState() {
        return {
        }   
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({main: records}: {main: any[]}): Promise<number> {
        return records.length;
    }

    async incrementalCompute(lastValue: number, mutationEvent: ERRecordMutationEvent): Promise<number> {
        let count = lastValue || 0;
        
        if (mutationEvent.type === 'create') {
            count = lastValue + 1;
        } else if (mutationEvent.type === 'delete') {
            count = lastValue - 1;
        }
        
        return count;
    }
}

export class PropertyCountHandle implements DataBasedComputation {
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean
    relation: KlassInstance<typeof Relation>

    constructor(public controller: Controller, public args: KlassInstance<typeof Count>, public dataContext: PropertyDataContext) {
        // We assume in PropertyCountHandle, the records array's first element is a Relation
        this.relation = args.record as KlassInstance<typeof Relation>
        this.relationAttr = this.relation.source.name === dataContext.host.name ? this.relation.sourceProperty : this.relation.targetProperty
        this.isSource = this.relation.source.name === dataContext.host.name
        this.relatedRecordName = this.isSource ? this.relation.target.name : this.relation.source.name
        
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.relationAttr, {attributeQuery: ['id']}]]
            }
        }
    }

    createState() {
        return {
        }   
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({_current}: {_current: any}): Promise<number> {
        const count = _current[this.relationAttr]?.length || 0;
        return count;
    }

    async incrementalCompute(lastValue: number, mutationEvent: ERRecordMutationEvent): Promise<number> {
        let count = lastValue || 0;
        const relatedMutationEvent = mutationEvent.relatedMutationEvent!;

        if (relatedMutationEvent.type === 'create') {
            // Relation creation
            count = lastValue + 1;
        } else if (relatedMutationEvent.type === 'delete') {
            // Relation deletion
            count = lastValue - 1;
        }

        return count;
    }
}

ComputedDataHandle.Handles.set(Count, {
    global: GlobalCountHandle,
    property: PropertyCountHandle
});
