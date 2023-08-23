// 用来找下一状态的 工具类。

import {Activity, InnerInteraction, Interaction, Gateway, Direction} from "../types";
import {Group} from "../../base/types";

type InteractionNode = {
    name: string,
    content: InnerInteraction,
    next: InteractionNode | GatewayNode | GroupNode|null,
    prev?: InteractionNode | GatewayNode|GroupNode,
    parentGroup?: GroupNode
}

type Graph = {
    head: (InteractionNode|GroupNode)[],
    tail: (InteractionNode|GroupNode)[]
}

type GroupNode = {
    name: string,
    group: true,
    content: Group,
    next: InteractionNode | GatewayNode | GroupNode|null,
    prev?: InteractionNode | GatewayNode | GroupNode,
    graph?: Graph,
    parentGroup?: GroupNode
}

type GatewayNode = {
    gateway: true,
    content: Gateway,
    prev: (InteractionNode|GatewayNode|GroupNode)[],
    next: (InteractionNode|GatewayNode|GroupNode)[],
}

type AvailableNode = {
    name: string,
    children?: {
        [k: string]: AvailableNode
    }
}

export type ActivityState = {
    id: string,
    availableInteractions: AvailableNode,
    instances: {
        [k: string]: any,
    }
}


export type GroupHandle = {
    start?: (interactionName: string, a: AvailableNode) => AvailableNode,
    end?: (interactionName: string, a: AvailableNode) => AvailableNode | boolean,
}


function mapObject(obj: object, fn:(pair: any[]) => [string, any]) {
    return Object.fromEntries(Object.entries(obj).map(fn))
}




export class ActivityGraph {
    static cache = new Map<Activity, ActivityGraph>()
    static groupHandle = new Map<string, GroupHandle>()
    static from = (activity: Activity) => {
        let graph = ActivityGraph.cache.get(activity)
        if (!graph) {
            graph = new ActivityGraph(activity)
            ActivityGraph.cache.set(activity, graph)
        }
        return graph
    }
    activity: Activity
    graph:Graph
    nameToNode = new Map<string, InteractionNode|GroupNode>()
    rawToNode = new Map<InnerInteraction|Group|Gateway, InteractionNode|GroupNode>()
    constructor(activity: Activity) {
        this.activity = activity
        this.graph = this.buildGraph(activity)
    }
    buildGraph(activity: Activity, parentGroup?: GroupNode) : Graph{
        const rawGatewayToNode = new Map<Gateway, GatewayNode>()

        for(let name in activity.interactions) {
            const interaction = activity.interactions[name]
            const node = { content: interaction, next: null, name, parentGroup }
            this.nameToNode.set(name, node)
            this.rawToNode.set(interaction, node)
        }

        for(let name in activity.groups) {
            const group = activity.groups[name]
            const node: GroupNode = {
                name,
                group: true,
                content: group,
                next: null,
                parentGroup
            }
            node.graph = this.buildGraph(group, node)
            this.nameToNode.set(name, node)
            this.rawToNode.set(group, node)
        }

        const candidateStart = new Set<InnerInteraction|Group>([...Object.values(activity.interactions), ...Object.values(activity.groups||{})])
        const candidateEnd = new Set<InnerInteraction|Group>([...Object.values(activity.interactions), ...Object.values(activity.groups||{})])

        activity.directions?.forEach((direction:Direction) => {
            const fromNode = (this.rawToNode.get(direction.from) || rawGatewayToNode.get(direction.from))!
            const toNode = (this.rawToNode.get(direction.to) || rawGatewayToNode.get(direction.to))!


            if ((fromNode as GatewayNode).gateway) {
                (fromNode as GatewayNode).next.push(toNode)
            } else {
                fromNode.next = toNode
            }


            if ((toNode as GatewayNode).gateway) {
                (toNode as GatewayNode).prev.push(fromNode)
            } else {
                toNode.prev = fromNode
            }

            candidateEnd.delete(direction.from as InnerInteraction)
            candidateStart.delete(direction.to as InnerInteraction)
        })

        // TODO event 节点怎么办？gateway 怎么办

        // group 的 head 可以有很多个。

        // 自定结算 head 和 tail
        if (candidateEnd.size <1 ) throw new Error(`start node must be more than zero, current: ${candidateStart.size}`)

        return {
            head: [...candidateStart.values()].map((item: InnerInteraction|Group) => this.rawToNode.get(item)!),
            tail: [...candidateEnd.values()].map((item: InnerInteraction|Group) => this.rawToNode.get(item)!)
        }
    }
    getStartInteraction(base = this.graph) : InnerInteraction{
        const firstNode = base.head[0]
        if (!(firstNode as GroupNode).group) return firstNode.content as InnerInteraction

        return this.getStartInteraction((firstNode as GroupNode).graph)
    }

