import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, DICTIONARY_RECORD } from 'interaqt';
import { createData as createPropertyStateMachineData } from "./data/propertyStateMachine.js";
import { createData as createGlobalStateMachineData } from "./data/globalStateMachine.js";
import { createData as createRelationStateMachineData } from "./data/relationStateMachine.js";
describe('StateMachineRunner', () => {

    test('property state machine', async () => {
        const {entities, interactions} = createPropertyStateMachineData()
        const draftInteraction = interactions.draftInteraction
        const finalizeInteraction = interactions.finalizeInteraction
        const publishInteraction = interactions.publishInteraction
        const withdrawInteraction = interactions.withdrawInteraction
        
        const system = new MonoSystem();
        const controller = new Controller({
            system: system,
            entities: entities,
            relations: [],
            activities: [],
            interactions: Object.values(interactions)
        });
        await controller.setup(true);
        const user1 = await controller.system.storage.create('User', {
            name: 'user1',
        })
        // 1. 创建多个 post。查看 status default value
        await controller.system.storage.create('Post', {
            title: 'post1',
        })
        await controller.system.storage.create('Post', {
            title: 'post2',
        })

        const post1 = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(post1[0].status).toBe('normal')
        expect(post1[1].status).toBe('normal')
        // 2. 针对一个 post 执行 interaction。查看 status 变化
        await controller.callInteraction(draftInteraction.name, {
            user: user1,
            payload: {
                content: {
                    id: post1[0].id,
                }
            }
        })

        const post2 = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(post2[0].status).toBe('draft')
        expect(post2[1].status).toBe('normal')

        // draft 不能直接 publish
        await controller.callInteraction(publishInteraction.name, {
            user: user1,
            payload: {
                content: {
                    id: post2[0].id,
                }
            }
        })
        const post3 = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(post3[0].status).toBe('draft')
        expect(post3[1].status).toBe('normal')

        // draft 可以 finalize
        await controller.callInteraction(finalizeInteraction.name, {
            user: user1,
            payload: {
                content: {
                    id: post2[0].id,
                }
            }
        })
        const post4 = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(post4[0].status).toBe('normal')
        expect(post4[1].status).toBe('normal')
        
        // normal 可以 publish
        await controller.callInteraction(publishInteraction.name, {
            user: user1,
            payload: {
                content: {
                    id: post4[0].id,
                }
            }
        })
        const post5 = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(post5[0].status).toBe('published')
        expect(post5[1].status).toBe('normal')
        
    });

    test('global state machine', async () => {
        const {entities, interactions, dicts} = createGlobalStateMachineData()
        const enableInteraction = interactions.enableInteraction
        const disableInteraction = interactions.disableInteraction

        const system = new MonoSystem();
        const controller = new Controller({
            system: system,
            entities: entities,
            relations: [],
            activities: [],
            interactions: Object.values(interactions),
            dict: dicts
        });
        await controller.setup(true);

        const user1 = await controller.system.storage.create('User', {
            name: 'user1',
        })
        
        const globalState = await controller.system.storage.get(DICTIONARY_RECORD, 'globalState')
        expect(globalState).toBe('enabled')

        await controller.callInteraction(disableInteraction.name, {
            user: user1,
        })
        const globalState2 = await controller.system.storage.get(DICTIONARY_RECORD, 'globalState')
        expect(globalState2).toBe('disabled')

        await controller.callInteraction(enableInteraction.name, {
            user: user1,
        })
        const globalState3 = await controller.system.storage.get(DICTIONARY_RECORD, 'globalState')
        expect(globalState3).toBe('enabled')
    })


    test('relation state machine', async () => {
        const {entities, relations, interactions} = createRelationStateMachineData()
        const sendInteraction = interactions.sendInteraction
        const transferReviewersInteraction = interactions.transferReviewersInteraction
        
        const system = new MonoSystem();
        const controller = new Controller({
            system: system,
            entities: entities,
            relations: relations,
            activities: [],
            interactions: Object.values(interactions)
        });
        await controller.setup(true);

        const user1 = await controller.system.storage.create('User', {
            name: 'user1',
        })
        const user2 = await controller.system.storage.create('User', {
            name: 'user2',
        })
        const user3 = await controller.system.storage.create('User', {
            name: 'user3',
        })

        const {error} =await controller.callInteraction(sendInteraction.name, {
            user: user1,
            payload: {
                to: user2,
                title: 'request1',
            }
        })

        expect(error).toBeUndefined()

        const request = await controller.system.storage.find('Request', undefined, undefined, ['title', ['to', {attributeQuery:['*']}]])
        expect(request[0].title).toBe('request1')
        expect(request[0].to.id).toBe(user2.id)

        await controller.callInteraction(transferReviewersInteraction.name, {
            user: user1,
            payload: {
                reviewer: user3,
                request: {
                    id: request[0].id,
                }
            }
        })

        const request2 = await controller.system.storage.find('Request', undefined, undefined, ['*', ['to', {attributeQuery:['*']}]])
        expect(request2[0].title).toBe('request1')
        expect(request2[0].to.id).toBe(user3.id)
        
        
    })

    test('state machine with dynamic computeValue', async () => {
        // 创建一个带有动态计算值的状态机
        const { Entity, Property, Interaction, Action, Payload, PayloadItem, StateMachine, StateNode, StateTransfer } = await import('@shared')
        
        // 创建用户实体
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({
                    name: 'name',
                    type: 'string',
                })
            ]
        })

        // 创建一个计数器实体
        const Counter = Entity.create({
            name: 'Counter',
            properties: [
                Property.create({
                    name: 'count',
                    type: 'number',
                    defaultValue: () => 0
                }),
                Property.create({
                    name: 'state',
                    type: 'string',
                    defaultValue: () => 'idle'
                })
            ]
        })

        // 创建交互
        const IncrementInteraction = Interaction.create({
            name: 'increment',
            action: Action.create({ name: 'increment' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'counter',
                        isRef: true,
                        base: Counter
                    })
                ]
            })
        })

        const ResetInteraction = Interaction.create({
            name: 'reset',
            action: Action.create({ name: 'reset' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'counter',
                        isRef: true,
                        base: Counter
                    })
                ]
            })
        })

        // 创建带有动态计算值的状态节点
        const IncrementingState = StateNode.create({
            name: 'incrementing',
            // 动态计算：返回一个增量后的值
            computeValue: ((lastValue: any) => {
                const baseValue = typeof lastValue === 'number' ? lastValue : 0
                return baseValue + 1
            }) as any
        })

        const IdleState = StateNode.create({
            name: 'idle',
            // idle 状态不改变值
            computeValue: ((lastValue: any) => {
                return typeof lastValue === 'number' ? lastValue : 0
            }) as any
        })

        // 创建状态转移
        const IdleToIncrementingTransfer = StateTransfer.create({
            trigger: IncrementInteraction,
            current: IdleState,
            next: IncrementingState,
            computeTarget: (event: any) => {
                return { id: event.payload!.counter.id }
            }
        })

        const IncrementingToIdleTransfer = StateTransfer.create({
            trigger: ResetInteraction,
            current: IncrementingState,
            next: IdleState,
            computeTarget: (event: any) => {
                return { id: event.payload!.counter.id }
            }
        })

        // 创建状态机 - 用于计算 count 值
        const CountStateMachine = StateMachine.create({
            states: [IdleState, IncrementingState],
            transfers: [IdleToIncrementingTransfer, IncrementingToIdleTransfer],
            defaultState: IdleState
        })

        // 创建状态机 - 用于 state 属性（只返回状态名）
        const idleStateForName = StateNode.create({ name: 'idle' })
        const incrementingStateForName = StateNode.create({ name: 'incrementing' })
        
        const StateStateMachine = StateMachine.create({
            states: [idleStateForName, incrementingStateForName],
            transfers: [
                StateTransfer.create({
                    trigger: IncrementInteraction,
                    current: idleStateForName,
                    next: incrementingStateForName,
                    computeTarget: (event: any) => ({ id: event.payload!.counter.id })
                }),
                StateTransfer.create({
                    trigger: ResetInteraction,
                    current: incrementingStateForName,
                    next: idleStateForName,
                    computeTarget: (event: any) => ({ id: event.payload!.counter.id })
                })
            ],
            defaultState: idleStateForName
        })

        // 将状态机附加到属性
        const countProperty = Counter.properties.find(p => p.name === 'count')!
        countProperty.computation = CountStateMachine
        
        const stateProperty = Counter.properties.find(p => p.name === 'state')!
        stateProperty.computation = StateStateMachine

        // 设置测试环境
        const system = new MonoSystem()
        const controller = new Controller({
            system: system,
            entities: [User, Counter],
            relations: [],
            activities: [],
            interactions: [IncrementInteraction, ResetInteraction]
        })
        await controller.setup(true)

        // 创建用户和计数器
        const user = await controller.system.storage.create('User', { name: 'testUser' })
        const counter = await controller.system.storage.create('Counter', {})

        // 验证初始状态
        let counterData = await controller.system.storage.findOne('Counter', undefined, undefined, ['*'])
        expect(counterData.count).toBe(0)
        expect(counterData.state).toBe('idle')

        // 第一次增加 - 应该切换到 incrementing 状态，count 增加 1
        await controller.callInteraction('increment', {
            user,
            payload: { counter: { id: counter.id } }
        })

        counterData = await controller.system.storage.findOne('Counter', undefined, undefined, ['*'])
        expect(counterData.count).toBe(1)
        expect(counterData.state).toBe('incrementing')

        // 重置 - 应该回到 idle 状态，但 count 保持不变
        await controller.callInteraction('reset', {
            user,
            payload: { counter: { id: counter.id } }
        })

        counterData = await controller.system.storage.findOne('Counter', undefined, undefined, ['*'])
        expect(counterData.count).toBe(1)
        expect(counterData.state).toBe('idle')

        // 再次增加 - count 应该增加到 2
        await controller.callInteraction('increment', {
            user,
            payload: { counter: { id: counter.id } }
        })

        counterData = await controller.system.storage.findOne('Counter', undefined, undefined, ['*'])
        expect(counterData.count).toBe(2)
        expect(counterData.state).toBe('incrementing')
    })

    test('state machine with timestamp recording', async () => {
        // 创建一个记录时间戳的简单状态机
        const { Entity, Property, Interaction, Action, Payload, PayloadItem, StateMachine, StateNode, StateTransfer } = await import('@shared')
        
        // 创建实体
        const TimeLogger = Entity.create({
            name: 'TimeLogger',
            properties: [
                Property.create({
                    name: 'lastTimestamp',
                    type: 'number',
                    defaultValue: () => 0
                })
            ]
        })

        // 创建交互
        const LogTimeInteraction = Interaction.create({
            name: 'logTime',
            action: Action.create({ name: 'logTime' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'logger',
                        isRef: true,
                        base: TimeLogger
                    })
                ]
            })
        })

        // 创建状态节点 - 每次触发时记录当前时间戳
        const LoggingState = StateNode.create({
            name: 'logging',
            computeValue: (() => {
                return Date.now()
            }) as any
        })

        // 创建状态转移 - 自循环转换
        const LoggingToLoggingTransfer = StateTransfer.create({
            trigger: LogTimeInteraction,
            current: LoggingState,
            next: LoggingState,
            computeTarget: (event: any) => {
                return { id: event.payload!.logger.id }
            }
        })

        // 创建状态机
        const TimestampStateMachine = StateMachine.create({
            states: [LoggingState],
            transfers: [LoggingToLoggingTransfer],
            defaultState: LoggingState
        })

        // 将状态机附加到属性
        const timestampProperty = TimeLogger.properties.find(p => p.name === 'lastTimestamp')!
        timestampProperty.computation = TimestampStateMachine

        // 设置测试环境
        const system = new MonoSystem()
        const controller = new Controller({
            system: system,
            entities: [TimeLogger],
            relations: [],
            activities: [],
            interactions: [LogTimeInteraction]
        })
        await controller.setup(true)

        // 创建 TimeLogger 实例
        const logger = await controller.system.storage.create('TimeLogger', {})

        // 验证初始状态
        let loggerData = await controller.system.storage.findOne('TimeLogger', undefined, undefined, ['*'])
        const initialTimestamp = loggerData.lastTimestamp
        expect(initialTimestamp).toBe(0)

        // 第一次触发 - 记录时间戳
        const beforeFirst = Date.now()
        await controller.callInteraction('logTime', {
            user: { id: 'system', name: 'system' },
            payload: { logger: { id: logger.id } }
        })
        const afterFirst = Date.now()

        loggerData = await controller.system.storage.findOne('TimeLogger', undefined, undefined, ['*'])
        const firstTimestamp = loggerData.lastTimestamp
        expect(firstTimestamp).toBeGreaterThan(0)
        expect(firstTimestamp).toBeGreaterThanOrEqual(beforeFirst)
        expect(firstTimestamp).toBeLessThanOrEqual(afterFirst)

        // 等待一小段时间
        await new Promise(resolve => setTimeout(resolve, 10))

        // 第二次触发 - 记录新的时间戳
        const beforeSecond = Date.now()
        await controller.callInteraction('logTime', {
            user: { id: 'system', name: 'system' },
            payload: { logger: { id: logger.id } }
        })
        const afterSecond = Date.now()

        loggerData = await controller.system.storage.findOne('TimeLogger', undefined, undefined, ['*'])
        const secondTimestamp = loggerData.lastTimestamp
        expect(secondTimestamp).toBeGreaterThan(firstTimestamp)
        expect(secondTimestamp).toBeGreaterThanOrEqual(beforeSecond)
        expect(secondTimestamp).toBeLessThanOrEqual(afterSecond)

        // 第三次触发 - 再次记录时间戳
        await new Promise(resolve => setTimeout(resolve, 10))
        
        const beforeThird = Date.now()
        await controller.callInteraction('logTime', {
            user: { id: 'system', name: 'system' },
            payload: { logger: { id: logger.id } }
        })
        const afterThird = Date.now()

        loggerData = await controller.system.storage.findOne('TimeLogger', undefined, undefined, ['*'])
        const thirdTimestamp = loggerData.lastTimestamp
        expect(thirdTimestamp).toBeGreaterThan(secondTimestamp)
        expect(thirdTimestamp).toBeGreaterThanOrEqual(beforeThird)
        expect(thirdTimestamp).toBeLessThanOrEqual(afterThird)
    })
});     