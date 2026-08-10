import { beforeEach, describe, expect, test } from "vitest";
import { Entity, Property } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';
import {
    Controller,
    MonoSystem,
    BoolExp,
    Interaction,
    KlassByName,
    Action,
    Condition,
    Conditions,
    ConditionError, Payload,
    PayloadItem,
    MatchExp,
} from 'interaqt';

describe('condition checks', () => {
    let system: MonoSystem
    let controller: Controller

    beforeEach(async () => {
        system = new MonoSystem(new SQLiteDB())
        system.conceptClass = KlassByName
    })

    test('should check single condition', async () => {
        // Define entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'credits', type: 'number', defaultValue: () => 0 })
            ]
        })

        const Post = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'isPremium', type: 'boolean', defaultValue: () => false })
            ]
        })

        // Create condition that checks if user has enough credits
        const hasEnoughCredits = Condition.create({
            name: 'hasEnoughCredits',
            content: async function(this: Controller, event: any) {
                const user = await this.system.storage.findOne('User', 
                    BoolExp.atom({ key: 'id', value: ['=', event.user.id] }),
                    undefined,
                    ['*']
                )
                const post = event.payload?.post
                return !post?.isPremium || user.credits >= 10
            }
        })

        // Create interaction with condition
        const ViewPost = Interaction.create({
            name: 'viewPost',
            action: Action.create({ name: 'view' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'post',
                        type: 'Entity',
                        base: Post
                    })
                ]
            }),
            conditions: hasEnoughCredits
        })

        controller = new Controller({
            system: system,
            entities: [User, Post],
            relations: [],
            eventSources: [ViewPost]
        })
        await controller.setup(true)

        // Create test data
        const richUser = await system.storage.create('User', { name: 'Rich', credits: 20 })
        const poorUser = await system.storage.create('User', { name: 'Poor', credits: 5 })

        // Test viewing regular post - should pass for both users
        const regularPost = { title: 'Regular Post', isPremium: false }
        
        const richRegularResult = await controller.dispatch(ViewPost, {
            user: richUser,
            payload: { post: regularPost }
        })
        expect(richRegularResult.error).toBeUndefined()

        const poorRegularResult = await controller.dispatch(ViewPost, {
            user: poorUser,
            payload: { post: regularPost }
        })
        expect(poorRegularResult.error).toBeUndefined()

        // Test viewing premium post
        const premiumPost = { title: 'Premium Post', isPremium: true }

        // Rich user should pass
        const richPremiumResult = await controller.dispatch(ViewPost, {
            user: richUser,
            payload: { post: premiumPost }
        })
        expect(richPremiumResult.error).toBeUndefined()

        // Poor user should fail
        const poorPremiumResult = await controller.dispatch(ViewPost, {
            user: poorUser,
            payload: { post: premiumPost }
        })
        expect(poorPremiumResult.error).toBeDefined()
        expect((poorPremiumResult.error as ConditionError).type).toBe('condition check failed')
        expect((poorPremiumResult.error as ConditionError).error.data.name).toBe('hasEnoughCredits')
    })

    test('should handle BoolExp combinations in conditions', async () => {
        // Define entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isVerified', type: 'boolean', defaultValue: () => false })
            ]
        })

        const System = Entity.create({
            name: 'System',
            properties: [
                Property.create({ name: 'maintenanceMode', type: 'boolean', defaultValue: () => false })
            ]
        })

        // Create conditions
        const systemNotInMaintenance = Condition.create({
            name: 'systemNotInMaintenance',
            content: async function(this: Controller, event: any) {
                const system = await this.system.storage.findOne('System', undefined, undefined, ['*'])
                return !system?.maintenanceMode
            }
        })

        const userIsVerified = Condition.create({
            name: 'userIsVerified',
            content: async function(this: Controller, event: any) {
                const user = await this.system.storage.findOne('User',
                    BoolExp.atom({ key: 'id', value: ['=', event.user.id] }),
                    undefined,
                    ['*']
                )
                // Handle both boolean true and numeric 1 from database
                return user?.isVerified === true || user?.isVerified === 1
            }
        })

        // Create interaction with AND conditions
        const PublishContent = Interaction.create({
            name: 'publishContent',
            action: Action.create({ name: 'publish' }),
            conditions: Conditions.create({
                content: BoolExp.atom(systemNotInMaintenance).and(BoolExp.atom(userIsVerified))
            })
        })

        controller = new Controller({
            system: system,
            entities: [User, System],
            relations: [],
            eventSources: [PublishContent]
        })
        await controller.setup(true)

        // Create system state
        await system.storage.create('System', { maintenanceMode: false })

        // Create test users
        const verifiedUser = await system.storage.create('User', { name: 'Verified', isVerified: true })
        const unverifiedUser = await system.storage.create('User', { name: 'Unverified', isVerified: false })

        // Test verified user when system is not in maintenance - should pass
        const verifiedResult = await controller.dispatch(PublishContent, {
            user: verifiedUser
        })
        expect(verifiedResult.error).toBeUndefined()

        // Test unverified user - should fail
        const unverifiedResult = await controller.dispatch(PublishContent, {
            user: unverifiedUser
        })
        expect(unverifiedResult.error).toBeDefined()
        expect((unverifiedResult.error as ConditionError).type).toBe('condition check failed')
        // The error should indicate that userIsVerified condition failed
        expect((unverifiedResult.error as ConditionError).error.data.name).toBe('userIsVerified')

        // Put system in maintenance mode
        await system.storage.update('System', undefined, { maintenanceMode: true })

        // Test verified user when system is in maintenance - should fail
        const maintenanceResult = await controller.dispatch(PublishContent, {
            user: verifiedUser
        })
        expect(maintenanceResult.error).toBeDefined()
        expect((maintenanceResult.error as ConditionError).type).toBe('condition check failed')
        // The error should indicate that systemNotInMaintenance condition failed
        expect((maintenanceResult.error as ConditionError).error.data.name).toBe('systemNotInMaintenance')
    })

    describe('condition error handling', () => {
        test('should handle condition function errors gracefully', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            // Create condition that throws error
            const buggyCondition = Condition.create({
                name: 'buggyCondition',
                content: async function(this: Controller, event: any) {
                    throw new Error('Condition evaluation failed!')
                }
            })

            const BuggyInteraction = Interaction.create({
                name: 'buggyInteraction',
                action: Action.create({ name: 'buggy' }),
                conditions: buggyCondition
            })

            controller = new Controller({
                system: system,
                entities: [User],
                relations: [],
                eventSources: [BuggyInteraction]
            })
            await controller.setup(true)

            const user = await system.storage.create('User', { name: 'TestUser' })

            // Should catch error and treat as failed condition
            const result = await controller.dispatch(BuggyInteraction, {
                user: user
            })
            expect(result.error).toBeDefined()
            expect((result.error as ConditionError).type).toBe('condition check failed')
            expect((result.error as ConditionError).error.data.name).toBe('buggyCondition')
        })

        test('should capture detailed exception message when condition throws', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            // Create condition that throws error with specific message
            const detailedErrorCondition = Condition.create({
                name: 'detailedErrorCondition',
                content: async function(this: Controller, event: any) {
                    throw new Error('Database connection timeout after 30 seconds')
                }
            })

            const DetailedErrorInteraction = Interaction.create({
                name: 'detailedErrorInteraction',
                action: Action.create({ name: 'detailed' }),
                conditions: detailedErrorCondition
            })

            controller = new Controller({
                system: system,
                entities: [User],
                relations: [],
                eventSources: [DetailedErrorInteraction]
            })
            await controller.setup(true)

            const user = await system.storage.create('User', { name: 'TestUser' })

            const result = await controller.dispatch(DetailedErrorInteraction, {
                user: user
            })
            
            expect(result.error).toBeDefined()
            const conditionError = result.error as ConditionError
            expect(conditionError.type).toBe('condition check failed')
            expect(conditionError.error.data.name).toBe('detailedErrorCondition')
            
            // Verify that the detailed exception message is captured
            expect(conditionError.error.error).toContain('detailedErrorCondition')
            expect(conditionError.error.error).toContain('threw exception')
            expect(conditionError.error.error).toContain('Database connection timeout after 30 seconds')
        })

        test('should capture exception details in complex BoolExp conditions', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            // Create conditions - one passes, one throws
            const passingCondition = Condition.create({
                name: 'passingCondition',
                content: async function(this: Controller, event: any) {
                    return true
                }
            })

            const throwingCondition = Condition.create({
                name: 'throwingCondition',
                content: async function(this: Controller, event: any) {
                    throw new Error('Network error: Failed to fetch user permissions')
                }
            })

            // Use AND - should fail at throwingCondition
            const ComplexInteraction = Interaction.create({
                name: 'complexInteraction',
                action: Action.create({ name: 'complex' }),
                conditions: Conditions.create({
                    content: BoolExp.atom(passingCondition).and(BoolExp.atom(throwingCondition))
                })
            })

            controller = new Controller({
                system: system,
                entities: [User],
                relations: [],
                eventSources: [ComplexInteraction]
            })
            await controller.setup(true)

            const user = await system.storage.create('User', { name: 'TestUser' })

            const result = await controller.dispatch(ComplexInteraction, {
                user: user
            })
            
            expect(result.error).toBeDefined()
            const conditionError = result.error as ConditionError
            expect(conditionError.type).toBe('condition check failed')
            
            // Should identify which condition failed
            expect(conditionError.error.data.name).toBe('throwingCondition')
            
            // Should contain detailed exception message
            expect(conditionError.error.error).toContain('throwingCondition')
            expect(conditionError.error.error).toContain('Network error: Failed to fetch user permissions')
        })

        test('should handle undefined return from condition', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            // Create condition that returns undefined
            const incompleteCondition = Condition.create({
                name: 'incompleteCondition',
                content: async function(this: Controller, event: any) {
                    // Returns undefined - fail-closed: guard callbacks must
                    // explicitly return a boolean
                    return undefined as any
                }
            })

            const IncompleteInteraction = Interaction.create({
                name: 'incompleteInteraction',
                action: Action.create({ name: 'incomplete' }),
                conditions: incompleteCondition
            })

            controller = new Controller({
                system: system,
                entities: [User],
                relations: [],
                eventSources: [IncompleteInteraction]
            })
            await controller.setup(true)

            const user = await system.storage.create('User', { name: 'TestUser' })

            // fail-closed: undefined is rejected with a clear message instead of
            // silently passing the guard
            const result = await controller.dispatch(IncompleteInteraction, {
                user: user
            })
            expect(result.error).toBeDefined()
            const conditionError = result.error as ConditionError
            expect(conditionError.type).toBe('condition check failed')
            expect(conditionError.error.error).toContain('returned undefined')
        })
    })

    describe('declarative admission locks (FR-01)', () => {
        test('content second argument receives locked snapshot for declared record id', async () => {
            const Account = Entity.create({
                name: 'CondLockAccount',
                properties: [
                    Property.create({ name: 'balance', type: 'number' }),
                ],
            })

            let seenBalance: number | undefined
            let seenViaGet: Record<string, unknown> | undefined
            const hasBalance = Condition.create({
                name: 'hasBalance',
                locks: [
                    {
                        recordName: 'CondLockAccount',
                        id: (event: any) => event.payload.accountId,
                        attributeQuery: ['id', 'balance'],
                    },
                ],
                content: async function (this: Controller, event: any, admission: any) {
                    seenViaGet = admission?.get?.('CondLockAccount', event.payload.accountId)
                    seenBalance = seenViaGet?.balance as number | undefined
                    return Number(seenBalance) >= Number(event.payload.amount)
                },
            })

            const Debit = Interaction.create({
                name: 'condLockDebit',
                action: Action.create({ name: 'condLockDebit' }),
                payload: Payload.create({
                    items: [
                        PayloadItem.create({ name: 'accountId', type: 'string', required: true }),
                        PayloadItem.create({ name: 'amount', type: 'number', required: true }),
                    ],
                }),
                conditions: hasBalance,
            })

            controller = new Controller({
                system,
                entities: [Account],
                relations: [],
                eventSources: [Debit],
            })
            await controller.setup(true)

            const account = await system.storage.create('CondLockAccount', { balance: 50 })
            const user = { id: 'u-cond-lock' }
            const accountId = String(account.id)

            const ok = await controller.dispatch(Debit, {
                user,
                payload: { accountId, amount: 30 },
            })
            expect(ok.error).toBeUndefined()
            expect(seenBalance).toBe(50)
            expect(seenViaGet).toMatchObject({ id: account.id, balance: 50 })

            const denied = await controller.dispatch(Debit, {
                user,
                payload: { accountId, amount: 100 },
            })
            expect(denied.error).toBeDefined()
            expect((denied.error as ConditionError).type).toBe('condition check failed')
        })

        test('missing id from lock resolver fails closed before content runs', async () => {
            let contentRan = false
            const Item = Entity.create({
                name: 'CondLockItem',
                properties: [Property.create({ name: 'n', type: 'number' })],
            })
            const gate = Condition.create({
                name: 'lockNeedsId',
                locks: [
                    {
                        recordName: 'CondLockItem',
                        id: () => undefined as any,
                    },
                ],
                content: async function () {
                    contentRan = true
                    return true
                },
            })
            const Gate = Interaction.create({
                name: 'condLockNeedsId',
                action: Action.create({ name: 'condLockNeedsId' }),
                conditions: gate,
            })
            controller = new Controller({
                system,
                entities: [Item],
                relations: [],
                eventSources: [Gate],
            })
            await controller.setup(true)
            const user = await system.storage.create('CondLockItem', { n: 1 })
            const result = await controller.dispatch(Gate, { user: { id: String(user.id) } })
            expect(result.error).toBeDefined()
            expect(String((result.error as any).error ?? (result.error as any).message ?? result.error)).toMatch(
                /id resolver returned undefined|admission lock/i
            )
            expect(contentRan).toBe(false)
        })


        test('AdmissionSnapshot is read-only for Condition content (design §3.2.1)', async () => {
            // Design: snapshot is a read-only view of locked rows. Content must not be able
            // to rewrite balances (or other fields) for later atoms in the same guard via
            // get()/getAll() mutation or put().
            const Account = Entity.create({
                name: 'CondSnapAccount',
                properties: [
                    Property.create({ name: 'balance', type: 'number' }),
                ],
            })

            let mutatedSeen: number | undefined
            let secondAtomSaw: number | undefined
            let secondAtomSawViaGetAll: number | undefined

            const mutator = Condition.create({
                name: 'mutatesSnapshot',
                locks: [
                    {
                        recordName: 'CondSnapAccount',
                        id: (event: any) => event.payload.accountId,
                        attributeQuery: ['id', 'balance'],
                    },
                ],
                content: async function (_event: any, admission: any) {
                    const row = admission.get('CondSnapAccount', _event.payload.accountId)
                    if (row) {
                        row.balance = -999
                        mutatedSeen = row.balance
                    }
                    // getAll must also return copies; mutating them must not rewrite the store
                    const all = typeof admission.getAll === 'function'
                        ? admission.getAll('CondSnapAccount')
                        : []
                    for (const r of all) {
                        r.balance = -888
                    }
                    // put must not be a public write channel for guards
                    if (typeof admission.put === 'function') {
                        try {
                            admission.put('CondSnapAccount', {
                                id: _event.payload.accountId,
                                balance: -1,
                            })
                        } catch {
                            // sealed/read-only put may throw — that is acceptable
                        }
                    }
                    return true
                },
            })

            const observer = Condition.create({
                name: 'observesSnapshot',
                content: async function (_event: any, admission: any) {
                    const row = admission?.get?.('CondSnapAccount', _event.payload.accountId)
                    secondAtomSaw = row?.balance as number | undefined
                    const viaAll = admission?.getAll?.('CondSnapAccount') ?? []
                    secondAtomSawViaGetAll = viaAll[0]?.balance as number | undefined
                    return Number(row?.balance) === 50 && Number(viaAll[0]?.balance) === 50
                },
            })

            const Gate = Interaction.create({
                name: 'condSnapReadonly',
                action: Action.create({ name: 'condSnapReadonly' }),
                payload: Payload.create({
                    items: [
                        PayloadItem.create({ name: 'accountId', type: 'string', required: true }),
                    ],
                }),
                conditions: Conditions.create({
                    content: BoolExp.atom(mutator).and(observer),
                }),
            })

            controller = new Controller({
                system,
                entities: [Account],
                relations: [],
                eventSources: [Gate],
            })
            await controller.setup(true)

            const account = await system.storage.create('CondSnapAccount', { balance: 50 })
            const result = await controller.dispatch(Gate, {
                user: { id: 'u-snap' },
                payload: { accountId: String(account.id) },
            })

            expect(result.error).toBeUndefined()
            expect(mutatedSeen).toBe(-999) // local binding may hold a discarded copy
            // The shared snapshot must still present the locked balance to later atoms.
            expect(secondAtomSaw).toBe(50)
            expect(secondAtomSawViaGetAll).toBe(50)
        })
        test('empty-locks AdmissionSnapshot is still read-only (no forge via put)', async () => {
            // Same domain as sealed snapshot: content must never use put to plant rows
            // for later atoms — including the common path where no atom declared locks
            // (acquireAdmissionLocks early-returns without seal in a defective build).
            let secondSaw: unknown
            const forger = Condition.create({
                name: 'forgesEmptySnapshot',
                content: async (_event: any, admission: any) => {
                    if (typeof admission?.put === 'function') {
                        try {
                            admission.put('GhostAccount', { id: 'g1', balance: 999 })
                        } catch {
                            // sealed/read-only put may throw
                        }
                    }
                    return true
                },
            })
            const observer = Condition.create({
                name: 'observesEmptySnapshot',
                content: async (_event: any, admission: any) => {
                    secondSaw = admission?.get?.('GhostAccount', 'g1')
                    return true
                },
            })
            const Gate = Interaction.create({
                name: 'condEmptySnapReadonly',
                action: Action.create({ name: 'condEmptySnapReadonly' }),
                conditions: Conditions.create({
                    content: BoolExp.atom(forger).and(observer),
                }),
            })
            controller = new Controller({
                system,
                entities: [],
                relations: [],
                eventSources: [Gate],
            })
            await controller.setup(true)
            const result = await controller.dispatch(Gate, { user: { id: 'u-empty-snap' } })
            expect(result.error).toBeUndefined()
            expect(secondSaw).toBeUndefined()
        })

        test('mode match locks populate snapshot via lockRows', async () => {
            const Item = Entity.create({
                name: 'CondMatchItem',
                properties: [
                    Property.create({ name: 'code', type: 'string' }),
                    Property.create({ name: 'n', type: 'number' }),
                ],
            })

            let saw: Record<string, unknown> | undefined
            const gate = Condition.create({
                name: 'matchLockGate',
                locks: [
                    {
                        mode: 'match',
                        recordName: 'CondMatchItem',
                        match: (event: any) =>
                            MatchExp.atom({ key: 'code', value: ['=', event.payload.code] }),
                        attributeQuery: ['id', 'code', 'n'],
                    },
                ],
                content: async function (event: any, admission: any) {
                    const rows = admission.getAll('CondMatchItem')
                    saw = rows.find((r: any) => r.code === event.payload.code)
                    return !!saw && Number(saw.n) > 0
                },
            })

            const Open = Interaction.create({
                name: 'condMatchOpen',
                action: Action.create({ name: 'condMatchOpen' }),
                payload: Payload.create({
                    items: [PayloadItem.create({ name: 'code', type: 'string', required: true })],
                }),
                conditions: gate,
            })

            controller = new Controller({
                system,
                entities: [Item],
                relations: [],
                eventSources: [Open],
            })
            await controller.setup(true)
            await system.storage.create('CondMatchItem', { code: 'alpha', n: 3 })
            const ok = await controller.dispatch(Open, {
                user: { id: 'u-match' },
                payload: { code: 'alpha' },
            })
            expect(ok.error).toBeUndefined()
            expect(saw).toMatchObject({ code: 'alpha', n: 3 })
        })

        test('locks under BoolExp.not are still acquired (union of all atoms)', async () => {
            const Flag = Entity.create({
                name: 'CondLockFlag',
                properties: [Property.create({ name: 'on', type: 'boolean', defaultValue: () => false })],
            })

            let snapshotSawFlag = false
            const alwaysFalse = Condition.create({
                name: 'alwaysFalseWithLock',
                locks: [
                    {
                        recordName: 'CondLockFlag',
                        id: (event: any) => event.payload.flagId,
                        attributeQuery: ['id', 'on'],
                    },
                ],
                content: async function (_event: any, admission: any) {
                    snapshotSawFlag = !!admission?.get?.('CondLockFlag', _event.payload.flagId)
                    return false
                },
            })

            // not(false) => pass; lock must still run for the negated atom
            const OpenGate = Interaction.create({
                name: 'condLockNotAtom',
                action: Action.create({ name: 'condLockNotAtom' }),
                payload: Payload.create({
                    items: [PayloadItem.create({ name: 'flagId', type: 'string', required: true })],
                }),
                conditions: Conditions.create({
                    content: BoolExp.atom(alwaysFalse).not(),
                }),
            })

            controller = new Controller({
                system,
                entities: [Flag],
                relations: [],
                eventSources: [OpenGate],
            })
            await controller.setup(true)
            const flag = await system.storage.create('CondLockFlag', { on: true })
            const result = await controller.dispatch(OpenGate, {
                user: { id: 'u-not' },
                payload: { flagId: String(flag.id) },
            })
            expect(result.error).toBeUndefined()
            expect(snapshotSawFlag).toBe(true)
        })
    })
})
