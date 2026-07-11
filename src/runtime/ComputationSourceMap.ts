import { AttributeQueryData, RecordQueryData } from "../storage/index.js";
import { DataDep, Computation, RecordsDataDep, EventBasedComputation, EventDep } from "./computations/Computation.js";
import { PropertyDataContext } from "./computations/Computation.js";
import { Controller } from "./Controller.js";
import { DICTIONARY_RECORD, RecordMutationEvent } from "./System.js";
import { Scheduler } from "./Scheduler.js";
import { ComputationProtocolError } from "./errors/index.js";
import { mergedMutationEventView } from "./computations/TransitionFinder.js";

// SourceMap 类型定义
export type EntityCreateEventsSourceMap = {
    dataDep: DataDep,
    type: 'create',
    // 当前事件所属的 entity 的 name，当前的 entity 不一定就是 dataDep 的 source 实体。可能是 dataDep source 的关联实体。
    recordName: string,
    // 当前实体是否是 relation 类型
    isRelation?: boolean,
    // dataDep 的 source 实体
    sourceRecordName: string,
    // 监听变化的属性相对于 dataDep 实体对象的路径。路径是从当前实体出发的。
    targetPath?: string[],
    // 当前要记录的事件是不是为了 record 初始化时就进行计算而用的。
    isInitial?: boolean
    computation: Computation,
}

export type EntityDeleteEventsSourceMap = {
    dataDep: DataDep,
    type: 'delete',
    recordName: string,
    sourceRecordName: string,
    targetPath?: string[],
    isRelation?: boolean,
    computation: Computation
}

export type EntityUpdateEventsSourceMap = {
    dataDep: DataDep,
    type: 'update',
    recordName: string,
    attributes: string[],
    sourceRecordName: string,
    targetPath?: string[],
    computation: Computation,
    isRelation?: boolean,
    // 当监听对象是 filtered entity/relation 时，update 事件只会以【物理 base 记录名】发出
    // （filtered 名下只有成员资格 create/delete 事件）。此字段记录原 filtered 名：
    //  - recordName 注册为物理 base 名（否则监听永远不触发——成员字段更新静默丢失）；
    //  - Scheduler 路由时按此名做成员资格检查并把事件改写回 filtered 名，
    //    使 computation 的增量分支看到的事件与成员资格事件同名（enter/exit 由后者负责）。
    filteredRecordName?: string
}

export type DataBasedEntityEventsSourceMap = EntityCreateEventsSourceMap 
    | EntityDeleteEventsSourceMap 
    | EntityUpdateEventsSourceMap

export type EventBasedEntityEventsSourceMap = EventDep & {
    computation: Computation,
    // 与 EntityUpdateEventsSourceMap.filteredRecordName 同义：eventDep 监听 filtered
    // entity/relation 名的 update 事件时，监听注册到物理 base 名上，此字段记录原 filtered 名，
    // Scheduler 路由时做成员资格守卫并把事件名改写回 filtered 名。
    filteredRecordName?: string
}

export type EntityEventSourceMap = DataBasedEntityEventsSourceMap | EventBasedEntityEventsSourceMap

export type EtityMutationEvent = RecordMutationEvent & {
    dataDep?: DataDep,
    attributes?: string[],
    relatedAttribute?: string[],
    relatedMutationEvent?: RecordMutationEvent,
    isRelation?: boolean
}

// SourceMapTree 类型
export type DataSourceMapTree = {
    [key: string]: {
        [key: string]: EntityEventSourceMap[]
    }
}

export const PHASE_BEFORE_ALL = 0
export const PHASE_NORMAL = 1
export const PHASE_AFTER_ALL = 2
export type ComputationPhase = typeof PHASE_BEFORE_ALL|typeof PHASE_NORMAL|typeof PHASE_AFTER_ALL

