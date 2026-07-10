import { EntityInstance, RelationInstance } from "@core";
import { Controller } from "../Controller.js";
import { AttributeQueryData, LINK_SYMBOL, MatchExp, RecordQueryData } from "@storage";
import { assert } from "../util.js";
import {
    assertCallbackAttributeQueryDeclared,
    buildRelationSideMatchKey,
    ComputationResult,
    DataBasedComputation,
    DataContext,
    DataDep,
    DataDepEventContext,
    defaultDataBasedIncrementalPlan,
    describeDataContext,
    GlobalBoundState,
    IncrementalPlan,
    PropertyDataContext,
    RecordBoundState,
    RecordsDataDep
} from "./Computation.js";
import { EtityMutationEvent } from "../ComputationSourceMap.js";
import { ComputationError } from "../errors/ComputationErrors.js";

/**
 * 六个内置聚合（Count / Summation / Average / Every / Any / WeightedSummation）的共享增量模板。
 *
 * 背景：六个聚合的 global / property 两个 handle 此前各自手写「事件守卫 → 拉全记录 →
 * 逐项贡献状态维护 → 聚合增量应用」的骨架，历轮 review 累计 15+ 个缺陷全部源于
 * 六份骨架的手工同步漂移（create 路径用局部事件 record、update 不注册监听、
 * 负值无守卫、空集合语义、`&` 挂载不一致……）。模板把骨架收敛为单一实现：
 *
 * - 统一的 mutation 事件守卫（recordName / relatedAttribute 形态检查）；
 * - create/update 一律先按 attributeQuery 拉全记录再计算贡献（增量与全量重算同一取数口径）；
 * - 统一的「记录已不可见 → fullRecompute」竞态防御与 `Atomic replace target not found` 防御；
 * - 统一的逐项贡献绑定状态维护（delete/成员资格退出时复位，避免重入读到陈旧值）；
 * - 统一的负值守卫入口（计数类聚合状态为负说明状态与事件流失步，必须 fail-fast）。
 *
 * 各聚合只声明三件事：单条记录的贡献值（computeItemValue）、一次贡献变化如何应用到
 * 聚合状态（applyDelta）、全量重算如何落盘（persistFullResult）。绑定状态的名字与形状
 * 由各 handle 自持（createState），保证与既有部署的状态列/dict key 兼容。
 */

export type AggregationItemValue = number | boolean

export type AggregationArgs = {
    record?: EntityInstance | RelationInstance
    property?: string
    direction?: string
    attributeQuery?: AttributeQueryData
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- 与 core 的 CreateArgs 声明对齐；各聚合 callback 形态不同（boolean / {weight, value}）
    callback?: Function
    // 与 core 的 DataDependencies 声明对齐（索引值为 unknown），运行时按 DataDep 消费。
    dataDeps?: { [key: string]: unknown }
}

export type AggregationOptions = {
    /** 用于错误信息与校验定位，如 'Count' */
    computationName: string
    /** callback 是必填（Every/Any/WeightedSummation） */
    requireCallback?: boolean
    /** attributeQuery 必须至少声明一个字段（Summation/Average：聚合字段来自 attributeQuery） */
    requireAttributeQueryField?: boolean
    /** 允许 args.record 直接指定 relation（Count 的历史用法） */
    allowRecordFallback?: boolean
    /** 宿主侧必须是 x:n 关系（Every/Any：对单值关系做全称/存在量词没有意义） */
    requireXToMany?: boolean
}

/**
 * 从 attributeQuery 解析聚合字段路径（Summation/Average 共用）。
 * CAUTION Summation/Average 没有 callback，attributeQuery 就是唯一的聚合字段声明，
 *  语义上必须是单链路径（['score'] 或 [['team', {attributeQuery: ['budget']}]]）。
 *  此前对 ['score', 'bonus'] 这类多字段声明静默只取第一个字段——用户以为在聚合多个字段，
 *  实际结果零告警地少算。声明期 fail-fast，多字段派生值请用 WeightedSummation + callback。
 */
