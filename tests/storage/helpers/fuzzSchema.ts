/**
 * 写路径生成式测试的共享 schema 生成器（从 writePathStructuralFuzz 抽取的唯一实现，r29）。
 *
 * - 随机 schema：从关系菜单（1:1 merged / 1:1 reliance-combined / 1:1 mergeLinks-combined /
 *   n:1 / 1:n / n:n / 对称 n:n，随机 link 属性）抽样——物理拓扑不是被枚举的轴，
 *   而是从声明面自然涌现（Setup 决定编译结果，正如生产环境）。
 * - r29 扩展：filtered entity / filtered relation 进入生成域（谓词建立在 label/score 上，
 *   含嵌套 filtered 链），由 `includeFiltered` 开关控制——storage 结构化 fuzzer 与
 *   驱动差分 fuzzer 共享同一 schema 决策流。
 *
 * CAUTION 决策流契约：同一 (seed, options) 必须产出同一 schema——本模块内 rng 的
 *  调用次数与顺序就是契约本身，任何修改都等于换了一批种子。
 */
import { Entity, Property, Relation, type EntityInstance, type RelationInstance, type PropertyInstance } from '@core';
import { MatchExp } from '@storage';
import { mulberry32, pick, chance, int, type Rng } from './fuzzRandom.js';

export { mulberry32, pick, chance, int, type Rng };

// ---------- 已知 fail-fast 白名单（合法拒绝；新增守卫时在此登记） ----------
export const EXPECTED_REJECTIONS: RegExp[] = [
    /cannot be processed through this write/,                 // r27 F-1 守卫（combined 子记录嵌套结构）
    /not an idempotent same-id reference/,                    // r27 F-1 守卫（原地 ref 嵌套异 id）
    /cannot unlink reliance data/,                            // reliance 生命周期：只能随记录删除（r28 起 update 轨带具体属性信息）
    /cannot bind a new reliance dependent/,                   // r27 F-4 守卫（reliance 置换 = 静默销毁旧依赖，fuzzer 首跑抓获）
    /cannot claim .* as an endpoint of new relation record/,  // r27 F-5 守卫（跨关系 combined 同住行的认领；r28 扩展到搬运子树 + host-attr 轨）
    /cannot unlink combined relation .* both endpoints/,      // r28 守卫（两端搬运子树都持有其他 combined 配对时的 relocate fail-fast）
    /carries conflicting '&' link data/,                      // 重复引用携带矛盾 link 数据
    /cannot change (source|target) of relation record/,       // 关系端点不可变
    /link already exist/,                                     // addRelation 幂等冲突
    /cannot create record of merged \(union\) type/,          // merged 抽象类型直建
]

export function isExpectedRejection(error: Error): boolean {
    return EXPECTED_REJECTIONS.some(pattern => pattern.test(error.message))
}

// ---------- schema 生成 ----------
export type RelationChoice = {
    relation: RelationInstance
    relType: '1:1' | 'n:1' | '1:n' | 'n:n'
    source: string
    target: string
    sourceProperty: string
    targetProperty: string
    symmetric: boolean
    linkProps: string[]
}
export type FilteredEntityChoice = {
    entity: EntityInstance
    name: string
    baseName: string
    /** 谓词的 JS 真值实现（供预言机独立求值） */
    predicate: (row: { [k: string]: unknown }) => boolean
}
export type FilteredRelationChoice = {
    relation: RelationInstance
    name: string
    baseChoice: RelationChoice
    predicate: (linkRow: { [k: string]: unknown }) => boolean
}
export type MergedEntityChoice = {
    name: string
    inputNames: string[]
}
export type FuzzSchema = {
    entities: EntityInstance[]
    relations: RelationInstance[]
    mergeLinks: string[]
    entityNames: string[]
    relationChoices: RelationChoice[]
    valueProps: Map<string, { name: string, type: 'string' | 'number' }[]>
    filteredEntities: FilteredEntityChoice[]
    filteredRelations: FilteredRelationChoice[]
    mergedEntities: MergedEntityChoice[]
}