// SourceMap 管理类 - 持有数据并提供查询接口
export class ComputationSourceMapManager {
    private sourceMaps: EntityEventSourceMap[] = []
    private sourceMapTree: DataSourceMapTree = {}
    // 视图名（filtered entity/relation、merged input）-> 物理 base 记录名
    private filteredToPhysicalName: Map<string, string> = new Map()
    // storage 可发射事件的全部记录名（事件的 recordName 恒 ∈ 此集合）
    private knownRecordNames: Set<string> = new Set()

    constructor(public controller: Controller, public scheduler: Scheduler) {
        
    }

    /**
     * 事件命名空间以 storage 编译结果（storage.schema.records）为唯一事实源。
     *
     * CAUTION 不能用「沿 controller.entities 的 baseEntity/baseRelation 链行走」重建这张表：
     *  merged input 视图（inputEntities/inputRelations 声明）是在 storage 编译期才被转换成
     *  filtered 形态的，controller 侧的实例图上看不到这层关系——手工行走会把 input 视图
     *  当成物理记录，其 update 监听（数据驱动与事件驱动两轨）全部注册成死监听（r18）。
     *  storage 的 resolvedBaseRecordName 覆盖全部视图形态：filtered 链、嵌套 filtered、
     *  merged input、filtered-over-merged-input。
     */
    private buildEventNamespace(): void {
        const schemaRecords = this.controller.system.storage.schema?.records
        if (!schemaRecords?.length) {
            throw new ComputationProtocolError(
                'ComputationSourceMapManager.initialize was called before storage setup populated the schema. ' +
                'The mutation-event namespace (record names, view resolution) comes from the compiled storage schema — ' +
                'initialize the system storage first.',
                { computationPhase: 'source-map-initialization' }
            )
        }
        this.filteredToPhysicalName = new Map()
        this.knownRecordNames = new Set()
        for (const record of schemaRecords) {
            this.knownRecordNames.add(record.recordName)
            if (record.resolvedBaseRecordName && record.resolvedBaseRecordName !== record.recordName) {
                this.filteredToPhysicalName.set(record.recordName, record.resolvedBaseRecordName)
            }
        }
    }

    /**
     * CAUTION 视图名（filtered entity/relation、merged input）下只有成员资格 create/delete
     *  事件；字段 update 事件永远以物理 base 记录名发出。注册在视图名上的 update
     *  监听是死监听——成员字段更新会静默丢失（数据驱动计算聚合值永久陈旧、
     *  事件驱动计算的 StateMachine trigger / Transform eventDep 永不触发）。
     *  这里把 update 监听改挂到物理名上，并记录原视图名，Scheduler 路由时
     *  按 filteredRecordName 做成员资格守卫并把事件名改写回视图名。
     *  数据驱动（dataDep）与事件驱动（eventDep）两条轨道必须同构处理。
     */
    private normalizeFilteredUpdateSourceMap(source: EntityEventSourceMap): EntityEventSourceMap {
        if (source.type !== 'update') return source
        const physicalName = this.filteredToPhysicalName.get(source.recordName)
        if (!physicalName) return source
        return {
            ...source,
            recordName: physicalName,
            filteredRecordName: source.recordName,
        } as EntityEventSourceMap
    }

    private describeComputation(computation: Computation): string {
        const dataContext = computation.dataContext as { type: string, host?: { name?: string }, id: { name?: string } | string }
        const idName = typeof dataContext.id === 'object' ? dataContext.id.name : String(dataContext.id)
        const target = dataContext.type === 'property' ? `${dataContext.host?.name}.${idName}` : idName
        return `${computation.args.constructor.displayName || computation.constructor.name} computation of ${dataContext.type} "${target}"`
    }

