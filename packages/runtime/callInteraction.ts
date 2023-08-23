

import {
    ConceptTypeLike,
    InstanceRef,
    SystemState,
    InteractionStackComputation,
    AND, InActivityRole, SideEffect,
    RoleType,
    DerivedConceptType, ConceptType, FunctionBool, BoolExpression, NOT, OR, Group, TargetDataMatcherFunction
} from "../../base/types";

import { Activity, Interaction, InnerInteraction, Event, System, User } from "../types";

import {deriveConcept} from "../derive";
import {ActivityGraph, ActivityState} from "./AcitivityGraph";


import {evaluate} from "./boolExpression";

const GET_ACTION_TYPE = 'get'





export type Payload = {
    [k: string] : any
}

/**
 * 与 interaction 无关，但与当前 query 有关的信息。例如数据获取的 viewPort，innerInteraction 的 activity id
 */
export type QueryArg = {
    [k: string] : any
}

type RuntimeArg = {
    user: User,
    payload: Payload,
    queryArg: QueryArg
}

type Context = {
    interaction: Interaction,
    system: System,
    activityEvent?: ActivityEvent
}

export type ActivityEvent = {
    [k: string]: any
}


function flattenConcept(concept: DerivedConceptType<any> | ConceptType) : [InteractionStackComputation<any>[], ConceptType] {
    if ( (concept as DerivedConceptType<any>).attributive ) {
        const [attributives, innerConcept] = flattenConcept((concept as DerivedConceptType<any>).concept)

        return [[(concept as DerivedConceptType<any>).attributive, ...attributives], innerConcept]
    } else {
        return [[], concept]
    }
}



function tryEvaluate(message: any, expression: BoolExpression, ...args: any[]) {
    const result = evaluate(expression, ...args)
    if (!result) throw message
}

// 通过外部就已经把 api call 和具体的 interaction/activity 定义找到了。
export function callInteraction({ user, payload, queryArg }: RuntimeArg, system: System, interactionIndex: string[], interaction: Interaction, activityEvent?: ActivityEvent ) {
    const response: any = {
        error: null,
        data: null,
        sideEffects: {}
    }

    const commonArgs = [{ user, payload, queryArg }, { system, activityEvent }]

    try {

        // 0 validate interaction  优先级1  friendRequest 里的 visible
        if (interaction.condition ) {
            tryEvaluate("interaction condition error", interaction.condition, ...commonArgs)
        }


        const {role, action, payload: payloadDef} = interaction
        // 1 validate User  优先级1  friendRequest 里面的引用
        const [attributives, concept] = flattenConcept(role as RoleType)
        for(let attributive of attributives) {
            tryEvaluate(`role attributive ${attributive.name} error`, attributive, ...commonArgs)
        }

        // TODO 2 validate payload  优先级3


        // 3 记录事件  优先级2
        const interactionEvent: Event = {
            id: system.util.uuid(),
            user,
            interactionIndex,
            action: interaction.action,
            payload,
            queryArg
        }
        system.stack.saveInteractionEvent(interactionEvent)
        if (activityEvent) {
            system.stack.saveActivityEvent(activityEvent.id, interactionIndex, interactionEvent)
        }


        // 4 执行 effect  优先级1  状态转移 effect
        interaction.sideEffects?.forEach((sideEffect: SideEffect) => {
            response.sideEffects[sideEffect.name] = sideEffect.body(...commonArgs)
        })


        // TODO 5 get 请求按照 attributive 和 请求的数据格式返回数据   优先级3
        // TODO 要先研究一下 payload 里面的结构，具体的存储可以先考虑用大宽表实现。
        if (interaction.action === GET_ACTION_TYPE) {
            // const [attributives, baseConcept] = flattenConcept(interaction.payload as ConceptTypeLike)
            // response.data = system.storage.get(baseConcept, attributives, queryArg)
            response.data = (interaction.targetData as TargetDataMatcherFunction)(...commonArgs)
        }

    } catch( e: any) {
        response.error = e
    }

    return response
}



/**
 * TODO
 *
 *
 * 1. 设计表达当前可用 interaction 的数据结构。要同时方便读和写（写的时候可能有复杂的判断）。
 * 2. 设计保存 as 的数据结构。
 * 3. 设计转化成 ref 的数据结构。
 * 4. 实现状态转移
 */

/**
 * 把 activity 中的 interaction 转换成和普通 interaction 一样，把  activity 中的 state 转换也看做是一种 sideEffect
 * @param interaction
 * @param activity
 */
type Concepts = {
    userRole: RoleType
}


