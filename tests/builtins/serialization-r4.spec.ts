/**
 * Regression tests for the 2026-07-09 r4 review serialization fixes (F-2 / I-7).
 *
 * - Activity/Transfer/ActivityGroup are registered Klasses and survive the
 *   graph-level round trip (createInstances resolves `uuid::` references).
 * - Interaction.stringify goes through the unified stringifyInstance pipeline,
 *   so nested Klass instances keep their identity and functions survive.
 * - Standalone parse restores `func::` functions and preserves uuid identity
 *   (uuid:: references still require the graph pipeline — documented contract).
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { clearAllInstances, createInstances, KlassByName, BoolExp, BoolAtomData, BoolExpressionData } from '@core';
import { Interaction, InteractionInstance } from '../../src/builtins/interaction/Interaction.js';
import { Activity, ActivityGroup, Transfer, ActivityInstance, TransferInstance } from '../../src/builtins/interaction/Activity.js';
import { Action, ActionInstance } from '../../src/builtins/interaction/Action.js';
import { Payload } from '../../src/builtins/interaction/Payload.js';
import { PayloadItem } from '../../src/builtins/interaction/PayloadItem.js';
import { Condition, ConditionInstance } from '../../src/builtins/interaction/Condition.js';
import { Conditions, ConditionsInstance } from '../../src/builtins/interaction/Conditions.js';
import '../../src/builtins/init.js';

beforeEach(() => {
    clearAllInstances(
        Interaction, Activity, ActivityGroup, Transfer, Action,
        Payload, PayloadItem, Condition, Conditions,
        BoolAtomData, BoolExpressionData,
    );
});

function roundTrip(jsons: string[]) {
    const serialized = `[${jsons.join(',')}]`;
    clearAllInstances(
        Interaction, Activity, ActivityGroup, Transfer, Action,
        Payload, PayloadItem, Condition, Conditions,
        BoolAtomData, BoolExpressionData,
    );
    return createInstances(JSON.parse(serialized));
}

describe('r4 serialization fixes', () => {
    test('Transfer and ActivityGroup are registered Klasses', () => {
        expect(KlassByName.get('Transfer')).toBe(Transfer);
        expect(KlassByName.get('ActivityGroup')).toBe(ActivityGroup);
    });

    test('F-2: activity graph round-trips through the graph pipeline', () => {
        const actionA = Action.create({ name: 'doA' });
        const actionB = Action.create({ name: 'doB' });
        const a = Interaction.create({ name: 'StepA', action: actionA });
        const b = Interaction.create({ name: 'StepB', action: actionB });
        const t = Transfer.create({ name: 't1', source: a, target: b });
        const group = ActivityGroup.create({
            type: 'every',
            activities: [Activity.create({ name: 'SubSeq', interactions: [] })],
        });
        const act = Activity.create({ name: 'Flow', interactions: [a, b], transfers: [t], groups: [group] });

        const jsons = [
            Action.stringify(actionA), Action.stringify(actionB),
            Interaction.stringify(a), Interaction.stringify(b),
            Transfer.stringify(t), ActivityGroup.stringify(group),
            Activity.stringify(Activity.instances.find(i => i.name === 'SubSeq')!),
            Activity.stringify(act),
        ];
        const instances = roundTrip(jsons);

        const parsedAct = instances.get(act.uuid) as ActivityInstance;
        expect(parsedAct).toBeDefined();
        expect(parsedAct.name).toBe('Flow');
        // 修复前：interactions/transfers 是 "uuid::..." 字符串
        expect(parsedAct.interactions).toHaveLength(2);
        expect(Interaction.is(parsedAct.interactions[0])).toBe(true);
        expect(parsedAct.interactions.map(i => i.name).sort()).toEqual(['StepA', 'StepB']);

        expect(parsedAct.transfers).toHaveLength(1);
        const parsedTransfer = parsedAct.transfers[0] as TransferInstance;
        expect(Transfer.is(parsedTransfer)).toBe(true);
        expect(Interaction.is(parsedTransfer.source)).toBe(true);
        expect((parsedTransfer.source as InteractionInstance).name).toBe('StepA');
        expect((parsedTransfer.target as InteractionInstance).name).toBe('StepB');

        expect(parsedAct.groups).toHaveLength(1);
        expect(ActivityGroup.is(parsedAct.groups[0])).toBe(true);
        expect(parsedAct.groups[0].activities![0].name).toBe('SubSeq');

        // action 保持 Klass 身份（修复前 Interaction.stringify 会把它内联成 plain object）
        const parsedA = instances.get(a.uuid) as InteractionInstance;
        expect(Action.is(parsedA.action)).toBe(true);
        expect((parsedA.action as ActionInstance).name).toBe('doA');
    });

    test('I-7: interaction with function-bearing conditions round-trips', () => {
        const cond = Condition.create({ name: 'isAllowed', content: async function () { return true } });
        const conditions = Conditions.create({ content: BoolExp.atom(cond) });
        const ix = Interaction.create({
            name: 'GuardedIx',
            action: Action.create({ name: 'doGuarded' }),
            conditions,
        });

        const jsons = [
            Condition.stringify(cond),
            // BoolExp.atom(cond) 产生的 BoolAtomData 实例也是图的一部分
            ...BoolAtomData.instances.map(i => BoolAtomData.stringify(i as InstanceType<typeof BoolAtomData>)),
            Conditions.stringify(conditions),
            Action.stringify(Action.instances.find(i => i.name === 'doGuarded')!),
            Interaction.stringify(ix),
        ];
        const instances = roundTrip(jsons);

        const parsedIx = instances.get(ix.uuid) as InteractionInstance;
        expect(Conditions.is(parsedIx.conditions)).toBe(true);
        const content = (parsedIx.conditions as ConditionsInstance).content!;
        expect(BoolAtomData.is(content)).toBe(true);
        const parsedCond = (content as InstanceType<typeof BoolAtomData>).data as unknown as ConditionInstance;
        expect(Condition.is(parsedCond)).toBe(true);
        // 修复前：condition 的 content 函数在 Interaction 手写序列化中静默丢失
        expect(typeof parsedCond.content).toBe('function');
    });

    test('standalone parse restores functions and preserves uuid identity', () => {
        const cond = Condition.create({ name: 'standalone', content: async function () { return false } });
        const json = Condition.stringify(cond);
        clearAllInstances(Condition);
        const parsed = Condition.parse(json);
        expect(parsed.uuid).toBe(cond.uuid);
        expect(typeof parsed.content).toBe('function');

        const a = Interaction.create({ name: 'SoloIx', action: Action.create({ name: 'soloAct' }) });
        const ixJson = Interaction.stringify(a);
        clearAllInstances(Interaction);
        const parsedIx = Interaction.parse(ixJson);
        expect(parsedIx.uuid).toBe(a.uuid);
        expect(parsedIx.name).toBe('SoloIx');
        // 标注的契约：uuid:: 引用需要 graph 管线才能解析，standalone parse 保留编码字符串
        expect(parsedIx.action).toBe(`uuid::${(a.action as ActionInstance).uuid}`);
    });
});
