// 用来找下一状态的 工具类。

import {
    ActivityGroup,
    ActivityGroupInstanceType,
    ActivityInstanceType, Entity,
    Gateway,
    GatewayInstanceType,
    InteractionInstanceType, KlassInstance,
    TransferInstanceType,
    Attributive,
} from "@interaqt/shared";
import {assert} from "./util.js";
import {System} from "./System.js";
import {InteractionCall, InteractionCallResponse} from "./InteractionCall.js";
import {EventUser, InteractionEventArgs} from "./types/interaction.js";
import {MatchExp} from "@interaqt/storage";
import {Controller, InteractionContext} from "./Controller.js";


export type Seq = {
    head: InteractionLikeNode,
    tail: InteractionLikeNode
}

export type InteractionLikeNode = {
    uuid: string
    next: GraphNode|null,
    prev?: GraphNode,
    parentSeq: Seq
}

export type InteractionNode = {
    content: InteractionInstanceType,
    parentGroup?: ActivityGroupNode
} & InteractionLikeNode


export type ActivityGroupNode = {
    content: ActivityGroupInstanceType,
    parentGroup?: ActivityGroupNode
    childSeqs?: Seq[],
} & InteractionLikeNode



export type GatewayNode = {
    uuid: string
    content: GatewayInstanceType,
    prev: GraphNode[],
    next: GraphNode[],
}

export type GraphNode = InteractionLikeNode|GatewayNode


export type ActivitySeqStateData = {
    current?: InteractionStateData
}

export type InteractionStateData = {
    uuid: string,
    children?: ActivitySeqStateData[]
}



class ActivitySeqState {
    public static createInitialState(headNode: InteractionLikeNode) :ActivitySeqStateData {
        return {
            current: InteractionState.createInitialState(headNode)
        }
    }
    public current?: InteractionState
    public static create(data:ActivitySeqStateData, graph: ActivityCall, parent?: InteractionState) {
        const seqState = new ActivitySeqState(graph, parent)
        if (data.current) seqState.current = InteractionState.create(data.current, graph, seqState)
        return seqState
    }

    constructor(public graph: ActivityCall, public parent?: InteractionState) {}
    isInteractionAvailable(uuid: string) : boolean{
        if (!this.current) return false
        if (this.current?.children) {
            return Object.values(this.current.children).some(child => child.isInteractionAvailable(uuid))
        } else {
            return this.current.node!.uuid === uuid
        }
    }
    findStateNode(uuid:string) : InteractionState|undefined{
        //  全部执行完了
        if (!this.current) return undefined

        if (this.current?.node!.uuid === uuid) return this.current!
        // 如果有 children 匹配 children
        return (this.current!.children as ActivitySeqState[])?.find(child => child.findStateNode(uuid))?.current
    }
    transferToNext(uuid: string) {
        const node = this.graph.getNodeByUUID(uuid) as InteractionLikeNode
        delete this.current
        // TODO 一路执行 gateway
        if (node.next) {
            const nextState = InteractionState.createInitialState(node.next as InteractionLikeNode)
            this.current = InteractionState.create(nextState, this.graph, this)
        }

        this.parent?.onChange(uuid, node.next?.uuid)
    }
    toJSON() {
        return {
            current: this.current?.toJSON()
        }
    }
}



class InteractionState {
    public static GroupStateNodeType = new Map<string, typeof InteractionState>()
    public isGroup?: boolean

