/**
 * 写路径生成式测试的共享操作决策器（从 writePathStructuralFuzz 抽取的唯一实现，r29）。
 *
 * 决策器只产出「操作意图」（op + 载荷 + 具体 id），执行与判定归各 runner：
 * - 结构化 fuzzer：单库执行 + 事件完备性/结构不变量；
 * - 驱动差分 fuzzer：主库（SQLite）执行同一意图，经 id 双射翻译后在副库（PGLite）重放，
 *   逐操作对账两侧的逻辑状态与事件流。
 *
 * CAUTION 决策流契约：同一 (seed, pools 内容) 必须产出同一操作意图——rng 的调用次数
 *  与顺序就是契约本身。pools 的内容/顺序由 runner 保证跨库一致（按创建序）。
 */
import type { RecordMutationEvent } from '@runtime';
import { EntityQueryHandle, MatchExp } from '@storage';
import { chance, int, pick, type Rng } from './fuzzRandom.js';
import type { FuzzSchema, RelationChoice } from './fuzzSchema.js';

export type IdPools = Map<string, unknown[]>

// 公开 API 把 id 声明为 string（addRelationByNameById(sourceEntityId: string, ...)），HTTP 载荷
// 携带的 id 也天然是字符串——ref 形态必须同时探索「驱动原生形态」与「字符串形态」两个合法取值
// （r27 F-3 正是 fuzzer 首跑经字符串化 id 池抓获：SQL 面 1 == '1' 而 JS === 判不等）。
export function idForPayload(rng: Rng, id: unknown): unknown {
    return chance(rng, 0.4) ? String(id) : id
}

export function genLinkData(rng: Rng, choice: RelationChoice): Record<string, unknown> | undefined {
    if (!choice.linkProps.length || chance(rng, 0.5)) return undefined
    const data: Record<string, unknown> = {}
    for (const prop of choice.linkProps) {
        if (chance(rng, 0.6)) data[prop] = prop === 'weight' ? int(rng, 100) : `n${int(rng, 10)}`
    }
    return Object.keys(data).length ? data : undefined
}

/** 递归生成某实体的写载荷；depth 限制嵌套层数。 */
export function genPayload(rng: Rng, schema: FuzzSchema, entityName: string, pools: IdPools, depth: number): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    for (const prop of schema.valueProps.get(entityName)!) {
        if (chance(rng, 0.7)) payload[prop.name] = prop.type === 'string' ? `v${int(rng, 100)}` : int(rng, 100)
    }
    if (depth <= 0) return payload

    for (const choice of schema.relationChoices) {
        const roles: Array<{ attr: string, related: string, isMany: boolean }> = []
        if (choice.source === entityName) {
            roles.push({ attr: choice.sourceProperty, related: choice.target, isMany: choice.relType.endsWith('n') })
        }
        if (!choice.symmetric && choice.target === entityName) {
            roles.push({ attr: choice.targetProperty, related: choice.source, isMany: choice.relType.startsWith('n') })
        }
        for (const role of roles) {
            if (!chance(rng, 0.35)) continue // 多数属性省略，保持载荷自然
            const genOne = (): Record<string, unknown> | null => {
                const mode = pick(rng, ['new', 'ref', 'null'] as const)
                if (mode === 'null') return null
                if (mode === 'ref') {
                    const pool = pools.get(role.related) ?? []
                    if (!pool.length) return genOne0('new')
                    const item: Record<string, unknown> = { id: idForPayload(rng, pick(rng, pool)) }
                    const link = genLinkData(rng, choice)
                    if (link) item['&'] = link
                    return item
                }
                return genOne0('new')
            }
            const genOne0 = (mode: 'new'): Record<string, unknown> => {
                const nested = genPayload(rng, schema, role.related, pools, depth - 1)
                const link = genLinkData(rng, choice)
                if (link) nested['&'] = link
                return nested
            }
            if (role.isMany) {
                const count = 1 + int(rng, 2)
                const items: unknown[] = []
                const seen = new Set<string>()
                for (let i = 0; i < count; i++) {
                    const item = genOne()
                    if (item === null) continue // 数组里不放 null
                    const id = (item as { id?: string }).id
                    if (id !== undefined) {
                        if (seen.has(String(id))) continue // 避免矛盾 `&` 的重复 ref 噪音
                        seen.add(String(id))
                    }
                    items.push(item)
                }
                if (items.length) payload[role.attr] = items
            } else {
                const value = genOne()
                if (value !== undefined) payload[role.attr] = value
            }
        }
    }
    return payload
}

