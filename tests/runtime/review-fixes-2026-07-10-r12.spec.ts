/**
 * 第十二轮深度 review 修复的回归测试（runtime/core/builtins 部分）。
 * 对应报告：agentspace/output/deep-review-2026-07-10-r12.md
 */
import { describe, expect, test } from "vitest";
import {
    Action,
    Activity,
    ActivityGroup,
    ActivityManager,
    Controller,
    createUserRoleAttributive,
    Custom,
    Dictionary,
    Entity,
    Interaction,
    KlassByName,
    MatchExp,
    MonoSystem,
    Property,
    Relation,
    Transfer,
} from 'interaqt';
import { PGLiteDB } from '@drivers';

describe('r12 F-1: global dict incrementalPatchCompute applies patch.data, not the envelope', () => {
    test('insert/update patches write data; delete writes null', async () => {
        const TestEntity = Entity.create({
            name: 'R12PatchEntity',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });

        const dict = Dictionary.create({
            name: 'r12PatchDict',
            type: 'number',
            defaultValue: () => 0,
            computation: Custom.create({
                name: 'R12PatchCustom',
                dataDeps: {
                    records: { type: 'records', source: TestEntity, attributeQuery: ['name'] },
                },
                incrementalDataDeps: [],
                compute: async function (this: any, dataDeps: any) {
                    return (dataDeps.records || []).length;
                },
                incrementalPatchCompute: async function (this: any, lastValue: any, mutationEvent: any) {
                    if (mutationEvent?.type === 'create') {
                        return { type: 'insert', data: (lastValue ?? 0) + 1 };
                    }
                    if (mutationEvent?.type === 'delete') {
                        return { type: 'delete' };
                    }
                    return undefined;
                },
                getInitialValue: function () { return 0; },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [TestEntity], relations: [], dict: [dict] });
        await controller.setup(true);

        await system.storage.create('R12PatchEntity', { name: 'a' });
        // 修复前：dict 里存的是 {type:'insert', data:1} 信封对象
        expect(await system.storage.dict.get('r12PatchDict')).toBe(1);

        await system.storage.create('R12PatchEntity', { name: 'b' });
        expect(await system.storage.dict.get('r12PatchDict')).toBe(2);

        await system.storage.delete('R12PatchEntity', MatchExp.atom({ key: 'name', value: ['=', 'a'] }));
        expect(await system.storage.dict.get('r12PatchDict')).toBe(null);

        await system.destroy();
    });

    test('malformed patch envelope fails fast instead of silently corrupting', async () => {
        const TestEntity = Entity.create({
            name: 'R12PatchEntity2',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });

        const dict = Dictionary.create({
            name: 'r12PatchDict2',
            type: 'number',
            defaultValue: () => 0,
            computation: Custom.create({
                name: 'R12PatchCustom2',
                dataDeps: {
                    records: { type: 'records', source: TestEntity, attributeQuery: ['name'] },
                },
                incrementalDataDeps: [],
                compute: async function (this: any, dataDeps: any) {
                    return (dataDeps.records || []).length;
                },
                incrementalPatchCompute: async function () {
                    // 忘了信封，直接返回裸值
                    return 42 as any;
                },
                getInitialValue: function () { return 0; },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [TestEntity], relations: [], dict: [dict] });
        await controller.setup(true);

        await expect(system.storage.create('R12PatchEntity2', { name: 'a' }))
            .rejects.toThrow(/ComputationResultPatch envelope/);

        await system.destroy();
    });
});

describe('r12 R-1: declaration-mode conflicts fail fast', () => {
    test('Entity matchExpression without baseEntity is rejected', () => {
        expect(() => Entity.create({
            name: 'R12OrphanMatch',
            properties: [Property.create({ name: 'status', type: 'string' })],
            matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
        })).toThrow(/matchExpression without baseEntity/);
    });

    test('Entity baseEntity + inputEntities is rejected', () => {
        const Base = Entity.create({ name: 'R12ModeBase', properties: [Property.create({ name: 'kind', type: 'string' })] });
        const In1 = Entity.create({ name: 'R12ModeIn1', properties: [Property.create({ name: 'a', type: 'string' })] });
        expect(() => Entity.create({
            name: 'R12ModeBoth',
            baseEntity: Base,
            matchExpression: MatchExp.atom({ key: 'kind', value: ['=', 'x'] }),
            inputEntities: [In1],
        })).toThrow(/mutually exclusive/);
    });

    test('Relation matchExpression without baseRelation is rejected', () => {
        const A = Entity.create({ name: 'R12RelA', properties: [] });
        const B = Entity.create({ name: 'R12RelB', properties: [] });
        expect(() => Relation.create({
            source: A, sourceProperty: 'bs',
            target: B, targetProperty: 'as',
            type: 'n:n',
            matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
        })).toThrow(/matchExpression without baseRelation/);
    });

    test('Relation baseRelation + inputRelations is rejected', () => {
        const A = Entity.create({ name: 'R12RelA2', properties: [] });
        const B = Entity.create({ name: 'R12RelB2', properties: [] });
        const r1 = Relation.create({ source: A, sourceProperty: 'x1', target: B, targetProperty: 'y1', type: 'n:n' });
        const r2 = Relation.create({ source: A, sourceProperty: 'x2', target: B, targetProperty: 'y2', type: 'n:n' });
        expect(() => Relation.create({
            name: 'R12MergedFiltered',
            inputRelations: [r1, r2],
            baseRelation: r1,
            matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
            sourceProperty: 'merged', targetProperty: 'mergedRev',
        })).toThrow(/mutually exclusive/);
    });

    test('Property computed + computation is rejected', () => {
        const E = Entity.create({ name: 'R12CompHost', properties: [] });
        expect(() => Property.create({
            name: 'x',
            type: 'number',
            computed: (r: any) => 1,
            computation: Custom.create({
                name: 'R12XComp',
                dataDeps: { _current: { type: 'property', attributeQuery: ['n'] } },
                compute: async () => 2,
            }),
        })).toThrow(/competing write channels/);
    });
});

describe('r12 R-5: duplicate node instances in one activity graph fail fast', () => {
    test('same Interaction instance in two places is rejected with a clear error', () => {
        const stepA = Interaction.create({ name: 'r12StepA', action: Action.create({ name: 'r12StepA' }) });
        const shared = Interaction.create({ name: 'r12Shared', action: Action.create({ name: 'r12Shared' }) });
        const sub1 = Activity.create({ name: 'r12Sub1', interactions: [shared] });
        const activity = Activity.create({
            name: 'R12ReuseActivity',
            interactions: [stepA, shared],
            groups: [ActivityGroup.create({ type: 'every', activities: [sub1] })],
            transfers: [Transfer.create({ name: 't1', source: stepA, target: shared })],
        });
        expect(() => new ActivityManager([activity]))
            .toThrow(/appears more than once/);
    });
});

describe('r12 R-6: activity head with activityId resolves isRef attributives via refs', () => {
    test('second branch head with isRef userAttributives checks saved refs', async () => {
        // every 组的两个分支各自有 head：分支一 head 保存 userRef，
        // 分支二 head 用 isRef attributive 要求必须是同一个用户。
        const starterRef = createUserRoleAttributive({ name: 'r12Starter', isRef: true });
        const branch1Head = Interaction.create({
            name: 'r12Branch1',
            action: Action.create({ name: 'r12Branch1' }),
            userRef: starterRef,
        });
        const branch2Head = Interaction.create({
            name: 'r12Branch2',
            action: Action.create({ name: 'r12Branch2' }),
            userAttributives: starterRef,
        });
        const sub1 = Activity.create({ name: 'r12BranchSub1', interactions: [branch1Head] });
        const sub2 = Activity.create({ name: 'r12BranchSub2', interactions: [branch2Head] });
        const group = ActivityGroup.create({ type: 'every', activities: [sub1, sub2] });
        const endStep = Interaction.create({ name: 'r12End', action: Action.create({ name: 'r12End' }) });
        const activity = Activity.create({
            name: 'R12HeadRefActivity',
            interactions: [endStep],
            groups: [group],
            transfers: [Transfer.create({ name: 'toEnd', source: group, target: endStep })],
        });

        const UserE = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
        const manager = new ActivityManager([activity]);
        const output = manager.getOutput();
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [UserE, ...output.entities],
            relations: [...output.relations],
            eventSources: [...output.eventSources],
        });
        await controller.setup(true);

        const userA = await system.storage.create('User', { name: 'A' });
        const userB = await system.storage.create('User', { name: 'B' });
        const branch1ES = controller.findEventSourceByName('R12HeadRefActivity:r12Branch1')!;
        const branch2ES = controller.findEventSourceByName('R12HeadRefActivity:r12Branch2')!;

        // 分支一：创建 activity 并保存 starter ref = userA
        const res1 = await controller.dispatch(branch1ES, { user: userA });
        expect(res1.error).toBeUndefined();
        const activityId = res1.context!.activityId as string;

        // 分支二 + 错误用户：isRef 检查应失败（修复前是 "isRef outside activity" 的误导错误）
        const res2 = await controller.dispatch(branch2ES, { user: userB, activityId });
        expect(res2.error).toBeDefined();
        expect(String((res2.error as any).message ?? res2.error)).not.toMatch(/outside an? activity/);

        // 分支二 + 正确用户：通过
        const res3 = await controller.dispatch(branch2ES, { user: userA, activityId });
        expect(res3.error).toBeUndefined();

        await system.destroy();
    });
});