    public children?: ActivitySeqState[]
    public static createInitialState(node: InteractionLikeNode) {
        const state : InteractionStateData = {uuid: node.uuid}
        if (ActivityGroup.is((node as ActivityGroupNode).content)) {
            state.children = (node as ActivityGroupNode).childSeqs!.map(seqNode =>  ActivitySeqState.createInitialState(seqNode.head))
        }
        return state
    }
    public static create(data:InteractionStateData, graph: ActivityCall, parent?: ActivitySeqState) {
        const node = graph.getNodeByUUID(data.uuid)! as ActivityGroupNode
        const isGroup = ActivityGroup.is((node as ActivityGroupNode).content)

        if (isGroup) {
            const GroupStateNode = InteractionState.GroupStateNodeType.get(node!.content.type!)!
            const groupState = new GroupStateNode(node!, graph, parent)

            groupState.isGroup = true
            groupState.children = data?.children?.map((v) => {
                return ActivitySeqState.create(v, graph, groupState)
            })
            return groupState
        } else {
            return new InteractionState(node!, graph, parent)
        }
    }
    // CAUTION 这里 this.node 兼容了 state root 伪造成 ActivityStateNode
    constructor(public node:InteractionLikeNode|null, public graph: ActivityCall, public parent?: ActivitySeqState) {}
    toJSON(): any {
        return {
            uuid: this.node!.uuid,
            children: this.children?.map((child) => child.toJSON())
        }
    }
    // 以下是为 group 而存在的
    onChange(childPrevUUID: string, childNextUUID?: string) {}
    isGroupCompleted() {
        // TODO
        // @ts-ignore
        return this.children?.every((childSeq) => !childSeq.current)
    }
    complete() {
        this.parent!.transferToNext(this.node!.uuid)
    }

}


// 用这个对象来做 state 计算， ActivitySeq 只是一个入口，提供基本的 图 的能力
class ActivityState{
    public root: ActivitySeqState
    public static createInitialState(headNode: InteractionLikeNode) {
        return ActivitySeqState.createInitialState(headNode)
    }
    constructor(data: ActivitySeqStateData, public graph: ActivityCall) {
        this.root = ActivitySeqState.create(data, this.graph)
    }
    isInteractionAvailable(uuid:string) {
        return this.root.isInteractionAvailable(uuid)
    }
    completeInteraction(uuid: string) {
        // 这里默认肯定已经检查过 available 的问题了。

        // 1. interaction 完成，自身的 activity 要转移到下一个 interaction 去
        // 2. transfer 中会自动调用所在的 group，看它有没有什么要操作的。
        // 3. 如果 group 整个完成了，就要往上再递归。
        const stateNode = this.root.findStateNode(uuid)!
        stateNode.complete()
        return true
    }
    toJSON() {
        return this.root.toJSON()
    }
}