export function parseAggregationFieldPath(attributeQuery: AttributeQueryData, describeOwner?: () => string): string[] {
    const path: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- attributeQuery 是递归的异构结构
    let attrPointer: any = attributeQuery
    while (attrPointer) {
        if (describeOwner && Array.isArray(attrPointer) && attrPointer.length > 1) {
            throw new Error(
                `${describeOwner()} declares ${attrPointer.length} sibling fields in attributeQuery (${JSON.stringify(attrPointer.map((item: unknown) => Array.isArray(item) ? item[0] : item))}); ` +
                `only a single field path can be aggregated, and the extra fields would be silently ignored. ` +
                `Declare exactly one field (e.g. ['score']) or one nested path (e.g. [['team', {attributeQuery: ['budget']}]]). ` +
                `To aggregate a value derived from multiple fields, use WeightedSummation with a callback.`
            )
        }
        path.push(Array.isArray(attrPointer[0]) ? attrPointer[0][0] : attrPointer[0])
        attrPointer = Array.isArray(attrPointer[0]) ? attrPointer[0][1].attributeQuery : null
    }
    return path
}

function validateAggregationArgs(args: AggregationArgs, dataContext: DataContext, options: AggregationOptions) {
    if (options.requireCallback) {
        assert(typeof args.callback === 'function', `${options.computationName} computation of ${describeDataContext(dataContext)} requires a callback`)
    }
    if (args.callback) {
        assertCallbackAttributeQueryDeclared(options.computationName, dataContext, args.attributeQuery)
    }
    if (options.requireAttributeQueryField && (!args.attributeQuery || args.attributeQuery.length === 0)) {
        throw new Error(`${options.computationName} computation requires attributeQuery with at least one field`)
    }
}

// fail fast：global（records 源）聚合缺 record 时，如果等到 createStates 才解引用
//  `this.record.name` 会抛出与声明完全脱节的 "Cannot read properties of undefined"。
function requireAggregationRecord(args: AggregationArgs, dataContext: DataContext, options: AggregationOptions): EntityInstance | RelationInstance {
    if (!args.record || !(args.record as { name?: unknown }).name) {
        throw new Error(
            `${options.computationName} computation of ${describeDataContext(dataContext)} requires a "record" argument (the Entity or Relation to aggregate over), got: ${JSON.stringify(args.record)}`
        )
    }
    return args.record
}

/**
 * Global（records 源）聚合模板。
 */
export abstract class GlobalRecordsAggregationHandle<V extends AggregationItemValue, TResult, TArgs extends AggregationArgs = AggregationArgs> implements DataBasedComputation {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 状态形状由子类 createState 决定
    state!: any
    useLastValue: boolean = false
    dataDeps: { [key: string]: DataDep } = {}
    primaryDataDepKeys = ['main']
    record: EntityInstance | RelationInstance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback?: (this: Controller, item: any, dataDeps?: { [key: string]: unknown }) => any
    protected readonly options: AggregationOptions

    constructor(public controller: Controller, public args: TArgs, public dataContext: DataContext, options: AggregationOptions) {
        this.options = options
        validateAggregationArgs(args, dataContext, options)
        this.record = requireAggregationRecord(args, dataContext, options)
        if (args.callback) {
            this.callback = args.callback.bind(this.controller)
        }
        this.dataDeps = {
            main: {
                type: 'records',
                source: this.record,
                attributeQuery: args.attributeQuery
            },
            ...((args.dataDeps || {}) as { [key: string]: DataDep })
        }
    }

    /** this.state 里逐项贡献绑定状态的 key */
    protected abstract readonly itemStateKey: string
    /** 贡献复位值（delete/成员资格退出时写回，防重入读到陈旧值） */
    protected abstract readonly emptyItemValue: V
    /** 计算单条记录的贡献值。record 已按 attributeQuery 拉全（与全量重算同一口径）。 */
    protected abstract computeItemValue(record: Record<string, unknown>, dataDeps: { [key: string]: unknown }): V
    /** 把一次贡献变化应用到聚合状态并返回计算结果。presenceDelta：create=1 / update=0 / delete=-1。 */
    protected abstract applyDelta(newValue: V | null, oldValue: V | null, presenceDelta: 1 | 0 | -1): Promise<TResult>
    /** 全量重算：把所有贡献写入聚合状态并返回计算结果。 */
    protected abstract persistFullResult(values: V[]): Promise<TResult>
    /** 增量 create/update 是否需要按 attributeQuery 拉全记录。默认 true；仅 Count 无 callback 时可跳过。 */
    protected requiresItemFetch(): boolean { return true }

