import { describe, test, expect } from 'vitest'
import v8 from 'node:v8'
import vm from 'node:vm'
import {
    Entity, Property, Relation, Count, Summation, Transform, Controller, MonoSystem,
    KlassByName, HardDeletionProperty, MatchExp, stringifyAllInstances,
    type EntityInstance, type RelationInstance, type PropertyInstance,
} from 'interaqt'
import { PGLiteDB, SQLiteDB } from '@drivers'

// ---------------------------------------------------------------------------
// Regression spec for: runtime-derived definitions must not linger in the
// user-declaration registries (Klass static `instances`), so that a finished
// Controller graph (system.destroy() + drop references) is garbage-collectable.
//
// Red on the unfixed HEAD: every round of `new Controller + setup(true) +
// destroy()` registers derived definitions (bound-state properties, merged
// compilation entities/relations) into Entity.instances / Relation.instances /
// Property.instances, and the retained definitions keep Controller / System /
// Database alive after all user references are dropped.
//
// Task: docs/controller-retention-via-property-instances/ (design §3.5 items
// 1-4). Registry metering is per-track: `setup(true)` runs one state-injection
// batch; `setup(false)` runs TWO (prepareMigrationSchema + system.setup).
//
// R8 premise (corrected in round k=2): a virtual base RELATION
// (`__<merged>_base`) is only produced when a merged relation has a FILTERED
// INPUT relation. A filtered view OVER a merged relation produces no virtual
// base relation. The schema below triggers R8 through HotAuthorCat (filtered
// view over the plain input AuthorCat, used as an input of AuthorEngagedPost).
// ---------------------------------------------------------------------------

type DriverName = 'pglite' | 'sqlite'
const ROUNDS = 3

// ---------- user declaration graph (module top level, declared once) ----------
const Author = Entity.create({
    name: 'Author',
    properties: [
        Property.create({ name: 'name', type: 'string' }),
    ],
})
const Post = Entity.create({
    name: 'Post',
    properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({ name: 'score', type: 'number' }),
        HardDeletionProperty.create(),
    ],
})
const AuthorPost = Relation.create({
    source: Author, sourceProperty: 'posts', target: Post, targetProperty: 'author', type: '1:n',
})
Author.properties.push(
    Property.create({ name: 'postCount', type: 'number', computation: Count.create({ property: 'posts' }) }),
    Property.create({ name: 'totalScore', type: 'number', computation: Summation.create({ property: 'posts', attributeQuery: ['score'] }) }),
)
const HotPost = Entity.create({
    name: 'HotPost', baseEntity: Post,
    matchExpression: MatchExp.atom({ key: 'score', value: ['>', 10] }),
})
const Cat = Entity.create({ name: 'Cat', properties: [Property.create({ name: 'nick', type: 'string' })] })
const Dog = Entity.create({ name: 'Dog', properties: [Property.create({ name: 'nick', type: 'string' })] })
const Toy = Entity.create({ name: 'Toy', properties: [Property.create({ name: 'label', type: 'string' })] })
const CatToy = Relation.create({ source: Cat, sourceProperty: 'toys', target: Toy, targetProperty: 'cat', type: '1:n' })
// a merged input that itself carries a RecordBoundState computation
Cat.properties.push(Property.create({ name: 'toyCount', type: 'number', computation: Count.create({ property: 'toys' }) }))
const Animal = Entity.create({ name: 'Animal', inputEntities: [Cat, Dog] })
// merged entity with a filtered input -> virtual base `Pet_base`
const Kitten = Entity.create({ name: 'Kitten', baseEntity: Cat, matchExpression: MatchExp.atom({ key: 'nick', value: ['like', 'k%'] }) })
const Pet = Entity.create({ name: 'Pet', inputEntities: [Kitten, Dog] })
// merged relation inputs (plain), each carrying a matchable `weight` attribute
const AuthorCat = Relation.create({
    source: Author, sourceProperty: 'likedPosts', target: Post, targetProperty: 'likedBy', type: 'n:n',
    properties: [Property.create({ name: 'weight', type: 'number' })],
})
const AuthorDog = Relation.create({
    source: Author, sourceProperty: 'sharedPosts', target: Post, targetProperty: 'sharedBy', type: 'n:n',
    properties: [Property.create({ name: 'weight', type: 'number' })],
})
// filtered view over the plain input relation AuthorCat; used as a FILTERED
// INPUT of the merged relation below -> triggers the R8 virtual base relation.
const HotAuthorCat = Relation.create({
    baseRelation: AuthorCat, sourceProperty: 'hotLikedPosts', targetProperty: 'hotLikedBy',
    matchExpression: MatchExp.atom({ key: 'weight', value: ['>', 50] }),
})
const AuthorPet = Relation.create({
    name: 'AuthorEngagedPost', sourceProperty: 'engagedPosts', targetProperty: 'engagedBy',
    inputRelations: [HotAuthorCat, AuthorDog],
})
// filtered view OVER the merged relation. By the corrected premise this
// produces NO virtual base relation of its own; it is kept in the schema to
// pin that distinction (its only registration footprint is the user's own
// declaration above).
const HotEngaged = Relation.create({
    name: 'HotEngaged', baseRelation: AuthorPet,
    sourceProperty: 'hotEngagedPosts', targetProperty: 'hotEngagedBy',
    matchExpression: MatchExp.atom({ key: 'weight', value: ['>', 50] }),
})
// entity-level Transform (record-based): its createState declares
// sourceRecordId/transformIndex RecordBoundStates with unique=true, which
// exercises the transform-unique-index path during setup.
const Mirror = Entity.create({
    name: 'Mirror',
    properties: [Property.create({ name: 'title', type: 'string' })],
    computation: Transform.create({ record: Post, callback: (post: { title: string }) => ({ title: post.title }) }),
})
const entities = [Author, Post, HotPost, Cat, Dog, Toy, Animal, Kitten, Pet, Mirror]
const relations = [AuthorPost, CatToy, AuthorCat, AuthorDog, HotAuthorCat, AuthorPet, HotEngaged]