export class ActivityCall {
    static cache = new Map<ActivityInstanceType, ActivityCall>()
    static from = (activity: ActivityInstanceType, controller: Controller) => {
        let graph = ActivityCall.cache.get(activity)
        if (!graph) {
            graph = new ActivityCall(activity, controller)
            ActivityCall.cache.set(activity, graph)
        }
        return graph
    }
    graph:Seq
    uuidToNode = new Map<string, InteractionLikeNode|GatewayNode>()
    uuidToInteractionCall = new Map<string, InteractionCall>()
    interactionCallByName = new Map<string, InteractionCall>()
    rawToNode = new Map<InteractionInstanceType|ActivityGroupInstanceType|GatewayInstanceType, InteractionLikeNode|GatewayNode>()
    system: System
    constructor(public activity: ActivityInstanceType, public controller: Controller) {
        this.system = controller.system
        this.graph = this.buildGraph(activity)
    }
    buildGraph(activity: ActivityInstanceType, parentGroup?: ActivityGroupNode) : Seq {
        const rawGatewayToNode = new Map<GatewayInstanceType, GatewayNode>()
        const seq = {}

        for(let interaction of activity.interactions!) {
            const node: InteractionNode = { content: interaction, next: null, uuid: interaction.uuid, parentGroup, parentSeq: seq as Seq, }
            this.uuidToNode.set(interaction.uuid, node)
            this.rawToNode.set(interaction, node)
            const interactionCall = new InteractionCall(interaction, this.controller, this)
            this.uuidToInteractionCall.set(interaction.uuid, interactionCall)
            if (interaction.name!) {
                this.interactionCallByName.set(interaction.name, interactionCall)
            }
        }

        for(let gateway of activity.gateways!) {
            const node: GatewayNode = { content: gateway, next: [], prev: [], uuid: gateway.uuid }
            this.uuidToNode.set(gateway.uuid, node)
            this.rawToNode.set(gateway, node)
        }

        for(let group of activity.groups!) {
            const node: ActivityGroupNode = {
                uuid: group.uuid,
                content: group,
                next: null,
                parentSeq: seq as Seq,
                parentGroup
            }
            // 每个 group 下都是多个 sub activityGraph
            node.childSeqs = group.activities?.map(sub => this.buildGraph(sub, node))
            this.uuidToNode.set(group.uuid, node)
            this.rawToNode.set(group, node)
        }

        // 开始计算图中的 start 和 end
        const candidateStart = new Set<InteractionInstanceType|ActivityGroupInstanceType>([...Object.values(activity.interactions!), ...Object.values(activity.groups!)])
        const candidateEnd = new Set<InteractionInstanceType|ActivityGroupInstanceType>([...Object.values(activity.interactions!), ...Object.values(activity.groups!)])

        activity.transfers?.forEach((transfer:TransferInstanceType) => {
            const sourceNode = (this.rawToNode.get(transfer.source as InteractionInstanceType) || rawGatewayToNode.get(transfer.source as InteractionInstanceType))!
            const targetNode = (this.rawToNode.get(transfer.target as InteractionInstanceType) || rawGatewayToNode.get(transfer.target as GatewayInstanceType))!

            assert(!!sourceNode, `cannot find source ${(transfer.source as InteractionInstanceType).name!}`)
            assert(!!targetNode, `cannot find target ${(transfer.source as InteractionInstanceType).name!}`)
            // CAUTION gateway 的 next 是个数组。其他的都是只有一个指向
            if (Gateway.is(sourceNode)) {
                (sourceNode as GatewayNode).next.push(targetNode)
            } else {
                sourceNode.next = targetNode
            }

            if (Gateway.is(targetNode)) {
                (targetNode as GatewayNode).prev.push(sourceNode)
            } else {
                targetNode.prev = sourceNode
            }

            candidateEnd.delete(transfer.source as InteractionInstanceType)
            candidateStart.delete(transfer.target as InteractionInstanceType)
        })

        // 自定结算 head 和 tail
        if (candidateStart.size !== 1 ) throw new Error(`start node must one, current: ${candidateStart.size}`)
        if (candidateEnd.size !== 1 ) throw new Error(`end node must be one, current: ${candidateEnd.size}`)

        Object.assign((seq as Seq), {
            head :  this.rawToNode.get([...candidateStart.values()][0]!) as InteractionLikeNode,
            tail : this.rawToNode.get([...candidateEnd.values()][0]!)  as InteractionLikeNode
        })

        return seq as Seq
    }
    async create() {
        // const activityId = this.system.util.uuid()
        const initialStateData = ActivityState.createInitialState(this.graph.head)
        // await this.system.storage.set('ActivityState', activityId, initialStateData)
        // await this.system.storage.set('ActivityRefs', activityId, {})

        const activity = await this.system.createActivity({
            name: this.activity.name,
            uuid: this.activity.uuid,
            state: initialStateData,
            refs: {},
        })
        return {
            activityId: activity.id,
            state: initialStateData
        }
    }
    getNodeByUUID(uuid: string) {
        return this.uuidToNode.get(uuid)
    }
    async getState(activityId: string) {
        // return this.system.storage.get('ActivityState', activityId)
        return (await this.getActivity(activityId))?.state
    }
    async getActivity(activityId: string) {
        const match = MatchExp.atom({
            key: 'id',
            value: ['=', activityId],
        })
        return (await this.system.getActivity(match))[0]
    }
    async setActivity(activityId: string, value: any) {
        const match = MatchExp.atom({
            key: 'id',
            value: ['=', activityId],
        })
        return await this.system.updateActivity(match, value)
    }
    async setState(activityId: string, state: any) {
        const match = MatchExp.atom({
            key: 'id',
            value: ['=', activityId],
        })
        return await this.system.updateActivity(match, {state: state})
    }
    isStartNode(uuid: string) {
        const node = this.uuidToNode.get(uuid) as InteractionLikeNode
        return node.parentSeq.head === node
    }
    isEndNode(uuid: string) {
        const node = this.uuidToNode.get(uuid) as InteractionLikeNode
        return node.parentSeq.tail === node
    }