export function genSchema(rng: Rng, tag: string, options?: { includeFiltered?: boolean, includeMerged?: boolean }): FuzzSchema {
    const entityNames = ['A', 'B', 'C', 'D'].map(n => `Fz${tag}${n}`)
    const valueProps = new Map<string, { name: string, type: 'string' | 'number' }[]>()
    const entities = entityNames.map(name => {
        const props: { name: string, type: 'string' | 'number' }[] = [
            { name: 'label', type: 'string' },
            { name: 'score', type: 'number' },
        ]
        valueProps.set(name, props)
        return Entity.create({
            name,
            properties: [
                Property.create({ name: 'label', type: 'string' }),
                // 有默认值的字段：覆盖 create payload 契约（defaults + payload）的对账面
                Property.create({ name: 'score', type: 'number', defaultValue: () => 7 }),
            ]
        })
    })
    const byName = new Map(entities.map(e => [e.name, e]))

    const relationChoices: RelationChoice[] = []
    const mergeLinks: string[] = []
    const usedProperty = new Set<string>()
    const relationCount = 3 + int(rng, 3) // 3..5
    for (let i = 0; i < relationCount; i++) {
        const kind = pick(rng, ['1:1-merged', '1:1-reliance', '1:1-mergeLinks', 'n:1', '1:n', 'n:n', 'n:n-symmetric'] as const)
        const sourceName = pick(rng, entityNames)
        let targetName = pick(rng, entityNames)
        const symmetric = kind === 'n:n-symmetric'
        if (symmetric) targetName = sourceName
        else if (targetName === sourceName) targetName = entityNames[(entityNames.indexOf(sourceName) + 1) % entityNames.length]

        const sourceProperty = symmetric ? `peers${i}` : `out${i}`
        const targetProperty = symmetric ? `peers${i}` : `in${i}`
        // 同一实体上属性名唯一
        if (usedProperty.has(`${sourceName}.${sourceProperty}`) || usedProperty.has(`${targetName}.${targetProperty}`)) continue
        usedProperty.add(`${sourceName}.${sourceProperty}`)
        usedProperty.add(`${targetName}.${targetProperty}`)

        const relType = kind === 'n:1' ? 'n:1' : kind === '1:n' ? '1:n' : kind.startsWith('1:1') ? '1:1' : 'n:n'
        const linkProps: string[] = []
        const linkProperties: PropertyInstance[] = []
        if (chance(rng, 0.6)) {
            linkProps.push('weight')
            linkProperties.push(Property.create({ name: 'weight', type: 'number', defaultValue: () => 1 }))
        }
        if (chance(rng, 0.3)) {
            linkProps.push('note')
            linkProperties.push(Property.create({ name: 'note', type: 'string' }))
        }
        const relation = Relation.create({
            source: byName.get(sourceName)!,
            sourceProperty,
            target: byName.get(targetName)!,
            targetProperty,
            type: relType,
            properties: linkProperties,
            ...(kind === '1:1-reliance' ? { isTargetReliance: true } : {}),
        })
        if (kind === '1:1-mergeLinks') mergeLinks.push(`${sourceName}.${sourceProperty}`)
        relationChoices.push({
            relation, relType, source: sourceName, target: targetName,
            sourceProperty, targetProperty, symmetric, linkProps,
        })
    }
    if (!relationChoices.length) {
        // 极小概率全部属性名冲突：退化为固定一条 n:n
        const relation = Relation.create({
            source: entities[0], sourceProperty: 'fallbackOut', target: entities[1], targetProperty: 'fallbackIn', type: 'n:n'
        })
        relationChoices.push({
            relation, relType: 'n:n', source: entityNames[0], target: entityNames[1],
            sourceProperty: 'fallbackOut', targetProperty: 'fallbackIn', symmetric: false, linkProps: [],
        })
    }

    // ---------- r29：filtered entity / filtered relation 生成 ----------
    // CAUTION 谓词菜单刻意与预言机的本地 JS 求值保持同构（=、>、嵌套链），
    //  每个 filtered 声明都携带自己的 predicate 真值实现——membership 预言机据此独立判定，
    //  不依赖被测的 SQL 编译（否则预言机与实现同源，失去判定力）。
    const filteredEntities: FilteredEntityChoice[] = []
    const filteredRelations: FilteredRelationChoice[] = []
    const allEntities: EntityInstance[] = [...entities]
    const allRelations: RelationInstance[] = relationChoices.map(c => c.relation)
    if (options?.includeFiltered) {
        const predicateMenu = [
            {
                gen: (name: string) => ({ matchExpression: MatchExp.atom({ key: 'score', value: ['>', 50] }), predicate: (row: any) => typeof row.score === 'number' && row.score > 50 })
            },
            {
                gen: (name: string) => ({ matchExpression: MatchExp.atom({ key: 'label', value: ['=', 'hot'] }), predicate: (row: any) => row.label === 'hot' })
            },
            {
                gen: (name: string) => ({ matchExpression: MatchExp.atom({ key: 'score', value: ['=', null] }), predicate: (row: any) => row.score === null || row.score === undefined })
            },
        ]
        const filteredCount = 1 + int(rng, 2) // 1..2 个 filtered entity
        for (let i = 0; i < filteredCount; i++) {
            const base = pick(rng, entityNames)
            const menuItem = pick(rng, predicateMenu)
            const name = `Fz${tag}F${i}`
            const { matchExpression, predicate } = menuItem.gen(name)
            const entity = Entity.create({ name, baseEntity: byName.get(base)!, matchExpression })
            allEntities.push(entity)
            filteredEntities.push({ entity, name, baseName: base, predicate })
            // 30% 概率再套一层嵌套 filtered 链（谓词合取）
            if (chance(rng, 0.3)) {
                const nestedName = `Fz${tag}FN${i}`
                const nested = Entity.create({
                    name: nestedName,
                    baseEntity: entity,
                    matchExpression: MatchExp.atom({ key: 'label', value: ['=', 'hot'] })
                })
                allEntities.push(nested)
                filteredEntities.push({
                    entity: nested, name: nestedName, baseName: base,
                    predicate: (row: any) => predicate(row) && row.label === 'hot'
                })
            }
        }
        // filtered relation：挑一条带 weight 的非对称关系
        const withWeight = relationChoices.filter(c => c.linkProps.includes('weight') && !c.symmetric)
        if (withWeight.length && chance(rng, 0.7)) {
            const baseChoice = pick(rng, withWeight)
            const name = `Fz${tag}FR`
            const relation = Relation.create({
                name,
                baseRelation: baseChoice.relation,
                sourceProperty: `fr_${baseChoice.sourceProperty}`,
                targetProperty: `fr_${baseChoice.targetProperty}`,
                matchExpression: MatchExp.atom({ key: 'weight', value: ['>', 50] }),
            } as any)
            allRelations.push(relation)
            filteredRelations.push({
                relation, name, baseChoice,
                predicate: (linkRow: any) => typeof linkRow.weight === 'number' && linkRow.weight > 50
            })
        }
    }

    // ---------- r29：merged (union) entity 生成 ----------
    // CAUTION merged 编译把 inputs 变成物理 union base 上的视图（__type 判别）：
    //  merged 名承载 base 事件契约（create/update/delete 全量对账），input 名只有
    //  成员资格事件。
    // r32：EXT-1（merged input 作为 x:1/combined 端点时 Setup 字段-表装配错位）已收口
    //  （record.table 统一以 recordToTableMap 为真相源，见 Setup.assignTableAndField），
    //  x:1/combined 端点回归生成域（原 FUZZ_MERGED_FULL 门已成为默认行为）。
    //  mergeLinks 端点仍排除：显式 mergeLinks 路径以视图名寻址合表的面尚未定谳/支持。
    const mergedEntities: MergedEntityChoice[] = []
    if (options?.includeMerged) {
        const excluded = new Set<string>()
        for (const c of relationChoices) {
            if (mergeLinks.includes(`${c.source}.${c.sourceProperty}`)) {
                excluded.add(c.source); excluded.add(c.target)
            }
        }
        const candidates = entityNames.filter(n => !excluded.has(n))
        if (candidates.length >= 2 && chance(rng, 0.7)) {
            const x = pick(rng, candidates)
            const y = pick(rng, candidates.filter(n => n !== x))
            const name = `Fz${tag}M`
            const merged = Entity.create({ name, inputEntities: [byName.get(x)!, byName.get(y)!] })
            allEntities.push(merged)
            mergedEntities.push({ name, inputNames: [x, y] })
        }
    }

    return {
        entities: allEntities,
        relations: allRelations,
        mergeLinks,
        entityNames,
        relationChoices,
        valueProps,
        filteredEntities,
        filteredRelations,
        mergedEntities,
    }
}
