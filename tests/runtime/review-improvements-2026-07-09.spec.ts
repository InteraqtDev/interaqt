import { describe, expect, test } from "vitest";
import { Controller, Count, Dictionary, Entity, KlassByName, MonoSystem, Property } from 'interaqt';
import { PGLiteDB } from '@drivers';

/**
 * r8 显著改进项回归：生命周期边缘三件套。
 */
function createModel() {
    const Task = Entity.create({
        name: 'Task',
        properties: [Property.create({ name: 'title', type: 'string' })]
    })
    const dict = Dictionary.create({
        name: 'taskTotal',
        type: 'number',
        collection: false,
        computation: Count.create({ record: Task })
    })
    return { Task, dict }
}

describe('lifecycle: scheduler.setup atomic listener swap', () => {
    test('failed re-setup keeps previous listeners active (no silent zero-listener system)', async () => {
        const { Task, dict } = createModel()
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Task],
            relations: [],
            eventSources: [],
            dict: [dict]
        })
        await controller.setup(true)

        await system.storage.create('Task', { title: 't1' })
        expect(await system.storage.dict.get('taskTotal')).toBe(1)

        // 让重建路径在「构建新 listener」阶段失败（sourceMapManager.initialize 是真实的可抛出路径）。
        const sourceMapManager = (controller.scheduler as any).sourceMapManager
        const originalInitialize = sourceMapManager.initialize.bind(sourceMapManager)
        sourceMapManager.initialize = () => { throw new Error('injected initialize failure') }
        await expect(controller.scheduler.setup(false)).rejects.toThrow(/injected initialize failure/)
        sourceMapManager.initialize = originalInitialize

        // 旧 listener 必须仍然生效：增量计算没有被冻结。
        await system.storage.create('Task', { title: 't2' })
        expect(await system.storage.dict.get('taskTotal')).toBe(2)

        // 恢复后重跑 setup 仍然幂等（不会双计）。
        await controller.scheduler.setup(false)
        await system.storage.create('Task', { title: 't3' })
        expect(await system.storage.dict.get('taskTotal')).toBe(3)
    })
})

describe('lifecycle: install failure recovery guidance', () => {
    test('scheduler failure during setup(true) throws an error pointing at re-running install', async () => {
        const { Task, dict } = createModel()
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Task],
            relations: [],
            eventSources: [],
            dict: [dict]
        })
        const originalSetup = controller.scheduler.setup.bind(controller.scheduler)
        controller.scheduler.setup = async () => { throw new Error('injected scheduler failure') }

        await expect(controller.setup(true)).rejects.toThrow(/re-run setup\(true\)/)

        // 修复后按提示重跑 install 即可恢复（install 重建表）。
        controller.scheduler.setup = originalSetup
        await controller.setup(true)
        await system.storage.create('Task', { title: 't1' })
        expect(await system.storage.dict.get('taskTotal')).toBe(1)
    })
})

describe('lifecycle: post-migration scheduler failure guidance', () => {
    test('scheduler failure after successful migration reports "do NOT retry the migration"', async () => {
        // v1 install（用 new Entity 绕开全局 registry，与 migration.spec.ts 的多版本建模方式一致）
        const TaskV1 = new Entity({
            name: 'MigTask',
            properties: [new Property({ name: 'title', type: 'string' })]
        })
        const db = new PGLiteDB()
        const systemV1 = new MonoSystem(db)
        systemV1.conceptClass = KlassByName
        const controllerV1 = new Controller({ system: systemV1, entities: [TaskV1], relations: [], eventSources: [], dict: [] })
        await controllerV1.setup(true)
        await systemV1.storage.create('MigTask', { title: 't1' })

        // v2：新增一个带 defaultValue 的属性（可自动迁移的最小变更）
        const TaskV2 = new Entity({
            name: 'MigTask',
            properties: [
                new Property({ name: 'title', type: 'string' }),
                new Property({ name: 'status', type: 'string', defaultValue: () => 'open' })
            ]
        })
        const systemV2 = new MonoSystem(db)
        systemV2.conceptClass = KlassByName
        const controllerV2 = new Controller({ system: systemV2, entities: [TaskV2], relations: [], eventSources: [], dict: [] })

        const diff = await controllerV2.generateMigrationDiff({ includeFunctionText: true, includeDestructiveScope: true })
        const approvedDiff = {
            ...diff,
            status: 'approved' as const,
            decisions: [
                ...diff.decisions,
                ...diff.requiredDecisions.map((requirement: any) => ({
                    ...requirement,
                    decision: requirement.recommendedDecision,
                    reason: 'approved by test'
                }))
            ]
        }

        controllerV2.scheduler.setup = async () => { throw new Error('injected post-migration failure') }
        await expect(controllerV2.migrate({ approvedDiff })).rejects.toThrow(/do NOT retry the migration/)

        // 数据库确实已迁移完成：按提示 setup(false) 可直接恢复。
        const systemV3 = new MonoSystem(db)
        systemV3.conceptClass = KlassByName
        const TaskV3 = new Entity({
            name: 'MigTask',
            properties: [
                new Property({ name: 'title', type: 'string' }),
                new Property({ name: 'status', type: 'string', defaultValue: () => 'open' })
            ]
        })
        const controllerV3 = new Controller({ system: systemV3, entities: [TaskV3], relations: [], eventSources: [], dict: [] })
        await controllerV3.setup(false)
        const created = await systemV3.storage.create('MigTask', { title: 't2' })
        expect(created.id).toBeTruthy()
    })
})