    /**
     * 死监听不变量（订阅面守卫）：每一个注册进 source map 的监听都必须可被 storage
     * 实际发射的事件命中。两条规则：
     *  1. recordName 必须是 storage 已知的记录名——未知名（typo、把 global dict 名当
     *     recordName、引用未注册进 Controller 的实体）意味着监听永远不会触发，计算
     *     永久静默陈旧，声明期直接拒绝；
     *  2. 归一化之后不允许任何 update 监听仍以视图名为键——normalize 是唯一合法入口，
     *     该规则被违反说明有生产者绕过了归一化（框架内部缺陷，同样 fail-fast 而不是
     *     留下静默死监听）。
     * 这条不变量的存在理由见 r18 复盘：F-1（filtered update 死监听）的通用规则在 r5 就
     * 被写进了注释，但只在数据驱动轨道上被执行——注释没有执行力，不变量有。
     */
    private assertListenerReachable(source: EntityEventSourceMap): void {
        if (!this.knownRecordNames.has(source.recordName)) {
            const dictHint = this.controller.dict.some(dictItem => dictItem.name === source.recordName)
                ? ` "${source.recordName}" is a global dictionary: dictionary changes are emitted as events on the "${DICTIONARY_RECORD}" record — declare { recordName: '${DICTIONARY_RECORD}', type: 'update', record: { key: '${source.recordName}' } } instead.`
                : ` Check for a typo, and make sure the entity/relation is registered on the Controller.`
            throw new ComputationProtocolError(
                `${this.describeComputation(source.computation)} listens to ${source.type} events of record "${source.recordName}", ` +
                `but no such record exists in the storage schema — this listener can never fire and the computation would stay silently stale.` +
                dictHint,
                {
                    handleName: source.computation.constructor.name,
                    dataContext: source.computation.dataContext,
                    computationPhase: 'source-map-initialization'
                }
            )
        }
        if (source.type === 'update' && this.filteredToPhysicalName.has(source.recordName)) {
            throw new ComputationProtocolError(
                `Internal invariant violated: an update listener of ${this.describeComputation(source.computation)} is still keyed under the view name "${source.recordName}" after normalization. ` +
                `Views (filtered entities/relations, merged inputs) never emit field update events — every producer of source maps must route through normalizeFilteredUpdateSourceMap. This is a framework bug; please report it.`,
                {
                    handleName: source.computation.constructor.name,
                    dataContext: source.computation.dataContext,
                    computationPhase: 'source-map-initialization'
                }
            )
        }
    }