    async callInteraction(activityId: string, uuid: string, interactionEventArgs: InteractionEventArgs) : Promise<InteractionCallResponse>{
        const activityStateData = await this.getState(activityId)

        const state = new ActivityState(activityStateData, this)
        if(!state.isInteractionAvailable(uuid)) {
            return {
                error: `interaction ${uuid} not available`
            }
        }

        const interactionCall = this.uuidToInteractionCall.get(uuid)!
        // const userMatch= await this.checkUserRef(activityId, interactionCall.interaction, interactionEventArgs)
        // if (!userMatch) {
        //     return {
        //         error: `current user cannot call this interaction: activityId:${activityId}, interactionId: ${uuid}`
        //     }
        // }

        const res = await interactionCall.call(interactionEventArgs, activityId, this.checkUserRef)
        if (res.error) {
            return res
        }

        // 如果有 ref，要保存下来，方便后面 interactionCall 的时候通过 checkUserRef 去取
        await this.saveUserRefs(activityId, interactionCall, interactionEventArgs)

        const result = state.completeInteraction(uuid)
        assert(result, 'change activity state failed')
        // 完成了。存新的 state。
        const nextState = state.toJSON()
        // await this.system.storage.set('ActivityState', activityId, nextState)
        await this.setActivity( activityId, {'state':nextState})


        return {
            data: nextState
        }
    }
    // TODO 我们没有处理 interaction 循环的情况
    async saveUserRefs(activityId: string, interactionCall: InteractionCall, interactionEventArgs: InteractionEventArgs) {
        // const refs = await this.system.storage.get('ActivityRefs', activityId, {})!
        const refs = (await this.getActivity(activityId))?.refs! || {}
        if (interactionCall.interaction.userRef?.name) {
            refs[interactionCall.interaction.userRef?.name] = interactionEventArgs.user.id
        }

        interactionCall.interaction.payload?.items!.forEach((payloadDef) => {
            if (Attributive.is(payloadDef.itemRef) && payloadDef.itemRef?.name && interactionEventArgs.payload![payloadDef.name!]) {
                const payloadItem = interactionEventArgs.payload![payloadDef.name!]
                if (payloadDef.isCollection) {
                    if(!refs[payloadDef.itemRef!.name!]) refs[payloadDef.itemRef!.name!] = []

                    refs[payloadDef.itemRef!.name!].push(payloadItem.id)
                } else {
                    refs[payloadDef.itemRef!.name!] = payloadItem.id
                }
            }
        })

        // await this.system.storage.set('ActivityRefs', activityId, refs)
        await this.setActivity( activityId, {refs})
    }

    checkUserRef = async (attributive: KlassInstance<typeof Attributive, false>, eventUser: EventUser, activityId: string): Promise<boolean> => {
        assert(attributive.isRef, 'attributive must be ref')
        const refs = (await this.getActivity(activityId))?.refs
        return refs[attributive.name!] === eventUser.id
    }
}


class AnyActivityStateNode extends InteractionState{
    onChange(childPrevUUID: string, childNextUUID? : string) {
        if (this.graph.isStartNode(childPrevUUID)) {
            if (childNextUUID) {
                return {
                    children: this.children!.filter(childSeq => childSeq.current?.node!.uuid === childNextUUID)
                }
            } else {
                // 说明就只有一个，并且走到头了
                this.complete()
            }
        }
    }
}

InteractionState.GroupStateNodeType.set('any', AnyActivityStateNode)



class EveryActivityStateNode extends InteractionState{
    onChange(childPrevUUID: string, childNextUUID? : string) {
        // 每个 children 都  end 了。自己变成 end
        if (this.isGroupCompleted()) {
            this.complete()
        }
    }
}
InteractionState.GroupStateNodeType.set('every', EveryActivityStateNode)




class RaceActivityStateNode extends InteractionState{
    onChange(childPrevUUID: string, childNextUUID? : string)  {
        // 有一个 end 了，自己变成 end
        if (this.graph.isEndNode(childPrevUUID)) {
            this.complete()
        }
    }
}
InteractionState.GroupStateNodeType.set('race', RaceActivityStateNode)


class ProgrammaticActivityStateNode extends InteractionState{
    // 可以根据 group 上的具体配置逻辑，来动态决定。
}
InteractionState.GroupStateNodeType.set('program', ProgrammaticActivityStateNode)