// ---------- 操作意图 ----------
export type FuzzOpIntent =
    | { op: 'create', entityName: string, payload: Record<string, unknown> }
    | { op: 'update', entityName: string, id: unknown, payload: Record<string, unknown> }
    | { op: 'delete', entityName: string, id: unknown }
    | { op: 'addRelation', relationName: string, sourceId: unknown, targetId: unknown, linkData: Record<string, unknown> }
    | { op: 'removeRelation', relationName: string, linkId: string }
    | null  // 前置条件不足（池空等），本步跳过

export const OP_MENU: Array<'create' | 'update' | 'delete' | 'addRelation' | 'removeRelation'> =
    ['create', 'create', 'create', 'update', 'update', 'delete', 'addRelation', 'removeRelation']

/**
 * 决策下一步操作。getLinkIds 惰性提供某关系当前的 link id 池（只在 removeRelation 被抽中时
 * 查询一次——与原实现的查询次数一致；跨库一致由 runner 保证顺序为创建序/查询序）。
 * targetableEntityNames：create/update/delete 的目标名池（filtered 模式下含 filtered 名——
 *  写经 filtered 名解析到 base，是「概念寄生位置」轴的写入面取值）。
 */
export async function decideNextOp(
    rng: Rng,
    schema: FuzzSchema,
    pools: IdPools,
    getLinkIds: (relationName: string) => Promise<unknown[]>,
    targetableEntityNames?: { name: string, poolName: string }[]
): Promise<FuzzOpIntent> {
    const targets = targetableEntityNames ?? schema.entityNames.map(name => ({ name, poolName: name }))
    const opKind = pick(rng, OP_MENU)
    if (opKind === 'create') {
        const target = pick(rng, targets)
        const payload = genPayload(rng, schema, target.poolName, pools, 1 + int(rng, 2))
        return { op: 'create', entityName: target.name, payload }
    } else if (opKind === 'update') {
        const target = pick(rng, targets)
        const pool = pools.get(target.poolName)!
        if (!pool.length) return null
        const id = idForPayload(rng, pick(rng, pool))
        const payload = genPayload(rng, schema, target.poolName, pools, 1 + int(rng, 1))
        return { op: 'update', entityName: target.name, id, payload }
    } else if (opKind === 'delete') {
        const target = pick(rng, targets)
        const pool = pools.get(target.poolName)!
        if (!pool.length) return null
        const id = idForPayload(rng, pick(rng, pool))
        return { op: 'delete', entityName: target.name, id }
    } else if (opKind === 'addRelation') {
        const choice = pick(rng, schema.relationChoices)
        const sourcePool = pools.get(choice.source)!, targetPool = pools.get(choice.target)!
        if (!sourcePool.length || !targetPool.length) return null
        const sourceId = idForPayload(rng, pick(rng, sourcePool)), targetId = idForPayload(rng, pick(rng, targetPool))
        if (choice.symmetric && String(sourceId) === String(targetId)) return null
        return { op: 'addRelation', relationName: choice.relation.name!, sourceId, targetId, linkData: genLinkData(rng, choice) ?? {} }
    } else {
        const choice = pick(rng, schema.relationChoices)
        const links = await getLinkIds(choice.relation.name!)
        if (!links.length) return null
        const linkId = String(pick(rng, links))
        return { op: 'removeRelation', relationName: choice.relation.name!, linkId }
    }
}

/** 在一个 EntityQueryHandle 上执行操作意图（id 已是该库的本地形态）。 */
export async function executeOpIntent(handle: EntityQueryHandle, intent: Exclude<FuzzOpIntent, null>, events: RecordMutationEvent[]): Promise<void> {
    if (intent.op === 'create') {
        await handle.create(intent.entityName, intent.payload, events)
    } else if (intent.op === 'update') {
        await handle.update(intent.entityName, MatchExp.atom({ key: 'id', value: ['=', intent.id] }), intent.payload, events)
    } else if (intent.op === 'delete') {
        await handle.delete(intent.entityName, MatchExp.atom({ key: 'id', value: ['=', intent.id] }), events)
    } else if (intent.op === 'addRelation') {
        await handle.addRelationByNameById(intent.relationName, intent.sourceId as string, intent.targetId as string, intent.linkData, events)
    } else {
        await handle.removeRelationByName(intent.relationName, MatchExp.atom({ key: 'id', value: ['=', intent.linkId] }), events)
    }
}