    /**
     * 初始化或重新初始化 SourceMap 数据
     * @param sourceMaps EntityEventSourceMap 数组
     */
    initialize(computations: Set<Computation>): void {
        this.buildEventNamespace()
        const sortedERMutationEventSources: EntityEventSourceMap[][] = [[], [], []]

        

        for(const computation of computations) {
            // 1. 根据 data deps 计算出 mutation events
            if( this.scheduler.isDataBasedComputation(computation)) {
                if ((computation.incrementalCompute || computation.incrementalPatchCompute) && !computation.planIncremental) {
                    throw new ComputationProtocolError('Incremental data-based computation must implement planIncremental()', {
                        handleName: computation.constructor.name,
                        computationName: computation.args.constructor.displayName,
                        dataContext: computation.dataContext,
                        computationPhase: 'source-map-initialization'
                    })
                }

                const computationSources: EntityEventSourceMap[][] = [[], [], []]
                Object.entries(computation.dataDeps).forEach(([dataDepName, dataDep]) => {
                    // CAUTION fail fast：global 计算把自己的输出 dict 声明为 global dataDep 是无终止的
                    //  反馈环——每次写回都触发自身重算，setup/dispatch 无任何报错地挂起。
                    //  「依赖上一次的计算结果」应使用 useLastValue / state（GlobalBoundState），不是 dataDep。
                    if (dataDep.type === 'global' && computation.dataContext.type === 'global' && dataDep.source === computation.dataContext.id) {
                        throw new ComputationProtocolError(
                            `Global dataDep "${dataDepName}" of the computation on dictionary "${(computation.dataContext.id as { name?: string }).name}" references the computation's own output. ` +
                            `This creates an unterminated feedback loop (every write re-triggers the computation). ` +
                            `To use the previous result, rely on lastValue (useLastValue) or a GlobalBoundState instead of a dataDep.`,
                            {
                                handleName: computation.constructor.name,
                                computationName: computation.args.constructor.displayName,
                                dataContext: computation.dataContext,
                                computationPhase: 'source-map-initialization'
                            }
                        )
                    }
                    const sources = this.convertDataDepToERMutationEventsSourceMap(dataDepName, dataDep, computation)
                    computationSources[dataDep.phase || PHASE_NORMAL].push(...sources)
                })

                // 2. 监听自身 record 的 create 事件，可能一开始创建就要执行一遍 computation. 如果依赖了已有的 global dict。
                // CAUTION 必须与业务 dataDeps 已注册的宿主 create 监听去重：
                //  property dataDep 本身就会注册宿主 create（convertAttrsToERMutationEventsSourceMap includeCreate），
                //  再叠加 _self 会让同一个 create 事件触发同一计算两次（昂贵计算/async 计算实打实双跑）。
                if (computation.dataContext.type === 'property' && Object.values(computation.dataDeps).some(dataDep => dataDep.type === 'global')) {
                    const hostName = computation.dataContext.host.name
                    const alreadyListensHostCreate = computationSources.some(sources =>
                        sources.some(source => source.type === 'create' && source.recordName === hostName)
                    )
                    if (!alreadyListensHostCreate) {
                        const selfDataDep: RecordsDataDep = {
                            type: 'records',
                            source: computation.dataContext.host,
                        }
                        computationSources[PHASE_NORMAL].push(...this.convertDataDepToERMutationEventsSourceMap('_self', selfDataDep, computation, 'create'))
                    }
                }

                computationSources.forEach((sources, phase) => {
                    sortedERMutationEventSources[phase].push(...sources)
                })
            } else {
                // const recordDataDep: RecordsDataDep = {
                //     type: 'records',
                //     source: InteractionEventEntity,
                //     attributeQuery: ['*']
                // }
                // ERMutationEventSources.push(...this.convertDataDepToERMutationEventsSourceMap('record', recordDataDep, computation, 'create'))
                const {eventDeps} = computation as EventBasedComputation
                for(const eventDep of Object.values(eventDeps!)) {

                    sortedERMutationEventSources[eventDep.phase||PHASE_NORMAL].push({
                        type: eventDep.type,
                        recordName: eventDep.recordName,
                        record: eventDep.record,
                        oldRecord: eventDep.oldRecord,
                        computation
                    } as EventBasedEntityEventsSourceMap)

                    // ERMutationEventSources.push({
                    //     type: eventDep.type,
                    //     recordName: eventDep.recordName,
                    //     computation
                    // } as EventBasedEntityEventsSourceMap)
                }
            }
        }

        this.sourceMaps = sortedERMutationEventSources.flat().map(source => this.normalizeFilteredUpdateSourceMap(source))
        this.sourceMaps.forEach(source => this.assertListenerReachable(source))
        this.sourceMapTree = this.buildDataSourceMapTree(this.sourceMaps)
    }
    /**
     * 添加新的 SourceMap。
     * CAUTION 与 initialize 走同一条归一化 + 可达性校验管线：任何生产者都不允许绕过
     *  normalizeFilteredUpdateSourceMap 直接入树（视图名 update 监听会成为静默死监听）。
     */
    addSourceMap(sourceMap: EntityEventSourceMap): void {
        const normalized = this.normalizeFilteredUpdateSourceMap(sourceMap)
        this.assertListenerReachable(normalized)
        this.sourceMaps.push(normalized)
        this.addToTree(normalized)
    }

    /**
     * 批量添加 SourceMap（逐条走 addSourceMap 的归一化 + 校验管线）
     */
    addSourceMaps(sourceMaps: EntityEventSourceMap[]): void {
        sourceMaps.forEach(sourceMap => this.addSourceMap(sourceMap))
    }