// Import-time registry snapshot, taken AFTER the user declarations above.
// Framework builtins declared at their modules' top level (_System_,
// _Dictionary_, _Interaction_, _Activity_, activityInteraction) register
// during import and are therefore inside this snapshot by construction —
// the sweep below permits them without hardcoding any name list.
const importSnapshot = {
    entity: new Set<unknown>(Entity.instances),
    relation: new Set<unknown>(Relation.instances),
    property: new Set<unknown>(Property.instances),
}

// ---------- helpers ----------
function registrySizes(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [name, klass] of KlassByName.entries()) {
        if (Array.isArray(klass.instances)) out[name] = klass.instances.length
    }
    return out
}
function diffSizes(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {}
    for (const key of Object.keys(b)) {
        if ((b[key] ?? 0) !== (a[key] ?? 0)) out[key] = (b[key] ?? 0) - (a[key] ?? 0)
    }
    return out
}
function makeDriver(name: DriverName) {
    return name === 'pglite' ? new PGLiteDB() : new SQLiteDB(':memory:')
}

// `gc` without any CLI flag: prefer an already-exposed global, fall back to
// v8.setFlagsFromString + a fresh context (verified to yield a working gc
// under the repo's vitest defaults).
function obtainGC(): () => void {
    const existing = (globalThis as { gc?: () => void }).gc
    if (typeof existing === 'function') return existing
    v8.setFlagsFromString('--expose-gc')
    return vm.runInNewContext('gc') as () => void
}
async function forceGC(gc: () => void) {
    for (let i = 0; i < 3; i++) {
        gc()
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
}

// Find the storage-side `defaultValue` of a record attribute. During a live
// graph (after setup, before destroy) the synthesized bound-state properties'
// defaultValue closures live in the storage map's attribute info.
function findAttributeDefaultValue(
    system: MonoSystem,
    recordName: string,
    attributeName: string,
): unknown {
    const records = (system.storage as unknown as {
        map?: { records?: Record<string, { attributes?: Record<string, { defaultValue?: unknown }> }> }
    }).map?.records
    return records?.[recordName]?.attributes?.[attributeName]?.defaultValue
}

// One lifecycle round. The function returns ONLY the WeakRefs (no live local
// can keep the graph alive from this test's frame once it returns).
//
// `observe` runs AFTER setup and BEFORE destroy: the registry state for this
// round is final at that point. Capturing registration assertions there is
// load-bearing — an implementation that registers derived definitions during
// setup and unregisters them inside destroy() would pass every post-destroy
// assertion (Task requirement 2 forbids truncation-style fixes; the spec must
// be able to tell "never registered" apart from "registered then removed").
async function oneRound(driver: DriverName, observe?: () => void) {
    const db = makeDriver(driver)
    const system = new MonoSystem(db)
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities, relations, eventSources: [] })
    await controller.setup(true)
    observe?.()
    await system.destroy()
    return {
        controller: new WeakRef(controller),
        system: new WeakRef(system),
        db: new WeakRef(db),
    }
}

