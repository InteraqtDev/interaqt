/**
 * 事件驱动计算生成式测试（quality-plan §1.3 第 2 步剩余扩张点 / §1.5 未覆盖域：
 * StateMachine / Transform eventDeps × InteractionEvent 轨）。
 *
 * 动机：计算层 fuzz（computationGenerativeFuzz）只覆盖数据驱动聚合面；事件驱动计算
 * （StateMachine trigger / Transform eventDeps）此前完全依赖手写夹具——r31-A（消费者
 * 读 partial record）、r31-H1（computeTarget id 形态分裂双跳）、r28（重叠 eventDep 双插）
 * 全部是「声明组合 × 事件序列」空间里的格子，夹具枚举不出没想到的组合。本 fuzzer 把
 * 声明与驱动序列同时放进生成域：
 *
 * - schema：2 实体（value props: label/kind/score+default）+ User + 2..3 带 isRef payload
 *   的 Interaction + 0..1 无 payload Interaction（全部 rng 决定）；
 * - 计算声明：1..2 个 property 级 StateMachine + 0..1 个全局（Dictionary）StateMachine +
 *   0..2 个事件驱动 Transform（派生实体）+ 各 50% 概率在派生实体上叠一个全局 Count（链式）。
 *   trigger/eventDep 菜单：InteractionEvent create（record.interactionName 模式）/
 *   宿主 create（可带 record 模式）/ 宿主 update（keys 锚定 + 可带 record 模式）/
 *   宿主 delete（Transform）。SM 两种取值流派：状态名（string）与 computeValue 计数器
 *   （number，覆盖 lastValue 传递）。Transform 轴：重叠 eventDep（r28 去重契约）、
 *   数组返回（transformIndex）、条件 null 返回（skip 插入）。
 * - 驱动序列：storage 直写（create/update/delete）与 controller.dispatch（合法 ref /
 *   bogus ref 守卫拒绝 / 无 payload）混合；ref id 两种形态（驱动原生 + 字符串）。
 * - 预言机：**独立 JS 模型**从操作意图推导事件流（无关系 schema 下事件构造是确定的：
 *   create ⇒ 全字段含默认值；update ⇒ keys=写入字段、record 按合并视图=行终态；
 *   dispatch ⇒ InteractionEvent create），并按框架契约独立实现匹配语义
 *   （deepPartialMatch 合并视图 + keys 子集 + 每 (计算,事件) 恰好一跳/一跑）。
 *   每步断言：全部 SM 属性值 / 全局 dict 值 / Transform 派生行多重集 / 链式 Count。
 *
 * 生成域刻意未含（登记为后续扩张点）：关系事件 trigger（combined/link 事件名维度）、
 * oldRecord 模式、record 模式嵌套 payload 匹配、SM 输出属性回声触发（echo 域——update
 * trigger 全部 keys 锚定在 value prop 上）、activity 层（独立套件）。
 *
 * 预言机敏感性已验证（开发期）：模型转移逻辑注入偏移后 6/6 种子当场变红。
 *
 * 再现：FUZZ_EVENT_SEED_START / FUZZ_EVENT_SEED_COUNT / FUZZ_EVENT_OPS；FUZZ_VERBOSE=1。
 */