// TODO check activity 是否存在
// TODO activity 应该放在 payload 里面
export function convertActivityInteraction(interactionIndex: string[], interaction: InnerInteraction, activity: Activity, { userRole }:Concepts) {
    const outputInteraction = {...interaction} as Interaction

    // 1. 当前状态是否允许 interaction 执行
    const checkIfInteractionVisible = {
        type: 'functionBool',
        // TODO 要改成具体名字
        name: 'InnerInteractionAvailable',
        body: ({ user, payload, queryArg }: RuntimeArg, { system, activityEvent } : Context) => {
            // 如果是 startEvent activity 可以为 空
            const { id: activityId } = activityEvent!
            const state: ActivityState = system.getState('activity', activityId)
            const graph = ActivityGraph.from(activity)
            return graph.isInteractionAvailable(interactionIndex, state)
        }
    }

    outputInteraction.condition = {
        type: 'interactionStackComputation',
        name: 'combinedInnerInteractionAvailable',
        body: interaction.condition ? ({
            type: 'and',
            left: checkIfInteractionVisible,
            right: interaction.condition
        } as AND) : checkIfInteractionVisible
    }

    // 2. 有 as 的 interaction 需要保存一下 instance 信息，因为后面有  ref 的地方需要用。
    const sideEffects: SideEffect[] = (outputInteraction.sideEffects || [])
    const saveRefSideEffect: SideEffect = {
        type: 'state',
        name: 'saveRef',
        body: ({ user, payload, queryArg }: RuntimeArg, { system, activityEvent } : Context) => {
            const activityState: ActivityState = system.getState('activity', activityEvent!.id!)

            const roleAs = (interaction.role as InActivityRole).as
            if (roleAs) {
                activityState.instances[roleAs] = user
            }

            if (interaction.payload instanceof Map) {
                // TODO 遍历一下，这里只遍历了第一层。
                for( const [k, v] of interaction.payload) {
                    if (v.as) {
                        // CAUTION payload 默认就是 object
                        activityState.instances[v.as] = payload[k]
                    }
                }
            } else if(Array.isArray(interaction.payload)){
                // TODO 数组
            } else {
                // TODO 普通形式
            }
            // TODO 可能还有更复杂的树形结构的 payload

            system.setState('activity', activityEvent!.id!, activityState)

            return true
        }
    }

    sideEffects.push(saveRefSideEffect)


    // 3.1 转化 ref 成普通匹配的形式
    if ((interaction.role as InstanceRef).ref !== undefined) {
        const convertedRole = deriveConcept<User>(userRole, function asRef({ user, payload, queryArg }: RuntimeArg, { system, activityEvent } : Context) {
            const activityState: ActivityState = system.getState('activity', activityEvent!.id!)
            const userInstance = activityState.instances[(interaction.role as InstanceRef).ref]
            return userInstance?.id === user.id
        })
        outputInteraction.role = convertedRole
    }

    // 3.2 TODO payload 里面的 ref 转换。一般只有 gateway 里面的判断可能需要。不太可能在 interaction 里面去引用其他的 payload instance。



    // 5. 如果满足了转移，针对当前的 activity 需要产生新的 sideEffect 来赚转移 state。
    const transformSideEffect: SideEffect = {
        type: 'state',
        name: 'transfer',
        body: ({queryArg}: RuntimeArg, { system, activityEvent } : Context) => {
            //   如果是 startEvent，要产生一个 effect 该生成 activityId。
            const graph = ActivityGraph.from(activity)

            const activityState: ActivityState = system.getState('activity', activityEvent!.id!)

            const nextState = graph.completeInteraction(interactionIndex, activityState)
            system.setState('activity', activityState.id, nextState)
            return nextState
        }
    }
    sideEffects.push(transformSideEffect)

    outputInteraction.sideEffects = sideEffects

    return outputInteraction
}

// TODO 应该有一个 createActivity 的 interaction
export function recursiveConvertActivityInteraction(raw: Activity|Group, parentIndex: string[], activity: Activity, concepts: Concepts) {
    const result: [string[], Interaction][] = []
    Object.entries(raw.interactions).forEach(([name, interaction]) => {
        result.push([parentIndex.concat(name), convertActivityInteraction(parentIndex.concat(name), interaction, activity, concepts)])
    })

    Object.entries(raw.groups || {}).forEach(([name, group]) => {
        result.push(...recursiveConvertActivityInteraction(group, parentIndex.concat(name), activity, concepts))
    })

    if (parentIndex.length === 0) {
        result.unshift([['createActivity'], {
            role: concepts.userRole,
            action: 'createActivity',
            sideEffects: [{
                type: 'state',
                name: 'initialize',
                body({queryArg}: RuntimeArg, { system } : Context) {
                    const graph = ActivityGraph.from(activity)
                    const initialState = graph.getInitialState(system.util.uuid())
                    system.setState('activity', initialState.id, initialState)

                    return {
                        id: initialState.id
                    }
                }
            }]
        }])
    }


    return result
}