    getInitialState(id?:string) : ActivityState{
        // activity 的 head 只有一个，但是 group 的 head 可以有很多
        const initialAvailableInteraction = this.initAvailableInteractions(this.graph.head[0])

        return {
            // TODO 需要一个  uuid 生成
            id: id || Math.random().toString(),
            availableInteractions: {
                name: '_root_',
                children: {
                    [initialAvailableInteraction.name] : initialAvailableInteraction
                }
            },
            instances: {},
        }
    }
    initAvailableInteractions(node: GroupNode|InteractionNode): AvailableNode {
        const children = (node as GroupNode).group ? {
            ...mapObject((node.content as Group).interactions, ([name]) => [name, {name}]),
            ...mapObject(((node.content as Group).groups || {}), ([name, group]) => [name, this.initAvailableInteractions((this.rawToNode.get(group)! as GroupNode))])
        } : undefined

        return {
            name: node.name,
            children
        }
    }
    getRawNodeByIndex(index: string[]) {
        let pointer: Activity|Group = this.activity
        const path = index.slice(0, index.length -1)
        const interactionName = index.at(-1)!
        while(pointer && path.length) {
            const next = path.shift()!
            pointer = pointer.groups![next]
        }
        // CAUTION 这里默认了 interaction 和 group 不会重名
        return pointer ? (pointer.interactions[interactionName] || pointer.groups![interactionName]) : null
    }

    isInteractionAvailable(index: string[], state: ActivityState) {
        return !!this.getInteractionAvailableBase(index, state)
    }
    getInteractionAvailableBase(path: string[], state: ActivityState) {

        let pointer: AvailableNode = state.availableInteractions
        for(let name of path) {
            if (!pointer.children || !pointer.children[name]) return null
            pointer = pointer.children[name]
        }
        return pointer
    }

    completeInteraction(index: string[], state: ActivityState) {
        const interaction = this.getRawNodeByIndex(index)
        const interactionNode = this.rawToNode.get(interaction)!
        const nextNode = interactionNode.next as (InteractionNode|GroupNode)
        const prevNode = interactionNode.prev as (InteractionNode|GroupNode)

        const parentPath = index.slice(0, index.length -1)
        const interactionName = index.at(-1)!

        const availableStateParent = this.getInteractionAvailableBase(parentPath, state)!


        // 1. 如果是 start 节点，并且有 parentGroup， 那么要调用 group 的 start 处理
        if (!prevNode && interactionNode.parentGroup) {
            // 如果没有有 prev，说明是 head。要触发 group 的处理逻辑。目前只有 or 类型的要处理。
            const handle = ActivityGraph.groupHandle.get(interactionNode.parentGroup.content.type)!
            if (handle.start) {
                const nextState = handle.start(interactionName!, availableStateParent!)
                if (nextState) {
                    // CAUTION 直接修改对象了，这里不用 immutable 了。
                    availableStateParent!.children = nextState.children
                }
            }
        }


        // 2. 当前已完成，删除掉自己。这一步是最核心的操作。
        delete availableStateParent.children![interactionName]


        // 3. 如果有 nextNode，开始自动加入 nextNode
        if (nextNode) {
            // 更新 availableInteractions 里当前的自己的位置，改成 nextNode name
            availableStateParent.children![nextNode.name] = this.initAvailableInteractions(nextNode)
        }

        // 4. 如果没有 nextNode，并且是在 group 中，要考虑当前 group 是不是已经完全完结了，如果是，就要递归往上执行 complete。
        if (!nextNode && interactionNode.parentGroup){
            const handle = ActivityGraph.groupHandle.get(interactionNode.parentGroup.content.type)!
            if (handle.end) {
                const nextState = handle.end(interactionName!, availableStateParent!)
                if (nextState) {
                    // CAUTION 直接修改对象了，这里不用 immutable 了。
                    if (nextState !== true) {
                        availableStateParent!.children = nextState.children
                    } else {
                        // 表示当前 group 已经结束了。递归往上
                        this.completeInteraction(parentPath, state)
                    }

                }
            }
        }

        return state
    }
}


ActivityGraph.groupHandle.set('or', {
    start(interactionName, availableNodeParent) {
        // 只留存当前这一个
        return {
            ...availableNodeParent,
            children: {
                [interactionName]: availableNodeParent.children![interactionName]
            }
        }
    },
    end(interactionName, availableNodeParent) {
        // 任意一条路径到达了，当前就结束了
        return true
    }
})

ActivityGraph.groupHandle.set('and', {
    // 没有 start，不需要做任何事情
    end(interactionName, availableNodeParent) {
        // 任意一条路径到达了，当前就结束了
        const childrenNames = Object.keys(availableNodeParent.children!)
        // return true 表示自己结束了， return false 表示跳过
        return childrenNames.length === 0
    }
})