import { describe, expect, test } from "vitest";
import {
    Action, Controller, Count, Dictionary, Entity, InteractionEventEntity, Interaction,
    KlassByName, MonoSystem, Payload, PayloadItem, Property, StateMachine, StateNode,
    StateTransfer, Transform,
} from 'interaqt';
import { MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';
import { mulberry32, chance, int, pick, type Rng } from "../storage/helpers/fuzzRandom.js";

type Row = Record<string, unknown>

// ---------- 声明描述（模型与声明共用同一描述，声明工厂据此构造真实实例） ----------
type TriggerDescriptor =
    | { family: 'interaction', interactionName: string }
    | { family: 'hostCreate', recordPattern?: { kind: string } }
    | { family: 'hostUpdate', keys: string[], recordPattern?: { kind: string } }
    | { family: 'hostDelete' }

type SmDescriptor = {
    cell: string
    scope: 'property' | 'global'
    hostEntity: string            // property 级 = 宿主实体；global 级 = 宿主族 trigger 的事件实体
    propertyName?: string         // property 级
    dictName?: string             // global 级
    flavor: 'name' | 'counter'    // 状态名 vs computeValue 计数器
    stateNames: string[]
    initialState: string
    transfers: { current: string, next: string, trigger: TriggerDescriptor }[]
}

type TransformDescriptor = {
    cell: string
    derivedEntity: string
    deps: TriggerDescriptor[]     // 命中任意一个 ⇒ 恰好一次 callback（r28 去重契约）
    arrayReturn: boolean          // 返回 [via:'a', via:'b'] 两行
    nullOnCold: boolean           // 合并视图 kind==='cold' 时返回 null（仅宿主族）
    chainedCountDict?: string     // 派生实体上的全局 Count（链式）
    hostEntity?: string           // 宿主族 dep 的宿主（interaction 族为 undefined）
}

type FuzzDeclarations = {
    entityNames: string[]
    userEntityName: string
    payloadInteractions: { name: string, baseEntity: string }[]
    plainInteractions: { name: string }[]
    sms: SmDescriptor[]
    transforms: TransformDescriptor[]
    entities: unknown[]
    dictionaries: unknown[]
    eventSources: unknown[]
}

const KIND_MENU = ['hot', 'cold'] as const

function genTrigger(
    rng: Rng, families: Array<TriggerDescriptor['family']>,
    context: { hostEntity: string, interactions: { name: string, baseEntity: string }[], plainInteractions: { name: string }[], allowPlainInteraction: boolean }
): TriggerDescriptor | null {
    const family = pick(rng, families)
    if (family === 'interaction') {
        // property 级需要 payload 携带宿主 ref；global 级也可用无 payload interaction
        const withPayload = context.interactions.filter(i => i.baseEntity === context.hostEntity)
        const usePlain = context.allowPlainInteraction && context.plainInteractions.length && (!withPayload.length || chance(rng, 0.4))
        if (usePlain) return { family, interactionName: pick(rng, context.plainInteractions).name }
        if (!withPayload.length) return null
        return { family, interactionName: pick(rng, withPayload).name }
    } else if (family === 'hostCreate') {
        return { family, recordPattern: chance(rng, 0.5) ? { kind: 'hot' } : undefined }
    } else if (family === 'hostUpdate') {
        return { family, keys: ['kind'], recordPattern: chance(rng, 0.5) ? { kind: 'hot' } : undefined }
    }
    return { family: 'hostDelete' }
}

function triggerFamilyKey(trigger: TriggerDescriptor): string {
    return trigger.family === 'interaction' ? `interaction:${trigger.interactionName}` : trigger.family
}

function genDeclarations(rng: Rng, tag: string): FuzzDeclarations {
    const entityNames = ['A', 'B'].map(n => `FzE${tag}${n}`)
    const userEntityName = `FzE${tag}U`
    const entityByName = new Map<string, InstanceType<typeof Entity>>()
    for (const name of entityNames) {
        entityByName.set(name, Entity.create({
            name,
            properties: [
                Property.create({ name: 'label', type: 'string' }),
                Property.create({ name: 'kind', type: 'string' }),
                Property.create({ name: 'score', type: 'number', defaultValue: () => 7 }),
            ]
        }))
    }
    const userEntity = Entity.create({ name: userEntityName, properties: [Property.create({ name: 'name', type: 'string' })] })

    // interactions：2..3 个带 isRef payload（base 随机）+ 0..1 个无 payload
    const payloadInteractions: { name: string, baseEntity: string }[] = []
    const eventSources: unknown[] = []
    const payloadCount = 2 + int(rng, 2)
    for (let i = 0; i < payloadCount; i++) {
        const baseEntity = pick(rng, entityNames)
        const name = `fzE${tag}ix${i}`
        eventSources.push(Interaction.create({
            name,
            action: Action.create({ name }),
            payload: Payload.create({
                items: [PayloadItem.create({ name: 'target', type: 'Entity', base: entityByName.get(baseEntity)!, isRef: true, required: true })]
            })
        }))
        payloadInteractions.push({ name, baseEntity })
    }
    const plainInteractions: { name: string }[] = []
    if (chance(rng, 0.6)) {
        const name = `fzE${tag}plain`
        eventSources.push(Interaction.create({ name, action: Action.create({ name }) }))
        plainInteractions.push({ name })
    }

    // ---------- StateMachine 声明 ----------
    const sms: SmDescriptor[] = []
    const dictionaries: unknown[] = []
    const buildSm = (descriptor: SmDescriptor) => {
        const nodeByName = new Map<string, ReturnType<typeof StateNode.create>>()
        for (const stateName of descriptor.stateNames) {
            nodeByName.set(stateName, StateNode.create({
                name: stateName,
                ...(descriptor.flavor === 'counter'
                    ? { computeValue: (lastValue: unknown) => typeof lastValue === 'number' ? lastValue + 1 : 1 }
                    : {}),
            }))
        }
        const transfers = descriptor.transfers.map(transfer => {
            const trigger = transfer.trigger
            const triggerPattern = trigger.family === 'interaction'
                ? { recordName: InteractionEventEntity.name, type: 'create' as const, record: { interactionName: trigger.interactionName } }
                : trigger.family === 'hostCreate'
                    ? { recordName: descriptor.hostEntity, type: 'create' as const, ...(trigger.recordPattern ? { record: trigger.recordPattern } : {}) }
                    : trigger.family === 'hostUpdate'
                        ? { recordName: descriptor.hostEntity, type: 'update' as const, keys: trigger.keys, ...(trigger.recordPattern ? { record: trigger.recordPattern } : {}) }
                        : { recordName: descriptor.hostEntity, type: 'delete' as const }
            return StateTransfer.create({
                current: nodeByName.get(transfer.current)!,
                next: nodeByName.get(transfer.next)!,
                trigger: triggerPattern,
                ...(descriptor.scope === 'property' ? {
                    computeTarget: trigger.family === 'interaction'
                        ? (event: any) => ({ id: event.record.payload!.target.id })
                        : (event: any) => ({ id: event.record.id }),
                } : {}),
            })
        })
        return StateMachine.create({
            states: [...nodeByName.values()],
            initialState: nodeByName.get(descriptor.initialState)!,
            transfers,
        })
    }

    // property 级：1..2 个
    const propertySmCount = 1 + int(rng, 2)
    for (let i = 0; i < propertySmCount; i++) {
        const hostEntity = pick(rng, entityNames)
        const flavor: SmDescriptor['flavor'] = chance(rng, 0.3) ? 'counter' : 'name'
        const stateCount = 2 + int(rng, 2)
        const stateNames = Array.from({ length: stateCount }, (_, s) => `s${s}`)
        const transfers: SmDescriptor['transfers'] = []
        const usedFamilies = new Map<string, Set<string>>() // current -> family keys（TransitionFinder 歧义守卫）
        const transferCount = 1 + int(rng, 3)
        for (let t = 0; t < transferCount; t++) {
            const current = pick(rng, stateNames)
            const next = pick(rng, stateNames.filter(s => s !== current))
            const trigger = genTrigger(rng, ['interaction', 'hostCreate', 'hostUpdate'],
                { hostEntity, interactions: payloadInteractions, plainInteractions: [], allowPlainInteraction: false })
            if (!trigger) continue
            const familyKey = triggerFamilyKey(trigger)
            if (!usedFamilies.has(current)) usedFamilies.set(current, new Set())
            if (usedFamilies.get(current)!.has(familyKey)) continue // 同 current 同族 ⇒ 可能歧义，生成域排除
            usedFamilies.get(current)!.add(familyKey)
            transfers.push({ current, next, trigger })
        }
        if (!transfers.length) continue
        const propertyName = `fzsm${i}`
        const descriptor: SmDescriptor = {
            cell: `sm:${hostEntity}.${propertyName}/${flavor}`,
            scope: 'property', hostEntity, propertyName, flavor,
            stateNames, initialState: stateNames[0], transfers,
        }
        entityByName.get(hostEntity)!.properties.push(Property.create({
            name: propertyName,
            type: flavor === 'counter' ? 'number' : 'string',
            computation: buildSm(descriptor),
        }))
        sms.push(descriptor)
    }

    // global 级：0..1 个
    if (chance(rng, 0.7)) {
        const hostEntity = pick(rng, entityNames)
        const flavor: SmDescriptor['flavor'] = chance(rng, 0.3) ? 'counter' : 'name'
        const stateNames = ['g0', 'g1']
        const transfers: SmDescriptor['transfers'] = []
        const usedFamilies = new Map<string, Set<string>>()
        const transferCount = 1 + int(rng, 2)
        for (let t = 0; t < transferCount; t++) {
            const current = pick(rng, stateNames)
            const next = stateNames.find(s => s !== current)!
            const trigger = genTrigger(rng, ['interaction', 'hostCreate', 'hostDelete'],
                { hostEntity, interactions: payloadInteractions, plainInteractions, allowPlainInteraction: true })
            if (!trigger) continue
            const familyKey = triggerFamilyKey(trigger)
            if (!usedFamilies.has(current)) usedFamilies.set(current, new Set())
            if (usedFamilies.get(current)!.has(familyKey)) continue
            usedFamilies.get(current)!.add(familyKey)
            transfers.push({ current, next, trigger })
        }
        if (transfers.length) {
            const dictName = `fzE${tag}gsm`
            const descriptor: SmDescriptor = {
                cell: `gsm:${dictName}/${flavor}`,
                scope: 'global', hostEntity, dictName, flavor,
                stateNames, initialState: stateNames[0], transfers,
            }
            dictionaries.push(Dictionary.create({
                name: dictName,
                type: flavor === 'counter' ? 'number' : 'string',
                collection: false,
                computation: buildSm(descriptor),
            }))
            sms.push(descriptor)
        }
    }

    // ---------- 事件驱动 Transform 声明 ----------
    const transforms: TransformDescriptor[] = []
    const transformCount = int(rng, 3) // 0..2
    for (let i = 0; i < transformCount; i++) {
        const hostEntity = pick(rng, entityNames)
        const primary = genTrigger(rng, ['interaction', 'hostCreate', 'hostUpdate', 'hostDelete'],
            { hostEntity, interactions: payloadInteractions, plainInteractions, allowPlainInteraction: true })
        if (!primary) continue
        const deps: TriggerDescriptor[] = [primary]
        // 重叠 eventDep 轴（r28 去重契约）：宿主 create 族叠加一个宽模式（无 record 约束）
        const overlap = primary.family === 'hostCreate' && primary.recordPattern !== undefined && chance(rng, 0.5)
        if (overlap) deps.push({ family: 'hostCreate' })
        const derivedEntity = `FzE${tag}T${i}`
        const isHostFamily = primary.family !== 'interaction'
        const descriptor: TransformDescriptor = {
            cell: `transform:${derivedEntity}(${deps.map(triggerFamilyKey).join('+')})`,
            derivedEntity, deps,
            arrayReturn: chance(rng, 0.3),
            nullOnCold: isHostFamily && chance(rng, 0.4),
            hostEntity: isHostFamily ? hostEntity : undefined,
        }
        const eventDeps: Record<string, unknown> = {}
        deps.forEach((dep, depIndex) => {
            const depName = `dep${depIndex}`
            eventDeps[depName] = dep.family === 'interaction'
                ? { recordName: InteractionEventEntity.name, type: 'create', record: { interactionName: dep.interactionName } }
                : dep.family === 'hostCreate'
                    ? { recordName: hostEntity, type: 'create', ...(dep.recordPattern ? { record: dep.recordPattern } : {}) }
                    : dep.family === 'hostUpdate'
                        ? { recordName: hostEntity, type: 'update', keys: dep.keys, ...(dep.recordPattern ? { record: dep.recordPattern } : {}) }
                        : { recordName: hostEntity, type: 'delete' }
        })
        const callback = function (event: any) {
            const record = event.record ?? {}
            if (descriptor.nullOnCold && record.kind === 'cold') return null
            const srcLabel = descriptor.hostEntity ? String(record.label ?? '') : String(record.interactionName ?? '')
            if (descriptor.arrayReturn) return [{ srcLabel, via: 'a' }, { srcLabel, via: 'b' }]
            return { srcLabel, via: 'single' }
        }
        entityByName.set(derivedEntity, Entity.create({
            name: derivedEntity,
            properties: [
                Property.create({ name: 'srcLabel', type: 'string' }),
                Property.create({ name: 'via', type: 'string' }),
            ],
            computation: Transform.create({ eventDeps, callback } as any),
        }))
        // 链式 Count（Transform 产出再进聚合——事件轨与数据轨的衔接面）
        if (chance(rng, 0.5)) {
            const chainedName = `fzE${tag}tcnt${i}`
            descriptor.chainedCountDict = chainedName
            dictionaries.push(Dictionary.create({
                name: chainedName, type: 'number', collection: false,
                computation: Count.create({ record: entityByName.get(derivedEntity)!, attributeQuery: [], callback: () => true } as any),
            }))
        }
        transforms.push(descriptor)
    }

    return {
        entityNames, userEntityName, payloadInteractions, plainInteractions, sms, transforms,
        entities: [...entityByName.values(), userEntity],
        dictionaries,
        eventSources,
    }
}

// ---------- 独立 JS 模型 ----------
/**
 * 模型事件（从操作意图独立推导，不读框架事件流）：
 * - create ⇒ { type:'create', recordName, record: 全字段（含默认值） }
 * - update ⇒ { type:'update', recordName, keys: 写入字段, record: 合并视图 = 行终态 }
 * - delete ⇒ { type:'delete', recordName, record: 删除前行 }
 * - dispatch ⇒ { type:'create', recordName: InteractionEventEntity.name, record: {interactionName, payload} }
 */
type ModelEvent = { type: 'create' | 'update' | 'delete', recordName: string, keys?: string[], record: Row }

class NaiveEventModel {
    rows = new Map<string, Map<string, Row>>()             // entity -> id -> full row
    smStates = new Map<string, Map<string, string>>()      // property sm cell -> id -> state name
    smValues = new Map<string, Map<string, unknown>>()     // property sm cell -> id -> visible value
    globalSmState = new Map<string, string>()              // global sm cell -> state name
    globalSmValue = new Map<string, unknown>()             // global sm cell -> visible value
    transformOutputs = new Map<string, string[]>()         // transform cell -> multiset entries "srcLabel|via"

    constructor(public declarations: FuzzDeclarations) {
        for (const name of declarations.entityNames) this.rows.set(name, new Map())
        for (const sm of declarations.sms) {
            if (sm.scope === 'property') {
                this.smStates.set(sm.cell, new Map())
                this.smValues.set(sm.cell, new Map())
            } else {
                this.globalSmState.set(sm.cell, sm.initialState)
                this.globalSmValue.set(sm.cell, sm.flavor === 'counter' ? 1 : sm.initialState)
            }
        }
        for (const transform of declarations.transforms) this.transformOutputs.set(transform.cell, [])
    }

    private matchTrigger(trigger: TriggerDescriptor, event: ModelEvent, hostEntity: string): boolean {
        if (trigger.family === 'interaction') {
            return event.recordName === InteractionEventEntity.name && event.type === 'create'
                && event.record.interactionName === trigger.interactionName
        }
        if (event.recordName !== hostEntity) return false
        if (trigger.family === 'hostCreate') {
            return event.type === 'create' && (!trigger.recordPattern || event.record.kind === trigger.recordPattern.kind)
        }
        if (trigger.family === 'hostUpdate') {
            if (event.type !== 'update') return false
            if (!trigger.keys.every(key => event.keys?.includes(key))) return false
            return !trigger.recordPattern || event.record.kind === trigger.recordPattern.kind
        }
        return event.type === 'delete'
    }

    private smValueOnTransition(sm: SmDescriptor, previousValue: unknown, nextState: string): unknown {
        return sm.flavor === 'counter'
            ? (typeof previousValue === 'number' ? previousValue + 1 : 1)
            : nextState
    }

    applyEvent(event: ModelEvent) {
        for (const sm of this.declarations.sms) {
            const host = sm.hostEntity!
            // 每 (计算, 事件, 记录) 恰好一跳：找当前状态的首个命中 transfer（生成域保证无歧义）
            if (sm.scope === 'property') {
                for (const transfer of sm.transfers) {
                    if (!this.matchTrigger(transfer.trigger, event, host)) continue
                    // computeTarget：interaction 族取 payload.target.id；宿主族取 event.record.id
                    const targetId = transfer.trigger.family === 'interaction'
                        ? String((event.record.payload as Row | undefined)?.target && ((event.record.payload as Row).target as Row).id)
                        : String(event.record.id)
                    const states = this.smStates.get(sm.cell)!
                    const currentState = states.get(targetId)
                    if (currentState === undefined) continue // 记录不存在/已删除 ⇒ lock 失败 skip
                    if (currentState !== transfer.current) continue
                    states.set(targetId, transfer.next)
                    const values = this.smValues.get(sm.cell)!
                    values.set(targetId, this.smValueOnTransition(sm, values.get(targetId), transfer.next))
                    break
                }
            } else {
                for (const transfer of sm.transfers) {
                    if (!this.matchTrigger(transfer.trigger, event, host)) continue
                    if (this.globalSmState.get(sm.cell) !== transfer.current) continue
                    this.globalSmState.set(sm.cell, transfer.next)
                    this.globalSmValue.set(sm.cell, this.smValueOnTransition(sm, this.globalSmValue.get(sm.cell), transfer.next))
                    break
                }
            }
        }
        for (const transform of this.declarations.transforms) {
            // r28 去重契约：命中任意 dep ⇒ 恰好一次 callback
            const hit = transform.deps.some(dep => this.matchTrigger(dep, event, transform.hostEntity ?? ''))
            if (!hit) continue
            const record = event.record
            if (transform.nullOnCold && record.kind === 'cold') continue
            const srcLabel = transform.hostEntity ? String(record.label ?? '') : String(record.interactionName ?? '')
            const outputs = this.transformOutputs.get(transform.cell)!
            if (transform.arrayReturn) outputs.push(`${srcLabel}|a`, `${srcLabel}|b`)
            else outputs.push(`${srcLabel}|single`)
        }
    }

    createRow(payload: Row): Row {
        return {
            label: payload.label ?? null,
            kind: payload.kind ?? null,
            score: payload.score ?? 7,
        }
    }

    registerCreate(entityName: string, id: unknown, row: Row) {
        const idKey = String(id)
        this.rows.get(entityName)!.set(idKey, { ...row, id: idKey })
        // property SM 初始值先落（getInitialValue），随后 create 事件才可能推进
        for (const sm of this.declarations.sms) {
            if (sm.scope !== 'property' || sm.hostEntity !== entityName) continue
            this.smStates.get(sm.cell)!.set(idKey, sm.initialState)
            this.smValues.get(sm.cell)!.set(idKey, sm.flavor === 'counter' ? 1 : sm.initialState)
        }
        this.applyEvent({ type: 'create', recordName: entityName, record: { ...row, id: idKey } })
    }

    registerUpdate(entityName: string, id: unknown, payload: Row) {
        const idKey = String(id)
        const row = this.rows.get(entityName)!.get(idKey)
        if (!row) return
        for (const [key, value] of Object.entries(payload)) row[key] = value
        this.applyEvent({ type: 'update', recordName: entityName, keys: Object.keys(payload), record: { ...row } })
    }

    registerDelete(entityName: string, id: unknown) {
        const idKey = String(id)
        const row = this.rows.get(entityName)!.get(idKey)
        if (!row) return
        this.rows.get(entityName)!.delete(idKey)
        for (const sm of this.declarations.sms) {
            if (sm.scope !== 'property' || sm.hostEntity !== entityName) continue
            this.smStates.get(sm.cell)!.delete(idKey)
            this.smValues.get(sm.cell)!.delete(idKey)
        }
        this.applyEvent({ type: 'delete', recordName: entityName, record: { ...row } })
    }

    registerDispatch(interactionName: string, payload: Row | undefined) {
        this.applyEvent({
            type: 'create', recordName: InteractionEventEntity.name,
            record: { interactionName, ...(payload !== undefined ? { payload } : {}) },
        })
    }
}

// ---------- runner ----------
async function runEventComputationFuzzCase(seed: number, opsCount: number) {
    const rng = mulberry32(seed)
    const declarations = genDeclarations(rng, `${seed}_`)
    const model = new NaiveEventModel(declarations)

    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
        system,
        entities: declarations.entities as any,
        relations: [],
        eventSources: declarations.eventSources as any,
        dict: declarations.dictionaries as any,
    })
    await controller.setup(true)
    const storage = system.storage
    const user = await storage.create(declarations.userEntityName, { name: 'fz-user' })
    const eventSourceByName = new Map(
        [...declarations.payloadInteractions.map(i => i.name), ...declarations.plainInteractions.map(i => i.name)]
            .map(name => [name, controller.findEventSourceByName(name)!])
    )

    const opLog: { step: number, op: string, detail: unknown, outcome: string }[] = []
    const failWith = (message: string): never => {
        const logSlice = process.env.FUZZ_VERBOSE ? opLog : opLog.slice(-8)
        const cellDump = JSON.stringify([...declarations.sms.map(s => s.cell), ...declarations.transforms.map(t => t.cell)])
        throw new Error(`[event-comp-fuzz seed=${seed}] ${message}\ncells: ${cellDump}\n` +
            `op log${process.env.FUZZ_VERBOSE ? '' : ' tail'}: ${JSON.stringify(logSlice, null, 2)}`)
    }

    const assertAllCells = async (context: string) => {
        // 模型-实况行一致性（模型自证：意图推导的行终态必须与真实行一致，防模型漂移误归因）
        for (const entityName of declarations.entityNames) {
            const rows = await storage.find(entityName, undefined, undefined, ['id', 'label', 'kind', 'score']) as Row[]
            const modelRows = model.rows.get(entityName)!
            if (rows.length !== modelRows.size) {
                failWith(`${context}: ${entityName} row count ${rows.length} != model ${modelRows.size}`)
            }
            for (const row of rows) {
                const modelRow = modelRows.get(String(row.id))
                if (!modelRow) failWith(`${context}: ${entityName}#${row.id} missing from model`)
                for (const field of ['label', 'kind', 'score'] as const) {
                    if ((row[field] ?? null) !== (modelRow![field] ?? null)) {
                        failWith(`${context}: ${entityName}#${row.id}.${field} = ${JSON.stringify(row[field])}, model has ${JSON.stringify(modelRow![field])}`)
                    }
                }
            }
        }
        for (const sm of declarations.sms) {
            if (sm.scope === 'property') {
                const hosts = await storage.find(sm.hostEntity!, undefined, undefined, ['id', sm.propertyName!]) as Row[]
                const expectedValues = model.smValues.get(sm.cell)!
                if (hosts.length !== expectedValues.size) {
                    failWith(`${context}: ${sm.cell} host row count ${hosts.length} != model ${expectedValues.size}`)
                }
                for (const host of hosts) {
                    const expected = expectedValues.get(String(host.id))
                    const actual = host[sm.propertyName!]
                    if (actual !== expected) {
                        failWith(`${context}: ${sm.cell} on #${host.id} diverges — expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)} ` +
                            `(model state: ${model.smStates.get(sm.cell)!.get(String(host.id))})`)
                    }
                }
            } else {
                const actual = await storage.dict.get(sm.dictName!)
                const expected = model.globalSmValue.get(sm.cell)
                if (actual !== expected) {
                    failWith(`${context}: ${sm.cell} diverges — expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)} ` +
                        `(model state: ${model.globalSmState.get(sm.cell)})`)
                }
            }
        }
        for (const transform of declarations.transforms) {
            const rows = await storage.find(transform.derivedEntity, undefined, undefined, ['srcLabel', 'via']) as Row[]
            const actual = rows.map(r => `${r.srcLabel}|${r.via}`).sort()
            const expected = [...model.transformOutputs.get(transform.cell)!].sort()
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                failWith(`${context}: ${transform.cell} derived rows diverge\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`)
            }
            if (transform.chainedCountDict) {
                const count = await storage.dict.get(transform.chainedCountDict)
                if (count !== expected.length) {
                    failWith(`${context}: chained count ${transform.chainedCountDict} = ${JSON.stringify(count)}, expected ${expected.length}`)
                }
            }
        }
    }

    await assertAllCells('after setup')

    const idForm = (id: unknown) => chance(rng, 0.4) ? String(id) : id
    const OP_MENU = ['create', 'create', 'update', 'update', 'dispatchRef', 'dispatchRef', 'dispatchRef', 'dispatchPlain', 'dispatchBogus', 'delete'] as const
    let executed = 0

    for (let step = 0; step < opsCount; step++) {
        const op = pick(rng, OP_MENU as unknown as Array<typeof OP_MENU[number]>)
        if (op === 'create') {
            const entityName = pick(rng, declarations.entityNames)
            const payload: Row = {
                label: chance(rng, 0.5) ? pick(rng, [...KIND_MENU]) : `v${int(rng, 10)}`,
                kind: pick(rng, [...KIND_MENU]),
                ...(chance(rng, 0.5) ? { score: int(rng, 100) } : {}),
            }
            const row = model.createRow(payload)
            const created = await storage.create(entityName, payload) as Row
            model.registerCreate(entityName, created.id, row)
            opLog.push({ step, op, detail: { entityName, payload }, outcome: 'ok' })
            executed++
        } else if (op === 'update') {
            const entityName = pick(rng, declarations.entityNames)
            const pool = [...model.rows.get(entityName)!.keys()]
            if (!pool.length) { opLog.push({ step, op, detail: { entityName }, outcome: 'skipped: empty pool' }); continue }
            const id = pick(rng, pool)
            const payload: Row = {}
            if (chance(rng, 0.7)) payload.kind = pick(rng, [...KIND_MENU])
            if (chance(rng, 0.4)) payload.label = chance(rng, 0.5) ? pick(rng, [...KIND_MENU]) : `v${int(rng, 10)}`
            if (chance(rng, 0.3)) payload.score = int(rng, 100)
            if (!Object.keys(payload).length) payload.kind = pick(rng, [...KIND_MENU])
            await storage.update(entityName, MatchExp.atom({ key: 'id', value: ['=', idForm(id)] }), payload)
            model.registerUpdate(entityName, id, payload)
            opLog.push({ step, op, detail: { entityName, id, payload }, outcome: 'ok' })
            executed++
        } else if (op === 'delete') {
            const entityName = pick(rng, declarations.entityNames)
            const pool = [...model.rows.get(entityName)!.keys()]
            if (!pool.length) { opLog.push({ step, op, detail: { entityName }, outcome: 'skipped: empty pool' }); continue }
            const id = pick(rng, pool)
            await storage.delete(entityName, MatchExp.atom({ key: 'id', value: ['=', idForm(id)] }))
            model.registerDelete(entityName, id)
            opLog.push({ step, op, detail: { entityName, id }, outcome: 'ok' })
            executed++
        } else if (op === 'dispatchRef') {
            if (!declarations.payloadInteractions.length) continue
            const interaction = pick(rng, declarations.payloadInteractions)
            const pool = [...model.rows.get(interaction.baseEntity)!.keys()]
            if (!pool.length) { opLog.push({ step, op, detail: { interaction: interaction.name }, outcome: 'skipped: empty pool' }); continue }
            const targetId = idForm(pick(rng, pool))
            const payload = { target: { id: targetId } }
            const result = await controller.dispatch(eventSourceByName.get(interaction.name)! as any, { user, payload })
            if (result.error) {
                failWith(`step ${step} dispatch ${interaction.name} with a VALID ref unexpectedly failed: ${String((result.error as any).message ?? result.error)}\ndetail: ${JSON.stringify(payload)}`)
            }
            model.registerDispatch(interaction.name, payload)
            opLog.push({ step, op, detail: { interaction: interaction.name, payload }, outcome: 'ok' })
            executed++
        } else if (op === 'dispatchPlain') {
            if (!declarations.plainInteractions.length) continue
            const interaction = pick(rng, declarations.plainInteractions)
            const result = await controller.dispatch(eventSourceByName.get(interaction.name)! as any, { user })
            if (result.error) {
                failWith(`step ${step} dispatch ${interaction.name} (no payload) unexpectedly failed: ${String((result.error as any).message ?? result.error)}`)
            }
            model.registerDispatch(interaction.name, undefined)
            opLog.push({ step, op, detail: { interaction: interaction.name }, outcome: 'ok' })
            executed++
        } else {
            // dispatchBogus：isRef 守卫必须拒绝不存在的 id，且不产生任何事件/转移
            if (!declarations.payloadInteractions.length) continue
            const interaction = pick(rng, declarations.payloadInteractions)
            const result = await controller.dispatch(eventSourceByName.get(interaction.name)! as any,
                { user, payload: { target: { id: `bogus-${int(rng, 100000)}` } } })
            if (!result.error) {
                failWith(`step ${step} dispatch ${interaction.name} with a BOGUS ref was silently accepted (isRef guard fail-open)`)
            }
            opLog.push({ step, op, detail: { interaction: interaction.name }, outcome: 'rejected (expected)' })
            executed++
        }
        await assertAllCells(`step ${step} ${op}`)
    }

    if (executed === 0 && opsCount > 0) failWith('executed no ops')
    await system.destroy()
    return { seed, executed }
}

// ---------- 入口 ----------
const SEED_START = Number(process.env.FUZZ_EVENT_SEED_START ?? 1)
const SEED_COUNT = Number(process.env.FUZZ_EVENT_SEED_COUNT ?? 6)
const OPS = Number(process.env.FUZZ_EVENT_OPS ?? 14)

describe('event-driven computation generative fuzz (random StateMachine/Transform declarations × random event streams vs independent JS model)', () => {
    const seeds = Array.from({ length: SEED_COUNT }, (_, i) => SEED_START + i)
    test.each(seeds.map(s => [s]))('seed %i: every SM value / transform output equals the independent model after every op', async (seed) => {
        const result = await runEventComputationFuzzCase(seed, OPS)
        expect(result.executed, `event seed ${seed} executed no ops`).toBeGreaterThan(0)
    }, 300000)
})