    abstract createState(): { [key: string]: RecordBoundState<unknown> | GlobalBoundState<unknown> }
    abstract getInitialValue(): unknown

    protected get itemState(): RecordBoundState<V> {
        return this.state[this.itemStateKey] as RecordBoundState<V>
    }

    protected assertNonNegative(name: string, value: number): void {
        if (value < 0) {
            throw new ComputationError(
                `${this.options.computationName} ${name} became negative for ${describeDataContext(this.dataContext)} — bound state and event stream are out of sync`,
                { computationName: this.options.computationName, dataContext: this.dataContext }
            )
        }
    }

    protected async replaceItemState(record: Record<string, unknown>, value: V): Promise<{ oldValue: V | null } | ComputationResult> {
        try {
            return await this.itemState.replace(record, value)
        } catch (error) {
            // 竞态防御：目标行在事件与增量计算之间被物理删除（级联等），退回全量重算而不是崩溃。
            if (error instanceof Error && error.message.includes('Atomic replace target not found')) {
                return ComputationResult.fullRecompute(`${this.options.computationName} item state target not found`)
            }
            throw error
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async compute({ main: records, ...dataDeps }: { main: any[], [key: string]: any }): Promise<TResult> {
        const values: V[] = []
        for (const record of records) {
            const value = this.computeItemValue(record, dataDeps)
            await this.itemState.setInternal(record, value)
            values.push(value)
        }
        return this.persistFullResult(values)
    }

    planIncremental(_event: EtityMutationEvent, _record: unknown, context: DataDepEventContext): IncrementalPlan {
        return defaultDataBasedIncrementalPlan(this.dataDeps, this.primaryDataDepKeys, context)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async incrementalCompute(lastValue: unknown, mutationEvent: EtityMutationEvent, record: any, dataDeps: { [key: string]: unknown }): Promise<TResult | ComputationResult> {
        // 注意要同时检测名字和 relatedAttribute 才能确定是不是自己的更新，因为可能有自己和自己的关联关系的 dataDep。
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name || mutationEvent.relatedAttribute?.length) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }

        if (mutationEvent.type === 'create' || mutationEvent.type === 'update') {
            // CAUTION mutation 事件的 record 只携带写入时的字段（defaultValues + payload / 本次变更字段），
            //  贡献计算可能依赖计算列或 attributeQuery 声明的关联数据，必须拉取全量记录（与全量重算同一口径）。
            let newRecord = mutationEvent.record as Record<string, unknown>
            if (this.requiresItemFetch()) {
                newRecord = await this.controller.system.storage.findOne(mutationEvent.recordName, MatchExp.atom({
                    key: 'id',
                    value: ['=', mutationEvent.record!.id]
                }), undefined, this.args.attributeQuery)
                if (!newRecord) {
                    return ComputationResult.fullRecompute(`record ${mutationEvent.record!.id} not found on ${mutationEvent.type} for ${describeDataContext(this.dataContext)}`)
                }
            }
            const value = this.computeItemValue(newRecord, dataDeps)
            const replaced = await this.replaceItemState(newRecord, value)
            if (replaced instanceof ComputationResult) return replaced
            return this.applyDelta(value, replaced.oldValue, mutationEvent.type === 'create' ? 1 : 0)
        }

        if (mutationEvent.type === 'delete') {
            // CAUTION delete 事件不一定意味着物理行删除：filtered entity 的成员资格退出事件里底层行仍然存在，
            //  必须复位绑定状态，否则记录再次进入时读到陈旧值导致增量错误。物理删除场景 setInternal 会安全忽略。
            const oldValue = await this.itemState.get(mutationEvent.record)
            await this.itemState.setInternal(mutationEvent.record, this.emptyItemValue)
            return this.applyDelta(null, oldValue ?? null, -1)
        }

        return ComputationResult.fullRecompute(`unknown mutation event type for ${describeDataContext(this.dataContext)}`)
    }
}

/**
 * Property（关系源）聚合模板。
 * 宿主实体的属性 = 对关联关系集合的聚合。增量事件的形态是宿主 update 事件 +
 * relatedAttribute 定位到关系/关联实体上的 create/delete/update。
 */
export abstract class PropertyRelationAggregationHandle<V extends AggregationItemValue, TResult, TArgs extends AggregationArgs = AggregationArgs> implements DataBasedComputation {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state!: any
    useLastValue: boolean = false
    dataDeps: { [key: string]: DataDep } = {}
    primaryDataDepKeys = ['_current']
    relation!: RelationInstance
    isSource: boolean
    relationAttr: string
    relatedRecordName: string
    property: string
    reverseProperty: string
    relationAttributeQuery: AttributeQueryData
    relatedAttributeQuery: AttributeQueryData
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback?: (this: Controller, item: any, dataDeps?: { [key: string]: unknown }) => any
    protected readonly options: AggregationOptions