    /**
     * 根据 mutation event 查找对应的 SourceMap
     * @param mutationEvent RecordMutationEvent
     * @returns 匹配的 EntityEventSourceMap 数组
     */
    findSourceMapsForMutation(mutationEvent: RecordMutationEvent): EntityEventSourceMap[] {
        return this.sourceMapTree[mutationEvent.recordName]?.[mutationEvent.type] || []
    }

    /**
     * 检查 update 类型的更新对 DataBasedComputation 是否需要触发计算
     * @param source EntityEventSourceMap
     * @param mutationEvent RecordMutationEvent
     * @returns 是否需要触发计算
     */
    shouldTriggerUpdateComputation(source: EntityEventSourceMap, mutationEvent: RecordMutationEvent): boolean {
        // CAUTION global 依赖监听的是整张 DICTIONARY_RECORD 表的 create/update 事件，
        //  必须按 key 过滤，否则任何 dict 的创建/更新（包括本计算自己的输出 dict）都会触发计算——
        //  对增量计算而言这是把无关事件喂进 incrementalCompute 的直接来源。
        if ('dataDep' in source && source.dataDep.type === 'global' && mutationEvent.recordName === DICTIONARY_RECORD) {
            return mutationEvent.record?.key === source.dataDep.source.name
        }
        if (source.type !== 'update' || !('dataDep' in source)) {
            return true
        }
        // 如果是更新，检查是否是依赖的属性有变化。
        if (source.attributes!.includes('*')) {
            return Object.keys(mutationEvent.record || {}).some(attr =>
                attr !== 'id' && mutationEvent.record![attr] !== mutationEvent.oldRecord?.[attr]
            )
        }
        const propAttrs = source.attributes!.filter(attr => attr !== 'id')
        return !propAttrs.every(attr => 
            !mutationEvent.record!.hasOwnProperty(attr) || 
            (mutationEvent.record![attr] === mutationEvent.oldRecord![attr])
        )
    }

    /**
     * 检查 EventBasedComputation 的 eventDep 是否匹配当前的 mutation event
     * @param source EventBasedEntityEventsSourceMap  
     * @param mutationEvent RecordMutationEvent
     * @returns 是否匹配
     */
    shouldTriggerEventBasedComputation(source: EventBasedEntityEventsSourceMap, mutationEvent: RecordMutationEvent): boolean {
        // 对于 EventBasedComputation，检查 eventDep 中的 record 和 oldRecord 字段是否匹配
        const eventDep = source as EventDep & { computation: Computation }
        
        
        // 如果 eventDep 中定义了 record 字段，需要深度匹配
        if (eventDep.record !== undefined) {
            // 对于 update 操作，mutationEvent.record 可能只包含更新的字段，record 模式按
            // 合并后的当前状态匹配。与 StateMachine trigger（TransitionFinder）共用同一个
            // 合并视图——同一声明面（RecordMutationEventPattern）的所有读者必须同构。
            const actualRecord = (mergedMutationEventView(mutationEvent) as RecordMutationEvent).record
            
            if (!this.deepMatch(actualRecord, eventDep.record)) {
                return false
            }
        }
        
        // 如果 eventDep 中定义了 oldRecord 字段，需要深度匹配
        if (eventDep.oldRecord !== undefined) {
            if (!this.deepMatch(mutationEvent.oldRecord, eventDep.oldRecord)) {
                return false
            }
        }
        
        return true
    }

