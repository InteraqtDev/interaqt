import {
    EntityInstance, RelationInstance, PropertyInstance,
    DictionaryInstance,
    type ComputationRecord
} from "@core";
import { Controller } from "../Controller";
import { AttributeQueryData, MatchExp, MatchExpressionData, ModifierData } from "@storage";
import { type ComputationPhase, PHASE_AFTER_ALL, PHASE_BEFORE_ALL, PHASE_NORMAL} from "../ComputationSourceMap";

// Types from ComputationHandle.ts
export type GlobalDataContext = {
    type: 'global',
    id: DictionaryInstance
}

export type EntityDataContext = {
    type: 'entity',
    id: EntityInstance
}

export type RelationDataContext = {
    type: 'relation',
    id: RelationInstance
}

export type PropertyDataContext = {
    type: 'property',
    host: EntityInstance |  RelationInstance,
    id: PropertyInstance
}

export type DataContext = GlobalDataContext|EntityDataContext|RelationDataContext|PropertyDataContext

export type ComputedEffect = {
    type: 'create' | 'update' | 'delete';
    recordName: string;
    data: Record<string, unknown>;
} | null

export type ComputeEffectResult= ComputedEffect|ComputedEffect[]|undefined

type HandlesForType = {
    global?: { new(...args: any[]): Computation },
    entity?: { new(...args: any[]): Computation },
    relation?: { new(...args: any[]): Computation },
    property?: { new(...args: any[]): Computation },
}


export type ComputationResultPatch = {
    type: 'insert' | 'update' | 'delete'
    data?: unknown
    affectedId?: unknown
}



export class ComputationResult{
    static skip = () => new ComputationResultSkip()
    static resolved = (result: unknown, args?: unknown) => new ComputationResultResolved(result, args)
    static async = (args?: unknown) => new ComputationResultAsync(args)
    static fullRecompute = (reason?: unknown) => new ComputationResultFullRecompute(reason)
}

export class ComputationResultSkip extends ComputationResult{

}

export class ComputationResultFullRecompute extends ComputationResult{
    constructor(public reason?: unknown) {
        super()
    }
}

export class ComputationResultAsync extends ComputationResult{
    constructor(public args?: unknown) {
        super()
    }
}

export class ComputationResultResolved extends ComputationResult{
    constructor(public result: unknown, public args?: unknown) {
        super()
    }
}


export class RecordBoundState<T> {
    key!: string
    controller!: Controller
    constructor(public defaultValue: T | null, public record?:string) { 

    }
    async set(record: Record<string, unknown> | undefined, value: T): Promise<T> {
        await this.controller.system.storage.update(this.record!, MatchExp.atom({key: 'id', value: ['=', record!.id]}), {[this.key]: value})
        return value
    }
    async get(record: Record<string, unknown> | undefined):Promise<T> {
        if (!record || record[this.key] === undefined) {
            const fullRecord = record ? await this.controller.system.storage.findOne(this.record!, MatchExp.atom({key: 'id', value: ['=', record.id]}), undefined, [this.key]) : undefined
            const value = fullRecord?.[this.key]
            return (value !== undefined ? value : this.defaultValue) as T
        }
        return record[this.key] as T
    }
}


export class GlobalBoundState<T> {
    key!:string
    controller!: Controller
    constructor(public defaultValue?: T | null) {

    }
    async set(value: T):Promise<T> {
        await this.controller.system.storage.dict.set(this.key, value)
        return value
    }
    async get():Promise<T> {
        return await this.controller.system.storage.dict.get(this.key) as T
    }
}

export { ComputationPhase, PHASE_BEFORE_ALL, PHASE_NORMAL, PHASE_AFTER_ALL }


export type RecordsDataDep = {
    type: 'records',
    source: ComputationRecord,
    match?: MatchExpressionData,
    modifier?: ModifierData,
    attributeQuery?: AttributeQueryData
    phase?: ComputationPhase
}

export type GlobalDataDep = {
    type: 'global',
    source: DictionaryInstance
    phase?: ComputationPhase
}

// 同一 record 的 property 依赖
export type PropertyDataDep = {
    type: 'property',
    attributeQuery?: AttributeQueryData
    phase?: ComputationPhase
}


export type DataDep = RecordsDataDep|PropertyDataDep|GlobalDataDep



export interface DataBasedComputation {
    dataContext: DataContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each computation type has different args (Count, Every, Transform, etc.)
    args: any
    state: {[key: string]: RecordBoundState<unknown>|GlobalBoundState<unknown>}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    compute: (...args: any[]) => Promise<ComputationResult|unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    incrementalCompute?: (...args: any[]) => Promise<ComputationResult|unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createState?: (...args: any[]) => {[key: string]: RecordBoundState<unknown>|GlobalBoundState<unknown>}
    dataDeps: {[key: string]: DataDep}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getInitialValue?: (...args: any[]) => unknown
    useLastValue?: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asyncReturn?: (...args: any[]) => Promise<ComputationResultSkip|unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createStateData?: (...args: any[]) => Promise<Record<string, unknown>>
}


export type EventDep = {
    recordName:string,
    type: 'create'|'delete'|'update',
    phase?: ComputationPhase,
    record?: Record<string, unknown>,
    oldRecord?: Record<string, unknown>
}

export interface EventBasedComputation {
    dataContext: DataContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each computation type has different args
    args: any
    useMutationEvent: boolean
    state: {[key: string]: RecordBoundState<unknown>|GlobalBoundState<unknown>}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    incrementalCompute?: (...args: any[]) => Promise<ComputationResult|unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createState?: (...args: any[]) => {[key: string]: RecordBoundState<unknown>|GlobalBoundState<unknown>}
    eventDeps?: {[key: string]: EventDep}
    useLastValue?: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getInitialValue?: (...args: any[]) => unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    computeDirtyRecords?: (...args: any[]) => Promise<Record<string, unknown>[]|undefined>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asyncReturn?: (...args: any[]) => Promise<ComputationResultSkip|unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createStateData?: (...args: any[]) => Promise<Record<string, unknown>>
}

export type Computation = DataBasedComputation|EventBasedComputation

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComputationClass = new(...args: any[]) => Computation