    constructor(public controller: Controller, public args: TArgs, public dataContext: PropertyDataContext, options: AggregationOptions) {
        this.options = options
        validateAggregationArgs(args, dataContext, options)
        if (args.callback) {
            this.callback = args.callback.bind(this.controller)
        }

        if (args.property) {
            this.relation = this.controller.relations.find(r =>
                (r.source === dataContext.host && r.sourceProperty === args.property) ||
                (r.target === dataContext.host && r.targetProperty === args.property)
            )!
        } else if (options.allowRecordFallback) {
            this.relation = args.record as RelationInstance
        }
        assert(!!this.relation, `cannot find relation for property "${args.property}" of ${describeDataContext(dataContext)} in ${options.computationName} computation`)

        this.isSource = args.direction ? args.direction === 'source' : this.relation.source.name === dataContext.host.name
        assert(this.isSource ? this.relation.source === dataContext.host : this.relation.target === dataContext.host, `${options.computationName.toLowerCase()} computation relation direction error`)

        if (options.requireXToMany) {
            let baseRelation = this.relation.baseRelation || this.relation
            while (baseRelation.baseRelation) {
                baseRelation = baseRelation.baseRelation
            }
            const relType = baseRelation.type.split(':')
            assert(relType[this.isSource ? 1 : 0] === 'n', `property-level ${options.computationName} computation argument must be an x:n relation. ${dataContext.host.name}.${args.property}" is a ${this.isSource ? relType.join(':') : relType.slice().reverse().join(':')} relation`)
        }

        this.relationAttr = this.isSource ? this.relation.sourceProperty : this.relation.targetProperty
        this.relatedRecordName = this.isSource ? this.relation.target.name! : this.relation.source.name!
        this.property = args.property || this.relationAttr
        this.reverseProperty = this.isSource ? this.relation.targetProperty : this.relation.sourceProperty

        const attributeQuery = args.attributeQuery || []
        this.relatedAttributeQuery = attributeQuery.filter(item => item && item[0] !== LINK_SYMBOL)
        const relationQuery: AttributeQueryData | undefined = ((attributeQuery.find(item => item && item[0] === LINK_SYMBOL) || [])[1] as RecordQueryData)?.attributeQuery
        this.relationAttributeQuery = [
            [this.isSource ? 'target' : 'source', { attributeQuery: this.relatedAttributeQuery }],
            ...(relationQuery ? relationQuery : [])
        ]

        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.relationAttr, { attributeQuery: attributeQuery.length > 0 ? attributeQuery : ['id'] }]]
            },
            ...((args.dataDeps || {}) as { [key: string]: DataDep })
        }
    }

    /**
     * this.state 里逐项贡献绑定状态的 key；null 表示不维护逐项状态
     * （Count 无 callback 时贡献恒为「存在即 1」，无需状态）。
     */
    protected abstract readonly itemStateKey: string | null
    protected abstract readonly emptyItemValue: V
    /** 无逐项状态时，「存在性」贡献值（Count 无 callback：true）。 */
    protected presenceItemValue(): V { return this.emptyItemValue }
    /** 计算单条关联记录的贡献值。relatedItem 已挂 `&`（关系记录，按 relationAttributeQuery 拉全）。 */
    protected abstract computeItemValue(relatedItem: Record<string, unknown>, dataDeps: { [key: string]: unknown }): V
    /** 把一次贡献变化应用到宿主聚合状态并返回计算结果。 */
    protected abstract applyDelta(hostRecord: Record<string, unknown>, newValue: V | null, oldValue: V | null, presenceDelta: 1 | 0 | -1): Promise<TResult>
    /** 全量重算：把所有贡献写入宿主聚合状态并返回计算结果。 */
    protected abstract persistFullResult(hostRecord: Record<string, unknown>, values: V[]): Promise<TResult>

    abstract createState(): { [key: string]: RecordBoundState<unknown> | GlobalBoundState<unknown> }
    abstract getInitialValue(): unknown

    protected get itemState(): RecordBoundState<V> | null {
        return this.itemStateKey ? this.state[this.itemStateKey] as RecordBoundState<V> : null
    }

    protected get relationSide(): 'source' | 'target' {
        return this.isSource ? 'target' : 'source'
    }

    protected assertNonNegative(name: string, value: number): void {
        if (value < 0) {
            throw new ComputationError(
                `${this.options.computationName} ${name} became negative for ${describeDataContext(this.dataContext)} — bound state and event stream are out of sync`,
                { computationName: this.options.computationName, dataContext: this.dataContext }
            )
        }
    }

    protected async replaceItemState(relationRecord: Record<string, unknown>, value: V): Promise<{ oldValue: V | null } | ComputationResult> {
        try {
            return await this.itemState!.replace(relationRecord, value)
        } catch (error) {
            // 竞态防御：关系行在事件与增量计算之间被物理删除，退回全量重算而不是崩溃。
            if (error instanceof Error && error.message.includes('Atomic replace target not found')) {
                return ComputationResult.fullRecompute(`${this.options.computationName} relation contribution state target not found`)
            }
            throw error
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async compute({ _current, ...dataDeps }: { _current: any, [key: string]: any }): Promise<TResult> {
        const relations = _current[this.relationAttr] || []
        const values: V[] = []
        for (const relatedItem of relations) {
            const relationStateRecord = relatedItem[LINK_SYMBOL] || relatedItem
            const value = this.computeItemValue(relatedItem, dataDeps)
            if (this.itemState) {
                await this.itemState.setInternal(relationStateRecord, value)
            }
            values.push(value)
        }
        return this.persistFullResult(_current, values)
    }

    planIncremental(_event: EtityMutationEvent, _record: unknown, context: DataDepEventContext): IncrementalPlan {
        return defaultDataBasedIncrementalPlan(this.dataDeps, this.primaryDataDepKeys, context)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async incrementalCompute(lastValue: unknown, mutationEvent: EtityMutationEvent, record: any, dataDeps: { [key: string]: unknown }): Promise<TResult | ComputationResult> {
        // 只能支持通过声明的关联关系或者关联实体的增量更新。
        if (
            mutationEvent.recordName !== this.dataContext.host.name ||
            !mutationEvent.relatedAttribute ||
            mutationEvent.relatedAttribute.length === 0 ||
            mutationEvent.relatedAttribute.length > 3 ||
            mutationEvent.relatedAttribute[0] !== this.relationAttr ||
            (mutationEvent.relatedAttribute[1] && mutationEvent.relatedAttribute[1] !== LINK_SYMBOL) ||
            (mutationEvent.relatedAttribute[2] && mutationEvent.relatedAttribute[2] !== this.relationSide)
        ) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }

        const relatedMutationEvent = mutationEvent.relatedMutationEvent
        if (!relatedMutationEvent) {
            return ComputationResult.fullRecompute('No related mutation event')
        }
        const hostRecord = mutationEvent.record as Record<string, unknown>

        if (relatedMutationEvent.type === 'create' && relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的新建
            if (!this.itemState) {
                // 无逐项状态（Count 无 callback）：贡献 = 存在即 presenceItemValue，无需回查关系。
                return this.applyDelta(hostRecord, this.presenceItemValue(), null, 1)
            }
            const relationRecordId = relatedMutationEvent.record!.id
            // CAUTION create 事件的 record 只携带写入时的字段，贡献计算可能依赖计算列或关联数据，
            //  必须按 relationAttributeQuery 回查全量（与全量重算同一口径）。
            const relationWithEntity = await this.controller.system.storage.findOne(
                this.relation.name!,
                MatchExp.atom({ key: 'id', value: ['=', relationRecordId] }),
                undefined,
                this.relationAttributeQuery
            )
            // 关系记录在事件与增量计算之间可能已被删除（级联/竞态），退回全量重算而不是裸解引用崩溃。
            if (!relationWithEntity) {
                return ComputationResult.fullRecompute(`relation record ${relationRecordId} not found for ${describeDataContext(this.dataContext)}`)
            }
            const relatedRecord = relationWithEntity[this.relationSide]
            // 端点实体在事件与增量计算之间被删除（关系行短暂悬挂）时退回全量重算，不裸解引用。
            if (!relatedRecord) {
                return ComputationResult.fullRecompute(`relation ${this.relationSide} endpoint missing for ${describeDataContext(this.dataContext)}`)
            }
            relatedRecord[LINK_SYMBOL] = relationWithEntity
            const value = this.computeItemValue(relatedRecord, dataDeps)
            const replaced = await this.replaceItemState(relationWithEntity, value)
            if (replaced instanceof ComputationResult) return replaced
            return this.applyDelta(hostRecord, value, replaced.oldValue, 1)
        }

        if (relatedMutationEvent.type === 'delete' && relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的删除。
            // CAUTION delete 事件可能只是 filtered relation 的成员资格退出（行仍存在），必须复位绑定状态，
            //  否则关系再次进入时读到陈旧值导致增量错误。物理删除场景 setInternal 会安全忽略。
            let oldValue: V | null
            if (this.itemState) {
                oldValue = await this.itemState.get(relatedMutationEvent.record)
                await this.itemState.setInternal(relatedMutationEvent.record, this.emptyItemValue)
            } else {
                oldValue = this.presenceItemValue()
            }
            return this.applyDelta(hostRecord, null, oldValue ?? null, -1)
        }

        if (relatedMutationEvent.type === 'update') {
            // 关联关系或关联实体上的字段更新。
            if (!this.itemState) {
                // 无逐项状态（Count 无 callback）：字段更新不改变存在性贡献。
                return this.applyDelta(hostRecord, this.presenceItemValue(), this.presenceItemValue(), 0)
            }
            // relatedAttribute 是从当前 dataContext 出发，转换成从关联关系出发的 match key 反查关系记录。
            const relationMatchKey = buildRelationSideMatchKey(mutationEvent.relatedAttribute, this.relationSide)
            const relationWithEntity = await this.controller.system.storage.findOne(
                this.relation.name!,
                MatchExp.atom({ key: relationMatchKey, value: ['=', relatedMutationEvent.oldRecord!.id] }),
                undefined,
                this.relationAttributeQuery
            )
            // 关系记录已不可见（被删除/filtered 成员资格变化竞态）时退回全量重算。
            if (!relationWithEntity) {
                return ComputationResult.fullRecompute(`relation record not found by ${relationMatchKey} for ${describeDataContext(this.dataContext)}`)
            }
            const relatedRecord = relationWithEntity[this.relationSide]
            // 同 create 路径：端点缺失退回全量重算。
            if (!relatedRecord) {
                return ComputationResult.fullRecompute(`relation ${this.relationSide} endpoint missing for ${describeDataContext(this.dataContext)}`)
            }
            relatedRecord[LINK_SYMBOL] = relationWithEntity
            const value = this.computeItemValue(relatedRecord, dataDeps)
            const replaced = await this.replaceItemState(relationWithEntity, value)
            if (replaced instanceof ComputationResult) return replaced
            return this.applyDelta(hostRecord, value, replaced.oldValue, 0)
        }

        // 未知的 related 事件形态必须退回全量重算，静默 delta=0 会让聚合悄悄停滞。
        return ComputationResult.fullRecompute(`unknown related mutation event for ${describeDataContext(this.dataContext)}`)
    }
}