    /**
     * 深度匹配对象
     * @param actual 实际的对象
     * @param expected 期望匹配的模式
     * @returns 是否匹配
     */
    private deepMatch(actual: any, expected: any): boolean {
        // 如果期望值是 null 或 undefined，直接比较
        if (expected === null || expected === undefined) {
            return actual === expected
        }
        
        // 如果期望值是原始类型，直接比较
        if (typeof expected !== 'object') {
            return actual === expected
        }
        
        // 如果实际值不是对象，不匹配
        if (typeof actual !== 'object' || actual === null) {
            return false
        }
        
        // 深度匹配对象的每个属性
        for (const key in expected) {
            if (expected.hasOwnProperty(key)) {
                // 对于 actual 中不存在的 key，视为不匹配
                // 这很重要，因为我们需要确保 expected 中声明的字段在 actual 中都存在
                if (!(key in actual)) {
                    return false
                }
                if (!this.deepMatch(actual[key], expected[key])) {
                    return false
                }
            }
        }
        
        return true
    }

    convertDataDepToERMutationEventsSourceMap(dataDepName:string, dataDep: DataDep, computation: Computation, eventType?: 'create'|'delete'|'update', isInitial: boolean = false): EntityEventSourceMap[] {
        const ERMutationEventsSource: EntityEventSourceMap[]= []
        if (dataDep.type === 'records') {
            // 监听的是某个 records 集合。例如全局的 Count 就需要。
            // 没有指定 eventType 就说明全都要监听
            if (!eventType || eventType === 'create') {
                ERMutationEventsSource.push({
                    dataDep: dataDep,
                    type: 'create',
                    recordName: dataDep.source.name!,
                    sourceRecordName: dataDep.source.name!,
                    computation,
                    isInitial,
                })
            }
            if (!eventType || eventType === 'delete') {
                ERMutationEventsSource.push({    
                    dataDep: dataDep,
                    type: 'delete',
                    recordName: dataDep.source.name!,
                    sourceRecordName: dataDep.source.name!,
                    computation
                })
            }
            
            if (!eventType || eventType === 'update') {
                // 监听 update
                const attributeQuery = this.mergeAttributeQueries(
                    dataDep.attributeQuery,
                    this.matchAttributeQuery(dataDep.match),
                    this.modifierAttributeQuery(dataDep.modifier)
                )
                if (attributeQuery.length > 0) {
                    ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dataDep, dataDep.source.name!, attributeQuery, [], computation, false))
                }
            }
            
        } else if (dataDep.type==='property') {
            // 依赖的是单个记录的某个 property 属性，或者关联实体、关联关系。例如自定义的计算中就常见。
            // 只能监听 update eventType。
            const dataContext = computation.dataContext as PropertyDataContext

            // CAUTION fail fast：property 依赖没有 attributeQuery 时无法编译出任何监听，
            //  计算将永远不会被触发（连初次 compute 都没有），这是静默错误结果，必须在 setup 阶段拒绝。
            if (!dataDep.attributeQuery || dataDep.attributeQuery.length === 0) {
                throw new ComputationProtocolError(
                    `Property dataDep "${dataDepName}" of computation on "${dataContext.host.name}.${dataContext.id.name}" must declare a non-empty attributeQuery. Without it no mutation listener can be registered and the computation would never run. Declare the fields it depends on, e.g. { type: 'property', attributeQuery: ['fieldA'] }`,
                    {
                        handleName: computation.constructor.name,
                        dataContext: computation.dataContext,
                        computationPhase: 'source-map-initialization'
                    }
                )
            }
            // 注意这里的 recordName 应该是当前数据 entity 的 name，因为依赖的是 property 所在的自身 entity
            ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dataDep, dataContext.host.name!, dataDep.attributeQuery, [], computation, true))
        } else if (dataDep.type ==='global') {
            // 依赖的是全局的一个 Dict 值。注意这里理论上只有 create 和 update，初始化的时候会得到创建的事件。全局的值是不会删除的。
            // Global 数据存储在 _System_ 表中，监听 state 类型的记录更新
            if (!eventType || eventType === 'update') {
                ERMutationEventsSource.push({
                    dataDep: dataDep,
                    type: 'update',
                    recordName: DICTIONARY_RECORD,
                    sourceRecordName: DICTIONARY_RECORD,
                    attributes: ['value'],
                    computation
                })
            }

            // create 也需要监听，因为可能依赖了已有的 global dict。
            if (!eventType || eventType === 'create'){
                ERMutationEventsSource.push({
                    dataDep: dataDep,
                    type: 'create',
                    recordName: DICTIONARY_RECORD,
                    sourceRecordName: DICTIONARY_RECORD,
                    computation
                })
            }
        }

        return ERMutationEventsSource
    }

    private mergeAttributeQueries(...queries: (AttributeQueryData | undefined)[]): AttributeQueryData {
        const result: AttributeQueryData = []
        const seen = new Set<string>()
        for (const query of queries) {
            for (const item of query || []) {
                const key = JSON.stringify(item)
                if (seen.has(key)) continue
                seen.add(key)
                result.push(item)
            }
        }
        return result
    }

    private matchAttributeQuery(match: RecordsDataDep['match']): AttributeQueryData {
        if (!match) return []
        const paths: string[][] = []
        const visit = (node: any) => {
            if (!node) return
            if (typeof node.isExpression === 'function' && node.isExpression()) {
                visit(node.left)
                visit(node.right)
            } else if (typeof node.isAtom === 'function' && node.isAtom()) {
                const key = node.data?.key
                if (typeof key === 'string') paths.push(key.split('.'))
            } else if (node.type === 'expression') {
                visit(node.left)
                visit(node.right)
            } else if (node.type === 'atom') {
                const key = node.data?.key
                if (typeof key === 'string') paths.push(key.split('.'))
            }
        }
        visit(match)
        return this.pathsToAttributeQuery(paths)
    }

    private modifierAttributeQuery(modifier: RecordsDataDep['modifier']): AttributeQueryData {
        const orderBy = (modifier as any)?.orderBy
        if (!orderBy || typeof orderBy !== 'object') return []
        return this.pathsToAttributeQuery(Object.keys(orderBy).map(key => key.split('.')))
    }

    private pathsToAttributeQuery(paths: string[][]): AttributeQueryData {
        const result: AttributeQueryData = []
        for (const path of paths) {
            if (path.length === 0) continue
            if (path.length === 1) {
                result.push(path[0])
                continue
            }
            result.push([path[0], { attributeQuery: this.pathsToAttributeQuery([path.slice(1)]) }])
        }
        return result
    }
    
    convertAttrsToERMutationEventsSourceMap(dataDep: DataDep, baseRecordName: string, attributes: AttributeQueryData, context: string[], computation: Computation, includeCreate: boolean = false) {
        const ERMutationEventsSource: EntityEventSourceMap[] = []
        const primitiveAttr: string[] = []
        const relationQueryAttr: [string, RecordQueryData][] = []
        

        attributes.forEach(attr => {
            if (typeof attr === 'string' && attr !== '*') {
                primitiveAttr.push(attr)
            } else if (attr ==='*') {
                primitiveAttr.push('*')
            } else if (Array.isArray(attr)) {
                relationQueryAttr.push(attr as [string, RecordQueryData])
            } else {
                throw new Error(`unknown attribute type: ${attr}`)
            }
        })
        // 自身的 attribute update
        if (primitiveAttr.length > 0) {
            let recordName = baseRecordName
            if (context.length>0) {
                if (context.at(-1) === '&') {
                    recordName = this.controller.system.storage.getRelationName(baseRecordName, context.slice(0, -1).join('.'))
                } else {
                    recordName = this.controller.system.storage.getEntityName(baseRecordName, context.join('.'))
                }
            }
            // 当依赖是 property 的时候，record 的创建也要监听，相当于初次就要执行 computation
            if (includeCreate) {
                ERMutationEventsSource.push({
                    dataDep,
                    type: 'create',
                    recordName,
                    sourceRecordName: baseRecordName,
                    targetPath: context,
                    computation
                })
            }
            ERMutationEventsSource.push({
                dataDep,
                type: 'update',
                recordName,
                sourceRecordName: baseRecordName,
                targetPath: context,
                attributes: primitiveAttr,
                computation
            })
        }

        // 关联 record 字段的更新
        relationQueryAttr.forEach(([attrName, subQuery]) => {
            ERMutationEventsSource.push(...this.convertRelationAttrToERMutationEventsSourceMap(dataDep, baseRecordName, subQuery.attributeQuery!, context.concat(attrName), computation))
        })
        return ERMutationEventsSource
    }

    convertRelationAttrToERMutationEventsSourceMap(dataDep: DataDep, baseRecordName: string, subAttrs: AttributeQueryData, context: string[], computation: Computation) {
        const ERMutationEventsSource: EntityEventSourceMap[] = []

        if (context.at(-1) !== '&') {
            // 1. 先监听"关联实体关系"的 create/delete
            const realtionRecordName = this.controller.system.storage.getRelationName(baseRecordName, context.join('.'))
            // CAUTION 虚拟 link（relation 记录自身的 source/target 端点，isSourceRelation）
            //  只存在于 map.links、不是 record，storage 从不以它的名字发射事件——注册在
            //  虚拟 link 名上的 create/delete 是死监听。端点的建立/解除只能经由 relation
            //  记录整体的 create/delete 表达，而那两个监听已由 records dataDep 在上层注册。
            //  这里只为真实 relation record（可发射事件）注册监听；嵌套端点实体的字段
            //  update 监听（下方步骤 2）不受影响。
            if (this.knownRecordNames.has(realtionRecordName)) {
                ERMutationEventsSource.push({
                    dataDep,
                    type: 'create',
                    recordName: realtionRecordName,
                    sourceRecordName: baseRecordName,
                    isRelation: true,
                    targetPath: context,
                    computation
                }, {
                    dataDep,
                    type: 'delete',
                    recordName: realtionRecordName,
                    sourceRecordName: baseRecordName,
                    isRelation: true,
                    targetPath: context,
                    computation
                })
            }
        }
        // 2. 监听关联实体的属性 update
        if (subAttrs.length > 0) {
            ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dataDep, baseRecordName, subAttrs, context, computation))
        }
            
        return ERMutationEventsSource

        
    }

    /**
     * 获取 SourceMapTree 的只读副本
     * @returns DataSourceMapTree 的副本
     */
    getSourceMapTree(): DataSourceMapTree {
        // 使用浅拷贝避免循环引用问题
        const result: DataSourceMapTree = {}
        for (const [recordName, typeMap] of Object.entries(this.sourceMapTree)) {
            result[recordName] = {}
            for (const [type, sourceMaps] of Object.entries(typeMap)) {
                result[recordName][type] = [...sourceMaps]
            }
        }
        return result
    }

    /**
     * 私有方法：构建 SourceMap 树结构
     * @param sourceMaps EntityEventSourceMap 数组
     * @returns 两层结构的树，第一层是 recordName，第二层是 type
     */
    private buildDataSourceMapTree(sourceMaps: EntityEventSourceMap[]): DataSourceMapTree {
        const sourceMapTree: DataSourceMapTree = {}
        sourceMaps.forEach(source => {
            this.addToTree(source, sourceMapTree)
        })
        return sourceMapTree
    }

    /**
     * 私有方法：将单个 SourceMap 添加到树结构中
     * @param source EntityEventSourceMap
     * @param tree 可选的目标树，默认使用实例的 sourceMapTree
     */
    private addToTree(source: EntityEventSourceMap, tree?: DataSourceMapTree): void {
        const targetTree = tree || this.sourceMapTree
        if (!targetTree[source.recordName]) {
            targetTree[source.recordName] = {}
        }
        if (!targetTree[source.recordName][source.type]) {
            targetTree[source.recordName][source.type] = []
        }
        targetTree[source.recordName][source.type].push(source)
    }
} 
