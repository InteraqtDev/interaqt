import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, DICTIONARY_RECORD, Entity, Property, StateMachine, StateNode, StateTransfer, Interaction } from 'interaqt';
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
                }),
                Property.create({
                    name: 'state',
                    type: 'string',
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
        const beforeCreate = Date.now()
        const logger = await controller.system.storage.create('TimeLogger', {})
        const afterCreate = Date.now()
        // 验证初始状态
        let loggerData = await controller.system.storage.findOne('TimeLogger', undefined, undefined, ['*'])
        const initialTimestamp = loggerData.lastTimestamp
        expect(initialTimestamp).toBeGreaterThanOrEqual(beforeCreate)
        expect(initialTimestamp).toBeLessThanOrEqual(afterCreate)

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

    test('state machine with computeValue using event parameter', async () => {
        // 测试 computeValue 的第二个参数 event - 可以访问触发转换的交互记录
        const { Entity, Property, Interaction, Action, Payload, PayloadItem, StateMachine, StateNode, StateTransfer } = await import('@shared')
        
        // 创建消息实体
        const Message = Entity.create({
            name: 'Message',
            properties: [
                Property.create({
                    name: 'content',
                    type: 'string',
                }),
                Property.create({
                    name: 'lastUpdatedBy',
                    type: 'string',
                }),
                Property.create({
                    name: 'updateCount',
                    type: 'number'
                })
            ]
        })

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

        // 创建更新消息的交互
        const UpdateMessageInteraction = Interaction.create({
            name: 'updateMessage',
            action: Action.create({ name: 'updateMessage' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'message',
                        isRef: true,
                        base: Message
                    }),
                    PayloadItem.create({
                        name: 'newContent'
                    })
                ]
            })
        })

        // 创建状态节点 - 使用 event 参数获取用户信息
        const UpdatedState = StateNode.create({
            name: 'updated',
            // computeValue 接收两个参数：lastValue 和 event
            computeValue: ((lastValue: any, event: any) => {
                // 从 event 中获取用户名
                if (event && event.user && event.user.name) {
                    return event.user.name
                }
                return 'unknown'
            }) as any
        })

        // 创建计数状态节点 - 使用 event 参数访问 payload
        const CountingState = StateNode.create({
            name: 'counting',
            computeValue: ((lastValue: any, event: any) => {
                const currentCount = typeof lastValue === 'number' ? lastValue : 0
                // 从 event.payload 中获取新内容的长度作为增量
                if (event && event.payload && event.payload.newContent) {
                    return currentCount + event.payload.newContent.length
                }
                // 没有 event 时（初始化时）返回当前值
                return currentCount
            })
        })

        // 创建状态机 - 用于 lastUpdatedBy
        const UpdaterStateMachine = StateMachine.create({
            states: [UpdatedState],
            transfers: [
                StateTransfer.create({
                    trigger: UpdateMessageInteraction,
                    current: UpdatedState,
                    next: UpdatedState,
                    computeTarget: (event: any) => ({ id: event.payload!.message.id })
                })
            ],
            defaultState: UpdatedState
        })

        // 创建状态机 - 用于 updateCount
        const CountStateMachine = StateMachine.create({
            states: [CountingState],
            transfers: [
                StateTransfer.create({
                    trigger: UpdateMessageInteraction,
                    current: CountingState,
                    next: CountingState,
                    computeTarget: (event: any) => ({ id: event.payload!.message.id })
                })
            ],
            defaultState: CountingState
        })

        // 将状态机附加到属性
        const updaterProperty = Message.properties.find(p => p.name === 'lastUpdatedBy')!
        updaterProperty.computation = UpdaterStateMachine
        
        const countProperty = Message.properties.find(p => p.name === 'updateCount')!
        countProperty.computation = CountStateMachine

        // 设置测试环境
        const system = new MonoSystem()
        const controller = new Controller({
            system: system,
            entities: [User, Message],
            relations: [],
            activities: [],
            interactions: [UpdateMessageInteraction]
        })
        await controller.setup(true)

        // 创建用户和消息
        const alice = await controller.system.storage.create('User', { name: 'Alice' })
        const bob = await controller.system.storage.create('User', { name: 'Bob' })
        const message = await controller.system.storage.create('Message', { content: 'Hello' })

        // 验证初始状态
        let messageData = await controller.system.storage.findOne('Message', undefined, undefined, ['*'])
        expect(messageData.lastUpdatedBy).toBe('unknown')
        expect(messageData.updateCount).toBe(0)

        // Alice 更新消息 - computeValue 应该从 event 中获取用户名
        await controller.callInteraction('updateMessage', {
            user: alice,
            payload: { 
                message: { id: message.id },
                newContent: 'Hello World!'  // 12 个字符
            }
        })

        messageData = await controller.system.storage.findOne('Message', undefined, undefined, ['*'])
        expect(messageData.lastUpdatedBy).toBe('Alice')
        expect(messageData.updateCount).toBe(12)  // 新内容的长度

        // Bob 更新消息 - 应该更新为 Bob
        await controller.callInteraction('updateMessage', {
            user: bob,
            payload: { 
                message: { id: message.id },
                newContent: 'Hi!'  // 3 个字符
            }
        })

        messageData = await controller.system.storage.findOne('Message', undefined, undefined, ['*'])
        expect(messageData.lastUpdatedBy).toBe('Bob')
        expect(messageData.updateCount).toBe(15)  // 12 + 3

        // 测试没有用户名的情况
        await controller.callInteraction('updateMessage', {
            user: { id: 'anonymous' } as any,
            payload: { 
                message: { id: message.id },
                newContent: 'Test'  // 4 个字符
            }
        })

        messageData = await controller.system.storage.findOne('Message', undefined, undefined, ['*'])
        expect(messageData.lastUpdatedBy).toBe('unknown')  // 没有用户时返回 'unknown'
        expect(messageData.updateCount).toBe(19)  // 15 + 4
    })

    test('delete x:1 relation through state machine', async () => {
        // 创建一个简单的 x:1 关系，通过 StateMachine 删除
        const { Entity, Property, Relation, Interaction, Action, Payload, PayloadItem, StateMachine, StateNode, StateTransfer } = await import('@shared')
        
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

        // 创建文档实体
        const Document = Entity.create({
            name: 'Document',
            properties: [
                Property.create({
                    name: 'title',
                    type: 'string',
                })
            ]
        })

        // 创建分配文档的交互
        const AssignDocumentInteraction = Interaction.create({
            name: 'assignDocument',
            action: Action.create({ name: 'assignDocument' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'document',
                        isRef: true,
                        base: Document
                    }),
                    PayloadItem.create({
                        name: 'owner',
                        isRef: true,
                        base: User
                    })
                ]
            })
        })

        // 创建取消分配的交互
        const UnassignDocumentInteraction = Interaction.create({
            name: 'unassignDocument',
            action: Action.create({ name: 'unassignDocument' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'document',
                        isRef: true,
                        base: Document
                    })
                ]
            })
        })

        // 创建状态节点
        const AssignedState = StateNode.create({
            name: 'assigned',
            computeValue: () => ({})  // 返回空对象，表示关系存在
        })

        const UnassignedState = StateNode.create({
            name: 'unassigned',
            computeValue: () => null  // 返回 null，表示删除关系
        })

        // 创建状态转换
        const AssignTransfer = StateTransfer.create({
            trigger: AssignDocumentInteraction,
            current: UnassignedState,
            next: AssignedState,
            computeTarget: (event: any) => {
                return {
                    source: event.payload!.document,
                    target: event.payload!.owner
                }
            }
        })

        const UnassignTransfer = StateTransfer.create({
            trigger: UnassignDocumentInteraction,
            current: AssignedState,
            next: UnassignedState,
            computeTarget: async function(this: any, event: any) {
                // 查找现有的关系并返回，以便删除
                const MatchExp = this.globals.MatchExp
                const existingRelation = await this.system.storage.findOne(
                    'DocumentOwner',
                    MatchExp.atom({
                        key: 'source.id',
                        value: ['=', event.payload!.document.id]
                    }),
                    undefined,
                    ['*']
                )
                return existingRelation
            }
        })

        // 创建状态机
        const OwnershipStateMachine = StateMachine.create({
            states: [AssignedState, UnassignedState],
            transfers: [AssignTransfer, UnassignTransfer],
            defaultState: UnassignedState
        })

        // 创建 x:1 关系 (一个文档只能有一个所有者)
        const DocumentOwnerRelation = Relation.create({
            name: 'DocumentOwner',
            source: Document,
            sourceProperty: 'owner',
            target: User,
            targetProperty: 'documents',
            type: 'n:1',
            computation: OwnershipStateMachine
        })

        // 设置测试环境
        const system = new MonoSystem()
        const controller = new Controller({
            system: system,
            entities: [User, Document],
            relations: [DocumentOwnerRelation],
            activities: [],
            interactions: [AssignDocumentInteraction, UnassignDocumentInteraction]
        })
        await controller.setup(true)

        // 创建测试数据
        const alice = await controller.system.storage.create('User', { name: 'Alice' })
        const bob = await controller.system.storage.create('User', { name: 'Bob' })
        const doc1 = await controller.system.storage.create('Document', { title: 'Document 1' })
        const doc2 = await controller.system.storage.create('Document', { title: 'Document 2' })

        // 验证初始状态 - 没有关系
        let relations = await controller.system.storage.find('DocumentOwner', undefined, undefined, ['*'])
        expect(relations.length).toBe(0)

        // 分配文档给 Alice
        await controller.callInteraction('assignDocument', {
            user: alice,
            payload: {
                document: { id: doc1.id },
                owner: { id: alice.id }
            }
        })

        // 验证关系已创建
        relations = await controller.system.storage.find('DocumentOwner', undefined, undefined, ['*', ['source', {attributeQuery:['*']}], ['target', {attributeQuery:['*']}]])
        expect(relations.length).toBe(1)
        expect(relations[0].source.id).toBe(doc1.id)
        expect(relations[0].target.id).toBe(alice.id)

        // 分配第二个文档给 Bob
        await controller.callInteraction('assignDocument', {
            user: bob,
            payload: {
                document: { id: doc2.id },
                owner: { id: bob.id }
            }
        })

        relations = await controller.system.storage.find('DocumentOwner', undefined, undefined, ['*'])
        expect(relations.length).toBe(2)

        // 取消分配第一个文档 - 应该删除关系
        await controller.callInteraction('unassignDocument', {
            user: alice,
            payload: {
                document: { id: doc1.id }
            }
        })

        // 验证关系已被删除
        relations = await controller.system.storage.find('DocumentOwner', undefined, undefined, ['*', ['source', {attributeQuery:['*']}], ['target', {attributeQuery:['*']}]])
        expect(relations.length).toBe(1)
        expect(relations[0].source.id).toBe(doc2.id)
        expect(relations[0].target.id).toBe(bob.id)

        // 取消分配第二个文档
        await controller.callInteraction('unassignDocument', {
            user: bob,
            payload: {
                document: { id: doc2.id }
            }
        })

        // 验证所有关系都已被删除
        relations = await controller.system.storage.find('DocumentOwner', undefined, undefined, ['*'])
        expect(relations.length).toBe(0)
    })

    test('delete x:n relation through state machine', async () => {
        // 创建一个 x:n 关系（多对多），通过 StateMachine 删除
        const { Entity, Property, Relation, Interaction, Action, Payload, PayloadItem, StateMachine, StateNode, StateTransfer } = await import('@shared')
        
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

        // 创建项目实体
        const Project = Entity.create({
            name: 'Project',
            properties: [
                Property.create({
                    name: 'name',
                    type: 'string',
                })
            ]
        })

        // 创建加入项目的交互
        const JoinProjectInteraction = Interaction.create({
            name: 'joinProject',
            action: Action.create({ name: 'joinProject' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'user',
                        isRef: true,
                        base: User
                    }),
                    PayloadItem.create({
                        name: 'project',
                        isRef: true,
                        base: Project
                    }),
                    PayloadItem.create({
                        name: 'role',
                    })
                ]
            })
        })

        // 创建离开项目的交互
        const LeaveProjectInteraction = Interaction.create({
            name: 'leaveProject',
            action: Action.create({ name: 'leaveProject' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'user',
                        isRef: true,
                        base: User
                    }),
                    PayloadItem.create({
                        name: 'project',
                        isRef: true,
                        base: Project
                    })
                ]
            })
        })

        // 创建移除所有成员的交互
        const ClearProjectMembersInteraction = Interaction.create({
            name: 'clearProjectMembers',
            action: Action.create({ name: 'clearProjectMembers' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'project',
                        isRef: true,
                        base: Project
                    })
                ]
            })
        })

        // 创建状态节点
        const MemberState = StateNode.create({
            name: 'member',
            computeValue: (lastValue: any, event: any) => {
                // 返回成员信息，包含角色属性
                return {}  // 返回空对象表示关系存在
            }
        })

        const NonMemberState = StateNode.create({
            name: 'nonMember',
            computeValue: () => null  // 返回 null 删除关系
        })

        // 创建状态转换
        const JoinTransfer = StateTransfer.create({
            trigger: JoinProjectInteraction,
            current: NonMemberState,
            next: MemberState,
            computeTarget: (event: any) => {
                return {
                    source: event.payload!.user,
                    target: event.payload!.project,
                    role: event.payload!.role  // 添加角色属性
                }
            }
        })

        const LeaveTransfer = StateTransfer.create({
            trigger: LeaveProjectInteraction,
            current: MemberState,
            next: NonMemberState,
            computeTarget: async function(this: any, event: any) {
                // 查找特定用户和项目的关系
                const relations = await this.system.storage.find(
                    'ProjectMembership',
                    undefined,
                    undefined,
                    ['id', ['source', {attributeQuery:['id']}], ['target', {attributeQuery:['id']}]]
                )
                // 找到匹配的关系
                const existingRelation = relations.find((r: any) => 
                    r.source?.id === event.payload!.user.id && 
                    r.target?.id === event.payload!.project.id
                )
                // 需要返回包含 id 的对象
                return existingRelation ? { id: existingRelation.id } : null
            }
        })

        const ClearMembersTransfer = StateTransfer.create({
            trigger: ClearProjectMembersInteraction,
            current: MemberState,
            next: NonMemberState,
            computeTarget: async function(this: any, event: any) {
                // 查找项目的所有成员关系
                const existingRelations = await this.system.storage.find(
                    'ProjectMembership',
                    undefined,
                    undefined,
                    ['id', ['target', {attributeQuery:['id']}]]
                )
                // 过滤出该项目的关系
                const projectRelations = existingRelations.filter((r: any) => 
                    r.target?.id === event.payload!.project.id
                )
                // 返回所有关系的ID以便删除
                return projectRelations.map((r: any) => ({ id: r.id }))
            }
        })

        // 创建状态机
        const MembershipStateMachine = StateMachine.create({
            states: [MemberState, NonMemberState],
            transfers: [JoinTransfer, LeaveTransfer, ClearMembersTransfer],
            defaultState: NonMemberState
        })

        // 创建 x:n 关系 (多对多关系)
        const ProjectMembershipRelation = Relation.create({
            name: 'ProjectMembership',
            source: User,
            sourceProperty: 'projects',
            target: Project,
            targetProperty: 'members',
            type: 'n:n',
            computation: MembershipStateMachine,
            properties: [
                Property.create({
                    name: 'role',
                    type: 'string'
                })
            ]
        })

        // 设置测试环境
        const system = new MonoSystem()
        const controller = new Controller({
            system: system,
            entities: [User, Project],
            relations: [ProjectMembershipRelation],
            activities: [],
            interactions: [JoinProjectInteraction, LeaveProjectInteraction, ClearProjectMembersInteraction]
        })
        await controller.setup(true)

        // 创建测试数据
        const alice = await controller.system.storage.create('User', { name: 'Alice' })
        const bob = await controller.system.storage.create('User', { name: 'Bob' })
        const charlie = await controller.system.storage.create('User', { name: 'Charlie' })
        const project1 = await controller.system.storage.create('Project', { name: 'Project Alpha' })
        const project2 = await controller.system.storage.create('Project', { name: 'Project Beta' })

        // 验证初始状态 - 没有关系
        let memberships = await controller.system.storage.find('ProjectMembership', undefined, undefined, ['*'])
        expect(memberships.length).toBe(0)

        // Alice 加入 project1 作为 developer
        await controller.callInteraction('joinProject', {
            user: alice,
            payload: {
                user: { id: alice.id },
                project: { id: project1.id },
                role: 'developer'
            }
        })

        // Bob 加入 project1 作为 manager
        await controller.callInteraction('joinProject', {
            user: bob,
            payload: {
                user: { id: bob.id },
                project: { id: project1.id },
                role: 'manager'
            }
        })

        // Charlie 加入两个项目
        await controller.callInteraction('joinProject', {
            user: charlie,
            payload: {
                user: { id: charlie.id },
                project: { id: project1.id },
                role: 'tester'
            }
        })
        
        await controller.callInteraction('joinProject', {
            user: charlie,
            payload: {
                user: { id: charlie.id },
                project: { id: project2.id },
                role: 'developer'
            }
        })

        // 验证关系已创建
        memberships = await controller.system.storage.find('ProjectMembership', undefined, undefined, ['*', ['source', {attributeQuery:['*']}], ['target', {attributeQuery:['*']}]])
        expect(memberships.length).toBe(4)
        
        // 验证角色信息
        const aliceMembership = memberships.find(m => m.source.id === alice.id && m.target.id === project1.id)
        expect(aliceMembership?.role).toBe('developer')
        
        const bobMembership = memberships.find(m => m.source.id === bob.id && m.target.id === project1.id)
        expect(bobMembership?.role).toBe('manager')

        // Alice 离开 project1
        await controller.callInteraction('leaveProject', {
            user: alice,
            payload: {
                user: { id: alice.id },
                project: { id: project1.id }
            }
        })

        // 验证 Alice 的关系已被删除
        memberships = await controller.system.storage.find('ProjectMembership', undefined, undefined, ['*', ['source', {attributeQuery:['*']}], ['target', {attributeQuery:['*']}]])
        expect(memberships.length).toBe(3)
        expect(memberships.find(m => m.source.id === alice.id && m.target.id === project1.id)).toBeUndefined()

        // 清空 project1 的所有成员
        await controller.callInteraction('clearProjectMembers', {
            user: alice,
            payload: {
                project: { id: project1.id }
            }
        })

        // 验证 project1 的所有关系都已被删除，但 project2 的关系还在
        memberships = await controller.system.storage.find('ProjectMembership', undefined, undefined, ['*', ['source', {attributeQuery:['*']}], ['target', {attributeQuery:['*']}]])
        expect(memberships.length).toBe(1)
        expect(memberships[0].source.id).toBe(charlie.id)
        expect(memberships[0].target.id).toBe(project2.id)
        expect(memberships[0].role).toBe('developer')
    })

    test('create and delete entity through state machine', async () => {
        // 测试通过 StateMachine 创建和删除实体
        const { Entity, Property, Interaction, Action, Payload, PayloadItem, StateMachine, StateNode, StateTransfer, Transform } = await import('@shared')
        
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

        // 创建任务实体
        const Task = Entity.create({
            name: 'Task',
            properties: [
                Property.create({
                    name: 'title',
                    type: 'string',
                }),
                Property.create({
                    name: 'description',
                    type: 'string',
                }),
                Property.create({
                    name: 'status',
                    type: 'string',
                })
            ]
        })

        // 创建任务的交互
        const CreateTaskInteraction = Interaction.create({
            name: 'createTask',
            action: Action.create({ name: 'createTask' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'title',
                    }),
                    PayloadItem.create({
                        name: 'description',
                    })
                ]
            })
        })

        // 删除任务的交互
        const DeleteTaskInteraction = Interaction.create({
            name: 'deleteTask',
            action: Action.create({ name: 'deleteTask' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'task',
                        isRef: true,
                        base: Task
                    })
                ]
            })
        })

        // 创建状态节点
        const NonExistentState = StateNode.create({
            name: 'nonExistent',
            computeValue: () => null  // 返回 null 表示删除实体
        })

        const ActiveState = StateNode.create({
            name: 'active',
            computeValue: (lastValue: any, event: any) => {
                // 创建任务时，返回任务数据
                if (event && event.payload) {
                    return {
                        title: event.payload.title,
                        description: event.payload.description,
                        status: 'active'
                    }
                }
                return {}
            }
        })

        // 创建状态转换
        const CreateTaskTransfer = StateTransfer.create({
            trigger: CreateTaskInteraction,
            current: NonExistentState,
            next: ActiveState,
            computeTarget: (event: any) => {
                // 创建新任务时，返回任务数据
                return {
                    // title: event.payload!.title,
                    // description: event.payload!.description,
                    // status: 'active'
                }
            }
        })

        const DeleteTaskTransfer = StateTransfer.create({
            trigger: DeleteTaskInteraction,
            current: ActiveState,
            next: NonExistentState,
            computeTarget: (event: any) => {
                // 删除任务时，返回任务 ID
                return { id: event.payload!.task.id }
            }
        })

        // 创建状态机
        const TaskStateMachine = StateMachine.create({
            states: [NonExistentState, ActiveState],
            transfers: [CreateTaskTransfer, DeleteTaskTransfer],
            defaultState: NonExistentState
        })

        // 将状态机附加到 Task 实体
        Task.computation = TaskStateMachine

        // 设置测试环境
        const system = new MonoSystem()
        const controller = new Controller({
            system: system,
            entities: [User, Task],
            relations: [],
            activities: [],
            interactions: [CreateTaskInteraction, DeleteTaskInteraction]
        })
        await controller.setup(true)

        // 创建用户
        const user = await controller.system.storage.create('User', { name: 'Alice' })

        // 验证初始状态 - 没有任务
        let tasks = await controller.system.storage.find('Task', undefined, undefined, ['*'])
        expect(tasks.length).toBe(0)

        // 创建第一个任务
        await controller.callInteraction('createTask', {
            user: user,
            payload: {
                title: 'Task 1',
                description: 'First task description'
            }
        })

        // 验证任务已创建
        tasks = await controller.system.storage.find('Task', undefined, undefined, ['*'])
        expect(tasks.length).toBe(1)
        expect(tasks[0].title).toBe('Task 1')
        expect(tasks[0].description).toBe('First task description')
        expect(tasks[0].status).toBe('active')

        // 创建第二个任务
        await controller.callInteraction('createTask', {
            user: user,
            payload: {
                title: 'Task 2',
                description: 'Second task description'
            }
        })

        tasks = await controller.system.storage.find('Task', undefined, undefined, ['*'])
        expect(tasks.length).toBe(2)

        // 删除第一个任务
        await controller.callInteraction('deleteTask', {
            user: user,
            payload: {
                task: { id: tasks[0].id }
            }
        })

        // 验证任务已被删除
        tasks = await controller.system.storage.find('Task', undefined, undefined, ['*'])
        expect(tasks.length).toBe(1)
        expect(tasks[0].title).toBe('Task 2')

        // 删除第二个任务
        const task2 = tasks[0]
        await controller.callInteraction('deleteTask', {
            user: user,
            payload: {
                task: { id: task2.id }
            }
        })

        // 验证所有任务都已被删除
        tasks = await controller.system.storage.find('Task', undefined, undefined, ['*'])
        expect(tasks.length).toBe(0)
    })

    test('create entity with relations through state machine', async () => {
        // 测试通过 StateMachine 创建带有关系的实体
        const { Entity, Property, Relation, Interaction, Action, Payload, PayloadItem, StateMachine, StateNode, StateTransfer } = await import('@shared')
        
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

        // 创建订单实体 - 通过状态机创建
        const Order = Entity.create({
            name: 'Order',
            properties: [
                Property.create({
                    name: 'orderNumber',
                    type: 'string',
                }),
                Property.create({
                    name: 'totalAmount',
                    type: 'number',
                })
            ]
        })

        // 创建订单的交互
        const PlaceOrderInteraction = Interaction.create({
            name: 'placeOrder',
            action: Action.create({ name: 'placeOrder' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'customer',
                        isRef: true,
                        base: User
                    }),
                    PayloadItem.create({
                        name: 'orderNumber',
                    }),
                    PayloadItem.create({
                        name: 'totalAmount',
                    })
                ]
            })
        })

        // 取消订单的交互
        const CancelOrderInteraction = Interaction.create({
            name: 'cancelOrder',
            action: Action.create({ name: 'cancelOrder' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'order',
                        isRef: true,
                        base: Order
                    })
                ]
            })
        })

        // 创建状态节点
        const NonExistentState = StateNode.create({
            name: 'nonExistent',
            computeValue: () => null
        })

        const PendingState = StateNode.create({
            name: 'pending',
            computeValue: (lastValue: any, event: any) => {
                if (event && event.payload) {
                    return {
                        orderNumber: event.payload.orderNumber,
                        totalAmount: event.payload.totalAmount,
                        customer: event.payload.customer  // 包含客户关系
                    }
                }
                return lastValue || {}
            }
        })

        // 创建状态转换
        const PlaceOrderTransfer = StateTransfer.create({
            trigger: PlaceOrderInteraction,
            current: NonExistentState,
            next: PendingState,
            computeTarget: (event: any) => {
                return {
                    orderNumber: event.payload!.orderNumber,
                    totalAmount: event.payload!.totalAmount,
                    customer: event.payload!.customer
                }
            }
        })

        const CancelOrderTransfer = StateTransfer.create({
            trigger: CancelOrderInteraction,
            current: PendingState,
            next: NonExistentState,
            computeTarget: (event: any) => {
                return { id: event.payload!.order.id }
            }
        })

        // 创建状态机
        const OrderStateMachine = StateMachine.create({
            states: [NonExistentState, PendingState],
            transfers: [PlaceOrderTransfer, CancelOrderTransfer],
            defaultState: NonExistentState
        })

        // 将状态机附加到 Order 实体
        Order.computation = OrderStateMachine

        // 创建订单-客户关系
        const OrderCustomerRelation = Relation.create({
            name: 'OrderCustomer',
            source: Order,
            sourceProperty: 'customer',
            target: User,
            targetProperty: 'orders',
            type: 'n:1'
        })

        // 设置测试环境
        const system = new MonoSystem()
        const controller = new Controller({
            system: system,
            entities: [User, Order],
            relations: [OrderCustomerRelation],
            activities: [],
            interactions: [PlaceOrderInteraction, CancelOrderInteraction]
        })
        await controller.setup(true)

        // 创建用户
        const alice = await controller.system.storage.create('User', { name: 'Alice' })
        const bob = await controller.system.storage.create('User', { name: 'Bob' })

        // 验证初始状态 - 没有订单
        let orders = await controller.system.storage.find('Order', undefined, undefined, ['*'])
        expect(orders.length).toBe(0)

        // Alice 下订单
        await controller.callInteraction('placeOrder', {
            user: alice,
            payload: {
                customer: { id: alice.id },
                orderNumber: 'ORD-001',
                totalAmount: 100.50
            }
        })

        // 验证订单已创建
        orders = await controller.system.storage.find('Order', undefined, undefined, ['*', ['customer', {attributeQuery:['*']}]])
        expect(orders.length).toBe(1)
        expect(orders[0].orderNumber).toBe('ORD-001')
        expect(orders[0].totalAmount).toBe(100.50)
        expect(orders[0].customer.id).toBe(alice.id)

        // Bob 下订单
        await controller.callInteraction('placeOrder', {
            user: bob,
            payload: {
                customer: { id: bob.id },
                orderNumber: 'ORD-002',
                totalAmount: 200.75
            }
        })

        orders = await controller.system.storage.find('Order', undefined, undefined, ['*'])
        expect(orders.length).toBe(2)

        // 验证关系已创建
        const relations = await controller.system.storage.find('OrderCustomer', undefined, undefined, ['*', ['source', {attributeQuery:['*']}], ['target', {attributeQuery:['*']}]])
        expect(relations.length).toBe(2)

        // 取消 Alice 的订单
        const aliceOrder = orders.find(o => o.orderNumber === 'ORD-001')
        await controller.callInteraction('cancelOrder', {
            user: alice,
            payload: {
                order: { id: aliceOrder!.id }
            }
        })

        // 验证订单已被删除
        orders = await controller.system.storage.find('Order', undefined, undefined, ['*'])
        expect(orders.length).toBe(1)
        expect(orders[0].orderNumber).toBe('ORD-002')

        // 验证关系也被删除
        const remainingRelations = await controller.system.storage.find('OrderCustomer', undefined, undefined, ['*'])
        expect(remainingRelations.length).toBe(1)
    })
});     