// ----------

describe('runtime-derived definitions must not register into Klass instances', () => {
    test.each(['pglite', 'sqlite'] as DriverName[])('%s: registry sizes are unchanged across repeated controller lifecycles', async (driver) => {
        const baseline = registrySizes()
        const perRound: Array<Record<string, number>> = []
        for (let i = 0; i < ROUNDS; i++) {
            await oneRound(driver)
            perRound.push(diffSizes(baseline, registrySizes()))
        }
        expect(perRound, `registry growth per round (baseline -> after each round). Repeated Controller setup registers derived definitions; expected growth of exactly 0 per round.`).toEqual(
            Array.from({ length: ROUNDS }, () => ({})),
        )
    })

    test('pglite: Controller / System / Database are collectable after destroy() and dropping references', async () => {
        const gc = obtainGC()
        const refs: Array<{ controller: WeakRef<object>, system: WeakRef<object>, db: WeakRef<object> }> = []
        for (let i = 0; i < ROUNDS; i++) {
            refs.push(await oneRound('pglite'))
            await forceGC(gc)
            // deref() here, then gc() again inside forceGC in the next
            // iteration: the KeepDuringJob liveness of a previous deref must
            // not leak into this assertion.
            const alive = refs.filter((ref) => ref.controller.deref() !== undefined || ref.system.deref() !== undefined || ref.db.deref() !== undefined)
            expect(alive.map((_, idx) => `#${idx + 1}`), 'Controller/System/Database still reachable after lifecycle end + gc (indices are 1-based rounds)').toEqual([])
        }
    })

    test('stringifyAllInstances output is unchanged by setup and contains no system/derived definitions', async () => {
        const before = stringifyAllInstances()
        await oneRound('pglite')
        const after = stringifyAllInstances()
        // 1. no derived names appear at all
        expect(after.includes('_bound_'), 'bound-state property names must not appear in stringifyAllInstances').toBe(false)
        expect(after.includes('__type'), 'merged discriminator columns must not appear in stringifyAllInstances').toBe(false)
        expect(after.includes('Pet_base'), 'virtual base entities must not appear in stringifyAllInstances').toBe(false)
        expect(after.includes('_base'), 'virtual base definitions must not appear in stringifyAllInstances').toBe(false)
        // 2. the user declaration graph serializes identically before/after setup
        expect(after).toBe(before)
    })

    // -------------------------------------------------------------------------
    // Per-site coverage for the R1-R8 runtime registration sites (design §1.2).
    // One test() per site so that each site's failure is independently visible
    // (a failing assertion early in a shared test would mask later ones).
    //
    // By-name counts are stable across the fix because a correct fix registers
    // NOTHING derived: the user's declaration remains the only entry with that
    // name. On the unfixed HEAD the counts grow by one per lifecycle round.
    // -------------------------------------------------------------------------

    // Each per-site test captures its evidence in `observe` (after setup,
    // BEFORE destroy) and asserts after the round completes. Post-destroy
    // observation alone could not distinguish "never registered" from
    // "registered during setup, removed during destroy" — the latter is a
    // truncation-style pseudo-fix that Task requirement 2 forbids.
    test('per-site R1/R2: bound-state system properties are not registered', async () => {
        let boundCount = -1
        await oneRound('pglite', () => {
            boundCount = Property.instances.filter((p) => p.name.includes('_bound_')).length
        })
        expect(boundCount,
            'bound-state properties registered into Property.instances').toBe(0)
    })

    test('per-site R4: merged discriminator columns are not registered', async () => {
        let typeCount = -1
        await oneRound('pglite', () => {
            typeCount = Property.instances.filter((p) => p.name === '__type').length
        })
        expect(typeCount,
            'merged discriminator columns registered into Property.instances').toBe(0)
    })

    test('per-site R5/R6: transformed merged entities and virtual base entities are not registered', async () => {
        let animal: EntityInstance[] = []
        let pet: EntityInstance[] = []
        let petBaseCount = -1
        await oneRound('pglite', () => {
            animal = Entity.instances.filter((e) => e.name === 'Animal')
            pet = Entity.instances.filter((e) => e.name === 'Pet')
            petBaseCount = Entity.instances.filter((e) => e.name === 'Pet_base').length
        })
        expect(animal.length, 'Animal should appear exactly once (the user declaration)').toBe(1)
        expect(animal[0], 'the single registered Animal must be the user-declared instance').toBe(Animal)
        expect(pet.length, 'Pet should appear exactly once (the user declaration)').toBe(1)
        expect(pet[0], 'the single registered Pet must be the user-declared instance').toBe(Pet)
        expect(petBaseCount,
            'virtual base entity Pet_base registered into Entity.instances').toBe(0)
    })

    test('per-site R7: transformed merged relations are not registered', async () => {
        let engaged: RelationInstance[] = []
        await oneRound('pglite', () => {
            engaged = Relation.instances.filter((r) => r.name === 'AuthorEngagedPost')
        })
        expect(engaged.length, 'AuthorEngagedPost should appear exactly once (the user declaration)').toBe(1)
        expect(engaged[0], 'the single registered AuthorEngagedPost must be the user-declared instance').toBe(AuthorPet)
    })

    test('per-site R8: virtual base relations (merged relation with filtered input) are not registered', async () => {
        let baseRelCount = -1
        await oneRound('pglite', () => {
            baseRelCount = Relation.instances.filter((r) => r.name === '__AuthorEngagedPost_base').length
        })
        expect(baseRelCount,
            'virtual base relation __AuthorEngagedPost_base registered into Relation.instances').toBe(0)
    })

    test('per-site R3: rebased filtered input relations are not registered', async () => {
        // R3 rebase products carry the AUTO-GENERATED name of the input
        // relation (`<source>_<sourceProperty>_<targetProperty>_<target>`),
        // not any user-facing alias. Each input of the merged relation is
        // rebased, so all three inputs are covered by name + identity.
        const cases: Array<[string, unknown]> = [
            ['Author_likedPosts_likedBy_Post', AuthorCat],
            ['Author_hotLikedPosts_hotLikedBy_Post', HotAuthorCat],
            ['Author_sharedPosts_sharedBy_Post', AuthorDog],
        ]
        const hitsByAutoName = new Map<string, RelationInstance[]>()
        await oneRound('pglite', () => {
            for (const [autoName] of cases) {
                hitsByAutoName.set(autoName, Relation.instances.filter((r) => r.name === autoName))
            }
        })
        for (const [autoName, userInstance] of cases) {
            const hits = hitsByAutoName.get(autoName) ?? []
            expect(hits.length, `relation "${autoName}" should appear exactly once (the user declaration)`).toBe(1)
            expect(hits[0], `the single registered "${autoName}" must be the user-declared instance`).toBe(userInstance)
        }
    })

    test('sweep: registries contain nothing beyond the import-time snapshot after lifecycles', async () => {
        let addedEntities: EntityInstance[] = []
        let addedRelations: RelationInstance[] = []
        let addedProperties: PropertyInstance[] = []
        await oneRound('pglite', () => {
            addedEntities = Entity.instances.filter((e) => !importSnapshot.entity.has(e))
            addedRelations = Relation.instances.filter((r) => !importSnapshot.relation.has(r))
            addedProperties = Property.instances.filter((p) => !importSnapshot.property.has(p))
        })
        expect(addedEntities.map((e) => e.name),
            'Entity.instances contains entries that were neither user-declared nor registered at import time').toEqual([])
        expect(addedRelations.map((r) => r.name ?? `${r.sourceProperty}_${r.targetProperty}`),
            'Relation.instances contains entries that were neither user-declared nor registered at import time').toEqual([])
        expect(addedProperties.map((p) => p.name),
            'Property.instances contains entries that were neither user-declared nor registered at import time').toEqual([])
    })

    // Migration track (R2 via prepareMigrationSchema): metered separately from
    // the install track. On one database: setup(true) first, then fresh
    // controllers over the SAME database run setup(false) + createMigrationBaseline.
    test('migration track: setup(false) and createMigrationBaseline do not grow registries', async () => {
        const db = makeDriver('pglite')
        const system = new MonoSystem(db)
        system.conceptClass = KlassByName
        const installer = new Controller({ system, entities, relations, eventSources: [] })
        await installer.setup(true)
        const afterInstall = registrySizes()

        const system2 = new MonoSystem(db)
        system2.conceptClass = KlassByName
        const controller2 = new Controller({ system: system2, entities, relations, eventSources: [] })
        await controller2.setup(false)
        const afterSetupFalse = registrySizes()
        const setupFalseGrowth = diffSizes(afterInstall, afterSetupFalse)

        const system3 = new MonoSystem(db)
        system3.conceptClass = KlassByName
        const controller3 = new Controller({ system: system3, entities, relations, eventSources: [] })
        await controller3.createMigrationBaseline()
        const afterBaseline = registrySizes()
        const baselineGrowth = diffSizes(afterInstall, afterBaseline)

        await system3.destroy()
        await system2.destroy()
        await system.destroy()

        expect(setupFalseGrowth, 'registry growth of setup(false) beyond a prior setup(true) on the same database (setup(false) runs TWO state-injection batches: prepareMigrationSchema + system.setup, so on the unfixed HEAD this is Entity +6 / Relation +10 / Property +18)').toEqual({})
        expect(baselineGrowth, 'registry growth of setup(false) + createMigrationBaseline beyond the same prior setup(true) (three state-injection batches on the unfixed HEAD: Entity +9 / Relation +15 / Property +27)').toEqual({})
    })

    // Design §3.5 item 5a (partial, executable evidence): the synthesized
    // bound-state properties' defaultValue must not capture the whole
    // RecordBoundState (which transitively holds the controller). Checked on
    // the storage schema's attribute details: a synthesized property carries a
    // defaultValue function whose source must not reference `stateItem`.
    // NOTE: runs unconditionally; on the unfixed HEAD it is expected to FAIL
    // (closures capture stateItem) — the fix routes synthesis through a pure value.
    test('bound-state defaultValue closures do not capture the RecordBoundState', async () => {
        const db = makeDriver('pglite')
        const system = new MonoSystem(db)
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities, relations, eventSources: [] })
        await controller.setup(true)
        // Capture what we need from the live graph BEFORE destroy.
        const closureSources: string[] = []
        for (const record of system.storage.schema.records) {
            if (record.recordName === '_Dictionary_' || record.recordName === '_System_') continue
            for (const attribute of record.attributeDetails ?? []) {
                if (!attribute.name.includes('_bound_')) continue
                const defaultValue = findAttributeDefaultValue(system, record.recordName, attribute.name)
                if (typeof defaultValue === 'function') {
                    closureSources.push(`${record.recordName}.${attribute.name}: ${String(defaultValue)}`)
                }
            }
        }
        await system.destroy()
        // Sanity: the schema actually had bound-state attributes to inspect
        // (otherwise this assertion is vacuous).
        expect(closureSources.length > 0, 'expected at least one bound-state property with a defaultValue in the storage schema').toBe(true)
        expect(closureSources.filter((source) => source.includes('stateItem')),
            'synthesized bound-state defaultValue closures still capture the whole RecordBoundState').toEqual([])
    })
})
