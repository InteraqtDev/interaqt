import { describe, expect, test, beforeEach, vi } from "vitest";
import { KlassInstance } from "@interaqt/shared";
import { Controller } from "../Controller.js";
import { MonoSystem } from "../MonoSystem.js";
import { StateNode, StateTransfer, StateMachine, Interaction, Action, Payload, PayloadItem } from "@interaqt/shared";
import { StateMachineRunner } from "../computedDataHandles/StateMachineRunner.js";

describe('StateMachineRunner', () => {
    let controller: Controller;
    let draftState: KlassInstance<typeof StateNode>;
    let normalState: KlassInstance<typeof StateNode>;
    let publishedState: KlassInstance<typeof StateNode>;
    let finalizeInteraction: KlassInstance<typeof Interaction>;
    let draftInteraction: KlassInstance<typeof Interaction>;
    let publishInteraction: KlassInstance<typeof Interaction>;
    let withdrawInteraction: KlassInstance<typeof Interaction>;
    let stateMachine: KlassInstance<typeof StateMachine>;

    beforeEach(() => {
        const system = new MonoSystem();
        controller = new Controller(system, [], [], [], [], [], []);

        // 创建状态
        draftState = StateNode.create({
            value: 'draft',
            propertyHandle: (context: any) => {
                return { status: 'draft', canEdit: true };
            }
        });

        normalState = StateNode.create({
            value: 'normal',
            propertyHandle: (context: any) => {
                return { status: 'normal', canEdit: true };
            }
        });

        publishedState = StateNode.create({
            value: 'published',
            propertyHandle: (context: any) => {
                return { status: 'published', canEdit: false };
            }
        });

        // 创建交互
        finalizeInteraction = Interaction.create({
            name: 'finalize',
            action: Action.create({name: 'finalize'}),
            payload: Payload.create({
                items: []
            })
        });

        draftInteraction = Interaction.create({
            name: 'draft',
            action: Action.create({name: 'draft'}),
            payload: Payload.create({
                items: []
            })
        });

        publishInteraction = Interaction.create({
            name: 'publish',
            action: Action.create({name: 'publish'}),
            payload: Payload.create({
                items: []
            })
        });

        withdrawInteraction = Interaction.create({
            name: 'withdraw',
            action: Action.create({name: 'withdraw'}),
            payload: Payload.create({
                items: []
            })
        });

        // 创建状态转换
        const draftToNormalTransfer = StateTransfer.create({
            triggerInteraction: finalizeInteraction,
            fromState: draftState,
            toState: normalState,
            handleType: 'computeTarget',
            handle: (context: any) => true
        });

        const normalToDraftTransfer = StateTransfer.create({
            triggerInteraction: draftInteraction,
            fromState: normalState,
            toState: draftState,
            handleType: 'computeTarget',
            handle: (context: any) => true
        });

        const normalToPublishedTransfer = StateTransfer.create({
            triggerInteraction: publishInteraction,
            fromState: normalState,
            toState: publishedState,
            handleType: 'computeTarget',
            handle: (context: any) => true
        });

        const publishedToNormalTransfer = StateTransfer.create({
            triggerInteraction: withdrawInteraction,
            fromState: publishedState,
            toState: normalState,
            handleType: 'computeTarget',
            handle: (context: any) => true
        });

        // 创建状态机
        stateMachine = StateMachine.create({
            states: [draftState, normalState, publishedState],
            transfers: [draftToNormalTransfer, normalToDraftTransfer, normalToPublishedTransfer, publishedToNormalTransfer],
            defaultState: normalState
        });
    });

    test('获取默认状态', () => {
        const runner = new StateMachineRunner(controller, stateMachine);
        const defaultState = runner.getDefaultState();
        expect(defaultState.value).toBe('normal');
    });

    test('根据状态名称查找状态节点', () => {
        const runner = new StateMachineRunner(controller, stateMachine);
        const state = runner.getStateByName('draft');
        expect(state).toBeDefined();
        expect(state?.value).toBe('draft');
    });

    test('检查是否可以从一个状态转换到另一个状态', () => {
        const runner = new StateMachineRunner(controller, stateMachine);
        
        // 从 normal 状态可以通过 draft 交互转换
        expect(runner.canTransition('normal', draftInteraction)).toBe(true);
        
        // 无效的状态名称应该返回 false
        expect(runner.canTransition('nonexistent', draftInteraction)).toBe(false);
        
        // 从 draft 状态无法通过 publish 交互转换（因为没有对应的 transfer）
        expect(runner.canTransition(draftState, publishInteraction)).toBe(false);
    });

    test('状态转换应该正常工作并返回正确的状态和值', async () => {
        const runner = new StateMachineRunner(controller, stateMachine);
        
        // 从 normal 转换到 draft
        const result = await runner.transition('normal', draftInteraction);
        expect(result.nextState.value).toBe('draft');
        expect(result.value).toEqual({ status: 'draft', canEdit: true });
    });

    test('如果状态不存在，transition 应该抛出错误', async () => {
        const runner = new StateMachineRunner(controller, stateMachine);
        
        await expect(runner.transition('nonexistent', draftInteraction)).rejects.toThrow();
    });

    test('如果没有有效的转换，transition 应该抛出错误', async () => {
        const runner = new StateMachineRunner(controller, stateMachine);
        
        // 创建一个不存在于任何转换中的交互
        const invalidInteraction = Interaction.create({
            name: 'invalid',
            action: Action.create({name: 'invalid'}),
            payload: Payload.create({
                items: []
            })
        });

        await expect(runner.transition(normalState, invalidInteraction)).rejects.toThrow();
    });

    test('多个可能的状态转换时应该使用 computeTarget 决定', async () => {
        // 创建一个新的状态转换，与现有转换有相同的触发条件
        const alternativeNormalToDraftTransfer = StateTransfer.create({
            triggerInteraction: draftInteraction,
            fromState: normalState,
            toState: publishedState, // 不同的目标状态
            handleType: 'computeTarget',
            handle: (context: any) => {
                // 当 context.special 为 true 时，使用这个转换
                return context && context.special === true;
            }
        });

        // 添加这个新的转换到状态机中
        stateMachine.transfers.push(alternativeNormalToDraftTransfer);

        const runner = new StateMachineRunner(controller, stateMachine);

        // 使用普通转换
        let result = await runner.transition(normalState, draftInteraction, { special: false });
        expect(result.nextState.value).toBe('draft');

        // 使用替代转换
        result = await runner.transition(normalState, draftInteraction, { special: true });
        expect(result.nextState.value).toBe('published');
    });

    test('应支持异步的 propertyHandle 函数', async () => {
        // 创建一个带有异步 propertyHandle 的状态
        const asyncState = StateNode.create({
            value: 'async',
            propertyHandle: async (context: any) => {
                // 模拟异步操作
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve({ status: 'async', data: context?.data });
                    }, 10);
                });
            }
        });

        // 添加到状态机
        stateMachine.states.push(asyncState);

        // 创建一个转换到这个状态
        const normalToAsyncTransfer = StateTransfer.create({
            triggerInteraction: publishInteraction,
            fromState: normalState,
            toState: asyncState,
            handleType: 'computeTarget',
            handle: (context: any) => true
        });

        stateMachine.transfers.push(normalToAsyncTransfer);

        const runner = new StateMachineRunner(controller, stateMachine);

        // 测试异步 propertyHandle
        const result = await runner.transition(normalState, publishInteraction, { data: 'test-data' });
        expect(result.nextState.value).toBe('async');
        expect(result.value).toEqual({ status: 'async', data: 'test-data' });
    });

    test('propertyHandle 函数抛出错误应该正确处理', async () => {
        // 创建一个会抛出错误的 propertyHandle
        const errorState = StateNode.create({
            value: 'error',
            propertyHandle: () => {
                throw new Error('Test error');
            }
        });

        // 添加到状态机
        stateMachine.states.push(errorState);

        // 创建一个转换到这个状态
        const normalToErrorTransfer = StateTransfer.create({
            triggerInteraction: publishInteraction,
            fromState: normalState,
            toState: errorState,
            handleType: 'computeTarget',
            handle: (context: any) => true
        });

        stateMachine.transfers.push(normalToErrorTransfer);

        const runner = new StateMachineRunner(controller, stateMachine);

        // 测试错误处理
        await expect(runner.transition(normalState, publishInteraction)).rejects.toThrow('Error computing state value: Test error');
    });
}); 